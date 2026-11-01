"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Guide from "./Guide";
import { elapsedMs, isPaused, MAX_PLANNED_MS, remainingMs, type Mode, type Session, type Tag } from "@/lib/session";

const SWATCHES = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#30b0c7", "#0a84ff", "#ff2d55", "#8e8e93"];
const ITEM = 36; // wheel row height, keep in sync with .wheel css

function fmt(ms: number, round: "floor" | "ceil") {
  const s = Math[round](ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

function Wheel({ label, count, value, onChange, scrollTo }: {
  label: string; count: number; value: number; onChange: (n: number) => void; scrollTo?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && scrollTo !== undefined) ref.current.scrollTop = scrollTo * ITEM; }, [scrollTo]);
  return (
    <div className="colwrap">
      <div
        ref={ref}
        className="col"
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={count - 1}
        onScroll={(e) => onChange(Math.max(0, Math.min(count - 1, Math.round(e.currentTarget.scrollTop / ITEM))))}
      >
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={`item num${i === value ? " on" : ""}`}>{i}</div>
        ))}
      </div>
      <span className="unit">{label}</span>
    </div>
  );
}

export default function TimerView({ initialActive, initialNow, initialTags }: {
  initialActive: Session | null; initialNow: number; initialTags: Tag[];
}) {
  const [active, setActive] = useState(initialActive);
  const [tags, setTags] = useState(initialTags);
  const [mode, setMode] = useState<Mode>(initialActive?.mode ?? "countdown");
  const [hours, setHours] = useState(0);
  const [mins, setMins] = useState(25);
  const [reset, setReset] = useState<{ h: number; m: number }>({ h: 0, m: 25 }); // programmatic wheel position
  const [tagId, setTagId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(SWATCHES[5]);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState(initialNow); // server-clock "now", advanced by the tick
  const [offset, setOffset] = useState(0); // server clock minus local clock (set on first sync)
  const finishing = useRef(false);

  const now = () => Date.now() + offset;
  const sync = useCallback((j: { now: number; active: Session | null }, t0: number) => {
    const o = j.now - (t0 + Date.now()) / 2; // assume symmetric latency
    setOffset(o);
    setT(Date.now() + o);
    setActive(j.active);
  }, []);

  const send = useCallback(async (body: object) => {
    setBusy(true);
    const t0 = Date.now();
    try {
      const r = await fetch("/api/active", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) sync(await r.json(), t0);
    } finally { setBusy(false); }
  }, [sync]);

  // Re-sync on mount and whenever the tab returns, so other devices and background time are reflected.
  useEffect(() => {
    const load = async () => {
      const t0 = Date.now();
      const r = await fetch("/api/active", { cache: "no-store" });
      if (r.ok) sync(await r.json(), t0);
    };
    load();
    navigator.serviceWorker?.register("/sw.js");
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    navigator.serviceWorker?.addEventListener("message", load); // notification button was used
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      navigator.serviceWorker?.removeEventListener("message", load);
    };
  }, [sync]);

  const running = active && !isPaused(active);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setT(Date.now() + offset), 250);
    return () => clearInterval(id);
  }, [running, offset]);

  // Countdown reached zero: the server closes it at its true end time.
  const expired = active?.mode === "countdown" && running && remainingMs(active, t) <= 0;
  useEffect(() => {
    if (!active) finishing.current = false;
    if (expired && !finishing.current) {
      finishing.current = true;
      setSaved(`Done · ${fmt(active!.plannedMs!, "floor")}${active!.tag ? ` · ${active!.tag.name}` : ""}`);
      send({ action: "stop" });
    }
  }, [expired, active, send]);

  // Live notification mirrors the session; its Pause/Resume button is handled in public/sw.js.
  const pausedKey = active ? isPaused(active) : null;
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    navigator.serviceWorker?.ready.then((reg) => {
      if (!active) return reg.getNotifications({ tag: "lockin" }).then((n) => n.forEach((x) => x.close()));
      const label = active.tag?.name ?? (active.mode === "countdown" ? "Timer" : "Stopwatch");
      const p = pausedKey!;
      return reg.showNotification(`${label} · ${p ? "Paused" : "Running"}`, {
        tag: "lockin", icon: "/icons/icon-192.png", silent: true,
        body: p ? "Tap Resume to continue" : "Tap Pause to take a break",
        actions: [{ action: p ? "resume" : "pause", title: p ? "Resume" : "Pause" }],
      } as NotificationOptions);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, pausedKey]);

  // ponytail: best-effort end alert; the OS may freeze a hidden page. Upgrade path: delayed Web Push (e.g. QStash).
  useEffect(() => {
    if (!expired || !("Notification" in window) || Notification.permission !== "granted") return;
    navigator.serviceWorker?.ready.then((reg) =>
      reg.showNotification("Time's up", { tag: "lockin-done", icon: "/icons/icon-192.png", body: saved || "Session complete" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  const plannedMs = (hours * 60 + mins) * 60_000;
  const shownMs = active
    ? active.mode === "countdown" ? remainingMs(active, t) : elapsedMs(active, t)
    : mode === "countdown" ? plannedMs : 0;
  const readout = fmt(shownMs, active?.mode === "countdown" ? "ceil" : "floor");

  useEffect(() => {
    document.title = active ? `${readout} · Lock In` : "Lock In";
  }, [active, readout]);

  function onHours(h: number) {
    setHours(h);
    if (h === MAX_PLANNED_MS / 3_600_000 && mins > 0) { setMins(0); setReset((r) => ({ ...r, m: 0 })); }
  }
  const onMins = (m: number) => setMins(hours === 3 ? 0 : m);

  async function addTag() {
    const r = await fetch("/api/tags", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newName, color: newColor }) });
    if (!r.ok) return;
    const tag: Tag = await r.json();
    setTags((x) => [...x, tag]);
    setTagId(tag.id);
    setNewName("");
    setAdding(false);
  }

  const start = () => {
    setSaved("");
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    send({ action: "start", mode, tagId, plannedMs: mode === "countdown" ? plannedMs : undefined });
  };
  const stop = () => {
    if (active) setSaved(`Saved · ${fmt(elapsedMs(active, now()), "floor")}${active.tag ? ` · ${active.tag.name}` : ""}`);
    send({ action: "stop" });
  };

  const paused = !!active && isPaused(active);
  const canStart = mode === "stopwatch" || plannedMs > 0;
  const activeTag = active ? active.tag : tags.find((x) => x.id === tagId) ?? null;

  return (
    <>
    <section className="card" aria-label="Timer">
      <div className="seg" role="group" aria-label="Mode">
        {(["stopwatch", "countdown"] as const).map((m) => (
          <button key={m} aria-pressed={(active?.mode ?? mode) === m} disabled={!!active} onClick={() => setMode(m)}>
            {m === "stopwatch" ? "Stopwatch" : "Timer"}
          </button>
        ))}
      </div>

      <div className="stage">
        {!active && mode === "countdown" ? (
          <div className="wheel">
            <Wheel label="hours" count={4} value={hours} onChange={onHours} scrollTo={reset.h} />
            <Wheel label="min" count={60} value={mins} onChange={onMins} scrollTo={reset.m} />
          </div>
        ) : (
          <div className={`readout num${paused ? " paused" : ""}`} role="timer" aria-live="off">{readout}</div>
        )}
        <p className="status muted" aria-live="polite">
          {paused ? "Paused" : active ? (active.mode === "countdown" ? "Remaining" : "Elapsed") : saved || " "}
        </p>
      </div>

      <div className="tags" role="group" aria-label="Tag">
        {tags.map((x) => (
          <button
            key={x.id}
            className="chip"
            style={{ "--c": x.color } as React.CSSProperties}
            aria-pressed={activeTag?.id === x.id}
            disabled={!!active}
            onClick={() => setTagId(tagId === x.id ? null : x.id)}
          >
            <i />{x.name}
          </button>
        ))}
        {active && !active.tag && <span className="muted">No tag</span>}
        {!active && (
          <button className="chip add" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>＋ Tag</button>
        )}
      </div>

      {adding && !active && (
        <form className="newtag" onSubmit={(e) => { e.preventDefault(); addTag(); }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Tag name" maxLength={24} aria-label="Tag name" autoFocus required />
          <div className="swatches" role="radiogroup" aria-label="Tag color">
            {SWATCHES.map((c) => (
              <button type="button" key={c} role="radio" aria-checked={newColor === c} aria-label={c} style={{ background: c }} onClick={() => setNewColor(c)} />
            ))}
          </div>
          <button className="primary" style={{ height: 40 }}>Add tag</button>
        </form>
      )}

      <div className="controls">
        <button className="circle" onClick={stop} disabled={!active || busy}>Stop</button>
        {!active ? (
          <button className="circle go" onClick={start} disabled={!canStart || busy}>Start</button>
        ) : paused ? (
          <button className="circle go" onClick={() => send({ action: "resume" })} disabled={busy}>Resume</button>
        ) : (
          <button className="circle go" onClick={() => send({ action: "pause" })} disabled={busy}>Pause</button>
        )}
      </div>
    </section>
    <Guide />
    </>
  );
}
