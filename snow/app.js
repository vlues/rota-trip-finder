/* Rota Snow Finder — engine.
   Live weather and snow for every resort come from Open-Meteo (keyless,
   CORS-open): one batched call for the hourly "right now" numbers and one for
   the sixteen-day daily forecast, both at the base and the top of each hill.
   Season, price tier and crowds are worked out from the date. The Live check
   asks Claude, through the site's Worker, for today's price and lift status. */
(function () {
  "use strict";

  const R = window.__SNOW_RESORTS__ || [];
  const ORIGIN = window.__SNOW_ORIGIN__;
  const HOL = window.__SNOW_HOLIDAYS__ || [];
  const CLIMO = window.__SNOW_CLIMO__ || {};
  const LEARN = window.__SNOW_LEARN__, GEAR = window.__SNOW_GEAR__, TRIP = window.__SNOW_TRIP__, GLOSS = window.__SNOW_GLOSSARY__ || [];
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const byId = Object.fromEntries(R.map((r) => [r.id, r]));
  const NEAREST = byId["sierra-nevada"];

  const state = {
    view: "now", date: todayISO(), gridResort: "sierra-nevada",
    wx: null, wxAt: 0, wxStale: false, wxErr: null,
    filter: "all", sort: "drive", intel: {}, tileNote: null,
  };
  window.__SNOW_STATE__ = state;

  /* ---------- dates ---------- */
  function todayISO() { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
  const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function longDate(d) { return DOW[d.getDay()] + " " + d.getDate() + " " + MON[d.getMonth()]; }
  function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }
  function holidayFor(s) { return HOL.find((h) => s >= h.from && s <= h.to) || null; }

  /* The season straddles New Year. A date from July on belongs to the season
     that opens that autumn; a date before July to the one that opened the
     autumn before. */
  function seasonFor(r, d) {
    const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
    const open = parseISO(y + "-" + r.season.open);
    const close = parseISO((y + 1) + "-" + r.season.close);
    const nextOpen = parseISO((y + 1) + "-" + r.season.open);
    if (d < open) return { code: "before", open, close, daysTo: daysBetween(d, open) };
    if (d > close) return { code: "after", open: nextOpen, close, daysTo: daysBetween(d, nextOpen) };
    return { code: "in", open, close, daysLeft: daysBetween(d, close) };
  }
  function priceTier(d) {
    const h = holidayFor(iso(d));
    if (h) return { tier: "high", why: h.name };
    if (isWeekend(d)) return { tier: "high", why: "weekend" };
    return { tier: "low", why: "weekday" };
  }
  function crowd(d) {
    const h = holidayFor(iso(d));
    if (h) return { level: 3, text: "Packed — " + h.name + ". Car parks full by nine, lift queues, lessons sold out." };
    if (d.getDay() === 6) return { level: 2, text: "Busy — a Saturday. Be in the car park before nine and book the lesson." };
    if (d.getDay() === 0) return { level: 2, text: "Busy, but Sunday empties after lunch." };
    return { level: 1, text: "Quiet — a weekday. The best day to learn." };
  }
  function climoFor(r, month) {
    const key = r.id === "sierra-nevada" ? "sierra-nevada"
      : r.tags.includes("pyrenees") ? "pyrenees"
      : /Madrid|Segovia|Salamanca|Teruel/.test(r.area + r.region) ? "central" : "north";
    return (CLIMO[key] || {})[month] || null;
  }
  function fmtH(min) { const h = Math.floor(min / 60), m = min % 60; return m ? h + " h " + pad(m) : h + " h"; }
  function euro(n) { return "€" + n; }
  function beginnerDay(r, d) { const t = priceTier(d); return (t.tier === "high" ? r.price.high : r.price.low) + r.price.rentSki + r.price.lessonGroup + r.price.parking; }
  function leaveAt(r) { const arrive = 9 * 60 + 15, leave = arrive - r.driveMin - 15; const h = Math.floor(leave / 60), m = leave % 60; return (h < 0 ? "the night before" : pad(h) + ":" + pad(m)); }

  /* ---------- weather ---------- */
  const WX_KEY = "snow.wx.v1";
  const HOURLY = "snow_depth,temperature_2m,freezing_level_height,wind_speed_10m,weather_code";
  const DAILY = "snowfall_sum,temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max,precipitation_sum,sunrise,sunset";
  function pts() {
    const lat = [], lon = [], el = [];
    R.forEach((r) => { lat.push(r.lat, r.top.lat); lon.push(r.lon, r.top.lon); el.push(r.elev, r.top.elev); });
    return "latitude=" + lat.join(",") + "&longitude=" + lon.join(",") + "&elevation=" + el.join(",") + "&timezone=Europe%2FMadrid";
  }
  async function loadWx() {
    try {
      const c = JSON.parse(localStorage.getItem(WX_KEY) || "null");
      if (c && c.at && Date.now() - c.at < 6 * 3600e3) { state.wx = c.wx; state.wxAt = c.at; state.wxStale = false; }
      else if (c && c.wx) { state.wx = c.wx; state.wxAt = c.at; state.wxStale = true; }
    } catch (e) {}
    if (state.wx && !state.wxStale) { renderAll(); return; }
    renderAll();
    try {
      const base = "https://api.open-meteo.com/v1/forecast?" + pts();
      const [h, d] = await Promise.all([
        fetch(base + "&hourly=" + HOURLY + "&forecast_days=3").then((x) => x.json()),
        fetch(base + "&daily=" + DAILY + "&forecast_days=16&past_days=7").then((x) => x.json()),
      ]);
      if (!Array.isArray(h) || !Array.isArray(d)) throw new Error((h && h.reason) || (d && d.reason) || "bad response");
      const wx = {};
      R.forEach((r, i) => {
        wx[r.id] = { base: { hourly: h[i * 2].hourly, daily: d[i * 2].daily }, top: { hourly: h[i * 2 + 1].hourly, daily: d[i * 2 + 1].daily } };
      });
      state.wx = wx; state.wxAt = Date.now(); state.wxStale = false; state.wxErr = null;
      try { localStorage.setItem(WX_KEY, JSON.stringify({ at: state.wxAt, wx })); } catch (e) {}
    } catch (e) {
      state.wxErr = String(e.message || e);
    }
    renderAll();
  }
  function hourIdx(hourly) {
    const now = new Date(); const key = iso(now) + "T" + pad(now.getHours());
    const i = hourly.time.findIndex((t) => t.startsWith(key));
    return i < 0 ? 0 : i;
  }
  function nowFor(r) {
    const w = state.wx && state.wx[r.id]; if (!w) return null;
    const bi = hourIdx(w.base.hourly), ti = hourIdx(w.top.hourly);
    const g = (o, k, i) => (o[k] && o[k][i] != null ? o[k][i] : null);
    return {
      baseDepth: Math.round((g(w.base.hourly, "snow_depth", bi) || 0) * 100),
      topDepth: Math.round((g(w.top.hourly, "snow_depth", ti) || 0) * 100),
      baseT: g(w.base.hourly, "temperature_2m", bi), topT: g(w.top.hourly, "temperature_2m", ti),
      wind: g(w.top.hourly, "wind_speed_10m", ti), freeze: g(w.base.hourly, "freezing_level_height", bi),
      code: g(w.top.hourly, "weather_code", ti),
    };
  }
  function dayIdx(daily, s) { return daily.time.indexOf(s); }
  function dayFor(r, s) {
    const w = state.wx && state.wx[r.id]; if (!w) return null;
    const i = dayIdx(w.top.daily, s); if (i < 0) return null;
    const t = w.top.daily, b = w.base.daily;
    return {
      snow: t.snowfall_sum[i], snowBase: b.snowfall_sum[i], tmax: t.temperature_2m_max[i], tmin: t.temperature_2m_min[i],
      tmaxBase: b.temperature_2m_max[i], code: t.weather_code[i], wind: t.wind_speed_10m_max[i], rain: b.precipitation_sum[i],
      sunrise: t.sunrise[i], sunset: t.sunset[i],
    };
  }
  function snowLast7(r) {
    const w = state.wx && state.wx[r.id]; if (!w) return null;
    const d = w.top.daily, t = todayISO(); let s = 0;
    d.time.forEach((x, i) => { if (x < t && d.snowfall_sum[i] != null) s += d.snowfall_sum[i]; });
    return Math.round(s);
  }
  function snowNext7(r) {
    const w = state.wx && state.wx[r.id]; if (!w) return null;
    const d = w.top.daily, t = todayISO(), e = iso(addDays(new Date(), 7)); let s = 0;
    d.time.forEach((x, i) => { if (x >= t && x < e && d.snowfall_sum[i] != null) s += d.snowfall_sum[i]; });
    return Math.round(s);
  }
  function icon(code) {
    if (code == null) return "·";
    if (code === 0) return "☀️"; if (code <= 2) return "🌤️"; if (code === 3) return "☁️"; if (code <= 48) return "🌫️";
    if (code <= 57) return "🌦️"; if (code <= 67) return "🌧️"; if (code <= 77) return "🌨️"; if (code <= 82) return "🌧️"; if (code <= 86) return "🌨️"; return "⛈️";
  }

  /* ---------- status and ranking ---------- */
  /* Open is a date call first and a snow call second: the model's snow depth
     is an estimate, so it can flag "thin", never open a closed hill. */
  function statusFor(r, d) {
    const s = seasonFor(r, d), n = nowFor(r), isToday = iso(d) === todayISO();
    if (s.code !== "in") {
      const wk = Math.round(s.daysTo / 7);
      return { code: "closed", pill: "no", text: s.code === "before" ? "Opens ~" + shortDate(s.open) + " · " + (wk ? wk + " wk" : s.daysTo + " d") : "Season over · opens ~" + shortDate(s.open), season: s };
    }
    if (isToday && n) {
      if (n.baseDepth < 20 && n.topDepth < 40) return { code: "thin", pill: "warm", text: "In season, but the model sees little snow — check Live", season: s };
      if (n.wind != null && n.wind > 70) return { code: "windy", pill: "warm", text: "Open, but " + Math.round(n.wind) + " km/h at the top: lifts may shut", season: s };
    }
    return { code: "open", pill: "go", text: "In season · closes ~" + shortDate(s.close), season: s };
  }
  function shortDate(d) { return d.getDate() + " " + MON[d.getMonth()].slice(0, 3); }
  function learnScore(r, d) {
    let sc = r.learn * 18;                                  /* 18–90: how forgiving the hill is */
    sc -= Math.max(0, r.driveMin - 240) / 60 * 9;           /* every hour beyond four costs nine */
    if (r.km >= 50) sc += 4;                                 /* room to grow on trip two */
    const st = statusFor(r, d);
    if (st.code === "closed") sc -= 60;
    if (st.code === "thin") sc -= 25;
    if (st.code === "windy") sc -= 15;
    const n = nowFor(r);
    if (iso(d) === todayISO() && n) {
      if (n.topDepth >= 80) sc += 6; else if (n.topDepth >= 40) sc += 3;
      if (n.code != null && n.code >= 61) sc -= 8;          /* rain or a storm on a first day */
      if (n.topT != null && n.topT < -10) sc -= 5;
    } else {
      const f = dayFor(r, iso(d));
      if (f) { if (f.code >= 61) sc -= 8; if (f.wind > 60) sc -= 6; if (f.snow >= 10) sc += 3; }
    }
    if (priceTier(d).tier === "high") sc -= 5;
    return Math.round(sc);
  }
  function ranked(d) { return R.slice().sort((a, b) => learnScore(b, d) - learnScore(a, d)); }

  /* ---------- rendering ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function navUrl(lat, lon) { return "https://www.google.com/maps/dir/?api=1&origin=" + ORIGIN.lat + "," + ORIGIN.lon + "&destination=" + lat + "," + lon + "&travelmode=driving"; }
  function meter(n) { let s = '<div class="meter">'; for (let i = 1; i <= 5; i++) s += '<i class="' + (i <= n ? "on" : "") + '"></i>'; return s + "</div>"; }
  function badges(r) {
    const b = [];
    if (r.learn >= 4) b.push('<span class="badge b-learn">good to learn</span>');
    if (r.driveMin <= 360) b.push('<span class="badge b-near">under 6 h</span>');
    if (r.price.high <= 42) b.push('<span class="badge b-cheap">cheap pass</span>');
    if (r.km >= 100) b.push('<span class="badge b-big">big area</span>');
    if (r.tags.includes("train")) b.push('<span class="badge b-train">by train</span>');
    return b.length ? '<div class="badges">' + b.join("") + "</div>" : "";
  }
  function wxLine() {
    if (state.wxErr && !state.wx) return '<p class="note">Live weather did not load (' + esc(state.wxErr) + '). Season and prices still work.</p>';
    if (!state.wx) return '<p class="note"><span class="spin"></span> Loading live snow and weather for every resort…</p>';
    const age = Math.round((Date.now() - state.wxAt) / 60000);
    return '<p class="note">Snow and weather: Open-Meteo, updated ' + (age < 2 ? "just now" : age < 60 ? age + " min ago" : Math.round(age / 60) + " h ago") + (state.wxStale ? " — stale copy, the live fetch failed" : "") + '. Snow depth is a weather-model estimate, not the resort\'s own report — the Live check gets that.</p>';
  }

  function renderAll() { renderNow(); renderResorts(); if (state.sel) openDetail(state.sel, true); }

  /* ----- Now ----- */
  function renderNow() {
    const v = $("#v-now"); const today = new Date(); const d = parseISO(state.date);
    const s = seasonFor(NEAREST, today), n = nowFor(NEAREST);
    const best = ranked(today)[0];
    let verdict, lead, next;
    if (s.code === "in") {
      const st = statusFor(NEAREST, today);
      verdict = st.code === "open" ? '<span class="verdict v-go">Season on</span>' : '<span class="verdict v-maybe">Season on · check</span>';
      lead = "It is " + longDate(today) + ". <strong>Sierra Nevada is in season</strong>" + (n ? ", with about " + n.topDepth + " cm at the top and " + n.baseDepth + " cm at Pradollano on the model" : "") + ". " + crowd(today).text;
      next = "Closes around " + shortDate(s.close) + ".";
    } else {
      const wk = Math.round(s.daysTo / 7);
      verdict = '<span class="verdict v-off">Off season</span>';
      lead = "It is " + longDate(today) + ". <strong>No resort in Spain is open.</strong> Sierra Nevada, the closest, usually opens around " + shortDate(s.open) + " — about " + wk + " weeks away." + (n ? " Right now the top of the Veleta is " + Math.round(n.topT) + " °C" + (n.topDepth ? " with " + n.topDepth + " cm of snow on the model" : " and bare") + "." : "");
      next = "Between now and then: buy the clothes on the Gear tab, read Learn once, and book a lesson two weeks before you go.";
    }
    v.innerHTML = "";
    v.appendChild(el('<div class="panel card">' + verdict + '<p class="lead">' + lead + '</p><p>' + esc(next) + '</p>' + tiles(NEAREST) + (state.tileNote ? '<div class="warn cool"><b>' + esc(state.tileNote.h) + '</b>' + esc(state.tileNote.p) + '</div>' : "") + wxLine() + "</div>"));

    /* the pick */
    const tier = priceTier(today), cost = beginnerDay(best, today);
    v.appendChild(el('<div class="panel card"><div class="kicker">Best place for you to learn</div><h2>' + esc(best.name) + '</h2>' +
      '<p>' + esc(best.why) + '</p><p>' + esc(best.learnNote) + '</p>' + badges(best) +
      '<div class="glance"><dt>Drive</dt><dd>' + fmtH(best.driveMin) + ' from the gate, ' + best.distKm + ' km. Leave at ' + leaveAt(best) + ' to be in the rental shop at 09:15.</dd>' +
      '<dt>Day cost</dt><dd>About ' + euro(cost) + ' — pass ' + euro(tier.tier === "high" ? best.price.high : best.price.low) + ' (' + tier.why + '), rental ' + euro(best.price.rentSki) + ', group lesson ' + euro(best.price.lessonGroup) + (best.price.parking ? ', parking ' + euro(best.price.parking) : '') + '. Last season\'s rates; Live check gets today\'s.</dd>' +
      '<dt>Status</dt><dd>' + esc(statusFor(best, today).text) + '</dd></div>' +
      '<div class="actions"><a class="go" href="' + navUrl(best.park.lat, best.park.lon) + '" target="_blank" rel="noopener">Navigate <small>car park</small></a>' +
      '<button data-open="' + best.id + '">Details</button><a href="' + best.official + '" target="_blank" rel="noopener">Official site</a></div></div>'));

    /* date planner */
    const max = iso(addDays(today, 365));
    const p = el('<div class="panel card"><h3>Plan a date</h3><div class="row2"><div><input type="date" id="dateIn" value="' + state.date + '" min="' + todayISO() + '" max="' + max + '" aria-label="Date to plan"></div>' +
      '<div><select class="inp" id="resortIn" aria-label="Resort">' + R.slice().sort((a, b) => a.driveMin - b.driveMin).map((r) => '<option value="' + r.id + '"' + (r.id === state.gridResort ? " selected" : "") + '>' + esc(r.name) + ' · ' + fmtH(r.driveMin) + '</option>').join("") + '</select></div></div><div id="plan"></div></div>');
    v.appendChild(p);
    renderPlan();

    /* 16-day grid */
    v.appendChild(el('<div class="panel card"><h3>The next sixteen days at <span>' + esc(byId[state.gridResort].name) + '</span></h3><div id="grid"></div><p class="note">Snow is the day\'s fresh fall at the top in cm; the two temperatures are the top\'s high and low. Amber days are weekends, a red outline is a holiday. Tap a day to plan it.</p></div>'));
    renderGrid();

    /* season windows */
    v.appendChild(el('<div class="panel card"><h3>Season and prices, in one look</h3>' +
      '<div class="glance"><dt>Opens</dt><dd>Sierra Nevada and the big Pyrenees resorts around the last weekend of November; the small hills in mid-December when snow allows.</dd>' +
      '<dt>Closes</dt><dd>Early April for most; Sierra Nevada and Baqueira into late April or the first days of May.</dd>' +
      '<dt>High season</dt><dd>' + HOL.map((h) => esc(h.name) + " (" + h.from.slice(5).replace("-", "/") + "–" + h.to.slice(5).replace("-", "/") + ")").join(", ") + ', and every weekend. Passes cost €5–10 more and the car park is a fight.</dd>' +
      '<dt>Low season</dt><dd>Weekdays outside those. Cheaper, emptier, and the instructors are less rushed — the beginner\'s window.</dd>' +
      '<dt>Best month to learn</dt><dd>February and March: the deepest snow and the longest days. Late March and April: warm, soft snow that is kinder to fall on.</dd></div></div>'));
    bindNow(v);
  }
  function tiles(r) {
    const n = nowFor(r); if (!n) return "";
    const l7 = snowLast7(r), n7 = snowNext7(r);
    const t = (k, n_, u, lbl, why) => '<button class="stat" data-tile="' + k + '"><span class="lbl">' + lbl + '</span><span class="n">' + n_ + '<u>' + u + '</u></span><span class="why">' + why + '</span></button>';
    return '<div class="stats">' +
      t("top", n.topDepth, " cm", "Snow at the top", "3,300 m, model") +
      t("base", n.baseDepth, " cm", "Snow at Pradollano", "2,100 m, model") +
      t("temp", n.topT == null ? "–" : Math.round(n.topT) + "°", "", "Top temperature", n.wind != null ? Math.round(n.wind) + " km/h wind" : "") +
      t("fall", (l7 == null ? "–" : l7) + " / " + (n7 == null ? "–" : n7), " cm", "Fell / coming", "last 7 d / next 7 d") + "</div>";
  }
  const TILE = {
    top: { h: "Snow at the top", p: "How deep the snow is at the highest lift, from the weather model. Over 100 cm and everything is open; under 40 cm and the resort is scraping by on snow cannons. The resort's own reading beats this — the Live check asks for it." },
    base: { h: "Snow at Pradollano", p: "Snow at the village and the bottom lifts, 2,100 m. This is what decides whether you can ski back to the car. Under 20 cm and the lower runs close; you ride the gondola down instead." },
    temp: { h: "Top temperature and wind", p: "What it feels like on the highest lift. Below −10 °C is a hand-warmers day; over 60 km/h of wind and the top lifts shut, though Borreguiles usually keeps running." },
    fall: { h: "Fell and coming", p: "Fresh snow at the top over the last week, then what the model expects over the next. A big number on the left means soft snow now; on the right, a storm — and a chains-only road the morning after." },
  };
  function bindNow(v) {
    $$("[data-tile]", v).forEach((b) => b.addEventListener("click", () => { const k = b.dataset.tile; state.tileNote = state.tileNote && state.tileNote.h === TILE[k].h ? null : TILE[k]; renderNow(); }));
    $$("[data-open]", v).forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.open)));
    $("#dateIn", v).addEventListener("change", (e) => { if (e.target.value) { state.date = e.target.value; renderPlan(); renderGrid(); } });
    $("#resortIn", v).addEventListener("change", (e) => { state.gridResort = e.target.value; renderPlan(); renderGrid(); $("#v-now h3 span").textContent = byId[state.gridResort].name; });
  }
  function renderPlan() {
    const box = $("#plan"); if (!box) return;
    const d = parseISO(state.date), r = byId[state.gridResort], s = seasonFor(r, d), tier = priceTier(d), c = crowd(d), f = dayFor(r, state.date);
    const rows = [];
    rows.push(["When", longDate(d) + (holidayFor(state.date) ? " — " + holidayFor(state.date).name : "")]);
    if (s.code === "in") rows.push(["Open?", "In season. Closes around " + shortDate(s.close) + "."]);
    else rows.push(["Open?", "Closed. " + (s.code === "before" ? "Opens around " + shortDate(s.open) + ", " + Math.round(s.daysTo / 7) + " weeks after this date." : "The season ended around " + shortDate(s.close) + "; it opens again around " + shortDate(s.open) + ".")]);
    rows.push(["Price", (tier.tier === "high" ? "High season (" + tier.why + "): adult day pass about " + euro(r.price.high) : "Low season (" + tier.why + "): adult day pass about " + euro(r.price.low)) + ". A beginner day all in — pass, rental, lesson" + (r.price.parking ? ", parking" : "") + " — about " + euro(beginnerDay(r, d)) + "."]);
    rows.push(["Crowds", c.text]);
    if (f) {
      rows.push(["Forecast", icon(f.code) + " " + (f.snow >= 1 ? Math.round(f.snow) + " cm of fresh snow at the top, " : "no fresh snow, ") + "top between " + Math.round(f.tmin) + " and " + Math.round(f.tmax) + " °C" + (f.tmaxBase != null ? ", " + Math.round(f.tmaxBase) + " °C at the base" : "") + (f.wind > 50 ? ", wind to " + Math.round(f.wind) + " km/h — the top may close" : "") + (f.rain > 3 && f.tmaxBase > 2 ? ". Rain at the base — a wet day" : "") + "."]);
      if (f.sunrise) rows.push(["Light", "Sun up " + f.sunrise.slice(11) + ", down " + f.sunset.slice(11) + ". Lifts run about 09:00–16:45."]);
    } else {
      const cl = climoFor(r, d.getMonth() + 1);
      rows.push(["Snow", cl ? "Beyond the forecast. Typical for " + MON[d.getMonth()] + " here: about " + cl[0] + " cm at the base and " + cl[1] + " cm at the top." : "Beyond the forecast, and out of season — no snow to speak of."]);
    }
    rows.push(["Leave", "Out of the gate at " + leaveAt(r) + " for a 09:15 rental-shop start (" + fmtH(r.driveMin) + " drive). " + (s.code === "in" && d.getMonth() <= 3 ? "Chains in the boot." : "")]);
    box.innerHTML = '<div class="glance">' + rows.map(([k, v]) => "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>").join("") + "</div>" +
      '<div class="actions"><button data-open="' + r.id + '">' + esc(r.name) + ' details</button><a href="' + navUrl(r.park.lat, r.park.lon) + '" target="_blank" rel="noopener">Navigate</a></div>';
    $$("[data-open]", box).forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.open)));
  }
  function renderGrid() {
    const g = $("#grid"); if (!g) return;
    const r = byId[state.gridResort], w = state.wx && state.wx[r.id];
    if (!w) { g.innerHTML = wxLine(); return; }
    const t = todayISO(); let html = '<div class="grid">';
    w.top.daily.time.forEach((s, i) => {
      if (s < t) return;
      const d = parseISO(s), snow = w.top.daily.snowfall_sum[i], code = w.top.daily.weather_code[i];
      html += '<button class="day' + (isWeekend(d) ? " wk" : "") + (holidayFor(s) ? " hol" : "") + (s === state.date ? " on" : "") + '" data-d="' + s + '" aria-label="' + longDate(d) + '">' +
        '<div class="d">' + DOW[d.getDay()].slice(0, 2) + " " + d.getDate() + '</div><div class="ic">' + icon(code) + '</div>' +
        '<div class="s' + (snow < 1 ? " zero" : "") + '">' + (snow < 1 ? "0" : Math.round(snow)) + '</div>' +
        '<div class="t">' + Math.round(w.top.daily.temperature_2m_max[i]) + "° " + Math.round(w.top.daily.temperature_2m_min[i]) + '°</div></button>';
    });
    g.innerHTML = html + "</div>";
    $$("[data-d]", g).forEach((b) => b.addEventListener("click", () => { state.date = b.dataset.d; $("#dateIn").value = state.date; renderPlan(); renderGrid(); }));
  }

  /* ----- Resorts ----- */
  const FILTERS = [["all", "All"], ["near", "Under 6 h"], ["learn", "Good to learn"], ["cheap", "Cheap pass"], ["open", "Open now"], ["pyrenees", "Pyrenees"], ["train", "By train"]];
  const SORTS = [["drive", "Drive"], ["learn", "Learn"], ["price", "Price"], ["snow", "Snow now"]];
  function renderResorts() {
    const v = $("#v-resorts"); const today = new Date();
    let list = R.filter((r) => {
      switch (state.filter) {
        case "near": return r.driveMin <= 360;
        case "learn": return r.learn >= 4;
        case "cheap": return r.price.high <= 42;
        case "open": return statusFor(r, today).code !== "closed";
        case "pyrenees": return r.tags.includes("pyrenees");
        case "train": return r.tags.includes("train");
        default: return true;
      }
    });
    list.sort((a, b) => {
      if (state.sort === "learn") return learnScore(b, today) - learnScore(a, today);
      if (state.sort === "price") return a.price.low - b.price.low;
      if (state.sort === "snow") { const x = nowFor(a), y = nowFor(b); return ((y && y.topDepth) || 0) - ((x && x.topDepth) || 0); }
      return a.driveMin - b.driveMin;
    });
    v.innerHTML = "";
    v.appendChild(el('<div class="panel card"><h3>' + list.length + ' of ' + R.length + ' resorts</h3><div class="chips">' + FILTERS.map(([k, l]) => '<button class="pre" data-f="' + k + '" aria-pressed="' + (state.filter === k) + '">' + l + '</button>').join("") + '</div>' +
      '<div class="lbl" style="margin:12px 0 6px">Sort by</div><div class="seg" style="width:100%">' + SORTS.map(([k, l]) => '<button data-s="' + k + '" aria-pressed="' + (state.sort === k) + '" style="flex:1">' + l + '</button>').join("") + '</div>' +
      '<p class="note">Drive times are from the naval station gate with no stops. Prices are last season\'s adult day pass, low to high.</p></div>'));
    const box = el('<div class="panel"></div>');
    if (!list.length) box.appendChild(el('<p class="note" style="padding:14px">Nothing matches' + (state.filter === "open" ? " — no resort is in season today" : "") + '.</p>'));
    list.forEach((r) => {
      const st = statusFor(r, today), n = nowFor(r);
      box.appendChild(el('<button class="rcard" data-open="' + r.id + '"><div><div class="nm">' + esc(r.name) + '</div><div class="rg">' + esc(r.area) + ' · ' + r.elev + '–' + r.top.elev + ' m · ' + r.km + ' km</div></div>' +
        '<div class="drv">' + fmtH(r.driveMin) + '<small>' + r.distKm + ' km · ' + euro(r.price.low) + '–' + euro(r.price.high) + '</small></div>' +
        '<div class="line">' + esc(r.why) + '</div>' +
        '<div class="st"><span class="pill ' + st.pill + '">' + esc(st.text) + '</span>' + (n && n.topDepth ? '<span class="pill snow">' + n.topDepth + ' cm top</span>' : "") + (n && n.topT != null ? '<span class="pill">' + Math.round(n.topT) + '° top</span>' : "") + '<span class="pill">learn ' + "●".repeat(r.learn) + "○".repeat(5 - r.learn) + '</span></div></button>'));
    });
    v.appendChild(box);
    $$("[data-f]", v).forEach((b) => b.addEventListener("click", () => { state.filter = b.dataset.f; renderResorts(); }));
    $$("[data-s]", v).forEach((b) => b.addEventListener("click", () => { state.sort = b.dataset.s; renderResorts(); }));
    $$("[data-open]", v).forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.open)));
  }

  /* ----- Detail sheet ----- */
  function openDetail(id, quiet) {
    const r = byId[id]; if (!r) return;
    state.sel = id;
    const today = new Date(), st = statusFor(r, today), n = nowFor(r), d = $("#detailScroll");
    const l7 = snowLast7(r), n7 = snowNext7(r);
    d.innerHTML =
      '<div class="dhead"><h2>' + esc(r.name) + '</h2><div class="place">' + esc(r.area) + ' · ' + esc(r.region) + ' · ' + r.elev + '–' + r.top.elev + ' m</div><button class="close" id="dClose" aria-label="Close">✕</button></div>' +
      '<span class="verdict ' + (st.pill === "go" ? "v-go" : st.pill === "warm" ? "v-maybe" : "v-off") + '">' + esc(st.text) + '</span>' +
      '<div class="stats"><div class="stat"><span class="lbl">Drive</span><span class="n">' + fmtH(r.driveMin) + '</span><span class="why">' + r.distKm + ' km, no stops</span></div>' +
      '<div class="stat"><span class="lbl">Day pass</span><span class="n">' + euro(r.price.low) + '<u>–' + r.price.high + '</u></span><span class="why">low – high season</span></div>' +
      '<div class="stat"><span class="lbl">Piste</span><span class="n">' + r.km + '<u> km</u></span><span class="why">' + r.lifts + ' lifts</span></div>' +
      '<div class="stat"><span class="lbl">Learn</span>' + meter(r.learn) + '<span class="why">' + ["", "not for a first day", "possible, not ideal", "fine", "good", "the best"][r.learn] + '</span></div></div>' +
      (n ? '<div class="glance"><dt>Now</dt><dd>' + n.topDepth + ' cm at the top, ' + n.baseDepth + ' cm at the base (model). Top ' + (n.topT == null ? "–" : Math.round(n.topT) + " °C") + (n.wind != null ? ", wind " + Math.round(n.wind) + " km/h" : "") + '. ' + (l7 != null ? l7 + " cm fell in the last week, " + n7 + " cm expected in the next." : "") + '</dd>' + (n.freeze != null ? '<dt>Freezing level</dt><dd>' + Math.round(n.freeze) + ' m — ' + (n.freeze > r.elev ? "above the base, so anything falling at the bottom is rain" : "below the base: snow all the way down") + '.</dd>' : "") + '</div>' : "") +
      badges(r) +
      '<div class="actions"><a class="go" href="' + navUrl(r.park.lat, r.park.lon) + '" target="_blank" rel="noopener">Navigate <small>car park</small></a><a href="' + r.official + '" target="_blank" rel="noopener">Official site</a></div>' +
      '<div class="sec"><h3>Why</h3><p>' + esc(r.why) + '</p></div>' +
      '<div class="sec"><h3>For a first-timer</h3><p>' + esc(r.learnNote) + '</p></div>' +
      '<div class="sec"><h3>What it costs</h3><dl class="glance" style="margin-top:0"><dt>Pass</dt><dd>' + euro(r.price.low) + ' weekday, ' + euro(r.price.high) + ' weekend or holiday</dd><dt>Rent</dt><dd>skis ' + euro(r.price.rentSki) + ' · board ' + euro(r.price.rentBoard) + ' a day, helmet included</dd><dt>Lesson</dt><dd>group ' + euro(r.price.lessonGroup) + ' (2–3 h) · private ' + euro(r.price.lessonPrivate) + ' an hour</dd><dt>Parking</dt><dd>' + (r.price.parking ? euro(r.price.parking) + ' a day' : 'free') + '</dd></dl><p class="note">Last season\'s published adult rates. Live check asks the web for today\'s.</p></div>' +
      '<div class="sec"><h3>Parking</h3><p>' + esc(r.park.text) + '</p></div>' +
      '<div class="sec"><h3>The drive</h3><p>' + esc(r.route) + '</p></div>' +
      '<div class="warn soft"><b>Chains</b>' + esc(r.chains) + '</div>' +
      (r.bus ? '<div class="sec"><h3>Without the car</h3><p>' + esc(r.bus) + '</p></div>' : "") +
      (r.stay ? '<div class="sec"><h3>Sleep</h3><p>' + esc(r.stay) + '</p></div>' : "") +
      '<div class="warn"><b>Watch</b>' + esc(r.warn) + '</div>' +
      '<div class="live" id="live"></div>' +
      '<div class="sec"><h3>Next seven days at the top</h3><div id="dgrid"></div></div>';
    renderLive(r);
    const w = state.wx && state.wx[r.id];
    if (w) {
      const t = todayISO(); let html = '<div class="grid">', k = 0;
      w.top.daily.time.forEach((s, i) => {
        if (s < t || k >= 8) return; k++;
        const dd = parseISO(s), snow = w.top.daily.snowfall_sum[i];
        html += '<div class="day' + (isWeekend(dd) ? " wk" : "") + (holidayFor(s) ? " hol" : "") + '"><div class="d">' + DOW[dd.getDay()].slice(0, 2) + " " + dd.getDate() + '</div><div class="ic">' + icon(w.top.daily.weather_code[i]) + '</div><div class="s' + (snow < 1 ? " zero" : "") + '">' + (snow < 1 ? "0" : Math.round(snow)) + '</div><div class="t">' + Math.round(w.top.daily.temperature_2m_max[i]) + "° " + Math.round(w.top.daily.temperature_2m_min[i]) + '°</div></div>';
      });
      $("#dgrid", d).innerHTML = html + "</div>";
    } else $("#dgrid", d).innerHTML = wxLine();
    $("#dClose", d).addEventListener("click", closeDetail);
    if (!quiet) { $("#detail").classList.add("open"); $("#scrim").classList.add("on"); d.scrollTop = 0; }
  }
  function closeDetail() { state.sel = null; $("#detail").classList.remove("open"); $("#scrim").classList.remove("on"); }

  /* ----- Live check (Claude through the Worker) ----- */
  function cfg() {
    let c = {}; try { c = JSON.parse(localStorage.getItem("rtf.cfg")) || {}; } catch (e) {}
    return String(c.api || (window.TRIP_CONFIG && window.TRIP_CONFIG.API_BASE) || "").replace(/\/+$/, "");
  }
  const LIVE_LABELS = ["OPEN", "PRICE", "ROAD", "PARK", "WATCH"];
  function parseLive(text) {
    const out = []; const t = String(text || "").replace(/\r/g, "");
    LIVE_LABELS.forEach((l) => { const m = t.match(new RegExp("(?:^|\\n)\\s*" + l + "\\s*:\\s*([^\\n]+)")); if (m) out.push([l, m[1].trim()]); });
    return out.length ? out : [["", t.trim()]];
  }
  function renderLive(r) {
    const box = $("#live"); if (!box) return;
    const key = r.id + ":" + todayISO(), it = state.intel[key];
    let body = "";
    if (!it) body = '<button class="askbtn" id="askBtn">Live check <small>lifts · today\'s price · road</small></button><p class="note">Asks Claude to search the web for what is true today at ' + esc(r.name) + ': whether it is open and how much of it, the day-pass price, whether chains are on, and the car park. Once per resort per six hours.</p>';
    else if (it.loading) body = '<p class="row"><span class="spin"></span> Searching the web for ' + esc(r.name) + ' today…</p>';
    else if (it.error) body = '<p class="row" style="color:var(--red)">' + esc(it.error) + '</p><button class="askbtn" id="askBtn">Try again</button>';
    else if (it.demo) body = '<p class="row">Live check is not set up on the server — the Worker has no Claude key. Everything else on this page still works.</p>';
    else body = parseLive(it.text).map(([l, t]) => '<p class="row">' + (l ? "<b>" + l + "</b>" : "") + "<span>" + esc(t) + "</span></p>").join("") + '<p class="note">' + (it.cached ? "From the last check within six hours" : "Just now") + ' · web search by Claude · Never trust a price on the internet over the one at the ticket window.</p>';
    box.innerHTML = '<h3>Live, from the web <span style="letter-spacing:0;text-transform:none">' + longDate(new Date()) + '</span></h3>' + body;
    const b = $("#askBtn", box); if (b) b.addEventListener("click", () => askLive(r));
  }
  async function askLive(r) {
    const key = r.id + ":" + todayISO(), api = cfg();
    if (!api) { state.intel[key] = { demo: true }; renderLive(r); return; }
    state.intel[key] = { loading: true }; renderLive(r);
    try {
      const res = await fetch(api + "/api/snow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: r.name, area: r.area, region: r.region, today: longDate(new Date()) + " " + new Date().getFullYear() }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (typeof data.error === "string" && /credit balance/i.test(data.error)) {
          state.intel[key] = { error: "Claude is switched off: the API account behind the Worker is out of credit. Top it up at console.anthropic.com and this button works again. Everything else on the page is live." };
          renderLive(r); return;
        }
        throw new Error(data.error || ("Server said " + res.status));
      }
      state.intel[key] = data;
    } catch (e) {
      state.intel[key] = { error: "Live check failed: " + String(e.message || e) };
    }
    renderLive(r);
  }

  /* ----- Learn ----- */
  function renderLearn() {
    const v = $("#v-learn"); v.innerHTML = "";
    v.appendChild(el('<div class="panel card"><div class="kicker">Ski or snowboard?</div><h2>' + esc(LEARN.verdict.title) + '</h2>' + LEARN.verdict.lines.map((l) => "<p>" + esc(l) + "</p>").join("") + "</div>"));
    v.appendChild(el('<div class="panel card"><h3>' + esc(LEARN.falls.title) + '</h3>' + LEARN.falls.lines.map((l) => "<p>" + esc(l) + "</p>").join("") + "</div>"));
    v.appendChild(el('<div class="panel card"><h3>' + esc(LEARN.dayOne.title) + '</h3><div class="steps">' + LEARN.dayOne.steps.map((s) => '<div class="step"><div class="t">' + esc(s.t) + '</div><div><b>' + esc(s.h) + '</b><span>' + esc(s.p) + '</span></div></div>').join("") + "</div></div>"));
    v.appendChild(el('<div class="panel card"><h3>The six things the lesson teaches</h3>' + LEARN.basics.map((b) => '<details><summary>' + esc(b.h) + '</summary><div class="body"><p>' + esc(b.p) + '</p></div></details>').join("") + "</div>"));
    v.appendChild(el('<div class="panel card"><h3>Fix my day</h3><p>Tap what happened.</p>' + LEARN.fix.map((b) => '<details><summary>' + esc(b.q) + '</summary><div class="body"><p>' + esc(b.a) + '</p></div></details>').join("") + "</div>"));
    v.appendChild(el('<div class="panel card"><h3>' + esc(LEARN.after.title) + '</h3>' + LEARN.after.lines.map((l) => "<p>" + esc(l) + "</p>").join("") + "</div>"));
    v.appendChild(el('<div class="panel card"><h3>Words</h3>' + GLOSS.map((g) => '<details><summary>' + esc(g.t) + '</summary><div class="body"><p>' + esc(g.d) + '</p></div></details>').join("") + "</div>"));
  }

  /* ----- Gear ----- */
  function renderGear() {
    const v = $("#v-gear"); v.innerHTML = "";
    v.appendChild(el('<div class="panel card"><div class="kicker">Rent this</div><h2>Do not buy skis. Not yet.</h2>' + GEAR.rent.map((g) => '<p><strong>' + esc(g.h) + '.</strong> ' + esc(g.p) + '</p>').join("") + "</div>"));
    v.appendChild(el('<div class="panel card"><h3>Buy this before you go <span>about €250 at Decathlon</span></h3><table class="tbl">' + GEAR.buy.map((g) => '<tr><td><div class="k">' + esc(g.h) + '</div><div class="n">' + esc(g.p) + '</div></td><td class="v">' + esc(g.cost) + '</td></tr>').join("") + "</table></div>"));
    v.appendChild(el('<div class="panel card"><h3>Never wear</h3><ul class="plain">' + GEAR.never.map((n) => "<li>" + esc(n) + "</li>").join("") + "</ul></div>"));
    v.appendChild(el('<div class="panel card"><h3>Where to get it</h3>' + GEAR.where.map((w) => '<details><summary>' + esc(w.h) + '</summary><div class="body"><p>' + esc(w.p) + '</p>' + (w.url ? '<p><a href="' + w.url + '" target="_blank" rel="noopener">Open ↗</a></p>' : "") + '</div></details>').join("") + "</div>"));
    const total = "€330–420 for a day, plus the clothes once";
    v.appendChild(el('<div class="panel card"><h3>What a first weekend costs</h3><table class="tbl">' + GEAR.budget.map((b) => '<tr><td><div class="k">' + esc(b.k) + '</div><div class="n">' + esc(b.n) + '</div></td><td class="v">' + esc(b.v) + '</td></tr>').join("") + '<tfoot><tr><td>One day on snow, one night in Granada</td><td class="v">' + total + '</td></tr></tfoot></table><p class="note">Sierra Nevada, driving from the base, everything rented. Two people in the car halves the fuel and the room.</p></div>'));
  }

  /* ----- Trip ----- */
  function renderTrip() {
    const v = $("#v-trip"); v.innerHTML = "";
    const r = NEAREST;
    v.appendChild(el('<div class="panel card"><div class="kicker">The drive</div><h2>' + esc(TRIP.route.title) + '</h2>' + TRIP.route.lines.map((l) => "<p>" + esc(l) + "</p>").join("") +
      '<div class="actions"><a class="go" href="' + navUrl(r.park.lat, r.park.lon) + '" target="_blank" rel="noopener">Navigate <small>gate → Pradollano car park</small></a><a href="' + navUrl(37.1773, -3.5986) + '" target="_blank" rel="noopener">Granada <small>sleep there first</small></a></div></div>'));
    v.appendChild(el('<div class="panel card"><h3>' + esc(TRIP.chains.title) + '</h3>' + TRIP.chains.lines.map((l) => "<p>" + esc(l) + "</p>").join("") + "</div>"));
    v.appendChild(el('<div class="panel card"><h3>' + esc(TRIP.when.title) + '</h3><div class="warn cool" style="margin-top:0"><b>Go</b><ul class="plain">' + TRIP.when.good.map((l) => "<li>" + esc(l) + "</li>").join("") + '</ul></div><div class="warn"><b>Avoid</b><ul class="plain">' + TRIP.when.bad.map((l) => "<li>" + esc(l) + "</li>").join("") + "</ul></div></div>"));
    v.appendChild(el('<div class="panel card"><h3>' + esc(TRIP.stay.title) + '</h3>' + TRIP.stay.lines.map((l) => "<p>" + esc(l) + "</p>").join("") + "</div>"));
    v.appendChild(el('<div class="panel card"><h3>' + esc(TRIP.noCar.title) + '</h3>' + TRIP.noCar.lines.map((l) => "<p>" + esc(l) + "</p>").join("") + "</div>"));
    v.appendChild(el('<div class="panel card"><h3>Two-day plan</h3><div class="steps">' +
      [["Fri 17:00", "Leave the base", "Four hours to Granada. Check in, tapas, bed by eleven."],
       ["Sat 07:30", "Up the mountain", "45 minutes to Pradollano, park by 08:30. Rental shop, pass, gondola to Borreguiles."],
       ["Sat 10:00", "Lesson", "Three hours. Lunch. Ninety minutes of practice. Stop at 15:30."],
       ["Sat 17:00", "Down to Granada", "Before dark. Hot shower, early dinner, sleep like the dead."],
       ["Sun 08:30", "Second morning, optional", "If your legs allow, a half-day pass and the beginner slope alone — this is where it clicks. Otherwise the Alhambra, then home by dinner."]]
        .map((s) => '<div class="step"><div class="t">' + s[0] + '</div><div><b>' + s[1] + '</b><span>' + s[2] + '</span></div></div>').join("") + "</div></div>"));
  }

  /* ---------- shell ---------- */
  function setView(v) {
    state.view = v;
    $$(".view").forEach((s) => s.classList.toggle("on", s.id === "v-" + v));
    $$("#topTabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
    $$(".tab").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
    try { history.replaceState(null, "", "#" + v); } catch (e) {}
    window.scrollTo(0, 0);
  }
  $$("#topTabs button, .tab").forEach((b) => b.addEventListener("click", () => setView(b.dataset.v)));
  $("#scrim").addEventListener("click", closeDetail);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
  $("#themeBtn").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme:dark)").matches);
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("snow-theme", dark ? "light" : "dark"); } catch (e) {}
  });
  try { const th = localStorage.getItem("snow-theme"); if (th) document.documentElement.dataset.theme = th; } catch (e) {}
  /* drag the sheet down to close, phones only */
  (function () { let y0 = null; const h = $("#detail .handle"); h.addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; }, { passive: true }); h.addEventListener("touchend", (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 40) closeDetail(); y0 = null; }); })();

  renderLearn(); renderGear(); renderTrip();
  const hash = location.hash.replace("#", "");
  if (["now", "resorts", "learn", "gear", "trip"].includes(hash)) setView(hash);
  setTimeout(loadWx, 0);
})();
