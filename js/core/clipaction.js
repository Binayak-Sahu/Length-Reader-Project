// Real bowling actions copied from a side-on clip: pose landmarks → the rig's joint angles on the app's timeline. Pure.
// Only numbers are kept (no video). The release pose is pinned to the app's own, so the release point — and with it every
// length and timing — stays exact; the clip changes how the body gets there and follows through.
import { T_RUN, T_BFC, T_FFC, T_REL, T_END } from './physics.js';

export const ACT_KEYS = ['rw', 're', 'lw', 'le', 'rh', 'rk', 'lh', 'lk', 'tx'];
export const ACT_HZ = 100;
const L = { ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };
const D = 180 / Math.PI;

// angle of a→b from straight down, positive toward the direction of travel (f = +1 moving to image right, −1 left)
const ang = (a, b, f) => Math.atan2(f * (b.x - a.x), b.y - a.y) * D;
function bend(a, b, c) {                                  // 3D angle at b (0 = straight)
  const u = [a.x - b.x, a.y - b.y, a.z - b.z], v = [c.x - b.x, c.y - b.y, c.z - b.z];
  const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2], n = Math.hypot(...u) * Math.hypot(...v) || 1;
  return 180 - Math.acos(Math.max(-1, Math.min(1, d / n))) * D;
}
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }), mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z, unit = (a) => mul(a, 1 / (Math.hypot(a.x, a.y, a.z) || 1));

// One frame of landmarks (MediaPipe world landmarks: x right, y down, z depth; with .visibility) → raw angles, or null.
// arm 'R' = right-arm bowler (the rig's bowling arm); 'L' swaps sides so a left-armer drives the same rig.
export function frameAngles(lm, f, arm = 'R') {
  if (!lm) return null;
  const P = (k) => { const s = arm === 'L' ? (k[0] === 'l' ? 'r' : 'l') + k.slice(1) : k; return lm[L[s]]; };
  const need = ['rs', 're', 'rw', 'ls', 'le', 'lh', 'rh', 'lk', 'rk', 'la', 'ra'];
  const vis = need.reduce((a, k) => a + ((P(k).visibility ?? 1) > 0.4 ? 1 : 0), 0) / need.length;
  if (vis < 0.6) return null;
  const hm = mid(P('lh'), P('rh')), sm = mid(P('ls'), P('rs'));
  // arms swing in the torso's own plane (the rig turns the arm about the torso's front-back axis):
  // u = up the spine, s = across the shoulders toward the bowling arm; angle from straight down, + toward the bowling-arm side
  const u = unit(sub(sm, hm)), s0 = sub(P('rs'), P('ls')), s = unit(sub(s0, mul(u, dot(s0, u))));
  // trunk lean in the torso's own front-back plane: z_l = (across the shoulders) × (world up), i.e. the rig's +z (backward)
  const sh = unit({ x: s.x, y: 0, z: s.z }), up = { x: 0, y: -1, z: 0 };
  const zl = { x: sh.y * up.z - sh.z * up.y, y: sh.z * up.x - sh.x * up.z, z: sh.x * up.y - sh.y * up.x };
  const armAng = (sh, el) => { const a = sub(el, sh); return Math.atan2(dot(a, s), -dot(a, u)) * D; };
  return {
    rw: armAng(P('rs'), P('re')), re: bend(P('rs'), P('re'), P('rw')),
    lw: armAng(P('ls'), P('le')), le: bend(P('ls'), P('le'), P('lw')),
    rh: ang(P('rh'), P('rk'), f), rk: -bend(P('rh'), P('rk'), P('ra')),
    lh: ang(P('lh'), P('lk'), f), lk: -bend(P('lh'), P('lk'), P('la')),
    tx: Math.asin(Math.max(-1, Math.min(1, dot(u, zl)))) * D, vis,
  };
}

// Clip time → app time, piecewise linear through the three marks (extrapolated with the nearest segment's rate).
export function timeMap(m) {
  const a = (T_FFC - T_BFC) / (m.ffc - m.bfc), b = (T_REL - T_FFC) / (m.rel - m.ffc);
  return (t) => t < m.ffc ? T_BFC + (t - m.bfc) * a : T_FFC + (t - m.ffc) * b;
}
function unwrap(xs) { for (let i = 1; i < xs.length; i++) { if (xs[i] == null) continue; let j = i - 1; while (j >= 0 && xs[j] == null) j--; if (j < 0) continue; while (xs[i] - xs[j] > 180) xs[i] -= 360; while (xs[i] - xs[j] < -180) xs[i] += 360; } return xs; }
// A value far from the line through its neighbours is a tracking glitch: replace it with that line (keeps fast arm swings).
function despike(xs, thr = 25) {
  const r = xs.map((x, i) => i > 0 && i < xs.length - 1 ? Math.abs(x - (xs[i - 1] + xs[i + 1]) / 2) : 0), out = xs.slice();
  for (let i = 1; i < xs.length - 1; i++) if (r[i] > thr && r[i] >= r[i - 1] && r[i] >= r[i + 1]) out[i] = (xs[i - 1] + xs[i + 1]) / 2;   // only the glitch, not its neighbours
  return out;
}
function lowpass(xs, k = 0.35) { const out = xs.slice(); for (let i = 1; i < out.length; i++) out[i] = out[i - 1] + k * (out[i] - out[i - 1]); for (let i = out.length - 2; i >= 0; i--) out[i] = out[i + 1] + k * (out[i] - out[i + 1]); return out; }

// frames: [{ t (s, clip time), lm (world landmarks) , hx (hip centre in image x, 0–1) }], marks: { bfc, ffc, rel } (clip s).
// base(t, key): the app's own pose (core/action.js keyframes) — used to pin the release and to fill where the clip has no data.
export function buildAction(frames, marks, base, opts = {}) {
  if (!(marks.bfc < marks.ffc && marks.ffc < marks.rel)) throw new Error('Mark back foot, front foot, then release — in that order');
  const hx = frames.filter(f => f.hx != null), f = hx.length > 1 && hx[hx.length - 1].hx < hx[0].hx ? -1 : 1;   // direction of travel
  const map = timeMap(marks), raw = frames.map(fr => ({ t: map(fr.t), a: frameAngles(fr.lm, f, opts.arm) }));
  const n = Math.round((T_END - T_RUN) * ACT_HZ) + 1, keys = {};
  const seen = raw.filter(r => r.a && r.t >= T_RUN - 0.05 && r.t <= T_END + 0.05);
  const q = Math.min(1, seen.length / Math.max(1, frames.filter(fr => { const t = map(fr.t); return t >= T_RUN && t <= T_END; }).length));
  for (const k of ACT_KEYS) {
    const src = raw.filter(r => r.a).map(r => [r.t, r.a[k]]);
    if (src.length < 4) { keys[k] = Array.from({ length: n }, (_, i) => +base(T_RUN + i / ACT_HZ, k).toFixed(1)); continue; }
    unwrap(src.map(s => s[1])).forEach((v, i) => { src[i][1] = v; });
    despike(src.map(s => s[1])).forEach((v, i) => { src[i][1] = v; });          // one-frame tracking glitches
    // resample onto the app timeline (linear between clip frames; the app's pose outside the clip's span)
    let col = Array.from({ length: n }, (_, i) => {
      const t = T_RUN + i / ACT_HZ; if (t < src[0][0] || t > src[src.length - 1][0]) return null;
      let j = 1; while (j < src.length - 1 && src[j][0] < t) j++;
      const [t0, v0] = src[j - 1], [t1, v1] = src[j]; return t1 > t0 ? v0 + (v1 - v0) * (t - t0) / (t1 - t0) : v0;
    });
    // keep the unwrapped branch nearest the app's pose (an arm at 182° and −178° is the same arm)
    const iRel = Math.round((T_REL - T_RUN) * ACT_HZ), ref = col[iRel] ?? col.find(v => v != null);
    if (ref != null) { const shift = Math.round((base(T_REL, k) - ref) / 360) * 360; col = col.map(v => v == null ? null : v + shift); }
    for (let i = 0; i < n; i++) if (col[i] == null) col[i] = base(T_RUN + i / ACT_HZ, k);
    col = lowpass(col);
    // pin: the clip's pose is offset to meet the app's release pose exactly, fading out over ±0.25 s
    const off = base(T_REL, k) - col[iRel];
    keys[k] = col.map((v, i) => { const t = T_RUN + i / ACT_HZ, w = Math.max(0, 1 - Math.abs(t - T_REL) / 0.25); return +(v + off * w).toFixed(1); });
  }
  return { v: 1, id: opts.id || Date.now().toString(36), name: opts.name || 'My bowler', type: opts.type === 'off' || opts.type === 'leg' ? opts.type : 'pace',
    arm: opts.arm || 'R', q: Math.round(100 * q), dir: f, created: new Date().toISOString(), hz: ACT_HZ, t0: T_RUN, keys };
}

// The action's angle for key k at scene time t (null outside T_RUN…T_END or for keys it doesn't drive).
export function actionAt(act, t, k) {
  const col = act && act.keys[k]; if (!col || t < act.t0) return null;
  const x = (t - act.t0) * act.hz, i = Math.floor(x); if (i >= col.length - 1) return col[col.length - 1];
  return col[i] + (col[i + 1] - col[i]) * (x - i);
}
