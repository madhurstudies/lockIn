"use client";
import { useState } from "react";
import { setTheme, useDataset, usePref } from "@/lib/device";
import { cacheSync, putSettings, setDevicePref, useEffective, writeLocal } from "@/lib/prefs";
import { formatShort, parseDuration } from "@/lib/session";
import { MIN_FOCUS_MAX, MIN_FOCUS_MIN, TARGET_MAX, TARGET_STEP, THEMES, type Local, type Settings, type SettingsPatch, type SyncKey, type Theme } from "@/lib/settings";

/** One row of the table: what it is, how to set it, and whether it is shared across devices. */
function Row({ title, hint, sync, wide, children }: {
  title: string; hint?: string; sync?: { on: boolean; set: (on: boolean) => void }; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={`srow${wide ? " wide" : ""}`}>
      <div className="sname">
        <div className="stitle">{title}</div>
        {hint && <div className="muted shint">{hint}</div>}
      </div>
      <div className="sctl">{children}</div>
      <label className="ssync muted">
        {sync && (
          <>
            <span>Sync</span>
            <input type="checkbox" role="switch" className="switch mini" checked={sync.on} onChange={(e) => sync.set(e.target.checked)} aria-label={`Sync ${title}`} />
          </>
        )}
      </label>
    </div>
  );
}

/** Typed length in minutes (25, 1:30, 2h…), kept between MIN_FOCUS_MIN and MIN_FOCUS_MAX. */
function MinFocus({ value, onChange }: { value: number; onChange: (mins: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  function commit() {
    if (text === null) return;
    const m = parseDuration(text, MIN_FOCUS_MAX);
    if (m === null || m < MIN_FOCUS_MIN) { setBad(true); return; }
    onChange(m);
    setText(null);
    setBad(false);
  }
  return (
    <div className="minfocus">
      <input
        className="select num" value={text ?? formatShort(value * 60_000)} aria-label="Minimum focus time" aria-invalid={bad} autoComplete="off" inputMode="text"
        onFocus={(e) => { setBad(false); setText(formatShort(value * 60_000)); e.currentTarget.select(); }}
        onChange={(e) => { setText(e.target.value); setBad(false); }}
        onBlur={() => { commit(); setText(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setText(null); setBad(false); e.currentTarget.blur(); } }}
      />
      {bad && <span className="error" role="alert">{MIN_FOCUS_MIN}m to 3h</span>}
    </div>
  );
}

export default function SettingsView({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial); // as saved on the server
  const [error, setError] = useState("");
  const eff = useEffective(s); // what this device acts on
  const theme = useDataset<Theme>("theme", "system");
  const touch = usePref("touch");
  const motion = usePref("motion");
  const ring = usePref("ring");

  async function update(patch: SettingsPatch) {
    const prev = s;
    const next = { ...s, ...patch, sync: { ...s.sync, ...patch.sync } } as Settings;
    setS(next); // optimistic
    cacheSync(next.sync);
    setError("");
    const r = await putSettings(patch);
    if (!r.ok) { setS(prev); cacheSync(prev.sync); setError("Couldn't save. Try again."); }
  }

  /** Shared when the row syncs, otherwise only on this device. */
  const set = (row: "sounds" | "target" | "minFocus" | "finish" | "finishAlways", patch: Local) => (s.sync[row] ? update(patch) : writeLocal(patch));
  /** ring/touch/motion/theme are applied here at once, and shared too when the row syncs. */
  const setDevice = (k: "ring" | "touch" | "motion", on: boolean) => { setDevicePref(k, on); if (s.sync[k]) setS((x) => ({ ...x, [k]: on })); };
  const pickTheme = (t: Theme) => { setTheme(t); if (s.sync.theme) void update({ theme: t }); };

  /** Turning sync on makes this device's value the shared one; turning it off keeps this device's current value as its own. */
  function toggleSync(k: SyncKey, on: boolean) {
    const now: Record<SyncKey, SettingsPatch> = {
      ring: { ring: ring === "on" }, theme: { theme }, touch: { touch: touch === "on" }, motion: { motion: motion === "on" },
      sounds: { sounds: eff.sounds }, finish: { showFinish: eff.showFinish }, finishAlways: { finishAlways: eff.finishAlways }, target: { target: eff.target, targetMins: eff.targetMins }, minFocus: { minFocusMins: eff.minFocusMins },
    };
    if (!on && !["ring", "theme", "touch", "motion"].includes(k)) writeLocal(now[k] as Local);
    void update({ sync: { [k]: on }, ...(on ? now[k] : {}) });
  }
  const sync = (k: SyncKey) => ({ on: s.sync[k], set: (on: boolean) => toggleSync(k, on) });

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  }

  return (
    <div className="settings">
      <h1 className="pagetitle">Settings</h1>
      <p className="muted shint syncnote">Sync shares a setting across all your devices. With it off, this device keeps its own value.</p>
      <h2 className="grouphead muted">Focus</h2>
      <div className="group">
        <Row title="Progress ring" hint="Circle around the timer that empties as the countdown runs. Pauses show in cyan. Also in the top bar and in zen mode." sync={sync("ring")}>
          <input type="checkbox" role="switch" className="switch" checked={ring === "on"} onChange={(e) => setDevice("ring", e.target.checked)} aria-label="Progress ring" />
        </Row>
        <Row title="Sounds" hint="One bleep on start, two when a countdown ends." sync={sync("sounds")}>
          <input type="checkbox" role="switch" className="switch" checked={eff.sounds} onChange={(e) => set("sounds", { sounds: e.target.checked })} aria-label="Sounds" />
        </Row>
        <Row title="Minimum focus time" hint="A session with less focus than this is not recorded. Applies to sessions you start from now on. 5m to 3h." sync={sync("minFocus")} wide>
          <MinFocus value={eff.minFocusMins} onChange={(m) => set("minFocus", { minFocusMins: m })} />
        </Row>
        <Row title="Show finish time" hint="While you set or pause a countdown, shows the clock time it will finish at (24-hour). While it runs, hover the timer to see it." sync={sync("finish")}>
          <input type="checkbox" role="switch" className="switch" checked={eff.showFinish} onChange={(e) => set("finish", { showFinish: e.target.checked })} aria-label="Show finish time" />
        </Row>
        {eff.showFinish && (
          <Row title="Show permanently" hint={touch === "on" ? "Always on in touch-friendly mode." : "Keep it showing while the countdown runs, without hovering."} sync={sync("finishAlways")}>
            <input type="checkbox" role="switch" className="switch" checked={touch === "on" || eff.finishAlways} disabled={touch === "on"} onChange={(e) => set("finishAlways", { finishAlways: e.target.checked })} aria-label="Show finish time permanently" />
          </Row>
        )}
        <Row title="Daily target" hint="Focus goal for each day, midnight to midnight. Shows in the Focus today widget and powers the Lock In helper." sync={sync("target")}>
          <input type="checkbox" role="switch" className="switch" checked={eff.target} onChange={(e) => set("target", { target: e.target.checked })} aria-label="Daily target" />
        </Row>
        {eff.target && (
          <Row title="Target">
            <select className="select" value={eff.targetMins} onChange={(e) => set("target", { targetMins: Number(e.target.value) })} aria-label="Daily target length">
              {Array.from({ length: TARGET_MAX / TARGET_STEP }, (_, i) => (i + 1) * TARGET_STEP).map((m) => (
                <option key={m} value={m}>{formatShort(m * 60_000)}</option>
              ))}
            </select>
          </Row>
        )}
      </div>
      <p className="error" role="alert">{error}</p>
      <h2 className="grouphead muted">Display</h2>
      <div className="group">
        <Row title="Appearance" sync={sync("theme")} wide>
          <div className="seg slim" role="group" aria-label="Appearance">
            {THEMES.map((t) => (
              <button key={t} aria-pressed={theme === t} onClick={() => pickTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </Row>
        <Row title="Touch-friendly mode" hint="Larger buttons and timer, screen stays awake during a session, light haptics on Android." sync={sync("touch")}>
          <input type="checkbox" role="switch" className="switch" checked={touch === "on"} onChange={(e) => setDevice("touch", e.target.checked)} aria-label="Touch-friendly mode" />
        </Row>
        <Row title="Animations" hint="Gentle motion between screens and states. Also off if your system asks for reduced motion." sync={sync("motion")}>
          <input type="checkbox" role="switch" className="switch" checked={motion === "on"} onChange={(e) => setDevice("motion", e.target.checked)} aria-label="Animations" />
        </Row>
      </div>
      <div className="group" style={{ marginTop: 24 }}>
        <div className="srow"><div className="sname"><div className="stitle">Account</div></div><button className="textbtn" onClick={logout}>Log out</button></div>
      </div>
    </div>
  );
}
