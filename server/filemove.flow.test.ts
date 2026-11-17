/**
 * Build -283: moving a workspace's files to another storage is a stored,
 * resumable job — not a loop inside the request that started it.
 *
 * The REAL job code and its REAL queries on a REAL MySQL (CI's, or an
 * ephemeral one from mysql-memory-server). Only the storage calls themselves
 * (open / put / remove a file) are a fake kept in memory, passed in as the
 * job's `io`.
 *
 *   queued by the request, nothing copied yet → worked through in slices →
 *   a slice that runs out of time stops and the next one carries on → a
 *   restart in the middle loses nothing → a file that cannot be copied is
 *   counted and left where it was → cancel → the storage changed while the
 *   move waited → another workspace's files are never touched.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 600_000 });
process.env.JWT_SECRET = process.env.JWT_SECRET || "filemove-test-secret-0123456789abcdef";
process.env.SECRETS_KEY = process.env.SECRETS_KEY || "filemove-test-secrets-key-0123456789";
const CI_URL = process.env.DATABASE_URL || "";
const DB_NAME = "levelup_filemove_" + crypto.randomBytes(4).toString("hex");

let conn: mysql.Connection;
let memServer: any = null;
let F: typeof import("./_core/workspaceFiles");
const q = async (sql: string, params: any[] = []) => (await conn.query(sql, params))[0] as any[];

// ── the fake storage: "<store>:<ref>" → bytes ──
const blobs = new Map<string, Buffer>();
const log: string[] = [];
let failNames = new Set<string>();
let removeFails = false;
const io = (): import("./_core/workspaceFiles").MoveIo => ({
  async folder() { return undefined; },
  async open(row: any) {
    const b = blobs.get(row.store + ":" + row.ref);
    if (!b) return { kind: "missing" } as any;
    return { kind: "stream", body: Readable.from([b]), contentType: row.mime || "application/octet-stream" } as any;
  },
  async put(wsId, state, row, body) {
    if (failNames.has(row.name)) throw new Error("the target refused " + row.name);
    const ref = "moved/" + wsId + "/" + row.id + "-" + crypto.randomBytes(3).toString("hex");
    blobs.set(state.current + ":" + ref, Buffer.from(body));
    log.push("put " + row.id);
    return { backend: state.current === "platform" ? "forge" : "s3", ref };
  },
  async remove(_state, old) {
    if (removeFails) throw new Error("the old storage is unreachable");
    blobs.delete(old.store + ":" + old.ref);
    log.push("del " + old.ref);
  },
});

const WS = 1;          // seeded by the migrations
let WS2 = 0;
const s3 = (id: string) => ({ id, mode: "s3" as const, region: "us-east-1", bucket: "b-" + id, accessKeyId: "AKIA" + id, secretAccessKey: "secret-" + id, addedAt: new Date().toISOString() });
async function addFiles(ws: number, store: string, n: number, prefix: string) {
  for (let i = 0; i < n; i++) {
    const ref = `${prefix}/${i}`;
    blobs.set(store + ":" + ref, Buffer.from(`${prefix} file ${i}`));
    await q("INSERT INTO files (publicId, workspaceId, store, backend, ref, name, size, mime) VALUES (?,?,?,?,?,?,?,?)",
      [crypto.randomBytes(16).toString("hex"), ws, store, store === "platform" ? "forge" : "s3", ref, `${prefix}-${i}.txt`, 10, "text/plain"]);
  }
}
const rowsOf = (ws: number) => q("SELECT id, store, backend, ref, name FROM files WHERE workspaceId = ? ORDER BY id", [ws]);
const stored = async (ws: number) => { const r = await q("SELECT value FROM workspace_settings WHERE workspaceId = ? AND `key` = 'fileMove'", [ws]); return r[0] ? JSON.parse(r[0].value) : null; };
const far = () => Date.now() + 60_000;

describe("moving a workspace's files is a stored, resumable job (real MySQL)", () => {
  beforeAll(async () => {
    let url = "";
    if (CI_URL) {
      const u = new URL(CI_URL); u.pathname = "/";
      const admin = await mysql.createConnection({ uri: u.toString() });
      await admin.query("CREATE DATABASE `" + DB_NAME + "`");
      await admin.end();
      u.pathname = "/" + DB_NAME; url = u.toString();
    } else {
      const { createDB } = await import("mysql-memory-server");
      memServer = await createDB({ version: "8.0.x", dbName: DB_NAME, logLevel: "ERROR" } as any);
      url = `mysql://${memServer.username}@127.0.0.1:${memServer.port}/${memServer.dbName}`;
    }
    const mconn = await mysql.createConnection({ uri: url, multipleStatements: true });
    await migrate(drizzle(mconn), { migrationsFolder: path.join(__dirname, "../drizzle") });
    await mconn.end();
    process.env.DATABASE_URL = url;
    conn = await mysql.createConnection({ uri: url });
    F = await import("./_core/workspaceFiles");
    const [r]: any = await conn.query("INSERT INTO workspaces (name, slug, status) VALUES ('Other Co', 'other-co-" + crypto.randomBytes(3).toString("hex") + "', 'active')");
    WS2 = Number(r.insertId);
  });
  afterAll(async () => {
    try { await conn?.end(); } catch { /* */ }
    try { const { closeDb } = (await import("./db")) as any; if (typeof closeDb === "function") await closeDb(); } catch { /* */ }
    try { if (CI_URL) { const u = new URL(CI_URL); u.pathname = "/"; const a = await mysql.createConnection({ uri: u.toString() }); await a.query("DROP DATABASE IF EXISTS `" + DB_NAME + "`"); await a.end(); } } catch { /* */ }
    try { await memServer?.stop(); } catch { /* */ }
  });

  it("the request only queues the move; nothing is copied until the job runs", async () => {
    await addFiles(WS, "platform", 47, "a");
    await addFiles(WS2, "platform", 3, "other");
    const st = s3("one");
    await F.writeStorage(WS, { current: st.id, stores: { [st.id]: st } });
    expect(await F.filesElsewhere(WS)).toBe(47);
    expect(await F.moveStatus(WS)).toBeNull();

    // queue it by hand (moveFiles would also start the background job, which this test drives itself)
    await conn.query("INSERT INTO workspace_settings (workspaceId, `key`, value) VALUES (?, 'fileMove', ?)", [WS, JSON.stringify({ status: "queued", target: st.id, total: 47, moved: 0, failed: 0, cursor: 0, queuedAt: new Date().toISOString() })]);
    expect(await F.moveStatus(WS)).toMatchObject({ status: "queued", running: true, total: 47, moved: 0 });
    expect(log).toEqual([]);
    expect((await rowsOf(WS)).every((r) => r.store === "platform")).toBe(true);
    // a second request while one is waiting does not start another
    expect(await F.moveFiles(WS)).toEqual({ started: false, total: 47 });
  });

  it("a slice that runs out of time stops between files, and the next one carries on where it stopped", async () => {
    // "time is up" after seven files (the same check the clock makes, made exact for the test)
    const puts = () => log.filter((l) => l.startsWith("put ")).length;
    const j1 = await F.runMoveSlice(WS, { io: io(), deadline: far(), stop: () => puts() >= 7 });
    expect(j1).toMatchObject({ status: "running", moved: 7 });
    // a slice whose time is already over moves nothing and leaves the job as it was
    const j0 = await F.runMoveSlice(WS, { io: io(), deadline: Date.now() - 1 });
    expect(j0).toMatchObject({ status: "running", moved: 7 });
    const after1 = await rowsOf(WS);
    const movedIds = after1.filter((r) => r.store === "one").map((r) => r.id);
    expect(movedIds.length).toBe(j1!.moved);
    // in id order, none skipped: everything up to the cursor is moved, nothing after it
    expect((await stored(WS)).cursor).toBe(Math.max(...movedIds));
    expect(after1.filter((r) => r.id <= j1!.cursor).every((r) => r.store === "one")).toBe(true);
    expect(await F.moveStatus(WS)).toMatchObject({ status: "running", running: true, moved: j1!.moved, total: 47 });

    // "the server restarted": nothing in memory, only what is stored — and the server is stopping again at once
    const j2 = await F.runMoveSlice(WS, { io: io(), deadline: far(), stop: () => true });
    expect(j2!.moved).toBe(j1!.moved);
    expect(j2!.status).toBe("running");

    // the next pass finishes it (several pages of rows)
    const left = await F.processFileMoves({ io: io() });
    expect(left).toBe(0);
    expect(await F.moveStatus(WS)).toMatchObject({ status: "done", running: false, moved: 47, failed: 0, total: 47 });
    const done = await rowsOf(WS);
    expect(done.every((r) => r.store === "one" && r.backend === "s3" && /^moved\/1\//.test(r.ref))).toBe(true);
    // every file was copied exactly once, the bytes arrived, and the old copies are gone
    expect(log.filter((l) => l.startsWith("put ")).length).toBe(47);
    expect(new Set(log.filter((l) => l.startsWith("put "))).size).toBe(47);
    expect(blobs.get("one:" + done[0].ref)!.toString()).toBe("a file 0");
    expect([...blobs.keys()].filter((k) => k.startsWith("platform:a/")).length).toBe(0);
    expect(await F.filesElsewhere(WS)).toBe(0);
    // the other workspace was not touched
    expect((await rowsOf(WS2)).every((r) => r.store === "platform" && /^other\//.test(r.ref))).toBe(true);
    expect([...blobs.keys()].filter((k) => k.startsWith("platform:other/")).length).toBe(3);
    // nothing to do → a new request starts nothing
    expect(await F.moveFiles(WS)).toEqual({ started: false, total: 0 });
  });

  it("a file that cannot be copied is counted and stays where it was; pressing Move again retries it", async () => {
    log.length = 0;
    const two = s3("two");
    const state = await F.readStorage(WS);
    state.stores[two.id] = two; state.current = two.id;
    await F.writeStorage(WS, state);
    expect(await F.filesElsewhere(WS)).toBe(47);
    failNames = new Set(["a-3.txt", "a-40.txt"]);
    removeFails = true;                                             // and the old storage cannot be cleaned up either
    await conn.query("UPDATE workspace_settings SET value = ? WHERE workspaceId = ? AND `key` = 'fileMove'", [JSON.stringify({ status: "queued", target: two.id, total: 47, moved: 0, failed: 0, cursor: 0, queuedAt: new Date().toISOString() }), WS]);
    expect(await F.processFileMoves({ io: io() })).toBe(0);
    removeFails = false;
    expect(await F.moveStatus(WS)).toMatchObject({ status: "done", moved: 45, failed: 2, total: 47 });
    const rows = await rowsOf(WS);
    const stuck = rows.filter((r) => r.store !== "two");
    expect(stuck.map((r) => r.name).sort()).toEqual(["a-3.txt", "a-40.txt"]);
    expect(stuck.every((r) => r.store === "one" && blobs.has("one:" + r.ref))).toBe(true);       // still openable where they were
    // a failed clean-up of the old copy does not undo the move: the record points at the new copy
    expect(rows.filter((r) => r.store === "two").every((r) => blobs.has("two:" + r.ref))).toBe(true);
    expect(await F.filesElsewhere(WS)).toBe(2);

    failNames = new Set();
    await conn.query("UPDATE workspace_settings SET value = ? WHERE workspaceId = ? AND `key` = 'fileMove'", [JSON.stringify({ status: "queued", target: two.id, total: 2, moved: 0, failed: 0, cursor: 0, queuedAt: new Date().toISOString() }), WS]);
    await F.processFileMoves({ io: io() });
    expect(await F.moveStatus(WS)).toMatchObject({ status: "done", moved: 2, failed: 0 });
    expect(await F.filesElsewhere(WS)).toBe(0);
  });

  it("Stop: the move ends after the file in hand and stays stopped", async () => {
    const state = await F.readStorage(WS);
    state.current = "one";
    await F.writeStorage(WS, state);
    await conn.query("UPDATE workspace_settings SET value = ? WHERE workspaceId = ? AND `key` = 'fileMove'", [JSON.stringify({ status: "queued", target: "one", total: 47, moved: 0, failed: 0, cursor: 0, queuedAt: new Date().toISOString() }), WS]);
    let n = 0;
    const slow = io();
    const put = slow.put;
    slow.put = async (...a) => { const r = await put(...a); if (++n === 4) await F.cancelMove(WS); return r; };
    const j = await F.runMoveSlice(WS, { io: slow, deadline: far() });
    expect(j).toMatchObject({ status: "cancelled", moved: 4 });
    expect(await F.moveStatus(WS)).toMatchObject({ status: "cancelled", running: false, moved: 4, total: 47 });
    expect((await rowsOf(WS)).filter((r) => r.store === "one").length).toBe(4);
    // later passes leave a stopped move alone
    expect(await F.processFileMoves({ io: io() })).toBe(0);
    expect((await rowsOf(WS)).filter((r) => r.store === "one").length).toBe(4);
    expect(await F.cancelMove(WS)).toBe(false);
  });

  it("the storage was changed while the move waited: the files go to the storage in use now", async () => {
    const state = await F.readStorage(WS);
    await conn.query("UPDATE workspace_settings SET value = ? WHERE workspaceId = ? AND `key` = 'fileMove'", [JSON.stringify({ status: "queued", target: "one", total: 43, moved: 0, failed: 0, cursor: 999999, queuedAt: new Date().toISOString() }), WS]);
    state.current = "platform";
    await F.writeStorage(WS, state);
    await F.processFileMoves({ io: io() });
    expect(await F.moveStatus(WS)).toMatchObject({ status: "done", moved: 47, failed: 0, total: 47 });
    expect((await rowsOf(WS)).every((r) => r.store === "platform")).toBe(true);
    expect((await stored(WS)).target).toBe("platform");
  });

  it("a closed workspace's waiting move is left alone", async () => {
    await addFiles(WS2, "gone", 2, "x");
    await conn.query("INSERT INTO workspace_settings (workspaceId, `key`, value) VALUES (?, 'fileMove', ?)", [WS2, JSON.stringify({ status: "queued", target: "platform", total: 2, moved: 0, failed: 0, cursor: 0, queuedAt: new Date().toISOString() })]);
    await conn.query("UPDATE workspaces SET deletedAt = NOW() WHERE id = ?", [WS2]);
    (await import("./_core/workspace"))._resetWorkspaceCachesForTest();
    log.length = 0;
    await F.processFileMoves({ io: io() });
    expect(log).toEqual([]);
    expect((await stored(WS2)).status).toBe("queued");
  });
});
