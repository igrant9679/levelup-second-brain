/**
 * Self-serve sign-up (build -279, Phase I of docs/multi-tenant-plan.md).
 *
 * A stranger asks for a workspace → we email a confirmation link → the link
 * creates the workspace, their login (its owner) and starts the trial.
 * NOTHING is created before the address is proven: an unconfirmed request is
 * one row in `signups` (token stored as a SHA-256 hash, password as a bcrypt
 * hash, 24 hours to live).
 *
 *   - Closed unless the operator opened it (Platform console → Billing).
 *   - The answer is the same whether or not the address already has an
 *     account ("check your email"); an existing account gets a mail saying so.
 *   - If the confirmation mail cannot be sent the request is refused — a
 *     sign-up nobody can confirm is only clutter.
 *   - Throttled per address and per IP (rate_limits table, survives restarts).
 *
 * Someone who already has a login creates a further workspace from inside the
 * app instead (createOwnWorkspace): no email round trip, one trial at a time.
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";
import * as db from "../db";
import { getDb } from "../db";
import { signups, users, workspaces, workspaceBilling } from "../../drizzle/schema";
import { signupOpen } from "./plans";
import { appOrigin } from "./appOrigin";
import { rlHit } from "./rateLimit";
import { createUserSerialised } from "./dbLock";

const TTL_MS = 24 * 3_600_000;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]);
export class SignupError extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; } }

export type SignupInput = { name: string; workspaceName: string; email: string; password: string; ip: string };

/** Step 1: remember the request and mail the confirmation link. */
export async function startSignup(input: SignupInput): Promise<{ ok: true }> {
  if (!(await signupOpen())) throw new SignupError("FORBIDDEN", "LevelUp accounts are by invitation. Ask the workspace owner for an invite.");
  const email = input.email.toLowerCase().trim();
  const name = input.name.trim().slice(0, 128);
  const workspaceName = (input.workspaceName.trim() || `${name}'s workspace`).slice(0, 120);
  // 3 an hour per address, 8 an hour per IP — counted before anything else happens
  const okEmail = await rlHit(`signup:e:${sha(email).slice(0, 40)}`, 3, 3_600_000);
  const okIp = await rlHit(`signup:ip:${String(input.ip || "unknown").slice(0, 45)}`, 8, 3_600_000);
  if (!okEmail || !okIp) throw new SignupError("TOO_MANY_REQUESTS", "Too many sign-up requests. Please try again in an hour.");

  const conn: any = await getDb();
  if (!conn) throw new SignupError("INTERNAL_SERVER_ERROR", "Database unavailable");
  const { sendEmail } = await import("./sendEmail");

  if (await db.emailHasAccount(email)) {
    // same answer to the browser; the owner of the address learns why nothing new was made
    await sendEmail({
      to: email, kind: "account", senderUserId: null,
      subject: "You already have a LevelUp account",
      html: `<p>Someone (probably you) tried to create a new LevelUp account with this address, but it already has one.</p><p><a href="${appOrigin()}/">Sign in</a> — use “Forgot password?” there if you need to. To add another workspace, sign in and choose <b>Create a workspace</b> from the menu on your name.</p><p>If this wasn’t you, you can ignore this email.</p>`,
    } as any).catch(() => false);
    return { ok: true };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const passwordHash = await bcrypt.hash(input.password, 12);
  // one open request per address: a newer one replaces the older
  await conn.delete(signups).where(and(eq(signups.email, email), isNull(signups.usedAt)));
  await conn.insert(signups).values({ tokenHash: sha(token), email, name, workspaceName, passwordHash, ip: String(input.ip || "").slice(0, 64), expiresAt: new Date(Date.now() + TTL_MS) });
  const link = `${appOrigin()}/?signup=${token}`;
  const sent = await sendEmail({
    to: email, kind: "account", senderUserId: null,
    subject: "Confirm your email to start with LevelUp",
    html: `<p>Hi ${esc(name)},</p><p>Confirm this address to create your LevelUp workspace <b>${esc(workspaceName)}</b>:</p><p><a href="${link}">Confirm and open LevelUp</a></p><p>The link works once and for 24 hours. If you didn’t ask for this, ignore this email — nothing is created.</p>`,
    text: `Hi ${name},\n\nConfirm this address to create your LevelUp workspace "${workspaceName}":\n${link}\n\nThe link works once and for 24 hours. If you didn't ask for this, ignore this email.`,
  } as any).catch(() => false);
  if (!sent) {
    await conn.delete(signups).where(eq(signups.tokenHash, sha(token)));
    throw new SignupError("SERVICE_UNAVAILABLE", "We couldn’t send the confirmation email just now. Please try again later.");
  }
  return { ok: true };
}

/** Is this confirmation link still good? (For the page that shows before the button is pressed.) */
export async function peekSignup(token: string): Promise<{ valid: boolean; email?: string; workspaceName?: string; name?: string }> {
  const conn: any = await getDb();
  if (!conn || !/^[a-f0-9]{64}$/.test(token)) return { valid: false };
  const [row] = await conn.select().from(signups).where(eq(signups.tokenHash, sha(token))).limit(1);
  if (!row || row.usedAt || new Date(row.expiresAt).getTime() < Date.now()) return { valid: false };
  return { valid: true, email: row.email, workspaceName: row.workspaceName, name: row.name };
}

/**
 * Step 2: the link was opened. Creates the workspace and its owner's login,
 * starts the trial, and returns the new member row (the caller signs it in).
 */
export async function confirmSignup(token: string): Promise<{ user: any; workspaceId: number }> {
  const conn: any = await getDb();
  if (!conn) throw new SignupError("INTERNAL_SERVER_ERROR", "Database unavailable");
  const bad = () => new SignupError("BAD_REQUEST", "This confirmation link is no longer valid. Start again from the sign-up page.");
  if (!/^[a-f0-9]{64}$/.test(token)) throw bad();
  const hash = sha(token);
  const [row] = await conn.select().from(signups).where(eq(signups.tokenHash, hash)).limit(1);
  if (!row || row.usedAt || new Date(row.expiresAt).getTime() < Date.now()) throw bad();
  if (!(await signupOpen())) throw new SignupError("FORBIDDEN", "Sign-up is closed at the moment.");
  // claim the link: exactly one request wins
  const claim: any = await conn.update(signups).set({ usedAt: new Date() }).where(and(eq(signups.id, row.id), isNull(signups.usedAt)));
  if (Number(claim?.[0]?.affectedRows ?? claim?.affectedRows ?? 0) !== 1) throw bad();

  const email = String(row.email).toLowerCase();
  const openId = `email:${email}`.slice(0, 64);
  let workspaceId = 0;
  try {
    await createUserSerialised(email, (e) => db.emailHasAccount(e), () => { throw new SignupError("CONFLICT", "This email already has a LevelUp account. Sign in instead."); }, async () => {
      const { createWorkspace } = await import("./workspaceAdmin");
      const ws = await createWorkspace({ name: row.workspaceName, createdBy: null });
      workspaceId = ws.id;
      await conn.insert(users).values({ openId, name: row.name, email, loginMethod: "email", role: "admin", passwordHash: row.passwordHash, workspaceId, lastSignedIn: new Date() });
    });
  } catch (e: any) {
    // nothing half-made is left behind, and the link can be used again
    if (workspaceId) { try { await conn.delete(workspaces).where(and(eq(workspaces.id, workspaceId), isNull(workspaces.ownerUserId))); } catch { /* */ } }
    if (!(e instanceof SignupError && e.code === "CONFLICT")) { try { await conn.update(signups).set({ usedAt: null }).where(eq(signups.id, row.id)); } catch { /* */ } }
    if (e instanceof SignupError) throw e;
    if (e?.message === "busy") throw new SignupError("TOO_MANY_REQUESTS", "Busy creating another account — please try again in a moment.");
    throw e;
  }
  const user = await db.getUserByOpenId(openId);
  if (!user) throw new SignupError("INTERNAL_SERVER_ERROR", "Failed to create the account");
  await conn.update(workspaces).set({ ownerUserId: user.id, createdBy: user.id }).where(eq(workspaces.id, workspaceId));
  const { invalidateWorkspace } = await import("./workspace");
  invalidateWorkspace(workspaceId);
  const { startTrial } = await import("./billing");
  await startTrial(workspaceId);
  // the password hash has done its job; do not keep a copy in the request row
  try { await conn.update(signups).set({ passwordHash: "" }).where(eq(signups.id, row.id)); } catch { /* */ }
  return { user, workspaceId };
}

/**
 * A signed-in person creates another workspace of their own. Returns the new
 * member row (the caller switches the session to it).
 */
export async function createOwnWorkspace(me: any, workspaceName: string): Promise<{ user: any; workspaceId: number }> {
  if (!(await signupOpen())) throw new SignupError("FORBIDDEN", "Creating workspaces is not open on this LevelUp. Ask the platform operator.");
  const conn: any = await getDb();
  if (!conn) throw new SignupError("INTERNAL_SERVER_ERROR", "Database unavailable");
  const name = String(workspaceName || "").trim().slice(0, 120);
  if (!name) throw new SignupError("BAD_REQUEST", "Give the workspace a name.");
  const accountId = Number(me.accountId) || Number(me.id);
  const [login] = await conn.select().from(users).where(eq(users.id, accountId)).limit(1);
  if (!login) throw new SignupError("UNAUTHORIZED", "Please sign in again.");
  if (!(await rlHit(`wscreate:${accountId}`, 3, 24 * 3_600_000))) throw new SignupError("TOO_MANY_REQUESTS", "You have created several workspaces today. Please try again tomorrow.");
  // one free trial at a time: a login cannot collect trials
  const { membershipsOf } = await import("./workspace");
  const mine = await membershipsOf(login);
  const owned = mine.filter((m: any) => m.role === "owner").map((m: any) => Number(m.workspaceId));
  if (owned.length) {
    // tenancy: the caller's OWN workspaces — billing state only
    const rows: any[] = await conn.select({ w: workspaceBilling.workspaceId, status: workspaceBilling.status, sub: workspaceBilling.stripeSubscriptionId })
      .from(workspaceBilling).where(sql`${workspaceBilling.workspaceId} IN (${sql.join(owned.map((n: number) => sql`${n}`), sql`, `)})`);
    if (rows.some((r) => r.status === "trialing" && !r.sub)) throw new SignupError("FORBIDDEN", "You already have a workspace on a free trial. Choose a plan for it before starting another.");
  }
  const { createWorkspace } = await import("./workspaceAdmin");
  const ws = await createWorkspace({ name, createdBy: accountId });
  const openId = `m:${crypto.randomBytes(24).toString("hex")}`;
  await conn.insert(users).values({ openId, name: login.name, email: login.email, loginMethod: "member", role: "admin", workspaceId: ws.id, accountId, lastSignedIn: new Date() });
  const [created] = await conn.select().from(users).where(eq(users.openId, openId)).limit(1);
  await conn.update(workspaces).set({ ownerUserId: created.id }).where(eq(workspaces.id, ws.id));
  const { invalidateWorkspace } = await import("./workspace");
  invalidateWorkspace(ws.id);
  const { startTrial } = await import("./billing");
  await startTrial(ws.id);
  return { user: created, workspaceId: ws.id };
}

/** Daily: forget sign-up requests a week after they expired. */
export async function pruneSignups(): Promise<void> {
  try {
    const conn: any = await getDb();
    if (conn) await conn.delete(signups).where(sql`${signups.expiresAt} < DATE_SUB(NOW(), INTERVAL 7 DAY)`);
  } catch (e) { console.error("[signup] prune failed:", (e as any)?.message || e); }
}
