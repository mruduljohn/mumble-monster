#!/usr/bin/env bash
# Double-click on macOS: builds the game, serves it locally and opens Chrome in kiosk mode.
cd "$(dirname "$0")" || exit 1
PORT=4173
URL="http://127.0.0.1:$PORT"

[ -d node_modules ] || npm install || exit 1
[ -s public/models/vosk-model-small-en-us-0.15.tar.gz ] || bash scripts/download-model.sh || echo "Offline model not downloaded; continuing without it."
npm run build || exit 1

lsof -ti tcp:$PORT | xargs kill 2>/dev/null
npm run preview &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT

for _ in $(seq 1 30); do curl -sf "$URL" >/dev/null && break; sleep 0.5; done

open -na "Google Chrome" --args --kiosk --app="$URL" --autoplay-policy=no-user-gesture-required \
  --user-data-dir="$HOME/.mumble-monster-chrome" --no-first-run --disable-features=Translate
echo "Game running at $URL. Close this window (or press Ctrl+C) to stop the server."
wait $SERVER
