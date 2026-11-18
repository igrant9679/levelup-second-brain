/**
 * Build -285: storage moves send a file in pieces instead of reading it whole.
 * The REAL helpers (server/_core/streamUpload.ts) against a fake S3 client and
 * a fake Google Drive (fetch replaced) — checks the pieces, the bytes that
 * arrive, that no more than ~two pieces are ever held, and the failure paths.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import crypto from "crypto";
import { Readable, PassThrough } from "stream";
import { chunked, s3PutStream, driveStreamUpload, idleTimeout, abortStaleUploads, CHUNK } from "./_core/streamUpload";

const MB = 1024 * 1024;
/** A source of `total` pseudo-random bytes in odd-sized pieces, made only when read. Tracks how much was read. */
function source(total: number, piece = 777_777) {
  const hash = crypto.createHash("sha256");
  const st = { read: 0, hash: "" };
  let seed = 1;
  async function* gen() {
    while (st.read < total) {
      const n = Math.min(piece, total - st.read);
      const b = Buffer.alloc(n);
      for (let i = 0; i < n; i += 4096) { seed = (seed * 1103515245 + 12345) >>> 0; b.writeUInt32LE(seed, i); }
      hash.update(b);
      st.read += n;
      if (st.read >= total) st.hash = hash.digest("hex");
      yield b;
    }
    if (total === 0) st.hash = crypto.createHash("sha256").digest("hex");
  }
  return { stream: Readable.from(gen()), st };
}
const sha = (bufs: Buffer[]) => { const h = crypto.createHash("sha256"); bufs.forEach((b) => h.update(b)); return h.digest("hex"); };

describe("chunked", () => {
  it("cuts a stream into exact pieces, the last shorter, never an empty one", async () => {
    const sizes: number[] = [];
    for await (const b of chunked(Readable.from([Buffer.alloc(5), Buffer.alloc(0), Buffer.alloc(12), "abc"]), 4)) sizes.push(b.length);
    expect(sizes).toEqual([4, 4, 4, 4, 4]);
    const none: number[] = [];
    for await (const b of chunked(Readable.from([]), 4)) none.push(b.length);
    expect(none).toEqual([]);
  });
});

describe("S3: a multipart upload in pieces", () => {
  function fakeS3(opts: { failPart?: number } = {}) {
    const calls: { name: string; input: any }[] = [];
    const parts = new Map<number, Buffer>();
    let finished: Buffer | null = null;
    return {
      calls, parts, get finished() { return finished; },
      async send(cmd: any) {
        const name = cmd.constructor.name;
        calls.push({ name, input: { ...cmd.input, Body: undefined } });
        if (name === "PutObjectCommand") { finished = Buffer.from(cmd.input.Body); return {}; }
        if (name === "CreateMultipartUploadCommand") return { UploadId: "up-1" };
        if (name === "UploadPartCommand") {
          if (opts.failPart === cmd.input.PartNumber) throw new Error("network went away");
          parts.set(cmd.input.PartNumber, Buffer.from(cmd.input.Body));
          return { ETag: '"e' + cmd.input.PartNumber + '"' };
        }
        if (name === "CompleteMultipartUploadCommand") {
          finished = Buffer.concat(cmd.input.MultipartUpload.Parts.map((p: any) => parts.get(p.PartNumber)!));
          return {};
        }
        if (name === "AbortMultipartUploadCommand") { parts.clear(); return {}; }
        throw new Error("unexpected " + name);
      },
    };
  }

  it("a 21 MB file: 8 + 8 + 5 MB parts, the bytes arrive intact, never more than two pieces in memory", async () => {
    const { stream, st } = source(21 * MB);
    const s3 = fakeS3();
    let maxAhead = 0;
    const orig = s3.send.bind(s3);
    s3.send = async (cmd: any) => {
      if (cmd.constructor.name === "UploadPartCommand") {
        const sent = [...s3.parts.values()].reduce((t, b) => t + b.length, 0) + cmd.input.Body.length;
        maxAhead = Math.max(maxAhead, st.read - sent);
      }
      return orig(cmd);
    };
    const r = await s3PutStream(s3, "bkt", "k/file.bin", stream, "application/pdf");
    expect(r.size).toBe(21 * MB);
    expect(s3.calls.map((c) => c.name)).toEqual(["CreateMultipartUploadCommand", "UploadPartCommand", "UploadPartCommand", "UploadPartCommand", "CompleteMultipartUploadCommand"]);
    expect([...s3.parts.values()].map((b) => b.length)).toEqual([CHUNK, CHUNK, 21 * MB - 2 * CHUNK]);
    expect(s3.calls[0].input).toMatchObject({ Bucket: "bkt", Key: "k/file.bin", ContentType: "application/pdf" });
    expect(s3.calls[4].input.MultipartUpload.Parts).toEqual([{ ETag: '"e1"', PartNumber: 1 }, { ETag: '"e2"', PartNumber: 2 }, { ETag: '"e3"', PartNumber: 3 }]);
    expect(sha([s3.finished!])).toBe(st.hash);
    // read ahead of what was sent: the piece being sent + the next one + one source read
    expect(maxAhead).toBeLessThanOrEqual(2 * CHUNK + 777_777);
  });

  it("a small file is one plain PUT; an empty one too", async () => {
    const small = source(300_000);
    const s3 = fakeS3();
    await s3PutStream(s3, "bkt", "small", small.stream, "text/plain");
    expect(s3.calls.map((c) => c.name)).toEqual(["PutObjectCommand"]);
    expect(s3.calls[0].input.ContentLength).toBe(300_000);
    expect(sha([s3.finished!])).toBe(small.st.hash);
    const e = fakeS3();
    await s3PutStream(e, "bkt", "empty", Readable.from([]), "text/plain");
    expect(e.calls.map((c) => c.name)).toEqual(["PutObjectCommand"]);
    expect(e.finished!.length).toBe(0);
  });

  it("a part that fails: the upload is aborted (no stray parts) and the error comes back", async () => {
    const s3 = fakeS3({ failPart: 2 });
    await expect(s3PutStream(s3, "bkt", "k", source(20 * MB).stream, "x/y")).rejects.toThrow(/network went away/);
    expect(s3.calls.map((c) => c.name)).toEqual(["CreateMultipartUploadCommand", "UploadPartCommand", "UploadPartCommand", "AbortMultipartUploadCommand"]);
    expect(s3.finished).toBeNull();
  });
});

describe("S3: unfinished uploads left by a stopped server (-286)", () => {
  it("aborts only uploads under the move's folder that are over an hour old, across pages", async () => {
    const now = Date.parse("2026-11-18T12:00:00Z");
    const ago = (min: number) => new Date(now - min * 60_000).toISOString();
    const uploads = [
      { Key: "lu/ws7/moved/a.mp4", UploadId: "u1", Initiated: ago(180) },   // stale → abort
      { Key: "lu/ws7/moved/b.mp4", UploadId: "u2", Initiated: ago(5) },     // a move in progress → keep
      { Key: "lu/ws7/moved/c.pdf", UploadId: "u3", Initiated: ago(61) },    // stale → abort (on page 2)
      { Key: "lu/ws8/moved/d.pdf", UploadId: "u4", Initiated: ago(999) },   // another workspace: outside the prefix
      { Key: "lu/ws7/other/e.pdf", UploadId: "u5", Initiated: ago(999) },   // the customer's own upload elsewhere
    ];
    const calls: { name: string; input: any }[] = [];
    const s3 = {
      async send(cmd: any) {
        const name = cmd.constructor.name; calls.push({ name, input: cmd.input });
        if (name === "ListMultipartUploadsCommand") {
          // a listing that ignores the prefix (a misbehaving S3-compatible store): the helper must still not touch others
          if (!cmd.input.KeyMarker) return { Uploads: uploads.slice(0, 2).concat(uploads.slice(3)), IsTruncated: true, NextKeyMarker: "lu/ws7/moved/b.mp4", NextUploadIdMarker: "u2" };
          return { Uploads: [uploads[2]], IsTruncated: false };
        }
        if (name === "AbortMultipartUploadCommand") return {};
        throw new Error("unexpected " + name);
      },
    };
    expect(await abortStaleUploads(s3, "bkt", "lu/ws7/moved/", 60 * 60_000, now)).toBe(2);
    expect(calls.filter((c) => c.name === "AbortMultipartUploadCommand").map((c) => c.input.UploadId)).toEqual(["u1", "u3"]);
    expect(calls.filter((c) => c.name === "ListMultipartUploadsCommand").map((c) => [c.input.Prefix, c.input.KeyMarker || null])).toEqual([["lu/ws7/moved/", null], ["lu/ws7/moved/", "lu/ws7/moved/b.mp4"]]);
    await expect(abortStaleUploads(s3, "bkt", "")).rejects.toThrow(/prefix/);
  });
});

describe("Google Drive: a resumable upload sent chunk by chunk", () => {
  afterEach(() => vi.unstubAllGlobals());
  function fakeDrive(opts: { stopAt?: number; keepShort?: boolean } = {}) {
    const got: Buffer[] = [];
    const reqs: { method: string; url: string; headers: Record<string, string> }[] = [];
    let have = 0;
    const fetchFn = vi.fn(async (url: any, init: any = {}) => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = String(v);
      reqs.push({ method: init.method || "GET", url: String(url), headers });
      if (String(url).includes("uploadType=multipart")) return new Response(JSON.stringify({ id: "small-1" }), { status: 200 });
      if (String(url).includes("uploadType=resumable")) return new Response("", { status: 200, headers: { Location: "https://upload.example/session/abc" } });
      if (String(url) === "https://upload.example/session/abc") {
        const body = Buffer.from(init.body);
        const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(headers["content-range"]);
        if (!m || Number(m[1]) !== have || Number(m[2]) - Number(m[1]) + 1 !== body.length) return new Response("bad range", { status: 400 });
        if (opts.stopAt != null && have >= opts.stopAt) return new Response("quota", { status: 403 });
        got.push(body); have += body.length;
        if (m[3] !== "*" && Number(m[3]) === have) return new Response(JSON.stringify({ id: "big-1" }), { status: 200 });
        return new Response("", { status: 308, headers: { Range: `bytes=0-${opts.keepShort ? have - 2 : have - 1}` } });
      }
      return new Response("?", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchFn);
    return { got, reqs };
  }

  it("a 19 MB file of unknown size: '*' until the last chunk, which carries the total; every chunk a multiple of 256 KiB but the last", async () => {
    const { stream, st } = source(19 * MB + 12345);
    const d = fakeDrive();
    const id = await driveStreamUpload("tok", { name: "f.bin", parents: ["fold"] }, stream, "application/zip");
    expect(id).toBe("big-1");
    const puts = d.reqs.filter((r) => r.method === "PUT");
    expect(puts.map((r) => r.headers["content-range"])).toEqual([
      `bytes 0-${CHUNK - 1}/*`, `bytes ${CHUNK}-${2 * CHUNK - 1}/*`, `bytes ${2 * CHUNK}-${19 * MB + 12344}/${19 * MB + 12345}`,
    ]);
    expect(d.got.slice(0, -1).every((b) => b.length % (256 * 1024) === 0)).toBe(true);
    expect(sha(d.got)).toBe(st.hash);
    const open = d.reqs.find((r) => r.url.includes("uploadType=resumable"))!;
    expect(open.headers["x-upload-content-length"]).toBeUndefined();
    expect(open.headers.authorization).toBe("Bearer tok");
  });

  it("a known size is told up front and on every chunk", async () => {
    const { stream } = source(10 * MB);
    const d = fakeDrive();
    await driveStreamUpload("tok", { name: "f" }, stream, "x/y", 10 * MB);
    expect(d.reqs.find((r) => r.url.includes("resumable"))!.headers["x-upload-content-length"]).toBe(String(10 * MB));
    expect(d.reqs.filter((r) => r.method === "PUT").map((r) => r.headers["content-range"])).toEqual([`bytes 0-${CHUNK - 1}/${10 * MB}`, `bytes ${CHUNK}-${10 * MB - 1}/${10 * MB}`]);
  });

  it("a small file goes in one request", async () => {
    const d = fakeDrive();
    expect(await driveStreamUpload("tok", { name: "s" }, source(100_000).stream, "text/plain", 100_000)).toBe("small-1");
    expect(d.reqs.map((r) => r.url.includes("multipart"))).toEqual([true]);
  });

  it("Drive refusing a chunk, or keeping fewer bytes than sent, is an error (the move counts the file and retries it later)", async () => {
    fakeDrive({ stopAt: CHUNK });
    await expect(driveStreamUpload("tok", { name: "f" }, source(20 * MB).stream, "x/y")).rejects.toThrow(/stopped at byte 8388608 \(403\)/);
    vi.unstubAllGlobals();
    fakeDrive({ keepShort: true });
    await expect(driveStreamUpload("tok", { name: "f" }, source(20 * MB).stream, "x/y")).rejects.toThrow(/Drive kept/);
  });
});

describe("idleTimeout", () => {
  it("passes data through; ends with an error only when the SOURCE stalls, not while the reader is slow", async () => {
    const src = new PassThrough();
    const out = idleTimeout(src, 120);
    const got: Buffer[] = [];
    const done = (async () => { for await (const c of out) { got.push(c); await new Promise((r) => setTimeout(r, 300)); } })();
    // a slow reader (300 ms a piece, limit 120 ms) with plenty buffered must not time out
    src.write(Buffer.alloc(40_000)); src.write(Buffer.alloc(40_000)); src.write(Buffer.alloc(40_000)); src.end();
    await done;
    expect(got.reduce((t, b) => t + b.length, 0)).toBe(120_000);

    const stalled = new PassThrough();
    const o2 = idleTimeout(stalled, 100);
    stalled.write(Buffer.from("first"));
    await expect((async () => { for await (const _ of o2) { /* waits for more that never comes */ } })()).rejects.toThrow(/stalled/);
  });
});
