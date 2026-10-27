// True life-size calibration. Pure maths, tested in Node.
// The screen is treated as a window into the nets: the camera sits at the player's real eye position and the
// view frustum passes exactly through the edges of the physical screen (an off-axis, asymmetric frustum).
// Then the horizon is at the real eye line and every object subtends the same angle as in real life.
// Units: inputs in cm (what people can measure), outputs in metres / degrees / cm as named.

export const RELEASE = { y: 2.2, dist: 17.6 };      // typical pace release: 2.2 m high, ~17.6 m from the batter's eye
export const ARM_TOP = { y: 2.45, dist: 17.9 };     // the bowling hand at the top of the delivery stride
export const PRESETS = { portrait27: { hCm: 59.8, wCm: 33.6 }, landscape27: { hCm: 33.6, wCm: 59.8 } };
const deg = (r) => r * 180 / Math.PI;

export function defaultCalib(orient) {
  const p = orient === 'landscape' ? PRESETS.landscape27 : PRESETS.portrait27;
  return { orient: orient || 'portrait', hCm: p.hCm, wCm: p.wCm, distCm: 130, eyeCm: 150, bottomCm: 100 };
}

export function valid(c) {
  return !!c && [c.hCm, c.wCm, c.distCm, c.eyeCm, c.bottomCm].every(v => typeof v === 'number' && isFinite(v))
    && c.hCm > 5 && c.wCm > 5 && c.distCm > 20 && c.eyeCm > 50 && c.bottomCm >= 0;
}

// Height above the eye line, on the screen (cm), of a point `y` m high and `dist` m away.
export function screenCm(c, y, dist) { return (y - c.eyeCm / 100) / dist * c.distCm; }

// Everything the calibration screen and the tests report.
export function solve(c) {
  const D = c.distCm / 100, eye = c.eyeCm / 100, bot = c.bottomCm / 100, top = bot + c.hCm / 100, half = c.wCm / 200;
  const up = top - eye, down = eye - bot;                       // screen edges above / below the eye line (m)
  const vfov = deg(Math.atan(up / D) + Math.atan(down / D)), hfov = deg(2 * Math.atan(half / D));
  const releaseCm = screenCm(c, RELEASE.y, RELEASE.dist), armCm = screenCm(c, ARM_TOP.y, ARM_TOP.dist);
  // A 1.85 m bowler 20 m away: angle and size on screen
  const bowlerDeg = deg(Math.atan((1.85 - eye) / 20) + Math.atan(eye / 20)), bowlerCm = 1.85 / 20 * c.distCm;     // flat screen: size = height / distance × screen distance
  const raiseCm = Math.max(0, Math.ceil(armCm + 1 - up * 100));          // keep the hand (+1 cm margin) on screen
  const lowerCm = down < 0 ? Math.ceil(-down * 100 + 5) : 0;             // eye line above the screen top? (screen too high)
  const nearGround = down > 0 ? eye * D / down : Infinity;               // nearest ground point visible (m from the eye)
  return {
    vfov, hfov, up: up * 100, down: down * 100, horizonFromBottomCm: down * 100, releaseCm, armCm, bowlerDeg, bowlerCm,
    raiseCm, lowerCm, nearGround, nearPitchFromStumps: nearGround + 0.15 + 1.22,
    msg: raiseCm > 0 ? `Raise your screen by ${raiseCm} cm so the bowler's hand is at or above your eye line.`
      : lowerCm > 0 ? `Lower your screen by ${lowerCm} cm so your eye line falls on the screen.` : '',
  };
}

// Frustum planes at distance `near` for the part of the screen the canvas covers.
// canvas: { hCm, wCm, bottomCm, xOffCm } — where the drawing area sits on the physical screen (defaults: all of it).
export function frustum(c, near, canvas) {
  const D = c.distCm / 100, eye = c.eyeCm / 100, k = near / D;
  const cv = canvas || { hCm: c.hCm, wCm: c.wCm, bottomCm: c.bottomCm, xOffCm: 0 };
  const bot = cv.bottomCm / 100, top = bot + cv.hCm / 100, half = cv.wCm / 200, x0 = (cv.xOffCm || 0) / 100;
  return { left: (x0 - half) * k, right: (x0 + half) * k, top: (top - eye) * k, bottom: (bot - eye) * k };
}

// Where the browser's drawing area sits on the physical screen. Full screen: all of it. In a window we assume it is
// centred horizontally and sits on the taskbar (browser bar on top), which is close enough and flagged in the UI.
export function canvasRect(c, px) {
  if (!px || px.full || !(px.screenH > 0)) return null;
  const perCm = px.screenH / c.hCm;
  const taskbarCm = Math.max(0, (px.screenH - (px.availH || px.screenH)) / perCm);
  return { hCm: px.innerH / perCm, wCm: px.innerW / perCm, bottomCm: c.bottomCm + taskbarCm, xOffCm: 0 };
}

export function summary(c) {
  const s = solve(c);
  return `vertical view ${s.vfov.toFixed(1)}° · bowler ${s.bowlerCm.toFixed(1)} cm tall on screen · release ${s.releaseCm.toFixed(1)} cm above your eye line`;
}

// Saved calibrations, one per screen orientation (the same monitor can be rotated): S.calib = { portrait, landscape }.
export function activeCalib(S, portrait) {
  const all = S && S.calib; if (!all) return null;
  const c = all[portrait ? 'portrait' : 'landscape'];
  return valid(c) ? c : null;
}
