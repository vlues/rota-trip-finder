/**
 * Runs the real Worker over plain HTTP with mocked upstreams, so the browser
 * can be tested against the actual backend code path rather than a stub.
 *   node test/devserver.mjs 8787
 */
import { createServer } from 'node:http';
import worker from '../src/index.js';

const PORT = +process.argv[2] || 8787;

const AIRBNB13 = { results: [
  { id: 2001, name: 'Ático con vistas, 8 min a la base', type: 'Entire apartment', lat: 36.6271, lng: -6.3601,
    persons: 4, bedrooms: 2, beds: 3, price: { rate: 71, total: 213, currency: 'EUR' }, rating: 4.87, reviewsCount: 189,
    amenities: ['Wifi', 'Aparcamiento gratuito en las instalaciones', 'Aire acondicionado', 'Cocina', 'Lavadora'],
    images: [] },
  { id: 2002, name: 'Villa con piscina, Costa Ballena', type: 'Entire villa', lat: 36.6612, lng: -6.2833,
    persons: 8, bedrooms: 4, beds: 6, price: { rate: 138, total: 414, currency: 'EUR' }, rating: 4.95, reviewsCount: 142,
    amenities: ['Pool', 'Free parking on premises', 'Air conditioning', 'Se admiten mascotas', 'Kitchen'], images: [] },
  { id: 2003, name: 'Estudio frente a la playa', type: 'Entire studio', lat: 36.6244, lng: -6.3681,
    persons: 2, bedrooms: 1, beds: 1, price: { rate: 54, total: 162, currency: 'EUR' }, rating: 4.6, reviewsCount: 288,
    amenities: ['Wifi', 'Cocina', 'Primera línea de playa'], images: [] },
  { id: 2004, name: 'Casa adosada con garaje, Rota centro', type: 'Entire home', lat: 36.6233, lng: -6.359,
    persons: 6, bedrooms: 3, beds: 4, price: { rate: 92, total: 276, currency: 'EUR' }, rating: 4.71, reviewsCount: 74,
    amenities: ['Garaje', 'Wifi', 'Aire acondicionado', 'Cocina'], images: [] },
  { id: 2005, name: 'Loft junto al mercado', type: 'Entire loft', lat: 36.6252, lng: -6.3639,
    persons: 3, bedrooms: 1, beds: 2, price: { rate: 66, total: 198, currency: 'EUR' }, rating: 4.9, reviewsCount: 156,
    amenities: ['Wifi', 'Cocina', 'Aire acondicionado'], images: [] },
] };

const AMADEUS = {
  data: [
    { id: '1', numberOfBookableSeats: 7, price: { currency: 'EUR', total: '44.10', grandTotal: '44.10' },
      itineraries: [{ duration: 'PT1H30M', segments: [{ departure: { iataCode: 'MAD', at: '2026-09-10T07:20:00' }, arrival: { iataCode: 'XRY', at: '2026-09-10T08:50:00' }, carrierCode: 'IB', number: '8752' }] }] },
    { id: '2', numberOfBookableSeats: 3, price: { currency: 'EUR', total: '128.00', grandTotal: '131.50' },
      itineraries: [{ duration: 'PT5H10M', segments: [
        { departure: { iataCode: 'MAD', at: '2026-09-10T06:00:00' }, arrival: { iataCode: 'SVQ', at: '2026-09-10T07:05:00' }, carrierCode: 'UX', number: '4001' },
        { departure: { iataCode: 'SVQ', at: '2026-09-10T09:40:00' }, arrival: { iataCode: 'XRY', at: '2026-09-10T11:10:00' }, carrierCode: 'UX', number: '4002' }] }] },
  ],
  dictionaries: { carriers: { IB: 'IBERIA', UX: 'AIR EUROPA' } },
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const reply = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });
  if (url.includes('airbnb13')) return reply(AIRBNB13);
  if (url.includes('oauth2/token')) return reply({ access_token: 't', expires_in: 1799 });
  if (url.includes('flight-offers')) return reply(AMADEUS);
  if (url.includes('api.anthropic.com')) {
    const b = JSON.parse(init.body);
    const sys = b.system || '';
    if (/health check/i.test(sys)) return reply({ content: [{ type: 'text', text: 'OK' }] });
    if (/day-by-day plan/i.test(sys)) return reply({ content: [{ type: 'text', text: JSON.stringify({
      days: [
        { day: 1, title: 'Land, then the beach', text: 'Drop bags and walk down to La Costilla. Eat late in the old town — nothing opens early.', placeIds: ['costilla', 'rota-tapas'] },
        { day: 2, title: 'Sherry and the bay', text: 'Twenty minutes to El Puerto for bodegas and the seafood strip, then loop up to Sanlúcar.', placeIds: ['elpuerto', 'sanlucar'] },
        { day: 3, title: 'Cádiz', text: 'Forty-five minutes down the bay. Park outside the walls and walk the old town.', placeIds: ['cadiz', 'ballena'] },
      ], tip: 'Fill the tank on base — it is meaningfully cheaper than the Spanish stations.',
    }) }] });
    if (/Extract search criteria/i.test(sys)) return reply({ content: [{ type: 'text', text: '{"adults":4,"maxPricePerNight":100,"mustHaves":["hasParking"],"interests":["beach","sherry"],"priorities":{"price":9,"distance":8,"parking":10,"space":5,"rating":4}}' }] });
    return reply({ content: [{ type: 'text', text: 'Go with 2001 — Ático con vistas at €71/night, 2 km from the gate with parking included, and the best price-to-distance ratio here. The catch: two bedrooms for four people means someone is on a sofa bed.\n\n2004 (Casa adosada, €92) is the fallback if you want a real third bedroom and a garage — €63 more across three nights, split four ways that is nothing.\n\nSkip 2003. It is the cheapest at €54 but sleeps two, so you would need a second booking.' }] });
  }
  return realFetch(input, init);
};

const ENV = {
  ALLOWED_ORIGINS: '*',
  RAPIDAPI_KEY: 'dev', RAPIDAPI_HOST: 'airbnb13.p.rapidapi.com', STAY_PROVIDER: 'airbnb13',
  AMADEUS_CLIENT_ID: 'dev', AMADEUS_CLIENT_SECRET: 'dev', AMADEUS_ENV: 'test',
  ANTHROPIC_API_KEY: 'dev', CLAUDE_MODEL: 'claude-sonnet-4-5',
};

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await worker.fetch(
    new Request('http://local' + req.url, { method: req.method, headers: req.headers, body }),
    ENV
  );
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log('worker dev server on http://localhost:' + PORT));
