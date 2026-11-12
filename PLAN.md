# Length Reader: plan

## Product vision

A batting trainer for club and academy cricketers that teaches one skill: **read the length early and move the feet correctly**, in a way that carries over to real nets.

- **The science decides what is practised.** It uses temporal occlusion, a realistic bowler and ball flight, mixed practice, success held near 85%, feedback that fades as you improve, and a real movement paired with every read.
- **The game layer keeps people coming back.** It has a daily session, a career ladder with promotion trials and boss bowlers, XP, badges, a streak and a weekly goal.
- **Only real skill is rewarded:** a correct read made after watching the ball and before it bounces. Guessing and pressing fast earn nothing.
- **Honest about what a screen can't do:** no stereo depth, no real bat or ball, and no fear factor. The "How it works" screen says this plainly.
- **Private by design:** no accounts, ads or tracking. All data stays on the device and can be exported. Camera frames are never stored or uploaded.

First user: Bink (right-handed). Selection nets after 15 Nov 2026 against pace up to about 120 kph and spinners. Left-handers are fully supported.

## Architecture

- **No build step at deploy time.** Plain ES modules served as static files from the repo root by GitHub Pages ("deploy from branch"). Nothing to configure, and nothing can break between building and serving. Vendored libraries are committed already minified.
- **`index.html`** is the app shell. An import map points `three` to `vendor/three/three.module.min.js` (three.js r186).
- **`js/core/`** is pure logic with no DOM, so Node tests import it directly:
  - `physics`: flight, drag, swing, seam and spin, with an exact bounce and a bracketed secant solver.
  - `rules`: grading, shot choice, and guess/late classification.
  - `bowling`: ball generation and bowler and boss data.
  - `levels`: the level ladder and the 85% staircase.
  - `timing`: frame clock, input timestamps and gamepad bracketing.
  - `progress`: XP, badges, streaks and career.
  - `store`: saved data, v4 migration, import/export and compaction.
  - `quality`: adaptive-quality decisions.
  - `check`: the Skill check (standard test): plan, report, trend.
  - `backup`: daily snapshots, damaged-save rescue, restore and tab-merge rules.
- **`css/`**: `app.css` is the design system and every menu screen; `play.css` is the in-play layer (frozen, see DECISIONS U1).
- **`js/engine/`** is three.js:
  - `world`: environment, quality tiers and shadows updated only when casters move.
  - `bowler`: rig and keyframes, with no per-frame allocation.
  - `ballfx`: ball, blob shadow, preallocated trail and Hawk-Eye.
  - `perf`: frame-time overlay.
- **`js/game/`** holds the session runner (state machine) and the mode definitions.
- **`js/ui/`** holds the screens (DOM).
- **Trajectories** are solved in a module Web Worker (`js/traj-worker.js`) during the bowler's run-up, more than 3 s before release. If the worker isn't ready there is a synchronous fallback, which is never needed in practice.
- **Timing:**
  - Every ball event (release, bounce, occlusion) is stamped with the `requestAnimationFrame` timestamp of the first frame that shows it.
  - Inputs carry `event.timeStamp`, or for the controller a `gamepad.timestamp` bracketed between polls.
  - Response time = input stamp − release-frame stamp. Handler delay never enters it.
- **Audio** is synthesised with WebAudio, so there are no sound files. Bounce and footstep sounds are scheduled ahead and corrected for the audio output latency.
- **PWA:**
  - `manifest.webmanifest` + `sw.js`.
  - The core is precached atomically under a content-hash version (stamped by `tools/stamp.mjs` and checked in CI).
  - MediaPipe files are cached the first time the mirror opens.
- **Data:**
  - Saved in `localStorage` under the key `lr5`.
  - v4's `lr_v3` is migrated, and later v4 sessions are merged on every start (deduplicated by date).
  - Exports and imports both v4 and v5 JSON files.
- **Mirror:** `mirror.html` stays a separate page in the same PWA scope. MediaPipe tasks-vision 0.10.14 and the lite pose model are served locally, and it follows the left/right-hand setting.
- **Legacy:** v4 is kept at `legacy/v4.html` as a fallback. `length-reader.html` redirects to the new app, so old bookmarks keep working.

## Roadmap

Status (12 Nov 2026): M1–M3 and v5.2–v5.10 shipped. **v6.0 (finished-product pass) is built on branch `v6-foundation`, not yet pushed.** See "What finished means" and "Next" below, and CHANGELOG.md.


### Milestone 1: "train on it today"

- Engine on three r186.
- Timing fixes:
  - Event and gamepad timestamps.
  - Responses measured against the rAF timestamp of the presented frame.
  - Occlusion drawn by the renderer in the same frame.
- Performance fixes:
  - Instanced trees and merged crease lines.
  - Shadow map redrawn only when the bowler moves, at a size set by the quality tier.
  - Blob shadow for the ball.
  - Preallocated trail, and no per-frame allocations.
  - Trajectories solved in a worker.
  - Pixel ratio adapted between balls.
- Adaptive quality and a frame-time overlay.
- PWA: offline and installable.
- Every v4 mode works: today's session, Quick 30, Endless, short-ball drill, spin drill, match, nets, reaction test, progress, settings.
- Left-handers supported.
- v4 data migrated, and JSON import added.
- Mirror served locally.
- Tests: physics, grading, timing, migration, plus browser smoke and offline tests.

### Milestone 2: the game

- New UI shell (home, career, progress, more).
- First-run onboarding: hand, setup, reaction test, 4-ball tutorial.
- **Daily session**: warm-up (easier, full feedback) → focus block (weakest length fed more, level adapts) → pressure over (nets rules).
- **Career ladder**: Gully → Club → District → State → Zone → India A.
  - Each promotion trial is 2 overs at 80% or more, under nets rules, against a boss bowler with a trademark ball.
  - Beaten bosses become a replayable "Boss nets" mode.
- **XP** only for correct reads made after a real look and before the bounce. **Badges** for real skills. A day **streak** and a **5-day weekly goal**.
- **Faded feedback**: full in the first third of each stage, then errors only. Nets, trials and the pressure over give no feedback until the end.
- "How it works" screen: the evidence, plus what a screen can't do.
- Haptics, more sounds, and menus you can drive with the controller.

### Milestone 3: realism and polish

- Sight screen, better bowler body and action, seam wobble, net sounds, speed gun, sky and lighting.
- Accessibility: text size, high contrast, reduced motion, screen-reader announcements.
- README, a device test checklist, and an updated CLAUDE.md.

## How each milestone ships

1. Run `node tests/run-all.mjs`. This covers physics, rules, timing, game logic and storage, and checks the service-worker stamp.
2. Run `node tests/browser-test.mjs`. Headless Chromium covers boot, migration, a played ball with synthetic timestamped input, offline reload and frame-time sampling.
3. Push the branch, open a PR, and merge to `main` once tests pass. GitHub Pages then serves the new version, and the service worker shows an "update ready" prompt.

## What "finished" means (checklist, kept honest)

Tick only what has been checked on a screen or by a test.

| Area | Done means | State (12 Nov 2026) |
|---|---|---|
| Science | Every claim in the app traces to a checked source; limits stated | ✅ v6.0 |
| Science | The app can show real improvement, separate from practice scores | ✅ Skill check (needs real use to prove useful) |
| Science | Carry-over to real nets is tracked | ❌ next: a 3-tap "real nets diary" on Progress |
| Game layer | Rewards only real reads | ✅ (tests) · Skill check earns nothing |
| Design | One design system on every menu screen | ✅ index.html · ❌ mirror / real / action pages still have their own styles |
| Design | Phone portrait and big monitor both look designed | ✅ menus (screenshots) · in-play unchanged on purpose |
| Design | In-play HUD, result card and tap zones redesigned | ❌ frozen until after the selection (DECISIONS U1) |
| Onboarding | Stranger to first ball in under 2 minutes, device-specific | ✅ |
| Accessibility | WCAG 2.1 AA: contrast, focus, 44 px targets, labels, reduced motion | ◐ contrast, focus, targets and tab state done and tested; no full screen-reader pass yet; canvas charts have labels but no data table for the chart |
| Input | Touch, keyboard, mouse, controller; left- and right-handers | ✅ (unchanged; tests) · controller feel needs Bink's hands |
| Engineering | Offline, installable, private | ✅ |
| Engineering | Saved data can't be lost | ✅ backups, damaged-save rescue, tab merge (tests) |
| Engineering | Frame rate measured on the real devices | ❌ waiting on Bink (S25+, 165 Hz PC) |
| Engineering | Tests for all logic and main flows; CI green | ✅ locally (all Node suites and 142 browser checks) · CI not run: nothing pushed yet |

## Next (in order)

1. Push v6.0 (needs Bink's GitHub sign-in on this PC), watch CI, merge, check the live site and the update prompt.
2. After the selection: redesign the in-play layer (HUD, result card, tap zones, banners) on the new design system, behind a setting first.
3. Real nets diary (carry-over), then bring mirror / real / action pages onto the design system.
4. Screen-reader pass and a data table behind the progress chart.
5. Device results from Bink (frame rates, controller, audio latency).

## Known limits (stated in the app too)

- A flat screen gives no stereo depth. Life-size view gets the ball's size and growth right, but not true depth.
- The app can't see your feet. Make the real step as you press, and use the mirror to check it.
- Controller timing precision depends on how often the browser reads the controller.
- Real-device frame rates (S25+ at 120 Hz, PC at 165 Hz) can only be confirmed on those devices. A checklist is in the README.

## Next ideas (not started)

- PC mirror: the S25+ as a webcam, with pose checks on the big screen (Bink paused this).
- Bowler-specific release cues learned from real footage, if good data can be found.
- Optional 2-player "net bowler" mode on one PC.
