"use client";
import { useSyncExternalStore } from "react";

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

export default function Guide() {
  const ua = useSyncExternalStore(() => () => {}, () => navigator.userAgent, () => "");
  if (!ua) return null;
  const list = steps(ua);
  return (
    <details className="guide">
      <summary>Keep the countdown running in the background</summary>
      <ol>{list.map((s) => <li key={s}>{s}</li>)}</ol>
    </details>
  );
}
