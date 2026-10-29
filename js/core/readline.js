// The personal "too quick" line, learned from the player's own balls. Pure (tested in Node).
// A static reaction test can't know how well someone times a press off a real delivery, so the evidence decides:
// the line is the earliest press time (s after release) from which the feet are right ≥ 85% of the time.
// Fast presses that are coin flips keep the default line (reaction + 50 ms); fast presses that are right move it down.
import { guessLimit } from './rules.js';

export const RL_BALLS = 60, RL_MIN = 40, RL_BAND = 10, RL_ACC = 0.85, RL_FLOOR = 0.12;

// Balls that can show a read: a foot was pressed after release, and only one foot was right (front or back).
function evidence(b) { return b && b.foot && (b.fe === 'F' || b.fe === 'B') && b.rt != null && b.rt >= 0; }

// recent: graded balls, newest last. Returns { line, def, personal, fastAcc, nFast, slowAcc, nSlow, n }.
export function personalLine(recent, rtBase) {
  const def = guessLimit(rtBase);
  const ev = recent.filter(evidence).slice(-RL_BALLS);
  const acc = (xs) => xs.length ? xs.filter(b => b.foot === b.fe).length / xs.length : null;
  let line = def;
  if (ev.length >= RL_MIN) {
    for (let t = RL_FLOOR; t < def - 1e-9; t += 0.01) {
      const band = ev.filter(b => b.rt >= t && b.rt < def);
      if (band.length >= RL_BAND && acc(band) >= RL_ACC) { line = +t.toFixed(2); break; }
    }
  }
  const fast = ev.filter(b => b.rt < line), slow = ev.filter(b => b.rt >= line);
  return { line, def, personal: line < def, n: ev.length, fastAcc: acc(fast), nFast: fast.length, slowAcc: acc(slow), nSlow: slow.length };
}

// Newest-last list of the most recent graded balls across sessions (sandbox included: they are real reads).
export function recentBalls(sessions, extra = [], max = RL_BALLS * 3) {
  const out = [];
  for (let i = sessions.length - 1; i >= 0 && out.length < max; i--) { const b = sessions[i].balls || []; for (let j = b.length - 1; j >= 0 && out.length < max; j--) out.push(b[j]); }
  return out.reverse().concat(extra);
}

export function evidenceText(p) {
  const pc = (x) => Math.round(100 * x) + '%';
  if (p.n < RL_MIN) return `Your too-quick line: ${p.line.toFixed(2)} s (reaction + 50 ms). After ${RL_MIN} balls (${p.n} so far) it is learned from your own results.`;
  return `Your too-quick line: ${p.line.toFixed(2)} s${p.personal ? ' (learned from your results)' : ''}.`
    + (p.nFast ? ` Presses before it: ${pc(p.fastAcc)} right (${p.nFast})` : ' No presses before it')
    + (p.nSlow ? ` · after: ${pc(p.slowAcc)} right (${p.nSlow}).` : '.');
}
