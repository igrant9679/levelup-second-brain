/**
 * Repeating calendar events on the server (build -236).
 *
 * The calendar grid (user_app_data.calGrid) stores a repeating event as ONE
 * row: dateStr = first occurrence, rrule = how it repeats, exdates = deleted
 * occurrences, overrides = occurrences changed on their own (keyed by their
 * rule date; an override with its own dateStr was moved to that day).
 * This mirrors the client's _calRule / _calRuleHits / _calRuleLast /
 * _calSeriesOn / _calLocalOn in client/public/js/app-5-life.js — change both
 * together. server/phase6.calrecur.test.ts runs the shipped client code
 * against these on the same fixtures.
 */

export type CalRule = { freq: "daily" | "weekly" | "monthly" | "yearly"; interval: number; byDay: number[]; until: string; count: number };
export type CalOccurrence = { date: string; start: string; end: string; title: string; row: any };

const FREQS = ["daily", "weekly", "monthly", "yearly"];
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function dayNum(ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : NaN;
}
export function ymdOf(dn: number): string {
  const d = new Date(dn * 86400000);
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}

export function calRule(e: any): CalRule | null {
  const r = e && e.rrule;
  if (!r || FREQS.indexOf(r.freq) < 0 || !YMD.test(String(e.dateStr || ""))) return null;
  const n = parseInt(r.interval, 10);
  const days = Array.isArray(r.byDay) ? r.byDay.map(Number).filter((x: number) => Number.isInteger(x) && x >= 0 && x <= 6) : [];
  return {
    freq: r.freq, interval: n > 0 ? Math.min(n, 99) : 1,
    byDay: Array.from(new Set<number>(days)).sort((a, b) => a - b),
    until: YMD.test(String(r.until || "")) ? String(r.until) : "",
    count: Math.min(Math.max(parseInt(r.count, 10) || 0, 0), 999),
  };
}

export function ruleHits(r: CalRule, s: number, dn: number): boolean {
  if (!(dn >= s)) return false;
  if (r.freq === "daily") return (dn - s) % r.interval === 0;
  const sd = new Date(s * 86400000), d = new Date(dn * 86400000);
  if (r.freq === "weekly") {
    const days = r.byDay.length ? r.byDay : [sd.getUTCDay()];
    if (days.indexOf(d.getUTCDay()) < 0) return false;
    return (((dn - d.getUTCDay()) - (s - sd.getUTCDay())) / 7) % r.interval === 0;
  }
  const months = (d.getUTCFullYear() - sd.getUTCFullYear()) * 12 + d.getUTCMonth() - sd.getUTCMonth();
  if (r.freq === "monthly") { if (months % r.interval) return false; }
  else if (d.getUTCMonth() !== sd.getUTCMonth() || (months / 12) % r.interval) return false;
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return d.getUTCDate() === Math.min(sd.getUTCDate(), last);
}

export function ruleLast(r: CalRule, s: number): number {
  let last = r.until ? dayNum(r.until) : Infinity;
  if (r.count) {
    let c = Infinity;
    if (r.freq === "daily") c = s + (r.count - 1) * r.interval;
    else { let n = 0; for (let dn = s; dn < s + 40000; dn++) { if (ruleHits(r, s, dn) && ++n >= r.count) { c = dn; break; } } }
    last = Math.min(last, c);
  }
  return last;
}

function hhmm(e: any, k: "start" | "end"): string {
  const v = String(e[k] ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/.exec(v);
  if (m) { let h = +m[1] % 24; if (m[3]) h = h % 12 + (/p/i.test(m[3]) ? 12 : 0); return `${String(h).padStart(2, "0")}:${m[2]}`; }
  const h = e[k === "start" ? "hour" : "endHour"];
  return h != null && h !== "" ? `${String(h).padStart(2, "0")}:00` : "";
}

/** Every grid event between two local dates (inclusive), repeats expanded. */
export function calOccurrencesBetween(grid: any[], from: string, to: string): CalOccurrence[] {
  const out: CalOccurrence[] = [];
  const a = dayNum(from), b = dayNum(to);
  if (!Array.isArray(grid) || !(b >= a)) return out;
  const push = (row: any, date: string, ov?: any) => {
    const e = Object.assign({}, row, ov || {});
    out.push({ date, start: hhmm(e, "start"), end: hhmm(e, "end"), title: String(e.title || ""), row });
  };
  for (const e of grid) {
    if (!e || e._pendingDelete) continue;
    const r = calRule(e);
    if (r) {
      const s = dayNum(e.dateStr), last = ruleLast(r, s);
      const ov = e.overrides && typeof e.overrides === "object" ? e.overrides : {};
      const ex: string[] = Array.isArray(e.exdates) ? e.exdates : [];
      // Rule dates, plus up to 31 days either side for occurrences moved into the range.
      for (let dn = Math.max(s, a - 31); dn <= Math.min(b + 31, last) && dn - a < 800; dn++) {
        if (!ruleHits(r, s, dn)) continue;
        const key = ymdOf(dn);
        if (ex.indexOf(key) >= 0) continue;
        const o = ov[key];
        const date = o && o.dateStr ? String(o.dateStr) : key;
        const d = dayNum(date);
        if (d >= a && d <= b) push(e, date, o);
      }
    } else if (YMD.test(String(e.dateStr || ""))) {
      const d = dayNum(e.dateStr);
      if (d >= a && d <= b) push(e, e.dateStr);
    } else if (/^weekly$/i.test(String(e.repeat || "")) && Number.isInteger(e.day)) {
      // Undated "every week" rows: day is 0=Mon.
      for (let dn = a; dn <= b && dn - a < 800; dn++) {
        if ((new Date(dn * 86400000).getUTCDay() + 6) % 7 === e.day) push(e, ymdOf(dn));
      }
    }
  }
  return out;
}
