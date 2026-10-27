// "Calibrate my setup": measure the screen and where you stand, get a true life-size view, and check it by eye.
// Also "Map my pedals" (USB foot pedals that send keys).
import { app, $, show, esc } from '../app.js';
import { defaultCalib, solve, valid, PRESETS } from '../core/calib.js';
import { T_REL } from '../core/physics.js';
import { BOWLERS } from '../core/bowling.js';
import { only } from './menus.js';

const FIELDS = [
  ['hCm', 'VISIBLE SCREEN HEIGHT (CM)', 'The lit picture area, top to bottom. 27-inch 16:9: 59.8 upright, 33.6 flat.'],
  ['wCm', 'VISIBLE SCREEN WIDTH (CM)', 'Side to side. 27-inch 16:9: 33.6 upright, 59.8 flat.'],
  ['distCm', 'YOUR EYES TO THE SCREEN (CM)', 'Standing in your stance, where you’ll actually bat.'],
  ['eyeCm', 'YOUR EYE HEIGHT IN STANCE (CM)', 'Floor to your eyes while in your stance (lower than standing tall).'],
  ['bottomCm', 'SCREEN BOTTOM EDGE ABOVE THE FLOOR (CM)', 'Floor to the bottom of the lit picture area.'],
];
const isPortrait = () => (screen.orientation && screen.orientation.type ? screen.orientation.type.startsWith('portrait') : innerHeight > innerWidth);

let form = null, back = null;
export function openCalib(onDone) {
  back = onDone || null;
  const S = app.S, orient = isPortrait() ? 'portrait' : 'landscape';
  const saved = S.calib && S.calib[orient];
  form = Object.assign(defaultCalib(orient), saved || {});
  if (!saved && S.lifeM) form.distCm = Math.round(S.lifeM * 100);
  form.orient = orient;
  render();
  only('calib');
}

function render() {
  const el = $('calibBody');
  el.innerHTML = `<div class="brand"><i></i>CALIBRATE MY SETUP</div>
    <h1 class="display">True life-size</h1>
    <p class="lead">The screen becomes a window into the nets: the camera sits exactly where your eyes are, so the horizon is at your real eye line and the bowler is his real size. Use a tape measure.</p>
    <div class="form">
      <div class="field"><label for="cOrient">SCREEN</label><select id="cOrient"><option value="portrait"${form.orient === 'portrait' ? ' selected' : ''}>Upright (portrait)</option><option value="landscape"${form.orient === 'landscape' ? ' selected' : ''}>Flat (landscape)</option></select>
        <div class="help">Detected: ${isPortrait() ? 'upright' : 'flat'}. One calibration is saved for each.</div></div>
      ${FIELDS.map(([k, l, h]) => `<div class="field"><label for="c_${k}">${l}</label><input id="c_${k}" type="number" inputmode="decimal" step="0.1" data-k="${k}" value="${form[k]}"><div class="help">${h}</div></div>`).join('')}
    </div>
    <div class="panel calres" id="calRes" aria-live="polite"></div>
    <div class="honest"><b>Screen brightness:</b> about 40%, with the room lights on. A bright screen in a dim room glares and hides the ball. Try <b>Night mode</b> in Settings if it still glares.</div>
    <div class="row">
      <button class="cta" id="cSave"><span class="ctaPlay"></span>Save and use</button>
      <button class="btn" id="cCheck">Visual check</button>
      <button class="btn" id="cOff">Turn off life-size</button>
      <button class="btn" id="cBack">Back</button>
    </div>`;
  el.querySelectorAll('[data-k]').forEach(i => i.addEventListener('input', () => { const v = parseFloat(i.value); if (isFinite(v)) form[i.dataset.k] = v; results(); }));
  $('cOrient').onchange = (e) => {
    const o = e.target.value, s = app.S.calib && app.S.calib[o];
    form = Object.assign(defaultCalib(o), s || { distCm: form.distCm, eyeCm: form.eyeCm }); form.orient = o; render();
  };
  $('cSave').onclick = () => { if (!valid(form)) return; save(); app.toast('Calibration saved — life-size is on.'); done(); };
  $('cCheck').onclick = () => { if (valid(form)) visualCheck(); };
  $('cOff').onclick = () => { if (app.S.calib) { delete app.S.calib[form.orient]; if (!Object.keys(app.S.calib).length) app.S.calib = null; } app.saveNow(); app.applySettings('view'); done(); };
  $('cBack').onclick = done;
  results();
}

function results() {
  const r = $('calRes');
  if (!valid(form)) { r.innerHTML = '<b>Check the numbers.</b>'; return; }
  const s = solve(form);
  r.innerHTML = `<div class="calgrid">
    <div><small>VERTICAL VIEW</small><b>${s.vfov.toFixed(1)}°</b></div>
    <div><small>BOWLER (1.85 m AT 20 m)</small><b>${s.bowlerCm.toFixed(1)} cm</b><span>${s.bowlerDeg.toFixed(1)}° tall</span></div>
    <div><small>YOUR EYE LINE</small><b>${s.horizonFromBottomCm.toFixed(1)} cm</b><span>up from the screen's bottom edge</span></div>
    <div><small>RELEASE POINT</small><b>${s.releaseCm.toFixed(1)} cm</b><span>above your eye line</span></div></div>
    ${s.msg ? `<p class="warnmsg">⚠ ${esc(s.msg)}</p>` : '<p class="okmsg">✓ The bowler’s hand is on screen, above your eye line.</p>'}
    <p class="note">Nearest ground you can see: ${isFinite(s.nearGround) ? s.nearGround.toFixed(1) + ' m in front of your eyes (balls pitching closer than ~' + s.nearPitchFromStumps.toFixed(1) + ' m from your stumps bounce below the screen — you still see their flight)' : 'none (screen is above your eyes)'}.</p>`;
}

function save() {
  const c = { orient: form.orient, hCm: +form.hCm, wCm: +form.wCm, distCm: +form.distCm, eyeCm: +form.eyeCm, bottomCm: +form.bottomCm, date: new Date().toISOString() };
  app.S.calib = Object.assign({}, app.S.calib || {}, { [c.orient]: c });
  app.saveNow(); app.applySettings('view');
}
function done() { const b = back; back = null; if (b) b(); else app.openSettings(); }

// ---------- visual check: eye line, release point and a 1 m ruler, drawn from the real camera ----------
export function visualCheck() {
  const prev = app.S.calib;
  app.S.calib = Object.assign({}, prev || {}, { [form.orient]: Object.assign({}, form) });      // preview without saving
  app.applySettings('view');
  const w = app.world, prof = BOWLERS[0];
  w.bowler.setKit(prof.c); w.bowler.pose(T_REL, prof, 0, 0); w.bowlerMoved();
  only(null); show('nav', false);
  const ov = $('calCheck'), cv = $('calCanvas'); show(ov, true);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const draw = () => {
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const eyeY = form.eyeCm / 100, hx = w.hx;
    const eye = w.toScreen(0, eyeY, 200), rel = w.toScreen(-0.57, 2.2, 17.75), r0 = w.toScreen(0.7 * hx, 0, 17.68), r1 = w.toScreen(0.7 * hx, 1, 17.68);
    g.strokeStyle = '#38bdf8'; g.lineWidth = 2; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(0, eye.y); g.lineTo(innerWidth, eye.y); g.stroke(); g.setLineDash([]);
    g.font = '700 15px system-ui'; g.fillStyle = '#38bdf8'; g.fillText('YOUR EYE LINE', 10, eye.y - 8);
    g.strokeStyle = '#fbbf24'; g.lineWidth = 3; g.beginPath(); g.arc(rel.x, rel.y, 10, 0, 7); g.stroke();
    g.fillStyle = '#fbbf24'; g.fillText('RELEASE ≈ 2.2 m', rel.x + 14, rel.y + 5);
    g.strokeStyle = '#f472b6'; g.lineWidth = 4; g.beginPath(); g.moveTo(r0.x, r0.y); g.lineTo(r1.x, r1.y); g.stroke();
    g.lineWidth = 2; [0, 0.25, 0.5, 0.75, 1].forEach(f => { const y = r0.y + (r1.y - r0.y) * f; g.beginPath(); g.moveTo(r0.x - 5, y); g.lineTo(r0.x + 5, y); g.stroke(); });
    g.fillStyle = '#f472b6'; g.fillText('1 m AT THE BOWLER’S CREASE', r1.x + 10, r1.y + 4);
    $('calCheckTxt').textContent = `Eye line ${(innerHeight - eye.y > 0 ? 'on screen' : 'below the screen')} · the pink ruler should look exactly like a 1 m stick 18 m away. Tap or press any key to go back.`;
  };
  app.renderNow(); draw();
  const close = (e) => {
    if (e) e.preventDefault();
    removeEventListener('keydown', close, true); ov.removeEventListener('pointerdown', close);
    show(ov, false); app.S.calib = prev; app.applySettings('view'); w.bowler.pose(0, prof, 0, 0); w.bowlerMoved(); only('calib');
  };
  setTimeout(() => { addEventListener('keydown', close, true); ov.addEventListener('pointerdown', close); }, 300);
  app.closeCheck = close;
}

// ---------- pedals: press FRONT, then BACK, then PLAY ----------
export function mapPedals(onDone) {
  const steps = [['F', 'FRONT'], ['B', 'BACK'], ['P', 'PLAY']], got = {};
  let i = 0;
  const ov = $('pedalMap'), txt = $('pedalTxt'); show(ov, true);
  const ask = () => { txt.innerHTML = `Press the pedal for <b>${steps[i][1]}</b><br><small>${i + 1} of 3 · Esc to cancel</small>`; };
  const key = (e) => {
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (e.key === 'Escape') return finish(false);
    if (Object.values(got).includes(e.code)) { txt.innerHTML = 'That pedal is already used — press a different one.'; setTimeout(ask, 900); return; }
    got[steps[i][0]] = e.code; i++;
    if (i >= steps.length) finish(true); else ask();
  };
  const finish = (ok) => {
    removeEventListener('keydown', key, true); show(ov, false);
    if (ok) { app.S.pedals = got; app.saveNow(); app.toast(`Pedals saved: FRONT ${got.F} · BACK ${got.B} · PLAY ${got.P}`); }
    if (onDone) onDone();
  };
  addEventListener('keydown', key, true); ask();
}
