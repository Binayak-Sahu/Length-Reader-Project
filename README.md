# Length Reader

A cricket batting trainer that teaches one skill: **read the length early and move your feet**.

- Realistic bowlers, real pace and flight.
- Blackout training, an 85% difficulty staircase, and a career ladder with boss bowlers.
- XP only for correct, on-time reads.
- Works offline and installs like an app.
- Phone (touch), or PC with keyboard, mouse or Xbox controller.
- Left- and right-handed batters.

**Live:** https://binayak-sahu.github.io/Length-Reader-Project/

## Install on your phone or PC

1. Open the live link in Chrome (Android or PC) or Edge.
2. Install it:
   - **Android:** menu ⋮ → *Install app* (or *Add to Home screen*).
   - **PC:** the install icon in the address bar, or **More → Install app**.
3. Open it once while online. After that it works with no internet. The batting mirror also works offline after you've opened it once.

Your old bookmark (`…/length-reader.html`) opens the new app. The old v4 is kept at `…/legacy/v4.html`.

## Your data

- Everything is saved in this browser, on this web address only. There are no accounts, ads or tracking.
- Your **v4 data on the same address** came across automatically: sessions, level, reaction time and settings. If you use v4 again, its new sessions are merged too.
- Data from another address, like the old claude.ai copy, can't be read from here. Open that copy, tap **Export data**, then use **More → Settings → Import data** here. Both v4 and v5 files work.
- Back up any time with **More → Export data**.
- The mirror's camera images stay in memory for the slow-mo replay. They are never saved or uploaded.

## Test it on your devices (5 minutes)

**Samsung S25+**

1. Settings → Display → Motion smoothness → **High** (120 Hz).
2. Open the app and install it.
3. More → Settings → turn on **Frame-time overlay**.
4. Play Quick 30. The overlay should show **120 Hz** with dropped frames under 1%. If it drops more, the app steps quality down between balls by itself. Tell me what tier it settles on.
5. Turn on aeroplane mode, close the app and open it again. It should start, and you should be able to bowl.
6. Open the mirror from the home screen icon (long-press → Mirror). Check that it still works offline.

**PC, 165 Hz monitor**

1. Plug in the Xbox controller and press a button.
2. On Play, use the D-pad to move, A to choose, and LB/RB to switch tabs.
3. Press F2: the overlay should show **165 Hz** with a frame time of about 6 ms and no drops.
4. Settings → View → **Life-size**, with your screen height and distance.
5. Do the reaction test with the controller. Expect roughly the 262 ms you got in v4. It may differ slightly, because timing is now more accurate.

**Things I couldn't check here (headless Chromium uses software graphics):**

- Real frame rates on the S25+ and on the 165 Hz PC.
- Controller rumble.
- Phone vibration.
- Audio latency correction on Android.
- How the life-size view feels.

## Run it locally

You need Node.js 18 or newer. There's nothing to install for the app itself.

```sh
node tools/serve.mjs          # → http://localhost:8080/
```

## Tests

```sh
node tests/run-all.mjs        # physics, grading, timing, game logic, career, badges, saved data, offline-file stamp
node tests/browser-test.mjs   # headless Chromium (see below for what it checks)
```

The browser test checks:

- boot and v4 migration
- input timing against the release frame
- blackout frames
- nets and daily session
- onboarding and trials
- offline reload

It needs Playwright and Chromium:

```sh
npm i -g playwright
npx playwright install chromium
```

CI runs both test suites on every push and PR (`.github/workflows/ci.yml`).

## Build and deploy

- **There is no build step.** The app is plain ES modules plus an import map, served exactly as they are in the repo.
- **Deploy = merge to `main`.** GitHub Pages ("Deploy from a branch: main / root") serves the repo.
- **After changing any app file**, run `node tools/stamp.mjs`.
  - It updates the offline file list and version in `sw.js` and the preload list in `index.html`.
  - A test fails if you forget.
  - Players then get an "Update ready" prompt.
- **Library upgrades:** run `sh tools/vendor.sh` to re-create `vendor/` (three.js r186, MediaPipe tasks-vision 0.10.14 and the pose model), then stamp.

## Files

| Path | What |
|---|---|
| `index.html`, `css/app.css`, `fonts/` | App shell, styles, display font (Barlow Condensed, SIL OFL) |
| `js/core/` | Pure logic, tested in Node: `physics`, `rules` (grading), `bowling`, `levels` (85% staircase), `timing`, `progress` (XP, streaks), `badges`, `career` (ladder, bosses), `store` (saving, migration), `quality`, `action` (bowler keyframes) |
| `js/engine/` | three.js: `world` (scene, ball, Hawk-Eye, sight screen), `bowler`, `perf` (frame-time overlay) |
| `js/game/` | Session runner (`game.js`) and mode plans (`modes.js`) |
| `js/ui/` | Menus and tabs (`menus.js`), screens (`screens.js`), in-session UI (`session-ui.js`) |
| `js/traj-worker.js` | Trajectory solver worker |
| `mirror.html` | Phone batting mirror (MediaPipe pose, local files) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline + install |
| `vendor/` | Vendored libraries (see `vendor/VERSIONS.txt`) |
| `legacy/v4.html` | The previous version, kept as a fallback |
| `PLAN.md`, `DECISIONS.md`, `CLAUDE.md` | Plan, decision log, project handoff |

## Debug

- **Frame-time overlay:** press F2 or the backtick key, or turn it on in Settings, or open with `?debug`. It shows refresh rate, frame times, dropped frames, CPU and GPU time where available, resolution and draw calls.
- **URL options:**
  - `?tier=min|low|medium|high|ultra` starts at a quality tier.
  - `?nosw` skips the service worker.
