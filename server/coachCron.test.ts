/**
 * AI coach check-ins (build -212): scheduling in the user's own timezone, and
 * the filter that keeps a scheduled check-in from doing anything destructive.
 *
 * A check-in reads text other people wrote (Smartsheet / Nifty rows) and runs
 * while the user is away, so sanitize() must only ever let through
 * non-destructive tools aimed at task ids the model was actually shown.
 */
import { describe, expect, it } from "vitest";
import { describeAction, dueSlots, localNow, mdToEmailHtml, sanitize, slotTime } from "./_core/coachCron";

// 2026-10-14 is a Wednesday. 11:45 UTC = 07:45 in New York (EDT, UTC-4).
const AT = new Date("2026-10-14T11:45:00Z");
const ny = (iso: string) => localNow("America/New_York", new Date(iso));

describe("localNow", () => {
  it("resolves the user's local date, time and weekday", () => {
    const n = localNow("America/New_York", AT);
    expect([n.ymd, n.hhmm, n.dow]).toEqual(["2026-10-14", "07:45", 3]);
    expect(localNow("America/Los_Angeles", AT).hhmm).toBe("04:45");
  });
  it("rolls into the next day east of UTC", () => {
    const n = localNow("Asia/Tokyo", new Date("2026-10-14T16:00:00Z"));
    expect([n.ymd, n.hhmm]).toEqual(["2026-10-15", "01:00"]);
  });
  it("falls back to New York for an unknown zone", () => {
    const n = localNow("Not/AZone", AT);
    expect([n.tz, n.hhmm]).toEqual(["America/New_York", "07:45"]);
  });
});

describe("dueSlots", () => {
  const on = { enabled: true };
  it("is empty when check-ins are off", () => { expect(dueSlots({ enabled: false }, ny("2026-10-14T11:45:00Z"))).toEqual([]); });
  it("fires a slot inside its 2-hour window only", () => {
    expect(dueSlots(on, ny("2026-10-14T11:00:00Z"))).toEqual([]);              // 07:00, before
    expect(dueSlots(on, ny("2026-10-14T11:45:00Z"))).toEqual(["morning"]);     // 07:45
    expect(dueSlots(on, ny("2026-10-14T13:29:00Z"))).toEqual(["morning"]);     // 09:29
    expect(dueSlots(on, ny("2026-10-14T13:30:00Z"))).not.toContain("morning"); // 09:30, closed
    expect(dueSlots(on, ny("2026-10-14T14:05:00Z"))).toContain("midmorning"); // 10:05
  });
  it("skips weekends unless the day is chosen", () => {
    const sat = ny("2026-10-17T11:45:00Z");
    expect(dueSlots(on, sat)).toEqual([]);
    expect(dueSlots({ enabled: true, days: [6] }, sat)).toContain("morning");
  });
  it("honours per-slot switches, custom times and pauses", () => {
    const n = ny("2026-10-14T11:45:00Z");
    expect(dueSlots({ enabled: true, slots: { morning: { on: false } } }, n)).not.toContain("morning");
    expect(slotTime({ slots: { morning: { time: "07:00" } } }, "morning")).toBe("07:00");
    expect(slotTime({ slots: { morning: { time: "25:99" } } }, "morning")).toBe("07:30");
    expect(dueSlots({ enabled: true, pausedUntil: "2026-10-14" }, n)).toEqual([]);
    expect(dueSlots({ enabled: true, pausedUntil: "2026-10-13" }, n)).toEqual(["morning"]);
  });
});

describe("sanitize", () => {
  const ids = new Set(["11", "12"]);
  const reply = "Here you go:\n```json\n" + JSON.stringify({
    title: "Morning plan", body: "Do **X** first.", push: "Start with X",
    actions: [
      { tool: "update_task", args: { id: 11, myDay: true, priority: "High" }, why: "top task" },
      { tool: "update_task", args: { id: 99, myDay: true } },        // id never shown
      { tool: "update_task", args: { id: 12, status: "Done" } },     // completing
      { tool: "delete", args: { entity: "task", id: 11 } },          // destructive
      { tool: "complete_task", args: { id: 11 } },                   // not allowed
      { tool: "create_task", args: { title: "Call bank" } },
      { tool: "block_time", args: { id: 11, start: "09:00", mins: 50 } },
    ],
  }) + "\n```";
  it("keeps only safe tools on known task ids", () => {
    const s = sanitize(reply, ids)!;
    expect(s.title).toBe("Morning plan");
    expect(s.actions.map((a) => `${a.tool}:${a.args.id ?? a.args.title}`)).toEqual(["update_task:11", "create_task:Call bank", "block_time:11"]);
  });
  it("records every dropped action and why", () => {
    const s = sanitize(reply, ids)!;
    expect(s.dropped!.length).toBe(4);
    expect(s.dropped!.join(" | ")).toMatch(/unknown task.*would complete.*tool not allowed.*tool not allowed/);
  });
  it("resolves #ids and unique task names; refuses ambiguous ones (live miss 2026-10-15)", () => {
    const titles = new Map([["setup ai machines", "11"], ["fix up home deck", "12"], ["dup", ""]]);
    const r = JSON.stringify({
      title: "Midday", body: "b",
      actions: [
        { tool: "block_time", args: { id: "#11", start: "13:00", mins: 30 } },
        { tool: "update_task", args: { id: "Fix Up Home Deck", due: "2026-10-22" } },
        { tool: "update_task", args: { task: "setup ai machines", priority: "High" } },
        { tool: "update_task", args: { title: "Fix up home deck", myDay: true } },
        { tool: "update_task", args: { id: "dup", myDay: true } },
        { tool: "update_task", args: { id: "Not shown", myDay: true } },
      ],
    });
    const s = sanitize(r, ids, titles)!;
    expect(s.actions.map((a) => `${a.tool}:${a.args.id}`)).toEqual(["block_time:11", "update_task:12", "update_task:11", "update_task:12"]);
    expect(s.actions[2].args.task).toBeUndefined();
    expect(s.dropped).toHaveLength(2);
  });
  it("never treats update_task.title as a reference when an id is given (it is a rename)", () => {
    const titles = new Map([["fix up home deck", "12"]]);
    const s = sanitize(JSON.stringify({ title: "t", body: "b", actions: [{ tool: "update_task", args: { id: 11, title: "Fix up home deck" } }] }), ids, titles)!;
    expect(s.actions[0].args).toEqual({ id: "11", title: "Fix up home deck" });
  });
  it("rejects replies without JSON or without a body", () => {
    expect(sanitize("no json here", ids)).toBeNull();
    expect(sanitize('{"title":"x"}', ids)).toBeNull();
  });
});

describe("email rendering", () => {
  it("renders bold and lists and escapes HTML", () => {
    const html = mdToEmailHtml("Hello **there**\n\n- one\n- two\n1. first\n<script>x</script>");
    expect(html).toContain("<b>there</b>");
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("describes actions in plain words", () => {
    expect(describeAction({ tool: "update_task", args: { id: 11, myDay: true, priority: "High" } })).toBe("Update task #11: add to My Day, priority High");
  });
});
