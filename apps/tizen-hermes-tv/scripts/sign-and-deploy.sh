#!/usr/bin/env bash
# sign-and-deploy.sh — Sign and deploy hermes-tv.wgt to a Tizen TV
# Usage: ./scripts/sign-and-deploy.sh <TV_IP> [<CERT_PROFILE>]
# Prerequisites: Tizen Studio CLI (tizen command) in PATH, sdb in PATH
# Certificates: stored in .tizen/ (git-ignored). NEVER commit .authkey or .p12 files.

set -euo pipefail

TV_IP="${1:-}"
CERT_PROFILE="${2:-HermesTV}"
WGT="hermes-tv.wgt"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "$TV_IP" ]; then
  echo "Usage: $0 <TV_IP> [<CERT_PROFILE>]"
  exit 1
fi

if [ ! -f "$ROOT/$WGT" ]; then
  echo "ERROR: $WGT not found. Run: npm run package"
  exit 1
fi

cd "$ROOT"

echo "=== HermesTV Tizen Deploy ==="
echo "Target TV: $TV_IP"
echo "Cert profile: $CERT_PROFILE"
echo "Package: $WGT"
echo ""

# Step 1: Sign the .wgt
echo "[1/4] Signing package..."
tizen package -t wgt -s "$CERT_PROFILE" -- "$WGT"

# Step 2: Connect to TV via SDB
echo "[2/4] Connecting to TV..."
sdb connect "$TV_IP":26101
sleep 2

# Step 3: Install
echo "[3/4] Installing to TV..."
tizen install -n "$WGT" -- "$TV_IP":26101

# Step 4: Verify via sdb
echo "[4/4] Verifying install..."
sdb -s "$TV_IP":26101 shell "wrt-launcher -l" | grep -i hermes || echo "WARNING: hermes app not found in launcher list"

echo ""
echo "=== Deploy complete ==="
echo "If the app does not appear: Settings > Support > About Smart TV > Remote Management (enter 12345) to enable Developer Mode"
