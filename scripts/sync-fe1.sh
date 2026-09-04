#!/usr/bin/env bash
#
# Re-render the "Financial Econometrics I" Quarto book and copy the result into
# FE_1/, which GitHub Pages serves at https://mnismayilli.github.io/FE_1/.
#
# The book's SOURCE lives outside this repo (it carries a large offline data
# cache and a Python environment), so only the rendered HTML is committed here.
# Point FE1_SRC at the source directory if it ever moves:
#
#   FE1_SRC=/path/to/FE_1 npm run sync:fe1
#
# Skip the render and just copy whatever is already in _book/:
#
#   npm run sync:fe1 -- --no-render
#
set -euo pipefail

DEFAULT_SRC="$HOME/Library/CloudStorage/GoogleDrive-ismayilli.mehman@gmail.com/My Drive/Oxford/FE_1"
SRC="${FE1_SRC:-$DEFAULT_SRC}"
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/FE_1"

if [ ! -f "$SRC/_quarto.yml" ]; then
  echo "error: no Quarto project at '$SRC'." >&2
  echo "       Set FE1_SRC to the FE_1 source directory and re-run." >&2
  exit 1
fi

if [ "${1:-}" != "--no-render" ]; then
  echo "Rendering $SRC ..."
  quarto render "$SRC" --to html
fi

if [ ! -f "$SRC/_book/index.html" ]; then
  echo "error: '$SRC/_book/index.html' is missing — nothing to copy." >&2
  exit 1
fi

echo "Copying _book/ -> $DEST"
# --delete keeps the published book an exact mirror, so chapters removed from
# the source stop being served.
rsync -a --delete --exclude='.DS_Store' "$SRC/_book/" "$DEST/"

echo "Done. Commit and push to publish at https://mnismayilli.github.io/FE_1/"
