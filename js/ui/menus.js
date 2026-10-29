// Menus: Play (home), Career, More, How it works, first-run onboarding, the tab bar, and controller/keyboard
// focus navigation (D-pad / stick / arrows move, A / Enter choose, B / Esc back, LB / RB switch tabs).
import { app, $, show, esc } from '../app.js';
import { LEVELS, STAGES, clampLevel } from '../core/levels.js';
import { totalXP, streak, week, WEEK_GOAL, dayKey } from '../core/progress.js';
import { TIERS, BOSSES, careerState, bossFor } from '../core/career.js';

export const TABS = ['home', 'career', 'progress', 'more'];
const SCREENS = ['home', 'career', 'progress', 'more', 'settings', 'end', 'pause', 'rtest', 'howto', 'onboard', 'calib', 'sync', 'sandbox'];
export function only(id) {
  for (const s of SCREENS) show(s, s === id);
  app.state = id || 'none';
  const tab = TABS.includes(id);
  show('nav', tab);
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === id));
  if (id) { const el = $(id); if (el) el.scrollTop = 0; }
}

const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1.5 3 5 4.5 5 9a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2.5-5 0 1.5.8 2.5 1.7 2.5 0-2.5-.8-4 .8-6.5z"/></svg>';
const CATNAME = { Full: 'pitched-up balls', Good: 'good-length balls', Short: 'short balls', 'Wide off': 'leaving outside off', Bouncer: 'bouncers' };

function drillName(s) {
  if (s.match) return 'Match · ' + s.match.runs + '/' + s.match.wk + ' · ' + (s.match.res || '');
  const k = s.kind || s.drill;
  return ({ short: 'Short-ball drill', spin: 'Spin drill', nets: 'Nets session', daily: 'Daily session', quick: 'Quick 30', endless: 'Endless', session: 'Classic 50',
    trial: 'Trial' + (s.boss ? ' · ' + (BOSSES.find(b => b.id === s.boss) || {}).n : ''), boss: 'Boss nets', tutorial: 'Tutorial' })[k] || 'Session';
}

// ---------- Play ----------
export function renderHome(weakest) {
  const { db } = app, cs = careerState(db), today = dayKey(new Date());
  $('pTier').textContent = cs.name.toUpperCase();
  $('pXP').textContent = totalXP(db).toLocaleString() + ' XP';
  const st = streak(db);
  $('pStreak').innerHTML = FLAME + `${st} day${st === 1 ? '' : 's'}`;
  const doneToday = db.sessions.some(s => s.kind === 'daily' && dayKey(s.date) === today);
  const w = weakest('pace', LEVELS[db.level].m);
  $('heroSub').innerHTML = doneToday ? 'Done today <b>✓</b> — go again, or try the nets.'
    : `Warm-up · focus on <b>${esc(CATNAME[w] || 'your weak spot')}</b> · pressure over · about 10 minutes`;
  const wk = week(db), n = wk.filter(d => d.done).length;
  $('week').innerHTML = wk.map((d, i) => `<div class="wd${d.done ? ' done' : ''}${d.k === today ? ' today' : ''}${d.future ? ' future' : ''}"><i>${d.done ? '✓' : ''}</i>${'MTWTFSS'[i]}</div>`).join('');
  $('weekTxt').textContent = n >= WEEK_GOAL ? `Weekly goal met ✓ (${n} days)` : `${n} of ${WEEK_GOAL} practice days this week · 20+ balls counts`;
  const L = LEVELS[db.level], nx = LEVELS[db.level + 1];
  $('lvlCard').innerHTML = `<small>LEVEL ${db.level + 1} OF ${LEVELS.length} · ${STAGES[L.m]}</small><b>L${L.m} · ${L.k} kph · ${L.o === null ? 'full view' : L.o === 0 ? 'black at release' : 'black +' + Math.round(L.o * 1000) + ' ms'}</b>
    <div class="bar2" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round((db.levelD || 0) * 100)}"><u style="width:${Math.round((db.levelD || 0) * 100)}%"></u></div>
    <span class="sub">${nx ? 'Next: ' + esc(nx.n.replace(/^L\d /, '')) : 'Top level'} · stays near 85% right</span>`;
  const nb = cs.next;
  $('trialTitle').textContent = nb ? `Trial: ${nb.n}` : 'Career complete';
  $('trialSub').textContent = !nb ? 'India A. Replay any boss in Career.' : cs.unlocked ? `For ${TIERS[nb.tier]} · 2 overs · 80% to pass` : `Unlocks at ${LEVELS[nb.unlock].n.split(' · ').slice(0, 2).join(' · ')}`;
  $('bTrialTile').classList.toggle('locked', !!nb && !cs.unlocked);
  $('setupTip').innerHTML = document.body.classList.contains('touch')
    ? 'Phone: prop it at eye height in landscape, about an arm’s length away, and stand in your stance. Tap the top half for FRONT, bottom half for BACK — and make the real step as you tap.'
    : 'PC: stand 2.5–3 m back in your stance, controller in hand, eyes on the bowler’s hand. Make the real step as you press. For true size, set <b>Settings → View → Life-size</b>.';
  const ss = db.sessions;
  $('hist').innerHTML = ss.length ? '<div class="hh">RECENT</div>' + ss.slice(-5).reverse().map(s => {
    const d = new Date(s.date);
    return `<div><span>${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span>${s.n} balls</span><span>${s.score}%</span><span>${s.xp ? s.xp + ' XP' : ''}</span><span>${esc(drillName(s))}</span></div>`;
  }).join('') : '';
  only('home');
}

// ---------- Career ----------
export function bossCard(b, db, unlocked) {
  const L = LEVELS[b.unlock], best = db.bosses[b.id];
  const hex = '#' + b.prof.c.toString(16).padStart(6, '0');
  return `<div class="boss"><div class="av" style="background:${hex}">${esc(b.n.replace('The ', '')[0])}</div><div>
    <small class="kicker">TRIAL FOR ${TIERS[b.tier].toUpperCase()}</small><h3>${esc(b.n)}</h3><p>${esc(b.blurb)}</p>
    <span class="tm">TRADEMARK: ${esc(b.trademark.name.toUpperCase())}</span> <span class="tm">L${b.spec.m} · ${Math.min(b.spec.k, app.S.maxKph)} kph</span>
    <p><b>Key:</b> ${esc(b.skill)}${best != null ? ` · Best: ${best}%` : ''}</p>
    <div class="row">${unlocked ? `<button class="cta" data-trial="${b.id}"><span class="ctaPlay"></span>Start trial</button>`
      : `<button class="btn" disabled>Locked — reach ${esc(L.n.split(' · ').slice(0, 2).join(' · '))} in training first (you’re at ${esc(LEVELS[db.level].n.split(' · ').slice(0, 2).join(' · '))})</button>`}</div></div></div>`;
}
export function renderCareer(onTrial, onBoss) {
  const { db } = app, cs = careerState(db);
  $('nextTrial').innerHTML = cs.next ? bossCard(cs.next, db, cs.unlocked) : '<div class="boss"><div class="av" style="background:#a16207">★</div><div><h3>Selected for India A</h3><p>Every boss beaten. Keep your eye in with boss nets and the daily session.</p></div></div>';
  $('ladder').innerHTML = TIERS.map((t, i) => {
    const b = bossFor(i), state = i < cs.tier ? 'done' : i === cs.tier ? 'cur' : 'lock';
    return `<div class="rung ${state}"><span class="num">${i < cs.tier ? '✓' : i + 1}</span><div><b>${t}</b><small>${i === 0 ? 'Where everyone starts' : `Beat ${esc(b.n)} · ${esc(b.trademark.name.toLowerCase())}`}${b && db.bosses[b.id] != null ? ` · best ${db.bosses[b.id]}%` : ''}</small></div>
      <span class="st">${state === 'done' ? 'DONE' : state === 'cur' ? 'YOU ARE HERE' : '🔒'}</span></div>`;
  }).reverse().join('');
  const beaten = BOSSES.filter(b => b.tier <= cs.tier);
  $('bossNets').innerHTML = beaten.length ? beaten.map(b => `<button class="tile" data-boss="${b.id}"><b>${esc(b.n)}</b><span>12 balls · ${esc(b.trademark.name)}</span></button>`).join('')
    : '<p class="note">Beat your first trial to unlock boss nets.</p>';
  $('career').querySelectorAll('[data-trial]').forEach(el => el.onclick = () => onTrial(el.dataset.trial));
  $('career').querySelectorAll('[data-boss]').forEach(el => el.onclick = () => onBoss(el.dataset.boss));
  only('career');
}

export function renderMore() {
  $('rtSub2').textContent = app.db.rtBase ? `Yours: ${Math.round(app.db.rtBase * 1000)} ms · test again` : 'Your button delay — do this first';
  const b = $('bTrig'); b.querySelector('b').textContent = 'Trigger: ' + (app.S.trigger ? 'ON' : 'OFF'); b.classList.toggle('gold', !!app.S.trigger);
  if (app.syncView) app.syncView();
  $('padNote').innerHTML = app.pads.connected ? '<b>Controller connected.</b> In play: LT = trigger · X = front · B = back · left stick = play (L4: stick picks the shot) · RT = leave. Menus: D-pad, A choose, B back, LB/RB tabs.' : 'Xbox controller: plug it in and press any button.';
  only('more');
}

// ---------- onboarding (first run) ----------
export function onboarding(step, api) {
  const { db } = app, el = $('obBody'), N = 6;
  const steps = `<div class="steps">${Array.from({ length: N }, (_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;
  const next = (fn) => { const b = el.querySelector('#obNext'); if (b) b.onclick = fn; };
  const touch = document.body.classList.contains('touch');
  if (step === 0) {
    el.innerHTML = `<div class="ob">${steps}<div class="brand" style="margin-top:3vh"><i></i>LENGTH READER</div>
      <h1 class="display">Read it early.<br>Move your feet.</h1>
      <p class="lead">A batting trainer for one skill: picking the length from the bowler's hand and the first part of the flight — and moving the right foot before it pitches.</p>
      <ul><li>Real pace, real flight, real bounce. Club bowlers, spinners, swing.</li><li>The level adjusts every ball to keep you right about 85% of the time.</li><li>XP only for correct reads made after a real look — never for guessing or speed.</li></ul>
      <div class="honest">Honest bit: a screen has no real depth, no bat and can't see your feet. Use this to sharpen your read, then take it to the nets. More in <b>More → How it works</b>.</div>
      <div class="row"><button class="cta" id="obNext"><span class="ctaPlay"></span>Let's go</button></div></div>`;
    next(() => onboarding(1, api));
  } else if (step === 1) {
    el.innerHTML = `<div class="ob">${steps}<h1 class="display">How do you bat?</h1><p class="lead">This sets your off side, the camera and which way the spinners turn.</p>
      <div class="choices"><button class="choice${db.profile.hand === 'R' ? ' on' : ''}" data-h="R"><b>Right-handed</b><span>Off side to your right as you face the bowler</span></button>
      <button class="choice${db.profile.hand === 'L' ? ' on' : ''}" data-h="L"><b>Left-handed</b><span>Off side to your left as you face the bowler</span></button></div></div>`;
    el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { db.profile.hand = b.dataset.h; app.saveNow(); api.applyView(); onboarding(2, api); });
  } else if (step === 2) {
    el.innerHTML = `<div class="ob">${steps}<h1 class="display">Set up</h1>
      <div class="choices"><div class="choice${touch ? ' on' : ''}"><b>Phone</b><span>Prop it at eye height in landscape, an arm's length away. Stand in your stance. Tap the <b>top half</b> for FRONT, the <b>bottom half</b> for BACK.</span></div>
      <div class="choice${touch ? '' : ' on'}"><b>PC</b><span>Stand in your stance. Controller, side-on: <b>X</b> = FRONT, <b>B</b> = BACK, left stick = play, <b>RT</b> = LEAVE, <b>LT</b> = trigger. USB foot pedals: Settings → Map my pedals. Keyboard: <b>←</b> / <b>→</b>. Mouse: left / right click.</span></div></div>
      <p class="lead" style="margin-top:2vh">Every time you press, make the real step too. Head still, eyes on the bowler's hand.</p>
      <div class="row"><button class="cta" id="obNext"><span class="ctaPlay"></span>Next</button></div></div>`;
    next(() => onboarding(3, api));
  } else if (step === 3) {
    el.innerHTML = `<div class="ob">${steps}<h1 class="display">True life-size</h1>
      <p class="lead">On a monitor? Measure your screen and where you stand (2 minutes, tape measure). The bowler then appears at his real size, with the horizon at your real eye line.</p>
      <div class="row"><button class="cta" id="obNext"><span class="ctaPlay"></span>Calibrate my setup</button><button class="btn" id="obSkip">Skip (phone, or later)</button></div></div>`;
    next(() => api.calibrate(() => onboarding(4, api)));
    el.querySelector('#obSkip').onclick = () => onboarding(4, api);
  } else if (step === 4) {
    el.innerHTML = `<div class="ob">${steps}<h1 class="display">Your button speed</h1>
      <p class="lead">8 presses when the screen turns green (30 seconds). The app subtracts this, so it can show how long you actually spent <b>reading</b> the ball — and spot guesses.</p>
      <div class="row"><button class="cta" id="obNext"><span class="ctaPlay"></span>Test now</button><button class="btn" id="obSkip">Skip for now</button></div></div>`;
    next(() => api.reaction(() => onboarding(5, api)));
    el.querySelector('#obSkip').onclick = () => onboarding(5, api);
  } else {
    el.innerHTML = `<div class="ob">${steps}<h1 class="display">4 practice balls</h1>
      <p class="lead">80 kph, full view. Watch the hand, then the ball. <b>Pitched up → FRONT. Short → BACK.</b> Before it bounces.</p>
      <div class="row"><button class="cta" id="obNext"><span class="ctaPlay"></span>Bowl them</button><button class="btn" id="obSkip">Skip</button></div></div>`;
    next(() => api.tutorial());
    el.querySelector('#obSkip').onclick = () => { db.profile.onboarded = true; app.saveNow(); api.home(); };
  }
  only('onboard');
  const f = el.querySelector('.cta, .choice'); if (f && !document.body.classList.contains('touch')) f.focus({ preventScroll: true });
}

// ---------- focus navigation (controller and arrow keys) ----------
function visible(el) { return el.offsetParent !== null && !el.disabled && getComputedStyle(el).visibility !== 'hidden'; }
function candidates() {
  const scr = document.querySelector('.screen:not(.hidden)');
  const list = [];
  if (scr) list.push(...scr.querySelectorAll('button, a[href], select, input:not([type=file])'));
  if (!$('nav').classList.contains('hidden')) list.push(...$('nav').querySelectorAll('button'));
  return list.filter(visible);
}
export function moveFocus(dir) {
  const c = candidates(); if (!c.length) return;
  const cur = document.activeElement && c.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) { (c.find(e => e.classList.contains('cta')) || c[0]).focus(); return; }
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bd = Infinity;
  for (const e of c) {
    if (e === cur) continue;
    const q = e.getBoundingClientRect(), x = q.left + q.width / 2 - cx, y = q.top + q.height / 2 - cy;
    const along = dir === 'r' ? x : dir === 'l' ? -x : dir === 'd' ? y : -y, across = dir === 'r' || dir === 'l' ? Math.abs(y) : Math.abs(x);
    if (along <= 4) continue;
    const d = along + across * 2.2;
    if (d < bd) { bd = d; best = e; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}
export function clickFocused() {
  const a = document.activeElement;
  if (a && a !== document.body && candidates().includes(a)) { a.click(); return true; }
  return false;
}
export function stepTab(d) {
  const i = TABS.indexOf(app.state); if (i < 0) return false;
  $('nav').querySelectorAll('button')[(i + d + TABS.length) % TABS.length].click(); return true;
}
