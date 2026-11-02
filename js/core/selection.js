// Selector report (selection sim) and leave report (leave drill): what a selector would notice, from the ball records. Pure.
const pc = (a, n) => n ? Math.round(100 * a / n) : null;

export function selectorReport(balls, line) {
  const n = balls.length, avg = (xs) => xs.length ? xs.reduce((a, b) => a + b.sc, 0) / xs.length : null;
  const short = (b) => b.cat === 'Short' || b.cat === 'Bouncer';
  const c = {
    reads: balls.filter(b => b.fv === 'good').length,
    plN: balls.filter(b => b.pv).length, plOk: balls.filter(b => b.pv === 'good').length,
    early: balls.filter(b => b.rt != null && line != null && b.rt < line).length,
    fwdShort: balls.filter(b => short(b) && b.foot === 'F').length,
    backFull: balls.filter(b => (b.cat === 'Full' || b.cat === 'Yorker') && b.foot === 'B').length,
    froze: balls.filter(b => !b.foot).length,
    playedWide: balls.filter(b => b.pe === 'LEAVE' && b.pv === 'bad').length,
    leftHitting: balls.filter(b => b.pe === 'PLAY' && b.pv === 'bad').length,
  };
  const sc = avg(balls), pace = avg(balls.filter(b => !b.spin)), spin = avg(balls.filter(b => b.spin));
  const stars = sc == null ? 0 : sc >= 0.9 ? 5 : sc >= 0.8 ? 4 : sc >= 0.7 ? 3 : sc >= 0.55 ? 2 : 1;
  // the single biggest fix: the most frequent fault (ties go to the one that gets you out)
  const faults = [
    [c.leftHitting, `Left ${c.leftHitting} hitting the stumps — if it's on the stumps, play it`],
    [c.fwdShort, `${c.fwdShort} time${c.fwdShort === 1 ? '' : 's'} forward to a short ball — wait for it, then go back`],
    [c.playedWide, `Played at ${c.playedWide} wide one${c.playedWide === 1 ? '' : 's'} — leave outside off, head still`],
    [c.early, `${c.early} early commit${c.early === 1 ? '' : 's'} — watch it out of the hand before you move`],
    [c.backFull, `${c.backFull} time${c.backFull === 1 ? '' : 's'} back to a full ball — get forward to the pitch`],
    [c.froze, `Feet froze ${c.froze} time${c.froze === 1 ? '' : 's'} — move every ball`],
  ].filter(f => f[0] > 0);
  faults.sort((a, b) => b[0] - a[0]);
  const cold = balls[0] ? balls[0].fv === 'good' && (!balls[0].pv || balls[0].pv === 'good') : null;
  return {
    n, stars, sc: sc == null ? null : Math.round(100 * sc), reads: pc(c.reads, n), playLeave: pc(c.plOk, c.plN),
    pace: pace == null ? null : Math.round(100 * pace), spin: spin == null ? null : Math.round(100 * spin), cold, ...c,
    fix: faults.length ? faults[0][1] : 'Nothing to fix — that is selection form',
  };
}

export function leaveReport(balls) {
  const wide = balls.filter(b => b.pe === 'LEAVE'), hitting = balls.filter(b => b.pe === 'PLAY');
  return {
    wide: wide.length, leftWide: wide.filter(b => b.pv === 'good').length, playedWide: wide.filter(b => b.pv === 'bad').length,
    hitting: hitting.length, leftHitting: hitting.filter(b => b.pv === 'bad').length,
  };
}

export function bestMark(sessions) {
  const sel = sessions.filter(s => s.kind === 'selection' && s.mark);
  if (!sel.length) return null;
  return { last: sel[sel.length - 1].mark, best: Math.max(...sel.map(s => s.mark)) };
}
