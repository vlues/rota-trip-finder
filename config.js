/**
 * Spain Vacation (Rota Trip Finder) — build-time config.
 *
 * Set API_BASE to your deployed Cloudflare Worker URL and everyone who opens
 * the site gets live data with zero setup. Leave it empty and the site runs in
 * demo mode until someone enters an endpoint under Settings.
 *
 * There are NO secrets in this file. Keys live only in the Worker.
 */
window.TRIP_CONFIG = {
  API_BASE: 'https://rota-trip-finder-api.streamedmusics.workers.dev',                       // e.g. 'https://rota-trip-finder-api.parker.workers.dev'
  TRIP_NAME: 'Spain Vacation',
  // Default destination when the "where to" box is empty.
  ANCHOR: { lat: 36.645, lng: -6.3494, name: 'Rota, Spain', airport: 'XRY' },
  DEFAULT_CURRENCY: 'EUR',
  SHOW_WEATHER: true,                 // live Open-Meteo chip on stay cards (keyless)
};
