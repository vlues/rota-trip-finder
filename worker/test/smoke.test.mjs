/** Unit tests for the pure helpers. */
import assert from 'node:assert/strict';
import { haversineKm, bboxAround, normalizeStay, pickNum, extractList, parseReport } from '../src/providers.js';
import { suggestItinerary, PLACES } from '../src/area.js';
import { __test } from '../src/index.js';

const base = { lat: 36.645, lng: -6.3494 };
const ctx = { anchor: base, nights: 3, currency: 'EUR' };

// distance: Rota town centre is a couple of km from the base
const d = haversineKm({ lat: 36.6237, lng: -6.3596 }, base);
assert.ok(d > 1 && d < 5, `expected 1-5km, got ${d}`);
assert.equal(haversineKm({ lat: null }, base), null);

// bbox brackets the anchor and is about the requested size
const bb = bboxAround(base.lat, base.lng, 15);
assert.ok(bb.swLat < base.lat && bb.neLat > base.lat);
assert.ok(Math.abs(haversineKm({ lat: bb.neLat, lng: base.lng }, base) - 15) < 1);

// nights
assert.equal(__test.nightsBetween('2026-09-12', '2026-09-15'), 3);
assert.equal(__test.nightsBetween(null, null), 1);
assert.equal(__test.nightsBetween('2026-09-15', '2026-09-12'), 1, 'reversed dates do not go negative');

// numeric picker survives nesting and currency strings
assert.equal(pickNum({ rating: { value: 4.7 } }, 'rating', 'rating.value'), 4.7);
assert.equal(pickNum({ price: 'EUR 88.50' }, 'price'), 88.5);
assert.equal(pickNum({ a: {} }, 'a'), undefined);

// listing array is found wherever the provider hides it
assert.equal(extractList([1, 2]).length, 2);
assert.equal(extractList({ results: [1] }).length, 1);
assert.equal(extractList({ data: { listings: [1, 2, 3] } }).length, 3);
assert.equal(extractList({ junk: 1 }).length, 0);

// normalizer across four provider dialects
const shapes = [
  { id: 1, name: 'A', lat: 36.63, lng: -6.36, price: { rate: 70, total: 210, currency: 'EUR' }, amenities: ['Free parking on premises'] },
  { listingId: 2, title: 'B', coordinates: { latitude: 36.63, longitude: -6.36 }, pricePerNight: 55, previewAmenities: ['Wifi', 'Aparcamiento gratuito'] },
  { roomId: 3, listingTitle: 'C', location: { lat: 36.66, lng: -6.28 }, pricing: { total: 300 }, facilities: ['Pool', 'Air conditioning'] },
  { room_id: 4, localizedName: 'D', geo: { lat: 36.62, lng: -6.37 }, price: '€ 45', highlights: ['Cocina', 'Se admiten mascotas'] },
];
const out = shapes.map((s) => normalizeStay(s, ctx));
assert.equal(out[0].pricePerNight, 70);
assert.equal(out[0].hasParking, true);
assert.equal(out[1].pricePerNight, 55);
assert.equal(out[1].hasParking, true, 'Spanish amenity');
assert.equal(out[2].pricePerNight, 100, 'derives per-night from total');
assert.equal(out[2].hasPool, true);
assert.equal(out[3].pricePerNight, 45, 'strips currency symbol');
assert.equal(out[3].petFriendly, true);
assert.equal(out[3].hasParking, false, 'no false positive');
assert.ok(out.every((o) => typeof o.distanceKmToBase === 'number'));
assert.ok(out.every((o) => o.url.startsWith('https://www.airbnb.com/')));

// airbnb13's real dialect: numeric amenityIds per its published table
// (9 = free parking, 7 = pool, 5 = A/C, 4 = wifi) — words never appear
const ab13 = normalizeStay({
  id: 5, name: 'E', lat: 36.63, lng: -6.36,
  price: { rate: 80, total: 240, currency: 'EUR' },
  amenityIds: [35, 611, 4, 9, 7, 5, 30], previewAmenities: [],
}, ctx);
assert.equal(ab13.hasParking, true, 'parking from amenity id 9');
assert.equal(ab13.hasPool, true, 'pool from amenity id 7');
assert.equal(ab13.hasAC, true, 'A/C from amenity id 5');
assert.equal(ab13.hasWifi, true, 'wifi from amenity id 4');
assert.equal(ab13.petFriendly, false, 'no false positive from ids');
assert.ok(ab13._found.includes('amenities'), 'ids count as amenities for the parse report');

// parse report
assert.equal(parseReport(out).withPrice, 100);
assert.equal(parseReport([{ pricePerNight: null, lat: null }]).withPrice, 0);

// flight normalizer
const f = __test.normalizeFlight(
  { id: '1', price: { grandTotal: '46.20', currency: 'EUR' },
    itineraries: [{ duration: 'PT1H35M', segments: [{ departure: { iataCode: 'MAD', at: 'x' }, arrival: { iataCode: 'XRY', at: 'y' }, carrierCode: 'IB', number: '1' }] }] },
  { carriers: { IB: 'IBERIA' } });
assert.equal(f.price, 46.2);
assert.equal(f.itineraries[0].stops, 0);
assert.deepEqual(f.airlines, ['IBERIA']);

// itinerary builder
for (const n of [1, 3, 7, 14]) {
  const plan = suggestItinerary(n, { interests: ['beach'] });
  assert.equal(plan.days.length, Math.min(n, 10), `plan length for ${n} nights`);
  assert.ok(plan.days.every((day) => day.items.length > 0), 'no empty days');
  const ids = plan.days.flatMap((day) => day.items.map((i) => i.id));
  assert.equal(new Set(ids).size, ids.length, 'no repeated places');
  assert.ok(ids.every((id) => PLACES.some((p) => p.id === id)), 'every place is real');
}
// stated interests actually steer the picks
const hiking = suggestItinerary(4, { interests: ['hiking'] }).days.flatMap((d) => d.items.map((i) => i.id));
assert.ok(hiking.includes('grazalema'), 'hiking interest surfaces the sierra');
const sherry = suggestItinerary(4, { interests: ['sherry'] }).days.flatMap((d) => d.items.map((i) => i.id));
assert.ok(sherry.includes('jerez') || sherry.includes('sanlucar'), 'sherry interest surfaces the sherry towns');

// demo data is always usable
const demo = __test.demoStays(ctx);
assert.ok(demo.length >= 10 && demo.every((s) => s.pricePerNight > 0 && s.distanceKmToBase >= 0 && s.name));

console.log('  ✓ unit tests passed (' + PLACES.length + ' curated places)');
