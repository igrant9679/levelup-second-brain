/**
 * Secrets at rest (audit F25).
 *
 * Mailbox passwords, OAuth access/refresh tokens and client secrets, the
 * SimpleFIN access URL, Nifty / Smartsheet / Drive tokens and the workspace AI
 * keys used to sit in the database in plaintext, so a dump (or a leaked
 * backup taken before redaction) exposed every connected account.
 *
 * Envelope:  "enc:v1:" + base64( iv(12) | tag(16) | AES-256-GCM ciphertext )
 * Key:       sha256(SECRETS_KEY) when SECRETS_KEY is set, otherwise
 *            sha256("lu-secrets:" + JWT_SECRET) (domain-separated from the
 *            session-cookie use of JWT_SECRET). Decryption tries the
 *            SECRETS_KEY key first, then the JWT_SECRET one, so setting
 *            SECRETS_KEY later keeps the older values readable.
 * Plaintext: a stored value without the prefix is returned unchanged (rows
 *            written before this change, until the boot pass encrypts them).
 *
 * Applied transparently: the secret columns in drizzle/schema.ts use the
 * `secretText` column type (toDriver encrypts, fromDriver decrypts), and the
 * aiKey_* system settings go through getSystemSetting / setSystemSetting.
 * Nothing here ever logs a secret value.
 */
import crypto from "crypto";

export const SECRET_PREFIX = "enc:v1:";

let _keyCache: { sig: string; enc: Buffer | null; dec: Buffer[] } | null = null;
function keys(): { enc: Buffer | null; dec: Buffer[] } {
  const sk = process.env.SECRETS_KEY || "";
  const jwt = process.env.JWT_SECRET || "";
  const sig = sk.length + ":" + jwt.length + ":" + crypto.createHash("sha256").update(sk + "\u0000" + jwt).digest("hex").slice(0, 16);
  if (_keyCache && _keyCache.sig === sig) return _keyCache;
  const fromSk = sk ? crypto.createHash("sha256").update(sk).digest() : null;
  const fromJwt = jwt ? crypto.createHash("sha256").update("lu-secrets:" + jwt).digest() : null;
  const dec = [fromSk, fromJwt].filter((k): k is Buffer => !!k);
  _keyCache = { sig, enc: fromSk || fromJwt, dec };
  return _keyCache;
}

/** Where the encryption key comes from (for the boot log / Settings), never the key. */
export function secretsKeySource(): "SECRETS_KEY" | "JWT_SECRET" | "none" {
  if (process.env.SECRETS_KEY) return "SECRETS_KEY";
  if (process.env.JWT_SECRET) return "JWT_SECRET";
  return "none";
}

export function isEncryptedSecret(v: unknown): boolean {
  return typeof v === "string" && v.startsWith(SECRET_PREFIX);
}

let _warnedNoKey = false;
/** Encrypt a secret for storage. Empty / already-encrypted values pass through. */
export function encryptSecret(v: string): string {
  if (typeof v !== "string" || v === "" || v.startsWith(SECRET_PREFIX)) return v;
  const { enc } = keys();
  if (!enc) {
    if (!_warnedNoKey) { _warnedNoKey = true; console.warn("[secrets] neither SECRETS_KEY nor JWT_SECRET is set — secrets are stored unencrypted"); }
    return v;
  }
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", enc, iv);
  const ct = Buffer.concat([c.update(v, "utf8"), c.final()]);
  return SECRET_PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

let _warnedDecrypt = false;
/**
 * Decrypt a stored secret. Plaintext (no prefix) is returned unchanged. A
 * value that no configured key can open comes back as "" (the integration
 * then reads as not configured / needs reconnecting) and one error is logged.
 */
export function decryptSecret(v: string): string {
  if (typeof v !== "string" || !v.startsWith(SECRET_PREFIX)) return v;
  let buf: Buffer;
  try { buf = Buffer.from(v.slice(SECRET_PREFIX.length), "base64"); } catch { buf = Buffer.alloc(0); }
  if (buf.length >= 28) {
    const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), ct = buf.subarray(28);
    for (const k of keys().dec) {
      try {
        const d = crypto.createDecipheriv("aes-256-gcm", k, iv);
        d.setAuthTag(tag);
        return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
      } catch { /* try the next key */ }
    }
  }
  if (!_warnedDecrypt) {
    _warnedDecrypt = true;
    console.error("[secrets] a stored secret could not be decrypted — SECRETS_KEY / JWT_SECRET changed? The integration must be reconnected.");
  }
  return "";
}

/** system_settings keys whose value is a secret (stored encrypted). */
export const SECRET_SETTING_KEY = /^aiKey_/;

/** For tests only. */
export function _resetSecretsForTests(): void { _keyCache = null; _warnedNoKey = false; _warnedDecrypt = false; }
