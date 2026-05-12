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
  // Google Drive storage (alternative to S3). Uses a long-lived OAuth refresh
  // token to mint access tokens server-side, then uploads via Drive v3 REST.
  // To generate a refresh token:
  //   1. Create an OAuth client in Google Cloud Console (Web app type)
  //   2. Add https://developers.google.com/oauthplayground as redirect URI
  //   3. In OAuth Playground, click ⚙ → "Use your own OAuth credentials",
  //      paste client id + secret. Authorise scope
  //      https://www.googleapis.com/auth/drive.file
  //   4. Exchange the auth code for tokens — copy the refresh token
  // GOOGLE_DRIVE_FOLDER_ID is the Drive folder uploads land in (must be
  // writable by the account that owns the refresh token). Files are then
  // shared with "anyone with the link" so the public uc?id= URL works as
  // an <img src> / download link.
  googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
  googleDriveClientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
  googleDriveRefreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN ?? "",
  googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID ?? "",
};
