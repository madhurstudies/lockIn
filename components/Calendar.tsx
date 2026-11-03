"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { dateKey } from "@/lib/constraints";
import { dailyFocus, dayEdges, formatDur } from "@/lib/analysis";
import type { Session } from "@/lib/session";

const WEEKS = 53;

/** Parse the value of <input type="date"> as a local midnight; NaN when empty. */
export const fromDateKey = (v: string) => { const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };

/** A year of days as a grid, one cell per day, shaded by how much was focused (like a contribution graph). Click a day to open it. */
export default function Calendar({ onPick }: { onPick: (day: number) => void }) {
  const [now] = useState(Date.now);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // The grid is fixed when the page opens: 53 weeks back from today, starting on a Sunday.
  const [{ today, first, days }] = useState(() => {
    const today = dayEdges(now, 1)[0];
    const t = new Date(today);
    const at = (n: number) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + n).getTime();
    const back = t.getDay() + (WEEKS - 1) * 7;
    return { today, first: at(-back), days: Array.from({ length: back + 1 }, (_, i) => at(i - back)) };
  });

  useEffect(() => {
    let live = true;
    fetch(`/api/sessions?from=${first}&to=${now}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((s: Session[]) => live && setSessions(s));
    return () => { live = false; };
  }, [first, now]);

  const per = useMemo(() => dailyFocus(sessions ?? [], now), [sessions, now]);
  const max = Math.max(1, ...per.values());
  useEffect(() => { if (box.current) box.current.scrollLeft = box.current.scrollWidth; }, [sessions]); // newest weeks in view

  const total = [...per.values()].reduce((a, b) => a + b, 0);
  const active = [...per.values()].filter((v) => v > 0).length;
  const cols = Math.ceil(days.length / 7);

  return (
    <section className="panel" aria-labelledby="cal-h">
      <div className="panelhead">
        <h2 id="cal-h">Calendar</h2>
        <label className="jump muted">
          <span>Go to</span>
          <input type="date" className="select" max={dateKey(today)} onChange={(e) => e.target.value && onPick(Math.min(today, fromDateKey(e.target.value)))} aria-label="Go to date" />
        </label>
      </div>
      <div className="heat" ref={box}>
        <div className="heatmonths muted" style={{ gridTemplateColumns: `repeat(${cols}, var(--cell))` }} aria-hidden="true">
          {days.map((d, i) => new Date(d).getDate() === 1 && <span key={d} style={{ gridColumn: Math.floor(i / 7) + 1 }}>{new Date(d).toLocaleDateString(undefined, { month: "short" })}</span>)}
        </div>
        <div className="heatgrid" role="group" aria-label="Focus per day">
          {days.map((d) => {
            const ms = per.get(d) ?? 0;
            const label = `${new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · ${ms ? formatDur(ms) : "no focus"}`;
            return (
              <button key={d} className={`cell l${ms ? Math.min(4, Math.ceil((ms / max) * 4)) : 0}${d === today ? " today" : ""}`} title={label} aria-label={label} onClick={() => onPick(d)} />
            );
          })}
        </div>
      </div>
      <div className="heatfoot muted">
        <span>{sessions ? `${formatDur(total)} over ${active} day${active === 1 ? "" : "s"} in the last year` : "Loading…"}</span>
        <span className="legend2" aria-hidden="true">Less {[0, 1, 2, 3, 4].map((l) => <i key={l} className={`cell l${l}`} />)} More</span>
      </div>
      <p className="muted hfoot">The last year is shown. Sessions are kept while they fit in storage (roughly a year of use); the oldest drop off automatically after that.</p>
    </section>
  );
}
