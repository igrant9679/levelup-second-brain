/**
 * AI coach round two (build -220): the weekly plan + money check-in schedule,
 * money alerts, and replying to the coach by email.
 */
import { describe, expect, it } from "vitest";
import { coachMessageId, coachToken, dueSlots, localNow, moneyAlertWindow, parseCoachRef, sanitize, slotDay } from "./_core/coachCron";
import { addressOf, extractReplyText, isAutoReply } from "./_core/coachReplies";
import { moneyAlertIssues, moneyCoachLines, parseFinance } from "./_core/financeEmail";

const ny = (iso: string) => localNow("America/New_York", new Date(iso));
const on = { enabled: true };

describe("weekly slots", () => {
  it("fires the weekly plan on Sunday evening and the money check-in on Saturday morning", () => {
    expect(dueSlots(on, ny("2026-10-18T22:30:00Z"))).toEqual(["weekly"]); // Sun 18:30
    expect(dueSlots(on, ny("2026-10-17T14:15:00Z"))).toEqual(["money"]);  // Sat 10:15
    expect(dueSlots(on, ny("2026-10-19T22:30:00Z"))).not.toContain("weekly"); // Mon 18:30
  });
  it("ignores the weekday list for weekly slots, but honours their own day, switch and pause", () => {
    const sun = ny("2026-10-18T22:30:00Z");
    expect(dueSlots({ enabled: true, days: [1] }, sun)).toEqual(["weekly"]);
    expect(dueSlots({ enabled: true, slots: { weekly: { day: 1 } } }, sun)).toEqual([]);
    expect(dueSlots({ enabled: true, slots: { weekly: { on: false } } }, sun)).toEqual([]);
    expect(dueSlots({ enabled: true, pausedUntil: "2026-10-18" }, sun)).toEqual([]);
    expect(slotDay({ slots: { money: { day: 9 } } }, "money")).toBe(6);
  });
  it("still skips weekday slots on weekends", () => {
    expect(dueSlots(on, ny("2026-10-17T11:45:00Z"))).toEqual([]); // Sat 07:45
  });
  it("only alerts about money in waking hours, when on", () => {
    expect(moneyAlertWindow(on, ny("2026-10-17T14:15:00Z"))).toBe(true);   // 10:15
    expect(moneyAlertWindow(on, ny("2026-10-17T10:00:00Z"))).toBe(false);  // 06:00
    expect(moneyAlertWindow(on, ny("2026-10-18T01:00:00Z"))).toBe(false);  // 21:00
    expect(moneyAlertWindow({ enabled: true, slots: { moneyalert: { on: false } } }, ny("2026-10-17T14:15:00Z"))).toBe(false);
    expect(moneyAlertWindow({ enabled: false }, ny("2026-10-17T14:15:00Z"))).toBe(false);
  });
});

describe("sanitize — replies may do a little more", () => {
  const ids = new Set(["11"]);
  const raw = JSON.stringify({ title: "t", body: "b", actions: [
    { tool: "complete_task", args: { id: "#11" } },
    { tool: "update_task", args: { id: 11, status: "Done" } },
    { tool: "remember", args: { area: "nonsense", fact: "Off every Friday afternoon" } },
    { tool: "update_task", args: { id: 11, status: "Deleted" } },
    { tool: "delete", args: { entity: "task", id: 11 } },
    { tool: "complete_task", args: { id: 99 } },
  ] });
  it("lets a reply complete tasks and remember facts, never delete", () => {
    const s = sanitize(raw, ids, undefined, "reply")!;
    expect(s.actions.map((a) => a.tool)).toEqual(["complete_task", "update_task", "remember"]);
    expect(s.actions[0].args.id).toBe("11");
    expect(s.actions[2].args).toEqual({ area: "basics", fact: "Off every Friday afternoon" });
    expect(s.dropped!.join(" | ")).toMatch(/would delete.*tool not allowed.*unknown task/);
  });
  it("keeps scheduled check-ins to the old, non-completing list", () => {
    const s = sanitize(raw, ids)!;
    expect(s.actions).toEqual([]);
  });
});

describe("reply threading", () => {
  it("round-trips a message id and verifies its token", () => {
    const mid = coachMessageId(7, 1234);
    expect(mid).toMatch(/^<coach\.1234\.[0-9a-f]{20}@levelupnow\.tools>$/);
    const ref = parseCoachRef(null, `<abc@mail.gmail.com> ${mid}`)!;
    expect(ref).toEqual({ id: 1234, token: coachToken(7, 1234) });
    expect(coachToken(8, 1234)).not.toBe(ref.token); // another user's token never matches
  });
  it("takes the newest coach id in a thread", () => {
    expect(parseCoachRef([coachMessageId(7, 10), coachMessageId(7, 12)])!.id).toBe(12);
    expect(parseCoachRef("<x@y>", undefined)).toBeNull();
  });
});

describe("extractReplyText", () => {
  it("drops Gmail's quoted history, even when the attribution wraps", () => {
    const t = "Move the report to Friday please\nand I finished invoices\n\nOn Wed, Oct 15, 2026 at 7:31 AM LevelUp <\ncoach@mailbox.com> wrote:\n> Morning plan\n> blah";
    expect(extractReplyText(t)).toBe("Move the report to Friday please\nand I finished invoices");
    expect(extractReplyText("Yes do it\n\nOn Wed, Oct 15, 2026 at 7:31 AM LevelUp <c@m.com> wrote:\n> x")).toBe("Yes do it");
  });
  it("drops Outlook headers, phone signatures and the coach's own footer", () => {
    expect(extractReplyText("Sounds good\n\nFrom: LevelUp <c@m.com>\nSent: Wednesday\nTo: me\nSubject: x\nold")).toBe("Sounds good");
    expect(extractReplyText("ok\n\nSent from my iPhone")).toBe("ok");
    expect(extractReplyText("ok 2\n________________________________\nFrom: x")).toBe("ok 2");
    expect(extractReplyText("push it\nOpen in LevelUp: https://levelupnow.tools/?coach=55")).toBe("push it");
  });
  it("keeps a sentence that merely starts with 'On'", () => {
    expect(extractReplyText("On Friday I'm out, plan around it")).toBe("On Friday I'm out, plan around it");
  });
});

describe("mail helpers", () => {
  it("reads the address out of a From header", () => {
    expect(addressOf("Idris Grant <Idris.Grant@Gmail.com>")).toBe("idris.grant@gmail.com");
    expect(addressOf("me@x.com")).toBe("me@x.com");
  });
  it("recognises out-of-office replies (they would loop forever)", () => {
    expect(isAutoReply({ "auto-submitted": ["auto-replied"] }, "Re: x")).toBe(true);
    expect(isAutoReply({}, "Automatic reply: Morning plan")).toBe(true);
    expect(isAutoReply({ precedence: ["bulk"] }, "Re: x")).toBe(true);
    expect(isAutoReply({ "auto-submitted": ["no"] }, "Re: Morning plan")).toBe(false);
  });
});

describe("money for the coach", () => {
  // Local date: Saturday 2026-10-17, noon.
  const now = new Date(2026, 9, 17, 12);
  const f = parseFinance(JSON.stringify({
    accounts: [{ id: 1, name: "Checking", type: "checking", balance: 900 }, { id: 2, name: "Visa", type: "credit", balance: -3000, apr: 24 }],
    categories: [{ id: "dl-groceries", name: "Groceries", icon: "🛒", kind: "expense" }, { id: "dl-dining", name: "Dining", kind: "expense" }, { id: "xfer-transfer", name: "Transfer", kind: "transfer" }],
    budgets: { "dl-groceries": 400, "dl-dining": 200 },
    transactions: [
      { date: "2026-10-03", amount: -520, catId: "dl-groceries" },
      { date: "2026-10-05", amount: -210, catId: "dl-dining" },     // over by $10 (5%) — under the alert threshold
      { date: "2026-10-06", amount: -5000, catId: "xfer-transfer" }, // transfers never count
      { date: "2026-10-07", amount: -40 },
      { date: "2026-10-01", amount: 3000, catId: "inc-salary" },
    ],
    bills: [{ id: "b1", name: "Electric", amount: 120, dueDay: 18, autopay: false }, { id: "b2", name: "Phone", amount: 80, dueDay: 18, autopay: true }],
  }))!;
  it("alerts once-keyed on real problems only", () => {
    const issues = moneyAlertIssues(f, now);
    expect(issues.map((i) => i.key).sort()).toEqual(["due:Electric:2026-10-18", "over:2026-10:dl-groceries", "total:2026-10"].sort());
    expect(issues.find((i) => i.key.startsWith("due:"))!.text).toMatch(/Electric.*\$120.*tomorrow/);
  });
  it("summarises without transactions or payees", () => {
    const text = moneyCoachLines(f, now).join("\n");
    expect(text).toMatch(/day 17 of 31/);
    expect(text).toMatch(/Groceries \$520\/\$400 OVER/);
    expect(text).toMatch(/Uncategorized this month: 1 transactions/);
    expect(text).not.toMatch(/5,000/); // the transfer
  });
});
