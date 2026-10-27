/**
 * One-time role change (-253, audit 2): invited teammates used to become
 * `admin` by default. The owner decided (2026-10-27) that teammates are
 * ordinary members unless the owner grants admin (team.setRole). This turns
 * every admin except the owner into a member, once.
 *
 * Runs only when OWNER_OPEN_ID matches an account — so the owner can never be
 * the one demoted — and records itself in system_settings (`rolesDemoted253`)
 * so a later admin grant is never undone by a restart.
 */
import { and, eq, ne } from "drizzle-orm";
import { getDb, getSystemSetting, setSystemSetting } from "../db";
import { users } from "../../drizzle/schema";
import { ENV } from "./env";

export async function demoteInvitedAdminsOnce(): Promise<{ done: boolean; demoted?: number[]; reason?: string }> {
  if (await getSystemSetting("rolesDemoted253")) return { done: false, reason: "already done" };
  if (!ENV.ownerOpenId) {
    console.warn("[roles] OWNER_OPEN_ID is not set — skipping the one-time teammate role change");
    return { done: false, reason: "OWNER_OPEN_ID not set" };
  }
  const db = await getDb();
  if (!db) return { done: false, reason: "db unavailable" };
  const owner = await db.select({ id: users.id }).from(users).where(eq(users.openId, ENV.ownerOpenId)).limit(1);
  if (!owner.length) {
    console.warn("[roles] OWNER_OPEN_ID matches no account — skipping the one-time teammate role change");
    return { done: false, reason: "owner not found" };
  }
  const ownerId = owner[0].id;
  const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), ne(users.id, ownerId)));
  const ids = admins.map(a => a.id);
  if (ids.length) await db.update(users).set({ role: "user" }).where(and(eq(users.role, "admin"), ne(users.id, ownerId)));
  await setSystemSetting("rolesDemoted253", JSON.stringify({ at: new Date().toISOString(), demoted: ids }));
  console.log(`[roles] teammates are members now — demoted ${ids.length} admin account(s): ${ids.join(", ") || "none"}`);
  return { done: true, demoted: ids };
}
