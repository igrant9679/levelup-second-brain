/**
 * Project management — delegation follow-ups (build -222): the e-mail thread
 * token, reading a delegate's reply without AI, and when an automatic
 * follow-up is due.
 */
import { describe, expect, it } from "vitest";
import { classifyReplyFallback, nudgeDue, parsePmRef, pmMessageId, pmToken, renderNudgeEmail } from "./_core/pmDelegation";
import { coachMessageId, parseCoachRef } from "./_core/coachCron";

describe("delegation thread ids", () => {
  it("round-trips and is bound to the owner", () => {
    const mid = pmMessageId(3, 42);
    expect(mid).toMatch(/^<pmd\.42\.[0-9a-f]{20}@levelupnow\.tools>$/);
    const ref = parsePmRef(`<abc@mail.gmail.com> ${mid}`)!;
    expect(ref).toEqual({ id: 42, token: pmToken(3, 42) });
    expect(pmToken(4, 42)).not.toBe(ref.token);
  });
  it("never confuses a coach thread with a delegation thread", () => {
    expect(parsePmRef(coachMessageId(3, 42))).toBeNull();
    expect(parseCoachRef(pmMessageId(3, 42))).toBeNull();
  });
});

describe("reading a delegate's reply (no-AI fallback)", () => {
  const s = (t: string) => classifyReplyFallback(t).status;
  it("recognises done, blocked, late, on track and questions", () => {
    expect(s("Done — sent it over this morning")).toBe("done");
    expect(s("Finished.")).toBe("done");
    expect(s("Not done yet, will have it Friday")).toBe("on_track");
    expect(s("Blocked: waiting on legal")).toBe("blocked");
    expect(s("Running a bit late, the client pushed back the meeting")).toBe("at_risk");
    expect(s("Which version of the template should I use?")).toBe("question");
    expect(s("ok")).toBe("unknown");
  });
});

describe("automatic follow-ups", () => {
  const today = "2026-10-20";
  it("is due on the follow-up date when auto is on (itself or via the project)", () => {
    expect(nudgeDue({ followUp: "2026-10-20", autoNudge: true }, "open", false, today)).toBe(true);
    expect(nudgeDue({ followUp: "2026-10-18" }, "blocked", true, today)).toBe(true);   // inherits project
    expect(nudgeDue({ followUp: "2026-10-18", autoNudge: false }, "open", true, today)).toBe(false); // opted out
    expect(nudgeDue({ followUp: "2026-10-18" }, "open", false, today)).toBe(false);
  });
  it("never nudges twice a day, early, or about finished work", () => {
    expect(nudgeDue({ followUp: "2026-10-21", autoNudge: true }, "open", false, today)).toBe(false);
    expect(nudgeDue({ followUp: "2026-10-20", autoNudge: true }, "done", false, today)).toBe(false);
    expect(nudgeDue({ followUp: "2026-10-20", autoNudge: true }, "cancelled", false, today)).toBe(false);
    expect(nudgeDue({ followUp: "2026-10-19", autoNudge: true, nudges: [{ at: "2026-10-20T14:00:00Z", ok: true }] }, "open", false, today)).toBe(false);
    expect(nudgeDue({ followUp: "2026-10-19", autoNudge: true, nudges: [{ at: "2026-10-20T14:00:00Z", ok: false }] }, "open", false, today)).toBe(true); // a failed send retries
  });
});

describe("the e-mail to a delegate", () => {
  it("escapes what the owner typed and words the first hand-off differently", () => {
    const base = { ownerName: "Idris Grant", personName: "Dana Lopez", taskTitle: "SOW <draft>", note: "use <b>this</b>", canReply: true };
    const nudge = renderNudgeEmail(base);
    expect(nudge).toContain("is checking in on");
    expect(nudge).toContain("SOW &lt;draft&gt;");
    expect(nudge).not.toContain("<b>this</b>");
    expect(nudge).toContain("Hi Dana");
    expect(renderNudgeEmail({ ...base, intro: true })).toContain("is handing this to you");
    expect(renderNudgeEmail({ ...base, canReply: false })).not.toContain("reply to this email");
  });
});
