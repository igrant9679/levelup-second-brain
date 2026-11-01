/**
 * Static files: compression + safe long caching (build -262).
 *
 * Before: ~4 MB of script went out uncompressed with `max-age=0`, so every
 * start re-validated twelve bundles and a cold start downloaded all of it.
 *
 * - **Compression.** Text files (js/css/html/svg/json…) are sent brotli or
 *   gzip, whichever the browser accepts. Each file is compressed once per
 *   deploy (async, kept in memory, keyed by path + mtime + size) — the bundles
 *   are warmed right after start-up so the first visitor doesn't wait.
 * - **Long caching that can't go stale.** The bundles are requested as
 *   `?v=<APP_BUILD>`. A deploy that changes a bundle but forgets to bump
 *   APP_BUILD would leave a long-cached old file in place, so the server adds
 *   a content hash of the bundles: the index.html it serves asks for
 *   `?v=<APP_BUILD>.<hash>`, and ONLY a request carrying exactly that value
 *   gets `max-age=1 year, immutable`. Anything else (an old page, a
 *   hand-typed URL) revalidates as before. index.html and sw.js are never
 *   cached.
 * - Anything this layer doesn't handle (binary files, unknown paths) falls
 *   through to express.static / the index.html fallback unchanged.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import type { Request, Response, NextFunction } from "express";

const TEXT_TYPES: Record<string, string> = {
  ".js": "application/javascript; charset=UTF-8",
  ".mjs": "application/javascript; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".html": "text/html; charset=UTF-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=UTF-8",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=UTF-8",
  ".xml": "application/xml; charset=UTF-8",
  ".map": "application/json; charset=UTF-8",
};
const MIN_COMPRESS = 1024;
const NO_CACHE = "no-cache, must-revalidate";
const LONG_CACHE = "public, max-age=31536000, immutable";

type Enc = "br" | "gzip" | "identity";
type Entry = { key: string; body: Buffer; etag: string };

export type StaticLayer = {
  /** Middleware for GET/HEAD of text files and the page itself. */
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  /** Send the (rewritten) index.html — used by the SPA fallback. */
  sendIndex: (req: Request, res: Response) => void;
  /** The `v` value that earns long caching, or null if the page couldn't be rewritten. */
  version: string | null;
  /** Compress the bundles ahead of the first request. */
  warm: () => Promise<void>;
};

export function pickEncoding(accept: string | undefined): Enc {
  const q = new Map<string, number>();
  for (const part of String(accept || "").toLowerCase().split(",")) {
    const [name, ...params] = part.trim().split(";");
    if (!name) continue;
    let v = 1;
    for (const p of params) { const m = p.trim().match(/^q=([\d.]+)$/); if (m) v = parseFloat(m[1]); }
    q.set(name.trim(), v);
  }
  const ok = (e: string) => (q.has(e) ? q.get(e)! : q.has("*") ? q.get("*")! : 0) > 0;
  if (ok("br")) return "br";
  if (ok("gzip")) return "gzip";
  return "identity";
}

export function createStaticLayer(distPath: string): StaticLayer {
  const root = path.resolve(distPath);
  const indexPath = path.join(root, "index.html");
  let indexRaw = "";
  try { indexRaw = fs.readFileSync(indexPath, "utf8"); } catch { /* serveStatic logs a missing build */ }

  // The bundles the loader asks for, in its order.
  const bundles = Array.from(indexRaw.matchAll(/'(\/js\/[^'?]+\.js)'/g)).map((m) => m[1]);
  const build = (indexRaw.match(/var APP_BUILD='([^']+)'/) || [])[1] || null;
  let version: string | null = null;
  let indexOut = indexRaw;
  const MARK = "'?v='+APP_BUILD";
  if (build && bundles.length && indexRaw.includes(MARK)) {
    const h = crypto.createHash("sha1");
    let ok = true;
    for (const b of bundles) {
      try { h.update(b); h.update(fs.readFileSync(path.join(root, b))); } catch { ok = false; break; }
    }
    if (ok) {
      const hash = h.digest("hex").slice(0, 10);
      version = `${build}.${hash}`;
      indexOut = indexRaw.split(MARK).join(`'?v='+APP_BUILD+'.${hash}'`);
    }
  }
  const indexBuf = Buffer.from(indexOut, "utf8");
  const indexTag = crypto.createHash("sha1").update(indexBuf).digest("hex").slice(0, 16);

  const cache = new Map<string, Promise<Entry>>();
  function encoded(file: string, st: fs.Stats, raw: Buffer | null, enc: Enc): Promise<Entry> {
    const key = `${file}|${st.mtimeMs}|${st.size}|${enc}`;
    let p = cache.get(key);
    if (!p) {
      p = (async () => {
        const src = raw ?? (await fs.promises.readFile(file));
        const tag = crypto.createHash("sha1").update(src).digest("hex").slice(0, 16);
        let body = src;
        if (enc === "br") body = await new Promise<Buffer>((ok, bad) => zlib.brotliCompress(src, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: src.length } }, (e, b) => (e ? bad(e) : ok(b))));
        else if (enc === "gzip") body = await new Promise<Buffer>((ok, bad) => zlib.gzip(src, { level: 9 }, (e, b) => (e ? bad(e) : ok(b))));
        return { key, body, etag: `W/"${tag}-${enc}"` };
      })();
      p.catch(() => cache.delete(key));
      cache.set(key, p);
    }
    return p;
  }

  function send(req: Request, res: Response, e: Entry, enc: Enc, type: string, cacheCtl: string) {
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", cacheCtl);
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("ETag", e.etag);
    if (enc !== "identity") res.setHeader("Content-Encoding", enc);
    const inm = req.headers["if-none-match"];
    if (inm && String(inm).split(/\s*,\s*/).includes(e.etag)) { res.status(304).end(); return; }
    res.setHeader("Content-Length", String(e.body.length));
    if (req.method === "HEAD") { res.status(200).end(); return; }
    res.status(200).end(e.body);
  }

  const indexStat = { mtimeMs: 0, size: indexBuf.length } as fs.Stats;
  function sendIndex(req: Request, res: Response) {
    const enc = indexBuf.length >= MIN_COMPRESS ? pickEncoding(req.headers["accept-encoding"] as string) : "identity";
    encoded(`index.html#${indexTag}`, indexStat, indexBuf, enc)
      .then((e) => send(req, res, e, enc, TEXT_TYPES[".html"], NO_CACHE))
      .catch(() => { res.setHeader("Cache-Control", NO_CACHE); res.type("html").send(indexOut); });
  }

  function middleware(req: Request, res: Response, next: NextFunction) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    let rel: string;
    try { rel = decodeURIComponent(req.path); } catch { return next(); }
    if (rel === "/" || rel === "/index.html") return sendIndex(req, res);
    const type = TEXT_TYPES[path.extname(rel).toLowerCase()];
    if (!type) return next();
    const file = path.resolve(root, "." + rel);
    if (file !== root && !file.startsWith(root + path.sep)) return next();
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return next();
      const base = path.basename(file);
      const v = typeof req.query.v === "string" ? req.query.v : null;
      const cacheCtl = base === "sw.js" ? NO_CACHE : version && v === version ? LONG_CACHE : "public, max-age=0";
      const enc = st.size >= MIN_COMPRESS ? pickEncoding(req.headers["accept-encoding"] as string) : "identity";
      encoded(file, st, null, enc)
        .then((e) => send(req, res, e, enc, type, cacheCtl))
        .catch(() => next());
    });
  }

  async function warm() {
    for (const b of bundles) {
      const file = path.join(root, b);
      try {
        const st = await fs.promises.stat(file);
        await encoded(file, st, null, "br");
        await encoded(file, st, null, "gzip");
      } catch { /* served on demand */ }
    }
  }

  return { middleware, sendIndex, version, warm };
}
