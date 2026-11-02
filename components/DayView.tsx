"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { appliesOn, busyOn, dateKey, MAX_CONSTRAINTS, type Constraint } from "@/lib/constraints";
import { freeWindows, learn, needed, plan } from "@/lib/planner";
import { focusIn, formatShort, parseDuration, segments, type Session } from "@/lib/session";
import { useEffective } from "@/lib/prefs";
import type { Settings } from "@/lib/settings";
import { clock, useHistory } from "./Widgets";

const DAY_MINS = 1440;
const WEEK = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]] as const; // Monday first
type Repeat = "daily" | "days" | "today";
type Form = { id?: string; name: string; from: string; ends: "to" | "for"; to: string; dur: string; repeat: Repeat; days: number[] };
const BLANK: Form = { name: "", from: "", ends: "to", to: "", dur: "", repeat: "daily", days: [] };

const toMins = (hhmm: string) => (/^\d{2}:\d{2}$/.test(hhmm) ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) : null);
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const atMin = (m: number) => new Date().setHours(0, m, 0, 0); // only for formatting a clock time
const range = (c: Constraint) => `${clock(atMin(c.start))}–${clock(atMin(c.end))}`;

function repeatLabel(c: Constraint, todayKey: string) {
  if (c.date) return c.date === todayKey ? "Today only" : `Only ${c.date}`;
  if (!c.days) return "Every day";
  const d = c.days.join();
  return d === "1,2,3,4,5" ? "Weekdays" : d === "0,6" ? "Weekends" : WEEK.filter(([n]) => c.days!.includes(n)).map(([, l]) => l).join(", ");
}

/** The Day tab: commitments on one side, the Lock In helper planning the rest of today around them on the other. */
export default function DayView({ initialActive, initialNow, initialConstraints, settings }: {
  initialActive: Session | null; initialNow: number; initialConstraints: Constraint[]; settings: Settings;
}) {
  // Clock times and weekdays are the browser's, so everything below renders client-side only.
  const client = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!client) return <div className="day"><h1 className="pagetitle">Day</h1></div>;
  return <Day now={now} active={initialActive} initial={initialConstraints} settings={settings} />;
}

function Day({ now, active, initial, settings: shared }: { now: number; active: Session | null; initial: Constraint[]; settings: Settings }) {
  const settings = useEffective(shared);
  const today = new Date(now).setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);
  const [list, setList] = useState(initial);
  const [form, setForm] = useState<Form>(BLANK);
  const [error, setError] = useState("");
  const set = (patch: Partial<Form>) => { setForm((f) => ({ ...f, ...patch })); setError(""); };

  async function save(next: Constraint[]) {
    const prev = list;
    setList(next); // optimistic
    const r = await fetch("/api/constraints", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
    if (!r.ok) { setList(prev); setError("Couldn't save. Try again."); return false; }
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const start = toMins(form.from);
    if (start === null) return setError("Pick a start time.");
    let end = form.ends === "to" ? toMins(form.to) : (() => { const d = parseDuration(form.dur, DAY_MINS); return d === null ? null : start + d; })();
    if (end === null) return setError(form.ends === "to" ? "Pick an end time." : "Enter a length like 90, 1:30 or 2h.");
    if (form.ends === "to" && end === 0) end = DAY_MINS; // 00:00 as the end means midnight
    if (end <= start) return setError("It has to end after it starts.");
    if (end > DAY_MINS) return setError("It has to end by midnight. Split it in two.");
    if (form.repeat === "days" && !form.days.length) return setError("Pick at least one day.");
    if (!form.id && list.length >= MAX_CONSTRAINTS) return setError(`Up to ${MAX_CONSTRAINTS} commitments.`);
    const c: Constraint = {
      id: form.id ?? crypto.randomUUID(), name: form.name.trim().slice(0, 40) || "Busy", start, end,
      days: form.repeat === "days" ? [...form.days].sort() : null,
      ...(form.repeat === "today" ? { date: todayKey } : {}),
    };
    const next = form.id ? list.map((x) => (x.id === form.id ? c : x)) : [...list, c];
    if (await save(next)) setForm(BLANK);
  }

  function edit(c: Constraint) {
    const len = c.end - c.start;
    setError("");
    setForm({
      id: c.id, name: c.name, from: hhmm(c.start), ends: "to", to: c.end === DAY_MINS ? "00:00" : hhmm(c.end), dur: `${len}`,
      repeat: c.date ? "today" : c.days ? "days" : "daily", days: c.days ?? [],
    });
  }

  const todays = new Set(appliesOn(list, today).map((c) => c.id));
  const sorted = [...list].sort((a, b) => a.start - b.start || a.end - b.end);

  return (
    <div className="day">
      <h1 className="pagetitle">Day</h1>
      <div className="daygrid">
        <section className="panel" aria-labelledby="commit-h">
          <h2 id="commit-h">Commitments</h2>
          {sorted.length === 0 ? (
            <p className="muted daynote">Nothing added. Add class, work, a commute, the gym: anything you can&apos;t focus through. The helper plans around it.</p>
          ) : (
            <ul className="list daylist">
              {sorted.map((c) => (
                <li key={c.id} className={todays.has(c.id) ? undefined : "off"}>
                  <div>
                    <span className="name"><i className="hatch" aria-hidden="true" />{c.name}</span>
                    <span className="sub muted num">{range(c)} · {formatShort((c.end - c.start) * 60_000)} · {repeatLabel(c, todayKey)}{todays.has(c.id) ? "" : " · not today"}</span>
                  </div>
                  <span className="rowactions">
                    <button className="textbtn" onClick={() => edit(c)} aria-label={`Edit ${c.name}`}>Edit</button>
                    <button className="textbtn danger" onClick={() => { if (form.id === c.id) setForm(BLANK); void save(list.filter((x) => x.id !== c.id)); }} aria-label={`Delete ${c.name}`}>Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form className="dayform" onSubmit={submit} noValidate>
            <h3>{form.id ? "Edit commitment" : "Add a commitment"}</h3>
            <label className="fld"><span className="muted">What</span>
              <input type="text" value={form.name} maxLength={40} placeholder="Class, work, gym…" onChange={(e) => set({ name: e.target.value })} />
            </label>
            <div className="fld2">
              <label className="fld"><span className="muted">From</span>
                <input type="time" value={form.from} onChange={(e) => set({ from: e.target.value })} />
              </label>
              {form.ends === "to" ? (
                <label className="fld"><span className="muted">To</span>
                  <input type="time" value={form.to} onChange={(e) => set({ to: e.target.value })} />
                </label>
              ) : (
                <label className="fld"><span className="muted">For</span>
                  <input type="text" inputMode="text" value={form.dur} placeholder="90, 1:30, 2h" onChange={(e) => set({ dur: e.target.value })} />
                </label>
              )}
            </div>
            <div className="seg" role="group" aria-label="How it ends">
              <button type="button" aria-pressed={form.ends === "to"} onClick={() => set({ ends: "to" })}>Ends at</button>
              <button type="button" aria-pressed={form.ends === "for"} onClick={() => set({ ends: "for" })}>Lasts</button>
            </div>
            <div className="seg" role="group" aria-label="Repeat">
              <button type="button" aria-pressed={form.repeat === "daily"} onClick={() => set({ repeat: "daily" })}>Every day</button>
              <button type="button" aria-pressed={form.repeat === "days"} onClick={() => set({ repeat: "days" })}>Days</button>
              <button type="button" aria-pressed={form.repeat === "today"} onClick={() => set({ repeat: "today" })}>Today only</button>
            </div>
            {form.repeat === "days" && (
              <div className="daychips" role="group" aria-label="Days">
                {WEEK.map(([n, l]) => (
                  <button type="button" key={n} className="pill" aria-pressed={form.days.includes(n)}
                    onClick={() => set({ days: form.days.includes(n) ? form.days.filter((d) => d !== n) : [...form.days, n] })}>{l}</button>
                ))}
              </div>
            )}
            <p className="error" role="alert">{error}</p>
            <div className="formbtns">
              <button className="primary" type="submit">{form.id ? "Save" : "Add"}</button>
              {form.id && <button className="pill" type="button" onClick={() => { setForm(BLANK); setError(""); }}>Cancel</button>}
            </div>
          </form>
        </section>

        <HelperPanel list={list} active={active} now={now} today={today} settings={settings} />
      </div>
    </div>
  );
}

function HelperPanel({ list, active, now, today, settings }: { list: Constraint[]; active: Session | null; now: number; today: number; settings: Settings }) {
  const history = useHistory(today, active?.id, true);
  const habits = useMemo(() => learn(history, today), [history, today]);
  const busy = useMemo(() => busyOn(list, today), [list, today]);
  const targetMs = settings.target ? settings.targetMins * 60_000 : null;
  const dayEnd = new Date(today).setHours(23, 59, 0, 0);
  const midnight = new Date(today).setHours(24, 0, 0, 0);

  const all = [...history.filter((s) => s.id !== active?.id), ...(active ? [active] : [])];
  const doneMs = all.reduce((sum, s) => sum + focusIn(s, today, now, now), 0);

  if (targetMs === null)
    return (
      <section className="panel" aria-labelledby="helper-h">
        <h2 id="helper-h">Lock In helper</h2>
        <p className="muted daynote">Set a daily target in <Link href="/settings" className="inlink">Settings</Link> and the helper will plan your day around your commitments.</p>
      </section>
    );

  const { left, from } = needed(targetMs, doneMs, active, now, habits);
  const p = plan(left, from, dayEnd, habits, busy);
  const blocks = p.status === "met" ? [] : p.blocks;
  const free = freeWindows(Math.ceil(from / 300_000) * 300_000, dayEnd, busy).reduce((a, w) => a + w.end - w.start, 0);
  const pct = (t: number) => `${(Math.max(0, Math.min(1, (t - today) / (midnight - today))) * 100).toFixed(2)}%`;
  const bar = (a: number, b: number) => ({ left: pct(a), width: `${((Math.max(0, Math.min(midnight, b) - Math.max(today, a))) / (midnight - today)) * 100}%` });

  const upcoming = [
    ...blocks.map((b) => ({ at: b.start, end: b.start + b.wall, name: "Focus", len: b.ms, focus: true })),
    ...busy.filter((b) => b.end > now).map((b, i) => ({ at: Math.max(b.start, now), end: b.end, name: todayNames(list, today, b.start, b.end) || `Busy ${i + 1}`, len: b.end - b.start, focus: false })),
  ].sort((a, b) => a.at - b.at);
  const first = blocks[0];

  const headline = p.status === "met"
    ? (doneMs >= targetMs ? "Target reached. Anything more is a bonus." : "The session you're in takes you to your target.")
    : !blocks.length ? "Not enough of today left for another session. Fresh target at midnight."
    : `${blocks.length} session${blocks.length > 1 ? "s" : ""} · ${formatShort(p.plannedMs)}`;
  const last = blocks[blocks.length - 1];
  const note = p.status === "plan" ? `Done by ${clock(last.start + last.wall)}`
    : p.status === "tight" ? "Tight: 5m breaks to make midnight"
    : p.status === "short" ? `${formatShort(p.plannedMs)} of ${formatShort(p.leftMs)} still fits today` : "";
  const nToday = appliesOn(list, today).length;

  const top = habits.learned
    ? habits.weights.map((w, h) => [w, h] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, 3).map(([, h]) => h).sort((a, b) => a - b)
    : [];

  return (
    <section className="panel helperpanel" aria-labelledby="helper-h">
      <h2 id="helper-h">Lock In helper</h2>
      <dl className="totals daytotals">
        <div><dt className="muted">Done</dt><dd className="num">{formatShort(doneMs)}</dd></div>
        <div><dt className="muted">Target</dt><dd className="num">{formatShort(targetMs)}</dd></div>
        <div><dt className="muted">Free today</dt><dd className="num">{formatShort(free)}</dd></div>
      </dl>
      <div className="stitle dayhead">{headline}</div>
      <div className="muted wcap">{note && `${note}. `}{nToday ? `Planned around ${nToday} commitment${nToday > 1 ? "s" : ""}.` : "No commitments today: planning around your habits only."}</div>

      <div className="strip" aria-hidden="true">
        <div className="lane"><span className="muted">Busy</span><div className="laneb">
          {busy.map((b) => <i key={b.start} className="hatch seg-b" style={bar(b.start, b.end)} />)}
        </div></div>
        <div className="lane"><span className="muted">Focus</span><div className="laneb">
          {all.flatMap((s) => segments(s, now).filter((x) => !x.paused).map((x) => <i key={`${s.id}${x.from}`} className="seg-b done" style={bar(x.from, x.to)} />))}
          {blocks.map((b) => <i key={b.start} className="seg-b plan" style={bar(b.start, b.start + b.wall)} />)}
          <i className="nowline" style={{ left: pct(now) }} />
        </div></div>
        <div className="axisrow muted">{[0, 6, 12, 18, 24].map((h) => <span key={h}>{h}</span>)}</div>
      </div>

      {upcoming.length > 0 && (
        <ol className="dayplan">
          {upcoming.map((u) => (
            <li key={`${u.focus}${u.at}`}>
              <span className="num">{u.at <= now + 300_000 && u.focus ? "Now" : clock(u.at)}<span className="muted"> – {clock(u.end)}</span></span>
              <span className="name">{u.focus ? <i className="dot" aria-hidden="true" /> : <i className="hatch" aria-hidden="true" />}{u.name}<span className="muted num"> · {formatShort(u.len)}</span></span>
              {u.focus && first && u.at === first.start && !active
                ? <Link className="pill" href={`/?set=${Math.min(180, Math.round(first.ms / 60_000))}`} aria-label={`Start a ${formatShort(first.ms)} session`}>Start</Link>
                : <span />}
            </li>
          ))}
        </ol>
      )}

      <div className="habits">
        <h3>From your focus data</h3>
        <dl className="habitgrid">
          <div><dt className="muted">Session</dt><dd className="num">{formatShort(habits.lengthMs)}</dd></div>
          <div><dt className="muted">Break</dt><dd className="num">{formatShort(habits.breakMs)}</dd></div>
          <div><dt className="muted">Pauses</dt><dd className="num">{habits.pausesPerHour > 0 ? `${habits.pausesPerHour.toFixed(1)}/h · ${formatShort(habits.pauseMs)}` : "None yet"}</dd></div>
          <div><dt className="muted">Best hours</dt><dd className="num">{top.length ? top.map((h) => `${String(h).padStart(2, "0")}:00`).join(" ") : "Learning"}</dd></div>
        </dl>
        {habits.learned && (
          <div className="hours" aria-hidden="true">
            {habits.weights.map((w, h) => <b key={h} className={top.includes(h) ? "top" : undefined} style={{ height: `${Math.round(w * 100)}%` }} />)}
          </div>
        )}
        <p className="muted hfoot">{habits.learned ? "Learned from your last 4 weeks of sessions, pauses and breaks." : "Defaults for now. It learns your rhythm once you've logged a few sessions."}</p>
      </div>
    </section>
  );
}

/** Names of the commitments making up one merged busy interval. */
function todayNames(list: Constraint[], today: number, start: number, end: number) {
  const names = appliesOn(list, today)
    .filter((c) => new Date(today).setHours(0, c.start, 0, 0) < end && new Date(today).setHours(0, c.end, 0, 0) > start)
    .map((c) => c.name);
  return names.join(" + ");
}
