/**
 * Build -233 (Platform): audit log + error log.
 *  - the tRPC middleware records the listed procedures once they succeed
 *    (never failed ones, never an owner editing their own item);
 *  - error messages group by normalised fingerprint, repeats are throttled
 *    into one row's count;
 *  - only the owner reads the logs; client reports are capped per user.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const audited: any[] = [];
vi.mock("./_core/audit", async (orig) => {
  const real: any = await orig();
  return { ...real, audit: vi.fn(async (ctx: any, action: string, t: any) => { audited.push({ actor: ctx?.user?.id ?? null, action, ...t }); }), readAudit: vi.fn(async () => [{ id: 1, action: "x" }]) };
});
const inserts: any[] = [];
const fakeDb: any = {
  insert: () => ({ values: (v: any) => ({ onDuplicateKeyUpdate: ({ set }: any) => { inserts.push({ v, set }); return Promise.resolve(); } }) }),
  select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [{ id: 9, message: "m" }] }) }) }) }),
};
vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb) }));
vi.mock("./_core/ownerGuard", () => ({
  assertOwner: vi.fn(async (u: any) => { if (u?.id !== 1) throw new Error("Only the workspace owner can do this."); }),
  isOwner: vi.fn(async (u: any) => u?.id === 1),
}));

import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { normaliseMessage, fingerprintOf, recordError } from "./_core/errorLog";
import { opsRouter } from "./routers/ops";

const flush = () => new Promise((r) => setTimeout(r, 20));
const appish = router({
  appData: router({
    deleteSharedItem: protectedProcedure.input(z.object({ ownerUserId: z.number(), kind: z.string(), itemId: z.string() })).mutation(() => ({ ok: true })),
    updateSharedProject: protectedProcedure.input(z.object({ ownerUserId: z.number(), projectId: z.string() })).mutation(() => ({ ok: true })),
    transferItemOwnership: protectedProcedure.input(z.object({ ownerUserId: z.number(), kind: z.string(), itemId: z.string() })).mutation(() => { throw new Error("nope"); }),
    load: protectedProcedure.query(() => ({})),
  }),
  aiSettings: router({ set: protectedProcedure.input(z.object({ provider: z.string().optional(), openai: z.string().optional() })).mutation(() => ({ ok: true })) }),
  emailAuth: router({ resetPassword: publicProcedure.input(z.object({ token: z.string(), password: z.string() })).mutation(() => ({ ok: true })) }),
});
const caller = (id: number | null) => appish.createCaller({ user: id == null ? null : { id, name: "U" + id }, req: { headers: {} } } as any);

beforeEach(() => { audited.length = 0; inserts.length = 0; });

describe("audit middleware", () => {
  it("records a cross-user delete with its target", async () => {
    await caller(2).appData.deleteSharedItem({ ownerUserId: 1, kind: "notes", itemId: "n5" });
    await flush();
    expect(audited).toEqual([{ actor: 2, action: "item.delete_other_users", targetUserId: 1, targetType: "notes", targetId: "n5" }]);
  });
  it("does not record a failed action, or an unlisted one", async () => {
    await expect(caller(2).appData.transferItemOwnership({ ownerUserId: 1, kind: "tasks", itemId: "3" })).rejects.toThrow();
    await caller(2).appData.load();
    await flush();
    expect(audited).toEqual([]);
  });
  it("skips an owner editing their own item through a shared endpoint", async () => {
    await caller(1).appData.updateSharedProject({ ownerUserId: 1, projectId: "p1" });
    await caller(2).appData.updateSharedProject({ ownerUserId: 1, projectId: "p1" });
    await flush();
    expect(audited.map((a) => a.actor)).toEqual([2]);
  });
  it("never puts keys or passwords in the record", async () => {
    await caller(1).aiSettings.set({ provider: "claude", openai: "sk-secret-123" });
    await caller(null).emailAuth.resetPassword({ token: "tok-abc", password: "hunter22" });
    await flush();
    const s = JSON.stringify(audited);
    expect(s).not.toMatch(/sk-secret|tok-abc|hunter22/);
    expect(audited[0]).toMatchObject({ action: "ai.keys_change", detail: { provider: "claude", changed: ["openai"] } });
    expect(audited[1]).toMatchObject({ actor: null, action: "account.password_reset" });
  });
});

describe("error grouping", () => {
  it("groups messages that differ only in numbers, ids and quoted values", () => {
    expect(normaliseMessage('Task 123 "Buy milk" not found at https://x.y/z?a=1')).toBe("Task # <q> not found at <url>");
    expect(fingerprintOf("server", "Timeout after 3000ms (job 7f3a9c21d0)")).toBe(fingerprintOf("server", "Timeout after 5000ms (job 0b1c2d3e4f)"));
    expect(fingerprintOf("server", "boom")).not.toBe(fingerprintOf("client", "boom"));
  });
  it("throttles repeats into the next write's count", async () => {
    await recordError({ source: "server", message: "[cron x] failed 1" });
    await recordError({ source: "server", message: "[cron x] failed 2" });
    await recordError({ source: "server", message: "[cron x] failed 3" });
    expect(inserts.length).toBe(1);
    expect(inserts[0].v).toMatchObject({ source: "server", count: 1 });
  });
});

describe("ops router", () => {
  const ops = (id: number) => opsRouter.createCaller({ user: { id }, req: { headers: { "user-agent": "UA" } } } as any);
  it("only the owner reads the logs", async () => {
    await expect(ops(2).errors()).rejects.toThrow(/owner/);
    await expect(ops(2).auditLog()).rejects.toThrow(/owner/);
    expect(await ops(1).auditLog()).toEqual([{ id: 1, action: "x" }]);
  });
  it("caps browser reports at 60 an hour per user", async () => {
    let dropped = 0;
    for (let i = 0; i < 65; i++) { const r: any = await ops(5).reportClientError({ message: "err " + "abcdefghij"[i % 10].repeat(i + 1) }); if (r.dropped) dropped++; }
    expect(dropped).toBe(5);
  });
});
