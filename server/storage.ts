// Storage helpers — supports two backends:
//
//   1. Direct S3-compatible upload (AWS S3 / Cloudflare R2 / Backblaze B2 /
//      Wasabi / MinIO) when S3_BUCKET + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY
//      are set in the env. Returns the public URL — bucket needs public read
//      OR a CDN/custom domain configured via S3_PUBLIC_URL_BASE.
//
//   2. Manus Forge presigned-URL flow (legacy) — used when Forge env vars
//      are set and S3 isn't. Returns /manus-storage/{key} which the
//      storageProxy redirects to a signed Forge URL.
//
// Preference order: S3 → Forge → throw (caller handles via data-URI fallback).
//
// Downloads (storageGet) return the same URL the upload produced.

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
  if (hasForgeConfig()) return storagePutForge(relKey, data, contentType);
  throw new Error(
    "Storage not configured: set S3_BUCKET + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY (recommended) or BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY (legacy).",
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
