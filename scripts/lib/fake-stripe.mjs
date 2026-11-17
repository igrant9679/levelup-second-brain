/**
 * A FAKE Stripe for tests and the local playground (build -279). Never used in
 * production: the server only talks to it when STRIPE_API_BASE points at
 * localhost (see server/_core/stripe.ts).
 *
 * It implements the handful of calls LevelUp makes — customers, prices,
 * Checkout sessions, the billing portal, subscriptions (read, change of plan,
 * cancel), subscription items, invoices —
 * and sends the same SIGNED webhooks Stripe would. The "checkout" and
 * "portal" are plain pages with buttons (Pay / Cancel subscription / Payment
 * fails / Payment succeeds), so the whole flow can be clicked through.
 *
 *   const fake = await startFakeStripe({ prices: { price_team_m: { unit_amount: 1200, interval: 'month' } },
 *                                        webhookUrl: 'http://localhost:4310/api/stripe/webhook', webhookSecret: 'whsec_test' });
 *   fake.url            → set STRIPE_API_BASE to this
 *   await fake.pay(sessionId) / fake.failPayment(subId) / fake.recover(subId) / fake.cancel(subId)
 *   fake.state          → customers, sessions, subscriptions, calls, deliveries
 *   await fake.stop()
 */
import http from 'node:http';
import crypto from 'node:crypto';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rid = (p) => p + '_' + crypto.randomBytes(9).toString('hex');

/** a[b][0][c]=1 → {a:{b:[{c:'1'}]}} */
export function parseForm(body) {
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) {
    const path = k.replace(/\]/g, '').split('[');
    let o = out;
    path.forEach((p, i) => {
      if (i === path.length - 1) o[p] = v;
      else { if (o[p] == null) o[p] = /^\d+$/.test(path[i + 1]) ? [] : {}; o = o[p]; }
    });
  }
  return out;
}

export async function startFakeStripe({ prices = {}, webhookUrl = '', webhookSecret = 'whsec_fake', secretKey = 'sk_test_fake', port = 0 } = {}) {
  const state = { customers: new Map(), sessions: new Map(), subscriptions: new Map(), invoices: [], calls: [], deliveries: [], webhookUrl, webhookSecret };
  const now = () => Math.floor(Date.now() / 1000);
  let base = '';

  const subJson = (s) => ({
    id: s.id, object: 'subscription', customer: s.customer, status: s.status, metadata: s.metadata || {},
    cancel_at_period_end: !!s.cancel_at_period_end, trial_end: s.trial_end || null, current_period_end: s.current_period_end,
    items: { object: 'list', data: [{ id: s.itemId, object: 'subscription_item', quantity: s.quantity, price: { id: s.price, object: 'price' } }] },
  });

  // An invoice as Stripe lists it (the fields LevelUp reads).
  function addInvoice(s, { status = 'paid', total = null, description = null } = {}) {
    const pr = prices[s.price] || {};
    const inv = {
      id: rid('in'), object: 'invoice', customer: s.customer, subscription: s.id, number: 'FAKE-' + String(state.invoices.length + 1).padStart(4, '0'),
      created: now(), currency: pr.currency || 'usd', status, paid: status === 'paid',
      total: total == null ? Number(pr.unit_amount || 0) * (Number(s.quantity) || 1) : total,
      period_start: now(), period_end: s.current_period_end,
      lines: { object: 'list', data: [{ description: description || `${s.quantity} × ${s.price} (${pr.interval || 'month'})`, period: { start: now(), end: s.current_period_end } }] },
    };
    inv.hosted_invoice_url = `${base}/invoice/${inv.id}`;
    inv.invoice_pdf = `${base}/invoice/${inv.id}/pdf`;
    state.invoices.unshift(inv);
    return inv;
  }

  // What a change of price / quantity costs at unix time `at`, the way Stripe prorates:
  // unused time on the old price is credited; monthly ↔ yearly starts a new period and is
  // invoiced at once, otherwise the remaining time on the new price waits for the next invoice.
  function planChange(s, price, qty, at) {
    const oldPr = prices[s.price] || {}, newPr = prices[price] || {};
    const oldAmt = Number(oldPr.unit_amount || 0) * (Number(s.quantity) || 1), newAmt = Number(newPr.unit_amount || 0) * qty;
    const currency = newPr.currency || oldPr.currency || 'usd';
    const recurring = { description: `${qty} × ${price} (${newPr.interval || 'month'})`, amount: newAmt, proration: false };
    if (s.status === 'trialing') return { now: false, lines: [recurring], prorations: [], date: s.trial_end || s.current_period_end, currency };
    const start = s.current_period_start || (s.current_period_end - (oldPr.interval === 'year' ? 365 : 30) * 86400);
    const frac = Math.min(1, Math.max(0, (s.current_period_end - at) / Math.max(1, s.current_period_end - start)));
    const unused = { description: `Unused time on ${s.quantity} × ${s.price}`, amount: -Math.round(oldAmt * frac), proration: true };
    if ((oldPr.interval || 'month') !== (newPr.interval || 'month')) {
      return { now: true, lines: [...(s.pending || []), unused, recurring], prorations: [unused], date: at, currency };
    }
    const remaining = { description: `Remaining time on ${qty} × ${price}`, amount: Math.round(newAmt * frac), proration: true };
    return { now: false, lines: [...(s.pending || []), unused, remaining, recurring], prorations: [unused, remaining], date: s.current_period_end, currency };
  }

  async function deliver(type, object) {
    const evt = { id: rid('evt'), object: 'event', type, created: now(), data: { object } };
    const payload = JSON.stringify(evt);
    if (!state.webhookUrl) { state.deliveries.push({ type, status: 0, skipped: true }); return evt; }
    const t = now();
    const v1 = crypto.createHmac('sha256', state.webhookSecret).update(`${t}.${payload}`).digest('hex');
    try {
      const r = await fetch(state.webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${v1}` }, body: payload });
      state.deliveries.push({ type, id: evt.id, status: r.status, body: await r.text().catch(() => '') });
    } catch (e) { state.deliveries.push({ type, id: evt.id, status: 0, error: String(e?.message || e) }); }
    return evt;
  }

  // ── what a person (or a test) can do ──
  async function pay(sessionId) {
    const cs = state.sessions.get(sessionId);
    if (!cs) throw new Error('no such checkout session');
    if (cs.subscription) return state.subscriptions.get(cs.subscription);
    const li = (cs.params.line_items || [])[0] || {};
    const trialEnd = Number(cs.params.subscription_data?.trial_end) || null;
    const sub = {
      id: rid('sub'), itemId: rid('si'), customer: cs.params.customer, price: li.price, quantity: Number(li.quantity) || 1,
      status: trialEnd ? 'trialing' : 'active', trial_end: trialEnd, current_period_start: now(), current_period_end: trialEnd || now() + 30 * 86400,
      metadata: cs.params.subscription_data?.metadata || {}, cancel_at_period_end: false,
    };
    state.subscriptions.set(sub.id, sub);
    cs.subscription = sub.id; cs.status = 'complete';
    if (!trialEnd) addInvoice(sub);                       // charged at once; a trial is invoiced when it ends
    await deliver('customer.subscription.created', subJson(sub));
    await deliver('checkout.session.completed', { id: cs.id, object: 'checkout.session', mode: 'subscription', customer: sub.customer, subscription: sub.id, client_reference_id: cs.params.client_reference_id || null, metadata: cs.params.metadata || {} });
    return sub;
  }
  async function failPayment(subId) {
    const s = state.subscriptions.get(subId); if (!s) throw new Error('no such subscription');
    s.status = 'past_due';
    const inv = addInvoice(s, { status: 'open' });
    await deliver('invoice.payment_failed', { id: inv.id, object: 'invoice', subscription: s.id, customer: s.customer });
    await deliver('customer.subscription.updated', subJson(s));
  }
  async function recover(subId) {
    const s = state.subscriptions.get(subId); if (!s) throw new Error('no such subscription');
    s.status = 'active'; s.trial_end = null; s.current_period_end = now() + 30 * 86400;
    const open = state.invoices.find((i) => i.subscription === s.id && i.status === 'open');
    const inv = open || addInvoice(s);
    inv.status = 'paid'; inv.paid = true;
    await deliver('invoice.paid', { id: inv.id, object: 'invoice', subscription: s.id, customer: s.customer });
    await deliver('customer.subscription.updated', subJson(s));
  }
  async function cancel(subId) {
    const s = state.subscriptions.get(subId); if (!s) throw new Error('no such subscription');
    s.status = 'canceled';
    await deliver('customer.subscription.deleted', subJson(s));
  }

  const page = (title, body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:16px system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 16px;color:#111;background:#fff}h1{font-size:20px}.note{background:#fff7d6;border:1px solid #e6c200;padding:8px 12px;border-radius:6px;font-size:14px}button,a.btn{font:inherit;padding:10px 16px;border-radius:6px;border:1px solid #333;background:#111;color:#fff;cursor:pointer;margin:6px 6px 0 0;text-decoration:none;display:inline-block}button.alt,a.btn.alt{background:#fff;color:#111}form{display:inline}</style>
<p class="note">FAKE Stripe — local testing only. No real payment happens here.</p><h1>${esc(title)}</h1>${body}`;

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const html = (code, s) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' }); res.end(s); };
    const redirect = (to) => { res.writeHead(303, { location: to }); res.end(); };
    const p = u.pathname;
    try {
      // ── the pages a customer would see ──
      let m;
      if ((m = p.match(/^\/pay\/(cs_\w+)$/)) && req.method === 'GET') {
        const cs = state.sessions.get(m[1]); if (!cs) return html(404, page('Not found', ''));
        const li = (cs.params.line_items || [])[0] || {}; const pr = prices[li.price] || {};
        const trial = cs.params.subscription_data?.trial_end ? ` First charge after the trial (${new Date(cs.params.subscription_data.trial_end * 1000).toISOString().slice(0, 10)}).` : '';
        return html(200, page('Checkout', `<p>${esc(li.quantity || 1)} × <b>${esc(li.price)}</b> — ${(Number(pr.unit_amount || 0) / 100).toFixed(2)} ${esc((pr.currency || 'usd').toUpperCase())} / ${esc(pr.interval || 'month')}.${trial}</p>
<form method="post" action="/pay/${cs.id}/complete"><button id="fake-pay">Pay</button></form><a class="btn alt" id="fake-back" href="${esc(cs.params.cancel_url || '/')}">Back</a>`));
      }
      if ((m = p.match(/^\/pay\/(cs_\w+)\/complete$/)) && req.method === 'POST') {
        const cs = state.sessions.get(m[1]); if (!cs) return html(404, page('Not found', ''));
        await pay(cs.id);
        return redirect(cs.params.success_url || '/');
      }
      if ((m = p.match(/^\/portal\/(cus_\w+)$/)) && req.method === 'GET') {
        const ret = u.searchParams.get('return') || '/';
        const subs = [...state.subscriptions.values()].filter((s) => s.customer === m[1]);
        const rows = subs.map((s) => `<p><b>${esc(s.price)}</b> × ${s.quantity} — ${esc(s.status)}</p>
<form method="post" action="/portal/${m[1]}/act?do=fail&sub=${s.id}&return=${encodeURIComponent(ret)}"><button class="alt" id="fake-fail">Payment fails</button></form>
<form method="post" action="/portal/${m[1]}/act?do=recover&sub=${s.id}&return=${encodeURIComponent(ret)}"><button class="alt" id="fake-recover">Payment succeeds</button></form>
<form method="post" action="/portal/${m[1]}/act?do=cancel&sub=${s.id}&return=${encodeURIComponent(ret)}"><button class="alt" id="fake-cancel">Cancel subscription</button></form>`).join('') || '<p>No subscriptions.</p>';
        return html(200, page('Billing portal', `${rows}<p><a class="btn" id="fake-return" href="${esc(ret)}">Return to LevelUp</a></p>`));
      }
      if ((m = p.match(/^\/portal\/(cus_\w+)\/act$/)) && req.method === 'POST') {
        const sub = u.searchParams.get('sub'); const what = u.searchParams.get('do');
        if (what === 'fail') await failPayment(sub); else if (what === 'recover') await recover(sub); else if (what === 'cancel') await cancel(sub);
        return redirect(`/portal/${m[1]}?return=${encodeURIComponent(u.searchParams.get('return') || '/')}`);
      }

      if ((m = p.match(/^\/invoice\/(in_\w+)(\/pdf)?$/)) && req.method === 'GET') {
        const inv = state.invoices.find((i) => i.id === m[1]); if (!inv) return html(404, page('Not found', ''));
        return html(200, page((m[2] ? 'Invoice PDF ' : 'Invoice ') + inv.number, `<p>${esc(inv.lines.data[0].description)}</p><p><b>${(inv.total / 100).toFixed(2)} ${esc(inv.currency.toUpperCase())}</b> — ${esc(inv.status)}</p>`));
      }

      // ── the API ──
      if (!p.startsWith('/v1/')) return send(404, { error: { message: 'not found' } });
      if ((req.headers.authorization || '') !== `Bearer ${secretKey}`) return send(401, { error: { message: 'Invalid API Key provided', type: 'invalid_request_error' } });
      const params = req.method === 'GET' ? parseForm(u.search.slice(1)) : parseForm(raw);
      state.calls.push({ method: req.method, path: p, params });
      if (p === '/v1/customers' && req.method === 'POST') {
        const c = { id: rid('cus'), object: 'customer', name: params.name || null, email: params.email || null, metadata: params.metadata || {} };
        state.customers.set(c.id, c); return send(200, c);
      }
      if ((m = p.match(/^\/v1\/prices\/([\w-]+)$/)) && req.method === 'GET') {
        const pr = prices[m[1]]; if (!pr) return send(404, { error: { message: `No such price: '${m[1]}'`, code: 'resource_missing' } });
        return send(200, { id: m[1], object: 'price', active: true, currency: pr.currency || 'usd', unit_amount: pr.unit_amount, recurring: { interval: pr.interval || 'month' } });
      }
      if (p === '/v1/checkout/sessions' && req.method === 'POST') {
        const li = (params.line_items || [])[0] || {};
        if (!prices[li.price]) return send(400, { error: { message: `No such price: '${li.price}'`, code: 'resource_missing' } });
        if (!state.customers.has(params.customer)) return send(400, { error: { message: `No such customer: '${params.customer}'`, code: 'resource_missing' } });
        const cs = { id: rid('cs'), params, status: 'open', subscription: null };
        state.sessions.set(cs.id, cs);
        return send(200, { id: cs.id, object: 'checkout.session', url: `${base}/pay/${cs.id}` });
      }
      if (p === '/v1/billing_portal/sessions' && req.method === 'POST') {
        if (!state.customers.has(params.customer)) return send(400, { error: { message: 'No such customer', code: 'resource_missing' } });
        return send(200, { id: rid('bps'), object: 'billing_portal.session', url: `${base}/portal/${params.customer}?return=${encodeURIComponent(params.return_url || '/')}` });
      }
      if (p === '/v1/subscriptions' && req.method === 'GET') {
        return send(200, { object: 'list', data: [...state.subscriptions.values()].filter((s) => !params.customer || s.customer === params.customer).map(subJson) });
      }
      if ((m = p.match(/^\/v1\/subscriptions\/(sub_\w+)$/))) {
        const s = state.subscriptions.get(m[1]); if (!s) return send(404, { error: { message: 'No such subscription', code: 'resource_missing' } });
        if (req.method === 'DELETE') { await cancel(s.id); return send(200, subJson(s)); }
        if (req.method === 'POST') {
          // change of plan / quantity / cancel-at-period-end, as LevelUp sends it
          const it = (params.items || [])[0];
          if (it) {
            if (it.id !== s.itemId) return send(400, { error: { message: `No such subscription item: '${it.id}'`, code: 'resource_missing' } });
            if (it.price != null && !prices[it.price]) return send(400, { error: { message: `No such price: '${it.price}'`, code: 'resource_missing' } });
            const at = Number(params.proration_date) || now();
            const pc = planChange(s, it.price != null ? it.price : s.price, it.quantity != null ? (Number(it.quantity) || 1) : s.quantity, at);
            if (it.price != null) s.price = it.price;
            if (it.quantity != null) s.quantity = Number(it.quantity) || 1;
            if (params.proration_behavior === 'create_prorations' && s.status === 'active') {
              if (pc.now) {
                // a new billing period from today, invoiced at once (credit included)
                s.current_period_start = at;
                s.current_period_end = at + ((prices[s.price] || {}).interval === 'year' ? 365 : 30) * 86400;
                const total = pc.lines.reduce((t, l) => t + l.amount, 0);
                s.pending = [];
                addInvoice(s, { total, description: `Change to ${s.quantity} × ${s.price} (unused time on the previous plan credited)` });
              } else {
                // same billing period: the difference is added to the next invoice
                s.pending = [...(s.pending || []), ...pc.prorations];
              }
            }
          }
          if (params.cancel_at_period_end != null) s.cancel_at_period_end = String(params.cancel_at_period_end) === 'true';
          if (params.metadata) s.metadata = Object.assign({}, s.metadata, params.metadata);
          void deliver('customer.subscription.updated', subJson(s));
          return send(200, subJson(s));
        }
        return send(200, subJson(s));
      }
      if (p === '/v1/invoices/upcoming' && req.method === 'GET') {
        // the preview of the invoice a change would lead to (subscription_items + proration date)
        const s = state.subscriptions.get(params.subscription); if (!s) return send(404, { error: { message: 'No such subscription', code: 'resource_missing' } });
        if (params.customer && params.customer !== s.customer) return send(400, { error: { message: 'The subscription does not belong to that customer' } });
        const it = (params.subscription_items || [])[0] || {};
        if (it.id && it.id !== s.itemId) return send(400, { error: { message: `No such subscription item: '${it.id}'`, code: 'resource_missing' } });
        if (it.price != null && !prices[it.price]) return send(400, { error: { message: `No such price: '${it.price}'`, code: 'resource_missing' } });
        const pc = planChange(s, it.price || s.price, it.quantity != null ? (Number(it.quantity) || 1) : s.quantity, Number(params.subscription_proration_date) || now());
        const total = pc.lines.reduce((t, l) => t + l.amount, 0);
        return send(200, { object: 'invoice', customer: s.customer, subscription: s.id, currency: pc.currency, total, subtotal: total, amount_due: Math.max(0, total),
          next_payment_attempt: pc.date, created: pc.date, period_end: pc.date, lines: { object: 'list', data: pc.lines.map((l) => ({ object: 'line_item', ...l })) } });
      }
      if (p === '/v1/invoices' && req.method === 'GET') {
        const lim = Math.max(1, Math.min(100, Number(params.limit) || 10));
        const all = state.invoices.filter((i) => !params.customer || i.customer === params.customer);
        return send(200, { object: 'list', has_more: all.length > lim, data: all.slice(0, lim) });
      }
      if ((m = p.match(/^\/v1\/subscription_items\/(si_\w+)$/)) && req.method === 'POST') {
        const s = [...state.subscriptions.values()].find((x) => x.itemId === m[1]); if (!s) return send(404, { error: { message: 'No such subscription item', code: 'resource_missing' } });
        if (params.quantity != null) s.quantity = Number(params.quantity);
        void deliver('customer.subscription.updated', subJson(s));
        return send(200, { id: s.itemId, object: 'subscription_item', quantity: s.quantity, price: { id: s.price } });
      }
      return send(404, { error: { message: `Unrecognized request URL (${req.method}: ${p})` } });
    } catch (e) { send(500, { error: { message: String(e?.message || e) } }); }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  return {
    url: base, secretKey, webhookSecret, state, pay, failPayment, recover, cancel, deliver,
    setWebhook(url) { state.webhookUrl = url; },
    lastSession() { return [...state.sessions.values()].pop() || null; },
    stop: () => new Promise((r) => server.close(() => r())),
  };
}
