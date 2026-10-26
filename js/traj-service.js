// Trajectory requests: sent to the worker when the bowler starts his run-up (≥3 s before release).
// If the answer isn't back by release (or workers aren't available), it is solved on the spot.
import { solveTraj, buildTraj } from './core/physics.js';

export function createTrajService() {
  let w = null, seq = 0;
  const pending = new Map();
  try {
    w = new Worker(new URL('./traj-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { const job = pending.get(e.data.id); if (job) { pending.delete(e.data.id); job.res = buildTraj(e.data.t); } };
    w.onerror = () => { w = null; };
  } catch (e) { w = null; }
  const stats = { worker: 0, sync: 0 };
  return {
    stats,
    request(p0, kph, d, lx, opt) {
      const job = { id: ++seq, args: [p0, kph, d, lx, opt], res: null };
      if (w) { pending.set(job.id, job); w.postMessage({ id: job.id, p0, kph, d, lx, opt }); }
      return job;
    },
    // The finished trajectory (solves synchronously as a fallback).
    get(job) {
      if (!job.res) { pending.delete(job.id); job.res = buildTraj(solveTraj(...job.args)); stats.sync++; }
      else if (!job.counted) stats.worker++;
      job.counted = true;
      return job.res;
    },
  };
}
