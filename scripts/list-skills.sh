#!/usr/bin/env bash
# List every skill and its description.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
found=0
for f in "$root"/skills/*/SKILL.md; do
  [ -e "$f" ] || continue
  found=1
  name=$(sed -n 's/^name:[[:space:]]*//p' "$f" | head -1)
  desc=$(sed -n 's/^description:[[:space:]]*//p' "$f" | head -1 | sed -e 's/^"//' -e 's/"$//')
  printf '%-28s %s\n' "$name" "$desc"
done
[ "$found" = 1 ] || echo "No skills yet. Copy templates/SKILL.template.md to skills/<name>/SKILL.md"
