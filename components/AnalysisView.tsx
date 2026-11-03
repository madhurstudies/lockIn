"use client";
import Script from "next/script";
import { useEffect, useMemo, useState } from "react";
import BarChart, { type BarsOpts } from "./Chart";
import Calendar, { fromDateKey } from "./Calendar";
import { dateKey } from "@/lib/constraints";
import { bucketize, byHourOfDay, dayEdges, focusIn, formatDur, isOvernight, pausedIn, partOf, toSeries, type Buckets } from "@/lib/analysis";
import { elapsedMs, endForFocus, overMs, parseDuration, pausedMs, segments, withEnd, type Session } from "@/lib/session";

const HOUR = 3_600_000;
const RANGES = { today: ["Today", 1], week: ["Week", 7], month: ["Month", 30] } as const;
type Range = keyof typeof RANGES | "calendar" | "day"; // "day": one chosen date, opened from the calendar
type Mode = "tag" | "total";

function Mode({ value, onChange, label }: { value: Mode; onChange: (m: Mode) => void; label: string }) {
  return (
    <div className="seg mini" role="group" aria-label={label}>
      {(["tag", "total"] as const).map((m) => (
        <button key={m} aria-pressed={value === m} onClick={() => onChange(m)}>{m === "tag" ? "By tag" : "Total"}</button>
      ))}
    </div>
  );
}

/** Chart options from tag buckets: hours on the axis once any bar passes two hours, minutes before that. */
function chartOpts(b: Buckets, labels: string[], mode: Mode, xAt: number[] | undefined, ready: boolean): BarsOpts & { ready: boolean } {
  const n = labels.length;
  const peak = Math.max(0, ...Array.from({ length: n }, (_, i) => [...b.values()].reduce((a, r) => a + r.values[i], 0)));
  const unit = peak >= 2 * HOUR ? HOUR : 60_000;
  const { values, stacks } = toSeries(b, n, mode, unit);
  const tickFormat = unit === HOUR ? (v: number) => `${+v.toFixed(2)}h` : (v: number) => `${+v.toFixed(1)}m`;
  return { labels, values, stacks, format: (v: number) => formatDur(v * unit), tickFormat, xAt, ready };
}

const p2 = (n: number) => String(n).padStart(2, "0");
/** A moment as the value of <input type="datetime-local"> (local time, minute precision). */
const toInput = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const when = (t: number) => new Date(t).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Correct where a finished session ended, earlier or later (the start is fixed, and it can't end in the future): by clock time, or by how long you really focused. */
function EditEnd({ s, onSaved, onCancel }: { s: Session; onSaved: (s: Session) => void; onCancel: () => void }) {
  const end0 = s.endedAt!;
  const focus0 = elapsedMs(s, end0);
  const [now] = useState(Date.now); // what "the future" means while this editor is open
  const [by, setBy] = useState<"end" | "focus">("end");
  const [at, setAt] = useState(toInput(end0));
  const [dur, setDur] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // The end this form describes, or what is wrong with it.
  const r: { end?: number; err?: string } = (() => {
    if (by === "end") {
      const t = new Date(at).getTime();
      if (!at || Number.isNaN(t)) return { err: "Pick a date and time." };
      const end = at === toInput(end0) ? end0 : t; // same minute as recorded: keep the exact end
      if (end <= s.startedAt) return { err: "It has to end after it started." };
      if (end > now) return { err: "That's in the future." };
      return { end };
    }
    if (!dur.trim()) return {};
    const mins = parseDuration(dur, 100_000);
    if (mins === null) return { err: "Try 45, 1:30 or 2h." };
    const end = endForFocus(s, mins * 60_000);
    if (end > now) return { err: "That would end in the future." };
    return { end };
  })();
  const changed = r.end !== undefined && r.end !== end0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!changed || busy) return;
    setBusy(true);
    setFailed(false);
    const res = await fetch("/api/sessions", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id, endedAt: r.end }) });
    setBusy(false);
    if (res.ok) onSaved(await res.json());
    else setFailed(true);
  }

  return (
    <form className="editrow" onSubmit={save} noValidate>
      <p className="muted sub">Recorded: {when(s.startedAt)} to {when(end0)} · {formatDur(focus0)} focused. The start can&apos;t change; the end can move either way, up to now.</p>
      <div className="seg mini" role="group" aria-label="Correct by">
        <button type="button" aria-pressed={by === "end"} onClick={() => setBy("end")}>Ended at</button>
        <button type="button" aria-pressed={by === "focus"} onClick={() => setBy("focus")}>Focused</button>
      </div>
      {by === "end" ? (
        <input type="datetime-local" className="select" step={60} min={toInput(s.startedAt)} max={toInput(now)} value={at} onChange={(e) => setAt(e.target.value)} aria-label="New end time" />
      ) : (
        <input type="text" className="select" value={dur} placeholder="45, 1:30, 2h" autoComplete="off" onChange={(e) => setDur(e.target.value)} aria-label="Focused time" autoFocus />
      )}
      <p className="muted sub num" aria-live="polite">
        {r.end !== undefined && `Focus ${formatDur(elapsedMs(withEnd(s, r.end), r.end))} · ends ${when(r.end)}`}
      </p>
      <p className="error" role="alert">{r.err ?? (failed ? "Couldn't save. Try again." : "")}</p>
      <span className="rowactions">
        <button type="button" className="textbtn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="textbtn save" disabled={!changed || busy}>Save</button>
      </span>
    </form>
  );
}

export default function AnalysisView() {
  const [range, setRange] = useState<Range>("today");
  const [data, setData] = useState<{ from: number; now: number; sessions: Session[] } | null>(null);
  const [ready, setReady] = useState(false);
  const [timeMode, setTimeMode] = useState<Mode>("tag");
  const [hourMode, setHourMode] = useState<Mode>("tag");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState(0); // local midnight of the chosen day
  const [today] = useState(() => dayEdges(Date.now(), 1)[0]);
  const days = range === "week" ? 7 : range === "month" ? 30 : 1;

  useEffect(() => {
    if (range === "calendar") return;
    let live = true;
    const now = Date.now();
    const from = range === "day" ? date : dayEdges(now - (days - 1) * 86_400_000, 1)[0];
    const to = range === "day" ? dayEdges(date, 1)[1] : now; // a chosen day: all of it
    fetch(`/api/sessions?from=${from}&to=${to}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((sessions: Session[]) => live && setData({ from, now: Math.min(to, now), sessions })); // overlapping sessions, clipped below
    return () => { live = false; };
  }, [range, date, days]);

  const go = (r: Range) => { setData(null); setRange(r); };
  const open = (day: number) => { setData(null); setDate(day); setRange("day"); };
  const shift = (n: number) => { const d = new Date(date); open(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime()); };

  async function remove(id: string) {
    setConfirm(null);
    const r = await fetch(`/api/sessions?id=${id}`, { method: "DELETE" });
    if (r.ok || r.status === 404) setData((d) => d && { ...d, sessions: d.sessions.filter((s) => s.id !== id) });
  }

  const saved = (s: Session) => { setEditing(null); setData((d) => d && { ...d, sessions: d.sessions.map((x) => (x.id === s.id ? s : x)) }); };

  const view = useMemo(() => {
    if (!data) return null;
    const { from, now, sessions } = data;
    const list = sessions; // API returns every session overlapping the range
    const edges = dayEdges(from, days);
    const focus = list.reduce((a, s) => a + focusIn(s, from, now, now), 0);
    const paused = list.reduce((a, s) => a + pausedIn(s, from, now, now), 0);
    const tags = [...bucketize(list, [from, now], now).values()]
      .map((r) => ({ ...r.part, ms: r.values[0] }))
      .sort((a, b) => b.ms - a.ms);

    // chart 1: hours of today, or days of the range
    const timeEdges = days === 1 ? Array.from({ length: 25 }, (_, h) => from + h * HOUR) : edges;
    const timeLabels = days === 1
      ? Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`)
      : edges.slice(0, -1).map((t) => new Date(t).toLocaleDateString(undefined, days === 7 ? { weekday: "short" } : { day: "numeric", month: "short" }));
    const timeB = bucketize(list, timeEdges, now);
    const hourB = byHourOfDay(list, from, now);
    const hourLabels = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

    const rows = edges.slice(0, -1).map((start, i) => ({
      from: start,
      to: edges[i + 1],
      segs: list.flatMap((s) => segments(s, now).filter((x) => x.to > start && x.from < edges[i + 1]).map((x) => ({ ...x, s }))),
    }));
    return { list, focus, paused, tags, timeB, timeLabels, hourB, hourLabels, rows };
  }, [data, days]);

  const timeOpts = useMemo(
    () => view && chartOpts(view.timeB, view.timeLabels, timeMode, days === 1 ? [0, 6, 12, 18] : undefined, ready),
    [view, timeMode, days, ready],
  );
  const hourOpts = useMemo(
    () => view && chartOpts(view.hourB, view.hourLabels, hourMode, [0, 6, 12, 18], ready),
    [view, hourMode, ready],
  );

  const top = view?.tags[0]?.ms || 1;
  const rowH = days === 1 ? 40 : days === 7 ? 22 : 12;
  const empty = !!view && !view.list.length;

  return (
    <div className="analysis">
      <Script src="/vendor/charts.js" strategy="afterInteractive" onReady={() => setReady(true)} />
      <h1 className="pagetitle">Analysis</h1>
      <div className="seg" role="group" aria-label="Range">
        {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((r) => (
          <button key={r} aria-pressed={range === r} onClick={() => go(r)}>{RANGES[r][0]}</button>
        ))}
        <button aria-pressed={range === "calendar" || range === "day"} onClick={() => go("calendar")}>Calendar</button>
      </div>

      {range === "calendar" && <Calendar onPick={open} />}

      {range === "day" && (
        <div className="dayhead">
          <button className="pill" onClick={() => shift(-1)} aria-label="Previous day">‹</button>
          <input type="date" className="select" value={dateKey(date)} max={dateKey(today)} aria-label="Date"
            onChange={(e) => e.target.value && open(Math.min(today, fromDateKey(e.target.value)))} />
          <button className="pill" onClick={() => shift(1)} disabled={date >= today} aria-label="Next day">›</button>
          <span className="muted dayname">{new Date(date).toLocaleDateString(undefined, { weekday: "long" })}</span>
          <button className="textbtn back" onClick={() => go("calendar")}>Calendar</button>
        </div>
      )}

      {range !== "calendar" && <dl className="totals">
        <div><dt className="muted">Focus</dt><dd className="num">{view ? formatDur(view.focus) : "–"}</dd></div>
        <div><dt className="muted">Paused</dt><dd className="num">{view ? formatDur(view.paused) : "–"}</dd></div>
        <div><dt className="muted">Sessions</dt><dd className="num">{view ? view.list.length : "–"}</dd></div>
      </dl>}

      {empty && <p className="empty muted">{range === "day" ? "No focus sessions on this day." : "No focus sessions in this range yet. Start one on the Timer tab."}</p>}

      {view && !empty && timeOpts && hourOpts && (
        <>
          <section className="panel">
            <div className="panelhead">
              <h2>{days === 1 ? "Focus by hour" : "Focus by day"}</h2>
              <Mode value={timeMode} onChange={setTimeMode} label="Focus chart grouping" />
            </div>
            <BarChart opts={timeOpts} label={days === 1 ? "Focus time per hour today" : "Focus time per day"} />
          </section>

          {days > 1 && (
            <section className="panel">
              <div className="panelhead">
                <h2>When you focus</h2>
                <Mode value={hourMode} onChange={setHourMode} label="Time of day chart grouping" />
              </div>
              <BarChart opts={hourOpts} label="Focus time by hour of the day" />
            </section>
          )}

          <section className="panel">
            <h2>By tag</h2>
            <ul className="bars">
              {view.tags.map((t) => (
                <li key={t.key}>
                  <span className="name"><i style={{ background: t.color }} />{t.name}</span>
                  <span className="track"><b style={{ width: `${(t.ms / top) * 100}%`, background: t.color }} /></span>
                  <span className="num muted">{formatDur(t.ms)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2>Timeline</h2>
            <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
              <defs>
                <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="5" height="5" fill="var(--raised)" />
                  <line x1="0" y1="0" x2="0" y2="5" stroke="var(--muted)" strokeWidth="1.5" />
                </pattern>
              </defs>
            </svg>
            <div className="axis muted" aria-hidden="true">
              <span /><div>{["0", "6", "12", "18", "24"].map((h) => <span key={h}>{h}h</span>)}</div>
            </div>
            {view.rows.map((r) => (
              <div className="trow" key={r.from}>
                <span className="muted num">
                  {days === 1 ? "" : new Date(r.from).toLocaleDateString(undefined, days === 7 ? { weekday: "short" } : { day: "numeric", month: "short" })}
                </span>
                <svg height={rowH} width="100%" preserveAspectRatio="none" role="img"
                  aria-label={`${new Date(r.from).toLocaleDateString()}: ${formatDur(r.segs.filter((x) => !x.paused).reduce((a, x) => a + Math.min(x.to, r.to) - Math.max(x.from, r.from), 0))} focused`}>
                  <rect width="100%" height={rowH} rx="4" fill="var(--raised)" />
                  {r.segs.map((x, i) => {
                    const len = r.to - r.from;
                    const l = (Math.max(x.from, r.from) - r.from) / len * 100;
                    const w = Math.max(0.3, (Math.min(x.to, r.to) - Math.max(x.from, r.from)) / len * 100);
                    const over = isOvernight(x.s);
                    return (
                      <rect key={i} x={`${l}%`} width={`${w}%`} height={rowH} fill={x.paused ? "url(#hatch)" : partOf(x.s).color}>
                        <title>{`${x.paused ? "Paused" : partOf(x.s).name} · session ${formatDur(elapsedMs(x.s, x.s.endedAt!))}${over ? " · overnight" : ""}`}</title>
                      </rect>
                    );
                  })}
                  {r.segs.filter((x) => x.from < r.from && !x.paused).slice(0, 1).map((x) => (
                    <rect key="in" x="0" width="0.6%" height={rowH} fill="var(--text)"><title>{`Continues from the previous day · session ${formatDur(elapsedMs(x.s, x.s.endedAt!))}`}</title></rect>
                  ))}
                  {r.segs.filter((x) => x.to > r.to && !x.paused).slice(0, 1).map((x) => (
                    <rect key="out" x="99.4%" width="0.6%" height={rowH} fill="var(--text)"><title>{`Continues into the next day · session ${formatDur(elapsedMs(x.s, x.s.endedAt!))}`}</title></rect>
                  ))}
                </svg>
              </div>
            ))}
            <p className="legend muted"><svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" rx="3" fill="url(#hatch)" /></svg> Paused</p>
          </section>

          <section className="panel">
            <h2>Sessions</h2>
            <ul className="list">
              {[...view.list].sort((a, b) => b.startedAt - a.startedAt).map((s) => (
                <li key={s.id} className={editing === s.id ? "editing" : undefined}>
                  <span>
                    <span className="name"><i style={{ background: partOf(s).color }} />{partOf(s).name}{isOvernight(s) && <span className="ovn">Overnight</span>}</span>
                    <span className="muted sub num">
                      {new Date(s.startedAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                      {" · "}{s.mode === "countdown" ? `Timer ${formatDur(s.plannedMs ?? 0)}${overMs(s, s.endedAt!) >= 60_000 ? ` (+${formatDur(overMs(s, s.endedAt!))} over)` : ""}` : "Stopwatch"}
                      {s.pauses.length ? ` · ${s.pauses.length} pause${s.pauses.length > 1 ? "s" : ""}, ${formatDur(pausedMs(s, s.endedAt!))}` : ""}
                    </span>
                  </span>
                  <span className="end">
                    <span className="num">{formatDur(elapsedMs(s, s.endedAt!))}</span>
                    {confirm === s.id ? (
                      <span className="rowactions">
                        <button className="textbtn danger" onClick={() => remove(s.id)}>Delete</button>
                        <button className="textbtn" onClick={() => setConfirm(null)}>Cancel</button>
                      </span>
                    ) : (
                      <span className="rowactions">
                        <button className="textbtn" onClick={() => setEditing(editing === s.id ? null : s.id)} aria-expanded={editing === s.id} aria-label={`Edit ${partOf(s).name} session`}>Edit</button>
                        <button className="textbtn danger" onClick={() => setConfirm(s.id)} aria-label={`Delete ${partOf(s).name} session`}>Delete</button>
                      </span>
                    )}
                  </span>
                  {editing === s.id && <EditEnd s={s} onSaved={saved} onCancel={() => setEditing(null)} />}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
