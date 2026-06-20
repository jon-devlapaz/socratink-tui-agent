#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

warnings=0

warn() {
  warnings=$((warnings + 1))
  printf 'WARN %s\n' "$1"
}

pass() {
  printf 'PASS %s\n' "$1"
}

line_count="$(wc -l < AGENTS.md | tr -d ' ')"
if [ "$line_count" -le 120 ]; then
  pass "AGENTS.md is ${line_count} lines (<= 120)"
else
  warn "AGENTS.md is ${line_count} lines; keep the root agent card <= 120"
fi

stale_matches="$(
  rg -n \
    'AGENTS\.md.*§|§ Testing|Closed-loop agent operating model|prompt rules|product pedagogy lives in' \
    AGENTS.md README.md HARNESS.md HARNESS-TRACEABILITY.md HARNESS-BRIDGE-REGISTRY.md CONTEXT.md \
    2>/dev/null || true
)"
if [ -z "$stale_matches" ]; then
  pass "no stale AGENTS.md deep-section ownership references"
else
  warn "stale AGENTS.md ownership references found:"
  printf '%s\n' "$stale_matches"
fi

for required in \
  "AGENTS.md" \
  "CONTEXT.md" \
  "HARNESS.md" \
  "HARNESS-TRACEABILITY.md" \
  "HARNESS-BRIDGE-REGISTRY.md"
do
  if rg -q "$required" README.md; then
    pass "README.md links spine owner $required"
  else
    warn "README.md is missing spine owner $required"
  fi
done

if rg -q 'HARNESS-BRIDGE-REGISTRY.md' HARNESS.md HARNESS-TRACEABILITY.md; then
  pass "bridge registry is named from harness docs"
else
  warn "harness docs do not name HARNESS-BRIDGE-REGISTRY.md"
fi

printf 'doc spine report: %s warning(s); report-only exit 0\n' "$warnings"
exit 0
