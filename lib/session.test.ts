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

import { clock24, elapsedAt, endForFocus, focusIn, overMs, parseDuration, withEnd } from "./session.ts";
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

import { bucketize, dailyFocus } from "./analysis.ts";
const ov = { id: "n", mode: "stopwatch" as const, tag: null, pauses: [], startedAt: 23 * H, endedAt: 25 * H };
const bk = bucketize([ov], [0, 24 * H, 48 * H], 99 * H);
assert.deepEqual(bk.get("none")!.values, [H, H]); // overnight splits at midnight, no double count
console.log("analysis ok");

import { learn, plan } from "./planner.ts";
const M = 60_000, day0 = new Date(2026, 0, 5).getTime(); // a local midnight
const end = day0 + 23 * H + 59 * M;
const flat = { lengthMs: 45 * M, breakMs: 10 * M, weights: Array(24).fill(1), learned: false, pauseRate: 0, pauseMs: 0, pausesPerHour: 0 };
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

// clock24: 24-hour, zero padded, "+1" past midnight
const at = (h: number, m: number) => new Date(2026, 10, 2, h, m).getTime();
assert.equal(clock24(at(14, 5), at(9, 0)), "14:05");
assert.equal(clock24(at(0, 0), at(0, 0)), "00:00");
assert.equal(clock24(at(23, 50) + 20 * 60_000, at(23, 50)), "00:10 +1");
console.log("clock24 ok");

// overMs: time past zero of a countdown, never negative, never for a stopwatch
{
  const m = 60_000;
  const cd: Session = { id: "o", mode: "countdown", tag: null, startedAt: 0, plannedMs: 10 * m, pauses: [] };
  assert.equal(overMs(cd, 5 * m), 0);
  assert.equal(overMs(cd, 10 * m), 0);
  assert.equal(overMs(cd, 25 * m), 15 * m);
  assert.equal(overMs({ ...cd, pauses: [{ at: 12 * m, resumedAt: 22 * m }] }, 30 * m), 10 * m); // 30m wall - 10m paused = 20m focus, 10m past a 10m plan
  assert.equal(overMs({ ...cd, pauses: [{ at: 12 * m }] }, 99 * m), 2 * m); // open pause freezes it
  assert.equal(overMs({ ...cd, mode: "stopwatch" }, 25 * m), 0);
  console.log("overMs ok");
}

// endForFocus / withEnd: correcting where a finished session ended
{
  const m = 60_000;
  const done: Session = { id: "e", mode: "stopwatch", tag: null, startedAt: 0, endedAt: 60 * m, pauses: [{ at: 10 * m, resumedAt: 20 * m }] }; // 50m of focus
  assert.equal(endForFocus(done, 5 * m), 5 * m); // before the pause
  assert.equal(endForFocus(done, 10 * m), 10 * m); // exactly at the pause
  assert.equal(endForFocus(done, 11 * m), 21 * m); // pause is kept: 1m after it ended
  assert.equal(endForFocus(done, 50 * m), 60 * m); // all of it
  assert.equal(endForFocus(done, 55 * m), 65 * m); // more than it has: extends, the extra is focus right after the end
  assert.equal(endForFocus(done, 999 * m), 60 * m + 949 * m);
  assert.equal(endForFocus({ ...done, pauses: [{ at: 50 * m, resumedAt: 60 * m }] }, 55 * m), 65 * m); // after a trailing pause
  assert.equal(endForFocus(done, 0), 0);
  assert.equal(endForFocus({ ...done, pauses: [] }, 45 * m), 45 * m);
  assert.equal(endForFocus({ ...done, pauses: [{ at: 50 * m, resumedAt: 60 * m }] }, 50 * m), 50 * m); // trailing pause
  const t = (end: number) => withEnd(done, end);
  assert.deepEqual(t(40 * m).pauses, [{ at: 10 * m, resumedAt: 20 * m }]); // pause kept whole
  assert.equal(elapsedMs(t(40 * m), 0), 30 * m);
  assert.deepEqual(t(15 * m).pauses, [{ at: 10 * m, resumedAt: 15 * m }]); // pause spans the new end: closed there
  assert.equal(elapsedMs(t(15 * m), 0), 10 * m);
  assert.deepEqual(t(5 * m).pauses, []); // pause starts after the new end: gone
  assert.deepEqual(t(10 * m).pauses, []); // starts exactly at the end: gone
  assert.equal(t(5 * m).endedAt, 5 * m);
  assert.deepEqual(done.pauses, [{ at: 10 * m, resumedAt: 20 * m }]); // input untouched
  assert.equal(elapsedMs(t(endForFocus(done, 30 * m)), 0), 30 * m); // round trip: "30m focus" really is 30m
  assert.equal(elapsedMs(t(endForFocus(done, 12 * m)), 0), 12 * m);
  assert.equal(elapsedMs(t(endForFocus(done, 65 * m)), 0), 65 * m); // extending: 65m of focus really is 65m
  assert.deepEqual(t(80 * m).pauses, done.pauses); // a later end keeps every pause
  assert.equal(t(80 * m).endedAt, 80 * m);
  assert.equal(elapsedMs(t(80 * m), 0), 70 * m);
  console.log("endForFocus/withEnd ok");
}

// dailyFocus: focus per local day, split at midnight, pauses excluded
{
  const m = 60_000, day = (n: number) => new Date(2026, 10, n).getTime(), at = (n: number, h: number, min = 0) => day(n) + (h * 60 + min) * m;
  const mk = (id: string, startedAt: number, endedAt: number, pauses: Session["pauses"] = []): Session => ({ id, mode: "stopwatch", tag: null, startedAt, endedAt, pauses });
  assert.equal(dailyFocus([], at(9, 12)).size, 0);
  const one = dailyFocus([mk("a", at(2, 9), at(2, 10, 30))], at(9, 12));
  assert.deepEqual([...one], [[day(2), 90 * m]]);
  // two sessions on one day add up; another day stays separate; a pause is not focus
  const many = dailyFocus([mk("a", at(2, 9), at(2, 10)), mk("b", at(2, 14), at(2, 15), [{ at: at(2, 14, 20), resumedAt: at(2, 14, 30) }]), mk("c", at(3, 8), at(3, 8, 45))], at(9, 12));
  assert.equal(many.get(day(2)), 110 * m);
  assert.equal(many.get(day(3)), 45 * m);
  assert.equal(many.size, 2);
  // across midnight: split between the two days
  const over = dailyFocus([mk("o", at(4, 23, 30), at(5, 1))], at(9, 12));
  assert.equal(over.get(day(4)), 30 * m);
  assert.equal(over.get(day(5)), 60 * m);
  // spanning more than two days (e.g. a long edited session)
  const long = dailyFocus([mk("l", at(6, 22), at(8, 2))], at(9, 12));
  assert.equal(long.get(day(6)), 120 * m);
  assert.equal(long.get(day(7)), 24 * 60 * m);
  assert.equal(long.get(day(8)), 120 * m);
  // a pause that straddles midnight is not counted on either day
  const gap = dailyFocus([mk("g", at(10, 23), at(11, 1), [{ at: at(10, 23, 30), resumedAt: at(11, 0, 30) }])], at(12, 12));
  assert.equal(gap.get(day(10)), 30 * m);
  assert.equal(gap.get(day(11)), 30 * m);
  console.log("dailyFocus ok");
}
