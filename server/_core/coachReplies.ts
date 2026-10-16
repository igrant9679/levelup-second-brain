/**
 * Reply to the coach by email (build -220).
 *
 * Coach emails go out with Reply-To set to the system mailbox (the configured
 * SMTP/IMAP secondary account — the same one that sends system mail) and a
 * Message-ID of the form <coach.<id>.<token>@levelupnow.tools>. Every 3
 * minutes this reads that mailbox's INBOX over IMAP (READ-ONLY — flags are
 * never touched, so the mailbox looks the same in any mail app) and, for each
 * recent message that quotes one of those ids:
 *
 *   1. the token must match the message's owner (HMAC — coachToken),
 *   2. the From address must be that user's account email or their check-in
 *      address (prefs.coach.checkins.recipientEmail),
 *   3. auto-replies (out-of-office etc.) are ignored — otherwise an
 *      out-of-office answering the coach's answer would loop forever,
 *   4. at most REPLY_HOURLY_CAP replies per user per hour are answered,
 *
 * then the quoted history is stripped and coachCron.processCoachReply writes
 * the coach's answer (in-app + email in the same thread, + push). The email's
 * Message-ID is the dedupe key, so re-reading the same email does nothing.
 */
import { createHash } from "crypto";
import Imap from "imap";
// @ts-ignore - mailparser ships no types (same as routers/oauth-sync.ts)
import { simpleParser } from "mailparser";
import { and, eq, gte, isNotNull, like } from "drizzle-orm";
import { getDb } from "../db";
import { coachMessages, smtpImapAccounts, userAppData, users } from "../../drizzle/schema";
import { coachToken, parseCoachRef, processCoachReply } from "./coachCron";

const POLL_MS = 3 * 60 * 1000;
const LOOKBACK_DAYS = 3;
const MAX_SCAN = 300;
const REPLY_HOURLY_CAP = 10;
const PARENT_MAX_AGE_DAYS = 30;

type Account = typeof smtpImapAccounts.$inferSelect;
const state = { lastPollAt: null as Date | null, lastOkAt: null as Date | null, lastError: null as string | null, handled: 0, address: null as string | null, lastSkips: [] as string[] };
export function coachReplyStatus() { return { ...state, lastSkips: state.lastSkips.slice(-8) }; }

let _acct: { at: number; acct: Account | null } | null = null;
/** The mailbox replies go to: the SMTP/IMAP account that sends system mail
 *  (lowest userId first — the same order sendEmail tries them in). */
export async function getReplyInbox(): Promise<Account | null> {
  if (_acct && Date.now() - _acct.at < 5 * 60_000) return _acct.acct;
  const db = await getDb();
  let acct: Account | null = null;
  if (db) {
    const rows = await db.select().from(smtpImapAccounts);
    acct = rows.filter((r) => r.imapHost && r.imapUsername && r.imapPassword).sort((a, b) => a.userId - b.userId)[0] || null;
  }
  _acct = { at: Date.now(), acct };
  state.address = acct?.email || null;
  return acct;
}
/** Reply-To for coach emails — null (so emails do not invite a reply) when no
 *  inbox is configured or the last read of it failed. */
export async function getReplyInboxAddress(): Promise<string | null> {
  const a = await getReplyInbox();
  if (!a) return null;
  if (state.lastError && !(state.lastOkAt && Date.now() - state.lastOkAt.getTime() < 3600e3)) return null;
  return a.email;
}

// ─── text ──────────────────────────────────────────────────────────────────
/** What the user typed, without the quoted history, signature or footer. */
export function extractReplyText(text: string): string {
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^on\s.{0,240}wrote:\s*$/i.test(t)) break;
    // the attribution line wrapped by the mail app ("On Wed, … LevelUp <" / "x@y> wrote:")
    if (/^on\s/i.test(t)) {
      const n1 = (lines[i + 1] || "").trim(), n2 = (lines[i + 2] || "").trim();
      if (/^on\s.{0,300}wrote:$/i.test(`${t} ${n1}`) || /^on\s.{0,300}wrote:$/i.test(`${t} ${n1} ${n2}`)) break;
    }
    if (/^-{2,}\s*original message\s*-{2,}/i.test(t)) break;
    if (/^_{8,}$/.test(t)) break;
    if (/^from:\s/i.test(t) && lines.slice(i + 1, i + 5).some((l) => /^(sent|date|to|subject):\s/i.test(l.trim()))) break;
    if (/^(sent from my |get outlook for )/i.test(t)) break;
    if (/^--\s*$/.test(t)) break;
    if (/levelupnow\.tools\/\?coach=\d+/i.test(t)) break;
    if (/^>/.test(t)) continue;
    out.push(lines[i]);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2000);
}
function htmlToText(html: string): string {
  return String(html || "")
    .replace(/<div[^>]*class="?gmail_quote[\s\S]*$/i, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}
export function addressOf(from: string): string {
  const m = String(from || "").match(/<([^>]+)>/);
  return (m ? m[1] : String(from || "")).trim().toLowerCase();
}
/** Out-of-office and other machine replies — never answer those. */
export function isAutoReply(h: Record<string, string[] | undefined>, subject: string): boolean {
  const g = (k: string) => String((h[k] || [])[0] || "").toLowerCase();
  if (g("auto-submitted") && g("auto-submitted") !== "no") return true;
  if (/^(bulk|junk|list|auto_reply)$/.test(g("precedence"))) return true;
  if (g("x-autoreply") || g("x-autorespond") || g("x-auto-response-suppress").includes("all")) return true;
  return /^(auto(matic)?\s*reply|auto:|out of (the )?office|autoreply|undeliverable|delivery status notification)/i.test(String(subject || "").trim());
}

// ─── IMAP ──────────────────────────────────────────────────────────────────
const HEADER_FIELDS = "HEADER.FIELDS (FROM MESSAGE-ID IN-REPLY-TO REFERENCES SUBJECT DATE AUTO-SUBMITTED PRECEDENCE X-AUTOREPLY X-AUTORESPOND X-AUTO-RESPONSE-SUPPRESS)";
function connect(a: Account): Promise<Imap> {
  // Port-aware like sendEmail: 993 is implicit TLS, 143 is STARTTLS; the
  // stored label only decides for other ports.
  const port = Number(a.imapPort) || 993;
  const tls = port === 993 ? true : port === 143 ? false : a.imapEncryption === "ssl";
  const imap = new Imap({
    user: a.imapUsername, password: a.imapPassword, host: a.imapHost, port, tls,
    autotls: !tls && a.imapEncryption !== "none" ? "required" : "never",
    tlsOptions: { rejectUnauthorized: false }, connTimeout: 15000, authTimeout: 15000,
  } as any);
  return new Promise((resolve, reject) => {
    imap.once("ready", () => resolve(imap));
    imap.once("error", reject);
    imap.connect();
  });
}
const p = <T>(fn: (cb: (err: any, v: T) => void) => void) => new Promise<T>((res, rej) => fn((e, v) => (e ? rej(e) : res(v))));
function fetchAll(imap: Imap, uids: number[], bodies: string): Promise<Array<{ uid: number; buf: Buffer }>> {
  return new Promise((resolve, reject) => {
    if (!uids.length) return resolve([]);
    const out: Array<{ uid: number; buf: Buffer }> = [];
    const f = imap.fetch(uids, { bodies });
    f.on("message", (msg) => {
      let uid = 0; const chunks: Buffer[] = [];
      msg.on("attributes", (a: any) => { uid = a.uid; });
      msg.on("body", (stream: NodeJS.ReadableStream) => { stream.on("data", (c: Buffer) => chunks.push(c)); });
      msg.once("end", () => out.push({ uid, buf: Buffer.concat(chunks) }));
    });
    f.once("error", reject);
    f.once("end", () => resolve(out));
  });
}

let _polling = false;
export async function pollCoachReplies(opts?: { force?: boolean }): Promise<{ ok: boolean; scanned: number; matched: number; handled: number; skipped: string[]; error?: string }> {
  const result = { ok: false, scanned: 0, matched: 0, handled: 0, skipped: [] as string[], error: undefined as string | undefined };
  if (_polling) return { ...result, error: "already polling" };
  const db = await getDb();
  if (!db) return { ...result, error: "DB unavailable" };
  const acct = await getReplyInbox();
  if (!acct) return { ...result, error: "no SMTP/IMAP mailbox configured" };
  // Nothing to read unless a coach email went out recently.
  const since = new Date(Date.now() - (LOOKBACK_DAYS + 1) * 86400e3);
  if (!opts?.force) {
    const [recent] = await db.select({ id: coachMessages.id }).from(coachMessages).where(and(isNotNull(coachMessages.emailedAt), gte(coachMessages.emailedAt, since))).limit(1);
    if (!recent) return { ...result, ok: true };
  }
  _polling = true;
  state.lastPollAt = new Date();
  let imap: Imap | null = null;
  const skip = (why: string) => { result.skipped.push(why); };
  try {
    imap = await connect(acct);
    await p<any>((cb) => imap!.openBox("INBOX", true, cb));
    const sinceDay = new Date(Date.now() - LOOKBACK_DAYS * 86400e3);
    const uids = (await p<number[]>((cb) => imap!.search([["SINCE", sinceDay]], cb))).slice(-MAX_SCAN);
    result.scanned = uids.length;
    const heads = await fetchAll(imap, uids, HEADER_FIELDS);
    const todo: Array<{ uid: number; userId: number; parentId: number; from: string; dedupeKey: string }> = [];
    for (const h of heads) {
      const hd = Imap.parseHeader(h.buf.toString("utf8")) as Record<string, string[] | undefined>;
      const msgId = String((hd["message-id"] || [])[0] || "").trim();
      if (/^<coach\.\d+\./i.test(msgId)) continue; // one of ours
      const ref = parseCoachRef(hd["in-reply-to"], hd["references"]);
      if (!ref) continue;
      result.matched++;
      const subject = String((hd.subject || [])[0] || "");
      const from = addressOf(String((hd.from || [])[0] || ""));
      if (isAutoReply(hd, subject)) { skip(`auto-reply from ${from}`); continue; }
      const [parent] = await db.select({ id: coachMessages.id, userId: coachMessages.userId, createdAt: coachMessages.createdAt }).from(coachMessages).where(eq(coachMessages.id, ref.id)).limit(1);
      if (!parent || coachToken(parent.userId, parent.id) !== ref.token) { skip(`bad token for #${ref.id}`); continue; }
      if (Date.now() - new Date(parent.createdAt).getTime() > PARENT_MAX_AGE_DAYS * 86400e3) { skip(`#${ref.id} too old`); continue; }
      const dedupeKey = createHash("sha1").update(msgId || `${from}|${(hd.date || [])[0]}|${subject}`).digest("hex").slice(0, 40);
      const [done] = await db.select({ id: coachMessages.id }).from(coachMessages).where(and(eq(coachMessages.userId, parent.userId), eq(coachMessages.runKey, `reply:${dedupeKey}`))).limit(1);
      if (done) continue;
      // From must be the account's own address or its check-in address.
      const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, parent.userId)).limit(1);
      const [ad] = await db.select({ prefs: userAppData.prefs }).from(userAppData).where(eq(userAppData.userId, parent.userId)).limit(1);
      let alt = ""; try { alt = String(JSON.parse(ad?.prefs || "{}")?.coach?.checkins?.recipientEmail || ""); } catch { /* ignore */ }
      const allowed = [u?.email, alt].filter(Boolean).map((e) => String(e).trim().toLowerCase());
      if (!allowed.includes(from)) { skip(`#${ref.id}: sender ${from} is not the account's address`); continue; }
      const [cnt] = await db.select({ id: coachMessages.id }).from(coachMessages)
        .where(and(eq(coachMessages.userId, parent.userId), like(coachMessages.runKey, "reply:%"), gte(coachMessages.createdAt, new Date(Date.now() - 3600e3))))
        .limit(REPLY_HOURLY_CAP).then((rows: any[]) => [rows.length]);
      if (cnt >= REPLY_HOURLY_CAP) { skip(`hourly cap reached for user ${parent.userId}`); continue; }
      todo.push({ uid: h.uid, userId: parent.userId, parentId: parent.id, from, dedupeKey });
    }
    const full = await fetchAll(imap, todo.map((t) => t.uid), "");
    for (const t of todo) {
      const raw = full.find((f) => f.uid === t.uid);
      if (!raw) continue;
      const parsed: any = await simpleParser(raw.buf);
      const userText = extractReplyText(parsed.text || htmlToText(parsed.html || ""));
      if (!userText) { skip(`#${t.parentId}: empty reply`); continue; }
      const refs = parsed.references ? (Array.isArray(parsed.references) ? parsed.references.join(" ") : String(parsed.references)) : "";
      const r = await processCoachReply({
        userId: t.userId, parentId: t.parentId, userText, dedupeKey: t.dedupeKey, from: t.from,
        subject: String(parsed.subject || ""), messageId: parsed.messageId || undefined, references: refs || undefined,
      });
      if (r.id && !r.duplicate) { result.handled++; state.handled++; console.log(`[coach-replies] answered reply to #${t.parentId} → #${r.id}${r.error ? ` (${r.error})` : ""}`); }
    }
    result.ok = true;
    state.lastOkAt = new Date(); state.lastError = null;
  } catch (e) {
    result.error = String((e as Error)?.message || e).slice(0, 300);
    state.lastError = result.error;
    console.warn("[coach-replies] poll failed:", result.error);
  } finally {
    try { imap?.end(); } catch { /* ignore */ }
    _polling = false;
    if (result.skipped.length) state.lastSkips = [...state.lastSkips, ...result.skipped].slice(-20);
  }
  return result;
}

let _started = false;
export function startCoachReplyPoller(): void {
  if (_started) return;
  _started = true;
  setTimeout(() => {
    pollCoachReplies().catch(() => {});
    setInterval(() => { pollCoachReplies().catch(() => {}); }, POLL_MS);
  }, 200_000);
  console.log("[coach-replies] reply poller registered — every 3 min");
}
