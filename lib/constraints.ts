// Daily constraints: fixed commitments the Lock In helper must plan around.
// start/end are minutes after local midnight (same-day only; days reset at midnight).

export type Constraint = {
  id: string;
  name: string;
  start: number;
  end: number;
  days: number[] | null; // weekdays 0=Sun..6=Sat; null = every day
  date?: string; // "YYYY-MM-DD": today-only, overrides days
};

export const MAX_CONSTRAINTS = 30;
const DAY_MINS = 1440;
const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/** Validated list, or null if anything is off. */
export function sanitize(x: unknown): Constraint[] | null {
  if (!Array.isArray(x) || x.length > MAX_CONSTRAINTS) return null;
  const out: Constraint[] = [];
  for (const c of x) {
    if (!c || typeof c !== "object") return null;
    const { id, name, start, end, days, date } = c as Record<string, unknown>;
    const n = typeof name === "string" ? name.trim().slice(0, 40) : "";
    if (typeof id !== "string" || !id || id.length > 64 || !n) return null;
    if (!isInt(start) || !isInt(end) || start < 0 || end > DAY_MINS || end <= start) return null;
    if (days !== null && days !== undefined && !(Array.isArray(days) && days.length > 0 && days.every((d) => isInt(d) && d >= 0 && d <= 6))) return null;
    if (date !== undefined && !(typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))) return null;
    const k: Constraint = { id, name: n, start, end, days: Array.isArray(days) ? [...new Set(days as number[])].sort() : null };
    if (date !== undefined) k.date = date;
    out.push(k);
  }
  return out;
}

export const dateKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Constraints that apply to the local day starting at `dayStart` (ms). */
export const appliesOn = (list: Constraint[], dayStart: number) => {
  const key = dateKey(dayStart), wd = new Date(dayStart).getDay();
  return list.filter((c) => (c.date ? c.date === key : !c.days || c.days.includes(wd)));
};

export type Busy = { start: number; end: number };

/** Merged busy intervals (ms) for that local day, sorted. Built from local midnight so DST days stay right. */
export function busyOn(list: Constraint[], dayStart: number): Busy[] {
  const at = (mins: number) => new Date(new Date(dayStart).setHours(0, mins, 0, 0)).getTime();
  const spans = appliesOn(list, dayStart).map((c) => ({ start: at(c.start), end: at(c.end) })).sort((a, b) => a.start - b.start);
  const out: Busy[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}
