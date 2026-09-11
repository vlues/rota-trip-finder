/**
 * Shared build-freshness check for every page on this site.
 *
 * GitHub Pages serves each asset with Cache-Control: max-age=600, so for ten
 * minutes after a push a visitor can be handed the new index.html together
 * with the old app.js — and a phone that has added one of these to its home
 * screen can sit on a stale build far longer than that.
 *
 * Each page carries <meta name="app-version"> and every page compares it with
 * the site's version.json. If the page is behind it clears its caches and
 * reloads exactly once, guarded by sessionStorage so it can never loop.
 *
 * Stamp a new build with ./bump-version.sh from the repo root.
 */
(function () {
  "use strict";

  /* version.json lives beside this script at the site root, whichever
     sub-directory the page itself is in. */
  var self = document.currentScript && document.currentScript.src;
  if (!self) return;
  var versionUrl;
  try { versionUrl = new URL("version.json", self).href; } catch (e) { return; }

  var meta = document.querySelector('meta[name="app-version"]');
  var mine = meta && meta.getAttribute("content");
  if (!mine || mine === "dev") return;               /* local working copy */

  function reloadOnce(v) {
    var mark = "site.reloadedFor";
    try {
      if (sessionStorage.getItem(mark) === v) return; /* already tried this one */
      sessionStorage.setItem(mark, v);
    } catch (e) { return; }                           /* no storage: do not risk a loop */

    if (window.caches && caches.keys) {
      caches.keys()
        .then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })
        .catch(function () {})
        .then(function () { location.reload(); });
    } else {
      location.reload();
    }
  }

  function check() {
    fetch(versionUrl + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.v && d.v !== mine) reloadOnce(d.v); })
      .catch(function () { /* offline — keep what we have */ });
  }

  check();
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) check();
  });
})();
