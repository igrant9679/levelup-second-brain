/**
 * Request body limits (audit F22).
 *
 * The body parsers used to accept 200 MB from ANYONE, before any auth: one
 * unauthenticated request could make the single process buffer and parse
 * hundreds of megabytes of JSON. Now:
 *   - unauthenticated requests: 1 MB (sign-in, reset, invite accept, public
 *     share pages — all tiny);
 *   - requests carrying a valid session cookie: the large limit, because
 *     appData.save legitimately sends lists up to ~16M characters and the
 *     Word / notes / PDF imports send whole files as base64.
 * The session check is cheap — the cookie's HMAC signature and expiry only
 * (sdk.hasValidSessionCookie), no database read; a revoked token still gets
 * refused by authenticateRequest afterwards. It is only done when the body
 * could be over the small limit (declared length > 1 MB, or no length given).
 */
import express, { type Express, type Request, type Response, type NextFunction } from "express";

export const SMALL_BODY = 1 * 1024 * 1024;
export const LARGE_BODY_LIMIT = "200mb";

export function installBodyParsers(app: Express, hasSession: (req: Request) => Promise<boolean>): void {
  const smallJson = express.json({ limit: SMALL_BODY });
  const smallForm = express.urlencoded({ limit: SMALL_BODY, extended: true });
  const bigJson = express.json({ limit: LARGE_BODY_LIMIT });
  const bigForm = express.urlencoded({ limit: LARGE_BODY_LIMIT, extended: true });
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    const declared = Number(req.headers["content-length"] || 0);
    const unknownLength = !req.headers["content-length"] && !!req.headers["transfer-encoding"];
    let big = false;
    if (declared > SMALL_BODY || unknownLength) {
      try { big = await hasSession(req); } catch { big = false; }
    }
    const json = big ? bigJson : smallJson;
    const form = big ? bigForm : smallForm;
    json(req, res, (err?: any) => {
      if (err) return next(err);
      form(req, res, next);
    });
  });
}
