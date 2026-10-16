#!/usr/bin/env bash
# Downloads the free small English Vosk model used for offline speech recognition.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="public/models/vosk-model-small-en-us-0.15.tar.gz"
URL="https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
mkdir -p public/models
if [ -s "$DEST" ]; then echo "Model already present: $DEST"; exit 0; fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "Downloading $URL ..."
curl -sSL --fail --retry 3 -o "$TMP/model.zip" "$URL"
# vosk-browser expects a tar.gz archive, so repack the official zip.
# Some CI images (e.g. Vercel) lack unzip, so fall back to Python's zipfile.
(cd "$TMP" && { unzip -q model.zip 2>/dev/null || python3 -m zipfile -e model.zip .; } \
  && tar -czf model.tar.gz vosk-model-small-en-us-0.15)
mv "$TMP/model.tar.gz" "$DEST"
echo "Saved $DEST ($(du -h "$DEST" | cut -f1))"
