"use client";
import { useEffect } from "react";
import { applySynced } from "@/lib/prefs";

/** On load and when the tab returns: pull the shared settings and apply the ones this device syncs. Renders nothing. */
export default function SettingsSync() {
  useEffect(() => {
    const load = () =>
      fetch("/api/settings", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => s && applySynced(s))
        .catch(() => {});
    load();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return null;
}
