import { useMemo, useSyncExternalStore } from "react";
import { notifyPrefs, readPref, setTheme, subscribe, writePref } from "./device";
import { DEFAULTS, effective, type Local, type Settings, type SettingsPatch } from "./settings";

// Per-row sync. Shared values live on the server (/api/settings). A row with sync off keeps this device's own value:
// ring/theme/touch/motion in lib/device.ts (they also drive CSS), the rest in the "local" blob below.
const LOCAL = "lockin.local";
const SYNC = "lockin.sync"; // last known sync flags, so quick toggles outside Settings know whether to write through

const store = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const parse = <T,>(raw: string | null, fallback: T): T => { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };

export const readLocal = (): Local => parse(store(LOCAL), {});
export function writeLocal(patch: Local) {
  try { localStorage.setItem(LOCAL, JSON.stringify({ ...readLocal(), ...patch })); } catch {}
  notifyPrefs();
}
export const syncFlags = (): Settings["sync"] => ({ ...DEFAULTS.sync, ...parse<Partial<Settings["sync"]>>(store(SYNC), {}) });
export function cacheSync(flags: Settings["sync"]) {
  try { localStorage.setItem(SYNC, JSON.stringify(flags)); } catch {}
}

/** Settings as this device should act on them (see effective() in lib/settings.ts). Re-evaluates when local values change. */
export function useEffective(s: Settings): Settings {
  const raw = useSyncExternalStore(subscribe, () => store(LOCAL) ?? "", () => "");
  return useMemo(() => effective(s, parse(raw, {})), [s, raw]);
}

export const putSettings = (patch: SettingsPatch) =>
  fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });

/** Switch ring/touch/motion here, and for every device too when that row's sync is on. */
export function setDevicePref(k: "ring" | "touch" | "motion", on: boolean) {
  writePref(k, on ? "on" : "off");
  if (syncFlags()[k]) void putSettings({ [k]: on });
}

/** Bring this device's own copies in line with the shared values, for the rows that sync. */
export function applySynced(s: Settings) {
  cacheSync(s.sync);
  for (const k of ["ring", "touch", "motion"] as const)
    if (s.sync[k] && readPref(k) !== (s[k] ? "on" : "off")) writePref(k, s[k] ? "on" : "off");
  if (s.sync.theme && (document.documentElement.dataset.theme ?? "system") !== s.theme) setTheme(s.theme);
}
