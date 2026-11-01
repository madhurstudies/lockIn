"use client";
import { useEffect, useMemo, useState } from "react";
import { elapsedMs, pausedMs, type Session } from "@/lib/session";

const DAY = 86_400_000;
const RANGES = { today: ["Today", 1], week: ["Week", 7], month: ["Month", 30] } as const;
type Range = keyof typeof RANGES;
const UNTAGGED = "#8e8e93";

const midnight = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

function dur(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 1) return `${Math.round(ms / 1000)}s`;
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

type Seg = { from: number; to: number; color: string; paused: boolean };

/** Focus and paused intervals of a finished session, in order. */
function segments(s: Session): Seg[] {
  const color = s.tag?.color ?? UNTAGGED;
  const out: Seg[] = [];
  let at = s.startedAt;
  for (const p of s.pauses) {
    out.push({ from: at, to: p.at, color, paused: false });
    out.push({ from: p.at, to: p.resumedAt ?? s.endedAt!, color, paused: true });
    at = p.resumedAt ?? s.endedAt!;
  }
  out.push({ from: at, to: s.endedAt!, color, paused: false });
  return out.filter((x) => x.to > x.from);
}

export default function AnalysisView() {
  const [range, setRange] = useState<Range>("today");
  const [data, setData] = useState<{ start: number; sessions: Session[] } | null>(null);
  const sessions = data?.sessions ?? null;
  const start = data?.start ?? 0;
  const days = RANGES[range][1];

  useEffect(() => {
    let live = true;
    const from = midnight(Date.now() - (days - 1) * DAY);
    fetch(`/api/sessions?from=${from}&to=${Date.now()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((s: Session[]) => live && setData({ start: from, sessions: s.filter((x) => x.startedAt >= from) }));
    return () => { live = false; };
  }, [days]);

  const stats = useMemo(() => {
    const list = sessions ?? [];
    const byTag = new Map<string, { name: string; color: string; ms: number }>();
    let focus = 0, paused = 0;
    for (const s of list) {
      const f = elapsedMs(s, s.endedAt!);
      focus += f;
      paused += pausedMs(s, s.endedAt!);
      const k = s.tag?.id ?? "none";
      const e = byTag.get(k) ?? { name: s.tag?.name ?? "No tag", color: s.tag?.color ?? UNTAGGED, ms: 0 };
      e.ms += f;
      byTag.set(k, e);
    }
    return { list, focus, paused, tags: [...byTag.values()].sort((a, b) => b.ms - a.ms) };
  }, [sessions]);

  const rows = useMemo(() => {
    const segs = stats.list.flatMap(segments);
    return Array.from({ length: days }, (_, i) => {
      const from = start + i * DAY;
      return { from, segs: segs.filter((x) => x.to > from && x.from < from + DAY) };
    });
  }, [stats.list, days, start]);

  const top = stats.tags[0]?.ms || 1;
  const rowH = days === 1 ? 40 : days === 7 ? 22 : 12;

  return (
    <div className="analysis">
      <div className="seg" role="group" aria-label="Range">
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <button key={r} aria-pressed={range === r} onClick={() => { setData(null); setRange(r); }}>{RANGES[r][0]}</button>
        ))}
      </div>

      <dl className="totals">
        <div><dt className="muted">Focus</dt><dd className="num">{dur(stats.focus)}</dd></div>
        <div><dt className="muted">Paused</dt><dd className="num">{dur(stats.paused)}</dd></div>
        <div><dt className="muted">Sessions</dt><dd className="num">{stats.list.length}</dd></div>
      </dl>

      {sessions && !stats.list.length ? (
        <p className="empty muted">No focus sessions in this range yet. Start one on the Timer tab.</p>
      ) : (
        <>
          <section className="panel">
            <h2>By tag</h2>
            <ul className="bars">
              {stats.tags.map((t) => (
                <li key={t.name}>
                  <span className="name"><i style={{ background: t.color }} />{t.name}</span>
                  <span className="track"><b style={{ width: `${(t.ms / top) * 100}%`, background: t.color }} /></span>
                  <span className="num muted">{dur(t.ms)}</span>
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
            {rows.map((r) => (
              <div className="trow" key={r.from}>
                <span className="muted num">
                  {days === 1 ? "" : new Date(r.from).toLocaleDateString(undefined, days === 7 ? { weekday: "short" } : { day: "numeric", month: "short" })}
                </span>
                <svg height={rowH} width="100%" preserveAspectRatio="none" role="img"
                  aria-label={`${new Date(r.from).toLocaleDateString()}: ${r.segs.length ? dur(r.segs.filter((x) => !x.paused).reduce((a, x) => a + x.to - x.from, 0)) + " focused" : "no sessions"}`}>
                  <rect width="100%" height={rowH} rx="4" fill="var(--raised)" />
                  {r.segs.map((x, i) => {
                    const l = Math.max(0, (x.from - r.from) / DAY) * 100;
                    const w = Math.max(0.3, ((Math.min(x.to, r.from + DAY) - Math.max(x.from, r.from)) / DAY) * 100);
                    return <rect key={i} x={`${l}%`} width={`${w}%`} height={rowH} fill={x.paused ? "url(#hatch)" : x.color} />;
                  })}
                </svg>
              </div>
            ))}
            <p className="legend muted"><svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" rx="3" fill="url(#hatch)" /></svg> Paused</p>
          </section>

          <section className="panel">
            <h2>Sessions</h2>
            <ul className="list">
              {[...stats.list].reverse().map((s) => (
                <li key={s.id}>
                  <span>
                    <span className="name"><i style={{ background: s.tag?.color ?? UNTAGGED }} />{s.tag?.name ?? "No tag"}</span>
                    <span className="muted sub num">
                      {new Date(s.startedAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                      {" · "}{s.mode === "countdown" ? `Timer ${dur(s.plannedMs ?? 0)}` : "Stopwatch"}
                      {s.pauses.length ? ` · ${s.pauses.length} pause${s.pauses.length > 1 ? "s" : ""}, ${dur(pausedMs(s, s.endedAt!))}` : ""}
                    </span>
                  </span>
                  <span className="num">{dur(elapsedMs(s, s.endedAt!))}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
