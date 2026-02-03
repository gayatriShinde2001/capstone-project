const express = require('express');
const { Pool } = require('pg');
const redis = require('redis');
const fs = require('fs');

const app = express();
app.use(express.json());

app.get('/health', async (req, res) => {
    res.status(200).json({ message: "OK" });
});
app.get('/users/health', async (req, res) => {
    res.status(200).json({ message: "OK" });
});
const getPassword = () => {
  if (process.env.DB_PASSWORD_FILE) {
    return fs.readFileSync(process.env.DB_PASSWORD_FILE, 'utf8').trim();
  }
  return process.env.DB_PASSWORD || 'password123';
};
const pool = new Pool({
  host: 'user-db',
  user: 'admin',
  password: getPassword(),
  database: 'user_db',
  port: 5432
});

const cache = redis.createClient({ 
    url: 'redis://cache:6379',
    socket: {
        connectTimeout: 10000 
    }
});
cache.on('error', (err) => console.error('Redis Error:', err.message));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function init() {
    let connected = false;
    let attempts = 10;

    while (attempts > 0 ) {
        try {
            console.log(`Startup: Checking dependencies... (Attempts left: ${attempts})`);

            if (!cache.isOpen) {
                console.log("Connecting to Redis...");
                await cache.connect();
                console.log('Connected to Redis');
            }
            
            console.log('Verifying Postgres connectivity...');
            await pool.query('SELECT 1');
            console.log('Connected to Postgres');
            connected = true; 
            break;
            
        } catch (err) {
            attempts--;
            console.error(`Dependency failure: ${err.message}`);
            
            if (attempts === 0) {
                console.error('Could not connect to dependencies. Exiting...');
                process.exit(1); 
            }

            console.log('Retrying in 5 seconds...');
            await sleep(5000); 
        }
    }
    
    const createTableQuery = `
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(100) UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );`;
    let schemaCreated = false;
    let schemaAttempts = 5;
    while (!schemaCreated && schemaAttempts > 0) {
        try {
            await pool.query(createTableQuery);
            console.log("Database schema verified/created");
            schemaCreated = true;
        } catch (err) {
            schemaAttempts--;
            if (err.code === '23505') { 
                console.warn("Schema creation collision detected, retrying...");
                await sleep(Math.random() * 1000 + 500); 
            } else {
                console.error("Failed to create tables:", err.message);
                process.exit(1);
            }
        }
    }
    app.listen(3000, '0.0.0.0', () => console.log('Server ready on 0.0.0.0:3000'));
    console.log('User Service is ready and listening on port 3000');
}

init();
app.post('/users/add', async (req, res) => {
    const { name, email } = req.body;
    try {
        if(!name || !email) throw new Error('Please provide name and email for user');
        const result = await pool.query(
            'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *', 
            [name, email]
        );
        const newUser = result.rows[0];
        
        await cache.set(`user-${newUser.id}`, JSON.stringify(newUser), { EX: 3600 });
        res.status(201).json(newUser);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { isFromDb = false } = req.query;
    try {
        if(!isFromDb) {
            const cachedUser = await cache.get(`user-${id}`);
            if (cachedUser) return res.json(JSON.parse(cachedUser));
        }
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });

        const user = result.rows[0];
        await cache.set(`user-${id}`, JSON.stringify(user), { EX: 3600 });
        res.json(user);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/users/update/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email } = req.body;
    try {
        const result = await pool.query(
            'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *',
            [name, email, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });

        const updatedUser = result.rows[0];
        await cache.set(`user-${id}`, JSON.stringify(updatedUser), { EX: 3600 });
        res.json(updatedUser);
    } catch (err) { res.status(500).json({ error: err.message }); }
});


app.delete('/users/delete/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        await cache.del(`user-${id}`); // Remove from cache
        res.json({ message: "User deleted" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});
