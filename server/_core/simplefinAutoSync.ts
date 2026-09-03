/**
 * SimpleFIN daily auto-sync (build -179).
 *
 * Pulls every linked bank account's transactions + balances into the
 * user's Money data WITHOUT any clicking — the Rocket-Money loop. One
 * SimpleFIN request per user per run covers ALL accounts (the /accounts
 * endpoint returns everything), so this is bridge-polite.
 *
 * Cadence: the cron ticks every 30 minutes and runs a user when their
 * last auto-sync is >= 10 hours old (~2 pulls/day, drifting — fresh data
 * lands overnight AND by late afternoon, so the 7am daily digest email
 * always reports on recent transactions). Marker: finance.settings
 * ._autoSyncLastAt (ISO). Manual per-account ⟳ Sync in the client keeps
 * working independently — both paths dedupe by SimpleFIN transaction id.
 *
 * Mirrors the client's sfSync semantics exactly: dedupe key 's:'+id,
 * category RULES applied (first payee-substring match), cleared:true,
 * balance = abs(reported), 7-day re-pull overlap. The blob is re-read
 * immediately before writing to keep the read-modify-write window small
 * (whole-blob saves from a live client can still race it — same
 * characteristic every finance write has; the overnight schedule makes
 * it a non-issue in practice).
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { userAppData } from "../../drizzle/schema";

interface PullResult { linked: number; added: number; balances: number; }

/**
 * Merge one SimpleFIN /accounts payload into a finance object, in place.
 * Pure given its inputs — exported for tsx unit tests.
 */
export function mergeSimplefinPull(fin: any, sfAccounts: any[], nowYmd: string): PullResult {
  const res: PullResult = { linked: 0, added: 0, balances: 0 };
  if (!fin || typeof fin !== 'object') return res;
  fin.accounts = Array.isArray(fin.accounts) ? fin.accounts : [];
  fin.transactions = Array.isArray(fin.transactions) ? fin.transactions : [];
  const rules: any[] = Array.isArray(fin.rules) ? fin.rules : [];
  const bankMap = (fin.settings && fin.settings.bankMap) || {};

  const applyRules = (desc: string): string | null => {
    const d = String(desc || '').toLowerCase();
    if (!d) return null;
    const hit = rules.find(r => r && r.match && d.includes(String(r.match).toLowerCase()));
    return hit ? hit.catId : null;
  };
  const tsToDate = (v: any): string | null => {
    const n = Number(v);
    if (!n || !isFinite(n)) return null;
    const d = new Date(n > 1e12 ? n : n * 1000);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };
  const seen = new Set<string>();
  fin.transactions.forEach((t: any) => { const b = t.bankTxId || t.sophtronId; if (b) seen.add('s:' + b); });

  for (const sf of sfAccounts) {
    const sfId = String(sf.id ?? '');
    if (!sfId) continue;
    const localId = bankMap[sfId];
    const acct = fin.accounts.find((a: any) =>
      String(a.bankId || '') === sfId || (localId && String(a.id) === String(localId)));
    if (!acct) continue; // bridge account the user hasn't added to Money
    res.linked++;
    const bal = Number(sf.balance);
    if (isFinite(bal)) { acct.balance = Math.abs(bal); res.balances++; }
    acct.bankLastSync = nowYmd;
    for (const t of (Array.isArray(sf.transactions) ? sf.transactions : [])) {
      const id = String(t.id ?? '');
      const date = tsToDate(t.posted) || tsToDate(t.transacted_at);
      if (!id || !date) continue;
      const key = 's:' + id;
      if (seen.has(key)) continue;
      seen.add(key);
      const desc = String(t.description || t.payee || t.memo || '').slice(0, 300);
      const amount = isFinite(Number(t.amount)) ? Number(t.amount) : 0;
      const catId = applyRules(desc) || (amount > 0 ? 'inc-other' : 'misc-other');
      const memo = t.memo ? String(t.memo).slice(0, 200) : '';
      fin.transactions.push({
        id: 'sf-' + id, bankTxId: id, date,
        payee: String(t.payee || desc).slice(0, 120), catId,
        accountId: acct.id, notes: (memo && memo !== desc) ? memo : '',
        amount, cleared: true,
      });
      res.added++;
    }
  }
  return res;
}

/**
 * Bill ↔ transaction reconciliation (build -181). Mirror of the client's
 * _finBillTxMatch/_finReconcileBills — keep the rules in agreement: a tx
 * belongs to a bill when explicitly linked (recurringBillId) OR the payee
 * name-matches AND the amount is within max($10, 40%) of the plan;
 * expenses only. A current-month match auto-marks the bill paid, so the
 * Bills page and the -176 emails update with the app closed. Pure —
 * exported for tsx tests. Returns bills flipped to paid.
 */
export function reconcileBills(fin: any, nowYm: string): number {
  if (!fin || typeof fin !== 'object') return 0;
  const bills: any[] = Array.isArray(fin.bills) ? fin.bills : [];
  const txs: any[] = Array.isArray(fin.transactions) ? fin.transactions : [];
  const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const match = (b: any, t: any): boolean => {
    if ((t.amount || 0) >= 0) return false;
    if (t.recurringBillId && String(t.recurringBillId) === String(b.id)) return true;
    const bn = norm(b.name), pn = norm(t.payee);
    if (!bn || !pn || !(pn.includes(bn) || bn.includes(pn))) return false;
    const amt = Math.abs(t.amount), plan = Number(b.amount) || 0;
    if (plan <= 0) return true;
    return Math.abs(amt - plan) <= Math.max(10, plan * 0.4);
  };
  let flipped = 0;
  for (const b of bills) {
    if (b.active === false) continue;
    const hit = txs.find(t => String(t.date || '').slice(0, 7) === nowYm && match(b, t));
    if (!hit) continue;
    if (!hit.recurringBillId) hit.recurringBillId = b.id;
    if (b.lastPaidYM !== nowYm) { b.lastPaidYM = nowYm; flipped++; }
  }
  return flipped;
}

/**
 * Run one auto-sync pass. opts.userId scopes to one user; opts.force
 * ignores the 10-hour freshness gate (the simplefin.autoSyncNow mutation
 * and the client's "Sync all" button use it).
 */
export async function runSimplefinAutoSync(opts?: { userId?: number; force?: boolean }): Promise<{
  scanned: number; synced: number; added: number; skipped: number; errors: number;
}> {
  const out = { scanned: 0, synced: 0, added: 0, skipped: 0, errors: 0 };
  const db = await getDb();
  if (!db) return out;
  const { getAccess, sfGet } = await import("../routers/simplefin");

  const rows = opts?.userId
    ? await db.select({ userId: userAppData.userId, finance: userAppData.finance }).from(userAppData).where(eq(userAppData.userId, opts.userId))
    : await db.select({ userId: userAppData.userId, finance: userAppData.finance }).from(userAppData);
  out.scanned = rows.length;

  const TEN_HOURS = 10 * 3600 * 1000;
  for (const row of rows) {
    try {
      let fin: any; try { fin = JSON.parse((row as any).finance || 'null'); } catch { fin = null; }
      if (!fin || typeof fin !== 'object') { out.skipped++; continue; }
      const hasLinked = Array.isArray(fin.accounts) && fin.accounts.some((a: any) => a.bankId);
      if (!hasLinked) { out.skipped++; continue; }
      const lastAt = Date.parse((fin.settings && fin.settings._autoSyncLastAt) || '') || 0;
      if (!opts?.force && Date.now() - lastAt < TEN_HOURS) { out.skipped++; continue; }
      const accessUrl = await getAccess(db, row.userId);
      if (!accessUrl) { out.skipped++; continue; }

      // One request covers every account. 7-day overlap before the last
      // sync (dedupe makes it free); 90 days on the first-ever run.
      const startMs = lastAt ? lastAt - 7 * 86400000 : Date.now() - 90 * 86400000;
      const payload = await sfGet(accessUrl, { "start-date": String(Math.floor(startMs / 1000)) });
      const sfAccounts = Array.isArray(payload?.accounts) ? payload.accounts : [];

      // Re-read the blob right before writing to shrink the race window.
      const [fresh] = await db.select({ finance: userAppData.finance }).from(userAppData).where(eq(userAppData.userId, row.userId)).limit(1);
      let cur: any; try { cur = JSON.parse((fresh as any)?.finance || 'null'); } catch { cur = null; }
      if (!cur || typeof cur !== 'object') { out.skipped++; continue; }
      const nowYmd = new Date().toISOString().slice(0, 10);
      const res = mergeSimplefinPull(cur, sfAccounts, nowYmd);
      const billsPaid = reconcileBills(cur, nowYmd.slice(0, 7));
      cur.settings = cur.settings && typeof cur.settings === 'object' ? cur.settings : {};
      cur.settings._autoSyncLastAt = new Date().toISOString();
      await db.update(userAppData).set({ finance: JSON.stringify(cur) }).where(eq(userAppData.userId, row.userId));
      out.synced++; out.added += res.added;
      const errs = (Array.isArray(payload?.errors) ? payload.errors : []).map((e: any) => String(e).slice(0, 120));
      console.log(`[simplefin-sync] user ${row.userId}: ${res.linked} accounts, +${res.added} tx, ${res.balances} balances${billsPaid ? `, ${billsPaid} bills auto-marked paid` : ''}${errs.length ? ' · bridge says: ' + errs.join(' | ') : ''}`);
    } catch (err) {
      out.errors++;
      console.error(`[simplefin-sync] user ${row.userId} failed:`, (err as Error).message);
    }
  }
  return out;
}

let _started = false;
/** 30-minute cron; first tick 3 minutes after boot. Idempotent. */
export function startSimplefinAutoSyncCron(): void {
  if (_started) return;
  _started = true;
  const HALF_HOUR = 30 * 60 * 1000;
  setTimeout(() => {
    runSimplefinAutoSync().catch(err => console.error('[simplefin-sync] initial run failed:', err));
    setInterval(() => {
      runSimplefinAutoSync().catch(err => console.error('[simplefin-sync] tick failed:', err));
    }, HALF_HOUR);
  }, 180_000);
  console.log('[simplefin-sync] cron registered — first run in 3min, then every 30min (10h per-user freshness gate)');
}
