const CACHE_NAME = "lifetrack-shell-v11";
const APP_SHELL = [
    "./",
    "./index.html",
    "./dashboard.html",
    "./dashboard.css?v=16",
    "./auth.css",
    "./dashboard.js?v=20",
    "./pwa.js",
    "./config.js",
    "./manifest.webmanifest",
    "./privacy.html",
    "./terms.html",
    "./lifetrack-logo.png",
    "./lifetrack-logo-192.png",
    "./lifetrack-logo-512.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys
                .filter((key) => key.startsWith("lifetrack-shell-") && key !== CACHE_NAME)
                .map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("push", (event) => {
    event.waitUntil((async () => {
        let payload;
        try {
            payload = event.data ? event.data.json() : {};
        } catch (error) {
            console.error("LifeTrack received an unreadable push notification.", error);
            return;
        }
        const reminders = Array.isArray(payload.reminders) ? payload.reminders : [];
        if (!reminders.length) {
            await self.registration.showNotification("LifeTrack", {
                body: "You have a reminder.",
                icon: "./lifetrack-logo-192.png",
                badge: "./lifetrack-logo-192.png",
                tag: "lifetrack-reminder"
            });
            return;
        }
        await Promise.all(reminders.map((reminder) => self.registration.showNotification(
            "LifeTrack reminder",
            {
                body: reminder.title,
                icon: "./lifetrack-logo-192.png",
                badge: "./lifetrack-logo-192.png",
                tag: `lifetrack-reminder-${reminder.id}`
            }
        )));
    })());
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil((async () => {
        const target = new URL("dashboard.html", self.registration.scope);
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of windows) {
            if (new URL(client.url).origin !== self.location.origin) continue;
            await client.focus();
            if ("navigate" in client && client.url !== target.href) await client.navigate(target.href);
            return;
        }
        await self.clients.openWindow(target.href);
    })());
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== self.location.origin) return;

    event.respondWith((async () => {
        try {
            const response = await fetch(request);
            if (response.ok && response.type === "basic") {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(request, response.clone());
            }
            return response;
        } catch (error) {
            const cached = await caches.match(request);
            if (cached) return cached;
            if (request.mode === "navigate") {
                const app = await caches.match("./index.html");
                if (app) return app;
            }
            throw error;
        }
    })());
});