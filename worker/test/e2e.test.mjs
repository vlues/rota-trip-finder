/**
 * End-to-end test of the actual Worker.
 *
 * We stub global fetch so the worker's real code paths run against realistic
 * upstream payloads: an airbnb13-shaped RapidAPI response, a real Amadeus
 * Flight Offers Search envelope, and the Anthropic Messages API shape.
 * Nothing is mocked inside the worker itself — routing, auth, CORS,
 * normalization and error handling all execute for real.
 */
import assert from 'node:assert/strict';
import worker from '../src/index.js';

let calls = [];
const realFetch = globalThis.fetch;

/* ----------------------------------------------------- upstream fixtures */

// Shape modelled on airbnb13 /search-geo
const AIRBNB13 = {
  results: [
    { id: 1001, name: 'Piso luminoso junto a la base', type: 'Entire apartment',
      lat: 36.6262, lng: -6.3628, persons: 4, bedrooms: 2, beds: 3,
      price: { rate: 72, total: 216, currency: 'EUR' },
      rating: 4.88, reviewsCount: 214,
      amenities: ['Wifi', 'Aparcamiento gratuito en las instalaciones', 'Aire acondicionado', 'Cocina'],
      images: ['https://example.test/a.jpg'], deeplink: 'https://www.airbnb.com/rooms/1001' },
    { id: 1002, name: 'Villa Costa Ballena con piscina', type: 'Entire villa',
      lat: 36.6605, lng: -6.2841, persons: 8, bedrooms: 4, beds: 5,
      price: { rate: 150, total: 450, currency: 'EUR' },
      rating: 4.94, reviewsCount: 131,
      amenities: ['Pool', 'Free parking', 'Air conditioning', 'Se admiten mascotas'],
      images: ['https://example.test/b.jpg'] },
    { id: 1003, name: 'Studio near the beach', type: 'Entire studio',
      lat: 36.6248, lng: -6.3672, persons: 2, bedrooms: 1, beds: 1,
      price: { rate: 49, total: 147, currency: 'EUR' },
      rating: 4.61, reviewsCount: 302, amenities: ['Wifi', 'Kitchen'], images: [] },
  ],
};

// Real Amadeus v2 envelope
const AMADEUS_OFFERS = {
  meta: { count: 2 },
  data: [
    { type: 'flight-offer', id: '1', numberOfBookableSeats: 6,
      price: { currency: 'EUR', total: '46.20', grandTotal: '46.20', base: '30.00' },
      itineraries: [{ duration: 'PT1H35M', segments: [
        { departure: { iataCode: 'MAD', at: '2026-09-10T07:35:00' },
          arrival: { iataCode: 'XRY', at: '2026-09-10T09:10:00' },
          carrierCode: 'IB', number: '8756' }] }] },
    { type: 'flight-offer', id: '2', numberOfBookableSeats: 2,
      price: { currency: 'EUR', total: '132.40', grandTotal: '138.90' },
      itineraries: [{ duration: 'PT4H55M', segments: [
        { departure: { iataCode: 'MAD', at: '2026-09-10T06:00:00' },
          arrival: { iataCode: 'SVQ', at: '2026-09-10T07:05:00' }, carrierCode: 'UX', number: '4001' },
        { departure: { iataCode: 'SVQ', at: '2026-09-10T09:30:00' },
          arrival: { iataCode: 'XRY', at: '2026-09-10T10:55:00' }, carrierCode: 'UX', number: '4002' }] }] },
  ],
  dictionaries: { carriers: { IB: 'IBERIA', UX: 'AIR EUROPA' } },
};

// Sky-Scrapper (RapidAPI) shapes — the default flight source since Amadeus
// closed self-service. Verified against the API's published docs.
const SKY_ENTITY = { MAD: '95565077', XRY: '95565096' };
const SKY_FLIGHTS = {
  status: true,
  data: {
    itineraries: [
      { id: 'sk-2', price: { raw: 141.9, formatted: '€142' },
        legs: [{ origin: { id: 'MAD', displayCode: 'MAD' }, destination: { id: 'XRY', displayCode: 'XRY' },
          durationInMinutes: 295, stopCount: 1,
          departure: '2026-09-10T06:00:00', arrival: '2026-09-10T10:55:00',
          carriers: { marketing: [{ name: 'Vueling' }] },
          segments: [
            { origin: { displayCode: 'MAD' }, destination: { displayCode: 'SVQ' },
              departure: '2026-09-10T06:00:00', arrival: '2026-09-10T07:05:00',
              flightNumber: '4001', marketingCarrier: { name: 'Vueling', alternateId: 'VY' } },
            { origin: { displayCode: 'SVQ' }, destination: { displayCode: 'XRY' },
              departure: '2026-09-10T09:30:00', arrival: '2026-09-10T10:55:00',
              flightNumber: '4002', marketingCarrier: { name: 'Vueling', alternateId: 'VY' } }] }] },
      { id: 'sk-1', price: { raw: 52.4, formatted: '€52' },
        legs: [{ origin: { id: 'MAD', displayCode: 'MAD' }, destination: { id: 'XRY', displayCode: 'XRY' },
          durationInMinutes: 95, stopCount: 0,
          departure: '2026-09-10T07:35:00', arrival: '2026-09-10T09:10:00',
          carriers: { marketing: [{ name: 'Iberia' }] },
          segments: [{ origin: { displayCode: 'MAD' }, destination: { displayCode: 'XRY' },
            departure: '2026-09-10T07:35:00', arrival: '2026-09-10T09:10:00',
            flightNumber: '8756', marketingCarrier: { name: 'Iberia', alternateId: 'IB' } }] }] },
    ],
  },
};

function claudeReply(text) {
  return { content: [{ type: 'text', text }], model: 'claude-sonnet-4-5' };
}

/* --------------------------------------------------------- fetch harness */

function installFetch(overrides = {}) {
  calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const reply = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

    for (const [match, handler] of Object.entries(overrides)) {
      if (url.includes(match)) return handler(url, init, reply);
    }
    if (url.includes('rapidapi.com/search-geo') || url.includes('airbnb13')) return reply(AIRBNB13);
    if (url.includes('searchAirport')) {
      const iata = new URL(url).searchParams.get('query');
      return reply({ status: true, data: [{ skyId: iata, entityId: SKY_ENTITY[iata] || '1', navigation: { entityType: 'AIRPORT', entityId: SKY_ENTITY[iata] || '1' } }] });
    }
    if (url.includes('sky-scrapper') && url.includes('searchFlights')) return reply(SKY_FLIGHTS);
    if (url.includes('oauth2/token')) return reply({ access_token: 'tok_test', expires_in: 1799 });
    if (url.includes('shopping/flight-offers')) return reply(AMADEUS_OFFERS);
    if (url.includes('api.anthropic.com')) {
      const b = JSON.parse(init.body);
      if (/health check/i.test(b.system || '')) return reply(claudeReply('OK'));
      if (/day-by-day plan/i.test(b.system || '')) {
        return reply(claudeReply(JSON.stringify({
          days: [
            { day: 1, title: 'Land and settle', text: 'Drop bags, walk to the beach.', placeIds: ['costilla', 'rota-tapas'] },
            { day: 2, title: 'Sherry day', text: 'Head to Jerez.', placeIds: ['jerez', 'NOT_A_REAL_PLACE'] },
          ], tip: 'Book the bodega tour ahead.',
        })));
      }
      if (/Extract search criteria/i.test(b.system || '')) {
        return reply(claudeReply('{"adults":4,"maxPricePerNight":100,"mustHaves":["hasParking"],"interests":["beach","sherry"],"priorities":{"price":9,"distance":8,"parking":10,"space":5,"rating":4}}'));
      }
      return reply(claudeReply('Pick demo-1: cheapest with parking, 2.4 km from the gate.'));
    }
    throw new Error('unexpected fetch: ' + url);
  };
}

const ENV_FULL = {
  ALLOWED_ORIGINS: 'https://parker.github.io',
  RAPIDAPI_KEY: 'rk_test', RAPIDAPI_HOST: 'airbnb13.p.rapidapi.com', STAY_PROVIDER: 'airbnb13',
  AMADEUS_CLIENT_ID: 'ac', AMADEUS_CLIENT_SECRET: 'as', AMADEUS_ENV: 'test',
  ANTHROPIC_API_KEY: 'sk-test', ACCESS_CODE: 'rota2026',
};

const req = (path, body, { env = ENV_FULL, code = 'rota2026', origin = 'https://parker.github.io', method = 'POST' } = {}) =>
  worker.fetch(new Request('https://api.test' + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Trip-Code': code, Origin: origin },
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
  }), env);

const ok = (name) => console.log('  ✓ ' + name);

/* ------------------------------------------------------------------ run */

console.log('\nWorker end-to-end\n');

/* --- health + auth + CORS --- */
{
  installFetch();
  const r = await req('/api/health', null, { method: 'GET' });
  const h = await r.json();
  assert.equal(r.status, 200);
  assert.equal(h.providers.stays, 'airbnb13 (RapidAPI)');
  assert.equal(h.providers.flights, 'amadeus:test');
  assert.equal(h.accessCodeRequired, true);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://parker.github.io');
  ok('health reports configured providers and echoes the allowed origin');

  const bad = await req('/api/stays', {}, { code: 'wrong' });
  assert.equal(bad.status, 401);
  ok('wrong access code is rejected with 401');

  const pre = await worker.fetch(new Request('https://api.test/api/stays', { method: 'OPTIONS', headers: { Origin: 'https://parker.github.io' } }), ENV_FULL);
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /X-Trip-Code/);
  ok('CORS preflight succeeds');

  const evil = await worker.fetch(new Request('https://api.test/api/health', { headers: { Origin: 'https://evil.test' } }), ENV_FULL);
  assert.notEqual(evil.headers.get('Access-Control-Allow-Origin'), 'https://evil.test');
  ok('unlisted origin does not get an allow header for itself');
}

/* --- stays --- */
{
  installFetch();
  const r = await req('/api/stays', { checkin: '2026-09-10', checkout: '2026-09-13', adults: 4, radiusKm: 15, currency: 'EUR' });
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.equal(d.demo, false);
  assert.equal(d.nights, 3);
  assert.equal(d.results.length, 3);

  const upstream = calls.find((c) => c.url.includes('search-geo'));
  assert.ok(upstream, 'called the provider');
  assert.equal(upstream.headers['X-RapidAPI-Key'], 'rk_test');
  const u = new URL(upstream.url);
  for (const p of ['ne_lat', 'ne_lng', 'sw_lat', 'sw_lng', 'checkin', 'checkout', 'adults', 'currency']) {
    assert.ok(u.searchParams.has(p), `missing param ${p}`);
  }
  assert.ok(+u.searchParams.get('ne_lat') > 36.645 && +u.searchParams.get('sw_lat') < 36.645, 'bbox brackets the base');
  ok('stays: request carries the key and a bbox around the base');

  const [a, b, c] = d.results;
  assert.equal(a.pricePerNight, 72);
  assert.equal(a.priceTotal, 216);
  assert.equal(a.distanceKmToBase, 2.4);
  assert.equal(a.hasParking, true, 'detects Spanish "Aparcamiento gratuito"');
  assert.equal(a.hasAC, true, 'detects "Aire acondicionado"');
  assert.equal(a.url, 'https://www.airbnb.com/rooms/1001');
  assert.equal(a.image, 'https://example.test/a.jpg');
  assert.equal(b.hasPool, true);
  assert.equal(b.petFriendly, true, 'detects "Se admiten mascotas"');
  assert.equal(c.hasParking, false, 'no false positive when parking absent');
  ok('stays: prices, distance, images and EN+ES amenities all parse');

  assert.equal(d.report.withPrice, 100);
  assert.equal(d.report.withCoords, 100);
  ok('stays: parse report is 100% on a healthy provider');
}

/* --- stays: schema drift is caught loudly, not silently --- */
{
  installFetch({ 'search-geo': (u, i, reply) => reply({ results: [{ id: 9, name: 'X', lat: 36.6, lng: -6.3, cost_in_cents: 7200 }] }) });
  const r = await req('/api/stays', { checkin: '2026-09-10', checkout: '2026-09-13' });
  const d = await r.json();
  assert.equal(r.status, 502);
  assert.match(d.error, /no prices could be parsed/);
  assert.match(d.error, /schema has probably changed/);
  ok('stays: unparseable prices raise a clear error instead of blank cards');
}

/* --- stays: provider outage surfaces the upstream status --- */
{
  installFetch({ 'search-geo': (u, i, reply) => reply({ message: 'You are not subscribed to this API.' }, 403) });
  const r = await req('/api/stays', { checkin: '2026-09-10', checkout: '2026-09-13' });
  const d = await r.json();
  assert.equal(r.status, 502);
  assert.match(d.error, /403/);
  assert.match(d.error, /not subscribed/);
  ok('stays: upstream 403 is reported verbatim so you can fix the subscription');
}

/* --- stays: no key at all still returns usable demo data --- */
{
  installFetch();
  const r = await req('/api/stays', { checkin: '2026-09-10', checkout: '2026-09-13' }, { env: { ALLOWED_ORIGINS: '*' }, code: undefined });
  const d = await r.json();
  assert.equal(d.demo, true);
  assert.ok(d.results.length >= 10);
  assert.ok(d.results.every((s) => s.pricePerNight > 0 && s.distanceKmToBase >= 0));
  ok('stays: unconfigured worker degrades to demo data, never an error page');
}

/* --- alternate provider shapes --- */
{
  // Apify returns a bare array with camelCase fields
  installFetch({ 'api.apify.com': (u, i, reply) => reply([
    { roomId: 77, listingTitle: 'Casa con cochera', coordinates: { latitude: 36.63, longitude: -6.36 },
      pricing: { total: 300 }, previewAmenities: ['Cocina', 'Lavadora'], rating: { value: 4.7, reviewCount: 12 } },
  ]) });
  const r = await req('/api/stays', { checkin: '2026-09-10', checkout: '2026-09-13' }, {
    env: { ...ENV_FULL, STAY_PROVIDER: 'apify', APIFY_TOKEN: 'ap_test', RAPIDAPI_KEY: undefined },
  });
  const d = await r.json();
  assert.equal(d.demo, false);
  assert.equal(d.results.length, 1);
  assert.equal(d.results[0].pricePerNight, 100, 'derives per-night from total');
  assert.equal(d.results[0].hasParking, true, 'detects "cochera"');
  assert.equal(d.results[0].rating, 4.7);
  assert.ok(calls.some((c) => c.url.includes('run-sync-get-dataset-items') && c.method === 'POST'));
  ok('stays: a totally different provider shape (Apify, bare array) also normalizes');
}

/* --- flights --- */
{
  installFetch();
  const r = await req('/api/flights', { origins: ['MAD'], destination: 'XRY', departDate: '2026-09-10', returnDate: '2026-09-13', adults: 1, currency: 'EUR', nonStop: false });
  const d = await r.json();
  assert.equal(d.demo, false);
  assert.equal(d.results.length, 2);
  assert.equal(d.results[0].price, 46.2, 'cheapest first, grandTotal used');
  assert.equal(d.results[0].airlines[0], 'IBERIA', 'carrier code resolved via dictionaries');
  assert.equal(d.results[0].itineraries[0].stops, 0);
  assert.equal(d.results[1].itineraries[0].stops, 1, 'two segments = one stop');
  assert.equal(d.results[1].price, 138.9, 'grandTotal preferred over total');

  const auth = calls.find((c) => c.url.includes('oauth2/token'));
  assert.equal(auth.method, 'POST');
  assert.match(String(auth.body), /grant_type=client_credentials/);
  const search = new URL(calls.find((c) => c.url.includes('flight-offers')).url);
  assert.equal(search.searchParams.get('originLocationCode'), 'MAD');
  assert.equal(search.searchParams.get('destinationLocationCode'), 'XRY');
  assert.equal(search.searchParams.get('departureDate'), '2026-09-10');
  assert.equal(search.searchParams.get('returnDate'), '2026-09-13');
  assert.equal(search.searchParams.get('currencyCode'), 'EUR');
  assert.equal(search.searchParams.has('nonStop'), false, 'nonStop omitted when false');
  assert.ok(search.pathname.endsWith('/v2/shopping/flight-offers'));
  ok('flights: OAuth + exact Amadeus param names verified against their OpenAPI spec');

  // token is cached, not re-fetched
  calls.length = 0;
  await req('/api/flights', { origins: ['MAD'], departDate: '2026-09-10' });
  assert.equal(calls.filter((c) => c.url.includes('oauth2/token')).length, 0);
  ok('flights: access token is cached between requests');
}

/* --- flights: one bad origin does not kill the others --- */
{
  installFetch({ 'originLocationCode=BCN': (u, i, reply) => reply({ errors: [{ detail: 'no fares' }] }, 400) });
  const r = await req('/api/flights', { origins: ['MAD', 'BCN'], departDate: '2026-09-10' });
  const d = await r.json();
  assert.ok(d.results.length >= 1, 'MAD results survive');
  assert.equal(d.errors.length, 1);
  assert.match(d.errors[0], /BCN/);
  ok('flights: a failing origin degrades to a warning, others still return');
}

/* --- flights: sky-scrapper is the default when Amadeus creds are absent --- */
{
  installFetch();
  const env = { ...ENV_FULL, AMADEUS_CLIENT_ID: '', AMADEUS_CLIENT_SECRET: '' };

  const h = await (await req('/api/health', null, { method: 'GET', env })).json();
  assert.equal(h.providers.flights, 'sky-scrapper (RapidAPI)');

  const r = await req('/api/flights',
    { origins: ['MAD'], destination: 'XRY', departDate: '2026-09-10', returnDate: '2026-09-13', adults: 1, currency: 'EUR' },
    { env });
  const d = await r.json();
  assert.equal(d.demo, false);
  assert.equal(d.provider, 'sky-scrapper');
  assert.equal(d.results.length, 2);
  assert.equal(d.results[0].price, 52.4, 'cheapest first from price.raw');
  assert.equal(d.results[0].currency, 'EUR');
  assert.deepEqual(d.results[0].airlines, ['Iberia']);
  assert.equal(d.results[0].itineraries[0].stops, 0);
  assert.equal(d.results[0].itineraries[0].durationISO, 'PT1H35M', 'minutes converted to the ISO shape the UI parses');
  assert.equal(d.results[0].itineraries[0].from, 'MAD');
  assert.equal(d.results[1].itineraries[0].stops, 1);
  assert.equal(d.results[1].itineraries[0].segments.length, 2);
  assert.equal(d.results[1].itineraries[0].segments[0].carrier, 'Vueling');

  // the request itself carried resolved ids and the documented v2 params
  const search = new URL(calls.find((c) => c.url.includes('searchFlights')).url);
  assert.ok(search.pathname.endsWith('/api/v2/flights/searchFlights'));
  assert.equal(search.hostname, 'sky-scrapper.p.rapidapi.com');
  assert.equal(search.searchParams.get('originSkyId'), 'MAD');
  assert.equal(search.searchParams.get('destinationSkyId'), 'XRY');
  assert.equal(search.searchParams.get('originEntityId'), SKY_ENTITY.MAD);
  assert.equal(search.searchParams.get('destinationEntityId'), SKY_ENTITY.XRY);
  assert.equal(search.searchParams.get('date'), '2026-09-10');
  assert.equal(search.searchParams.get('returnDate'), '2026-09-13');
  ok('flights: sky-scrapper resolves airports and normalizes to the UI shape');

  // airport ids are cached — a second search does not re-resolve
  calls.length = 0;
  await req('/api/flights', { origins: ['MAD'], destination: 'XRY', departDate: '2026-09-11' }, { env });
  assert.equal(calls.filter((c) => c.url.includes('searchAirport')).length, 0);
  ok('flights: airport id lookups are cached between requests');
}

/* --- plan --- */
{
  installFetch();
  const r = await req('/api/plan', { checkin: '2026-09-10', checkout: '2026-09-13', adults: 4, interests: ['beach', 'sherry'], stay: { name: 'Test flat', lat: 36.626, lng: -6.362, distanceKmToBase: 2.4 } });
  const d = await r.json();
  assert.equal(d.ai, true);
  assert.equal(d.days.length, 2);
  assert.equal(d.days[0].items[0].name, 'Playa de la Costilla');
  assert.equal(d.tip, 'Book the bodega tour ahead.');
  const allIds = d.days.flatMap((x) => x.items.map((i) => i.id));
  assert.ok(!allIds.includes('NOT_A_REAL_PLACE'), 'invented place id was stripped');
  assert.ok(d.days[1].items.every((i) => i.lat && i.name), 'surviving places are hydrated from the curated list');
  ok('plan: Claude sequences real places and an invented one is filtered out');

  const r2 = await req('/api/plan', { checkin: '2026-09-10', checkout: '2026-09-14' }, { env: { ALLOWED_ORIGINS: '*' }, code: undefined });
  const d2 = await r2.json();
  assert.equal(d2.demo, true);
  assert.equal(d2.days.length, 4);
  assert.ok(d2.days.every((day) => day.items.length > 0));
  assert.ok(d2.notes.length >= 3);
  ok('plan: works with no Claude key at all, straight from the curated list');
}

/* --- plan: Claude returning junk falls back instead of 500ing --- */
{
  installFetch({ 'api.anthropic.com': (u, i, reply) => reply(claudeReply('sorry, I cannot do that')) });
  const r = await req('/api/plan', { checkin: '2026-09-10', checkout: '2026-09-12' });
  const d = await r.json();
  assert.equal(r.status, 200);
  assert.ok(d.days.length === 2 && d.days[0].items.length > 0);
  ok('plan: unparseable Claude output silently falls back to the skeleton');
}

/* --- intent parsing --- */
{
  installFetch();
  const r = await req('/api/intent', { text: '4 of us, needs parking, under 100 a night, want beaches and sherry', today: '2026-08-20' });
  const d = await r.json();
  assert.equal(d.criteria.adults, 4);
  assert.equal(d.criteria.maxPricePerNight, 100);
  assert.deepEqual(d.criteria.mustHaves, ['hasParking']);
  ok('intent: a sentence becomes structured criteria');
}

/* --- diag --- */
{
  installFetch();
  const r = await req('/api/diag', { checkin: '2026-09-10', checkout: '2026-09-13' });
  const d = await r.json();
  assert.equal(d.stays.ok, true);
  assert.equal(d.stays.withPrice, 100);
  assert.ok(d.stays.sampleRawKeys.includes('price'));
  assert.equal(d.stays.sampleParsed.pricePerNight, 72);
  assert.equal(d.flights.ok, true);
  assert.equal(d.flights.cheapest, 46.2);
  assert.match(d.flights.hint, /sandbox fares/);
  assert.equal(d.ai.ok, true);
  ok('diag: reports a live green light across all three providers');

  installFetch({ 'search-geo': (u, i, reply) => reply({ nothing: true }) });
  const r2 = await req('/api/diag', { checkin: '2026-09-10', checkout: '2026-09-13' });
  const d2 = await r2.json();
  assert.equal(d2.stays.ok, false);
  assert.match(d2.stays.hint, /no listings array/);
  assert.deepEqual(d2.stays.envelopeKeys, ['nothing']);
  ok('diag: an unrecognised envelope is diagnosed with the keys it actually saw');
}

/* --- concierge --- */
{
  installFetch();
  const r = await req('/api/ai', { query: 'best value?', criteria: { maxPricePerNight: 100 }, stays: [{ id: 'demo-1', name: 'Flat', pricePerNight: 68 }], flights: [] });
  const d = await r.json();
  assert.match(d.text, /demo-1/);
  const sent = JSON.parse(calls.find((c) => c.url.includes('anthropic')).body);
  assert.match(sent.system, /Never invent a listing/);
  assert.match(sent.messages[0].content, /demo-1/);
  ok('concierge: prompt pins Claude to the supplied listings');
}

/* --- unknown route --- */
{
  installFetch();
  const r = await req('/api/nope', {});
  assert.equal(r.status, 404);
  ok('unknown routes 404');
}

globalThis.fetch = realFetch;
console.log('\nAll end-to-end tests passed.\n');
