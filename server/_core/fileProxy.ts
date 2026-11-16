/**
 * GET /api/files/<ref> — private uploads, for signed-in users only (audit F35).
 *
 * storagePut used to share every upload "anyone with the link" and hand out
 * the provider's public URL; the Content-Type was whatever the uploader said.
 * New uploads are private and come back as /api/files/… URLs served here:
 *   - a valid, unrevoked session is required (sdk.authenticateRequest) — 401
 *     otherwise. Any member may open a file (notes with images are shared
 *     between teammates); the refs are unguessable provider ids.
 *   - Content-Type comes from the file name's extension through an allow-list
 *     (never from storage or the uploader); anything unknown is
 *     application/octet-stream.
 *   - images (png/jpeg/gif/webp) and PDFs are shown inline; everything else
 *     (SVG included — it can carry script) downloads as an attachment.
 *   - X-Content-Type-Options: nosniff, Cache-Control: private.
 *
 * Refs: d/<driveFileId>/<name> · s/<s3 key> · f/<forge key>.
 *
 * MULTI-WORKSPACE (-278). New uploads are RECORDED (table `files`) and linked
 * as x/<publicId>/<name>:
 *   - x/…  the signed-in reader must be a member of the file's workspace —
 *          anyone else gets "not found", whatever they know about the link;
 *   - p/…  a file its uploader made public on purpose (an imported original
 *          shown by Google's / Microsoft's viewer, which fetch without a
 *          cookie): no sign-in, the 128-bit id is the key.
 * The old d/ s/ f/ links have no record: they all predate workspaces, so they
 * belong to the original workspace and only ITS members may open them.
 */
import type { Express, Request, Response } from "express";

const INLINE: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  pdf: "application/pdf",
};
const ATTACH: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8",
  zip: "application/zip", mp3: "audio/mpeg", mp4: "video/mp4", m4a: "audio/mp4", wav: "audio/wav",
};

/** Headers for a file name: [content-type, inline?]. */
export function fileTypeFor(name: string): { type: string; inline: boolean } {
  const ext = (String(name).split(/[?#]/)[0].split(".").pop() || "").toLowerCase();
  if (INLINE[ext]) return { type: INLINE[ext], inline: true };
  return { type: ATTACH[ext] || "application/octet-stream", inline: false };
}

/** Parse the part after /api/files/. null when malformed. */
export function parseFileRef(rest: string): { kind: "d" | "s" | "f" | "x" | "p"; id: string; name: string } | null {
  const parts = String(rest || "").split("/").map((p) => { try { return decodeURIComponent(p); } catch { return "\u0000"; } });
  if (parts.some((p) => p.includes("\u0000") || p === ".." || p === ".")) return null;
  const kind = parts[0];
  if (kind === "x" || kind === "p") {
    const id = parts[1] || "";
    if (!/^[a-f0-9]{32}$/.test(id) || parts.length > 3) return null;
    return { kind, id, name: parts[2] || "file" };
  }
  if (kind === "d") {
    const id = parts[1] || "";
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(id) || parts.length > 3) return null;
    return { kind: "d", id, name: parts[2] || "file" };
  }
  if (kind === "s" || kind === "f") {
    const key = parts.slice(1).join("/");
    if (!key || key.length > 1024 || key.startsWith("/")) return null;
    return { kind, id: key, name: parts[parts.length - 1] };
  }
  return null;
}

type Deps = {
  authenticate: (req: Request) => Promise<unknown>;
  open: (kind: "d" | "s" | "f", id: string) => Promise<import("../storage").StoredFile>;
  /** the files record for an x/ or p/ link */
  lookup: (publicId: string) => Promise<any | null>;
  openRecord: (row: any) => Promise<import("../storage").StoredFile>;
  /** the reader's workspace: a number, 0 = none, null = no workspace model (older tests) */
  workspaceOf: (user: any) => Promise<number | null>;
};

export function registerFileRoutes(app: Express, deps?: Partial<Deps>): void {
  app.get("/api/files/*", async (req: Request, res: Response) => {
    try {
      const authenticate = deps?.authenticate || (async (r: Request) => (await import("./sdk")).sdk.authenticateRequest(r));
      const ref = parseFileRef((req.params as Record<string, string>)[0]);
      const lookup = deps?.lookup || (async (id: string) => (await import("./workspaceFiles")).fileByPublicId(id));
      const openRecord = deps?.openRecord || (async (row: any) => (await import("./workspaceFiles")).openFile(row));
      const workspaceOf = deps?.workspaceOf || (async (u: any) => (await import("./workspace")).wsIdOf(u));
      // A file made public on purpose: no sign-in, the id is the key.
      if (ref && ref.kind === "p") {
        const row = await lookup(ref.id);
        if (!row || !row.isPublic) { res.status(404).type("text/plain").send("File not found."); return; }
        const pf = await openRecord(row);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "public, max-age=3600");
        if (pf.kind === "missing") { res.status(404).type("text/plain").send("File not found."); return; }
        if (pf.kind === "redirect") { res.setHeader("Cache-Control", "no-store"); res.redirect(307, pf.url); return; }
        const pt = fileTypeFor(row.name || ref.name);
        const pn = String(row.name || ref.name).replace(/[\r\n"\\]/g, "_").slice(0, 150) || "file";
        res.setHeader("Content-Type", pt.type);
        res.setHeader("Content-Disposition", `${pt.inline ? "inline" : "attachment"}; filename="${pn.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(pn)}`);
        if (pf.length) res.setHeader("Content-Length", String(pf.length));
        pf.body.on("error", () => { try { res.destroy(); } catch { /* gone */ } });
        pf.body.pipe(res);
        return;
      }
      const user = await authenticate(req).catch(() => null);
      if (!user) { res.status(401).type("text/plain").send("Sign in to open this file."); return; }
      if (!ref) { res.status(400).type("text/plain").send("Bad file reference."); return; }
      const readerWs = await workspaceOf(user).catch(() => 0);
      let f: import("../storage").StoredFile;
      if (ref.kind === "x") {
        // Recorded upload: the reader must be in the file's workspace.
        const row = await lookup(ref.id);
        if (!row || readerWs === null || Number(row.workspaceId) !== readerWs) { res.status(404).type("text/plain").send("File not found."); return; }
        f = await openRecord(row);
        ref.name = row.name || ref.name;
      } else {
        // An old, unrecorded link: the original workspace's only.
        if (readerWs !== null && readerWs !== 1) { res.status(404).type("text/plain").send("File not found."); return; }
        const open = deps?.open || (async (k: "d" | "s" | "f", id: string) => (await import("../storage")).storageOpen(k, id));
        f = await open(ref.kind as "d" | "s" | "f", ref.id);
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, max-age=3600");
      if (f.kind === "missing") { res.status(404).type("text/plain").send("File not found."); return; }
      if (f.kind === "redirect") { res.setHeader("Cache-Control", "no-store"); res.redirect(307, f.url); return; }
      const { type, inline } = fileTypeFor(ref.name);
      const safeName = ref.name.replace(/[\r\n"\\]/g, "_").slice(0, 150) || "file";
      res.setHeader("Content-Type", type);
      res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${safeName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
      if (f.length) res.setHeader("Content-Length", String(f.length));
      f.body.on("error", (e: any) => { console.error("[files] stream failed:", String(e?.message || e).slice(0, 200)); try { res.destroy(); } catch { /* gone */ } });
      f.body.pipe(res);
    } catch (e: any) {
      console.error("[files] could not serve file:", String(e?.message || e).slice(0, 300));
      if (!res.headersSent) res.status(502).type("text/plain").send("Storage error.");
    }
  });
}
