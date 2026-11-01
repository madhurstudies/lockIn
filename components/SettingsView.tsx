"use client";
import { useState } from "react";
import { notifyPrefs, useDataset, usePref, writePref } from "@/lib/device";
import type { Settings } from "@/lib/settings";

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
  const theme = useDataset<Theme>("theme", "system");
  const touch = usePref("touch");
  const motion = usePref("motion");

  async function update(patch: Partial<Settings>) {
    const prev = s;
    setS({ ...s, ...patch }); // optimistic
    setError("");
    const r = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    if (!r.ok) { setS(prev); setError("Couldn't save. Try again."); }
  }

  function pickTheme(t: Theme) {
    const el = document.documentElement;
    if (t === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", t);
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {}
    notifyPrefs();
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
      </div>
      <p className="error" role="alert">{error}</p>
      <h2 className="grouphead muted">This device</h2>
      <div className="group">
        <Row title="Appearance">
          <div className="seg slim" role="group" aria-label="Appearance">
            {(["system", "light", "dark"] as const).map((t) => (
              <button key={t} aria-pressed={theme === t} onClick={() => pickTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </Row>
        <Row title="Touch-friendly mode" hint="Larger buttons and timer, screen stays awake during a session, light haptics on Android.">
          <input type="checkbox" role="switch" className="switch" checked={touch === "on"} onChange={(e) => writePref("touch", e.target.checked ? "on" : "off")} aria-label="Touch-friendly mode" />
        </Row>
        <Row title="Animations" hint="Gentle motion between screens and states. Also off if your system asks for reduced motion.">
          <input type="checkbox" role="switch" className="switch" checked={motion === "on"} onChange={(e) => writePref("motion", e.target.checked ? "on" : "off")} aria-label="Animations" />
        </Row>
      </div>
      <div className="group" style={{ marginTop: 24 }}>
        <Row title="Account"><button className="textbtn" onClick={logout}>Log out</button></Row>
      </div>
    </div>
  );
}
