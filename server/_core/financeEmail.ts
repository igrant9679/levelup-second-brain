/**
 * Money blocks for the daily-digest + weekly-review emails (build -176).
 *
 * Rocket-Money-style: upcoming bills, budget status, cash-vs-bills nudges,
 * and an optional AI insight paragraph. Everything is computed from the
 * user_app_data.finance blob (ONE JSON object — see the Money page docs in
 * CLAUDE.md). All category names come from f.categories inside the blob
 * itself, so the server never needs the client's catalog.
 *
 * Every function is defensive: bad/missing data returns '' / null so the
 * host email renders unchanged for non-Money users (the -172 contract).
 * The AI call is failure-safe and clamped; a provider error never blocks
 * the email.
 */

interface FinAccount { id?: string | number; name?: string; type?: string; balance?: number; apr?: number | null }
interface FinBill { id?: string | number; name?: string; amount?: number; dueDay?: number; autopay?: boolean; active?: boolean; lastPaidYM?: string }
interface FinCat { id?: string; name?: string; icon?: string; kind?: string }
interface FinTx { date?: string; amount?: number; catId?: string }
interface FinStream { name?: string; active?: boolean; expected?: number; perMonth?: Record<string, number> }
interface Finance {
  accounts: FinAccount[];
  bills: FinBill[];
  categories: FinCat[];
  transactions: FinTx[];
  budgets: Record<string, number>;
  budgetOverrides: Record<string, Record<string, number>>;
  incomeStreams: FinStream[];
  networthHistory: Array<{ ym?: string; assets?: number; debts?: number }>;
}

const isDebt = (a: FinAccount) => ['credit', 'loan'].includes(String(a.type));
const fmt = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

function ymOf(d = new Date()): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

export function parseFinance(rawFinance: string | null | undefined): Finance | null {
  if (!rawFinance) return null;
  let f: any; try { f = JSON.parse(rawFinance); } catch { return null; }
  if (!f || typeof f !== 'object') return null;
  const fin: Finance = {
    accounts: Array.isArray(f.accounts) ? f.accounts : [],
    bills: Array.isArray(f.bills) ? f.bills : [],
    categories: Array.isArray(f.categories) ? f.categories : [],
    transactions: Array.isArray(f.transactions) ? f.transactions : [],
    budgets: (f.budgets && typeof f.budgets === 'object') ? f.budgets : {},
    budgetOverrides: (f.budgetOverrides && typeof f.budgetOverrides === 'object') ? f.budgetOverrides : {},
    incomeStreams: Array.isArray(f.incomeStreams) ? f.incomeStreams : [],
    networthHistory: Array.isArray(f.networthHistory) ? f.networthHistory : [],
  };
  if (!fin.accounts.length && !fin.bills.length && !fin.transactions.length) return null;
  return fin;
}

function catName(f: Finance, id: string | undefined): string {
  const c = f.categories.find(c => c.id === id);
  if (c && c.name) return `${c.icon ? c.icon + ' ' : ''}${c.name}`;
  // fallback: 'dl-groceries' → 'Groceries'
  const tail = String(id || 'other').split('-').slice(1).join(' ') || String(id || 'other');
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

function catKind(f: Finance, id: string | undefined): string {
  const c = f.categories.find(c => c.id === id);
  return c && c.kind ? String(c.kind) : (String(id || '').startsWith('inc-') ? 'income' : 'expense');
}

function budgetFor(f: Finance, catId: string, ym: string): number {
  const ov = f.budgetOverrides[ym];
  if (ov && ov[catId] != null) return Number(ov[catId]) || 0;
  return Number(f.budgets[catId]) || 0;
}

function budgetIds(f: Finance, ym: string): string[] {
  const ids = new Set<string>(Object.keys(f.budgets));
  const ov = f.budgetOverrides[ym] || {};
  Object.keys(ov).forEach(k => ids.add(k));
  return Array.from(ids);
}

interface MoneyStats {
  ym: string;
  cash: number;            // liquid: non-debt account balances
  debt: number;
  netWorth: number;
  nwDelta: number | null;  // vs previous month's snapshot
  spent: number;           // this month, from transactions
  income: number;
  budgetTotal: number;     // expense budgets for this month
  incomeExpected: number;  // active streams
  overCats: Array<{ name: string; spent: number; budget: number }>;
  bills7: Array<{ name: string; amount: number; date: Date; autopay: boolean; today: boolean; overdue: boolean; paid: boolean }>;
  bills7Total: number;     // unpaid only
  debts: Array<{ name: string; bal: number; apr: number | null }>;
}

export function computeMoneyStats(f: Finance, now = new Date()): MoneyStats {
  const ym = ymOf(now);
  const monthTx = f.transactions.filter(t => String(t.date || '').slice(0, 7) === ym);
  const spent = -monthTx.filter(t => (t.amount || 0) < 0).reduce((s, t) => s + (t.amount || 0), 0);
  const income = monthTx.filter(t => (t.amount || 0) > 0).reduce((s, t) => s + (t.amount || 0), 0);
  const budgetTotal = budgetIds(f, ym).filter(id => catKind(f, id) !== 'income').reduce((s, id) => s + budgetFor(f, id, ym), 0);
  const incomeExpected = f.incomeStreams.filter(s => s.active !== false)
    .reduce((s, st) => s + (st.perMonth && st.perMonth[ym] != null ? Number(st.perMonth[ym]) || 0 : Number(st.expected) || 0), 0);

  const spentByCat: Record<string, number> = {};
  monthTx.forEach(t => { if ((t.amount || 0) < 0) spentByCat[String(t.catId)] = (spentByCat[String(t.catId)] || 0) - (t.amount || 0); });
  const overCats = Object.entries(spentByCat)
    .map(([id, sp]) => ({ id, spent: sp, budget: budgetFor(f, id, ym) }))
    .filter(x => x.budget > 0 && x.spent > x.budget)
    .sort((a, b) => (b.spent - b.budget) - (a.spent - a.budget))
    .slice(0, 3)
    .map(x => ({ name: catName(f, x.id), spent: x.spent, budget: x.budget }));

  const cash = f.accounts.filter(a => !isDebt(a)).reduce((s, a) => s + (a.balance || 0), 0);
  const debt = f.accounts.filter(isDebt).reduce((s, a) => s + Math.abs(a.balance || 0), 0);
  const netWorth = cash - debt;
  const hist = f.networthHistory.slice().sort((a, b) => String(a.ym).localeCompare(String(b.ym)));
  const prev = hist.filter(h => String(h.ym) < ym).slice(-1)[0];
  const nwDelta = prev ? netWorth - ((prev.assets || 0) - (prev.debts || 0)) : null;

  const todayDate = now.getDate();
  const bills7 = f.bills.filter(b => b.active !== false).map(b => {
    const day = Math.min(Math.max(1, Number(b.dueDay) || 1), 28);
    let d = new Date(now.getFullYear(), now.getMonth(), day);
    let overdue = false;
    if (day < todayDate) {
      // This month's occurrence already passed. If it was PAID, look at next
      // month's; if not, keep it in view as OVERDUE — a bill due the 28th
      // must not silently vanish from the email on the 29th-31st.
      if (String(b.lastPaidYM || '') === ym) d = new Date(now.getFullYear(), now.getMonth() + 1, day);
      else overdue = true;
    }
    const paid = String(b.lastPaidYM || '') === ymOf(d);
    return { name: String(b.name || '(bill)'), amount: Number(b.amount) || 0, date: d, autopay: !!b.autopay, today: !overdue && day === todayDate, overdue, paid };
  }).filter(x => (x.date.getTime() - now.getTime()) / 86400000 <= 7)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const bills7Total = bills7.filter(x => !x.paid).reduce((s, x) => s + x.amount, 0);

  const debts = f.accounts.filter(a => isDebt(a) && Math.abs(a.balance || 0) > 0)
    .map(a => ({ name: String(a.name || '(debt)'), bal: Math.abs(a.balance || 0), apr: a.apr != null ? Number(a.apr) : null }))
    .sort((a, b) => b.bal - a.bal);

  return { ym, cash, debt, netWorth, nwDelta, spent, income, budgetTotal, incomeExpected, overCats, bills7, bills7Total, debts };
}

function billsTableHtml(s: MoneyStats): string {
  if (!s.bills7.length) return '<div style="font-size:12px;color:#9ca3af">No bills due in the next 7 days.</div>';
  return `<table style="width:100%;border-collapse:collapse;font-size:13px">${s.bills7.slice(0, 12).map(x => `
    <tr${(x.today || x.overdue) && !x.paid ? ' style="background:#fef2f2"' : ''}>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6">${esc(x.name)}${x.autopay ? ' <span style="font-size:10px;color:#6b7280">⚡ autopay</span>' : ''}${x.paid ? ' <span style="font-size:10px;color:#10b981">✓ paid</span>' : ''}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;color:${(x.today || x.overdue) && !x.paid ? '#dc2626' : '#6b7280'};white-space:nowrap">${x.overdue ? `<strong>was due ${x.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong>` : x.today ? '<strong>TODAY</strong>' : x.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;font-weight:600${x.paid ? ';color:#9ca3af;text-decoration:line-through' : ''}">${fmt(x.amount)}</td>
    </tr>`).join('')}</table>`;
}

function nudgesHtml(s: MoneyStats): string {
  const nudges: string[] = [];
  if (s.bills7Total > 0 && s.cash > 0 && s.bills7Total > s.cash) {
    nudges.push(`⚠ <strong>Bills due in the next 7 days (${fmt(s.bills7Total)}) exceed cash on hand (${fmt(s.cash)}).</strong> Move money or reschedule before something bounces.`);
  }
  const overdueBills = s.bills7.filter(x => x.overdue && !x.paid);
  if (overdueBills.length) {
    nudges.push(`🔴 <strong>Past due and not marked paid:</strong> ${overdueBills.map(x => `${esc(x.name)} (${fmt(x.amount)}, ${x.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`).join(', ')}. Pay it or hit ✓ in Money → Bills.`);
  }
  const dueToday = s.bills7.filter(x => x.today && !x.paid && !x.autopay);
  if (dueToday.length) {
    nudges.push(`⏰ Due <strong>today</strong>, not on autopay: ${dueToday.map(x => `${esc(x.name)} (${fmt(x.amount)})`).join(', ')}.`);
  }
  for (const c of s.overCats) {
    nudges.push(`📉 <strong>${esc(c.name)}</strong> is over budget: ${fmt(c.spent)} spent of ${fmt(c.budget)}.`);
  }
  if (s.budgetTotal > 0 && s.spent > s.budgetTotal) {
    nudges.push(`🚨 Total spending this month (${fmt(s.spent)}) is past the ${fmt(s.budgetTotal)} plan.`);
  }
  if (!nudges.length) return '';
  return `<div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:10px 14px;border-radius:0 6px 6px 0;margin:10px 0;font-size:12.5px;color:#451a03;line-height:1.6">${nudges.map(n => `<div>${n}</div>`).join('')}</div>`;
}

function statsChipsHtml(s: MoneyStats): string {
  const pct = s.budgetTotal > 0 ? Math.round(s.spent / s.budgetTotal * 100) : null;
  const parts = [
    `Cash <strong>${fmt(s.cash)}</strong>`,
    s.budgetTotal > 0 ? `Spent <strong style="color:${s.spent > s.budgetTotal ? '#dc2626' : '#374151'}">${fmt(s.spent)}</strong> of ${fmt(s.budgetTotal)}${pct != null ? ` (${pct}%)` : ''}` : `Spent <strong>${fmt(s.spent)}</strong> this month`,
    s.incomeExpected > 0 ? `Income <strong style="color:#10b981">${fmt(s.income)}</strong> of ${fmt(s.incomeExpected)} expected` : null,
  ].filter(Boolean);
  return `<div style="font-size:12px;color:#6b7280;margin:6px 0">${parts.join(' &nbsp;·&nbsp; ')}</div>`;
}

/**
 * AI insight paragraph(s). mode 'daily' = one short nudge; 'weekly' = a
 * few sentences + up to 3 concrete recommendations. Returns '' on any
 * failure or when no AI key is configured — never blocks the email.
 */
export async function generateMoneyAI(s: MoneyStats, mode: 'daily' | 'weekly'): Promise<{ insight: string; actions: string[] }> {
  const empty = { insight: '', actions: [] as string[] };
  try {
    const { callAIProvider } = await import("./aiProviders");
    const compact = {
      month: s.ym, cashOnHand: Math.round(s.cash), totalDebt: Math.round(s.debt), netWorth: Math.round(s.netWorth),
      netWorthChangeVsLastMonth: s.nwDelta != null ? Math.round(s.nwDelta) : null,
      spentThisMonth: Math.round(s.spent), budgetThisMonth: Math.round(s.budgetTotal),
      incomeReceived: Math.round(s.income), incomeExpected: Math.round(s.incomeExpected),
      overBudgetCategories: s.overCats.map(c => ({ name: c.name.replace(/^[^\w]+\s*/, ''), spent: Math.round(c.spent), budget: Math.round(c.budget) })),
      billsNext7Days: s.bills7.filter(b => !b.paid).slice(0, 12).map(b => ({ name: b.name, amount: Math.round(b.amount), day: b.date.toISOString().slice(0, 10), overdue: b.overdue || undefined })),
      biggestDebts: s.debts.slice(0, 8).map(d => ({ name: d.name, balance: Math.round(d.bal), apr: d.apr })),
    };
    const sys = mode === 'daily'
      ? `You are the budget analyst inside a personal finance app, writing ONE short nudge for a daily email. Analyze ONLY the DATA. Return STRICTLY a JSON object {"insight":"<1-2 sentences, under 45 words, concrete dollar figures, the single most useful observation or nudge for TODAY>","actions":[]}. Be direct, no preamble, no investment/tax/legal advice.`
      : `You are the budget analyst inside a personal finance app, writing the Money section of a weekly email. Analyze ONLY the DATA. Return STRICTLY a JSON object {"insight":"<2-3 sentences, under 70 words, what mattered this month: spending pace, debt, cash position — concrete dollar figures>","actions":["<up to 3 short imperative recommendations, each under 20 words, most impactful first>"]}. Be direct, no preamble, no investment/tax/legal advice.`;
    const res = await callAIProvider({ provider: 'manus', systemPrompt: sys, userContent: JSON.stringify(compact).slice(0, 6000), maxTokens: 400, jsonMode: true });
    const raw = String((res as { result?: string; text?: string }).result || (res as { text?: string }).text || '').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { insight: raw.slice(0, 500), actions: [] };
    try {
      const parsed = JSON.parse(m[0]) as { insight?: string; actions?: string[] };
      return {
        insight: String(parsed.insight || '').trim().slice(0, 600),
        actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3).map(a => String(a).slice(0, 160)) : [],
      };
    } catch { return { insight: raw.slice(0, 500), actions: [] }; }
  } catch (err) {
    console.warn('[finance-email] AI insight skipped:', (err as Error).message);
    return empty;
  }
}

function aiBoxHtml(ai: { insight: string; actions: string[] }): string {
  if (!ai.insight && !ai.actions.length) return '';
  return `<div style="background:#f0fdfa;border-left:3px solid #0d9488;padding:10px 14px;border-radius:0 6px 6px 0;margin:10px 0;font-size:12.5px;color:#134e4a;line-height:1.6">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#0f766e;margin-bottom:4px">💡 AI insight</div>
    ${ai.insight ? `<div>${esc(ai.insight)}</div>` : ''}
    ${ai.actions.length ? `<ul style="margin:6px 0 0;padding-left:18px">${ai.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

/**
 * The full 💰 Money email section. mode 'daily' leads with the bills
 * heads-up + nudges; 'weekly' adds net-worth movement + debt overview.
 * Returns '' when the user has no finance data.
 */
export async function buildMoneySectionHtml(rawFinance: string | null | undefined, mode: 'daily' | 'weekly', withAI = true): Promise<{ html: string; billsDueCount: number; nudgeCount: number }> {
  const none = { html: '', billsDueCount: 0, nudgeCount: 0 };
  const f = parseFinance(rawFinance);
  if (!f) return none;
  const s = computeMoneyStats(f);
  const ai = withAI ? await generateMoneyAI(s, mode) : { insight: '', actions: [] };
  const unpaid = s.bills7.filter(x => !x.paid);
  const heads = unpaid.length
    ? `${unpaid.length} bill${unpaid.length === 1 ? '' : 's'} (~${fmt(s.bills7Total)}) due in the next 7 days`
    : 'No bills due in the next 7 days';
  const nudges = nudgesHtml(s);
  const weeklyExtras = mode === 'weekly' ? `
    <div style="font-size:13px;color:#374151;margin:6px 0">Net worth <strong style="color:${s.netWorth >= 0 ? '#10b981' : '#dc2626'}">${fmt(s.netWorth)}</strong>${s.nwDelta != null ? ` <span style="color:${s.nwDelta >= 0 ? '#10b981' : '#dc2626'};font-size:12px">(${s.nwDelta >= 0 ? '▲' : '▼'} ${fmt(Math.abs(s.nwDelta))} vs last month)</span>` : ''}${s.debt ? ` · total debt <strong style="color:#dc2626">${fmt(s.debt)}</strong>` : ''}</div>
    ${s.debts.length ? `<div style="font-size:12px;color:#6b7280;margin:2px 0 6px">Biggest debts: ${s.debts.slice(0, 3).map(d => `${esc(d.name)} <strong>${fmt(d.bal)}</strong>${d.apr ? ` @${d.apr}%` : ''}`).join(' · ')}</div>` : ''}` : '';
  const html = `<h2 style="font-size:15px;color:#0d9488;border-bottom:2px solid #0d9488;padding-bottom:4px;margin:20px 0 6px">💰 Money</h2>
  ${weeklyExtras}
  <div style="font-size:13px;color:${unpaid.length ? '#374151' : '#9ca3af'};margin-bottom:4px"><strong>${esc(heads)}</strong></div>
  ${billsTableHtml(s)}
  ${statsChipsHtml(s)}
  ${nudges}
  ${aiBoxHtml(ai)}`;
  return { html, billsDueCount: unpaid.length, nudgeCount: nudges ? 1 : 0 };
}
