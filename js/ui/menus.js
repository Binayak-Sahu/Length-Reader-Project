// Menus: Play (home), Career, More, How it works, first-run onboarding, the tab bar, and controller/keyboard
// focus navigation (D-pad / stick / arrows move, A / Enter choose, B / Esc back, LB / RB switch tabs).
import { app, $, show, esc } from '../app.js';
import { LEVELS, STAGES, clampLevel } from '../core/levels.js';
import { totalXP, streak, week, WEEK_GOAL, dayKey } from '../core/progress.js';
import { TIERS, BOSSES, careerState, bossFor } from '../core/career.js';
import { bestMark } from '../core/selection.js';
import { checkHistory, checkDue } from '../core/check.js';

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
    selection: 'Selection sim', leave: 'Leave drill', sandbox: 'Sandbox', check: 'Skill check',
    trial: 'Trial' + (s.boss ? ' · ' + (BOSSES.find(b => b.id === s.boss) || {}).n : ''), boss: 'Boss nets', tutorial: 'Tutorial' })[k] || 'Session';
}

// ---------- Play ----------
export { drillName };
export function renderHome(weakest) {
  const { db } = app, cs = careerState(db), today = dayKey(new Date());
  $('pTier').textContent = cs.name.toUpperCase();
  $('pXP').textContent = totalXP(db).toLocaleString() + ' XP';
  const mk = bestMark(db.sessions);
  $('selSub').textContent = mk ? `Last ${'★'.repeat(mk.last)} · best ${'★'.repeat(mk.best)} · 4 spells · ~120 kph` : '4 spells · pace + spin · ~120 kph · selector\'s report';
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
    ? '<b>Set-up:</b> prop the phone at eye height, about an arm’s length away, and stand in your stance. Tap the top half for FRONT, the bottom half for BACK, and make the real step as you tap.'
    : '<b>Set-up:</b> stand in your stance facing the screen, controller in hand, eyes on the bowler’s hand. Make the real step as you press. For a life-size bowler: <b>More → Settings → Calibrate my setup</b>.';
  const ch = checkHistory(db.sessions), due = checkDue(db.sessions), lastCk = ch[ch.length - 1];
  $('ckSub').textContent = lastCk ? `Last ${lastCk.score}%${due.days != null ? ' · ' + (due.days === 0 ? 'today' : due.days + (due.days === 1 ? ' day ago' : ' days ago')) : ''} · 24 balls · the same test every time`
    : '24 balls · the same test every time · shows if you’re really improving';
  $('bCheck').classList.toggle('due', due.due);
  const ss = db.sessions;
  $('hist').innerHTML = ss.length ? '<div class="hh">RECENT</div>' + ss.slice(-5).reverse().map(s => {
    const d = new Date(s.date);
    return `<div class="hr"><b>${esc(drillName(s))}</b><span>${s.n} ball${s.n === 1 ? '' : 's'}${s.xp ? ' · ' + s.xp + ' XP' : ''}</span><span class="sc">${s.match ? s.match.runs + '/' + s.match.wk : s.kind === 'tutorial' ? '' : s.score + '%'}</span>
      <small>${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>`;
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
  $('rtSub2').textContent = app.db.rtBase ? `Yours: ${Math.round(app.db.rtBase * 1000)} ms · test again` : 'Your button delay · 30 seconds · do this first';
  const b = $('bTrig'); b.querySelector('b').textContent = 'Trigger: ' + (app.S.trigger ? 'ON' : 'OFF'); b.classList.toggle('gold', !!app.S.trigger);
  if (app.syncView) app.syncView();
  $('padNote').innerHTML = app.pads.connected ? '<b>Controller connected.</b> In play: LT = trigger · X = front · B = back · left stick = play (L4: stick picks the shot) · RT = leave. Menus: D-pad, A choose, B back, LB/RB tabs.' : 'Xbox controller: plug it in and press any button.';
  only('more');
}

// ---------- onboarding (first run): welcome → hand → how to answer on this device → button speed → 4 practice balls ----------
export const OB_STEPS = 5;
export function onboarding(step, api) {
  const { db } = app, el = $('obBody'), N = OB_STEPS;
  const steps = `<div class="steps" role="img" aria-label="Step ${step + 1} of ${N}">${Array.from({ length: N }, (_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;
  const next = (fn) => { const b = el.querySelector('#obNext'); if (b) b.onclick = fn; };
  const touch = document.body.classList.contains('touch');
  if (step === 0) {
    el.innerHTML = `<div class="ob">${steps}<div class="brand"><i></i>Length Reader</div>
      <h1 class="display" style="margin-top:1.25rem">Read it early.<br>Move your feet.</h1>
      <p class="lead">A batting trainer for one skill: picking the length out of the bowler's hand, and moving the right foot before the ball pitches.</p>
      <ul class="pts"><li><span><b>Real pace, flight and bounce.</b> Club quicks, spinners, swing.</span></li>
        <li><span><b>It adapts to you.</b> Harder as you improve, so it always stretches you.</span></li>
        <li><span><b>Only real reads count.</b> No points for guessing or pressing fast.</span></li></ul>
      <div class="honest"><b>Honest bit:</b> a screen has no real depth and no bat, and it can't see your feet. Use it to sharpen your read, then take it to the nets.</div>
      <div class="row"><button class="cta" id="obNext"><span class="ctaPlay"></span>Let's go</button></div></div>`;
    next(() => onboarding(1, api));
  } else if (step === 1) {
    el.innerHTML = `<div class="ob">${steps}<h1 class="display">How do you bat?</h1><p class="lead">This sets your off side, the camera and which way the spinners turn.</p>
      <div class="choices"><button class="choice${db.profile.hand === 'R' ? ' on' : ''}" data-h="R"><b>Right-handed</b><span>Off side to your right as you face the bowler</span></button>
      <button class="choice${db.profile.hand === 'L' ? ' on' : ''}" data-h="L"><b>Left-handed</b><span>Off side to your left as you face the bowler</span></button></div></div>`;
    el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { db.profile.hand = b.dataset.h; app.saveNow(); api.applyView(); onboarding(2, api); });
  } else if (step === 2) {
    const rows = touch
      ? `<div class="f"><kbd>TOP HALF</kbd><span>Tap for <b>FRONT</b> foot (pitched up)</span></div><div class="bk"><kbd>BOTTOM HALF</kbd><span>Tap for <b>BACK</b> foot (short)</span></div>`
      : `<div class="f"><kbd>X · ← · left click</kbd><span><b>FRONT</b> foot (pitched up)</span></div><div class="bk"><kbd>B · → · right click</kbd><span><b>BACK</b> foot (short)</span></div>`;
    el.innerHTML = `<div class="ob">${steps}<h1 class="display">Stand like you bat</h1>
      <p class="lead">${touch ? 'Prop the phone at eye height, about an arm’s length away. Take your stance.' : 'Stand in your stance facing the screen, controller or keyboard within reach.'} Eyes on the bowler's hand, head still.</p>
      <div class="how">${rows}</div>
      <p class="lead"><b>Make the real step every time you ${touch ? 'tap' : 'press'}.</b> Reading without moving trains the wrong thing.</p>
      <div class="row"><button class="cta" id="obNext"><span class="ctaPlay"></span>Next</button>${touch ? '' : '<button class="btn" id="obCal">Big monitor? Make the bowler life-size (2 min)</button>'}</div>
      ${touch ? '' : '<p class="note">Full controller, keyboard and foot-pedal controls are in More → Controls. You can calibrate later in Settings.</p>'}</div>`;
    next(() => onboarding(3, api));
    const c = el.querySelector('#obCal'); if (c) c.onclick = () => api.calibrate(() => onboarding(2, api));
  } else if (step === 3) {
    el.innerHTML = `<div class="ob">${steps}<h1 class="display">Your button speed</h1>
      <p class="lead">Press 8 times when the screen turns green (30 seconds). The app takes this off your times, so it can tell how long you spent <b>reading</b> the ball, and spot a guess.</p>
      <div class="row"><button class="cta" id="obNext"><span class="ctaPlay"></span>Test now</button><button class="btn" id="obSkip">Skip for now</button></div></div>`;
    next(() => api.reaction(() => onboarding(4, api)));
    el.querySelector('#obSkip').onclick = () => onboarding(4, api);
  } else {
    el.innerHTML = `<div class="ob">${steps}<h1 class="display">4 practice balls</h1>
      <p class="lead">Slow ones, 80 kph. Watch the hand, then the ball.</p>
      <div class="how"><div class="f"><kbd>PITCHED UP</kbd><span>Go <b>FRONT</b></span></div><div class="bk"><kbd>SHORT</kbd><span>Go <b>BACK</b></span></div></div>
      <p class="lead">Answer <b>before it bounces</b>. The first two tell you what's coming; the last two are your call.</p>
      <div class="row"><button class="cta" id="obNext"><span class="ctaPlay"></span>Bowl them</button><button class="btn" id="obSkip">Skip</button></div></div>`;
    next(() => api.tutorial());
    el.querySelector('#obSkip').onclick = () => { db.profile.onboarded = true; app.saveNow(); api.home(); };
  }
  only('onboard');
  $('onboard').scrollTop = 0;
  const f = el.querySelector('.cta, .choice'); if (f && !touch) f.focus({ preventScroll: true });
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
