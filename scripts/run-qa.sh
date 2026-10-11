#!/usr/bin/env bash
# Ridho Music Web Lab — one-command QA pipeline (FASE 4).
#
# Runs, in order, with REAL exit codes:
#   1. web lint            (bun run lint)
#   2. web unit tests      (vitest, JSON output)
#   3. android unit tests  (gradle :app:testDebugUnitTest --rerun)
#   4. android lint        (gradle :app:lintDebug)
#   5. android build       (gradle :app:assembleDebug)
#   6. fixture sync check  (node scripts/sync-fixtures.mjs --check)
#   7. aggregate           (node scripts/collect-qa.mjs → data/qa-results.json)
#
# The dashboard on / reads data/qa-results.json — it shows ONLY what this
# script actually recorded. Nothing here is mocked.
#
# Usage:  bash scripts/run-qa.sh
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=/tmp/rm-qa
mkdir -p "$TMP"
cd "$ROOT"

export ANDROID_HOME=/home/z/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
GRADLE=/home/z/gradle-8.9/bin/gradle

fail=0

run_suite() { # name env_var_prefix command...
  local prefix="$1"; shift
  local start end ms rc out tailf
  echo "▶ $*"
  start=$(date +%s%3N)
  out=$("$@" 2>&1)
  rc=$?
  end=$(date +%s%3N)
  ms=$((end - start))
  printf '%s' "$out" > "$TMP/${prefix}.log"
  tailf=$(printf '%s' "$out" | tail -25)
  if [ "$rc" -ne 0 ]; then
    echo "  ✗ exit $rc (${ms} ms) — last output:"
    printf '%s\n' "$tailf" | sed 's/^/    /'
    eval "export RM_${prefix}=0"
    eval "export RM_${prefix}_OUT=\"\$(printf '%s' \"\$out\" | tail -60)\""
    fail=1
  else
    echo "  ✓ ok (${ms} ms)"
  fi
  eval "export RM_${prefix}_MS=$ms"
  return 0
}

# 1. web lint
run_suite "WEB_LINT" bun run lint

# 2. web unit tests (JSON reporter for the collector)
echo "▶ web unit tests (vitest)"
vstart=$(date +%s%3N)
if bunx vitest run --reporter=json --outputFile="$TMP/vitest.json" > "$TMP/vitest-console.log" 2>&1; then
  vend=$(date +%s%3N); echo "  ✓ ok ($((vend - vstart)) ms)"
  export RM_VITEST_MS=$((vend - vstart))
else
  vend=$(date +%s%3N)
  echo "  ✗ vitest failed — see $TMP/vitest-console.log"
  tail -20 "$TMP/vitest-console.log" | sed 's/^/    /'
  export RM_VITEST_MS=$((vend - vstart))
  fail=1
fi

# 3–5. android
run_suite "ANDROID_UNIT_TEST" "$GRADLE" --no-daemon -p android :app:testDebugUnitTest --rerun
run_suite "ANDROID_LINT" "$GRADLE" --no-daemon -p android :app:lintDebug
run_suite "ANDROID_BUILD" "$GRADLE" --no-daemon -p android :app:assembleDebug

# 6. fixture sync
run_suite "FIXTURE_SYNC" node scripts/sync-fixtures.mjs --check

# 7. aggregate into data/qa-results.json
echo "▶ collecting results → data/qa-results.json"
node scripts/collect-qa.mjs
collect_rc=$?

echo
if [ "$fail" -ne 0 ] || [ "$collect_rc" -ne 0 ]; then
  echo "run-qa: FINISHED WITH FAILURES (see data/qa-results.json for details)"
  exit 1
fi
echo "run-qa: ALL SUITES GREEN — results recorded in data/qa-results.json"
