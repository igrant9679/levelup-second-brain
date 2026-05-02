import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerProviderOAuthCallbacks } from "../routers/oauth-callbacks";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import * as dbHelpers from "../db";
import { sendEmail } from "./sendEmail";
import { deleteOldEmailDeliveryLogs, deleteOldScheduledTaskLogs, insertScheduledTaskLog } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerProviderOAuthCallbacks(app);

  // ---- Scheduled task endpoint: daily OAuth token expiry check ----
  // Called by the Manus scheduled task agent via POST with the session cookie.
  // Sends per-user expiry emails (7-day window) AND a consolidated owner notification (3-day window).
  app.post("/api/scheduled/check-expiry", async (req, res) => {
    const startMs = Date.now();
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const today = new Date().toISOString().slice(0, 10);

      // --- Configurable log retention cleanup ---
      const retentionSetting = await dbHelpers.getSystemSetting("logRetentionDays").catch(() => undefined);
      const retentionDays = retentionSetting ? Math.max(7, parseInt(retentionSetting, 10)) : 90;
      const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const [deletedTaskLogs, deletedEmailLogs] = await Promise.all([
        deleteOldScheduledTaskLogs(cutoffMs).catch(() => 0),
        deleteOldEmailDeliveryLogs(cutoffMs).catch(() => 0),
      ]);
      if (deletedTaskLogs > 0 || deletedEmailLogs > 0) {
        console.log(`[check-expiry] Cleaned up ${deletedTaskLogs} task log(s) and ${deletedEmailLogs} email log(s) older than ${retentionDays} days`);
      }

      // --- Per-user emails (7-day window) ---
      const emailDedupeKey = `expiry_email_sent_${today}`;
      const emailAlreadySent = await dbHelpers.getSystemSetting(emailDedupeKey);
      let emailResult: { notified: boolean; count?: number; reason?: string } = { notified: false, reason: "Already sent today" };

      if (!emailAlreadySent) {
        const expiring7 = await dbHelpers.getAllExpiringTokens(7);
        let sent = 0;
        for (const t of expiring7) {
          const userEmail = t.userEmail;
          if (!userEmail) continue;
          const expiresAt = t.expiresAt instanceof Date ? t.expiresAt : new Date(t.expiresAt as string | number);
          const diffMs = expiresAt.getTime() - Date.now();
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const providerLabel = t.provider === "microsoft" ? "Microsoft 365" : "Google Workspace";
          const timeStr = diffMs <= 0 ? "has expired" : `expires in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
          const connectedEmail = t.email ?? "your connected account";
          const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px"><h2 style="color:#7c3aed">⚠ Action required: Reconnect your ${providerLabel} account</h2><p>Your <strong>${providerLabel}</strong> connection (<em>${connectedEmail}</em>) ${timeStr}.</p><p>Once expired, LevelUp will no longer be able to sync your calendar, mail, or contacts from this account.</p><p style="color:#888;font-size:12px;margin-top:24px">Go to Settings → Accounts → ${providerLabel} → Refresh Token to reconnect.</p></div>`;
          const ok = await sendEmail({ to: userEmail, subject: `Action required: Your ${providerLabel} connection ${timeStr}`, html, senderUserId: null });
          if (ok) sent++;
        }
        await dbHelpers.setSystemSetting(emailDedupeKey, "1");
        emailResult = { notified: expiring7.length > 0, count: sent };
      }

      // --- Owner notification (3-day window) ---
      const notifDedupeKey = `expiry_notif_sent_${today}`;
      const notifAlreadySent = await dbHelpers.getSystemSetting(notifDedupeKey);
      let ownerResult: { notified: boolean; count?: number; reason?: string } = { notified: false, reason: "Already notified today" };

      if (!notifAlreadySent) {
        const expiring3 = await dbHelpers.getAllExpiringTokens(3);
        if (expiring3.length > 0) {
          const lines = expiring3.map(t => {
            const expiresAt = t.expiresAt instanceof Date ? t.expiresAt : new Date(t.expiresAt as string | number);
            const diffMs = expiresAt.getTime() - Date.now();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const timeStr = diffMs <= 0 ? "EXPIRED" : `expires in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
            const name = t.userName ?? t.userEmail ?? `User #${t.userId}`;
            return `• ${name} — ${t.provider} (${t.email ?? "no email"}) — ${timeStr}`;
          });
          const { notifyOwner } = await import("./notification");
          await notifyOwner({
            title: `⚠ ${expiring3.length} OAuth token${expiring3.length === 1 ? "" : "s"} expiring soon`,
            content: `The following connected OAuth tokens are expiring or have expired:\n\n${lines.join("\n")}\n\nAsk affected users to reconnect in Settings → Accounts.`,
          });
          await dbHelpers.setSystemSetting(notifDedupeKey, "1");
          ownerResult = { notified: true, count: expiring3.length };
        } else {
          ownerResult = { notified: false, reason: "No tokens expiring within 3 days" };
        }
      }

      const durationMs = Date.now() - startMs;
      await insertScheduledTaskLog({
        taskName: "check-expiry",
        emailsSent: emailResult.count ?? 0,
        ownerNotified: ownerResult.notified ? 1 : 0,
        durationMs,
        error: null,
      });

      res.json({ success: true, emailResult, ownerResult, durationMs });
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const errorMsg = String(err);
      console.error("[check-expiry] Error:", err);
      // Still log the failure
      await insertScheduledTaskLog({
        taskName: "check-expiry",
        emailsSent: 0,
        ownerNotified: 0,
        durationMs,
        error: errorMsg,
      }).catch(() => {});
      res.status(500).json({ error: errorMsg });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
