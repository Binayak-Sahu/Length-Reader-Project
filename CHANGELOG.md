# Changelog

Plain-language list of what changed, newest first. One line says what to try.

## v6.0 (12 Nov 2026) — live

**Live drills are untouched.** Every existing mode bowls, times and grades exactly as in v5.10.1, and looks the same once the ball is coming (the in-play styles were moved to their own file without changes).

New
- **Skill check** (Play → Test yourself). The same 24-ball test every time: front or back, no feedback, half the balls blacked out just after release, always at 110 kph. It gives a read score you can compare week to week, says the one thing to work on, and tells you when a change is too small to mean anything. No XP or badges, and it never moves your level.
- **Automatic backups.** The app keeps one copy of your save per day for 7 days on the device. If the save is ever damaged it is repaired from the newest copy when the app opens. Settings → Backups lets you put a day back (it only adds what is missing).
- **Two tabs are safe.** A session saved in another tab is merged in, not overwritten.

Better
- **New look everywhere outside play:** one design system (type, colour, spacing, buttons, cards), bigger text on monitors, a side rail on wide screens, clearer focus outlines, dark text on green buttons for contrast.
- **Play** is grouped: Today · Test yourself · Drills · Free practice. Same modes, same names.
- **First run** is 5 short steps and only shows the controls for the device in your hand. After the 4 practice balls a new player gets a welcome and a next step, not a red score.
- **End of session:** the wall of text is now a few tiles; timing details are folded away.
- **Progress** leads with the Skill check and says plainly why the training score sits near 85%.
- **Settings** are grouped (You · Training · Bowlers · Picture · Sound and feel) with proper switches.
- **How it works** rewritten against the research, checked source by source, with the weak spots stated (the 85% figure, small studies, limited proof of carry-over to matches).

Fixed
- Selection sim report showed "Feet right 1%" (a count shown as a percentage).
- First-run set-up step showed giant letters and PC controls on a phone.
- Progress table could not be read on a phone (now scrolls with the day column pinned).
- "Batting mirror" tile still promised feet checks (it is head-only since v5.6).
- The starter video in Real bowlers was labelled with Bink's name for every player.
- Tools (`stamp`, `serve`) crashed on Windows; line endings are now fixed to LF so the offline stamp matches CI.

Try it: **PC and S25+ → Play → Skill check** (3 minutes), then look at **Progress**.
