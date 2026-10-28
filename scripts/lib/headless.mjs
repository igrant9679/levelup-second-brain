// Shared plumbing for the browser guards (check-screens, check-dates):
// a static server for dist/public with /api answering 503, and headless
// Chrome/Edge driven over the DevTools protocol. No dependencies.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

/** Serve dist/public. /api/* → 503 so the app runs on its local data. */
export async function serveDist(dist) {
  if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/public/index.html not found — run `pnpm build` first.');
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url.startsWith('/api/')) { res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"offline check"}'); return; }
    let file = normalize(join(dist, url));
    if (!file.startsWith(dist)) { res.writeHead(403); res.end(); return; }
    if (!existsSync(file) || url.endsWith('/')) file = join(dist, 'index.html');
    try {
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

function findChrome() {
  const c = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find(p => p && existsSync(p));
}

// Temp profiles THIS process still owns. Every exit path must empty it: 88 dirs
// (3.16 GB) had piled up in %TEMP% because close() only tried once, 500ms after
// killing Chrome, and swallowed the EBUSY.
const PROFILE_PREFIX = 'lu-headless-';
const OWNED = new Set();

/** Chrome spawns renderer/gpu/crashpad children; killing only the parent leaves
 *  them holding handles on the profile dir, so removing it then fails. */
function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    try { spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); return; } catch {}
  }
  try { child.kill(); } catch {}
}

const sleepSync = ms => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} };

/** Windows frees the profile's handles a moment after Chrome dies — keep trying. */
function removeProfile(profile) {
  for (let i = 0; i < 12; i++) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 120 }); OWNED.delete(profile); return true; } catch {}
    sleepSync(150);
  }
  OWNED.delete(profile);
  return !existsSync(profile);
}

/** Profiles left by runs that crashed or were killed: remove the ones too old for
 *  any live run to still be using, so a past leak heals itself. */
export function sweepStaleProfiles(maxAgeMs = 60 * 60 * 1000) {
  let removed = 0;
  try {
    for (const name of readdirSync(tmpdir())) {
      if (!name.startsWith(PROFILE_PREFIX)) continue;
      const dir = join(tmpdir(), name);
      if (OWNED.has(dir)) continue;
      try {
        if (Date.now() - statSync(dir).mtimeMs < maxAgeMs) continue;
        rmSync(dir, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
        removed++;
      } catch {}
    }
  } catch {}
  return removed;
}

// Last resort for a crash or an explicit process.exit, which skips close().
process.on('exit', () => {
  for (const p of OWNED) { try { rmSync(p, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 }); } catch {} }
});

/** Spawn Chrome on a fresh profile and wait for its DevTools port. Cleans up
 *  after itself on every failure — a throw here used to leak the profile. */
async function startChrome(chromePath) {
  const profile = mkdtempSync(join(tmpdir(), PROFILE_PREFIX));
  OWNED.add(profile);
  const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
  let port = null;
  for (let i = 0; i < 100 && !port; i++) {
    await new Promise(r => setTimeout(r, 150));
    try { port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {}
  }
  if (!port) { killTree(chrome); removeProfile(profile); throw new Error('Chrome did not start.'); }
  return { profile, chrome, port };
}

/** Launch headless Chrome and connect to its first page. */
export async function openBrowser() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error('No Chrome/Edge found — set CHROME_PATH.');
  sweepStaleProfiles();
  const { profile, chrome, port } = await startChrome(chromePath);
  let ws = null;
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find(t => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  } catch (e) {
    try { ws?.close(); } catch {}
    killTree(chrome);
    removeProfile(profile);
    throw e;
  }
  let seq = 0; const pending = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { r, j } = pending.get(m.id); pending.delete(m.id); m.error ? j(new Error(m.error.message)) : r(m.result); }
  };
  const send = (method, params = {}) => new Promise((r, j) => { const id = ++seq; pending.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params })); });
  async function evaluate(expr) {
    const out = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description || out.exceptionDetails.text);
    return out.result.value;
  }
  /** Navigate and wait until the app's globals exist — from EVERY bundle: nav/SM
   *  come from the first one, so waiting on them alone let checks start while
   *  app-part2 was still loading ("buildNotifs is not defined", "openFA names
   *  undefined" — an intermittent false failure). The loader keeps execution
   *  order, so pmRender (app-pm.js, last) means all of them have run. */
  async function loadApp(url, readyExpr = `typeof nav==='function'&&typeof SM==='object'&&!!document.querySelector('.scr')&&typeof doLogout==='function'&&typeof buildNotifs==='function'&&typeof pmRender==='function'`) {
    await send('Page.navigate', { url });
    for (let i = 0; i < 80; i++) {
      await new Promise(r => setTimeout(r, 250));
      try { if (await evaluate(readyExpr)) return true; } catch {}
    }
    throw new Error('app did not boot');
  }
  /** Ask Chrome to shut down (that releases the profile's files), wait for the
   *  process to go, then make sure the tree and the temp profile are gone.
   *  AWAIT it: the old fire-and-forget timer is what left 88 dirs behind. */
  async function close() {
    const exited = chrome.exitCode === null ? new Promise(r => chrome.once('exit', r)) : Promise.resolve();
    try { await Promise.race([send('Browser.close'), new Promise(r => setTimeout(r, 1000))]); } catch {}
    try { ws.close(); } catch {}
    await Promise.race([exited, new Promise(r => setTimeout(r, 2000))]);
    killTree(chrome);
    removeProfile(profile);
  }
  await send('Page.enable');
  await send('Runtime.enable');
  return { send, evaluate, loadApp, close };
}
