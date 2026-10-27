// Career ladder: Gully → Club → District → State → Zone → India A.
// Each promotion is a trial: 2 overs (12 balls) under nets rules against a boss bowler, 80% or more to pass.
// A trial unlocks when your training level has reached the step it tests — so it is earned by skill, not volume.
import { BOWLERS } from './bowling.js';

export const TIERS = ['Gully', 'Club', 'District', 'State', 'Zone', 'India A'];
export const PASS = 80, TRIAL_BALLS = 12;

// Boss bowlers. Every trademark ball stays inside real-world ranges; it is just bowled more often (p).
// d = pitching distance (m from the batter's stumps), lx = line at the stumps (+ = off side).
export const BOSSES = [
  { id: 'metronome', tier: 1, n: 'The Metronome', unlock: 2, spec: { m: 1, k: 100, o: null },
    prof: Object.assign({}, BOWLERS[0], { id: 'metronome', n: 'The Metronome', c: 0x0f766e }),
    trademark: { p: 0.45, cat: 'Short', d: [7.6, 8.6], name: 'Back of a length' },
    blurb: 'Never misses. His back-of-a-length ball looks driveable until it isn’t.', skill: 'Go back to anything short of a length.' },
  { id: 'hustler', tier: 2, n: 'The Hustler', unlock: 11, spec: { m: 2, k: 110, o: null },
    prof: Object.assign({}, BOWLERS[1], { id: 'hustler', n: 'The Hustler', c: 0x9a3412 }),
    trademark: { p: 0.4, cat: 'Short', d: [7.6, 9.5], lx: [-0.08, 0.08], name: 'Short at the ribs' },
    blurb: 'Skiddy and aggressive. Hurries you with short balls at the body.', skill: 'Back and across, and play it — it’s hitting.' },
  { id: 'swing', tier: 3, n: 'The Swing King', unlock: 19, spec: { m: 3, k: 115, o: null },
    prof: Object.assign({}, BOWLERS[2], { id: 'swing', n: 'The Swing King', c: 0x1e3a8a }),
    trademark: { p: 0.45, cat: 'Full', d: [3.0, 5.0], lx: [0.2, 0.45], varn: 'Outswing', name: 'Late outswinger' },
    blurb: 'Pitches it up and moves it away late. Feeds the edge.', skill: 'Get forward — and leave anything wide outside off.' },
  { id: 'magician', tier: 4, n: 'The Magician', unlock: 20, spec: { m: 3, k: 80, o: null },
    prof: Object.assign({}, BOWLERS[4], { id: 'magician', n: 'The Magician', c: 0x6b21a8 }),
    trademark: { p: 0.35, varn: 'Googly', name: 'The googly' },
    blurb: 'Leg-spinner with a googly. Flight, dip and the one that turns back in.', skill: 'Forward to anything tossed up; back only when it’s clearly short.' },
  { id: 'express', tier: 5, n: 'The Express', unlock: 25, spec: { m: 4, k: 120, o: null },
    prof: Object.assign({}, BOWLERS[0], { id: 'express', n: 'The Express', s: 1.08, c: 0x111827 }),
    trademark: { p: 0.35, cat: 'Full', d: [2.5, 4.5], varn: 'Slower ball', name: 'Slower ball' },
    blurb: 'Top pace, then the slower ball out of the back of the hand.', skill: 'Pick the shot late enough to see the slower ball, early enough to get there.' },
];
export const bossFor = (tier) => BOSSES.find(b => b.tier === tier) || null;
export const bossById = (id) => BOSSES.find(b => b.id === id) || null;

// What the player can do next on the ladder.
export function careerState(db) {
  const tier = db.career.tier, next = bossFor(tier + 1);
  return { tier, name: TIERS[tier], next, unlocked: !!next && db.level >= next.unlock, beaten: BOSSES.filter(b => b.tier <= tier) };
}

// Score a finished trial. Returns {passed, promoted, tier}.
export function recordTrial(db, boss, score, date) {
  const passed = score >= PASS;
  db.career.trials.push({ date, boss: boss.id, score, passed });
  db.bosses[boss.id] = Math.max(db.bosses[boss.id] || 0, score);
  let promoted = false;
  if (passed && boss.tier === db.career.tier + 1) { db.career.tier = boss.tier; promoted = true; }
  return { passed, promoted, tier: db.career.tier };
}
