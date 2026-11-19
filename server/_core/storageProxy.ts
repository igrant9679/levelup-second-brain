import type { Express } from "express";
import { ENV } from "./env";

/**
 * Legacy file links (/manus-storage/<key>, the old Forge store). They used to
 * be open to anyone who had the link. Since -278: a signed-in member of the
 * ORIGINAL workspace only (every such link predates workspaces), with one
 * exception — keys under note-originals/, which outside document viewers
 * fetch without a cookie and were public on purpose.
 */
export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!/^note-originals\//.test(key)) {
      try {
        const { sdk } = await import("./sdk");
        const user: any = await sdk.authenticateRequest(req as any).catch(() => null);
        if (!user) { res.status(401).send("Sign in to open this file."); return; }
        const { wsIdOf } = await import("./workspace");
        const w = await wsIdOf(user);
        if (w !== null && w !== 1) { res.status(404).send("File not found."); return; }
        // Audit 3: not another workspace's object in the shared store
        if (w !== null && !(await (await import("./workspaceFiles")).legacyRefAllowed(key))) { res.status(404).send("File not found."); return; }
      } catch {
        res.status(401).send("Sign in to open this file.");
        return;
      }
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
