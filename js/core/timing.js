// Millisecond timing. Pure, so it can be tested with made-up frame sequences.
//
// Time base: every timestamp here is a DOMHighResTimeStamp on the page's performance clock —
//   • requestAnimationFrame(ts)    → when that frame is being produced (our "presented" time for what it shows)
//   • event.timeStamp              → when the touch / key / mouse press happened (not when our handler ran)
//   • gamepad.timestamp            → when the controller data last changed (bracketed by our polls, see padStamp)
// Display latency is the same for every frame, so it cancels out of "reading time" (the reaction test uses the
// same pipeline).
import { T_REL } from './physics.js';

// One ball's clock. Scene time comes from rAF timestamps: t0 is the rAF time of scene t = 0 (bowler starts).
// Ball events are stamped with the first frame that shows them. Inputs are stored raw and resolved later,
// so it does not matter whether a handler ran before or after the release frame's rAF.
export class BallClock {
  constructor() { this.reset(); }
  reset() {
    this.t0 = null; this.relTs = null; this.bncTs = null; this.occTs = null; this.pauseAt = null;
    this.marks = {}; this.lastTs = null; this.maxGap = 0; this.flightFrames = 0;
  }
  start(ts, leadMs) { this.t0 = ts + leadMs; }
  get started() { return this.t0 !== null; }
  sceneTime(ts) { return (ts - this.t0) / 1000; }
  tau(ts) { return this.sceneTime(ts) - T_REL; }            // s since the scheduled release
  // Call once per rendered frame while the ball is live. tb = bounce (s after release); occ = occlusion or null.
  // Returns true when this frame must be drawn black (occluded).
  frame(ts, tb, occ) {
    const tau = this.tau(ts);
    if (tau >= 0) {
      if (this.relTs === null) this.relTs = ts;
      else { this.maxGap = Math.max(this.maxGap, ts - this.lastTs); this.flightFrames++; }
      if (tb != null && tau >= tb && this.bncTs === null) this.bncTs = ts;
    }
    this.lastTs = ts;
    if (occ != null && tau >= occ) { if (this.occTs === null) this.occTs = ts; return true; }
    return false;
  }
  stamp(name, ts) { if (this.marks[name] === undefined) this.marks[name] = ts; }
  has(name) { return this.marks[name] !== undefined; }
  pause(now) { if (this.pauseAt === null) this.pauseAt = now; }
  resume(now) {
    if (this.pauseAt === null) return;
    const dt = now - this.pauseAt; this.pauseAt = null;
    if (this.t0 !== null) this.t0 += dt;
    if (this.relTs !== null) this.relTs += dt;
    if (this.bncTs !== null) this.bncTs += dt;
    if (this.occTs !== null) this.occTs += dt;
    if (this.lastTs !== null) this.lastTs += dt;
    for (const k in this.marks) this.marks[k] += dt;
  }
  get releaseRef() { return this.relTs !== null ? this.relTs : this.t0 + T_REL * 1000; }
  // Response time (s) from the presented release frame. Negative = pressed before the release was on screen.
  rt(ts) { return (ts - this.releaseRef) / 1000; }
  rtOf(name) { return this.has(name) ? this.rt(this.marks[name]) : null; }
  // Bounce / occlusion as presented, in s after the presented release (fall back to the physics time).
  tbPresented(tb) { return this.bncTs !== null && this.relTs !== null ? (this.bncTs - this.relTs) / 1000 : tb; }
  occPresented() { return this.occTs !== null && this.relTs !== null ? (this.occTs - this.relTs) / 1000 : null; }
}

// Controller press time. The press happened after the previous poll (button up) and by this poll (button down).
// gamepad.timestamp is used when it falls inside that bracket; otherwise (stale stamp, or another time base) the
// midpoint is the best estimate. Worst-case error = one poll interval.
export function padStamp(gpTs, prevPoll, nowPoll) {
  if (prevPoll == null) return gpTs > 0 && gpTs <= nowPoll && nowPoll - gpTs < 50 ? gpTs : nowPoll;
  if (gpTs > prevPoll && gpTs <= nowPoll + 0.5) return Math.min(gpTs, nowPoll);
  return (prevPoll + nowPoll) / 2;
}

// Refresh rate from frame intervals: median interval, snapped to a common panel rate when within 4%.
export const COMMON_HZ = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 170, 180, 200, 240];
export function estimateHz(deltas) {
  const a = deltas.filter(x => x > 2 && x < 100).sort((x, y) => x - y);
  if (a.length < 10) return null;
  const med = a[a.length >> 1], hz = 1000 / med;
  let best = null, bd = 1e9;
  for (const h of COMMON_HZ) { const e = Math.abs(h - hz) / h; if (e < bd) { bd = e; best = h; } }
  return bd < 0.04 ? best : Math.round(hz);
}
// Frames that took longer than 1.5 refresh intervals (the display had to show a frame twice).
export function droppedFrames(deltas, hz) {
  const lim = 1.5 * 1000 / hz; let n = 0;
  for (const d of deltas) if (d > lim) n++;
  return n;
}

// Reaction test: green appears on the frame stamped stimTs; the press is stamped eventTs.
export function reactionMs(eventTs, stimTs) { return eventTs - stimTs; }
export function median(a) { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
