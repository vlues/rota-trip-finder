#!/usr/bin/env bash
# Stamp a new build id across the whole site.
#
# Run this before committing any change to the pages or their scripts.
# GitHub Pages caches assets for ten minutes, so without a stamp a visitor can
# get new HTML with old JS, and a home-screen PWA can sit on an old build for
# much longer. Every page compares its stamp with version.json and reloads
# itself once if it is behind (see build-check.js).
set -euo pipefail
cd "$(dirname "$0")"
exec python3 - "$@" <<'PY'
import re, json, pathlib, datetime

V = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
root = pathlib.Path(".")
(root / "version.json").write_text(json.dumps({"v": V}) + "\n")

PAGES = ["index.html", "hikes/index.html", "rings/index.html", "surf/index.html"]
# local scripts that must never be paired across builds
LOCAL = r"(?:app|data|config|build-check)\.js"
meta_re = re.compile(r'(<meta name="app-version" content=")[^"]*(")')
src_re = re.compile(r'(src=")((?:\.{1,2}/)*' + LOCAL + r')(\?v=[^"]*)?(")')

for f in PAGES:
    p = root / f
    if not p.exists():
        continue
    s = p.read_text()
    s, n_meta = meta_re.subn(lambda m: m.group(1) + V + m.group(2), s)
    s, n_src = src_re.subn(lambda m: m.group(1) + m.group(2) + "?v=" + V + m.group(4), s)
    p.write_text(s)
    print(f"  ✓ {f}  ({n_meta} stamp, {n_src} scripts)")

print(f"stamped {V}")
PY
