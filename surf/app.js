/* Rota Wave Watch — live bodyboarding conditions for the Gulf of Cádiz.
   No build step, no framework, no API keys. Three batched requests cover
   every spot; everything else is arithmetic.

   Sources, all keyless and CORS-open:
     marine-api.open-meteo.com  waves, swell, sea temperature, tide height
                                (best-match, plus ECMWF WAM / Météo-France
                                 MFWAM / NOAA GFS-Wave for model spread)
     api.open-meteo.com         wind, air, UV, rain, sunrise/sunset
                                (best-match, plus ECMWF IFS / GFS / ICON)
*/
(function () {
"use strict";

var SPOTS = window.__SURF_SPOTS__ || [];
var CAMS  = window.__SURF_CAMS__ || [];
var SUITS = window.__SURF_WETSUIT__ || [];
var KIT   = window.__SURF_KIT__ || [];
var RULES = window.__SURF_RULES__ || {};
var LORE  = window.__SURF_LORE__ || [];

var DAYS = 10;   /* the marine models reach ten days; confidence decays to match */
var TZ = "Europe/Madrid";
var CACHE_KEY = "rotasurf.v1";
var CACHE_MAX_AGE = 60 * 60 * 1000;      /* an hour — the models update every 3–6 h */

/* ───────────────────────────── tiny helpers ───────────────────────────── */
var $  = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var el = function (t, c, h) { var n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); };
var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
var pad = function (n) { return (n < 10 ? "0" : "") + n; };
var r1 = function (v) { return Math.round(v * 10) / 10; };
/* Wave heights: one decimal always, and an honest word rather than "0 m"
   when there is nothing there to measure. */
var mtr = function (v) {
  if (v == null || !isFinite(v)) return "—";
  if (v < 0.05) return "flat";
  return v.toFixed(1) + " m";
};
var avg = function (a) { var s = 0, n = 0, i; for (i = 0; i < a.length; i++) if (a[i] != null) { s += a[i]; n++; } return n ? s / n : null; };

/* Smallest angle between two bearings, 0–180. */
function angDiff(a, b) { return Math.abs(((a - b) % 360 + 540) % 360 - 180); }
/* Is bearing b inside the arc from lo to bearing hi, going clockwise? */
function inArc(b, lo, hi) {
  var span = ((hi - lo) % 360 + 360) % 360;
  var off  = ((b  - lo) % 360 + 360) % 360;
  return off <= span;
}
function arcDistance(b, lo, hi) {
  if (inArc(b, lo, hi)) return 0;
  return Math.min(angDiff(b, lo), angDiff(b, hi));
}
var COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
function compass(deg) { return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]; }

/* Spanish wall clock, whatever time zone the phone is in. */
var MDATE = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
var MTIME = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour12: false, hour: "2-digit", minute: "2-digit" });
function madridNowKey() { return MDATE.format(new Date()) + "T" + MTIME.format(new Date()).slice(0, 2) + ":00"; }
function madridToday() { return MDATE.format(new Date()); }

/* The API hands back local wall-clock strings with no offset. Parse them as
   plain labels rather than as instants — no Date maths, no DST surprises. */
function parseKey(s) {
  return { date: s.slice(0, 10), hour: +s.slice(11, 13), key: s.slice(0, 13) + ":00" };
}
var WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayLabel(iso) {
  var p = iso.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  var today = madridToday();
  if (iso === today) return "Today";
  var t = today.split("-"), tm = Date.UTC(+t[0], +t[1] - 1, +t[2]);
  if (d - tm === 86400000) return "Tomorrow";
  return WD[d.getUTCDay()] + " " + +p[2] + " " + MO[+p[1] - 1];
}
function dayShort(iso) {
  var p = iso.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return { wd: WD[d.getUTCDay()], dm: +p[2] + "/" + (+p[1]) };
}
function hhmm(h) { return pad(h) + ":00"; }

/* ───────────────────────────── data fetching ───────────────────────────── */

var MARINE_VARS = ["wave_height", "wave_direction", "wave_period", "wind_wave_height",
  "wind_wave_period", "wind_wave_direction", "swell_wave_height", "swell_wave_direction",
  "swell_wave_period", "swell_wave_peak_period", "sea_surface_temperature",
  "sea_level_height_msl", "ocean_current_velocity", "ocean_current_direction"].join(",");
var ATMO_VARS = ["wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "temperature_2m",
  "apparent_temperature", "precipitation", "precipitation_probability", "uv_index",
  "weather_code", "cloud_cover", "visibility", "pressure_msl"].join(",");
var WAVE_MODELS = "ecmwf_wam025,meteofrance_wave,ncep_gfswave025";
var ATMO_MODELS = "ecmwf_ifs025,gfs_seamless,icon_seamless";

function joinCoords(key) { return SPOTS.map(function (s) { return s[key]; }).join(","); }

function withTimeout(url, ms) {
  var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  var t = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 20000);
  return fetch(url, ctl ? { signal: ctl.signal } : undefined)
    .then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }, function (e) { clearTimeout(t); throw e; });
}
/* One retry with a short backoff. Open-Meteo is reliable but phones are not. */
function fetchRetry(url, tries) {
  return withTimeout(url).catch(function (e) {
    if ((tries || 0) >= 1) throw e;
    return new Promise(function (res) { setTimeout(res, 900); })
      .then(function () { return fetchRetry(url, (tries || 0) + 1); });
  });
}
var asList = function (d) { return Array.isArray(d) ? d : [d]; };

function loadAll() {
  var lat = joinCoords("mlat"), lon = joinCoords("mlon");
  var alat = joinCoords("lat"), alon = joinCoords("lon");
  var base = "&timezone=" + encodeURIComponent(TZ) + "&forecast_days=" + DAYS;

  var reqs = [
    { id: "marine", label: "Waves, swell, sea temp, tide",
      url: "https://marine-api.open-meteo.com/v1/marine?latitude=" + lat + "&longitude=" + lon +
           "&hourly=" + MARINE_VARS + base },
    { id: "atmo", label: "Wind, air, UV, sun",
      url: "https://api.open-meteo.com/v1/forecast?latitude=" + alat + "&longitude=" + alon +
           "&hourly=" + ATMO_VARS + "&daily=sunrise,sunset,uv_index_max" + base + "&wind_speed_unit=kn" },
    { id: "wavespread", label: "ECMWF · Météo-France · NOAA wave models",
      url: "https://marine-api.open-meteo.com/v1/marine?latitude=" + lat + "&longitude=" + lon +
           "&hourly=wave_height,swell_wave_period&models=" + WAVE_MODELS + base },
    { id: "windspread", label: "ECMWF · NOAA · DWD wind models",
      url: "https://api.open-meteo.com/v1/forecast?latitude=" + alat + "&longitude=" + alon +
           "&hourly=wind_speed_10m&models=" + ATMO_MODELS + base + "&wind_speed_unit=kn" }
  ];

  /* Every source is fetched independently and failures are isolated: losing
     the model-spread call costs you the confidence badge, not the forecast. */
  return Promise.all(reqs.map(function (r) {
    return fetchRetry(r.url).then(
      function (d) { return { id: r.id, label: r.label, ok: true, data: asList(d) }; },
      function (e) { return { id: r.id, label: r.label, ok: false, err: String(e.message || e) }; }
    );
  })).then(function (rs) {
    var out = { at: Date.now(), sources: {} };
    rs.forEach(function (r) { out.sources[r.id] = r; });
    if (!out.sources.marine.ok || !out.sources.atmo.ok) {
      /* A cached forecast is worth showing when the network is down, but only
         while it still covers the present — past about three days its window
         has run out and it would be describing a week that has already been. */
      var cached = readCache();
      if (cached && Date.now() - cached.at < 72 * 3600 * 1000) {
        cached.stale = true;
        return cached;
      }
      throw new Error(out.sources.marine.err || out.sources.atmo.err ||
        "Both forecast services are unreachable.");
    }
    writeCache(out);
    return out;
  });
}

function readCache() {
  try {
    var raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    var d = JSON.parse(raw);
    if (!d || !d.at || !d.sources) return null;
    return d;
  } catch (e) { return null; }
}
function writeCache(d) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch (e) { /* quota or private mode */ }
}

/* ──────────────────────── assembling the hour table ──────────────────────── */

/* Pull one spot's series out of the multi-location responses and index it by
   wall-clock hour so the four sources line up even if one returns a shifted
   window. */
function seriesFor(res, i, pick) {
  if (!res || !res.ok || !res.data[i]) return null;
  var h = res.data[i].hourly;
  if (!h || !h.time) return null;
  var map = {};
  for (var t = 0; t < h.time.length; t++) {
    var row = {};
    for (var k in h) if (k !== "time") row[k] = h[k][t];
    map[parseKey(h.time[t]).key] = row;
  }
  return { map: map, times: h.time.map(function (s) { return parseKey(s).key; }), daily: res.data[i].daily || null };
}

/* Tide arrives as height above mean sea level. What matters for surf is where
   you sit between this tide's own low and high, and which way it is going.

   Measuring that against the bracketing turning points — rather than against
   a rolling window of hours — is both more accurate and safe at the ends of
   the forecast, where a window runs out of samples and quietly biases the
   answer towards whichever half-cycle it happened to catch. */
function tideStateAt(tides, times, map, idx) {
  var key = times[idx];
  var cur = map[key] ? map[key].sea_level_height_msl : null;
  var stamp = key.slice(0, 13) + ":00";
  var j = 0;
  while (j < tides.length && tides[j].stamp < stamp) j++;
  var nx = tides[j] || null, pv = tides[j - 1] || null;

  if (cur != null && nx && pv) {
    var lo = Math.min(pv.m, nx.m), hi = Math.max(pv.m, nx.m), rng = hi - lo;
    if (rng >= 0.05) {
      return { t: clamp((cur - lo) / rng, 0, 1), rising: nx.type === "high", m: cur, range: rng };
    }
  }
  return tideStateWindow(times, map, idx);   /* the ends of the series */
}

/* Fallback for hours with no turning point on one side of them. */
function tideStateWindow(times, map, idx) {
  var lo = Infinity, hi = -Infinity, i;
  for (i = Math.max(0, idx - 6); i <= Math.min(times.length - 1, idx + 6); i++) {
    var v = map[times[i]] && map[times[i]].sea_level_height_msl;
    if (v == null) continue;
    if (v < lo) lo = v; if (v > hi) hi = v;
  }
  var cur = map[times[idx]] ? map[times[idx]].sea_level_height_msl : null;
  var range = isFinite(hi - lo) ? hi - lo : 0;
  if (cur == null || !isFinite(lo) || range < 0.05) {
    return { t: 0.5, rising: true, m: cur, range: range };
  }
  var prev = idx > 0 && map[times[idx - 1]] ? map[times[idx - 1]].sea_level_height_msl : cur;
  return { t: clamp((cur - lo) / range, 0, 1), rising: cur >= prev, m: cur, range: range };
}

/* ── first and last usable light ────────────────────────────────────────
   Open-Meteo gives sunrise and sunset but not civil twilight, and twilight
   is the half-hour that decides whether a dawn session is on — especially in
   summer, when getting in before the lifeguard towers open is the whole plan.

   Rather than recompute sunrise from scratch and risk disagreeing with the
   API about it, this works out only the *gap* between the sun at -0.833°
   (sunrise) and at -6° (civil twilight) and adds it either side of the
   API's own times. A difference of two hour angles needs no time zone and
   no Julian dates, so there is nothing here to get wrong twice. */
function solarDeclination(date) {
  var p = date.split("-"), y = +p[0], mo = +p[1], d = +p[2];
  var N = Math.floor((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  var g = 2 * Math.PI / 365 * (N - 1);
  return 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
       - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
       - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
}
function twilightMinutes(date, lat) {
  var dec = solarDeclination(date), phi = lat * Math.PI / 180;
  var H = function (deg) {
    var h = deg * Math.PI / 180;
    var c = (Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (c > 1 || c < -1) return null;
    return Math.acos(c);
  };
  var a = H(-0.833), b = H(-6);
  if (a == null || b == null) return 30;
  return clamp(Math.round((b - a) * 1440 / (2 * Math.PI)), 15, 70);
}

/* Sunrise/sunset for the day, as minutes past midnight local. */
function sunFor(daily, date) {
  if (!daily || !daily.time) return { up: 7 * 60 + 30, down: 21 * 60 };
  var i = daily.time.indexOf(date);
  if (i < 0) return { up: 7 * 60 + 30, down: 21 * 60 };
  var mins = function (v) {
    if (!v) return null;
    var h = +v.slice(11, 13), m = +v.slice(14, 16);
    return isFinite(h) && isFinite(m) ? h * 60 + m : null;
  };
  var up = mins(daily.sunrise[i]), down = mins(daily.sunset[i]);
  up = up == null ? 450 : up;
  down = down == null ? 1260 : down;
  return { up: up, down: down };
}

/* ─────────────────────────── the scoring model ───────────────────────────
   Tuned for a bodyboard, which is not the same as tuning for a surfboard:
   a sponge wants a steeper, punchier, shallower wave, is happy at half the
   size a longboard needs, and actively likes a low-tide shorebreak that a
   surfer would call a closeout. Weights reflect that.                      */

function sizeScore(hs, best) {
  if (hs < best.min * 0.45) return clamp((hs / (best.min * 0.45)) * 22, 0, 22);
  if (hs < best.min) return 22 + ((hs - best.min * 0.45) / (best.min * 0.55)) * 45;
  if (hs <= best.max) {
    var spread = Math.max(best.ideal - best.min, best.max - best.ideal, 0.25);
    var d = Math.abs(hs - best.ideal) / spread;
    return 100 - 28 * d * d;
  }
  /* Over the top of the band it closes out — falls away fast, never to zero
     because an advanced rider can still find a corner. */
  return clamp(72 - (hs - best.max) * 40, 12, 72);
}

function periodScore(tp, pmin) {
  if (tp == null) return 50;
  if (tp < pmin - 2) return 8;
  if (tp < pmin) return 8 + ((tp - (pmin - 2)) / 2) * 34;
  return clamp(42 + ((tp - pmin) / 5) * 58, 42, 100);
}

/* Offshore is the whole game. Under about 5 knots nothing matters — it is
   glassy from any direction — and above that the penalty for onshore builds
   far faster than the penalty for offshore. */
function windScore(spd, dir, off) {
  if (spd == null || dir == null) return 60;
  if (spd < 4) return 92;
  var offshoreness = Math.cos(angDiff(dir, off) * Math.PI / 180);   /* 1 offshore … -1 onshore */
  var s = 50 + 45 * offshoreness;
  if (offshoreness > 0.25) s -= Math.max(0, spd - 22) * 3.2;        /* too much of a good thing */
  else s -= Math.max(0, spd - 7) * 2.4;                              /* chop arrives quickly */
  return clamp(s, 0, 100);
}

function tideScore(spot, st) {
  var t = st.t;
  var s;
  switch (spot.tide) {
    case "low":  s = 100 - Math.abs(t - 0.22) * 118; break;
    case "high": s = 100 - Math.abs(t - 0.80) * 118; break;
    case "push": s = 100 - Math.abs(t - 0.55) * 95 + (st.rising ? 10 : -14); break;
    case "all":  s = 84; break;
    default:     s = 100 - Math.abs(t - 0.50) * 105; break;          /* mid */
  }
  /* A shorebreak sharpens up as the water drops off the bank — a bodyboard
     bonus a surf forecast would not give you. */
  if (spot.shore && t < 0.4) s += 8;
  return clamp(s, 8, 100);
}

/* How much of the open-ocean swell actually arrives, given the headlands.
   Longer-period swell refracts into sheltered corners better than short
   wind chop does, which is why a distant groundswell lights up beaches that
   a local blow-up never touches. */
function reachFactor(spot, swellDir, tp) {
  var off = arcDistance(swellDir, spot.win[0], spot.win[1]);
  var dirF = off <= 0 ? 1 : clamp(1 - off / 42, 0.06, 1);
  var refract = 1;
  if (spot.exposure < 0.75 && tp) refract = clamp(1 + (tp - 9) * 0.055, 0.82, 1.3);
  return { dirF: dirF, reach: clamp(spot.exposure * refract, 0, 1.05), offBy: off };
}

function scoreHour(spot, m, a, st, sun, hour) {
  if (!m || !a) return null;
  /* What you can actually ride is the swell, not the total sea state. Local
     wind chop inflates significant wave height without adding a single
     rideable wave, so it only counts for a third of its energy here. */
  var sw = m.swell_wave_height, ww = m.wind_wave_height;
  var hs = sw != null
    ? Math.sqrt(sw * sw + (ww != null ? 0.35 * ww * ww : 0))
    : m.wave_height;
  if (hs == null) return null;
  var swellDir = m.swell_wave_direction != null ? m.swell_wave_direction : m.wave_direction;
  var tp = m.swell_wave_period != null ? m.swell_wave_period : m.wave_period;

  var rf = reachFactor(spot, swellDir, tp);
  var localHs = hs * rf.reach * Math.pow(rf.dirF, 1.15);

  var sz = sizeScore(localHs, spot.best);
  var pd = periodScore(tp, spot.pmin);
  var wd = windScore(a.wind_speed_10m, a.wind_direction_10m, spot.off);
  var td = tideScore(spot, st);
  var dr = rf.dirF * 100;

  var score = 0.30 * sz + 0.24 * wd + 0.16 * pd + 0.15 * td + 0.15 * dr;

  /* Penalties are multiplicative rather than hard ceilings. A ceiling makes
     every hour of a gusty day read exactly 42, which throws away the shape
     of the day — and the shape is the thing you are looking for. */
  var damp = 1;
  if (tp != null && tp < 6) damp *= clamp(0.40 + (tp - 4) / 6.5, 0.40, 1);      /* local chop */
  if (a.wind_gusts_10m != null && a.wind_gusts_10m > 28) {
    damp *= clamp(1 - (a.wind_gusts_10m - 28) * 0.028, 0.42, 1);                /* squally */
  }
  if (a.precipitation != null && a.precipitation > 2) damp *= 0.93;
  score *= damp;

  var flat = localHs < 0.30;
  if (flat) score = Math.min(score, 7 + localHs * 36);

  var mins = hour * 60;
  var dark = mins < sun.up - 25 || mins > sun.down + 20;
  var twilight = !dark && (mins < sun.up + 20 || mins > sun.down - 30);

  /* Wave energy per metre of crest, in relative terms — this is what people
     mean by "punchy". Height counts twice over, period once. */
  var punch = localHs * localHs * (tp || 8);

  return {
    score: clamp(Math.round(score), 0, 100),
    localHs: localHs, offshoreHs: hs, tp: tp, swellDir: swellDir,
    /* the two halves of the sea state, kept apart: one you can ride, one
       is just the local wind roughing up the surface */
    swellH: sw, swellT: m.swell_wave_period, swellPeakT: m.swell_wave_peak_period,
    windWaveH: ww, windWaveT: m.wind_wave_period, windWaveDir: m.wind_wave_direction,
    wind: a.wind_speed_10m, windDir: a.wind_direction_10m, gust: a.wind_gusts_10m,
    airT: a.temperature_2m, feelsT: a.apparent_temperature,
    sst: m.sea_surface_temperature, uv: a.uv_index,
    rain: a.precipitation, rainP: a.precipitation_probability, cloud: a.cloud_cover,
    vis: a.visibility, pressure: a.pressure_msl,
    curV: m.ocean_current_velocity, curDir: m.ocean_current_direction,
    tide: st, dark: dark, twilight: twilight, flat: flat, punch: punch,
    parts: { size: sz, wind: wd, period: pd, tide: td, dir: dr },
    offBy: rf.offBy
  };
}

/* ─────────────────────── build every spot's week ─────────────────────── */

function buildModel(raw) {
  var marine = raw.sources.marine, atmo = raw.sources.atmo;
  var wspread = raw.sources.wavespread, windspread = raw.sources.windspread;
  var out = { spots: [], hours: [], days: [], at: raw.at, stale: !!raw.stale, sources: raw.sources };

  SPOTS.forEach(function (spot, i) {
    var M = seriesFor(marine, i, null), A = seriesFor(atmo, i, null);
    if (!M || !A) return;
    var WS = seriesFor(wspread, i, null), NS = seriesFor(windspread, i, null);
    var tides = tideExtremes(M.times, M.map);
    var rows = [];
    for (var t = 0; t < M.times.length; t++) {
      var key = M.times[t];
      var m = M.map[key], a = A.map[key];
      if (!m || !a) continue;
      var pk = parseKey(key);
      var sun = sunFor(A.daily, pk.date);
      var st = tideStateAt(tides, M.times, M.map, t);
      var sc = scoreHour(spot, m, a, st, sun, pk.hour);
      if (!sc) continue;
      sc.key = key; sc.date = pk.date; sc.hour = pk.hour; sc.sun = sun;

      /* Model agreement: how far apart the three agencies are on wave height
         at this hour, as a fraction of their mean. */
      if (WS && WS.map[key]) {
        var w = WS.map[key];
        var hs3 = [w.wave_height_ecmwf_wam025, w.wave_height_meteofrance_wave, w.wave_height_ncep_gfswave025]
          .filter(function (v) { return v != null; });
        if (hs3.length >= 2) {
          var mn = Math.min.apply(null, hs3), mx = Math.max.apply(null, hs3), me = avg(hs3);
          sc.band = { lo: mn, hi: mx, mid: me, n: hs3.length };
          sc.spread = me > 0.15 ? (mx - mn) / me : 0;
        }
      }
      if (NS && NS.map[key]) {
        var n = NS.map[key];
        var w3 = [n.wind_speed_10m_ecmwf_ifs025, n.wind_speed_10m_gfs_seamless, n.wind_speed_10m_icon_seamless]
          .filter(function (v) { return v != null; });
        if (w3.length >= 2) sc.windSpread = (Math.max.apply(null, w3) - Math.min.apply(null, w3));
      }
      rows.push(sc);
    }
    if (rows.length) {
      out.spots.push({ spot: spot, rows: rows, byKey: index(rows), tides: tides });
    }
  });

  /* The union across every spot, not whichever one happened to land first —
     a spot whose grid cell has gaps must not truncate the whole week. */
  if (out.spots.length) {
    var seenK = {};
    out.spots.forEach(function (e) { e.rows.forEach(function (r) { seenK[r.key] = 1; }); });
    out.hours = Object.keys(seenK).sort();          /* ISO strings sort chronologically */
    /* The providers' horizon rarely lands on midnight, so the last "day" is
       often a couple of pre-dawn hours. That is an artefact, not a forecast
       day — counting it produces a row that can only ever say "no data". */
    var perDay = {};
    out.hours.forEach(function (k) {
      var d = k.slice(0, 10);
      perDay[d] = (perDay[d] || 0) + 1;
    });
    Object.keys(perDay).sort().forEach(function (d) {
      if (perDay[d] >= 8) out.days.push(d);
    });
    out.hours = out.hours.filter(function (k) { return perDay[k.slice(0, 10)] >= 8; });
  }
  return out;
}
function index(rows) { var m = {}; rows.forEach(function (r) { m[r.key] = r; }); return m; }

/* Confidence from model spread plus how far out we are looking. Wind counts
   as well as wave height: a clean 1 m day and a blown-out 1 m day are the same
   swell, and the wind models are the ones that disagree about which it will be.
   The lead-time cut-offs are fractions of the forecast horizon, so they stay
   right if the horizon changes. */
function confidenceOf(sc, key) {
  var lead = out_leadHours(key);
  var horizon = DAYS * 24;
  var base = sc && sc.spread != null ? sc.spread : null;
  var lvl;
  if (base == null) lvl = lead < 48 ? 2 : 1;
  else if (base < 0.18) lvl = 3;
  else if (base < 0.38) lvl = 2;
  else lvl = 1;

  var windy = sc && sc.windSpread != null && sc.windSpread >= 8;
  if (windy && lvl > 1) lvl--;
  if (lead > horizon * 0.70 && lvl === 3) lvl = 2;
  if (lead > horizon * 0.85 && lvl > 1) lvl = 1;

  var parts = [];
  parts.push(base == null ? "only one wave model reaches this far"
    : Math.round(base * 100) + "% spread across three wave models");
  if (sc && sc.windSpread != null) {
    parts.push(Math.round(sc.windSpread) + " kn apart on wind");
  }
  return { level: lvl, label: ["", "Low", "Fair", "High"][lvl], why: parts.join(", "), lead: lead };
}
function out_leadHours(key) {
  var now = madridNowKey();
  var a = now.slice(0, 13), b = key.slice(0, 13);
  var da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10), +a.slice(11, 13));
  var db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10), +b.slice(11, 13));
  return Math.round((db - da) / 3600000);
}

/* ──────────────────────── verdicts, kit, sessions ──────────────────────── */

var BANDS = [
  { min: 78, word: "Go now",        tone: "epic",  d: "This is as good as this coast gets. Drop what you are doing." },
  { min: 62, word: "Worth the drive", tone: "good", d: "A proper session. Clean enough and big enough to be fun." },
  { min: 46, word: "Rideable",      tone: "ok",    d: "You will catch waves. Not a day you will remember, but a good one to be in the water." },
  { min: 30, word: "Marginal",      tone: "meh",   d: "Small, or messy, or both. Fine if you just want a swim with a board." },
  { min: 14, word: "Poor",          tone: "poor",  d: "Not really surfable. Look at another day on the grid." },
  { min: -1, word: "Flat",          tone: "flat",  d: "Nothing there. The Gulf of Cádiz does this a lot in summer." }
];
function band(score) { for (var i = 0; i < BANDS.length; i++) if (score >= BANDS[i].min) return BANDS[i]; return BANDS[BANDS.length - 1]; }

function suitFor(sst) {
  if (sst == null) return SUITS[3];
  for (var i = 0; i < SUITS.length; i++) if (sst >= SUITS[i].min) return SUITS[i];
  return SUITS[SUITS.length - 1];
}
function kitFor(sc, spot) {
  var month = +(sc.date || madridToday()).slice(5, 7);
  var ctx = {
    hs: sc.localHs, sst: sc.sst, airT: sc.airT, uv: sc.uv || 0, wind: sc.wind || 0,
    reef: /reef|rock/i.test(spot.bottom || "") || /reef/i.test(spot.type || ""),
    rip: sc.localHs >= 1.3 || /rip/i.test((spot.hazards || []).join(" ")),
    summer: month >= 6 && month <= 9
  };
  return KIT.filter(function (k) { return k.always || (k.test && k.test(ctx)); });
}

/* ───────────────────────── tide times ─────────────────────────
   The model gives an hourly height. What a surfer wants is the clock time
   of each high and low, which sits between the hourly samples — so fit a
   parabola through the three points around each turning point and read the
   vertex off it. That lands within a couple of minutes of a tide table. */
function tideExtremes(times, map) {
  var out = [], i;
  var h = function (t) { var r = map[times[t]]; return r ? r.sea_level_height_msl : null; };
  for (i = 1; i < times.length - 1; i++) {
    var a = h(i - 1), b = h(i), c = h(i + 1);
    if (a == null || b == null || c == null) continue;
    var isHigh = b > a && b >= c, isLow = b < a && b <= c;
    if (!isHigh && !isLow) continue;
    var denom = a - 2 * b + c;
    /* For a genuine local extremum the vertex is within half a sample of the
       middle point; anything outside that is numerical noise. */
    var d = Math.abs(denom) < 1e-6 ? 0 : clamp(0.5 * (a - c) / denom, -0.5, 0.5);
    var height = b - 0.25 * (a - c) * d;
    var idx = i + d;
    var base = times[Math.max(0, Math.min(times.length - 1, Math.floor(idx)))];
    var mins = Math.round((idx - Math.floor(idx)) * 60);
    if (mins > 59) mins = 59;
    var p = parseKey(base);
    out.push({
      type: isHigh ? "high" : "low", date: p.date, hour: p.hour, min: mins,
      at: pad(p.hour) + ":" + pad(mins), m: height, key: base,
      stamp: base.slice(0, 13) + ":" + pad(mins)
    });
  }
  return out;
}
function tidesOn(entry, date) {
  return (entry.tides || []).filter(function (t) { return t.date === date; });
}
/* The next two turning points from a given hour, for the "what is the water
   doing next" line. */
function nextTides(entry, key, n, refMin) {
  var all = entry.tides || [];
  var ref = key.slice(0, 13) + ":" + pad(refMin || 0);
  var out = [];
  for (var i = 0; i < all.length && out.length < (n || 2); i++) {
    var at = all[i].key.slice(0, 13) + ":" + pad(all[i].min);
    if (at >= ref) out.push(all[i]);
  }
  return out;
}

/* ── spring or neap ──────────────────────────────────────────────────────
   Taken from the tide's own behaviour rather than from the calendar: the
   biggest range in the forecast window is a spring, the smallest a neap. The
   moon is only there to explain why, because "spring tide" sounds seasonal
   and is not. */
var MOON_NAMES = ["new moon", "waxing crescent", "first quarter", "waxing gibbous",
                  "full moon", "waning gibbous", "last quarter", "waning crescent"];
function moonAge(date) {
  var p = date.split("-");
  var d = Date.UTC(+p[0], +p[1] - 1, +p[2], 12);
  var known = Date.UTC(2000, 0, 6, 18, 14);      /* a known new moon */
  var syn = 29.530588853;
  return ((((d - known) / 86400000) % syn) + syn) % syn;
}
function moonName(date) {
  var a = moonAge(date), syn = 29.530588853;
  return MOON_NAMES[Math.floor(((a / syn) * 8 + 0.5) % 8)];
}
function dayRange(entry, date) {
  var t = tidesOn(entry, date);
  if (t.length < 2) return null;
  var hs = t.map(function (x) { return x.m; });
  return Math.max.apply(null, hs) - Math.min.apply(null, hs);
}
function tideKind(entry, date) {
  var here = dayRange(entry, date);
  if (here == null) return null;
  var all = S.model.days.map(function (d) { return dayRange(entry, d); })
    .filter(function (v) { return v != null; });
  if (all.length < 3) return null;
  var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
  if (hi - lo < 0.3) return { kind: "average", range: here, moon: moonName(date) };
  var f = (here - lo) / (hi - lo);
  return {
    kind: f > 0.66 ? "spring" : f < 0.34 ? "neap" : "average",
    range: here, moon: moonName(date)
  };
}

/* ── how far away is it, from wherever you are standing ── */
function haversineKm(a, b, c, d) {
  var R = 6371, p = Math.PI / 180;
  var dLat = (c - a) * p, dLon = (d - b) * p;
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(a * p) * Math.cos(c * p) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
function distanceFromMe(spot) {
  if (!S.me) return null;
  return haversineKm(S.me.lat, S.me.lon, spot.lat, spot.lon);
}

/* ── the best this beach gets in the whole forecast window ── */
function bestWindowForSpot(entry) {
  var best = null;
  S.model.days.forEach(function (date) {
    var legal = function (r) { return !boardRule(entry.spot, date, r.hour).restricted; };
    var w = dayWindowFor(entry, date, legal);
    if (!w) return;
    if (out_leadHours(w.peak.key) < -1) return;          /* already gone */
    if (!best || w.peak.score > best.peak.score) best = { date: date, from: w.from, to: w.to, peak: w.peak };
  });
  return best;
}

/* ─────────────────── is a board legal here, right now? ───────────────────
   The ordinance is seasonal and hour-bound, so the honest answer changes
   through the day. This turns the static rule into a live yes or no, and
   says when it flips. */
var GUARD_ON = 11, GUARD_OFF = 20;
function inBathingSeason(date) {
  var md = date.slice(5);
  return md >= RULES.season.from && md <= RULES.season.to;
}
function boardRule(spot, date, hour) {
  if (!spot.bb || spot.bb.status === "open") {
    return { restricted: false, tone: "ok", short: "Boards fine",
             text: "No seasonal zone here — boards are fine at any hour, all year. Flags still apply." };
  }
  if (!inBathingSeason(date)) {
    return { restricted: false, tone: "ok", short: "Boards fine",
             text: "Outside the 15 June–15 September bathing season, so there is no board restriction at all." };
  }
  if (hour >= GUARD_ON && hour < GUARD_OFF) {
    return { restricted: true, tone: "warn", short: "Zone closed to boards",
             text: "Lifeguards are on until " + GUARD_OFF + ":00, so boards are out of the buoyed swimming zone. " +
                   "Walk up the beach past the buoys, or come back after " + GUARD_OFF + ":00.",
             until: GUARD_OFF };
  }
  return { restricted: false, tone: "ok", short: "Boards fine",
           text: hour < GUARD_ON
             ? "Towers do not open until " + GUARD_ON + ":00 — the dawn window is all yours."
             : "Towers are shut for the day. Boards are fine." };
}

/* ─────────────────────────── rip current risk ───────────────────────────
   Not a forecast product anyone publishes for this coast, so this is an
   explicit rule of thumb from the things that actually drive rips here:
   how much water the swell is pushing onto the bank, whether the tide is
   low enough to force it out through a channel, and onshore wind piling
   more water in. Stated as a rule of thumb, not as a measurement. */
function ripRisk(spot, sc) {
  var hs = sc.localHs || 0;
  /* A rip is water the swell put on the beach trying to get back out. With
     no swell there is nothing to get back out, whatever the beach's
     reputation or the state of the tide. */
  if (hs < 0.35) {
    return { level: 0, label: "Low", advice: "",
             why: "there is barely any swell — nothing is moving enough water to form a rip" };
  }
  var r = 0, why = [];
  /* Everything else scales with how much water is actually arriving. */
  var scale = clamp((hs - 0.35) / 0.85, 0.25, 1);
  if (hs > 0.5) { r += clamp((hs - 0.5) * 1.6, 0, 3); why.push(mtr(hs) + " of swell is pushing water up the beach"); }
  if (spot.shore && sc.tide.t < 0.35) { r += 0.8 * scale; why.push("the tide is low enough to drain it back out through the channels"); }
  if (sc.windDir != null && sc.wind != null) {
    var onshore = -Math.cos(angDiff(sc.windDir, spot.off) * Math.PI / 180);
    if (onshore > 0.3 && sc.wind > 12) { r += 0.7 * scale; why.push("the onshore wind is stacking more water inshore"); }
  }
  if (/rip|current/i.test((spot.hazards || []).join(" "))) { r += 0.6 * scale; why.push("this beach has a name for rips"); }
  if (sc.tp && sc.tp >= 11) { r += 0.4 * scale; why.push("long-period swell moves a lot of water"); }
  var level = r < 1.1 ? 0 : r < 2.3 ? 1 : 2;
  return {
    level: level, label: ["Low", "Moderate", "High"][level],
    why: why.length ? why.join("; ") : "small, clean and slack — nothing much is moving",
    advice: level === 2
      ? "Pick a landmark on the beach and check it often. If you get taken, go sideways along the beach before you go in."
      : level === 1 ? "Worth knowing where the channel is before you paddle out." : ""
  };
}

/* The best unbroken run of a single day at a single spot. Shared by the week
   list and the day timeline so the two can never disagree about the window. */
function dayWindowFor(entry, date, allow) {
  var byHour = {}, peak = null;
  var ok = function (r) { return r && !r.dark && (!allow || allow(r)); };
  entry.rows.forEach(function (r) {
    if (r.date !== date) return;
    byHour[r.hour] = r;
    if (ok(r) && (!peak || r.score > peak.score)) peak = r;
  });
  if (!peak) return null;
  var floorScore = Math.max(peak.score - 12, peak.score * 0.72);
  var holds = function (h) { var r = byHour[h]; return ok(r) && r.score >= floorScore; };
  var from = peak.hour, to = peak.hour;
  while (from - 1 >= peak.hour - 6 && holds(from - 1)) from--;
  while (to + 1 <= peak.hour + 6 && holds(to + 1)) to++;
  return { peak: peak, from: from, to: to };
}

/* ───────────────────── the week, one row per day ─────────────────────
   The old "next windows" list went empty on a flat week, which is exactly
   when you most want to know which day is least bad. This always returns
   all seven days, ranked within each day. */
function weekOutlook() {
  var entries = spotsInRange();
  return S.model.days.map(function (date) {
    var best = null, byBlock = { dawn: null, mid: null, eve: null };
    entries.forEach(function (e) {
      e.rows.forEach(function (r) {
        if (r.date !== date || r.dark) return;
        if (!best || r.score > best.row.score) best = { entry: e, row: r };
        var b = r.hour < 11 ? "dawn" : r.hour < 17 ? "mid" : "eve";
        if (!byBlock[b] || r.score > byBlock[b].row.score) byBlock[b] = { entry: e, row: r };
      });
    });
    if (!best) return { date: date, empty: true };
    var run = dayWindowFor(best.entry, date) || { from: best.row.hour, to: best.row.hour };
    return {
      date: date, best: best, run: run, blocks: byBlock,
      conf: confidenceOf(best.row, best.row.key)
    };
  });
}

/* ── one day, written out ───────────────────────────────────────────────
   The week list used to be a single line per day. It now opens into the
   whole day: the date in full, why that hour and not another, the weather
   you will actually be standing in, and the tide. */
var WD_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var MO_FULL = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"];
function fullDate(iso) {
  var p = iso.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return WD_FULL[d.getUTCDay()] + " " + (+p[2]) + " " + MO_FULL[+p[1] - 1];
}

/* Why this hour on this day, in one sentence, from the numbers. */
function dayWhy(d) {
  var r = d.best.row, sp = d.best.entry.spot;
  var rows = d.best.entry.rows.filter(function (x) { return x.date === d.date && !x.dark; });
  var bits = [];
  var winds = rows.map(function (x) { return x.wind; }).filter(function (v) { return v != null; });
  if (r.wind != null && winds.length && r.wind <= Math.min.apply(null, winds) + 2) {
    bits.push("the wind is at its lightest");
  } else if (r.wind != null && r.windDir != null && angDiff(r.windDir, sp.off) < 55) {
    bits.push("the wind is offshore");
  }
  if (r.parts.tide >= 65) bits.push("the tide is where this beach wants it");
  if (r.parts.size >= 70) bits.push("there is enough size in the water");
  if (r.parts.period >= 70) bits.push("the swell has real period behind it");
  var law = boardRule(sp, d.date, r.hour);
  if (sp.bb.status === "seasonal" && inBathingSeason(d.date) && r.hour < GUARD_ON) {
    bits.push("and you are in before the towers open");
  }
  if (!bits.length) bits.push("it is simply the best of a quiet day");
  var s = bits.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

function dayRowHtml(d) {
  if (d.empty) {
    return '<div class="day day-none"><b>' + esc(dayLabel(d.date)) + '</b> <span>no data</span></div>';
  }
  var r = d.best.row, sp = d.best.entry.spot, col = scoreCell(r.score);
  var range = d.run.from === d.run.to ? hhmm(d.run.from) : hhmm(d.run.from) + "–" + hhmm(d.run.to + 1);
  var isToday = d.date === madridToday();
  var tk = tideKind(d.best.entry, d.date);
  var tides = tidesOn(d.best.entry, d.date);

  var chip = function (k, v) { return v ? '<span><em>' + esc(k) + '</em>' + esc(v) + '</span>' : ""; };

  return '<details class="day' + (r.score >= S.bar ? " day-hit" : "") + '"' + (isToday ? " open" : "") + '>' +
    '<summary>' +
      '<span class="day-score" style="background:' + col.bg + ';color:' + col.ink + '">' + r.score + '</span>' +
      '<span class="day-main"><b>' + esc(dayLabel(d.date)) + ' · ' + range + '</b>' +
      '<span>' + esc(sp.name) + ' · ' + mtr(r.localHs) + ' · ' + esc(windLabel(r, sp)) + '</span></span>' +
      '<span class="day-tag">' + band(r.score).word +
        '<em class="c' + d.conf.level + '">' + d.conf.label.toLowerCase() + '</em></span>' +
    '</summary>' +
    '<div class="day-body">' +
      '<p class="day-date">' + esc(fullDate(d.date)) + '</p>' +
      '<p class="day-why"><b>Why then:</b> ' + esc(dayWhy(d)) + ' Peak hour is ' + hhmm(r.hour) + '.</p>' +
      '<div class="day-facts">' +
        chip("wave", mtr(r.localHs)) +
        chip("period", r.tp == null ? "" : Math.round(r.tp) + " s") +
        chip("swell", r.swellDir == null ? "" : "from " + compass(r.swellDir)) +
        chip("wind", r.wind == null ? "" : Math.round(r.wind) + " kn " + compass(r.windDir) +
          (r.gust ? " (gusts " + Math.round(r.gust) + ")" : "")) +
        chip("water", r.sst == null ? "" : r1(r.sst) + " °C") +
        chip("air", r.airT == null ? "" : Math.round(r.airT) + " °C" +
          (r.feelsT != null ? ", feels " + Math.round(r.feelsT) : "")) +
        chip("sky", cloudWord(r) + (r.rainP ? " · " + r.rainP + "% rain" : "")) +
        chip("uv", r.uv == null ? "" : String(Math.round(r.uv))) +
        chip("light", hhmm(Math.floor(r.sun.up / 60)) + "–" + hhmm(Math.floor(r.sun.down / 60))) +
      '</div>' +
      (tides.length
        ? '<p class="day-tide"><b>Tide:</b> ' + tides.map(function (t) {
            return (t.type === "high" ? "▲" : "▼") + " " + t.at;
          }).join(" · ") +
          (tk ? ' — ' + esc(tk.kind === "spring" ? "a spring tide, big range (" + r1(tk.range) + " m), so the water moves fast"
               : tk.kind === "neap" ? "a neap tide, small range (" + r1(tk.range) + " m), so it changes slowly"
               : "an average range (" + r1(tk.range) + " m)") + ', ' + esc(tk.moon) : '') +
          '</p>'
        : '') +
      '<p class="day-wear"><b>Wear:</b> ' + esc(suitFor(r.sst).suit) + '</p>' +
      '<button class="btn dayopen" data-spot="' + esc(sp.id) + '" data-key="' + esc(r.key) + '">' +
        'Open ' + esc(dayLabel(d.date)) + ' at ' + esc(sp.name) + '</button>' +
    '</div>' +
  '</details>';
}

/* ═══════════════════════════════ state ═══════════════════════════════ */

var S = {
  model: null,
  spotId: null,        /* null = "pick the best one for me" */
  maxDrive: 999,
  view: "now",
  sel: null,           /* {spotId, key} chosen from the grid or chart */
  filters: { boards: false, beginner: false, freePark: false, noRocks: false },
  plan: null,          /* the last "just tell me" answer, kept across re-renders */
  bar: 62,             /* the score you personally think is worth the drive */
  me: null,            /* {lat, lon} once you ask for "nearest to me" */
  sortBy: "score",     /* score | near */
  origin: "town",      /* town | base | me — what the drive times are measured from */
  when: "any",         /* which part of the day to plan for */
  gear: { fins: true, suit: "full" },   /* what you actually own */
  err: null
};

/* ── where you are driving from ──────────────────────────────────────────
   The drive times in data.js are hand-written from Rota town. Rather than
   throw those away for a new starting point, only the difference is applied:
   1.15 minutes per straight-line kilometre, fitted against those same
   seventeen figures. The town stays exact and everything else shifts by a
   couple of minutes, which is the honest size of the effect. */
var ROTA_TOWN = { lat: 36.6247, lon: -6.3606 };
var MIN_PER_KM = 1.154;
var ORIGINS = [
  { id: "town", label: "from Rota town", short: "Rota town", lat: 36.6247, lon: -6.3606 },
  { id: "base", label: "from the naval station", short: "the base", lat: 36.6290, lon: -6.3400 },
  { id: "me",   label: "from where I am", short: "you" }
];
function originPoint() {
  if (S.origin === "me") return S.me;
  var o = ORIGINS.filter(function (x) { return x.id === S.origin; })[0];
  return o && o.lat != null ? o : null;
}
function originLabel() {
  var o = ORIGINS.filter(function (x) { return x.id === S.origin; })[0];
  return o ? o.short : "Rota";
}
function driveMin(spot) {
  var o = originPoint();
  if (!o || S.origin === "town") return spot.drive;
  var fromTown = haversineKm(ROTA_TOWN.lat, ROTA_TOWN.lon, spot.lat, spot.lon);
  var fromHere = haversineKm(o.lat, o.lon, spot.lat, spot.lon);
  return Math.max(3, Math.round(spot.drive + MIN_PER_KM * (fromHere - fromTown)));
}

/* ── when you want to go ── */
var WHEN_OPTS = [
  { id: "any",  label: "any time of day" },
  { id: "dawn", label: "dawn patrol",  test: function (r) { return r.hour * 60 <= r.sun.up + 150; } },
  { id: "am",   label: "morning",      test: function (r) { return r.hour >= 9 && r.hour < 12; } },
  { id: "pm",   label: "afternoon",    test: function (r) { return r.hour >= 12 && r.hour < 17; } },
  { id: "eve",  label: "evening",      test: function (r) { return r.hour >= 17; } }
];
function whenTest() {
  var o = WHEN_OPTS.filter(function (x) { return x.id === S.when; })[0];
  return (o && o.test) || null;
}

/* ── what you actually own ──────────────────────────────────────────────
   Advice you cannot act on is not advice: if you have no wetsuit there is no
   point being sent to 16 °C water, and without fins you will not get out the
   back of anything with size or current in it. */
var SUIT_RANK = { none: 0, shorty: 1, full: 2 };
var SUIT_OPTS = [
  { id: "full",   label: "a full wetsuit" },
  { id: "shorty", label: "a shorty only" },
  { id: "none",   label: "no wetsuit" }
];
function suitNeeded(sst) {
  if (sst == null) return "full";
  return sst >= 22 ? "none" : sst >= 19 ? "shorty" : "full";
}
function gearGap(sc, spot) {
  var out = [];
  var need = suitNeeded(sc.sst);
  if (SUIT_RANK[S.gear.suit] < SUIT_RANK[need]) {
    out.push({
      k: "suit",
      t: sc.sst == null ? "The water wants a wetsuit you have not got."
        : "At " + r1(sc.sst) + " °C you want " + (need === "full" ? "a full suit" : "at least a shorty") +
          ", and you said " + (S.gear.suit === "none" ? "no wetsuit" : "a shorty") +
          ". Expect a short session and be honest about when you start shivering."
    });
  }
  if (!S.gear.fins) {
    var ripL = ripRisk(spot, sc).level;
    if (sc.localHs >= 0.9 || ripL >= 1) {
      out.push({
        k: "fins",
        t: "Without fins you will struggle to get out past " + mtr(sc.localHs) +
           (ripL >= 1 ? " with a rip running" : "") + ", and you will catch far fewer waves. Fins are the engine on a sponge."
      });
    }
  }
  return out;
}
var BAR_OPTS = [
  { v: 46, label: "anything rideable" },
  { v: 62, label: "worth the drive" },
  { v: 78, label: "only the good days" }
];
try {
  var savedBar = +localStorage.getItem("rotasurf.bar");
  if (savedBar) S.bar = savedBar;
} catch (e) { /* private mode */ }

/* Does this spot pass the chips in the Spots view? */
function passesFilters(spot, date, hour) {
  var f = S.filters;
  if (f.boards && boardRule(spot, date, hour).restricted) return false;
  if (f.beginner && !(spot.level === "beginner" || spot.level === "all")) return false;
  /* An explicit flag, not a search for the word "free" in the prose — the
     blue-zone beaches describe a free window inside a paid scheme. */
  if (f.freePark && spot.park.free !== true) return false;
  if (f.noRocks && /rock|reef|coral/i.test((spot.bottom || "") + " " + (spot.type || ""))) return false;
  return true;
}

function spotsInRange() {
  return S.model.spots.filter(function (e) { return driveMin(e.spot) <= S.maxDrive; });
}
function rowAt(entry, key) { return entry.byKey[key]; }
function nowKey() {
  var k = madridNowKey();
  if (!S.model || !S.model.hours.length) return k;
  var H = S.model.hours;
  if (H.indexOf(k) >= 0) return k;
  /* Outside the series — clamp to the nearest hour we actually hold, rather
     than silently showing the first hour of a cached forecast as "now". */
  for (var i = 0; i < H.length; i++) if (H[i] >= k) return H[i];
  return H[H.length - 1];
}
/* Best spot at a given hour, within the drive filter. */
function bestAt(key) {
  var best = null;
  spotsInRange().forEach(function (e) {
    var r = rowAt(e, key);
    if (!r) return;
    if (!best || r.score > best.row.score) best = { entry: e, row: r };
  });
  return best;
}
function currentPick() {
  var key = (S.sel && S.sel.key) || nowKey();
  if (S.spotId) {
    var e = S.model.spots.filter(function (x) { return x.spot.id === S.spotId; })[0];
    if (e && rowAt(e, key)) return { entry: e, row: rowAt(e, key), key: key };
  }
  var b = bestAt(key);
  return b ? { entry: b.entry, row: b.row, key: key } : null;
}

/* ═════════════════════ the animated wave illustration ═════════════════════
   A side-on slice of the sea drawn from the live numbers: the swell height
   sets the amplitude, the period sets how far apart the crests are and how
   fast they roll in, the depth profile makes them stand up and break near
   the beach, and the wind arrows blow the right way. The figure is 1.75 m,
   so you can read the wave size against a person. Heights are to scale
   against that figure; the horizontal axis is compressed, as on any wave
   diagram, or a 9-second swell would be 126 m from crest to crest.        */

var waveAnim = { raf: 0, t0: 0, running: false };

function drawWave(cv, sc, spot) {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  var g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);

  var cs = getComputedStyle(document.documentElement);
  var C = function (n, f) { var v = cs.getPropertyValue(n).trim(); return v || f; };
  var sea = C("--sea", "#1B7FA3"), seaD = C("--sea-deep", "#0A4761"),
      foam = C("--foam", "#ffffff"), sky1 = C("--sky-1", "#B9DFF0"), sky2 = C("--sky-2", "#EEF7FB"),
      sand = C("--sand", "#E4D2AE"), inkc = C("--ink", "#0A1E29"), amber = C("--amber-b", "#D98C1F");

  var hs = Math.max(sc.localHs || 0, 0.02);
  var tp = clamp(sc.tp || 8, 4, 20);
  var t = (performance.now() - waveAnim.t0) / 1000;

  /* ── bands ──────────────────────────────────────────────────────────
     Fixed horizontal bands, so nothing ever lands on top of anything else:
     a caption strip, then sky, then sea. The old version put a sun through
     the middle of the text.                                              */
  var capH    = 30;                                  /* caption only */
  var horizon = Math.round(capH + (H - capH) * 0.20);
  var baseY   = Math.round(H * 0.90);                /* the wave sits on this */
  var shoreY  = baseY + 6;

  /* The wave is the subject, so it is always framed to fill the picture —
     a 0.3 m wave drawn honestly against a person is an invisible ripple and
     tells you nothing. The ruler on the left carries the real scale instead,
     the way a scale bar does on a micrograph. */
  var faceH = (baseY - horizon) * 0.46;
  var pxM   = faceH / hs;
  var flatish = hs < 0.18;

  /* ── sky ── */
  var sg = g.createLinearGradient(0, capH, 0, horizon + 6);
  sg.addColorStop(0, sky1); sg.addColorStop(1, sky2);
  g.fillStyle = sg; g.fillRect(0, 0, W, horizon + 6);

  /* sun, kept to the right half so it can never reach the caption */
  var mins = sc.hour * 60, up = sc.sun.up, down = sc.sun.down;
  if (mins >= up - 40 && mins <= down + 40) {
    var f = clamp((mins - up) / Math.max(60, down - up), 0, 1);
    var sx = W * (0.52 + f * 0.40);
    var sy = capH + 6 + (1 - Math.sin(f * Math.PI)) * (horizon - capH - 16);
    g.beginPath(); g.arc(sx, sy, 11, 0, 6.283);
    g.fillStyle = amber; g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1;
  }

  /* cloud */
  var cover = clamp((sc.cloud == null ? 20 : sc.cloud) / 100, 0, 1);
  if (cover > 0.15) {
    g.fillStyle = foam; g.globalAlpha = 0.2 + cover * 0.45;
    for (var ci = 0; ci < Math.round(cover * 4) + 1; ci++) {
      var cx = ((ci * 149 + t * 2.5) % (W + 200)) - 100;
      var cy = capH + 8 + (ci % 2) * 14;
      g.beginPath();
      g.ellipse(cx, cy, 34 + (ci % 3) * 20, 7 + (ci % 2) * 3, 0, 0, 6.283);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  /* ── sea ── */
  var og = g.createLinearGradient(0, horizon, 0, H);
  og.addColorStop(0, seaD); og.addColorStop(1, sea);
  g.fillStyle = og; g.fillRect(0, horizon, W, H - horizon);

  /* distant swell lines */
  g.strokeStyle = foam; g.lineWidth = 1;
  for (var q = 0; q < 3; q++) {
    var qy = horizon + (baseY - horizon) * (0.09 + q * 0.11);
    var drift = ((t * (5 + q * 4)) % 110) - 55;
    g.globalAlpha = 0.09 + q * 0.04;
    g.beginPath();
    for (var qx = -60; qx <= W; qx += 7) {
      g.lineTo(qx, qy + Math.sin((qx + drift) / (38 + q * 12)) * (0.9 + q * 0.6));
    }
    g.stroke();
  }
  g.globalAlpha = 1;

  /* ── the wave ── */
  if (flatish) {
    /* Nothing worth drawing a wave for — say so rather than invent one. */
    g.strokeStyle = foam; g.globalAlpha = 0.28; g.lineWidth = 1.4;
    for (var fi = 0; fi < 3; fi++) {
      var fy = baseY - 16 + fi * 11;
      g.beginPath();
      for (var fx = 0; fx <= W; fx += 6) {
        g.lineTo(fx, fy + Math.sin((fx + t * 16 + fi * 30) / 24) * 1.6);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  } else {
    /* One continuous sea surface with a peak travelling through it, rather
       than a wave-shaped object floating on a flat plane. Nothing can drift
       off the edge and leave a hard wedge behind, and the water always joins
       up with itself. */
    var cycle = tp * 0.85;
    var phase = (t % cycle) / cycle;
    var wx = W * 1.10 - phase * (W * 0.92);        /* crest stays on screen */
    var steep = clamp(phase * 1.35, 0, 1);
    /* Height is fixed at the forecast height so the crest always meets the
       mark on the ruler; it is the shape that changes as it comes in, not
       the size. A wave that grew and shrank under a fixed scale bar would
       be lying about the one number the picture exists to convey. */
    var h = faceH;
    var width = h * 2.4 + 46;

    /* the profile: a gaussian peak, squeezed on the shoreward side so the
       face is steep and the back is a long shoulder, like a real wave */
    var surface = function (x) {
      var d = (x - wx) / width;
      var k = d < 0 ? d * (1.35 + steep * 0.9) : d;
      return baseY - h * Math.exp(-k * k * 1.9);
    };

    g.beginPath();
    g.moveTo(-4, surface(-4));
    for (var sx = -4; sx <= W + 4; sx += 3) g.lineTo(sx, surface(sx));
    g.lineTo(W + 4, H); g.lineTo(-4, H); g.closePath();
    var wg = g.createLinearGradient(0, baseY - h, 0, H);
    wg.addColorStop(0, sea); wg.addColorStop(0.5, sea); wg.addColorStop(1, seaD);
    g.fillStyle = wg; g.fill();

    /* a soft highlight running down the face */
    g.beginPath();
    for (var hx = wx - width * 1.1; hx <= wx + width * 0.2; hx += 3) g.lineTo(hx, surface(hx) + h * 0.16);
    g.strokeStyle = foam; g.globalAlpha = 0.09; g.lineWidth = Math.max(2, h * 0.11);
    g.lineCap = "round"; g.stroke(); g.globalAlpha = 1;

    /* the crest line, brightening as it stands up */
    g.beginPath();
    for (var cx2 = wx - width * 0.9; cx2 <= wx + width * 0.9; cx2 += 3) g.lineTo(cx2, surface(cx2));
    g.strokeStyle = foam; g.globalAlpha = 0.22 + steep * 0.35;
    g.lineWidth = 1.3 + steep * 1.1; g.stroke(); g.globalAlpha = 1;

    /* the lip throwing forward once it is genuinely breaking */
    if (steep > 0.45) {
      var fa = clamp((steep - 0.45) / 0.55, 0, 1);
      var ly = surface(wx);
      g.strokeStyle = foam; g.lineCap = "round";
      g.globalAlpha = 0.95 * fa; g.lineWidth = Math.max(2, h * 0.10);
      g.beginPath();
      g.moveTo(wx + width * 0.10, ly + h * 0.04);
      g.quadraticCurveTo(wx - width * 0.16, ly - h * 0.05, wx - width * 0.34, ly + h * 0.30);
      g.stroke();

      g.fillStyle = foam;
      g.globalAlpha = 0.38 * fa;
      g.beginPath();
      g.ellipse(wx - width * 0.30, ly + h * 0.46, width * 0.17, h * 0.17, 0, 0, 6.283);
      g.fill();
      g.globalAlpha = 1;
    }
  }

  /* ── the scale ruler: what actually tells you the size ── */
  drawRuler(g, 16, baseY, pxM, hs, inkc, foam);

  /* ── caption strip, its own band, nothing else allowed in it ── */
  g.fillStyle = C("--panel", "#fff");
  g.globalAlpha = 0.0; g.fillRect(0, 0, W, capH); g.globalAlpha = 1;
  g.textAlign = "left";
  g.font = '600 12.5px "IBM Plex Sans", system-ui, sans-serif';
  g.fillStyle = inkc;
  g.fillText(flatish ? "Flat" : mtr(hs), 14, 19);
  g.font = '400 11px "IBM Plex Sans", system-ui, sans-serif';
  g.globalAlpha = 0.62;
  var cap = (sc.tp ? Math.round(sc.tp) + " s apart" : "");
  if (sc.wind != null && sc.windDir != null) {
    var offness = Math.cos(angDiff(sc.windDir, spot.off) * Math.PI / 180);
    cap += (cap ? "   ·   " : "") + Math.round(sc.wind) + " kn " +
      (offness > 0.28 ? "offshore" : offness < -0.28 ? "onshore" : "cross-shore");
  }
  g.fillText(cap, 14 + g.measureText(flatish ? "Flat" : mtr(hs)).width + 46, 19);
  g.globalAlpha = 1;

  /* wind arrow, far right of the caption strip */
  if (sc.wind != null && sc.windDir != null) {
    var dir = Math.cos(angDiff(sc.windDir, spot.off) * Math.PI / 180) > 0 ? -1 : 1;
    var ax = W - 30, ay = 15;
    g.strokeStyle = inkc; g.globalAlpha = 0.45; g.lineWidth = 1.5; g.lineCap = "round";
    g.beginPath();
    g.moveTo(ax - dir * 13, ay); g.lineTo(ax + dir * 13, ay);
    g.moveTo(ax + dir * 13, ay); g.lineTo(ax + dir * 7, ay - 4);
    g.moveTo(ax + dir * 13, ay); g.lineTo(ax + dir * 7, ay + 4);
    g.stroke(); g.globalAlpha = 1;
  }
}

/* A proper scale bar. It carries the real size, so the wave itself can be
   drawn big enough to see whatever the forecast says. The ruler runs from the
   trough to the crest and is labelled at the top, which is the one number
   that ties the picture to the forecast. */
function drawRuler(g, x, baseY, pxM, hs, ink, foam) {
  var topY = baseY - hs * pxM;
  /* a tick roughly every 25-40 px, rounded to something a person would say */
  var raw = (baseY - topY) / 4 / pxM;
  var nice = [0.1, 0.25, 0.5, 1, 2];
  var step = nice[nice.length - 1];
  for (var i = 0; i < nice.length; i++) { if (raw <= nice[i]) { step = nice[i]; break; } }

  g.save();
  g.lineCap = "butt";
  g.strokeStyle = ink; g.globalAlpha = 0.34; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x, baseY); g.lineTo(x, topY); g.stroke();

  for (var v = step; v < hs - 0.001; v += step) {
    var y = baseY - v * pxM;
    g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y); g.stroke();
  }
  /* foot */
  g.beginPath(); g.moveTo(x - 5, baseY); g.lineTo(x + 5, baseY); g.stroke();

  /* the crest, called out */
  g.globalAlpha = 0.95; g.strokeStyle = foam; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - 6, topY); g.lineTo(x + 6, topY); g.stroke();
  g.font = '600 10px ui-monospace, "IBM Plex Mono", monospace';
  g.textAlign = "left";
  g.fillStyle = foam; g.globalAlpha = 0.95;
  g.fillText(mtr(hs), x + 10, topY + 3.5);
  g.restore();
}

function startWaveLoop() {
  var cv = $("#waveCv");
  if (!cv) return;
  waveAnim.t0 = waveAnim.t0 || performance.now();
  cancelAnimationFrame(waveAnim.raf);
  var tick = function () {
    if (document.hidden || S.view !== "now" || !document.body.contains(cv)) {
      waveAnim.raf = requestAnimationFrame(tick); return;
    }
    var p = currentPick();
    if (p) drawWave(cv, p.row, p.entry.spot);
    waveAnim.raf = requestAnimationFrame(tick);
  };
  waveAnim.raf = requestAnimationFrame(tick);
}

/* ═══════════════════════════ the day, on a bar ═══════════════════════════
   One line for the whole day: when there is light, when the lifeguard towers
   make the buoyed zone off limits to boards, and where the good hours fall.
   In summer those three things interact — the answer is usually "go at first
   light" — and seeing them stacked makes that obvious without explanation. */
function dayTimeline(entry, spot, date, sun) {
  var W = 720, H = 54, y = 14, h = 15;
  var x = function (min) { return clamp(min, 0, 1440) / 1440 * W; };
  var tw = twilightMinutes(date, spot.lat);
  var win = dayWindowFor(entry, date);
  var seasonal = spot.bb && spot.bb.status === "seasonal" && inBathingSeason(date);
  var o = [];

  o.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="tl" preserveAspectRatio="none" role="img" ' +
    'aria-label="Daylight, lifeguard hours and the best window for ' + esc(date) + '">');
  o.push('<rect x="0" y="' + y + '" width="' + W + '" height="' + h + '" class="tl-night"/>');
  o.push('<rect x="' + r1(x(sun.up - tw)) + '" y="' + y + '" width="' + r1(x(sun.up) - x(sun.up - tw)) + '" height="' + h + '" class="tl-tw"/>');
  o.push('<rect x="' + r1(x(sun.down)) + '" y="' + y + '" width="' + r1(x(sun.down + tw) - x(sun.down)) + '" height="' + h + '" class="tl-tw"/>');
  o.push('<rect x="' + r1(x(sun.up)) + '" y="' + y + '" width="' + r1(x(sun.down) - x(sun.up)) + '" height="' + h + '" class="tl-day"/>');

  if (seasonal) {
    o.push('<rect x="' + r1(x(GUARD_ON * 60)) + '" y="' + y + '" width="' +
      r1(x(GUARD_OFF * 60) - x(GUARD_ON * 60)) + '" height="' + h + '" class="tl-guard"/>');
  }
  if (win) {
    var col = scoreSolid(win.peak.score);
    o.push('<rect x="' + r1(x(win.from * 60)) + '" y="' + (y + h + 5) + '" width="' +
      r1(Math.max(4, x((win.to + 1) * 60) - x(win.from * 60))) + '" height="7" rx="3" fill="' + col.bg + '"/>');
  }
  [0, 6, 12, 18, 24].forEach(function (hh) {
    o.push('<line x1="' + r1(x(hh * 60)) + '" y1="' + (y - 3) + '" x2="' + r1(x(hh * 60)) + '" y2="' + (y + h + 3) + '" class="tl-tick"/>');
    if (hh > 0 && hh < 24) o.push('<text x="' + r1(x(hh * 60)) + '" y="' + (y - 5) + '" class="tl-lbl">' + pad(hh) + '</text>');
  });
  if (date === madridToday()) {
    var mins = +MTIME.format(new Date()).slice(0, 2) * 60 + +MTIME.format(new Date()).slice(3, 5);
    o.push('<line x1="' + r1(x(mins)) + '" y1="' + (y - 6) + '" x2="' + r1(x(mins)) + '" y2="' + (y + h + 12) + '" class="tl-now"/>');
  }
  o.push('</svg>');

  var t = function (min) { return pad(Math.floor(min / 60) % 24) + ":" + pad(Math.round(min) % 60); };
  var legend =
    '<div class="tl-key">' +
      '<span><i class="tl-k-tw"></i>first light ' + t(sun.up - tw) + '</span>' +
      '<span><i class="tl-k-day"></i>sun ' + t(sun.up) + '–' + t(sun.down) + '</span>' +
      '<span><i class="tl-k-tw"></i>last light ' + t(sun.down + tw) + '</span>' +
      (seasonal ? '<span><i class="tl-k-guard"></i>towers ' + pad(GUARD_ON) + ':00–' + pad(GUARD_OFF) + ':00, no boards in the zone</span>' : "") +
      (win ? '<span><i class="tl-k-win" style="background:' + scoreSolid(win.peak.score).bg + '"></i>best ' +
        hhmm(win.from) + '–' + hhmm(win.to + 1) + '</span>' : "") +
    '</div>';

  var advice = "";
  if (seasonal && win && win.from < GUARD_OFF && win.to >= GUARD_ON) {
    var dawn = Math.max(Math.ceil((sun.up - tw) / 60), 0);
    advice = '<p class="foot">The good hours overlap the lifeguard shift, so either start at first light and be out by ' +
      pad(GUARD_ON) + ':00, or walk past the buoys. There is usually ' +
      Math.max(0, GUARD_ON - dawn) + ' h of light before the towers open.</p>';
  }
  return '<div class="tlwrap">' + o.join("") + legend + advice + '</div>';
}

/* ════════════════════════ swell / wind compass ════════════════════════ */
function compassSVG(sc, spot) {
  var R = 54, C0 = 60;
  var pol = function (deg, r) {
    var a = (deg - 90) * Math.PI / 180;
    return [C0 + Math.cos(a) * r, C0 + Math.sin(a) * r];
  };
  /* the arc of swell directions that actually reach this beach */
  var a0 = pol(spot.win[0], R - 4), a1 = pol(spot.win[1], R - 4);
  var span = ((spot.win[1] - spot.win[0]) % 360 + 360) % 360;
  var wedge = "M " + C0 + " " + C0 + " L " + r1(a0[0]) + " " + r1(a0[1]) +
    " A " + (R - 4) + " " + (R - 4) + " 0 " + (span > 180 ? 1 : 0) + " 1 " + r1(a1[0]) + " " + r1(a1[1]) + " Z";

  function arrow(deg, len, cls, head) {
    var tip = pol(deg + 180, head ? 0 : len);          /* comes FROM deg → points inward */
    var tail = pol(deg, len);
    return '<line x1="' + r1(tail[0]) + '" y1="' + r1(tail[1]) + '" x2="' + r1(tip[0]) + '" y2="' + r1(tip[1]) +
      '" class="' + cls + '" marker-end="url(#ah)"/>';
  }
  var sd = sc.swellDir == null ? null : sc.swellDir;
  var wd = sc.windDir == null ? null : sc.windDir;
  var face = pol(spot.face, R);

  return '<svg viewBox="0 0 120 120" class="compass" role="img" aria-label="Swell and wind directions relative to the beach">' +
    '<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">' +
    '<path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/></marker></defs>' +
    '<path d="' + wedge + '" class="cwin"/>' +
    '<circle cx="60" cy="60" r="' + R + '" class="cring"/>' +
    '<line x1="60" y1="60" x2="' + r1(face[0]) + '" y2="' + r1(face[1]) + '" class="cface"/>' +
    (sd != null ? arrow(sd, R - 8, "cswell") : "") +
    (wd != null ? arrow(wd, R - 20, "cwind") : "") +
    '<circle cx="60" cy="60" r="3" class="cdot"/>' +
    '<text x="60" y="12" class="clbl">N</text><text x="112" y="64" class="clbl">E</text>' +
    '<text x="60" y="116" class="clbl">S</text><text x="8" y="64" class="clbl">W</text>' +
    '</svg>';
}

/* ═════════════════════════════ shared bits ═════════════════════════════ */

function scoreAlpha(s) { return 0.06 + 0.94 * Math.pow(clamp(s, 0, 100) / 100, 1.25); }
function scoreCell(s) {
  var a = scoreAlpha(s);
  return { bg: "rgba(var(--heat) / " + r1(a) + ")", ink: a > 0.52 ? "var(--on-heat)" : "var(--ink)" };
}
/* The same ramp, flattened to an opaque colour. Map pins sit on satellite
   imagery rather than on the panel, so a translucent fill is unreadable. */
function hexRgb(h) {
  h = String(h).trim().replace("#", "");
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
}
function scoreSolid(s) {
  var cs = getComputedStyle(document.documentElement);
  var heat = cs.getPropertyValue("--heat").trim().split(/[\s,]+/).map(Number);
  var panel = hexRgb(cs.getPropertyValue("--panel"));
  if (heat.length < 3 || isNaN(heat[0])) heat = [16, 106, 133];
  var a = scoreAlpha(s);
  var rgb = [0, 1, 2].map(function (i) { return Math.round(heat[i] * a + panel[i] * (1 - a)); });
  var lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return { bg: "rgb(" + rgb.join(",") + ")", ink: lum > 0.55 ? "#0A1E29" : "#FFFFFF" };
}
function windLabel(sc, spot) {
  if (sc.wind == null || sc.windDir == null) return "—";
  var d = angDiff(sc.windDir, spot.off);
  var word = sc.wind < 4 ? "glassy" : d < 50 ? "offshore" : d < 78 ? "cross-off" : d < 112 ? "cross-shore" : d < 140 ? "cross-on" : "onshore";
  return Math.round(sc.wind) + " kn " + compass(sc.windDir) + " · " + word;
}
function cloudWord(sc) {
  if (sc.rain != null && sc.rain > 0.4) return "raining";
  if (sc.cloud == null) return "—";
  return sc.cloud < 15 ? "clear" : sc.cloud < 45 ? "mostly sunny"
       : sc.cloud < 75 ? "part cloud" : "overcast";
}
function visWord(sc) {
  if (sc.vis == null) return "—";
  var km = sc.vis / 1000;
  return km >= 10 ? "clear" : km >= 4 ? "hazy" : km >= 1 ? "poor" : "fog";
}
/* Pressure is not about today — it is the tell for what is coming. A low
   deepening out in the Atlantic arrives here as swell a few days later. */
function pressureWord(sc) {
  if (sc.pressure == null) return "";
  if (sc.pressure < 1005) return "low — unsettled, swell on the way";
  if (sc.pressure > 1022) return "high — settled and probably small";
  return "ordinary";
}

function tideLabel(st) {
  var t = st.t;
  var w = t < 0.2 ? "low" : t < 0.42 ? "low–mid" : t < 0.58 ? "mid" : t < 0.8 ? "mid–high" : "high";
  return w + ", " + (st.rising ? "rising" : "falling");
}
function loreFor(dir) {
  if (dir == null) return null;
  for (var i = 0; i < LORE.length; i++) {
    var L = LORE[i];
    if (inArc(dir, L.dir[0], L.dir[1])) return L;
  }
  return null;
}
function confBadge(c) {
  return '<span class="conf c' + c.level + '" title="' + esc(c.why) + '">' +
    '<i></i><i></i><i></i> ' + c.label + ' confidence</span>';
}

/* ════════════════════════════ view: NOW ════════════════════════════ */

function renderNow() {
  var host = $("#v-now"); host.innerHTML = "";
  renderPlanCard(host);
  renderLearnCard(host);
  renderHourCard(host);
  var pick = currentPick();
  if (!pick) { host.appendChild(el("p", "empty", "No forecast for this hour.")); return; }
  var sc = pick.row, spot = pick.entry.spot, b = band(sc.score);
  var conf = confidenceOf(sc, pick.key);
  var isNow = pick.key === nowKey();

  /* ── hero ── */
  var law = boardRule(spot, sc.date, sc.hour);
  var rip = ripRisk(spot, sc);
  /* When the card is showing "right now", a tide that already turned this
     hour is in the past — compare against the actual minute, not the hour. */
  var refMin = (!S.sel && pick.key === nowKey()) ? +MTIME.format(new Date()).slice(3, 5) : 0;
  var nx = nextTides(pick.entry, pick.key, 2, refMin);

  var hero = el("section", "card hero tone-" + b.tone);
  hero.innerHTML =
    '<div class="hero-top">' +
      '<div class="hero-when">' +
        '<span class="lbl">' + (isNow ? "right now" : dayLabel(sc.date) + " · " + hhmm(sc.hour)) + '</span>' +
        '<h2>' + esc(spot.name) + '</h2>' +
        '<p class="sub">' + esc(spot.town) + ' · ' + driveMin(spot) + ' min from ' + esc(originLabel()) +
          (S.spotId ? "" : ' · <b>best of ' + spotsInRange().length + ' spots</b>') + '</p>' +
      '</div>' +
      '<div class="hero-score"><b>' + sc.score + '</b><span>/100</span></div>' +
    '</div>' +
    '<p class="verdict"><b>' + b.word + '.</b> ' + esc(b.d) + '</p>' +
    '<div class="chips">' +
      '<span class="chip chip-' + law.tone + '">' + (law.restricted ? "✕" : "✓") + ' ' + esc(law.short) + '</span>' +
      '<span class="chip chip-rip' + rip.level + '">Rip risk ' + rip.label.toLowerCase() + '</span>' +
      (nx.length ? '<span class="chip">' + (nx[0].type === "high" ? "▲" : "▼") + ' ' +
        esc(nx[0].type) + ' tide ' + nx[0].at + '</span>' : "") +
      '<span class="chip">Water ' + (sc.sst == null ? "—" : r1(sc.sst) + " °C") + '</span>' +
    '</div>' +
    '<div class="wavebox"><canvas id="waveCv"></canvas></div>';
  host.appendChild(hero);

  /* ── the numbers ── */
  var stats = el("section", "card");
  var suit = suitFor(sc.sst);
  stats.innerHTML =
    '<div class="stats">' +
      stat("Wave", mtr(sc.localHs), "at the beach · " + mtr(sc.offshoreHs) + " offshore", "wave") +
      stat("Period", (sc.tp == null ? "—" : Math.round(sc.tp) + " s"), sc.tp >= 11 ? "groundswell — real power" : sc.tp >= 8 ? "decent push" : "short, weak chop", "period") +
      stat("Swell from", sc.swellDir == null ? "—" : compass(sc.swellDir) + " " + Math.round(sc.swellDir) + "°", sc.offBy > 0 ? Math.round(sc.offBy) + "° outside this beach's window" : "straight into the window", "wave") +
      stat("Wind", windLabel(sc, spot), sc.gust != null ? "gusting " + Math.round(sc.gust) + " kn" : "", "windangle") +
      stat("Water", sc.sst == null ? "—" : r1(sc.sst) + " °C", suit.suit, "water") +
      stat("Tide", tideLabel(sc.tide), nx.length
        ? nx.map(function (t) { return t.type + " " + t.at + " (" + (t.m >= 0 ? "+" : "") + r1(t.m) + " m)"; }).join(" · ")
        : r1(sc.tide.m) + " m", "tidestate") +
      stat("Air", sc.airT == null ? "—" : Math.round(sc.airT) + " °C",
        (sc.feelsT != null ? "feels like " + Math.round(sc.feelsT) + " °C" : "") +
        (sc.uv != null ? " · UV " + Math.round(sc.uv) : ""), "feels") +
      stat("Sky", cloudWord(sc), (sc.rainP ? sc.rainP + "% chance of rain" : "no rain expected"), "uv") +
      stat("Visibility", visWord(sc), sc.vis == null ? "" : Math.round(sc.vis / 1000) + " km — matters at dawn", "vis") +
      stat("Current", sc.curV == null ? "—" : r1(sc.curV) + " m/s",
        sc.curV == null ? "" : (sc.curV < 0.25 ? "you will not feel it" : "it will drift you along the beach") +
          (sc.curDir != null ? ", setting " + compass(sc.curDir) : ""), "current") +
      stat("Pressure", sc.pressure == null ? "—" : Math.round(sc.pressure) + " hPa", pressureWord(sc), "pressure") +
      stat("Daylight", hhmm(Math.floor(sc.sun.up / 60)) + "–" + hhmm(Math.floor(sc.sun.down / 60)), sc.dark ? "dark right now" : "", "light") +
    '</div>' +
    '<div class="statx" hidden></div>' +
    '<p class="foot stat-hint">Tap any of those to find out what it is and what today\'s number means.</p>' +
    '<div class="dialrow">' + compassSVG(sc, spot) +
      '<div class="diallegend">' +
        '<p><i class="k-swell"></i> swell in from ' + (sc.swellDir == null ? "—" : compass(sc.swellDir)) + '</p>' +
        '<p><i class="k-wind"></i> wind from ' + (sc.windDir == null ? "—" : compass(sc.windDir)) + '</p>' +
        '<p><i class="k-face"></i> beach faces ' + compass(spot.face) + '</p>' +
        '<p><i class="k-win"></i> swell window that reaches here</p>' +
      '</div>' +
    '</div>';
  host.appendChild(stats);
  wireStats(stats, sc, spot);

  /* ── why that score ── */
  var why = el("section", "card");
  var P = sc.parts;
  why.innerHTML = '<h3>Why ' + sc.score + '</h3>' +
    '<div class="bars">' +
      bar("Size", P.size, mtr(sc.localHs) + " vs a " + spot.best.min + "–" + spot.best.max + " m sweet spot") +
      bar("Wind", P.wind, windLabel(sc, spot)) +
      bar("Swell direction", P.dir, sc.offBy > 0 ? Math.round(sc.offBy) + "° off the window" : "inside the window") +
      bar("Period", P.period, (sc.tp == null ? "—" : Math.round(sc.tp) + " s") + " · needs " + spot.pmin + " s+") +
      bar("Tide", P.tide, tideLabel(sc.tide) + " · wants " + spot.tide) +
    '</div>' +
    '<p class="foot">' + confBadge(conf) + ' — ' + esc(conf.why) +
      (conf.lead > 0 ? ", " + conf.lead + " h ahead" : "") + '.</p>';
  host.appendChild(why);

  /* ── what the sea is actually made of ── */
  if (sc.swellH != null || sc.windWaveH != null) {
    var sea = el("section", "card");
    var swH = sc.swellH || 0, wwH = sc.windWaveH || 0, tot = Math.max(swH + wwH, 0.01);
    var read = swH >= wwH * 2 && (sc.swellT || 0) >= 10
      ? "Proper groundswell. Organised lines with real power behind them — this is what you want."
      : swH >= wwH * 1.3
        ? "Mostly swell, with some wind chop sitting on top of it. Workable."
        : wwH > swH
          ? "Mostly local wind chop rather than swell: short, disorganised and gutless. The wave height number flatters it."
          : "An even mix of swell and wind chop — bumpy, but there is something underneath.";
    sea.innerHTML = '<h3>What the sea is made of</h3>' +
      '<div class="mix"><span class="mix-sw" style="width:' + r1(swH / tot * 100) + '%"></span>' +
      '<span class="mix-ww" style="width:' + r1(wwH / tot * 100) + '%"></span></div>' +
      '<div class="mixkey">' +
        '<span><i class="mix-sw"></i>groundswell ' + r1(swH) + ' m' +
          (sc.swellT ? ' at ' + Math.round(sc.swellT) + ' s' : '') + '</span>' +
        '<span><i class="mix-ww"></i>wind chop ' + r1(wwH) + ' m' +
          (sc.windWaveT ? ' at ' + Math.round(sc.windWaveT) + ' s' : '') + '</span>' +
      '</div>' +
      '<p class="foot">' + esc(read) + '</p>';
    host.appendChild(sea);
  }

  /* ── the day on one bar ── */
  var tl = el("section", "card");
  tl.innerHTML = '<h3>' + esc(dayLabel(sc.date)) + ' at a glance</h3>' +
    dayTimeline(pick.entry, spot, sc.date, sc.sun);
  host.appendChild(tl);

  /* ── can I actually go in, and what is the water doing ── */
  var safety = el("section", "card");
  var dayTides = tidesOn(pick.entry, sc.date);
  safety.innerHTML = '<h3>Before you go in</h3>' +
    '<div class="law law-' + law.tone + '"><b>' + (law.restricted ? "Boards restricted right now" : "Boards are fine right now") + '</b>' +
      '<p>' + esc(law.text) + '</p></div>' +
    '<div class="law law-rip' + rip.level + '"><b>Rip risk ' + rip.label.toLowerCase() + '</b>' +
      '<p>' + esc(rip.why.charAt(0).toUpperCase() + rip.why.slice(1)) + '.' +
      (rip.advice ? " " + esc(rip.advice) : "") + '</p></div>' +
    (dayTides.length
      ? '<div class="tidetable"><span class="lbl">tides on ' + esc(dayLabel(sc.date)) + '</span><div class="tt">' +
        dayTides.map(function (t) {
          return '<span class="' + (t.type === "high" ? "tt-h" : "tt-l") + '">' +
            (t.type === "high" ? "▲" : "▼") + ' <b>' + t.at + '</b> <em>' +
            (t.m >= 0 ? "+" : "") + r1(t.m) + ' m</em></span>';
        }).join("") + '</div>' +
        '<p class="foot">Heights are against mean sea level, so a negative number is simply below the daily average — the gap between a high and the next low is the range that matters. This beach works best on the <b>' + esc(spot.tide) + '</b> tide.</p></div>'
      : "");
  host.appendChild(safety);

  /* ── the one thing the models cannot tell you ── */
  renderIntelCard(host, spot, sc);

  /* ── what to bring ── */
  var kit = kitFor(sc, spot);
  var gear = el("section", "card");
  gear.innerHTML = '<h3>What to bring</h3>' +
    '<div class="suit"><span class="suiticon">' + suit.icon + '</span><div><b>' + esc(suit.suit) + '</b>' +
      '<p>' + esc(suit.extra) + '</p>' +
      '<p class="foot">Water is ' + (sc.sst == null ? "—" : r1(sc.sst) + " °C") + ' right now.</p></div></div>' +
    '<ul class="kit">' + kit.map(function (k) {
      return '<li><b>' + esc(k.label) + '</b><span>' + esc(k.why) + '</span></li>';
    }).join("") + '</ul>';
  host.appendChild(gear);

  /* ── the wind story ── */
  var L = loreFor(sc.windDir);
  if (L) {
    var lore = el("section", "card lore " + (L.good ? "lore-good" : "lore-bad"));
    lore.innerHTML = '<h3>' + esc(L.t) + '</h3><p>' + esc(L.d) + '</p>';
    host.appendChild(lore);
  }

  /* ── the week, one row per day ── */
  var week = weekOutlook();
  var top = week.filter(function (d) { return !d.empty; })
    .reduce(function (a, d) { return !a || d.best.row.score > a.best.row.score ? d : a; }, null);
  var hits = week.filter(function (d) { return !d.empty && d.best.row.score >= S.bar; }).length;
  var nb = el("section", "card");
  nb.innerHTML = '<h3>The week ahead</h3>' +
    '<div class="barpick"><span class="lbl">my bar</span>' +
      '<select id="barSel" aria-label="What counts as worth going">' +
        BAR_OPTS.map(function (o) {
          return '<option value="' + o.v + '"' + (o.v === S.bar ? " selected" : "") + '>' + esc(o.label) + '</option>';
        }).join("") + '</select>' +
      '<b class="barhits' + (hits ? " on" : "") + '">' +
        (hits ? hits + (hits === 1 ? " day clears it" : " days clear it") : "nothing clears it") + '</b>' +
    '</div>' +
    '<p class="foot">' + (top && top.best.row.score >= 55
      ? "Pick of the week is <b>" + esc(dayLabel(top.date)) + "</b> at " + esc(top.best.entry.spot.name) +
        ". The score is the best single hour; the time range beside it is how long the day stays near that."
      : "Nothing outstanding in the next " + DAYS + " days — so these are the least-bad hours of each day, which is the thing worth knowing on a flat week.") + '</p>' +
    '<div class="days">' + week.map(dayRowHtml).join("") + '</div>';
  host.appendChild(nb);

  $("#barSel").addEventListener("change", function () {
    S.bar = +this.value || 62;
    try { localStorage.setItem("rotasurf.bar", String(S.bar)); } catch (e) {}
    render();
  });

  $$(".dayopen", nb).forEach(function (btn) {
    btn.addEventListener("click", function () {
      S.spotId = btn.getAttribute("data-spot");
      S.sel = { key: btn.getAttribute("data-key") };
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  /* ── share this exact call ── */
  var sh = el("section", "card");
  sh.innerHTML = '<h3>Send it to someone</h3>' +
    '<p class="foot">Copies a link straight to this beach at this hour, so whoever opens it lands on the same call rather than on today.</p>' +
    '<div class="shrow"><button id="shareBtn" class="btn">Copy link to this session</button>' +
    '<span class="foot sharemsg"></span></div>';
  host.appendChild(sh);
  $("#shareBtn").addEventListener("click", function () {
    shareCurrent(spot, pick.key, $(".sharemsg", sh));
  });

  startWaveLoop();
}

/* ── what to plan for: when, and what you are carrying ──────────────── */
function prefsHtml() {
  return '<div class="prefs">' +
    '<label>go <select id="whenSel" aria-label="Which part of the day">' +
      WHEN_OPTS.map(function (o) {
        return '<option value="' + o.id + '"' + (o.id === S.when ? " selected" : "") + '>' + esc(o.label) + '</option>';
      }).join("") + '</select></label>' +
    '<label>with <select id="suitSel" aria-label="What wetsuit you have">' +
      SUIT_OPTS.map(function (o) {
        return '<option value="' + o.id + '"' + (o.id === S.gear.suit ? " selected" : "") + '>' + esc(o.label) + '</option>';
      }).join("") + '</select></label>' +
    '<label class="gearbox"><input type="checkbox" id="finsChk"' + (S.gear.fins ? " checked" : "") + '>fins</label>' +
  '</div>';
}

function wirePrefs(card) {
  var save = function () {
    try { localStorage.setItem("rotasurf.gear", JSON.stringify({ when: S.when, gear: S.gear })); }
    catch (e) { /* private mode */ }
  };
  var w = $("#whenSel", card), su = $("#suitSel", card), f = $("#finsChk", card);
  if (w) w.addEventListener("change", function () {
    S.when = this.value; save();
    if (S.plan) S.plan = recommend();
    render();
  });
  if (su) su.addEventListener("change", function () {
    S.gear.suit = this.value; save();
    if (S.plan) S.plan = recommend();
    render();
  });
  if (f) f.addEventListener("change", function () {
    S.gear.fins = this.checked; save();
    if (S.plan) S.plan = recommend();
    render();
  });
}

/* ── where to have a first go ───────────────────────────────────────── */
function renderLearnCard(host) {
  var lr = bestLearnToday();
  var card = el("section", "card learn");

  if (!lr) {
    card.innerHTML = '<h3>Best place to learn today</h3>' +
      '<p class="foot">Nothing within your drive limit is both legal and safe for a first go today. ' +
      'Widen the drive, or wait — this coast gives you a beginner day most weeks.</p>';
    host.appendChild(card);
    return;
  }

  /* A flat sea is not a lesson. Say that, and point at the next day that is. */
  if (lr.pick.L.score < 55) {
    var nxt = nextLearnDay();
    card.innerHTML = '<h3>Best place to learn today</h3>' +
      '<p><b>Not today.</b> Nothing in range has enough water moving to learn on — the best you could do ' +
      'is ' + esc(lr.pick.spot.name) + ' at ' + mtr(lr.pick.row.localHs) + ', which is a swim rather than a lesson.</p>' +
      (nxt
        ? '<div class="rule"><b>The next real chance</b><p>' + esc(dayLabel(nxt.date)) + ', ' +
          hhmm(nxt.from) + '–' + hhmm(nxt.to + 1) + ' at <b>' + esc(nxt.pick.spot.name) + '</b> — ' +
          mtr(nxt.pick.row.localHs) + ', ' + esc(windLabel(nxt.pick.row, nxt.pick.spot)) + '. ' +
          esc(learnWhy(nxt)) + '</p></div>' +
          '<div class="shrow"><button class="btn" id="learnOpen" data-spot="' + esc(nxt.pick.spot.id) +
          '" data-key="' + esc(nxt.pick.row.key) + '">Open that day</button></div>'
        : '<p class="foot">Nor is there one in the next ' + DAYS + ' days. That happens here in a flat spell.</p>');
    host.appendChild(card);
    var ob = $("#learnOpen");
    if (ob) ob.addEventListener("click", function () {
      S.spotId = ob.getAttribute("data-spot");
      S.sel = { key: ob.getAttribute("data-key") };
      render(); window.scrollTo({ top: 0, behavior: "smooth" });
    });
    return;
  }

  var pick = lr.pick, r = pick.row, spot = pick.spot;
  var col = scoreSolid(pick.L.score);
  var suit = suitFor(r.sst);
  var law = boardRule(spot, lr.date, r.hour);

  card.innerHTML =
    '<div class="plan-head"><h3>Best place to learn today</h3>' +
      '<span class="learn-badge" style="background:' + col.bg + ';color:' + col.ink + '">' +
      pick.L.score + '</span></div>' +
    '<p class="foot">Not the same question as “where is it best”. The main score likes a steep, punchy ' +
    'wave; that is the one that holds a beginner under. This looks for small, sandy and slack instead.</p>' +
    '<div class="plan-hero">' +
      '<div><b>' + esc(spot.name) + '</b>' +
        '<span>' + hhmm(lr.from) + '–' + hhmm(lr.to + 1) + ' · ' + esc(spot.town) +
          ' · ' + driveMin(spot) + ' min from ' + esc(originLabel()) + '</span>' +
        '<span>' + mtr(r.localHs) + ' · ' + esc(windLabel(r, spot)) + ' · water ' +
          (r.sst == null ? "—" : r1(r.sst) + " °C") + '</span></div>' +
    '</div>' +
    '<div class="rule"><b>Why here</b><p>' + esc(learnWhy(lr)) +
      (driveMin(spot) > 30 && lr.near && lr.near.score < pick.L.score - 12
        ? ' Nothing closer is worth the trip: the best within twenty-five minutes is ' +
          esc(lr.near.spot.name) + ', and it is ' +
          (lr.near.row.localHs < 0.15 ? 'flat' : 'only ' + mtr(lr.near.row.localHs)) +
          ' — nothing in the water to catch.'
        : '') + '</p></div>' +
    '<div class="rule"><b>What to actually do</b><p>' +
      'Stay in the broken whitewater, in water you can stand up in. Point the board at the beach, ' +
      'wait for the white water to reach you, kick hard as it picks you up and keep your weight forward. ' +
      'Do not paddle out the back on day one — everything you need is in the first twenty metres.</p></div>' +
    '<div class="rule"><b>Keep yourself safe</b><p>' +
      'Shuffle your feet going in, for weeverfish. Keep your arms out in front of you when a wave breaks ' +
      'on you, so the board and the sand never meet your face. Pick something on land and check it every ' +
      'few minutes — if it has moved, you are in a current, so go sideways along the beach, not against it.' +
      (law.restricted ? " " : "") + '</p></div>' +
    '<div class="rule"><b>Wear and bring</b><p>' + esc(suit.suit) + '. Fins, a leash, and sunscreen — ' +
      'you will be face-down and stationary for an hour and the backs of your legs will catch it.</p></div>' +
    '<div class="shrow"><button class="btn" id="learnOpen">Open this beach</button></div>';

  host.appendChild(card);
  $("#learnOpen").addEventListener("click", function () {
    S.spotId = spot.id; S.sel = { key: r.key }; render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

/* ── the day, hour by hour ───────────────────────────────────────────────
   The Grid shows this as a row of coloured numbers. This is the same thing
   as a list you can read: for each daylight hour, the best beach a board is
   allowed on, and what it is doing. Consecutive hours at the same beach are
   folded into one line, because "El Palmar, 08:00 to 11:00" is the answer
   and eight separate rows are not. The arithmetic is all here on the page;
   Claude only turns the table into a paragraph afterwards.                */

function bestLegalAt(key) {
  var p = parseKey(key), best = null;
  spotsInRange().forEach(function (e) {
    var r = rowAt(e, key);
    if (!r || r.dark) return;
    if (boardRule(e.spot, p.date, p.hour).restricted) return;
    if (!best || r.score > best.row.score) best = { entry: e, row: r };
  });
  return best;
}

function windWordFor(r, spot) {
  if (r.wind == null || r.windDir == null) return "cross-shore";
  if (r.wind < 4) return "glassy";
  var d = angDiff(r.windDir, spot.off);
  return d < 60 ? "offshore" : d < 120 ? "cross-shore" : "onshore";
}

function hourlyPlan(date) {
  var hours = [];
  for (var h = 0; h < 24; h++) {
    var key = date + "T" + pad(h) + ":00";
    if (S.model.hours.indexOf(key) < 0) continue;
    var b = bestLegalAt(key);
    if (!b) continue;
    hours.push({ h: h, entry: b.entry, spot: b.entry.spot, row: b.row });
  }
  /* fold runs at the same beach */
  var runs = [];
  hours.forEach(function (x) {
    var last = runs[runs.length - 1];
    if (last && last.spot.id === x.spot.id && last.to === x.h - 1) {
      last.to = x.h;
      if (x.row.score > last.peak.score) last.peak = x.row;
      last.scores.push(x.row.score);
    } else {
      runs.push({ spot: x.spot, entry: x.entry, from: x.h, to: x.h, peak: x.row, scores: [x.row.score] });
    }
  });
  return { hours: hours, runs: runs };
}

var DAY_KEY = "rotasurf.day.v1";
function dayCacheKey(date) { return [date, S.origin, S.maxDrive, S.when].join("|"); }
function dayGet(date) {
  try {
    var all = JSON.parse(localStorage.getItem(DAY_KEY) || "{}"), hit = all[dayCacheKey(date)];
    return hit && Date.now() - hit.at < 3 * 3600 * 1000 ? hit : null;
  } catch (e) { return null; }
}
function dayPut(date, d) {
  try {
    var all = JSON.parse(localStorage.getItem(DAY_KEY) || "{}");
    var ks = Object.keys(all);
    if (ks.length > 12) ks.slice(0, ks.length - 12).forEach(function (k) { delete all[k]; });
    all[dayCacheKey(date)] = { at: Date.now(), text: d.text, model: d.model };
    localStorage.setItem(DAY_KEY, JSON.stringify(all));
  } catch (e) { /* private mode */ }
}
/* In-flight requests by key. The page renders more than once around boot —
   cached forecast first, live forecast a moment later — and the first
   version of this threw the answer away if the box it was fetched for had
   been rebuilt in the meantime, then refused to ask again. Now a second
   render waits on the same request, and the answer goes into whichever box
   is on screen when it lands. */
var dayPending = {};
var dayFailed = {};

function renderHourCard(host) {
  var date = (S.sel && S.sel.key) ? S.sel.key.slice(0, 10) : madridToday();
  var plan = hourlyPlan(date);
  var card = el("section", "card hours");
  var title = date === madridToday() ? "Today, hour by hour" : dayLabel(date) + ", hour by hour";

  if (!plan.runs.length) {
    card.innerHTML = '<h3>' + esc(title) + '</h3>' +
      '<p class="foot">No daylight hour with a board allowed anywhere in range. Widen the drive limit.</p>';
    host.appendChild(card);
    return;
  }

  card.innerHTML = '<h3>' + esc(title) + '</h3>' +
    '<p class="foot">For each hour, the best beach you are allowed to ride at. Hours at the same beach are folded together.</p>' +
    '<div class="dayread" id="dayRead" data-key="' + esc(dayCacheKey(date)) + '"><span class="spinner sm"></span> Reading the day…</div>' +
    '<ol class="runs">' + plan.runs.map(function (run) {
      var col = scoreSolid(run.peak.score), b = band(run.peak.score);
      var span = run.from === run.to ? hhmm(run.from) : hhmm(run.from) + "–" + hhmm(run.to + 1);
      return '<li class="run' + (run.peak.score < 30 ? " run-dead" : "") + '">' +
        '<span class="run-time">' + span + '</span>' +
        '<span class="run-score" style="background:' + col.bg + ';color:' + col.ink + '">' + run.peak.score + '</span>' +
        '<span class="run-main"><b>' + esc(run.spot.name) + '</b>' +
          '<span>' + esc(b.word) + ' · ' + mtr(run.peak.localHs) + ' · ' + esc(windLabel(run.peak, run.spot)) +
          ' · ' + driveMin(run.spot) + ' min</span></span>' +
        '<button class="mini run-open" data-spot="' + esc(run.spot.id) + '" data-key="' + esc(run.peak.key) + '">open</button>' +
      '</li>';
    }).join("") + '</ol>';
  host.appendChild(card);

  $$(".run-open", card).forEach(function (b) {
    b.addEventListener("click", function () {
      S.spotId = b.getAttribute("data-spot"); S.sel = { key: b.getAttribute("data-key") }; render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  readTheDay(card, date, plan);
}

/* Claude turns the table into a paragraph. Cached three hours per
   (date, origin, drive, when) — the same key the Worker bounds itself on. */
/* The box currently on screen for this key — not the one the request was
   started from, which may have been rebuilt since. */
function liveDayBox(k) {
  var b = $("#dayRead");
  return b && b.getAttribute("data-key") === k ? b : null;
}

function readTheDay(card, date, plan) {
  var box = $("#dayRead", card);
  var c = cfg();
  if (!c.api) { box.remove(); return; }

  var k = dayCacheKey(date);
  var hit = dayGet(date);
  if (hit) { showDay(box, hit.text, hit.model, hit.at); return; }
  if (dayFailed[k]) { box.remove(); return; }

  /* Already asked from an earlier render: leave the spinner up and let that
     request fill whichever box is on screen when it resolves. */
  if (dayPending[k]) return;

  var rows = plan.hours.map(function (x) {
    return { h: x.h, name: x.spot.name, score: x.row.score, hs: +x.row.localHs.toFixed(1),
             wind: Math.round(x.row.wind || 0), windWord: windWordFor(x.row, x.spot) };
  }).slice(0, 18);

  dayPending[k] = fetch(c.api + "/api/day", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: date, origin: S.origin, maxDrive: S.maxDrive, when: S.when, rows: rows })
  })
  .then(function (r) { return r.ok ? r.json() : null; })
  .then(function (d) {
    delete dayPending[k];
    var target = liveDayBox(k);
    if (d && d.text) {
      dayPut(date, d);
      if (target) showDay(target, d.text, d.model, Date.now());
    } else {
      dayFailed[k] = true;
      if (target) target.remove();
    }
  })
  .catch(function () {
    delete dayPending[k];
    dayFailed[k] = true;
    var target = liveDayBox(k);
    if (target) target.remove();
  });
}
function showDay(box, text, model, at) {
  box.innerHTML = '<p>' + esc(text) + '</p>' +
    '<span class="foot">Read by Claude' + (model ? ' (' + esc(model) + ')' : '') +
    ' from the table below · ' + esc(agoLabel(at)) + '</span>';
}

/* ── the one-button answer ──────────────────────────────────────────── */
function renderPlanCard(host) {
  var card = el("section", "card plan");
  if (!S.plan) {
    card.innerHTML = '<h3>Just tell me where to go</h3>' +
      '<p class="foot">One answer instead of a dashboard: the best beach and hour in the next ' + DAYS +
      ' days, picked only from hours you are actually allowed to ride in, with the reasoning behind it.</p>' +
      prefsHtml() +
      '<div class="shrow"><button id="planBtn" class="btn btn-go">Plan my session</button>' +
      '<span class="foot">from ' + esc(originLabel()) +
        (S.maxDrive > 900 ? "" : ", within " + S.maxDrive + " min") + '</span></div>';
    host.appendChild(card);
    wirePrefs(card);
    $("#planBtn").addEventListener("click", function () { S.plan = recommend(); render(); });
    return;
  }

  var P = S.plan;
  if (!P || !P.pick) {
    card.innerHTML = '<h3>Nothing to recommend</h3><p>No spot in range has a legal, rideable window in the next ' +
      DAYS + ' days. Widen the drive limit, or wait for the next swell.</p>' +
      '<div class="shrow"><button id="planBtn" class="btn">Try again</button></div>';
    host.appendChild(card);
    $("#planBtn").addEventListener("click", function () { S.plan = recommend(); render(); });
    return;
  }

  var c = P.pick, r = c.win.peak, spot = c.spot;
  var lv = leaveAt(spot, c.win.from);
  var suit = suitFor(r.sst);
  var rip = ripRisk(spot, r);
  var col = scoreSolid(r.score);

  card.innerHTML =
    '<div class="plan-head"><h3>Go here</h3>' +
      '<button id="planAgain" class="mini">re-plan</button></div>' +
    prefsHtml() +
    (P.weak ? '<p class="plan-warn">Honestly, it is a poor week — nothing clears a real bar. This is the ' +
      'least-bad session going, not a good one.</p>' : '') +
    '<div class="plan-hero">' +
      '<span class="plan-score" style="background:' + col.bg + ';color:' + col.ink + '">' + r.score + '</span>' +
      '<div><b>' + esc(spot.name) + '</b>' +
        '<span>' + esc(dayLabel(c.date)) + ' · ' + hhmm(c.win.from) + '–' + hhmm(c.win.to + 1) + '</span>' +
        '<span>' + esc(spot.town) + ' · ' + driveMin(spot) + ' min from ' + esc(originLabel()) + '</span></div>' +
    '</div>' +
    '<div class="plan-line"><b>Leave at ' + lv.at + '</b> to be in the water for ' + hhmm(c.win.from) +
      (lv.note ? ' (' + lv.note + ')' : '') + '. Best single hour is ' + hhmm(r.hour) + '.</div>' +
    '<div class="plan-facts">' +
      '<span>' + mtr(r.localHs) + '</span>' +
      '<span>' + (r.tp == null ? "—" : Math.round(r.tp) + " s") + '</span>' +
      '<span>' + esc(windLabel(r, spot)) + '</span>' +
      '<span>water ' + (r.sst == null ? "—" : r1(r.sst) + " °C") + '</span>' +
      '<span>tide ' + esc(tideLabel(r.tide)) + '</span>' +
      '<span>rip ' + rip.label.toLowerCase() + '</span>' +
    '</div>' +
    '<div class="plan-why">' + c.reasons.map(function (x) {
      return '<div class="rule"><b>' + esc(x.t) + '</b><p>' + esc(x.d) + '</p></div>';
    }).join("") + '</div>' +
    '<div class="rule"><b>Park</b><p>' + esc(spot.park.name) + ' — ' + esc(spot.park.cost) + ', ' +
      esc(spot.park.walk) + ' walk. <a class="link" target="_blank" rel="noopener" ' +
      'href="https://www.google.com/maps/dir/?api=1&destination=' + spot.park.lat + ',' + spot.park.lon +
      '&travelmode=driving">Directions ↗</a></p></div>' +
    '<div class="rule"><b>Wear and bring</b><p>' + esc(suit.suit) + '. ' +
      esc(kitFor(r, spot).map(function (k) { return k.label; }).join(" · ")) + '.</p></div>' +
    (c.gaps && c.gaps.length
      ? c.gaps.map(function (g) {
          return '<div class="rule law-warn"><b>' +
            (g.k === "suit" ? "You said no full wetsuit" : "You said no fins") +
            '</b><p>' + esc(g.t) + '</p></div>';
        }).join("")
      : '') +
    (rip.level >= 1
      ? '<div class="rule law-rip' + rip.level + '"><b>Rip risk ' + rip.label.toLowerCase() + '</b><p>' +
        esc(capitalise(rip.why)) + '.' + (rip.advice ? " " + esc(rip.advice) : "") + '</p></div>'
      : '') +
    (spot.hazards && spot.hazards.length
      ? '<div class="rule"><b>Watch out for</b><p>' + esc(spot.hazards.join(" · ")) + '</p></div>'
      : '') +
    (spot.tip ? '<div class="rule"><b>Local knowledge</b><p>' + esc(spot.tip) + '</p></div>' : '') +
    (P.alts.length ? '<div class="plan-alts"><span class="lbl">other options</span>' +
      P.alts.map(function (a) {
        return '<button class="alt" data-spot="' + esc(a.spot.id) + '" data-key="' + esc(a.win.peak.key) + '">' +
          '<b>' + a.win.peak.score + '</b> ' + esc(dayLabel(a.date)) + ' ' + hhmm(a.win.from) + ' · ' +
          esc(a.spot.name) + '</button>';
      }).join("") + '</div>' : '') +
    '<div class="shrow"><button id="planOpen" class="btn">Open this session</button>' +
      '<button id="planShare" class="btn">Share it</button><span class="foot sharemsg"></span></div>';

  host.appendChild(card);
  wirePrefs(card);
  $("#planAgain").addEventListener("click", function () { S.plan = recommend(); render(); });
  $("#planOpen").addEventListener("click", function () {
    S.spotId = spot.id; S.sel = { key: r.key }; render();
  });
  $("#planShare").addEventListener("click", function () {
    shareCurrent(spot, r.key, $(".sharemsg", card));
  });
  $$(".alt", card).forEach(function (b) {
    b.addEventListener("click", function () {
      S.spotId = b.getAttribute("data-spot");
      S.sel = { key: b.getAttribute("data-key") };
      render();
    });
  });
}

/* Every tile is a button. Tapping one says, in words, what that number is and
   what this particular value means today — because a figure like "6 s" tells
   you nothing at all unless you already know what it is. */
function stat(k, v, note, gid) {
  return '<button class="stat' + (gid ? " stat-x" : "") + '"' +
    (gid ? ' data-g="' + esc(gid) + '" aria-label="' + esc(k) + ' — tap to explain"' : '') + '>' +
    '<span class="lbl">' + esc(k) + (gid ? '<i class="qmark">?</i>' : '') + '</span>' +
    '<b>' + esc(v) + '</b>' +
    (note ? '<span class="note">' + esc(note) + '</span>' : '') + '</button>';
}

function glossaryById(id) {
  return (window.__SURF_GLOSSARY__ || []).filter(function (g) { return g.id === id; })[0] || null;
}

/* A plain reading of the actual value in front of you, not the definition. */
function readingFor(id, sc, spot) {
  var v;
  switch (id) {
    case "wave":
      v = sc.localHs;
      return v < 0.3 ? "Right now: " + mtr(v) + ". That is nothing — the sea is flat."
        : v < 0.6 ? "Right now: " + mtr(v) + ". Small. You will be scrapping for anything rideable."
        : v < 1.0 ? "Right now: " + mtr(v) + ". Modest but workable — a fun size on a sponge."
        : v < 1.8 ? "Right now: " + mtr(v) + ". A good size for here. This is what you want."
        : "Right now: " + mtr(v) + ". Big for this coast. Serious water moving; know your limits.";
    case "period":
      v = sc.tp;
      if (v == null) return "";
      return v < 7 ? "Right now: " + Math.round(v) + " s. Short — this is local wind chop, not real swell. It will have no push."
        : v < 9 ? "Right now: " + Math.round(v) + " s. Borderline. There is something there but not much behind it."
        : v < 11 ? "Right now: " + Math.round(v) + " s. Decent. The waves will have some shove."
        : "Right now: " + Math.round(v) + " s. Proper groundswell from a distant storm. Organised and powerful.";
    case "windangle":
      if (sc.wind == null || sc.windDir == null) return "";
      var d = angDiff(sc.windDir, spot.off);
      return sc.wind < 4 ? "Right now: " + Math.round(sc.wind) + " kn. Barely any wind — glassy, which is ideal."
        : d < 50 ? "Right now: " + Math.round(sc.wind) + " kn blowing offshore here. This is the good one: it holds the wave face up."
        : d < 112 ? "Right now: " + Math.round(sc.wind) + " kn across the beach. Not ruinous, not helping."
        : "Right now: " + Math.round(sc.wind) + " kn blowing straight onshore. It flattens the waves into mush.";
    case "mix":
      var sw = sc.swellH || 0, ww = sc.windWaveH || 0;
      return ww > sw ? "Right now there is more wind chop (" + mtr(ww) + ") than real swell (" + mtr(sw) +
          "). The wave height number is flattering it."
        : "Right now: " + mtr(sw) + " of real swell against " + mtr(ww) + " of chop. The swell is the bigger part, which is what you want.";
    case "tidestate":
      return "Right now: " + tideLabel(sc.tide) + ". This beach works best on the " + spot.tide + " tide, so " +
        (sc.parts.tide >= 65 ? "that suits it." : sc.parts.tide >= 45 ? "it is workable." : "you are on the wrong half of the cycle.");
    case "water":
      v = sc.sst;
      if (v == null) return "";
      return "Right now: " + r1(v) + " °C. That is a " + suitFor(v).suit.toLowerCase() + " day.";
    case "current":
      v = sc.curV;
      if (v == null) return "";
      return v < 0.25 ? "Right now: " + r1(v) + " m/s. You will not notice it."
        : "Right now: " + r1(v) + " m/s. Enough to walk you down the beach — pick a landmark and check it.";
    case "vis":
      if (sc.vis == null) return "";
      var km = sc.vis / 1000;
      return km >= 10 ? "Right now: " + Math.round(km) + " km. Clear."
        : km >= 4 ? "Right now: " + Math.round(km) + " km. A bit hazy, no problem."
        : "Right now: " + Math.round(km) + " km. Poor — at dawn you may not see the sets coming.";
    case "pressure":
      if (sc.pressure == null) return "";
      return "Right now: " + Math.round(sc.pressure) + " hPa. " +
        (sc.pressure < 1005 ? "Low — unsettled, and swell is probably on its way."
         : sc.pressure > 1022 ? "High — settled, which usually means small and clean."
         : "Ordinary. Nothing to read into it.");
    case "uv":
      if (sc.uv == null) return "";
      return "Right now: " + Math.round(sc.uv) + ". " +
        (sc.uv >= 8 ? "Very strong. You will burn in under half an hour."
         : sc.uv >= 6 ? "Strong. Wear sunscreen — the backs of the legs always catch it."
         : "Mild. Nothing to worry about.");
    case "feels":
      if (sc.airT == null) return "";
      return "Right now: " + Math.round(sc.airT) + " °C" +
        (sc.feelsT != null ? ", feeling like " + Math.round(sc.feelsT) + " °C" : "") +
        (sc.wind >= 15 ? ". The wind is what you will feel walking back to the car wet." : ".");
    case "light":
      return "Today: first usable light and last usable light are on the timeline card below. " +
        (sc.dark ? "It is dark right now." : "There is light right now.");
    default: return "";
  }
}

/* One panel under the grid rather than a modal, so nothing is covered up. */
function wireStats(host, sc, spot) {
  var panel = $(".statx", host);
  if (!panel) return;
  $$(".stat-x", host).forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-g");
      var wasOn = btn.classList.contains("on");
      $$(".stat-x", host).forEach(function (b) { b.classList.remove("on"); });
      if (wasOn) { panel.hidden = true; panel.innerHTML = ""; return; }
      btn.classList.add("on");
      var g = glossaryById(id);
      if (!g) { panel.hidden = true; return; }
      var reading = readingFor(id, sc, spot);
      panel.hidden = false;
      panel.innerHTML = '<b>' + esc(g.t) + '</b>' +
        (reading ? '<p class="statx-now">' + esc(reading) + '</p>' : '') +
        '<p>' + esc(g.what) + '</p>' +
        '<p class="statx-why"><b>Why it matters:</b> ' + esc(g.why) + '</p>' +
        '<p class="statx-good"><b>Good looks like:</b> ' + esc(g.good) + '</p>' +
        '<button class="mini statx-close">close</button>';
      $(".statx-close", panel).addEventListener("click", function () {
        panel.hidden = true; panel.innerHTML = "";
        $$(".stat-x", host).forEach(function (b) { b.classList.remove("on"); });
      });
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
}
function bar(k, v, note) {
  return '<div class="barrow"><span class="bk">' + esc(k) + '</span>' +
    '<span class="bt"><i style="width:' + clamp(Math.round(v), 2, 100) + '%"></i></span>' +
    '<span class="bv">' + Math.round(v) + '</span>' +
    '<span class="bn">' + esc(note) + '</span></div>';
}

/* Share a link that reopens this exact beach at this exact hour. */
function shareCurrent(spot, key, msg) {
  var url = location.origin + location.pathname + "#" + spot.id + "/" + key;
  var done = function (t) { if (msg) { msg.textContent = t; setTimeout(function () { msg.textContent = ""; }, 2600); } };
  var title = spot.name + " — " + dayLabel(key.slice(0, 10)) + " " + key.slice(11, 16);
  if (navigator.share) {
    navigator.share({ title: "Rota Wave Watch", text: title, url: url })
      .then(function () { done("shared"); }, function () { /* dismissed */ });
    return;
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () { done("link copied"); },
      function () { done(url); });
  } else { done(url); }
}

/* ════════════════════════════ view: GRID ════════════════════════════
   Days down, hours across, one cell per hour. Colour is the score, so the
   week reads as a shape before you read a single number.               */

var GRID_H0 = 5, GRID_H1 = 22;

function renderGrid() {
  var host = $("#v-grid"); host.innerHTML = "";
  var entries = spotsInRange();
  var pinned = S.spotId ? entries.filter(function (e) { return e.spot.id === S.spotId; })[0] : null;

  var head = el("section", "card");
  head.innerHTML = '<h3>' + (pinned ? esc(pinned.spot.name) : "Best spot each hour") + '</h3>' +
    '<p class="foot">' + (pinned
      ? "Every hour of the next " + DAYS + " days at this one beach. Tap a cell for the detail."
      : "Each cell is the best score available at that hour across all " + entries.length +
        " spots within " + (S.maxDrive > 900 ? "any drive" : S.maxDrive + " minutes") +
        ". Tap a cell to see which beach it is.") + '</p>';
  host.appendChild(head);

  var wrap = el("section", "card gridcard");
  var scroller = el("div", "gridscroll");
  var tbl = el("div", "grid");

  var hdr = el("div", "grow ghead");
  hdr.appendChild(el("div", "gday glbl", ""));
  for (var h = GRID_H0; h <= GRID_H1; h++) {
    hdr.appendChild(el("div", "gcellh", h % 3 === 0 ? pad(h) : "·"));
  }
  tbl.appendChild(hdr);

  S.model.days.forEach(function (date) {
    var row = el("div", "grow");
    var ds = dayShort(date);
    var dayc = el("div", "gday", '<b>' + (date === madridToday() ? "Today" : ds.wd) + '</b><span>' + ds.dm + '</span>');
    row.appendChild(dayc);
    for (var hh = GRID_H0; hh <= GRID_H1; hh++) {
      var key = date + "T" + pad(hh) + ":00";
      var best = pinned ? (rowAt(pinned, key) ? { entry: pinned, row: rowAt(pinned, key) } : null) : bestAt(key);
      var c = el("button", "gcell");
      if (!best) { c.className += " gnone"; row.appendChild(c); continue; }
      var r = best.row;
      var col = scoreCell(r.dark ? Math.min(r.score, 8) : r.score);
      c.style.background = col.bg; c.style.color = col.ink;
      if (r.dark) c.className += " gdark";
      if (!r.dark && r.score >= 78) c.className += " gpeak";
      if (key === nowKey()) c.className += " gnow";
      c.textContent = r.dark ? "" : (r.score >= 10 ? r.score : "");
      c.setAttribute("data-key", key);
      c.setAttribute("data-spot", best.entry.spot.id);
      c.setAttribute("aria-label", dayLabel(date) + " " + hhmm(hh) + ", score " + r.score + ", " + best.entry.spot.name);
      row.appendChild(c);
    }
    tbl.appendChild(row);
  });

  scroller.appendChild(tbl);
  wrap.appendChild(scroller);
  wrap.appendChild(el("div", "legend",
    '<span class="lbl">worse</span>' +
    [5, 20, 35, 50, 65, 80, 95].map(function (v) {
      return '<i style="background:' + scoreCell(v).bg + '"></i>';
    }).join("") +
    '<span class="lbl">better</span><span class="legdark">dark = night</span>'));
  host.appendChild(wrap);

  $$(".gcell", wrap).forEach(function (c) {
    c.addEventListener("click", function () {
      var k = c.getAttribute("data-key"); if (!k) return;
      S.sel = { key: k };
      if (!S.spotId) S.spotId = c.getAttribute("data-spot");
      setView("now");
    });
  });

  /* scroll the grid so the current hour is in view on a phone */
  setTimeout(function () {
    var nowc = $(".gnow", wrap);
    if (nowc) scroller.scrollLeft = Math.max(0, nowc.offsetLeft - scroller.clientWidth * 0.4);
  }, 0);

  host.appendChild(renderChart(pinned || null));
}

/* ════════════════════════════ the chart ════════════════════════════ */

function renderChart(pinned) {
  var card = el("section", "card");
  card.innerHTML = '<h3>The week, hour by hour</h3>' +
    '<p class="foot">Wave height at the beach, with the shaded band showing how far apart ECMWF, Météo-France and NOAA are — a wide band means nobody knows yet. Tide underneath, wind as the dotted line. Swipe sideways.</p>';

  var keys = S.model.hours;
  if (!keys.length) return card;

  var rowFor = function (key) {
    if (pinned) return rowAt(pinned, key);
    var b = bestAt(key); return b ? b.row : null;
  };
  var rows = keys.map(rowFor);

  var PXH = 15;                                     /* px per hour */
  var W = keys.length * PXH, H = 210;
  var padT = 16, padB = 46, waveH = 108, tideTop = H - padB + 4, tideH = 30;

  var maxHs = Math.max(0.6, Math.max.apply(null, rows.map(function (r) {
    return r ? Math.max(r.localHs, r.band ? r.band.hi * (r.localHs / Math.max(r.offshoreHs, 0.05)) : 0) : 0;
  })) * 1.15);
  var maxWind = Math.max(12, Math.max.apply(null, rows.map(function (r) { return r && r.wind != null ? r.wind : 0; })) * 1.1);
  var tideVals = rows.map(function (r) { return r && r.tide ? r.tide.m : null; }).filter(function (v) { return v != null; });
  var tLo = tideVals.length ? Math.min.apply(null, tideVals) : -1;
  var tHi = tideVals.length ? Math.max.apply(null, tideVals) : 1;

  var X = function (i) { return i * PXH + PXH / 2; };
  var Yw = function (v) { return padT + waveH - (v / maxHs) * waveH; };
  var Yn = function (v) { return padT + waveH - (v / maxWind) * waveH; };
  var Yt = function (v) { return tideTop + tideH - ((v - tLo) / Math.max(0.2, tHi - tLo)) * tideH; };

  var svg = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" class="chart" preserveAspectRatio="none">'];

  /* night shading + day dividers */
  var lastDate = null;
  keys.forEach(function (k, i) {
    var r = rows[i], p = parseKey(k);
    if (r && r.dark) svg.push('<rect x="' + (i * PXH) + '" y="0" width="' + PXH + '" height="' + (H - padB + tideH + 6) + '" class="cnight"/>');
    if (p.date !== lastDate) {
      lastDate = p.date;
      if (i > 0) svg.push('<line x1="' + (i * PXH) + '" y1="0" x2="' + (i * PXH) + '" y2="' + H + '" class="cdiv"/>');
      var ds = dayShort(p.date);
      svg.push('<text x="' + (i * PXH + 6) + '" y="13" class="cday">' + esc(p.date === madridToday() ? "TODAY" : ds.wd.toUpperCase() + " " + ds.dm) + '</text>');
    }
  });

  /* score ribbon along the top */
  keys.forEach(function (k, i) {
    var r = rows[i]; if (!r) return;
    var s = r.dark ? Math.min(r.score, 8) : r.score;
    svg.push('<rect x="' + (i * PXH) + '" y="' + (H - padB + 34) + '" width="' + PXH + '" height="8" fill="' + scoreCell(s).bg + '"/>');
  });

  /* model-agreement band, scaled from offshore to this beach */
  var bandTop = [], bandBot = [];
  keys.forEach(function (k, i) {
    var r = rows[i]; if (!r || !r.band) return;
    var ratio = r.localHs / Math.max(r.offshoreHs, 0.05);
    bandTop.push(X(i) + "," + r1(Yw(r.band.hi * ratio)));
    bandBot.unshift(X(i) + "," + r1(Yw(r.band.lo * ratio)));
  });
  if (bandTop.length > 2) svg.push('<polygon points="' + bandTop.concat(bandBot).join(" ") + '" class="cband"/>');

  /* wave height area */
  var area = [], line = [];
  keys.forEach(function (k, i) {
    var r = rows[i]; if (!r) return;
    line.push((line.length ? "L" : "M") + X(i) + " " + r1(Yw(r.localHs)));
    area.push(X(i) + "," + r1(Yw(r.localHs)));
  });
  if (area.length > 1) {
    svg.push('<polygon points="' + X(0) + ',' + (padT + waveH) + ' ' + area.join(" ") + ' ' + X(keys.length - 1) + ',' + (padT + waveH) + '" class="carea"/>');
    svg.push('<path d="' + line.join(" ") + '" class="cwave"/>');
  }

  /* wind */
  var wl = [];
  keys.forEach(function (k, i) {
    var r = rows[i]; if (!r || r.wind == null) return;
    wl.push((wl.length ? "L" : "M") + X(i) + " " + r1(Yn(r.wind)));
  });
  if (wl.length > 1) svg.push('<path d="' + wl.join(" ") + '" class="cwind2"/>');

  /* tide */
  var tl = [];
  keys.forEach(function (k, i) {
    var r = rows[i]; if (!r || !r.tide || r.tide.m == null) return;
    tl.push((tl.length ? "L" : "M") + X(i) + " " + r1(Yt(r.tide.m)));
  });
  if (tl.length > 1) svg.push('<path d="' + tl.join(" ") + '" class="ctide"/>');

  /* gridlines + now */
  [0.5, 1, 1.5, 2, 2.5, 3].forEach(function (v) {
    if (v > maxHs) return;
    svg.push('<line x1="0" y1="' + r1(Yw(v)) + '" x2="' + W + '" y2="' + r1(Yw(v)) + '" class="cgrid"/>');
    svg.push('<text x="3" y="' + r1(Yw(v) - 3) + '" class="cax">' + v + ' m</text>');
  });
  var ni = keys.indexOf(nowKey());
  if (ni >= 0) svg.push('<line x1="' + X(ni) + '" y1="0" x2="' + X(ni) + '" y2="' + (H - 4) + '" class="cnow"/>' +
    '<text x="' + (X(ni) + 4) + '" y="' + (H - 6) + '" class="cnowt">NOW</text>');

  svg.push("</svg>");

  var box = el("div", "chartscroll");
  box.innerHTML = svg.join("");
  card.appendChild(box);
  card.appendChild(el("div", "clegend",
    '<span><i class="sw-wave"></i>wave height</span>' +
    '<span><i class="sw-band"></i>model spread</span>' +
    '<span><i class="sw-wind"></i>wind (kn)</span>' +
    '<span><i class="sw-tide"></i>tide</span>'));

  box.addEventListener("click", function (ev) {
    var r = box.getBoundingClientRect();
    var i = Math.floor((ev.clientX - r.left + box.scrollLeft) / PXH);
    if (i >= 0 && i < keys.length) {
      S.sel = { key: keys[i] };
      if (!S.spotId && !pinned) { var b = bestAt(keys[i]); if (b) S.spotId = b.entry.spot.id; }
      setView("now");
    }
  });
  setTimeout(function () {
    if (ni >= 0) box.scrollLeft = Math.max(0, X(ni) - box.clientWidth * 0.35);
  }, 0);
  return card;
}

/* ═════════════════════════ "just tell me" ═════════════════════════
   One answer instead of a dashboard: which beach, what time, and why that
   one rather than the seventeen others. It only ever recommends hours you
   are actually allowed to ride in, which in summer is the whole difficulty
   — the best hours and the legal hours are not the same hours.            */

function recommend() {
  var cands = [];
  spotsInRange().forEach(function (e) {
    var spot = e.spot;
    S.model.days.forEach(function (date) {
      /* Only hours where a board is legal here: advice you cannot act on
         is not advice. */
      var wt = whenTest();
      var legal = function (r) {
        if (boardRule(spot, date, r.hour).restricted) return false;
        return wt ? wt(r) : true;
      };
      var win = dayWindowFor(e, date, legal);
      if (!win) return;
      var lead = out_leadHours(win.peak.key);
      if (lead < -1) return;                       /* already gone */

      var conf = confidenceOf(win.peak, win.peak.key);
      var v = win.peak.score;
      v -= Math.max(0, driveMin(spot) - 20) * 0.07;    /* a long drive has to earn it */
      v -= (3 - conf.level) * 4;                   /* prefer what we are sure of */
      /* A session six days out has to be clearly better than one in two days,
         not marginally: the near one is both likelier to happen and likelier
         to be right. */
      v -= clamp(lead, 0, 240) / 24 * 1.5;
      /* Sessions you are not equipped for are worth less to you than to
         someone with a full quiver, so say so in the ranking, not just in a
         footnote afterwards. */
      var gaps = gearGap(win.peak, spot);
      v -= gaps.length * 9;

      cands.push({ entry: e, spot: spot, date: date, win: win, conf: conf,
                   value: v, lead: lead, gaps: gaps });
    });
  });
  if (!cands.length) return null;
  cands.sort(function (a, b) { return b.value - a.value; });

  /* One per day, so the alternatives are genuinely different options. */
  var seen = {}, ranked = [];
  cands.forEach(function (c) {
    var k = c.spot.id + "|" + c.date;
    if (seen[k]) return;
    seen[k] = 1; ranked.push(c);
  });
  var pick = ranked[0];
  pick.reasons = reasonsFor(pick);
  return { pick: pick, alts: ranked.slice(1, 4), weak: pick.win.peak.score < 40 };
}

/* Which part of the score separates this spot from the field at that hour? */
function edgeOver(pick) {
  var key = pick.win.peak.key;
  var rivals = spotsInRange()
    .filter(function (e) { return e.spot.id !== pick.spot.id; })
    .map(function (e) { return { e: e, r: rowAt(e, key) }; })
    .filter(function (x) { return x.r; })
    .sort(function (a, b) { return b.r.score - a.r.score; });
  if (!rivals.length) return null;
  var best = rivals[0];
  var p = pick.win.peak.parts, q = best.r.parts;
  var keys = ["size", "wind", "dir", "period", "tide"];
  var top = null;
  keys.forEach(function (k) {
    var d = p[k] - q[k];
    if (!top || d > top.d) top = { k: k, d: d };
  });
  return { rival: best.e.spot, rivalScore: best.r.score, part: top.k, gap: Math.round(top.d) };
}

function reasonsFor(c) {
  var r = c.win.peak, spot = c.spot, out = [];
  var dayRows = c.entry.rows.filter(function (x) { return x.date === c.date && !x.dark; });

  /* — why here — */
  var e = edgeOver(c);
  if (r.score < 22) {
    out.push({ t: "Why here", d: "Frankly, nothing in range is working — every beach is in single figures. " +
      "This is the least bad of them, and it is a swim with a board rather than a surf." +
      (e ? " Next best is " + e.rival.name + " on " + e.rivalScore + "." : "") });
    out.push({ t: "Why then", d: "It is the best stretch of daylight on the least bad day." });
    return out;
  }
  var near = spotsInRange().filter(function (x) { return driveMin(x.spot) <= 20; })
    .map(function (x) { return rowAt(x, r.key); }).filter(Boolean)
    .reduce(function (a, x) { return !a || x.score > a.score ? x : a; }, null);
  if (e && e.gap > 6) {
    var WHY = {
      size: "it is the only one with enough size in the water",
      wind: "the wind is offshore here and not at the others",
      dir: "this swell direction gets in here and is shadowed elsewhere",
      period: "the swell has more push by the time it reaches this bank",
      tide: "the tide suits this beach at that hour and not the others"
    };
    out.push({ t: "Why here", d: "Of the " + spotsInRange().length + " beaches in range, this one wins because " +
      WHY[e.part] + ". Next best at that hour is " + e.rival.name + " on " + e.rivalScore + "." });
  } else {
    out.push({ t: "Why here", d: "It scores highest of the " + spotsInRange().length +
      " beaches in range at that hour" + (e ? ", just ahead of " + e.rival.name + " on " + e.rivalScore : "") + "." });
  }
  if (driveMin(spot) > 30 && near && near.score < r.score - 12) {
    out.push({ t: "Worth the drive?", d: "Yes. Nothing within twenty minutes of Rota gets above " +
      near.score + " out of 100 at that hour, against " + r.score + " here — that gap is what the " +
      driveMin(spot) + "-minute drive is buying." });
  }

  /* — why then — */
  var why = [];
  var winds = dayRows.map(function (x) { return x.wind; }).filter(function (v) { return v != null; });
  if (r.wind != null && winds.length && r.wind <= Math.min.apply(null, winds) + 2) {
    why.push("it is the lightest wind of the day");
  } else if (r.wind != null && r.windDir != null && angDiff(r.windDir, spot.off) < 55) {
    why.push("the wind is offshore then (" + Math.round(r.wind) + " kn " + compass(r.windDir) + ")");
  }
  var nx = nextTides(c.entry, r.key, 1);
  if (nx.length) {
    var moving = (r.tide.rising ? "filling toward " : "dropping toward ") + nx[0].type + " at " + nx[0].at;
    /* Do not assert the tide suits the beach unless the score agrees — this
       beach may well want the opposite half of the cycle. */
    if (r.parts.tide >= 65) why.push("the tide is " + moving + ", which is what this beach wants");
    else if (r.parts.tide >= 45) why.push("the tide is " + moving + ", which this beach can work with");
  }
  var law = boardRule(spot, c.date, r.hour);
  if (spot.bb.status === "seasonal" && inBathingSeason(c.date)) {
    why.push(r.hour < GUARD_ON
      ? "and you are in before the lifeguard towers open at " + pad(GUARD_ON) + ":00"
      : "and the towers have shut for the day");
  }
  if (!why.length) {
    var dayBest = dayRows.reduce(function (a, x) { return !a || x.score > a.score ? x : a; }, null);
    why.push(dayBest && dayBest.hour === r.hour
      ? "it is simply the best stretch of daylight that day"
      : "it is the longest run of workable hours that day");
  }
  out.push({ t: "Why then", d: capitalise(why.join(", ")) + "." });

  /* — the honest caveat — */
  var parts = r.parts, weakest = null;
  ["size", "wind", "dir", "period", "tide"].forEach(function (k) {
    if (!weakest || parts[k] < parts[weakest]) weakest = k;
  });
  var WEAK = {
    size: "the size is the weak link — it is small even for here",
    wind: "the wind is the weak link",
    dir: "the swell is not square to this beach",
    period: "the period is short, so there is less push than the height suggests",
    tide: "the tide is wrong for this beach at that hour — it likes the " + spot.tide +
          ", and you will be getting the other half of the cycle"
  };
  if (parts[weakest] < 55) out.push({ t: "The catch", d: capitalise(WEAK[weakest]) + "." });
  if (c.conf.level < 3) {
    out.push({ t: "How sure", d: c.conf.label + " confidence, " + c.conf.why + ". " +
      (c.lead > 72 ? "That is " + Math.round(c.lead / 24) + " days out — treat it as a plan and check again the morning before."
                   : "Worth a second look before you load the car.") });
  }
  return out;
}
function capitalise(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }

/* What time to pull out of the drive, so you are in the water at the start. */
function leaveAt(spot, hour) {
  var mins = hour * 60 - driveMin(spot) - 15;          /* 15 min to change and walk down */
  var d = mins < 0 ? "the night before" : null;
  mins = ((mins % 1440) + 1440) % 1440;
  return { at: pad(Math.floor(mins / 60)) + ":" + pad(mins % 60), note: d };
}

/* ═════════════════════════ live intel ═════════════════════════
   Everything else on this page is arithmetic on weather models. This is the
   part that asks a person-shaped question: is the water actually clean, are
   there medusas in it, is the car park dug up, has the bank moved. It goes
   through the same Cloudflare Worker the rest of the site uses, so no key
   ever reaches the browser, and it is the only feature here that needs one —
   without it the page is entirely unaffected.                              */

var INTEL_KEY = "rotasurf.intel.v1";
var INTEL_TTL = 6 * 3600 * 1000;          /* matches the Worker's own cache */

/* A stored endpoint is only usable if it is actually an http(s) URL. An
   earlier version of this page had a settings box, and anything typed into
   the wrong field there — an access code, a half-pasted address — would be
   saved and then used as the endpoint, which fails in a way that looks like
   the site being broken. Anything that is not a URL is ignored in favour of
   the one config.js ships, and cleared so it cannot come back. */
function usableEndpoint(v) {
  if (!v) return "";
  try {
    var u = new URL(String(v));
    return (u.protocol === "https:" || u.protocol === "http:") ? String(v) : "";
  } catch (e) { return ""; }
}

function cfg() {
  var c = {};
  try { c = JSON.parse(localStorage.getItem("rtf.cfg")) || {}; } catch (e) {}
  var stored = usableEndpoint(c.api);
  if (c.api && !stored) {
    /* Drop the junk so this heals on first load rather than every load. */
    try {
      localStorage.setItem("rtf.cfg", JSON.stringify({ api: "", code: c.code || "" }));
    } catch (e) { /* private mode */ }
  }
  var built = (window.TRIP_CONFIG && window.TRIP_CONFIG.API_BASE) || "";
  return {
    api: String(stored || built || "").replace(/\/+$/, ""),
    code: c.code || ""
  };
}

/* There is nothing left to ask the user for: the Worker URL ships in
   config.js and Live check needs no access code. The Worker answers /api/surf
   only for this site's own origins, only for the beaches it knows, and only
   once per beach per six hours, which is what keeps it from being a free
   Claude endpoint. */

function intelStore() {
  try { return JSON.parse(localStorage.getItem(INTEL_KEY)) || {}; } catch (e) { return {}; }
}
function intelGet(id, date) {
  var all = intelStore(), hit = all[id + "|" + date];
  if (!hit || Date.now() - hit.at > INTEL_TTL) return null;
  return hit;
}
function intelPut(id, date, data) {
  var all = intelStore();
  /* Keep it small: this is a convenience cache, not an archive. */
  var keys = Object.keys(all);
  if (keys.length > 24) keys.slice(0, keys.length - 24).forEach(function (k) { delete all[k]; });
  all[id + "|" + date] = { at: Date.now(), text: data.text, model: data.model };
  try { localStorage.setItem(INTEL_KEY, JSON.stringify(all)); } catch (e) {}
}

/* Turn the five LABEL: lines into rows; anything unexpected is shown as-is. */
var INTEL_ROWS = {
  WATER: "Water", FLAG: "Flags & boards", PARK: "Car park", SEA: "The sea", WATCH: "Watch out"
};
function intelHtml(text, model) {
  var lines = String(text || "").split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
  var rows = lines.map(function (l) {
    var m = l.match(/^([A-Z][A-Z ]{2,14}):\s*(.+)$/);
    if (!m || !INTEL_ROWS[m[1]]) return '<div class="rule"><p>' + esc(l) + '</p></div>';
    return '<div class="rule"><b>' + esc(INTEL_ROWS[m[1]]) + '</b><p>' + esc(m[2]) + '</p></div>';
  }).join("");
  return rows + '<p class="foot">Asked of Claude with web search' +
    (model ? ' (' + esc(model) + ')' : '') + ', cached for six hours. ' +
    'It can be wrong or out of date — the tower and the flag on the beach are the authority.</p>';
}

var INTEL_BLURB = 'Water quality and medusas, today’s flag and tower situation, the car park, and ' +
  'whether the bank has moved — the things four weather models cannot tell you.';

/* One attempt per beach per day per session, so flicking between spots cannot
   fire a queue of requests. The Worker caches six hours on its side as well. */
var intelTried = {};

function renderIntelCard(host, spot, sc) {
  var card = el("section", "card intel");
  var c = cfg();
  var cachedHit = intelGet(spot.id, sc.date);
  var head = '<div class="plan-head"><h3>Live check · ' + esc(spot.name) + '</h3></div>';

  if (!c.api) {
    /* Only reachable in a fork whose config.js has no API_BASE. There is
       deliberately nothing to fill in here: a settings box that stores a
       wrong value is worse than no settings box at all. */
    card.innerHTML = head +
      '<p class="foot">Live check is switched off in this copy of the site — <code>config.js</code> has no ' +
      '<code>API_BASE</code>. Everything else on this page works without it and always will.</p>';
    host.appendChild(card);
    return;
  }

  if (cachedHit) {
    card.innerHTML = head + intelHtml(cachedHit.text, cachedHit.model) +
      '<div class="shrow"><button class="btn" id="intelGo">Check again ↻</button>' +
      '<span class="foot">last checked ' + agoLabel(cachedHit.at) + '</span></div>';
    host.appendChild(card);
    $("#intelGo").addEventListener("click", function () { askIntel(card, spot, sc); });
    return;
  }

  /* Nothing cached: just go and get it. Making someone find and press a
     button for the one thing on the page they cannot work out themselves
     was the wrong call. */
  var once = spot.id + "|" + sc.date;
  card.innerHTML = head + '<p class="foot">' + INTEL_BLURB + '</p>' +
    '<div class="shrow"><button class="btn btn-go" id="intelGo">Check this beach now</button></div>';
  host.appendChild(card);
  $("#intelGo").addEventListener("click", function () { askIntel(card, spot, sc); });

  if (!intelTried[once]) {
    intelTried[once] = true;
    askIntel(card, spot, sc);
  }
}

function agoLabel(at) {
  var m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " min ago";
  return Math.round(m / 60) + " h ago";
}

function askIntel(card, spot, sc) {
  var c = cfg();
  var head = '<div class="plan-head"><h3>Live check · ' + esc(spot.name) + '</h3></div>';
  card.innerHTML = head + '<p class="intel-load"><span class="spinner sm"></span> Asking Claude to search the web…</p>';

  var summary = mtr(sc.localHs) + " at " + (sc.tp == null ? "?" : Math.round(sc.tp) + " s") +
    ", " + windLabel(sc, spot) + ", tide " + tideLabel(sc.tide) +
    ", water " + (sc.sst == null ? "?" : r1(sc.sst) + " C");

  fetch(c.api + "/api/surf", {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, c.code ? { "X-Trip-Code": c.code } : {}),
    body: JSON.stringify({
      name: spot.name, town: spot.town, summary: summary,
      today: madridToday()
    })
  })
  .then(function (r) {
    if (r.status === 401) throw new Error("the Worker wants its access code");
    if (!r.ok) throw new Error("the Worker answered " + r.status);
    return r.json();
  }, function () {
    /* fetch() rejects with a bare "Failed to fetch" for DNS, CORS, a wrong
       URL and being offline alike, which tells nobody anything. */
    throw new Error("it did not answer — you are probably offline");
  })
  .then(function (d) {
    if (d && d.text) {
      intelPut(spot.id, sc.date, d);
      card.innerHTML = head + intelHtml(d.text, d.model) +
        '<div class="shrow"><button class="btn" id="intelGo">Check again ↻</button>' +
        '<span class="foot">just now</span></div>';
    } else {
      card.innerHTML = head +
        '<p>Live intel is not switched on for that Worker — it has no Anthropic key. ' +
        'Everything else on this page works regardless.</p>' +
        '<div class="shrow"><button class="btn" id="intelGo">Try again</button></div>';
    }
    $("#intelGo").addEventListener("click", function () { askIntel(card, spot, sc); });
  })
  .catch(function (err) {
    card.innerHTML = head + '<p>Could not reach the live check — ' + esc(err.message) + '.</p>' +
      '<div class="shrow"><button class="btn" id="intelGo">Try again</button></div>';
    $("#intelGo").addEventListener("click", function () { askIntel(card, spot, sc); });
  });
}

/* ═══════════════════════ deep links + the map ═══════════════════════ */

var KEY_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/* #spotId or #spotId/2026-09-17T07:00 — so a link reopens the same call. */
function readHash() {
  var h = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (!h) return;
  var parts = h.split("/");
  if (parts[0] && SPOTS.some(function (sp) { return sp.id === parts[0]; })) S.spotId = parts[0];
  if (parts[1] && KEY_RE.test(parts[1])) S.sel = { key: parts[1] };
}
function writeHash() {
  var h = S.spotId ? S.spotId + (S.sel && S.sel.key ? "/" + S.sel.key : "") : "";
  try { history.replaceState(null, "", location.pathname + location.search + (h ? "#" + h : "")); }
  catch (e) { /* file:// and some in-app browsers refuse this */ }
}

/* ── the map ───────────────────────────────────────────────────────────
   Pins carry the score for the hour on screen, so the map answers "which
   way do I drive" at a glance. Selecting one drops a separate marker on
   the car park, because that is the thing you actually navigate to. */
var mapObj = null;

function destroyMap() {
  if (mapObj) { try { mapObj.remove(); } catch (e) {} mapObj = null; }
}

function buildMap(key) {
  var host = document.getElementById("spotMap");
  if (!host) return;
  if (typeof L === "undefined") {
    /* The CDN is blocked or offline. Say so rather than leaving a grey box. */
    host.classList.add("mapfail");
    host.innerHTML = '<p>The map library did not load — you are probably offline, or a ' +
      'network is blocking the CDN. Everything else on this page still works, and every ' +
      'spot below has a direct link to its car park in Google Maps.</p>';
    return;
  }
  host.classList.remove("mapfail");
  destroyMap();

  var pinned = S.spotId ? S.model.spots.filter(function (e) { return e.spot.id === S.spotId; })[0] : null;
  var pk = parseKey(key);
  var list = spotsInRange().filter(function (e) {
    return (pinned && pinned.spot.id === e.spot.id) || passesFilters(e.spot, pk.date, pk.hour);
  });

  mapObj = L.map(host, { scrollWheelZoom: false, attributionControl: true });
  var street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: "© OpenStreetMap"
  });
  var sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 18, attribution: "Imagery © Esri"
  });
  sat.addTo(mapObj);
  L.control.layers({ "Satellite": sat, "Map": street }, null, { position: "topright" }).addTo(mapObj);

  var pts = [];
  list.forEach(function (e) {
    var r = rowAt(e, key);
    if (!r) return;
    var shown = r.dark ? Math.min(r.score, 8) : r.score;
    var col = scoreSolid(shown);
    var on = pinned && pinned.spot.id === e.spot.id;
    var icon = L.divIcon({
      className: "",
      html: '<span class="mpin' + (on ? " mpin-on" : "") + '" style="background:' + col.bg + ';color:' + col.ink + '">' +
            (r.dark ? "·" : r.score) + '</span>',
      iconSize: [26, 26], iconAnchor: [13, 13]
    });
    /* Better spots draw on top, so a good one is never hidden under a poor
       neighbour where the coast bunches up around Rota. */
    var m = L.marker([e.spot.lat, e.spot.lon], {
      icon: icon, title: e.spot.name, zIndexOffset: Math.round(shown) + (on ? 500 : 0)
    }).addTo(mapObj);
    m.bindPopup('<b>' + esc(e.spot.name) + '</b><br>' + esc(e.spot.town) + ' · ' + driveMin(e.spot) + ' min<br>' +
      mtr(r.localHs) + ' · ' + esc(windLabel(r, e.spot)) + '<br><i>' + band(r.score).word + '</i>');
    m.on("click", function () { S.spotId = e.spot.id; setView("now"); });
    pts.push([e.spot.lat, e.spot.lon]);
  });

  if (pinned) {
    var sp = pinned.spot;
    L.marker([sp.park.lat, sp.park.lon], {
      icon: L.divIcon({ className: "", html: '<span class="mpark">P</span>', iconSize: [24, 24], iconAnchor: [12, 12] }),
      title: sp.park.name
    }).addTo(mapObj).bindPopup('<b>Park here</b><br>' + esc(sp.park.name) + '<br>' + esc(sp.park.cost));
    L.polyline([[sp.park.lat, sp.park.lon], [sp.lat, sp.lon]],
      { color: "#B06A06", weight: 2, dashArray: "4 4", opacity: 0.9 }).addTo(mapObj);
    pts.push([sp.park.lat, sp.park.lon]);
    mapObj.setView([(sp.lat + sp.park.lat) / 2, (sp.lon + sp.park.lon) / 2], 14);
  } else if (pts.length) {
    mapObj.fitBounds(L.latLngBounds(pts).pad(0.12));
  } else {
    mapObj.setView([36.62, -6.36], 9);
  }
  setTimeout(function () { if (mapObj) mapObj.invalidateSize(); }, 120);
}

/* ════════════════════════════ view: SPOTS ════════════════════════════ */

var FILTER_CHIPS = [
  { id: "boards",   label: "Boards OK now", why: "hides beaches where the summer zone rule is in force at this hour" },
  { id: "beginner", label: "Forgiving",     why: "beginner-friendly beaches only" },
  { id: "freePark", label: "Free parking",  why: "no meter, no blue zone" },
  { id: "noRocks",  label: "Sand only",     why: "no reef, no rock shelf" }
];

function renderSpots() {
  var host = $("#v-spots");
  destroyMap();                       /* the container is about to be thrown away */
  host.innerHTML = "";
  var key = (S.sel && S.sel.key) || nowKey();

  var mapCard = el("section", "card");
  mapCard.innerHTML = '<h3>Where they are</h3>' +
    '<p class="foot">Every beach pinned with its score for this hour — tap one to open it. Selecting a beach also drops a <b>P</b> on its car park with a line to the water, because the car park is the thing you actually navigate to.</p>' +
    '<div id="spotMap" class="mapbox"></div>';
  host.appendChild(mapCard);
  /* A timer, not requestAnimationFrame: rAF does not fire while the tab is
     hidden or not compositing, which would leave the map permanently blank
     for anyone who opened the page in a background tab. */
  setTimeout(function () { buildMap(key); }, 0);

  var pk = parseKey(key);
  var head = el("section", "card");
  head.innerHTML = '<h3>Ranked for ' + esc(key === nowKey() ? "right now" : dayLabel(key.slice(0, 10)) + " at " + hhmm(+key.slice(11, 13))) + '</h3>' +
    '<p class="foot">' + SPOTS.length + ' beaches between Rota and Tarifa, scored against this hour and sorted best first. Every one lists where you actually leave the car.</p>' +
    '<div class="chips filters">' + FILTER_CHIPS.map(function (f) {
      return '<button class="chip fchip' + (S.filters[f.id] ? " on" : "") + '" data-f="' + f.id + '" ' +
        'aria-pressed="' + (S.filters[f.id] ? "true" : "false") + '" title="' + esc(f.why) + '">' + esc(f.label) + '</button>';
    }).join("") +
      '<button class="chip fchip' + (S.sortBy === "near" ? " on" : "") + '" id="nearBtn" ' +
        'title="Sort by how far each beach is from where you are standing">' +
        (S.me ? "Nearest to me" : "Find nearest to me") + '</button>' +
    '</div>';
  host.appendChild(head);

  $("#nearBtn").addEventListener("click", function () {
    var btn = this;
    if (S.me) { S.sortBy = S.sortBy === "near" ? "score" : "near"; render(); return; }
    if (!navigator.geolocation) { btn.textContent = "no location on this device"; return; }
    btn.textContent = "finding you…";
    navigator.geolocation.getCurrentPosition(function (p) {
      S.me = { lat: p.coords.latitude, lon: p.coords.longitude };
      S.sortBy = "near";
      render();
    }, function () {
      btn.textContent = "location refused";
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });

  $$(".fchip[data-f]", head).forEach(function (c) {
    c.addEventListener("click", function () {
      var id = c.getAttribute("data-f");
      S.filters[id] = !S.filters[id];
      render();
    });
  });

  /* the board rules, folded away but one tap from everywhere */
  var rules = el("section", "card rules");
  rules.innerHTML =
    '<details><summary><b>Can I bodyboard here?</b> <span>' + esc(RULES.headline) + '</span></summary>' +
    RULES.body.map(function (b) { return '<div class="rule"><b>' + esc(b.t) + '</b><p>' + esc(b.d) + '</p></div>'; }).join("") +
    '<p class="foot">' + esc(RULES.note) + '</p></details>';
  host.appendChild(rules);

  var list = spotsInRange()
    .filter(function (e) { return passesFilters(e.spot, pk.date, pk.hour); })
    .map(function (e) { return { e: e, r: rowAt(e, key) }; })
    .filter(function (x) { return x.r; });

  if (S.sortBy === "near" && S.me) {
    list.sort(function (a, b) {
      return (distanceFromMe(a.e.spot) || 1e9) - (distanceFromMe(b.e.spot) || 1e9);
    });
  } else {
    list.sort(function (a, b) { return b.r.score - a.r.score; });
  }

  if (S.me && list.length) {
    var near = list.slice().sort(function (a, b) {
      return (distanceFromMe(a.e.spot) || 1e9) - (distanceFromMe(b.e.spot) || 1e9);
    })[0];
    var nkm = distanceFromMe(near.e.spot);
    var note = el("section", "card nearcard");
    note.innerHTML = '<h3>Closest to you</h3>' +
      '<p><b>' + esc(near.e.spot.name) + '</b> — ' +
      (nkm < 10 ? r1(nkm) : Math.round(nkm)) + ' km away, scoring <b>' + near.r.score + '</b>/100 right now' +
      (near.r.score < 35 ? '. Closest is not the same as best — the ranked list below is by score.' : '.') + '</p>';
    host.appendChild(note);
  }

  if (!list.length) {
    host.appendChild(el("p", "empty", "No beach passes all of those filters at this hour. Turn one off."));
  }
  list.forEach(function (x) { host.appendChild(spotCard(x.e, x.r)); });

  var hidden = S.model.spots.length - list.length;
  if (hidden > 0) {
    host.appendChild(el("p", "empty", list.length + " of " + S.model.spots.length +
      " beaches shown — " + hidden + " filtered out by the drive limit or the chips above."));
  }
}

/* ── where to learn ─────────────────────────────────────────────────────
   Deliberately not the same question as "where is it best today". The main
   score rewards a steep, punchy, low-tide shorebreak, which is exactly the
   wave that holds a beginner under and breaks their nose. Learning wants the
   opposite: small, sandy, slack water, and somewhere you can stand up.      */

function learnScore(entry, sc) {
  var spot = entry.spot, hs = sc.localHs;

  /* knee to waist high is the whole window. Over about a metre it stops
     being a lesson and starts being a hiding. */
  var size;
  if (hs < 0.25) size = 8;                        /* not a lesson, a paddle */
  else if (hs <= 0.5) size = 45 + (hs - 0.25) / 0.25 * 50;
  else if (hs <= 0.85) size = 95;
  else size = clamp(95 - (hs - 0.85) * 105, 0, 95);

  /* sand, and only sand */
  var bottom = /reef|rock|coral|shelf/i.test((spot.bottom || "") + " " + (spot.type || "")) ? 20 : 100;

  var rip = [100, 50, 8][ripRisk(spot, sc).level];

  var lvl = spot.level === "beginner" ? 100 : spot.level === "all" ? 88
          : spot.level === "intermediate" ? 50 : 12;

  /* a longer period at this small a size means rolling whitewater rather
     than something that dumps on the sand */
  var gentle = sc.tp == null ? 60 : clamp(38 + (sc.tp - 5) * 9, 30, 100);

  /* clean is easier to read when you do not know what you are looking at */
  var wind = windScore(sc.wind, sc.windDir, spot.off);

  var crowd = /busy|hub/i.test(spot.crowd || "") ? 55 : 100;

  var v = 0.32 * size + 0.18 * bottom + 0.20 * rip + 0.13 * lvl +
          0.07 * gentle + 0.06 * wind + 0.04 * crowd;

  /* Safety, sand and a gentle reputation are worth nothing if there is no
     wave. Without this a dead flat beach scores in the sixties purely for
     being harmless, and gets recommended as somewhere to learn. */
  if (size < 35) v = Math.min(v, size + 8);

  return { score: clamp(Math.round(v), 0, 100),
           parts: { size: size, bottom: bottom, rip: rip, level: lvl, gentle: gentle, wind: wind } };
}

/* The best hour to have a first go, today, at a beach you can drive to. */
function bestLearnToday(date) {
  var day = date || madridToday();
  var best = null;
  spotsInRange().forEach(function (e) {
    var spot = e.spot;
    e.rows.forEach(function (r) {
      if (r.date !== day || r.dark) return;
      if (boardRule(spot, day, r.hour).restricted) return;   /* has to be legal */
      var L = learnScore(e, r);
      /* A first lesson is an hour in the whitewater, not a swell chase, so
         distance counts for more here than it does in the main plan. */
      var v = L.score - Math.max(0, driveMin(spot) - 25) * 0.16;
      if (!best || v > best.v) best = { entry: e, spot: spot, row: r, L: L, v: v };
    });
  });
  if (!best) return null;

  /* widen the peak hour into the run that stays close to it */
  var floor = best.L.score - 10;
  var from = best.row.hour, to = best.row.hour;
  var byHour = {};
  best.entry.rows.forEach(function (r) { if (r.date === day) byHour[r.hour] = r; });
  var holds = function (h) {
    var r = byHour[h];
    return r && !r.dark && !boardRule(best.spot, day, h).restricted &&
           learnScore(best.entry, r).score >= floor;
  };
  /* Cap it: on a uniformly mediocre day the run would otherwise stretch
     from first light to dusk, which is not a window, it is a date. */
  while (holds(from - 1) && best.row.hour - from < 2) from--;
  while (holds(to + 1) && to - best.row.hour < 2) to++;

  /* If it is sending you a long way, justify it: what is the best you could
     do without leaving the area? */
  var nearBest = null;
  spotsInRange().forEach(function (e) {
    if (driveMin(e.spot) > 25) return;
    e.rows.forEach(function (r) {
      if (r.date !== day || r.dark) return;
      if (boardRule(e.spot, day, r.hour).restricted) return;
      var L = learnScore(e, r);
      if (!nearBest || L.score > nearBest.score) nearBest = { score: L.score, spot: e.spot, row: r };
    });
  });

  return { pick: best, from: from, to: to, date: day, near: nearBest };
}

/* Today may simply not be a day to learn on. Look ahead rather than dressing
   up a flat sea as a lesson. */
function nextLearnDay() {
  for (var i = 0; i < S.model.days.length; i++) {
    var lr = bestLearnToday(S.model.days[i]);
    if (lr && lr.pick.L.score >= 55) return lr;
  }
  return null;
}

function esc0(t) { return String(t == null ? "" : t); }
function learnWhy(lr) {
  var p = lr.pick.L.parts, r = lr.pick.row, spot = lr.pick.spot, out = [];
  out.push(r.localHs < 0.25
    ? "It is almost flat, which is not much of a lesson but is at least safe"
    : r.localHs <= 0.9
      ? mtr(r.localHs) + " is about right — big enough to push you along, small enough to be harmless"
      : "At " + mtr(r.localHs) + " it is on the big side for a first go; stay in the whitewater");
  if (p.bottom === 100) out.push("it is sand the whole way, with no reef to land on");
  if (p.rip >= 100) out.push("there is essentially no rip running");
  else if (p.rip >= 50) out.push("the rip risk is only moderate");
  if (spot.level === "beginner" || spot.level === "all") out.push("and it is a forgiving beach in the first place");
  var s = out.join(", ");
  s = s.charAt(0).toUpperCase() + s.slice(1) + ".";

  /* If it only won because everything else was flat, do not let the good
     news bury the reason it is a compromise. */
  if (p.bottom < 100) {
    s += " Be aware this is not clean sand — " + esc0(spot.bottom) + ", which is not what you want " +
         "underneath you on a first go. It is here because nothing better is working.";
  }
  if (p.level < 60) {
    s += " It is also not a beginner's beach by reputation.";
  }
  return s;
}

/* ── a recommendation for each beach, in words ──────────────────────────
   A score of 41 means nothing to someone who has not spent a season reading
   them. Each beach gets a sentence instead: go, go later, or do not bother —
   and the reason, taken from whichever part of the score is actually letting
   it down. */
function spotAdvice(entry, sc) {
  var spot = entry.spot;
  var best = bestWindowForSpot(entry);
  var now = sc.score;
  var law = boardRule(spot, sc.date, sc.hour);

  /* what is holding it back right now */
  var parts = sc.parts, weakest = null;
  ["size", "wind", "dir", "period", "tide"].forEach(function (k) {
    if (!weakest || parts[k] < parts[weakest]) weakest = k;
  });
  var BLAME = {
    size: "there is not enough swell reaching it",
    wind: "the wind is wrong for it",
    dir: "the swell is coming from the wrong angle to get in here",
    period: "the swell is too short and gutless",
    tide: "the tide is on the wrong half of the cycle for this beach"
  };

  /* Is it better later today than it is this minute? Saying "not today" when
     the best window is three hours away is just wrong. */
  var laterToday = best && best.date === sc.date && best.peak.hour > sc.hour &&
                   best.peak.score >= Math.max(now + 10, 40);

  var verdict, tone, why;
  if (laterToday && now < 62) {
    verdict = "Later today"; tone = "ok";
    why = "Not much use this minute — " + BLAME[weakest] + " — but it comes good at " +
          hhmm(best.from) + "–" + hhmm(best.to + 1) + ", scoring " + best.peak.score + ".";
  } else if (law.restricted && now >= 46) {
    verdict = "Not right now"; tone = "warn";
    why = "It is working, but the towers are up and boards are out of the buoyed zone until " +
          pad(GUARD_OFF) + ":00. Go early, go late, or walk past the buoys.";
  } else if (now >= 62) {
    verdict = "Go"; tone = "go";
    why = "This is genuinely good right now — " + mtr(sc.localHs) + " with " + windLabel(sc, spot) + ".";
  } else if (now >= 46) {
    verdict = "Worth a look"; tone = "ok";
    why = "Rideable rather than memorable. " + capitalise(BLAME[weakest]) + ", but you will catch waves.";
  } else if (now >= 30) {
    verdict = "Marginal"; tone = "meh";
    why = capitalise(BLAME[weakest]) + ". Fine if you just want to be in the water.";
  } else {
    verdict = "Not today"; tone = "no";
    why = capitalise(BLAME[weakest]) + ".";
  }

  var later = "";
  if (laterToday) {
    later = "";                                   /* already said in the verdict */
  } else if (best && best.peak.score >= Math.max(now + 12, 40)) {
    later = "Best window: " + dayLabel(best.date) + " " + hhmm(best.from) + "–" +
      hhmm(best.to + 1) + ", scoring " + best.peak.score + ".";
  } else if (best && best.peak.score < 30) {
    later = "It does not come good at any point in the next " + DAYS + " days either.";
  }
  return { verdict: verdict, tone: tone, why: why, later: later, best: best };
}

/* ── where the parking claim comes from ─────────────────────────────────
   The description beside it is mine. This line is not: it is a car park
   that is actually mapped on the ground, with whatever the map records
   about it, and it is what the directions link points at. Saying which is
   which matters more than sounding confident about both. */
function parkingProof(spot) {
  var o = spot.park.osm;
  if (!o) {
    return '<p class="proof proof-none">No car park is mapped at this beach, so the pin below is my own ' +
      'estimate from the access road rather than a surveyed one. Expect to park on the verge.</p>';
  }
  var bits = [];
  if (o.fee === "no") bits.push("free");
  else if (o.fee === "yes") bits.push("charges a fee");
  if (o.capacity) bits.push("about " + o.capacity + " spaces");
  if (o.surface === "unpaved" || o.surface === "ground" || o.surface === "dirt") bits.push("unsurfaced");
  else if (o.surface === "asphalt" || o.surface === "concrete") bits.push("surfaced");

  return '<p class="proof"><b>✓ Verified</b> — ' +
    (o.name ? esc(o.name) + ', ' : "a public car park ") +
    o.m + ' m from the water' + (bits.length ? ', ' + esc(bits.join(", ")) : "") + '. ' +
    (o.near > 1 ? o.near + ' car parks are mapped within 900 m of this beach; this is the closest usable one. ' : "") +
    '<em>Source: OpenStreetMap, checked ' + esc(PARK_CHECKED) + '.</em></p>';
}
var PARK_CHECKED = "12 September 2026";

var BBTAG = {
  open:     { t: "Boards OK year-round", c: "ok" },
  seasonal: { t: "Summer zone rule", c: "warn" }
};

function spotCard(entry, sc) {
  var spot = entry.spot;
  var b = band(sc.score), col = scoreCell(sc.score);
  var tag = BBTAG[spot.bb.status] || BBTAG.open;
  var card = el("section", "card spot");
  var mapsTo = function (la, lo) {
    return "https://www.google.com/maps/dir/?api=1&destination=" + la + "," + lo + "&travelmode=driving";
  };
  var km = distanceFromMe(spot);
  var adv = spotAdvice(entry, sc);

  card.innerHTML =
    '<div class="spot-head">' +
      '<span class="spot-score" style="background:' + col.bg + ';color:' + col.ink + '">' + sc.score + '</span>' +
      '<div class="spot-id"><h3>' + esc(spot.name) + '</h3>' +
        '<p class="sub">' + esc(spot.town) + ' · ' + driveMin(spot) + ' min from ' + esc(originLabel()) +
        (km != null ? ' · <b>' + (km < 10 ? r1(km) : Math.round(km)) + ' km from you</b>' : '') +
        ' · ' + esc(spot.type) + ' · ' + esc(spot.level) + '</p></div>' +
      '<span class="bb bb-' + tag.c + '">' + tag.t + '</span>' +
    '</div>' +
    '<div class="verdict-box v-' + adv.tone + '">' +
      '<b>' + esc(adv.verdict) + '</b>' +
      '<p>' + esc(adv.why) + '</p>' +
      (adv.later ? '<p class="verdict-later">' + esc(adv.later) + '</p>' : '') +
    '</div>' +
    '<p class="spot-now">' + mtr(sc.localHs) + ' · ' + (sc.tp == null ? "—" : Math.round(sc.tp) + ' s') +
      ' · ' + esc(windLabel(sc, spot)) + ' · tide ' + esc(tideLabel(sc.tide)) +
      ' · <b>' + sc.score + '</b>/100</p>' +
    '<details><summary>Parking, rules, hazards</summary>' +
      '<div class="sec"><b class="lbl">Park here</b><p>' + esc(spot.park.name) + '</p>' +
        '<p class="foot">' + esc(spot.park.cost) + ' · ' + esc(spot.park.walk) + ' walk</p>' +
        '<p>' + esc(spot.park.note) + '</p>' +
        parkingProof(spot) +
        '<p><a class="link" target="_blank" rel="noopener" href="' +
          mapsTo(spot.park.osm ? spot.park.osm.lat : spot.park.lat,
                 spot.park.osm ? spot.park.osm.lon : spot.park.lon) + '">Drive to the car park ↗</a>' +
        ' · <a class="link" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + spot.lat + ',' + spot.lon + '">See the break ↗</a></p></div>' +
      '<div class="sec"><b class="lbl">Bodyboarding</b><p>' + esc(spot.bb.rule) + '</p>' +
        '<p class="proof proof-none">Basis: ' + esc(spot.bb.basis || "local practice") + '. Beach ordinances are ' +
        're-issued most springs and each town words its own differently, so this is the shape of the rule ' +
        'rather than a quotation. The flag flying on the day is the authority, and the Live check reads ' +
        'what is true this week.</p></div>' +
      '<div class="sec"><b class="lbl">Watch out for</b><ul>' +
        spot.hazards.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join("") + '</ul></div>' +
      (spot.kit && spot.kit.length ? '<div class="sec"><b class="lbl">Bring</b><p>' + esc(spot.kit.join(" · ")) + '</p></div>' : "") +
      '<div class="sec"><b class="lbl">What it is</b><p>' + esc(spot.why) + '</p>' +
        '<p class="tip">' + esc(spot.tip) + '</p>' +
        '<p class="foot">Faces ' + compass(spot.face) + ' · works on ' + compass(spot.win[0]) + '–' + compass(spot.win[1]) +
        ' swell · offshore in a ' + compass(spot.off) + ' wind · best on the ' + esc(spot.tide) + ' tide · ' + esc(spot.crowd) + '.</p></div>' +
    '</details>';
  card.querySelector(".spot-head").addEventListener("click", function () {
    S.spotId = spot.id; setView("now");
  });
  return card;
}

/* ════════════════════════════ view: LIVE ════════════════════════════ */

function renderLive() {
  var host = $("#v-live"); host.innerHTML = "";

  var map = el("section", "card");
  map.innerHTML = '<h3>The swell, moving</h3>' +
    '<p class="foot">Live animated wave model over the Gulf of Cádiz. Rota is the pin. Pinch to zoom; the layer buttons switch between waves, wind and swell period.</p>' +
    '<div class="embed"><iframe title="Live wave map for the Gulf of Cádiz" ' +
      'src="https://embed.windy.com/embed2.html?lat=36.45&lon=-6.55&detailLat=36.625&detailLon=-6.361&zoom=8&overlay=waves&menu=&message=true&marker=true&calendar=now&type=map&location=coordinates&metricWind=kt&metricTemp=%C2%B0C&radarRange=-1" ' +
      'frameborder="0"></iframe></div>' +
    '<p class="foot">Map by Windy.com, running the ECMWF wave model — the same model that feeds one third of the confidence band on this site.</p>';
  host.appendChild(map);

  var cams = el("section", "card");
  cams.innerHTML = '<h3>Beach cameras</h3>' +
    '<p class="foot">These camera sites block being embedded in another page, so each one opens in a new tab rather than pretending to work here. There is no public camera pointed at Rota’s own beaches — Las Redes, twenty minutes away, is the closest live view.</p>' +
    '<div class="camlist">' + CAMS.map(function (c) {
      return '<a class="cam" target="_blank" rel="noopener" href="' + esc(c.url) + '">' +
        '<span class="cam-top"><b>' + esc(c.name) + '</b><em>' + esc(c.dist) + '</em></span>' +
        '<span class="cam-town">' + esc(c.town) + '</span>' +
        '<span class="cam-note">' + esc(c.note) + '</span>' +
        '<span class="cam-by">' + esc(c.by) + ' ↗</span></a>';
    }).join("") + '</div>';
  host.appendChild(cams);

  var inst = el("section", "card");
  inst.innerHTML = '<h3>Keep it on your phone</h3>' +
    '<p class="foot">Installed, it opens from your home screen like an app and still shows the last forecast it managed to download when you have no signal — which, on the road down to El Palmar, you often will not.</p>' +
    '<div class="shrow">' +
      '<button id="installBtn" class="btn hidden">Add to home screen</button>' +
      '<span class="foot">On iPhone: Share → <b>Add to Home Screen</b>. On Android the button above appears once Chrome is happy to install it.</span>' +
    '</div>';
  host.appendChild(inst);
  var ib = $("#installBtn");
  if (deferredInstall && ib) ib.classList.remove("hidden");
  if (ib) ib.addEventListener("click", function () {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    deferredInstall.userChoice.then(function () { deferredInstall = null; ib.classList.add("hidden"); });
  });

  var src = el("section", "card");
  var s = S.model.sources;
  var row = function (id, label) {
    var r = s[id];
    return '<li class="' + (r && r.ok ? "src-ok" : "src-bad") + '"><b>' + esc(label) + '</b>' +
      '<span>' + (r && r.ok ? "live" : "unavailable — " + esc((r && r.err) || "not loaded")) + '</span></li>';
  };
  src.innerHTML = '<h3>Where the numbers come from</h3>' +
    '<ul class="srclist">' +
      row("marine", "Waves, swell, sea temperature, tide — Open-Meteo Marine") +
      row("atmo", "Wind, air, UV, rain, sunrise — Open-Meteo") +
      row("wavespread", "ECMWF WAM · Météo-France MFWAM · NOAA GFS-Wave") +
      row("windspread", "ECMWF IFS · NOAA GFS · DWD ICON") +
    '</ul>' +
    '<p class="foot">Four independent numerical models from four agencies. The headline number is the best-match blend; the other three are what the confidence badge measures — when they disagree, you are told so instead of being given false precision.</p>' +
    '<p class="foot">Last refreshed ' + new Date(S.model.at).toLocaleString() +
      (S.model.stale ? ' — <b>this is the cached copy;</b> the live fetch failed, so treat it as out of date.' : '') + '</p>' +
    '<p class="foot">Forecasts are forecasts. Tide, wave and wind models are good three days out and guesswork at seven. Look at the beach before you paddle out, and never argue with a red flag.</p>';
  host.appendChild(src);
}

/* ════════════════════════════ view: GUIDE ════════════════════════════
   Everything on this site is a number with a reason behind it, and none of
   that is obvious from looking at it. This tab says what each thing is, what
   the flags on the beach mean, and what to actually do with the site.      */

function renderGuide() {
  var host = $("#v-guide"); host.innerHTML = "";

  /* — how to use it — */
  var how = el("section", "card");
  how.innerHTML = '<h3>How to use this</h3>' +
    '<p class="foot">Four ways in, depending on how much you want to think about it.</p>' +
    '<ol class="steps">' + (window.__SURF_HOWTO__ || []).map(function (h) {
      return '<li><b>' + esc(h.t) + '</b><p>' + esc(h.d) + '</p></li>';
    }).join("") + '</ol>';
  host.appendChild(how);

  /* — the flags — */
  var flags = el("section", "card");
  flags.innerHTML = '<h3>The flags on the beach</h3>' +
    '<p class="foot">These are the Spanish national colours, flown at lifeguarded beaches in season. ' +
    'They beat everything on this site: a forecast is a guess about the sea, a flag is a person ' +
    'standing on it looking at it.</p>' +
    '<div class="flags">' + (window.__SURF_FLAGS__ || []).map(function (f) {
      return '<div class="flagrow">' +
        '<span class="flagchip" style="background:' + f.hex + '"' +
          (f.c === "none" ? ' data-none="1"' : '') + ' aria-hidden="true"></span>' +
        '<div><b>' + esc(f.name) + '</b><span class="flagshort">' + esc(f.short) + '</span>' +
        '<p>' + esc(f.d) + '</p></div></div>';
    }).join("") + '</div>' +
    '<p class="foot">Red means out of the water, board included, and it is fined. If a lifeguarded ' +
    'beach is red but the surf is genuinely good, that is the day to drive to one with no tower.</p>';
  host.appendChild(flags);

  /* — what every number means — */
  var groups = [];
  (window.__SURF_GLOSSARY__ || []).forEach(function (g) {
    var row = groups.filter(function (x) { return x.name === g.g; })[0];
    if (!row) { row = { name: g.g, items: [] }; groups.push(row); }
    row.items.push(g);
  });
  var gloss = el("section", "card");
  gloss.innerHTML = '<h3>What every number means</h3>' +
    '<p class="foot">Tap a heading. Each one says what the thing is, why it matters on a bodyboard, ' +
    'and what a good value looks like on this coast.</p>' +
    groups.map(function (grp) {
      return '<div class="gterms"><span class="lbl">' + esc(grp.name) + '</span>' +
        grp.items.map(function (it) {
          return '<details class="gterm"><summary>' + esc(it.t) + '</summary>' +
            '<p>' + esc(it.what) + '</p>' +
            '<p class="gwhy"><b>Why it matters:</b> ' + esc(it.why) + '</p>' +
            '<p class="ggood"><b>Good looks like:</b> ' + esc(it.good) + '</p></details>';
        }).join("") + '</div>';
    }).join("");
  host.appendChild(gloss);

  /* — the score, spelled out — */
  var sc = el("section", "card");
  sc.innerHTML = '<h3>How the score is worked out</h3>' +
    '<p class="foot">Five things, weighted for a bodyboard rather than a surfboard — a sponge wants a ' +
    'steeper, punchier, shallower wave, is happy at half the size a longboard needs, and likes the ' +
    'low-tide shorebreak a surfer would call a closeout.</p>' +
    '<div class="bars">' +
      bar("Size", 30, "how close to this beach's own sweet spot, not how big in absolute terms") +
      bar("Wind", 24, "offshore holds the wave up, onshore flattens it — the biggest single factor") +
      bar("Period", 16, "long period is a distant storm and has power; short is local chop") +
      bar("Tide", 15, "matched to the tide this particular beach works on") +
      bar("Direction", 15, "whether the swell angle actually gets past the headlands to this beach") +
    '</div>' +
    '<p class="foot">Then penalties scale it down for squally gusts, rain and short-period slop, and ' +
    'anything under about 0.3 m is called flat however good the rest looks.</p>' +
    '<div class="bandkey">' + BANDS.slice().reverse().map(function (b) {
      return '<div><span class="bandchip" style="background:' + scoreCell(Math.max(b.min, 0) + 8).bg + '"></span>' +
        '<b>' + esc(b.word) + '</b> <em>' + (b.min < 0 ? "under 14" : b.min + "+") + '</em>' +
        '<p>' + esc(b.d) + '</p></div>';
    }).join("") + '</div>';
  host.appendChild(sc);

  /* — where the numbers come from — */
  var src = el("section", "card");
  src.innerHTML = '<h3>Where it all comes from</h3>' +
    '<p>Four independent weather models from four agencies — ECMWF, Météo-France, NOAA and DWD — ' +
    'read ten days ahead for all ' + SPOTS.length + ' beaches at once. Nothing here needs an account ' +
    'or a key.</p>' +
    '<p class="foot">The headline figure is the best-match blend. The others are what the confidence ' +
    'badge measures: when they disagree, you are told so instead of being handed false precision. ' +
    'The local knowledge — which tide a beach wants, where the car park is, where the stone fish ' +
    'traps lie at Candor — is written into the site, not forecast. The Live check is the one part ' +
    'that goes and reads the web for what is true today.</p>' +
    '<p class="foot">Forecasts are forecasts. Look at the sea before you paddle out, and never ' +
    'argue with a red flag.</p>';
  host.appendChild(src);
}

/* ════════════════════════════ chrome + boot ════════════════════════════ */

function renderHeader() {
  var sel = $("#spotSel");
  if (sel && !sel.dataset.filled) {
    var opts = ['<option value="">Best spot for me</option>'];
    var zones = {};
    S.model.spots.forEach(function (e) { (zones[e.spot.zone] = zones[e.spot.zone] || []).push(e.spot); });
    Object.keys(zones).forEach(function (z) {
      opts.push('<optgroup label="' + esc(z) + '">');
      zones[z].forEach(function (sp) {
        opts.push('<option value="' + esc(sp.id) + '">' + esc(sp.name) + ' · ' + sp.drive + ' min</option>');
      });
      opts.push("</optgroup>");
    });
    sel.innerHTML = opts.join("");
    sel.dataset.filled = "1";
  }
  if (sel) sel.value = S.spotId || "";
  var org2 = $("#originSel");
  if (org2) org2.value = S.origin;

  var when = $("#whenBar");
  if (when) {
    var key = (S.sel && S.sel.key) || nowKey();
    var isNow = key === nowKey();
    when.innerHTML = isNow
      ? '<span class="lbl">showing right now · ' + esc(MTIME.format(new Date())) + ' in Spain</span>'
      : '<span class="lbl">showing ' + esc(dayLabel(key.slice(0, 10)) + " at " + hhmm(+key.slice(11, 13))) + '</span>' +
        '<button id="backNow" class="mini">back to now</button>';
    var bn = $("#backNow");
    if (bn) bn.addEventListener("click", function () { S.sel = null; render(); });
  }
}

function setView(v) {
  S.view = v;
  $$(".tab").forEach(function (t) { t.classList.toggle("on", t.getAttribute("data-view") === v); });
  $$(".panel").forEach(function (p) { p.classList.toggle("hidden", p.id !== "v-" + v); });
  render();
  window.scrollTo({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
}

function render() {
  if (!S.model) return;
  writeHash();
  renderHeader();
  if (S.view === "now") renderNow();
  else if (S.view === "grid") renderGrid();
  else if (S.view === "spots") renderSpots();
  else if (S.view === "live") renderLive();
  else if (S.view === "guide") renderGuide();
}

function showError(msg) {
  $("#boot").classList.add("hidden");
  var host = $("#v-now");
  host.innerHTML = '<section class="card"><h3>Could not reach the forecast</h3>' +
    '<p>' + esc(msg) + '</p>' +
    '<p class="foot">Everything here comes from Open-Meteo, which needs no key but does need a connection. ' +
    'If you have opened this page before, there may be a cached copy — otherwise try again in a moment.</p>' +
    '<p><button id="retry" class="mini">Try again</button></p></section>';
  var r = $("#retry"); if (r) r.addEventListener("click", boot);
}

function boot() {
  $("#boot").classList.remove("hidden");
  $("#bootMsg").textContent = "Reading four wave and weather models…";

  /* Show the cached copy immediately so the page is never blank, then
     replace it the moment the live data lands. */
  var cached = readCache();
  if (cached && Date.now() - cached.at < 12 * 3600 * 1000) {
    try {
      S.model = buildModel(cached);
      S.model.stale = Date.now() - cached.at > CACHE_MAX_AGE;
      $("#boot").classList.add("hidden");
      $("#app").classList.remove("hidden");
      render();
    } catch (e) { /* fall through to the live load */ }
  }

  loadAll().then(function (raw) {
    S.model = buildModel(raw);
    if (!S.model.spots.length) throw new Error("The models returned no usable hours.");
    /* A shared link can outlive its forecast window — fall back to now. */
    if (S.sel && S.model.hours.indexOf(S.sel.key) < 0) S.sel = null;
    $("#boot").classList.add("hidden");
    $("#app").classList.remove("hidden");
    render();
  }).catch(function (e) {
    if (S.model) {              /* the cached copy is already on screen */
      S.model.stale = true;
      var w = $("#whenBar");
      if (w) w.insertAdjacentHTML("beforeend", '<span class="stale">offline — cached</span>');
      return;
    }
    showError(String(e.message || e));
  });
}

/* A read-only handle on the live model, so conditions can be inspected from
   the console without re-deriving any of this by hand. */
window.__SURF_STATE__ = S;

/* ── install to the home screen ──────────────────────────────────────── */
var deferredInstall = null;
window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault();
  deferredInstall = e;
  var b = $("#installBtn");
  if (b) b.classList.remove("hidden");
});
window.addEventListener("appinstalled", function () { deferredInstall = null; });

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  var secure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!secure) return;
  /* A worker that takes over mid-session may be serving different files from
     the ones this page loaded. Reload once, and only once, so the page and
     its assets always agree. */
  var reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register("./sw.js").catch(function () { /* offline shell is a bonus, not a requirement */ });
}

/* ── events ── */
document.addEventListener("DOMContentLoaded", function () {
  $$(".tab").forEach(function (t) {
    t.addEventListener("click", function () { setView(t.getAttribute("data-view")); });
  });
  var sel = $("#spotSel");
  if (sel) sel.addEventListener("change", function () {
    S.spotId = sel.value || null; render();
  });
  var org = $("#originSel");
  if (org) {
    org.value = S.origin;
    org.addEventListener("change", function () {
      var want = this.value;
      if (want === "me" && !S.me) {
        if (!navigator.geolocation) { this.value = S.origin; return; }
        var sel = this;
        navigator.geolocation.getCurrentPosition(function (p) {
          S.me = { lat: p.coords.latitude, lon: p.coords.longitude };
          S.origin = "me";
          try { localStorage.setItem("rotasurf.origin", S.origin); } catch (e) {}
          if (S.plan) S.plan = recommend();
          render();
        }, function () { sel.value = S.origin; });
        return;
      }
      S.origin = want;
      try { localStorage.setItem("rotasurf.origin", S.origin); } catch (e) {}
      if (S.plan) S.plan = recommend();
      render();
    });
  }

  var drv = $("#driveSel");
  if (drv) drv.addEventListener("change", function () {
    S.maxDrive = +drv.value || 999;
    if (S.spotId) {
      var still = S.model && spotsInRange().some(function (e) { return e.spot.id === S.spotId; });
      if (!still) S.spotId = null;
    }
    render();
  });
  var th = $("#themeBtn");
  if (th) th.addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme");
    var next = cur === "dark" ? "light" : cur === "light" ? "" : "dark";
    if (next) document.documentElement.setAttribute("data-theme", next);
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("rotasurf.theme", next); } catch (e) {}
  });
  try {
    var g = JSON.parse(localStorage.getItem("rotasurf.gear") || "null");
    if (g) {
      if (g.when) S.when = g.when;
      if (g.gear) S.gear = { fins: g.gear.fins !== false, suit: g.gear.suit || "full" };
    }
    var o = localStorage.getItem("rotasurf.origin");
    /* "me" needs a fresh fix each session, so it is not restored. */
    if (o === "town" || o === "base") S.origin = o;
  } catch (e) { /* private mode */ }

  try {
    var saved = localStorage.getItem("rotasurf.theme");
    if (saved) document.documentElement.setAttribute("data-theme", saved);
  } catch (e) {}

  registerSW();
  readHash();
  window.addEventListener("hashchange", function () {
    var before = S.spotId + "|" + (S.sel && S.sel.key);
    readHash();
    if (S.model && before !== S.spotId + "|" + (S.sel && S.sel.key)) { setView("now"); }
  });

  boot();

  /* Keep it honest if the phone sits in a pocket for an hour. */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden || !S.model) return;
    if (Date.now() - S.model.at > CACHE_MAX_AGE) boot();
    else render();
  });
  window.addEventListener("resize", function () {
    if (S.view === "now") { var p = currentPick(), cv = $("#waveCv"); if (p && cv) drawWave(cv, p.row, p.entry.spot); }
  });
});

})();
