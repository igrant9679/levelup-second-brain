import mysql from 'mysql2/promise';

const DB_URL = process.env.DATABASE_URL;
const conn = await mysql.createConnection(DB_URL);
const [rows] = await conn.execute('SELECT COUNT(*) as cnt, userId, provider FROM oauth_tokens GROUP BY userId, provider');
console.log('Token counts per user/provider:', JSON.stringify(rows, null, 2));
const [latest] = await conn.execute('SELECT userId, provider, email, expiresAt FROM oauth_tokens ORDER BY expiresAt DESC LIMIT 5');
console.log('Latest tokens:', JSON.stringify(latest, null, 2));
await conn.end();
