# Decisions

Each entry gives the choice made, why, and the date. Newest entries are at the bottom of each section.
Decisions in CLAUDE.md are still in force unless an entry here changes them.

## Platform and architecture (26 Oct 2026)

| # | Decision | Why |
|---|---|---|
| A1 | **No build step at deploy.** Plain ES modules plus an import map, served from the repo root by GitHub Pages "deploy from branch". | Bink can't run commands. With no build there is nothing to configure in Pages settings and no gap between what's tested and what's served. Libraries are vendored already minified, with the exact command in `tools/`. |
| A2 | **three.js r186** (0.186.1), vendored at `vendor/three/` as one minified ES module bundle. | r128 is 4+ years old. The new version has modern colour management and the current WebGL renderer. Vendoring means no CDN at runtime. |
| A3 | **MediaPipe tasks-vision stays on 0.10.14**, now vendored (SIMD and non-SIMD wasm, plus the lite pose model). | It's the version the mirror was built and tested with. 1.x is newer but not worth the risk before selection. |
| A4 | **Trajectories are solved in a module Web Worker** while the bowler runs in (≥3 s before release), with a synchronous fallback. | Moves the ~1–5 ms solve off the frame loop entirely. |
| A5 | **Exact-bounce integrator plus a bracketed secant (Illinois) solver** replaces the 36-step bisection. | The landing point is now continuous in launch angle, so the solver converges in about 6–10 flights instead of about 150. Same physics constants as v4, so results match within a few mm. |
| A6 | **Service worker:** the core is precached under a content-hash version stamped by `tools/stamp.mjs`. A CI test fails if the stamp is stale. MediaPipe is cached on first use in a separate cache. | Updates are atomic: old and new modules can never mix. A forgotten version bump can't strand users on old files. The ~15 MB mirror download only happens for people who use the mirror. |
| A7 | **The new app lives at `/` (`index.html`).** `length-reader.html` redirects there, and v4 is kept at `legacy/v4.html`. | Old bookmarks and home-screen icons keep working, and there is a known-good fallback. |
| A8 | **Data is saved under the `lr5` key.** v4's `lr_v3` is left untouched and re-merged on each start (deduplicated by session date). | If Bink falls back to v4 for a session, nothing is lost. |
| A9 | **Mirror stays a separate page** (`mirror.html`) inside the same PWA scope. | It needs the camera and a different screen layout. Folding it into the 3D app would add risk and gain nothing. |

## Timing (26 Oct 2026)

| # | Decision | Why |
|---|---|---|
| T1 | The clock for every ball event is the **rAF timestamp of the first frame that shows it** (release, bounce, occlusion). | This is the closest the web gives to "when it was presented". Display latency is the same for every frame, and it cancels out of reading time because the reaction test uses the same pipeline. |
| T2 | Touch, mouse and keyboard use **`event.timeStamp`**, never handler time. Raw stamps are stored and resolved at the end of the ball. | The handler can run before or after the release frame's rAF. Late resolution makes the order irrelevant. |
| T3 | Controller presses use **`gamepad.timestamp` bracketed by the previous and current poll times**. If the stamp falls outside the bracket (stale, or a different time base), the midpoint is used. | Some browsers don't update the stamp. The bracket bounds the error to one poll interval in the worst case. |
| T4 | **Occlusion is drawn by the renderer** (the frame is cleared to black), not by a DOM overlay. The actual occlusion time is recorded with each ball. | The blackout is exactly frame-aligned and auditable. |
| T5 | Bounce and footstep sounds are **scheduled ahead and corrected for `outputLatency` and `baseLatency`**. | Android audio can lag 40–100 ms. A late thud would be a misleading timing cue. |
| T6 | **Quality never changes during a delivery.** Pixel ratio and shadow tier change only between balls. | Resizing the drawing buffer causes a hitch, and that must never happen while the ball is in the air. |

## Training science (26 Oct 2026)

| # | Decision | Why |
|---|---|---|
| S1 | **Level rule changed:** the "last 8 ≥ 80% up / ≤ 50% down" rule is replaced by a **weighted up/down staircase** aiming at 85%: `d += 0.5 × (score − 0.85)`. You move up a step at d ≥ 1 and down at d < 0, restarting at 0.5. The same 28 steps are kept, in the same order. | Simulation (in `tests/game-test.mjs`) shows the v4 rule settles near **66%** success, below the 80–85% target CLAUDE.md asks for. The weighted staircase settles at **≈84%**, matching the 85% rule (Wilson et al. 2019). The progress to the next step is shown as a bar. |
| S2 | **Guess rule:** a correct answer given before you could have used the ball's flight is a **guess**. That means response < (your reaction time, or 0.25 s if untested) + 0.05 s after release. A guess scores 0.5 (like "late") and earns no XP. The message says "Too quick — that was a guess." | Rewards only real reads. Even pure guessing on a 2-way choice is right 50% of the time. Bink's own issue is reading too early (0.13 s). |
| S3 | **XP** is given only for a correct read that is neither late nor a guess. Correct reads in nets, the pressure over and trials earn 1.5×. Pace, occlusion and stage raise XP slightly, so harder balls are worth more. There is no XP for speed, for volume, or for finishing a session. | "Reward only correct early reads." Tested (`tests/game-test.mjs`): pressing fast earns 0 XP. Random guessing that waits long enough to dodge the guess rule earns about 69% of an honest 90% reader's XP, because good-length balls accept either foot. It also drops the guesser down the staircase to easier, lower-XP steps. |
| S4 | **Faded feedback** (default "Auto"): every ball gets a full card + Hawk-Eye in the first third of each stage. After that, only errors and late answers get the full card; correct balls get a quick verdict. Nets, the pressure over and trials give feedback only at the end. | Guidance hypothesis (Salmoni, Schmidt & Walter 1984). It reduces dependence on augmented feedback as the skill is learned. Settings offer "Always" and "End only". |
| S5 | **Hand cue strength halved** (release-angle cue ±5°, was ±10°; random ±3° kept). | Real release differences between lengths are small, and skilled batters only pick up length from pre-release cues partly, not perfectly (Müller, Abernethy & Farrow 2006). Halving it removes a possible "fake tell" while keeping the cue representative. The exact real-world size isn't known, so this is a judgement. |
| S6 | **Daily session** = warm-up (8 balls, one step easier, full feedback, level fixed) → focus block (20 balls at your level, weakest length fed 50% of the time, level adapts) → pressure over (6 balls, nets rules, no feedback, level fixed). About 10 minutes. | Short daily practice. Mixed practice by default (Shea & Morgan 1979), with a focused dose on the weakest length, then a representative test under nets conditions. |
| S7 | **Promotion trials use nets rules** (no feedback, bowlers' rhythm, real gap) and need ≥80% over 12 balls against a boss bowler. | Mirrors a real selection, so it's a test of reading, not of following feedback. |

## Game and UI (26 Oct 2026)

| # | Decision | Why |
|---|---|---|
| G1 | **Only one "level" idea is shown as a number:** the training step (L1–L4 with pace). Career tier is shown as a name (Club, District…). XP is a counter, not a third level. | Avoids confusing players with two or three different level numbers. |
| G2 | **Day streak counts days with ≥20 balls.** The weekly goal is 5 practice days (Mon–Sun). | Encourages short daily sessions without punishing a rest day too hard. |
| G3 | **Left-handers:** physics is solved in a "right-hander frame", and the world is mirrored for the camera and ball when batting left-handed. The bowler stays right-arm. Off-spin turns away from a left-hander and leg-spin turns in. | Real physics for both. One tested core. |
| G4 | **Fonts and sounds are bundled or synthesised.** Nothing is fetched at runtime. Barlow Condensed (SIL OFL) is used for display text. | Truly offline. A condensed sports face reads well from 3 m and gives the "finished game" feel. |
| G5 | **Shell = 4 tabs:** Play, Career, Progress, More. A thumb-reach bottom bar on phones, the same bar on PC, driven by D-pad/stick + A/B + LB/RB or the arrow keys. | One-handed on a phone; controller-only and 10-foot use on a PC. |
| G6 | **Career trials unlock by training level, not XP:** Club at L1·100, District L2·100, State L3·110, Zone L3·120 (vs spin), India A L4·120. | Promotion is earned by skill. XP can't buy a trial. |
| G7 | **Boss trademark balls** are just a real delivery bowled more often (35–45%). Tests check each one really produces the decision on the card (e.g. the Swing King's outswingers are always forward and about half are wide enough to leave). | Bosses add story and focus without fake physics or tells. |
| G8 | **Onboarding** = welcome (with an honesty note) → batting hand → set-up → reaction test (skippable) → 4 scripted tutorial balls (2 told, 2 your call). v4 players skip it. | A useful first 3 minutes; v4 users go straight back to training. |
| G9 | **Badges (17)** are computed from ball records. They need correct, on-time reads in specific situations, or the habits (weekly goal, 7-day streak). Guesses never count. | "Reward only real skill." They can be earned retroactively from imported or v4 history. |
| G10 | **XP is shown as a number, not a level.** The training level stays the only level; career rank is a name. | Same as G1. |

## Realism polish (M3, 26 Oct 2026)

| # | Decision | Why |
|---|---|---|
| R1 | **Sight screen on by default**, white for a red ball and black for a white ball. It can be turned off. | Most grounds and good nets have one. It shows the release against a plain background, which is a realistic condition, not a fake cue. If your nets have none, turn it off. |
| R2 | **Speed gun:** the release speed is shown for 3 s *after* the ball, in every mode, nets included. | Nets often have a radar readout. It's shown only after the ball, so it can't help the read. |
| R3 | **Seam wobble** (±8° about the line of flight) on pace balls. It is cosmetic. | Looks real. It carries no length information, so it isn't a tell. |
| R4 | **Bowler body:** capsule limbs, neck, cap peak, cream trousers and a kit trim. The rig and keyframes are unchanged, so release points and physics are identical. | It looks finished without touching the tested timing. |
| R5 | **Gradient sky dome and footmarks.** Footmarks are worn patches at the bowler's landing and at the batter's guard. | They give depth and texture to the scene for 2 extra draw calls. |
| R6 | **GPU resources are created once and re-used.** Nothing is allocated per ball, so nothing leaks. Shadow maps are disposed when their size changes. | This answers v4's "never disposed" problem by never creating per-ball resources at all. |

## True life-size and set-up (v5.2, 27 Oct 2026, from Bink's video of his portrait 27" set-up)

| # | Decision | Why |
|---|---|---|
| C1 | **Calibrated true life-size with an off-axis frustum** (`js/core/calib.js`, `world.applyView`). The camera sits at the measured eye height and looks dead level, and the frustum passes through the physical screen edges. One calibration is saved per orientation, and it overrides every other view (never the phone portrait camera). | Horizon exactly at the real eye line, and every object at its real angle (a 1.85 m bowler at 20 m = 5.29°, tested). The old "life-size" mode tilted a centred camera, so the horizon and sizes were only roughly right. |
| C2 | **The app tells you to raise or lower the screen.** The screen must show the bowling hand at the top of the delivery (2.45 m at about 18 m) plus 1 cm. If it can't, it shows "Raise your screen by X cm…". | The release must be on screen at true eye height. |
| C3 | **Honest limit, shown on the calibration screen:** at 1.3 m from a 59.8 cm screen, the ground is visible only from about 3.9 m in front of the eyes. Balls pitching closer than about 5.3 m from the stumps bounce below the screen; their flight is still visible. The batter's own crease and stumps (about 85° below eye level) can't be on screen at true size. They are drawn for the other views. | It's physics, not a bug. Standing closer helps but risks the bat hitting the screen. |
| C4 | **ACES filmic tone mapping** plus a darker, worn net-pitch texture (one 512×2048 canvas, not tiled), slightly lower lights, poles every 3 m, and a static shadow of the batter's stumps. | The near pitch was clipping to a glaring white on a bright monitor. |
| C5 | **Sight screen default changed to dark** (it was white for a red ball; this changes R1). Options are dark, white or off. | Bink asked for it: better contrast and less glare in a home set-up. |
| C6 | **Length markings:** faint full/good/short bands for the ball's pace. Auto = Level 1 only. | A scaffold while learning the zones, removed once play/leave starts so the read isn't propped up. |
| C7 | **Release heights:** pace 2.1–2.3 m (scaled by bowler size) and spin 1.9–2.0 m, measured on the real rig in `tests/core-test.mjs`. The arm is 182° at release (was 195°), with less forward lean. Spinners use a rounder arm. | v4 values released at 1.80–2.16 m, too low for most pace bowlers. |
| C8 | **Controller:** LT = trigger, RT = explicit LEAVE (locks the decision), B/X = play. In L4, flick moved to LB and pull to RB. | Bink's request: the triggers are under the fingers while holding the controller like a bat handle. |
| C9 | **USB foot pedals:** mapped by pressing FRONT, BACK, PLAY. They use the same `event.timeStamp` path as keys. Also an optional Level 1 "Step, then press" cue. | Lets him hold a real bat and still answer. |
| C10 | **Portrait:** compact result card in the lower third with the pitch map beside it, auto-hidden after 2.5 s unless Hold. HUD chips are small, in the top corners only. | Keeps the bowler's end and release clear. |

## Side-on controller and sync (v5.3, 28 Oct 2026, Bink's request)

| # | Decision | Why |
|---|---|---|
| C8b | **Controller remapped for a side-on stance (replaces C8's buttons):** X = front foot, B = back foot (Y / A and D-pad stay as aliases). The left stick plays. L2–3: any push = play. L4: the foot first, then the stick picks the shot. Front: ← drive, ↓ flick, ↑ defence. Back: ↑ punch, ↓ pull, → defence. Left/right swap for left-handers. A foot with no push = that foot's defence; a stick push with no foot only counts where it's unambiguous (← = drive, → = back defence). LT trigger, RT leave and LB flick / RB pull are unchanged. | Standing side-on, the stick direction matches where the shot goes. The foot press stays the timed read, so the reading time is measured the same way as before. |
| P1 | **Privacy changed: on-device by default, with optional sync to the player's own GitHub** (replaces "on-device only"). The data goes into one secret gist in their account through a fine-grained token (Gists only), pasted once per device. The token is kept in its own storage key, never in exports or the save. The merge never loses data: sessions are combined by date; badges, trials, career and boss bests are combined; the level comes from the device that changed it last. Settings, calibration, pedals, reaction time and feeding stats stay per device. Sync runs at start, after each session and on "Sync now"; failures only show a toast. | Bink plays on the S25+ and the PC and wants one progress. A gist needs no server, no accounts of ours and no cost, and he owns the data. Secret gists are unlisted, not encrypted; this is stated in the app. Reaction time and calibration differ by device, so merging them would be wrong. |

## Sandbox (v5.4, 29 Oct 2026, Bink's request)

| # | Decision | Why |
|---|---|---|
| G-SB | **Sandbox mode: the player picks every ball.** Rows: bowler (pace / off-spin / leg-spin), pace (80–140), length (full toss / full / good / short / bouncer), line (stumps / pads / outside off), blackout and task (feet / play-leave / shots). Every row has Random, rolled again each ball. Balls keep coming until the player changes the set-up: C, the controller View button or Pause → Change balls opens the panel mid-session, and the change applies from the next ball. Sessions are saved as `sandbox` and synced, but never move the level and earn no XP, streak days, weekly-goal days or badges; smart-feeding stats are not updated. Progress shows one line with the sandbox balls of the last 7 days. A spinner never bowls a bouncer (it becomes short). | Bink wants to drill exactly the ball he struggles with (e.g. 120 kph short on the stumps) as long as he likes. Counting it would let anyone farm XP on easy balls and would distort the 85% staircase and the weak-spot feeding. |

## Timing fix (v5.4.1, 29 Oct 2026, Bink: "too quick" when moving after release)

| # | Decision | Why |
|---|---|---|
| T-fix | **A real read is always possible.** "Late" starts at `max(bounce as shown + 30 ms, guess line + 150 ms)`. The card's decide-by target is never inside the "too quick" zone. The reaction time used for the guess line is clamped to 0.18–0.30 s. The "too quick" card now gives the numbers (when you moved, your earliest real read, your reaction time) and asks for a reaction test on this device if none was done in v5. | At 120 kph a short ball bounces about 0.29 s after release. With a 262 ms reaction, the old rules left 12 ms between "too quick" (0.312 s) and "late", and no window at all for bouncers. From 100 kph up, the target time even sat inside the "too quick" zone. Pressing before reaction time + 50 ms is still a guess: there is no flight to read before then. |
