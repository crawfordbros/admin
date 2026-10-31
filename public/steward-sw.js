/* global self, caches, fetch, URL, Response */
// The Steward crew app's service worker (STEWARD_APP_SPEC section 8): keeps the app shell on the phone so
// it opens with weak or no signal. Served at /steward/sw.js (worker/index.ts), so it only controls
// /steward pages. It never stores API responses: those hold personal data, and the app keeps its own
// per-person copies (src/lib/steward/offline.ts) and its outbox (src/lib/steward/queue.ts).

const CACHE = "steward-shell-v1";
const SHELL = "/steward/";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("steward-") && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const isAsset = (url) => url.pathname.startsWith("/portal/assets/") || /^\/portal\/[^/]+\.(png|webp|svg|webmanifest)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Pages: the network first, so a new release shows straight away; the saved shell without signal.
  if (request.mode === "navigate" && url.pathname.startsWith("/steward")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(SHELL)) ?? Response.error()),
    );
    return;
  }

  // Built files have content hashes in their names, so a saved copy never goes stale.
  if (isAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
