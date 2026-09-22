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

PAGES = ["index.html", "hikes/index.html", "rings/index.html", "surf/index.html", "snow/index.html"]
# Local assets that must never be paired across builds. Stylesheets count:
# they are cached exactly like the scripts, and a page wearing last build's
# CSS is just as broken as one running last build's JS.
LOCAL_JS = r"(?:app|data|lessons|config|build-check)\.js"
LOCAL_CSS = r"(?:app|style|styles)\.css"
meta_re = re.compile(r'(<meta name="app-version" content=")[^"]*(")')
src_re = re.compile(r'(src=")((?:\.{1,2}/)*' + LOCAL_JS + r')(\?v=[^"]*)?(")')
css_re = re.compile(r'(href=")((?:\.{1,2}/)*' + LOCAL_CSS + r')(\?v=[^"]*)?(")')

for f in PAGES:
    p = root / f
    if not p.exists():
        continue
    s = p.read_text()
    s, n_meta = meta_re.subn(lambda m: m.group(1) + V + m.group(2), s)
    s, n_src = src_re.subn(lambda m: m.group(1) + m.group(2) + "?v=" + V + m.group(4), s)
    s, n_css = css_re.subn(lambda m: m.group(1) + m.group(2) + "?v=" + V + m.group(4), s)
    p.write_text(s)
    print(f"  ✓ {f}  ({n_meta} stamp, {n_src} js, {n_css} css)")

print(f"stamped {V}")
PY
