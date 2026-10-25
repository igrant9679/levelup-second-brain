/**
 * Phase 3 (build -228): scheduled emails run on the USER's clock and are sent
 * once per period through the send ledger.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── an in-memory send_ledger + the few tables the digest reads ─────────────
const state = {
  ledger: new Map<string, string>(),
  prefs: {} as Record<string, unknown>,
  sent: [] as Array<{ to: string; subject: string }>,
  prefsWrites: 0,
  sendOk: true,
};
function sqlParts(q: any) {
  const chunks = (q?.queryChunks || []) as any[];
  const text = chunks.map((c: any) => (c && Array.isArray(c.value) ? c.value.join("") : "?")).join("");
  const params = chunks.filter((c: any) => !(c && typeof c === "object" && Array.isArray(c.value)));
  return { text, params };
}
function chain(rows: any[]) {
  const p: any = Promise.resolve(rows);
  for (const m of ["where", "limit", "orderBy", "innerJoin", "leftJoin"]) p[m] = () => chain(rows);
  return p;
}
const fakeDb = {
  select: () => ({
    from: (t: any) => {
      const name = t?.[Symbol.for("drizzle:Name")] || "";
      if (name === "user_app_data") return chain([{ userId: 7, prefs: JSON.stringify(state.prefs), finance: null, programs: null }]);
      if (name === "users") return chain([{ id: 7, name: "Pat Example", email: "pat@example.com", role: "user" }]);
      return chain([]);
    },
  }),
  update: () => ({ set: () => ({ where: async () => { state.prefsWrites++; return [{ affectedRows: 1 }]; } }) }),
  execute: async (q: any) => {
    const { text, params } = sqlParts(q);
    const key = params.slice(0, 3).join("|");
    if (/INSERT IGNORE INTO send_ledger/i.test(text)) {
      if (state.ledger.has(key)) return [{ affectedRows: 0 }];
      state.ledger.set(key, new Date().toISOString());
      return [{ affectedRows: 1 }];
    }
    if (/DELETE FROM send_ledger/i.test(text)) { state.ledger.delete(key); return [{ affectedRows: 1 }]; }
    if (/SELECT period, sentAt FROM send_ledger/i.test(text)) {
      const [userId, kind] = params;
      const rows = [...state.ledger.entries()].filter(([k]) => k.startsWith(`${userId}|${kind}|`)).map(([k, at]) => ({ period: k.split("|")[2], sentAt: at }));
      return [rows.sort((a, b) => b.sentAt.localeCompare(a.sentAt))];
    }
    return [[]];
  },
};
vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb), insertScheduledTaskLog: vi.fn(async () => {}) }));
vi.mock("./routers/appData", () => ({ readEntityArray: vi.fn(async () => [{ id: 1, title: "Pay invoice", status: "Not Started", due: "2026-10-26" }]) }));
vi.mock("./_core/sendEmail", () => ({ sendEmail: vi.fn(async (o: any) => { if (state.sendOk) state.sent.push({ to: o.to, subject: o.subject }); return state.sendOk; }) }));
vi.mock("./_core/financeEmail", () => ({ buildMoneySectionHtml: vi.fn(async () => ({ html: "", billsDueCount: 0, nudgeCount: 0 })) }));
vi.mock("./_core/recipient", () => ({ allowedRecipient: vi.fn(async (u: any) => u.email) }));

import { userNow, userTz, dayIn, shiftDays, toMinutes } from "./_core/userTime";
import { claimSend, releaseSend, lastSent } from "./_core/sendLedger";
import { digestDue, processDailyDigest } from "./_core/dailyDigestEmail";
import { weeklyDue } from "./_core/weeklyReviewEmail";
import { reportPeriod, claimScheduledReport } from "./_core/scheduledReports";

const NY = "America/New_York";
beforeEach(() => {
  state.ledger.clear(); state.sent = []; state.prefsWrites = 0; state.sendOk = true;
  state.prefs = { coach: { tz: NY }, dailyDigest: { enabled: true, time: "07:00" } };
});
afterEach(() => { vi.useRealTimers(); });

describe("userTime", () => {
  it("reads the user's wall clock, not the server's", () => {
    // 03:30Z on the 26th is 23:30 on the 25th in New York.
    const l = userNow(NY, new Date(Date.UTC(2026, 9, 26, 3, 30)));
    expect(l.ymd).toBe("2026-10-25");
    expect(l.minutes).toBe(23 * 60 + 30);
    expect(l.dow).toBe(0);
    expect(userNow("Asia/Tokyo", new Date(Date.UTC(2026, 9, 26, 3, 30))).ymd).toBe("2026-10-26");
  });
  it("falls back to New York for a missing or bogus zone", () => {
    expect(userTz({})).toBe(NY);
    expect(userTz({ coach: { tz: "Mars/Olympus" } })).toBe(NY);
    expect(userTz({ coach: { tz: "Europe/Paris" } })).toBe("Europe/Paris");
  });
  it("dayIn keeps a bare date and converts a timestamp", () => {
    expect(dayIn(NY, "2026-10-25")).toBe("2026-10-25");
    expect(dayIn(NY, "2026-10-26T02:10:00.000Z")).toBe("2026-10-25");
    expect(dayIn(NY, null)).toBe("");
  });
  it("shiftDays is calendar arithmetic across month ends and DST", () => {
    expect(shiftDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDays("2026-11-01", 7)).toBe("2026-11-08");
    expect(shiftDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(toMinutes("7:05", "08:00")).toBe(425);
    expect(Number.isNaN(toMinutes("late", "08:00"))).toBe(true);
  });
});

describe("due rules use the user's clock", () => {
  const at = (iso: string) => userNow(NY, new Date(iso));
  it("daily digest: not before 07:00 local, due after", () => {
    expect(digestDue({ enabled: true, time: "07:00" }, at("2026-10-26T10:30:00Z"))).toBe(false); // 06:30 EDT
    expect(digestDue({ enabled: true, time: "07:00" }, at("2026-10-26T11:05:00Z"))).toBe(true);  // 07:05 EDT
    // On a UTC server the old check fired at 07:00 UTC = 03:00 Eastern.
    expect(digestDue({ enabled: true, time: "07:00" }, at("2026-10-26T07:00:00Z"))).toBe(false);
    expect(digestDue({ enabled: false, time: "07:00" }, at("2026-10-26T15:00:00Z"))).toBe(false);
  });
  it("weekly review: the chosen weekday on the user's calendar", () => {
    // Friday 16:30 local; at 21:00Z Friday it's 17:00 EDT Friday → due.
    expect(weeklyDue({ enabled: true, dayOfWeek: 5, time: "16:30" }, at("2026-10-30T21:00:00Z"))).toBe(true);
    // 01:00Z Saturday is still Friday 21:00 in New York.
    expect(weeklyDue({ enabled: true, dayOfWeek: 5, time: "16:30" }, at("2026-10-31T01:00:00Z"))).toBe(true);
    expect(weeklyDue({ enabled: true, dayOfWeek: 5, time: "16:30" }, at("2026-10-31T14:00:00Z"))).toBe(false); // Saturday
  });
  it("report periods: daily/weekly by local day, monthly by month", () => {
    const eve = at("2026-11-02T01:00:00Z"); // Sun 1 Nov, 20:00 EST
    expect(reportPeriod({ frequency: "daily", time: "08:00" }, eve)).toBe("2026-11-01");
    expect(reportPeriod({ frequency: "weekly", time: "08:00", dow: 0 }, eve)).toBe("2026-11-01");
    expect(reportPeriod({ frequency: "weekly", time: "08:00", dow: 1 }, eve)).toBeNull();
    expect(reportPeriod({ frequency: "monthly", time: "08:00", dom: 1 }, eve)).toBe("2026-11");
    expect(reportPeriod({ frequency: "daily", time: "21:00" }, eve)).toBeNull();
    expect(reportPeriod({ frequency: "off" }, eve)).toBeNull();
  });
});

describe("send ledger", () => {
  it("one claim per (user, kind, period), even when two senders race", async () => {
    const [a, b] = await Promise.all([claimSend(fakeDb as any, 7, "digest", "2026-10-26"), claimSend(fakeDb as any, 7, "digest", "2026-10-26")]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await claimSend(fakeDb as any, 7, "digest", "2026-10-27")).toBe(true);
    expect(await claimSend(fakeDb as any, 8, "digest", "2026-10-26")).toBe(true);
  });
  it("a released claim can be taken again; lastSent reports the newest", async () => {
    await claimSend(fakeDb as any, 7, "weekly", "2026-10-30");
    await releaseSend(fakeDb as any, 7, "weekly", "2026-10-30");
    expect(await claimSend(fakeDb as any, 7, "weekly", "2026-10-30")).toBe(true);
    expect((await lastSent(fakeDb as any, 7, "weekly"))?.period).toBe("2026-10-30");
  });
  it("an open tab's report claim blocks the cron for that period", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T13:00:00Z")); // 09:00 EDT
    const prefs = { coach: { tz: NY }, savedReports: [{ id: 42, name: "Weekly", schedule: { frequency: "daily", time: "08:00" } }] };
    const tab = await claimScheduledReport(fakeDb as any, 7, prefs, "42");
    expect(tab).toEqual({ claimed: true, period: "2026-10-26" });
    expect(await claimScheduledReport(fakeDb as any, 7, prefs, "42")).toEqual({ claimed: false, period: "2026-10-26" });
    expect(await claimScheduledReport(fakeDb as any, 7, prefs, "99")).toEqual({ claimed: false, period: null });
  });
});

describe("daily digest pass", () => {
  it("waits for 07:00 on the user's clock, sends once, and never rewrites prefs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T10:30:00Z")); // 06:30 EDT
    expect((await processDailyDigest()).sent).toBe(0);
    vi.setSystemTime(new Date("2026-10-26T11:05:00Z")); // 07:05 EDT
    expect((await processDailyDigest()).sent).toBe(1);
    vi.setSystemTime(new Date("2026-10-26T11:20:00Z")); // next tick, same day
    expect((await processDailyDigest()).sent).toBe(0);
    expect(state.sent).toHaveLength(1);
    expect(state.prefsWrites).toBe(0);
    expect([...state.ledger.keys()]).toEqual(["7|digest|2026-10-26"]);
    // The next morning it sends again.
    vi.setSystemTime(new Date("2026-10-27T11:05:00Z"));
    expect((await processDailyDigest()).sent).toBe(1);
  });
  it("a failed send releases the claim so the next tick retries", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T11:05:00Z"));
    state.sendOk = false;
    const r1 = await processDailyDigest();
    expect(r1.errors).toBe(1);
    expect(state.ledger.size).toBe(0);
    state.sendOk = true;
    expect((await processDailyDigest()).sent).toBe(1);
  });
});
