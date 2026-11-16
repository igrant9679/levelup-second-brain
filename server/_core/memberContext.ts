/**
 * "Who is this work for?" (multi-workspace, build -278).
 *
 * Several things are decided per workspace deep inside helper code that has
 * no user in its arguments: which AI key answers (workspaceAI.ts), whose daily
 * limits are counted (quota.ts). Rather than thread a user through every
 * function, the member the current work is for is kept in an
 * AsyncLocalStorage:
 *   - every signed-in tRPC request runs inside it (the middleware in trpc.ts);
 *   - a background job calls setMember(userId) at the top of each person's
 *     turn in its loop (and single-person helpers call it on entry).
 *
 * This is NOT an access check — data access is always by explicit user id.
 * When nothing is set, callers fall back to the platform's own workspace.
 */
import { AsyncLocalStorage } from "node:async_hooks";

type Store = { userId: number; wsId?: number | null };
const als = new AsyncLocalStorage<Store>();

/** Run `fn` on behalf of a member (requests). */
export function runAsMember<T>(user: { id: number; workspaceId?: number | null }, fn: () => T): T {
  return als.run({ userId: Number(user.id), wsId: user.workspaceId ?? undefined }, fn);
}

/** From here on in this async chain, the work is for `userId` (job loops). */
export function setMember(userId: number | null | undefined): void {
  const n = Number(userId);
  if (Number.isInteger(n) && n > 0) als.enterWith({ userId: n });
}

export function currentMemberId(): number | null {
  return als.getStore()?.userId ?? null;
}

/**
 * The workspace of the member the current work is for.
 *   number     that workspace
 *   null       tests' no-workspace mode for that member
 *   undefined  no member is set (startup code, a job that didn't say)
 */
export async function currentWorkspaceId(): Promise<number | null | undefined> {
  const s = als.getStore();
  if (!s) return undefined;
  if (s.wsId !== undefined && s.wsId !== null && Number(s.wsId) > 0) return Number(s.wsId);
  const { wsIdOf } = await import("./workspace");
  const w = await wsIdOf({ id: s.userId, ...(s.wsId !== undefined ? { workspaceId: s.wsId } : {}) });
  if (w !== null && w > 0) s.wsId = w;
  return w;
}
