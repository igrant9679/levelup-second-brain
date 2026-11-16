#!/usr/bin/env node
/**
 * A LOCAL playground for the multi-workspace build (build -278).
 *
 *   pnpm build && node scripts/preview-workspaces.mjs     → http://localhost:4310
 *
 * Starts a throwaway MySQL 8 (mysql-memory-server — nothing is installed, and
 * the database disappears when this stops), applies every migration, seeds
 * two workspaces with a few people, and runs the BUILT server (dist/index.js)
 * against it. No real data, no real mail, no AI key, no real payments:
 *   - mail goes to a sink on this machine; every message is printed here and
 *     listed at http://127.0.0.1:<mail port>/ (the line below says which) —
 *     that is where a sign-up's confirmation link shows up;
 *   - payments go to a FAKE Stripe on this machine (scripts/lib/fake-stripe.mjs):
 *     its "checkout" and "billing portal" are pages with buttons.
 * Sign-up is open and three plans have prices, so the whole of Phase I can be
 * clicked through: Create one → confirm → trial → choose a plan → pay →
 * payment fails → locked → pay again.
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
import http from 'node:http';
import { startFakeStripe } from './lib/fake-stripe.mjs';

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
// Phase I (-279): plans with (fake) Stripe prices, sign-up open
const fakeStripe = await startFakeStripe({
  prices: { price_solo_m: { unit_amount: 900, interval: 'month' }, price_team_m: { unit_amount: 1200, interval: 'month' }, price_team_y: { unit_amount: 12000, interval: 'year' }, price_biz_m: { unit_amount: 2500, interval: 'month' } },
  webhookUrl: `http://127.0.0.1:${PORT}/api/stripe/webhook`, webhookSecret: 'whsec_preview_only',
});
const plans = [
  { key: 'solo', name: 'Solo', blurb: 'One person. Everything in LevelUp, for yourself.', perSeat: false, members: 1, ai: 300, email: 100, storageMb: 2048, priceMonthly: 'price_solo_m', priceYearly: '', public: true, order: 1 },
  { key: 'team', name: 'Team', blurb: 'A team that shares projects, tasks and notes.', perSeat: true, members: 25, ai: 3000, email: 500, storageMb: 20480, priceMonthly: 'price_team_m', priceYearly: 'price_team_y', public: true, order: 2 },
  { key: 'business', name: 'Business', blurb: 'Larger organisations: no member limit, higher allowances.', perSeat: true, members: null, ai: 10000, email: 2000, storageMb: 102400, priceMonthly: 'price_biz_m', priceYearly: '', public: true, order: 3 },
];
await mconn.query('INSERT INTO system_settings (`key`, value) VALUES (?, ?)', ['billingConfig', JSON.stringify({ plans, signupOpen: true, trialDays: 14, trialPlan: 'team', graceDays: 7, termsUrl: '', privacyUrl: '', automaticTax: false })]);
// a mail sink: what the server "sends" is kept here and printed
const sent = [];
const sink = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  if (req.method === 'POST' && req.url === '/emails') {
    let m = {}; try { m = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* */ }
    const links = [...String(m.html || '').matchAll(/href="([^"]+)"/g)].map((x) => x[1]);
    sent.push({ at: new Date().toISOString(), to: m.to, subject: m.subject, links });
    console.log(`[preview mail] to ${[].concat(m.to || []).join(', ')} — ${m.subject}${links.length ? '\n               ' + links.join('\n               ') : ''}`);
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'preview-' + sent.length }));
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(sent.slice(-20).reverse(), null, 1));
});
await new Promise((r) => sink.listen(0, '127.0.0.1', r));
const mailUrl = `http://127.0.0.1:${sink.address().port}`;
await mconn.end();
console.log(`[preview] mail sink ${mailUrl}/ · fake Stripe ${fakeStripe.url}`);
console.log(`[preview] database ready (workspace 1 "LevelUp", workspace ${beta.id} "Beta Corp")`);

const child = spawn(process.execPath, [path.join(ROOT, 'dist', 'index.js')], {
  cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), DATABASE_URL: url, JWT_SECRET: 'preview-only-not-a-secret-0123456789', SECRETS_KEY: 'preview-only-secrets-key-0123456789', APP_ORIGIN: `http://localhost:${PORT}`, OWNER_OPEN_ID: '',
    STRIPE_SECRET_KEY: fakeStripe.secretKey, STRIPE_WEBHOOK_SECRET: 'whsec_preview_only', STRIPE_API_BASE: fakeStripe.url,
    MAIL_PROVIDER: 'resend', RESEND_API_KEY: 'preview-only', MAIL_FROM: 'LevelUp <preview@levelup.test>', MAIL_API_BASE: mailUrl },
});
const stop = async () => { try { child.kill(); } catch { /* gone */ } try { await fakeStripe.stop(); } catch { /* gone */ } try { sink.close(); } catch { /* gone */ } try { await mem.stop(); } catch { /* gone */ } process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
child.on('exit', async (code) => { try { await mem.stop(); } catch { /* gone */ } process.exit(code ?? 0); });
