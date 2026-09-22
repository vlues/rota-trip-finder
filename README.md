# ⚓ Rota Trip Finder

Cheap stays, cheap flights and a day-by-day plan for the **Naval Station Rota, Spain** area — from one search box you type a sentence into.

Static frontend on **GitHub Pages**. All API keys live in a **Cloudflare Worker** you deploy once. Friends just open the link.

**Also on this site: [Wave Watch](surf/)** — live bodyboarding conditions for Rota and the Gulf of Cádiz: a score per hour for seventeen beaches, a week-long grid of when to go, where to park at each one, whether boards are allowed that day, and what thickness of wetsuit the water actually wants. **[Hike Finder](hikes/)** — 100 walks across Spain on a terrain map, each with the car park, the walking time, whether it is open right now and a live web-search check. **[Snow Finder](snow/)** — skiing and snowboarding from Rota for someone who has never done either: 26 Spanish resorts by drive time from the naval station, live snow and weather at the base and the top of each, the season and price tier for any date you pick, the honest ski-versus-snowboard answer, what to rent, what to buy and where, and a Live check that asks the web for today's lift status and pass price. And **[Rota Range Rings](rings/)** — a drive-time chart of 154 remote, cool, easy trips from Rota. Rings are hours of driving; every pin opens a super-simple brief (what it is, the one thing to do, parking in one line — the deep detail folds away), with a first-load tutorial, a 🎲 surprise-me button, saved places, a smart type-in filter (`"castles in france under 12 h"`), and a **Live intel** card that asks Claude — through the same Worker (`POST /api/spot`, web search, cached 12 h) — what's happening at a destination right now.

**API setup in one script.** Run `./setup-api.sh` from the repo root: it prompts for your Anthropic key (and an optional access code for friends), stores them as Cloudflare secrets, and deploys the Worker. Nothing secret ever touches the website.

![one input, three views](docs/screenshot.png)

---

## How it gets around the API problem

Airbnb killed public API access years ago and every flight API needs a secret key — but GitHub Pages is static, so anything in the JS is readable by anyone. The split:

```
 phone / laptop
      │
 GitHub Pages ········ static HTML+CSS+JS, zero secrets, free, one shareable link
      │  fetch() + shared access code
 Cloudflare Worker ··· holds every key · free tier 100k req/day
      ├──► RapidAPI    stays (Airbnb13) + flights (Sky-Scrapper) — one key
      └──► Anthropic   Claude
```

Nothing but you ever sees a key. The Worker enforces an origin allowlist and a shared passphrase, so a stranger who finds the URL can't spend your quota.

**It works before you configure anything.** With no Worker at all the site runs on sample Rota listings and a curated area plan, so it's shareable on day one.

---

## What it does

**One input.** Type `4 of us, needs parking, walkable to the gate, under €100` and it extracts guests, budget, must-haves, search radius and ranking weights. That parsing runs **locally in the browser first**, so it works with no key; Claude refines it when configured. Everything it inferred shows as a chip you can tap away.

**Stays** ranked on price, distance to the base gate, parking, space and reviews — each card says in plain words why it ranked there. Parking, pool and A/C are detected in **English and Spanish** (`aparcamiento`, `cochera`, `piscina`), because half the Rota-area hosts write their listings in Spanish.

**Flights** across several origin airports at once, cheapest first.

**Any destination.** The "where to" box geocodes through Open-Meteo (free, keyless) — Rota by default, but type `Algarve, Portugal` or `Asheville` and stays, flights and distances all follow. Each card carries a live weather chip for the destination, same keyless API.

**Saved + share.** Heart anything and it lands in the Saved tab (with a badge). Hit Share and your friends open the same shortlist — the actual picture cards, prices and criteria, before live search even returns. State is in the URL — no database, no accounts.

One sunset-glass look, implemented from the Claude Design canvas (`Spain Vacation.dc.html`) on the "Classical" design-system tokens. Three tabs — Stays, Flights, Saved — and nothing else. (The old Rota day-planner endpoint still lives in the Worker for anyone who wants it back.)

---

## Snow Finder (`snow/`)

Skiing and snowboarding from Rota, for a first-timer: **[snow/](snow/)**.

- **Now.** Today's verdict for Sierra Nevada, the closest hill (4 h 15 from the gate): in season or not, weeks until it opens, snow at the top and at Pradollano, and what fell and is coming. Under it, the best place to learn today, ranked on how forgiving the hill is, the drive, the forecast and the price tier; a date planner that says whether a chosen day is open, high or low season, how crowded, the forecast inside sixteen days or the typical snow beyond it, and when to leave the base; and a sixteen-day grid for any resort.
- **Resorts.** All 26 Spanish resorts sorted by drive time, with filters (under 6 h, good to learn, cheap pass, open now, Pyrenees, by train). Each opens a sheet: last season's pass, rental and lesson prices, the car park with a Navigate button, the route, the chains rule, where to sleep, the bus alternative, a seven-day forecast, and the Live check.
- **Learn.** Why to ski first (and why it is not roller skating), what falling is like, the first day hour by hour, the six things the lesson teaches, "Fix my day", the day after, and a glossary.
- **Gear.** Rent versus buy, the shopping list with prices, what never to wear, where to get it (Decathlon in El Puerto or Jerez, MWR Outdoor Rec, the resort base, Wallapop), and what a first weekend costs.
- **Trip.** The drive gate-to-car-park, chains and road closures, when to go and when not to, where to sleep, the no-car options (train to La Molina, rack railway to Núria, bus from Granada), and a two-day plan.

Weather and snow come from Open-Meteo, batched: one hourly call and one daily call for the base and top of every resort, with per-point elevation. Snow depth is the model's estimate and the page says so. The Live check is `POST /api/snow` on the Worker — open like the surf one, origin-checked, bounded by the resort list and cached six hours per resort.

---

## Wave Watch (`surf/`)

Live bodyboarding conditions for the Rota area: **[surf/](surf/)**.

The question it answers is "is it worth going, and where" — scored hour by hour for the next seven days across seventeen beaches from Rota down to Tarifa.

- **A Learn tab that teaches the sport.** Eight illustrated steps — read the beach, lie on it, kick, catch the foam, ride across it, get back out, escape a rip, fall off — each a drawing in the site's own colours and four lines, no more. Under it, **"Fix my session"**: tap what happened ("the wave went under me", "I could not get any speed", "the current kept moving me") and get the cause, the fix, and a link to the step to reread. Then a recovery list for the day after (warm-up, session length, the four stretches, the land-day exercises, and when it is a doctor's job rather than a website's) and a first-month plan. Advanced beaches — reef, current — carry a "not a learning beach" line wherever they appear.
- **A Now tab that fits on a phone.** Six cards, not fourteen: Today (the beginner pick, Claude's paragraph and the hour-by-hour list, together), the one-button plan, the beach on screen with its four key numbers on the hero, "Before you go in", the week ahead, and everything else folded under "All the numbers". The Live check lives on the Live tab with the cameras.
- **The reference, folded under Learn.** How to use the site in four steps; what the flags on the beach mean — green, yellow, red, purple and no-flag-at-all, written for someone carrying a board rather than swimming; and a plain-English entry for every number on the site, each saying what it is, why it matters on a bodyboard, and what a good value looks like *on this coast*. The score's five weights and six verdict bands are spelled out rather than asserted.
- **The week, a day at a time.** Each day opens into the full date, why that hour and not another, the weather you will actually be standing in, the tide times with whether it is a spring or a neap and the moon behind it, and what to wear.
- **Every beach shows its best window** across the whole ten days, so a spot's worth is visible without hunting the grid for it — and **"find nearest to me"** sorts by distance from where you are standing, while saying plainly that closest is not the same as best.
- **Your week, as a plan.** One row per day for the next seven: *learn* here (the beginner pick), *ride* here (the riders' pick, when it clears your bar), or *rest* — with the reason. Same rules as everything else: legal hours, your drive limit, the part of the day you can go, and for today only the hours you can still make. Tap a row to open it; "Copy the week" puts the plan on the clipboard as text.
- **A 45-minute drive limit by default**, remembered once you change it; "any drive" is a choice, not the starting point.
- **Drive times from wherever you actually start.** A picker for Rota town, the naval station, or where you are standing. The hand-written times stay exact for the town and shift by the honest size of the effect elsewhere — only the difference is modelled, at 1.15 min per straight-line km fitted against those same seventeen figures, rather than throwing the local knowledge away for a routing API.
- **Plan for the part of the day you can actually go** — dawn patrol, morning, afternoon, evening — and **tell it what you own**. Without a full wetsuit it will not send you to 16 °C water without saying so, and without fins it will warn you off anything with size or current in it, because fins are the engine on a sponge. Both feed the ranking, not just a footnote.
- **Today, hour by hour.** The Grid shows the best beach per hour as a row of coloured numbers; this is the same thing as a list you can read — for each daylight hour, the best beach a board is *allowed* on, with consecutive hours at the same beach folded into one line, because "El Palmar, 08:00 to 11:00" is the answer and eight rows are not. The arithmetic is all on the page. On top of it, **Claude reads the day**: one paragraph a beginner can act on — what kind of day it is, the one window worth going for, when not to bother, and how it changes. It narrates the table and nothing else (`POST /api/day`, Claude Opus 5 at low effort with the server-side refusal fallback on, no web search — that is Live check's job). Open like Live check, and bounded the same way: every field is checked against a short enum and the cache is keyed on those enums only, never on the table, so varying the rows cannot mint new entries and the worst case is a few hundred calls a day.
- **One button: "Plan my session".** Instead of reading a dashboard, press it and get a single answer — which beach, which day, what time to leave the house, and *why that one* rather than the sixteen others. The reasoning is generated from the data, not from a template: which score component actually separates the winner from the runner-up, whether the long drive is buying anything over the beaches near Rota, why that hour rather than another, what the weak link is, and how much to trust it. It only ever recommends hours you are **legally allowed to ride in**, which in summer is the whole difficulty — the best hours and the legal hours are not the same hours, so on a seasonal beach it will hand you 08:00–11:00 and stop dead where the lifeguard towers open. When the whole coast is flat it says so plainly rather than dressing up a swim as a session.
- **Twenty-eight beaches**, from Sanlúcar at the mouth of the Guadalquivir down to Valdevaqueros in the Strait. The eleven added after the first pass were each geocoded, had their facing **derived from the terrain** — rays fired out on every bearing, counted as open water only if they are at sea level at 1, 3 *and* 6 km, because one sample would accept the salt marsh behind the Bay of Cádiz — and then checked against the hand-set values of the original seventeen, which agreed within about 20°.
- **A score out of 100 per beach per hour**, tuned for a bodyboard rather than a surfboard. A sponge wants a steeper, punchier, shallower wave, is happy at half the size a longboard needs, and actively likes the low-tide shorebreak a surfer would call a closeout — so size, period, wind angle, swell direction and tide state are weighted for that, and shorebreak spots get a bonus as the water drops off the bank.
- **The grid.** Seven days down, every hour across, coloured by score. The week reads as a shape before you read a number, and tapping a cell opens that exact hour at that exact beach. Night hours are hatched, not blank.
- **Where to park**, for every spot: the named car park with its own coordinates, what it costs, how long the walk is, and the honest note — which dirt lot turns to mud after winter rain, which one the attendants work in August, where the corrales de pesca lie under the water at Candor.
- **Can you bodyboard here.** Spanish beach ordinances ban rigid boards inside the buoyed swimming zone from roughly 15 June to 15 September during lifeguard hours, and bodyboards count. Every spot carries that rule in plain words, plus the part that matters: nine months of the year there is no restriction at all, and that is when the swell shows up anyway.
- **What to wear**, chosen from the live sea-surface temperature rather than the calendar, half a step colder than a surf chart because you are lying in the water rather than standing above it. The kit list is conditional too — fin tethers appear when there is current, an impact vest over 2 m, booties when it is reef or when the water drops under 17 °C.
- **A live illustration of the sea**, drawn from the current numbers: swell height sets the amplitude, period sets the spacing and speed, the depth profile makes the waves stand up and break near the beach, the wind arrows blow the right way, and a 1.75 m figure and a one-metre rule give you the scale.
- **Real tide times.** The models give an hourly height; a parabola fitted through each turning point recovers the actual clock time of every high and low, to within a couple of minutes of a printed tide table. Today's four turns sit on the card, and the next one is a chip at the top.
- **"Can I go in right now", answered live.** The seasonal board ban is date- and hour-bound, so the honest answer changes through the day. Instead of restating the ordinance, the page works out whether boards are allowed at this beach at this hour and, when they are not, says when that flips — which in summer is usually "after 20:00, and the dawn window is all yours".
- **Rip risk**, as an explicit rule of thumb rather than a borrowed number: nobody publishes a rip forecast for this coast, so it is computed from the things that actually drive them here — how much water the swell is pushing up the beach, whether the tide is low enough to drain it back out through a channel, onshore wind stacking more water in — and it shows its reasoning rather than just a colour.
- **The week ahead**, one row per day, always all ten. The old version listed only days above a quality bar and went empty on a flat week, which is exactly when you most want to know which day is least bad. Set **your own bar** — anything rideable, worth the drive, or only the good days — and it counts and marks the days that clear it.
- **What the sea is made of.** Significant wave height quietly adds local wind chop to rideable swell, so a gutless day can read the same as a good one. The two are split apart and shown as a bar: *groundswell 0.3 m at 6 s, wind chop 0.8 m at 4 s — the wave height number flatters it.*
- **The day on one bar.** First light, sunrise, sunset, last light, the lifeguard shift, and the day's best window, stacked on one timeline. In summer those interact and the answer is usually "go at first light"; seeing them stacked makes that obvious without a paragraph of explanation. Civil twilight is not in the API, so it is derived as the gap between the sun at −0.833° and at −6° and added either side of the API's own sunrise — a difference of two hour angles needs no time zone and no Julian dates, so there is nothing to get wrong twice.
- **Filter chips** on the spot list — boards allowed at this hour, forgiving, free parking, sand only — which the map honours too.
- **A map** of all seventeen beaches on satellite imagery, pinned with each one's score for the hour on screen. Selecting a beach drops a separate **P** on its car park with a line to the water, because the car park is the thing you actually navigate to. If the map library cannot load, the page says so instead of showing a grey box.
- **The week as a chart** — wave height with a shaded band showing how far apart the three agency models are, tide underneath, wind as a dotted line — and **the swell moving**, as Windy's live ECMWF wave map over the Gulf of Cádiz.
- **Beach cameras** for Las Redes, Cádiz, Conil, La Barrosa and Zahara. They all block iframe embedding, so the cards open them rather than pretending to inline them, and the page says so.
- **Live check** — one tap, no setup. Everything else here is arithmetic on weather models; this asks Claude, through the same Worker that powers Hike Finder and Range Rings (`POST /api/surf`, web search on, cached 6 h per beach per day), the questions a model cannot answer: is the water clean and are there medusas in it, what is the flag and tower situation *today*, is the car park dug up or about to be filled by a romería, has the sandbank moved since last week's swell. It is explicitly told not to restate the forecast — it is given the forecast so it can contradict it.

  Unlike every other Claude route here it takes **no access code**, because a page that asks you to paste a passphrase before it will answer a question is a page you stop using. Three things keep it from being a free Claude endpoint instead: the Worker refuses any request whose `Origin` is not one of this site's own (a 403, not merely a withheld CORS header); it only answers for the seventeen beaches it knows, so the six-hour cache cannot be busted with invented names; and that bounds the most Claude can ever be asked in a day to seventeen calls. The paid providers and the open-ended Claude routes still require the code.
- **Installs to the home screen** and keeps working without signal — the shell is cached by a service worker and the last forecast it managed to download is kept, labelled as stale rather than passed off as current. Forecast requests are deliberately *not* intercepted by the worker: replaying an old HTTP response as if it were fresh is worse than saying the data is old.
- **Shareable links.** `#elpalmar/2026-09-17T07:00` reopens that beach at that hour, so a link lands someone on the same call rather than on today.

**Where the numbers come from.** Four independent numerical models from four agencies, all keyless and CORS-open, batched into three requests for all seventeen spots at once:

```
marine-api.open-meteo.com   waves · swell · sea temperature · tide height
                            best-match, plus ECMWF WAM, Météo-France MFWAM
                            and NOAA GFS-Wave for the spread
api.open-meteo.com          wind · air · UV · rain · sunrise/sunset
                            best-match, plus ECMWF IFS, NOAA GFS and DWD ICON
```

The headline number is the best-match blend; the other models are what the **confidence badge** measures. When the three disagree by more than a third, you are told the forecast is low confidence instead of being handed false precision. Wind counts as well as wave height — a clean 1 m day and a blown-out 1 m day are the same swell, and it is the wind models that disagree about which it will be — and confidence decays on its own towards the end of the ten-day horizon whatever the models say. Every source is fetched independently, so losing one costs you the badge rather than the forecast, and the last good load is cached in `localStorage` so the page still opens something useful with no signal.

**Deploying any change: run `./bump-version.sh` first.** GitHub Pages serves every asset with `Cache-Control: max-age=600`, so for ten minutes after a push a visitor can be handed the new `index.html` with the old `app.js` — and a phone that has added one of these to its home screen can sit on a stale build far longer than that. The script writes a build id to `version.json` and stamps it into every page's `<meta name="app-version">` and onto every local script *and stylesheet* URL, so new HTML can never pair with old JS or old CSS. `build-check.js`, loaded by all four pages, compares the two on load and whenever the tab regains focus, and if the page is behind it clears its caches and reloads exactly once (guarded by `sessionStorage`, so it cannot loop).

**Tide times, not a tide curve.** The models publish an hourly height; fitting a parabola through each turning point recovers the actual clock time of every high and low, to within a couple of minutes of a printed table. Everything tidal is then measured against the *bracketing* turning points rather than a rolling window of hours, which is both more accurate and safe at the ends of the forecast — a window runs out of samples there and quietly biases the answer towards whichever half-cycle it caught. It also means the spring–neap cycle shows through properly: the daily range moves between 0.6 m and 2.9 m across ten days, as it should on this coast.

**Coordinates are checked, not guessed.** Every beach was geocoded and then validated against an elevation lookup: each break sits at sea level, each car park on land 200–450 m behind it, and each offshore sampling point returns zero elevation — which is also what proves the recorded compass bearing for "out to sea" is right at that beach. The first pass had El Palmar 2.8 km inland and Caños de Meca 3 km east of the water.

> The local rule worth knowing before you read anything else: **Levante** — the east wind — blows offshore on every west-facing beach from Rota to Conil and is the best thing that can happen to this coast. **Poniente**, the westerly, ruins all of them. When Poniente is blowing, Los Caños de Meca faces south behind Cape Trafalgar and is offshore in exactly that wind. The site tells you this on the day it matters.


## Hike Finder (`hikes/`)

A second sub-app, map-first: **[hikes/](hikes/)**.

100 hand-written trails, weighted to what you can drive to from Rota in a morning — the Grazalema gorges, the Barbate cliffs, the Cazorla river walks — with the rest of Spain's greatest hits (Cares, Ordesa, Caminito del Rey, Teide) behind them. Every card answers the four things you actually need before setting off:

- **Where to park** — named car park with its own coordinates, what it costs, and the real detail (which lot fills by 10:00, which access road closes to cars in August, where the shuttle bus goes from). One tap opens driving directions to *the car park*, not to a pin in the middle of a mountain.
- **How long** — distance as walked, metres of ascent, moving hours, difficulty, and whether it is a loop, an out-and-back or a one-way that needs a second car.
- **Open or closed, right now** — every trail carries an access model: open access, gated hours by month, ticketed with closed weekdays, permit-only, plus seasonal closures (Garganta Verde shuts 1 June–15 October for vulture nesting; the Cíes ferries stop in autumn). The badge is computed against the **Europe/Madrid** wall clock, so it stays right when someone opens the link from the States. Open-access daylight routes get real sunrise/sunset for that trailhead, that date.
- **What it actually is** — one honest paragraph, and the one tip that saves the day.

**The map** is Leaflet on OpenTopoMap terrain with contours and hillshade, switchable to satellite or street. Pins are coloured by difficulty; selecting a trail drops a separate **P** marker on the car park with a dashed line to the trailhead, then frames both — offset around whichever panel is covering the map. There is a locate-me button that re-sorts the whole list by distance from where you are standing.

Filters are chips (`Easy`, `< 2 h drive`, `Open now`, `No booking`, `Free parking`, `Water`, `Shade`, `Kids`, `Dogs`) plus a free-text box that searches names, areas and descriptions. Saved trails live in `localStorage`; every trail has a shareable `#slug` URL.

**Live check** asks Claude — through the same Worker, `POST /api/trail`, web search on, cached 12 h per trail per day — for what is true *this week*: current closures and permits, car-park and shuttle status, water level or snow, and the one thing that would ruin the day. It is the only part that needs a key; everything else works offline from `hikes/data.js`.

> Hours, permits and capacity caps in Spain move around. The dataset is the starting point, every card links to the official park or town-hall page, and Live check is there for the morning you actually drive out.

---

## Does it actually work? Check, don't hope

Settings → **Run diagnostics** fires a real probe query at every provider and reports back:

```
endpoint   ✓ reachable
stays      ✓ 24 listings, 100% priced
flights    ✓ 6 offers, cheapest €44
Claude     ✓ claude-sonnet-4-5
```

If a provider changes its schema — the usual failure for third-party Airbnb data — you get `listings found but 0% priced` and the raw field names it actually saw, instead of a screen of blank cards. The Worker refuses to return a result set where nothing priced, so that failure is loud.

```bash
cd worker && npm test
```

Runs 24 end-to-end tests against the real Worker with stubbed upstreams — routing, CORS, access codes, Sky-Scrapper airport resolution, four different provider response shapes, schema-drift detection, partial flight failures, and the planner's invented-place filter. Plus unit tests on the distance maths and normalizer.

The Sky-Scrapper request and response shapes were verified against the API's published docs, and the legacy Amadeus parameter names against [their published OpenAPI spec](https://github.com/amadeus4dev/amadeus-open-api-specification) — not guessed.

---

## Deploy

### The one-command way

```bash
./launch.sh
```

It checks your tools, asks for each API key (paste it, or press Enter to skip — skipped ones run in demo mode), deploys the Worker, wires the site to it, pushes to GitHub, turns on Pages, and prints the link plus access code to send your friends. Re-run it any time to add a key you skipped. Keys go straight into Cloudflare secrets — never onto disk or into git.

You'll want the keys from step 2 below ready before you run it. Prefer to see each move? The manual steps:

### 1. GitHub Pages

```bash
git init && git add -A && git commit -m "Rota Trip Finder"
gh repo create rota-trip-finder --public --source=. --push
```

**Settings → Pages → Source: GitHub Actions.** Live at `https://<you>.github.io/rota-trip-finder/`, in demo mode, immediately.

### 2. Keys

| Secret | Where | Cost |
|---|---|---|
| `RAPIDAPI_KEY` | [rapidapi.com](https://rapidapi.com/) — subscribe the one key to **both** [Airbnb13](https://rapidapi.com/3b-data-3b-data-default/api/airbnb13) (stays) and [Sky-Scrapper](https://rapidapi.com/apiheya/api/sky-scrapper) (flights) | Free tiers: ~100 req/month each, card on file required. ~$10/mo each if the group gets heavy use. The Worker caches results for 6 h so repeat opens of a shared link cost zero quota. |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) | Pennies per search at this volume |
| `ACCESS_CODE` | You invent it | Free. Give it to your friends only. |

> Amadeus decommissioned its self-service portal in July 2026, so new flight
> credentials can't be created there any more. If you hold pre-decommission
> `AMADEUS_CLIENT_ID`/`_SECRET`, set them and the Worker uses Amadeus instead.

### 3. Worker

```bash
cd worker && npm install && npx wrangler login
for s in RAPIDAPI_KEY ANTHROPIC_API_KEY ACCESS_CODE; do
  npx wrangler secret put $s
done
npx wrangler deploy
```

### 4. Connect

In `worker/wrangler.toml` set `ALLOWED_ORIGINS = "https://<you>.github.io"` and redeploy. In `config.js` set `API_BASE` to the Worker URL. Push.

Now the link works for everyone with the access code, no setup on their end. (Leave `API_BASE` empty instead and each person pastes the endpoint once under ⚙ — stored in their browser only.)

---

## Swapping the stay provider

Third-party Airbnb scrapers come and go. `worker/src/providers.js` keeps *how to ask* separate from *how to read the answer*:

```toml
STAY_PROVIDER = "airbnb13"   # or "apify", or "generic"
RAPIDAPI_HOST = "airbnb13.p.rapidapi.com"
```

The normalizer already handles a dozen field conventions (`price.rate` / `pricePerNight` / `pricing.total`, `lat` / `coordinates.latitude` / `geo.lat`, nested `rating.value`) and derives per-night from total when only a total is given. Adding a provider means one entry in `PROVIDERS`, not a rewrite.

---

## Local dev

```bash
cd worker
node test/devserver.mjs 8787          # real Worker, stubbed upstreams
python3 -m http.server 8899 --directory ..
```

Open `localhost:8899`, put `http://localhost:8787` in ⚙, and you're running the full stack offline.

---

## Notes

- Distances are straight-line km to the base gate (36.645, −6.3494), not driving distance.
- "No parking listed" means *not listed* — it depends on what the host wrote.
- Prices are a snapshot from when you searched. Confirm on the booking site.
- Drive times in the planner are approximate.
- Not affiliated with Airbnb, Skyscanner or Anthropic.
