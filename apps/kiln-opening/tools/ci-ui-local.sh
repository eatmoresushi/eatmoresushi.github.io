#!/usr/bin/env bash
# The local equivalent of the proposed "UI CI" job (UI_V1.6.1_ARCHITECTURE §9.6, §10.1).
#
# The repository-root workflow `.github/workflows/kiln-opening-ui.yml` awaits the owner's
# approval (§11 item 7), so it is not added. This script runs the same steps on this machine:
#
#   1. `npm ci`                                   (only with --install: it replaces node_modules)
#   2. `npx playwright install chromium`          (only with --install: it downloads a browser)
#   3. the root gate (§10.1): typecheck, typecheck:edge, npm test, build
#   4. `npm run build:e2e && npm run test:e2e:ci` (Chromium at 1440 against `vite preview` of the
#      built bundle: `smoke.spec.ts` and the `@ci` case of `full_game.spec.ts`)
#
# Usage: npm run ci:ui [-- --install]
set -euo pipefail

cd "$(dirname "$0")/.."

install=0
for argument in "$@"; do
  case "$argument" in
    --install) install=1 ;;
    *) echo "unknown option: $argument (use --install)" >&2; exit 2 ;;
  esac
done

step() { printf '\n== %s\n' "$1"; }

if [ "$install" = 1 ]; then
  step "npm ci"
  npm ci
  step "npx playwright install chromium"
  npx playwright install chromium
fi

step "root gate: typecheck"
npm run typecheck
step "root gate: typecheck:edge"
npm run typecheck:edge
step "root gate: npm test"
npm test
step "root gate: build"
npm run build

step "build:e2e"
npm run build:e2e
step "test:e2e:ci (Chromium, built bundle)"
CI=1 npm run test:e2e:ci

printf '\nUI CI (local equivalent): green\n'
