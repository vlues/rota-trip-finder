/**
 * Rota Trip Finder — Cloudflare Worker API
 *
 * The only place API keys exist. The GitHub Pages frontend is static and
 * public; it never sees a secret.
 *
 *   GET  /api/health   which providers are configured
 *   POST /api/diag     run a REAL probe query and report what parsed
 *   POST /api/stays    stay search
 *   POST /api/flights  flight search (Sky-Scrapper via RapidAPI; Amadeus if
 *                      you still have pre-decommission credentials)
 *   POST /api/plan     day-by-day area itinerary
 *   POST /api/ai       Claude concierge over the current results
 *
 * Secrets:  RAPIDAPI_KEY | APIFY_TOKEN, AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET,
 *           ANTHROPIC_API_KEY, ACCESS_CODE
 * Vars:     ALLOWED_ORIGINS, STAY_PROVIDER, RAPIDAPI_HOST, PROVIDER_PATH,
 *           APIFY_ACTOR, FLIGHT_RAPIDAPI_HOST, AMADEUS_ENV, CLAUDE_MODEL
 */

import {
  PROVIDERS, extractList, normalizeStay, parseReport,
  haversineKm, bboxAround, num,
} from './providers.js';
import { ANCHOR, PLACES, LOCAL_NOTES, suggestItinerary } from './area.js';

const DEFAULT_MODEL = 'claude-sonnet-4-5';

/* ------------------------------------------------------------------ http */

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : allowed[0] || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Trip-Code',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (data, request, env, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request, env) },
  });

const nightsBetween = (a, b) => {
  if (!a || !b) return 1;
  const d = (new Date(b) - new Date(a)) / 86400000;
  return d > 0 ? Math.round(d) : 1;
};

/* Free provider tiers are ~100 requests/MONTH, and a friend group re-opening
   a shared link fires identical searches. Cache successful upstream results
   in the Cloudflare edge cache so those repeats cost zero quota. */
async function cached(key, ttlSeconds, fn) {
  const store = typeof caches !== 'undefined' ? caches.default : null;
  if (!store) return fn();
  const cacheKey = new Request('https://rtf-cache.internal/' + encodeURIComponent(key));
  const hit = await store.match(cacheKey).catch(() => null);
  if (hit) {
    const data = await hit.json();
    return { ...data, cached: true };
  }
  const data = await fn();
  if (!data?.demo && !(data?.errors?.length && !data?.results?.length)) {
    await store.put(cacheKey, new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `s-maxage=${ttlSeconds}` },
    })).catch(() => {});
  }
  return data;
}

/* ---------------------------------------------------------------- stays */

function providerFor(env) {
  const name = env.STAY_PROVIDER || (env.APIFY_TOKEN ? 'apify' : 'airbnb13');
  return { name, def: PROVIDERS[name] || PROVIDERS.generic };
}

function staysConfigured(env) {
  const { name } = providerFor(env);
  return name === 'apify' ? Boolean(env.APIFY_TOKEN) : Boolean(env.RAPIDAPI_KEY);
}

async function callStayProvider(q, env) {
  const { name, def } = providerFor(env);
  const req = def.build(q, env);
  const host = def.kind === 'apify' ? 'api.apify.com' : (env.RAPIDAPI_HOST || `${name}.p.rapidapi.com`);
  const url = `https://${host}${req.path}`;

  const headers = def.kind === 'apify'
    ? { 'Content-Type': 'application/json' }
    : { 'X-RapidAPI-Key': env.RAPIDAPI_KEY, 'X-RapidAPI-Host': host };

  const res = await fetch(url, {
    method: req.method,
    headers,
    body: req.body ? JSON.stringify(req.body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${def.label} returned ${res.status}: ${text.slice(0, 240)}`);
  }
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`${def.label} returned non-JSON: ${text.slice(0, 120)}`); }
  return { data, provider: name, label: def.label, url };
}

async function searchStays(body, env) {
  const anchor = body.anchor || ANCHOR;
  const nights = nightsBetween(body.checkin, body.checkout);
  const currency = body.currency || 'EUR';
  const ctx = { anchor, nights, currency };

  if (!staysConfigured(env)) {
    return { demo: true, nights, provider: 'demo', results: demoStays(ctx) };
  }

  const q = {
    anchor, nights, currency,
    bbox: bboxAround(anchor.lat, anchor.lng, body.radiusKm || 15),
    checkin: body.checkin || '',
    checkout: body.checkout || '',
    adults: body.adults || 2,
    locationText: body.locationText || 'Rota, Cádiz, Spain',
  };

  const { data, provider, label } = await callStayProvider(q, env);
  const list = extractList(data);
  const results = list.map((r) => normalizeStay(r, { ...ctx, provider }));

  // A provider that answers 200 with an unrecognised shape is the failure mode
  // that silently ships blank cards. Catch it here instead.
  if (list.length && results.every((s) => s.pricePerNight == null)) {
    throw new Error(
      `${label} responded, but no prices could be parsed from ${list.length} listings — ` +
      `its schema has probably changed. Run /api/diag to see the raw shape.`
    );
  }

  return { demo: false, nights, provider, label, results, report: parseReport(results) };
}

/** Real probe query + a raw sample, so schema drift is visible not mysterious. */
async function diagnose(body, env) {
  const out = { stays: {}, flights: {}, ai: {} };
  const anchor = body.anchor || ANCHOR;
  const ctx = { anchor, nights: 3, currency: 'EUR' };

  // -- stays
  if (!staysConfigured(env)) {
    out.stays = { ok: false, status: 'not configured', hint: 'Set RAPIDAPI_KEY (or APIFY_TOKEN) as a Worker secret.' };
  } else {
    try {
      const q = {
        anchor, nights: 3, currency: 'EUR',
        bbox: bboxAround(anchor.lat, anchor.lng, 15),
        checkin: body.checkin, checkout: body.checkout, adults: 2,
        locationText: 'Rota, Cádiz, Spain',
      };
      const { data, provider, label } = await callStayProvider(q, env);
      const list = extractList(data);
      const results = list.map((r) => normalizeStay(r, { ...ctx, provider }));
      const report = parseReport(results);
      out.stays = {
        ok: list.length > 0 && report.withPrice > 0,
        provider: label,
        envelopeKeys: Array.isArray(data) ? ['<array>'] : Object.keys(data || {}).slice(0, 12),
        ...report,
        sampleRawKeys: list[0] ? Object.keys(list[0]).slice(0, 25) : [],
        sampleParsed: results[0]
          ? { name: results[0].name, pricePerNight: results[0].pricePerNight,
              distanceKmToBase: results[0].distanceKmToBase, hasParking: results[0].hasParking }
          : null,
        hint: !list.length
          ? 'Provider returned 200 but no listings array was found. Check STAY_PROVIDER / PROVIDER_PATH.'
          : report.withPrice < 50
            ? 'Listings found but most prices did not parse — the provider changed its price field.'
            : undefined,
      };
    } catch (e) {
      out.stays = { ok: false, error: String(e.message).slice(0, 400) };
    }
  }

  // -- flights
  const fp = flightsProvider(env);
  if (!fp) {
    out.flights = { ok: false, status: 'not configured' };
  } else {
    try {
      const r = await searchFlights(
        { origins: ['MAD'], destination: 'XRY', departDate: body.checkin, adults: 1, currency: 'EUR', max: 2 },
        env
      );
      out.flights = {
        ok: r.results.length > 0,
        provider: fp,
        env: fp === 'amadeus' ? (env.AMADEUS_ENV || 'test') : undefined,
        offers: r.results.length,
        cheapest: r.results[0]?.price ?? null,
        errors: r.errors,
        hint: fp === 'amadeus' && (env.AMADEUS_ENV || 'test') === 'test'
          ? 'Amadeus test environment returns sandbox fares, not real bookable prices. Switch AMADEUS_ENV to production once approved.'
          : fp === 'sky-scrapper' && !r.results.length && r.errors?.length
            ? 'Your RapidAPI key must be subscribed to the Sky-Scrapper API (separate from the stays API, same key).'
            : undefined,
      };
    } catch (e) {
      out.flights = { ok: false, provider: fp, error: String(e.message).slice(0, 400) };
    }
  }

  // -- claude
  if (!env.ANTHROPIC_API_KEY) {
    out.ai = { ok: false, status: 'not configured' };
  } else {
    try {
      const r = await callClaude(env, [{ role: 'user', content: 'Reply with exactly: OK' }], 'You are a health check.', 16);
      out.ai = { ok: /OK/i.test(r.text), model: r.model, reply: r.text.slice(0, 40) };
    } catch (e) {
      out.ai = { ok: false, error: String(e.message).slice(0, 400) };
    }
  }

  return out;
}

/* -------------------------------------------------------------- flights */

/* Amadeus decommissioned its self-service portal in July 2026, so new setups
   can't get credentials any more. The default flight source is therefore
   Sky-Scrapper on RapidAPI — the same key that powers stays. Amadeus stays
   supported for anyone holding pre-decommission credentials. */
function flightsProvider(env) {
  if (env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET) return 'amadeus';
  if (env.RAPIDAPI_KEY) return 'sky-scrapper';
  return null;
}

async function searchFlights(body, env) {
  const provider = flightsProvider(env);
  if (!provider) return { demo: true, results: demoFlights(body), errors: [] };
  return provider === 'amadeus' ? amadeusFlights(body, env) : skyFlights(body, env);
}

/* ---- Sky-Scrapper (RapidAPI) ---- */

const skyHost = (env) => env.FLIGHT_RAPIDAPI_HOST || 'sky-scrapper.p.rapidapi.com';
const airportIds = new Map(); // IATA -> { skyId, entityId }, lives as long as the isolate

async function skyFetch(env, path) {
  const host = skyHost(env);
  const res = await fetch(`https://${host}${path}`, {
    headers: { 'X-RapidAPI-Key': env.RAPIDAPI_KEY, 'X-RapidAPI-Host': host },
  });
  if (!res.ok) throw new Error(`flights ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (data?.status === false) {
    throw new Error(`flights: ${JSON.stringify(data.message ?? data.errors ?? 'provider error').slice(0, 160)}`);
  }
  return data;
}

async function resolveAirport(code, env) {
  // Accepts an IATA code or a free-text place name ("Faro", "New York").
  const iata = String(code || '').toUpperCase();
  if (airportIds.has(iata)) return airportIds.get(iata);
  const data = await skyFetch(env, `/api/v1/flights/searchAirport?query=${encodeURIComponent(iata)}&locale=en-US`);
  const rows = Array.isArray(data?.data) ? data.data : [];
  const hit = rows.find((r) => r.skyId === iata)
    || rows.find((r) => r.navigation?.entityType === 'AIRPORT')
    || rows[0];
  const entityId = hit?.entityId ?? hit?.navigation?.entityId;
  if (!hit?.skyId || entityId == null) throw new Error(`${iata}: airport not found`);
  const ids = { skyId: hit.skyId, entityId: String(entityId) };
  airportIds.set(iata, ids);
  return ids;
}

function normalizeSkyItinerary(it) {
  const legs = (it.legs || []).map((l) => {
    const min = num(l.durationInMinutes) ?? 0;
    return {
      durationISO: `PT${Math.floor(min / 60)}H${min % 60}M`,
      stops: l.stopCount ?? Math.max(0, (l.segments || []).length - 1),
      from: l.origin?.displayCode || l.origin?.id,
      to: l.destination?.displayCode || l.destination?.id,
      departAt: l.departure,
      arriveAt: l.arrival,
      segments: (l.segments || []).map((s) => ({
        from: s.origin?.displayCode || s.origin?.flightPlaceId,
        to: s.destination?.displayCode || s.destination?.flightPlaceId,
        departAt: s.departure, arriveAt: s.arrival,
        carrier: s.marketingCarrier?.name || s.operatingCarrier?.name,
        carrierCode: s.marketingCarrier?.alternateId, number: s.flightNumber,
      })),
    };
  });
  return {
    id: it.id,
    price: num(it.price?.raw) ?? num(it.price?.formatted),
    seats: null,
    airlines: [...new Set((it.legs || [])
      .flatMap((l) => (l.carriers?.marketing || []).map((c) => c.name))
      .filter(Boolean))],
    itineraries: legs,
  };
}

async function skyFlights(body, env) {
  const origins = (body.origins?.length ? body.origins : ['MAD']).slice(0, 4);
  const currency = body.currency || 'EUR';
  const out = [];
  const errors = [];

  let dest;
  try { dest = await resolveAirport(body.destination || 'XRY', env); }
  catch (e) { return { demo: false, provider: 'sky-scrapper', results: [], errors: [String(e.message)] }; }

  await Promise.all(origins.map(async (origin) => {
    try {
      const o = await resolveAirport(origin, env);
      const q = new URLSearchParams({
        originSkyId: o.skyId, destinationSkyId: dest.skyId,
        originEntityId: o.entityId, destinationEntityId: dest.entityId,
        date: body.departDate, adults: String(body.adults || 1),
        currency, cabinClass: 'economy', sortBy: 'best',
      });
      if (body.returnDate) q.set('returnDate', body.returnDate);
      const data = await skyFetch(env, `/api/v2/flights/searchFlights?${q}`);
      const its = data?.data?.itineraries || [];
      for (const it of its.slice(0, body.max || 8)) {
        out.push({ origin, ...normalizeSkyItinerary(it), currency });
      }
    } catch (e) { errors.push(`${origin}: ${String(e.message).slice(0, 160)}`); }
  }));

  return {
    demo: false, provider: 'sky-scrapper',
    results: out.sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9)),
    errors,
  };
}

/* ---- Amadeus (legacy) ---- */

let amadeusToken = { value: null, expires: 0 };

async function amadeusAuth(env) {
  const now = Date.now();
  if (amadeusToken.value && now < amadeusToken.expires - 30000) return amadeusToken.value;
  const base = env.AMADEUS_ENV === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com';
  const res = await fetch(`${base}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.AMADEUS_CLIENT_ID,
      client_secret: env.AMADEUS_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Amadeus auth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const t = await res.json();
  amadeusToken = { value: t.access_token, expires: now + (t.expires_in || 1799) * 1000 };
  return amadeusToken.value;
}

function normalizeFlight(offer, dict) {
  const carriers = dict?.carriers || {};
  const itineraries = (offer.itineraries || []).map((it) => {
    const segs = it.segments || [];
    return {
      durationISO: it.duration,
      stops: Math.max(0, segs.length - 1),
      from: segs[0]?.departure?.iataCode,
      to: segs[segs.length - 1]?.arrival?.iataCode,
      departAt: segs[0]?.departure?.at,
      arriveAt: segs[segs.length - 1]?.arrival?.at,
      segments: segs.map((s) => ({
        from: s.departure?.iataCode, to: s.arrival?.iataCode,
        departAt: s.departure?.at, arriveAt: s.arrival?.at,
        carrier: carriers[s.carrierCode] || s.carrierCode,
        carrierCode: s.carrierCode, number: s.number,
      })),
    };
  });
  return {
    id: offer.id,
    price: num(offer.price?.grandTotal ?? offer.price?.total),
    currency: offer.price?.currency,
    seats: offer.numberOfBookableSeats ?? null,
    airlines: [...new Set(itineraries.flatMap((i) => i.segments.map((s) => s.carrier)))],
    itineraries,
  };
}

async function amadeusFlights(body, env) {
  const token = await amadeusAuth(env);
  const base = env.AMADEUS_ENV === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com';
  const origins = (body.origins?.length ? body.origins : ['MAD']).slice(0, 4);
  const out = [];
  const errors = [];

  await Promise.all(origins.map(async (origin) => {
    const q = new URLSearchParams({
      originLocationCode: origin,
      destinationLocationCode: body.destination || 'XRY',
      departureDate: body.departDate,
      adults: String(body.adults || 1),
      currencyCode: body.currency || 'EUR',
      max: String(body.max || 8),
    });
    if (body.returnDate) q.set('returnDate', body.returnDate);
    if (body.nonStop) q.set('nonStop', 'true');
    if (body.maxPrice) q.set('maxPrice', String(Math.round(body.maxPrice)));

    const res = await fetch(`${base}/v2/shopping/flight-offers?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { errors.push(`${origin}: ${res.status} ${(await res.text()).slice(0, 160)}`); return; }
    const data = await res.json();
    for (const offer of data.data || []) out.push({ origin, ...normalizeFlight(offer, data.dictionaries) });
  }));

  return { demo: false, results: out.sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9)), errors };
}

/* ----------------------------------------------------------------- plan */

async function makePlan(body, env) {
  const nights = nightsBetween(body.checkin, body.checkout);
  const base = suggestItinerary(nights, { stay: body.stay, interests: body.interests });

  if (!env.ANTHROPIC_API_KEY) return { demo: true, ...base };

  const sys = `You are writing a short day-by-day plan for visitors staying near Naval Station Rota, Spain.

You will be given a skeleton itinerary built from a curated list of real places in Cádiz province. Rewrite it into a tight, readable plan.

Hard rules:
- Use ONLY the places given to you. Never add a restaurant, bar, hotel, tour or attraction that is not in the list — you do not have live local data and a made-up name sends people to a place that does not exist.
- You may add general practical advice (timing, driving, siesta hours, when to leave) — that is not a place.
- Keep each day to two or three sentences. No filler, no "immerse yourself".
- Mention approximate drive times where they change the decision.

Return JSON only, matching:
{"days":[{"day":1,"title":"short title","text":"2-3 sentences","placeIds":["id","id"]}],"tip":"one practical line for this specific trip"}`;

  const user = `Trip: ${nights} night${nights > 1 ? 's' : ''}, ${body.checkin} to ${body.checkout}, ${body.adults || 2} people.
${body.stay ? `Staying at: ${body.stay.name} (${body.stay.distanceKmToBase} km from the base).` : 'Base area, exact stay not chosen yet.'}
What they said they want: ${body.intent || 'not specified'}

Skeleton to rewrite:
${JSON.stringify(base.days, null, 1)}

Available place ids and names:
${PLACES.map((p) => `${p.id}: ${p.name} (${p.town}, ~${p.driveMin} min) — ${p.blurb}`).join('\n')}`;

  try {
    const r = await callClaude(env, [{ role: 'user', content: user }], sys, 1400);
    const m = r.text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : null;
    if (!parsed?.days) return { demo: false, ...base };

    const byId = Object.fromEntries(PLACES.map((p) => [p.id, p]));
    const days = parsed.days.map((d, i) => ({
      day: d.day ?? i + 1,
      theme: d.title || base.days[i]?.theme || `Day ${i + 1}`,
      text: d.text || '',
      // Drop any id Claude invented — belt and braces on top of the prompt rule.
      items: (d.placeIds || []).filter((id) => byId[id]).map((id) => ({
        id, name: byId[id].name, town: byId[id].town, driveMin: byId[id].driveMin,
        blurb: byId[id].blurb, lat: byId[id].lat, lng: byId[id].lng, tags: byId[id].tags,
      })),
    }));
    return { demo: false, origin: base.origin, days, notes: LOCAL_NOTES, tip: parsed.tip || null, ai: true };
  } catch {
    return { demo: false, ...base };
  }
}

/* --------------------------------------------------------------- claude */

async function callClaude(env, messages, system, maxTokens = 1200) {
  const model = env.CLAUDE_MODEL || DEFAULT_MODEL;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return {
    model,
    text: (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n'),
  };
}

/* Live intel for one Range Rings destination: Claude + web search, so the
   card can say what is true THIS month. Cached hard — one search per place
   per month tier is plenty. */
const SPOT_SYSTEM = `You are the live-intel card inside "Rota Range Rings", a drive-time trip chart for people based in Rota, Spain, driving a 2005 diesel Mercedes E320 (no DGT eco sticker, Crit'Air 4). Use web search to check what is CURRENT at the destination, then reply with exactly 3 short lines, each under 25 words, plain text, in this form:
NOW: anything a visitor should know right now — closures, roadworks, festivals, new restrictions. If nothing notable, the best seasonal fact.
DO: one specific, currently open place or activity, named.
TIP: one practical tip — parking, timing, booking, or weather pattern.
No preamble, no links, no markdown.`;

async function spotIntel(body, env) {
  const model = env.CLAUDE_MODEL || DEFAULT_MODEL;
  const place = [body.name, body.region, body.country].filter(Boolean).join(', ').slice(0, 200);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model, max_tokens: 1200, system: SPOT_SYSTEM,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: `Destination: ${place}. Today: ${body.today || 'unknown'}. The three lines, please.` }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
  return { demo: false, text, model };
}

/* Translate a typed sentence into Range Rings filters — the semantic upgrade
   over the client's regex parser. Heavily cached: the same query costs one
   Claude call per month. */
const RINGS_FILTER_SYSTEM = `You translate a traveller's sentence into filters for "Rota Range Rings", a chart of 154 day and road trips from Rota, Spain. Reply with ONLY this JSON:
{"maxHours":number|null,
 "minBeauty":number|null,
 "freeParking":true|null,
 "noParallel":true|null,
 "noTolls":true|null,
 "hiddenGems":true|null,
 "avoidCarBans":true|null,
 "cats":["coast","village","city","nature","history","foodwine","quirky"]|null,
 "countries":["Spain","Portugal","France","Morocco","Andorra","Gibraltar"]|null,
 "keywords":[]|null,
 "note":"what you understood, 8 words max"}
Rules:
- maxHours = max one-way drive hours, only if a time budget is stated or clearly implied ("day trip" ≈ 3, "weekend away" ≈ 8).
- minBeauty (1-10) only for "the best / most beautiful / top" — use 8.
- avoidCarBans when they mention the diesel ban / old car / no-sticker problem.
- cats: the 2-3 that genuinely fit; vibes map to cats, not keywords ("romantic" → village+foodwine+coast plus hiddenGems; "with kids" → coast+nature).
- keywords: at most 2 lowercase singular stems, ONLY for specifics no other field expresses ("waterfall", "surf", "lavender", "flamenco"). They substring-match trip descriptions.
- Null everything not implied. No prose outside the JSON.`;

async function ringsFilter(body, env) {
  const r = await callClaude(env, [{ role: 'user', content: String(body.text || '').slice(0, 300) }], RINGS_FILTER_SYSTEM, 400);
  const m = r.text.match(/\{[\s\S]*\}/);
  let criteria = null;
  try { criteria = m ? JSON.parse(m[0]) : null; } catch {}
  return { demo: false, criteria };
}

const CONCIERGE_SYSTEM = `You are the concierge inside "Rota Trip Finder", used by people visiting Naval Station Rota, Spain.

You get the group's criteria and the actual listings returned by live search. You:
1. Pick the best 2-3 for THIS group and say why, citing price per night, km to the base, parking, beds.
2. Name the real tradeoff or catch in each.
3. If nothing fits, say so and say what to change — dates, radius, or budget.

Rules:
- Only reference options in the provided data. Never invent a listing, price, or flight.
- Refer to options by id and name.
- Be brief. No preamble, no "great question", no headers unless there are three or more picks.`;

/** Turn a sentence into structured search criteria. Falls back to null. */
async function parseIntent(body, env) {
  if (!env.ANTHROPIC_API_KEY) return { demo: true, criteria: null };
  const sys = `Extract search criteria from a sentence about a trip to the Rota, Spain area. Today is ${body.today}.
Return JSON only:
{"adults":n|null,"checkin":"YYYY-MM-DD"|null,"checkout":"YYYY-MM-DD"|null,"maxPricePerNight":n|null,"radiusKm":5|15|30|60|null,"mustHaves":["hasParking","hasPool","hasAC","hasWifi","hasKitchen","petFriendly","hasWasher","hasSeaView"],"interests":["beach","food","sherry","history","hiking","night","city","whitetown","sport"],"priorities":{"price":0-10,"distance":0-10,"parking":0-10,"space":0-10,"rating":0-10},"origins":["IATA"],"note":"one short line on what you assumed"}
Omit or null anything not stated. Do not guess dates unless the sentence implies them.`;
  try {
    const r = await callClaude(env, [{ role: 'user', content: body.text || '' }], sys, 700);
    const m = r.text.match(/\{[\s\S]*\}/);
    return { demo: false, criteria: m ? JSON.parse(m[0]) : null };
  } catch (e) {
    return { demo: false, criteria: null, error: String(e.message).slice(0, 200) };
  }
}

/* ------------------------------------------------------------ demo data */

function demoStays(ctx) {
  const seeds = [
    ['Bright flat, 6 min walk to the main gate', 36.6262, -6.3628, 68, 4, 2, true, 4.88, 214, 'Entire apartment'],
    ['Townhouse with garage and patio, Rota centro', 36.6237, -6.3596, 95, 6, 3, true, 4.72, 88, 'Entire home'],
    ['Costa Ballena villa, pool, gated', 36.6605, -6.2841, 145, 8, 4, true, 4.94, 131, 'Entire villa'],
    ['Studio by Playa de la Costilla', 36.6248, -6.3672, 52, 2, 1, false, 4.61, 302, 'Entire studio'],
    ['El Puerto 2BR, free street parking', 36.5951, -6.2333, 61, 4, 2, false, 4.55, 76, 'Entire apartment'],
    ['Chipiona beach house, big driveway', 36.7373, -6.4344, 78, 6, 3, true, 4.81, 59, 'Entire home'],
    ['Rota loft, walk to base, no car needed', 36.6289, -6.3541, 74, 3, 1, false, 4.9, 167, 'Entire loft'],
    ['Jerez country casa, quiet, parking', 36.6866, -6.1367, 58, 5, 3, true, 4.44, 41, 'Entire home'],
    ['Seafront apartment, Costa Ballena', 36.6641, -6.2793, 112, 5, 2, true, 4.79, 96, 'Entire apartment'],
    ['Old town casita, roof terrace', 36.6231, -6.3617, 64, 2, 1, false, 4.86, 143, 'Entire home'],
  ];
  return seeds.map(([name, lat, lng, p, guests, bedrooms, parking, rating, reviews, type], i) => ({
    id: `demo-${i + 1}`, source: 'demo', name, type,
    url: 'https://www.airbnb.com/s/Rota--Spain/homes', image: null,
    lat, lng, distanceKmToBase: haversineKm({ lat, lng }, ctx.anchor),
    pricePerNight: p, priceTotal: p * ctx.nights, currency: ctx.currency,
    rating, reviews, beds: bedrooms + 1, bedrooms, guests, superhost: rating > 4.8,
    hasParking: parking, hasPool: /villa/i.test(name), hasAC: true, hasWifi: true,
    hasKitchen: true, petFriendly: i % 3 === 0, hasWasher: true,
    hasSeaView: /seafront|costilla|beach/i.test(name), hasElevator: i % 2 === 0,
  }));
}

function demoFlights(body) {
  const dep = body.departDate || '2026-09-12';
  const table = { MAD: 46, BCN: 63, LGW: 88, LHR: 94, CDG: 79, FCO: 102, BWI: 612, JFK: 545, ATL: 588 };
  return (body.origins?.length ? body.origins : ['MAD', 'BCN']).map((o, i) => {
    const price = table[o] ?? 120 + i * 35;
    const long = price > 300;
    const carrier = ['Iberia', 'Vueling', 'Ryanair', 'Air Europa'][i % 4];
    return {
      id: `demo-f${i}`, origin: o, price, currency: body.currency || 'EUR', seats: 4, airlines: [carrier],
      itineraries: [{
        stops: long ? 1 : 0, from: o, to: body.destination || 'XRY',
        departAt: `${dep}T07:35:00`, arriveAt: `${dep}T${long ? '19' : '09'}:10:00`,
        durationISO: long ? 'PT11H35M' : 'PT1H35M',
        segments: [{ from: o, to: body.destination || 'XRY', carrier, carrierCode: 'XX', number: `${1000 + i}`, departAt: `${dep}T07:35:00`, arriveAt: `${dep}T09:10:00` }],
      }],
    };
  }).sort((a, b) => a.price - b.price);
}

/* --------------------------------------------------------------- router */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (url.pathname === '/api/health') {
      const { name, def } = providerFor(env);
      return json({
        ok: true,
        providers: {
          stays: staysConfigured(env) ? def.label : 'demo',
          flights: flightsProvider(env) === 'amadeus' ? `amadeus:${env.AMADEUS_ENV || 'test'}`
            : flightsProvider(env) === 'sky-scrapper' ? 'sky-scrapper (RapidAPI)' : 'demo',
          ai: env.ANTHROPIC_API_KEY ? (env.CLAUDE_MODEL || DEFAULT_MODEL) : 'off',
        },
        stayProvider: name,
        accessCodeRequired: Boolean(env.ACCESS_CODE),
      }, request, env);
    }

    if (env.ACCESS_CODE && request.headers.get('X-Trip-Code') !== env.ACCESS_CODE) {
      return json({ error: 'Bad or missing access code.' }, request, env, 401);
    }

    if (request.method !== 'POST') return json({ error: 'Not found' }, request, env, 404);

    let body = {};
    try { body = await request.json(); }
    catch { return json({ error: 'Invalid JSON body' }, request, env, 400); }

    try {
      switch (url.pathname) {
        case '/api/stays': {
          const key = 'stays:' + JSON.stringify([body.anchor, body.radiusKm, body.checkin, body.checkout, body.adults, body.currency]);
          return json(await cached(key, 6 * 3600, () => searchStays(body, env)), request, env);
        }
        case '/api/flights': {
          const key = 'flights:' + JSON.stringify([body.origins, body.destination, body.departDate, body.returnDate, body.adults, body.currency]);
          return json(await cached(key, 6 * 3600, () => searchFlights(body, env)), request, env);
        }
        case '/api/spot': {
          if (!env.ANTHROPIC_API_KEY) {
            return json({ demo: true, text: null }, request, env);
          }
          const key = 'spot:' + String(body.name || '').slice(0, 80) + ':' + new Date().toISOString().slice(0, 7);
          return json(await cached(key, 12 * 3600, () => spotIntel(body, env)), request, env);
        }
        case '/api/rings-filter': {
          if (!env.ANTHROPIC_API_KEY) return json({ demo: true, criteria: null }, request, env);
          const key = 'rfilter:' + String(body.text || '').toLowerCase().trim().slice(0, 120);
          return json(await cached(key, 30 * 24 * 3600, () => ringsFilter(body, env)), request, env);
        }
        case '/api/plan':    return json(await makePlan(body, env), request, env);
        case '/api/intent':  return json(await parseIntent(body, env), request, env);
        case '/api/diag':    return json(await diagnose(body, env), request, env);
        case '/api/ai': {
          if (!env.ANTHROPIC_API_KEY) {
            return json({ demo: true, text: 'Claude is not configured on the server yet.' }, request, env);
          }
          const content = `Group criteria:\n${JSON.stringify(body.criteria || {}, null, 2)}\n\nQuestion: ${body.query || 'Which of these is best?'}\n\nStays:\n${JSON.stringify(body.stays || [], null, 1)}\n\nFlights:\n${JSON.stringify(body.flights || [], null, 1)}`;
          const r = await callClaude(env, [{ role: 'user', content }], CONCIERGE_SYSTEM, 1200);
          return json({ demo: false, text: r.text, model: r.model }, request, env);
        }
        default: return json({ error: 'Not found' }, request, env, 404);
      }
    } catch (err) {
      return json({ error: String(err.message || err) }, request, env, 502);
    }
  },
};

export const __test = { nightsBetween, demoStays, demoFlights, normalizeFlight, searchStays, searchFlights, diagnose, makePlan };
