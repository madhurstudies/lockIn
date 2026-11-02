import { byHourOfDay } from "./analysis.ts";
import type { Busy } from "./constraints.ts";
import { elapsedMs, pausedMs, remainingMs, type Session } from "./session.ts";

// Lock In helper: a tiny model fitted to the user's own history (session length and the hours they
// usually focus), used to lay out the sessions still needed to hit today's target before 23:59.

const MIN = 60_000;
const STEP = 5 * MIN;
const SHORTEST = 10 * MIN; // never suggest a block shorter than this
const roundUp = (t: number, step: number) => Math.ceil(t / step) * step;

export type Habits = {
  lengthMs: number; breakMs: number; weights: number[]; learned: boolean;
  pauseRate: number; // paused ms per focused ms (0..0.5): how much longer than its focus time a session takes on the clock
  pauseMs: number; // typical single pause (0 = none seen)
  pausesPerHour: number; // pauses per hour of focus
};

const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0);

/** Learned from focus data only: session length, pauses (how often, how long), the gaps you leave between
 *  sessions, and how much each clock hour is favoured (0.25 floor plus up to 0.75 by share of past focus). */
export function learn(history: Session[], now: number): Habits {
  const done = history.filter((s) => s.endedAt).sort((a, b) => a.startedAt - b.startedAt);
  const lengths = done.map((s) => elapsedMs(s, s.endedAt!)).filter((ms) => ms >= SHORTEST);
  const lengthMs = Math.min(90 * MIN, Math.max(20 * MIN, Math.round((median(lengths) || 45 * MIN) / STEP) * STEP));
  const byLength = lengthMs <= 30 * MIN ? 5 * MIN : lengthMs <= 60 * MIN ? 10 * MIN : 15 * MIN;

  // Breaks: real gaps (1m..60m) between consecutive sessions on the same day; longer gaps are just time away.
  const gaps: number[] = [];
  for (let i = 1; i < done.length; i++) {
    const g = done[i].startedAt - done[i - 1].endedAt!;
    if (g >= MIN && g <= 60 * MIN && new Date(done[i].startedAt).toDateString() === new Date(done[i - 1].endedAt!).toDateString()) gaps.push(g);
  }
  const breakMs = gaps.length >= 3 ? Math.min(30 * MIN, Math.max(STEP, Math.round(median(gaps) / STEP) * STEP)) : byLength;

  const focus = done.reduce((a, s) => a + elapsedMs(s, s.endedAt!), 0);
  const paused = done.reduce((a, s) => a + pausedMs(s, s.endedAt!), 0);
  const pauses = done.flatMap((s) => s.pauses.filter((p) => p.resumedAt !== undefined).map((p) => p.resumedAt! - p.at));
  const pauseRate = focus ? Math.min(0.5, paused / focus) : 0;

  const byHour = Array(24).fill(0) as number[];
  for (const { values } of byHourOfDay(history, 0, now).values()) values.forEach((v, h) => (byHour[h] += v));
  const peak = Math.max(...byHour);
  const weights = byHour.map((v) => (peak ? 0.25 + (0.75 * v) / peak : 1));
  return {
    lengthMs, breakMs, weights, learned: lengths.length >= 3,
    pauseRate, pauseMs: median(pauses), pausesPerHour: focus ? pauses.length / (focus / (60 * MIN)) : 0,
  };
}

/** What still has to be planned: focus left to reach the target, and when the next session could start.
 *  A running countdown is already booked (plan after its end); a stopwatch is assumed to stop now. */
export function needed(targetMs: number, doneMs: number, active: Session | null, now: number, h: Habits) {
  let left = targetMs - doneMs, from = now;
  if (active?.mode === "countdown") { const r = remainingMs(active, now); left -= r; from = now + r + h.breakMs; }
  else if (active) from = now + h.breakMs;
  return { left, from };
}

export type Block = { start: number; ms: number; wall: number }; // ms = focus time, wall = clock time incl. expected pauses
export type Plan =
  | { status: "met" }
  | { status: "plan" | "tight" | "short"; blocks: Block[]; plannedMs: number; leftMs: number; breakMs: number };

/** [from, dayEnd] minus the busy intervals; slivers under 10 minutes are dropped. */
export function freeWindows(from: number, dayEnd: number, busy: Busy[]): Busy[] {
  const out: Busy[] = [];
  let t = from;
  for (const b of [...busy].sort((x, y) => x.start - y.start)) {
    if (b.start > t) out.push({ start: t, end: Math.min(b.start, dayEnd) });
    t = Math.max(t, b.end);
  }
  if (t < dayEnd) out.push({ start: t, end: dayEnd });
  return out.filter((w) => w.end - w.start >= SHORTEST);
}

const wallOf = (ms: number, rate: number) => Math.ceil((ms * (1 + rate)) / STEP) * STEP;

/** Sessions worth `leftMs`, between `from` and `dayEnd`, avoiding `busy` commitments. "plan": fits with the usual
 *  breaks, placed in the user's favoured hours (sooner wins ties); "tight": fits only back to back with 5m breaks;
 *  "short": can't fit, so this is the most that can still be done. Each block's clock time includes the pauses
 *  the user usually takes, so it won't run into the next commitment. */
export function plan(leftMs: number, from: number, dayEnd: number, h: Habits, busy: Busy[] = []): Plan {
  if (leftMs <= 0) return { status: "met" };
  const start = roundUp(from, STEP);
  const wins = freeWindows(start, dayEnd, busy);
  const n = Math.max(1, Math.round(leftMs / h.lengthMs));
  const size = Math.max(SHORTEST, roundUp(leftMs / n, STEP));
  const wall = wallOf(size, h.pauseRate);
  const done = (status: "plan" | "tight" | "short", blocks: Block[], breakMs: number) =>
    ({ status, blocks, plannedMs: blocks.reduce((a, b) => a + b.ms, 0), leftMs, breakMs });
  // Do n blocks of `wall` with `gap` between them fit across the free windows?
  const fits = (gap: number) => wins.reduce((k, w) => k + Math.floor((w.end - w.start + gap) / (wall + gap)), 0) >= n;

  if (fits(h.breakMs)) {
    const placed = place(n, size, wall, wins, start, dayEnd, h);
    return done("plan", placed ?? pack(n, size, wins, h.breakMs, h.pauseRate), h.breakMs);
  }
  if (fits(STEP)) return done("tight", pack(n, size, wins, STEP, h.pauseRate), STEP);
  return done("short", pack(Infinity, h.lengthMs, wins, STEP, h.pauseRate), STEP);
}

/** Back to back through each free window, `gap` apart; a block that would overrun its window is trimmed (dropped under 10m). */
function pack(n: number, size: number, wins: Busy[], gap: number, rate: number): Block[] {
  const out: Block[] = [];
  for (const w of wins)
    for (let t = w.start; out.length < n; ) {
      const room = w.end - t;
      const ms = Math.min(size, Math.floor(room / (1 + rate) / STEP) * STEP);
      if (ms < SHORTEST) break;
      const len = Math.min(room, wallOf(ms, rate));
      out.push({ start: t, ms, wall: len });
      t += len + gap;
    }
  return out;
}

/** Greedy: best-scoring 15-minute slot first, keeping a break either side of every block. Null if it paints itself into a corner. */
function place(n: number, size: number, wall: number, wins: Busy[], start: number, dayEnd: number, h: Habits): Block[] | null {
  const slots: { t: number; score: number }[] = [];
  const range = Math.max(1, dayEnd - start);
  for (const w of wins)
    for (let t = w.start; t + wall <= w.end; t = t === w.start ? roundUp(t + 1, 15 * MIN) : t + 15 * MIN) {
      let fit = 0, k = 0; // mean hour weight across the block, sampled every 5 minutes
      for (let x = t; x < t + size; x += STEP, k++) fit += h.weights[new Date(x).getHours()];
      slots.push({ t, score: (fit / k) * (1 - (0.5 * (t - start)) / range) }); // later in the day counts a little less
    }
  slots.sort((a, b) => b.score - a.score || a.t - b.t);
  const out: Block[] = [];
  for (const { t } of slots) {
    if (out.length === n) break;
    if (out.every((b) => t >= b.start + b.wall + h.breakMs || t + wall + h.breakMs <= b.start)) out.push({ start: t, ms: size, wall });
  }
  return out.length === n ? out.sort((a, b) => a.start - b.start) : null;
}
