"use client";
import { usePref } from "@/lib/device";
import { setDevicePref } from "@/lib/prefs";

/** Quick on/off for the countdown's progress ring. A per-device preference, so it works anywhere and in any timer state. */
export default function RingToggle({ className = "" }: { className?: string }) {
  const on = usePref("ring") === "on";
  return (
    <button className={`ringtoggle ${className}`} aria-pressed={on} aria-label="Progress ring" title={on ? "Progress ring on" : "Progress ring off"} onClick={() => setDevicePref("ring", !on)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8" opacity="0.35" /><path d="M12 4a8 8 0 0 1 8 8" strokeWidth="2.4" />
      </svg>
    </button>
  );
}
