# Length Reader: project handoff

Claude Code reads this file at the start of every session. It records what is built, how we work, and what comes next.
Keep it up to date when decisions change.

Also read:

- **PLAN.md**: vision, architecture and roadmap.
- **DECISIONS.md**: every major choice and why.
- **README.md**: how to run, test and deploy.

## Who this is for

- **Bink**: right-handed batter, also bowls right-arm medium. 6 ft. Not a coder; deploys personal tools to GitHub Pages.
- Preparing for a **company cricket selection held in nets, after 15 Nov 2026**. No new batting technique after **7 Nov 2026**.
- Selection nets: pace bowlers up to about **120 kph**, plus **spinners**.
- Trigger: a **small forward press** (not back-and-across). Keep it small, weight 50/50, head still.
- Home setup: Samsung **S25+** phone; **27-inch PC monitor at 165 Hz** (it can rotate to vertical); **Xbox controller**; room 20 × 10 × 10 ft.
- Main batting problems: reads length late (goes forward to short balls), head falls to the off side, poor leaving outside off.
- The app also serves other club and academy batters, left-handers included.

## How to work with Bink

- **Short replies.** Long texts make him put things off. Use tables and short bullets, and plain cricket language.
- **Rebuild mode (from 26 Oct 2026): Claude owns the product.** Bink gave full autonomy over architecture, features, art and roadmap.
  - Make the call, build it, then record it in DECISIONS.md. Don't wait for "go".
  - Still tell him in one short message what changed and what to test.
  - Bug fixes he reports: fix straight away.
- Training plans: give only **today's or tomorrow's** plan, never long-term plans.
- **Test before shipping:**
  - `node tests/run-all.mjs` and `node tests/browser-test.mjs`.
  - Then `node tools/stamp.mjs` (a test fails if you forget).
  - Say what was tested and what couldn't be (real-device FPS).
- **Never leave the live site broken.** Work on a branch and merge to `main` only when the tests pass. `main` is live on GitHub Pages.
- Be honest when the app is wrong or a request won't help his cricket.

## Where things are

- **Live app:** https://binayak-sahu.github.io/Length-Reader-Project/
  - `index.html`: v5.
  - `length-reader.html`: redirects to v5.
  - `legacy/v4.html`: the old version.
  - `mirror.html`: the phone mirror.
- **Code map:** see README → Files.
  - Pure logic in `js/core/` is tested in Node.
  - three.js code is in `js/engine/`.
  - The session runner is `js/game/game.js`.
  - Mode plans are in `js/game/modes.js`.
- **No build step.** ES modules plus an import map. Vendored libraries are in `vendor/` and are re-created by `tools/vendor.sh`.
- **Saved data:** `localStorage` key `lr5`.
  - Sync (v5.3): `js/core/sync.js` (merge, tested in Node) and `js/sync-github.js` (gist client; token in key `lr5-sync`). More → Sync phone + PC.
  - v4's `lr_v3` is migrated, and later v4 sessions are merged on each start.
  - Import and export accept both v4 and v5 files.

## How it works (v5)

**Physics** (`js/core/physics.js`): same model and constants as v4.

- **Flight:** 1 ms steps; gravity; drag `KD=0.0055` (120 kph arrives at ≈100 kph); bounce `E_V=0.5`, `E_H=0.92`.
- **Movement:** late swing in the second half of the flight, drift, and seam or spin off the pitch.
- **New in v5:**
  - The bounce and the crossings are interpolated within each step, so the solver is exact.
  - The solver is a bracketed secant, needing about 13 flights per ball (v4's bisection used about 150).
  - It runs in a Web Worker during the run-up.
- **Zones:**
  - 80 kph: forward under 4.8 m, back from 6.3 m.
  - 140 kph: 6.0 / 8.0 m.
  - Spin: 4.8 / 6.0 m.
  - Linear in between.

**Grading** (`js/core/rules.js`): as v4 (Full = forward, Good = either, Short = back; Bouncer: `yC ≥ 1.30`; Wide off: `lxArr > 0.30`; Full toss: `d < 0`), plus:

- **Late:** after the bounce *as presented on screen* + 0.03 s, but never sooner than the guess line + 0.15 s (v5.4.1: at pace the old rules left no window). Scores half.
- **Guess:** a correct answer given sooner than (reaction time + 0.05 s) after release; reaction time clamped to 0.18–0.30 s. From v5.5 the line is personal: learned from the last 60 balls (earliest press time with ≥85% right feet, needs 40 balls, floor 0.12 s; `js/core/readline.js`). Scores half, earns no XP.
- **Level 2+:** play or leave. You must play anything hitting (`|lx| ≤ 0.13` and `yA ≤ 0.78`).
- **Level 4 shot menu:** front defence, straight drive, flick, back defence, back-foot punch, pull, leave.

**Timing** (`js/core/timing.js`):

- Ball events (release, bounce, occlusion) are stamped with the rAF timestamp of the first frame that shows them.
- Presses use `event.timeStamp`. Controller presses use `gamepad.timestamp`, bracketed by poll times.
- Response = press stamp − release-frame stamp.
- The blackout is drawn by the renderer itself.
- Bounce and footstep sounds are scheduled with audio-latency correction.

**Levels** (`js/core/levels.js`):

- The same 28 steps:
  - L1 Feet: 80 → 120 kph, then blackout +250, +160, +100 and 0 ms after release.
  - L2 Play/leave: the same 9 steps.
  - L3 Variety: 100, 110, 120 kph, then 120 with blackout +250 and +160 ms.
  - L4 Shot choice: the same 5 steps as L3.
- **The rule changed:** a weighted staircase aiming at 85% (`d += 0.5 × (score − 0.85)`).
  - It moves up a step at d ≥ 1 and down at d < 0, restarting at 0.5.
  - It holds success near 84%; v4's 8-ball rule held about 66%.
- Drills, nets, matches, trials, warm-ups and pressure overs don't change the level.

**Modes** (`js/game/modes.js`):

- Each mode is a plan made of segments.
- **Classic 50**, **Quick 30**, **Endless**.
- **Daily session:** warm-up 8 (one step easier) → focus 20 (weak spot fed 50%) → pressure over 6 (nets rules).
- **Drills:** short-ball and spin.
- **Match:** 3 overs, 3 wickets.
- **Nets:** 24 balls, bowlers take turns, no feedback, real gap between balls.
- **Sandbox (v5.4):** pick every ball (bowler, pace, length, line, blackout, task; each with Random). Endless; C / View / Pause → Change balls mid-session. Saved as `sandbox`, never counts (level, XP, streak, badges). `js/core/sandbox.js`, `genBall({force})`.
- **Reaction test:** median of 8 presses; it uses the same frame-stamped pipeline as the game.

**Feedback:**

- "Auto" fades: a full card + Hawk-Eye in the first third of each stage; after that, only errors and late answers get the card. Settings offer "Always" and "End only".

**Performance:**

- Instanced trees, poles and stumps, and merged crease lines: about 22 draw calls.
- The shadow map is redrawn only when the bowler moves. The ball has a blob shadow.
- The trail is preallocated. Nothing is allocated per frame.
- Adaptive quality tiers (pixel ratio and shadows) change only between balls.
- Frame-time overlay: F2, backtick, or Settings.

**Scene (M3):** sky dome, sight screen (Settings → Ball / Sight screen), footmarks, speed gun after each ball, and seam wobble (cosmetic). None of these carries length information.

**True life-size (v5.2):** Settings → Calibrate my setup (also offered in onboarding).

- **How it works:** off-axis camera from the measured screen size, eye distance, eye height and screen bottom edge (`js/core/calib.js`). It is used in every mode once saved, one calibration per orientation.
- **Bink's setup (27" upright, 59.8 × 33.6 cm):**
  - Eyes 130 cm from the screen, eye height 150 cm.
  - Screen bottom edge at **100 cm** (top at 160 cm).
  - Gives a 25.3° vertical view, a 12.0 cm tall bowler, the eye line 9.8 cm below the top, and the release 5.2 cm above it.
- **Limit:** full balls bounce below the screen at true size (the ground is visible from about 3.9 m).

**Controls (v5.3, side-on):**

- Controller: X = front foot, B = back foot (Y/A aliases). LT = trigger, RT = leave.
- Left stick plays: L2–3 any push = play. L4 foot first, then the stick: front ← drive, ↓ flick, ↑ defence; back ↑ punch, ↓ pull, → defence. Mirrored for left-handers. No push = defence. LB flick, RB pull still work.
- USB foot pedals can be mapped in Settings.

**Left-handers:** the batter frame and the camera are mirrored. The bowler stays right-arm. Off-spin turns away from left-handers.

## Decisions already made (don't reopen without new evidence; log changes in DECISIONS.md)

- No live tracking of real balls with the phone camera. It would be unreliable before the selection.
- The pose checks leave out **toe angle and base width**, because one camera can't judge them reliably.
- No pad or bat drawn in view (it would be fake at real eye height). No voice commands.
- Bouncers only appear at pace: physics only gets a ball head-high above about 110 kph.
- Nets realism: bowlers rotate each ball, club-level accuracy, no per-ball feedback, real time between balls.
- The hand cue is halved (±5° plus ±3° noise). See DECISIONS S5.
- Privacy: on-device by default. Optional sync to the player's own GitHub (secret gist, token per device; DECISIONS P1). No accounts of ours, ads or tracking.

## Bink's numbers (26 Oct 2026, from v4)

| Measure | Result |
|---|---|
| Reaction (button) | 262 ms |
| Nets session (L1, 80 kph) | 79%: full and good 100%, spin 88%, short 55% |
| Short-ball drill | 67%: short 47%, went forward 9 times |
| Reading time | About 0.13 s, too early. Target is about 0.2–0.25 s, still before the bounce. |

## Status

- **M1 shipped (26 Oct 2026):** v5 engine, timing fixes, performance fixes, PWA, migration, all v4 modes, Daily session, left-handers, local mirror.
- **M2 shipped (26 Oct 2026):** the game layer.
  - New 4-tab shell (Play, Career, Progress, More).
  - Onboarding and tutorial.
  - Career ladder with 5 boss trials (`js/core/career.js`).
  - 17 skill badges (`js/core/badges.js`).
  - Day streak and 5-day weekly goal.
  - How it works page with sources and honest limits.
  - Controller and keyboard menu navigation.
  - Display font; text size, high contrast and reduced motion settings.
- **M3 shipped (26 Oct 2026):** realism polish.
  - Gradient sky, sight screen (white for a red ball, black for a white ball), footmarks.
  - Seam wobble, speed gun after each ball.
  - Better bowler body (rig unchanged, physics identical).
  - Docs, plus the device test checklist in the README.
- **v5.2 shipped (27 Oct 2026):** true life-size calibration, darker worn pitch + tone mapping, night mode, dark sight screen, length marks, release heights fixed, portrait card, pedals, LT/RT.
- **v5.3 shipped (28 Oct 2026):** side-on controller (X front, B back, stick shots), sync phone + PC via his own GitHub gist, Progress table no longer hidden under the tab bar.
- **v5.4 shipped (29 Oct 2026):** Sandbox mode. **v5.4.1:** timing fix ("too quick" at pace). **v5.5:** personal too-quick line from his own results.
- **Waiting on Bink:** results from the S25+ and 165 Hz PC checklist (README → "Test it on your devices"). Real-device FPS hasn't been measured yet.
- **Next ideas:** see PLAN.md (the PC webcam mirror is still paused).
- **Later (Bink paused it):** a PC mirror using the S25+ as a webcam, with pose checks on the big screen.
