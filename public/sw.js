// Handles notification buttons so pause/resume works (and is recorded) with the page closed.
const show = (a) => {
  const paused = a.pauses.some((p) => p.resumedAt === undefined);
  const tag = a.tag ? a.tag.name : a.mode === "countdown" ? "Timer" : "Stopwatch";
  return self.registration.showNotification(`${tag} · ${paused ? "Paused" : "Running"}`, {
    tag: "lockin",
    icon: "/icons/icon-192.png",
    silent: true,
    body: paused ? "Tap Resume to continue" : "Tap Pause to take a break",
    actions: [{ action: paused ? "resume" : "pause", title: paused ? "Resume" : "Pause" }],
  });
};

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const action = e.action;
  e.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (action === "pause" || action === "resume") {
        const r = await fetch("/api/active", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const { active } = r.ok ? await r.json() : {};
        if (active) await show(active);
        clients.forEach((c) => c.postMessage("sync"));
      } else if (clients[0]) await clients[0].focus();
      else await self.clients.openWindow("/");
    })()
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
