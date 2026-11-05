// Sounds from the nets next door (Settings → Sounds from the next net). Pure: what plays, when, and when to stay quiet.
// Representative practice: selection nets are noisy, so train with that noise — but never over your own ball.

// Quiet from the bowler's last strides (1 s before release) until your ball has gone past (arrival + 0.3 s).
export function quietNow(state, tau, ta) {
  return state === 'run' && tau != null && tau >= -1.0 && tau <= (ta == null ? 1.2 : ta + 0.3);
}

// The next sound from a neighbouring net: a bat crack (most often), a ball into the net, or a bowler's footsteps.
// Always to one side (pan |0.4…1|), quiet (0.04–0.13), every 2.5–7 s.
export function nextAmbient(rng = Math.random) {
  const r = rng(), type = r < 0.55 ? 'crack' : r < 0.8 ? 'net' : 'steps';
  const side = rng() < 0.5 ? -1 : 1;
  return { type, pan: side * (0.4 + 0.6 * rng()), vol: 0.04 + 0.09 * rng(), gap: 2.5 + 4.5 * rng() };
}
