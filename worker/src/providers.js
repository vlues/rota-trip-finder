/**
 * Stay providers.
 *
 * Airbnb has no public API, so live inventory comes from a third-party data
 * provider. Those come and go and none of them share a schema, so this file
 * keeps three things separate:
 *
 *   1. buildRequest()  - how to ASK a given provider (path + params)
 *   2. extractList()   - where the array of listings lives in its response
 *   3. normalizeStay() - one tolerant mapper that copes with every field
 *                        naming convention we've seen, and REPORTS which
 *                        fields it managed to find.
 *
 * That last part is the important one: /api/diag runs a real query and tells
 * you exactly which fields parsed, so you find out a provider changed its
 * schema by looking at a screen, not by a friend telling you prices are blank.
 */

export const PROVIDERS = {
  // https://rapidapi.com/3b-data-3b-data-default/api/airbnb13
  airbnb13: {
    label: 'airbnb13 (RapidAPI)',
    kind: 'rapidapi',
    build(q) {
      const p = new URLSearchParams({
        ne_lat: q.bbox.neLat.toFixed(5),
        ne_lng: q.bbox.neLng.toFixed(5),
        sw_lat: q.bbox.swLat.toFixed(5),
        sw_lng: q.bbox.swLng.toFixed(5),
        checkin: q.checkin,
        checkout: q.checkout,
        adults: String(q.adults),
        children: '0',
        infants: '0',
        pets: '0',
        page: '1',
        currency: q.currency,
      });
      return { path: `/search-geo?${p}`, method: 'GET' };
    },
  },

  // Generic lat/lng RapidAPI listing. Set PROVIDER_PATH if it isn't /search.
  generic: {
    label: 'generic RapidAPI',
    kind: 'rapidapi',
    build(q, env) {
      const p = new URLSearchParams({
        location: q.locationText,
        latitude: String(q.anchor.lat),
        longitude: String(q.anchor.lng),
        checkin: q.checkin,
        checkout: q.checkout,
        adults: String(q.adults),
        currency: q.currency,
      });
      return { path: `${env.PROVIDER_PATH || '/search'}?${p}`, method: 'GET' };
    },
  },

  // https://apify.com/ — POST /v2/actors/:actorId/run-sync-get-dataset-items
  // Returns a bare array of scraped listings.
  apify: {
    label: 'Apify actor',
    kind: 'apify',
    build(q, env) {
      return {
        path: `/v2/actors/${encodeURIComponent(env.APIFY_ACTOR || 'tri_angle~airbnb-scraper')}/run-sync-get-dataset-items?token=${env.APIFY_TOKEN}`,
        method: 'POST',
        body: {
          locationQueries: [q.locationText],
          checkIn: q.checkin,
          checkOut: q.checkout,
          adults: q.adults,
          currency: q.currency,
          maxItems: 40,
        },
      };
    },
  },
};

/** Where does the listings array live? Providers disagree. Try them all. */
export function extractList(data) {
  if (Array.isArray(data)) return data;
  for (const k of ['results', 'data', 'listings', 'properties', 'searchResults', 'items', 'rooms']) {
    if (Array.isArray(data?.[k])) return data[k];
  }
  // one level deeper, e.g. { data: { listings: [...] } }
  for (const v of Object.values(data || {})) {
    if (v && typeof v === 'object') {
      for (const k of ['results', 'listings', 'items', 'searchResults']) {
        if (Array.isArray(v[k])) return v[k];
      }
    }
  }
  return [];
}

export function pick(obj, ...paths) {
  for (const p of paths) {
    const v = p.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/**
 * Like pick(), but keeps walking until a path yields an actual number.
 * Providers that nest ({rating:{value:4.7}}) used to shadow the nested path
 * with a non-numeric parent, which silently produced nulls.
 */
export function pickNum(obj, ...paths) {
  for (const p of paths) {
    const n = num(p.split('.').reduce((o, k) => (o == null ? o : o[k]), obj));
    if (n !== undefined) return n;
  }
  return undefined;
}

export function num(v) {
  if (v && typeof v === 'object') return undefined;
  if (v == null) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function haversineKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371, r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

export function bboxAround(lat, lng, radiusKm) {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);
  return { swLat: lat - dLat, swLng: lng - dLng, neLat: lat + dLat, neLng: lng + dLng };
}

/* Amenity detection, English + Spanish, since half the Rota-area hosts write
   their listings in Spanish. */
/* airbnb13 sends amenities as numeric ids; the mapping is published in its
   API docs ("3. List of amenity Ids"). Text patterns can't see numbers, so
   these are checked explicitly. */
const AMENITY_IDS = {
  hasParking: [9],          // Free parking on premises
  hasPool: [7],
  hasAC: [5],
  hasWifi: [4],
  hasKitchen: [2, 8],
  petFriendly: [12],
  hasWasher: [33],
  hasElevator: [21],
};

const AMENITY_PATTERNS = {
  hasParking: /free parking|parking|garage|garaje|aparcamiento|cochera|plaza de garaje|driveway/i,
  hasPool: /\bpool\b|piscina|swimming/i,
  hasAC: /air.?condition|\ba\/c\b|aire acondicionado|climatiz/i,
  hasWifi: /wifi|wi-?fi|internet|banda ancha/i,
  hasKitchen: /kitchen|cocina|kitchenette/i,
  petFriendly: /pets? allowed|pet.?friendly|dog.?friendly|se admiten mascotas|mascota/i,
  hasWasher: /washer|washing machine|lavadora/i,
  hasSeaView: /sea view|ocean view|beachfront|vista al mar|primera línea/i,
  hasElevator: /elevator|lift|ascensor/i,
};

export function normalizeStay(raw, ctx) {
  const found = new Set();
  const P = (label, ...paths) => {
    const v = pick(raw, ...paths);
    if (v !== undefined) found.add(label);
    return v;
  };

  const N = (label, ...paths) => {
    const v = pickNum(raw, ...paths);
    if (v !== undefined) found.add(label);
    return v;
  };

  const lat = N('coords', 'lat', 'latitude', 'coordinates.latitude', 'coordinates.lat',
    'location.lat', 'location.latitude', 'geo.lat', 'address.lat');
  const lng = pickNum(raw, 'lng', 'lon', 'longitude', 'coordinates.longitude', 'coordinates.lng',
    'location.lng', 'location.longitude', 'geo.lng', 'address.lng');

  const total = N('priceTotal', 'price.total', 'price.total.amount', 'pricing.total',
    'total_price', 'totalPrice', 'price.totalPrice', 'pricing.rate.amount');

  let perNight = N('pricePerNight', 'price.rate', 'price.rate.amount', 'price.perNight',
    'pricePerNight', 'price_per_night', 'pricing.rate', 'pricing.perNight', 'price.amount',
    'rate.amount', 'price');
  if (perNight == null && total != null && ctx.nights > 0) {
    perNight = Math.round(total / ctx.nights);
  }

  const amenityIds = (Array.isArray(raw?.amenityIds) ? raw.amenityIds : []).map(Number);
  const amenityText = pick(raw, 'amenities', 'previewAmenities', 'facilities',
    'amenity_list', 'highlights');
  if (amenityText !== undefined || amenityIds.length) found.add('amenities');
  const name = P('name', 'name', 'title', 'listing.name', 'listingTitle', 'localizedName') || 'Stay';
  const desc = pick(raw, 'subtitle', 'description', 'summary', 'localizedDescription', 'smartLocation') || '';
  const blob = `${JSON.stringify(amenityText ?? '')} ${name} ${desc}`.toLowerCase();

  const id = String(P('id', 'id', 'listingId', 'listing.id', 'roomId', 'room_id', 'listing_id')
    ?? Math.random().toString(36).slice(2));

  const rating = N('rating', 'rating', 'avgRating', 'rating.value', 'reviews.rating',
    'starRating', 'avgRatingLocalized');
  const reviews = N('reviews', 'reviewsCount', 'reviews.count', 'numberOfReviews',
    'reviewCount', 'rating.reviewCount');

  const image = P('image', 'images.0', 'images.0.url', 'images.0.picture', 'photos.0',
    'photos.0.url', 'thumbnail', 'picture', 'xl_picture_url', 'previewImages.0.url');

  const stay = {
    id,
    source: ctx.provider || 'airbnb',
    name,
    type: pick(raw, 'type', 'roomType', 'propertyType', 'room_type', 'roomTypeCategory') || '',
    url: pick(raw, 'deeplink', 'url', 'listingUrl', 'link') || `https://www.airbnb.com/rooms/${id}`,
    image: typeof image === 'string' ? image : (image?.url ?? null),
    lat: lat ?? null,
    lng: lng ?? null,
    distanceKmToBase: haversineKm({ lat, lng }, ctx.anchor),
    pricePerNight: perNight ?? null,
    priceTotal: total ?? (perNight != null ? perNight * ctx.nights : null),
    currency: pick(raw, 'price.currency', 'currency', 'pricing.currency') || ctx.currency,
    rating: rating ?? null,
    reviews: reviews ?? null,
    beds: pickNum(raw, 'beds', 'bedCount', 'bedLabel') ?? null,
    bedrooms: pickNum(raw, 'bedrooms', 'bedroomCount', 'bedroomLabel') ?? null,
    guests: pickNum(raw, 'persons', 'maxGuests', 'personCapacity', 'guests', 'guestLabel') ?? null,
    superhost: Boolean(pick(raw, 'isSuperhost', 'superhost', 'host.isSuperhost')),
  };

  for (const [k, re] of Object.entries(AMENITY_PATTERNS)) stay[k] = re.test(blob);
  for (const [k, ids] of Object.entries(AMENITY_IDS)) {
    if (ids.some((i) => amenityIds.includes(i))) stay[k] = true;
  }
  stay._found = [...found];
  return stay;
}

/** Given normalized results, report how healthy the parse was. */
export function parseReport(stays) {
  const n = stays.length || 1;
  const rate = (fn) => Math.round((stays.filter(fn).length / n) * 100);
  return {
    listings: stays.length,
    withPrice: rate((s) => s.pricePerNight != null),
    withCoords: rate((s) => s.lat != null),
    withRating: rate((s) => s.rating != null),
    withAmenities: rate((s) => s._found?.includes('amenities')),
    withImage: rate((s) => !!s.image),
  };
}
