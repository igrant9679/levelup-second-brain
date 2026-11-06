/**
 * Bookmarklet routes (audit F2, build -273): GET shows a confirm page, POST saves.
 */
import type { Express } from "express";

type Auth = { authenticateRequest(req: any): Promise<{ id: number } | null> };

export function registerBookmarkletRoutes(app: Express, sdk: Auth) {
  // ---- Bookmarklet: GET shows a confirm page, POST saves ----
  // Called by the browser bookmarklet. A GET never changes anything: it shows
  // "Save this page?" with a button that POSTs back here (audit F2 — a link on
  // another site used to be able to save a bookmark into your account, because
  // SameSite=Lax still sends the cookie on a top-level cross-site GET). The
  // POST needs the session cookie (Lax: not sent on a cross-site POST) AND a
  // same-origin Origin/Referer.
  const bmHx = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
  const bmPage = (title: string, body: string, close = false) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${bmHx(title)}</title></head><body style="font-family:sans-serif;text-align:center;padding:32px">${body}${close ? '<script>setTimeout(()=>window.close(),1500);</script>' : ''}</body></html>`;
  const bmParse = (rawUrlIn: unknown, rawTitleIn: unknown) => {
    const rawUrl = String(rawUrlIn ?? '').slice(0, 4000);
    const rawTitle = rawTitleIn != null && rawTitleIn !== '' ? String(rawTitleIn).slice(0, 500) : undefined;
    let parsed: URL | null = null;
    try { parsed = new URL(rawUrl); } catch { parsed = null; }
    if (!rawUrl || !parsed || !/^https?:$/.test(parsed.protocol)) return null;
    return { rawUrl, rawTitle };
  };
  const bmHeaders = (res: any) => {
    // form-action 'self' lets the confirm button post back here; nothing else.
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store');
  };
  const bmSameOrigin = (req: any): boolean => {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
    const src = String(req.headers.origin || req.headers.referer || '');
    if (!host || !src || src === 'null') return false;
    try { return new URL(src).host.toLowerCase() === host; } catch { return false; }
  };

  app.get("/api/bookmarklet/save", async (req, res) => {
    try {
      bmHeaders(res);
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        const loginUrl = process.env.VITE_OAUTH_PORTAL_URL || '/';
        res.redirect(`${loginUrl}?return=/bookmarks`);
        return;
      }
      const v = bmParse(req.query.url, req.query.title);
      if (!v) { res.status(400).send(bmPage('Error', '<h2>Error: invalid or missing URL.</h2>')); return; }
      res.send(bmPage('Save bookmark?', `
        <h2 style="margin:0 0 8px">Save this page to LevelUp?</h2>
        <p style="color:#444;margin:0 0 4px;word-break:break-word"><strong>${bmHx(v.rawTitle || '')}</strong></p>
        <p style="color:#666;margin:0 0 20px;font-size:13px;word-break:break-all">${bmHx(v.rawUrl)}</p>
        <form method="post" action="/api/bookmarklet/save">
          <input type="hidden" name="url" value="${bmHx(v.rawUrl)}">
          <input type="hidden" name="title" value="${bmHx(v.rawTitle || '')}">
          <button type="submit" autofocus style="font-size:16px;padding:10px 22px;border-radius:8px;border:0;background:#4338ca;color:#fff;cursor:pointer">Save bookmark</button>
          <button type="button" onclick="window.close()" style="font-size:16px;padding:10px 18px;margin-left:8px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer">Cancel</button>
        </form>`));
    } catch (err) {
      console.error('[bookmarklet] Error:', err);
      res.status(500).send(bmPage('Error', '<h2>Something went wrong. Please try again.</h2>'));
    }
  });

  app.post("/api/bookmarklet/save", async (req, res) => {
    try {
      bmHeaders(res);
      if (!bmSameOrigin(req)) { res.status(403).send(bmPage('Refused', '<h2>Refused: this request did not come from LevelUp.</h2>')); return; }
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) { res.status(401).send(bmPage('Sign in', '<h2>Please sign in to LevelUp, then try again.</h2>')); return; }
      const body: any = req.body || {};
      const v = bmParse(body.url, body.title);
      if (!v) { res.status(400).send(bmPage('Error', '<h2>Error: invalid or missing URL.</h2>', true)); return; }
      const { rawUrl, rawTitle } = v;

      const { createBookmark, getBookmarkByUrl } = await import('../db');
      const existing = await getBookmarkByUrl(rawUrl, user.id);
      if (existing) {
        res.send(bmPage('Already saved', `<h2>✅ Already in your bookmarks</h2><p style="color:#666">${bmHx(rawUrl)}</p>`, true));
        return;
      }

      const { extractPageMetadata } = await import('../routers/bookmarks');
      const meta = await extractPageMetadata(rawUrl);

      await createBookmark({
        userId: user.id,
        url: rawUrl,
        title: rawTitle || meta.title || new URL(rawUrl).hostname,
        description: meta.description,
        favicon: meta.favicon,
        ogImage: meta.ogImage,
        siteName: meta.siteName,
        tags: null,
        notes: null,
        color: null,
      });

      res.send(bmPage('Saved!', `<h2>✅ Bookmark saved!</h2><p style="color:#666">${bmHx(meta.title || rawUrl)}</p>`, true));
    } catch (err) {
      console.error('[bookmarklet] Error:', err);
      res.status(500).send(bmPage('Error', '<h2>Error saving bookmark. Please try again.</h2>'));
    }
  });
}
