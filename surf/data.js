/* Rota Wave Watch — static knowledge base.
   Everything here is local knowledge that does not change hour to hour:
   where the spots are, which way they face, what the sea floor does, where
   you leave the car, and what the beach ordinance says about boards.
   The live numbers come from the APIs in app.js. */

/* ── how to read a spot ───────────────────────────────────────────────────
   lat/lon    the break itself (map pin)
   mlat/mlon  a point in open water used to sample the wave models
   face       compass bearing the beach looks out along (waves arrive from here)
   win        [from,to] swell directions that actually get in past the headlands
   off        wind bearing that blows offshore here (wind FROM this = groomed)
   exposure   0–1, share of open-Atlantic swell that survives the trip in.
              Rota sits inside the Gulf of Cádiz behind a shelf, so almost
              nothing here is a 1.0 — El Palmar is the local benchmark.
   best       offshore Hs band, in metres, where this spot is fun on a sponge
   pmin       swell period below which it is wind slop, not surf
   tide       low | mid | high | push | all
   shore      true if it throws a shorebreak — prime bodyboard real estate
   ───────────────────────────────────────────────────────────────────────── */

window.__SURF_SPOTS__ = [

/* ══════════════ ROTA — walk or five minutes in the car ══════════════ */
{
  id: "costilla", name: "Playa de la Costilla", town: "Rota", zone: "Rota",
  lat: 36.6186, lon: -6.3623, mlat: 36.5954, mlon: -6.4036,
  face: 235, win: [200, 285], off: 55, exposure: 0.45,
  type: "beach break", bottom: "sand", best: { min: 0.6, max: 1.8, ideal: 1.1 },
  pmin: 7, tide: "mid", shore: true, level: "beginner", drive: 5,
  hazards: ["Swimmers and paddleboards all summer", "Groynes at the south end"],
  bb: {
    ok: true, status: "seasonal",
    rule: "Boards are out of the buoyed bathing zone from 15 Jun–15 Sep while lifeguards are on (roughly 11:00–20:00). Dawn and after the towers close are fine, and the season rule lifts entirely the rest of the year."
  },
  park: {
    name: "Plaza Bartolomé Pérez underground + Av. de la Marina street",
    lat: 36.6167, lon: -6.3579, cost: "Street free · underground ~€1.20/h",
    walk: "2–4 min", note: "Street parking behind the paseo is gone by 10:00 in July and August; the underground car park almost always has space and puts you 200 m from the sand."
  },
  kit: ["Nothing special — you can walk here"],
  why: "The town beach. It is the one you can check on foot, and on a solid W swell with an easterly it gets a clean, rampy shorebreak on the mid tide push.",
  tip: "It needs real W/SW swell to wake up. If the chart says under 1 m offshore, save the petrol and look at Candor or go south.",
  crowd: "Busy in summer, empty in winter"
},
{
  id: "candor", name: "Punta Candor / El Rompidillo", town: "Rota", zone: "Rota",
  lat: 36.6389, lon: -6.3923, mlat: 36.6375, mlon: -6.4427,
  face: 268, win: [235, 315], off: 88, exposure: 0.62,
  type: "reef + sand", bottom: "flat rock shelf and sand", best: { min: 0.7, max: 2.0, ideal: 1.2 },
  pmin: 8, tide: "high", shore: false, level: "intermediate", drive: 10,
  hazards: [
    "Corrales de pesca — stone fish-trap walls just under the surface at low water. This is the real danger here.",
    "Flat urchin-covered rock shelf",
    "Shallow on anything under mid tide"
  ],
  bb: {
    ok: true, status: "open",
    rule: "Outside the main bathing zone, so no seasonal board ban. Normal flag rules still apply — red flag means nobody goes in, board or not."
  },
  park: {
    name: "Dirt pull-off at Punta Candor, off the A-2077 coast road",
    lat: 36.6377, lon: -6.3888, cost: "Free",
    walk: "5 min through the pines", note: "Unsurfaced and rutted — fine for a normal car in summer, puddled and soft after winter rain. Nothing is watched here, so leave nothing visible in the boot."
  },
  kit: ["Fin tethers — losing one over the shelf ends the session", "Reef booties if you are unsure of the tide"],
  why: "The most exposed corner of Rota and the closest thing to a proper wave inside the town limits. Faces properly west, so it picks up swell the bay beaches never see.",
  tip: "Surf it on the top half of the tide, always. The corrales are historic stone weirs and they do not move — at low water you are standing on them.",
  crowd: "A handful of locals"
},
{
  id: "aguadulce", name: "Playa de Aguadulce", town: "Rota", zone: "Rota",
  lat: 36.6311, lon: -6.3781, mlat: 36.6227, mlon: -6.4274,
  face: 258, win: [230, 310], off: 78, exposure: 0.58,
  type: "beach break", bottom: "sand over rock patches", best: { min: 0.7, max: 1.9, ideal: 1.2 },
  pmin: 8, tide: "mid", shore: true, level: "intermediate", drive: 13,
  hazards: ["Rock patches uncovered at low tide", "Rips beside the rock outcrops"],
  bb: { ok: true, status: "open", rule: "Quiet stretch with no buoyed bathing corridor for most of its length — boards are fine. Lifeguarded section in high summer follows the usual 15 Jun–15 Sep zone rule." },
  park: {
    name: "Sandy lot at the end of the Aguadulce access track",
    lat: 36.6315, lon: -6.3757, cost: "Free", walk: "3 min",
    note: "Small — maybe twenty cars. Empty outside July/August. Soft sand at the edges; stay on the packed line."
  },
  kit: ["Booties if the tide is dropping"],
  why: "The quiet middle ground between Candor and Ballena. Same swell exposure as Candor, sand instead of rock shelf, and usually nobody on it.",
  tip: "The best banks shift every winter. Walk the water's edge for two minutes before you pick a peak.",
  crowd: "Usually empty"
},
{
  id: "ballena", name: "Playa de la Ballena", town: "Rota", zone: "Rota",
  lat: 36.681, lon: -6.416, mlat: 36.6685, mlon: -6.464,
  face: 252, win: [228, 305], off: 72, exposure: 0.60,
  type: "beach break", bottom: "sand", best: { min: 0.7, max: 2.0, ideal: 1.2 },
  pmin: 8, tide: "all", shore: true, level: "beginner", drive: 16,
  hazards: ["Strong rips at the north end on bigger days", "Long walk back if the current pushes you"],
  bb: { ok: true, status: "seasonal", rule: "Lifeguarded and buoyed in front of the main access points 15 Jun–15 Sep; walk two minutes up the beach and you are outside the zone. Off-season it is unrestricted." },
  park: {
    name: "Pine-shaded lots off the Costa Ballena access roads",
    lat: 36.6816, lon: -6.4137, cost: "Free", walk: "4–6 min over the boardwalk",
    note: "Genuinely big, genuinely free, and shaded by umbrella pines — the most civilised car park on this list. Multiple entrances; the northern ones are quieter."
  },
  kit: ["Sandals — the boardwalk is long and hot"],
  why: "A long open sandy beach with room to spread out and peaks that work through most of the tide. The easiest place near Rota to get a lot of waves without thinking about rocks.",
  tip: "Park at the northern access. Same wave, a third of the people.",
  crowd: "Moderate"
},

/* ══════════════ THE NEXT BAY — 20–40 minutes ══════════════ */
{
  id: "chipiona", name: "Playa de las Tres Piedras", town: "Chipiona", zone: "Costa Noroeste",
  lat: 36.695, lon: -6.4248, mlat: 36.6894, mlon: -6.4748,
  face: 262, win: [235, 320], off: 82, exposure: 0.66,
  type: "beach break", bottom: "sand and rock", best: { min: 0.6, max: 1.8, ideal: 1.1 },
  pmin: 7, tide: "mid", shore: true, level: "intermediate", drive: 22,
  hazards: ["Rock ledges through the middle of the beach", "Shallow at low water"],
  bb: { ok: true, status: "open", rule: "Outside the town bathing zones. Boards fine; the ordinance bans them only inside the marked swimming areas in season." },
  park: {
    name: "Street parking along the Tres Piedras seafront",
    lat: 36.6953, lon: -6.4224, cost: "Free", walk: "1–3 min",
    note: "Ordinary residential street parking — easy nine months of the year, tight in August. No lot, so park considerately."
  },
  kit: ["Booties"],
  why: "Chipiona sticks further out into the Atlantic than Rota does, so it catches noticeably more swell on the same forecast. Worth the extra fifteen minutes when Rota looks flat.",
  tip: "Best on a NW swell, which is exactly the direction Rota's beaches struggle with.",
  crowd: "Light"
},
{
  id: "fuentebravia", name: "Fuentebravía / La Muralla", town: "El Puerto de Santa María", zone: "Bay of Cádiz",
  lat: 36.6098, lon: -6.2861, mlat: 36.5908, mlon: -6.3306,
  face: 242, win: [215, 285], off: 62, exposure: 0.42,
  type: "beach break", bottom: "sand with rock outcrops", best: { min: 0.9, max: 2.2, ideal: 1.4 },
  pmin: 8, tide: "mid", shore: true, level: "intermediate", drive: 22,
  hazards: ["Rock outcrops at both ends", "Cliff steps — slippery when wet"],
  bb: { ok: true, status: "seasonal", rule: "Small coves with buoyed swim zones in summer. Early morning or out of season and there is no issue." },
  park: {
    name: "Street parking in the Fuentebravía urbanización",
    lat: 36.6107, lon: -6.2839, cost: "Free", walk: "3–5 min plus steps down",
    note: "Residential streets above the cliff. There is no real car park — you park on the road and walk down. Do not block the private driveways; they do get towed."
  },
  kit: ["Booties for the rocks at the ends"],
  why: "A string of small cliff-backed coves on the outside of the El Puerto headland. More swell than the inner bay, and one of them usually has a decent bank.",
  tip: "Look over the wall before you carry everything down the steps — the coves differ enormously from each other on the same day.",
  crowd: "Light"
},
{
  id: "santacatalina", name: "Playa de Santa Catalina", town: "El Puerto de Santa María", zone: "Bay of Cádiz",
  lat: 36.5956, lon: -6.2741, mlat: 36.5804, mlon: -6.3208,
  face: 248, win: [220, 290], off: 68, exposure: 0.40,
  type: "beach break", bottom: "sand", best: { min: 1.0, max: 2.3, ideal: 1.5 },
  pmin: 8, tide: "mid", shore: true, level: "beginner", drive: 24,
  hazards: ["Gets crowded with swimmers", "Shallow sandbars"],
  bb: { ok: true, status: "seasonal", rule: "Urban lifeguarded beach — boards out of the buoyed zone 15 Jun–15 Sep during tower hours." },
  park: {
    name: "Lot by the Castillo de Santa Catalina",
    lat: 36.5963, lon: -6.2718, cost: "Free", walk: "2 min",
    note: "Decent-sized free lot next to the fort. Fills on summer weekends but turns over quickly."
  },
  kit: [],
  why: "Gentle, sandy and easy to get to — the sensible option when the swell is big enough that Rota is closing out but you do not want a rock shelf.",
  tip: "Needs more swell than Rota to break properly. It is a size-filter spot: big days only.",
  crowd: "Moderate"
},

/* ══════════════ CÁDIZ — the city beaches, 35–45 minutes ══════════════ */
{
  id: "victoria", name: "Playa de la Victoria", town: "Cádiz", zone: "Cádiz",
  lat: 36.5062, lon: -6.2793, mlat: 36.4791, mlon: -6.3167,
  face: 228, win: [195, 275], off: 48, exposure: 0.52,
  type: "beach break", bottom: "sand", best: { min: 0.8, max: 2.2, ideal: 1.3 },
  pmin: 8, tide: "mid", shore: true, level: "beginner", drive: 38,
  hazards: ["Very busy in summer", "Rips beside the groynes"],
  bb: { ok: true, status: "seasonal", rule: "Cádiz runs a proper municipal beach ordinance: no boards inside the buoyed bathing zone in season during lifeguard hours, with marked entry corridors at some access points. Early mornings are the accepted window." },
  park: {
    name: "Blue-zone street parking on Paseo Marítimo",
    lat: 36.5075, lon: -6.2775, cost: "Paid blue zone ~€1/h, free 14:00–16:30 and after 21:00",
    walk: "1 min", note: "Pay-and-display along the whole seafront. If you want free, drive on to Cortadura — three minutes further and the lot there costs nothing."
  },
  kit: ["Parking coins or the app"],
  why: "Three kilometres of consistent city beach with a Levante blowing straight offshore down the isthmus. When the east wind is on, this is a very clean wave for how urban it is.",
  tip: "Levante is the whole story in Cádiz. East wind and any W swell equals a good morning here.",
  crowd: "Busy"
},
{
  id: "cortadura", name: "Playa de Cortadura", town: "Cádiz", zone: "Cádiz",
  lat: 36.4877, lon: -6.2673, mlat: 36.4576, mlon: -6.301,
  face: 222, win: [190, 270], off: 42, exposure: 0.56,
  type: "beach break", bottom: "sand", best: { min: 0.8, max: 2.4, ideal: 1.4 },
  pmin: 8, tide: "low", shore: true, level: "intermediate", drive: 40,
  hazards: ["Strong rips — it is an open, unsheltered beach", "Very few people around out of season"],
  bb: { ok: true, status: "open", rule: "Largely unbuilt and only lifeguarded in part, so boards are fine along most of its length year-round." },
  park: {
    name: "Free lots along the Cortadura seafront, off the N-443",
    lat: 36.4892, lon: -6.2657, cost: "Free", walk: "2 min over the dune boardwalk",
    note: "Long strip of free lots with space even in August. This is the best free parking anywhere on the Cádiz isthmus."
  },
  kit: ["Fin tethers — there is real current here"],
  why: "The wild end of the Cádiz isthmus. More swell and better banks than Victoria, free parking, and a low-tide shorebreak that is properly fun on a bodyboard.",
  tip: "Low tide is the call here. The bank steepens and it throws a genuine wedge instead of the crumble you get at high.",
  crowd: "Light"
},
{
  id: "caleta", name: "La Caleta", town: "Cádiz", zone: "Cádiz",
  lat: 36.5297, lon: -6.306, mlat: 36.5449, mlon: -6.3527,
  face: 292, win: [265, 330], off: 112, exposure: 0.30,
  type: "small bay", bottom: "sand between two forts", best: { min: 1.4, max: 3.0, ideal: 2.0 },
  pmin: 9, tide: "high", shore: true, level: "beginner", drive: 45,
  hazards: ["Rocks either side", "Only works when everywhere else is far too big"],
  bb: { ok: true, status: "seasonal", rule: "Tiny, extremely popular town beach. In season it is swimmers only inside the buoys — this is a winter-storm spot, not a summer one." },
  park: {
    name: "Campo del Sur street parking / Plaza San Antonio area",
    lat: 36.5286, lon: -6.3013, cost: "Blue zone, difficult", walk: "5–10 min",
    note: "Old-town parking is genuinely hard. Honestly: park at the Canalejas underground and walk, or take the Rota catamaran and walk from the terminal."
  },
  kit: ["Patience for the parking"],
  why: "A pocket-sized bay between two castles that only breaks when a big NW storm is wrapping around the whole city. The bad-weather fallback.",
  tip: "Check this one only when the chart shows 3 m plus from the northwest. Otherwise it is a swimming pool.",
  crowd: "Busy on land, empty in the water"
},

/* ══════════════ THE GOOD STUFF — south of the bay, 45–90 minutes ══════════════ */
{
  id: "barrosa", name: "Playa de la Barrosa", town: "Chiclana", zone: "Costa de la Luz",
  lat: 36.3432, lon: -6.167, mlat: 36.3113, mlon: -6.1979,
  face: 218, win: [190, 270], off: 38, exposure: 0.68,
  type: "beach break", bottom: "sand", best: { min: 0.7, max: 2.2, ideal: 1.3 },
  pmin: 8, tide: "mid", shore: true, level: "beginner", drive: 48,
  hazards: ["Rips between sandbars", "Long beach — note where you parked"],
  bb: { ok: true, status: "seasonal", rule: "Chiclana buoys off the developed sections in summer. The southern end towards the Torre del Puerco is wilder and unrestricted." },
  park: {
    name: "Sector 5 / Torre del Puerco lots, Novo Sancti Petri",
    lat: 36.3325, lon: -6.164, cost: "Free (some paid overflow in August)", walk: "3–5 min",
    note: "Big sandy lots at the southern accesses. The southern end is both the better wave and the easier parking — drive past the hotels."
  },
  kit: [],
  why: "Six kilometres of open Atlantic beach with far more swell exposure than anything in the bay, and banks that reform all the way along.",
  tip: "Head for the Torre del Puerco end. More swell, fewer people, free parking.",
  crowd: "Moderate at the top, light at the bottom"
},
{
  id: "roqueo", name: "El Roqueo / Fuente del Gallo", town: "Conil de la Frontera", zone: "Costa de la Luz",
  lat: 36.2899, lon: -6.1093, mlat: 36.2684, mlon: -6.1519,
  face: 238, win: [210, 300], off: 58, exposure: 0.78,
  type: "beach break with reef", bottom: "sand over rock", best: { min: 0.7, max: 2.2, ideal: 1.3 },
  pmin: 8, tide: "mid", shore: true, level: "intermediate", drive: 62,
  hazards: ["Rock reef at low tide", "Cliff steps down to the cove"],
  bb: { ok: true, status: "open", rule: "Cliff-backed coves outside Conil's main buoyed beach — no seasonal board ban in practice." },
  park: {
    name: "Cliff-top lots at Fuente del Gallo",
    lat: 36.2909, lon: -6.1072, cost: "Free", walk: "4 min plus a staircase",
    note: "Gravel lots on the clifftop. Fine outside August; in August Conil is chaos and you want to arrive before 10:00."
  },
  kit: ["Booties", "Fin tethers"],
  why: "Conil's cove coast picks up appreciably more swell than the bay, and the rock bottom gives it more shape than a pure sand beach.",
  tip: "The coves are all different on the same day. Walk the clifftop path and look before you commit to a staircase.",
  crowd: "Moderate"
},
{
  id: "elpalmar", name: "Playa de El Palmar", town: "Vejer de la Frontera", zone: "Costa de la Luz",
  lat: 36.2253, lon: -6.0662, mlat: 36.2082, mlon: -6.1117,
  face: 245, win: [210, 310], off: 65, exposure: 1.00,
  type: "beach break", bottom: "sand", best: { min: 0.6, max: 2.5, ideal: 1.4 },
  pmin: 7, tide: "low", shore: true, level: "all", drive: 72,
  hazards: ["Rips on bigger days", "Crowded peaks in summer", "Closes out over about 2.5 m"],
  bb: {
    ok: true, status: "open",
    rule: "The region's surf beach — boards are the point here. In high summer the town marks swimming zones and surf corridors; stay out of the flagged swim areas and there is no issue at all."
  },
  park: {
    name: "Dirt strip along the A-2233 beach road",
    lat: 36.2261, lon: -6.064, cost: "Free, though attendants ask €3–5 in summer",
    walk: "1–2 min", note: "Kilometres of roadside dirt parking right behind the beach — you can check the waves from the car. In July and August informal attendants wave you into spaces for a few euros; it is not official, and it is easier to just pay it."
  },
  kit: ["Fins", "Fin tethers", "Wax or deck grip", "Cash for the parking guy in summer"],
  why: "The benchmark. If there is a rideable wave anywhere in the province, it is here — a long open beach facing the full Atlantic with consistent banks and a punchy low-tide shorebreak that bodyboards love.",
  tip: "Low tide, light Levante, anything over 1 m from the west. That is the recipe, and it happens most weeks from September to May.",
  crowd: "Busy — the regional surf hub"
},
{
  id: "canos", name: "Los Caños de Meca", town: "Barbate", zone: "Costa de la Luz",
  lat: 36.1848, lon: -6.0323, mlat: 36.1459, mlon: -6.0461,
  face: 196, win: [230, 300], off: 250, exposure: 0.55,
  type: "reef and beach", bottom: "rock reef and sand", best: { min: 1.4, max: 4.0, ideal: 2.2 },
  pmin: 10, tide: "mid", shore: false, level: "advanced", drive: 82,
  hazards: [
    "Shallow rock reef — this is the one spot here that genuinely hurts people",
    "Only worth the drive when it is big",
    "Strong current around the Trafalgar tombolo"
  ],
  bb: { ok: true, status: "open", rule: "Wild, cliff-backed and mostly unlifeguarded. No board restrictions; the constraint is the reef, not the ordinance." },
  park: {
    name: "Roadside along the Caños seafront and the Faro de Trafalgar track",
    lat: 36.1867, lon: -6.0316, cost: "Free", walk: "2–8 min depending where you squeeze in",
    note: "Narrow village road with no real lot. Arrive early on a good swell or you will be walking fifteen minutes. The Trafalgar lighthouse track has more space."
  },
  kit: ["Reef booties — not optional", "Impact vest on the bigger days", "Fin tethers"],
  why: "Tucked behind Cape Trafalgar and facing south, so it is sheltered from exactly the west wind that ruins everywhere else. The wrapping swell stands up on the reef and gets hollow.",
  tip: "This is the Poniente answer. When a westerly has blown out the whole coast, Caños is offshore and working — that inversion is the single most useful thing to know about surfing this province.",
  crowd: "Light except on the big days"
},
{
  id: "zahara", name: "Playa de Zahara de los Atunes", town: "Barbate", zone: "Costa de la Luz",
  lat: 36.1544, lon: -5.8697, mlat: 36.1187, mlon: -5.8932,
  face: 208, win: [195, 275], off: 28, exposure: 0.62,
  type: "beach break", bottom: "sand", best: { min: 1.0, max: 2.6, ideal: 1.6 },
  pmin: 9, tide: "mid", shore: true, level: "intermediate", drive: 96,
  hazards: ["Very exposed to Levante — it gets sandblasted", "Rips"],
  bb: { ok: true, status: "seasonal", rule: "Buoyed zone in front of the village in summer; the beach runs for kilometres and the rest is open." },
  park: {
    name: "Lots at the village entrance and along the Atlanterra road",
    lat: 36.1561, lon: -5.8685, cost: "Free", walk: "3–6 min",
    note: "Plenty of free space outside August. In August Zahara is a destination town and parking is genuinely painful."
  },
  kit: ["Windproof jacket — the Levante here is relentless"],
  why: "A long, clean, wide-open beach with proper swell exposure and, unusually for this coast, room to be alone on it.",
  tip: "Check the wind first. Zahara sits in the Strait's wind funnel — a Levante that is a pleasant offshore in Rota is a gale here.",
  crowd: "Light"
},
{
  id: "bolonia", name: "Playa de Bolonia", town: "Tarifa", zone: "Strait",
  lat: 36.0822, lon: -5.764, mlat: 36.0433, mlon: -5.7778,
  face: 196, win: [190, 265], off: 16, exposure: 0.50,
  type: "beach break", bottom: "sand", best: { min: 1.2, max: 3.0, ideal: 1.8 },
  pmin: 9, tide: "mid", shore: true, level: "intermediate", drive: 108,
  hazards: ["Wind", "Remote — no services out of season"],
  bb: { ok: true, status: "open", rule: "Natural park beach, no board restrictions. Roman ruins at the back have their own opening hours if you want to combine the trip." },
  park: {
    name: "Lot at the Baelo Claudia end of the Bolonia access road",
    lat: 36.0841, lon: -5.7633, cost: "Free", walk: "3 min",
    note: "Sandy lots behind the dune. Fine except at the very peak of August."
  },
  kit: [],
  why: "A wide bay under the great sand dune, half-sheltered from Levante by the Sierra de la Plata, with a big Roman town behind it if the sea is flat.",
  tip: "The west end under the dune is the most sheltered corner when the east wind is up.",
  crowd: "Light"
},
{
  id: "loslances", name: "Playa de Los Lances", town: "Tarifa", zone: "Strait",
  lat: 36.029, lon: -5.628, mlat: 36.0009, mlon: -5.664,
  face: 226, win: [200, 280], off: 46, exposure: 0.48,
  type: "beach break", bottom: "sand", best: { min: 1.0, max: 2.8, ideal: 1.6 },
  pmin: 8, tide: "mid", shore: true, level: "intermediate", drive: 115,
  hazards: ["Kitesurfers — a lot of them, moving fast", "The windiest beach in Europe, more or less"],
  bb: { ok: true, status: "open", rule: "Shared with kite and windsurf schools, which have their own marked launch corridors. Stay clear of the kite zones and there is no restriction on bodyboarding." },
  park: {
    name: "Los Lances Norte lot, off the N-340",
    lat: 36.0278, lon: -5.6255, cost: "Free", walk: "5 min over the boardwalk",
    note: "Large free lot with a boardwalk across the marsh. Busy with kiters from mid-morning."
  },
  kit: ["Eyes up for kite lines"],
  why: "Included for completeness and for the days when the whole Atlantic coast is blown out by Poniente — Tarifa's beach is sheltered from the west and can be glassy when Rota is a mess.",
  tip: "Two hours each way. Only worth it if the wind map says Poniente everywhere and Tarifa is the one green patch.",
  crowd: "Kite-heavy"
}
];

/* ── live cameras ────────────────────────────────────────────────────────
   These sites all block being put inside an iframe, so the cards open them
   in a new tab rather than pretending to embed them. Every URL below was
   checked as live when this was built; cameras do go offline, so the card
   says who runs it. The animated wave map beside them IS embedded, and is
   the genuinely live picture of what the swell is doing right now. */
window.__SURF_CAMS__ = [
  { id: "redes", name: "Playa de las Redes", town: "El Puerto de Santa María", dist: "20 min from Rota",
    note: "The closest live beach camera to Rota. Inner-bay beach, so it shows you the wind and the sky rather than the surf — but for reading conditions at a glance before you drive, that is most of the value.",
    url: "https://www.skylinewebcams.com/en/webcam/espana/andalucia/cadiz/el-puerto-de-santa-maria.html", by: "SkylineWebcams" },
  { id: "cadiz", name: "Cádiz seafront", town: "Cádiz", dist: "35 min",
    note: "City cam over the bay. Good for checking whether the Levante is actually blowing before you commit to the drive south.",
    url: "https://www.skylinewebcams.com/en/webcam/espana/andalucia/cadiz/cadiz.html", by: "SkylineWebcams" },
  { id: "conil", name: "Playa de la Fontanilla", town: "Conil de la Frontera", dist: "60 min",
    note: "Points at open Atlantic sand only a few kilometres up the coast from El Palmar — the best proxy you can watch for what the good beaches are doing.",
    url: "https://www.skylinewebcams.com/en/webcam/espana/andalucia/cadiz/conil-de-la-frontera.html", by: "SkylineWebcams" },
  { id: "barrosa", name: "La Barrosa", town: "Chiclana", dist: "48 min",
    note: "Long open beach south of the bay. Shows swell lines on a clear day.",
    url: "https://www.skylinewebcams.com/en/webcam/espana/andalucia/cadiz/chiclana-de-la-frontera.html", by: "SkylineWebcams" },
  { id: "zahara", name: "Zahara de los Atunes", town: "Barbate", dist: "95 min",
    note: "Far south. Useful as a wind check for the Strait end of the coast.",
    url: "https://www.skylinewebcams.com/en/webcam/espana/andalucia/cadiz/zahara-de-los-atunes.html", by: "SkylineWebcams" }
];

/* ── what to put on ──────────────────────────────────────────────────────
   Chosen from the live sea-surface temperature, not from the calendar.
   Ranges are the bodyboarding ones: you are lying on the board with your
   legs in the water the whole time and you move less than a surfer does,
   so you run about half a step colder than a surf chart would tell you. */
window.__SURF_WETSUIT__ = [
  { min: 24, suit: "Boardshorts or a swimsuit", extra: "Rash vest if you are out more than an hour — the board eats your ribs.", icon: "🩳" },
  { min: 22, suit: "Trunks, or a shorty if you feel the cold", extra: "Fine for a two-hour session in the sun.", icon: "🩳" },
  { min: 20, suit: "2 mm shorty", extra: "Comfortable. A full 3/2 if you are out early before the sun is on the water.", icon: "🤿" },
  { min: 18, suit: "3/2 mm full suit", extra: "The Rota default. Barefoot is fine at this temperature.", icon: "🤿" },
  { min: 16, suit: "3/2 mm full suit + 2 mm booties", extra: "Your feet go first on a bodyboard — booties matter more than the suit thickness here.", icon: "🧊" },
  { min: 14, suit: "4/3 mm full suit + 3 mm booties", extra: "Add a 2 mm hood if there is any wind on the water. Ninety minutes is a long session.", icon: "🧊" },
  { min: -99, suit: "4/3 mm full suit, boots, gloves and hood", extra: "Cold for this coast. Keep it short and have something hot in the car.", icon: "❄️" }
];

/* Kit rules — each one is a test against live conditions. */
window.__SURF_KIT__ = [
  { id: "fins", always: true, label: "Swim fins", why: "Non-negotiable on a bodyboard — they are your entire engine for catching waves and getting back outside." },
  { id: "tethers", test: function (c) { return c.hs >= 1.2 || c.rip; }, label: "Fin tethers / savers", why: "One duck-dive under a set and an untethered fin is gone. Cheap insurance." },
  { id: "leash", always: true, label: "Bicep leash", why: "Keeps the board off other people's heads and off the rocks." },
  { id: "grip", test: function (c) { return c.airT >= 24; }, label: "Deck grip or wax", why: "Above about 24 °C the deck gets slick and you slide off on the drop." },
  { id: "vest", test: function (c) { return c.hs >= 2.0; }, label: "Impact vest", why: "At this size the sand hits back, especially on a shorebreak." },
  { id: "booties", test: function (c) { return c.reef || c.sst < 17; }, label: "Booties", why: "Reef, urchins, or water cold enough that your feet stop working." },
  { id: "water", test: function (c) { return c.airT >= 26 || c.uv >= 7; }, label: "Water and shade", why: "Andalucían sun on a salt-wet back is brutal — this coast dehydrates people fast." },
  { id: "spf", test: function (c) { return c.uv >= 6; }, label: "Reef-safe SPF 50 on face, ears and back of the legs", why: "You are lying face-up-ish and stationary for two hours. The backs of the legs always burn." },
  { id: "windbreak", test: function (c) { return c.wind >= 18; }, label: "Windproof layer for the walk back", why: "Wet plus wind equals cold even in July." },
  { id: "cash", test: function (c) { return c.summer; }, label: "A few euros in coins", why: "Summer parking attendants and blue-zone meters, both cash-friendly." }
];

/* ── the board rules, in plain words ─────────────────────────────────────
   Spanish beach ordinances are municipal, so they differ town to town, but
   the shape of the rule is the same everywhere on this coast. */
window.__SURF_RULES__ = {
  season: { from: "06-15", to: "09-15" },
  headline: "Yes, you can bodyboard almost everywhere here — with one seasonal rule.",
  body: [
    { t: "The one rule that actually catches people", d: "From roughly 15 June to 15 September, while the lifeguard towers are staffed (about 11:00 to 20:00), rigid boards are not allowed inside the buoyed swimming zone. That is a swimmer-safety rule, not an anti-surf rule. Bodyboards count as rigid boards in most ordinances even though they are soft." },
    { t: "So when can you go in summer?", d: "Before the towers open and after they close. Dawn sessions are completely normal here and are the best conditions of the day anyway — the wind is lightest in the morning. Outside the buoyed zone, or at a beach with no buoyed zone, you are fine at any hour." },
    { t: "Out of season", d: "From mid-September to mid-June there is no board restriction at all on these beaches. That is nine months of the year, and it happens to be when the swell actually shows up." },
    { t: "Flags override everything", d: "Red flag means nobody enters the water, board or no board, and it is enforced with fines. Yellow means caution. Green means go. The flag is about the sea state, so on a big clean swell day a beach can fly red while the surf is excellent — that is the day to drive to a non-lifeguarded beach like Cortadura, Candor or El Palmar." },
    { t: "The naval station beaches", d: "The beaches inside NAVSTA Rota are controlled by the base, not the town, and have their own flag system, season and hours through MWR. Check the base rules rather than this page for those." },
    { t: "Common sense that is also the law", d: "Do not ride into a crowd of swimmers. Wear the leash. In marked surf corridors, enter and exit through them. Nobody on this coast has ever been hassled for bodyboarding politely." }
  ],
  note: "Ordinances get re-issued every spring and each town words its own slightly differently. This is the reliable shape of the rule — if you are in doubt at a lifeguarded beach in August, ask the tower. They will tell you where the corridor is."
};

/* Local weather lore that the models do not label for you. */
window.__SURF_LORE__ = [
  { w: "Levante", dir: [45, 135], good: true,
    t: "Levante — the east wind",
    d: "Blows offshore on every west-facing beach from Rota to Conil, holding the waves up and making them clean. A light Levante is the best thing that can happen to this coast. A strong one (over about 25 kn) sandblasts the beach and makes the drop hard." },
  { w: "Poniente", dir: [225, 315], good: false,
    t: "Poniente — the west wind",
    d: "Onshore everywhere on the Atlantic side. It flattens the shape and turns the sea into chop. The answer is Los Caños de Meca, which faces south behind Cape Trafalgar and is offshore in exactly this wind." },
  { w: "Northerly", dir: [325, 45], good: true,
    t: "North wind",
    d: "Cross-offshore on most of the coast and usually light. Fine conditions, just less groomed than a true Levante." },
  { w: "Southerly", dir: [135, 225], good: false,
    t: "South wind",
    d: "Cross-onshore and usually means weather coming. Cádiz's own beaches handle it better than the beaches further north." }
];
