/* Spain Vacation — frontend. No secrets here; all keys live in the Worker.
   Visual design implemented from the Claude Design canvas (Spain Vacation.dc.html). */
(() => {
'use strict';

const CFG = window.TRIP_CONFIG || {};
const DEFAULT_PLACE = CFG.ANCHOR || { lat: 36.645, lng: -6.3494, name: 'Rota, Spain', airport: 'XRY' };
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const store = {
  get: (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const S = {
  cfg: store.get('rtf.cfg', { api: CFG.API_BASE || '', code: '' }),
  place: { ...DEFAULT_PLACE },
  placeQuery: '',
  weather: null,           // { icon, temp } at the destination, via Open-Meteo
  criteria: null,
  stays: [], flights: [],
  saved: store.get('rtf.saved', []),
  nights: 3, demo: true, view: 'stays', lastQuery: null, hasSearched: false,
  advice: null, lastHearted: null,
};

/* ------------------------------------------------------------- utilities */

const SYM = { EUR: '€', USD: '$', GBP: '£' };
const money = (n, c) => (n == null ? '—' : (SYM[c || 'EUR'] || '') + Math.round(n).toLocaleString());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const iso = (d) => { const t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };

function haversineKm(a, b) {
  const R = 6371, r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/* --------------------------------------------------- destination + weather */

const geoCache = new Map();

/** Free, keyless geocoding via Open-Meteo. Empty query = the default anchor. */
async function geocode(text) {
  const q = (text || '').trim();
  if (!q) return { ...DEFAULT_PLACE };
  if (geoCache.has(q)) return geoCache.get(q);
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
  const d = await res.json();
  const hit = d?.results?.[0];
  if (!hit) throw new Error(`Couldn't find "${q}" — try a town or region name.`);
  const place = {
    lat: hit.latitude, lng: hit.longitude,
    name: [hit.name, hit.country].filter(Boolean).join(', '),
    airport: null, // resolved by the Worker from the place name
  };
  geoCache.set(q, place);
  return place;
}

const WMO_ICON = [
  [0, '☀️'], [1, '🌤️'], [2, '⛅'], [3, '☁️'], [45, '🌫️'], [48, '🌫️'],
  [51, '🌦️'], [57, '🌦️'], [61, '🌧️'], [67, '🌧️'], [71, '🌨️'], [77, '🌨️'],
  [80, '🌦️'], [82, '🌧️'], [85, '🌨️'], [86, '🌨️'], [95, '⛈️'], [99, '⛈️'],
];
const wmoIcon = (code) => { let out = '🌤️'; for (const [c, i] of WMO_ICON) if (code >= c) out = i; return out; };

/** Current weather at the destination — keyless, works even in demo mode. */
async function fetchWeather(place) {
  if (CFG.SHOW_WEATHER === false) return null;
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lng}&current=temperature_2m,weather_code`);
    const d = await res.json();
    const cur = d?.current;
    if (cur?.temperature_2m == null) return null;
    return { icon: wmoIcon(cur.weather_code ?? 1), temp: Math.round(cur.temperature_2m) };
  } catch { return null; }
}

/* --------------------------------------------------------- intent parsing */

const AMENITY_WORDS = {
  hasParking: /\bpark(ing)?\b|\bgarage\b|\bdriveway\b|\bcar\b(?!.*\bno car\b)/i,
  hasPool: /\bpool\b|\bpiscina\b/i,
  hasAC: /\ba\/?c\b|air.?con/i,
  petFriendly: /\bdogs?\b|\bpets?\b/i,
  hasKitchen: /\bkitchen\b|\bcook\b/i,
  hasWasher: /\bwash(er|ing)\b|\blaundry\b/i,
  hasSeaView: /\bsea ?view\b|\bocean ?view\b|\bbeach ?front\b/i,
  hasWifi: /\bwifi\b|\bwi-fi\b|\binternet\b|\bwork\b|\bremote\b/i,
};
const AMENITY_LABEL = {
  hasParking: 'parking', hasPool: 'pool', hasAC: 'A/C', petFriendly: 'pets OK',
  hasKitchen: 'kitchen', hasWasher: 'washer', hasSeaView: 'sea view', hasWifi: 'wifi',
};

/** Works with no API key at all. Claude refines this when it's configured. */
function parseLocally(text) {
  const t = ' ' + (text || '').toLowerCase() + ' ';
  const c = { mustHaves: [], priorities: { price: 5, distance: 5, parking: 4, space: 5, rating: 4 } };

  const people = t.match(/(\d+)\s*(?:people|persons?|guests?|of us|pax|adults?|friends|dudes|guys)/)
    || t.match(/\bfor\s+(\d+)\b/) || t.match(/\bgroup of\s+(\d+)/);
  if (people) c.adults = Math.min(16, +people[1]);

  const price = t.match(/(?:under|below|max|less than|up to)\s*[€$£]?\s*(\d{2,4})/)
    || t.match(/[€$£]\s*(\d{2,4})\s*(?:a|per|\/)\s*night/) || t.match(/(\d{2,4})\s*(?:a|per|\/)\s*night/);
  if (price) c.maxPricePerNight = +price[1];

  for (const [k, re] of Object.entries(AMENITY_WORDS)) if (re.test(t)) c.mustHaves.push(k);
  if (/\bno car\b|\bwithout a car\b|\bcarless\b/.test(t)) {
    c.mustHaves = c.mustHaves.filter((m) => m !== 'hasParking');
  }

  if (/\bwalk(able|ing)?\b|\bno car\b|\bclose to (the )?(center|centre|base|gate|town)\b|\bnear (the )?(center|centre|base)\b/.test(t)) {
    c.radiusKm = 5; c.priorities.distance = 10;
  } else if (/\bquiet\b|\bcountryside\b|\banywhere\b|\bwider\b/.test(t)) {
    c.radiusKm = 30; c.priorities.distance = 2;
  }
  if (/\bcheap|\bbudget|\bafford|\bfrugal|\bbroke\b/.test(t)) c.priorities.price = 10;
  if (/\bluxur|\bnice place|\bsplash|\btreat/.test(t)) { c.priorities.price = 1; c.priorities.rating = 9; }
  if (/\bbig\b|\bspace|\broom for|\bwhole (house|villa)|\bspread out/.test(t)) c.priorities.space = 9;
  if (c.mustHaves.includes('hasParking')) c.priorities.parking = 9;
  if (/\breview|\brated|\bhighly/.test(t)) c.priorities.rating = 9;

  const codes = (text || '').match(/\b[A-Z]{3}\b/g);
  if (codes) c.origins = [...new Set(codes)].slice(0, 4);

  return c;
}

function mergeCriteria(local, ai) {
  if (!ai) return local;
  const out = { ...local };
  for (const k of ['adults', 'maxPricePerNight', 'radiusKm', 'checkin', 'checkout']) {
    if (ai[k] != null) out[k] = ai[k];
  }
  if (ai.mustHaves?.length) out.mustHaves = [...new Set([...local.mustHaves, ...ai.mustHaves])];
  if (ai.priorities) out.priorities = { ...local.priorities, ...ai.priorities };
  if (ai.origins?.length) out.origins = ai.origins;
  return out;
}

/* ------------------------------------------------------------------ score */

function rank(stays) {
  if (!stays.length) return stays;
  const w = S.criteria?.priorities || { price: 5, distance: 5, parking: 4, space: 5, rating: 4 };
  const adults = S.criteria?.adults || +$('#adults').value || 2;
  const ps = stays.map((s) => s.pricePerNight).filter((n) => n != null);
  const ds = stays.map((s) => s.distanceKmToBase).filter((n) => n != null);
  const nrm = (v, lo, hi) => (hi > lo && v != null ? (v - lo) / (hi - lo) : 0.5);
  const [loP, hiP] = [Math.min(...ps), Math.max(...ps)];
  const [loD, hiD] = [Math.min(...ds), Math.max(...ds)];

  for (const s of stays) {
    const f = {
      price: 1 - nrm(s.pricePerNight, loP, hiP),
      distance: 1 - nrm(s.distanceKmToBase, loD, hiD),
      parking: s.hasParking ? 1 : 0,
      space: clamp01(((s.guests ?? s.beds ?? 2) / Math.max(1, adults)) / 1.5),
      rating: s.rating != null
        ? clamp01((s.rating - 4) / 0.9) * clamp01(Math.log10((s.reviews || 1) + 1) / 2)
        : 0.4,
    };
    let tot = 0, sum = 0;
    for (const k of Object.keys(f)) { tot += f[k] * (w[k] ?? 0); sum += w[k] ?? 0; }
    s._score = sum ? Math.round((tot / sum) * 100) : 50;
  }
  return stays;
}

function filtered() {
  const max = S.criteria?.maxPricePerNight;
  const must = S.criteria?.mustHaves || [];
  return S.stays.filter((s) => {
    if (max && s.pricePerNight != null && s.pricePerNight > max) return false;
    return must.every((m) => s[m]);
  });
}

/* -------------------------------------------------------------------- api */

async function api(path, body) {
  const base = (S.cfg.api || '').replace(/\/$/, '');
  if (!base) throw Object.assign(new Error('no endpoint'), { offline: true });
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(S.cfg.code ? { 'X-Trip-Code': S.cfg.code } : {}) },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `Request failed (${res.status})`);
  return d;
}

/* ------------------------------------------------------------- demo data */

/* Sample sets from the design canvas, picked by destination. */
const DEMO_SETS = {
  rota: { match: /rota|spain|cádiz|cadiz/i, stays: [
    ['Bright flat, 6 min walk to the center', 68, 4, 2, 1, 4.88, 214, 'Entire apartment', 1, 2.4],
    ['Townhouse with garage and patio, Rota centro', 95, 6, 3, 1, 4.72, 88, 'Entire home', 0, 2.5],
    ['Costa Ballena villa, pool, gated', 145, 8, 4, 1, 4.94, 131, 'Entire villa', 1, 6.1],
    ['Studio by Playa de la Costilla', 52, 2, 1, 0, 4.61, 302, 'Entire studio', 0, 2.3],
    ['Chipiona beach house, big driveway', 78, 6, 3, 1, 4.81, 59, 'Entire home', 1, 12.9],
    ['Old town casita, roof terrace', 64, 2, 1, 0, 4.86, 143, 'Entire home', 0, 2.4],
  ] },
  algarve: { match: /algarve|portugal|lagos|faro/i, stays: [
    ['Cliffside villa above Praia da Marinha', 210, 8, 4, 1, 4.92, 188, 'Entire villa', 1, 1.2],
    ['Whitewashed townhouse, old town Lagos', 96, 5, 2, 1, 4.78, 142, 'Entire home', 0, 0.4],
    ['Studio steps from Praia da Rocha', 58, 2, 1, 0, 4.55, 301, 'Entire studio', 0, 0.2],
    ['Quinta cottage with pool, Silves hills', 88, 6, 3, 1, 4.86, 76, 'Entire home', 1, 6.5],
    ['Marina-view apartment, Vilamoura', 121, 4, 2, 1, 4.7, 214, 'Entire apartment', 1, 3.1],
    ['Surf house near Sagres point', 74, 6, 3, 1, 4.65, 59, 'Entire home', 0, 12.4],
  ] },
  generic: { match: /./, stays: [
    ['Bright flat near the center', 89, 4, 2, 1, 4.8, 176, 'Entire apartment', 0, 1.5],
    ['Family house with garden', 134, 6, 3, 1, 4.75, 98, 'Entire home', 1, 3.2],
    ['Cozy studio, walk everywhere', 55, 2, 1, 0, 4.6, 240, 'Entire studio', 0, 0.6],
    ['Hillside cottage with a view', 104, 5, 2, 1, 4.85, 64, 'Entire home', 0, 7.8],
  ] },
};

function demoStays(nights, currency) {
  const set = Object.values(DEMO_SETS).find((x) => x.match.test(S.place.name)) || DEMO_SETS.generic;
  return set.stays.map(([name, p, guests, br, park, rating, reviews, type, pool, dist], i) => ({
    id: `demo-${i + 1}`, source: 'demo', name, type, image: null,
    url: `https://www.airbnb.com/s/${encodeURIComponent(S.place.name)}/homes`,
    lat: S.place.lat, lng: S.place.lng, distanceKmToBase: dist,
    pricePerNight: p, priceTotal: p * nights, currency,
    rating, reviews, beds: br + 1, bedrooms: br, guests, superhost: rating > 4.85,
    hasParking: !!park, hasPool: !!pool, hasAC: true, hasWifi: true,
    hasKitchen: true, petFriendly: i % 3 === 0, hasWasher: true,
    hasSeaView: /beach|praia|marina|cliff|costilla|seafront/i.test(name),
  }));
}

function demoFlights(origins, dep, currency) {
  const table = { MAD: 46, BCN: 63, LGW: 88, LHR: 94, CDG: 79, FCO: 102, BWI: 612, JFK: 545, ATL: 588, IAD: 601 };
  return origins.map((o, i) => {
    const price = table[o] ?? 120 + i * 35, long = price > 300;
    const carrier = ['Iberia', 'Vueling', 'Ryanair', 'Air Europa'][i % 4];
    return {
      id: `df${i}`, origin: o, price, currency, seats: 4, airlines: [carrier],
      itineraries: [{ stops: long ? 1 : 0, from: o, to: S.place.airport || '', departAt: `${dep}T07:35:00` }],
    };
  }).sort((a, b) => a.price - b.price);
}

/* ------------------------------------------------------------------ views */

function setView(v) {
  S.view = v;
  $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  $$('.panel').forEach((p) => p.classList.toggle('hidden', p.id !== 'v-' + v));
  renderAll();
}

function renderTokens() {
  const c = S.criteria;
  const t = [];
  if (c) {
    if (c.maxPricePerNight) t.push(['price', `under ${money(c.maxPricePerNight, currency()).trim()}/night`]);
    if (c.radiusKm === 5) t.push(['radius', 'walkable to center']);
    else if (c.radiusKm && c.radiusKm >= 30) t.push(['radius', `${c.radiusKm} km radius`]);
    for (const m of c.mustHaves || []) t.push(['must:' + m, AMENITY_LABEL[m] || m]);
  }
  $('#tokens').innerHTML = t.map(([k, label]) =>
    `<span class="token">${esc(label)}<button data-drop="${esc(k)}" aria-label="Remove ${esc(label)}">×</button></span>`
  ).join('') + (S.demo && S.hasSearched ? '<span class="token muted">sample data</span>' : '');
}

function renderExamples() {
  $('#examples').innerHTML = S.hasSearched ? '' : `
    <button class="btn btn-ghost" data-example="rota">Try: Rota, Spain</button>
    <button class="btn btn-ghost" data-example="algarve">Try: Algarve, Portugal</button>`;
}

const isSaved = (kind, id) => S.saved.some((x) => x.kind === kind && x.id === id);

function heart(kind, id) {
  const on = isSaved(kind, id);
  const pop = S.lastHearted === kind + ':' + id ? ' pop' : '';
  return `<button class="heart${on ? ' on' : ''}${pop}" data-save="${kind}" data-id="${esc(id)}" aria-label="Save">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21.2l7.7-7.7 1.1-1a5.5 5.5 0 0 0 0-7.9z"/></svg>
  </button>`;
}

function stayCard(s, i) {
  const tags = [];
  if (s.distanceKmToBase != null) tags.push(`<span class="tag tag-accent">${s.distanceKmToBase} km to center</span>`);
  if (s.hasParking) tags.push('<span class="tag tag-neutral">parking</span>');
  else tags.push('<span class="tag tag-outline">no parking listed</span>');
  if (s.bedrooms) tags.push(`<span class="tag tag-neutral">${s.bedrooms} BR</span>`);
  if (s.hasPool) tags.push('<span class="tag tag-neutral">pool</span>');
  if (s.hasSeaView) tags.push('<span class="tag tag-neutral">sea view</span>');
  if (s.superhost) tags.push('<span class="tag tag-neutral">superhost</span>');

  const photo = s.image
    ? `<img class="photo" src="${esc(s.image)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'ph-fallback\\'>🏠</div>'">`
    : '<div class="ph-fallback">🏠</div>';
  const wchip = S.weather && CFG.SHOW_WEATHER !== false
    ? `<span class="wchip">${S.weather.icon} ${S.weather.temp}°</span>` : '';

  return `<a class="card" href="${esc(s.url)}" target="_blank" rel="noopener" style="animation-delay:${Math.min(i, 8) * 60}ms">
    <div class="ph-wrap">${photo}${heart('stay', s.id)}${wchip}</div>
    <div class="body">
      <div class="top">
        <div>
          <div class="name">${esc(s.name)}</div>
          <div class="meta">${esc(s.type || 'Stay')}${s.rating ? ` · ${s.rating}★${s.reviews ? ` (${s.reviews})` : ''}` : ''}${s.guests ? ` · sleeps ${s.guests}` : ''}</div>
        </div>
        <div class="cost"><b>${money(s.pricePerNight, s.currency)}</b><small>per night</small><small>${money(s.priceTotal, s.currency)} total</small></div>
      </div>
      <div class="tags">${tags.join('')}</div>
      <div class="match"><span class="track"><i style="width:${s._score || 0}%"></i></span>${s._score || 0}% match</div>
    </div>
  </a>`;
}

function flightCard(f, i) {
  const it = f.itineraries?.[0] || {};
  const stops = it.stops === 0 ? 'nonstop' : it.stops != null ? `${it.stops} stop${it.stops > 1 ? 's' : ''}` : '';
  const to = it.to || S.place.airport || S.place.name.split(',')[0];
  const q = encodeURIComponent(`flights from ${f.origin} to ${to}`);
  return `<a class="card" href="https://www.google.com/travel/flights?q=${q}" target="_blank" rel="noopener" style="animation-delay:${Math.min(i, 8) * 60}ms">
    <div class="body">
      ${heart('flight', f.id)}
      <div class="top" style="padding-right:38px">
        <div>
          <div class="name">${esc(f.origin)} → ${esc(to)}</div>
          <div class="meta">${esc((f.airlines || []).join(', '))}${stops ? ` · ${stops}` : ''}${f.seats ? ` · ${f.seats} seats at this fare` : ''}</div>
        </div>
        <div class="cost"><b>${money(f.price, f.currency)}</b><small>per person</small></div>
      </div>
    </div>
  </a>`;
}

function renderStays() {
  const list = rank(filtered());
  const by = {
    score: (a, b) => b._score - a._score,
    price: (a, b) => (a.pricePerNight ?? 1e9) - (b.pricePerNight ?? 1e9),
    distance: (a, b) => (a.distanceKmToBase ?? 1e9) - (b.distanceKmToBase ?? 1e9),
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
  }[$('#sort').value];
  list.sort(by);
  S.visible = list;

  $('#stayBar').classList.toggle('hidden', !S.stays.length);
  $('#stayMeta').textContent = S.stays.length
    ? `${list.length} of ${S.stays.length} · ${S.nights} night${S.nights > 1 ? 's' : ''}${S.demo ? ' · sample data' : ''}`
    : '';

  $('#stays').innerHTML = list.length
    ? list.map(stayCard).join('')
    : `<div class="empty">${S.stays.length
        ? 'Nothing clears your filters.<br>Remove a tag above or raise the budget.'
        : 'Pick a destination, describe the trip, hit enter.'}</div>`;
}

function renderFlights() {
  $('#flights').innerHTML = S.flights.length
    ? S.flights.map(flightCard).join('')
    : '<div class="empty">Add the airports you’re flying from<br>and we’ll price them all at once.</div>';
}

function renderSaved() {
  $('#savedMeta').textContent = `${S.saved.length} saved`;
  $('#shareBtn').classList.toggle('hidden', !S.saved.length);
  $('#savedList').innerHTML = S.saved.length
    ? S.saved.map((x) => {
        const stay = x.kind === 'stay';
        const d = x.data || {};
        const title = stay ? d.name : `${d.origin || '?'} → ${d.itineraries?.[0]?.to || S.place.airport || ''}`;
        const sub = stay
          ? `${money(d.pricePerNight, d.currency)}/night${d.distanceKmToBase != null ? ` · ${d.distanceKmToBase} km to center` : ''}`
          : `${money(d.price, d.currency)} per person`;
        const href = stay ? d.url : null;
        const open = href ? `<a class="txt" href="${esc(href)}" target="_blank" rel="noopener">` : '<span class="txt">';
        const close = href ? '</a>' : '</span>';
        return `<div class="saved-row">
          <span class="icon">${stay ? '🏠' : '✈️'}</span>
          ${open}<span class="t1">${esc(title)}</span><span class="t2" style="display:block">${esc(sub)}</span>${close}
          <button class="rm" data-save="${x.kind}" data-id="${esc(x.id)}" aria-label="Remove">×</button>
        </div>`;
      }).join('')
    : '<div class="empty">Nothing saved yet — tap the heart on a stay you like.<br>Then Share sends the crew this exact shortlist.</div>';
}

function renderBadge() {
  const b = $('#savedBadge');
  b.classList.toggle('hidden', !S.saved.length);
  b.textContent = S.saved.length || '';
}

function renderAll() { renderTokens(); renderExamples(); renderStays(); renderFlights(); renderSaved(); renderBadge(); }

/* ---------------------------------------------------------------- actions */

const currency = () => CFG.DEFAULT_CURRENCY || 'EUR';

function setStatus(msg, bad) {
  const el = $('#status');
  el.textContent = msg || '';
  el.classList.toggle('bad', !!bad);
}

async function search() {
  const checkin = $('#checkin').value, checkout = $('#checkout').value;
  if (!checkin || !checkout) return setStatus('Pick your dates first.', true);

  S.nights = Math.max(1, Math.round((new Date(checkout) - new Date(checkin)) / 86400000));
  $('#askSpin').classList.remove('hidden');
  setStatus('searching…');

  // 1. where — geocode the destination box (keyless), default to the anchor
  const destText = $('#destination').value.trim();
  if (destText !== S.placeQuery) {
    try {
      S.place = await geocode(destText);
      S.placeQuery = destText;
      S.weather = null;
    } catch (e) {
      $('#askSpin').classList.add('hidden');
      return setStatus(e.message, true);
    }
  }
  fetchWeather(S.place).then((w) => { if (w) { S.weather = w; renderStays(); } });

  // 2. what — parse the sentence locally first so this works with no key
  const text = $('#intent').value.trim();
  S.lastQuery = text;
  S.criteria = parseLocally(text);
  if (text && S.cfg.api) {
    try {
      const r = await api('/api/intent', { text, today: new Date().toISOString().slice(0, 10) });
      S.criteria = mergeCriteria(S.criteria, r.criteria);
    } catch { /* local parse stands */ }
  }
  if (S.criteria.adults) $('#adults').value = S.criteria.adults;
  const adults = +$('#adults').value || 2;
  if (S.criteria.origins?.length && !$('#origins').value) $('#origins').value = S.criteria.origins.join(', ');

  const notes = [];

  // 3. stays
  try {
    const r = await api('/api/stays', {
      anchor: { lat: S.place.lat, lng: S.place.lng, name: S.place.name },
      radiusKm: S.criteria.radiusKm || 15,
      checkin, checkout, adults, currency: currency(), locationText: S.place.name,
    });
    S.stays = r.results || []; S.demo = !!r.demo; S.nights = r.nights || S.nights;
    if (r.report && r.report.withPrice < 60) notes.push(`heads up: only ${r.report.withPrice}% of listings returned a price`);
  } catch (e) {
    if (e.offline) { S.stays = demoStays(S.nights, currency()); S.demo = true; }
    else { S.stays = []; notes.push(e.message); }
  }

  // 4. flights, only if origins given
  const origins = ($('#origins').value.match(/\b[A-Za-z]{3}\b/g) || []).map((s) => s.toUpperCase());
  if (origins.length) {
    try {
      const r = await api('/api/flights', {
        origins, destination: S.place.airport || S.place.name,
        departDate: checkin, returnDate: checkout,
        adults: 1, currency: currency(), max: 6,
      });
      S.flights = r.results || [];
      if (r.errors?.length) notes.push(r.errors[0]);
    } catch (e) {
      S.flights = e.offline ? demoFlights(origins, checkin, currency()) : [];
    }
  }

  S.hasSearched = true;
  $('#askSpin').classList.add('hidden');
  renderAll();
  setStatus(notes.length ? notes.join(' · ')
    : `showing ${S.place.name}${S.demo ? ' — sample listings' : ''}`,
    notes.some((n) => /failed|error|\d{3}/.test(n)));

  // 5. concierge opinion, in the background, only when Claude is on
  S.advice = null;
  if (S.cfg.api && S.visible.length) {
    api('/api/ai', {
      query: text || 'Which of these is the best pick, and what is the catch?',
      criteria: { ...S.criteria, nights: S.nights, adults, anchor: S.place.name, sample: S.demo },
      stays: S.visible.slice(0, 10).map((s) => ({
        id: s.id, name: s.name, pricePerNight: s.pricePerNight, priceTotal: s.priceTotal,
        currency: s.currency, distanceKmToBase: s.distanceKmToBase, rating: s.rating,
        reviews: s.reviews, guests: s.guests, bedrooms: s.bedrooms,
        hasParking: s.hasParking, hasPool: s.hasPool, match: s._score,
      })),
      flights: S.flights.slice(0, 5).map((f) => ({ id: f.id, origin: f.origin, price: f.price, stops: f.itineraries?.[0]?.stops })),
    }).then((r) => { if (!r.demo && r.text) setStatus(r.text.split('\n')[0].slice(0, 160)); }).catch(() => {});
  }
}

function toggleSave(kind, id) {
  const i = S.saved.findIndex((x) => x.kind === kind && x.id === id);
  if (i >= 0) { S.saved.splice(i, 1); S.lastHearted = null; }
  else {
    const data = (kind === 'stay' ? S.stays : S.flights).find((x) => x.id === id);
    if (data) { S.saved.push({ kind, id, data }); S.lastHearted = kind + ':' + id; }
  }
  store.set('rtf.saved', S.saved);
  renderStays(); renderFlights(); renderSaved(); renderBadge();
  if (S.lastHearted) setTimeout(() => { S.lastHearted = null; }, 400);
}

function dropToken(key) {
  const c = S.criteria;
  if (key === 'price') delete c.maxPricePerNight;
  else if (key === 'radius') { delete c.radiusKm; c.priorities.distance = 5; }
  else if (key.startsWith('must:')) c.mustHaves = c.mustHaves.filter((m) => m !== key.slice(5));
  renderTokens(); renderStays();
}

/* ------------------------------------------------------------------ share */

function encodeShare() {
  const p = { v: 3, d: $('#destination').value, q: $('#intent').value,
    in: $('#checkin').value, out: $('#checkout').value,
    a: $('#adults').value, o: $('#origins').value, pl: S.place, s: S.saved };
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeShare(str) {
  try {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  } catch { return null; }
}

/* ------------------------------------------------------------ diagnostics */

async function runDiag() {
  const el = $('#diag');
  const base = $('#workerUrl').value.trim().replace(/\/$/, '');
  if (!base) { el.textContent = 'No endpoint set — the site shows sample listings.'; return; }
  el.textContent = 'Checking…';
  const row = (k, o, extra) => `<div class="row"><span>${k}</span><span class="${o ? 'ok' : 'no'}">${o ? '✓ ' : '✗ '}${esc(extra || (o ? 'working' : 'not working'))}</span></div>`;
  try {
    const h = await (await fetch(base + '/api/health')).json();
    el.innerHTML = row('endpoint', true, 'reachable');
    const cfg = { api: base, code: $('#accessCode').value };
    const saved = S.cfg; S.cfg = cfg;
    const d = await api('/api/diag', { checkin: iso(30), checkout: iso(33) });
    S.cfg = saved;
    el.innerHTML =
      row('endpoint', true, 'reachable') +
      row('stays', d.stays.ok, d.stays.ok ? `${d.stays.listings} listings, ${d.stays.withPrice}% priced` : (d.stays.status || d.stays.error || 'failed')) +
      row('flights', d.flights.ok, d.flights.ok ? `${d.flights.offers} offers, cheapest ${money(d.flights.cheapest, 'EUR')}` : (d.flights.status || d.flights.error || 'failed')) +
      row('Claude', d.ai.ok, d.ai.ok ? d.ai.model : (d.ai.status || d.ai.error || 'failed')) +
      [d.stays.hint, d.flights.hint].filter(Boolean).map((x) => `<div class="hint">${esc(x)}</div>`).join('') +
      (h.accessCodeRequired && !$('#accessCode').value ? '<div class="hint">This endpoint needs an access code.</div>' : '');
  } catch (e) {
    el.innerHTML = row('endpoint', false, e.message) +
      '<div class="hint">Check the URL, and that ALLOWED_ORIGINS in wrangler.toml includes this site.</div>';
  }
}

/* ------------------------------------------------------------------- init */

const EXAMPLES = {
  rota: { d: 'Rota, Spain', q: '4 of us, parking, walkable, under €100' },
  algarve: { d: 'Algarve, Portugal', q: '4 of us, pool, under €150/night' },
};

function init() {
  if (CFG.TRIP_NAME) { $('#tripName').textContent = CFG.TRIP_NAME; document.title = CFG.TRIP_NAME; }
  $('#checkin').value = iso(21);
  $('#checkout').value = iso(24);

  const shared = location.hash.startsWith('#s=') ? decodeShare(location.hash.slice(3)) : null;
  if (shared) {
    $('#destination').value = shared.d || '';
    $('#intent').value = shared.q || '';
    if (shared.in) $('#checkin').value = shared.in;
    if (shared.out) $('#checkout').value = shared.out;
    if (shared.a) $('#adults').value = shared.a;
    if (shared.o) $('#origins').value = shared.o;
    if (shared.pl) { S.place = shared.pl; S.placeQuery = shared.d || ''; }
    S.saved = shared.s || [];
    // Land straight on what was shared — the saved cards — while the live
    // search for current prices runs behind it.
    if (S.saved.length) S.view = 'saved';
  } else {
    const last = store.get('rtf.last', null);
    if (last) { $('#destination').value = last.d || ''; $('#intent').value = last.q || ''; $('#origins').value = last.o || ''; }
  }

  for (const id of ['#destination', '#intent', '#origins']) {
    $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  }
  // Only re-search on blur if the text actually changed — otherwise dismissing
  // a token would re-parse the same text and put it straight back.
  $('#intent').addEventListener('blur', () => {
    if ($('#intent').value.trim() && $('#intent').value !== S.lastQuery) go();
  });
  $('#destination').addEventListener('blur', () => {
    if ($('#destination').value.trim() !== S.placeQuery) go();
  });
  for (const id of ['#checkin', '#checkout', '#adults']) $(id).addEventListener('change', go);
  $('#sort').addEventListener('change', renderStays);
  $$('.tab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  document.addEventListener('click', (e) => {
    const sv = e.target.closest('[data-save]');
    if (sv) { e.preventDefault(); toggleSave(sv.dataset.save, sv.dataset.id); return; }
    const dp = e.target.closest('[data-drop]');
    if (dp) { dropToken(dp.dataset.drop); return; }
    const ex = e.target.closest('[data-example]');
    if (ex) {
      const x = EXAMPLES[ex.dataset.example];
      $('#destination').value = x.d; $('#intent').value = x.q;
      go();
      return;
    }
    if (e.target.id === 'shareBtn') {
      const url = `${location.origin}${location.pathname}#s=${encodeShare()}`;
      const done = () => { e.target.textContent = 'Copied!'; setTimeout(() => { e.target.textContent = 'Share'; }, 1500); };
      const legacy = () => {
        const ta = document.createElement('textarea');
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch {}
        ta.remove();
        if (ok) done(); else setStatus('Copy this link: ' + url);
      };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, legacy);
      else legacy();
    }
  });

  $('#settingsBtn').addEventListener('click', () => {
    $('#workerUrl').value = S.cfg.api; $('#accessCode').value = S.cfg.code;
    $('#sheet').classList.remove('hidden');
  });
  $('#diagBtn').addEventListener('click', runDiag);
  $('#saveSettings').addEventListener('click', () => {
    S.cfg = { api: $('#workerUrl').value.trim(), code: $('#accessCode').value };
    store.set('rtf.cfg', S.cfg);
    $('#sheet').classList.add('hidden');
    go();
  });
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') $('#sheet').classList.add('hidden'); });

  setView(S.view);
  if (shared || store.get('rtf.last', null)) go();
  else renderAll();
}

let timer = null;
function go() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    store.set('rtf.last', { d: $('#destination').value, q: $('#intent').value, o: $('#origins').value });
    search();
  }, 120);
}

document.addEventListener('DOMContentLoaded', init);
})();
