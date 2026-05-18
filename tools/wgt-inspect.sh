#!/usr/bin/env bash
# wgt-inspect.sh — Unpack a .wgt and check for secrets before sideload.
# Gate: BUILD-GATE-11 (secret scan), BUILD-GATE-12 (config.xml correctness)
# Usage: ./tools/wgt-inspect.sh <path/to/app.wgt>

set -euo pipefail

WGT="${1:-}"
if [ -z "$WGT" ]; then
  echo "Usage: $0 <path/to/app.wgt>"
  exit 1
fi

if [ ! -f "$WGT" ]; then
  echo "ERROR: file not found: $WGT"
  exit 1
fi

TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

echo "=== wgt-inspect: $WGT ==="
echo "Extracting to: $TMP"
unzip -q "$WGT" -d "$TMP"

FAIL=0
PASS=0

# --- Secret patterns ---
echo ""
echo "--- Credential pattern scan ---"
PATTERNS=(
  "password" "passwd" "api_key" "apikey" "client_secret"
  "x-ui-token" "bearer" "authorization:"
  "/get.php?username=" "/player_api.php" "m3u_plus" "xtream"
  "AZURE_TTS_KEY" "DEEPSEEK_API_KEY" "MINIMAX_API_KEY"
)
GREP_FAIL=0
for pat in "${PATTERNS[@]}"; do
  matches=$(grep -rni "$pat" "$TMP" \
    --include="*.js" --include="*.html" --include="*.xml" --include="*.json" \
    2>/dev/null || true)
  if [ -n "$matches" ]; then
    echo "FAIL: Pattern '$pat' found in bundle:"
    echo "$matches" | head -3
    GREP_FAIL=$((GREP_FAIL+1))
  fi
done
if [ "$GREP_FAIL" -eq 0 ]; then
  echo "PASS: no credential patterns in bundle"
  PASS=$((PASS+1))
else
  FAIL=$((FAIL+1))
fi

# --- config.xml checks ---
echo ""
echo "--- config.xml checks ---"
CONFIG="$TMP/config.xml"
if [ ! -f "$CONFIG" ]; then
  echo "FAIL: config.xml not found in .wgt"
  FAIL=$((FAIL+1))
else
  # required_version must be 6.5
  if grep -q 'required_version="6.5"' "$CONFIG"; then
    echo "PASS: required_version=6.5"
    PASS=$((PASS+1))
  else
    echo "FAIL: required_version is not 6.5"
    FAIL=$((FAIL+1))
  fi

  # package must be exactly 10 chars
  PKG=$(grep -oP 'package="\K[^"]+' "$CONFIG" || true)
  if [ ${#PKG} -eq 10 ]; then
    echo "PASS: package ID length = 10 ($PKG)"
    PASS=$((PASS+1))
  else
    echo "FAIL: package ID '$PKG' length = ${#PKG} (must be 10)"
    FAIL=$((FAIL+1))
  fi

  # access origin must not be *
  if grep -q 'origin="\*"' "$CONFIG"; then
    echo "FAIL: config.xml has <access origin=\"*\"> — must be restricted to hermestv.local"
    FAIL=$((FAIL+1))
  else
    echo "PASS: no wildcard access origin"
    PASS=$((PASS+1))
  fi

  # hermestv.local access must be present
  if grep -q "hermestv.local" "$CONFIG"; then
    echo "PASS: hermestv.local access entry present"
    PASS=$((PASS+1))
  else
    echo "WARNING: no hermestv.local access entry in config.xml"
  fi
fi

# --- index.html CSP check ---
echo ""
echo "--- index.html CSP check ---"
INDEX="$TMP/index.html"
if [ -f "$INDEX" ]; then
  if grep -qi "content-security-policy" "$INDEX"; then
    echo "PASS: CSP meta tag present in index.html"
    PASS=$((PASS+1))
  else
    echo "FAIL: no Content-Security-Policy meta tag in index.html"
    FAIL=$((FAIL+1))
  fi
  if grep -qi "https:" "$INDEX" && ! grep -qi "hermestv.local\|localhost" "$INDEX"; then
    echo "WARNING: index.html may have broad CSP — review manually"
  fi
fi

echo ""
echo "=== Results: $PASS PASS, $FAIL FAIL ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
