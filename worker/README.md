# Worker API

The secrets-holding half. Root README has the full setup.

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/health`  | which providers are configured |
| POST | `/api/diag`    | run a **real** probe query and report what parsed |
| POST | `/api/stays`   | stay search, normalized |
| POST | `/api/flights` | Sky-Scrapper fares (Amadeus if legacy creds), cheapest first |
| POST | `/api/plan`    | day-by-day area itinerary |
| POST | `/api/intent`  | sentence → structured criteria |
| POST | `/api/ai`      | concierge opinion over the current results |

POST routes require `X-Trip-Code: <ACCESS_CODE>` when that secret is set.
Any unconfigured provider degrades to demo data rather than erroring — the
site is never broken, only less live.

Files:
- `src/index.js` — routing, auth, CORS, flights, Claude, caching, demo data
- `src/providers.js` — stay-provider adapters + the tolerant normalizer
- `src/area.js` — the 15 curated Cádiz-province places and the itinerary builder

```bash
npm test                      # 22 e2e + unit tests
node test/devserver.mjs 8787  # real worker, stubbed upstreams, plain HTTP
```
