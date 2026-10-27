/**
 * Audit log (build -233, migration 0059).
 *
 * audit(ctx, action, target) records one owner/admin, cross-user or
 * destructive action: who did it, to whose data, what, from where. It never
 * throws — a failed audit write must not fail (or undo) the action itself —
 * and it is awaited by callers only so tests can read the row back.
 *
 * Action names are "area.verb" (e.g. "item.take_ownership", "invite.create",
 * "smtp.save"). `detail` is small JSON for context — never passwords, tokens,
 * message bodies or financial data.
 */
import { desc, lt } from "drizzle-orm";
import { getDb } from "../db";
import { auditLog } from "../../drizzle/schema";

type Ctx = { user?: { id: number; name?: string | null; email?: string | null } | null; req?: any } | null | undefined;

export type AuditTarget = {
  targetUserId?: number | null;
  targetType?: string | null;
  targetId?: string | number | null;
  detail?: Record<string, unknown> | null;
};

function clientIp(req: any): string | null {
  try {
    const fwd = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
    return (fwd || req?.socket?.remoteAddress || req?.ip || "").slice(0, 64) || null;
  } catch { return null; }
}

export async function audit(ctx: Ctx, action: string, t: AuditTarget = {}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    let detail: string | null = null;
    if (t.detail) { try { detail = JSON.stringify(t.detail).slice(0, 4000); } catch { detail = null; } }
    await db.insert(auditLog).values({
      actorUserId: ctx?.user?.id ?? null,
      actorName: (ctx?.user?.name || ctx?.user?.email || null)?.slice(0, 255) ?? null,
      action: action.slice(0, 64),
      targetUserId: t.targetUserId ?? null,
      targetType: t.targetType ? String(t.targetType).slice(0, 32) : null,
      targetId: t.targetId != null ? String(t.targetId).slice(0, 128) : null,
      detail,
      ip: clientIp(ctx?.req),
    });
  } catch (e) {
    console.warn("[audit] could not record", action, (e as Error)?.message);
  }
}

/**
 * Procedures recorded automatically after they SUCCEED (the tRPC middleware
 * in _core/trpc.ts). Each entry names the action and picks the target out of
 * the input — only ids, kinds and non-secret fields: never passwords, tokens,
 * keys, setup tokens or message/financial content.
 */
type Spec = { action: string; target?: (input: any) => AuditTarget };
const owned = (type?: string) => (i: any): AuditTarget => ({ targetUserId: i?.ownerUserId ?? null, targetType: type ?? i?.kind ?? null, targetId: i?.itemId ?? i?.reportId ?? i?.taskId ?? i?.projectId ?? i?.noteId ?? i?.programId ?? null });
export const AUDITED: Record<string, Spec> = {
  // cross-user item changes
  "appData.transferItemOwnership": { action: "item.take_ownership", target: owned() },
  "appData.deleteSharedItem": { action: "item.delete_other_users", target: owned() },
  "appData.transferReportOwnership": { action: "item.take_ownership", target: owned("report") },
  "appData.deleteSharedReport": { action: "item.delete_other_users", target: owned("report") },
  "appData.updateSharedTask": { action: "shared.edit", target: owned("tasks") },
  "appData.updateSharedTaskStatus": { action: "shared.edit", target: (i) => ({ ...owned("tasks")(i), detail: { status: i?.status } }) },
  "appData.updateSharedProject": { action: "shared.edit", target: owned("projects") },
  "appData.updateSharedProgram": { action: "shared.edit", target: owned("programs") },
  "appData.updateSharedNote": { action: "shared.edit", target: owned("notes") },
  "appData.updateSharedReport": { action: "shared.edit", target: owned("report") },
  "appData.updateSharedFinance": { action: "shared.edit", target: (i) => ({ targetUserId: i?.ownerUserId ?? null, targetType: "finance" }) },
  // bulk / workspace-wide tools
  "appData.adminDeleteSharedTasks": { action: "bulk.delete_shared_tasks", target: (i) => ({ detail: { confirmCount: i?.confirmCount ?? null } }) },
  "appData.adminRemoveNiftyDuplicates": { action: "bulk.remove_nifty_duplicates", target: (i) => ({ detail: { confirmCount: i?.confirmCount ?? null } }) },
  "appData.backfillTeamVisibilityIds": { action: "bulk.backfill_visibility" },
  "appData.setTeamStarterPreset": { action: "workspace.starter_layout", target: (i) => ({ detail: { preset: i?.preset ?? null } }) },
  "appData.runBackupNow": { action: "backup.run" },
  "appData.exportUserAppDataBackup": { action: "backup.export_all_users" },
  "demoAdmin.cleanup": { action: "demo.cleanup", target: (i) => ({ targetType: "user", targetId: i?.email ?? null, detail: { apply: !!i?.apply } }) },
  // members and access
  "team.deleteMember": { action: "member.delete", target: (i) => ({ targetUserId: i?.userId ?? null, targetType: "user" }) },
  "teamInvites.create": { action: "invite.create", target: (i) => ({ targetType: "invite", targetId: i?.email ?? null, detail: { role: i?.role ?? "user" } }) },
  "teamInvites.delete": { action: "invite.delete", target: (i) => ({ targetType: "invite", targetId: i?.id ?? null }) },
  "teamInvites.resend": { action: "invite.resend", target: (i) => ({ targetType: "invite", targetId: i?.id ?? i?.email ?? null }) },
  "teamInvites.accept": { action: "invite.accept" },
  "emailAuth.register": { action: "account.register", target: (i) => ({ targetType: "user", targetId: i?.email ?? null }) },
  "emailAuth.resetPassword": { action: "account.password_reset" },
  "emailAuth.setPassword": { action: "account.password_set" },
  "emailAuth.updateEmail": { action: "account.email_change", target: (i) => ({ targetType: "user", detail: { newEmail: i?.newEmail ?? null } }) },
  // system mail, AI keys, bank link
  "oauthSync.setNotificationSender": { action: "mail.set_system_sender", target: (i) => ({ detail: { sender: i?.senderKey ?? null } }) },
  "oauthSync.adminSaveSmtpImapAccount": { action: "mail.save_user_smtp", target: (i) => ({ targetUserId: i?.userId ?? null, targetType: "smtp", detail: { email: i?.email ?? null } }) },
  "oauthSync.adminDeleteSmtpImapAccount": { action: "mail.delete_user_smtp", target: (i) => ({ targetUserId: i?.userId ?? null, targetType: "smtp" }) },
  "aiSettings.set": { action: "ai.keys_change", target: (i) => ({ detail: { provider: i?.provider ?? null, changed: ["openai", "claude", "gemini"].filter((k) => i?.[k] !== undefined) } }) },
  "simplefin.setup": { action: "bank.connect" },
  "simplefin.clearConfig": { action: "bank.disconnect" },
};

/** Newest first; `before` = an id to page back from. */
export async function readAudit(limit = 100, before?: number | null) {
  const db = await getDb();
  if (!db) return [];
  const q = db.select().from(auditLog);
  const rows = await (before ? q.where(lt(auditLog.id, before)) : q).orderBy(desc(auditLog.id)).limit(Math.min(Math.max(limit, 1), 500));
  return rows;
}
