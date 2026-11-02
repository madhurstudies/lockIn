export type Mode = "stopwatch" | "countdown";
export type Tag = { id: string; name: string; color: string };
export type Pause = { at: number; resumedAt?: number };
export type Session = {
  id: string;
  mode: Mode;
  tag: Tag | null; // snapshot, so analysis survives tag edits
  startedAt: number;
  plannedMs?: number; // countdown only
  minFocusMs?: number; // fixed when it starts: ending with less focused time than this discards it instead of recording it
  pauses: Pause[];
  endedAt?: number;
};

export const MAX_PLANNED_MS = 3 * 60 * 60 * 1000;

export const isPaused = (s: Session) => s.pauses.some((p) => p.resumedAt === undefined);

/** Total time spent paused up to `now` (or the session's end). */
export function pausedMs(s: Session, now: number): number {
  const end = s.endedAt ?? now;
  return s.pauses.reduce((t, p) => t + Math.max(0, (p.resumedAt ?? end) - p.at), 0);
}

/** Focused time: wall time minus pauses. Never drifts, derived from timestamps only. */
export const elapsedMs = (s: Session, now: number) =>
  Math.max(0, (s.endedAt ?? now) - s.startedAt - pausedMs(s, now));

export const remainingMs = (s: Session, now: number) =>
  Math.max(0, (s.plannedMs ?? 0) - elapsedMs(s, now));

/** Moment a running countdown reaches zero (only meaningful while not paused). */
export const finishesAt = (s: Session, now: number) => now + remainingMs(s, now);

/** Focus time accumulated up to absolute time `t` (pauses before `t` removed). */
export function elapsedAt(s: Session, t: number): number {
  const paused = s.pauses.reduce((sum, p) => (p.at >= t ? sum : sum + Math.min(p.resumedAt ?? t, t) - p.at), 0);
  return Math.max(0, t - s.startedAt - paused);
}

export type Seg = { from: number; to: number; paused: boolean };

/** Focus and paused intervals of a session in order; an unfinished session runs to `now`. */
export function segments(s: Session, now = Date.now()): Seg[] {
  const end = s.endedAt ?? now;
  const out: Seg[] = [];
  let at = s.startedAt;
  for (const p of s.pauses) {
    const resumed = p.resumedAt ?? end;
    out.push({ from: at, to: p.at, paused: false }, { from: p.at, to: resumed, paused: true });
    at = resumed;
  }
  out.push({ from: at, to: end, paused: false });
  return out.filter((x) => x.to > x.from);
}

/** Focused ms of `s` that fall inside [from, to]; this is how sessions split across midnight. */
export function focusIn(s: Session, from: number, to: number, now = Date.now()): number {
  return segments(s, now).reduce(
    (sum, x) => (x.paused ? sum : sum + Math.max(0, Math.min(x.to, to) - Math.max(x.from, from))),
    0,
  );
}

/** Typed duration → whole minutes clamped to 1..`max` (default 180), or null. Accepts 25, 90, 1:30, 2h, 45m, 1h30m. */
export function parseDuration(input: string, max = MAX_PLANNED_MS / 60_000): number | null {
  const str = input.trim().toLowerCase();
  let mins: number;
  const colon = str.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colon) mins = Number(colon[1]) * 60 + Number(colon[2]);
  else {
    const m = str.match(/^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*(?:m(?:ins?|inutes?)?)?)?$/);
    if (!m || (m[1] === undefined && m[2] === undefined)) return null;
    mins = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  }
  return mins > 0 ? Math.min(mins, max) : null;
}

export function formatDur(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 1) return ms < 1000 ? "0m" : `${Math.round(ms / 1000)}s`;
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/** formatDur without a trailing " 00m", for round targets: "4h", "4h 30m", "45m". */
export const formatShort = (ms: number) => formatDur(ms).replace(/ 00m$/, "");
