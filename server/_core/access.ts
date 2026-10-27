/**
 * Team-visibility access rule (shared-workspace foundation — migration 0045).
 *
 * In the shared-workspace model every member contributes to ONE pool, but a
 * member only SEES items they created or that are assigned to them. Admins/
 * owners see everything. Ownership + assignment are keyed on userId via the
 * `createdById` / `assigneeId` columns added in migration 0045.
 *
 * NOTE: not wired into any read path yet. It ships alongside the schema columns
 * so the Phase-1 cut-over has a single, well-defined predicate to apply on every
 * read (and an equivalent SQL WHERE filter for list queries).
 */

export interface AccessUser {
  id: number;
  role?: string | null;
}

export interface OwnedItem {
  createdById?: number | null;
  assigneeId?: number | null;
}

/** True if `user` is an admin/owner — they can see every member's items. */
export function isAdminUser(user: AccessUser): boolean {
  const r = String(user.role || "").toLowerCase();
  return r === "admin" || r === "owner";
}

/**
 * Can `user` see `item`? Admins/owners see everything; every other member sees
 * only items they created or that are assigned to them.
 */
export function canSeeItem(item: OwnedItem, user: AccessUser): boolean {
  if (isAdminUser(user)) return true;
  return item.createdById === user.id || item.assigneeId === user.id;
}

/**
 * May `actor` override access on items that belong to `targetUserId` (full
 * edit, take ownership, delete, delete the account)? (-253)
 *   - the workspace OWNER: yes, for anyone;
 *   - an ADMIN: only for people other than the owner — admin is a role the
 *     owner grants, and it never reaches the owner's own data;
 *   - anyone else: no (their own items go through the normal paths).
 * Invited teammates used to be admins by default, so "is admin" alone let any
 * teammate take, rewrite or delete the owner's items (audit 2, 2026-10-27).
 */
export async function canOverride(actor: AccessUser & { openId?: string | null } | null | undefined, targetUserId: number): Promise<boolean> {
  if (!actor) return false;
  const { isOwnerCtxUser } = await import("../routers/appData");
  if (await isOwnerCtxUser(actor as any)) return true;
  if (!isAdminUser(actor)) return false;
  if (actor.id === targetUserId) return true;
  try {
    const { getUserById } = await import("../db");
    const target = await getUserById(targetUserId);
    // unknown target → refuse rather than guess
    if (!target) return false;
    return !(await isOwnerCtxUser(target as any));
  } catch {
    return false;
  }
}
