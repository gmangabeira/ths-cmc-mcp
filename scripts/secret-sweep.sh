#!/usr/bin/env bash
# Fails if the CMC API key value appears anywhere in the repo or demo files.
# Prints only file names and counts. Never prints the key.
set -u
KEY="${CMC_API_KEY:-}"
if [ -z "$KEY" ]; then echo "set CMC_API_KEY to run the sweep"; exit 2; fi
cd "$(dirname "$0")/.."
hits=0
while IFS= read -r f; do
  if grep -aqF -- "$KEY" "$f" 2>/dev/null; then echo "KEY FOUND IN: $f"; hits=$((hits+1)); fi
done < <(find . -type f -not -path "./node_modules/*" -not -path "./.git/*" -not -name ".env")
# Also scan the git history
if git rev-parse --git-dir >/dev/null 2>&1 && [ -n "$(git rev-list --all 2>/dev/null | head -1)" ]; then
  if git log --all -p 2>/dev/null | grep -aqF -- "$KEY"; then echo "KEY FOUND IN GIT HISTORY"; hits=$((hits+1)); fi
fi
# Generic key-shaped strings next to a key-like name
if grep -rnEI "(X-CMC_PRO_API_KEY|CMC_API_KEY)['\"]?\s*[:=]\s*['\"]?[0-9a-f]{8}-[0-9a-f]{4}-" . --exclude-dir=node_modules --exclude-dir=.git --exclude=.env >/dev/null 2>&1; then
  echo "KEY-SHAPED VALUE FOUND"; hits=$((hits+1))
fi
if [ "$hits" -eq 0 ]; then echo "SWEEP CLEAN (0 hits)"; else echo "SWEEP FAILED ($hits hit(s))"; exit 1; fi
