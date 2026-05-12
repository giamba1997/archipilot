// ─────────────────────────────────────────────────────────────
// Service Worker — Mobile Étape 4 (Push notifications) + PWA cache
//
// Mode `injectManifest` de vite-plugin-pwa : ce fichier est notre source
// de vérité pour le SW. Le plugin injecte `self.__WB_MANIFEST` (la liste
// précachée générée à build) au moment du bundle.
//
// Stratégies de cache mirroirent l'ancienne config workbox de
// vite.config.js (CacheFirst pour JS/CSS et images).
//
// Push handlers : on traite l'événement `push` (afficher la notif) et
// `notificationclick` (deep-link dans l'app). Le payload arrive au format
// JSON depuis l'edge function `send-push-notification`.
// ─────────────────────────────────────────────────────────────

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

// ── Precaching + nettoyage des vieux caches ──
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// ── Runtime caching ──
registerRoute(
  ({ url }) => /\.(?:js|css)$/i.test(url.pathname),
  new CacheFirst({
    cacheName: "static-assets",
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  })
);

registerRoute(
  ({ url }) => /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i.test(url.pathname),
  new CacheFirst({
    cacheName: "images",
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 90 * 24 * 60 * 60 })],
  })
);

// Active immédiatement le nouveau SW à l'install (alignée sur registerType
// 'autoUpdate' de l'ancienne config).
self.skipWaiting();
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// ── Push handler ──
// Le serveur envoie un JSON sérialisé contenant title/body/deep_link/icon.
// Si le parse échoue (payload mal formé), on affiche une notif générique
// plutôt que de cracher silencieusement.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "ArchiPilot", body: "Nouvelle notification" };
  }

  const title = payload.title || "ArchiPilot";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-512.png",
    badge: "/icon-512.png",
    tag: payload.data?.tag || payload.category || "archipilot",
    renotify: true,
    data: {
      deep_link: payload.deep_link || "/",
      category: payload.category,
      ...(payload.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ──
// Comportement :
//   1. Si une fenêtre de l'app est déjà ouverte et focalisable, on la focus
//      et on lui poste un message pour qu'elle gère le deep-link en interne
//      (évite un reload complet).
//   2. Sinon, on ouvre une nouvelle fenêtre sur l'URL deep_link.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.deep_link || "/";

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });
    for (const client of allClients) {
      try {
        // Use the origin of the SW for safety
        const sameOrigin = new URL(client.url).origin === self.location.origin;
        if (sameOrigin && "focus" in client) {
          client.postMessage({
            type: "archipilot:deep-link",
            url: targetUrl,
            data: event.notification.data,
          });
          return client.focus();
        }
      } catch {
        // ignore individual client failures
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});
