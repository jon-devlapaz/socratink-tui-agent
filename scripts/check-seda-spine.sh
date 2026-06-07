#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

node --test \
  tests/js/architecture-fitness.test.mjs \
  tests/js/next-phase.test.mjs \
  tests/js/event-facts.test.mjs \
  tests/js/event-facts-contract.test.mjs \
  tests/js/loop-pacing-stops.test.mjs \
  tests/js/routing-proofs.test.mjs

./socratink-harness routing-proof
