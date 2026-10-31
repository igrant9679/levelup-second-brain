/**
 * Bill schedules (build -246). A bill repeats weekly, every 2 weeks, twice a
 * month, monthly (the default — every bill before -246), quarterly, every 6
 * months or yearly. The SAME rules run in the browser (app-part2.js block
 * "Bill schedules (build -246)") — server/phase6.bills.test.ts runs both on
 * the same bills and requires the same answers. Change both together.
 *
 * Fields: freq; dueDay (1–28, the day of the month for month-based
 * schedules; the first day for twice-a-month); dueDay2 (the second day);
 * startDate (YYYY-MM-DD, anchors weekly/biweekly and which months a
 * quarterly/6-monthly/yearly bill falls in); paidThrough (the due date last
 * paid). lastPaidYM (the month paid, all that existed before -246) is still
 * written and still read when paidThrough is missing.
 *
 * Dates are 'YYYY-MM-DD' strings in the user's own calendar; arithmetic uses
 * whole UTC days so time zones and DST can't shift a due date.
 */
export const BILL_PER_MONTH: Record<string, number> = { weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1, quarterly: 1 / 3, semiannual: 1 / 6, yearly: 1 / 12 };
const STEP_DAYS: Record<string, number> = { weekly: 7, biweekly: 14 };
const STEP_MONTHS: Record<string, number> = { semimonthly: 1, monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };
const PERIOD_DAYS: Record<string, number> = { weekly: 7, biweekly: 14, semimonthly: 16, monthly: 31, quarterly: 92, semiannual: 183, yearly: 366 };

export interface ScheduledBill { freq?: string; dueDay?: number; dueDay2?: number; startDate?: string; paidThrough?: string; lastPaidYM?: string; amount?: number; [k: string]: any }

const pad = (n: number) => String(n).padStart(2, '0');
export function billFreq(b: ScheduledBill): string { return b && BILL_PER_MONTH[String(b.freq)] ? String(b.freq) : 'monthly'; }
export function billMonthly(b: ScheduledBill): number { return (Number(b && b.amount) || 0) * BILL_PER_MONTH[billFreq(b)]; }
function dayNum(ymd: string): number { const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number); return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / 864e5); }
function fromDay(n: number): string { const d = new Date(n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
function day1(b: ScheduledBill): number { return Math.min(Math.max(1, Number(b.dueDay) || 1), 28); }
function day2(b: ScheduledBill): number {
  const d = Number(b.dueDay2);
  if (d >= 1 && d <= 28) return d;
  const a = day1(b); return a <= 13 ? a + 15 : a - 14;
}
function anchor(b: ScheduledBill): string {
  const s = String(b.startDate || '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '2026-01-' + pad(day1(b));
}

/** Due dates of a bill from `from` to `to` (inclusive), oldest first. */
export function billOccurrences(b: ScheduledBill, from: string, to: string): string[] {
  const fq = billFreq(b), F = dayNum(from), T = dayNum(to), out: string[] = [];
  if (T < F) return out;
  if (STEP_DAYS[fq]) {
    const step = STEP_DAYS[fq], a = dayNum(anchor(b));
    for (let n = a + Math.ceil((F - a) / step) * step; n <= T; n += step) out.push(fromDay(n));
    return out;
  }
  const step = STEP_MONTHS[fq];
  const am = (() => { const [y, m] = anchor(b).split('-').map(Number); return y * 12 + m - 1; })();
  const days = fq === 'semimonthly' ? [day1(b), day2(b)].sort((x, y) => x - y) : [day1(b)];
  const [fy, fm] = from.split('-').map(Number), [ty, tm] = to.split('-').map(Number);
  for (let mi = fy * 12 + fm - 1; mi <= ty * 12 + tm - 1; mi++) {
    if ((((mi - am) % step) + step) % step !== 0) continue;
    const y = Math.floor(mi / 12), m = mi % 12 + 1;
    for (const d of days) { const s = y + '-' + pad(m) + '-' + pad(d); const n = dayNum(s); if (n >= F && n <= T) out.push(s); }
  }
  return out;
}

/** The due date last paid ('' if none known). */
export function billPaidThrough(b: ScheduledBill): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(b.paidThrough || ''))) return String(b.paidThrough);
  const ym = String(b.lastPaidYM || '');
  if (!/^\d{4}-\d{2}$/.test(ym)) return '';
  const occ = billOccurrences(b, ym + '-01', ym + '-28');
  return occ.length ? occ[occ.length - 1] : '';
}

/**
 * The bill's current due date: the first one after the date last paid. With
 * nothing paid (or paid over a year ago) nothing before the current window
 * counts as missed — this month for month-based schedules, the last step for
 * weekly ones (before -246 an unpaid monthly bill was simply due this month).
 */
export function billDue(b: ScheduledBill, today: string): string {
  const fq = billFreq(b), T = dayNum(today), per = PERIOD_DAYS[fq];
  const start = STEP_DAYS[fq] ? T - STEP_DAYS[fq] + 1 : dayNum(today.slice(0, 7) + '-01');
  const pt = billPaidThrough(b);
  const from = pt && dayNum(pt) >= start - 400 ? dayNum(pt) + 1 : start;
  const occ = billOccurrences(b, fromDay(from), fromDay(Math.max(from, T) + per * 2 + 31));
  return occ[0] || fromDay(T);
}
export function billOverdue(b: ScheduledBill, today: string): boolean { return dayNum(billDue(b, today)) < dayNum(today); }
/** Paid within the last period (the "✓ paid" chip). */
export function billPaidRecently(b: ScheduledBill, today: string): boolean {
  const pt = billPaidThrough(b);
  return !!pt && dayNum(pt) > dayNum(today) - PERIOD_DAYS[billFreq(b)] && dayNum(pt) <= dayNum(today) + PERIOD_DAYS[billFreq(b)];
}
export function billSetPaid(b: ScheduledBill, due: string): void { b.paidThrough = due; b.lastPaidYM = due.slice(0, 7); }
/** Days before a due date that a payment still counts for it. */
export function billWindow(b: ScheduledBill): number { return Math.min(10, Math.floor(PERIOD_DAYS[billFreq(b)] / 2)); }

/**
 * After new bank data: if a matching charge landed between `window` days
 * before the current due date and today, that due date is paid. Returns the
 * transaction used (stamped with the bill's id) or null.
 */
export function billReconcile<T extends { date?: string; recurringBillId?: any; billPaidDue?: string }>(b: ScheduledBill & { id?: any }, txs: T[], match: (b: any, t: T) => boolean, today: string): T | null {
  const due = billDue(b, today), w = billWindow(b);
  const D = dayNum(due), N = dayNum(today);
  if (D - N > w) return null;
  // A charge pays ONE due date (-258) — billPaidDue records which. Mirror of
  // the client's _finBillReconcileOne.
  const hit = txs.filter(t => { const d = dayNum(String(t.date || '')); return d >= D - w && d <= N && match(b, t) && (!t.recurringBillId || String(t.recurringBillId) === String(b.id)) && (!t.billPaidDue || t.billPaidDue === due); })
    .sort((x, y) => String(y.date).localeCompare(String(x.date)))[0];
  if (!hit) return null;
  if (!hit.recurringBillId) hit.recurringBillId = b.id;
  hit.billPaidDue = due;
  billSetPaid(b, due);
  return hit;
}
