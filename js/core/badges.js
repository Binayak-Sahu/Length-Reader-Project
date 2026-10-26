// Badges reward real skills — correct, on-time reads in specific situations — never volume or speed.
// Pure: computed from ball records, so they can also be earned retroactively from imported or v4 history.
import { isRead, streak, week, WEEK_GOAL } from './progress.js';

export const BADGES = [
  { id: 'first', n: 'First Read', d: 'Your first correct, on-time read.', icon: 'eye', col: '#38bdf8' },
  { id: 'back10', n: 'Back in Time', d: '10 short balls in a row read right and early.', icon: 'back', col: '#c4b5fd' },
  { id: 'fwd10', n: 'Get Forward', d: '10 pitched-up balls in a row read right and early.', icon: 'fwd', col: '#7dd3fc' },
  { id: 'leave10', n: 'Good Leave', d: '10 correct leaves outside off in one session.', icon: 'leave', col: '#e5e7eb' },
  { id: 'duck5', n: 'Duck & Weave', d: '5 bouncers left alone in one session.', icon: 'duck', col: '#fca5a5' },
  { id: 'blackout10', n: 'Lights Out', d: '10 correct reads on blacked-out balls in one session.', icon: 'dark', col: '#cbd5e1' },
  { id: 'slower8', n: 'Slower-Ball Spotter', d: '8 slower balls read right in one session.', icon: 'slow', col: '#fde68a' },
  { id: 'patient20', n: 'Patient Eyes', d: '20 correct reads in one session, each after a proper look (0.15 s or more of reading).', icon: 'eye', col: '#86efac' },
  { id: 'spin85', n: 'Spin Reader', d: '85% or more in a spin drill.', icon: 'spin', col: '#d8b4fe' },
  { id: 'nets85', n: 'Nets Ready', d: '85% or more in a full nets session.', icon: 'net', col: '#7dd3fc' },
  { id: 'pressure6', n: 'Pressure Proof', d: '6 out of 6 in a pressure over.', icon: 'six', col: '#fbbf24' },
  { id: 'match', n: 'Match Winner', d: 'Win a 3-over match.', icon: 'trophy', col: '#fbbf24' },
  { id: 'reads100', n: 'Century', d: '100 correct, on-time reads.', icon: 'num', col: '#22c55e' },
  { id: 'reads1000', n: 'Thousand Club', d: '1,000 correct, on-time reads.', icon: 'num', col: '#16a34a' },
  { id: 'week5', n: 'Iron Week', d: `Practise on ${WEEK_GOAL} days in one week (Mon–Sun).`, icon: 'cal', col: '#f97316' },
  { id: 'streak7', n: 'Seven Straight', d: 'Practise 7 days in a row.', icon: 'flame', col: '#f97316' },
  { id: 'selected', n: 'Selected', d: 'Reach India A on the career ladder.', icon: 'cap', col: '#fde68a' },
];
export const badgeById = id => BADGES.find(b => b.id === id);

const leftRight = b => b.mode === 4 ? (b.v === 'good' && !b.shot) : (b.pe === 'LEAVE' && b.pv === 'good');
function runOf(balls, want) {      // longest run of correct reads among balls that need a given foot
  let best = 0, run = 0;
  for (const b of balls) { if (b.fe !== want) continue; if (isRead(b)) { run++; best = Math.max(best, run); } else run = 0; }
  return best;
}
function sessionChecks(s) {
  const b = s.balls || [], got = [];
  const count = f => b.filter(f).length;
  if (b.some(isRead)) got.push('first');
  if (runOf(b, 'B') >= 10) got.push('back10');
  if (runOf(b, 'F') >= 10) got.push('fwd10');
  if (count(x => x.cat === 'Wide off' && leftRight(x)) >= 10) got.push('leave10');
  if (count(x => x.cat === 'Bouncer' && leftRight(x)) >= 5) got.push('duck5');
  if (count(x => x.occ != null && isRead(x)) >= 10) got.push('blackout10');
  if (count(x => x.varn && /Slower/.test(x.varn) && isRead(x)) >= 8) got.push('slower8');
  if (count(x => isRead(x) && x.read != null && x.read >= 0.15) >= 20) got.push('patient20');
  const kind = s.kind || s.drill;
  if (kind === 'spin' && s.n >= 20 && s.score >= 85) got.push('spin85');
  if (kind === 'nets' && s.n >= 20 && s.score >= 85) got.push('nets85');
  if (kind === 'daily') { const po = b.filter(x => x.seg === 2); if (po.length === 6 && po.every(isRead)) got.push('pressure6'); }
  if (s.match && s.match.won) got.push('match');
  return got;
}
// Marks newly earned badges in db.badges and returns their ids. `s` = the session just finished (or null).
export function checkBadges(db, s, now = new Date()) {
  const got = new Set(s ? sessionChecks(s) : db.sessions.flatMap(sessionChecks));
  const reads = db.sessions.reduce((a, x) => a + ((x.sum && x.sum.reads) || (x.balls || []).filter(isRead).length), 0);
  if (reads >= 100) got.add('reads100');
  if (reads >= 1000) got.add('reads1000');
  if (week(db, now).filter(d => d.done).length >= WEEK_GOAL) got.add('week5');
  if (streak(db, now) >= 7) got.add('streak7');
  if (db.career && db.career.tier >= 5) got.add('selected');
  const fresh = [];
  for (const id of got) if (!db.badges[id]) { db.badges[id] = now.toISOString(); fresh.push(id); }
  return fresh;
}

// Simple badge medallion (shape + colour + glyph), as SVG markup.
const GLYPH = {
  eye: '<path d="M14 32c8-12 28-12 36 0-8 12-28 12-36 0z" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="32" cy="32" r="6" fill="currentColor"/>',
  back: '<path d="M32 16v26M20 30l12 12 12-12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 48h24" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  fwd: '<path d="M32 48V22M20 34l12-12 12 12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 16h24" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  leave: '<path d="M22 44V24a4 4 0 018 0v14M30 22a4 4 0 018 0v16M38 26a4 4 0 018 0v12c0 8-6 12-12 12h-4c-6 0-10-4-12-10l-4-8" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
  duck: '<circle cx="32" cy="24" r="7" fill="currentColor"/><path d="M18 46c4-10 24-10 28 0" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M44 12l8 4" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  dark: '<path d="M40 14a18 18 0 1 0 10 28A16 16 0 0 1 40 14z" fill="currentColor"/>',
  slow: '<circle cx="32" cy="32" r="16" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 22v10l7 5" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>',
  spin: '<path d="M32 16a16 16 0 1 1-15 10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M12 22l5 4 4-6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  net: '<path d="M16 16h32v32H16zM16 27h32M16 38h32M27 16v32M38 16v32" fill="none" stroke="currentColor" stroke-width="3"/>',
  six: '<text x="32" y="42" text-anchor="middle" font-size="28" font-weight="900" fill="currentColor" font-family="system-ui">6</text>',
  trophy: '<path d="M22 16h20v8a10 10 0 0 1-20 0zM32 34v8M24 48h16M22 20h-6a6 6 0 0 0 6 8M42 20h6a6 6 0 0 1-6 8" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
  num: '<text x="32" y="40" text-anchor="middle" font-size="18" font-weight="900" fill="currentColor" font-family="system-ui">100</text>',
  cal: '<rect x="16" y="18" width="32" height="28" rx="4" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M16 27h32M24 14v8M40 14v8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M23 37l5 4 10-9" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
  flame: '<path d="M32 12c4 8 12 12 12 22a12 12 0 0 1-24 0c0-6 4-8 6-12 0 4 2 6 4 6 0-6-2-10 2-16z" fill="currentColor"/>',
  cap: '<path d="M14 36c0-12 8-18 18-18s18 6 18 18zM12 36h40v4H12z" fill="currentColor"/>',
};
export function badgeSVG(b, earned) {
  const col = earned ? b.col : '#3b4552', glyph = (b.id === 'reads1000' ? GLYPH.num.replace('>100<', '>1k<') : GLYPH[b.icon]) || GLYPH.eye;
  return `<svg viewBox="0 0 64 64" aria-hidden="true" style="color:${col}"><path d="M32 3l25 14v30L32 61 7 47V17z" fill="${earned ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.02)'}" stroke="currentColor" stroke-width="3"/>${glyph}</svg>`;
}
