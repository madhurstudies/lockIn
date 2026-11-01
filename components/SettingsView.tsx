"use client";
import { useState } from "react";
import type { Settings } from "@/lib/settings";

const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
type Theme = "system" | "light" | "dark";

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="srow">
      <div>
        <div className="stitle">{title}</div>
        {hint && <div className="muted shint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsView({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem("theme") as Theme) || "system"; } catch { return "system"; }
  });

  async function update(patch: Partial<Settings>) {
    const prev = s;
    setS({ ...s, ...patch }); // optimistic
    setError("");
    const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    if (!r.ok) { setS(prev); setError("Couldn't save. Try again."); }
  }

  function pickTheme(t: Theme) {
    setTheme(t);
    const el = document.documentElement;
    try {
      if (t === "system") { localStorage.removeItem("theme"); el.removeAttribute("data-theme"); }
      else { localStorage.setItem("theme", t); el.setAttribute("data-theme", t); }
    } catch {}
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  }

  return (
    <div className="settings">
      <h1 className="pagetitle">Settings</h1>
      <div className="group">
        <Row title="Progress ring" hint="Circle around the timer that empties as the countdown runs. Pauses show in cyan.">
          <input type="checkbox" role="switch" className="switch" checked={s.ring} onChange={(e) => update({ ring: e.target.checked })} aria-label="Progress ring" />
        </Row>
        <Row title="Sounds" hint="One bleep on start, two when a countdown ends.">
          <input type="checkbox" role="switch" className="switch" checked={s.sounds} onChange={(e) => update({ sounds: e.target.checked })} aria-label="Sounds" />
        </Row>
        <Row title="Day starts at" hint="When “today” resets in widgets. Analysis always uses midnight.">
          <select className="select" value={s.dayStartHour} onChange={(e) => update({ dayStartHour: Number(e.target.value) })} aria-label="Day starts at">
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </Row>
      </div>
      <p className="error" role="alert">{error}</p>
      <div className="group">
        <Row title="Appearance" hint="This device only.">
          <div className="seg slim" role="group" aria-label="Appearance">
            {(["system", "light", "dark"] as const).map((t) => (
              <button key={t} aria-pressed={theme === t} onClick={() => pickTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </Row>
        <Row title="Account"><button className="textbtn" onClick={logout}>Log out</button></Row>
      </div>
    </div>
  );
}
