// Sandbox: the player picks every ball. Each row has 'rand' (a fresh roll every ball). Pure (tested in Node).
export const SB_ROWS = [
  { k: 'bowler', l: 'BOWLER', o: [['pace', 'Pace'], ['off', 'Off-spin'], ['leg', 'Leg-spin']] },
  { k: 'kph', l: 'PACE (KPH)', o: [80, 90, 100, 110, 120, 130, 140].map(v => [v, String(v)]), h: 'Spinners bowl at spin pace (72–88 kph).' },
  { k: 'len', l: 'LENGTH', o: [['Full toss', 'Full toss'], ['Full', 'Full'], ['Good', 'Good'], ['Short', 'Short'], ['Bouncer', 'Bouncer']], h: 'Bouncers are pace only.' },
  { k: 'line', l: 'LINE', o: [['stumps', 'On the stumps'], ['pads', 'On the pads'], ['off', 'Outside off']] },
  { k: 'occ', l: 'BLACKOUT', o: [['none', 'None'], [0.25, '+250 ms'], [0.16, '+160 ms'], [0.1, '+100 ms'], [0, 'At release']] },
  { k: 'task', l: 'TASK', o: [[1, 'Feet'], [2, 'Play / leave'], [4, 'Shots']] },
];
export const SB_DEF = { bowler: 'rand', kph: 'rand', len: 'rand', line: 'rand', occ: 'rand', task: 'rand' };

// Fill gaps and drop values that are no longer offered.
export function sbClean(sb) {
  const out = Object.assign({}, SB_DEF);
  for (const r of SB_ROWS) if (sb && (sb[r.k] === 'rand' || r.o.some(([v]) => v === sb[r.k]))) out[r.k] = sb[r.k];
  return out;
}

// Choices → one concrete ball: { spin: null|'off'|'leg', kph, cat, line, occ (s or null), mode }.
export function sbResolve(sb, rng = Math.random) {
  sb = sbClean(sb);
  const pick = (k) => { const r = SB_ROWS.find(x => x.k === k); return sb[k] === 'rand' ? r.o[Math.floor(rng() * r.o.length)][0] : sb[k]; };
  const b = pick('bowler'), spin = b === 'pace' ? null : b;
  let cat = pick('len');
  if (spin && cat === 'Bouncer') cat = 'Short';                    // a spinner can't get it head-high
  const occ = pick('occ');
  return { spin, kph: pick('kph'), cat, line: pick('line'), occ: occ === 'none' ? null : occ, mode: pick('task') };
}

export function sbLabel(r) {
  return [r.spin ? (r.spin === 'off' ? 'Off-spin' : 'Leg-spin') : r.kph + ' kph', r.cat, { stumps: 'stumps', pads: 'pads', off: 'outside off' }[r.line]].join(' · ');
}
