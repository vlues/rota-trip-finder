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
| POST | `/api/surf`    | live beach intel for Wave Watch — web search, cached 6 h, **no access code** |
| POST | `/api/day`     | Wave Watch's hour-by-hour table narrated by Claude Opus 5 — cached 3 h on enums only, **no access code** |

POST routes require `X-Trip-Code: <ACCESS_CODE>` when that secret is set — except
`/api/surf`, which is open so that Wave Watch needs no setup. It is bounded
instead: requests from an origin outside `ALLOWED_ORIGINS` are refused 403 (not
merely denied the CORS header), only the seventeen known beach names are
answerable, and each is cached 6 h — so the worst case is seventeen Claude calls
a day. `GET /api/health` lists `routes` and `openRoutes` so a deploy can be
verified without the code.
Any unconfigured provider degrades to demo data rather than erroring — the
site is never broken, only less live.

Files:
- `src/index.js` — routing, auth, CORS, flights, Claude, caching, demo data
- `src/providers.js` — stay-provider adapters + the tolerant normalizer
- `src/area.js` — the 15 curated Cádiz-province places and the itinerary builder

```bash
npm test                      # 24 e2e + unit tests
node test/devserver.mjs 8787  # real worker, stubbed upstreams, plain HTTP
```
