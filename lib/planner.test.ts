// Run: node --experimental-strip-types lib/planner.test.ts
import assert from "node:assert/strict";
import { busyOn, sanitize, type Constraint } from "./constraints.ts";
import { freeWindows, learn, needed, plan, type Habits } from "./planner.ts";
import type { Session } from "./session.ts";

const MIN = 60_000;
const day = new Date(2026, 10, 2).getTime(); // Mon 2 Nov 2026, local midnight
const at = (h: number, m = 0) => day + (h * 60 + m) * MIN;
const flat: Habits = { lengthMs: 45 * MIN, breakMs: 10 * MIN, weights: Array(24).fill(1), learned: true, pauseRate: 0, pauseMs: 0, pausesPerHour: 0 };
const overlaps = (a: { start: number; wall: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.start + a.wall;

// constraints: weekday / every day / today only, merged, and validation
const list: Constraint[] = [
  { id: "a", name: "Class", start: 600, end: 720, days: [1, 3] }, // Mon, Wed 10:00-12:00
  { id: "b", name: "Lunch", start: 700, end: 780, days: null }, // every day 11:40-13:00, overlaps Class
  { id: "c", name: "Gym", start: 1080, end: 1140, days: null, date: "2026-11-02" },
  { id: "d", name: "Tue only", start: 300, end: 360, days: [2] },
];
const busy = busyOn(list, day);
assert.deepEqual(busy, [{ start: at(10), end: at(13) }, { start: at(18), end: at(19) }]); // merged; Tue entry skipped
assert.equal(busyOn(list, day + 86_400_000).length, 2); // Tue: lunch + Tue only (gym was today only)
assert.equal(sanitize([{ id: "x", name: "n", start: 600, end: 600, days: null }]), null); // end <= start
assert.equal(sanitize([{ id: "x", name: " ", start: 1, end: 5, days: null }]), null); // blank name
assert.equal(sanitize([{ id: "x", name: "n", start: 1, end: 1500, days: null }]), null); // past midnight
assert.equal(sanitize([{ id: "x", name: "n", start: 1, end: 5, days: [7] }]), null); // bad weekday
assert.equal(sanitize(list)?.length, 4);

// no commitments: a plain evenly spaced plan that reaches the day's end limit
const free = plan(90 * MIN, at(9), at(23, 59), flat);
assert.equal(free.status, "plan");
if (free.status !== "met") {
  assert.equal(free.blocks.length, 2);
  assert.equal(free.plannedMs, 90 * MIN);
}

// with commitments: no block overlaps any, and the target is still covered
const p = plan(180 * MIN, at(9), at(23, 59), flat, busy);
assert.equal(p.status, "plan");
if (p.status !== "met") {
  assert.equal(p.plannedMs, 180 * MIN);
  for (const b of p.blocks) for (const c of busy) assert.ok(!overlaps(b, c), "block overlaps a commitment");
}

// not enough free time: "short", still no overlap, less than asked
const tiny = plan(300 * MIN, at(9), at(14), flat, [{ start: at(9, 30), end: at(13, 30) }]);
assert.equal(tiny.status, "short");
if (tiny.status !== "met") assert.ok(tiny.plannedMs < 300 * MIN && tiny.blocks.every((b) => !overlaps(b, { start: at(9, 30), end: at(13, 30) })));

// pauses stretch the clock time of a block, so a 50m window no longer fits a 45m session
const win = [{ start: at(10, 50), end: at(12) }]; // 10:00-10:50 free, then busy
const fitsFlat = plan(45 * MIN, at(10), at(12), flat, win);
const fitsPausy = plan(45 * MIN, at(10), at(12), { ...flat, pauseRate: 0.3 }, win);
if (fitsFlat.status === "plan" && fitsPausy.status !== "met") {
  assert.ok(fitsPausy.blocks[0].wall > fitsPausy.blocks[0].ms); // wall > focus
  assert.ok(fitsPausy.blocks.every((b) => b.start + b.wall <= at(10, 50) || b.start >= at(12)));
}
assert.deepEqual(freeWindows(at(9), at(12), [{ start: at(10), end: at(11) }]), [{ start: at(9), end: at(10) }, { start: at(11), end: at(12) }]);

// learning from focus data: pause rate, pause length, break between sessions
const s = (startH: number, startM: number, endH: number, endM: number, pauses: Session["pauses"] = []): Session =>
  ({ id: `${startH}${startM}`, mode: "stopwatch", tag: null, startedAt: at(startH, startM), endedAt: at(endH, endM), pauses });
const hist = [
  s(9, 0, 9, 50, [{ at: at(9, 20), resumedAt: at(9, 30) }]), // 40m focus, 10m paused
  s(10, 0, 10, 50, [{ at: at(10, 20), resumedAt: at(10, 30) }]),
  s(11, 0, 11, 50, [{ at: at(11, 20), resumedAt: at(11, 30) }]),
];
const h = learn(hist, at(12));
assert.equal(h.pauseRate, 0.25);
assert.equal(h.pauseMs, 10 * MIN);
assert.equal(h.breakMs, 10 * MIN); // gaps were 10m
assert.equal(h.lengthMs, 40 * MIN);
assert.ok(Math.abs(h.pausesPerHour - 1.5) < 1e-9); // 3 pauses in 2h focus

// needed(): a running countdown books its remaining time and a break
const cd: Session = { id: "c", mode: "countdown", tag: null, startedAt: at(9), plannedMs: 30 * MIN, pauses: [] };
assert.deepEqual(needed(120 * MIN, 0, cd, at(9, 10), flat), { left: 100 * MIN, from: at(9, 30) + 10 * MIN });
console.log("planner ok");
