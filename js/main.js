// Boot + the frame loop + menu input. The loop runs every display refresh; the 3D scene is only rendered while a
// ball is live (or after a change), so menus cost almost nothing.
import { app, $, show } from './app.js';
import { load, save, KEY } from './core/store.js';
import { TIERS, tierIndex, QualityController } from './core/quality.js';
import { createWorld } from './engine/world.js';
import { createPerf } from './engine/perf.js';
import { createAudio, createVoice, createHaptics } from './audio.js';
import { createPads } from './input.js';
import { createTrajService } from './traj-service.js';
import * as game from './game/game.js';
import * as scr from './ui/screens.js';

const VERSION = '5.0.0';
const qs = new URLSearchParams(location.search);

// ---------- data ----------
const boot = load(window.localStorage);
app.db = boot.db; app.S = app.db.settings; app.storage = window.localStorage;
app.saveNow = () => { if (!save(window.localStorage, app.db)) toast('Couldn’t save — storage is full or blocked. Export your data from Settings.'); };
app.saveNow();
// Ask the browser not to evict our data (installed apps usually get this automatically).
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- engine ----------
const isTouch = matchMedia('(pointer:coarse)').matches;
if (isTouch) document.body.classList.add('touch');
try { app.world = createWorld($('c')); }
catch (e) { show('nolib', true); throw e; }
const { world } = app;
app.perf = createPerf(world.renderer.getContext());
app.pads = createPads();
app.audio = createAudio(app.S); app.voice = createVoice(app.S); app.haptics = createHaptics(app.S, () => app.pads.list());
app.traj = createTrajService();
const startTier = qs.get('tier') || (app.S.quality !== 'auto' ? app.S.quality : (isTouch ? 'medium' : 'high'));
app.quality = new QualityController(tierIndex(startTier), tierIndex(isTouch ? 'high' : 'ultra'));
world.applyTier(TIERS[app.quality.tier]);
world.applyView(app.S, app.db.profile.hand);
app.onBallStats = (st) => {
  if (app.S.quality !== 'auto') return;
  const nt = app.quality.onBall(st);
  if (nt != null) world.applyTier(TIERS[nt]);
};
let needsRender = true;
function applySettings(k) {
  if (k === 'quality') { if (app.S.quality !== 'auto') { app.quality.tier = tierIndex(app.S.quality); } world.applyTier(TIERS[app.quality.tier]); }
  if (k === 'overlay') app.perf.setOverlay(app.S.overlay);
  world.applyView(app.S, app.db.profile.hand); needsRender = true;
}
app.perf.setOverlay(app.S.overlay || qs.has('debug'));
$('c').addEventListener('webglcontextlost', (e) => { e.preventDefault(); show('nolib', true); $('nolib').innerHTML = 'The graphics were reset by the device.<br><button class="btn" onclick="location.reload()">Reload</button>'; });

// ---------- screens ----------
function goHome() { scr.renderHome(); scr.only('home'); needsRender = true; if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); }
game.setHooks({
  enter() { scr.only(null); app.state = 'session'; },
  leave() { needsRender = true; },
  showEnd(s, score, rec) { scr.renderEnd(s, score, rec); },
  goHome,
});
let lastKind = 'session';
function start(kind, opts) { lastKind = kind; game.startSession(kind, opts); }
$('bStart').onclick = () => start('session');
$('bQuick').onclick = () => start('quick');
$('bEndless').onclick = () => start('endless');
$('bDrill').onclick = () => start('short');
$('bSpin').onclick = () => start('spin');
$('bMatch').onclick = () => start('match');
$('bNets').onclick = () => start('nets');
$('bDaily').onclick = () => start('daily');
$('bRT').onclick = () => scr.rtOpen();
$('bProg').onclick = () => scr.renderProgress();
$('bProgBack').onclick = goHome;
$('bTrig').onclick = () => { app.S.trigger = !app.S.trigger; app.saveNow(); scr.renderTrig(); };
$('bSettings').onclick = () => scr.renderSettings(applySettings);
$('bSetBack').onclick = goHome;
$('bExport').onclick = scr.doExport; $('bExport2').onclick = scr.doExport;
$('bImport').onclick = () => $('fileIn').click();
$('fileIn').onchange = (e) => { const f = e.target.files[0]; if (f) scr.doImport(f, (msg) => { toast(msg); scr.renderSettings(applySettings); }); e.target.value = ''; };
let resetArm = 0;
$('bReset').onclick = () => {
  const b = $('bReset');
  if (Date.now() - resetArm > 4000) { resetArm = Date.now(); b.textContent = 'Tap again to delete everything'; setTimeout(() => { b.textContent = 'Delete all saved data'; }, 4000); return; }
  scr.resetAll(); scr.renderSettings(applySettings); applySettings('view'); b.textContent = 'Deleted';
};
$('pBtn').onclick = () => game.togglePause();
$('rcHold').onclick = game.holdToggle; $('rcRep').onclick = () => game.replay(false); $('rcSlow').onclick = () => game.replay(true); $('rcNext').onclick = () => game.nextBall();
$('bResume').onclick = () => game.togglePause(); $('bEndNow').onclick = () => game.endSession(); $('bHome2').onclick = () => game.abandonToHome();
$('bAgain').onclick = () => start(lastKind); $('bHome3').onclick = goHome;

// ---------- input ----------
addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'F2' || k === '`') { app.S.overlay = !app.perf.overlayOn; app.perf.setOverlay(app.S.overlay); app.saveNow(); e.preventDefault(); return; }
  if (scr.rtActive()) { e.preventDefault(); if (k === 'Escape') scr.rtClose(goHome); else if (!e.repeat) { scr.rtPress(e.timeStamp); if (!scr.rtActive()) goHome(); } return; }
  if (game.onKey(e)) return;
  if (app.state === 'home') { if (k === 'Enter' && document.activeElement === document.body) start('session'); return; }
  if (app.state === 'end') { if (k === 'Enter') { e.preventDefault(); start(lastKind); } if (k === 'Escape') goHome(); return; }
  if (app.state === 'settings' || app.state === 'progress') { if (k === 'Escape') goHome(); }
});
addEventListener('pointerdown', (e) => {
  if (scr.rtActive()) { e.preventDefault(); scr.rtPress(e.timeStamp); if (!scr.rtActive()) goHome(); return; }
  game.onPointer(e);
}, { passive: false });
addEventListener('mousedown', (e) => { if (game.G.state === 'run' && e.button === 1) e.preventDefault(); });
addEventListener('contextmenu', (e) => { if (game.G.state === 'run' || game.G.state === 'result') e.preventDefault(); });
function onPad(E, su, sd, ts) {
  if (scr.rtActive()) { scr.rtPress(ts); if (!scr.rtActive()) goHome(); return; }
  if (game.onPad(E, su, sd, ts)) return;
  if (E[9] || E[0]) { if (app.state === 'home') start('session'); else if (app.state === 'end') start(lastKind); }
  else if (E[1] && app.state !== 'home') goHome();
}
addEventListener('gamepadconnected', () => { if (app.state === 'home') scr.renderHome(); });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && (game.G.state === 'run' || game.G.state === 'result')) game.togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && (game.G.state === 'run' || game.G.state === 'result')) game.togglePause(); });
addEventListener('resize', () => { world.resize(); needsRender = true; });

// ---------- loop ----------
function loop(ts) {
  requestAnimationFrame(loop);
  const t0 = performance.now();
  app.perf.frame(ts);
  app.pads.poll(onPad);
  scr.rtFrame(ts);
  const st = game.G.state;
  const black = game.frame(ts);
  if (st === 'run' || st === 'result' || needsRender) {
    const q = app.perf.gpuBegin();
    world.render(world.heActive ? world.heCam : world.camera, black);
    app.perf.gpuEnd(q); needsRender = false;
  }
  app.perf.cpuDone(performance.now() - t0);
  if (app.perf.overlayOn) { app.perf.setInfo(world.info(), world.tier.id); app.perf.draw(ts); }
}

// ---------- offline + install ----------
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; show('bInstall', true); });
$('bInstall').onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; show('bInstall', false); };
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !qs.has('nosw')) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const ready = (w) => {
      if (!navigator.serviceWorker.controller) return;           // first install: nothing to replace
      toast('Update ready.', 'Reload', () => { w.postMessage('skipWaiting'); });
    };
    if (reg.waiting) ready(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') ready(w); }); });
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; if (!game.G.sess) location.reload(); });
}
function toast(msg, act, fn) {
  const t = $('toast'); t.innerHTML = ''; const s = document.createElement('span'); s.textContent = msg; t.appendChild(s);
  if (act) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = act; b.onclick = () => { show(t, false); fn(); }; t.appendChild(b); }
  show(t, true); clearTimeout(toast.tm); toast.tm = setTimeout(() => show(t, false), act ? 15000 : 5000);
}
app.toast = toast;

// ---------- go ----------
$('ver').textContent = 'v' + VERSION;
world.bowler.pose(0, { s: 1, xo: 0, tw: 1, ao: 0 }, 0, 0);
goHome();
if (boot.fromV4 && boot.added) toast(`Welcome to v5. Your ${boot.added} v4 session${boot.added === 1 ? '' : 's'} and level came across.`);
requestAnimationFrame(loop);
// Test hook (headless browser tests): read-only peek at state.
window.__lr = { app, game, VERSION, KEY };
