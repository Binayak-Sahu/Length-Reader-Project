// Boot + the frame loop + menu input. The loop runs every display refresh; the 3D scene is only rendered while a
// ball is live (or after a change), so menus cost almost nothing.
import { app, $, show } from './app.js';
import { load, save, KEY } from './core/store.js';
import { TIERS as QTIERS, tierIndex, QualityController } from './core/quality.js';
import { TIERS, bossById, careerState, recordTrial } from './core/career.js';
import { checkBadges } from './core/badges.js';
import { createWorld } from './engine/world.js';
import { createPerf } from './engine/perf.js';
import { createAudio, createVoice, createHaptics } from './audio.js';
import { createPads } from './input.js';
import { createTrajService } from './traj-service.js';
import * as game from './game/game.js';
import * as scr from './ui/screens.js';
import * as menu from './ui/menus.js';
import { openCalib, mapPedals } from './ui/calib.js';
import { createSync } from './sync-github.js';

const VERSION = '5.5.0';
const qs = new URLSearchParams(location.search);

// ---------- data ----------
const boot = load(window.localStorage);
app.db = boot.db; app.S = app.db.settings; app.storage = window.localStorage;
app.saveNow = () => { if (!save(window.localStorage, app.db)) toast('Couldn’t save — storage is full or blocked. Export your data from More.'); };
if (boot.fromV4) checkBadges(app.db, null);                 // badges earned in v4 history count too
app.saveNow();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});   // ask the browser not to evict our data

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
world.applyTier(QTIERS[app.quality.tier]);
world.applyView(app.S, app.db.profile.hand);
world.setBall(app.S.ball, app.S.sight); world.setNight(!!app.S.night);
document.body.classList.toggle('life', world.calibrated);
app.onBallStats = (st) => {
  if (app.S.quality !== 'auto') return;
  const nt = app.quality.onBall(st);
  if (nt != null) world.applyTier(QTIERS[nt]);
};
let needsRender = true;
function applySettings(k) {
  if (k === 'quality') { if (app.S.quality !== 'auto') app.quality.tier = tierIndex(app.S.quality); world.applyTier(QTIERS[app.quality.tier]); }
  if (k === 'overlay') app.perf.setOverlay(app.S.overlay);
  applyA11y();
  world.setBall(app.S.ball, app.S.sight); world.setNight(!!app.S.night);
  world.applyView(app.S, app.db.profile.hand); needsRender = true;
  document.body.classList.toggle('life', world.calibrated);
}
app.applySettings = applySettings;
app.renderNow = () => { needsRender = true; world.render(world.camera, false); };
function applyA11y() {
  document.documentElement.style.setProperty('--fs', String(app.S.textScale || 1));
  document.body.classList.toggle('contrast', !!app.S.contrast);
  document.body.classList.toggle('calm', !!app.S.reduceMotion);
}
applyA11y();
app.perf.setOverlay(app.S.overlay || qs.has('debug'));
$('c').addEventListener('webglcontextlost', (e) => { e.preventDefault(); show('nolib', true); $('nolib').innerHTML = 'The graphics were reset by the device.<br><button class="btn" onclick="location.reload()">Reload</button>'; });

// ---------- navigation ----------
function goHome() { menu.renderHome(game.weakest); needsRender = true; if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); }
const TAB = { home: goHome, career: () => menu.renderCareer(id => start('trial', { boss: bossById(id) }), id => start('boss', { boss: bossById(id) })), progress: () => scr.renderProgress(), more: () => menu.renderMore() };
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { app.audio.click(); TAB[b.dataset.tab](); });
function back() {
  const s = app.state;
  if (s === 'sandbox') { if (game.G.sbOpen) game.closeSandbox(); else goHome(); }
  else if (s === 'settings' || s === 'howto' || s === 'sync') menu.renderMore();
  else if (s === 'career' || s === 'progress' || s === 'more' || s === 'end') goHome();
  else if (s === 'onboard') { /* stay: finish or skip onboarding */ }
}

// ---------- sessions ----------
let last = { kind: 'daily', opts: {} };
function start(kind, opts = {}) { last = { kind, opts }; game.startSession(kind, opts); }
game.setHooks({
  enter() { menu.only(null); app.state = 'session'; },
  leave() { needsRender = true; },
  sandbox() { scr.renderSandbox(true); },
  goHome,
  showEnd(s, score, rec) {
    const { db, audio, haptics } = app, extra = {};
    if (s.kind === 'trial') {
      const r = recordTrial(db, s.boss, score, rec.date);
      extra.trial = Object.assign(r, { tierName: TIERS[r.tier] });
    } else if (s.kind === 'boss') db.bosses[s.boss.id] = Math.max(db.bosses[s.boss.id] || 0, score);
    if (s.kind === 'tutorial') db.profile.onboarded = true;
    extra.badges = checkBadges(db, rec);
    app.saveNow();
    doSync(true);
    scr.renderEnd(s, score, rec, extra);
    if (extra.trial && extra.trial.promoted) { audio.fanfare(); haptics.reward(); app.voice.say(`Promoted to ${TIERS[extra.trial.tier]}!`); }
    else if (extra.badges.length) { audio.chime(); haptics.reward(); }
  },
});
$('bDaily').onclick = () => start('daily');
$('bStart').onclick = () => start('session');
$('bQuick').onclick = () => start('quick');
$('bSandbox').onclick = () => scr.renderSandbox(false);
$('bSbGo').onclick = () => { if (game.G.sbOpen) game.closeSandbox(); else start('sandbox'); };
$('bSbBack').onclick = () => goHome();
$('bSbChange').onclick = () => game.openSandbox();
$('bEndless').onclick = () => start('endless');
$('bDrill').onclick = () => start('short');
$('bSpin').onclick = () => start('spin');
$('bMatch').onclick = () => start('match');
$('bNets').onclick = () => start('nets');
$('bTrialTile').onclick = () => { const cs = careerState(app.db); if (cs.next && cs.unlocked) start('trial', { boss: cs.next }); else TAB.career(); };
$('bAgain').onclick = () => {
  const s = game.G.sess;
  if (s && s.kind === 'tutorial') start('daily'); else start(last.kind, last.opts);
};
$('bHome3').onclick = goHome;

// ---------- More ----------
let rtBack = () => menu.renderMore();
function reaction(backFn) { rtBack = backFn || (() => menu.renderMore()); scr.rtOpen(); }
$('bRT').onclick = () => reaction();
$('bHow').onclick = () => menu.only('howto');
$('bHowBack').onclick = () => menu.renderMore();
$('bControls').onclick = () => { $('controls').classList.toggle('hidden'); };
$('bTrig').onclick = () => { app.S.trigger = !app.S.trigger; app.saveNow(); menu.renderMore(); };
$('bSettings').onclick = () => scr.renderSettings(applySettings);
app.openSettings = () => scr.renderSettings(applySettings);
$('bCalib').onclick = () => openCalib();
$('bPedals').onclick = () => mapPedals();
$('bPedalsClear').onclick = () => { app.S.pedals = null; app.saveNow(); toast('Pedals cleared.'); };
$('bSetBack').onclick = () => menu.renderMore();
$('bExport').onclick = scr.doExport; $('bExport2').onclick = scr.doExport;
$('bImport').onclick = () => $('fileIn').click();
$('fileIn').onchange = (e) => { const f = e.target.files[0]; if (f) scr.doImport(f, (msg) => { checkBadges(app.db, null); app.saveNow(); toast(msg); scr.renderSettings(applySettings); }); e.target.value = ''; };
let resetArm = 0;
$('bReset').onclick = () => {
  const b = $('bReset');
  if (Date.now() - resetArm > 4000) { resetArm = Date.now(); b.textContent = 'Tap again to delete everything'; setTimeout(() => { b.textContent = 'Delete all saved data'; }, 4000); return; }
  scr.resetAll(); scr.renderSettings(applySettings); applySettings('view'); b.textContent = 'Deleted';
};
$('pBtn').onclick = () => game.togglePause();
$('rcHold').onclick = game.holdToggle; $('rcRep').onclick = () => game.replay(false); $('rcSlow').onclick = () => game.replay(true); $('rcNext').onclick = () => game.nextBall();
$('bResume').onclick = () => game.togglePause(); $('bEndNow').onclick = () => game.endSession(); $('bHome2').onclick = () => game.abandonToHome();

// ---------- sync (optional, the player's own GitHub) ----------
app.sync = createSync(window.localStorage);
const ago = (iso) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
function syncView() {
  const on = app.sync.on, st = app.sync.status;
  show('syncSetup', !on); show('syncOn', on);
  $('syncState').textContent = !on ? 'Not connected on this device.'
    : (st.err ? 'Last try failed: ' + st.err + ' ' : '') + (st.last ? `Last synced ${ago(st.last)}. ${app.db.sessions.length} sessions in total.` : 'Connected. Not synced yet.');
  $('syncSub').textContent = on ? (st.last ? 'On · synced ' + ago(st.last) : 'On') : 'One progress on all your devices';
}
app.syncView = syncView;
// quiet = automatic (start, after a session): only a real problem or new data makes a toast
function doSync(quiet) {
  if (!app.sync.on) return Promise.resolve(null);
  return app.sync.sync(app.db).then((r) => {
    app.saveNow();
    if (r && (r.sessions || r.level)) {
      toast(`Synced: ${r.sessions} session${r.sessions === 1 ? '' : 's'} from your other device${r.level ? ', level updated' : ''}.`);
      if (app.state === 'home') goHome(); else if (app.state === 'progress') TAB.progress();
    } else if (!quiet) toast('Synced. Everything is up to date.');
    if (app.state === 'sync' || app.state === 'more') syncView();
    return r;
  }).catch((e) => {
    if (!quiet || !/^Offline/.test(e.message)) toast('Sync: ' + e.message);
    if (app.state === 'sync' || app.state === 'more') syncView();
    return null;
  });
}
app.doSync = doSync;
$('bSync').onclick = () => { menu.only('sync'); syncView(); };
$('bSyncBack').onclick = () => menu.renderMore();
$('bSyncGo').onclick = () => {
  const t = $('syncTok').value.trim();
  if (t.length < 20) { toast('Paste the whole token (it starts with github_pat_).'); return; }
  app.sync.connect(t); $('syncTok').value = ''; syncView(); toast('Connecting…');
  doSync(false);
};
$('bSyncNow').onclick = () => doSync(false);
$('bSyncOff').onclick = () => { app.sync.disconnect(); syncView(); toast('This device is disconnected. Your data stays here and in your gist.'); };

// ---------- input ----------
const typing = () => { const a = document.activeElement; return a && (a.tagName === 'SELECT' || (a.tagName === 'INPUT' && a.type !== 'checkbox')); };
function rtPress(ts) { scr.rtPress(ts); if (!scr.rtActive()) rtBack(); }
addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'F2' || k === '`') { app.S.overlay = !app.perf.overlayOn; app.perf.setOverlay(app.S.overlay); app.saveNow(); e.preventDefault(); return; }
  if (scr.rtActive()) { e.preventDefault(); if (k === 'Escape') scr.rtClose(rtBack); else if (!e.repeat) rtPress(e.timeStamp); return; }
  if (game.onKey(e)) return;
  if (k === 'Escape') { back(); return; }
  if (typing()) return;
  const dir = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r' }[k];
  if (dir) { e.preventDefault(); menu.moveFocus(dir); return; }
  if (k === 'Enter' && (document.activeElement === document.body || !document.activeElement)) {
    if (app.state === 'home') start('daily'); else if (app.state === 'end') $('bAgain').click();
  }
});
addEventListener('pointerdown', (e) => {
  if (scr.rtActive()) { e.preventDefault(); rtPress(e.timeStamp); return; }
  game.onPointer(e);
}, { passive: false });
addEventListener('mousedown', (e) => { if (game.G.state === 'run' && e.button === 1) e.preventDefault(); });
addEventListener('contextmenu', (e) => { if (game.G.state === 'run' || game.G.state === 'result') e.preventDefault(); });
function onPad(E, su, sd, ts, gp, sl, sr) {
  if (scr.rtActive()) { rtPress(ts); return; }
  if (game.onPad(E, su, sd, ts, gp, sl, sr)) return;
  // menus: D-pad / stick move, A choose, B back, LB/RB tabs, Menu = start the daily session from Play
  if (E[12] || su) menu.moveFocus('u'); else if (E[13] || sd) menu.moveFocus('d');
  else if (E[14] || sl) menu.moveFocus('l'); else if (E[15] || sr) menu.moveFocus('r');
  else if (E[0]) { if (!menu.clickFocused()) { if (app.state === 'home') start('daily'); else if (app.state === 'end') $('bAgain').click(); } }
  else if (E[1]) back();
  else if (E[4]) menu.stepTab(-1); else if (E[5]) menu.stepTab(1);
  else if (E[9] && app.state === 'home') start('daily');
}
addEventListener('gamepadconnected', () => { if (app.state === 'more') menu.renderMore(); });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && (game.G.state === 'run' || game.G.state === 'result')) game.togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && (game.G.state === 'run' || game.G.state === 'result')) game.togglePause(); });
addEventListener('resize', () => { world.resize(); needsRender = true; document.body.classList.toggle('life', world.calibrated); });

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
  show(t, true); clearTimeout(toast.tm); toast.tm = setTimeout(() => show(t, false), act ? 15000 : 6000);
}
app.toast = toast;

// ---------- go ----------
$('ver').textContent = 'v' + VERSION;
world.bowler.pose(0, { s: 1, xo: 0, tw: 1, ao: 0 }, 0, 0);
const onboardApi = { applyView: () => world.applyView(app.S, app.db.profile.hand), reaction: (cb) => reaction(cb), tutorial: () => start('tutorial'), home: goHome,
  calibrate: (cb) => openCalib(cb) };
if (!app.db.profile.onboarded) menu.onboarding(0, onboardApi);
else {
  goHome();
  if (boot.fromV4 && boot.added) toast(`Welcome to v5. Your ${boot.added} v4 session${boot.added === 1 ? '' : 's'}, level and reaction time came across.`);
  else if (!app.db.profile.seenV5) toast('New: Daily session, career trials with boss bowlers, badges and offline install.');
}
app.db.profile.seenV5 = true; app.saveNow();
syncView(); doSync(true);
requestAnimationFrame(loop);
// Test hook (headless browser tests): read-only peek at state.
window.__lr = { app, game, menu, VERSION, KEY };
