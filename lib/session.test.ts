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
