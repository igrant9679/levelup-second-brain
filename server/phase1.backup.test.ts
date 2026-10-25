/**
 * Phase 1 gate: the backup covers every table, hides secrets, reads back
 * exactly (the restore test), and scripts/decrypt-backup.mjs can open it.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

process.env.BACKUP_KEY = "test-backup-key";

const TABLES: Record<string, any[]> = {
  users: [{ id: 1, email: "owner@test.com", passwordHash: "$2b$10$abc", name: "Owner", createdAt: new Date("2026-10-01T00:00:00Z") }],
  tasks: [{ id: 1, userId: 1, taskId: "1", raw: JSON.stringify({ id: 1, title: "Plan" }) }, { id: 2, userId: 1, taskId: "2", raw: "{}" }],
  notes: [{ id: 1, userId: 1, noteId: "9", raw: JSON.stringify({ id: 9, title: "Meeting", bodyHtml: "<p>x</p>" }) }],
  pm_records: [{ id: 4, userId: 1, kind: "delegation", data: "{}" }],
  smtp_imap_accounts: [{ id: 1, userId: 1, email: "a@b.c", imapPassword: "IMAP-SECRET", smtpPassword: "SMTP-SECRET" }],
  oauth_tokens: [{ id: 1, userId: 1, accessToken: "AT-SECRET", refreshToken: "RT-SECRET" }],
  system_settings: [{ key: "aiKey_claude", value: "sk-ant-SECRET" }, { key: "aiProvider", value: "claude" }, { key: "vapidPrivate", value: "VAPID-SECRET" }],
};
const fakeDb = {
  execute: async (q: any) => {
    const text = (q?.queryChunks || []).map((c: any) => (c?.value ? (Array.isArray(c.value) ? c.value.join("") : c.value) : "")).join("") || String(q?.sql || q);
    if (/SHOW TABLES/i.test(text)) return [Object.keys(TABLES).map((t) => ({ Tables_in_db: t }))];
    const m = /FROM `([^`]+)`/.exec(text);
    return [m ? TABLES[m[1]].map((r) => ({ ...r })) : []];
  },
};
vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb), getSystemSetting: vi.fn(), setSystemSetting: vi.fn() }));

import { dumpAllTables, encryptBackup, decryptBackup, verifyBackup } from "./_core/backup";

let dump: any;
beforeAll(async () => { dump = await dumpAllTables(); });

describe("database backup", () => {
  it("covers every table, including tasks, notes and PM data", () => {
    expect(Object.keys(dump.tables).sort()).toEqual(Object.keys(TABLES).sort());
    expect(dump.tables.tasks.count).toBe(2);
    expect(dump.tables.notes.rows[0].raw).toContain("Meeting");
  });
  it("redacts passwords, tokens and API keys but keeps ordinary data", () => {
    const s = JSON.stringify(dump);
    for (const secret of ["IMAP-SECRET", "SMTP-SECRET", "AT-SECRET", "RT-SECRET", "sk-ant-SECRET", "VAPID-SECRET", "$2b$10$abc"]) expect(s).not.toContain(secret);
    expect(dump.tables.system_settings.rows.find((r: any) => r.key === "aiProvider").value).toBe("claude");
    expect(dump.tables.users.rows[0].email).toBe("owner@test.com");
    expect(dump.tables.users.rows[0].createdAt).toBe("2026-10-01T00:00:00.000Z");
  });
  it("encrypts, and the restore test reads every table back exactly", () => {
    const buf = encryptBackup(dump);
    expect(buf.subarray(0, 5).toString()).toBe("LUBK1");
    expect(buf.toString("latin1")).not.toContain("Meeting");
    const v = verifyBackup(buf, dump);
    expect(v).toMatchObject({ ok: true, tables: 7, mismatches: [] });
    expect(decryptBackup(buf).tables.pm_records.count).toBe(1);
  });
  it("detects a damaged or tampered file", () => {
    const buf = encryptBackup(dump);
    buf[buf.length - 3] ^= 0xff;
    expect(() => decryptBackup(buf)).toThrow();
  });
  it("scripts/decrypt-backup.mjs opens it with the same key", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lubk-"));
    const file = path.join(dir, "b.lubk");
    fs.writeFileSync(file, encryptBackup(dump));
    const out = execFileSync(process.execPath, [path.join(__dirname, "../scripts/decrypt-backup.mjs"), file], { env: { ...process.env, BACKUP_KEY: "test-backup-key" } }).toString();
    expect(out).toMatch(/tasks\s+2 rows/);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "b.json"), "utf8")).tables.notes.count).toBe(1);
    expect(() => execFileSync(process.execPath, [path.join(__dirname, "../scripts/decrypt-backup.mjs"), file], { env: { ...process.env, BACKUP_KEY: "wrong" }, stdio: "pipe" })).toThrow();
  });
});
