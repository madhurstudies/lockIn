"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import Logo from "./Logo";

const svg = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const icons = {
  timer: <svg {...svg}><circle cx="12" cy="13.5" r="7.5" /><path d="M12 13.5V10M10 3h4M18 6.5l1.5-1.5" /></svg>,
  day: <svg {...svg}><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>,
  analysis: <svg {...svg}><path d="M5 20V12M12 20V5M19 20v-6" /></svg>,
  settings: (
    <svg {...svg}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </svg>
  ),
};

const links = [
  ["/", "Timer", icons.timer],
  ["/day", "Day", icons.day],
  ["/analysis", "Analysis", icons.analysis],
  ["/settings", "Settings", icons.settings],
] as const;

// Fullscreen API, with the webkit prefix iPad Safari still needs. iPhone Safari has neither, so the button hides.
type Doc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void };
const fsDoc = () => document as Doc;
const fsSubscribe = (cb: () => void) => {
  document.addEventListener("fullscreenchange", cb);
  document.addEventListener("webkitfullscreenchange", cb);
  return () => { document.removeEventListener("fullscreenchange", cb); document.removeEventListener("webkitfullscreenchange", cb); };
};
const fsState = () => {
  const d = fsDoc();
  if (!(d.fullscreenEnabled || d.webkitFullscreenEnabled)) return "none";
  return d.fullscreenElement || d.webkitFullscreenElement ? "on" : "off";
};

function toggleFullscreen() {
  const d = fsDoc();
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (d.fullscreenElement || d.webkitFullscreenElement) void (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
  else void (el.requestFullscreen?.({ navigationUI: "hide" }) ?? el.webkitRequestFullscreen?.());
}

export default function Header() {
  const path = usePathname();
  const fs = useSyncExternalStore(fsSubscribe, fsState, () => "none");

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  }

  return (
    <header className="bar">
      <Link href="/" className="logo" aria-label="Lock In"><Logo /></Link>
      <nav className="nav">
        {links.map(([href, label, icon]) => (
          <Link key={href} href={href} aria-current={path === href ? "page" : undefined} aria-label={label}>
            {icon}<span className="navlabel">{label}</span>
          </Link>
        ))}
      </nav>
      {fs !== "none" && (
        <button className="quiet icon" onClick={toggleFullscreen} aria-label={fs === "on" ? "Exit full screen" : "Full screen"} aria-pressed={fs === "on"}>
          {fs === "on"
            ? <svg {...svg}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
            : <svg {...svg}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>}
        </button>
      )}
      <button className="quiet hide-narrow" onClick={logout}>Logout</button>
    </header>
  );
}
