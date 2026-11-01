import { byHourOfDay } from "./analysis.ts";
import { elapsedMs, type Session } from "./session.ts";

// Lock In helper: a tiny model fitted to the user's own history (session length and the hours they
// usually focus), used to lay out the sessions still needed to hit today's target before 23:59.

const MIN = 60_000;
const STEP = 5 * MIN;
const SHORTEST = 10 * MIN; // never suggest a block shorter than this
const roundUp = (t: number, step: number) => Math.ceil(t / step) * step;

export type Habits = { lengthMs: number; breakMs: number; weights: number[]; learned: boolean };

/** Typical session length (median of sessions ≥ 10m, 20–90m, default 45m), a break to match, and how
 *  much each clock hour is favoured: 0.25 floor plus up to 0.75 by share of past focus in that hour. */
export function learn(history: Session[], now: number): Habits {
  const lengths = history.filter((s) => s.endedAt).map((s) => elapsedMs(s, s.endedAt!)).filter((ms) => ms >= SHORTEST).sort((a, b) => a - b);
  const median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 45 * MIN;
  const lengthMs = Math.min(90 * MIN, Math.max(20 * MIN, Math.round(median / STEP) * STEP));
  const breakMs = lengthMs <= 30 * MIN ? 5 * MIN : lengthMs <= 60 * MIN ? 10 * MIN : 15 * MIN;

  const byHour = Array(24).fill(0) as number[];
  for (const { values } of byHourOfDay(history, 0, now).values()) values.forEach((v, h) => (byHour[h] += v));
  const peak = Math.max(...byHour);
  const weights = byHour.map((v) => (peak ? 0.25 + (0.75 * v) / peak : 1));
  return { lengthMs, breakMs, weights, learned: lengths.length >= 3 };
}

export type Block = { start: number; ms: number };
export type Plan =
  | { status: "met" }
  | { status: "plan" | "tight" | "short"; blocks: Block[]; plannedMs: number; leftMs: number; breakMs: number };

/** Sessions worth `leftMs`, between `from` and `dayEnd`. "plan": fits with the usual breaks, placed in the
 *  user's favoured hours (sooner wins ties); "tight": fits only back to back with 5m breaks; "short": can't
 *  fit, so this is the most that can still be done. */
export function plan(leftMs: number, from: number, dayEnd: number, h: Habits): Plan {
  if (leftMs <= 0) return { status: "met" };
  const start = roundUp(from, STEP);
  const n = Math.max(1, Math.round(leftMs / h.lengthMs));
  const size = Math.max(SHORTEST, roundUp(leftMs / n, STEP));
  const span = (gap: number) => n * size + (n - 1) * gap;
  const done = (status: "plan" | "tight" | "short", blocks: Block[], breakMs: number) =>
    ({ status, blocks, plannedMs: blocks.reduce((a, b) => a + b.ms, 0), leftMs, breakMs });

  if (span(h.breakMs) <= dayEnd - start) {
    const placed = place(n, size, start, dayEnd, h);
    return done("plan", placed ?? pack(n, size, start, h.breakMs, dayEnd), h.breakMs);
  }
  if (span(STEP) <= dayEnd - start) return done("tight", pack(n, size, start, STEP, dayEnd), STEP);
  return done("short", pack(Infinity, h.lengthMs, start, STEP, dayEnd), STEP);
}

/** Back to back from `start`, `gap` apart, last block trimmed to the day's end (dropped under 10m). */
function pack(n: number, size: number, start: number, gap: number, dayEnd: number): Block[] {
  const out: Block[] = [];
  for (let t = start; out.length < n && dayEnd - t >= SHORTEST; t += size + gap)
    out.push({ start: t, ms: Math.min(size, Math.floor((dayEnd - t) / STEP) * STEP) });
  return out;
}

/** Greedy: best-scoring 15-minute slot first, keeping a break either side of every block. Null if it paints itself into a corner. */
function place(n: number, size: number, start: number, dayEnd: number, h: Habits): Block[] | null {
  const slots: { t: number; score: number }[] = [];
  const range = Math.max(1, dayEnd - start);
  for (let t = start; t + size <= dayEnd; t = t === start ? roundUp(t + 1, 15 * MIN) : t + 15 * MIN) {
    let fit = 0, k = 0; // mean hour weight across the block, sampled every 5 minutes
    for (let x = t; x < t + size; x += STEP, k++) fit += h.weights[new Date(x).getHours()];
    slots.push({ t, score: (fit / k) * (1 - (0.5 * (t - start)) / range) }); // later in the day counts a little less
  }
  slots.sort((a, b) => b.score - a.score || a.t - b.t);
  const out: Block[] = [];
  for (const { t } of slots) {
    if (out.length === n) break;
    if (out.every((b) => t >= b.start + b.ms + h.breakMs || t + size + h.breakMs <= b.start)) out.push({ start: t, ms: size });
  }
  return out.length === n ? out.sort((a, b) => a.start - b.start) : null;
}
