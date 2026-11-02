import { useSyncExternalStore } from "react";

// Per-device preferences, kept in localStorage and mirrored onto <html data-*> so CSS can react before paint
// (see the inline script in app/layout.tsx). Theme lives here too but keeps its own "system" default.
export type DevicePref = "touch" | "motion" | "ring";

export const DEVICE_DEFAULTS: Record<DevicePref, "on" | "off"> = { touch: "off", motion: "on", ring: "off" };

export function readPref(k: DevicePref): "on" | "off" {
  if (typeof document === "undefined") return DEVICE_DEFAULTS[k];
  return (document.documentElement.dataset[k] as "on" | "off" | undefined) ?? DEVICE_DEFAULTS[k];
}

export function writePref(k: DevicePref, v: "on" | "off") {
  const el = document.documentElement;
  try {
    if (v === DEVICE_DEFAULTS[k]) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
  if (v === DEVICE_DEFAULTS[k]) delete el.dataset[k];
  else el.dataset[k] = v;
  notifyPrefs();
}

const listeners = new Set<() => void>();
const subscribe = (f: () => void) => (listeners.add(f), () => void listeners.delete(f));
/** Call after changing any <html data-*> preference by hand (the theme picker does). */
export const notifyPrefs = () => listeners.forEach((f) => f());
/** A <html data-*> value, `fallback` on the server and during hydration. */
export const useDataset = <T extends string>(k: string, fallback: T) =>
  useSyncExternalStore(subscribe, () => (document.documentElement.dataset[k] as T | undefined) ?? fallback, () => fallback);

/** Current value; renders the default on the server and during hydration, then the device's own. */
export const usePref = (k: DevicePref) => useSyncExternalStore(subscribe, () => readPref(k), () => DEVICE_DEFAULTS[k]);

/** Short tap on supporting phones (Android); silent elsewhere. Only in touch mode. */
export function haptic(pattern: number | number[] = 10) {
  if (readPref("touch") === "on") navigator.vibrate?.(pattern);
}
