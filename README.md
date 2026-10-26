# Length Reader

A cricket batting trainer that teaches you to **read the length early and move your feet**. It works offline, installs like an app, and runs on a phone (touch), or on a PC with keyboard, mouse or Xbox controller.

**Live:** https://binayak-sahu.github.io/Length-Reader-Project/

## Install on your phone or PC

1. Open the live link in Chrome (Android or PC) or Edge.
2. Install it:
   - **Android:** menu ⋮ → *Install app* (or *Add to Home screen*).
   - **PC:** the install icon in the address bar, or the **Install app** button on the home screen.
3. Open it once while online. After that it works with no internet. The batting mirror also works offline after you've opened it once.

Your old bookmark (`…/length-reader.html`) opens the new app. The old v4 is still at `…/legacy/v4.html`.

## Your data

- Everything is saved in this browser, on this web address only. There are no accounts, ads or tracking.
- Your data from **v4 on the same address** is carried over automatically the first time you open v5.
- Data from another address, like the old claude.ai copy, can't be read from here. Open that copy, tap **Export data**, then use **Settings → Import data** here. Both v4 and v5 files work.
- Export a backup any time from Settings.
- The mirror's camera images stay in memory for the slow-mo replay. They are never saved or uploaded.

## Run it locally

You need Node.js 18 or newer. There's nothing to install for the app itself.

```sh
node tools/serve.mjs          # → http://localhost:8080/
```

## Tests

```sh
node tests/run-all.mjs        # physics, grading, timing, game logic, saved data, offline-file stamp (no browser)
node tests/browser-test.mjs   # headless Chromium: boot, v4 migration, input timing, blackout, nets, offline reload
```

The browser test needs Playwright and Chromium:

```sh
npm i -g playwright
npx playwright install chromium
```

CI runs both test suites on every push (`.github/workflows/ci.yml`).

## Build and deploy

- **There is no build step.** The app is plain ES modules served exactly as they are in the repo.
- **Deploy = merge to `main`.** GitHub Pages ("Deploy from a branch: main / root") serves the repo.
- **After changing any app file**, run `node tools/stamp.mjs`.
  - It updates the offline file list and version in `sw.js` and the preload list in `index.html`.
  - A test fails if you forget.
  - Players then get an "Update ready" prompt.
- **Library upgrades:** run `sh tools/vendor.sh` to re-create `vendor/` (three.js and MediaPipe), then stamp.

## Files

| Path | What |
|---|---|
| `index.html`, `css/app.css` | App shell and styles |
| `js/core/` | Pure logic, tested in Node: `physics`, `rules` (grading), `bowling`, `levels`, `timing`, `progress` (XP, badges, streaks), `store` (saving, migration), `quality`, `action` (bowler keyframes) |
| `js/engine/` | three.js: `world` (scene, ball, Hawk-Eye), `bowler`, `perf` (frame-time overlay) |
| `js/game/` | Session runner (`game.js`) and mode plans (`modes.js`) |
| `js/ui/` | Screens |
| `js/traj-worker.js` | Trajectory solver worker |
| `mirror.html` | Phone batting mirror (MediaPipe pose, local files) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline + install |
| `vendor/` | three.js r186, MediaPipe tasks-vision 0.10.14 and the pose model (see `vendor/VERSIONS.txt`) |
| `legacy/v4.html` | The previous version, kept as a fallback |
| `PLAN.md`, `DECISIONS.md`, `CLAUDE.md` | Plan, decision log, project handoff |

## Debug

- **Frame-time overlay:** press F2 or the backtick key, or turn it on in Settings, or open with `?debug`. It shows refresh rate, frame times, dropped frames, CPU and GPU time where available, resolution and draw calls.
- **URL options:**
  - `?tier=low|medium|high|ultra` starts at a quality tier.
  - `?nosw` skips the service worker.
