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
# Patterns require an actual credential-shaped value after the key, not just
# a keyword reference. Previously the scanner flagged sanitizer regex
# declarations, comment URL templates, and env-var name references in CI as
# "leaks" — none of those leak real values, but the noise made the gate
# unreliable. The new patterns require a key=<long-secret-shaped-value> or
# a full URL with non-placeholder username/password parameters.
#
# Comments are scanned too. A real secret in a comment is still a leak. A small
# allowlist excludes sanitizer files themselves, which by design contain pattern
# declarations identical to the patterns we hunt for.
echo "Running grep pattern scan..."
PATTERNS=(
  # password=<value> where value is at least 6 non-trivial chars
  'password=[A-Za-z0-9!@#$%^&*+_~.-]{6,}'
  'passwd=[A-Za-z0-9!@#$%^&*+_~.-]{6,}'
  # api keys: typically 20+ chars
  'api_key=[A-Za-z0-9_-]{20,}'
  'apikey=[A-Za-z0-9_-]{20,}'
  'client_secret=[A-Za-z0-9_-]{16,}'
  # bearer/auth tokens — require a credential-shaped suffix
  'Bearer [A-Za-z0-9._-]{20,}'
  'x-api-key:[[:space:]]*[A-Za-z0-9_-]{16,}'
  'x-ui-token:[[:space:]]*[A-Za-z0-9._-]{16,}'
  'Authorization:[[:space:]]*Bearer [A-Za-z0-9._-]{20,}'
  # Xtream URLs only fire when BOTH username AND password parameters carry
  # non-placeholder values (not "${user}" or "<USER>")
  '/get\.php\?username=[A-Za-z0-9][A-Za-z0-9._%+-]{2,}&password=[A-Za-z0-9][A-Za-z0-9._%+-]{5,}'
  '/player_api\.php\?username=[A-Za-z0-9][A-Za-z0-9._%+-]{2,}&password=[A-Za-z0-9][A-Za-z0-9._%+-]{5,}'
  # Service keys with real-looking values
  'AZURE_TTS_KEY=[A-Za-z0-9]{20,}'
  'DEEPSEEK_API_KEY=[A-Za-z0-9]{20,}'
  'MINIMAX_API_KEY=[A-Za-z0-9]{20,}'
)
# Files that legitimately contain pattern declarations (sanitizer code and
# proof tools). These must never carry real values; the allowlist is narrow so
# docs/proof and agent reports are still scanned.
SANITIZER_FILES=(
  'services/hermes-tv-api/src/lib/sanitizeLog.js'
  'services/hermes-tv-api/src/lib/m3uClient.js'
  'services/hermes-tv-api/src/lib/streamResolver.js'
  'tools/test-provider-e2e.js'
  'tools/secret-scan.sh'
  'apps/hermes-web-tv/src/utils/qrParse.js'
)
GREP_FAIL=0
for pat in "${PATTERNS[@]}"; do
  raw=$(grep -rniE "$pat" "$REPO" \
    --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" \
    --include="*.json" --include="*.yaml" --include="*.yml" \
    --include="*.html" --include="*.xml" --include="*.md" --include="*.txt" \
    --exclude-dir=".git" --exclude-dir=".claude" --exclude-dir=".auth" \
    --exclude-dir="node_modules" --exclude-dir="dist" --exclude-dir="report" \
    --exclude-dir="test-results" \
    --exclude="*.example" --exclude="*mock*" --exclude="*.test.*" \
    --exclude="*.spec.*" 2>/dev/null || true)
  # Strip empty + comment-only matches.
  #
  # grep output shape is `<filepath>:<lineno>:<content>`. On Windows the
  # filepath contains a leading drive-letter colon (e.g. `G:/Github/...`),
  # so we anchor on the LAST `:<digits>:` pair using a greedy `^.*:[0-9]+:`
  # match — `.*` is greedy so RLENGTH covers everything through the rightmost
  # line-number separator.
  filtered=$(echo "$raw" | awk '
    /^[[:space:]]*$/ { next }
    {
      line = $0
      if (match(line, /^.*:[0-9]+:/) <= 0) { print; next }
      source = substr(line, 1, RLENGTH)
      gsub(/\\/, "/", source)
      # Scan docs/proof artifacts, but do not fail on long-lived design docs
      # that intentionally contain example env names/placeholder values.
      if (source ~ /\/docs\// && source !~ /\/docs\/proof\//) next
      # Upstream markdown is third-party/reference documentation, not DaveTV
      # source or proof. Source files under upstream remain scanned.
      if (source ~ /\/upstream\// && source ~ /\.md:[0-9]+:$/) next
      content = substr(line, RLENGTH + 1)
      sub(/^[[:space:]]+/, "", content)
      print
    }')
  # Strip allowlisted sanitizer files.
  for f in "${SANITIZER_FILES[@]}"; do
    filtered=$(echo "$filtered" | grep -v -F "$f" || true)
  done
  # Anything left is a candidate real leak.
  filtered=$(echo "$filtered" | sed -E 's/^(.*:[0-9]+:).*/\1[redacted]/' | grep -v '^$' || true)
  if [ -n "$filtered" ]; then
    echo "WARNING: Pattern '$pat' found in non-sanitizer source:"
    echo "$filtered" | head -5
    GREP_FAIL=$((GREP_FAIL+1))
  fi
done
if [ "$GREP_FAIL" -eq 0 ]; then
  echo "PASS: grep patterns — zero credential-shaped matches in source files"
  PASS=$((PASS+1))
else
  echo "FAIL: grep patterns — $GREP_FAIL credential-shaped pattern(s) matched"
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
