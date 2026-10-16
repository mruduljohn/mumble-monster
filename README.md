# MUMBLE MONSTER

A loud, colorful booth game presented by **IEEE ProComm - TEMS Joint Chapter, Kerala Section**. Read battle lines aloud, loudly and clearly, to defeat The Mumbler.
Runs locally in Chrome. No backend, no API keys, all free/open-source.

## Setup

```bash
npm install
npm run download-model   # optional but recommended: offline Vosk speech model (~40 MB)
npm run dev              # http://127.0.0.1:5173
npm test                 # unit tests for scoring
```

`scripts/download-model.sh` fetches `vosk-model-small-en-us-0.15` from alphacephei.com into
`public/models/vosk-model-small-en-us-0.15.tar.gz`. If the download fails the game still works
(Web Speech, then volume-only mode).

## Running at the booth

```bash
npm run build && npm run preview     # http://127.0.0.1:4173
```

Or double-click `start-booth.command` (macOS). It installs/builds if needed, serves the game and opens Chrome in kiosk mode.
Manual kiosk launch:

```bash
open -na "Google Chrome" --args --kiosk --app=http://127.0.0.1:4173 --user-data-dir="$HOME/.mumble-monster-chrome"
```

Allow the microphone when Chrome asks (localhost permission is remembered per profile).

## Speech engines (automatic fallback)

1. **Web Speech API** (Chrome, needs internet). Best accuracy.
2. **Vosk offline** (`vosk-browser`, small English model). Loaded lazily; used automatically if Web Speech fails
   or the machine is offline. Loading takes a few seconds the first time.
3. **Volume-only**: clarity is estimated from how long and steadily the player speaks. UI still fully works.

Loudness always comes from a Web Audio AnalyserNode relative to the noise floor measured during calibration.
Audio is never recorded or stored.

## Tips

- In a loud room use a headset or earphone mic held near the mouth, and recalibrate in the admin panel.
- The game ducks its own music while the player speaks so it does not leak into the mic. Keep speaker volume moderate.
- Mic denied: click the lock icon in the address bar, allow the microphone, press TRY AGAIN.

## Shortcuts

| Key | Action |
| --- | --- |
| Space / Enter | Start (title screen) |
| F | Fullscreen |
| Ctrl+Shift+A | Admin panel: sensitivity, recalibrate, engine (auto/web/vosk/volume), language, wave timer, mute, reset leaderboard, engine/online status |

Settings and the top-10 leaderboard (nickname, score, date only) are stored in the browser's localStorage.

## Editing content

- `src/content/phrases.ts`: battle lines by category, plus tongue-twister `FINALE_PHRASES`.
- `src/content/facts.ts`: "Did you know?" facts. `src/content/taunts.ts`: monster taunts and callouts.
- `src/game/scoring.ts`: thresholds (loudness/clarity cut-offs, damage, monster HP).

## Layout

`src/components` UI screens, `src/engine` speech engines + fallback manager, `src/game` scoring/settings/leaderboard,
`src/audio` mic input and procedural sound, `src/content` editable text.

## Credits

Presented by **IEEE ProComm - TEMS Joint Chapter, Kerala Section**.
