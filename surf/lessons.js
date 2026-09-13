/* Rota Wave Watch — the Learn tab.
   How to ride a bodyboard, what goes wrong on a first session and why, how to
   stop hurting afterwards, and a first month. Every picture is inline SVG in
   the site's own colours, so it follows the theme and needs no image files. */

/* Small helpers so the drawings share one visual language. */
function _mono(x, y, txt, extra) {
  return '<text x="' + x + '" y="' + y + '" font-family="IBM Plex Mono,monospace" font-size="9"' +
    (extra || ' fill="var(--ink-2)"') + '>' + txt + '</text>';
}
function _hd(x, y, txt, tone) {
  return _mono(x, y, txt, ' fill="var(--' + (tone || 'ink') + ')" font-weight="700"');
}

/* ── the pictures ─────────────────────────────────────────────────────── */
var _ILL = {};

/* 1. the beach in cross-section, with the three zones named */
_ILL.zones =
  '<svg viewBox="0 0 340 160" class="ill" role="img" aria-label="Side view of a beach: sand, the inside foam where beginners start, the impact zone where waves break, and the outside">' +
  '<rect width="340" height="160" fill="var(--sky-2)"/>' +
  '<path d="M46 86 C70 84 82 90 104 88 C126 86 138 92 150 90 C160 88 168 66 184 70 C198 74 202 92 220 92 C240 92 250 80 270 82 C292 84 312 90 340 88 L340 160 L46 160Z" fill="var(--sea)"/>' +
  '<path d="M0 74 L46 86 L110 112 L200 132 L340 146 L340 160 L0 160Z" fill="var(--sand)"/>' +
  '<path d="M52 88 C70 82 90 92 112 88" stroke="var(--foam)" stroke-width="6" fill="none" stroke-linecap="round"/>' +
  '<path d="M120 90 C132 84 142 92 152 88" stroke="var(--foam)" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>' +
  '<path d="M168 72 C176 60 190 60 194 72" stroke="var(--foam)" stroke-width="5" fill="none" stroke-linecap="round"/>' +
  '<rect x="74" y="79" width="36" height="7" rx="3" transform="rotate(-8 92 82)" fill="var(--amber-b)"/>' +
  '<circle cx="98" cy="62" r="6" fill="var(--ink)"/>' +
  '<g stroke="var(--ink)" stroke-width="3" stroke-linecap="round" fill="none"><path d="M98 68 L98 90"/><path d="M98 74 L90 82"/><path d="M98 74 L106 80"/></g>' +
  '<g stroke="var(--muted)" stroke-dasharray="2 3" stroke-width="1"><path d="M46 18V150"/><path d="M158 18V150"/><path d="M212 18V150"/></g>' +
  '<g text-anchor="middle">' +
    _mono(23, 30, 'sand') +
    _hd(100, 30, 'INSIDE') + _mono(100, 41, 'waist-deep foam') + _hd(100, 53, 'start here', 'good') +
    _hd(187, 30, 'IMPACT') + _mono(187, 41, 'breaks here') + _hd(187, 53, 'not yet', 'bad') +
    _hd(276, 30, 'OUTSIDE') + _mono(276, 41, 'green waves') + _mono(276, 53, 'month two') +
  '</g></svg>';

/* 2. lying on the board, side on */
_ILL.lie =
  '<svg viewBox="0 0 340 160" class="ill" role="img" aria-label="Side view of a rider lying on a bodyboard: chest on the front half, elbows on the deck, hips on the tail, fins under the water">' +
  '<rect width="340" height="160" fill="var(--sky-2)"/>' +
  '<rect y="104" width="340" height="56" fill="var(--sea)"/>' +
  '<rect x="92" y="96" width="140" height="10" rx="5" fill="var(--amber-b)" transform="rotate(-5 170 100)"/>' +
  '<g stroke="var(--ink)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
    '<path d="M112 97 L150 92 L186 86"/><path d="M186 86 L204 90 L228 87"/>' +
    '<path d="M112 97 L96 105 L84 113"/><path d="M112 97 L92 108 L78 119" opacity=".55"/>' +
    '<path d="M186 86 L196 80"/></g>' +
  '<circle cx="202" cy="74" r="8" fill="var(--ink)"/>' +
  '<path d="M84 113 L64 123 L82 121Z" fill="var(--teal)"/><path d="M78 119 L58 129 L76 127Z" fill="var(--teal)" opacity=".6"/>' +
  '<g stroke="var(--muted)" stroke-width="1" fill="none"><path d="M236 90 L262 66"/><path d="M204 94 L232 128"/><path d="M110 100 L70 50"/><path d="M70 123 L48 140"/></g>' +
  _mono(238, 52, 'nose a finger') + _mono(238, 63, 'above the water') +
  _mono(196, 140, 'elbows on the deck,') + _mono(196, 151, 'hands on the corners') +
  _mono(16, 36, 'hips on the tail,') + _mono(16, 47, 'chest on the front half') +
  _mono(6, 152, 'fins under the water') +
  '</svg>';

/* 3. kicking: what makes speed and what does not */
_ILL.kick =
  '<svg viewBox="0 0 340 160" class="ill" role="img" aria-label="Two kicking styles: small fast kicks from the hip with fins under water, versus bent knees slapping the surface">' +
  '<rect width="340" height="160" fill="var(--sky-2)"/>' +
  '<rect y="90" width="340" height="70" fill="var(--sea)"/>' +
  '<path d="M170 8V152" stroke="var(--line)" stroke-width="1"/>' +
  '<g><rect x="112" y="84" width="54" height="9" rx="4" fill="var(--amber-b)"/>' +
    '<g stroke="var(--ink)" stroke-width="4" stroke-linecap="round" fill="none"><path d="M122 82 L150 78"/><path d="M122 82 L98 96 L74 104"/><path d="M122 82 L100 102 L78 118" opacity=".55"/></g>' +
    '<path d="M74 104 L50 110 L72 112Z" fill="var(--teal)"/><path d="M78 118 L54 124 L76 126Z" fill="var(--teal)" opacity=".6"/>' +
    _hd(12, 26, 'YES', 'good') + _mono(12, 40, 'small, fast, from the hip;') + _mono(12, 51, 'legs long, fins under the') + _mono(12, 62, 'water the whole time') +
  '</g>' +
  '<g transform="translate(170 0)"><rect x="112" y="84" width="54" height="9" rx="4" fill="var(--amber-b)"/>' +
    '<g stroke="var(--ink)" stroke-width="4" stroke-linecap="round" fill="none"><path d="M122 82 L150 78"/><path d="M122 82 L100 92 L96 66"/><path d="M122 82 L102 100 L84 112" opacity=".55"/></g>' +
    '<path d="M96 66 L84 46 L100 58Z" fill="var(--teal)"/>' +
    '<g stroke="var(--foam)" stroke-width="2" stroke-linecap="round"><path d="M84 84 L80 74"/><path d="M92 86 L94 76"/><path d="M76 88 L70 80"/></g>' +
    _hd(12, 26, 'NO', 'bad') + _mono(12, 40, 'knees bent, fins slapping') + _mono(12, 51, 'the surface: splash, noise') + _mono(12, 62, 'and no speed at all') +
  '</g></svg>';

/* 4. catching a wave in three frames */
function _rider(x, y, rot) {
  return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ')">' +
    '<rect x="-23" y="-4" width="46" height="7" rx="3" fill="var(--amber-b)"/>' +
    '<g stroke="var(--ink)" stroke-width="3" stroke-linecap="round" fill="none"><path d="M-12 -5 L12 -8"/><path d="M-12 -5 L-24 3 L-34 9"/></g>' +
    '<circle cx="18" cy="-13" r="5" fill="var(--ink)"/>' +
    '<path d="M-34 9 L-46 14 L-35 15Z" fill="var(--teal)"/></g>';
}
function _hump(x, foam) {
  return '<path d="M' + (x - 44) + ' 100 C' + (x - 16) + ' 100 ' + (x - 16) + ' 76 ' + x + ' 76 C' + (x + 16) + ' 76 ' + (x + 16) + ' 100 ' + (x + 44) + ' 100Z" fill="var(--sea)"/>' +
    (foam ? '<ellipse cx="' + x + '" cy="78" rx="15" ry="5" fill="var(--foam)"/>' : '');
}
_ILL.catch3 =
  '<svg viewBox="0 0 340 160" class="ill" role="img" aria-label="Three frames: kick hard while the foam is two board lengths behind; the tail lifts, push the nose down a touch; then you are on it, weight forward, chest up">' +
  '<rect width="340" height="160" fill="var(--sky-2)"/>' +
  '<rect y="100" width="340" height="60" fill="var(--sea)"/>' +
  '<g stroke="var(--line)" stroke-width="1"><path d="M113 8V152"/><path d="M226 8V152"/></g>' +
  _hump(18, true) + _rider(84, 98, 0) +
  _hump(171, true) + _rider(196, 93, 6) +
  _hump(266, true) + _rider(294, 88, 12) +
  _hd(8, 24, '1  look back') + _mono(8, 37, 'foam two lengths') + _mono(8, 48, 'back: kick hard') + _mono(8, 59, 'now, not later') +
  _hd(121, 24, '2  it lifts you') + _mono(121, 37, 'tail rises: push') + _mono(121, 48, 'the nose down') + _mono(121, 59, 'a touch') +
  _hd(234, 24, '3  on it', 'good') + _mono(234, 37, 'weight forward,') + _mono(234, 48, 'chest up, eyes') + _mono(234, 59, 'along the beach') +
  '</svg>';

/* 5. steering, from above */
_ILL.turn =
  '<svg viewBox="0 0 340 160" class="ill" role="img" aria-label="Top view of a rider on a bodyboard: push the left elbow into the deck and pull up with the right hand to turn left">' +
  '<rect width="340" height="160" fill="var(--sky-2)"/>' +
  '<rect x="140" y="14" width="60" height="140" rx="24" fill="var(--amber-b)"/>' +
  '<rect x="153" y="60" width="34" height="64" rx="14" fill="var(--ink)" opacity=".8"/>' +
  '<circle cx="170" cy="42" r="9" fill="var(--ink)"/>' +
  '<g stroke="var(--ink)" stroke-width="5" stroke-linecap="round" fill="none">' +
    '<path d="M156 66 L146 48 L150 26"/><path d="M184 66 L194 48 L190 26"/>' +
    '<path d="M162 122 L156 158"/><path d="M178 122 L184 158"/></g>' +
  '<path d="M138 46 C112 40 100 60 108 82" stroke="var(--good)" stroke-width="3" fill="none" stroke-linecap="round"/>' +
  '<path d="M104 72 L108 84 L118 78" stroke="var(--good)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<circle cx="146" cy="48" r="7" fill="none" stroke="var(--good)" stroke-width="2"/>' +
  '<circle cx="190" cy="26" r="7" fill="none" stroke="var(--teal)" stroke-width="2"/>' +
  _hd(8, 30, 'to go left', 'good') + _mono(8, 44, 'push the left elbow') + _mono(8, 55, 'into the deck') +
  _mono(8, 120, 'look where you want') + _mono(8, 131, 'to go: the board') + _mono(8, 142, 'follows your eyes') +
  _mono(210, 30, 'pull up with the') + _mono(210, 41, 'right hand') +
  _mono(210, 120, 'legs trail behind,') + _mono(210, 131, 'off the tail') +
  '</svg>';

/* 6. getting back out through the foam */
function _foam(cx, cy, s) {
  return '<g fill="var(--foam)"><circle cx="' + (cx - 1.1 * s) + '" cy="' + (cy + 0.2 * s) + '" r="' + (0.7 * s) + '"/>' +
    '<circle cx="' + cx + '" cy="' + (cy - 0.2 * s) + '" r="' + s + '"/>' +
    '<circle cx="' + (cx + 1.0 * s) + '" cy="' + (cy + 0.25 * s) + '" r="' + (0.75 * s) + '"/>' +
    '<rect x="' + (cx - 1.8 * s) + '" y="' + cy + '" width="' + (3.6 * s) + '" height="' + (100 - cy) + '"/></g>';
}
_ILL.out =
  '<svg viewBox="0 0 340 160" class="ill" role="img" aria-label="Two ways through foam: lift the nose over a small one, push the nose under a big one with your chin down">' +
  '<rect width="340" height="160" fill="var(--sky-2)"/>' +
  '<rect y="100" width="340" height="60" fill="var(--sea)"/>' +
  '<path d="M170 8V152" stroke="var(--line)" stroke-width="1"/>' +
  _foam(44, 94, 9) +
  '<g transform="translate(112 96) rotate(14)"><rect x="-23" y="-4" width="46" height="7" rx="3" fill="var(--amber-b)"/>' +
    '<g stroke="var(--ink)" stroke-width="3" stroke-linecap="round" fill="none"><path d="M12 -5 L-12 -8"/><path d="M12 -5 L24 3 L34 9"/></g><circle cx="-18" cy="-13" r="5" fill="var(--ink)"/></g>' +
  _hd(8, 26, 'small foam') + _mono(8, 40, 'nose up, let it slide') + _mono(8, 51, 'underneath you') +
  _foam(238, 74, 22) +
  '<g transform="translate(300 100) rotate(-16)"><rect x="-23" y="-4" width="46" height="7" rx="3" fill="var(--amber-b)"/>' +
    '<g stroke="var(--ink)" stroke-width="3" stroke-linecap="round" fill="none"><path d="M12 -5 L-12 -8"/><path d="M12 -5 L24 3 L34 9"/></g><circle cx="-18" cy="-11" r="5" fill="var(--ink)"/></g>' +
  _hd(178, 26, 'big foam') + _mono(178, 40, 'push the nose under,') + _mono(178, 51, 'chin down, hold the') + _mono(178, 62, 'corners, kick through') +
  '</svg>';

/* 7. the rip, from above */
_ILL.rip =
  '<svg viewBox="0 0 340 160" class="ill" role="img" aria-label="Top view of a beach with a rip current: a darker, flatter channel where the foam is missing, moving out to sea. Kick sideways out of it, then ride the foam in">' +
  '<rect width="340" height="160" fill="var(--sea)"/>' +
  '<rect x="150" y="0" width="50" height="126" fill="var(--sea-deep)" opacity=".7"/>' +
  '<g stroke="var(--foam)" stroke-width="5" stroke-linecap="round" fill="none" opacity=".9">' +
    '<path d="M6 66 C40 60 70 72 100 66 C120 62 136 68 146 66"/><path d="M204 66 C230 62 260 72 300 66 C316 64 326 68 334 66"/>' +
    '<path d="M6 88 C40 82 70 94 100 88 C120 84 136 90 146 88"/><path d="M204 88 C230 84 260 94 300 88 C316 86 326 90 334 88"/>' +
    '<path d="M6 110 C40 104 70 116 100 110 C120 106 136 112 146 110"/><path d="M204 110 C230 106 260 116 300 110 C316 108 326 112 334 110"/></g>' +
  '<g stroke="var(--foam)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".8">' +
    '<path d="M168 40 L175 30 L182 40"/><path d="M168 66 L175 56 L182 66"/><path d="M168 92 L175 82 L182 92"/></g>' +
  '<path d="M0 126 L340 126 L340 160 L0 160Z" fill="var(--sand)"/>' +
  '<path d="M178 100 L248 100 C258 100 258 106 258 110 L258 122" stroke="var(--amber-b)" stroke-width="4" fill="none" stroke-linecap="round"/>' +
  '<path d="M250 114 L258 124 L266 114" stroke="var(--amber-b)" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<circle cx="176" cy="100" r="6" fill="var(--amber-b)"/>' +
  _hd(8, 20, 'rip', 'foam') + _mono(8, 31, 'darker, flatter,', ' fill="var(--foam)"') + _mono(8, 42, 'no foam, water', ' fill="var(--foam)"') + _mono(8, 53, 'heading out', ' fill="var(--foam)"') +
  _mono(210, 20, 'do not fight it:', ' fill="var(--foam)"') + _mono(210, 31, 'kick sideways to', ' fill="var(--foam)"') + _mono(210, 42, 'the foam, then', ' fill="var(--foam)"') + _mono(210, 53, 'ride it in', ' fill="var(--foam)"') +
  _mono(8, 148, 'beach') +
  '</svg>';

/* 8. four things to do on the sand afterwards */
_ILL.stretch =
  '<svg viewBox="0 0 340 96" class="ill" role="img" aria-label="Four recovery moves: superman hold, kneeling hip flexor stretch, child\'s pose, chin tucks">' +
  '<rect width="340" height="96" fill="var(--sky-2)"/>' +
  '<g stroke="var(--line)" stroke-width="1"><path d="M85 8V88"/><path d="M170 8V88"/><path d="M255 8V88"/></g>' +
  '<g stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
    '<path d="M18 54 L58 52"/><path d="M58 52 L76 42"/><path d="M18 54 L4 44"/></g><circle cx="66" cy="44" r="5" fill="var(--ink)"/>' +
  '<g transform="translate(85 0)" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
    '<path d="M40 22 L40 46 L56 54 L56 66"/><path d="M40 46 L24 66 L6 66"/></g><circle cx="125" cy="15" r="5" fill="var(--ink)"/>' +
  '<g transform="translate(170 0)" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
    '<path d="M64 66 L36 66 L56 50 C50 44 30 46 14 58"/><path d="M16 58 L4 66"/></g><circle cx="181" cy="60" r="5" fill="var(--ink)"/>' +
  '<g transform="translate(255 0)"><circle cx="40" cy="36" r="11" fill="none" stroke="var(--ink)" stroke-width="3.5"/>' +
    '<path d="M40 47 L40 62" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round"/>' +
    '<path d="M64 36 L52 36" stroke="var(--good)" stroke-width="3" stroke-linecap="round"/><path d="M57 31 L52 36 L57 41" stroke="var(--good)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>' +
  '<g text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="8" fill="var(--ink-2)">' +
    '<text x="42" y="80">superman 20 s</text><text x="127" y="80">hip flexor 30 s</text>' +
    '<text x="212" y="80">child pose 30 s</text><text x="297" y="80">chin tucks ×10</text>' +
  '</g></svg>';

/* ── the lessons ──────────────────────────────────────────────────────── */
window.__SURF_LESSONS__ = {

  /* The three things that decide a first session. Shown before anything else. */
  three: [
    { t: "Right beach", d: "Sandy bottom, small foam, no rocks, no current. The Now tab picks one for you every day. A reef beach with a current is the wrong classroom whatever the forecast says." },
    { t: "Right zone", d: "Waist-deep, in the broken white water. Everything a beginner needs is in the first twenty metres. Going out the back is not a shortcut, it is a different sport." },
    { t: "Fins on, kicking early", d: "Arms do not make speed on a bodyboard. Fins do, and only if the kick starts before the wave gets to you, not when it does." }
  ],

  steps: [
    { id: "read", t: "Read the beach for ten minutes",
      ill: "zones",
      pts: [
        "Stand on the sand and watch. Where does the foam form, and where does it die? That strip of white water is your classroom.",
        "Look for a channel of darker, flatter water with no foam in it. That is a rip. Stay well clear of it today.",
        "Watch something floating for a minute. If it moves along the beach, so will you. Pick two things on land to line up and check them every few waves.",
        "Check the flag. Red means nobody, board included. Yellow means feet on the bottom."
      ] },
    { id: "lie", t: "Lie on it properly",
      ill: "lie",
      pts: [
        "Chest on the front half, hips on the tail, so the board runs flat. Too far forward and the nose digs in; too far back and it shoots out from under you.",
        "Elbows down on the deck, hands on the front corners. Grip with the elbows, not the hands.",
        "Nose one finger above the water. Look at the beach, not at the sky, so the neck is not doing the holding.",
        "Leash on the wrist or upper arm of the hand nearest the nose. Fin tethers on."
      ] },
    { id: "kick", t: "Kick, do not paddle",
      ill: "kick",
      pts: [
        "Fins are the engine. Without them you are limited to the white water, which is fine for the first three sessions.",
        "Small, quick kicks from the hip, legs long, toes pointed. The fins stay under the water the whole time.",
        "Bent knees and fins slapping the surface make noise and no speed. If people can hear you, you are doing it wrong.",
        "You cannot chase a wave from behind. Speed comes from being in the right place, then kicking three seconds early."
      ] },
    { id: "catch", t: "Catch the foam first",
      ill: "catch3",
      pts: [
        "Stand waist-deep with the board pointed at the beach. Wait. When the foam is two board lengths behind you, push off the bottom and land chest-first on the board, kicking.",
        "It will lift your tail. Push the nose down a touch as it does, or the foam goes under you and leaves you behind.",
        "Once it has you, weight forward, chest up, and look along the beach rather than down at the water.",
        "Ride it to the sand. Walk back. Thirty of those is one session, and it is the whole of the first week."
      ] },
    { id: "steer", t: "Ride across it, not straight in",
      ill: "turn",
      pts: [
        "Straight at the beach is a five-second ride. Angling across the wave is a twenty-second one, and it is how you stay ahead of the foam on a green wave.",
        "To go left, push the left elbow into the deck, pull up a little with the right hand, and look left. The board follows your eyes.",
        "Legs trail behind the tail, together. Dragging one fin is the brake and the tightest turn you have.",
        "Start this on the foam in session four, once the catch is automatic."
      ] },
    { id: "out", t: "Getting back out",
      ill: "out",
      pts: [
        "Walk when you can stand. It is faster than kicking and costs nothing.",
        "Small foam: lift the nose and let it pass under you.",
        "Big foam: push the nose under, chin down, hold the corners, and kick through. Never take it side-on; that is what knocks you off.",
        "Waves come in sets with a lull between. Go during the lull, not into the set."
      ] },
    { id: "rip", t: "If you are being pulled out",
      ill: "rip",
      pts: [
        "You will not out-kick it, and trying is what tires people. Keep the board, keep breathing.",
        "Kick sideways along the beach until you feel the foam again, then let the foam carry you in.",
        "If it is strong, lie on the board and put a hand up. On a lifeguarded beach that is enough.",
        "Reef beaches and headlands make currents you cannot beat. That is why the learn pick only ever chooses sand."
      ] },
    { id: "fall", t: "Falling off",
      ill: null,
      pts: [
        "Cover your head with your arms and come up hand-first. The board and the sand are what hurt, not the water.",
        "Fall flat, not feet-first, anywhere shallow. Never dive off the board.",
        "Hang on to the board. It floats; you will be glad of it in twenty seconds.",
        "Shuffle your feet when you walk in. Weeverfish bury themselves in the sand here and a sting is a bad afternoon."
      ] }
  ],

  /* Symptom first, cause second, fix third. This is what the "fix my session"
     chips show. Each one points at the lesson to reread. */
  fixes: [
    { id: "left", sym: "The wave went under me and left me behind",
      why: "You were too far out, or you started kicking when the wave arrived instead of before it.",
      fix: "Move in to where the foam is forming, not beyond it. Start kicking when it is two board lengths behind you, and push the nose down a touch as the tail lifts.",
      see: ["catch", "kick"] },
    { id: "slow", sym: "I could not get any speed",
      why: "Arms do not make speed on a sponge; fins do. Without fins you are limited to the foam, and with them the kick has to be under the water and early.",
      fix: "Fins on, legs long, small fast kicks from the hip that start before the wave. If you had no fins, stay in the foam and push off the bottom.",
      see: ["kick", "catch"] },
    { id: "nose", sym: "The nose dug in and I went over the front",
      why: "Weight too far forward, or you went straight down a steep face.",
      fix: "Slide back a hand's width. Lift the nose a touch as it takes you, then angle across the wave rather than straight at the beach.",
      see: ["lie", "steer"] },
    { id: "shot", sym: "The board shot out from under me",
      why: "Hips off the tail and gripping only with the hands.",
      fix: "Chest down on the front half, hips on the tail, elbows pressed into the deck. The elbows are the grip.",
      see: ["lie"] },
    { id: "drift", sym: "The current kept moving me",
      why: "A rip or a longshore drift, and you were fighting it. On a reef or a headland beach you cannot win that.",
      fix: "Line up two things on land. When they shift, walk or kick sideways, never against it. Learn on a flat sandy beach with no headland; the learn pick on the Now tab only chooses those.",
      see: ["read", "rip"] },
    { id: "gassed", sym: "I was wrecked after twenty minutes",
      why: "Kicking out through everything, sitting in the impact zone, and never resting.",
      fix: "Stay inside. Walk back instead of kicking. Stand up between waves. Go out in the lulls. Forty-five minutes is a full first session.",
      see: ["out", "sore"] },
    { id: "slap", sym: "Every wave knocked me off the board",
      why: "You met the foam side-on, or with the nose in the air.",
      fix: "Point straight at it, nose down, chin down, elbows locked on the deck. Small foam goes under you; big foam you push through.",
      see: ["out"] },
    { id: "hurt", sym: "Neck, back or feet hurt",
      why: "Craning to look up, arching to keep the nose out, and fins that rub.",
      fix: "Look at the beach, not the sky, and let the chest hold you up, not the neck. Fin socks and tethers, and rinse the fins. The recovery list below is the rest of it.",
      see: ["lie", "sore"] }
  ],

  sore: {
    why: "Lying on a board holds your neck and lower back up for an hour, the kick is all hips and calves, and the shoulders carry the board. Two days of stiffness after a first go is ordinary muscle soreness, not injury.",
    blocks: [
      { t: "Five minutes on the sand first",
        d: "A brisk walk to the water. Twenty arm circles each way, ten hip circles, ten cat-cows, fifteen squats, ten leg swings each side. No static stretching cold." },
      { t: "In the water",
        d: "Forty-five minutes to an hour for the first month. Get out for five minutes every twenty. Stop before you are wrecked: the tired last wave is the one that hurts. Drink before and after." },
      { t: "Straight after",
        d: "Walk five minutes, then stretch warm: kneeling hip flexor thirty seconds a side, child's pose, knees to chest, ten chin tucks, calves against a wall. Warm shower, a real meal with protein within the hour, an early night." },
      { t: "Ten minutes on land days",
        d: "Superman holds three times twenty seconds (that is the riding position). Face-down flutter kicks three times thirty seconds. Glute bridges two sets of fifteen. Twenty minutes of kicking with fins in a pool is the single most transferable thing you can do." },
      { t: "When it is not just soreness",
        d: "Sharp pain, numbness, pain that gets worse day by day, or a knock to the head: that is a doctor, not a website. Two sessions a week with a rest day between is plenty for the first month." }
    ]
  },

  month: [
    { t: "Sessions 1–3", d: "Foam only, waist-deep, no fins needed. Ride straight to the sand thirty times. The only goal is lying on it right and keeping the weight forward." },
    { t: "Sessions 4–6", d: "Fins on. Catch the foam by kicking rather than pushing off the bottom. Start angling left and right." },
    { t: "Sessions 7–10", d: "First green waves, under about 0.6 m, at a sandy learner beach on a low tide, right where they have just broken." },
    { t: "After that", d: "Paddle outside on a small day, learn the push-through properly, then try the low-tide shorebreak at El Palmar that the main score chases." }
  ]
};

window.__SURF_ILL__ = _ILL;
