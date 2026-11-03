export const WIDGET_IDS = ["focus-today", "helper"] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

/** One flag per row of the Settings page: shared across devices (true) or kept on this device (false). */
export const SYNC_KEYS = ["ring", "sounds", "target", "minFocus", "finish", "finishAlways", "overtime", "theme", "touch", "motion"] as const;
export type SyncKey = (typeof SYNC_KEYS)[number];
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export type Settings = {
  sounds: boolean;
  widgets: WidgetId[];
  target: boolean; // daily focus target on/off; the value is kept while off
  targetMins: number; // 30..720, in 30 minute steps
  minFocusMins: number; // sessions focused for less than this are not recorded; 5..180
  showFinish: boolean; // countdown: show the clock time it will finish at
  finishAlways: boolean; // ...also while it runs, without hovering (touch-friendly mode always does)
  keepCounting: boolean; // countdown: keep counting up (+mm:ss) after zero until paused or stopped
  // The next four live on each device too (lib/device.ts); this is the shared copy used while their sync is on.
  ring: boolean;
  theme: Theme;
  touch: boolean;
  motion: boolean;
  sync: Record<SyncKey, boolean>;
};
export type SettingsPatch = Omit<Partial<Settings>, "sync"> & { sync?: Partial<Settings["sync"]> };

// Things that are about the person (goals, sounds, what counts as a session) sync by default; how this screen looks does not.
export const DEFAULTS: Settings = {
  sounds: true, widgets: [], target: false, targetMins: 240, minFocusMins: 5, showFinish: true, finishAlways: false, keepCounting: true,
  ring: false, theme: "system", touch: false, motion: true,
  sync: { ring: true, sounds: true, target: true, minFocus: true, finish: true, finishAlways: true, overtime: true, theme: false, touch: false, motion: false },
};
export const TARGET_STEP = 30;
export const TARGET_MAX = 12 * 60;
export const MIN_FOCUS_MIN = 5;
export const MIN_FOCUS_MAX = 180;

/** Keep only known keys with valid values; returns null if any provided key is invalid. */
export function sanitize(x: unknown): SettingsPatch | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const out: SettingsPatch = {};
  for (const k of ["sounds", "target", "ring", "touch", "motion", "showFinish", "finishAlways", "keepCounting"] as const) {
    if (k in o) { if (typeof o[k] !== "boolean") return null; out[k] = o[k]; }
  }
  if ("targetMins" in o) {
    const m = o.targetMins;
    if (typeof m !== "number" || !Number.isInteger(m) || m < TARGET_STEP || m > TARGET_MAX || m % TARGET_STEP) return null;
    out.targetMins = m;
  }
  if ("minFocusMins" in o) {
    const m = o.minFocusMins;
    if (typeof m !== "number" || !Number.isInteger(m) || m < MIN_FOCUS_MIN || m > MIN_FOCUS_MAX) return null;
    out.minFocusMins = m;
  }
  if ("theme" in o) {
    if (!(THEMES as readonly unknown[]).includes(o.theme)) return null;
    out.theme = o.theme as Theme;
  }
  if ("widgets" in o) {
    const w = o.widgets;
    if (!Array.isArray(w) || !w.every((i) => (WIDGET_IDS as readonly unknown[]).includes(i))) return null;
    out.widgets = [...new Set(w)] as WidgetId[];
  }
  if ("sync" in o) {
    const f = o.sync;
    if (!f || typeof f !== "object") return null;
    out.sync = {};
    for (const [k, v] of Object.entries(f)) {
      if (!(SYNC_KEYS as readonly string[]).includes(k) || typeof v !== "boolean") return null;
      out.sync[k as SyncKey] = v;
    }
  }
  return out;
}

/** Device-only values for the settings whose sync is off. Not used for ring/theme/touch/motion: those live in lib/device.ts. */
export type Local = Partial<Pick<Settings, "sounds" | "target" | "targetMins" | "minFocusMins" | "showFinish" | "finishAlways" | "keepCounting">>;

/** The values this device acts on: the shared ones, except where sync is off and this device has its own. */
export function effective(s: Settings, local: Local): Settings {
  const out = { ...s };
  if (!s.sync.sounds && local.sounds !== undefined) out.sounds = local.sounds;
  if (!s.sync.target) {
    if (local.target !== undefined) out.target = local.target;
    if (local.targetMins !== undefined) out.targetMins = local.targetMins;
  }
  if (!s.sync.minFocus && local.minFocusMins !== undefined) out.minFocusMins = local.minFocusMins;
  if (!s.sync.finish && local.showFinish !== undefined) out.showFinish = local.showFinish;
  if (!s.sync.finishAlways && local.finishAlways !== undefined) out.finishAlways = local.finishAlways;
  if (!s.sync.overtime && local.keepCounting !== undefined) out.keepCounting = local.keepCounting;
  return out;
}
