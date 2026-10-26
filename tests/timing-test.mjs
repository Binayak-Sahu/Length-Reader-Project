// Timing tests: frame-stamped ball events, input timestamps, controller bracketing, refresh-rate detection.
// Run: node tests/timing-test.mjs
import { BallClock, padStamp, estimateHz, droppedFrames, reactionMs, median } from '../js/core/timing.js';
import { T_REL } from '../js/core/physics.js';
import { mulberry32, makeOk } from './util.mjs';
const { ok, done } = makeOk('timing');

// Simulated display: frames every 1000/hz ms with a little jitter; returns rAF timestamps.
function frames(hz, startTs, dur, rng, jitter = 0.15) {
  const iv = 1000 / hz, out = []; let t = startTs;
  while (t < startTs + dur) { out.push(t + (rng() - 0.5) * jitter); t += iv; }
  return out;
}

for (const hz of [60, 120, 165]) {
  const rng = mulberry32(hz), iv = 1000 / hz, LEAD = 900, tb = 0.62, occ = 0.16;
  const fs = frames(hz, 1000, 6000, rng);
  const c = new BallClock(); c.start(fs[0], LEAD);
  const relSched = fs[0] + LEAD + T_REL * 1000;
  let black = -1;
  // a press that truly happens 415.3 ms after the scheduled release; its handler runs 11 ms later (busy main thread)
  const pressTs = relSched + 415.3;
  for (const ts of fs) {
    if (c.frame(ts, tb, occ) && black < 0) black = ts;
    if (!c.has('foot') && ts >= pressTs + 11) c.stamp('foot', pressTs);   // handler time is never used
  }
  ok(c.relTs >= relSched && c.relTs < relSched + iv + 0.2, `${hz} Hz: release frame is the first frame at/after release (+${(c.relTs - relSched).toFixed(2)} ms)`);
  ok(Math.abs(c.rtOf('foot') * 1000 - (pressTs - c.relTs)) < 1e-9, `${hz} Hz: response = press stamp − release frame, handler delay ignored (${(c.rtOf('foot') * 1000).toFixed(2)} ms)`);
  const tbP = c.tbPresented(tb);
  ok(Math.abs(tbP - tb) < iv / 1000 + 0.0005, `${hz} Hz: presented bounce within one frame of physics bounce (${((tbP - tb) * 1000).toFixed(2)} ms)`);
  ok(black === c.occTs && c.occPresented() >= occ - iv / 1000 - 0.0005 && c.occPresented() < occ + iv / 1000 + 0.0005,
    `${hz} Hz: blackout drawn from the first frame at/after +${occ * 1000} ms (presented +${(c.occPresented() * 1000).toFixed(1)} ms)`);
}

{ // an input handled BEFORE the release frame's rAF ran (event dispatched first), but stamped after it
  const c = new BallClock(); c.start(0, 0);
  c.frame(3045, 0.6, null);                 // last frame before release (tau < 0)
  c.stamp('foot', 3058.5);                  // handler ran before the next rAF
  c.frame(3061, 0.6, null);                 // release frame
  ok(Math.abs(c.rtOf('foot') - (3058.5 - 3061) / 1000) < 1e-12, 'press resolved against the release frame even if handled first (−2.5 ms = before release was shown)');
}
{ // pause in mid-flight: everything shifts together, so the response time is unchanged
  const c = new BallClock(); c.start(0, 0);
  c.frame(3051, 0.6, null); c.stamp('foot', 3300);
  c.pause(3310); c.resume(8310);
  ok(Math.abs(c.rtOf('foot') - 0.249) < 1e-9 && c.relTs === 8051, 'pause/resume shifts the clock, release frame and stamps together');
  ok(Math.abs(c.tau(8051) - 0.001) < 1e-9, 'scene time continues from where it paused');
}
{ // no release frame yet (ball abandoned early): falls back to scheduled release
  const c = new BallClock(); c.start(100, 900);
  ok(Math.abs(c.rt(100 + 900 + T_REL * 1000 + 250) - 0.25) < 1e-9, 'response falls back to the scheduled release when no frame has shown it');
}

console.log('— controller stamps —');
ok(padStamp(1003.2, 1000, 1006.9) === 1003.2, 'gamepad.timestamp inside the poll bracket is used as the press time');
ok(padStamp(990, 1000, 1006) === 1003, 'stale gamepad.timestamp (before the last poll) → bracket midpoint');
ok(padStamp(5e9, 1000, 1006) === 1003, 'gamepad.timestamp in another time base → bracket midpoint');
ok(padStamp(1006.3, 1000, 1006) === 1006, 'stamp a hair after this poll is clamped to the poll time');
{ // accuracy over many random presses with a 60 Hz poll (worst case: browser never updates the stamp)
  const rng = mulberry32(5); let worst = 0, worstGood = 0;
  for (let i = 0; i < 2000; i++) {
    const prev = 1000 + i * 16.7, now = prev + 16.7, press = prev + rng() * 16.7;
    worst = Math.max(worst, Math.abs(padStamp(0, prev, now) - press));
    // driver stamps 2 ms late (a stamp can't be later than the poll that read it)
    worstGood = Math.max(worstGood, Math.abs(padStamp(Math.min(press + 2, now), prev, now) - press));
  }
  ok(worst <= 8.36, `no usable stamp: error ≤ half a poll (${worst.toFixed(2)} ms at 60 Hz)`);
  ok(worstGood <= 2.01, `with gamepad.timestamp: error = the driver's own delay (${worstGood.toFixed(2)} ms), not the poll rate`);
}

console.log('— refresh rate —');
for (const hz of [60, 90, 120, 144, 165]) {
  const rng = mulberry32(hz + 1), fs = frames(hz, 0, 2000, rng, 0.6), d = [];
  for (let i = 1; i < fs.length; i++) d.push(fs[i] - fs[i - 1]);
  d[20] *= 2; d[50] *= 3;                                  // a couple of dropped frames
  ok(estimateHz(d) === hz, `detects ${hz} Hz from frame intervals (got ${estimateHz(d)})`);
  ok(droppedFrames(d, hz) === 2, `${hz} Hz: counts the 2 dropped frames`);
}
ok(estimateHz([1, 2, 3]) === null, 'too few frames → unknown');

console.log('— reaction test —');
ok(reactionMs(1262.4, 1000) === 262.39999999999998 || Math.abs(reactionMs(1262.4, 1000) - 262.4) < 1e-9, 'reaction = press stamp − green frame stamp');
ok(median([300, 250, 270, 260, 255, 400, 240, 265]) === 262.5, 'median of 8 presses');

done();
