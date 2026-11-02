import { randomUUID } from "node:crypto";
import { DEFAULTS, MIN_FOCUS_MAX, MIN_FOCUS_MIN, type Settings, type SettingsPatch } from "./settings";
import { dateKey, type Constraint } from "./constraints";
import { get, set } from "./db";
import { elapsedMs, isPaused, MAX_PLANNED_MS, type Mode, type Session, type Tag } from "./session";

// ponytail: sessions live in one JSON array, read-modify-write. Fine for one user and a few
// thousand sessions; move to a Redis list/sorted set if it grows or gets concurrent writers.

export const getTags = async () => (await get<Tag[]>("tags")) ?? [];
export const getSessions = async () => (await get<Session[]>("sessions")) ?? [];

async function finish(s: Session, endedAt: number) {
  const done = { ...s, endedAt };
  // an open pause closes at the end of the session
  done.pauses = s.pauses.map((p) => (p.resumedAt === undefined ? { ...p, resumedAt: endedAt } : p));
  // Too little focus to count (its minimum was fixed at the start, so this holds on any device or alarm).
  if (elapsedMs(done, endedAt) >= (s.minFocusMs ?? 0)) await set("sessions", [...(await getSessions()), done]);
  await set("active", null);
}

/** Current session; a countdown that already hit zero is finalised at its true end time. */
export async function getActive(now = Date.now()): Promise<Session | null> {
  const s = await get<Session>("active");
  if (!s) return null;
  if (s.mode === "countdown" && !isPaused(s) && elapsedMs(s, now) >= (s.plannedMs ?? 0)) {
    const overshoot = elapsedMs(s, now) - (s.plannedMs ?? 0);
    await finish(s, now - overshoot);
    return null;
  }
  return s;
}

/** Alarm callback: close countdown `id` if it is due. "early" means it is still running and needs a new alarm. */
export async function expireIfDue(id: string, now = Date.now()): Promise<Session | "early" | null> {
  const s = await get<Session>("active");
  if (!s || s.id !== id) {
    // Already closed by an open page (maybe on another device): still alert if it ran its full length just now.
    const d = (await getSessions()).findLast((x) => x.id === id);
    const full = d?.mode === "countdown" && elapsedMs(d, d.endedAt!) >= (d.plannedMs ?? 0) - 1500;
    return full && now - d.endedAt! < 120_000 ? d : null;
  }
  if (s.mode !== "countdown" || isPaused(s)) return null; // stale alarm
  const over = elapsedMs(s, now) - (s.plannedMs ?? 0);
  if (over < -1500) return "early";
  const end = now - over;
  await finish(s, end);
  return { ...s, endedAt: end };
}

export type Action =
  | { action: "start"; mode: Mode; tagId?: string | null; plannedMs?: number; minMs?: number }
  | { action: "pause" | "resume" | "stop" }
  | { action: "tag"; tagId: string | null }; // retag a paused session (zen mode)

export async function act(a: Action, now = Date.now()): Promise<Session | null> {
  const s = await getActive(now);

  if (a.action === "start") {
    if (s) return s; // already running (e.g. started from another device)
    if (a.mode !== "stopwatch" && a.mode !== "countdown") throw new Error("bad mode");
    const planned = a.mode === "countdown" ? Math.round(Number(a.plannedMs)) : undefined;
    if (a.mode === "countdown" && !(planned! > 0 && planned! <= MAX_PLANNED_MS)) throw new Error("bad duration");
    const tag = a.tagId ? ((await getTags()).find((t) => t.id === a.tagId) ?? null) : null;
    // This device's minimum (it may not sync); otherwise the shared one.
    const lo = MIN_FOCUS_MIN * 60_000, hi = MIN_FOCUS_MAX * 60_000;
    const asked = Math.round(Number(a.minMs));
    const minFocusMs = asked >= lo && asked <= hi ? asked : (await getSettings()).minFocusMins * 60_000;
    const next: Session = { id: randomUUID(), mode: a.mode, tag, startedAt: now, plannedMs: planned, minFocusMs, pauses: [] };
    await set("active", next);
    return next;
  }

  if (!s) return null;
  if (a.action === "tag" && isPaused(s)) s.tag = a.tagId ? ((await getTags()).find((t) => t.id === a.tagId) ?? null) : null;
  if (a.action === "pause" && !isPaused(s)) s.pauses.push({ at: now });
  if (a.action === "resume") s.pauses = s.pauses.map((p) => (p.resumedAt === undefined ? { ...p, resumedAt: now } : p));
  if (a.action === "stop") return void (await finish(s, now)), null;
  await set("active", s);
  return s;
}

export async function addTag(name: unknown, color: unknown): Promise<Tag> {
  const n = typeof name === "string" ? name.trim().slice(0, 24) : "";
  if (!n || typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("bad tag");
  const tag = { id: randomUUID(), name: n, color };
  await set("tags", [...(await getTags()), tag]);
  return tag;
}

/** Saved settings over the defaults; keys no longer in Settings (e.g. the old dayStartHour) are dropped. */
export async function getSettings(): Promise<Settings> {
  const saved = (await get<Partial<Settings>>("settings")) ?? {};
  const out = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, saved[k as keyof Settings] ?? v])) as Settings;
  return { ...out, sync: { ...DEFAULTS.sync, ...saved.sync } };
}

export async function saveSettings(patch: SettingsPatch): Promise<Settings> {
  const cur = await getSettings();
  const next = { ...cur, ...patch, sync: { ...cur.sync, ...patch.sync } };
  await set("settings", next);
  return next;
}

export async function deleteSession(id: string): Promise<boolean> {
  const all = await getSessions();
  const rest = all.filter((s) => s.id !== id);
  if (rest.length === all.length) return false;
  await set("sessions", rest);
  return true;
}

export const getConstraints = async () => (await get<Constraint[]>("constraints")) ?? [];

/** Replaces the list; today-only entries older than 2 days are dropped. */
export async function saveConstraints(list: Constraint[], now = Date.now()): Promise<Constraint[]> {
  const cutoff = dateKey(now - 2 * 86_400_000);
  const kept = list.filter((c) => !c.date || c.date >= cutoff);
  await set("constraints", kept);
  return kept;
}
