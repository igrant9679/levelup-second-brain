import { createConnection } from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
const ownerOpenId = process.env.OWNER_OPEN_ID;

if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

console.log('OWNER_OPEN_ID:', ownerOpenId ? ownerOpenId.substring(0, 35) + '...' : 'NOT SET');

const conn = await createConnection(dbUrl);
const [rows] = await conn.execute('SELECT id, name, email, LEFT(openId, 35) as openId_prefix, role FROM users LIMIT 10');
console.log('Users in DB:');
console.table(rows);

if (ownerOpenId) {
  const [match] = await conn.execute('SELECT id, name, role FROM users WHERE openId = ?', [ownerOpenId]);
  console.log('Owner match in DB:', match.length > 0 ? JSON.stringify(match[0]) : 'NO MATCH FOUND - openId mismatch!');
}

await conn.end();
