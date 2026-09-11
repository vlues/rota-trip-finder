#!/usr/bin/env bash
# Stamp a new build version into surf/.
#
# GitHub Pages serves every asset with Cache-Control: max-age=600, so for ten
# minutes after a push a visitor can get the new index.html with the old
# app.js, or — on a phone that has added this to its home screen — the old
# everything, indefinitely. The stamp gives the page a way to notice.
set -euo pipefail
cd "$(dirname "$0")"
V="$(date +%Y%m%d%H%M%S)"
printf '{ "v": "%s" }\n' "$V" > version.json
/usr/bin/sed -i '' -E \
  -e "s|(<meta name=\"app-version\" content=\")[^\"]*(\")|\1${V}\2|" \
  -e "s|(src=\"\./(app\|data)\.js)(\?v=[^\"]*)?\"|\1?v=${V}\"|g" \
  index.html
echo "stamped $V"
grep -n 'app-version\|app\.js?v=\|data\.js?v=' index.html
