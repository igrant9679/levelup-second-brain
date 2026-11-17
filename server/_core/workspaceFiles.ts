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
import { and, asc, eq, gt, ne, sql } from "drizzle-orm";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getDb } from "../db";
import { files, workspaces, workspaceSettings } from "../../drizzle/schema";
import { isShuttingDown, job } from "./lifecycle";
import { ENV } from "./env";
import { assertPublicUrl } from "./netGuard";
import { CHUNK, driveStreamUpload, fetchBodyStream, s3PutStream } from "./streamUpload";
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
/** Like ownPut, from a stream: sent in pieces, never held whole in memory (build -285). */
export async function ownPutStream(st: OwnStore, key: string, src: NodeJS.ReadableStream | AsyncIterable<any>, contentType: string, isPublic = false, length?: number): Promise<{ backend: "s3" | "drive"; ref: string }> {
  if (st.mode === "s3") {
    const k = s3Key(st, key);
    await s3PutStream(s3For(st), st.bucket, k, src, contentType);
    return { backend: "s3", ref: k };
  }
  const { DRIVE_MULTIPART_LIMIT } = await import("../storage");
  const token = await driveToken(st.refreshToken);
  const id = await driveStreamUpload(token, { name: key.split("/").pop() || key, parents: [st.folderId], mimeType: contentType }, src, contentType, length, CHUNK, DRIVE_MULTIPART_LIMIT);
  if (isPublic) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ role: "reader", type: "anyone" }) }).catch(() => null);
  }
  return { backend: "drive", ref: id };
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
  // a limit on the answer and on stalls, not on the whole download (big files took longer than 60 s)
  const { resp, body } = await fetchBodyStream(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ref)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.status === 404) { body?.destroy(); return { kind: "missing" }; }
  if (!resp.ok || !body) { body?.destroy(); throw new Error(`Drive download failed (${resp.status})`); }
  return { kind: "stream", body, length: Number(resp.headers.get("content-length") || 0) || undefined };
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
// A stored, resumable JOB (build -283), not a loop started by a request. The
// request only QUEUES it (workspace_settings "fileMove"). The "file-moves"
// background job (startFileMoveJob: one instance at a time, see lifecycle.job)
// works through it in slices of at most SLICE_MS, a page of rows at a time,
// and stores its progress as it goes. A deploy or a restart in the middle
// loses nothing: the next pass carries on after the last file it handled.
export type MoveJob = {
  status: "queued" | "running" | "done" | "cancelled" | "failed";
  /** the store the files are being moved INTO */
  target: string;
  total: number; moved: number; failed: number;
  /** id of the last file handled; the next slice starts after it */
  cursor: number;
  queuedAt: string; startedAt?: string; updatedAt?: string; finishedAt?: string;
  error?: string; by?: number | null;
};
/** The storage calls a move makes. Tests pass their own; production uses realIo. */
export type MoveIo = {
  folder(wsId: number, state: StorageState): Promise<string | undefined>;
  open(row: any): Promise<StoredFile>;
  put(wsId: number, state: StorageState, row: any, body: Buffer, folder?: string): Promise<{ backend: string; ref: string }>;
  /** the same from a stream, in pieces (build -285); when absent the file is read whole and put */
  putStream?(wsId: number, state: StorageState, row: any, body: NodeJS.ReadableStream | AsyncIterable<any>, length: number | undefined, folder?: string): Promise<{ backend: string; ref: string }>;
  remove(state: StorageState, old: { store: string; backend: string; ref: string }): Promise<void>;
};
const MOVE_KEY = "fileMove";
const SLICE_MS = 45_000;
const PAGE = 20;

async function readMove(wsId: number): Promise<MoveJob | null> {
  const raw = await getWorkspaceSetting(wsId, MOVE_KEY);
  if (!raw) return null;
  try { const j = JSON.parse(raw); return j && typeof j === "object" && typeof j.status === "string" ? (j as MoveJob) : null; } catch { return null; }
}
async function writeMove(wsId: number, j: MoveJob): Promise<void> {
  j.updatedAt = new Date().toISOString();
  await setWorkspaceSetting(wsId, MOVE_KEY, JSON.stringify(j));
}
const moveActive = (j: MoveJob | null | undefined): boolean => !!j && (j.status === "queued" || j.status === "running");
/** Store the progress, unless the move was cancelled meanwhile (then it stays cancelled, with the counts so far). */
async function saveProgress(wsId: number, j: MoveJob): Promise<boolean> {
  const stored = await readMove(wsId);
  const cancelled = !!stored && stored.status === "cancelled";
  if (cancelled) { j.status = "cancelled"; j.finishedAt = stored!.finishedAt || new Date().toISOString(); }
  await writeMove(wsId, j);
  return cancelled;
}

/** What Settings → Storage shows. `running` is true while the move is waiting or under way. */
export async function moveStatus(wsId: number) {
  const j = await readMove(wsId);
  if (!j) return null;
  return { status: j.status, running: moveActive(j), total: j.total, moved: j.moved, failed: j.failed, error: j.error, queuedAt: j.queuedAt, finishedAt: j.finishedAt };
}

/** How many of the workspace's files are NOT in its current store. */
export async function filesElsewhere(wsId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const state = await readStorage(wsId);
  const rows: any[] = await db.select({ n: sql<number>`count(*)` }).from(files).where(and(eq(files.workspaceId, wsId), ne(files.store, state.current)));
  return Number(rows[0]?.n) || 0;
}

/**
 * Queue the move of every file that is not in the workspace's current store.
 * Links don't change (they name the record, not the provider). Each file is
 * copied, its record pointed at the copy, and only then is the old one removed.
 */
export async function moveFiles(wsId: number, by?: number | null): Promise<{ started: boolean; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const cur = await readMove(wsId);
  if (moveActive(cur)) return { started: false, total: cur!.total };
  const total = await filesElsewhere(wsId);
  if (!total) return { started: false, total: 0 };
  const state = await readStorage(wsId);
  await writeMove(wsId, { status: "queued", target: state.current, total, moved: 0, failed: 0, cursor: 0, queuedAt: new Date().toISOString(), by: by ?? null });
  kickFileMoves();
  return { started: true, total };
}

/** Stop a waiting or running move after the file in hand. Files already moved stay moved. */
export async function cancelMove(wsId: number): Promise<boolean> {
  const j = await readMove(wsId);
  if (!moveActive(j)) return false;
  j!.status = "cancelled"; j!.finishedAt = new Date().toISOString();
  await writeMove(wsId, j!);
  return true;
}

const realIo: MoveIo = {
  async folder(wsId, state) {
    if (state.current !== "platform") return undefined;
    const { storageBackend } = await import("../storage");
    return storageBackend() === "drive" ? await platformDriveFolder(wsId) : undefined;
  },
  open: (row) => openFile(row),
  async putStream(wsId, state, row, body, length, folder) {
    const key = `ws${wsId}/moved/${row.name}`;
    const mime = row.mime || "application/octet-stream";
    const target = state.current === "platform" ? null : state.stores[state.current];
    if (state.current !== "platform" && !target) throw new Error("the storage to move into no longer exists");
    if (target) return ownPutStream(target, hashed(key), body, mime, !!row.isPublic, length);
    const { storagePutPlatformStream } = await import("../storage");
    const p = await storagePutPlatformStream(key, body, mime, { public: !!row.isPublic, driveFolderId: folder, length });
    return { backend: p.backend, ref: p.ref };
  },
  async put(wsId, state, row, body, folder) {
    const key = `ws${wsId}/moved/${row.name}`;
    const mime = row.mime || "application/octet-stream";
    const target = state.current === "platform" ? null : state.stores[state.current];
    if (state.current !== "platform" && !target) throw new Error("the storage to move into no longer exists");
    if (target) { const p = await ownPut(target, hashed(key), body, mime, !!row.isPublic); return { backend: p.backend, ref: p.ref }; }
    const { storagePutPlatform } = await import("../storage");
    const p = await storagePutPlatform(key, body, mime, { public: !!row.isPublic, driveFolderId: folder });
    return { backend: p.backend, ref: p.ref };
  },
  async remove(state, old) {
    if (old.store === "platform") { const { storageDeletePlatform } = await import("../storage"); await storageDeletePlatform(old.backend, old.ref); return; }
    const os = state.stores[old.store];
    if (os) await ownDelete(os, old.ref);
  },
};

async function moveOne(db: any, wsId: number, state: StorageState, row: any, io: MoveIo, folder?: string): Promise<void> {
  let src = await io.open(row);
  if (src.kind === "redirect") {
    // legacy platform storage hands out a signed link to its own bucket: read it from there
    const { fetchBodyStream } = await import("./streamUpload");
    const { resp, body } = await fetchBodyStream(src.url, {});
    if (!resp.ok || !body) { body?.destroy(); throw new Error(`the stored copy could not be read (${resp.status})`); }
    src = { kind: "stream", body, length: Number(resp.headers.get("content-length") || 0) || undefined };
  }
  if (src.kind !== "stream") throw new Error("the stored copy could not be opened");
  let put: { backend: string; ref: string };
  if (io.putStream) {
    // build -285: straight from the old storage into the new one, a piece at a time
    try { put = await io.putStream(wsId, state, row, src.body, src.length, folder); }
    finally { try { (src.body as any).destroy?.(); } catch { /* already finished */ } }
  } else {
    const chunks: Buffer[] = [];
    for await (const c of src.body as any) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    put = await io.put(wsId, state, row, Buffer.concat(chunks), folder);
  }
  const old = { store: String(row.store), backend: String(row.backend), ref: String(row.ref) };
  await db.update(files).set({ store: state.current, backend: put.backend, ref: put.ref }).where(and(eq(files.id, row.id), eq(files.workspaceId, wsId)));
  // The record points at the new copy now. A leftover old copy is only wasted space.
  try { await io.remove(state, old); }
  catch (e) { console.warn(`[files] moved file ${row.id} (workspace ${wsId}); its old copy could not be removed:`, String((e as Error)?.message || e).slice(0, 200)); }
}

/**
 * Work on one workspace's move until it is finished or cancelled, the slice's
 * time is up, or the server is stopping. Returns the job as stored.
 */
export async function runMoveSlice(wsId: number, opts: { io?: MoveIo; deadline?: number; stop?: () => boolean } = {}): Promise<MoveJob | null> {
  const db: any = await getDb();
  if (!db) return null;
  const j = await readMove(wsId);
  if (!j || !moveActive(j)) return j;
  const io = opts.io || realIo;
  const deadline = opts.deadline ?? Date.now() + SLICE_MS;
  const stop = opts.stop || isShuttingDown;
  try {
    const state = await readStorage(wsId);
    if (state.current !== j.target) {
      // the storage was changed while the move waited: move into the new one, from the start
      j.target = state.current; j.cursor = 0; j.total = j.moved + (await filesElsewhere(wsId));
    }
    if (j.status === "queued") { j.status = "running"; j.startedAt = new Date().toISOString(); }
    if (await saveProgress(wsId, j)) return j;
    const folder = await io.folder(wsId, state);
    let sinceSave = 0, halted = false;
    while (!halted) {
      const rows: any[] = await db.select().from(files)
        .where(and(eq(files.workspaceId, wsId), ne(files.store, state.current), gt(files.id, j.cursor)))
        .orderBy(asc(files.id)).limit(PAGE);
      if (!rows.length) { j.status = "done"; j.finishedAt = new Date().toISOString(); break; }
      for (const row of rows) {
        if (stop() || Date.now() > deadline) { halted = true; break; }
        const stored = await readMove(wsId);
        if (!stored || stored.status === "cancelled") { halted = true; break; }
        try { await moveOne(db, wsId, state, row, io, folder); j.moved++; }
        catch (e) {
          j.failed++;
          console.error(`[files] move failed for file ${row.id} (workspace ${wsId}):`, String((e as Error)?.message || e).slice(0, 200));
        }
        j.cursor = Number(row.id);
        if (++sinceSave >= 5) { sinceSave = 0; if (await saveProgress(wsId, j)) { halted = true; break; } }
      }
    }
    await saveProgress(wsId, j);
  } catch (e) {
    j.status = "failed"; j.error = String((e as Error)?.message || e).slice(0, 300); j.finishedAt = new Date().toISOString();
    console.error(`[files] move job failed for workspace ${wsId}:`, e);
    try { await writeMove(wsId, j); } catch { /* the next pass sees it as still running and tries again */ }
  }
  return j;
}

/** One pass of the background job: each workspace with a move waiting or under way gets a slice. Returns how many are still unfinished. */
export async function processFileMoves(opts: { io?: MoveIo; sliceMs?: number } = {}): Promise<number> {
  const db: any = await getDb();
  if (!db) return 0;
  // tenancy: background — which workspaces have a file move stored (each is then handled inside its own workspace)
  const rows: any[] = await db.select({ w: workspaceSettings.workspaceId, value: workspaceSettings.value }).from(workspaceSettings).where(eq(workspaceSettings.key, MOVE_KEY));
  let left = 0;
  for (const r of rows) {
    if (isShuttingDown()) break;
    let stored: MoveJob | null = null;
    try { stored = JSON.parse(String(r.value)); } catch { stored = null; }
    if (!moveActive(stored)) continue;
    const ws: any = await getWorkspace(Number(r.w));
    if (!ws || ws.deletedAt) continue;                       // closed: its files go with it
    const after = await runMoveSlice(Number(r.w), { io: opts.io, deadline: Date.now() + (opts.sliceMs ?? SLICE_MS) });
    if (moveActive(after)) left++;
  }
  return left;
}

/** Run a pass now (after a move is queued, and again while work is left). Never throws. */
export function kickFileMoves(): void {
  void job("file-moves", () => processFileMoves())
    .then((left) => { if (left && !isShuttingDown()) setTimeout(kickFileMoves, 500).unref?.(); })
    .catch((e) => console.error("[files] move pass failed:", e));
}
/** Started once at boot: picks up moves that were waiting or cut short by a restart. */
export function startFileMoveJob(): void {
  setTimeout(kickFileMoves, 45_000).unref?.();
  setInterval(kickFileMoves, 60_000).unref?.();
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
