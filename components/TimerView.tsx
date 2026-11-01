"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Guide from "./Guide";
import { WidgetRow, WidgetSheet } from "./Widgets";
import { elapsedAt, elapsedMs, formatDur, isPaused, MAX_PLANNED_MS, parseDuration, remainingMs, type Mode, type Session, type Tag } from "@/lib/session";
import type { Settings } from "@/lib/settings";
import { haptic, usePref } from "@/lib/device";
import { beep, doubleBeep, unlock } from "@/lib/sound";

const SWATCHES = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#30b0c7", "#0a84ff", "#ff2d55", "#8e8e93"];
const ITEM = 36; // wheel row height, keep in sync with .wheel css

/** Register this device for the server's "Time's up" push (lib/alarm.ts). Quiet no-op when push isn't configured. */
async function subscribePush() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg?.pushManager) return;
    const { key } = await (await fetch("/api/push")).json();
    if (!key) return;
    const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (key.length % 4)) % 4));
    const sub = (await reg.pushManager.getSubscription())
      ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) }));
    await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub) });
  } catch {} // unsupported browser or denied: the page-side alert still works
}

function fmt(ms: number, round: "floor" | "ceil") {
  const s = Math[round](ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

/** Scrolls to `value` on mount and whenever `jump` changes (a value set from outside the wheel). */
function Wheel({ label, count, value, onChange, jump, onTapSelected }: {
  label: string; count: number; value: number; onChange: (n: number) => void; jump: number; onTapSelected: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = value * ITEM; }, [jump]); // eslint-disable-line react-hooks/exhaustive-deps
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
        onKeyDown={(e) => e.key === "Enter" && onTapSelected()}
        onScroll={(e) => onChange(Math.max(0, Math.min(count - 1, Math.round(e.currentTarget.scrollTop / ITEM))))}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className={`item num${i === value ? " on" : ""}`}
            onClick={() => (i === value ? onTapSelected() : ref.current?.scrollTo({ top: i * ITEM, behavior: "smooth" }))}
          >{i}</div>
        ))}
      </div>
      <span className="unit">{label}</span>
    </div>
  );
}


/** Countdown ring: remaining time empties clockwise from 12 o'clock; each pause leaves a cyan tick. */
function Ring({ session, t }: { session: Session; t: number }) {
  const planned = session.plannedMs ?? 1;
  const left = Math.min(1, remainingMs(session, t) / planned);
  const colour = session.tag?.color ?? "var(--accent)";
  return (
    <svg className="ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" stroke="var(--raised)" strokeWidth="3" />
      <circle
        cx="50" cy="50" r="46" fill="none" stroke={colour} strokeWidth="3" strokeLinecap="butt"
        pathLength={100} strokeDasharray={`${left * 100} 100`}
        transform={`rotate(${-90 + (1 - left) * 360} 50 50)`}
      />
      {session.pauses.map((p, i) => {
        const a = ((elapsedAt(session, p.at) / planned) * 360 - 90) * (Math.PI / 180);
        const [c, n] = [Math.cos(a), Math.sin(a)];
        return (
          <line key={i} x1={50 + 42 * c} y1={50 + 42 * n} x2={50 + 51 * c} y2={50 + 51 * n} stroke="var(--pause)" strokeWidth="3">
            <title>{`Paused ${formatDur((p.resumedAt ?? t) - p.at)}`}</title>
          </line>
        );
      })}
    </svg>
  );
}

export default function TimerView({ initialActive, initialNow, initialTags, initialSettings }: {
  initialActive: Session | null; initialNow: number; initialTags: Tag[]; initialSettings: Settings;
}) {
  const [active, setActive] = useState(initialActive);
  const [tags, setTags] = useState(initialTags);
  const [mode, setMode] = useState<Mode>(initialActive?.mode ?? "countdown");
  const [hours, setHours] = useState(0);
  const [mins, setMins] = useState(25);
  const [jump, setJump] = useState({ h: 0, m: 0 }); // bump after setting hours/mins from code so that wheel follows
  const [tagId, setTagId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(SWATCHES[5]);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState(initialNow); // server-clock "now", advanced by the tick
  const [offset, setOffset] = useState(0); // server clock minus local clock (set on first sync)
  const finishing = useRef(false);
  const [settings, setSettings] = useState(initialSettings);
  const [typing, setTyping] = useState<string | null>(null); // text while the user types a duration
  const [typeError, setTypeError] = useState(false);
  const touch = usePref("touch");

  async function updateSettings(patch: Partial<Settings>) {
    const prev = settings;
    setSettings({ ...prev, ...patch });
    const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    if (!r.ok) setSettings(prev);
  }

  const now = () => Date.now() + offset;
  const activeRef = useRef(initialActive);
  const sync = useCallback((j: { now: number; active: Session | null }, t0: number) => {
    const o = j.now - (t0 + Date.now()) / 2; // assume symmetric latency
    const prev = activeRef.current;
    // The server already closed a countdown that ran out while this page was frozen or away.
    if (prev?.mode === "countdown" && !j.active && !finishing.current && !isPaused(prev) && remainingMs(prev, j.now) <= 0)
      setSaved(`Done · ${fmt(prev.plannedMs!, "floor")}${prev.tag ? ` · ${prev.tag.name}` : ""}`);
    activeRef.current = j.active;
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
      const s = await fetch("/api/settings", { cache: "no-store" });
      if (s.ok) setSettings(await s.json());
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
  // Fast tick for the readout while running; a slow one otherwise so widgets (the helper's plan) stay current.
  useEffect(() => {
    const id = setInterval(() => setT(Date.now() + offset), running ? 250 : 30_000);
    return () => clearInterval(id);
  }, [running, offset]);

  // Countdown reached zero: the server closes it at its true end time.
  const expired = active?.mode === "countdown" && running && remainingMs(active, t) <= 0;
  useEffect(() => {
    if (!active) finishing.current = false;
    if (expired && !finishing.current) {
      finishing.current = true;
      if (settings.sounds) doubleBeep();
      haptic([200, 100, 200]);
      setSaved(`Done · ${fmt(active!.plannedMs!, "floor")}${active!.tag ? ` · ${active!.tag.name}` : ""}`);
      send({ action: "stop" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Page-side end alert. The OS may freeze a hidden page, so the server also pushes one (lib/alarm.ts);
  // both use the "lockin-done" tag, so the second replaces the first instead of stacking.
  useEffect(() => {
    if (!expired || !("Notification" in window) || Notification.permission !== "granted") return;
    navigator.serviceWorker?.ready.then((reg) =>
      reg.showNotification("Time's up", {
        tag: "lockin-done", icon: "/icons/icon-192.png", body: saved || "Session complete", requireInteraction: true, vibrate: [200, 100, 200],
      } as NotificationOptions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  // Touch mode: keep the screen on while a session is open. The lock drops whenever the page hides, so re-take it on return.
  useEffect(() => {
    if (touch !== "on" || !active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const take = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then((l) => { if (live) lock = l; else void l.release(); }).catch(() => {});
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => { live = false; document.removeEventListener("visibilitychange", take); void lock?.release(); };
  }, [touch, active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (h === MAX_PLANNED_MS / 3_600_000 && mins > 0) { setMins(0); setJump((j) => ({ ...j, m: j.m + 1 })); }
  }
  const onMins = (m: number) => setMins(hours === 3 ? 0 : m);

  /** Put a length (whole minutes, 1..180) on the countdown wheels. */
  function setLength(total: number) {
    setHours(Math.floor(total / 60));
    setMins(total % 60);
    setJump((j) => ({ h: j.h + 1, m: j.m + 1 }));
  }

  function commitTyped() {
    const total = parseDuration(typing ?? "");
    if (total === null) return setTypeError(true);
    setLength(total);
    setTyping(null);
    setTypeError(false);
  }

  /** Lock In helper's "Set": load its next block into the countdown. */
  function loadPlan(ms: number) {
    setMode("countdown");
    setTyping(null);
    setSaved("");
    setLength(Math.min(MAX_PLANNED_MS, ms) / 60_000);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const startTyping = () => { setTyping(`${hours}:${String(mins).padStart(2, "0")}`); setTypeError(false); };

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
    unlock(); // allow bleeps later, this is inside the click
    if (settings.sounds) beep();
    haptic();
    if ("Notification" in window) {
      if (Notification.permission === "default") Notification.requestPermission().then((p) => { if (p === "granted") void subscribePush(); });
      else if (Notification.permission === "granted") subscribePush();
    }
    send({ action: "start", mode, tagId, plannedMs: mode === "countdown" ? plannedMs : undefined });
  };
  const stop = () => {
    haptic();
    if (active) setSaved(`Saved · ${fmt(elapsedMs(active, now()), "floor")}${active.tag ? ` · ${active.tag.name}` : ""}`);
    send({ action: "stop" });
  };

  const paused = !!active && isPaused(active);
  const ring = settings.ring && active?.mode === "countdown";
  const canStart = mode === "stopwatch" || plannedMs > 0;
  const activeTag = active ? active.tag : tags.find((x) => x.id === tagId) ?? null;

  return (
    <>
    <h1 className="sr-only">Timer</h1>
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
          typing !== null ? (
            <form className="typebox" onSubmit={(e) => { e.preventDefault(); commitTyped(); }}>
              <input
                className="typeinput num"
                value={typing}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => { setTyping(e.target.value); setTypeError(false); }}
                onKeyDown={(e) => e.key === "Escape" && setTyping(null)}
                aria-label="Timer length"
                aria-invalid={typeError}
                autoComplete="off"
                inputMode="text"
              />
              <p className={typeError ? "error" : "muted"} style={{ margin: 0, fontSize: 14 }}>
                {typeError ? "Try 25, 1:30 or 45m (up to 3h)" : "Enter minutes or h:mm, then Return"}
              </p>
            </form>
          ) : (
            <div className="wheel">
              <Wheel label="hours" count={4} value={hours} onChange={onHours} jump={jump.h} onTapSelected={startTyping} />
              <Wheel label="min" count={60} value={mins} onChange={onMins} jump={jump.m} onTapSelected={startTyping} />
            </div>
          )
        ) : (
          <div className={`ringbox${ring ? " has-ring" : ""}`}>
            {ring && <Ring session={active!} t={t} />}
            <div className={`readout num${paused ? " paused" : ""}`} role="timer" aria-live="off">{readout}</div>
          </div>
        )}
        <p className="status muted" aria-live="polite">
          {paused ? "Paused" : active ? (active.mode === "countdown" ? "Remaining" : "Elapsed") : saved || " "}
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
          <button className="circle go" onClick={() => { haptic(); send({ action: "resume" }); }} disabled={busy}>Resume</button>
        ) : (
          <button className="circle go" onClick={() => { haptic(); send({ action: "pause" }); }} disabled={busy}>Pause</button>
        )}
      </div>
    </section>
    <WidgetRow settings={settings} now={t} active={active} onUse={loadPlan} />
    <Guide />
    <WidgetSheet settings={settings} onChange={(widgets) => updateSettings({ widgets })} />
    </>
  );
}
