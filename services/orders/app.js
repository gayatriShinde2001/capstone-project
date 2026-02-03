const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const redis = require('redis');
const amqp = require('amqplib');

const app = express();
app.use(express.json());

let db, channel;
const cache = redis.createClient({ url: 'redis://cache:6379' });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function init() {
    // this function can be handled by keeping all three connections separately
    // keeping this as is for now 
    let connected = false;
    let attempts = 10;

    while (attempts > 0 && !connected) {
        try {
            console.log(`Orders Service: Checking dependencies... (Attempts left: ${attempts})`);

 
            const client = new MongoClient('mongodb://order-db:27017');
            await client.connect();
            db = client.db('orders_db');
            console.log('Connected to MongoDB');

            if (!cache) cache = redis.createClient({ url: 'redis://cache:6379' });
            if (!cache.isOpen) {
                await cache.connect();
                console.log('Connected to Redis');
            }

            const conn = await amqp.connect('amqp://rmq');
            channel = await conn.createChannel();
            await channel.assertQueue('order_tasks');
            console.log('Connected to RabbitMQ');

            channel.consume('order_tasks', async (msg) => {
                if (msg !== null) {
                    const task = JSON.parse(msg.content.toString());
                    console.log('RECEIVED ORDER TASK:', task);
                    const filter = { _id: new ObjectId(task.id) };
                    await db.collection('orders').updateOne(filter, { 
                        $set: { status: 'Processed', processedAt: new Date() } 
                    });
                    channel.ack(msg);
                }
            });
            connected = true;
        } catch (err) {
            attempts--;
            console.error(`Dependency failure: ${err.message}`);
            if (attempts === 0) {
                console.error('Could not connect to Order dependencies. Exiting...');
                process.exit(1);
            }
            console.log('Retrying in 5 seconds...');
            await sleep(5000);
        }
    }

    app.listen(3000, '0.0.0.0', () => {
        console.log('Orders Service is ready on port 3000');
    });
}

init();
app.get('/users/health', async (req, res) => {
    res.status(200).json({ message: "OK" });
});

app.get('/orders/get', async (req,res) => {
     const result = await db.collection('orders').find({}).toArray();
     res.status(200).json({ 
            orders: result
    });
})
app.post('/orders/add', async (req, res) => {
    const { userId, item } = req.body;
    if (!userId || !item) return res.status(400).json({ error: "userId and item are required" });

    let user;
    try {
        const cachedUser = await cache.get(`user-${userId}`);
        
        if (cachedUser) {
            user = JSON.parse(cachedUser);
            console.log("Found user in Shared Cache");
        } else {
            console.log(`Cache Miss. Fetching user ${userId} from Users Service...`);
            const response = await fetch(`http://users:3000/users/${userId}?getFromDb=true`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    return res.status(404).json({ error: "User does not exist in Database" });
                }
                throw new Error(`Users Service responded with status: ${response.status}`);
            }
            user = await response.json();
        }

        const order = { 
            userId, 
            customerName: user.name, 
            item, 
            status: 'Pending', 
            createdAt: new Date() 
        };
        
        const result = await db.collection('orders').insertOne(order);

        channel.sendToQueue('order_tasks', Buffer.from(JSON.stringify({ 
            id: result.insertedId, 
            item 
        })));

        res.status(201).json({ 
            message: "Order placed successfully", 
            orderId: result.insertedId 
        });

    } catch (err) {
        console.error("Internal Error:", err.message);
        res.status(500).json({ error: "Could not process order: " + err.message });
    }
});
