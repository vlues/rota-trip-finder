/* Rota Wave Watch — offline shell.
   Network-first with a cache fallback, deliberately: a surf forecast that
   silently serves yesterday's app code is worse than one that takes an
   extra second. The cache exists so the page still opens with no signal,
   not to make it feel faster.

   Forecast requests are NOT intercepted — app.js keeps its own last-good
   copy in localStorage and knows how to label it as stale, which is more
   honest than replaying an old HTTP response as if it were fresh. */

var CACHE = "rota-wave-v1";
var SHELL = [
  "./", "./index.html", "./app.js", "./data.js",
  "./manifest.webmanifest", "./icon-192.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .catch(function () { /* a missing file must not block activation */ })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function cacheable(url) {
  if (url.origin === self.location.origin) return true;
  /* fonts and Leaflet are part of the shell; map tiles are not — caching
     every tile anyone pans over would fill the quota for no benefit. */
  return url.hostname === "fonts.googleapis.com" ||
         url.hostname === "fonts.gstatic.com" ||
         url.hostname === "cdnjs.cloudflare.com";
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* Let the forecast APIs and the map tiles go straight to the network. */
  if (!cacheable(url)) return;

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && (res.ok || res.type === "opaque")) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("./index.html");
        return new Response("", { status: 504, statusText: "Offline" });
      });
    })
  );
});
