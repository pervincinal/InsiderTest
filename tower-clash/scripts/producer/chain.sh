#!/usr/bin/env bash
# Producer's day-end verification chain (daily-sprint skill §3). Usage, from tower-clash/:
#   bash scripts/producer/chain.sh <tag> [--no-build] [--e2e]
# <tag> names the Playwright output dirs (<scratch>/pw-<tag>*). Without --e2e: check → build → bundle →
# playtest gates (3 seeds, naive 1–16 both tie orders, tier gate). With --e2e: the three Playwright projects
# on ports 4197–4199 (chromium, android-webview, pwa) against dist/. --no-build skips build + bundle (use it
# while another run is serving dist/). Each step prints "<step>-exit <code>"; the caller greps those.
set -o pipefail
TAG=${1:?tag}; shift
S=${PW_SCRATCH:-/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad}
BUILD=1; E2E=0
for a in "$@"; do case $a in --no-build) BUILD=0;; --e2e) E2E=1;; esac; done
cd "$(dirname "$0")/../.."
if [ $E2E = 0 ]; then
  npm run check 2>&1 | grep -E "Tests |Test Files|level\(s\) valid|error|FAIL|✗|×" | tail -8; echo "check-exit ${PIPESTATUS[0]}"
  if [ $BUILD = 1 ]; then
    npm run build >/dev/null 2>&1; echo "build-exit $?"
    node scripts/checkBundle.mjs --no-build 2>&1 | tail -1; echo "bundle-exit $?"
  fi
  npm run playtest -- --seeds 3 2>&1 | tail -1; echo "pt-exit ${PIPESTATUS[0]}"
  npm run playtest -- --naive --seeds 5 --gate 1-16 --tie both 2>&1 | grep "naive gate"; echo "naive-exit ${PIPESTATUS[0]}"
  npm run playtest -- --tier-gate --seeds 5 2>&1 | grep "tier gate"; echo "tier-exit ${PIPESTATUS[0]}"
else
  PW_PORT=4197 PW_OUTPUT="$S/pw-$TAG" npx playwright test --project=chromium --trace off --reporter=line 2>&1 | grep -E "passed|failed|flaky|✘|Error" | tail -6; echo "e2e-exit ${PIPESTATUS[0]}"
  PW_PORT=4198 PW_OUTPUT="$S/pw-${TAG}wv" npx playwright test --project=android-webview --trace off --reporter=line 2>&1 | grep -E "passed|failed|flaky|✘" | tail -3; echo "wv-exit ${PIPESTATUS[0]}"
  PW_PORT=4199 PW_OUTPUT="$S/pw-${TAG}pwa" npx playwright test --project=pwa --trace off --reporter=line 2>&1 | grep -E "passed|failed|flaky|✘" | tail -3; echo "pwa-exit ${PIPESTATUS[0]}"
fi
echo CHAIN-DONE
