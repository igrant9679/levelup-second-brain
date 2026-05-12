export const ENV = {
  appId: process.env.VITE_APP_ID ?? "levelup",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID ?? "",
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
  // S3-compatible object storage (AWS S3, Cloudflare R2, Backblaze B2,
  // Wasabi, MinIO, etc.). Used by server/storage.ts for any file uploads
  // (note images, Word-doc embedded images / attachments, user avatars,
  // image-generation outputs, etc.) when set. Falls back to the Manus
  // Forge presign flow when both are configured; falls back to a data
  // URI when neither is configured.
  //
  // Required to enable: S3_BUCKET + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY.
  // S3_ENDPOINT is optional and only needed for non-AWS providers (e.g.
  // https://<account>.r2.cloudflarestorage.com for Cloudflare R2).
  // S3_REGION defaults to "us-east-1" (or "auto" for R2).
  // S3_PUBLIC_URL_BASE is where uploaded files are publicly served — leave
  // blank to auto-derive from the bucket + region (AWS S3 path style).
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3Region: process.env.S3_REGION ?? "us-east-1",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3PublicUrlBase: process.env.S3_PUBLIC_URL_BASE ?? "",
  s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
};
