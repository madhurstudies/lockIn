export const WIDGET_IDS = ["focus-today", "helper"] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export type Settings = {
  sounds: boolean;
  widgets: WidgetId[];
  target: boolean; // daily focus target on/off; the value is kept while off
  targetMins: number; // 30..720, in 30 minute steps
};

export const DEFAULTS: Settings = { sounds: true, widgets: [], target: false, targetMins: 240 };
export const TARGET_STEP = 30;
export const TARGET_MAX = 12 * 60;

/** Keep only known keys with valid values; returns null if any provided key is invalid. */
export function sanitize(x: unknown): Partial<Settings> | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const out: Partial<Settings> = {};
  for (const k of ["sounds", "target"] as const) {
    if (k in o) { if (typeof o[k] !== "boolean") return null; out[k] = o[k]; }
  }
  if ("targetMins" in o) {
    const m = o.targetMins;
    if (typeof m !== "number" || !Number.isInteger(m) || m < TARGET_STEP || m > TARGET_MAX || m % TARGET_STEP) return null;
    out.targetMins = m;
  }
  if ("widgets" in o) {
    const w = o.widgets;
    if (!Array.isArray(w) || !w.every((i) => (WIDGET_IDS as readonly unknown[]).includes(i))) return null;
    out.widgets = [...new Set(w)] as WidgetId[];
  }
  return out;
}
