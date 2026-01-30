const express = require('express');
const { Pool } = require('pg');
const redis = require('redis');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: 'user-db',
  user: 'admin',
  password: 'password123',
  database: 'user_db',
  port: 5432
});

const cache = redis.createClient({ url: 'redis://cache:6379' });
cache.connect().catch(console.error);

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
        await cache.del(`user:${id}`); // Remove from cache
        res.json({ message: "User deleted" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/health', (req, res) => res.sendStatus(200));
app.listen(3000, () => console.log('Users Service running on 3000'));
