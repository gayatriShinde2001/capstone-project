const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const redis = require('redis');
const amqp = require('amqplib');

const app = express();
app.use(express.json());

let db, channel;
const cache = redis.createClient({ url: 'redis://cache:6379' });

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

async function init() {
    console.log('Orders Service: Connecting to dependencies...');
    
    try {
        const client = new MongoClient('mongodb://order-db:27017');
        await client.connect();
        db = client.db('orders_db');
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection failed:', err.message);
        process.exit(1);
    }

    try {
        await cache.connect();
        console.log('Connected to Redis');
    } catch (err) {
        console.error('Redis connection failed:', err.message);
        process.exit(1);
    }

    let connected = false;
    while (!connected) {
        try {
            const conn = await amqp.connect('amqp://rmq');
            channel = await conn.createChannel();
            await channel.assertQueue('order_tasks');
            console.log('Connected to RabbitMQ');

            console.log('Orders Service: Consumer started...');
            channel.consume('order_tasks', async (msg) => {
                if (msg !== null) {
                    const task = JSON.parse(msg.content.toString());
                    const filter = { _id: new ObjectId(task.id) };
                    console.log(' [AMQP] RECEIVED ORDER TASK:', task);

                    const result = await db.collection('orders').updateOne(filter, { $set: { status: 'Processed', processedAt: new Date() } });
                    if (result.matchedCount === 0) {
                        console.warn(` [AMQP] No order found with ID: ${task.id}`);
                    } else {
                        console.log(' [AMQP] Database Updated Successfully');
                    }
                    channel.ack(msg);
                    console.log(' [AMQP] Message Acknowledged');
                }
            });

            connected = true;
        } catch (err) {
            console.error('RabbitMQ not ready, retrying in 5 seconds...', err.message);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    console.log('Orders Service Ready and Listening on Port 3000');
}
init();

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

app.listen(3000, '0.0.0.0');
