export const WIDGET_IDS = ["focus-today"] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export type Settings = {
  ring: boolean; // countdown progress ring with pause ticks
  sounds: boolean;
  widgets: WidgetId[];
};

export const DEFAULTS: Settings = { ring: false, sounds: true, widgets: [] };

/** Keep only known keys with valid values; returns null if any provided key is invalid. */
export function sanitize(x: unknown): Partial<Settings> | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const out: Partial<Settings> = {};
  for (const k of ["ring", "sounds"] as const) {
    if (k in o) { if (typeof o[k] !== "boolean") return null; out[k] = o[k]; }
  }
  if ("widgets" in o) {
    const w = o.widgets;
    if (!Array.isArray(w) || !w.every((i) => (WIDGET_IDS as readonly unknown[]).includes(i))) return null;
    out.widgets = [...new Set(w)] as WidgetId[];
  }
  return out;
}
