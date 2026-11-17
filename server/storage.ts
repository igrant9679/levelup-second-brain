// Storage helpers — supports three backends:
//
//   1. Direct S3-compatible upload (AWS S3 / Cloudflare R2 / Backblaze B2 /
//      Wasabi / MinIO) when S3_BUCKET + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY
//      are set. Returns the public URL — bucket needs public read OR a
//      CDN/custom domain configured via S3_PUBLIC_URL_BASE.
//
//   2. Google Drive (refresh-token auth) when GOOGLE_DRIVE_CLIENT_ID +
//      GOOGLE_DRIVE_CLIENT_SECRET + GOOGLE_DRIVE_REFRESH_TOKEN +
//      GOOGLE_DRIVE_FOLDER_ID are set. Uploads to the configured folder,
//      shares "anyone with the link", and returns a thumbnail?id= URL for
//      images (the only Drive URL form that still renders inline in an
//      <img> tag) or a uc?export=download URL for other file types.
//
//   3. Manus Forge presigned-URL flow (legacy).
//
// Preference order: S3 → Drive → Forge → throw (caller handles via data-URI
// fallback).
//
// Audit F35: uploads are PRIVATE by default now. Drive files get no "anyone
// with the link" permission, and storagePut returns an app URL
// /api/files/<ref> served by server/_core/fileProxy.ts to signed-in users only
// (safe Content-Type from an allow-list, nosniff, attachment unless image/pdf).
// URLs stored before this change keep working untouched. Callers that need a
// URL a third party can open pass { public: true } — today only the imported
// ORIGINAL documents (note-originals/), which the note editor shows through
// Google's Drive previewer / Microsoft's Office viewer (they fetch the file
// themselves, without the user's cookie).

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { ENV } from "./_core/env";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { externalSourceCredentials } from "../drizzle/schema";

// Source key of the app-wide Google Drive storage token when it was minted
// in-app (Settings → Sync → Reconnect Google Drive, build -191). A DB token
// always wins over GOOGLE_DRIVE_REFRESH_TOKEN so a dead env token can be
// replaced without touching Railway.
export const DRIVE_STORAGE_SOURCE = "drive-storage";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function hasS3Config(): boolean {
  return !!(ENV.s3Bucket && ENV.s3AccessKeyId && ENV.s3SecretAccessKey);
}

function hasForgeConfig(): boolean {
  return !!(ENV.forgeApiUrl && ENV.forgeApiKey);
}

function hasDriveConfig(): boolean {
  // The refresh token itself may live in the DB (in-app reconnect) instead
  // of the env — only the client pair + folder must be configured here.
  return !!(
    ENV.googleDriveClientId &&
    ENV.googleDriveClientSecret &&
    ENV.googleDriveFolderId
  );
}

let _driveRefreshCache: { token: string; at: number } | null = null;
/** Drop cached Drive tokens — called after a reconnect stores a new refresh token. */
export function resetDriveTokenCache(): void {
  _driveTokenCache = null;
  _driveRefreshCache = null;
}
// Test seam: lets a unit test supply the DB lookup without a database.
let _driveRefreshLookupOverride: (() => Promise<string | null>) | null = null;
export function _setDriveRefreshLookupForTests(fn: (() => Promise<string | null>) | null): void { _driveRefreshLookupOverride = fn; }
async function resolveDriveRefreshToken(): Promise<string> {
  if (_driveRefreshCache && Date.now() - _driveRefreshCache.at < 5 * 60 * 1000) return _driveRefreshCache.token;
  let token = "";
  if (_driveRefreshLookupOverride) token = (await _driveRefreshLookupOverride()) || "";
  else try {
    const db = await getDb();
    if (db) {
      // The platform's file store is the platform OPERATOR's connection only
      // (-278): a "drive-storage" row saved under anybody else is ignored.
      const { operatorMemberIds } = await import("./_core/workspace");
      const ops = await operatorMemberIds();
      if (ops.length) {
        const [row] = await db
          .select({ refreshToken: externalSourceCredentials.refreshToken })
          .from(externalSourceCredentials)
          .where(and(eq(externalSourceCredentials.source, DRIVE_STORAGE_SOURCE), inArray(externalSourceCredentials.userId, ops)))
          .orderBy(desc(externalSourceCredentials.updatedAt))
          .limit(1);
        if (row && row.refreshToken) token = String(row.refreshToken).trim();
      }
    }
  } catch (e) {
    console.warn("[storage:drive] refresh-token lookup failed — using env token:", e);
  }
  if (!token) token = ENV.googleDriveRefreshToken;
  _driveRefreshCache = { token, at: Date.now() };
  return token;
}

// Cache the minted access token until ~5 min before expiry.
let _driveTokenCache: { token: string; expiresAt: number } | null = null;
export async function getDriveAccessToken(): Promise<string> {
  if (_driveTokenCache && _driveTokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
    return _driveTokenCache.token;
  }
  const refreshToken = await resolveDriveRefreshToken();
  if (!refreshToken) {
    throw new Error("No Google Drive refresh token — open Settings → Sync → Reconnect Google Drive (or set GOOGLE_DRIVE_REFRESH_TOKEN).");
  }
  const params = new URLSearchParams({
    client_id: ENV.googleDriveClientId,
    client_secret: ENV.googleDriveClientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    _driveRefreshCache = null; // a reconnect may already have stored a fresh token
    throw new Error(`Google Drive token refresh failed (${resp.status}): ${msg}`);
  }
  const data = (await resp.json()) as { access_token: string; expires_in: number };
  _driveTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

// Drive rejects multipart bodies above ~5 MB; stay comfortably under it.
export const DRIVE_MULTIPART_LIMIT = 4 * 1024 * 1024;

export async function driveMultipartUpload(
  token: string,
  metadata: Record<string, unknown>,
  body: Buffer,
  contentType: string,
): Promise<string> {
  // Multipart upload: metadata + media in one POST
  const boundary = "lvl_" + crypto.randomUUID().replace(/-/g, "");
  const head =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const multipart = Buffer.concat([
    Buffer.from(head, "utf-8"),
    body,
    Buffer.from(tail, "utf-8"),
  ]);
  const uploadResp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipart as any,
    },
  );
  if (!uploadResp.ok) {
    const msg = await uploadResp.text().catch(() => uploadResp.statusText);
    throw new Error(`Drive upload failed (${uploadResp.status}): ${msg}`);
  }
  const { id } = (await uploadResp.json()) as { id?: string };
  return id ?? "";
}

// Resumable upload: open a session with the metadata, then PUT the bytes
// in one request (Drive accepts the whole body at once; chunking is only
// needed to survive flaky links, and Railway → Google is not one).
export async function driveResumableUpload(
  token: string,
  metadata: Record<string, unknown>,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const openResp = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType,
        "X-Upload-Content-Length": String(body.length),
      },
      body: JSON.stringify(metadata),
    },
  );
  if (!openResp.ok) {
    const msg = await openResp.text().catch(() => openResp.statusText);
    throw new Error(`Drive resumable session failed (${openResp.status}): ${msg}`);
  }
  const sessionUrl = openResp.headers.get("location");
  if (!sessionUrl) throw new Error("Drive resumable session returned no Location header");
  const putResp = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.length),
    },
    body: body as any,
  });
  if (!putResp.ok) {
    const msg = await putResp.text().catch(() => putResp.statusText);
    throw new Error(`Drive resumable upload failed (${putResp.status}): ${msg}`);
  }
  const { id } = (await putResp.json()) as { id?: string };
  return id ?? "";
}

/** App URL of a private stored file (served by fileProxy.ts to signed-in users). */
function proxyUrl(kind: "d" | "s" | "f", id: string, name?: string): string {
  const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");
  return kind === "d" ? `/api/files/d/${encodeURIComponent(id)}/${encodeURIComponent(name || "file")}` : `/api/files/${kind}/${enc(id)}`;
}

/** What a put returns: the app/provider URL plus where the bytes went (for the files record). */
export type PutResult = { key: string; url: string; backend: "drive" | "s3" | "forge"; ref: string };

async function storagePutDrive(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
  isPublic = false,
  folderId?: string,
): Promise<PutResult> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const filename = key.split("/").pop() ?? key;
  const body =
    typeof data === "string"
      ? Buffer.from(data, "utf-8")
      : data instanceof Buffer
        ? data
        : Buffer.from(data);
  const token = await getDriveAccessToken();
  const metadata = {
    name: filename,
    parents: [folderId || ENV.googleDriveFolderId],
    mimeType: contentType,
  };

  // Drive's multipart upload is documented for files up to 5 MB — larger
  // bodies (a Word doc with photos, a scanned PDF) must use the resumable
  // protocol, otherwise the upload fails and note originals silently go
  // missing (build -189). Both paths return the new file id.
  const fileId =
    body.length > DRIVE_MULTIPART_LIMIT
      ? await driveResumableUpload(token, metadata, body, contentType)
      : await driveMultipartUpload(token, metadata, body, contentType);
  if (!fileId) throw new Error("Drive upload returned empty file id");
  return driveFinish(token, key, filename, fileId, contentType, isPublic);
}

/** After a Drive upload: share it if it is public, and the URL to give out. */
async function driveFinish(token: string, key: string, filename: string, fileId: string, contentType: string, isPublic: boolean): Promise<PutResult> {
  // Private (default since audit F35): no public permission; served through
  // the signed-in proxy.
  if (!isPublic) return { key, url: proxyUrl("d", fileId, filename), backend: "drive", ref: fileId };

  // Share "anyone with the link can view" so the public uc URL works.
  const permResp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    },
  );
  if (!permResp.ok) {
    const msg = await permResp.text().catch(() => permResp.statusText);
    // console.error → the error log (audit F74): a public file that isn't
    // shared shows as a broken image / viewer for everyone.
    console.error(`[storage:drive] permission share failed (${permResp.status}): ${String(msg).slice(0, 300)}`);
    // Don't throw — file is uploaded; user can fix sharing manually if needed.
  }

  // Google restricted the `uc?export=view` endpoint — it no longer serves
  // image bytes to an <img> tag (it returns an HTML interstitial), which
  // silently broke every inline image. The `thumbnail` endpoint still serves
  // real image bytes for "anyone with the link" files and is the reliable
  // embed URL. Non-image files keep a direct-download URL for <a href> links.
  const isImage = contentType.toLowerCase().startsWith("image/");
  const url = isImage
    ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`
    : `https://drive.google.com/uc?export=download&id=${fileId}`;
  return { key, url, backend: "drive", ref: fileId };
}

/** A folder inside the platform's Drive folder (one per workspace). Returns its id. */
export async function platformDriveCreateFolder(name: string): Promise<string> {
  const token = await getDriveAccessToken();
  const resp = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.slice(0, 120), mimeType: "application/vnd.google-apps.folder", parents: [ENV.googleDriveFolderId] }),
  });
  if (!resp.ok) throw new Error(`Drive folder create failed (${resp.status}): ${(await resp.text().catch(() => "")).slice(0, 200)}`);
  const { id } = (await resp.json()) as { id?: string };
  if (!id) throw new Error("Drive folder create returned no id");
  return id;
}

/** Remove a stored object from the PLATFORM store (workspace purge). Best effort. */
export async function storageDeletePlatform(backend: string, ref: string): Promise<boolean> {
  try {
    if (backend === "drive") {
      if (!hasDriveConfig()) return false;
      const token = await getDriveAccessToken();
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ref)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      return r.ok || r.status === 404;
    }
    if (backend === "s3") {
      if (!hasS3Config()) return false;
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await getS3Client().send(new DeleteObjectCommand({ Bucket: ENV.s3Bucket, Key: normalizeKey(ref) }));
      return true;
    }
  } catch (e) { console.warn("[storage] delete failed:", String((e as Error)?.message || e).slice(0, 200)); }
  return false;
}

let _s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (_s3Client) return _s3Client;
  const config: ConstructorParameters<typeof S3Client>[0] = {
    region: ENV.s3Region || "us-east-1",
    credentials: {
      accessKeyId: ENV.s3AccessKeyId,
      secretAccessKey: ENV.s3SecretAccessKey,
    },
  };
  if (ENV.s3Endpoint) config.endpoint = ENV.s3Endpoint;
  if (ENV.s3ForcePathStyle) config.forcePathStyle = true;
  _s3Client = new S3Client(config);
  return _s3Client;
}

/**
 * Build the public URL for a stored object. Honors S3_PUBLIC_URL_BASE if set
 * (CDN / custom domain / R2 public bucket URL). Otherwise auto-derives from
 * bucket + region in AWS S3 virtual-host style.
 */
function publicUrlForKey(key: string): string {
  if (ENV.s3PublicUrlBase) {
    return `${ENV.s3PublicUrlBase.replace(/\/+$/, "")}/${key}`;
  }
  const region = ENV.s3Region || "us-east-1";
  // AWS S3 virtual-host style
  return `https://${ENV.s3Bucket}.s3.${region}.amazonaws.com/${key}`;
}

async function storagePutS3(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
  isPublic = false,
): Promise<PutResult> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const body =
    typeof data === "string"
      ? Buffer.from(data, "utf-8")
      : data instanceof Buffer
        ? data
        : Buffer.from(data);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: ENV.s3Bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, url: isPublic ? publicUrlForKey(key) : proxyUrl("s", key), backend: "s3", ref: key };
}

async function storagePutForge(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
  isPublic = false,
): Promise<PutResult> {
  const forgeUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
  const forgeKey = ENV.forgeApiKey;
  const key = appendHashSuffix(normalizeKey(relKey));

  // 1. Get presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  // 2. PUT file directly to S3 via the presigned URL
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: isPublic ? `/manus-storage/${key}` : proxyUrl("f", key), backend: "forge", ref: key };
}

/**
 * Store a file.
 *
 * MULTI-WORKSPACE (-278): an upload made by a signed-in member goes to THAT
 * WORKSPACE's storage — LevelUp's (a folder / prefix per workspace) or the
 * workspace's own S3 bucket or Google Drive — is recorded in the `files`
 * table, and comes back as /api/files/x/<id>/<name>, which only members of
 * that workspace can open (server/_core/workspaceFiles.ts). Who the member is
 * comes from memberContext.ts (every signed-in request sets it). With no
 * member (backups, the storage self-test) it is the platform store, as before.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
  opts: { public?: boolean } = {},
): Promise<{ key: string; url: string }> {
  const { currentMemberId, currentWorkspaceId } = await import("./_core/memberContext");
  const userId = currentMemberId();
  const wsId = userId ? await currentWorkspaceId() : undefined;
  if (userId && wsId) {
    const { putForMember } = await import("./_core/workspaceFiles");
    return putForMember({ wsId, userId }, relKey, data, contentType, opts);
  }
  return storagePutPlatform(relKey, data, contentType, opts);
}

/** The PLATFORM store (LevelUp's own S3 / Drive / legacy Forge), chosen by env. */
export async function storagePutPlatform(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
  opts: { public?: boolean; driveFolderId?: string } = {},
): Promise<PutResult> {
  const pub = opts.public === true;
  if (hasS3Config()) return storagePutS3(relKey, data, contentType, pub);
  if (hasDriveConfig()) return storagePutDrive(relKey, data, contentType, pub, opts.driveFolderId);
  if (hasForgeConfig()) return storagePutForge(relKey, data, contentType, pub);
  throw new Error(
    "Storage not configured: set S3_BUCKET + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY (S3-compatible), or GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET + GOOGLE_DRIVE_REFRESH_TOKEN + GOOGLE_DRIVE_FOLDER_ID (Drive), or BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY (legacy).",
  );
}

/**
 * The PLATFORM store, from a stream (build -285: storage moves). The file is
 * sent in pieces (S3 multipart / Drive resumable chunks), never held whole in
 * memory. Legacy Forge storage has no piecewise upload: there it is read whole.
 */
export async function storagePutPlatformStream(
  relKey: string,
  src: NodeJS.ReadableStream | AsyncIterable<any>,
  contentType = "application/octet-stream",
  opts: { public?: boolean; driveFolderId?: string; length?: number } = {},
): Promise<PutResult> {
  const pub = opts.public === true;
  const su = await import("./_core/streamUpload");
  if (hasS3Config()) {
    const key = appendHashSuffix(normalizeKey(relKey));
    await su.s3PutStream(getS3Client(), ENV.s3Bucket, key, src, contentType);
    return { key, url: pub ? publicUrlForKey(key) : proxyUrl("s", key), backend: "s3", ref: key };
  }
  if (hasDriveConfig()) {
    const key = appendHashSuffix(normalizeKey(relKey));
    const filename = key.split("/").pop() ?? key;
    const token = await getDriveAccessToken();
    const fileId = await su.driveStreamUpload(token, { name: filename, parents: [opts.driveFolderId || ENV.googleDriveFolderId], mimeType: contentType }, src, contentType, opts.length, su.CHUNK, DRIVE_MULTIPART_LIMIT);
    return driveFinish(token, key, filename, fileId, contentType, pub);
  }
  const parts: Buffer[] = [];
  for await (const c of src as AsyncIterable<any>) parts.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return storagePutPlatform(relKey, Buffer.concat(parts), contentType, opts);
}

/**
 * Upload a file that must NOT be shared publicly (database backups). On Drive
 * it is created in the app folder without the "anyone with the link"
 * permission that storagePut adds; on S3 it is a normal object (callers
 * encrypt the content, so a public bucket can't expose it). Returns the key
 * and a provider id for the record.
 */
export async function storagePutPrivate(
  relKey: string,
  data: Buffer,
  contentType = "application/octet-stream",
): Promise<{ key: string; provider: "drive" | "s3"; id: string }> {
  if (hasS3Config()) {
    const key = appendHashSuffix(normalizeKey(relKey));
    await getS3Client().send(new PutObjectCommand({ Bucket: ENV.s3Bucket, Key: key, Body: data, ContentType: contentType }));
    return { key, provider: "s3", id: key };
  }
  if (hasDriveConfig()) {
    const key = appendHashSuffix(normalizeKey(relKey));
    const token = await getDriveAccessToken();
    const metadata = { name: key.split("/").pop() ?? key, parents: [ENV.googleDriveFolderId], mimeType: contentType };
    const fileId = data.length > DRIVE_MULTIPART_LIMIT
      ? await driveResumableUpload(token, metadata, data, contentType)
      : await driveMultipartUpload(token, metadata, data, contentType);
    if (!fileId) throw new Error("Drive upload returned empty file id");
    return { key, provider: "drive", id: fileId };
  }
  throw new Error("Private storage needs S3 or Google Drive to be configured.");
}

export type StoredFile =
  | { kind: "stream"; body: NodeJS.ReadableStream; length?: number }
  | { kind: "redirect"; url: string }
  | { kind: "missing" };

/**
 * Open a private stored file for the signed-in proxy (fileProxy.ts).
 * ref kinds: "d" = Google Drive file id, "s" = S3 object key, "f" = Forge key.
 */
export async function storageOpen(kind: "d" | "s" | "f", id: string): Promise<StoredFile> {
  if (kind === "d") {
    if (!hasDriveConfig()) return { kind: "missing" };
    const token = await getDriveAccessToken();
    // a limit on the answer and on stalls, not on the whole download (a big file took longer than 60 s and was cut off)
    const { fetchBodyStream } = await import("./_core/streamUpload");
    const { resp, body } = await fetchBodyStream(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 404) { body?.destroy(); return { kind: "missing" }; }
    if (!resp.ok || !body) { body?.destroy(); throw new Error(`Drive download failed (${resp.status})`); }
    const len = Number(resp.headers.get("content-length") || 0) || undefined;
    return { kind: "stream", body, length: len };
  }
  if (kind === "s") {
    if (!hasS3Config()) return { kind: "missing" };
    try {
      const out: any = await getS3Client().send(new GetObjectCommand({ Bucket: ENV.s3Bucket, Key: normalizeKey(id) }));
      return { kind: "stream", body: out.Body as NodeJS.ReadableStream, length: Number(out.ContentLength) || undefined };
    } catch (e: any) {
      if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) return { kind: "missing" };
      throw e;
    }
  }
  if (!hasForgeConfig()) return { kind: "missing" };
  return { kind: "redirect", url: await storageGetSignedUrl(id) };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  // When S3 is configured, return its public URL directly. When only Forge is
  // configured (legacy), return the proxy path that 307-redirects to a
  // presigned GET URL.
  if (hasS3Config()) return { key, url: publicUrlForKey(key) };
  return { key, url: `/manus-storage/${key}` };
}

/** Which storage backend is currently active (resolved the same way storagePut picks one). */
export function storageBackend(): "s3" | "drive" | "forge" | "none" {
  if (hasS3Config()) return "s3";
  if (hasDriveConfig()) return "drive";
  if (hasForgeConfig()) return "forge";
  return "none";
}

/**
 * Live end-to-end check: uploads a tiny text file via the active backend and
 * reports whether it succeeded. Proves the credentials actually work — not
 * just that the env vars are present (a typo'd refresh token passes the
 * presence check but fails here). The test file is a few bytes; for Google
 * Drive it lands in the configured folder and is safe to delete.
 */
export async function storageSelfTest(): Promise<{
  backend: "s3" | "drive" | "forge" | "none";
  ok: boolean;
  url?: string;
  error?: string;
}> {
  const backend = storageBackend();
  if (backend === "none") {
    return { backend, ok: false, error: "No storage backend configured." };
  }
  try {
    const { url } = await storagePut(
      `_healthcheck/storage-test-${Date.now()}.txt`,
      `LevelUp storage self-test ${new Date().toISOString()}`,
      "text/plain",
    );
    return { backend, ok: true, url };
  } catch (err) {
    return { backend, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Masked summary of the active backend's config, for the health-check page.
 * Shows value lengths + first/last 3 chars so truncation or stray whitespace
 * is visible without exposing full secrets.
 */
export function storageConfigSummary(): { label: string; value: string }[] {
  const backend = storageBackend();
  const mask = (s: string): string => {
    if (!s) return "(empty)";
    if (s.length <= 10) return `${s.length} chars`;
    return `${s.length} chars (${s.slice(0, 3)}…${s.slice(-3)})`;
  };
  if (backend === "drive") {
    return [
      { label: "Client ID", value: mask(ENV.googleDriveClientId) },
      { label: "Client secret", value: mask(ENV.googleDriveClientSecret) },
      { label: "Refresh token", value: mask(ENV.googleDriveRefreshToken) },
      { label: "Folder ID", value: ENV.googleDriveFolderId || "(empty)" },
    ];
  }
  if (backend === "s3") {
    return [
      { label: "Bucket", value: ENV.s3Bucket || "(empty)" },
      { label: "Region", value: ENV.s3Region || "(empty)" },
      { label: "Access key ID", value: mask(ENV.s3AccessKeyId) },
      { label: "Secret access key", value: mask(ENV.s3SecretAccessKey) },
      { label: "Endpoint", value: ENV.s3Endpoint || "(default AWS)" },
    ];
  }
  return [];
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  // S3 path: just return the public URL (works for public buckets / CDN /
  // custom domain). For private buckets we'd presign here — not implemented
  // yet because the only current callers want a direct browser-loadable URL.
  if (hasS3Config()) return publicUrlForKey(key);

  if (!hasForgeConfig()) throw new Error("Storage not configured for signed URLs");
  const forgeUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
  const forgeKey = ENV.forgeApiKey;

  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}
