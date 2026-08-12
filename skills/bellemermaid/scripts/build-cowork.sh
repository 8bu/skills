#!/usr/bin/env bash
# Makes a zip of this skill for Claude Cowork and for claude.ai.
#
# Those sandboxes give no npm access, and they start a new machine for each session.
# So this script puts each dependency into one file under vendor/. The scripts read
# vendor/ before they read node_modules/, so the same source works in each place.
#
# Run it on a machine that has npm and a network. Upload the zip that it writes.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="bellemermaid"
BUILD="${SKILL_DIR}/dist/${NAME}"
ZIP="${SKILL_DIR}/dist/${NAME}-cowork.zip"
ESBUILD="esbuild@0.25.0"
MAID="@probelabs/maid@0.0.29"

command -v npx >/dev/null || { echo "npx is absent. Install Node 20 or later." >&2; exit 1; }

echo "==> Cleaning ${SKILL_DIR}/dist"
rm -rf "${SKILL_DIR}/dist"
mkdir -p "${BUILD}/vendor" "${BUILD}/scripts" "${BUILD}/references"

echo "==> Installing beautiful-mermaid"
npm ci --silent --no-fund --no-audit --prefix "${SKILL_DIR}"

echo "==> Bundling beautiful-mermaid"
npx -y "${ESBUILD}" \
  "${SKILL_DIR}/node_modules/beautiful-mermaid/dist/index.js" \
  --bundle --format=esm --platform=node --minify \
  --outfile="${BUILD}/vendor/beautiful-mermaid.mjs" --log-level=error

echo "==> Bundling maid"
MAID_TMP="$(mktemp -d)"
trap 'rm -rf "${MAID_TMP}"' EXIT
(cd "${MAID_TMP}" && npm init -y >/dev/null && npm i --silent --no-fund --no-audit "${MAID}")
npx -y "${ESBUILD}" \
  "${MAID_TMP}/node_modules/@probelabs/maid/out/cli.js" \
  --bundle --format=cjs --platform=node --minify \
  --outfile="${BUILD}/vendor/maid.cjs" --log-level=error

echo "==> Copying the skill"
cp "${SKILL_DIR}/SKILL.md" "${BUILD}/"
cp "${SKILL_DIR}/scripts/render.mjs" "${SKILL_DIR}/scripts/themes.mjs" "${BUILD}/scripts/"
cp "${SKILL_DIR}/references/"*.md "${BUILD}/references/"

echo "==> Checking the bundles"
node -e "
import('${BUILD}/vendor/beautiful-mermaid.mjs').then(async (m) => {
  const svg = await m.renderMermaid('flowchart LR\n  A[a] --> B[b]', m.THEMES['tokyo-night']);
  if (!svg.startsWith('<svg') || Object.keys(m.THEMES).length !== 15) throw new Error('bad bundle');
  console.log('    beautiful-mermaid: ok, ' + Object.keys(m.THEMES).length + ' themes');
});
"
printf 'flowchart LR\n  A[ok] --> B[fine]\n' > "${MAID_TMP}/probe.mmd"
node "${BUILD}/vendor/maid.cjs" "${MAID_TMP}/probe.mmd" >/dev/null && echo "    maid: ok"

echo "==> Rendering with the build, and with no node_modules"
( cd "${BUILD}" && node scripts/render.mjs -c 'flowchart LR
  A[Cowork] --> B[Works]' -f ascii >/dev/null && echo "    ascii: ok" )
( cd "${BUILD}" && node scripts/render.mjs -c 'flowchart LR
  A[Cowork] --> B[Works]' -o /tmp/${NAME}-build-probe.svg -t dracula --json >/dev/null && echo "    svg: ok" )

echo "==> Writing the zip"
( cd "${SKILL_DIR}/dist" && zip -qr "${ZIP}" "${NAME}" )

echo
echo "Wrote ${ZIP} ($(du -h "${ZIP}" | cut -f1))"
echo "Upload it in Cowork: Customize > Skills > upload."
