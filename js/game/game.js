// The session runner: plans → balls → grading → feedback. Owns in-session input.
// Timing: the scene runs on requestAnimationFrame timestamps; every press is stamped with event.timeStamp
// (or the controller's bracketed gamepad.timestamp) and resolved against the frame that showed the release.
import { app, $, show } from '../app.js';
import { T_REL, T_END } from '../core/physics.js';
import { grade, gradeShot, categorize, SHOTS, SHOTKEY, guessLimit } from '../core/rules.js';
import { genBall, relCue, BOWLERS, PACE, SPINNERS } from '../core/bowling.js';
import { LEVELS, STAGE_START, STAGES, stairStep, clampLevel, stageProgress } from '../core/levels.js';
import { outcome } from '../core/match.js';
import { BallClock } from '../core/timing.js';
import { FOOT, FOOT_S } from '../core/action.js';
import { xpForBall, ctxMult, summarize } from '../core/progress.js';
import { buildPlan } from './modes.js';
import * as ui from '../ui/session-ui.js';

const NAMES = { F: 'FRONT', B: 'BACK', P: 'PLAY' };
const LEAD_MS = 900;
const rnd = (a, b) => a + Math.random() * (b - a);

export const G = { state: 'home', sess: null, cur: null, held: false, last: null, wait: null, pause: null, timer: null };
export const clock = new BallClock();
let PROF = BOWLERS[0];
let hooks = { showEnd() {}, goHome() {}, enter() {}, leave() {} };
export function setHooks(h) { hooks = h; }

// ---------- session start ----------
export function startSession(kind, opts = {}) {
  const { db, S } = app;
  app.audio.unlock();
  const plan = buildPlan(kind, { S, boss: opts.boss });
  const lvl = S.levelMode === 'auto' ? clampLevel(db.level) : clampLevel(+S.levelMode);
  const sess = G.sess = {
    kind, plan, title: plan.title, segI: 0, segN: 0, introShown: -1, balls: [], level: lvl, d: db.levelD == null ? 0.5 : db.levelD, peak: lvl,
    streak: 0, best: 0, start: Date.now(), over: 0, bstart: Math.floor(Math.random() * 6), zm: 0, xp: 0, boss: plan.boss || null, lineup: null,
  };
  if (plan.match) {
    sess.match = { runs: 0, wk: 0, target: 14 + Math.floor(Math.random() * 9) };
    sess.mmode = db.level >= STAGE_START[4] ? 4 : (db.level >= STAGE_START[3] ? 3 : 2);
  }
  hooks.enter();
  show('hud', true); show('hint', true); document.body.classList.add('insession');
  if (S.fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  nextBall();
}
// Nets rules: bowlers take turns ball by ball (2 quicks + 1 spinner, or 3 quicks).
function lineup() {
  const pc = PACE.slice().sort(() => Math.random() - 0.5).slice(0, 2);
  return app.S.spinners ? pc.concat([SPINNERS[Math.floor(Math.random() * 2)]]) : pc.concat([PACE.find(x => !pc.includes(x))]);
}
function pickBowler(seg) {
  const s = G.sess, S = app.S, ov = s.over, ps = BOWLERS[PACE[(s.bstart + ov) % 3]], sp = BOWLERS[SPINNERS[(s.bstart + ov) % 2]];
  if (seg.boss) return seg.boss.prof;
  if (seg.walk) { if (!s.lineup) s.lineup = lineup(); return BOWLERS[s.lineup[ov % s.lineup.length]]; }
  if (seg.drill === 'spin') return sp;
  if (seg.drill === 'short') return ps;
  if (s.match) return (ov === 2 && S.spinners) ? sp : ps;
  return (S.spinners && ov % 3 === 0) ? sp : ps;
}
// Smart feeding: the length you get wrong most is bowled more.
export function weakest(type, mode) {
  const st = (app.db.cs && app.db.cs[type]) || {}, cats = ['Full', 'Good', 'Short'].concat(mode >= 2 ? ['Wide off'] : []).concat(mode >= 2 && type === 'pace' ? ['Bouncer'] : []);
  let w = null, wv = 0.8;
  for (const c of cats) { const a = st[c]; if (!a || a.length < 6) continue; const m = a.reduce((x, y) => x + y, 0) / a.length; if (m < wv) { wv = m; w = c; } }
  return w;
}
function feedLog(type, cat, sc) {
  const db = app.db; db.cs = db.cs || { pace: {}, spin: {} };
  const t = db.cs[type] = db.cs[type] || {}, a = t[cat] = t[cat] || [];
  a.push(+sc.toFixed(2)); if (a.length > 30) a.shift();
}

// A banner between segments (and before tutorial balls); the next ball follows by itself.
function banner(text, ms) {
  G.state = 'intro';
  const b = $('banner'); b.textContent = text; show(b, true);
  app.voice.say(text.split('·').slice(0, 2).join('.').toLowerCase());
  G.timer = setTimeout(() => { show(b, false); if (G.state === 'intro') nextBall(); }, ms);
}

// ---------- each ball ----------
export function nextBall() {
  const { db, S, world, traj, perf } = app, sess = G.sess;
  if (!sess) return;
  G.wait = null; clearTimeout(G.timer); world.clearTrail(); world.heStop();
  show('card', false); show('rctl', false); document.body.classList.remove('result'); setHeld(false); $('rcSlow').classList.remove('on');
  const m = sess.match;
  if (m && (m.wk >= 3 || m.runs >= m.target)) { endSession(); return; }
  let seg = sess.plan.segs[sess.segI];
  if (sess.segN >= seg.n) { sess.segI++; sess.segN = 0; seg = sess.plan.segs[sess.segI]; if (!seg) { endSession(); return; } }
  if (seg.intro && sess.introShown !== sess.segI) { sess.introShown = sess.segI; banner(seg.intro, 2400); return; }
  if (seg.coach && seg.coach[sess.segN] && sess.coached !== sess.segN) { sess.coached = sess.segN; banner(seg.coach[sess.segN], 2600); return; }
  $('zones').classList.toggle('lbl', sess.balls.length < 3 || seg.labels);
  const perBall = !m && (seg.walk || S.rotate === 'ball');
  if (perBall || sess.balls.length % 6 === 0) { sess.over++; PROF = pickBowler(seg); world.bowler.setKit(PROF.c); }
  const lvl = clampLevel(sess.level + seg.levelDelta);
  const LV = seg.fixed ? { m: seg.fixed.m, k: seg.fixed.k, o: seg.fixed.o == null ? null : seg.fixed.o } : LEVELS[lvl];
  const gm = m ? sess.mmode : (seg.drill === 'short' ? 1 : (seg.drill === 'spin' ? Math.max(1, LV.m) : LV.m));
  const type = PROF.spin ? 'spin' : 'pace';
  const weak = (S.smart && seg.weakP > 0 && !m) ? weakest(type, gm) : null;
  const kph = m ? Math.max(100, Math.min(LEVELS[db.level].k, S.maxKph)) : Math.min(LV.k, S.maxKph);
  const occ = m ? null : (seg.walk && !seg.fixed ? null : LV.o);
  const g = genBall(S, { kph, mode: gm, drill: seg.drill, spin: PROF.spin || null, weak, weakP: seg.weakP, hand: db.profile.hand,
    club: S.club && !['short', 'spin'].includes(seg.drill) && !seg.boss && !seg.script, trademark: seg.boss ? seg.boss.trademark : null });
  const sc = seg.script && seg.script[sess.segN];
  if (sc) { g.d = sc.d; g.lx = sc.lx || 0; g.cat = sc.cat; g.opt = { varn: null }; }
  const rel = relCue(g.d, !!PROF.spin), jx = rnd(-0.1, 0.1);
  world.bowler.pose(T_REL, PROF, rel, jx);
  const job = traj.request(world.releasePoint(), g.kph, g.d, g.lx, g.opt);      // solved in the worker during the run-up
  world.bowler.pose(0, PROF, rel, jx); world.bowlerMoved(); world.ballToHand();
  world.ball.visible = true; world.ball.rotation.set(0, 0, 0);
  G.cur = { g, job, tr: null, prof: PROF, rel, jx, occ, mode: gm, type, lvl, seg, fed: weak && g.cat === weak ? weak : null,
    trig: null, foot: null, played: false, shot: null, src: null, si: 0, sounds: false, lblOff: !!seg.labels };
  clock.reset();
  if (sess.zm !== gm) { ui.setZones(gm, S); sess.zm = gm; }
  G.state = 'run'; perf.ballStart(); hudUpdate();
}

// Called every animation frame with the rAF timestamp. Returns true when the frame must be drawn black (occlusion).
export function frame(ts) {
  if (G.state === 'run' && G.cur) return stepBall(ts);
  if (G.state === 'result') { if (app.world.heActive) app.world.heStep(ts); if (G.wait) walkBack(ts); }
  return false;
}
function stepBall(ts) {
  const cur = G.cur, { world, audio, traj } = app;
  if (!clock.started) clock.start(ts, LEAD_MS);
  const t = clock.sceneTime(ts);
  world.bowler.pose(Math.min(Math.max(t, 0), T_END), cur.prof, cur.rel, cur.jx); world.bowlerMoved();
  // footsteps: scheduled ~150 ms ahead so they're heard on time
  const FT = cur.prof.spin ? FOOT_S : FOOT;
  while (cur.si < FT.length && clock.t0 + FT[cur.si][0] * 1000 <= ts + 150) {
    const at = clock.t0 + FT[cur.si][0] * 1000; if (at >= ts - 30) audio.step(FT[cur.si][1], at); cur.si++;
  }
  if (!cur.lblOff && t > 0.4) { cur.lblOff = true; $('zones').classList.remove('lbl'); }
  const tau = t - T_REL;
  if (tau < 0) { world.ballToHand(); clock.frame(ts, null, null); return false; }
  if (!cur.tr) cur.tr = traj.get(cur.job);
  const tr = cur.tr;
  if (!cur.sounds) {
    cur.sounds = true;
    const relAt = clock.t0 + T_REL * 1000, bAt = relAt + tr.tb * 1000;
    const seen = cur.occ === null || cur.occ > tr.tb;                      // under blackout you don't hear the bounce either
    if (seen && bAt > ts) audio.thud(bAt);
    if (cur.occ === null) audio.net(relAt + (tr.ta + 0.32) * 1000);
  }
  const black = clock.frame(ts, tr.tb, cur.occ);
  tr.pos(tau, world.ball.position);
  if (tr.spin) world.ball.rotation.z = tau * (cur.prof.spin === 'off' ? -55 : 55); else world.ball.rotation.x = tau * 75;   // seam: backspin; spinner: side-spin
  if (tau >= tr.ta + 0.35) finishBall();
  return black;
}

// ---------- presses ----------
// k: 'F' | 'B' | 'P' | 'T' | 'S:XX' (shot) | 'TAP' (phone: meaning from position and timing). ts = the press's own timestamp.
export function act(k, ts, src, y, x) {
  const cur = G.cur;
  if (G.state !== 'run' || !cur || !k || !clock.started) return;
  const t = clock.sceneTime(ts), tau = t - T_REL, S = app.S;
  if (t < 0.3) return;
  if (k === 'TAP') {
    if (S.trigger && cur.trig === null && tau < -0.02) k = 'T';
    else if (cur.mode === 4) { const row = y < 0.5 ? 0 : 1, col = x < 1 / 3 ? 0 : (x < 2 / 3 ? 1 : 2); k = 'S:' + [['FL', 'FD', 'SD'], ['PU', 'BD', 'BP']][row][col]; }
    else k = cur.foot ? 'P' : (y < 0.5 ? 'F' : 'B');
  }
  if (k === 'T') { if (S.trigger && cur.trig === null && tau < 0.25) { cur.trig = t; ui.flash('·', 'cT'); app.audio.tone(700, 700, 0.04, 'sine', 0.1); } return; }
  if (cur.mode === 4) {
    if (k === 'F') k = 'S:FD'; else if (k === 'B') k = 'S:BD';
    if (k.startsWith('S:') && !cur.shot) {
      if (tau < -0.1) return;
      const sh = k.slice(2); cur.shot = sh; cur.foot = SHOTS[sh].f; cur.played = true; cur.src = src; clock.stamp('foot', ts);
      ui.flash(SHOTS[sh].n.toUpperCase(), 'c' + cur.foot + ' small'); app.audio.tone(420, 420, 0.05, 'sine', 0.12); app.haptics.tap();
    }
    return;
  }
  if (k.startsWith('S:')) k = SHOTKEY[k.slice(2)];
  if (!cur.foot && (k === 'F' || k === 'B')) {
    if (tau < -0.1) return;
    cur.foot = k; cur.src = src; clock.stamp('foot', ts);
    ui.flash(NAMES[k], 'c' + k); app.audio.tone(420, 420, 0.05, 'sine', 0.12); app.haptics.tap(); return;
  }
  if (cur.foot && (cur.mode === 2 || cur.mode === 3) && !cur.played && tau <= (cur.tr ? cur.tr.tc : 0.6) + 0.05) {
    cur.played = true; clock.stamp('play', ts); ui.flash('PLAY', 'cP'); app.audio.tone(300, 300, 0.05, 'sine', 0.1);
  }
}

// ---------- result ----------
function finishBall() {
  const { db, S, world, perf, audio, voice, haptics } = app, sess = G.sess, cur = G.cur, tr = cur.tr, seg = cur.seg;
  G.state = 'result'; world.ball.visible = false;
  app.onBallStats(perf.ballEnd());                                    // adaptive quality decides between balls
  const rt = clock.rtOf('foot'), tbP = clock.tbPresented(tr.tb), lim = guessLimit(db.rtBase), opt = { tbP, guessBelow: lim };
  const trigArg = S.trigger ? cur.trig : undefined;
  const g = cur.mode === 4 ? gradeShot(tr, cur.shot, rt, trigArg, opt) : grade(tr, cur.foot, rt, cur.played, cur.mode, trigArg, opt);
  const xp = g.read ? xpForBall({ lvl: cur.lvl }, ctxMult(seg.xpCtx)) : 0;
  const occA = clock.occPresented();
  const rec = {
    d: +tr.d.toFixed(2), lx: +tr.lxArr.toFixed(3), lxB: +tr.lxB.toFixed(3), kph: cur.g.kph, occ: cur.occ, lvl: cur.lvl, mode: cur.mode,
    cat: categorize(tr), bowler: cur.prof.n, spin: !!tr.spin, varn: tr.varn, fed: cur.fed,
    trig: cur.trig === null ? null : +(cur.trig - T_REL).toFixed(3), tv: g.tg ? g.tg.v : null,
    foot: cur.foot, shot: cur.shot, rt: cur.foot && rt != null ? +rt.toFixed(3) : null,
    read: (cur.foot && rt != null && db.rtBase) ? +Math.max(0, rt - db.rtBase).toFixed(3) : null,
    played: cur.played, fe: g.fe, fv: g.fv, pe: g.pe, pv: g.pv, v: g.v, sc: +g.sc.toFixed(3),
    ok: g.read, xp, guess: g.guess || undefined, late: g.late || undefined, src: cur.src || undefined,
    hz: perf.hz, tbP: +tbP.toFixed(3), occA: occA == null ? undefined : +occA.toFixed(3), seg: sess.segI, tm: cur.g.tm || undefined,
  };
  sess.balls.push(rec); sess.segN++; sess.xp += xp;
  feedLog(cur.type, rec.cat === 'Yorker' ? 'Full' : rec.cat, g.sc);
  sess.streak = g.v === 'good' ? sess.streak + 1 : 0; sess.best = Math.max(sess.best, sess.streak);
  const silent = seg.fb === 'end' || (S.feedback === 'end' && !sess.match);
  if (silent) {                         // nets rules: no verdict; the bowler walks back (or a short pause)
    G.cur = null; hudUpdate();
    if (seg.walk) {
      const dur = Math.max(4, +(seg.gap || S.netsGap || 20)) * 1000;
      G.wait = { start: performance.now(), dur, from: { x: world.bowler.root.position.x, z: world.bowler.root.position.z }, last: -1, prof: cur.prof };
      show('rctl', true); document.body.classList.add('result');
      ['rcHold', 'rcRep', 'rcSlow'].forEach(i => $(i).classList.add('hidden')); $('rcNext').textContent = 'Ready ▶';
      G.timer = setTimeout(nextBall, dur);
    } else G.timer = setTimeout(nextBall, Math.max(0.8, +S.gap) * 1000);
    return;
  }
  // level: 85% staircase
  let lvlMsg = '';
  const prevM = LEVELS[sess.level].m;
  if (seg.adapt && S.levelMode === 'auto') {
    const r = stairStep(sess.level, sess.d, g.sc);
    sess.level = r.level; sess.d = r.d; sess.peak = Math.max(sess.peak, r.level);
    if (r.moved) lvlMsg = (r.moved > 0 ? 'LEVEL UP → ' : 'LEVEL DOWN → ') + LEVELS[r.level].n;
  }
  let oc = null;
  if (sess.match) { oc = outcome(g, tr, cur.mode, cur); rec.oc = oc.txt; if (oc.out) sess.match.wk++; else sess.match.runs += oc.r; }
  // feedback fades as a stage is mastered: after the first third of a stage, correct balls get a quick verdict only
  const brief = !oc && !lvlMsg && S.feedback === 'auto' && seg.fb === 'auto' && g.v === 'good' && stageProgress(cur.lvl) >= 0.34 && sess.balls.length > 3;
  G.last = { tr, v: g.v };
  let wait = 0;
  if (brief) {
    ui.bigMark('good'); if (xp) ui.flash('+' + xp + ' XP', 'cX small');
    const live = $('live'); if (live) live.textContent = 'Right.';
  } else {
    world.setTrail(tr, { good: 0x22c55e, warn: 0xf5a524, bad: 0xef4444 }[g.v]);
    const card = { g, tr, rec, mode: cur.mode, shot: cur.shot, foot: cur.foot, played: cur.played, rt, tbP, rtBase: db.rtBase, guessAt: lim,
      fed: cur.fed, xp, oc, lvlMsg, score: sess.match ? `${sess.match.runs}/${sess.match.wk}` : '', balls: sess.balls, hand: db.profile.hand };
    $('rcHold').classList.remove('hidden'); $('rcNext').textContent = 'Next ▶';
    show('rctl', true); document.body.classList.add('result');
    $('rcRep').classList.toggle('hidden', !S.hawk); $('rcSlow').classList.toggle('hidden', !S.hawk);
    if (S.hawk) { world.heStart(tr, 1500, performance.now()); wait = 1500; G.timer = setTimeout(() => { if (G.state === 'result') ui.showCard(card); }, wait); }
    else ui.showCard(card);
  }
  // sound, voice, haptics
  if (g.v === 'good') audio.good();
  else if (g.v === 'warn') {
    audio.warn();
    if (!oc) voice.say(cur.mode === 4 ? (g.guess ? 'Too quick.' : 'Better shot: ' + SHOTS[g.best[0]].n + '.')
      : g.guess ? 'Too quick. Watch it.' : (g.fv === 'warn' ? 'Move earlier.' : (g.tg && g.tg.v === 'bad' ? 'Trigger.' : (cur.trig !== null && cur.trig < 2.73 ? 'Trigger later.' : 'Trigger earlier.'))));
  } else {
    audio.bad();
    if (!oc) {
      if (cur.mode === 4) voice.say(g.best[0] === 'LV' ? 'Leave it.' : SHOTS[g.best[0]].n + '.');
      else if (g.fv === 'bad') voice.say(!cur.foot ? 'Move your feet.' : (g.fe === 'F' ? 'Front foot.' : 'Back foot.'));
      else voice.say(g.pe === 'LEAVE' ? 'Leave it.' : 'Play it. It was hitting.');
    }
  }
  if (oc) voice.say(oc.out ? 'Out!' : (oc.r >= 4 ? 'Four!' : (oc.r ? oc.r + '.' : '')));
  haptics.result(g.v);
  if (lvlMsg) {
    const nm = LEVELS[sess.level].m;
    if (lvlMsg.startsWith('LEVEL UP')) audio.chime();
    setTimeout(() => voice.say(nm !== prevM ? `Level ${nm}. ${({ 1: 'Feet only', 2: 'Now play or leave', 3: 'Variety. Slower balls and swing', 4: 'Shot choice' })[nm]}.`
      : (lvlMsg.startsWith('LEVEL UP') ? 'Level up.' : 'Level down.')), 900);
  }
  hudUpdate(); G.cur = null;
  if (!G.held) G.timer = setTimeout(nextBall, wait + Math.max(0.8, +S.gap) * 1000 * (brief ? 0.6 : 1) + (g.v === 'good' ? 0 : 700) + (oc && oc.out ? 800 : 0));
}

function walkBack(ts) {
  const w = G.wait, e = (ts - w.start) / 1000;
  app.world.bowler.walkBack(Math.max(0, e), w, w.prof); app.world.bowlerMoved();
  const rem = Math.max(0, Math.ceil((w.dur - (ts - w.start)) / 1000));
  if (rem !== w.last) { w.last = rem; ui.hud({ hBall: `<small>NEXT BALL</small>${rem} s · ${G.sess.balls.length} / ${segTotal()}` }); }
}
function segTotal() { const s = G.sess; return s.plan.segs.reduce((a, x) => a + x.n, 0); }

function hudUpdate() {
  const s = G.sess; if (!s) return;
  const seg = s.plan.segs[s.segI], n = s.balls.length + (G.cur && G.state !== 'result' ? 1 : 0), tot = segTotal(), S = app.S;
  const segTxt = s.plan.segs.length > 1 && seg ? `${seg.name.toUpperCase()} · ` : '';
  const silent = seg && (seg.fb === 'end' || (S.feedback === 'end' && !s.match));
  const LV = LEVELS[clampLevel(s.level + (seg ? seg.levelDelta : 0))];
  const pace = PROF.spin ? 'spin' : Math.min(seg && seg.fixed ? seg.fixed.k : LV.k, S.maxKph) + ' kph';
  let lv;
  if (s.match) lv = `<small>MATCH</small>${s.match.runs}/${s.match.wk} · need ${Math.max(0, s.match.target - s.match.runs)} off ${18 - s.balls.length}`;
  else if (s.boss) lv = `<small>${s.kind === 'trial' ? 'TRIAL' : 'BOSS'}</small>${s.boss.n} · ${pace}`;
  else if (silent) lv = `<small>NETS</small>L${LV.m} · ${pace} · no feedback`;
  else if (seg && seg.drill) lv = `<small>DRILL</small>${seg.drill === 'spin' ? 'SPIN' : 'SHORT BALLS · ' + pace}`;
  else lv = `<small>LEVEL ${clampLevel(s.level + (seg ? seg.levelDelta : 0)) + 1}</small>${LV.n.replace(/\d+ kph/, pace)}${seg && seg.adapt ? `<i class="lvbar"><u style="width:${Math.round(s.d * 100)}%"></u></i>` : ''}`;
  const sc = s.balls.length ? Math.round(100 * s.balls.reduce((a, b) => a + b.sc, 0) / s.balls.length) : 0;
  ui.hud({
    hBall: `<small>BALL</small>${segTxt}${Math.max(1, n)}${isFinite(tot) ? ' / ' + tot : ''} · ${PROF.n}`,
    hLevel: lv, hAcc: `<small>SCORE</small>${s.balls.length ? sc + '%' : '—'}`, hStreak: `<small>XP</small>${s.xp}`,
  });
  ui.hudVisible('hAcc', !silent);
}

// ---------- hold / replay ----------
function setHeld(on) {
  G.held = on; $('rcHold').textContent = on ? '▶ Play' : '⏸ Hold'; $('rcHold').classList.toggle('on', on);
  if (on) clearTimeout(G.timer);
  app.world.heHold(on, performance.now());
}
export function holdToggle() { if (G.state !== 'result' || G.wait) return; setHeld(!G.held); }
export function replay(slow) {
  if (G.state !== 'result' || !G.last || G.wait || !app.S.hawk) return;
  clearTimeout(G.timer); app.world.setTrail(G.last.tr, { good: 0x22c55e, warn: 0xf5a524, bad: 0xef4444 }[G.last.v]);
  app.world.heStart(G.last.tr, slow ? 4500 : 1500, performance.now()); setHeld(true); app.world.heHold(false, performance.now());
  $('rcSlow').classList.toggle('on', !!slow);
}

// ---------- pause / end ----------
export function togglePause() {
  const { world, audio } = app;
  if (G.state === 'paused') {
    show('pause', false); document.body.classList.add('insession');
    const now = performance.now();
    if (G.pause.was === 'run') { clock.resume(now); G.state = 'run'; if (G.cur) G.cur.sounds = false; }
    else { G.state = 'result'; if (!G.held) nextBall(); }
    G.pause = null; return;
  }
  if (G.state !== 'run' && G.state !== 'result') return;
  G.pause = { was: G.state, at: performance.now() }; clearTimeout(G.timer);
  if (G.state === 'run') clock.pause(G.pause.at);
  audio.cancel();
  G.state = 'paused'; show('pause', true); document.body.classList.remove('insession');
  world.ball.visible = G.pause.was === 'run' && !!G.cur;
}
function cleanup() {
  const { world } = app;
  clearTimeout(G.timer); world.clearTrail(); world.heStop(); show('rctl', false); show('banner', false); document.body.classList.remove('result');
  G.held = false; G.cur = null; G.wait = null; world.ball.visible = false; app.audio.cancel();
  ['card', 'hud', 'hint', 'pause'].forEach(id => show(id, false)); document.body.classList.remove('insession');
  world.bowler.pose(0, PROF, 0, 0); world.bowlerMoved();
  hooks.leave();
}
export function endSession() {
  const { db, S } = app, s = G.sess;
  cleanup();
  if (!s || !s.balls.length) { G.sess = null; hooks.goHome(); return; }
  const n = s.balls.length, score = Math.round(100 * s.balls.reduce((a, b) => a + b.sc, 0) / n);
  if (s.match) {
    const m = s.match; m.won = m.runs >= m.target;
    m.res = m.won ? `Won by ${3 - m.wk} wicket${3 - m.wk === 1 ? '' : 's'}` : `Lost by ${m.target - m.runs - 1 <= 0 ? 1 : m.target - m.runs - 1} run${m.target - m.runs - 1 === 1 ? '' : 's'}`;
  }
  const rec = { id: s.start.toString(36), date: new Date(s.start).toISOString(), kind: s.kind, drill: s.plan.drill || null, match: s.match || null,
    n, score, peak: s.peak, end: s.level, bestStreak: s.best, balls: s.balls, xp: s.xp, sum: summarize(s.balls), boss: s.boss ? s.boss.id : undefined };
  db.sessions.push(rec);
  if (S.levelMode === 'auto' && s.plan.segs.some(x => x.adapt)) { db.level = s.level; db.levelD = s.d; }
  app.saveNow();
  G.state = 'end'; hooks.showEnd(s, score, rec);
}
export function abandon() { cleanup(); G.sess = null; G.state = 'home'; }
export function stageName(i) { const L = LEVELS[clampLevel(i)]; return `L${L.m} ${STAGES[L.m]}`; }

// ---------- in-session input (menus are handled in main.js) ----------
const KEYMAP = { q: 'S:FL', w: 'S:FD', e: 'S:SD', a: 'S:PU', s: 'S:BD', d: 'S:BP', ' ': 'T', t: 'T', arrowleft: 'F', f: 'F', '4': 'F', arrowright: 'B', b: 'B', '6': 'B',
  arrowdown: 'P', arrowup: 'P', '5': 'P', '2': 'P', clear: 'P', enter: 'P' };
export function onKey(e) {
  const k = e.key.toLowerCase();
  if (G.state === 'intro') return true;
  if (G.state === 'paused') {
    if (k === ' ' || k === 'enter' || k === 'p') { e.preventDefault(); togglePause(); } else if (k === 'e') endSession(); else if (k === 'h') { abandonToHome(); }
    return true;
  }
  if (G.state !== 'run' && G.state !== 'result') return false;
  if (k === 'escape' || k === 'p') { togglePause(); return true; }
  if (G.state === 'run' && KEYMAP[k]) { e.preventDefault(); if (!e.repeat) act(KEYMAP[k], e.timeStamp, 'key'); }
  else if (G.state === 'result') {
    if (k === ' ' || k === 'enter' || k === 'n') { e.preventDefault(); nextBall(); }
    else if (k === 'h') { e.preventDefault(); holdToggle(); }
    else if (k === 'r') { e.preventDefault(); replay(false); }
    else if (k === 's') { e.preventDefault(); replay(true); }
  }
  return true;
}
export function onPointer(e) {
  if (G.state === 'intro') { e.preventDefault(); return true; }
  if (G.state !== 'run' && G.state !== 'result') return false;
  if (e.target.closest && e.target.closest('#pBtn,#rctl')) return true;
  if (e.pointerType === 'mouse') {
    if (G.state !== 'run') return true;
    e.preventDefault(); act({ 0: 'F', 1: 'T', 2: 'B' }[e.button] || 'P', e.timeStamp, 'mouse'); return true;
  }
  e.preventDefault();
  if (G.state === 'run') act('TAP', e.timeStamp, 'touch', e.clientY / innerHeight, e.clientX / innerWidth);
  else if (!G.held && !G.wait) nextBall();                      // tap = next ball (nets: only the Ready button skips the wait)
  return true;
}
export function onPad(E, su, sd, ts) {
  if (G.state === 'intro') return true;
  if (E[9]) { if (G.state === 'run' || G.state === 'result' || G.state === 'paused') { togglePause(); return true; } return false; }
  if (G.state === 'run') {
    if (E[4] || E[5]) act('T', ts, 'pad');
    if (G.cur && G.cur.mode === 4) {
      const sh = E[3] ? 'FD' : E[2] ? 'SD' : E[6] ? 'FL' : E[0] ? 'BD' : E[1] ? 'BP' : E[7] ? 'PU' : su ? 'FD' : sd ? 'BD' : null;
      if (sh) act('S:' + sh, ts, 'pad');
    } else if (E[3] || E[12] || su) act('F', ts, 'pad');
    else if (E[0] || E[13] || sd) act('B', ts, 'pad');
    else if (E[1] || E[2] || E[6] || E[7]) act('P', ts, 'pad');
    return true;
  }
  if (G.state === 'result') {
    if (E[0]) nextBall(); else if (E[3]) holdToggle(); else if (E[2]) replay(true); else if (E[1]) replay(false);
    return true;
  }
  if (G.state === 'paused') { if (E[0]) togglePause(); else if (E[1]) abandonToHome(); return true; }
  return false;
}
export function abandonToHome() { cleanup(); G.sess = null; G.state = 'home'; hooks.goHome(); }
