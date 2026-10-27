/**
 * Two-way Outlook calendar (build -237).
 *
 * Pull: every page of /me/calendarView for the window the client asks for
 * (it used to stop at the first 50 events).
 * Push: create / move / edit / delete events on the user's own Outlook
 * calendar — only events with NO other attendees that the user organises.
 * Changing a meeting with attendees from here would make Outlook email them
 * an update or a cancellation on the user's behalf, so those stay read-only
 * in LevelUp ("Open in Outlook").
 */

export type GraphEvent = {
  id: string; subject?: string; start: { dateTime: string; timeZone?: string }; end: { dateTime: string; timeZone?: string };
  location?: { displayName?: string }; bodyPreview?: string; organizer?: { emailAddress?: { name?: string; address?: string } };
  isAllDay?: boolean; showAs?: string; isOrganizer?: boolean; isCancelled?: boolean; seriesMasterId?: string | null; type?: string;
  webLink?: string; onlineMeeting?: { joinUrl?: string } | null; attendees?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  responseStatus?: { response?: string };
};

/** Graph returns zone-less UTC times; tag them so clients read them as UTC. */
export function graphUtc(v?: { dateTime?: string; timeZone?: string } | null): string {
  const s = String(v?.dateTime ?? "");
  if (!s || /[zZ]$|[+-]\d\d:?\d\d$/.test(s)) return s;
  if (v?.timeZone && !/^(utc|etc\/utc|gmt)$/i.test(v.timeZone)) return s;
  return s.replace(/(\.\d{3})\d*$/, "$1") + "Z";
}

/** Can LevelUp change this event without notifying anyone? */
export function graphWritable(e: Pick<GraphEvent, "isOrganizer" | "attendees">): boolean {
  return e.isOrganizer !== false && !(e.attendees || []).some((a) => a && a.emailAddress && a.emailAddress.address);
}

export function graphEventOut(e: GraphEvent) {
  return {
    id: e.id,
    title: e.subject || "(No title)",
    start: graphUtc(e.start),
    end: graphUtc(e.end),
    location: e.location?.displayName ?? "",
    notes: e.bodyPreview ?? "",
    organizer: e.organizer?.emailAddress?.name ?? "",
    isAllDay: e.isAllDay ? 1 : 0,
    status: e.showAs ?? "busy",
    editable: graphWritable(e),
    seriesMasterId: e.seriesMasterId || null,
    webLink: e.webLink || null,
    joinUrl: e.onlineMeeting?.joinUrl || null,
    attendees: (e.attendees || []).slice(0, 25).map((a) => a?.emailAddress?.name || a?.emailAddress?.address || "").filter(Boolean),
    response: e.responseStatus?.response || null,
  };
}

const DOW = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export type RuleIn = { freq: "daily" | "weekly" | "monthly" | "yearly"; interval?: number; byDay?: number[]; until?: string; count?: number; startDate: string };

/** LevelUp repeat rule → Graph patternedRecurrence. */
export function ruleToGraph(r: RuleIn, timeZone: string) {
  const sd = r.startDate;
  const [y, m, d] = sd.split("-").map(Number);
  const interval = Math.max(1, Math.min(99, Number(r.interval) || 1));
  const pattern: Record<string, unknown> = { interval, firstDayOfWeek: "sunday" };
  if (r.freq === "daily") pattern.type = "daily";
  else if (r.freq === "weekly") {
    pattern.type = "weekly";
    const days = (r.byDay && r.byDay.length ? r.byDay : [new Date(Date.UTC(y, m - 1, d)).getUTCDay()]).filter((x) => x >= 0 && x <= 6);
    pattern.daysOfWeek = days.map((x) => DOW[x]);
  } else if (r.freq === "monthly") { pattern.type = "absoluteMonthly"; pattern.dayOfMonth = d; }
  else { pattern.type = "absoluteYearly"; pattern.dayOfMonth = d; pattern.month = m; }
  const range: Record<string, unknown> = { startDate: sd, recurrenceTimeZone: timeZone };
  if (r.until) { range.type = "endDate"; range.endDate = r.until; }
  else if (r.count) { range.type = "numbered"; range.numberOfOccurrences = Math.max(1, Math.min(999, r.count)); }
  else range.type = "noEnd";
  return { pattern, range };
}

export type EventIn = { title: string; start: string; end: string; isAllDay?: boolean; location?: string | null; body?: string | null; recurrence?: RuleIn };

/** The Graph body for a create/update. Never carries attendees. */
export function graphEventBody(ev: EventIn, timeZone: string, forCreate: boolean) {
  const body: Record<string, unknown> = {
    subject: ev.title,
    start: { dateTime: ev.start, timeZone },
    end: { dateTime: ev.end, timeZone },
    isAllDay: !!ev.isAllDay,
    location: { displayName: ev.location || "" },
    body: { contentType: "text", content: ev.body || "" },
  };
  if (forCreate) { body.categories = ["LevelUp"]; body.showAs = "busy"; }
  if (forCreate && ev.recurrence) body.recurrence = ruleToGraph(ev.recurrence, timeZone);
  return body;
}
