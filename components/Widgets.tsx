"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { busyOn, type Busy, type Constraint } from "@/lib/constraints";
import { learn, needed, plan } from "@/lib/planner";
import { focusIn, formatDur, formatShort, type Session } from "@/lib/session";
import type { Settings, WidgetId } from "@/lib/settings";

const PRESETS: { id: WidgetId; name: string; about: string }[] = [
  { id: "focus-today", name: "Focus today", about: "Focused time since midnight, against your daily target when one is set." },
  { id: "helper", name: "Lock In helper", about: "Plans the sessions left to hit today's target before midnight, from your own focus habits." },
];
export const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const DAY = 86_400_000;
export const HISTORY_DAYS = 28; // what the helper learns from

/** Finished sessions since midnight `HISTORY_DAYS` ago, reloaded when the day rolls, a session starts or ends, or the tab returns. */
export function useHistory(today: number, activeId: string | undefined, on: boolean) {
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

/** The saved daily constraints, reloaded when the tab returns. */
export function useConstraints(on: boolean) {
  const [list, setList] = useState<Constraint[]>([]);
  useEffect(() => {
    if (!on) return;
    let live = true;
    const load = () =>
      fetch("/api/constraints", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((c: Constraint[]) => live && setList(c));
    load();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => { live = false; document.removeEventListener("visibilitychange", onVis); };
  }, [on]);
  return list;
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

/** Next sessions to reach the target by 23:59, laid out by lib/planner from the last four weeks. */
function Helper({ history, busy, active, now, today, doneMs, targetMs, onUse }: {
  history: Session[]; busy: Busy[]; active: Session | null; now: number; today: number; doneMs: number; targetMs: number | null; onUse: (ms: number) => void;
}) {
  const habits = useMemo(() => learn(history, today), [history, today]);
  if (targetMs === null)
    return <Box><p className="hmsg">Set a daily target in Settings and this will plan the rest of your day.</p></Box>;

  const { left, from } = needed(targetMs, doneMs, active, now, habits);
  const p = plan(left, from, new Date(today).setHours(23, 59, 0, 0), habits, busy);

  if (p.status === "met")
    return <Box><p className="hmsg">{doneMs >= targetMs ? "Target reached. Anything more is a bonus." : "This session takes you to your target."}</p></Box>;
  if (!p.blocks.length)
    return <Box><p className="hmsg">Not enough of today left for another session. Fresh target at midnight.</p></Box>;

  const last = p.blocks[p.blocks.length - 1];
  const note = p.status === "plan" ? `Done by ${clock(last.start + last.wall)}`
    : p.status === "tight" ? "Tight: 5m breaks to make midnight"
    : `${formatShort(p.plannedMs)} of ${formatShort(p.leftMs)} still fits today`;
  return (
    <Box>
      <div className="stitle">{p.blocks.length} session{p.blocks.length > 1 ? "s" : ""} · {formatShort(p.plannedMs)}</div>
      <div className="muted wcap">{active ? "After this session. " : ""}{note}</div>
      <ol className="hplan">
        {p.blocks.slice(0, 4).map((b, i) => (
          <li key={b.start}>
            <span className="num">{b.start - now < 5 * 60_000 ? "Now" : clock(b.start)}</span>
            <span className="num muted">{formatShort(b.ms)}</span>
            {i === 0 && !active && <button className="pill" onClick={() => onUse(b.ms)} aria-label={`Set timer to ${formatShort(b.ms)}`}>Set</button>}
          </li>
        ))}
      </ol>
      {p.blocks.length > 4 && <div className="muted wcap">+{p.blocks.length - 4} more</div>}
      <div className="muted hfoot">
        {habits.learned
          ? `From your last 4 weeks: ${formatShort(habits.lengthMs)} sessions, ${formatShort(habits.breakMs)} breaks, your usual hours.`
          : `${formatShort(habits.lengthMs)} sessions for now; it learns your rhythm as you log more.`}
      </div>
    </Box>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="widget"><div className="muted">Lock In helper</div>{children}</div>;
}

export function WidgetRow({ settings, now, active, onUse }: { settings: Settings; now: number; active: Session | null; onUse: (ms: number) => void }) {
  const today = new Date(now).setHours(0, 0, 0, 0); // overnight sessions split at midnight, as in Analysis
  const history = useHistory(today, active?.id, settings.widgets.length > 0);
  const constraints = useConstraints(settings.widgets.includes("helper"));
  // Days and clock times depend on the browser's timezone, not the server's, so widgets render client-side only.
  const client = useSyncExternalStore(() => () => {}, () => true, () => false);
  if (!settings.widgets.length || !client) return null;

  const all = [...history.filter((s) => s.id !== active?.id), ...(active ? [active] : [])];
  const doneMs = all.reduce((sum, s) => sum + focusIn(s, today, now, now), 0);
  const targetMs = settings.target ? settings.targetMins * 60_000 : null;
  return (
    <div className="widgets" aria-label="Widgets">
      {settings.widgets.map((w) =>
        w === "focus-today" ? <FocusToday key={w} doneMs={doneMs} targetMs={targetMs} />
        : <Helper key={w} history={history} busy={busyOn(constraints, today)} active={active} now={now} today={today} doneMs={doneMs} targetMs={targetMs} onUse={onUse} />,
      )}
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
