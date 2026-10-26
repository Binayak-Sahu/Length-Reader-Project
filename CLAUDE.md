# Length Reader: project handoff

Claude Code reads this file at the start of every session. It records what is built, the decisions already made, and what comes next.
Keep it up to date when decisions change.

## Who this is for

- **Bink**: right-handed batter, also bowls right-arm medium. 6 ft. Not a coder; deploys personal tools to GitHub Pages.
- Preparing for a **company cricket selection held in nets, after 15 Nov 2026**. No new batting technique after **7 Nov 2026**.
- Selection nets: pace bowlers up to about **120 kph**, plus **spinners**.
- Trigger: a **small forward press** (not back-and-across). Keep it small, weight 50/50, head still.
- Home setup: Samsung **S25+** phone; **27-inch PC monitor at 165 Hz** (it can rotate to vertical); **Xbox controller**; room 20 × 10 × 10 ft.
- Main batting problems: reads length late (goes forward to short balls), head falls to the off side, poor leaving outside off.

## How to work with Bink

- **Short replies.** Long texts make him put things off. Use tables and short bullets, and plain cricket language.
- **Discuss before building.** Propose the change, wait for "go", then build. Bug fixes he reports can be fixed straight away.
- Training plans: give only **today's or tomorrow's** plan, never long-term plans.
- **Test before shipping**: run `node tests/core-test.mjs`, then check the page in a browser. Say what was tested.
- Be honest when the app is wrong or a request won't help his cricket.

## Files

| File | What it is |
|---|---|
| `length-reader.html` | The main app. One self-contained file; three.js r128 from cdnjs. It works on phone (touch) and PC (keyboard, mouse, Xbox controller). |
| `mirror.html` | Phone batting mirror: shot-triggered slow-mo replay, delayed mirror, and pose checks (MediaPipe tasks-vision 0.10.14, lite pose model). It needs https (GitHub Pages) for the camera. |
| `tests/core-test.mjs` | Checks the physics and grading. It extracts the code between `// @core-start` and `// @core-end` from the HTML. |

The live phone copy was previously a private claude.ai artifact. **GitHub Pages is now the main home**: better frame rate, and the camera works.

## length-reader.html: how it works

**Pure core (`// @core-start` … `// @core-end`, no graphics, testable in Node)**
- `makeTraj(p0,kph,d,lxArr,opt)` simulates the ball in 1 ms steps:
  - Gravity, air drag (`KD=0.0055`; a 120 kph ball arrives at about 100 kph) and the bounce (`E_V`, `E_H`).
  - Late swing (applied in the second half of the flight only), drift, and seam or spin off the pitch.
  - The aim is corrected so the ball still **pitches at `d` m from the batter's stumps** and **finishes on line `lxArr`** (+ = off side, right-hander).
  - Returns `tb` (time of bounce), `ta` (time at the stumps), `yC` (height at the crease), `yA` (height at the stumps), and `pos(tau)`.
- `zones(kph,spin)`: the front/back lines **move with pace**:
  - 80 kph: forward under 4.8 m, back from 6.3 m.
  - 140 kph: 6.0 / 8.0 m.
  - Spin: 4.8 / 6.0 m.
  - Linear in between. Slower deliveries use the zones for their own pace.
- `categorize`:
  - Full = go forward, Good = either foot, Short = go back.
  - Bouncer = `yC ≥ 1.30`. Wide off = `lxArr > 0.30`. Full toss = `d < 0`.
- `grade` (Levels 1–3): feet are judged on length.
  - Answering after the bounce + 0.03 s = **late** (scores half).
  - Level 2+ adds play/leave. Leave balls that are wide or bouncers. You must play anything **hitting**: `|lx| ≤ 0.13` and `yA ≤ 0.78`.
- `idealShots` / `gradeShot` (Level 4): the shot menu is front defence, straight drive, flick, back defence, back-foot punch, pull (waist high only), and leave.
- `genBall(S,c)`:
  - Picks the length band and line.
  - Smart feeding: the weakest length gets bowled about 40% more.
  - Variety from Level 3: slower ball −12 to −18 kph, out/inswing, seam. Spin: off-break, leg-break, arm ball.
  - Club-level accuracy: about 7% full tosses (never above waist), length jitter, stray lines.
- `outcome` (match mode): runs or a dismissal, based on how good the decision was.

**Scene and animation**
- Batter's eye is at 1.5 m, head on the off-stump line.
- Views: auto (landscape or portrait), wide, tight, or life-size (from screen height and viewing distance; the ball is drawn at true size).
- The bowler is a mannequin animated from keyframes (`K`), using elite timings:
  - Run-up about 6.2 m/s, bound about 2.2 m.
  - Back-foot contact → front-foot contact 0.19 s; front-foot contact → release 0.10 s.
  - Times: `T_BFC=2.76`, `T_FFC=2.95`, `T_REL=3.05`.
  - Spinners use a short jogging run-up (`RUN_S`).
- Bowlers: tall quick, skiddy, wide of the crease, off-spinner, leg-spinner.
- **Hand cue:** fuller balls are released slightly later and flatter (`REL`), plus a small random release variation.
- Ball: seam texture, with backspin (seam bowler) or side-spin (spinner).
- Sounds: footsteps, then louder back-foot and front-foot landings, and a bounce thud.
- Hawk-Eye replay: a camera behind the bowler, length bands for that ball's pace, and the ball path drawn in. Controls: Hold, Replay, ½× slow-mo, Next.

**Modes**
- Today's session (50 balls), Quick 30, Endless.
- Short-ball drill (60% short), Spin drill.
- Match: 3 overs, 3 wickets, target 14–22 runs.
- **Nets session**: 24 balls. Bowlers take turns every ball (2 quicks + 1 spinner). No blackout, no feedback until the end. About 20 s between balls while the bowler walks back; the Ready button skips the wait.
- Reaction test: median of 8 presses. It is subtracted from press times to give **reading time**.

**Levels (auto)**: 4 stages.

| Stage | What it adds | Steps |
|---|---|---|
| L1 Feet | Front/back only; balls on the stumps | 80 → 90 → 100 → 110 → 120 kph, then blackout +250 / +160 / +100 / 0 ms after release |
| L2 Play/leave | Play or leave | Same 9 steps as L1 |
| L3 Variety | Slower balls, swing, seam | 100, 110, 120, then 120 with blackout +250 / +160 ms |
| L4 Shot choice | Pick the shot | Same 5 steps as L3 |

- Last 8 balls ≥ 80% → up a step. Last 8 ≤ 50% → down a step.
- Drills, nets and matches don't change the level.

**Controls**
- **Trigger** (optional, off by default): must fall between the bowler's back-foot landing and release. RB/LB, Space, or the first tap on the phone.
- **Feet** (L1–3):
  - Front: Y, ←, left click, or tap the top half.
  - Back: A, →, right click, or tap the bottom half.
- **Play** (L2–3): press again. Nothing = leave.
- **Shots** (L4):
  - Front foot: Y defend, X drive, LT flick (keys W E Q).
  - Back foot: A defend, B punch, RT pull (keys S D A).
  - Phone: 6 tap zones.
- After a ball: A or Enter = next, Y or H = hold, B or R = replay, X or S = slow-mo.

**Storage**: `localStorage` key `lr_v3`. It holds settings, sessions (every ball recorded), level, `rtBase`, and `cs` (per-length scores for smart feeding).

**Progress page**: daily score, short-ball %, and reading time, as a chart and a table.

## Decisions already made (don't reopen without asking)

- No live tracking of real balls with the phone camera. It would be unreliable before the selection.
- The pose checks leave out **toe angle and base width**, because one camera can't judge them reliably.
- No pad or bat drawn in view (it would be fake at real eye height). No voice commands.
- Bouncers only appear at pace (real bouncers need more than about 110 kph).
- Nets realism: bowlers rotate each ball, club-level accuracy, no per-ball feedback, real time between balls.

## Bink's latest numbers (26 Oct 2026)

| Measure | Result |
|---|---|
| Reaction (button) | 262 ms |
| Nets session (L1, 80 kph) | 79%: full and good 100%, spin 88%, short 55% |
| Short-ball drill | 67%: short 47%, went forward 9 times |
| Reading time | About 0.13 s, too early. Target is about 0.2–0.25 s, still before the bounce. |

## Next: agreed plan, awaiting "go" on details

Build in stages, testing each stage before the next.

**Stage A: speed and new look**
- Hit **120 fps on the S25+** and **165 fps on the PC**. Keep each frame under 8 ms (phone) and 6 ms (PC): cheaper shadows, no per-frame allocations, smart pixel ratio.
- Add an FPS meter and automatic quality.
- New UI shell.

**Stage B: game layer**
- Daily session: warm-up read → drill on the weakest length → pressure over.
- Career ladder: Gully → Club → District → State → Zone → India A, with promotion trials (2 overs at 80% or more).
- Boss bowlers, each with a trademark ball.
- XP for correct early reads only; never reward guessing or pure speed.
- Badges for real skills; a daily streak plus a 5-day weekly goal.

**Stage C: realism polish**
- Better bowler body and actions, seam wobble, sight screen, net sounds, and a speed gun.

**Training science to keep**
- Difficulty holds success at about 80–85% (Wilson et al. 2019, "85% rule").
- Feedback fades as a level is learned (Schmidt's guidance hypothesis).
- Mixed practice by default (Shea & Morgan, contextual interference).
- Reading combined with moving the feet.
- Short daily sessions (about 10 min).

**Still to confirm with Bink**
- Is the stage order OK?
- Keep the name "Length Reader"?

**Later (Bink paused it)**: a PC mirror using the S25+ as a webcam, with pose checks on the big screen.
