/**
 * A user's own clock, for the scheduled emails (daily digest, weekly review,
 * report emails). The server runs in UTC: a 07:00 digest checked against
 * server time went out around 03:00 Eastern, and "today" in the email flipped
 * to tomorrow every evening. The zone is prefs.coach.tz — written by the
 * client (or pinned in Settings → AI Coach) and already used by the coach.
 */
export const DEFAULT_TZ = "America/New_York";

export function userTz(prefs: Record<string, unknown> | null | undefined): string {
  const tz = (prefs?.coach as { tz?: unknown } | undefined)?.tz;
  if (typeof tz === "string" && tz) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { /* fall through */ }
  }
  return DEFAULT_TZ;
}

export interface UserNow {
  tz: string;
  ymd: string;       // local YYYY-MM-DD
  minutes: number;   // minutes since local midnight
  dow: number;       // 0=Sun
  dom: number;       // day of month
}

export function userNow(tz: string, now = new Date()): UserNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(now);
  const p: Record<string, string> = {};
  parts.forEach((x) => { p[x.type] = x.value; });
  const hour = p.hour === "24" ? 0 : Number(p.hour);
  return {
    tz,
    ymd: `${p.year}-${p.month}-${p.day}`,
    minutes: hour * 60 + Number(p.minute),
    dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
    dom: Number(p.day),
  };
}

/** "HH:MM" → minutes; NaN when malformed. */
export function toMinutes(hhmm: string | undefined, fallback: string): number {
  const [h, m] = String(hhmm || fallback).split(":").map((n) => parseInt(n, 10));
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
}

/** The local day (in tz) of a stored value: 'YYYY-MM-DD' stays as is. */
export function dayIn(tz: string, v: string | number | Date | null | undefined): string {
  if (v == null || v === "") return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? String(v).slice(0, 10) : userNow(tz, d).ymd;
}

/** Calendar arithmetic on 'YYYY-MM-DD' (no time zone involved). */
export function shiftDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** A date label for an email, in the user's zone. */
export function fmtDay(tz: string, opts: Intl.DateTimeFormatOptions, d = new Date()): string {
  return d.toLocaleDateString("en-US", { ...opts, timeZone: tz });
}
