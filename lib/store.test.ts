// Run: node --experimental-strip-types lib/store.test.ts  (in-memory DB, controlled clock)
import assert from "node:assert/strict";
import { set } from "./db.ts";
import { elapsedMs, overMs } from "./session.ts";
import { act, editEnd, expireIfDue, getActive, getSessions, saveSettings } from "./store.ts";

const M = 60_000, T0 = 1_800_000_000_000;
const reset = async () => { await set("active", null); await set("sessions", []); await set("settings", null); };
const only = async () => { const all = await getSessions(); assert.equal(all.length, 1); return all[0]; };

// ---- overtime ----
await reset();
// an overrun countdown stays open past zero and records whatever it ran to
await act({ action: "start", mode: "countdown", plannedMs: 10 * M, minMs: 5 * M, overrun: true }, T0);
let a = await getActive(T0 + 25 * M);
assert.ok(a, "still open 15m past zero");
assert.equal(a.overrun, true);
assert.equal(overMs(a, T0 + 25 * M), 15 * M);
assert.equal((await getSessions()).length, 0, "nothing recorded until it is stopped");
await act({ action: "stop" }, T0 + 25 * M);
let s = await only();
assert.equal(elapsedMs(s, s.endedAt!), 25 * M);
assert.equal(await getActive(T0 + 26 * M), null);

// not overrun: closes at zero at its true end time, exactly as before
await reset();
await act({ action: "start", mode: "countdown", plannedMs: 10 * M, minMs: 5 * M, overrun: false }, T0);
assert.equal((await getActive(T0 + 9 * M))?.id !== undefined, true);
assert.equal(await getActive(T0 + 14 * M), null, "closed by the server at zero");
s = await only();
assert.equal(s.endedAt, T0 + 10 * M, "ended at its true end, not when somebody looked");
assert.equal(elapsedMs(s, s.endedAt!), 10 * M);

// the shared setting decides when the client sends nothing; a stopwatch is never overrun
await reset();
await act({ action: "start", mode: "countdown", plannedMs: 10 * M }, T0); // default: keep counting
assert.equal((await getActive(T0))?.overrun, true);
await act({ action: "stop" }, T0 + 6 * M);
await saveSettings({ keepCounting: false });
await act({ action: "start", mode: "countdown", plannedMs: 10 * M }, T0);
assert.equal((await getActive(T0))?.overrun, undefined);
assert.equal(await getActive(T0 + 11 * M), null);
await act({ action: "start", mode: "countdown", plannedMs: 10 * M, overrun: true }, T0 + 20 * M); // the device's own choice wins
assert.equal((await getActive(T0 + 20 * M))?.overrun, true);
await act({ action: "stop" }, T0 + 30 * M);
await saveSettings({ keepCounting: true });
await act({ action: "start", mode: "stopwatch" }, T0 + 40 * M);
assert.equal((await getActive(T0 + 40 * M))?.overrun, undefined);
await act({ action: "stop" }, T0 + 50 * M);

// the alarm: early is early, at zero an overrun session is reported but left open
await reset();
await act({ action: "start", mode: "countdown", plannedMs: 10 * M, overrun: true }, T0);
const id = (await getActive(T0))!.id;
assert.equal(await expireIfDue(id, T0 + 5 * M), "early");
const due = await expireIfDue(id, T0 + 10 * M);
assert.ok(due && due !== "early" && due.id === id);
assert.ok(await getActive(T0 + 10 * M), "still open after the alarm");
assert.equal((await getSessions()).length, 0);
assert.equal(await expireIfDue("nope", T0 + 10 * M), null);
// the same alarm on a non-overrun session closes it (unchanged behaviour)
await act({ action: "stop" }, T0 + 11 * M);
await reset();
await act({ action: "start", mode: "countdown", plannedMs: 10 * M, overrun: false }, T0);
const id2 = (await getActive(T0))!.id;
const closed = await expireIfDue(id2, T0 + 10 * M + 500);
assert.ok(closed && closed !== "early" && closed.endedAt !== undefined);
assert.equal(await getActive(T0 + 11 * M), null);
assert.equal((await getSessions()).length, 1);
// a paused session ignores a stale alarm
await act({ action: "start", mode: "countdown", plannedMs: 10 * M, overrun: true }, T0 + 20 * M);
const id3 = (await getActive(T0 + 20 * M))!.id;
await act({ action: "pause" }, T0 + 21 * M);
assert.equal(await expireIfDue(id3, T0 + 30 * M), null);
await act({ action: "stop" }, T0 + 31 * M);

// pausing and resuming in overtime keeps counting correctly
await reset();
await act({ action: "start", mode: "countdown", plannedMs: 10 * M, minMs: 5 * M, overrun: true }, T0);
await act({ action: "pause" }, T0 + 15 * M); // 5m over
a = (await getActive(T0 + 15 * M))!;
assert.equal(overMs(a, T0 + 40 * M), 5 * M, "frozen while paused");
await act({ action: "resume" }, T0 + 25 * M);
assert.equal(overMs((await getActive(T0 + 30 * M))!, T0 + 30 * M), 10 * M);
await act({ action: "stop" }, T0 + 30 * M);
s = await only();
assert.equal(elapsedMs(s, s.endedAt!), 20 * M, "30m wall - 10m paused");
assert.equal(overMs(s, s.endedAt!), 10 * M);

// a pause before zero pushes zero later; overtime only starts once the planned focus is done
await reset();
await act({ action: "start", mode: "countdown", plannedMs: 10 * M, minMs: 5 * M, overrun: true }, T0);
await act({ action: "pause" }, T0 + 4 * M);
await act({ action: "resume" }, T0 + 10 * M);
a = (await getActive(T0 + 15 * M))!; // 4 + 5 = 9m of focus
assert.equal(overMs(a, T0 + 15 * M), 0);
assert.ok(await getActive(T0 + 16 * M), "10m focus reached, still open");
await act({ action: "stop" }, T0 + 20 * M);
s = await only();
assert.equal(elapsedMs(s, s.endedAt!), 14 * M);

// the minimum-focus rule is unchanged by overtime
await reset();
await act({ action: "start", mode: "countdown", plannedMs: 3 * M, minMs: 5 * M, overrun: true }, T0);
await act({ action: "stop" }, T0 + 4 * M);
assert.equal((await getSessions()).length, 0, "4m < 5m minimum: discarded");
await act({ action: "start", mode: "countdown", plannedMs: 3 * M, minMs: 5 * M, overrun: true }, T0);
await act({ action: "stop" }, T0 + 6 * M);
assert.equal((await getSessions()).length, 1, "6m of overtime-extended focus counts");

// ---- editing where a session ended ----
await reset();
await act({ action: "start", mode: "stopwatch", minMs: 5 * M }, T0);
await act({ action: "pause" }, T0 + 10 * M);
await act({ action: "resume" }, T0 + 20 * M);
await act({ action: "stop" }, T0 + 60 * M); // 50m of focus
const orig = await only();
const edit = async (end: unknown, id_ = orig.id) => editEnd(id_, end);
const stored = async () => (await getSessions())[0];

// rejected: nothing changes
for (const bad of [orig.startedAt, orig.startedAt - 1, orig.endedAt! + 1, orig.endedAt! + 60 * M, NaN, Infinity, 1.5, "99", null, undefined, {}, [], true, -5])
  assert.equal(await edit(bad), null, `rejected: ${String(bad)}`);
assert.equal(await edit(T0 + 30 * M, "no-such-id"), null);
assert.deepEqual(await stored(), orig, "rejected edits leave it untouched");

// later pause-free end: pause kept, only the tail is cut
let e = (await edit(T0 + 40 * M))!;
assert.equal(e.endedAt, T0 + 40 * M);
assert.equal(elapsedMs(e, e.endedAt!), 30 * M);
assert.deepEqual(e.pauses, orig.pauses);
assert.deepEqual(await stored(), e, "persisted");
assert.equal(e.startedAt, orig.startedAt, "start is never touched");
assert.equal(e.id, orig.id);
assert.equal((await getSessions()).length, 1);

// end inside the pause: the pause is closed there; end before it: the pause is gone
e = (await edit(T0 + 15 * M))!;
assert.deepEqual(e.pauses, [{ at: T0 + 10 * M, resumedAt: T0 + 15 * M }]);
assert.equal(elapsedMs(e, e.endedAt!), 10 * M);
e = (await edit(T0 + 6 * M))!;
assert.deepEqual(e.pauses, []);
assert.equal(elapsedMs(e, e.endedAt!), 6 * M);
// now the recorded end is T0+6m: it can't be moved later again
assert.equal(await edit(T0 + 7 * M), null, "no extending");
assert.equal((await edit(T0 + 6 * M))?.endedAt, T0 + 6 * M, "same end is allowed (no-op)");
assert.equal((await edit(T0 + M))?.endedAt, T0 + M, "down to one minute after the start");

// editing one of several leaves the others alone
await reset();
await act({ action: "start", mode: "stopwatch", minMs: 5 * M }, T0);
await act({ action: "stop" }, T0 + 30 * M);
await act({ action: "start", mode: "stopwatch", minMs: 5 * M }, T0 + 60 * M);
await act({ action: "stop" }, T0 + 90 * M);
const [one, two] = await getSessions();
await editEnd(two.id, T0 + 70 * M);
const after = await getSessions();
assert.deepEqual(after[0], one);
assert.equal(after[1].endedAt, T0 + 70 * M);

console.log("store ok");
