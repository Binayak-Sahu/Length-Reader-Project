// The bowler's action as numbers: run-up, keyframes and footfalls. Pure (no three.js); the rig applies the pose.
// Elite timings: run-up ≈ 6.2 m/s, bound ≈ 2.2 m, back-foot contact → front-foot contact 0.19 s, front-foot → release 0.10 s.
import { T_RUN, T_BFC, T_FFC, T_REL } from './physics.js';

// Smooth curve through keyframes (Catmull-Rom), so the action never stops dead.
export function crv(k, t) {
  if (t <= k[0][0]) return k[0][1];
  const n = k.length; if (t >= k[n - 1][0]) return k[n - 1][1];
  let i = 1; while (t > k[i][0]) i++;
  const p0 = (k[i - 2] || k[i - 1])[1], p1 = k[i - 1][1], p2 = k[i][1], p3 = (k[i + 1] || k[i])[1], u = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}
export function lin(k, t) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const a = k[i - 1], b = k[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]); }
  return k[k.length - 1][1];
}
// Run-up: accelerates to top speed; stride rate rises with speed; phase lined up so the take-off stride matches the bound.
export function mkRun(vmax, acc, endZ) {
  const dt = 0.002, n = Math.round(T_RUN / dt) + 1, dist = new Float32Array(n), ph = new Float32Array(n), vv = new Float32Array(n);
  let d = 0, p = 0;
  for (let i = 0; i < n; i++) { const t = i * dt, v = t < acc ? vmax * t / acc : vmax; vv[i] = v; dist[i] = d; ph[i] = p; d += v * dt; p += 2 * Math.PI * (1.2 + 2.0 * v / 6.2) * dt; }
  const off = (((Math.PI / 2 - ph[n - 1]) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), tot = dist[n - 1], z = new Float32Array(n);
  for (let i = 0; i < n; i++) { z[i] = endZ + (tot - dist[i]); ph[i] += off; }
  return { dt, n, z, ph, vv };
}
export const RUN = mkRun(6.2, 1.5, 21.5), RUN_S = mkRun(3.2, 0.8, 20.1);     // pace: ~6 m/s; spin: a few jogging steps
// Keyframes from the bound (T_RUN) to the end of the follow-through. Angles in degrees.
export const K = {
  z: [[2.40, 21.5], [2.76, 19.3], [2.95, 18.45], [3.05, 18.1], [3.25, 17.3], [3.6, 16.3], [4.0, 15.4]],
  x: [[2.40, -0.6], [2.76, -0.55], [3.05, -0.45], [3.25, -0.7], [3.6, -1.2], [4.0, -1.7]],
  y: [[2.40, 1.0], [2.58, 1.26], [2.76, 0.96], [2.95, 0.86], [3.05, 0.9], [3.25, 0.9], [3.6, 1.0], [4.0, 1.0]],
  hy: [[2.40, 0], [2.58, -25], [2.76, -35], [2.95, -25], [3.05, 0], [3.25, 25], [3.6, 10], [4.0, 0]],
  sy: [[2.40, -15], [2.58, -60], [2.76, -85], [2.95, -60], [3.05, -10], [3.25, 35], [3.6, 15], [4.0, 0]],   // shoulders side-on at back-foot landing
  tx: [[2.40, -10], [2.58, -2], [2.76, 8], [2.95, 4], [3.05, -12], [3.25, -50], [3.6, -28], [4.0, -10]],
  tz: [[2.40, 0], [2.95, 4], [3.05, 12], [3.25, 6], [3.6, 0], [4.0, 0]],
  rx: [[2.40, 40], [2.62, 25], [2.76, 0], [4.0, 0]],
  rw: [[2.40, 0], [2.62, -10], [2.76, 30], [2.95, 120], [3.05, 182], [3.25, 300], [3.6, 350], [4.0, 360]],
  re: [[2.40, 100], [2.62, 90], [2.76, 25], [2.88, 0], [3.6, 10], [4.0, 40]],
  lx: [[2.40, 30], [2.58, 10], [2.76, 0], [4.0, 0]],
  lw: [[2.40, -20], [2.58, -120], [2.76, -160], [2.95, -95], [3.05, -30], [3.25, -5], [3.6, 0], [4.0, 0]],    // front arm high, then points at the target
  le: [[2.40, 80], [2.58, 30], [2.76, 10], [2.95, 15], [3.05, 80], [3.25, 90], [3.6, 60], [4.0, 40]],
  lh: [[2.40, -25], [2.58, 20], [2.76, 55], [2.95, 35], [3.05, 25], [3.25, 5], [3.6, -30], [4.0, 0]],
  lk: [[2.40, -20], [2.58, -60], [2.76, -75], [2.95, -10], [3.05, -6], [3.25, -20], [3.6, -40], [4.0, -10]],  // braced front knee at release
  rh: [[2.40, 40], [2.58, 10], [2.76, -5], [2.95, -35], [3.05, -40], [3.25, 40], [3.6, 30], [4.0, 0]],
  rk: [[2.40, -60], [2.58, -40], [2.76, -25], [2.95, -25], [3.05, -25], [3.25, -80], [3.6, -20], [4.0, -10]] };
const LINK = { z: 1, x: 1, y: 1 };
const KEYS = Object.keys(K);

// Footfalls through the run-up, then the louder back-foot and front-foot landings (a rhythm you can time off).
export function mkFoot(RN) {
  const out = [];
  for (let i = 1; i < RN.n; i++) if (Math.floor(RN.ph[i] / Math.PI) !== Math.floor(RN.ph[i - 1] / Math.PI) && RN.vv[i] > 0.8) out.push([i * RN.dt, 0.15 + 0.25 * RN.vv[i] / 6.2]);
  out.push([T_BFC, 0.55], [T_FFC, 0.85]);
  return out;
}
export const FOOT = mkFoot(RUN), FOOT_S = mkFoot(RUN_S);

// Fills `p` (re-used object: no allocation per frame) with the pose at scene time t.
// prof: bowler profile; rel: release-angle offset in degrees (hand cue + jitter).
export function poseAt(t, prof, rel, p) {
  const RN = prof.spin ? RUN_S : RUN;
  if (t < T_RUN) {
    const fi = Math.min(RN.n - 1.001, Math.max(0, t) / RN.dt), i0 = Math.floor(fi), f = fi - i0, ph = RN.ph[i0] + (RN.ph[i0 + 1] - RN.ph[i0]) * f;
    const s = Math.sin(ph), a = Math.min(1, RN.vv[i0] / 3), late = Math.max(0, Math.min(1, (t - 1.9) / 0.5));
    p.z = RN.z[i0] + (RN.z[i0 + 1] - RN.z[i0]) * f; p.x = -1.0 + 0.4 * (Math.max(0, t) / T_RUN); p.y = 1.0 + 0.04 * Math.abs(s) * a;
    p.hy = 0; p.sy = -15 * late; p.tx = -12 * a; p.tz = 0;
    p.rx = (-30 * s * a) * (1 - late) + 40 * late; p.rw = 0; p.re = 70 + 30 * late;
    p.lx = 30 * s * a; p.lw = -20 * late; p.le = 70 + 10 * late;
    p.rh = 35 * s * a; p.lh = -35 * s * a;
    p.rk = -20 - 55 * Math.max(0, Math.sin(ph - 0.9)) * a; p.lk = -20 - 55 * Math.max(0, Math.sin(ph + Math.PI - 0.9)) * a;
  } else for (let j = 0; j < KEYS.length; j++) { const k = KEYS[j]; p[k] = LINK[k] ? lin(K[k], t) : crv(K[k], t); }
  if (prof.spin && t >= T_RUN && t < T_BFC) { const u = (t - T_RUN) / (T_BFC - T_RUN); p.z = 20.1 - 0.8 * u; p.y = 0.98 + 0.1 * Math.sin(Math.PI * u); }   // spinner: small hop
  const bump = Math.max(0, 1 - Math.abs(t - T_REL) / 0.2);
  p.rw += (rel + prof.ao) * bump;                                      // fuller = released a touch later and flatter
  p.sy *= prof.tw; p.hy *= prof.tw;
  return p;
}
export const RUN_START_Z = RUN.z[0];
