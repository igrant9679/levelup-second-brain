/**
 * Phase 5 (build -231): assistant approvals are claimed once across devices,
 * and the assistant reads dates and statuses the way the app stores them.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";

const ledger = new Set<string>();
const fakeDb = {
  execute: async (q: any) => {
    const chunks = (q?.queryChunks || []) as any[];
    const text = chunks.map((c: any) => (c && Array.isArray(c.value) ? c.value.join("") : "?")).join("");
    const params = chunks.filter((c: any) => !(c && typeof c === "object" && Array.isArray(c.value)));
    const key = params.slice(0, 3).join("|");
    if (/INSERT IGNORE INTO send_ledger/i.test(text)) { if (ledger.has(key)) return [{ affectedRows: 0 }]; ledger.add(key); return [{ affectedRows: 1 }]; }
    return [[]];
  },
};
vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb) }));
import { claimsRouter } from "./routers/claims";

describe("claims.once", () => {
  it("lets exactly one device run an approval", async () => {
    const caller = (id: number) => claimsRouter.createCaller({ user: { id } } as any);
    expect(await caller(7).once({ scope: "agent", key: "amk1" })).toEqual({ claimed: true });
    expect(await caller(7).once({ scope: "agent", key: "amk1" })).toEqual({ claimed: false });
    expect(await caller(8).once({ scope: "agent", key: "amk1" })).toEqual({ claimed: true }); // per user
    expect(await caller(7).once({ scope: "agent", key: "amk2" })).toEqual({ claimed: true });
  });
});

// ── the shipped assistant helpers ─────────────────────────────────────────
const SRC = fs.readFileSync(path.join(__dirname, "../client/public/js/app-agent.js"), "utf8").replace(/\r\n/g, "\n");
function grab(name: string): string {
  const i = SRC.indexOf(`function ${name}(`);
  if (i < 0) throw new Error("missing " + name);
  const rest = SRC.slice(i + 1);
  const m = rest.match(/\n(?=(?:async )?function |var |\/\/)/);
  return SRC.slice(i, m ? i + 1 + (m.index as number) : SRC.length);
}
let api: any;
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 26, 10, 0, 0)); // Mon 26 Oct 2026
  const ymd = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const ctx: any = { Date, Math, String, Number, parseInt, isNaN, _ymd: ymd,
    _pd: (v: any) => { const m = typeof v === "string" && v.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v); },
    TASK_STATUSES: ["Not Started", "Pending", "Scheduled", "In Progress", "Done", "Someday"] };
  vm.createContext(ctx);
  vm.runInContext(grab("_agentDate") + "\n" + grab("_agentTaskStatus") + "\nthis.__a={date:_agentDate,status:_agentTaskStatus};", ctx);
  api = ctx.__a;
});
afterAll(() => vi.useRealTimers());

describe("assistant dates", () => {
  it("reads a year-less date as the next one coming", () => {
    expect(api.date("Oct 30")).toBe("2026-10-30");
    expect(api.date("30 October")).toBe("2026-10-30");
    expect(api.date("Jan 5")).toBe("2027-01-05");     // already passed this year → next year
    expect(api.date("2026-12-01")).toBe("2026-12-01");
    expect(api.date("tomorrow")).toBe("2026-10-27");
  });
  it("refuses what it cannot read instead of clearing the date", () => {
    expect(api.date("Feb 30")).toBe("");
    expect(api.date("sometime soon")).toBe("");
  });
});

describe("assistant statuses", () => {
  it("maps words to the app's statuses", () => {
    expect(api.status("Completed")).toBe("Done");
    expect(api.status("in-progress")).toBe("In Progress");
    expect(api.status("blocked")).toBe("Pending");
    expect(api.status("backlog")).toBe("Someday");
    expect(api.status("someday")).toBe("Someday");
    expect(api.status("Not Started")).toBe("Not Started");
    expect(api.status("purple")).toBeNull();
  });
});
