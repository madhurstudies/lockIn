import { Client, Receiver } from "@upstash/qstash";
import webpush, { type PushSubscription } from "web-push";
import { get, set } from "./db";
import { finishesAt, formatDur, isPaused, remainingMs, type Session } from "./session";

// "Time's up" that survives a frozen or closed page: QStash calls /api/alarm at the countdown's end,
// which closes the session and sends a Web Push to every subscribed device.
// Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys), VAPID_SUBJECT (mailto:you@…),
// QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY, optional APP_URL. Without them the
// page-side alert is all there is.

const pub = process.env.VAPID_PUBLIC_KEY;
const priv = process.env.VAPID_PRIVATE_KEY;
const vapid = !!(pub && priv);
if (vapid) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:lockin@example.com", pub!, priv!);

const qstash = process.env.QSTASH_TOKEN ? new Client({ token: process.env.QSTASH_TOKEN }) : null;
const receiver =
  process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
    ? new Receiver({ currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY, nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY })
    : null;

export const publicKey = vapid ? pub! : null;

/** Where QStash should call back: APP_URL, else Vercel's production domain, else the request's origin. */
function base(origin: string) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return origin;
}

/** Book a callback for when a running countdown ends. Stale callbacks (paused, stopped, restarted) are ignored on arrival. */
export async function scheduleAlarm(s: Session | null, origin: string, now = Date.now()) {
  if (!qstash || !vapid || !s || s.mode !== "countdown" || isPaused(s) || remainingMs(s, now) <= 0) return; // already in overtime: it was alerted at zero
  try {
    await qstash.publishJSON({ url: `${base(origin)}/api/alarm`, body: { id: s.id }, notBefore: Math.ceil(finishesAt(s, now) / 1000) });
  } catch (e) {
    console.error("alarm schedule failed", e); // e.g. localhost isn't reachable by QStash
  }
}

export async function verify(signature: string | null, body: string) {
  if (!receiver || !signature) return false;
  return receiver.verify({ signature, body }).catch(() => false);
}

const getSubs = async () => (await get<PushSubscription[]>("push")) ?? [];

export async function addSubscription(sub: unknown) {
  const s = sub as PushSubscription;
  if (!s || typeof s.endpoint !== "string" || !s.endpoint.startsWith("https://") || typeof s.keys?.p256dh !== "string" || typeof s.keys?.auth !== "string")
    throw new Error("bad subscription");
  const rest = (await getSubs()).filter((x) => x.endpoint !== s.endpoint);
  await set("push", [...rest, { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }].slice(-10));
}

/** Push "Time's up" to every device; subscriptions the push service has dropped are forgotten. */
export async function sendDone(s: Session) {
  if (!vapid) return;
  const payload = JSON.stringify({ title: "Time's up", body: `${s.tag?.name ?? "Timer"} · ${formatDur(s.plannedMs ?? 0)} done`, keep: !s.endedAt }); // keep: still open (overtime), leave its Pause notification
  const subs = await getSubs();
  const gone = new Set<string>();
  await Promise.all(
    subs.map((sub) =>
      webpush.sendNotification(sub, payload, { TTL: 600, urgency: "high" }).catch((e: { statusCode?: number }) => {
        if (e.statusCode === 404 || e.statusCode === 410) gone.add(sub.endpoint);
      }),
    ),
  );
  if (gone.size) await set("push", subs.filter((x) => !gone.has(x.endpoint)));
}
