export type Mode = "stopwatch" | "countdown";
export type Tag = { id: string; name: string; color: string };
export type Pause = { at: number; resumedAt?: number };
export type Session = {
  id: string;
  mode: Mode;
  tag: Tag | null; // snapshot, so analysis survives tag edits
  startedAt: number;
  plannedMs?: number; // countdown only
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
