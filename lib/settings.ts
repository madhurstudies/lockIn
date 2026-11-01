export const WIDGET_IDS = ["focus-today"] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export type Settings = {
  ring: boolean; // countdown progress ring with pause ticks
  sounds: boolean;
  dayStartHour: number; // 0-23, when "today" resets for widgets
  widgets: WidgetId[];
};

export const DEFAULTS: Settings = { ring: false, sounds: true, dayStartHour: 0, widgets: [] };

/** Keep only known keys with valid values; returns null if any provided key is invalid. */
export function sanitize(x: unknown): Partial<Settings> | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const out: Partial<Settings> = {};
  for (const k of ["ring", "sounds"] as const) {
    if (k in o) { if (typeof o[k] !== "boolean") return null; out[k] = o[k]; }
  }
  if ("dayStartHour" in o) {
    const h = o.dayStartHour;
    if (typeof h !== "number" || !Number.isInteger(h) || h < 0 || h > 23) return null;
    out.dayStartHour = h;
  }
  if ("widgets" in o) {
    const w = o.widgets;
    if (!Array.isArray(w) || !w.every((i) => (WIDGET_IDS as readonly unknown[]).includes(i))) return null;
    out.widgets = [...new Set(w)] as WidgetId[];
  }
  return out;
}
