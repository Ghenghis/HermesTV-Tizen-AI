#!/usr/bin/env bash
# secret-scan.sh — Run trufflehog and gitleaks against the repo.
# Gate: SECURITY-GATE-00A, VPS-GATE-13
# Usage: ./tools/secret-scan.sh [repo-path]
# Expected result: zero verified secrets.

set -euo pipefail

REPO="${1:-$(git rev-parse --show-toplevel)}"
PASS=0
FAIL=0

echo "=== HermesTV secret scan ==="
echo "Repo: $REPO"
echo ""

# --- trufflehog ---
if command -v trufflehog &>/dev/null; then
  echo "Running trufflehog..."
  if trufflehog filesystem "$REPO" --only-verified --no-update 2>&1 | grep -q "Found verified"; then
    echo "FAIL: trufflehog found verified secrets"
    FAIL=$((FAIL+1))
  else
    echo "PASS: trufflehog — zero verified secrets"
    PASS=$((PASS+1))
  fi
else
  echo "SKIP: trufflehog not installed (install: pip install trufflehog3)"
fi

# --- gitleaks ---
if command -v gitleaks &>/dev/null; then
  echo "Running gitleaks..."
  if gitleaks detect --source "$REPO" --no-git -q 2>&1 | grep -q "leaks found"; then
    echo "FAIL: gitleaks found leaks"
    FAIL=$((FAIL+1))
  else
    echo "PASS: gitleaks — zero leaks"
    PASS=$((PASS+1))
  fi
else
  echo "SKIP: gitleaks not installed (install: https://github.com/gitleaks/gitleaks)"
fi

# --- grep pattern scan (always runs) ---
echo "Running grep pattern scan..."
PATTERNS=(
  "password=" "passwd=" "api_key=" "apikey=" "client_secret="
  "x-ui-token" "bearer " "Authorization:" "x-api-key:"
  "/get.php?username=" "/player_api.php" "m3u_plus" "xtream"
  "AZURE_TTS_KEY=" "DEEPSEEK_API_KEY=" "MINIMAX_API_KEY="
)
GREP_FAIL=0
for pat in "${PATTERNS[@]}"; do
  matches=$(grep -rni "$pat" "$REPO" \
    --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" \
    --include="*.json" --include="*.yaml" --include="*.yml" \
    --include="*.html" --include="*.xml" \
    --exclude-dir=".git" --exclude-dir="node_modules" \
    --exclude="*.example" --exclude="*mock*" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    echo "WARNING: Pattern '$pat' found:"
    echo "$matches" | head -5
    GREP_FAIL=$((GREP_FAIL+1))
  fi
done
if [ "$GREP_FAIL" -eq 0 ]; then
  echo "PASS: grep patterns — zero matches in source files"
  PASS=$((PASS+1))
else
  echo "FAIL: grep patterns — $GREP_FAIL pattern(s) matched"
  FAIL=$((FAIL+1))
fi

# --- .env files check ---
echo "Checking for committed .env files..."
ENV_FILES=$(git -C "$REPO" ls-files | grep -E "\.(env|authkey|pem|p12|pfx)$" || true)
if [ -n "$ENV_FILES" ]; then
  echo "FAIL: committed secret-extension files found:"
  echo "$ENV_FILES"
  FAIL=$((FAIL+1))
else
  echo "PASS: no committed .env/.authkey/.pem files"
  PASS=$((PASS+1))
fi

echo ""
echo "=== Results: $PASS PASS, $FAIL FAIL ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
