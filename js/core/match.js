// Match mode: what happened (runs or out), driven by how good the decision was.
import { categorize, footFor, SHOTS } from './rules.js';

export function outcome(g, tr, mode, inp, rng = Math.random) {
  const r = rng(), left = mode === 4 ? !inp.shot : !inp.played;
  if (g.v === 'good') {
    if (mode === 4) {
      const s = inp.shot; if (!s) return { r: 0, txt: 'Well left' };
      if (s === 'SD' || s === 'PU') return r < 0.55 ? { r: 4, txt: 'FOUR!' } : { r: 2, txt: 'Two runs' };
      if (s === 'BP' || s === 'FL') return r < 0.3 ? { r: 4, txt: 'FOUR!' } : { r: 1, txt: 'Single' };
      return r < 0.3 ? { r: 1, txt: 'Single' } : { r: 0, txt: 'Solid defence' };
    }
    if (left) return { r: 0, txt: 'Well left' };
    const cat = categorize(tr);
    if (cat === 'Full' || cat === 'Yorker') return r < 0.45 ? { r: 4, txt: 'FOUR!' } : { r: 1, txt: 'Single' };
    if (cat === 'Short') return r < 0.35 ? { r: 4, txt: 'FOUR!' } : { r: 1, txt: 'Single' };
    return r < 0.4 ? { r: 1, txt: 'Single' } : { r: 0, txt: 'Dot ball' };
  }
  if (g.v === 'warn') return r < 0.45 ? { r: 1, txt: 'Single' } : { r: 0, txt: 'Dot ball' };
  if (left && g.hitting) return { out: 1, r: 0, txt: 'OUT — Bowled' };
  if (!left && g.wide) return r < 0.45 ? { out: 1, r: 0, txt: 'OUT — Caught behind' } : { r: 0, txt: 'Played and missed' };
  if (!left && tr.yC >= 1.3) return r < 0.4 ? { out: 1, r: 0, txt: 'OUT — Top edge, caught' } : { r: 0, txt: 'Hit on the glove' };
  const fe = footFor(tr), foot = mode === 4 ? (inp.shot ? SHOTS[inp.shot].f : null) : inp.foot;
  if (!foot) return (g.hitting && r < 0.45) ? { out: 1, r: 0, txt: 'OUT — LBW, feet froze' } : { r: 0, txt: 'Beaten' };
  if (fe === 'F' && foot === 'B') return r < 0.4 ? { out: 1, r: 0, txt: 'OUT — LBW, stuck on the back foot' } : { r: 0, txt: 'Beaten' };
  if (fe === 'B' && foot === 'F') return r < 0.35 ? { out: 1, r: 0, txt: 'OUT — Fended, caught' } : { r: 0, txt: 'Hit on the body' };
  return r < 0.25 ? { out: 1, r: 0, txt: 'OUT — Edged' } : { r: 0, txt: 'Dot ball' };
}
