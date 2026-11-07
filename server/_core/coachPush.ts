/**
 * Web push for the AI coach (build -213).
 *
 * VAPID keys are generated once and kept in system_settings (vapidPublic /
 * vapidPrivate) — no env setup needed. The private key never leaves the
 * server. Each device that turns push on stores one push_subscriptions row;
 * subscriptions the push service reports gone (404/410) are deleted.
 *
 * iPhone/iPad: Safari delivers web push only to a site installed with
 * "Add to Home Screen" (iOS 16.4+); the client explains that before asking.
 */
import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { getDb, getSystemSetting, setSystemSetting } from "../db";
import { pushSubscriptions } from "../../drizzle/schema";
import { setCoachPushHook } from "./coachCron";

let _vapid: { publicKey: string; privateKey: string } | null = null;

export async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  if (_vapid) return _vapid;
  let publicKey = (await getSystemSetting("vapidPublic")) || "";
  let privateKey = (await getSystemSetting("vapidPrivate")) || "";
  if (!publicKey || !privateKey) {
    const k = webpush.generateVAPIDKeys();
    publicKey = k.publicKey; privateKey = k.privateKey;
    await setSystemSetting("vapidPublic", publicKey);
    await setSystemSetting("vapidPrivate", privateKey);
    console.log("[push] generated VAPID keys");
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://levelupnow.tools", publicKey, privateKey);
  _vapid = { publicKey, privateKey };
  return _vapid;
}

/**
 * Audit F21: a push "endpoint" is a URL the server POSTs to, so only the real
 * Web Push services are accepted (https, default port, no credentials):
 * Chrome/Edge/Android (FCM), Firefox (Mozilla autopush), Windows (WNS) and
 * Safari/iOS (Apple). Anything else could point the server at an internal
 * address. Checked when a device subscribes AND again before each send, so a
 * row stored before this check is skipped.
 */
const PUSH_HOSTS_EXACT = new Set(["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
const PUSH_HOST_SUFFIXES = [".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com"];
export function isAllowedPushEndpoint(endpoint: unknown): boolean {
  let u: URL;
  try { u = new URL(String(endpoint ?? "")); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  if (PUSH_HOSTS_EXACT.has(h)) return true;
  // Google's push hosts are <name>.googleapis.com; only the push ones.
  if (/^(fcm|android|jmt17|push)[a-z0-9-]*\.googleapis\.com$/.test(h)) return true;
  return PUSH_HOST_SUFFIXES.some((s) => h.endsWith(s) && h.length > s.length);
}

export async function savePushSubscription(userId: number, sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) {
  if (!isAllowedPushEndpoint(sub.endpoint)) throw new Error("That push address is not a known push service");
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // An endpoint belongs to one browser profile; if another account used it
  // before (shared browser), it moves to whoever subscribed last.
  await db.insert(pushSubscriptions).values({ userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, userAgent: (sub.userAgent || "").slice(0, 255) })
    .onDuplicateKeyUpdate({ set: { userId, p256dh: sub.p256dh, auth: sub.auth, userAgent: (sub.userAgent || "").slice(0, 255), failCount: 0 } });
}

export async function removePushSubscription(userId: number, endpoint: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function countPushSubscriptions(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  return rows.length;
}

/** Send to every device of the user. Resolves true if at least one delivery succeeded. */
export async function sendPushToUser(userId: number, payload: { title: string; body: string; url?: string; tag?: string; id?: number }): Promise<{ sent: number; failed: number; lastError?: string }> {
  const db = await getDb();
  if (!db) return { sent: 0, failed: 0 };
  await getVapidKeys();
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  let sent = 0, failed = 0; let lastError: string | undefined;
  const body = JSON.stringify({ title: payload.title.slice(0, 120), body: payload.body.slice(0, 240), url: payload.url || "/", tag: payload.tag, id: payload.id });
  for (const s of subs) {
    if (!isAllowedPushEndpoint(s.endpoint)) { failed++; lastError = "endpoint is not a known push service (skipped)"; continue; }
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 6 * 3600, urgency: "normal" });
      sent++;
      await db.update(pushSubscriptions).set({ lastOkAt: new Date(), failCount: 0 }).where(eq(pushSubscriptions.id, s.id));
    } catch (e: any) {
      failed++;
      const code = Number(e?.statusCode || 0);
      lastError = `${code || ""} ${String(e?.body || e?.message || e).slice(0, 200)}`.trim();
      if (code === 404 || code === 410 || s.failCount >= 9) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      } else {
        await db.update(pushSubscriptions).set({ failCount: s.failCount + 1 }).where(eq(pushSubscriptions.id, s.id));
      }
    }
  }
  return { sent, failed, lastError };
}

// Coach check-ins deliver through here.
setCoachPushHook(async (userId, m) => {
  const r = await sendPushToUser(userId, { title: `🧭 ${m.title}`, body: m.body, url: `/?coach=${m.id}`, tag: `coach-${m.id}`, id: m.id });
  return r.sent > 0;
});
