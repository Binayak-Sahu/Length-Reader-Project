// Solves trajectories off the main thread. The typed arrays are transferred back (no copy).
import { solveTraj } from './core/physics.js';

self.onmessage = (e) => {
  const { id, p0, kph, d, lx, opt } = e.data;
  const t = solveTraj(p0, kph, d, lx, opt);
  self.postMessage({ id, t }, [t.X.buffer, t.Y.buffer, t.Z.buffer]);
};
