/**
 * Migration: Deduplicate oauth_tokens table before adding unique constraint.
 * Keeps only the row with the latest expiresAt for each (userId, provider) pair.
 */
import mysql from 'mysql2/promise';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const conn = await mysql.createConnection(DB_URL);

try {
  // Count duplicates
  const [counts] = await conn.execute(
    'SELECT userId, provider, COUNT(*) as cnt FROM oauth_tokens GROUP BY userId, provider HAVING cnt > 1'
  );
  console.log('Duplicate groups:', JSON.stringify(counts));

  if (counts.length > 0) {
    // Delete all rows except the one with the latest expiresAt for each (userId, provider)
    const result = await conn.execute(`
      DELETE t1 FROM oauth_tokens t1
      INNER JOIN oauth_tokens t2
        ON t1.userId = t2.userId
        AND t1.provider = t2.provider
        AND t1.expiresAt < t2.expiresAt
    `);
    console.log('Deleted rows:', result[0].affectedRows);
  } else {
    console.log('No duplicates found, nothing to delete.');
  }

  // Verify
  const [after] = await conn.execute(
    'SELECT userId, provider, COUNT(*) as cnt FROM oauth_tokens GROUP BY userId, provider'
  );
  console.log('After dedup:', JSON.stringify(after));

} finally {
  await conn.end();
}
