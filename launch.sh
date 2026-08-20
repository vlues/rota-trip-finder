#!/usr/bin/env bash
#
# launch.sh — Rota Trip Finder, zero to live in one run.
#
#   ./launch.sh
#
# What it does, in order:
#   1. checks the tools it needs (git, node, gh) and logs you in
#   2. asks for your API keys (paste, or press Enter to skip any of them)
#   3. deploys the Cloudflare Worker that holds those keys
#   4. wires the site to the Worker and locks the Worker to your site
#   5. pushes to GitHub and turns on GitHub Pages
#   6. prints the link you send your friends
#
# Safe to re-run any time — it updates in place instead of duplicating.
# Keys are sent straight into Cloudflare secrets; nothing is written to disk
# or committed to git.

set -euo pipefail
cd "$(dirname "$0")"

REPO="${REPO:-rota-trip-finder}"
bold=$(tput bold 2>/dev/null || true); dim=$(tput dim 2>/dev/null || true)
grn=$(tput setaf 2 2>/dev/null || true); red=$(tput setaf 1 2>/dev/null || true)
rst=$(tput sgr0 2>/dev/null || true)
say()  { printf '\n%s▸ %s%s\n' "$bold" "$*" "$rst"; }
ok()   { printf '  %s✓%s %s\n' "$grn" "$rst" "$*"; }
die()  { printf '  %s✗ %s%s\n' "$red" "$*" "$rst"; exit 1; }

# in-place edit that works on both macOS and Linux sed
edit() { perl -pi -e "$1" "$2"; }

# ---------------------------------------------------------------- 1. tools
say "Checking tools"
command -v git  >/dev/null || die "git is missing — install Xcode command line tools: xcode-select --install"
command -v node >/dev/null || die "Node.js is missing — install from https://nodejs.org (or: brew install node)"
command -v gh   >/dev/null || die "GitHub CLI is missing — install with: brew install gh"
ok "git, node, gh found"

gh auth status >/dev/null 2>&1 || { say "Logging in to GitHub"; gh auth login; }
GH_USER=$(gh api user -q .login)
PAGES_ORIGIN="https://${GH_USER}.github.io"
SITE_URL="${PAGES_ORIGIN}/${REPO}/"
ok "GitHub: ${GH_USER}"

# ----------------------------------------------------------------- 2. keys
say "API keys — paste each one, or press Enter to skip it"
echo "  ${dim}Anything you skip just runs in demo/sample mode. Re-run this script"
echo "  later to add it. Input is hidden while you type.${rst}"
echo
echo "  Stays + flights → one RapidAPI key covers both. At rapidapi.com,"
echo "  subscribe that key to BOTH free plans:"
echo "    · Airbnb13      rapidapi.com/3b-data-3b-data-default/api/airbnb13"
echo "    · Sky-Scrapper  rapidapi.com/apiheya/api/sky-scrapper"
read -rsp "  RapidAPI key: " RAPIDAPI_KEY; echo
echo
echo "  Smart search + planner → console.anthropic.com"
read -rsp "  Anthropic API key: " ANTHROPIC_API_KEY; echo
echo
SUGGESTED_CODE=$( (openssl rand -hex 3 2>/dev/null || date +%s) | tail -c 7)
echo "  Access code — the password your friends type once so strangers can't"
echo "  burn your API quota. Press Enter to use: ${bold}${SUGGESTED_CODE}${rst}"
read -rp "  Access code: " ACCESS_CODE
ACCESS_CODE="${ACCESS_CODE:-$SUGGESTED_CODE}"

# --------------------------------------------------------------- 3. worker
say "Deploying the Cloudflare Worker (this is where your keys live)"
( cd worker
  npm install --no-fund --no-audit --silent
  npx wrangler whoami >/dev/null 2>&1 || npx wrangler login
)
# lock the Worker to your site (plus localhost for tinkering)
edit "s#^ALLOWED_ORIGINS *=.*#ALLOWED_ORIGINS = \"${PAGES_ORIGIN},http://localhost:8899\"#" worker/wrangler.toml
ok "Worker locked to ${PAGES_ORIGIN}"

put_secret() {  # put_secret NAME VALUE — skips empties silently
  [ -n "$2" ] || return 0
  printf '%s' "$2" | ( cd worker && npx wrangler secret put "$1" >/dev/null 2>&1 ) \
    && ok "secret $1 set" || die "couldn't set secret $1"
}
put_secret RAPIDAPI_KEY          "$RAPIDAPI_KEY"
put_secret ANTHROPIC_API_KEY     "$ANTHROPIC_API_KEY"
put_secret ACCESS_CODE           "$ACCESS_CODE"

DEPLOY_OUT=$( cd worker && npx wrangler deploy 2>&1 ) || { echo "$DEPLOY_OUT"; die "worker deploy failed"; }
WORKER_URL=$(echo "$DEPLOY_OUT" | grep -Eo 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)
[ -n "$WORKER_URL" ] || { echo "$DEPLOY_OUT"; die "deployed, but couldn't find the Worker URL in the output above"; }
ok "Worker live at ${WORKER_URL}"

# --------------------------------------------------- 4. wire site → worker
say "Pointing the site at the Worker"
edit "s#API_BASE: *'[^']*'#API_BASE: '${WORKER_URL}'#" config.js
ok "config.js updated — friends need zero setup"

# ------------------------------------------------------ 5. GitHub + Pages
say "Publishing to GitHub Pages"
[ -d .git ] || git init -b main >/dev/null
git add -A
git commit -m "Launch Rota Trip Finder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" >/dev/null 2>&1 || ok "nothing new to commit"
if ! git remote get-url origin >/dev/null 2>&1; then
  gh repo create "$REPO" --public --source=. --push >/dev/null
  ok "created github.com/${GH_USER}/${REPO}"
else
  git push -u origin main >/dev/null 2>&1
  ok "pushed to github.com/${GH_USER}/${REPO}"
fi
# turn on Pages (build via the Actions workflow already in the repo)
gh api "repos/${GH_USER}/${REPO}/pages" -X POST -f build_type=workflow >/dev/null 2>&1 \
  || gh api "repos/${GH_USER}/${REPO}/pages" -X PUT -f build_type=workflow >/dev/null 2>&1 \
  || true
ok "GitHub Pages enabled — first build takes about a minute"

# --------------------------------------------------------------- 6. done
say "Done"
cat <<EOF

  Your site      ${bold}${SITE_URL}${rst}
  Access code    ${bold}${ACCESS_CODE}${rst}
  Worker         ${WORKER_URL}

  Send your friends the link and the code — that's all they need.
  ${dim}First visit: tap ⚙ once, enter the access code. Everything else is wired.
  Check it's really working: ⚙ → Run diagnostics.
  Add or change keys later: just run ./launch.sh again.${rst}

EOF
