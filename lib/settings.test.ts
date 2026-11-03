// Run: node --experimental-strip-types lib/settings.test.ts
import assert from "node:assert/strict";
import { DEFAULTS, effective, sanitize } from "./settings.ts";

// defaults: personal things sync, how this screen looks does not
assert.deepEqual(Object.entries(DEFAULTS.sync).filter(([, v]) => !v).map(([k]) => k), ["theme", "touch", "motion"]);
assert.equal(DEFAULTS.minFocusMins, 5);

// sanitize: minimum focus time is 5..180 whole minutes
assert.equal(sanitize({ minFocusMins: 4 }), null);
assert.equal(sanitize({ minFocusMins: 181 }), null);
assert.equal(sanitize({ minFocusMins: 7.5 }), null);
assert.deepEqual(sanitize({ minFocusMins: 5 }), { minFocusMins: 5 });
assert.deepEqual(sanitize({ minFocusMins: 180 }), { minFocusMins: 180 });
assert.equal(sanitize({ theme: "purple" }), null);
assert.deepEqual(sanitize({ sync: { theme: true } }), { sync: { theme: true } });
assert.equal(sanitize({ sync: { nope: true } }), null); // unknown row
assert.equal(sanitize({ sync: { theme: "yes" } }), null);
assert.equal(sanitize({ ring: "on" }), null);

// effective: this device's own value wins only where sync is off
const server = { ...DEFAULTS, sounds: true, minFocusMins: 5, targetMins: 240 };
const local = { sounds: false, minFocusMins: 30, targetMins: 60, target: true };
assert.deepEqual(effective(server, local), server); // everything synced: shared values rule
const off = { ...server, sync: { ...server.sync, sounds: false, minFocus: false, target: false } };
const e = effective(off, local);
assert.equal(e.sounds, false);
assert.equal(e.minFocusMins, 30);
assert.equal(e.targetMins, 60);
assert.equal(e.target, true);
assert.equal(effective(off, {}).minFocusMins, 5);
const f = effective({ ...server, sync: { ...server.sync, finish: false, finishAlways: false } }, { showFinish: false, finishAlways: true });
assert.equal(f.showFinish, false);
assert.equal(f.finishAlways, true);
assert.equal(effective(server, { showFinish: false }).showFinish, true); // synced: shared value rules
assert.deepEqual(sanitize({ showFinish: false, finishAlways: true }), { showFinish: false, finishAlways: true });
assert.equal(sanitize({ showFinish: 1 }), null); // sync off but nothing local yet: fall back to the shared value
assert.equal(DEFAULTS.keepCounting, true);
assert.equal(DEFAULTS.sync.overtime, true);
assert.deepEqual(sanitize({ keepCounting: false }), { keepCounting: false });
assert.equal(sanitize({ keepCounting: "no" }), null);
assert.equal(effective(server, { keepCounting: false }).keepCounting, true); // synced: shared value rules
assert.equal(effective({ ...server, sync: { ...server.sync, overtime: false } }, { keepCounting: false }).keepCounting, false);
assert.equal(effective({ ...server, sync: { ...server.sync, overtime: false } }, {}).keepCounting, true); // nothing local yet
console.log("settings ok");
