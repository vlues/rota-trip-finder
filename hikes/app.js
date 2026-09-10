/* Rota Hike Finder — terrain map, parking, opening hours, live intel.
   No build step, no framework. Leaflet + hikes/data.js. */
(function () {
"use strict";
var T = window.__HIKES__ || [];
var ROTA = [36.6247, -6.3606];

/* ───────────────────────────── helpers ───────────────────────────── */
var $ = function (s, r) { return (r || document).querySelector(s); };
var el = function (t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); };
var pad = function (n) { return (n < 10 ? "0" : "") + n; };
var MFMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour12: false, hour: "2-digit", minute: "2-digit" });
/* Spanish wall clock for a Date, wherever the phone happens to be. */
function madrid(d) {
  var g = {}; MFMT.formatToParts(d).forEach(function (p) { g[p.type] = p.value; });
  var h = +g.hour % 24, m = +g.minute;
  return { h: h, m: m, mins: h * 60 + m, s: pad(h) + ":" + pad(m) };
}
var DIFF = { 1: "easy", 2: "moderate", 3: "hard" };

function haversine(a, b, c, d) {
  var R = 6371, p = Math.PI / 180;
  var dLat = (c - a) * p, dLon = (d - b) * p;
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(a * p) * Math.cos(c * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
function driveH(t) { return t.dh == null ? 99 : t.dh; }
function driveLabel(t) {
  if (t.dh == null) return "flight";
  if (t.dh < 1) return Math.round(t.dh * 60) + " min";
  return (Math.round(t.dh * 10) / 10) + " h";
}

/* ─────────────────────── sun times (SunCalc core) ─────────────────────── */
var rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e0 = rad * 23.4397;
function toJulian(d) { return d.valueOf() / dayMs - 0.5 + J1970; }
function fromJulian(j) { return new Date((j + 0.5 - J1970) * dayMs); }
function sunTimes(date, lat, lon) {
  var lw = rad * -lon, phi = rad * lat, d = toJulian(date) - J2000;
  var n = Math.round(d - 9e-4 - lw / (2 * Math.PI));
  var ds = 9e-4 + lw / (2 * Math.PI) + n;
  var M = rad * (357.5291 + 0.98560028 * (ds));
  var L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
  var Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  var dec = Math.asin(Math.sin(0) * Math.cos(e0) + Math.cos(0) * Math.sin(e0) * Math.sin(L));
  var h = rad * -0.833;
  var cosW = (Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosW > 1 || cosW < -1) return null;          /* polar day / night — not in Spain */
  var w = Math.acos(cosW);
  var a = 9e-4 + (w + lw) / (2 * Math.PI) + n;
  var Jset = J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  return { rise: fromJulian(Jnoon - (Jset - Jnoon)), set: fromJulian(Jset) };
}

/* ───────────────────── open / closed, in Spanish time ───────────────────── */
/* The site may be open from a phone in any timezone, so every comparison is
   done against the wall clock in Europe/Madrid, not the visitor's. */
function spainNow() {
  var f = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short"
  }).formatToParts(new Date());
  var g = {}; f.forEach(function (p) { g[p.type] = p.value; });
  var wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g.weekday);
  return {
    mo: +g.month, day: +g.day, dow: wd,
    mins: (+g.hour % 24) * 60 + (+g.minute),
    md: g.month + "-" + g.day,
    date: new Date(+g.year, +g.month - 1, +g.day, +g.hour % 24, +g.minute)
  };
}
function inClosure(cl, md) {
  if (!cl) return null;
  for (var i = 0; i < cl.length; i++) {
    var c = cl[i], f = c.f, t = c.t;
    var hit = f <= t ? (md >= f && md <= t) : (md >= f || md <= t);   /* wraps the new year */
    if (hit) return c;
  }
  return null;
}
function windowFor(op, mo) {
  if (!op.w) return null;
  for (var i = 0; i < op.w.length; i++) if (op.w[i].mo.indexOf(mo) > -1) return op.w[i];
  return null;
}
var mins = function (s) { var p = s.split(":"); return +p[0] * 60 + +p[1]; };

/* → { k:"open"|"shut"|"permit"|"season", t:short label, d:detail, hrs:"08:00–21:00" } */
function openState(t, now) {
  var op = t.op || { m: "always" };
  var closed = inClosure(op.cl, now.md);
  if (closed) return { k: "season", t: "Seasonal closure", d: "Closed " + closed.f.replace("-", "/") + " → " + closed.t.replace("-", "/") + " — " + closed.why + ".", hrs: "—" };

  if (op.m === "permit") return { k: "permit", t: "Permit first", d: "Free permit or authorisation required before you go. No gate — but rangers do check.", hrs: "permit hours" };

  if (op.m === "always") return { k: "open", t: "Open now", d: "No gate and no hours — this path is walkable at any hour, including before dawn.", hrs: "24 h" };

  if (op.m === "daylight") {
    var s = sunTimes(now.date, t.lat, t.lon);
    if (!s) return { k: "open", t: "Open now", d: "No gate; walk in daylight.", hrs: "daylight" };
    var rise = madrid(s.rise), set = madrid(s.set);
    var lit = now.mins >= rise.mins && now.mins <= set.mins, left = set.mins - now.mins;
    return {
      k: lit ? "open" : "shut",
      t: lit ? "Open — daylight left" : "Dark",
      d: "No gate, but this is a daylight route. Today at the trailhead: sunrise " + rise.s + ", sunset " + set.s + "." +
         (lit ? " About " + Math.floor(left / 60) + " h " + (left % 60) + " min of light left." : ""),
      hrs: rise.s + "–" + set.s
    };
  }

  var w = windowFor(op, now.mo);
  if (!w) return { k: "season", t: "Closed this month", d: "The gate does not open in " + now.mo + ".", hrs: "—" };
  var hrs = w.o + "–" + w.c;
  if (op.cd && op.cd.indexOf(now.dow) > -1) {
    var names = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
    return { k: "shut", t: "Closed today", d: "Closed " + op.cd.map(function (d) { return names[d]; }).join(" and ") + ". Otherwise " + hrs + " this month.", hrs: hrs };
  }
  var o = mins(w.o), c = mins(w.c), open = now.mins >= o && now.mins <= c;
  var d = open
    ? "Open until " + w.c + " Spanish time" + (op.m === "ticket" ? " — but last entry is usually earlier, and tickets are timed." : ".")
    : (now.mins < o ? "Opens at " + w.o + " Spanish time." : "Shut for the day — reopens " + w.o + " tomorrow.");
  return { k: open ? "open" : "shut", t: open ? "Open now" : (now.mins < o ? "Opens " + w.o : "Closed for today"), d: d, hrs: hrs };
}
var PILL = { open: "ok", shut: "no", permit: "warn", season: "no" };

/* ───────────────────────────── state ───────────────────────────── */
var favs = new Set();
try { favs = new Set(JSON.parse(localStorage.getItem("hike-favs") || "[]")); } catch (e) {}
var saveFavs = function () { try { localStorage.setItem("hike-favs", JSON.stringify([].slice.call(favs))); } catch (e) {} };

var FILTERS = [
  { id: "easy",   label: "Easy",          f: function (t) { return t.df === 1; } },
  { id: "near",   label: "< 2 h drive",   f: function (t) { return t.dh != null && t.dh <= 2; } },
  { id: "short",  label: "Under 3 h walk",f: function (t) { return t.hh <= 3; } },
  { id: "open",   label: "Open now",      f: function (t) { return openState(t, NOW).k === "open"; } },
  { id: "nopermit", label: "No booking",  f: function (t) { return t.ac === "free"; } },
  { id: "free",   label: "Free parking",  f: function (t) { return /free/i.test(t.pk.c); } },
  { id: "water",  label: "Water",         f: function (t) { return !!t.water; } },
  { id: "shade",  label: "Shade",         f: function (t) { return t.sd === 2; } },
  { id: "kid",    label: "Kids",          f: function (t) { return !!t.kid; } },
  { id: "dog",    label: "Dogs",          f: function (t) { return !!t.dog; } }
];
var NOW = spainNow();
var on = {};                       /* active filter ids  */
var sel = null, favOnly = false, me = null, sortBy = "drive", query = "";

/* ───────────────────────────── map ───────────────────────────── */
var map = L.map("map", { zoomControl: true, attributionControl: true }).setView([38.5, -4.2], 6);
map.zoomControl.setPosition("bottomright");

var LAYERS = {
  terrain: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17, attribution: 'Map data © <a href="https://openstreetmap.org">OpenStreetMap</a> · SRTM | © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
  }),
  sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics"
  }),
  street: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  })
};
var current = "terrain";
LAYERS.terrain.addTo(map);
Array.prototype.forEach.call(document.querySelectorAll(".layers button"), function (b) {
  b.addEventListener("click", function () {
    var k = b.dataset.layer; if (k === current) return;
    map.removeLayer(LAYERS[current]); LAYERS[k].addTo(map); current = k;
    Array.prototype.forEach.call(document.querySelectorAll(".layers button"), function (o) {
      o.setAttribute("aria-pressed", String(o.dataset.layer === k));
    });
  });
});

L.marker(ROTA, { icon: L.divIcon({ className: "", html: '<div class="me" title="Rota"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), interactive: false, zIndexOffset: -500 }).addTo(map);

var marks = {}, parkMark = null, link = null, meMark = null;
T.forEach(function (t) {
  var m = L.marker([t.lat, t.lon], {
    icon: L.divIcon({ className: "", html: '<div class="pin p' + t.df + '"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
    title: t.n, riseOnHover: true
  });
  m.on("click", function () { select(t.id, true); });
  marks[t.id] = m;
});

function showMarkers(list) {
  var ids = {}; list.forEach(function (t) { ids[t.id] = 1; });
  T.forEach(function (t) {
    var m = marks[t.id];
    if (ids[t.id]) { if (!map.hasLayer(m)) m.addTo(map); }
    else if (map.hasLayer(m)) map.removeLayer(m);
  });
}
/* The rail and the detail sheet float ON TOP of a full-bleed map, so a plain
   fitBounds centres the trails underneath a panel. Push the fit into whatever
   strip of map the user can actually see. */
function mapPad() {
  var narrow = window.matchMedia("(max-width:820px)").matches;
  var railOpen = $("#rail").classList.contains("on"), sheetOpen = $("#sheet").classList.contains("on");
  if (narrow) {
    var h = 0;
    if (sheetOpen) h = Math.round(window.innerHeight * 0.82);
    else if (railOpen) h = Math.round(window.innerHeight * 0.56);
    return { paddingTopLeft: [14, 14], paddingBottomRight: [14, h + 14] };
  }
  var w = sheetOpen ? 400 : railOpen ? 350 : 12;
  return { paddingTopLeft: [w + 14, 14], paddingBottomRight: [58, 14] };
}
function fitAll(list) {
  var pts = (list && list.length ? list : T).map(function (t) { return [t.lat, t.lon]; });
  if (!pts.length) return;
  map.fitBounds(L.latLngBounds(pts), Object.assign({ animate: true, maxZoom: 13 }, mapPad()));
}

/* ─────────────────────── filtering & the list ─────────────────────── */
function matches(t) {
  if (favOnly && !favs.has(t.id)) return false;
  for (var k in on) if (on[k] && !FILTERS.filter(function (f) { return f.id === k; })[0].f(t)) return false;
  if (query) {
    var hay = [t.n, t.a, t.pr, t.rg, t.why, t.tip, t.se, DIFF[t.df], (t.cats || []).join(" ")].join(" ").toLowerCase();
    var words = query.toLowerCase().split(/\s+/).filter(Boolean);
    for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
  }
  return true;
}
function sorted(list) {
  var c = list.slice();
  c.sort(function (a, b) {
    if (sortBy === "km") return a.km - b.km;
    if (sortBy === "hh") return a.hh - b.hh;
    if (sortBy === "df") return a.df - b.df || a.hh - b.hh;
    if (sortBy === "name") return a.n.localeCompare(b.n);
    if (me) return haversine(me[0], me[1], a.lat, a.lon) - haversine(me[0], me[1], b.lat, b.lon);
    return driveH(a) - driveH(b);
  });
  return c;
}
function render() {
  var list = sorted(T.filter(matches));
  var box = $("#list"); box.innerHTML = "";
  $("#n").textContent = list.length;
  $("#meta").textContent = list.length + (list.length === 1 ? " trail" : " trails") + (me ? " · from you" : "");
  if (!list.length) {
    box.appendChild(el("div", "empty", "Nothing matches. Drop a filter, or clear the search box."));
  }
  list.forEach(function (t) {
    var st = openState(t, NOW);
    var dist = me ? Math.round(haversine(me[0], me[1], t.lat, t.lon)) + " km away" : driveLabel(t) + " from Rota";
    var c = el("button", "card" + (sel === t.id ? " on" : ""));
    c.innerHTML =
      '<h3>' + esc(t.n) + (favs.has(t.id) ? ' <span style="color:var(--amber)">★</span>' : '') + '</h3>' +
      '<div class="meta"><span class="dot d' + t.df + '"></span>' + DIFF[t.df] +
        ' · ' + esc(t.a) + '</div>' +
      '<div class="facts"><span>' + t.km + ' km</span><span>' + t.hh + ' h</span><span>↑' + t.up + ' m</span>' +
        '<span style="margin-left:auto" class="pill ' + PILL[st.k] + '">' + st.t + '</span></div>' +
      '<div class="meta">' + esc(dist) + ' · ' + esc(t.pk.c) + ' parking</div>';
    c.addEventListener("click", function () { select(t.id, false); });
    box.appendChild(c);
  });
  showMarkers(list);
  return list;
}

/* ───────────────────────────── detail sheet ───────────────────────────── */
function gmapsDir(lat, lon) { return "https://www.google.com/maps/dir/?api=1&destination=" + lat + "," + lon + "&travelmode=driving"; }
function appleDir(lat, lon) { return "https://maps.apple.com/?daddr=" + lat + "," + lon + "&dirflg=d"; }

function sheet(t) {
  var st = openState(t, NOW), s = sunTimes(NOW.date, t.lat, t.lon);
  var box = $("#sheet");
  var acc = { free: "No booking needed", gate: "Gated — hours apply", ticket: "Ticket required", permit: "Permit required" }[t.ac];
  var tags = []
    .concat(t.water ? ["water on route"] : [])
    .concat(t.sd === 2 ? ["shaded"] : t.sd === 0 ? ["no shade"] : [])
    .concat(t.dog ? ["dogs ok"] : ["no dogs"])
    .concat(t.kid ? ["kid-friendly"] : [])
    .concat(t.cats || []);

  box.innerHTML =
    '<div class="sheadr">' +
      '<div style="flex:1;min-width:0">' +
        '<h2>' + esc(t.n) + '</h2>' +
        '<div class="where">' + esc(t.a) + ' · ' + esc(t.pr) + ', ' + esc(t.rg) + '</div>' +
      '</div>' +
      '<button class="x" id="favT" title="Save">' + (favs.has(t.id) ? "★" : "☆") + '</button>' +
      '<button class="x" id="closeT" title="Close">✕</button>' +
    '</div>' +
    '<div class="sbody">' +
      '<div class="stats">' +
        '<div class="stat"><b>' + t.km + '</b><span>km ' + (t.sh === "loop" ? "loop" : t.sh === "one-way" ? "one-way" : "return") + '</span></div>' +
        '<div class="stat"><b>' + t.hh + '</b><span>hours walking</span></div>' +
        '<div class="stat"><b>' + t.up + '</b><span>m of ascent</span></div>' +
        '<div class="stat"><b>' + driveLabel(t) + '</b><span>drive from Rota</span></div>' +
      '</div>' +

      '<div class="status ' + PILL[st.k] + '"><b>' + st.t + (st.hrs && st.hrs !== "—" ? ' · ' + esc(st.hrs) : '') + '</b>' + esc(st.d) + '</div>' +

      '<div class="block"><span class="lbl">What it is</span><p>' + esc(t.why) + '</p></div>' +

      '<div class="parkbox">' +
        '<span class="lbl">Where to park</span>' +
        '<h4>' + esc(t.pk.n) + ' — ' + esc(t.pk.c) + '</h4>' +
        '<p>' + esc(t.pk.d) + '</p>' +
        '<div class="btns">' +
          '<a class="btn primary" target="_blank" rel="noopener" href="' + gmapsDir(t.pk.lat, t.pk.lon) + '">▸ Drive to the car park</a>' +
          '<a class="btn" target="_blank" rel="noopener" href="' + appleDir(t.pk.lat, t.pk.lon) + '">Apple Maps</a>' +
          '<button class="btn" id="copyP">Copy coords</button>' +
        '</div>' +
      '</div>' +

      '<div class="block"><span class="lbl">The one tip</span><p>' + esc(t.tip) + '</p></div>' +
      '<div class="block"><span class="lbl">Access &amp; season</span><p>' + esc(acc) + '. Best ' + esc(t.se) + '.' +
        (s ? ' Sunrise ' + madrid(s.rise).s + ', sunset ' + madrid(s.set).s + ' at the trailhead today.' : '') + '</p></div>' +

      '<div class="tags">' + tags.map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join("") + '</div>' +

      '<div class="btns" style="margin-top:12px">' +
        (t.bk ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(t.bk) + '">Book / permit ↗</a>' : '') +
        (t.off ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(t.off) + '">Official info ↗</a>' : '') +
        '<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/search?q=' + encodeURIComponent("site:wikiloc.com " + t.n + " " + t.a) + '">GPX track ↗</a>' +
        '<a class="btn" target="_blank" rel="noopener" href="' + gmapsDir(t.lat, t.lon) + '">Trailhead ↗</a>' +
      '</div>' +

      '<div id="intel"><span class="lbl">Live check</span>' +
        '<button class="btn" id="askBtn">Is it open right now? Ask Claude ↻</button></div>' +
    '</div>';

  box.classList.add("on");
  $("#closeT").addEventListener("click", close);
  $("#favT").addEventListener("click", function () {
    if (favs.has(t.id)) favs.delete(t.id); else favs.add(t.id);
    saveFavs(); $("#favT").textContent = favs.has(t.id) ? "★" : "☆"; render();
  });
  $("#copyP").addEventListener("click", function () {
    var v = t.pk.lat + ", " + t.pk.lon;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(
      function () { $("#copyP").textContent = "copied ✓"; },
      function () { window.prompt("Car park coordinates:", v); }
    );
  });
  $("#askBtn").addEventListener("click", function () { askClaude(t); });
}
function close() {
  $("#sheet").classList.remove("on");
  sel = null; if (history.replaceState) history.replaceState(null, "", location.pathname);
  if (parkMark) { map.removeLayer(parkMark); parkMark = null; }
  if (link) { map.removeLayer(link); link = null; }
  Array.prototype.forEach.call(document.querySelectorAll(".pin.on"), function (p) { p.classList.remove("on"); });
  render();
}
function select(id, fromMap) {
  var t = T.filter(function (x) { return x.id === id; })[0];
  if (!t) return;
  sel = id;
  if (history.replaceState) history.replaceState(null, "", "#" + id);

  Array.prototype.forEach.call(document.querySelectorAll(".pin.on"), function (p) { p.classList.remove("on"); });
  var m = marks[id];
  if (!map.hasLayer(m)) m.addTo(map);
  var node = m.getElement && m.getElement(); if (node && node.firstChild) node.firstChild.classList.add("on");

  if (parkMark) map.removeLayer(parkMark);
  if (link) map.removeLayer(link);
  parkMark = L.marker([t.pk.lat, t.pk.lon], {
    icon: L.divIcon({ className: "", html: '<div class="pmark" title="Parking">P</div>', iconSize: [24, 24], iconAnchor: [12, 12] })
  }).addTo(map).bindTooltip(t.pk.n + " — " + t.pk.c, { direction: "top", offset: [0, -12] });
  link = L.polyline([[t.pk.lat, t.pk.lon], [t.lat, t.lon]], { color: "#1c5fbe", weight: 2, dashArray: "4 5", opacity: .85 }).addTo(map);

  sheet(t);
  if (window.matchMedia("(max-width:820px)").matches) $("#rail").classList.remove("on");
  var far = haversine(t.lat, t.lon, t.pk.lat, t.pk.lon) > 1.2;
  map.flyToBounds(L.latLngBounds([[t.lat, t.lon], [t.pk.lat, t.pk.lon]]).pad(far ? 0.35 : 2.5),
    Object.assign({ maxZoom: 15, duration: .6 }, mapPad()));
  render();
  var card = $("#list .card.on"); if (card && !fromMap) card.scrollIntoView({ block: "nearest" });
}

/* ─────────────────────── live intel through the Worker ─────────────────────── */
function cfg() {
  var c = {}; try { c = JSON.parse(localStorage.getItem("rtf.cfg")) || {}; } catch (e) {}
  return {
    api: String(c.api || (window.TRIP_CONFIG && window.TRIP_CONFIG.API_BASE) || "").replace(/\/+$/, ""),
    code: c.code || ""
  };
}
function askClaude(t) {
  var box = $("#intel"), c = cfg();
  if (!c.api) { openCfg(); return; }
  box.innerHTML = '<span class="lbl">Live check</span><span class="spin"></span> asking Claude to search the web…';
  fetch(c.api + "/api/trail", {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, c.code ? { "X-Trip-Code": c.code } : {}),
    body: JSON.stringify({
      name: t.n, area: t.a, province: t.pr, country: "Spain",
      access: t.ac, official: t.off || t.bk || "",
      today: new Date().toISOString().slice(0, 10)
    })
  })
  .then(function (r) { if (r.status === 401) throw new Error("needs the access code"); return r.json(); })
  .then(function (d) {
    if (d && d.text) {
      box.innerHTML = '<span class="lbl">Live check · ' + esc(d.model || "claude") + '</span>' + esc(d.text) +
        '<div class="btns" style="margin-top:9px"><button class="btn" id="askBtn">Re-check ↻</button></div>';
    } else {
      box.innerHTML = '<span class="lbl">Live check</span>Live intel is not switched on for this site yet — the Worker has no Claude key. Everything on this card still works offline.' +
        '<div class="btns" style="margin-top:9px"><button class="btn" id="askBtn">Try again</button></div>';
    }
    $("#askBtn").addEventListener("click", function () { askClaude(t); });
  })
  .catch(function (err) {
    box.innerHTML = '<span class="lbl">Live check</span>Could not reach the intel service (' + esc(err.message) + ').' +
      '<div class="btns" style="margin-top:9px"><button class="btn" id="askBtn">Try again</button><button class="btn" id="cfgOpen">Settings</button></div>';
    $("#askBtn").addEventListener("click", function () { askClaude(t); });
    $("#cfgOpen").addEventListener("click", openCfg);
  });
}
function openCfg() {
  var c = cfg();
  $("#cfgApi").value = c.api; $("#cfgCode").value = c.code;
  $("#cfg").hidden = false; $("#cfgApi").focus();
}

/* ───────────────────────────── wiring ───────────────────────────── */
var chips = $("#chips");
FILTERS.forEach(function (f) {
  var b = el("button", "chip", f.label);
  b.setAttribute("aria-pressed", "false");
  b.addEventListener("click", function () {
    on[f.id] = !on[f.id];
    b.setAttribute("aria-pressed", String(!!on[f.id]));
    var list = render();
    if (list.length) fitAll(list);
  });
  chips.appendChild(b);
});
$("#q").addEventListener("input", function (e) { query = e.target.value.trim(); render(); });
$("#sort").addEventListener("change", function (e) { sortBy = e.target.value; render(); });
$("#favBtn").addEventListener("click", function () {
  favOnly = !favOnly; $("#favBtn").setAttribute("aria-pressed", String(favOnly)); render();
});
$("#fitBtn").addEventListener("click", function () { fitAll(T.filter(matches)); });
$("#cfgBtn").addEventListener("click", openCfg);
$("#cfgClose").addEventListener("click", function () { $("#cfg").hidden = true; });
$("#cfgSave").addEventListener("click", function () {
  try {
    localStorage.setItem("rtf.cfg", JSON.stringify({ api: $("#cfgApi").value.trim().replace(/\/+$/, ""), code: $("#cfgCode").value.trim() }));
  } catch (e) {}
  $("#cfg").hidden = true;
});
$("#cfg").addEventListener("click", function (e) { if (e.target === $("#cfg")) $("#cfg").hidden = true; });

$("#locBtn").addEventListener("click", function () {
  if (!navigator.geolocation) return;
  $("#locBtn").innerHTML = '<span class="spin"></span>';
  navigator.geolocation.getCurrentPosition(function (p) {
    me = [p.coords.latitude, p.coords.longitude];
    if (meMark) map.removeLayer(meMark);
    meMark = L.marker(me, { icon: L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) })
      .addTo(map).bindTooltip("You are here", { direction: "top", offset: [0, -10] });
    map.setView(me, 10);
    $("#locBtn").innerHTML = "◉";
    render();
  }, function () {
    $("#locBtn").innerHTML = "✕";
    setTimeout(function () { $("#locBtn").innerHTML = "◉"; }, 1500);
  }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 6e5 });
});

$("#listTab").addEventListener("click", function () {
  $("#rail").classList.add("on"); $("#sheet").classList.remove("on");
  $("#listTab").setAttribute("aria-pressed", "true"); $("#mapTab").setAttribute("aria-pressed", "false");
});
$("#mapTab").addEventListener("click", function () {
  $("#rail").classList.remove("on"); $("#sheet").classList.remove("on");
  $("#listTab").setAttribute("aria-pressed", "false"); $("#mapTab").setAttribute("aria-pressed", "true");
});
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") { if (!$("#cfg").hidden) $("#cfg").hidden = true; else close(); }
  if (e.key === "/" && document.activeElement !== $("#q")) { e.preventDefault(); $("#q").focus(); }
});

var themeBtn = $("#themeBtn");
try { var th = localStorage.getItem("hike-theme"); if (th) document.documentElement.dataset.theme = th; } catch (e) {}
themeBtn.addEventListener("click", function () {
  var dark = document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme:dark)").matches);
  document.documentElement.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("hike-theme", dark ? "light" : "dark"); } catch (e) {}
});

/* first paint — wait a frame so Leaflet has measured the container, or
   fitBounds runs against a zero-size map and lands on the whole world. */
render();
var hash = location.hash.replace("#", "");
requestAnimationFrame(function () {
  map.invalidateSize();
  if (hash && marks[hash]) select(hash, false);
  else fitAll(T.filter(function (t) { return t.dh != null && t.dh <= 5; }));   /* open on Andalucía, not all of Spain */
});
window.addEventListener("resize", function () { map.invalidateSize(); });
/* The pane can settle after fonts and the rail lay out — keep Leaflet's cached
   size honest or it paints tiles for a container that no longer exists. */
if (window.ResizeObserver) new ResizeObserver(function () { map.invalidateSize(); }).observe($("#map"));
setTimeout(function () { map.invalidateSize(); }, 400);

/* the clock moves; recompute "open now" every few minutes */
setInterval(function () { NOW = spainNow(); render(); }, 3e5);
})();
