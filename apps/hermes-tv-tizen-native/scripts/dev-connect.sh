#!/usr/bin/env bash
# dev-connect.sh — Quick connect to TV for iterative dev
# Usage: ./scripts/dev-connect.sh <TV_IP>
set -euo pipefail
TV_IP="${1:-}"
if [ -z "$TV_IP" ]; then echo "Usage: $0 <TV_IP>"; exit 1; fi
echo "Connecting to $TV_IP:26101..."
sdb connect "$TV_IP":26101
echo "Connected. sdb shell available: sdb -s $TV_IP:26101 shell"
echo "Log stream: sdb -s $TV_IP:26101 dlog HermesTV"
