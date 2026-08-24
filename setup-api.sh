#!/usr/bin/env bash
# ⚓ Rota Trip Finder — one-script API setup.
#
#   ./setup-api.sh
#
# Puts your Anthropic API key (and optional friend access code) into the
# Cloudflare Worker and deploys it. Keys never touch the website — they live
# only in the Worker. Run it again any time to rotate a key.
set -euo pipefail
cd "$(dirname "$0")/worker"

bold=$(tput bold 2>/dev/null || true); dim=$(tput dim 2>/dev/null || true); off=$(tput sgr0 2>/dev/null || true)
echo "${bold}⚓ Rota Trip Finder — API setup${off}"
echo "${dim}Everything below is stored as a Cloudflare secret, never in the site.${off}"
echo

command -v npx >/dev/null 2>&1 || { echo "This needs Node.js — install it from https://nodejs.org and re-run."; exit 1; }

if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "First, log in to Cloudflare (a browser window will open)…"
  npx wrangler login
fi

read -rsp "Anthropic API key for live intel (sk-ant-…, blank = keep current): " KEY; echo
if [ -n "${KEY}" ]; then
  printf '%s' "$KEY" | npx wrangler secret put ANTHROPIC_API_KEY
  echo "  ✓ Claude key set"
fi

read -rsp "Access code your friends type once (blank = keep current): " CODE; echo
if [ -n "${CODE}" ]; then
  printf '%s' "$CODE" | npx wrangler secret put ACCESS_CODE
  echo "  ✓ Access code set"
fi

echo
echo "Deploying the Worker…"
npx wrangler deploy

echo
echo "${bold}Health check:${off}"
HEALTH_URL="https://rota-trip-finder-api.streamedmusics.workers.dev/api/health"
curl -s "$HEALTH_URL" || true
echo
echo
echo "${bold}Done.${off} Open the site and hit “What's happening there right now?” on any pin."
echo "If it asks for a code, it's the one you just set."
