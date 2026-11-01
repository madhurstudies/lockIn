import { segments, type Session } from "./session.ts";

export type Part = { key: string; name: string; color: string };
export const OTHER: Part = { key: "other", name: "Other", color: "var(--chart-muted)" };
const NONE: Part = { key: "none", name: "No tag", color: "#8e8e93" };

export const partOf = (s: Session): Part => (s.tag ? { key: s.tag.id, name: s.tag.name, color: s.tag.color } : NONE);

export type Buckets = Map<string, { part: Part; values: number[] }>;

function add(out: Buckets, s: Session, i: number, n: number, ms: number) {
  const part = partOf(s);
  const e = out.get(part.key) ?? { part, values: Array(n).fill(0) };
  e.values[i] += ms;
  out.set(part.key, e);
}

/** Focused ms per bucket and tag. `bounds` are ascending edges (n+1 for n buckets); a session spanning
 *  an edge is split by the clock, so a 23:00-01:00 session gives 1h to each side. */
export function bucketize(sessions: Session[], bounds: number[], now: number): Buckets {
  const out: Buckets = new Map();
  const n = bounds.length - 1;
  for (const s of sessions)
    for (const x of segments(s, now))
      if (!x.paused)
        for (let i = 0; i < n; i++) {
          const ms = Math.min(x.to, bounds[i + 1]) - Math.max(x.from, bounds[i]);
          if (ms > 0) add(out, s, i, n, ms);
        }
  return out;
}

/** Focused ms per clock hour (0-23) inside [from, now], per tag. */
export function byHourOfDay(sessions: Session[], from: number, now: number): Buckets {
  const out: Buckets = new Map();
  for (const s of sessions)
    for (const x of segments(s, now)) {
      if (x.paused) continue;
      for (let t = Math.max(x.from, from); t < x.to; ) {
        const d = new Date(t);
        const next = new Date(t).setHours(d.getHours() + 1, 0, 0, 0);
        add(out, s, d.getHours(), 24, Math.min(next, x.to) - t);
        t = next;
      }
    }
  return out;
}

export type Stack = { name: string; colour: string; values: number[] };

/** Per-tag stacks (top 5 plus Other) or one summed series, in the chosen unit. */
export function toSeries(b: Buckets, n: number, mode: "tag" | "total", unitMs: number) {
  const rows = [...b.values()].sort((p, q) => sum(q.values) - sum(p.values));
  const total = Array.from({ length: n }, (_, i) => rows.reduce((a, r) => a + r.values[i], 0) / unitMs);
  if (mode === "total") return { values: total, stacks: null };
  const top = rows.slice(0, 5).map((r) => ({ name: r.part.name, colour: r.part.color, values: r.values.map((v) => v / unitMs) }));
  const rest = rows.slice(5);
  if (rest.length) top.push({ name: OTHER.name, colour: OTHER.color, values: Array.from({ length: n }, (_, i) => rest.reduce((a, r) => a + r.values[i], 0) / unitMs) });
  return { values: total, stacks: top };
}

const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);

import { focusIn, formatDur } from "./session.ts";
export { focusIn, formatDur };

/** Paused ms of `s` inside [from, to]. */
export function pausedIn(s: Session, from: number, to: number, now: number): number {
  return segments(s, now).reduce((a, x) => (x.paused ? a + Math.max(0, Math.min(x.to, to) - Math.max(x.from, from)) : a), 0);
}

/** Local-midnight edges: count days starting at the day of `t`, plus the closing edge. */
export function dayEdges(t: number, count: number): number[] {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return Array.from({ length: count + 1 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i).getTime());
}

/** Does the session cross a local midnight? */
export const isOvernight = (s: Session) => new Date(s.startedAt).toDateString() !== new Date(s.endedAt ?? s.startedAt).toDateString();
