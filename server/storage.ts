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

import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { ENV } from "./_core/env";

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
  return !!(
    ENV.googleDriveClientId &&
    ENV.googleDriveClientSecret &&
    ENV.googleDriveRefreshToken &&
    ENV.googleDriveFolderId
  );
}

// Cache the minted access token until ~5 min before expiry.
let _driveTokenCache: { token: string; expiresAt: number } | null = null;
async function getDriveAccessToken(): Promise<string> {
  if (_driveTokenCache && _driveTokenCache.expiresAt > Date.now() + 5 * 60 * 1000) {
    return _driveTokenCache.token;
  }
  const params = new URLSearchParams({
    client_id: ENV.googleDriveClientId,
    client_secret: ENV.googleDriveClientSecret,
    refresh_token: ENV.googleDriveRefreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
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
const DRIVE_MULTIPART_LIMIT = 4 * 1024 * 1024;

async function driveMultipartUpload(
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
async function driveResumableUpload(
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

async function storagePutDrive(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
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
    parents: [ENV.googleDriveFolderId],
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
    console.warn(`[storage:drive] permission share failed (${permResp.status}): ${msg}`);
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
  return { key, url };
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
): Promise<{ key: string; url: string }> {
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
  return { key, url: publicUrlForKey(key) };
}

async function storagePutForge(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
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

  return { key, url: `/manus-storage/${key}` };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  if (hasS3Config()) return storagePutS3(relKey, data, contentType);
  if (hasDriveConfig()) return storagePutDrive(relKey, data, contentType);
  if (hasForgeConfig()) return storagePutForge(relKey, data, contentType);
  throw new Error(
    "Storage not configured: set S3_BUCKET + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY (S3-compatible), or GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET + GOOGLE_DRIVE_REFRESH_TOKEN + GOOGLE_DRIVE_FOLDER_ID (Drive), or BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY (legacy).",
  );
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
