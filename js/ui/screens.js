// Menu screens: home, settings, progress, end of session, reaction test.
import { app, $, show, esc, VCOL } from '../app.js';
import { LEVELS, STAGES, STAGE_START, MAX_LEVEL } from '../core/levels.js';
import { SHOTS } from '../core/rules.js';
import { T_BFC, T_REL } from '../core/physics.js';
import { progressData, totalXP } from '../core/progress.js';
import { importData, exportData, newDB, DEF } from '../core/store.js';
import { median } from '../core/timing.js';
import { TIERS } from '../core/quality.js';
import { drawMap } from './session-ui.js';
import { only } from './menus.js';
import { BADGES, badgeSVG, badgeById } from '../core/badges.js';
import { SB_ROWS, sbClean } from '../core/sandbox.js';
export { only };

// ---------- end of session ----------
export function renderEnd(s, score, rec, extra = {}) {
  const b = s.balls, cnt = v => b.filter(x => x.v === v).length;
  const silentEnd = s.plan.segs.every(x => x.fb === 'end');
  if (s.match) { const m = s.match; $('eScore').textContent = `${m.runs}/${m.wk}`; $('eScore').style.color = m.won ? 'var(--good)' : 'var(--bad)'; $('eTitle').textContent = (m.won ? 'WON · ' : 'LOST · ') + m.res + ` · target ${m.target}`; }
  else { $('eScore').textContent = score + '%'; $('eScore').style.color = score >= 80 ? 'var(--good)' : score >= 60 ? 'var(--warn)' : 'var(--bad)'; $('eTitle').textContent = s.plan.segs.length > 1 || s.kind !== 'session' ? s.title.toUpperCase() : 'SESSION COMPLETE'; }
  $('eCounts').innerHTML = `<span class="g">● ${cnt('good')} right</span><br><span class="w">▲ ${cnt('warn')} late or guessed</span><br><span class="b">✕ ${cnt('bad')} wrong</span>`;
  const rts = b.filter(x => x.foot && x.fv === 'good' && x.rt != null).map(x => x.rt);
  const pct = f => Math.round(100 * b.filter(f).length / b.length) + '%';
  const pl = b.filter(x => x.pv), trg = b.filter(x => x.tv), gs = b.filter(x => x.guess).length;
  const avg = rts.length ? rts.reduce((a, c) => a + c, 0) / rts.length : null;
  $('eMeta').innerHTML = `<b class="xpbig">+${rec.xp} XP</b> · ${b.length} ball${b.length === 1 ? '' : 's'} · peak ${esc(LEVELS[s.peak].n)} · best streak ${s.best} · feet right ${pct(x => x.fv === 'good')}`
    + (pl.length ? ` · play/leave right ${Math.round(100 * pl.filter(x => x.pv === 'good').length / pl.length)}%` : '')
    + (trg.length ? ` · trigger on time ${Math.round(100 * trg.filter(x => x.tv === 'good').length / trg.length)}%` : '')
    + (gs ? ` · ${gs} guess${gs > 1 ? 'es' : ''} (too quick to be a read)` : '')
    + (avg != null ? ` · avg feet decision ${avg.toFixed(2)} s after release` + (app.db.rtBase ? ` (reading ${Math.max(0, avg - app.db.rtBase).toFixed(2)} s)` : '') : '');
  const cats = ['Full toss', 'Yorker', 'Full', 'Good', 'Short', 'Bouncer', 'Wide off', 'vs Spin', 'Variety balls'];
  $('eBars').innerHTML = cats.map(c => {
    const xs = c === 'vs Spin' ? b.filter(x => x.spin) : c === 'Variety balls' ? b.filter(x => x.varn && !x.spin) : b.filter(x => x.cat === c);
    if (!xs.length) return '';
    const p = Math.round(100 * xs.reduce((a, x) => a + x.sc, 0) / xs.length), col = p >= 80 ? VCOL.good : p >= 60 ? VCOL.warn : VCOL.bad;
    return `<div class="bar"><span>${c}</span><div class="t"><i style="width:${p}%;background:${col}"></i></div><span class="n">${p}% · ${xs.length}</span></div>`;
  }).join('');
  const errs = {};
  b.forEach(x => {
    if (x.fv === 'bad') { const k = x.mode === 4 ? `${x.cat}${x.spin ? ' (spin)' : ''} balls → ${x.shot ? SHOTS[x.shot].n : 'left it'}` : (x.foot ? `${x.cat}${x.spin ? ' spin' : ''} balls → you went ${x.foot === 'F' ? 'FRONT' : 'BACK'}` : 'Feet froze (no tap)'); errs[k] = (errs[k] || 0) + 1; }
    if (x.guess) errs['Guessed — pressed before you could read the ball'] = (errs['Guessed — pressed before you could read the ball'] || 0) + 1;
    if (x.tv && x.tv !== 'good') { const k = x.trig === null ? 'No trigger' : (x.trig < T_BFC - T_REL ? 'Trigger too early' : 'Trigger late'); errs[k] = (errs[k] || 0) + 1; }
    if (x.pv === 'bad') { const k = x.pe === 'LEAVE' ? 'Played at balls you should leave' : 'Left balls hitting the stumps'; errs[k] = (errs[k] || 0) + 1; }
  });
  const top = Object.entries(errs).sort((a, c) => c[1] - a[1])[0];
  if (top && top[1] >= 2) { show('eLeak', true); $('eLeak').innerHTML = `<b>Biggest leak:</b> ${esc(top[0])} (${top[1]}×)`; }
  else show('eLeak', false);
  $('eNote').textContent = silentEnd ? 'Nets rules: this is your first look at how you did.' : '';
  const tr = extra.trial, et = $('eTrial');
  if (tr) {
    et.className = 'trialRes ' + (tr.passed ? 'pass' : 'fail');
    et.innerHTML = (tr.passed ? '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="43" fill="none" stroke="#22c55e" stroke-width="9"/><path d="M29 52 L44 67 L72 36" fill="none" stroke="#22c55e" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 100 100"><rect x="8" y="8" width="84" height="84" rx="16" fill="none" stroke="#ef4444" stroke-width="9"/><path d="M32 32 L68 68 M68 32 L32 68" stroke="#ef4444" stroke-width="10" stroke-linecap="round"/></svg>')
      + `<span>${tr.promoted ? `PROMOTED TO ${esc(tr.tierName.toUpperCase())}!` : tr.passed ? 'PASSED' : `NOT THIS TIME — ${score}% (80% needed)`}</span>`;
  } else { et.className = 'trialRes hidden'; et.innerHTML = ''; }
  const nb = extra.badges || [];
  $('eBadges').innerHTML = nb.map(id => { const b = badgeById(id); return `<div class="bdg">${badgeSVG(b, true)}<b>${esc(b.n)}</b><small>${esc(b.d)}</small></div>`; }).join('');
  $('bAgain').textContent = s.kind === 'tutorial' ? 'Start your first daily session' : s.kind === 'trial' && !(tr && tr.passed) ? 'Try the trial again' : 'Go again (Enter · A)';
  only('end');
  requestAnimationFrame(() => drawMap($('endMap'), b, null, app.db.profile.hand));
}

// ---------- progress ----------
export function renderProgress() {
  const D = progressData(app.db); show('progEmpty', !D.length);
  const cell = v => v == null ? '—' : `<span class="${v >= 80 ? 'g' : v >= 60 ? 'w' : 'b'}">${v}%</span>`;
  $('progTable').innerHTML = D.length ? `<table><thead><tr><th>Day</th><th>Balls</th><th>Score</th><th>Reading</th><th>Full</th><th>Short</th><th>Wide off</th><th>Spin</th><th>XP</th><th>Matches</th><th>Level</th></tr></thead><tbody>` +
    D.slice().reverse().map(r => `<tr><td>${r.k.slice(5)}</td><td>${r.n}</td><td>${cell(r.score)}</td><td>${r.read == null ? '—' : r.read.toFixed(2) + ' s'}</td><td>${cell(r.full)}</td><td>${cell(r.short)}</td><td>${cell(r.wide)}</td><td>${cell(r.spin)}</td><td>${r.xp || '—'}</td><td>${r.matches ? r.wins + '/' + r.matches + ' won' : '—'}</td><td>L${LEVELS[r.lvl].m} · ${LEVELS[r.lvl].k}</td></tr>`).join('') + '</tbody></table>' : '';
  const wk = Date.now() - 7 * 864e5, sbB = app.db.sessions.filter(s => s.kind === 'sandbox' && Date.parse(s.date) >= wk).reduce((a, s) => a + (s.n || 0), 0);
  $('sbNote').textContent = `Sandbox practice: ${sbB} ball${sbB === 1 ? '' : 's'} in the last 7 days (not counted above).`; show('sbNote', sbB > 0);
  $('badges').innerHTML = BADGES.map(b => { const on = !!app.db.badges[b.id];
    return `<div class="bdg${on ? '' : ' off'}">${badgeSVG(b, on)}<b>${esc(b.n)}</b><small>${esc(b.d)}${on ? '<br>✓ ' + new Date(app.db.badges[b.id]).toLocaleDateString() : ''}</small></div>`; }).join('');
  only('progress');
  requestAnimationFrame(() => drawProg($('progChart'), D));
}
function drawProg(cv, D) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
  cv.width = W * dpr; cv.height = H * dpr; const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const L = 44, Rr = 52, T = 18, Bt = 30, w = W - L - Rr, h = H - T - Bt, X = i => L + (D.length < 2 ? w / 2 : i * w / (D.length - 1)), Ys = v => T + h * (1 - v / 100), Yr = v => T + h * (1 - v / 0.6);
  c.font = '600 12px system-ui, sans-serif'; c.strokeStyle = 'rgba(255,255,255,.08)'; c.fillStyle = '#8d99a8'; c.lineWidth = 1;
  for (const v of [0, 25, 50, 75, 100]) { const y = Ys(v); c.beginPath(); c.moveTo(L, y); c.lineTo(L + w, y); c.stroke(); c.textAlign = 'right'; c.fillText(v + '%', L - 6, y + 4); }
  c.textAlign = 'left'; for (const v of [0, 0.2, 0.4, 0.6]) c.fillText(v.toFixed(1) + ' s', L + w + 6, Yr(v) + 4);
  c.textAlign = 'center'; D.forEach((r, i) => { if (D.length <= 10 || i % Math.ceil(D.length / 10) === 0) c.fillText(r.k.slice(5), X(i), H - 10); });
  const line = (get, Y, col, shape) => {
    const pts = D.map((r, i) => [X(i), get(r)]).filter(p => p[1] != null); if (!pts.length) return;
    c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); pts.forEach(([x, v], j) => { const y = Y(v); j ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    c.fillStyle = col; pts.forEach(([x, v], j) => { const y = Y(v), r = j === pts.length - 1 ? 6 : 4; c.beginPath();
      if (shape === 'sq') c.rect(x - r, y - r, 2 * r, 2 * r); else if (shape === 'tri') { c.moveTo(x, y - r * 1.2); c.lineTo(x + r, y + r * 0.8); c.lineTo(x - r, y + r * 0.8); } else c.arc(x, y, r, 0, 7);
      c.fill(); });
  };
  line(r => r.score, Ys, '#22c55e', 'dot'); line(r => r.short, Ys, '#f5a524', 'tri'); line(r => r.read, Yr, '#38bdf8', 'sq');
}

// ---------- settings ----------
const FIELDS = [
  { k: 'hand', l: 'BATTING HAND', t: 'select', o: [['R', 'Right-handed'], ['L', 'Left-handed']], prof: true, h: 'Mirrors the off side, the camera and spin for left-handers. The bowler stays right-arm over.' },
  { k: 'maxKph', l: 'TOP PACE (KPH)', t: 'number', min: 80, max: 150, h: 'Each level climbs 80 → 120 kph, then the blackout starts. Caps the pace.' },
  { k: 'trigger', l: 'TRIGGER BUTTON', t: 'check', h: 'Time your forward press: between the bowler’s back foot landing and release. Controller: LT · keyboard: Space · phone: first tap.' },
  { k: 'view', l: 'VIEW', t: 'select', o: [['auto', 'Auto — fits flat or vertical screen'], ['wide', 'Wide — see more pitch'], ['tight', 'Tight'], ['life', 'Simple life-size (or use Calibrate my setup for true life-size)']], h: 'When you have calibrated, true life-size is used in every mode and these views are ignored.' },
  { k: 'lifeCm', l: 'SIMPLE LIFE-SIZE: SCREEN HEIGHT (CM)', t: 'number', min: 10, max: 300, h: 'Height of the lit picture area. 27-inch 16:9: upright ≈ 59.8 · flat ≈ 33.6. Better: Calibrate my setup.' },
  { k: 'lifeM', l: 'LIFE-SIZE: YOUR DISTANCE FROM SCREEN (M)', t: 'number', min: 0.5, max: 6, step: 0.1, h: 'Eyes to screen, standing in your stance.' },
  { k: 'boost', l: 'BALL SIZE BOOST', t: 'number', min: 1, max: 3, step: 0.1, h: 'Makes the ball easier to see on screen. 1 = true size. Its growth rate (a timing cue) is unchanged.' },
  { k: 'ball', l: 'BALL', t: 'select', o: [['red', 'Red ball'], ['white', 'White ball']] },
  { k: 'sight', l: 'SIGHT SCREEN', t: 'select', o: [['dark', 'Dark — best contrast, least glare'], ['white', 'White'], ['off', 'Off (no screen)']] },
  { k: 'lenMarks', l: 'LENGTH MARKINGS ON THE PITCH', t: 'select', o: [['auto', 'Auto — Level 1 only'], ['on', 'Always'], ['off', 'Never']], h: 'Faint full / good / short bands for the ball’s pace.' },
  { k: 'night', l: 'NIGHT MODE', t: 'check', h: 'Darker sky and floodlights: less glare in a dim room.' },
  { k: 'stepCue', l: '“STEP, THEN PRESS” REMINDER', t: 'check', h: 'Level 1: a cue during the run-up to make the real step with every press.' },
  { k: 'gap', l: 'PAUSE BETWEEN BALLS (S)', t: 'number', min: 1, max: 10, step: 0.5 },
  { k: 'feedback', l: 'FEEDBACK', t: 'select', o: [['auto', 'Auto — fades as you master a stage'], ['always', 'Always — full card every ball'], ['end', 'End only — like nets']], h: 'Auto: full feedback early in each stage, then only on mistakes (helps you rely on your own read).' },
  { k: 'levelMode', l: 'LEVEL', t: 'select', o: [['auto', 'Auto — holds you near 85% right'], ...LEVELS.map((L, i) => [String(i), 'Fixed: ' + L.n])] },
  { k: 'widePct', l: 'WIDE OUTSIDE OFF (%) — LEVEL 2+', t: 'number', min: 0, max: 60, h: 'Balls to leave.' },
  { k: 'bouncerPct', l: 'BOUNCERS (%) — LEVEL 2+', t: 'number', min: 0, max: 30, h: 'Only pace balls above ~110 kph actually get up head-high.' },
  { k: 'rotate', l: 'BOWLER CHANGE', t: 'select', o: [['ball', 'Every ball — like nets'], ['over', 'Every over']], h: 'Matches always change bowler each over.' },
  { k: 'club', l: 'CLUB-LEVEL BOWLERS', t: 'check', h: 'Some full tosses, stray lines and less consistent lengths, like real nets. Not used in drills.' },
  { k: 'netsGap', l: 'NETS: TIME BETWEEN BALLS (S)', t: 'number', min: 4, max: 45, h: 'Real nets ≈ 20 s while the bowler walks back. Switch off, then switch on as he turns.' },
  { k: 'spinners', l: 'SPINNERS IN SESSIONS', t: 'check', h: 'An off-spinner or leg-spinner every third bowler.' },
  { k: 'hawk', l: 'HAWK-EYE REPLAY', t: 'check', h: 'After each ball: the path and pitch zones from behind the bowler.' },
  { k: 'smart', l: 'SMART FEEDING', t: 'check', h: 'Bowls more of the length you get wrong most.' },
  { k: 'sound', l: 'SOUND', t: 'check' }, { k: 'voice', l: 'VOICE COACH', t: 'check' }, { k: 'haptics', l: 'VIBRATION / RUMBLE', t: 'check' },
  { k: 'fullscreen', l: 'FULL SCREEN ON START', t: 'check' },
  { k: 'textScale', l: 'TEXT SIZE IN PLAY', t: 'number', min: 1, max: 1.6, step: 0.1, h: '1 = normal. Bigger verdicts and HUD for reading from 3 m.' },
  { k: 'contrast', l: 'HIGH CONTRAST', t: 'check', h: 'Stronger outlines and solid panels. Verdicts always use shape as well as colour.' },
  { k: 'reduceMotion', l: 'REDUCE MOTION', t: 'check', h: 'No zoom or slide animations (the ball itself always moves, of course).' },
  { k: 'quality', l: 'GRAPHICS QUALITY', t: 'select', o: [['auto', 'Auto — keeps every frame on time'], ...TIERS.map(t => [t.id, t.id[0].toUpperCase() + t.id.slice(1)])], h: 'Auto lowers resolution or shadows between balls if frames are late. Never changes mid-delivery.' },
  { k: 'overlay', l: 'FPS COUNTER / FRAME TIMES', t: 'check', h: 'Refresh rate, FPS, frame times and dropped frames. Shortcut: F2 or the ` key.' },
];
export function renderSettings(onChange) {
  const { S, db } = app;
  const val = f => f.prof ? db.profile[f.k] : S[f.k];
  $('form').innerHTML = FIELDS.map(f => {
    let inp; const id = 'f_' + f.k;
    if (f.t === 'select') inp = `<select id="${id}" data-k="${f.k}">${f.o.map(([v, n]) => `<option value="${v}" ${String(val(f)) === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
    else if (f.t === 'check') inp = `<input id="${id}" type="checkbox" data-k="${f.k}" ${val(f) ? 'checked' : ''}>`;
    else inp = `<input id="${id}" type="number" data-k="${f.k}" value="${val(f)}" min="${f.min}" max="${f.max}" step="${f.step || 1}">`;
    return `<div class="field"><label for="${id}">${f.l}</label>${inp}${f.h ? `<div class="help">${f.h}</div>` : ''}</div>`;
  }).join('');
  $('form').querySelectorAll('[data-k]').forEach(el => el.addEventListener('change', () => {
    const f = FIELDS.find(x => x.k === el.dataset.k);
    let v;
    if (f.t === 'check') v = el.checked;
    else if (f.t === 'number') { v = parseFloat(el.value); if (isNaN(v)) v = DEF[f.k]; v = Math.max(f.min, Math.min(f.max, v)); el.value = v; }
    else v = el.value;
    if (f.prof) db.profile[f.k] = v; else S[f.k] = v;
    app.saveNow(); onChange && onChange(f.k);
  }));
  $('dataInfo').innerHTML = `${db.sessions.length} sessions saved on this device${db.v3.count ? ` (${db.v3.count} carried over from v4)` : ''}. ` +
    `Saved data lives only in this browser, on this web address (${esc(location.host || 'this device')}). Data from another address — like the old claude.ai copy — or another browser can’t be read from here: open that copy, tap <b>Export data</b>, then <b>Import</b> the file here.`;
  only('settings');
}

export function doExport() {
  const blob = new Blob([JSON.stringify(exportData(app.db))], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'length-reader-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function doImport(file, done) {
  const r = new FileReader();
  r.onload = () => {
    try { const n = importData(app.db, JSON.parse(r.result), file.name); app.saveNow(); done(`Imported ${n} new session${n === 1 ? '' : 's'}.`); }
    catch (e) { done('That file isn’t Length Reader data.'); }
  };
  r.readAsText(file);
}
export function resetAll() {
  const fresh = newDB(), S = app.S;                 // keep the same settings object: audio/haptics hold a reference to it
  fresh.profile.onboarded = true; fresh.profile.hand = app.db.profile.hand; fresh.v3 = app.db.v3;  // don't re-import v4 after a wipe
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, DEF); fresh.settings = S;
  for (const k of Object.keys(app.db)) delete app.db[k];
  Object.assign(app.db, fresh); app.saveNow();
}

// ---------- reaction test: your pure button delay, so the app can show real reading time ----------
// Same pipeline as the game: "green" is drawn in a frame and stamped with that frame's rAF time; the press with its event time.
const RTN = 8; let RT = null;
export function rtOpen() {
  app.audio.unlock(); only('rtest'); RT = { times: [], phase: 'idle', timer: null, stim: 0 }; rtNext();
}
function rtSet(msg, sub, go) { $('rtMsg').textContent = msg; $('rtSub').textContent = sub; $('rtest').classList.toggle('go', !!go); }
function rtNext() {
  RT.phase = 'wait'; rtSet('Wait…', `Press any button the moment the screen turns green · ${RT.times.length + 1} of ${RTN}`, false);
  RT.timer = setTimeout(() => { if (RT) RT.phase = 'arm'; }, 1200 + Math.random() * 1800);
}
export function rtFrame(ts) { if (RT && RT.phase === 'arm') { rtSet('PRESS', '', true); RT.stim = ts; RT.phase = 'go'; } }
export function rtActive() { return !!RT; }
export function rtPress(ts) {
  if (!RT) return;
  if (RT.phase === 'wait' || RT.phase === 'arm' || (RT.phase === 'go' && ts < RT.stim)) { clearTimeout(RT.timer); RT.phase = 'show'; rtSet('Too early', 'Wait for green', false); setTimeout(rtNext, 900); }
  else if (RT.phase === 'go') {
    const ms = ts - RT.stim; RT.times.push(ms); RT.phase = 'show'; rtSet(Math.round(ms) + ' ms', '', false);
    if (RT.times.length >= RTN) setTimeout(rtDone, 800); else setTimeout(rtNext, 900);
  } else if (RT.phase === 'done') rtClose();
}
function rtDone() {
  const med = median(RT.times); app.db.rtBase = +(med / 1000).toFixed(3); app.db.rtAt = new Date().toISOString();
  (app.db.rtTests = app.db.rtTests || []).push({ date: new Date().toISOString(), ms: Math.round(med) }); app.saveNow();
  RT.phase = 'done'; rtSet(Math.round(med) + ' ms', `Your button reaction (median of ${RTN}). The app subtracts this to show your real reading time, and anything quicker than this + 50 ms after release counts as a guess. Press any button to go back.`, false);
}
export function rtClose(back) { if (RT) clearTimeout(RT.timer); RT = null; (back || (() => {}))(); }

// ---------- sandbox: pick every ball (a row of chips per choice; Random rolls again every ball) ----------
export function renderSandbox(inSession) {
  const S = app.S; S.sandbox = sbClean(S.sandbox);
  const box = $('sbRows');
  box.innerHTML = SB_ROWS.map(r => `<div class="sbRow"><label>${r.l}</label><div class="sbChips">` +
    [['rand', 'Random']].concat(r.o).map(([v, t]) => `<button class="sbChip${S.sandbox[r.k] === v ? ' on' : ''}" data-k="${r.k}" data-v="${v}" aria-pressed="${S.sandbox[r.k] === v}">${esc(t)}</button>`).join('') +
    `</div>${r.h ? `<div class="help">${esc(r.h)}</div>` : ''}</div>`).join('');
  box.onclick = (e) => {
    const b = e.target.closest('.sbChip'); if (!b) return;
    const raw = b.dataset.v, row = SB_ROWS.find(r => r.k === b.dataset.k);
    const opt = row.o.find(([v]) => String(v) === raw);
    S.sandbox[row.k] = opt ? opt[0] : 'rand'; app.saveNow();
    box.querySelectorAll(`.sbChip[data-k="${row.k}"]`).forEach(c => { const on = c === b; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
  };
  $('bSbGo').textContent = inSession ? 'Resume ▶ (new balls from the next one)' : 'Bowl ▶';
  $('bSbBack').classList.toggle('hidden', !!inSession);
  only('sandbox');
  if (inSession) app.state = 'sandbox';
}
