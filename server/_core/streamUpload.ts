/**
 * Uploading a file of any size without holding all of it in memory (build -285).
 *
 * A storage move used to read each file into one Buffer before writing it to
 * the new storage. These helpers take a stream instead and send it in pieces
 * of CHUNK bytes, so at most about two pieces are in memory at a time:
 *
 *   S3      a multipart upload (each part ≥ 5 MB except the last), aborted if
 *           any part fails so no half-written object or stray parts are left.
 *   Drive   a resumable upload sent chunk by chunk (each a multiple of 256 KiB,
 *           `Content-Range: bytes a-b/<total or *>`; Drive answers 308 until the
 *           last one). A small file still goes in one request.
 *
 * Also `idleTimeout`: a download stream that stops delivering for a while is
 * ended with an error — instead of a fixed time limit for the whole file,
 * which cut off any big file part-way.
 */
import { Readable, PassThrough } from "stream";

/** 8 MiB: a multiple of Drive's 256 KiB and above S3's 5 MiB part minimum. */
export const CHUNK = 8 * 1024 * 1024;
const DRIVE_GRAIN = 256 * 1024;
const S3_MIN_PART = 5 * 1024 * 1024;

/** The stream in pieces of exactly `size` bytes (the last may be shorter). Never yields an empty piece. */
export async function* chunked(src: NodeJS.ReadableStream | AsyncIterable<any>, size = CHUNK): AsyncGenerator<Buffer> {
  let parts: Buffer[] = [];
  let have = 0;
  for await (const c of src as AsyncIterable<any>) {
    let b: Buffer = Buffer.isBuffer(c) ? c : typeof c === "string" ? Buffer.from(c) : Buffer.from(c);
    while (b.length) {
      const take = Math.min(size - have, b.length);
      parts.push(take === b.length ? b : b.subarray(0, take));
      have += take;
      b = b.subarray(take);
      if (have === size) { yield parts.length === 1 ? parts[0] : Buffer.concat(parts, have); parts = []; have = 0; }
    }
  }
  if (have) yield parts.length === 1 ? parts[0] : Buffer.concat(parts, have);
}

/**
 * Pieces with a look-ahead of one, so the caller knows which piece is the
 * last before sending it (Drive needs the total on the last chunk when the
 * size was not known up front).
 */
async function* withLast(it: AsyncGenerator<Buffer>): AsyncGenerator<{ buf: Buffer; last: boolean }> {
  let prev: Buffer | null = null;
  for await (const b of it) {
    if (prev) yield { buf: prev, last: false };
    prev = b;
  }
  if (prev) yield { buf: prev, last: true };
}

// ── S3 ─────────────────────────────────────────────────────────────────────
/** The part of an S3Client this needs (tests pass a fake). */
export type S3Like = { send(cmd: any): Promise<any> };

export async function s3PutStream(client: S3Like, bucket: string, key: string, src: NodeJS.ReadableStream | AsyncIterable<any>, contentType: string, chunk = CHUNK): Promise<{ size: number }> {
  const S = await import("@aws-sdk/client-s3");
  const size = Math.max(S3_MIN_PART, chunk);
  const pieces = withLast(chunked(src, size));
  const first = await pieces.next();
  // nothing, or one piece: a plain PUT
  if (first.done || first.value.last) {
    const body = first.done ? Buffer.alloc(0) : first.value.buf;
    await client.send(new S.PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.length }));
    return { size: body.length };
  }
  const created = await client.send(new S.CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType }));
  const uploadId = created?.UploadId;
  if (!uploadId) throw new Error("S3 did not start the upload");
  const done: { ETag: string; PartNumber: number }[] = [];
  let total = 0;
  try {
    let piece: { buf: Buffer; last: boolean } | undefined = first.value;
    while (piece) {
      const n = done.length + 1;
      const r = await client.send(new S.UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: n, Body: piece.buf, ContentLength: piece.buf.length }));
      if (!r?.ETag) throw new Error(`S3 did not confirm part ${n}`);
      done.push({ ETag: r.ETag, PartNumber: n });
      total += piece.buf.length;
      const nx = await pieces.next();
      piece = nx.done ? undefined : nx.value;
    }
    await client.send(new S.CompleteMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: done } }));
    return { size: total };
  } catch (e) {
    try { await client.send(new S.AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId })); } catch { /* the bucket's lifecycle rule (if any) cleans up */ }
    throw e;
  }
}

/**
 * Multipart uploads under `prefix` that were started more than `olderThanMs`
 * ago and never finished — left behind when the server was stopped in the
 * middle of a file (a deploy) — are aborted, so their parts stop costing
 * storage. Only keys under the given prefix are ever looked at. Returns how
 * many were aborted. (Drive needs nothing: an unfinished resumable session
 * holds no space and expires by itself.)
 */
export async function abortStaleUploads(client: S3Like, bucket: string, prefix: string, olderThanMs = 60 * 60_000, now = Date.now()): Promise<number> {
  const S = await import("@aws-sdk/client-s3");
  if (!prefix || prefix === "/") throw new Error("a prefix is required");
  let aborted = 0, keyMarker: string | undefined, idMarker: string | undefined;
  for (let page = 0; page < 20; page++) {
    const r: any = await client.send(new S.ListMultipartUploadsCommand({ Bucket: bucket, Prefix: prefix, KeyMarker: keyMarker, UploadIdMarker: idMarker, MaxUploads: 100 }));
    for (const u of (Array.isArray(r?.Uploads) ? r.Uploads : [])) {
      const key = String(u?.Key || ""), id = String(u?.UploadId || "");
      if (!key.startsWith(prefix) || !id) continue;               // never trust the listing beyond the prefix
      const started = u?.Initiated ? new Date(u.Initiated).getTime() : NaN;
      if (!Number.isFinite(started) || now - started < olderThanMs) continue;
      try { await client.send(new S.AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: id })); aborted++; }
      catch { /* gone already, or not ours to abort: leave it */ }
    }
    if (!r?.IsTruncated) break;
    keyMarker = r.NextKeyMarker; idMarker = r.NextUploadIdMarker;
    if (!keyMarker) break;
  }
  return aborted;
}

// ── Google Drive ───────────────────────────────────────────────────────────
/**
 * Upload to Drive from a stream. `length` (if known) is sent up front; without
 * it the total is given on the last chunk. Returns the new file's id.
 * Files that fit in one small piece use the one-request multipart upload.
 */
export async function driveStreamUpload(token: string, metadata: Record<string, unknown>, src: NodeJS.ReadableStream | AsyncIterable<any>, contentType: string, length?: number, chunk = CHUNK, multipartLimit = 4 * 1024 * 1024): Promise<string> {
  const size = Math.max(DRIVE_GRAIN, Math.floor(chunk / DRIVE_GRAIN) * DRIVE_GRAIN);
  const pieces = withLast(chunked(src, size));
  const first = await pieces.next();
  if (first.done || (first.value.last && first.value.buf.length <= multipartLimit)) {
    const { driveMultipartUpload } = await import("../storage");
    return driveMultipartUpload(token, metadata, first.done ? Buffer.alloc(0) : first.value.buf, contentType);
  }
  const known = Number.isFinite(length) && Number(length) > 0 ? Math.floor(Number(length)) : null;
  const open = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": contentType,
      ...(known ? { "X-Upload-Content-Length": String(known) } : {}),
    },
    body: JSON.stringify(metadata),
  });
  if (!open.ok) throw new Error(`Drive resumable session failed (${open.status}): ${(await open.text().catch(() => "")).slice(0, 300)}`);
  const session = open.headers.get("location");
  if (!session) throw new Error("Drive resumable session returned no Location header");
  let start = 0;
  let piece: { buf: Buffer; last: boolean } | undefined = first.value;
  while (piece) {
    const end = start + piece.buf.length - 1;
    const total = piece.last ? String(start + piece.buf.length) : (known ? String(known) : "*");
    const put = await fetch(session, {
      method: "PUT",
      headers: { "Content-Length": String(piece.buf.length), "Content-Range": `bytes ${start}-${end}/${total}` },
      body: piece.buf as any,
    });
    if (piece.last) {
      if (!put.ok) throw new Error(`Drive upload failed (${put.status}): ${(await put.text().catch(() => "")).slice(0, 300)}`);
      const { id } = (await put.json().catch(() => ({}))) as { id?: string };
      if (!id) throw new Error("Google Drive returned no file id.");
      return id;
    }
    if (put.status !== 308) throw new Error(`Drive upload stopped at byte ${start} (${put.status}): ${(await put.text().catch(() => "")).slice(0, 300)}`);
    // Drive says how much it has; it must be everything sent so far
    const range = put.headers.get("range") || "";
    const got = /bytes=0-(\d+)/.exec(range);
    if (!got || Number(got[1]) !== end) throw new Error(`Drive kept ${got ? Number(got[1]) + 1 : 0} of ${end + 1} bytes`);
    start = end + 1;
    const nx = await pieces.next();
    piece = nx.done ? undefined : nx.value;
  }
  throw new Error("Drive upload ended without a file");      // not reached: the last piece returns
}

// ── downloads ──────────────────────────────────────────────────────────────
/**
 * Pass a stream through, ending it with an error if no data arrives for `ms`.
 * (A whole-file time limit cut big files off part-way; this only stops a
 * download that has stalled.)
 */
export function idleTimeout(src: NodeJS.ReadableStream, ms = 60_000, onTimeout?: () => void): Readable {
  const out = new PassThrough();
  let timer: NodeJS.Timeout | null = null;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      // the READER is the slow one (an upload in progress, a slow browser): not a stall
      if (out.writableNeedDrain || out.readableLength >= out.readableHighWaterMark) { arm(); return; }
      try { onTimeout?.(); } catch { /* ignore */ }
      const err = new Error(`the download stalled (no data for ${Math.round(ms / 1000)} s)`);
      try { (src as any).destroy?.(err); } catch { /* ignore */ }
      out.destroy(err);
    }, ms);
    (timer as any).unref?.();
  };
  const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };
  arm();
  src.on("data", arm);
  src.on("end", stop);
  src.on("error", (e: any) => { stop(); out.destroy(e); });
  out.on("close", stop);
  (src as any).pipe(out);
  return out;
}

/**
 * fetch() with a time limit on getting the RESPONSE (headers), then a stall
 * limit on the body instead of a limit on the whole download.
 */
export async function fetchBodyStream(url: string, init: RequestInit, ms = 60_000): Promise<{ resp: Response; body: Readable | null }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  let resp: Response;
  try { resp = await fetch(url, { ...init, signal: ctl.signal }); }
  finally { clearTimeout(t); }
  if (!resp.body) return { resp, body: null };
  return { resp, body: idleTimeout(Readable.fromWeb(resp.body as any), ms, () => ctl.abort()) };
}
