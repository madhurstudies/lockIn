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
