import mysql from 'mysql2/promise';

const DB_URL = process.env.DATABASE_URL;
const conn = await mysql.createConnection(DB_URL);
const [rows] = await conn.execute('SELECT userId, provider, email, expiresAt FROM oauth_tokens LIMIT 10');
console.log('OAuth tokens:', JSON.stringify(rows, null, 2));
const [users] = await conn.execute('SELECT id, email, name FROM users LIMIT 10');
console.log('Users:', JSON.stringify(users, null, 2));
await conn.end();
