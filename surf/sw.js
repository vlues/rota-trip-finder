/* Rota Wave Watch — offline shell.
   Network-first with a cache fallback, deliberately: a surf forecast that
   silently serves yesterday's app code is worse than one that takes an
   extra second. The cache exists so the page still opens with no signal,
   not to make it feel faster.

   Forecast requests are NOT intercepted — app.js keeps its own last-good
   copy in localStorage and knows how to label it as stale, which is more
   honest than replaying an old HTTP response as if it were fresh. */

var CACHE = "rota-wave-v3";
/* The scripts carry a ?v= build stamp, so they are cached on first use rather
   than precached under a bare name that nothing will ever request. */
var SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png"];

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

  /* Going to the network is not enough on its own: the browser's own HTTP
     cache sits behind fetch(), and GitHub Pages serves assets with
     max-age=600, so "network-first" would still hand back code up to ten
     minutes old. Same-origin app files are therefore revalidated against the
     server every time. The CDN files are versioned in their URLs and can be
     taken from the HTTP cache as normal. */
  var hit = url.origin === self.location.origin
    ? new Request(req.url, { cache: "no-cache", credentials: "same-origin", mode: "same-origin" })
    : req;

  e.respondWith(
    fetch(hit).then(function (res) {
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
