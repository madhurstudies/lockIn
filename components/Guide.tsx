"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

function steps(ua: string): string[] {
  const ios = /iPhone|iPad|iPod/.test(ua);
  const android = /Android/.test(ua);
  const firefox = /Firefox|FxiOS/.test(ua);
  const samsung = /SamsungBrowser/.test(ua);
  const safari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|Edg/.test(ua);
  const allow = "Allow notifications when asked on Start. Dismiss them any time; the timer keeps going.";
  if (ios)
    return [
      "Notifications on iPhone only work from the home screen: Share → Add to Home Screen, then open Lock In from there (iOS 16.4+).",
      allow,
      "Keep the app open or in the recents switcher. iOS may freeze a locked page, so the end alert can arrive late; the time shown is always correct when you return.",
    ];
  if (android)
    return [
      samsung ? "Menu → Add page to → Home screen to install." : "Chrome menu → Install app (or Add to Home screen).",
      allow,
      "Settings → Apps → " + (samsung ? "Samsung Internet" : "Chrome") + " → Battery → Unrestricted, so the countdown isn't put to sleep.",
      "Keep Lock In in your recent apps; swiping it away may stop background alerts.",
    ];
  return [
    firefox ? "Firefox desktop can't install apps; keep this tab open (pinning it helps)." : safari ? "File → Add to Dock for an app window." : "Install from the icon at the right of the address bar.",
    allow,
    "Chrome and Edge: keep the tab open. Memory Saver can sleep background tabs, so add this site under Settings → Performance → Always keep these sites active.",
  ];
}

/** Bottom-left (i) button; the panel grows out of it toward the top right. */
export default function Guide() {
  const ua = useSyncExternalStore(() => () => {}, () => navigator.userAgent, () => "");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const out = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", out);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", out); };
  }, [open]);

  if (!ua) return null;
  return (
    <div className="dock left" ref={box}>
      {open && (
        <div className="popover" id="guide-panel" role="dialog" aria-label="Keep the countdown running in the background">
          <h2>Keep the countdown running</h2>
          <ol>{steps(ua).map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      )}
      <button className="fab" aria-expanded={open} aria-controls="guide-panel" aria-label="Background setup instructions" onClick={() => setOpen((o) => !o)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
