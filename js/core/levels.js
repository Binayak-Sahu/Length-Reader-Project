// The training ladder (same 28 steps, same order as v4, so saved levels carry over) and the 85% staircase.

export const STAGES = { 1: 'FEET', 2: 'PLAY/LEAVE', 3: 'VARIETY', 4: 'SHOT CHOICE' };
export const STAGE_INFO = {
  1: 'Front or back foot only. Balls on the stumps.',
  2: 'Feet, then play or leave.',
  3: 'Slower balls, swing and seam.',
  4: 'Pick the shot.' };
const L12 = [[80, null], [90, null], [100, null], [110, null], [120, null], [120, 0.25], [120, 0.16], [120, 0.10], [120, 0]];
const L34 = [[100, null], [110, null], [120, null], [120, 0.25], [120, 0.16]];
export function occName(o) { return o === null ? 'full view' : o === 0 ? 'black at release' : 'black +' + Math.round(o * 1000) + ' ms'; }
export const LEVELS = [[1, L12], [2, L12], [3, L34], [4, L34]].flatMap(([m, L]) =>
  L.map(([k, o]) => ({ m, k, o, n: `L${m} ${STAGES[m]} · ${k} kph · ${occName(o)}` })));
export const STAGE_START = { 1: 0, 2: 9, 3: 18, 4: 23 };
export const MAX_LEVEL = LEVELS.length - 1;

export function clampLevel(i) { return Math.max(0, Math.min(MAX_LEVEL, i | 0)); }
// Where this step sits inside its stage: 0 = first step, 1 = last.
export function stageProgress(i) {
  const L = LEVELS[clampLevel(i)], st = STAGE_START[L.m], en = L.m < 4 ? STAGE_START[L.m + 1] : LEVELS.length;
  return (i - st) / Math.max(1, en - st - 1);
}

// Weighted up/down staircase aimed at 85% success (Kaernbach-style; the "85% rule", Wilson et al. 2019).
// d is the progress (0–1) through the current step. Each ball: d += GAIN × (score − 0.85).
// Reach 1 → up a step, restart at 0.5 · fall below 0 → down a step, restart at 0.5.
// Simulation (tests/game-test.mjs) shows it holds success at ≈ 84–85%; v4's 8-ball rule held ≈ 66%.
export const TARGET = 0.85, GAIN = 0.5, RESTART = 0.5;
export function stairStep(level, d, sc) {
  d += GAIN * (sc - TARGET);
  if (d >= 1) { if (level < MAX_LEVEL) return { level: level + 1, d: RESTART, moved: 1 }; return { level, d: 1, moved: 0 }; }
  if (d < 0) { if (level > 0) return { level: level - 1, d: RESTART, moved: -1 }; return { level, d: 0, moved: 0 }; }
  return { level, d, moved: 0 };
}
