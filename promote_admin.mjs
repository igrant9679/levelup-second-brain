import { createConnection } from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL not set'); process.exit(1); }

const conn = await createConnection(dbUrl);

// Show all users first
const [users] = await conn.execute('SELECT id, name, email, role FROM users');
console.log('Current users:');
console.table(users);

// Promote all non-user roles that should be admin (anyone with email @si-media.com or @levelup.app)
// Also promote any user whose name contains "Idris" or "Grant"
const [result] = await conn.execute(
  `UPDATE users SET role = 'admin' WHERE (email LIKE '%@si-media.com' OR email LIKE '%@levelup.app' OR name LIKE '%Idris%') AND role = 'user'`
);
console.log('Rows updated to admin:', result.affectedRows);

// Show updated users
const [updated] = await conn.execute('SELECT id, name, email, role FROM users');
console.log('Updated users:');
console.table(updated);

await conn.end();
