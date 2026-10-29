// Grading: what the right decision was, and how the batter's answer scores. Pure functions.
import { T_BFC, T_REL } from './physics.js';

export const LATE_MARGIN = 0.03;      // answering after the bounce + 30 ms = late (scores half)
export const GUESS_MARGIN = 0.05;     // answering sooner than your reaction time + 50 ms after release = a guess
export const READ_WINDOW = 0.15;      // "late" never starts sooner than 150 ms after the guess line (a real read must be possible)
export const RT_CLAMP = [0.18, 0.30]; // a slow or stale reaction test can't push the guess line past 0.35 s
export const DEFAULT_RT = 0.25;       // assumed button reaction time until the reaction test is done

export function targetFor(kph) { return Math.max(0.25, 0.35 - (kph - 80) * 0.0025); }   // decision target, s after release
// Earliest response (s after release) that could have used the ball's flight. Anything sooner is a guess.
export function guessLimit(rtBase) {
  const rt = rtBase > 0.1 ? Math.max(RT_CLAMP[0], Math.min(RT_CLAMP[1], rtBase)) : DEFAULT_RT;
  return rt + GUESS_MARGIN;
}
// Late = after the bounce as shown + 30 ms, but never inside the first 150 ms after the guess line. At 120 kph a short
// ball bounces ~0.29 s after release, so without this floor there was no time left between "too quick" and "late".
export function lateAt(tb, guessBelow) { return Math.max(tb + LATE_MARGIN, guessBelow != null ? guessBelow + READ_WINDOW : 0); }
// The decide-by target shown on the card: never inside the "too quick" zone.
export function targetAt(kph, guessBelow) { return Math.max(targetFor(kph), guessBelow != null ? guessBelow + 0.05 : 0); }

export function categorize(tr) {
  if (tr.yC >= 1.30) return 'Bouncer';
  if (tr.lxArr > 0.30) return 'Wide off';
  if (tr.d < 0) return 'Full toss';
  return tr.d < 1.5 ? 'Yorker' : tr.d < tr.fmax ? 'Full' : tr.d < tr.bmin ? 'Good' : 'Short';   // Full = forward · Good = either · Short = back
}
export function footFor(tr) { if (tr.yC >= 1.30) return 'B'; return tr.d <= tr.fmax ? 'F' : (tr.d >= tr.bmin ? 'B' : 'FB'); }
export function isHitting(tr) { return Math.abs(tr.lxArr) <= 0.13 && tr.yA <= 0.78; }

// Trigger (optional small forward press): should fall between the bowler's back-foot landing and release.
export function gradeTrig(t) {
  if (t === null) return { v: 'bad', sc: 0, msg: 'No trigger' };
  if (t < T_BFC - 0.03) return { v: 'warn', sc: 0.5, msg: 'Trigger too early — you went static again' };
  if (t > T_REL + 0.02) return { v: 'warn', sc: 0.5, msg: 'Trigger late — after release' };
  return { v: 'good', sc: 1, msg: 'Trigger on time' };
}

// When was the answer, relative to the ball? opt.tbP = bounce as presented on screen (s after the release frame);
// opt.guessBelow = guess limit (s). Without opt this behaves exactly like v4.
export function timingOf(tr, rt, opt) {
  const tb = opt && opt.tbP != null ? opt.tbP : tr.tb;
  if (rt == null) return { late: false, guess: false };
  const gb = opt && opt.guessBelow != null ? opt.guessBelow : null;
  return { late: rt > lateAt(tb, gb), guess: gb != null && rt < gb };
}

const GUESS_MSG = 'Too quick — that was a guess. Watch it out of the hand';
function guessMsg(rt, opt) {
  if (rt == null || !opt || opt.guessBelow == null) return GUESS_MSG;
  const ms = (x) => Math.round(x * 1000);
  const ev = opt.ev, why = ev && ev.n >= 40 && ev.nFast >= 5 ? ` — your presses this early are right ${Math.round(100 * ev.fastAcc)}% of the time (${ev.nFast} balls)`
    : ev && ev.personal ? '' : ` (reaction ${ms(opt.guessBelow - GUESS_MARGIN)} + 50; after 40 balls it is learned from your results)`;
  return `Too quick — you moved ${ms(rt)} ms after release; your too-quick line is ${ms(opt.guessBelow)} ms${why}. Watch the first part of the flight`;
}

// mode 1 = feet only; 2 and 3 = feet + play/leave (3 adds variety balls)
export function grade(tr, foot, rtFoot, played, mode, trig, opt) {
  const fe = footFor(tr), tm = foot ? timingOf(tr, rtFoot, opt) : { late: false, guess: false };
  let fv, fsc, fmsg;
  if (!foot) { fv = 'bad'; fsc = 0; fmsg = 'Feet froze — no movement'; }
  else if (fe !== 'FB' && foot !== fe) {
    fv = 'bad'; fsc = 0;
    fmsg = fe === 'F' ? (tr.spin ? `Tossed up (${tr.d.toFixed(1)} m) — get forward to the pitch` : `Pitched up at ${tr.d.toFixed(1)} m — get forward`)
      : `Pitched ${tr.d.toFixed(1)} m away — too far to reach, go back and across`;
    if (tm.guess) fmsg += ' (and that was a guess)';
  }
  else if (tm.guess) { fv = 'warn'; fsc = 0.5; fmsg = guessMsg(rtFoot, opt); }
  else if (tm.late) { fv = 'warn'; fsc = 0.5; fmsg = 'Right foot, but late — move earlier'; }
  else { fv = 'good'; fsc = 1; fmsg = fe === 'FB' ? 'In the channel — either foot is fine' : 'Right foot movement'; }
  let pe = null, pv = null, pmsg = '';
  const hitting = isHitting(tr), wide = tr.lxArr > 0.30;
  if (mode === 2 || mode === 3) {
    const left = !played, shouldLeave = tr.yC >= 1.30 || wide;
    if (shouldLeave) {
      pe = 'LEAVE'; pv = left ? 'good' : 'bad';
      pmsg = left ? (tr.yC >= 1.30 ? 'Good — let the bouncer go' : 'Good leave') : (tr.yC >= 1.30 ? 'Bouncer — duck or sway, don’t play' : 'Played at a wide one — edge risk');
    } else if (hitting) { pe = 'PLAY'; pv = left ? 'bad' : 'good'; pmsg = left ? 'Never leave a ball hitting the stumps' : 'Played it — it was hitting'; }
    else { pe = 'EITHER'; pv = 'good'; pmsg = left ? 'OK to leave — missing the stumps' : 'OK to play'; }
  }
  const tg = trig === undefined ? null : gradeTrig(trig);
  const psc = pv === 'good' ? 1 : 0, tsc = tg ? tg.sc : 0;
  const sc = pv ? (tg ? 0.5 * fsc + 0.3 * psc + 0.2 * tsc : 0.6 * fsc + 0.4 * psc) : (tg ? 0.7 * fsc + 0.3 * tsc : fsc);
  const v = (fv === 'bad' || pv === 'bad') ? 'bad' : ((fv === 'warn' || (tg && tg.v !== 'good')) ? 'warn' : 'good');
  const read = fv === 'good' && (pv === null || pv === 'good');      // a correct, on-time, real read (earns XP)
  return { v, sc, fe, fv, fmsg, pe, pv, pmsg, tg, hitting, wide, late: tm.late, guess: tm.guess, read };
}

// Level 4: the shot menu
export const SHOTS = { FD: { n: 'Front defence', f: 'F' }, SD: { n: 'Straight drive', f: 'F' }, FL: { n: 'Flick', f: 'F' },
  BD: { n: 'Back defence', f: 'B' }, BP: { n: 'Back-foot punch', f: 'B' }, PU: { n: 'Pull', f: 'B' }, LV: { n: 'Leave', f: null } };
export const SHOTKEY = { FL: 'F', FD: 'F', SD: 'F', PU: 'B', BD: 'B', BP: 'B' };

export function idealShots(tr) {
  const fe = footFor(tr), h = tr.yC, lx = tr.lxArr, hitting = isHitting(tr);
  if (h >= 1.30) return { best: ['LV'], ok: [], why: 'Head high — duck or sway', hitting };
  if (lx > 0.30) return { best: ['LV'], ok: [], why: 'Wide outside off — leave it', hitting };
  const chan = lx > 0.15 && !hitting, leg = lx < -0.12;
  let r;
  if (fe === 'F') r = leg ? { best: ['FL'], ok: ['FD'], why: 'On the pads — flick' }
    : tr.d <= (tr.spin ? 3.2 : 4.0) ? { best: ['SD'], ok: ['FD'], why: 'Pitched up — drive' } : { best: ['FD'], ok: ['SD'], why: 'Good length — defend forward' };
  else if (fe === 'B') r = h >= 0.85 ? { best: ['PU'], ok: ['BD'], why: 'Waist high — pull' }
    : lx > 0.05 ? { best: ['BP'], ok: ['BD'], why: 'Short, outside off — punch' } : { best: ['BD'], ok: ['BP'], why: 'Short on the stumps — defend back' };
  else r = { best: ['FD', 'BD'], ok: ['SD', 'BP'], why: 'In the channel — defend' };
  if (chan || (!hitting && leg)) r.ok = r.ok.concat(['LV']);
  r.hitting = hitting; return r;
}

export function gradeShot(tr, shot, rt, trig, opt) {
  const I = idealShots(tr), s = shot || 'LV', fe = footFor(tr), tm = shot ? timingOf(tr, rt, opt) : { late: false, guess: false };
  let v, sc, msg;
  if (I.best.includes(s)) { v = 'good'; sc = 1; msg = 'Best shot — ' + I.why.toLowerCase(); }
  else if (I.ok.includes(s)) { v = 'warn'; sc = 0.6; msg = 'OK, but: ' + I.why.toLowerCase(); }
  else {
    v = 'bad'; sc = 0;
    msg = s === 'LV' ? (I.hitting ? 'Never leave a ball hitting the stumps' : I.why)
      : ((fe !== 'FB' && SHOTS[s].f && SHOTS[s].f !== fe) ? 'Wrong foot — ' : 'Wrong shot — ') + I.why.toLowerCase();
  }
  if (v === 'good' && shot && tm.guess) { v = 'warn'; sc = 0.5; msg = guessMsg(rt, opt); }
  else if (v === 'good' && shot && tm.late) { v = 'warn'; sc = 0.6; msg = 'Right shot, but late — decide earlier'; }
  const read = v === 'good';
  const tg = trig === undefined ? null : gradeTrig(trig);
  if (tg) { sc = 0.8 * sc + 0.2 * tg.sc; if (v === 'good' && tg.v !== 'good') v = 'warn'; }
  return { v, sc, fe, fv: v, fmsg: msg, best: I.best, pe: null, pv: null, pmsg: '', tg, hitting: I.hitting, wide: tr.lxArr > 0.30,
    late: tm.late, guess: tm.guess, read };
}
