/**
 * The Fleet, from the app (build -295). Owner of the operator's workspace only (`fleetAllowed`); everyone
 * else gets `{allowed:false}` from status and FORBIDDEN from the rest. Every change to a hand-off goes
 * through fleet.ts `fleetTransition` (role "owner"), the same rules Mission Control is held to.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { newFleetRow, fleetTransition, makeFleetKey } from "../_core/fleet";
import { fleetStore, fleetAllowed } from "../_core/fleetStore";

async function need(user: any) {
  if (!(await fleetAllowed(user))) throw new TRPCError({ code: "FORBIDDEN", message: "The Fleet is available to the workspace owner only" });
}
const parse = (s: string | undefined) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

const areaInput = z.object({ type: z.enum(["client", "personal"]), name: z.string().min(1).max(80), goalId: z.string().max(64).nullable().optional(), goalTitle: z.string().max(200).nullable().optional() }).nullable().optional();

export const fleetRouter = router({
  /** Is the Fleet available here, is Mission Control connected, when did it last call. */
  status: protectedProcedure.query(async ({ ctx }) => {
    if (!(await fleetAllowed(ctx.user))) return { allowed: false as const };
    const { getSettingFor } = await import("../_core/workspace");
    const key = parse(await getSettingFor(ctx.user as any, "fleetKey"));
    const seen = parse(await getSettingFor(ctx.user as any, "fleetSeen"));
    return { allowed: true as const, connected: !!key, hint: key?.hint ?? null, createdAt: key?.createdAt ?? null, seenAt: seen?.at ?? null, seenMachine: seen?.machine ?? null };
  }),

  /** A new key for Mission Control. Shown ONCE; the old key stops working. */
  connect: protectedProcedure.mutation(async ({ ctx }) => {
    await need(ctx.user);
    const { wsIdOf, setSettingFor } = await import("../_core/workspace");
    const ws = (await wsIdOf(ctx.user as any)) ?? 1;
    const k = makeFleetKey(ws, ctx.user.id);
    await setSettingFor(ctx.user as any, "fleetKey", k.stored); // audited: _core/audit.ts AUDITED "fleet.connect"
    return { key: k.key, hint: k.hint };
  }),

  /** Stop Mission Control: the key stops working at once. */
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await need(ctx.user);
    const { wsIdOf, deleteWorkspaceSetting, setSettingFor } = await import("../_core/workspace");
    const ws = await wsIdOf(ctx.user as any);
    if (ws === null) await setSettingFor(ctx.user as any, "fleetKey", "");
    else await deleteWorkspaceSetting(ws, "fleetKey");
    return { ok: true };
  }),

  /** Hand-offs (open + the last 30 days) and what Mission Control says is waiting on the owner. */
  list: protectedProcedure.query(async ({ ctx }) => {
    await need(ctx.user);
    const s = fleetStore();
    const [items, outbox] = await Promise.all([s.list(ctx.user.id, 30), s.outbox(ctx.user.id)]);
    return { items, outbox, at: new Date().toISOString() };
  }),

  /** Hand a task, a project or a piece of text to the Fleet. */
  request: protectedProcedure.input(z.object({
    title: z.string().min(1).max(500),
    kind: z.enum(["task", "project"]).default("task"),
    refType: z.enum(["task", "project", "text"]).default("text"),
    refId: z.string().max(128).nullable().optional(),
    projectKey: z.string().max(128).optional(),
    instructions: z.string().max(8000).optional(),
    area: areaInput,
    when: z.string().max(10).nullable().optional(),
    access: z.enum(["edit", "answer"]).default("edit"),
    snapshot: z.object({
      notes: z.string().max(6000).optional(),
      due: z.string().max(10).nullable().optional(),
      projectName: z.string().max(200).optional(),
      subtasks: z.array(z.string().max(300)).max(40).optional(),
    }).optional(),
  })).mutation(async ({ ctx, input }) => {
    await need(ctx.user);
    let row;
    try { row = newFleetRow(input); } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: (e as Error).message }); }
    if (row.refType !== "text" && row.refId) {
      const open = (await fleetStore().list(ctx.user.id, 1)).find((r) => r.refType === row.refType && r.refId === row.refId && ["requested", "proposed", "approved", "running", "review"].includes(r.status));
      if (open) throw new TRPCError({ code: "CONFLICT", message: "This is already with the Fleet" });
    }
    return fleetStore().insert(ctx.user.id, row);
  }),

  /** Approve, cancel, accept, send back, try again, or add a note. */
  act: protectedProcedure.input(z.object({
    id: z.number().int().positive(),
    action: z.enum(["approve", "cancel", "accept", "sendBack", "retry", "note"]),
    note: z.string().max(2000).optional(),
  })).mutation(async ({ ctx, input }) => {
    await need(ctx.user);
    const r = await fleetStore().mutate(ctx.user.id, input.id, (cur) => fleetTransition(cur, "owner", input.action, { note: input.note }));
    if (r.error) throw new TRPCError({ code: r.error === "No such hand-off" ? "NOT_FOUND" : "BAD_REQUEST", message: r.error });
    return r.row;
  }),

  /** The owner's client programs and goals (for choosing an area). */
  context: protectedProcedure.query(async ({ ctx }) => {
    await need(ctx.user);
    return fleetStore().context(ctx.user.id);
  }),
});
