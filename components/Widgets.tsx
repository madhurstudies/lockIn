"use client";
import { useEffect, useState } from "react";
import { focusIn, formatDur, type Session } from "@/lib/session";
import type { Settings, WidgetId } from "@/lib/settings";

const PRESETS: { id: WidgetId; name: string; about: string }[] = [
  { id: "focus-today", name: "Focus today", about: "Total focused time since midnight." },
];

function FocusToday({ now, active }: { now: number; active: Session | null }) {
  const [done, setDone] = useState<Session[]>([]);
  const from = new Date(now).setHours(0, 0, 0, 0); // overnight sessions split at midnight, as in Analysis

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`/api/sessions?from=${from}&to=${Date.now() + 60_000}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((s: Session[]) => live && setDone(s));
    load();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => { live = false; document.removeEventListener("visibilitychange", onVis); };
  }, [from, active?.id]); // reload when the window moves or a session starts/ends

  const total = [...done, ...(active ? [active] : [])]
    .filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i)
    .reduce((sum, s) => sum + focusIn(s, from, now, now), 0);

  return (
    <div className="widget">
      <div className="muted">Focus today</div>
      <div className="wvalue num">{formatDur(total)}</div>
      <div className="muted wcap">since midnight</div>
    </div>
  );
}

export function WidgetRow({ settings, now, active }: { settings: Settings; now: number; active: Session | null }) {
  if (!settings.widgets.length) return null;
  return (
    <div className="widgets" aria-label="Widgets">
      {settings.widgets.includes("focus-today") && <FocusToday now={now} active={active} />}
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
