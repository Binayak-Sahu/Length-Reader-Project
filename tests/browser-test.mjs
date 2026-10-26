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

// ---------- 9. offline: install the service worker, go offline, reload ----------
const ctx2 = await browser.newContext({ viewport: { width: 640, height: 360 } });
p = await page(ctx2, '');
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
