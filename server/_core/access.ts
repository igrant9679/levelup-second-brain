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
