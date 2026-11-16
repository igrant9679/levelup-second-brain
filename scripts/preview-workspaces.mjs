#!/usr/bin/env node
/**
 * A LOCAL playground for the multi-workspace build (build -278).
 *
 *   pnpm build && node scripts/preview-workspaces.mjs     → http://localhost:4310
 *
 * Starts a throwaway MySQL 8 (mysql-memory-server — nothing is installed, and
 * the database disappears when this stops), applies every migration, seeds
 * two workspaces with a few people, and runs the BUILT server (dist/index.js)
 * against it. No real data, no real mail (no sender is configured), no AI key.
 *
 * TEST SIGN-INS (this throwaway database only — the password is below):
 *   avery@alpha.test   owner of "LevelUp" (workspace 1) and the platform operator
 *   ari@alpha.test     a member of workspace 1
 *   blake@beta.test    owner of "Beta Corp"
 *   dana@dual.test     a member of BOTH workspaces (shows the switcher)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { createDB } from 'mysql-memory-server';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4310);
const TEST_PASSWORD = 'workspace-preview-1';   // local playground only

console.log('[preview] starting a throwaway MySQL…');
const mem = await createDB({ version: '8.0.x', dbName: 'levelup_preview', logLevel: 'ERROR' });
const url = `mysql://${mem.username}@127.0.0.1:${mem.port}/${mem.dbName}`;
const mconn = await mysql.createConnection({ uri: url, multipleStatements: true });
await migrate(drizzle(mconn), { migrationsFolder: path.join(ROOT, 'drizzle') });
const hash = await bcrypt.hash(TEST_PASSWORD, 8);
const add = async (email, name, ws, role, accountId = null) => {
  const openId = accountId ? `m:${email}:${ws}` : `email:${email}`;
  await mconn.query('INSERT INTO users (openId, name, email, loginMethod, role, workspaceId, accountId, passwordHash) VALUES (?,?,?,?,?,?,?,?)', [openId, name, email, 'email', role, ws, accountId, accountId ? null : hash]);
  const [rows] = await mconn.query('SELECT id FROM users WHERE openId = ?', [openId]);
  return rows[0].id;
};
const avery = await add('avery@alpha.test', 'Avery Alpha', 1, 'admin');
await add('ari@alpha.test', 'Ari Alpha', 1, 'user');
await mconn.query("INSERT INTO workspaces (name, slug, status, features) VALUES ('Beta Corp', 'beta-corp', 'active', '{}')");
const [[beta]] = await mconn.query("SELECT id FROM workspaces WHERE slug = 'beta-corp'");
const blake = await add('blake@beta.test', 'Blake Beta', beta.id, 'admin');
await mconn.query('UPDATE workspaces SET ownerUserId = ? WHERE id = ?', [blake, beta.id]);
const dana = await add('dana@dual.test', 'Dana Dual', 1, 'user');
await add('dana@dual.test', 'Dana Dual', beta.id, 'user', dana);
// a little content, so the two workspaces are visibly different
const task = (uid, id, title) => mconn.query('INSERT INTO tasks (userId, taskId, title, status, raw) VALUES (?,?,?,?,?)', [uid, String(id), title, 'Not Started', JSON.stringify({ id, title, status: 'Not Started', priority: 'Medium' })]);
await task(avery, 9001, 'Alpha: plan the quarter');
await task(blake, 9002, 'Beta: onboard the first customer');
await mconn.end();
console.log(`[preview] database ready (workspace 1 "LevelUp", workspace ${beta.id} "Beta Corp")`);

const child = spawn(process.execPath, [path.join(ROOT, 'dist', 'index.js')], {
  cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), DATABASE_URL: url, JWT_SECRET: 'preview-only-not-a-secret-0123456789', SECRETS_KEY: 'preview-only-secrets-key-0123456789', APP_ORIGIN: `http://localhost:${PORT}`, OWNER_OPEN_ID: '' },
});
const stop = async () => { try { child.kill(); } catch { /* gone */ } try { await mem.stop(); } catch { /* gone */ } process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
child.on('exit', async (code) => { try { await mem.stop(); } catch { /* gone */ } process.exit(code ?? 0); });
