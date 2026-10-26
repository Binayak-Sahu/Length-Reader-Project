// Adaptive quality: decisions only (the engine applies them). Changes happen between balls, never mid-delivery.
// Tiers trade resolution (pixel ratio) and shadow detail for frame time.
export const TIERS = [
  { id: 'min', dpr: 0.75, shadow: 0, aniso: 1 },
  { id: 'low', dpr: 1.0, shadow: 0, aniso: 4 },
  { id: 'medium', dpr: 1.5, shadow: 1024, aniso: 8 },
  { id: 'high', dpr: 2.0, shadow: 1024, aniso: 8 },
  { id: 'ultra', dpr: 3.0, shadow: 2048, aniso: 16 },
];
export const tierIndex = id => Math.max(0, TIERS.findIndex(t => t.id === id));

// Stats for one delivery: frames rendered, frames that missed vsync (dropped), 95th-percentile CPU ms, frame budget ms.
export class QualityController {
  constructor(start, max = TIERS.length - 1) {
    this.tier = Math.min(start, max); this.max = max; this.good = 0; this.balls = 0; this.failedAt = {};
  }
  // Returns the new tier index if it should change, else null.
  onBall(st) {
    this.balls++;
    if (!st || st.frames < 60 || !st.budget) return null;
    const drop = st.drops / st.frames, cpu = st.cpuP95 / st.budget;
    if ((drop > 0.02 || cpu > 0.85) && this.tier > 0) {
      this.failedAt[this.tier] = this.balls; this.good = 0; return --this.tier;
    }
    if (drop < 0.004 && cpu < 0.45) this.good++; else this.good = 0;
    const next = this.tier + 1, failed = this.failedAt[next];
    if (this.good >= 3 && next <= this.max && (failed === undefined || this.balls - failed > 20)) { this.good = 0; return ++this.tier; }
    return null;
  }
}

export function p95(a) { if (!a.length) return 0; const b = Array.from(a).sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * 0.95))]; }
