"use client";
import { useEffect, useState } from "react";
import { focusIn, formatDur, formatShort, type Session } from "@/lib/session";
import type { Settings, WidgetId } from "@/lib/settings";

const PRESETS: { id: WidgetId; name: string; about: string }[] = [
  { id: "focus-today", name: "Focus today", about: "Focused time since midnight, against your daily target when one is set." },
];

const DAY = 86_400_000;
const HISTORY_DAYS = 28; // what the helper learns from

/** Finished sessions since midnight `HISTORY_DAYS` ago, reloaded when the day rolls, a session starts or ends, or the tab returns. */
function useHistory(today: number, activeId: string | undefined, on: boolean) {
  const [sessions, setSessions] = useState<Session[]>([]);
  useEffect(() => {
    if (!on) return;
    let live = true;
    const load = () =>
      fetch(`/api/sessions?from=${today - HISTORY_DAYS * DAY}&to=${Date.now() + 60_000}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((s: Session[]) => live && setSessions(s));
    load();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => { live = false; document.removeEventListener("visibilitychange", onVis); };
  }, [today, activeId, on]);
  return sessions;
}

function FocusToday({ doneMs, targetMs }: { doneMs: number; targetMs: number | null }) {
  const p = targetMs ? Math.min(1, doneMs / targetMs) : 0;
  return (
    <div className="widget">
      <div className="muted">Focus today</div>
      <div className="wvalue num">
        {formatDur(doneMs)}
        {targetMs !== null && <span className="muted wof"> / {formatShort(targetMs)}</span>}
      </div>
      <div className="muted wcap">{targetMs === null ? "since midnight" : p >= 1 ? "Target reached" : `${formatDur(targetMs - doneMs)} to go`}</div>
      {targetMs !== null && (
        <div className="wband" role="progressbar" aria-label="Daily target" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
          <b style={{ transform: `scaleX(${p})` }} />
        </div>
      )}
    </div>
  );
}

export function WidgetRow({ settings, now, active }: { settings: Settings; now: number; active: Session | null }) {
  const today = new Date(now).setHours(0, 0, 0, 0); // overnight sessions split at midnight, as in Analysis
  const history = useHistory(today, active?.id, settings.widgets.length > 0);
  if (!settings.widgets.length) return null;

  const all = [...history.filter((s) => s.id !== active?.id), ...(active ? [active] : [])];
  const doneMs = all.reduce((sum, s) => sum + focusIn(s, today, now, now), 0);
  const targetMs = settings.target ? settings.targetMins * 60_000 : null;
  return (
    <div className="widgets" aria-label="Widgets">
      {settings.widgets.includes("focus-today") && <FocusToday doneMs={doneMs} targetMs={targetMs} />}
    </div>
  );
}

/** Bottom-right button that opens the preset sheet on the right. */
export function WidgetSheet({ settings, onChange }: { settings: Settings; onChange: (w: WidgetId[]) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);

  return (
    <>
      <div className="dock right">
        <button className="fab" aria-label="Widgets" aria-expanded={open} onClick={() => setOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
            <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><path d="M16.75 13.5v6.5M13.5 16.75H20" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {open && (
        <>
          <button className="backdrop" aria-label="Close widgets" onClick={() => setOpen(false)} />
          <aside className="sheet" role="dialog" aria-label="Widgets">
            <div className="sheethead">
              <h2>Widgets</h2>
              <button className="textbtn quiet" style={{ color: "var(--muted)" }} onClick={() => setOpen(false)}>Done</button>
            </div>
            <ul className="presets">
              {PRESETS.map((p) => {
                const on = settings.widgets.includes(p.id);
                return (
                  <li key={p.id}>
                    <div><div className="stitle">{p.name}</div><div className="muted shint">{p.about}</div></div>
                    <button className="pill" onClick={() => onChange(on ? settings.widgets.filter((w) => w !== p.id) : [...settings.widgets, p.id])}>
                      {on ? "Remove" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </>
      )}
    </>
  );
}
