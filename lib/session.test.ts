// Run: npx tsx lib/session.test.ts  (or node --experimental-strip-types lib/session.test.ts)
import assert from "node:assert/strict";
import { elapsedMs, pausedMs, remainingMs, type Session } from "./session.ts";

const s: Session = {
  id: "x", mode: "countdown", tag: null, startedAt: 0, plannedMs: 60_000,
  pauses: [{ at: 10_000, resumedAt: 25_000 }, { at: 40_000 }],
};
assert.equal(pausedMs(s, 50_000), 15_000 + 10_000); // closed pause + open pause
assert.equal(elapsedMs(s, 50_000), 50_000 - 25_000); // 25s focused
assert.equal(remainingMs(s, 50_000), 35_000);
assert.equal(elapsedMs({ ...s, pauses: [], endedAt: 30_000 }, 99_999), 30_000); // ended: now is ignored
console.log("session math ok");

import { elapsedAt, focusIn, parseDuration } from "./session.ts";
const base = { id: "y", mode: "stopwatch" as const, tag: null, pauses: [{ at: 10_000, resumedAt: 20_000 }] };
// elapsedAt: before pause, during pause (frozen), after pause
assert.equal(elapsedAt({ ...base, startedAt: 0 }, 5_000), 5_000);
assert.equal(elapsedAt({ ...base, startedAt: 0 }, 15_000), 10_000);
assert.equal(elapsedAt({ ...base, startedAt: 0 }, 30_000), 20_000);
// overnight: 23:00 -> 01:00 split at midnight gives 1h + 1h
const H = 3_600_000, night = { ...base, pauses: [], startedAt: 23 * H, endedAt: 25 * H };
assert.equal(focusIn(night, 0, 24 * H), H);
assert.equal(focusIn(night, 24 * H, 48 * H), H);
// a pause inside the window is not counted
assert.equal(focusIn({ ...base, startedAt: 0, endedAt: 30_000 }, 0, 30_000), 20_000);
// typed durations
const cases: [string, number | null][] = [["25", 25], ["90", 90], ["1:30", 90], ["2h", 120], ["45m", 45], ["1h30m", 90], ["1h 30", 90], ["4h", 180], ["500", 180], ["0", null], ["abc", null], ["", null], ["1:75", 135]];
for (const [i, want] of cases) assert.equal(parseDuration(i), want, i);
console.log("session math 2 ok");

import { bucketize } from "./analysis.ts";
const ov = { id: "n", mode: "stopwatch" as const, tag: null, pauses: [], startedAt: 23 * H, endedAt: 25 * H };
const bk = bucketize([ov], [0, 24 * H, 48 * H], 99 * H);
assert.deepEqual(bk.get("none")!.values, [H, H]); // overnight splits at midnight, no double count
console.log("analysis ok");

import { learn, plan } from "./planner.ts";
const M = 60_000, day0 = new Date(2026, 0, 5).getTime(); // a local midnight
const end = day0 + 23 * H + 59 * M;
const flat = { lengthMs: 45 * M, breakMs: 10 * M, weights: Array(24).fill(1), learned: false };
assert.equal(plan(0, day0 + 9 * H, end, flat).status, "met");
// 2h left at 09:00 with 45m habit: 3 x 40m, sooner first when every hour is equal, breaks respected
const p = plan(2 * H, day0 + 9 * H, end, flat);
assert.equal(p.status, "plan");
if (p.status !== "met") {
  assert.deepEqual(p.blocks.map((b) => b.ms), [40 * M, 40 * M, 40 * M]);
  assert.equal(p.blocks[0].start, day0 + 9 * H);
  for (let i = 1; i < p.blocks.length; i++) assert.ok(p.blocks[i].start >= p.blocks[i - 1].start + p.blocks[i - 1].ms + 10 * M);
}
// favoured evening hours pull the blocks there
const evening = { ...flat, weights: Array.from({ length: 24 }, (_, h) => (h >= 19 && h <= 21 ? 1 : 0.25)) };
const pe = plan(90 * M, day0 + 9 * H, end, evening);
if (pe.status !== "met") assert.ok(pe.blocks.every((b) => new Date(b.start).getHours() >= 19), "evening");
// 2h left at 22:00: fits only with 5m breaks
assert.equal(plan(110 * M, day0 + 22 * H, end, flat).status, "tight");
// 3h left at 22:30: can't fit, plans what's possible, nothing past 23:59
const ps = plan(3 * H, day0 + 22 * H + 30 * M, end, flat);
assert.equal(ps.status, "short");
if (ps.status !== "met") {
  assert.ok(ps.plannedMs < 3 * H && ps.plannedMs >= 60 * M);
  assert.ok(ps.blocks.every((b) => b.start + b.ms <= end));
}
// learning: median session length and the hours used
const hist = [9, 10, 20].map((h, i) => ({ id: `h${i}`, mode: "stopwatch" as const, tag: null, pauses: [], startedAt: day0 - 86_400_000 + h * H, endedAt: day0 - 86_400_000 + h * H + 30 * M }));
const hb = learn(hist, day0);
assert.equal(hb.lengthMs, 30 * M);
assert.equal(hb.breakMs, 5 * M);
assert.ok(hb.weights[9] === 1 && hb.weights[3] === 0.25 && hb.learned);
console.log("planner ok");
