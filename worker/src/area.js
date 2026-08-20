/**
 * Curated Cádiz-province knowledge, centred on Naval Station Rota.
 *
 * This is deliberately a static file rather than an API call: it makes the
 * trip planner work with zero keys and zero cost, and it means the local
 * facts are reviewable in a diff instead of hallucinated per request. Claude
 * is layered on top to sequence and personalise these — never to invent them.
 *
 * driveMin = approximate car time from the base main gate. Treat as rough.
 */

export const ANCHOR = { lat: 36.645, lng: -6.3494, name: 'Naval Station Rota' };

export const PLACES = [
  { id: 'costilla', name: 'Playa de la Costilla', town: 'Rota', driveMin: 5, walkable: true,
    tags: ['beach', 'easy', 'family'], lat: 36.6229, lng: -6.3672,
    blurb: 'Rota\'s main town beach — wide, calm, right off the promenade. The default "we just landed" afternoon.' },
  { id: 'castillo', name: 'Castillo de Luna', town: 'Rota', driveMin: 5, walkable: true,
    tags: ['history', 'easy', 'free'], lat: 36.6244, lng: -6.3628,
    blurb: '13th-century castle in the middle of old-town Rota. Small, quick, and two minutes from the tapas streets.' },
  { id: 'ballena', name: 'Playa de la Ballena', town: 'Rota', driveMin: 15,
    tags: ['beach', 'quiet'], lat: 36.6659, lng: -6.2895,
    blurb: 'Long pine-backed beach out by Costa Ballena. Quieter than the town beach, easy parking.' },
  { id: 'rota-tapas', name: 'Old-town tapas crawl', town: 'Rota', driveMin: 5, walkable: true,
    tags: ['food', 'night', 'easy'], lat: 36.6237, lng: -6.3608,
    blurb: 'Calle Charco and around. Kitchens mostly open late — 9pm is normal, 7pm will get you a confused look.' },
  { id: 'elpuerto', name: 'El Puerto de Santa María', town: 'El Puerto', driveMin: 20,
    tags: ['food', 'sherry', 'town'], lat: 36.5936, lng: -6.2331,
    blurb: 'Sherry bodegas, the Ribera del Marisco seafood strip, and the ferry across the bay to Cádiz.' },
  { id: 'cadiz', name: 'Cádiz old town', town: 'Cádiz', driveMin: 45,
    tags: ['history', 'town', 'beach', 'food'], lat: 36.5297, lng: -6.2926,
    blurb: 'Often called the oldest city in western Europe. Cathedral, La Caleta beach, and the tangle of the Pópulo quarter. Park outside the walls and walk.' },
  { id: 'jerez', name: 'Jerez de la Frontera', town: 'Jerez', driveMin: 35,
    tags: ['sherry', 'history', 'town'], lat: 36.6817, lng: -6.1377,
    blurb: 'The Alcázar, old tabanco wine bars, sherry houses, and the Royal Andalusian School of Equestrian Art. Also where your friends fly into (XRY).' },
  { id: 'sanlucar', name: 'Sanlúcar de Barrameda', town: 'Sanlúcar', driveMin: 35,
    tags: ['food', 'sherry', 'beach'], lat: 36.7797, lng: -6.3536,
    blurb: 'Manzanilla sherry, langostinos, and boat trips across the river into Doñana national park.' },
  { id: 'chipiona', name: 'Chipiona', town: 'Chipiona', driveMin: 25,
    tags: ['beach', 'easy'], lat: 36.7373, lng: -6.4344,
    blurb: 'Beach town with the tallest lighthouse in Spain. Low-key, good for a half day.' },
  { id: 'vejer', name: 'Vejer de la Frontera', town: 'Vejer', driveMin: 60,
    tags: ['whitetown', 'views', 'food'], lat: 36.2519, lng: -5.9664,
    blurb: 'Whitewashed hill town with serious views and a food scene well above its size.' },
  { id: 'bolonia', name: 'Bolonia & Baelo Claudia', town: 'Bolonia', driveMin: 90,
    tags: ['history', 'beach', 'bigday'], lat: 36.0906, lng: -5.7728,
    blurb: 'Roman town ruins sitting on a wild beach with a giant sand dune behind it. One of the best days in the province.' },
  { id: 'tarifa', name: 'Tarifa', town: 'Tarifa', driveMin: 95,
    tags: ['beach', 'sport', 'bigday'], lat: 36.0143, lng: -5.6044,
    blurb: 'Windsurf and kitesurf capital, southernmost point of mainland Europe, ferries to Tangier.' },
  { id: 'setenil', name: 'Setenil de las Bodegas', town: 'Setenil', driveMin: 90,
    tags: ['whitetown', 'bigday'], lat: 36.8639, lng: -5.1808,
    blurb: 'Houses built into the overhanging rock of a canyon. Genuinely strange to walk through.' },
  { id: 'grazalema', name: 'Grazalema & Zahara de la Sierra', town: 'Sierra', driveMin: 95,
    tags: ['hiking', 'views', 'bigday'], lat: 36.7606, lng: -5.3689,
    blurb: 'Mountain villages, a turquoise reservoir under Zahara, and the best hiking within reach of the base.' },
  { id: 'seville', name: 'Seville', town: 'Seville', driveMin: 90,
    tags: ['city', 'history', 'bigday'], lat: 37.3886, lng: -5.9823,
    blurb: 'Real Alcázar, the cathedral, Triana. Doable as a long day, better as an overnight.' },
];

export const LOCAL_NOTES = [
  'A rental car changes everything here — Rota town is walkable, but almost every day trip on this list assumes wheels.',
  'Shops and smaller kitchens often shut mid-afternoon and reopen around 8pm. Plan beaches and drives for that window.',
  'Dinner starts late. A 9pm reservation is normal; turning up at 7pm means an empty room.',
  'Jerez (XRY) is the closest airport to the base; Seville (SVQ) and Málaga (AGP) are cheaper more often than not.',
  'Beach parking in Rota fills by mid-morning in July and August. Go early or go to Ballena.',
];

/** Pick places that fit the trip length, mixing near and far days. */
export function suggestItinerary(nights, opts = {}) {
  const stay = opts.stay || null;
  const from = stay && stay.lat != null ? { lat: stay.lat, lng: stay.lng } : ANCHOR;
  const interests = new Set(opts.interests || []);

  const scored = PLACES.map((p) => {
    let s = 0;
    for (const t of p.tags) if (interests.has(t)) s += 3;
    if (p.driveMin <= 20) s += 1.5;
    return { ...p, _s: s };
  });

  const days = Math.max(1, Math.min(nights || 1, 10));
  const near = scored.filter((p) => p.driveMin <= 25).sort((a, b) => b._s - a._s);
  const far = scored.filter((p) => p.driveMin > 25).sort((a, b) => b._s - a._s);

  const plan = [];
  const used = new Set();
  const take = (pool) => {
    const p = pool.find((x) => !used.has(x.id));
    if (p) used.add(p.id);
    return p;
  };

  for (let d = 0; d < days; d++) {
    const isArrival = d === 0;
    const isBigDay = !isArrival && d % 2 === 1;
    const picks = [];
    if (isArrival) {
      picks.push(take(near), take(near));
    } else if (isBigDay) {
      picks.push(take(far));
      picks.push(take(near));
    } else {
      picks.push(take(near), take(far));
    }
    const items = picks.filter(Boolean);
    plan.push({
      day: d + 1,
      theme: isArrival ? 'Land and stay local' : isBigDay ? 'Big day out' : 'Half day, half beach',
      items: items.map((p) => ({
        id: p.id, name: p.name, town: p.town, driveMin: p.driveMin,
        blurb: p.blurb, lat: p.lat, lng: p.lng, tags: p.tags,
      })),
    });
  }
  return { origin: from, days: plan, notes: LOCAL_NOTES };
}
