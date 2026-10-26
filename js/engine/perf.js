// Frame-time monitor + debug overlay. Preallocated buffers: measuring costs (almost) nothing.
import { estimateHz } from '../core/timing.js';
import { p95 } from '../core/quality.js';

const N = 600, BALLMAX = 4000;

export function createPerf(gl) {
  const dt = new Float32Array(N), cpu = new Float32Array(N), gpu = new Float32Array(N);
  let i = 0, last = null, hz = 60, budget = 1000 / 60, frames = 0;
  // per-ball collection (for adaptive quality)
  const bCpu = new Float32Array(BALLMAX); let bN = 0, bDrops = 0, bOn = false;

  // Optional GPU timing (EXT_disjoint_timer_query_webgl2 — available on some desktop browsers only)
  let ext = null, qs = [], gpuLast = 0;
  try { ext = gl && gl.getExtension('EXT_disjoint_timer_query_webgl2'); } catch (e) { ext = null; }
  let overlay = null, octx = null, otext = null, lastText = 0, info = null, tierName = '';

  function frame(ts) {
    if (last !== null) {
      const d = ts - last; dt[i] = d; i = (i + 1) % N; frames++;
      if (bOn && d > budget * 1.5) bDrops++;
      if (frames % 120 === 0) { const h = estimateHz(Array.from(dt.subarray(0, Math.min(frames, N)))); if (h) { hz = h; budget = 1000 / h; } }
    }
    last = ts;
  }
  function cpuDone(ms) { cpu[(i + N - 1) % N] = ms; if (bOn && bN < BALLMAX) bCpu[bN++] = ms; }
  function gpuBegin() {
    if (!ext || !overlay) return null;
    const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); return q;
  }
  function gpuEnd(q) {
    if (!q) return; gl.endQuery(ext.TIME_ELAPSED_EXT); qs.push(q);
    while (qs.length) {
      const h = qs[0];
      if (!gl.getQueryParameter(h, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) gpuLast = gl.getQueryParameter(h, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(h); qs.shift();
    }
    if (qs.length > 8) { gl.deleteQuery(qs.shift()); }
    gpu[(i + N - 1) % N] = gpuLast;
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div'); overlay.id = 'perf';
    overlay.innerHTML = '<canvas width="240" height="80"></canvas><pre></pre>';
    document.body.appendChild(overlay);
    octx = overlay.firstChild.getContext('2d'); otext = overlay.lastChild;
  }
  function draw(now) {
    if (!overlay || overlay.hidden) return;
    // graph: scroll left 1 px, draw the newest frame (green under budget, amber up to 1.5×, red beyond)
    const c = octx, d = dt[(i + N - 1) % N], h = 80, sc = h / (budget * 3);
    c.drawImage(c.canvas, -1, 0);
    c.fillStyle = '#0b1016'; c.fillRect(239, 0, 1, h);
    c.fillStyle = d > budget * 1.5 ? '#ef4444' : d > budget * 1.1 ? '#f5a524' : '#22c55e';
    c.fillRect(239, h - Math.min(h, d * sc), 1, Math.min(h, d * sc));
    c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(239, h - budget * sc, 1, 1);
    if (now - lastText > 250) {
      lastText = now;
      const n = Math.min(frames, N), win = Array.from(dt.subarray(0, n)), cw = Array.from(cpu.subarray(0, n));
      const avg = win.reduce((a, b) => a + b, 0) / Math.max(1, n), dr = win.filter(x => x > budget * 1.5).length;
      const g = ext ? ` gpu ${gpuLast.toFixed(2)}` : '';
      otext.textContent = `${hz} Hz · budget ${budget.toFixed(2)} ms\nframe ${avg.toFixed(2)} (p95 ${p95(win).toFixed(2)}) ms\ncpu p95 ${p95(cw).toFixed(2)} ms${g}\ndropped ${(100 * dr / Math.max(1, n)).toFixed(1)}% of last ${n}\n` +
        (info ? `${tierName} · dpr ${info.dpr.toFixed(2)} · ${Math.round(info.w * info.dpr)}×${Math.round(info.h * info.dpr)}\ncalls ${info.calls} · tris ${info.tris}` : '');
    }
  }
  return {
    frame, cpuDone, gpuBegin, gpuEnd, draw,
    get hz() { return hz; }, get budget() { return budget; },
    setInfo(x, t) { info = x; tierName = t; },
    setOverlay(on) { if (on) { ensureOverlay(); overlay.hidden = false; } else if (overlay) overlay.hidden = true; },
    get overlayOn() { return !!overlay && !overlay.hidden; },
    ballStart() { bN = 0; bDrops = 0; bOn = true; },
    ballEnd() { bOn = false; return { frames: bN, drops: bDrops, cpuP95: p95(bCpu.subarray(0, bN)), budget }; },
    recent() { const n = Math.min(frames, N); return { hz, budget, dt: Array.from(dt.subarray(0, n)), cpu: Array.from(cpu.subarray(0, n)) }; },
  };
}
