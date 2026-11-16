/**
 * Files per workspace (multi-workspace Phase F, build -278).
 *
 * WHERE A WORKSPACE'S FILES GO  (workspaces.storage, encrypted JSON)
 *   { current: "platform" | "<storeId>", stores: { "<storeId>": OwnStore } }
 *   - "platform" (the default): LevelUp's storage — a folder of its own inside
 *     the platform's Google Drive folder, or a `ws<id>/` prefix in the
 *     platform's bucket.
 *   - an OWN store, set up by the workspace's owner or an admin in
 *     Settings → Storage: their S3 bucket (AWS S3, Cloudflare R2, any
 *     S3-compatible service) or their Google Drive. Earlier stores stay in
 *     `stores` so files already there remain readable until they are moved.
 *
 * EVERY UPLOAD IS RECORDED  (table `files`): workspace, uploader, store,
 * backend and provider reference. The app links to
 * /api/files/x/<publicId>/<name>; fileProxy.ts serves it only to members of
 * the file's workspace. Since the link names the record and not the provider,
 * moving a workspace's files to another store (moveFiles) needs no change to
 * the notes that use them.
 */
import { createHash, randomBytes } from "crypto";
import { and, eq, ne } from "drizzle-orm";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getDb } from "../db";
import { files, workspaces } from "../../drizzle/schema";
import { ENV } from "./env";
import { assertPublicUrl } from "./netGuard";
import { deleteWorkspaceSetting, getWorkspace, getWorkspaceSetting, setWorkspaceSetting } from "./workspace";
import type { PutResult, StoredFile } from "../storage";

export type OwnS3 = { id: string; mode: "s3"; label?: string; endpoint?: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle?: boolean; prefix?: string; addedAt: string };
export type OwnDrive = { id: string; mode: "gdrive"; label?: string; refreshToken: string; folderId: string; account?: string; addedAt: string };
export type OwnStore = OwnS3 | OwnDrive;
export type StorageState = { current: string; stores: Record<string, OwnStore> };

const EMPTY: StorageState = { current: "platform", stores: {} };

// ── the workspace's storage settings ────────────────────────────────────────
export async function readStorage(wsId: number): Promise<StorageState> {
  const db = await getDb();
  if (!db) return { ...EMPTY };
  const [row]: any[] = await db.select({ storage: workspaces.storage }).from(workspaces).where(eq(workspaces.id, Number(wsId))).limit(1);
  if (!row || !row.storage) return { current: "platform", stores: {} };
  try {
    const o = JSON.parse(String(row.storage));
    const stores = o && typeof o.stores === "object" && o.stores ? o.stores : {};
    const current = typeof o?.current === "string" && (o.current === "platform" || stores[o.current]) ? o.current : "platform";
    return { current, stores };
  } catch { return { current: "platform", stores: {} }; }
}
export async function writeStorage(wsId: number, s: StorageState): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(workspaces).set({ storage: JSON.stringify(s) }).where(eq(workspaces.id, Number(wsId)));
}
/** What Settings may show: never a secret. */
export function storageView(s: StorageState) {
  const mask = (v: string) => (v && v.length > 8 ? `${v.slice(0, 4)}…${v.slice(-3)}` : v ? "…" : "");
  return {
    current: s.current,
    stores: Object.values(s.stores).map((st) => st.mode === "s3"
      ? { id: st.id, mode: st.mode, label: st.label || `${st.bucket}`, bucket: st.bucket, region: st.region, endpoint: st.endpoint || "", prefix: st.prefix || "", accessKeyId: mask(st.accessKeyId), addedAt: st.addedAt }
      : { id: st.id, mode: st.mode, label: st.label || "Google Drive", account: st.account || "", folderId: st.folderId, addedAt: st.addedAt }),
  };
}
export function newStoreId(): string { return "st_" + randomBytes(6).toString("hex"); }

// ── own S3 ──────────────────────────────────────────────────────────────────
const _s3 = new Map<string, S3Client>();
function s3For(st: OwnS3): S3Client {
  const k = createHash("sha1").update([st.endpoint, st.region, st.bucket, st.accessKeyId, st.secretAccessKey, st.forcePathStyle].join("|")).digest("hex");
  let c = _s3.get(k);
  if (!c) {
    const cfg: ConstructorParameters<typeof S3Client>[0] = { region: st.region || "us-east-1", credentials: { accessKeyId: st.accessKeyId, secretAccessKey: st.secretAccessKey } };
    if (st.endpoint) cfg.endpoint = st.endpoint;
    if (st.forcePathStyle || st.endpoint) cfg.forcePathStyle = st.forcePathStyle !== false && !!st.endpoint ? true : !!st.forcePathStyle;
    c = new S3Client(cfg);
    if (_s3.size > 50) _s3.clear();
    _s3.set(k, c);
  }
  return c;
}
const s3Key = (st: OwnS3, key: string) => (st.prefix ? st.prefix.replace(/^\/+|\/+$/g, "") + "/" : "") + key.replace(/^\/+/, "");

// ── own Google Drive ────────────────────────────────────────────────────────
const _dt = new Map<string, { token: string; expiresAt: number }>();
async function driveToken(refreshToken: string): Promise<string> {
  const k = createHash("sha1").update(refreshToken).digest("hex");
  const hit = _dt.get(k);
  if (hit && hit.expiresAt > Date.now() + 5 * 60_000) return hit.token;
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: ENV.googleDriveClientId, client_secret: ENV.googleDriveClientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }).toString(),
  });
  if (!resp.ok) { _dt.delete(k); throw new Error(`Google Drive sign-in expired or was removed (${resp.status}). Reconnect Google Drive in Settings → Storage.`); }
  const data = (await resp.json()) as { access_token: string; expires_in: number };
  if (_dt.size > 200) _dt.clear();
  _dt.set(k, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}
/** Create the folder LevelUp keeps a workspace's files in, in the connected Drive. */
export async function driveCreateFolderWith(refreshToken: string, name: string): Promise<string> {
  const token = await driveToken(refreshToken);
  const resp = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.slice(0, 120), mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!resp.ok) throw new Error(`Could not create a folder in Google Drive (${resp.status}).`);
  const { id } = (await resp.json()) as { id?: string };
  if (!id) throw new Error("Google Drive returned no folder id.");
  return id;
}

const toBuffer = (data: Buffer | Uint8Array | string) => (typeof data === "string" ? Buffer.from(data, "utf-8") : data instanceof Buffer ? data : Buffer.from(data));
function hashed(relKey: string): string {
  const k = relKey.replace(/^\/+/, "");
  const h = randomBytes(4).toString("hex");
  const dot = k.lastIndexOf(".");
  return dot === -1 || dot < k.lastIndexOf("/") ? `${k}_${h}` : `${k.slice(0, dot)}_${h}${k.slice(dot)}`;
}

/** Put into one of the workspace's OWN stores. Returns the provider reference. */
export async function ownPut(st: OwnStore, key: string, data: Buffer, contentType: string, isPublic = false): Promise<{ backend: "s3" | "drive"; ref: string; publicUrl?: string }> {
  if (st.mode === "s3") {
    const k = s3Key(st, key);
    await s3For(st).send(new PutObjectCommand({ Bucket: st.bucket, Key: k, Body: data, ContentType: contentType }));
    return { backend: "s3", ref: k };
  }
  const { driveMultipartUpload, driveResumableUpload, DRIVE_MULTIPART_LIMIT } = await import("../storage");
  const token = await driveToken(st.refreshToken);
  const metadata = { name: key.split("/").pop() || key, parents: [st.folderId], mimeType: contentType };
  const id = data.length > DRIVE_MULTIPART_LIMIT ? await driveResumableUpload(token, metadata, data, contentType) : await driveMultipartUpload(token, metadata, data, contentType);
  if (!id) throw new Error("Google Drive returned no file id.");
  let publicUrl: string | undefined;
  if (isPublic) {
    const perm = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ role: "reader", type: "anyone" }) });
    if (perm.ok) publicUrl = contentType.toLowerCase().startsWith("image/") ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : `https://drive.google.com/uc?export=download&id=${id}`;
  }
  return { backend: "drive", ref: id, publicUrl };
}
export async function ownOpen(st: OwnStore, ref: string): Promise<StoredFile> {
  if (st.mode === "s3") {
    try {
      const out: any = await s3For(st).send(new GetObjectCommand({ Bucket: st.bucket, Key: ref }));
      return { kind: "stream", body: out.Body as NodeJS.ReadableStream, length: Number(out.ContentLength) || undefined };
    } catch (e: any) {
      if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) return { kind: "missing" };
      throw e;
    }
  }
  const token = await driveToken(st.refreshToken);
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ref)}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) });
  if (resp.status === 404) return { kind: "missing" };
  if (!resp.ok || !resp.body) throw new Error(`Drive download failed (${resp.status})`);
  const { Readable } = await import("stream");
  return { kind: "stream", body: Readable.fromWeb(resp.body as any), length: Number(resp.headers.get("content-length") || 0) || undefined };
}
export async function ownDelete(st: OwnStore, ref: string): Promise<boolean> {
  try {
    if (st.mode === "s3") { await s3For(st).send(new DeleteObjectCommand({ Bucket: st.bucket, Key: ref })); return true; }
    const token = await driveToken(st.refreshToken);
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ref)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    return r.ok || r.status === 404;
  } catch { return false; }
}

/** Refuse an S3 endpoint that points into a private network (the server would be fetching it). */
export async function assertSafeS3(st: Pick<OwnS3, "endpoint">): Promise<void> {
  if (!st.endpoint) return;
  if (!/^https:\/\//i.test(st.endpoint)) throw new Error("The endpoint must start with https://");
  await assertPublicUrl(st.endpoint);
}

/** Write a small file, read it back, delete it. Proves the credentials really work. */
export async function testStore(st: OwnStore): Promise<{ ok: boolean; error?: string }> {
  const body = Buffer.from(`LevelUp storage test ${new Date().toISOString()}`, "utf-8");
  try {
    if (st.mode === "s3") await assertSafeS3(st);
    const put = await ownPut(st, `_levelup-test/test-${Date.now()}.txt`, body, "text/plain");
    const got = await ownOpen(st, put.ref);
    if (got.kind !== "stream") return { ok: false, error: "The test file was written but could not be read back." };
    const chunks: Buffer[] = [];
    for await (const c of got.body as any) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    if (Buffer.concat(chunks).toString("utf-8") !== body.toString("utf-8")) return { ok: false, error: "The test file read back differently from what was written." };
    await ownDelete(st, put.ref);
    return { ok: true };
  } catch (e: any) {
    const name = String(e?.name || "");
    const msg = String(e?.message || e).slice(0, 300);
    const hint = name === "AccessDenied" || /access denied|forbidden|403/i.test(msg) ? " — the key is not allowed to write, read or delete in this bucket"
      : name === "NoSuchBucket" || /no such bucket|404/i.test(msg) ? " — no bucket with that name at that endpoint / region"
      : /signature|credential|invalidaccesskey/i.test(name + msg) ? " — the access key or secret is wrong" : "";
    return { ok: false, error: msg + hint };
  }
}

// ── uploads ─────────────────────────────────────────────────────────────────
const fileUrl = (publicId: string, name: string, pub = false) => `/api/files/${pub ? "p" : "x"}/${publicId}/${encodeURIComponent(name || "file")}`;

/** The workspace's own folder inside the platform's Google Drive (created on first use). */
async function platformDriveFolder(wsId: number): Promise<string | undefined> {
  try {
    const { operatorWorkspaceId } = await import("./mailTrust");
    // The operator's own workspace keeps using the folder it always used.
    if ((await operatorWorkspaceId()) === wsId) return undefined;
    const saved = await getWorkspaceSetting(wsId, "platformDriveFolder");
    if (saved) return saved;
    const ws = await getWorkspace(wsId);
    const { platformDriveCreateFolder } = await import("../storage");
    const id = await platformDriveCreateFolder(`ws-${wsId} ${ws?.name || ""}`.trim());
    await setWorkspaceSetting(wsId, "platformDriveFolder", id);
    return id;
  } catch (e) {
    console.error(`[files] could not make workspace ${wsId}'s folder in the platform Drive — using the shared folder:`, e);
    return undefined;
  }
}

async function record(o: { wsId: number; userId: number | null; store: string; backend: string; ref: string; name: string; size: number; mime: string; isPublic: boolean }): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const publicId = randomBytes(16).toString("hex");
  await db.insert(files).values({ publicId, workspaceId: o.wsId, ownerUserId: o.userId, store: o.store, backend: o.backend, ref: o.ref.slice(0, 1024), name: o.name.slice(0, 255), size: o.size, mime: o.mime.slice(0, 128), isPublic: o.isPublic ? 1 : 0 });
  return publicId;
}

/** An upload by a signed-in member: to their workspace's store, recorded, linked by record id. */
export async function putForMember(who: { wsId: number; userId: number }, relKey: string, data: Buffer | Uint8Array | string, contentType: string, opts: { public?: boolean } = {}): Promise<{ key: string; url: string }> {
  const body = toBuffer(data);
  const pub = opts.public === true;
  const state = await readStorage(who.wsId);
  const key = `ws${who.wsId}/${relKey.replace(/^\/+/, "")}`;
  const name = (relKey.split("/").pop() || "file").slice(0, 200);
  const own = state.current !== "platform" ? state.stores[state.current] : null;
  if (own) {
    const hk = hashed(key);
    const put = await ownPut(own, hk, body, contentType, pub);
    const publicId = await record({ wsId: who.wsId, userId: who.userId, store: own.id, backend: put.backend, ref: put.ref, name, size: body.length, mime: contentType, isPublic: pub });
    // public originals: the Drive link an outside viewer can open, else the open proxy link
    return { key: hk, url: pub ? (put.publicUrl || fileUrl(publicId, name, true)) : fileUrl(publicId, name) };
  }
  // LevelUp's own storage counts against the plan (-279); a workspace's own store does not.
  await (await import("./billing")).assertStorageRoom(who.wsId, body.length);
  const { storagePutPlatform, storageBackend } = await import("../storage");
  const driveFolderId = storageBackend() === "drive" ? await platformDriveFolder(who.wsId) : undefined;
  const put: PutResult = await storagePutPlatform(key, body, contentType, { public: pub, driveFolderId });
  const publicId = await record({ wsId: who.wsId, userId: who.userId, store: "platform", backend: put.backend, ref: put.ref, name, size: body.length, mime: contentType, isPublic: pub });
  // A public file keeps the provider's public URL (outside viewers need one);
  // a private one is served through its record.
  return { key: put.key, url: pub ? put.url : fileUrl(publicId, name) };
}

// ── serving ─────────────────────────────────────────────────────────────────
export async function fileByPublicId(publicId: string): Promise<any | null> {
  if (!/^[a-f0-9]{32}$/.test(publicId)) return null;
  const db = await getDb();
  if (!db) return null;
  // tenancy: by an unguessable 128-bit id; the caller checks the row's workspace against the reader's
  const [row]: any[] = await db.select().from(files).where(eq(files.publicId, publicId)).limit(1);
  return row || null;
}
export async function openFile(row: { workspaceId: number; store: string; backend: string; ref: string }): Promise<StoredFile> {
  if (row.store === "platform") {
    const { storageOpen } = await import("../storage");
    return storageOpen(row.backend === "drive" ? "d" : row.backend === "s3" ? "s" : "f", row.ref);
  }
  const st = (await readStorage(row.workspaceId)).stores[row.store];
  if (!st) return { kind: "missing" };
  return ownOpen(st, row.ref);
}

// ── moving a workspace's files to its current store ─────────────────────────
const _moves = new Map<number, { total: number; moved: number; failed: number; running: boolean; error?: string; finishedAt?: string }>();
export function moveStatus(wsId: number) { return _moves.get(wsId) || null; }

/** How many of the workspace's files are NOT in its current store. */
export async function filesElsewhere(wsId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const state = await readStorage(wsId);
  const rows: any[] = await db.select({ id: files.id }).from(files).where(and(eq(files.workspaceId, wsId), ne(files.store, state.current)));
  return rows.length;
}

/**
 * Copy every file that is not in the workspace's current store into it, then
 * point its record there. Links don't change. Runs in the background; one at a
 * time per workspace. The old copy is deleted only after the new one is saved.
 */
export async function moveFiles(wsId: number): Promise<{ started: boolean; total: number }> {
  const cur = _moves.get(wsId);
  if (cur?.running) return { started: false, total: cur.total };
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const state = await readStorage(wsId);
  const rows: any[] = await db.select().from(files).where(and(eq(files.workspaceId, wsId), ne(files.store, state.current)));
  const st = { total: rows.length, moved: 0, failed: 0, running: true } as { total: number; moved: number; failed: number; running: boolean; error?: string; finishedAt?: string };
  _moves.set(wsId, st);
  void (async () => {
    try {
      const target = state.current === "platform" ? null : state.stores[state.current];
      const { storagePutPlatform, storageBackend, storageDeletePlatform } = await import("../storage");
      const folder = !target && storageBackend() === "drive" ? await platformDriveFolder(wsId) : undefined;
      for (const row of rows) {
        try {
          const src = await openFile(row);
          if (src.kind !== "stream") { st.failed++; continue; }
          const chunks: Buffer[] = [];
          for await (const c of src.body as any) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
          const body = Buffer.concat(chunks);
          const key = `ws${wsId}/moved/${row.name}`;
          let backend: string, ref: string;
          if (target) { const p = await ownPut(target, hashed(key), body, row.mime || "application/octet-stream", !!row.isPublic); backend = p.backend; ref = p.ref; }
          else { const p = await storagePutPlatform(key, body, row.mime || "application/octet-stream", { public: !!row.isPublic, driveFolderId: folder }); backend = p.backend; ref = p.ref; }
          const old = { store: row.store, backend: row.backend, ref: row.ref };
          await db.update(files).set({ store: state.current, backend, ref }).where(and(eq(files.id, row.id), eq(files.workspaceId, wsId)));
          // the old copy, now that the record points at the new one
          if (old.store === "platform") await storageDeletePlatform(old.backend, old.ref);
          else { const os = state.stores[old.store]; if (os) await ownDelete(os, old.ref); }
          st.moved++;
        } catch (e) {
          st.failed++;
          console.error(`[files] move failed for file ${row.id} (workspace ${wsId}):`, String((e as Error)?.message || e).slice(0, 200));
        }
      }
    } catch (e) {
      st.error = String((e as Error)?.message || e).slice(0, 300);
      console.error(`[files] move job failed for workspace ${wsId}:`, e);
    } finally {
      st.running = false; st.finishedAt = new Date().toISOString();
    }
  })();
  return { started: true, total: rows.length };
}

/** Before a workspace is purged: delete its stored objects (best effort). */
export async function purgeWorkspaceFiles(wsId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const state = await readStorage(wsId);
  const rows: any[] = await db.select().from(files).where(eq(files.workspaceId, Number(wsId)));
  const { storageDeletePlatform } = await import("../storage");
  let n = 0;
  for (const row of rows) {
    try {
      // Files in the workspace's OWN bucket / Drive are theirs: left in place.
      if (row.store === "platform" && (await storageDeletePlatform(row.backend, row.ref))) n++;
    } catch { /* best effort */ }
  }
  try { await deleteWorkspaceSetting(wsId, "platformDriveFolder"); } catch { /* fine */ }
  void state;
  return n;
}
