// Pure cricket-ball physics. No DOM, no three.js, so Node tests import it directly.
// Units: metres, seconds. Frame ("right-hander frame"): z runs from the batter's stumps (Z_STUMPS) toward the bowler,
// y is up, and the batter's OFF side is −x. Left-handers are handled by mirroring x outside this module.

export const G = 9.81, R = 0.036, Z_STUMPS = -1.22, E_V = 0.5, E_H = 0.92;
export const KD = 0.0055, DT = 0.001;          // drag factor: a 120 kph ball arrives at ~100 kph, like Hawk-Eye data
// Bowler timeline (elite data: back-foot contact → front-foot contact ≈ 0.19 s, front-foot contact → release ≈ 0.10 s)
export const T_RUN = 2.40, T_BFC = 2.76, T_FFC = 2.95, T_REL = 3.05, T_END = 4.0;
const T_MAX = 4;

// Front/back zones move with pace: the slower the ball, the fuller the "doubtful" good length.
// 80 kph: forward under 4.8 m, back from 6.3 m · 140 kph: 6.0 / 8.0 m · spin: 4.8 / 6.0 m · linear in between.
export function zones(kph, spin) {
  if (spin) return [4.8, 6.0];
  const u = Math.max(0, Math.min(1, (kph - 80) / 60));
  return [4.8 + 1.2 * u, 6.3 + 1.7 * u];
}
export function bandsFor(kph, spin) {
  const [f, b] = zones(kph, spin);
  return [
    { n: 'Yorker', a: 0, b: 1.5, c: '#6d4fc2' }, { n: 'Full', a: 1.5, b: f, c: '#2f78b0' }, { n: 'Good', a: f, b, c: '#2f9a5e' },
    { n: 'Short', a: b, b: b + 3.5, c: '#b07c2a' }, { n: 'Bouncer', a: b + 3.5, b: 30, c: '#b03e3e' }];
}

// Scratch buffers for recording one flight (re-used, so solving allocates almost nothing).
const MAXN = Math.ceil(T_MAX / DT) + 4;
const SX = new Float64Array(MAXN), SY = new Float64Array(MAXN), SZ = new Float64Array(MAXN);

// One flight. mode 0: stop at the first bounce · 1: full flight · 2: full flight, recorded every DT into SX/SY/SZ.
// Semi-implicit Euler at 1 ms (same model as v4). Bounce and crossing times are interpolated inside the step,
// so the landing point is continuous in the launch angle (the solver relies on that).
function fly(p0, v, th, aimX, o, mode) {
  const zA = Z_STUMPS, dx = aimX - p0.x, dz = zA - p0.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  const zSw = p0.z - (p0.z - zA) * 0.45;           // swing only in the second half of the flight: late swing
  const ev = o.ev || E_V, eh = o.eh || E_H, drift = o.drift || 0, swing = o.swing || 0, seam = o.seam || 0;
  let x = p0.x, y = p0.y, z = p0.z;
  const vh = v * Math.cos(th);
  let vy = v * Math.sin(th), vx = vh * ux, vz = vh * uz, t = 0, bounced = false, n = 0;
  const r = { landZ: null, tb: null, pb: null, ta: null, tc: null, yA: 0, yC: 0, xA: null, n: 0 };
  if (mode === 2) { SX[0] = x; SY[0] = y; SZ[0] = z; n = 1; }
  while (t < T_MAX) {
    const sp = Math.hypot(vx, vy, vz), ax = bounced ? 0 : (drift + (z < zSw ? swing : 0));
    vx += (ax - KD * sp * vx) * DT; vy -= (G + KD * sp * vy) * DT; vz -= KD * sp * vz * DT;
    const px = x, py = y, pz = z;
    x += vx * DT; y += vy * DT; z += vz * DT; t += DT;
    if (y <= R && vy < 0) {
      const u = py > R ? Math.min(1, (py - R) / (py - y)) : 0;
      const cx = px + (x - px) * u, cz = pz + (z - pz) * u, tx = t - DT + u * DT;
      if (!bounced) {
        bounced = true; r.tb = tx; r.pb = { x: cx, y: R, z: cz }; r.landZ = cz;
        if (mode === 0) return r;
        vy = -ev * vy; vx = vx * eh + seam; vz *= eh;
      } else { vy = -0.4 * vy; vx *= 0.9; vz *= 0.9; }
      const rem = (1 - u) * DT; x = cx + vx * rem; y = R + vy * rem; z = cz + vz * rem;
    }
    if (r.tc === null && pz > 0 && z <= 0) { const u = pz / (pz - z); r.tc = t - DT + u * DT; r.yC = py + (y - py) * u; }
    if (r.ta === null && pz > zA && z <= zA) { const u = (pz - zA) / (pz - z); r.ta = t - DT + u * DT; r.yA = py + (y - py) * u; r.xA = px + (x - px) * u; }
    if (mode === 2) { SX[n] = x; SY[n] = y; SZ[n] = z; n++; }
    if (z < zA - 3.5) break;                       // room for full tosses that land behind the stumps
  }
  r.n = n; return r;
}

// Launch angle that pitches the ball at zb: Illinois (bracketed secant) on landZ(θ) − zb, which falls as θ rises.
let lastEvals = 0;
function solveTheta(p0, v, aim, o, zb) {
  const f = th => { lastEvals++; const L = fly(p0, v, th, aim, o, 0).landZ; return (L === null ? Z_STUMPS - 4 : L) - zb; };
  let a = -0.8, b = 0.7, fa = f(a), fb = f(b);
  if (fa <= 0) return a;
  if (fb >= 0) return b;
  let c = a, side = 0;
  for (let i = 0; i < 60; i++) {
    c = (a * fb - b * fa) / (fb - fa);
    const fc = f(c);
    if (Math.abs(fc) < 2e-4 || b - a < 1e-9) break;
    if (fc > 0) { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
    else { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; }
  }
  return c;
}

// p0 = release point, d = bounce distance from the batter's stumps (negative = full toss),
// lxArr = line at the stumps (+ = off side). Swing, drift and seam/spin happen on the way; the aim is corrected so the
// ball still pitches at d and finishes on the chosen line, like the real thing.
// Returns plain data (typed arrays) via trajData(), or a ready trajectory with pos() via makeTraj().
export function solveTraj(p0, kph, d, lxArr, o) {
  o = o || {}; lastEvals = 0;
  const v = kph / 3.6, zb = Z_STUMPS + d, xT = -lxArr;
  const lateral = !!(o.swing || o.seam || o.drift);
  let aim = xT, th = 0;
  for (let it = 0; it < 6; it++) {
    th = solveTheta(p0, v, aim, o, zb);
    if (!lateral) break;
    const f = fly(p0, v, th, aim, o, 1); if (f.xA === null) break;
    const err = f.xA - xT; if (Math.abs(err) < 0.002) break;
    aim -= err;
  }
  const f = fly(p0, v, th, aim, o, 2), n = f.n;
  const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
  for (let i = 0; i < n; i++) { X[i] = SX[i]; Y[i] = SY[i]; Z[i] = SZ[i]; }
  let pb = f.pb, tb = f.tb;
  if (!pb) { pb = { x: X[n - 1], y: R, z: Z[n - 1] }; tb = (n - 1) * DT; }
  const ta = f.ta || (n - 1) * DT;
  return {
    p0: { x: p0.x, y: p0.y, z: p0.z }, kph, d, lxArr: f.xA !== null ? -f.xA : lxArr, tb, ta, tc: f.tc || ta, pb,
    yA: f.yA, yC: f.yC, lxB: -pb.x, spin: !!o.spin, varn: o.varn || null, evals: lastEvals, X, Y, Z,
  };
}

// Adds the sampling function and the zone lines for the ball's own pace. Works on worker output too.
export function buildTraj(data) {
  const { X, Y, Z } = data, last = X.length - 1.001;
  data.pos = function pos(tau, out) {
    out = out || {};
    const q = Math.max(0, Math.min(last, tau / DT)), i = q | 0, u = q - i;
    out.x = X[i] + (X[i + 1] - X[i]) * u; out.y = Y[i] + (Y[i + 1] - Y[i]) * u; out.z = Z[i] + (Z[i + 1] - Z[i]) * u;
    return out;
  };
  const zn = zones(data.kph, data.spin);
  data.fmax = zn[0]; data.bmin = zn[1];
  return data;
}

export function makeTraj(p0, kph, d, lxArr, o) { return buildTraj(solveTraj(p0, kph, d, lxArr, o)); }

// Ball speed (kph) at time tau, from the recorded path.
export function speedAt(tr, tau) {
  const a = tr.pos(tau), b = tr.pos(tau - 0.01);
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / 0.01 * 3.6;
}
