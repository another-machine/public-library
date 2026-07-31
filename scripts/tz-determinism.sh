#!/usr/bin/env bash
# Runs the cosmos determinism sweep under a spread of timezones and fails if
# any of them disagree. Includes half-hour and 45-minute offsets, and both
# hemispheres' DST, because those are where naive local-time handling breaks.
set -euo pipefail

cd "$(dirname "$0")/.."
RUNNER="node_modules/.bin/tsx"
SCRIPT="packages/amplib-cosmos/test/determinism.ts"

ZONES=(
  UTC
  America/Chicago
  America/St_Johns
  Europe/Berlin
  Asia/Kolkata
  Asia/Tokyo
  Australia/Lord_Howe
  Pacific/Kiritimati
  Pacific/Chatham
)

expected=""
status=0

for zone in "${ZONES[@]}"; do
  actual="$(TZ="$zone" "$RUNNER" "$SCRIPT")"
  if [ -z "$expected" ]; then
    expected="$actual"
    printf '  %-22s %s (reference)\n' "$zone" "$actual"
  elif [ "$actual" = "$expected" ]; then
    printf '  %-22s %s\n' "$zone" "$actual"
  else
    printf '  %-22s %s  MISMATCH (expected %s)\n' "$zone" "$actual" "$expected"
    status=1
  fi
done

if [ "$status" -eq 0 ]; then
  echo "  all timezones agree"
else
  echo "  timezone determinism FAILED — generate() is reading host local time"
fi

exit "$status"
