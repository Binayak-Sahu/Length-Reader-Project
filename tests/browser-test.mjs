// Browser tests in headless Chromium (Playwright). Run from the repo root:  node tests/browser-test.mjs
// Needs Playwright + Chromium (CI installs them; locally: npm i -g playwright && npx playwright install chromium).
// Headless Chromium renders with SwiftShader (software), so frame RATES here say nothing about a real GPU;
// the CPU (JavaScript) time per frame is still meaningful and is reported.
import { createRequire } from 'node:module';
import { makeOk } from './util.mjs';
import { serve } from '../tools/serve.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const { ok, done } = makeOk('browser');

const PORT = 8123, BASE = `http://localhost:${PORT}/`;
const srv = await serve(PORT);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function page(ctx, url, init) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(url + ' ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(url + ' console: ' + m.text()); });
  if (init) await p.addInitScript(init);
  await p.goto(BASE + url, { waitUntil: 'load' });
  return p;
}
const waitFor = (p, fn, arg, ms = 20000) => p.waitForFunction(fn, arg, { timeout: ms, polling: 20 });

// ---------- 1. v4 player opens v5 for the first time ----------
const v4 = { settings: { maxKph: 110, view: 'auto', trigger: false, hawk: true, sound: false, voice: false, fullscreen: false }, level: 2, rtBase: 0.262,
  sessions: [{ date: '2026-10-25T09:00:00.000Z', drill: 'nets', n: 1, score: 100, peak: 2, end: 2, bestStreak: 1,
    balls: [{ d: 8, lx: 0, lxB: 0, kph: 100, occ: null, lvl: 2, mode: 1, cat: 'Short', spin: false, foot: 'B', rt: 0.4, read: 0.14, fe: 'B', fv: 'good', v: 'good', sc: 1 }] }] };
const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
let p = await page(ctx, '?nosw', `if(!sessionStorage.seeded){ localStorage.setItem('lr_v3', ${JSON.stringify(JSON.stringify(v4))}); sessionStorage.seeded=1; }`);
await waitFor(p, () => window.__lr && document.querySelector('#home:not(.hidden)'));
{
  const r = await p.evaluate(() => { const d = window.__lr.app.db; return { n: d.sessions.length, lvl: d.level, kph: d.settings.maxKph, xp: d.sessions[0] && d.sessions[0].xp, toast: document.querySelector('#toast').textContent }; });
  ok(r.n === 1 && r.lvl === 2 && r.kph === 110, 'v4 data migrated in the real browser (sessions, level, settings)');
  ok(/v4 session/.test(r.toast), 'a welcome toast tells the player their v4 data came across');
  ok(r.xp === 16, `v4 nets read earns retro XP: 10 × 1.06 (level 2) × 1.5 (nets) = 16 (got ${r.xp})`);
}

// ---------- 2. timing: a real key press, a blocked main thread, and the frame that showed the release ----------
await p.evaluate(() => {
  window.__keyTs = []; window.__block = 0;
  // capture phase runs before the app's handler: make the handler run late on purpose
  addEventListener('keydown', e => { window.__keyTs.push(e.timeStamp); const end = performance.now() + window.__block; while (performance.now() < end); }, true);
  const S = window.__lr.app.S; S.levelMode = '2'; S.feedback = 'always'; S.sound = false; S.voice = false; S.fullscreen = false; S.club = false; S.spinners = false;
});
await p.click('#bQuick');
for (let i = 0; i < 2; i++) {
  await waitFor(p, () => { const c = window.__lr.game.clock, G = window.__lr.game.G; return G.state === 'run' && c.relTs !== null; });
  await p.waitForTimeout(60);
  await p.evaluate(b => { window.__block = b; }, i === 0 ? 0 : 40);
  await p.keyboard.press('ArrowRight');
  await waitFor(p, n => window.__lr.game.G.sess.balls.length > n, i);
  const r = await p.evaluate(n => { const b = window.__lr.game.G.sess.balls[n], c = window.__lr.game.clock; return { rt: b.rt, key: window.__keyTs[n], rel: c.relTs, src: b.src, hz: b.hz, tbP: b.tbP }; }, i);
  const want = +((r.key - r.rel) / 1000).toFixed(3);
  ok(Math.abs(r.rt - want) < 0.0011 && r.src === 'key', `ball ${i + 1}: response ${r.rt}s = key event stamp − release frame stamp${i ? ' (handler blocked 40 ms: ignored)' : ''}`);
  if (i === 0) await p.evaluate(() => window.__lr.game.nextBall());
}
{
  const t = await p.evaluate(() => window.__lr.app.traj.stats);
  ok(t.worker >= 2 && t.sync === 0, `trajectories solved in the worker (${t.worker} worker, ${t.sync} fallback)`);
}

// ---------- 3. occlusion: the renderer draws black frames after release ----------
await p.evaluate(() => { window.__lr.game.abandonToHome(); window.__lr.app.S.levelMode = '8'; });   // L1 · 120 kph · black at release
await p.click('#bQuick');
await waitFor(p, () => window.__lr.game.G.state === 'run');
const lum = await p.evaluate(() => new Promise(res => {
  const cv = document.getElementById('c'), probe = document.createElement('canvas'); probe.width = 32; probe.height = 18;
  const g = probe.getContext('2d', { willReadFrequently: true }), c = window.__lr.game.clock, out = { before: null, after: null };
  const f = () => {
    const tau = c.t0 ? c.tau(performance.now()) : -9;
    if (out.before === null && tau > -1.2 && tau < -0.3) { g.drawImage(cv, 0, 0, 32, 18); out.before = avg(); }
    if (c.occTs !== null && out.after === null) { g.drawImage(cv, 0, 0, 32, 18); out.after = avg(); out.occA = (c.occTs - c.relTs); return res(out); }
    requestAnimationFrame(f);
  };
  const avg = () => { const d = g.getImageData(0, 0, 32, 18).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; };
  requestAnimationFrame(f);
}));
ok(lum.before > 60 && lum.after < 3, `blackout: scene brightness ${lum.before.toFixed(0)} before release → ${lum.after.toFixed(1)} on the occluded frame`);
ok(lum.occA >= 0 && lum.occA < 1, `occlusion starts on the release frame itself (+${lum.occA.toFixed(1)} ms)`);
await waitFor(p, () => window.__lr.game.G.state === 'result');
ok(await p.evaluate(() => { const b = window.__lr.game.G.sess.balls[0]; return b.occ === 0 && b.occA != null; }), 'ball record stores the planned and the actual (presented) occlusion');

// ---------- 4. pause and resume ----------
await p.evaluate(() => { window.__lr.game.nextBall(); });
await waitFor(p, () => window.__lr.game.G.state === 'run' && window.__lr.game.clock.t0 !== null);
await p.keyboard.press('p');
ok(await p.evaluate(() => window.__lr.game.G.state === 'paused' && !document.getElementById('pause').classList.contains('hidden')), 'P pauses mid-delivery');
const t0a = await p.evaluate(() => window.__lr.game.clock.t0);
await p.waitForTimeout(400);
await p.keyboard.press(' ');
const t0b = await p.evaluate(() => window.__lr.game.clock.t0);
ok(await p.evaluate(() => window.__lr.game.G.state === 'run') && t0b - t0a >= 380, `resume shifts the ball clock by the pause (${(t0b - t0a).toFixed(0)} ms)`);
await p.evaluate(() => window.__lr.game.endSession());
await waitFor(p, () => !document.getElementById('end').classList.contains('hidden'));
ok(await p.evaluate(() => /XP/.test(document.getElementById('eMeta').textContent)), 'end screen shows XP earned');
ok(await p.evaluate(() => JSON.parse(localStorage.getItem('lr5')).sessions.length === 2), 'ended session saved to localStorage (lr5); abandoned ones are not (as in v4)');

// ---------- 5. nets rules: no verdict, bowler walks back, Ready skips ----------
await p.evaluate(() => { const S = window.__lr.app.S; S.levelMode = 'auto'; S.netsGap = 30; });
await p.click('#bHome3'); await p.click('#bNets');
await waitFor(p, () => window.__lr.game.G.state === 'result' && window.__lr.game.G.wait, null, 30000);
ok(await p.evaluate(() => document.getElementById('card').classList.contains('hidden') && document.getElementById('rcNext').textContent.includes('Ready')), 'nets: no verdict card, Ready button shown while the bowler walks back');
await p.click('#rcNext');
ok(await p.evaluate(() => window.__lr.game.G.state === 'run'), 'Ready starts the next ball at once');
await p.evaluate(() => window.__lr.game.abandonToHome());

// ---------- 5b. daily session: warm-up → focus → pressure over (fast-forwarded) ----------
await p.click('#bDaily');
await waitFor(p, () => window.__lr.game.G.state === 'intro' && /WARM-UP/.test(document.getElementById('banner').textContent));
ok(true, 'daily: warm-up banner first');
await waitFor(p, () => window.__lr.game.G.state === 'run');
const wu = await p.evaluate(() => { const s = window.__lr.game.G.sess; return { lvl: window.__lr.game.G.cur.lvl, base: s.level }; });
ok(wu.lvl === Math.max(0, wu.base - 1), `daily warm-up bowls one step easier (step ${wu.lvl} vs your ${wu.base})`);
await p.evaluate(() => { const s = window.__lr.game.G.sess; s.segN = 8; window.__lr.game.nextBall(); });
ok(await p.evaluate(() => window.__lr.game.G.state === 'intro' && /FOCUS/.test(document.getElementById('banner').textContent)), 'daily: focus block follows with its banner');
await waitFor(p, () => window.__lr.game.G.state === 'run');
await p.evaluate(() => { const s = window.__lr.game.G.sess; s.segN = 20; window.__lr.game.nextBall(); });
ok(await p.evaluate(() => /PRESSURE OVER/.test(document.getElementById('banner').textContent)), 'daily: pressure over last');
await waitFor(p, () => window.__lr.game.G.state === 'run');
ok(await p.evaluate(() => { const G = window.__lr.game.G; return G.cur.seg.walk && G.cur.seg.fb === 'end' && G.cur.occ === null; }), 'pressure over uses nets rules (no feedback, no blackout, walk-back)');
await p.evaluate(() => window.__lr.game.abandonToHome());

// ---------- 6. CPU frame time during deliveries ----------
await p.click('#bEndless');
await waitFor(p, () => window.__lr.game.G.sess.balls.length >= 2, null, 40000);
const perf = await p.evaluate(() => { const r = window.__lr.app.perf.recent(), a = r.cpu.filter(x => x > 0).sort((x, y) => x - y); return { p50: a[a.length >> 1], p95: a[Math.floor(a.length * 0.95)], n: a.length, info: window.__lr.app.world.info() }; });
console.log(`     CPU per frame (JS + draw submission): median ${perf.p50.toFixed(2)} ms, p95 ${perf.p95.toFixed(2)} ms over ${perf.n} frames · ${perf.info.calls} draw calls, ${perf.info.tris} triangles`);
ok(perf.p50 < 4, `median CPU per frame ${perf.p50.toFixed(2)} ms (budget 6.06 ms at 165 Hz; SwiftShader inflates this)`);
ok(perf.info.calls < 60, `draw calls per frame: ${perf.info.calls} (instanced trees, merged lines)`);
await p.evaluate(() => window.__lr.game.abandonToHome());

// ---------- 6b. ball colour + sight screen setting ----------
{
  const r = await p.evaluate(() => { const w = window.__lr.app.world, red = w.ball.material.map; w.setBall('white', true); const white = w.ball.material.map;
    const out = { changed: red !== white }; w.setBall('red', true); out.back = w.ball.material.map === red; return out; });
  ok(r.changed && r.back, 'white-ball setting swaps the ball (and the sight screen to black), and back');
}

// ---------- 7. left-handers: mirrored camera and release point ----------
await p.evaluate(() => { const a = window.__lr.app; a.db.profile.hand = 'L'; a.world.applyView(a.S, 'L'); });
await p.click('#bQuick');
await waitFor(p, () => window.__lr.game.G.state === 'run');
const lh = await p.evaluate(() => { const a = window.__lr.app, w = a.world; return { cam: w.camera.position.x, frame: w.frame.scale.x, rel: w.releasePoint().x }; });
ok(lh.cam > 0 && lh.frame === -1, 'left-hander: camera on the other side, batter frame mirrored');
await p.evaluate(() => { window.__lr.game.abandonToHome(); const a = window.__lr.app; a.db.profile.hand = 'R'; a.world.applyView(a.S, 'R'); });
await p.close();

// ---------- 8. old URL, mirror page ----------
p = await page(ctx, 'length-reader.html');
await p.waitForURL(u => !u.pathname.endsWith('length-reader.html'), { timeout: 5000 }).catch(() => {});
ok(new URL(p.url()).pathname === '/', 'old length-reader.html address redirects to the new app');
await p.close();
p = await page(ctx, 'mirror.html');
ok(await p.evaluate(async () => (await fetch('vendor/mediapipe/vision_bundle.mjs', { method: 'HEAD' })).ok && (await fetch('vendor/mediapipe/pose_landmarker_lite.task', { method: 'HEAD' })).ok
  && (await fetch('vendor/mediapipe/wasm/vision_wasm_internal.wasm', { method: 'HEAD' })).ok), 'mirror: MediaPipe bundle, wasm and pose model served from this site');
ok(await p.evaluate(() => !document.documentElement.innerHTML.includes('cdn.jsdelivr') && !document.documentElement.innerHTML.includes('storage.googleapis')), 'mirror: no CDN addresses left');
ok(await p.evaluate(async () => { const V = await import(new URL('vendor/mediapipe/vision_bundle.mjs', location.href).href); return typeof V.FilesetResolver.forVisionTasks === 'function'; }), 'mirror: local MediaPipe module loads');
await p.close();
await ctx.close();

// ---------- 8b. first run: onboarding → tutorial ----------
{
  const c = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const q = await page(c, '?nosw');
  await waitFor(q, () => window.__lr && document.querySelector('#onboard:not(.hidden)'));
  ok(true, 'a new player starts with onboarding');
  await q.click('#obNext');                                      // welcome → hand
  await q.click('[data-h="L"]');                                 // left-handed
  ok(await q.evaluate(() => window.__lr.app.db.profile.hand === 'L' && window.__lr.app.world.camera.position.x > 0), 'choosing left-handed mirrors the view straight away');
  await q.click('#obNext');                                      // setup → life-size calibration
  await q.click('#obNext');                                      // open "Calibrate my setup"
  await waitFor(q, () => !document.getElementById('calib').classList.contains('hidden'));
  ok(await q.evaluate(() => /VERTICAL VIEW/.test(document.getElementById('calRes').textContent)), 'onboarding offers calibration with live results');
  await q.click('#cSave');
  await waitFor(q, () => document.querySelector('#onboard:not(.hidden)'));
  ok(await q.evaluate(() => window.__lr.app.world.calibrated && !!window.__lr.app.S.calib.landscape), 'saving the calibration turns on true life-size');
  await q.click('#obSkip');                                      // skip the reaction test
  await q.click('#obNext');                                      // bowl the tutorial
  await waitFor(q, () => window.__lr.game.G.state === 'intro' && /BALL 1/.test(document.getElementById('banner').textContent));
  ok(true, 'tutorial coaches ball 1 with a banner');
  await waitFor(q, () => window.__lr.game.G.state === 'run');
  ok(await q.evaluate(() => { const c = window.__lr.game.G.cur; return c.g.cat === 'Full' && c.g.kph <= 83 && document.getElementById('zones').classList.contains('lbl'); }), 'tutorial ball 1 is a scripted full ball at 80 kph');
  await q.evaluate(() => { const G = window.__lr.game.G; for (let i = 0; i < 4; i++) G.sess.balls.push({ d: 3, lx: 0, lxB: 0, kph: 80, cat: 'Full', fe: 'F', fv: 'good', v: 'good', ok: true, sc: 1, xp: 10, mode: 1 }); G.sess.xp = 40; window.__lr.game.endSession(); });
  await waitFor(q, () => !document.getElementById('end').classList.contains('hidden'));
  ok(await q.evaluate(() => window.__lr.app.db.profile.onboarded && /first daily/.test(document.getElementById('bAgain').textContent)), 'after the tutorial: onboarded, and the next step is the first daily session');
  ok(await q.evaluate(() => /First Read/.test(document.getElementById('eBadges').textContent)), 'first badge shown on the end screen');
  await c.close();
}

// ---------- 8c. career trial → promotion ----------
{
  const c = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const q = await page(c, '?nosw', `localStorage.setItem('lr5', JSON.stringify({ v: 5, profile: { hand: 'R', onboarded: true, seenV5: true }, settings: { sound: false, voice: false, fullscreen: false }, level: 2, levelD: 0.5, sessions: [], career: { tier: 0, trials: [] }, badges: {}, bosses: {}, v3: { merged: true, last: null, count: 0 }, imports: [] }));`);
  await waitFor(q, () => window.__lr && document.querySelector('#home:not(.hidden)'));
  ok(await q.evaluate(() => !document.getElementById('bTrialTile').classList.contains('locked') && /Metronome/.test(document.getElementById('trialTitle').textContent)), 'Play tab offers the unlocked Club trial');
  await q.click('#bTrialTile');
  await waitFor(q, () => window.__lr.game.G.state === 'run');
  ok(await q.evaluate(() => { const c = window.__lr.game.G.cur; return c.prof.id === 'metronome' && c.mode === 1 && c.seg.fb === 'end' && c.seg.n === 12; }), 'trial: the boss bowls, 12 balls, nets rules');
  await q.evaluate(() => { const G = window.__lr.game.G; G.sess.balls = []; for (let i = 0; i < 12; i++) G.sess.balls.push({ d: 8, lx: 0, lxB: 0, kph: 100, cat: 'Short', fe: 'B', fv: i < 10 ? 'good' : 'bad', v: i < 10 ? 'good' : 'bad', ok: i < 10, sc: i < 10 ? 1 : 0, xp: 0, mode: 1 }); window.__lr.game.endSession(); });
  await waitFor(q, () => !document.getElementById('end').classList.contains('hidden'));
  ok(await q.evaluate(() => /PROMOTED TO CLUB/.test(document.getElementById('eTrial').textContent) && window.__lr.app.db.career.tier === 1), '10/12 (83%) → promoted to Club, shown on the end screen');
  await q.click('#bHome3');
  ok(await q.evaluate(() => document.getElementById('pTier').textContent === 'CLUB'), 'home shows the new rank');
  // tabs + keyboard focus navigation
  await q.click('#tCareer');
  ok(await q.evaluate(() => !document.getElementById('career').classList.contains('hidden') && document.querySelectorAll('#bossNets [data-boss]').length === 1), 'Career tab: ladder plus boss nets for the beaten boss');
  await q.keyboard.press('Escape');
  ok(await q.evaluate(() => window.__lr.app.state === 'home'), 'Esc goes back to Play');
  await q.keyboard.press('ArrowDown'); await q.keyboard.press('ArrowDown');
  ok(await q.evaluate(() => document.activeElement && document.activeElement.tagName === 'BUTTON' && document.activeElement.id !== 'bDaily'), 'arrow keys move focus around the menu (10-foot / controller style)');
  await c.close();
}

// ---------- 8d. Bink's setup: 27" upright, calibrated true life-size; card, pedals, controller ----------
{
  const c = await browser.newContext({ viewport: { width: 540, height: 960 } });
  const calib = { portrait: { orient: 'portrait', hCm: 59.8, wCm: 33.6, distCm: 130, eyeCm: 150, bottomCm: 100 } };
  const q = await page(c, '?nosw', `localStorage.setItem('lr5', JSON.stringify({ v: 5, profile: { hand: 'R', onboarded: true, seenV5: true }, settings: { sound: false, voice: false, fullscreen: false, feedback: 'always', levelMode: '9', calib: ${JSON.stringify(calib)} }, level: 9 }));`);
  await waitFor(q, () => window.__lr && document.querySelector('#home:not(.hidden)'));
  const g = await q.evaluate(() => { const w = window.__lr.app.world; return { cal: w.calibrated, eye: w.toScreen(0, 1.5, 300).y, rel: w.toScreen(0, 2.2, 17.75).y, H: innerHeight }; });
  const eyeWant = 9.8 / 59.8 * g.H, relWant = eyeWant - 5.17 / 59.8 * g.H * (17.6 / 17.6);
  ok(g.cal && Math.abs(g.eye - eyeWant) < 1, `calibrated: your eye line is drawn ${g.eye.toFixed(1)} px from the top (expected ${eyeWant.toFixed(1)} = 9.8 cm of 59.8)`);
  ok(Math.abs(g.rel - (eyeWant - 5.21 / 59.8 * g.H)) < 2, `release point ${(g.eye - g.rel).toFixed(0)} px above the eye line (≈ 5.2 cm)`);
  ok(await q.evaluate(() => window.__lr.app.world.ball.scale.x === 1), 'ball at true size when calibrated (no boost)');
  // pedals (keyboard codes) + controller RT = leave in Level 2
  await q.evaluate(() => { window.__lr.app.S.pedals = { F: 'KeyJ', B: 'KeyK', P: 'KeyL' }; });
  await q.click('#bQuick');
  await waitFor(q, () => window.__lr.game.G.state === 'run' && window.__lr.game.clock.relTs !== null);
  await q.keyboard.press('k');
  ok(await q.evaluate(() => window.__lr.game.G.cur.foot === 'B' && window.__lr.game.G.cur.src === 'pedal'), 'mapped BACK pedal moves the feet (timed like any key)');
  await q.evaluate(() => { const E = new Uint8Array(32); E[7] = 1; window.__lr.game.onPad(E, false, false, performance.now()); const E2 = new Uint8Array(32); window.__lr.game.onPad(E2, false, true, performance.now(), null, false, false); });
  ok(await q.evaluate(() => { const c = window.__lr.game.G.cur; return c.left === true && c.played === false; }), 'controller RT = LEAVE, and a later stick push (play) is ignored');
  await waitFor(q, () => !document.getElementById('card').classList.contains('hidden'), null, 20000);
  const box = await q.evaluate(() => { const r = document.getElementById('card').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, H: innerHeight }; });
  ok(box.top > box.H * 0.6, `portrait card sits in the lower third (top at ${(100 * box.top / box.H).toFixed(0)}% of the screen)`);
  await q.waitForTimeout(2800);
  ok(await q.evaluate(() => document.getElementById('card').classList.contains('hidden')), 'card hides itself after 2.5 s');
  ok(await q.evaluate(() => window.__lr.game.G.sess.balls[0].left === true), 'ball record notes the explicit leave');
  // LT = trigger
  await q.evaluate(() => { window.__lr.app.S.trigger = true; window.__lr.game.nextBall(); });
  await waitFor(q, () => { const c = window.__lr.game.clock; return window.__lr.game.G.state === 'run' && c.t0 && c.tau(performance.now()) > -0.25 && c.tau(performance.now()) < 0; });
  await q.evaluate(() => { const E = new Uint8Array(32); E[6] = 1; window.__lr.game.onPad(E, false, false, performance.now()); });
  ok(await q.evaluate(() => window.__lr.game.G.cur.trig !== null), 'controller LT = trigger');
  // side-on L2: X = front foot, then any left-stick push = PLAY
  await waitFor(q, () => window.__lr.game.G.state === 'result');
  await q.evaluate(() => { window.__lr.app.S.trigger = false; window.__lr.game.nextBall(); });
  await waitFor(q, () => { const c = window.__lr.game.clock; return window.__lr.game.G.state === 'run' && c.t0 && c.tau(performance.now()) > 0; });
  await q.evaluate(() => { const E = new Uint8Array(32); E[2] = 1; window.__lr.game.onPad(E, false, false, performance.now(), null, false, false);
    window.__lr.game.onPad(new Uint8Array(32), false, false, performance.now(), null, true, false); });
  ok(await q.evaluate(() => { const c = window.__lr.game.G.cur; return c.foot === 'F' && c.played === true; }), 'side-on L2: X = FRONT, then a stick push = PLAY');
  // night mode + length marks
  ok(await q.evaluate(() => { const a = window.__lr.app; a.S.night = true; a.S.lenMarks = 'on'; a.applySettings('night'); a.renderNow(); a.S.night = false; a.applySettings('night'); return true; }), 'night mode and length markings switch without errors');
  await q.evaluate(() => window.__lr.game.abandonToHome());
  await c.close();
}

// ---------- 8e. side-on controller, Level 4 shots: foot button first, then the left stick ----------
{
  const c = await browser.newContext({ viewport: { width: 800, height: 450 } });
  const q = await page(c, '?nosw', `localStorage.setItem('lr5', JSON.stringify({ v: 5, profile: { hand: 'R', onboarded: true, seenV5: true }, settings: { sound: false, voice: false, fullscreen: false, feedback: 'always', hawk: false, levelMode: '23' }, level: 23 }));`);
  await waitFor(q, () => window.__lr && document.querySelector('#home:not(.hidden)'));
  await q.click('#bQuick');
  const live = () => waitFor(q, () => { const g = window.__lr.game, c = g.clock; return g.G.state === 'run' && g.G.cur && g.G.cur.mode === 4 && c.t0 && c.tau(performance.now()) > 0; });
  const pad = (btn, dir) => q.evaluate(([btn, dir]) => {
    const E = new Uint8Array(32); if (btn != null) E[btn] = 1;
    window.__lr.game.onPad(E, dir === 'u', dir === 'd', performance.now(), null, dir === 'l', dir === 'r');
  }, [btn, dir]);
  const cur = () => q.evaluate(() => { const c = window.__lr.game.G.cur; return { foot: c.foot, shot: c.shot, at: window.__lr.game.clock.marks.foot }; });
  const next = async () => { await waitFor(q, () => window.__lr.game.G.state === 'result'); await q.evaluate(() => window.__lr.game.nextBall()); await live(); };
  await live();
  await pad(2, null); const r1 = await cur(); await q.waitForTimeout(30); await pad(null, 'l'); const r2 = await cur();
  ok(r1.foot === 'F' && !r1.shot && r2.shot === 'SD' && r1.at != null && r2.at === r1.at, 'L4: X = front foot (timed), then stick ← = straight drive (the read time stays the foot press)');
  await next(); await pad(1, null); await pad(null, 'd');
  ok((await cur()).shot === 'PU', 'L4: B = back foot, then stick ↓ = pull');
  await next(); await pad(2, null); await pad(null, 'd');
  ok((await cur()).shot === 'FL', 'L4: X then stick ↓ = flick');
  await next(); await pad(1, null); await pad(null, 'u');
  ok((await cur()).shot === 'BP', 'L4: B then stick ↑ = back-foot punch');
  await next(); await pad(1, null);
  await waitFor(q, () => window.__lr.game.G.state === 'result');
  ok(await q.evaluate(() => { const b = window.__lr.game.G.sess.balls; return b[b.length - 1].shot === 'BD'; }), 'L4: a foot with no stick push is graded as that foot\'s defence');
  await q.evaluate(() => window.__lr.game.nextBall()); await live();
  await pad(null, 'r');
  ok((await cur()).shot === 'BD', 'L4: stick → with no foot first = back defence (unambiguous)');
  await next(); await q.evaluate(() => { window.__lr.app.db.profile.hand = 'L'; }); await pad(2, null); await pad(null, 'r');
  ok((await cur()).shot === 'SD', 'left-hander: stick → is the off-side drive (mirrored)');
  await q.evaluate(() => window.__lr.game.abandonToHome());
  await c.close();
}

// ---------- 8f. sync phone + PC through a (fake) GitHub gist; Progress table clears the tab bar ----------
{
  const gists = {}; let nid = 0; const calls = [];
  const fakeGitHub = async (route) => {
    const req = route.request(), u = new URL(req.url()), m = req.method();
    calls.push({ m, path: u.pathname, auth: req.headers()['authorization'] });
    if (req.headers()['authorization'] !== 'Bearer github_pat_TEST_TOKEN_1234567890') return route.fulfill({ status: 401, body: '{}' });
    const json = (o, st = 200) => route.fulfill({ status: st, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    if (m === 'GET' && u.pathname === '/gists') return json(Object.values(gists).map(g => ({ id: g.id, files: { [g.name]: {} } })));
    if (m === 'POST' && u.pathname === '/gists') { const b = JSON.parse(req.postData()), id = 'g' + (++nid), name = Object.keys(b.files)[0];
      gists[id] = { id, name, content: b.files[name].content, public: b.public }; return json({ id }, 201); }
    const g = gists[u.pathname.split('/')[2]];
    if (!g) return json({}, 404);
    if (m === 'GET') return json({ id: g.id, files: { [g.name]: { truncated: true, content: g.content.slice(0, 20), raw_url: 'https://gist.githubusercontent.com/raw/' + g.id } } });
    if (m === 'PATCH') { const b = JSON.parse(req.postData()); g.content = b.files[g.name].content; return json({ id: g.id }); }
    return route.fulfill({ status: 405, body: '' });
  };
  const fakeRaw = (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: gists[new URL(route.request().url()).pathname.split('/').pop()].content });
  const ses = (d, sc) => ({ date: d, kind: 'session', n: 4, score: sc, xp: 40, balls: Array.from({ length: 4 }, () => ({ d: 8, lx: 0, kph: 100, lvl: 5, mode: 1, cat: 'Short', foot: 'B', fe: 'B', fv: 'good', v: 'good', sc: 1, ok: true, rt: 0.4 })) });
  const day = (i) => new Date(Date.UTC(2026, 8, 1 + i, 9)).toISOString();
  const device = async (vp, sessions, extra) => {
    const c = await browser.newContext({ viewport: vp });
    await c.route('https://api.github.com/**', fakeGitHub); await c.route('https://gist.githubusercontent.com/**', fakeRaw);
    const q = await page(c, '?nosw', `if (!localStorage.getItem('lr5')) localStorage.setItem('lr5', ${JSON.stringify(JSON.stringify(Object.assign({ v: 5, profile: { hand: 'R', onboarded: true, seenV5: true }, settings: { sound: false, voice: false, fullscreen: false }, sessions }, extra)))});`);
    await waitFor(q, () => window.__lr && document.querySelector('#home:not(.hidden)'));
    return { c, q };
  };
  const connect = async (q, tok) => {
    await q.evaluate(() => window.__lr.menu.renderMore()); await q.click('#bSync');
    await q.fill('#syncTok', tok); await q.click('#bSyncGo');
  };
  // phone: 3 sessions, level 5
  const A = await device({ width: 412, height: 915 }, [0, 1, 2].map(i => ses(day(i), 70)), { level: 5, rtBase: 0.30 });
  await connect(A.q, 'github_pat_WRONG_TOKEN_1234567890');
  await waitFor(A.q, () => /rejected the token/.test(document.getElementById('syncState').textContent));
  ok(true, 'sync: a wrong token gives a clear message (no crash)');
  await A.q.click('#bSyncOff'); await connect(A.q, 'github_pat_TEST_TOKEN_1234567890');
  await waitFor(A.q, () => /Last synced/.test(document.getElementById('syncState').textContent));
  const g1 = Object.values(gists);
  ok(g1.length === 1 && g1[0].public === false && g1[0].name === 'length-reader-sync.json', 'sync: first device creates one SECRET gist');
  ok(await A.q.evaluate(() => !JSON.stringify(window.__lr.app.db).includes('github_pat_') && !localStorage.getItem('lr5').includes('github_pat_')), 'sync: the token is never stored in the saved data (or its export)');
  // PC: 30 different sessions (so the Progress table scrolls), its own reaction time and calibration
  const B = await device({ width: 1100, height: 620 }, Array.from({ length: 30 }, (_, i) => ses(day(10 + i), 85)), { level: 8, rtBase: 0.262, settings: { sound: false, voice: false, fullscreen: false, maxKph: 120 } });
  await connect(B.q, 'github_pat_TEST_TOKEN_1234567890');
  await waitFor(B.q, () => /Last synced/.test(document.getElementById('syncState').textContent));
  const b = await B.q.evaluate(() => { const d = window.__lr.app.db; return { n: d.sessions.length, lvl: d.level, rt: d.rtBase, kph: d.settings.maxKph, toast: document.getElementById('toast').textContent }; });
  ok(b.n === 33 && b.lvl === 8 && b.rt === 0.262 && b.kph === 120 && /3 sessions/.test(b.toast), `sync: PC pulls the phone's 3 sessions (now ${b.n}), keeps its own reaction time and settings; long gist read via raw_url`);
  await A.q.click('#bSyncNow');
  await waitFor(A.q, () => window.__lr.app.db.sessions.length === 33);
  ok(await A.q.evaluate(() => window.__lr.app.db.level === 8 && window.__lr.app.db.rtBase === 0.30), 'sync: phone gets the PC sessions and the higher level, keeps its own reaction time');
  const nPatch = calls.filter(x => x.m === 'PATCH').length;
  await A.q.click('#bSyncNow'); await waitFor(A.q, () => /up to date/.test(document.getElementById('toast').textContent));
  ok(calls.filter(x => x.m === 'PATCH').length === nPatch, 'sync: nothing changed → nothing written');
  await A.c.setOffline(true); await A.q.click('#bSyncNow');
  await waitFor(A.q, () => /Offline/.test(document.getElementById('toast').textContent));
  ok(true, 'sync offline: a toast, no crash, data kept');
  await A.c.close();
  // Progress tab: the last "day by day" row scrolls fully above the tab bar
  await B.q.click('#bSyncBack'); await B.q.click('#nav button[data-tab="progress"]');
  await B.q.evaluate(() => { const s = document.getElementById('progress'); s.scrollTop = s.scrollHeight; });
  await B.q.waitForTimeout(100);
  const lay = await B.q.evaluate(() => { const rows = document.querySelectorAll('#progTable tbody tr'), r = rows[rows.length - 1].getBoundingClientRect(), n = document.getElementById('nav').getBoundingClientRect(); return { rows: rows.length, rowBottom: r.bottom, navTop: n.top }; });
  ok(lay.rows >= 30 && lay.rowBottom <= lay.navTop, `Progress: last table row ends at ${lay.rowBottom.toFixed(0)} px, above the tab bar (${lay.navTop.toFixed(0)} px)`);
  await B.c.close();
}

// ---------- 8g. sandbox: pick every ball, change it mid-session ----------
{
  const c = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const q = await page(c, '?nosw', `localStorage.setItem('lr5', JSON.stringify({ v: 5, profile: { hand: 'R', onboarded: true, seenV5: true }, settings: { sound: false, voice: false, fullscreen: false, feedback: 'always', hawk: false, gap: 0.8 }, level: 4, levelD: 0.5 }));`);
  await waitFor(q, () => window.__lr && document.querySelector('#home:not(.hidden)'));
  await q.click('#bSandbox');
  ok(await q.evaluate(() => document.querySelectorAll('#sbRows .sbChip.on').length === 6 && [...document.querySelectorAll('#sbRows .sbChip.on')].every(b => b.dataset.v === 'rand')), 'sandbox screen: 6 rows, Random picked by default');
  for (const [k, v] of [['bowler', 'pace'], ['kph', '120'], ['len', 'Short'], ['line', 'stumps'], ['occ', 'none'], ['task', '1']]) await q.click(`#sbRows .sbChip[data-k="${k}"][data-v="${v}"]`);
  ok(await q.evaluate(() => { const s = window.__lr.app.S.sandbox; return s.bowler === 'pace' && s.kph === 120 && s.len === 'Short' && s.task === 1 && JSON.parse(localStorage.getItem('lr5')).settings.sandbox.kph === 120; }), 'sandbox choices are saved on this device');
  await q.click('#bSbGo');
  const balls = [];
  for (let i = 0; i < 3; i++) {
    await waitFor(q, (n) => { const g = window.__lr.game; return g.G.state === 'run' && g.G.cur && g.G.sess.balls.length === n; }, i);
    balls.push(await q.evaluate(() => { const c = window.__lr.game.G.cur; return { spin: !!c.prof.spin, kph: c.g.kph, cat: c.g.cat, mode: c.mode, occ: c.occ }; }));
    await q.keyboard.press('ArrowRight');
    await waitFor(q, () => window.__lr.game.G.state === 'result', null, 20000);
    await q.evaluate(() => window.__lr.game.nextBall());
  }
  ok(balls.every(b => !b.spin && b.cat === 'Short' && Math.abs(b.kph - 120) <= 3 && b.mode === 1 && b.occ === null), 'sandbox: every ball is the chosen one (pace, ~120 kph, short, feet, full view) — ' + balls.map(b => b.kph + ' ' + b.cat).join(', '));
  ok(await q.evaluate(() => /SANDBOX/.test(document.getElementById('hLevel').textContent)), 'HUD shows the sandbox set-up');
  // change the balls mid-session: C pauses and opens the panel; new choices from the next ball, same session
  await waitFor(q, () => window.__lr.game.G.state === 'run');
  await q.keyboard.press('c');
  ok(await q.evaluate(() => window.__lr.game.G.sbOpen && !document.getElementById('sandbox').classList.contains('hidden') && window.__lr.game.G.state === 'paused'), 'C pauses and opens the sandbox panel');
  await q.click('#sbRows .sbChip[data-k="bowler"][data-v="off"]'); await q.click('#sbRows .sbChip[data-k="len"][data-v="Full"]');
  await q.click('#bSbGo');
  ok(await q.evaluate(() => !window.__lr.game.G.sbOpen && document.getElementById('sandbox').classList.contains('hidden') && window.__lr.game.G.state === 'run'), 'resume: panel closes, the ball in flight carries on');
  const before = await q.evaluate(() => window.__lr.game.G.sess.start);
  await waitFor(q, () => window.__lr.game.G.state === 'result', null, 20000);
  await q.evaluate(() => window.__lr.game.nextBall());
  await waitFor(q, () => window.__lr.game.G.state === 'run' && window.__lr.game.G.cur);
  ok(await q.evaluate((t) => { const g = window.__lr.game, c = g.G.cur; return c.prof.spin === 'off' && c.g.cat === 'Full' && g.G.sess.start === t; }, before), 'next ball is the off-spinner, pitched up — same session, no restart');
  // controller View opens it too
  await q.evaluate(() => { const E = new Uint8Array(32); E[8] = 1; window.__lr.game.onPad(E, false, false, performance.now()); });
  ok(await q.evaluate(() => window.__lr.game.G.sbOpen), 'controller View button opens the panel');
  await q.evaluate(() => { const E = new Uint8Array(32); E[8] = 1; window.__lr.game.onPad(E, false, false, performance.now()); });
  ok(await q.evaluate(() => !window.__lr.game.G.sbOpen && window.__lr.game.G.state !== 'paused'), '…and closes it again');
  await q.evaluate(() => window.__lr.game.endSession());
  const end = await q.evaluate(() => { const d = window.__lr.app.db, s = d.sessions[d.sessions.length - 1]; return { kind: s.kind, xp: s.xp, lvl: d.level, d: d.levelD, n: s.n }; });
  ok(end.kind === 'sandbox' && end.xp === 0 && end.lvl === 4 && end.d === 0.5 && end.n >= 4, `saved as a Sandbox session (${end.n} balls), 0 XP, level unchanged`);
  await c.close();
}

// ---------- 8h. personal too-quick line: fast presses that are right stop counting as guesses ----------
{
  const c = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const balls = Array.from({ length: 60 }, (_, i) => ({ d: 8, lx: 0, kph: 100, lvl: 3, mode: 1, cat: 'Short', fe: i % 2 ? 'B' : 'F', foot: i % 2 ? 'B' : 'F', rt: 0.10 + (i % 10) * 0.02, fv: 'good', v: 'good', sc: 1, ok: true }));
  const seed = { v: 5, profile: { hand: 'R', onboarded: true, seenV5: true }, rtBase: 0.216, rtAt: '2026-10-29T10:00:00Z',
    settings: { sound: false, voice: false, fullscreen: false, feedback: 'always', hawk: false, sandbox: { bowler: 'pace', kph: 100, len: 'Short', line: 'stumps', occ: 'none', task: 1 } },
    sessions: [{ date: '2026-10-29T10:00:00Z', kind: 'sandbox', n: 60, score: 100, xp: 0, balls }] };
  const q = await page(c, '?nosw', `localStorage.setItem('lr5', ${JSON.stringify(JSON.stringify(seed))});`);
  await waitFor(q, () => window.__lr && document.querySelector('#home:not(.hidden)'));
  await q.click('#nav button[data-tab="progress"]');
  ok(await q.evaluate(() => /learned from your results/.test(document.getElementById('rlNote').textContent)), 'Progress shows the evidence: ' + await q.evaluate(() => document.getElementById('rlNote').textContent));
  await q.evaluate(() => window.__lr.menu.renderHome && window.__lr.game.startSession('sandbox'));
  await waitFor(q, () => { const g = window.__lr.game, c = g.clock; return g.G.state === 'run' && c.relTs !== null && performance.now() - c.relTs > 160; });
  await q.keyboard.press('ArrowRight');
  await waitFor(q, () => window.__lr.game.G.state === 'result', null, 20000);
  const r = await q.evaluate(() => { const b = window.__lr.game.G.sess.balls[0]; return { rt: b.rt, guess: !!b.guess, fv: b.fv, line: window.__lr.game.G.sess.pline.line }; });
  ok(r.line <= 0.13 && !r.guess && r.fv === 'good', `with fast, accurate history (line ${r.line} s) a back-foot press at ${r.rt} s is a good read, not "too quick"`);
  await q.evaluate(() => window.__lr.game.endSession());
  ok(await q.evaluate(() => /too-quick line/.test(document.getElementById('eMeta').textContent)), 'end screen shows the too-quick line and the evidence');
  await c.close();
}

// ---------- 9. offline: install the service worker, go offline, reload ----------
const ctx2 = await browser.newContext({ viewport: { width: 640, height: 360 } });
p = await page(ctx2, '', `if (!localStorage.getItem('lr5')) localStorage.setItem('lr5', JSON.stringify({ v: 5, profile: { hand: 'R', onboarded: true, seenV5: true }, settings: { sound: false, voice: false, fullscreen: false } }));`);
await waitFor(p, () => navigator.serviceWorker && navigator.serviceWorker.controller, null, 30000);
const cached = await p.evaluate(async () => { const ks = await caches.keys(), c = await caches.open(ks.find(k => k.startsWith('lr-core-'))); return (await c.keys()).length; });
ok(cached > 25, `service worker precached ${cached} core files`);
await ctx2.setOffline(true);
await p.reload({ waitUntil: 'load' });
await waitFor(p, () => window.__lr && document.querySelector('#home:not(.hidden)'));
ok(await p.evaluate(() => !!window.__lr.app.world && navigator.onLine === false), 'reload while OFFLINE: app and 3D engine start from the cache');
await p.click('#bQuick');
await waitFor(p, () => window.__lr.game.G.state === 'run' && window.__lr.game.clock.relTs !== null, null, 20000);
ok(true, 'offline: a ball is bowled');
await ctx2.close();

const real = errors.filter(e => !/favicon|net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
ok(real.length === 0, 'no page errors' + (real.length ? ':\n  ' + real.join('\n  ') : ''));
await browser.close(); srv.close();
done();
