// The "new look" ground (Settings → New look in play; off by default, DECISIONS U6).
// Only pictures change: sky, tree line, grass, pitch surface and net mesh. Nothing here knows about the ball, the bowler
// or time, so flight, timing and marking are the same in both looks. Built once, the first time the look is switched on.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
function canvas(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return [cv, cv.getContext('2d')]; }
function tex(cv, repeat) {
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat === 'x') t.wrapS = THREE.RepeatWrapping;            // around the horizon only: no bleed from the bottom edge into the top
  else if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// draw something three times so it wraps cleanly across the left/right edge of a tiling canvas
function wrapX(W, x, fn) { fn(x); fn(x - W); fn(x + W); }

// Sky: blue overhead fading to a pale haze at the horizon, with a few soft clouds low down. Canvas top = straight up.
function skyTex() {
  const W = 2048, H = 512, [cv, c] = canvas(W, H);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#3f7cc0'); g.addColorStop(0.45, '#7fb0dc'); g.addColorStop(0.82, '#bcd6e8'); g.addColorStop(1, '#d6e4ea');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let k = 0; k < 26; k++) {                                   // cloud banks: clusters of soft puffs, flat underneath
    const cx = Math.random() * W, cy = rnd(H * 0.6, H * 0.93), w = rnd(60, 190), n = 10 + Math.floor(Math.random() * 14);
    for (let i = 0; i < n; i++) {
      const x = cx + rnd(-w, w), y = cy - Math.random() * w * 0.16, r = rnd(14, 44) * (1 - Math.abs(x - cx) / (w * 1.6));
      wrapX(W, x, (px) => { const q = c.createRadialGradient(px, y, 0, px, y, r);
        q.addColorStop(0, 'rgba(255,255,255,0.4)'); q.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = q; c.fillRect(px - r, y - r, 2 * r, 2 * r); });
    }
  }
  return tex(cv, 'x');
}

// Tree line: three overlapping rows of rounded crowns, hazier the further back. Transparent above the tops.
function treeTex() {
  const W = 2048, H = 256, [cv, c] = canvas(W, H);
  const rows = [['#7f9c8a', 0.30, 26, 46], ['#55795a', 0.46, 24, 44], ['#3a5f3f', 0.62, 20, 40]];
  rows.forEach(([col, top, rMin, rMax], k) => {
    c.fillStyle = col; c.fillRect(0, H * (top + 0.14), W, H);
    for (let x = 0; x < W; x += rnd(14, 34)) {
      const r = rnd(rMin, rMax), y = H * top + rnd(0, 34) + r * 0.6;
      wrapX(W, x, (px) => {
        c.fillStyle = col; c.beginPath(); c.arc(px, y, r, 0, 7); c.arc(px + r * 0.7, y + r * 0.25, r * 0.75, 0, 7); c.arc(px - r * 0.7, y + r * 0.3, r * 0.7, 0, 7); c.fill();
        const q = c.createRadialGradient(px - r * 0.3, y - r * 0.4, 0, px - r * 0.3, y - r * 0.4, r);   // sunlit top-left of each crown
        q.addColorStop(0, `rgba(235,240,190,${0.10 + k * 0.03})`); q.addColorStop(1, 'rgba(235,240,190,0)'); c.fillStyle = q; c.beginPath(); c.arc(px, y, r, 0, 7); c.fill();
      });
    }
  });
  const sh = c.createLinearGradient(0, H * 0.8, 0, H); sh.addColorStop(0, 'rgba(20,40,24,0)'); sh.addColorStop(1, 'rgba(20,40,24,0.55)');
  c.fillStyle = sh; c.fillRect(0, H * 0.8, W, H * 0.2);                                                // shade under the trees
  return tex(cv, 'x');
}

// Grass: one tile = 8 m, two soft-edged mowing stripes (the same depth cue as before), fine grain and patchy growth.
function grassTex() {
  const S = 512, [cv, c] = canvas(S, S), img = c.createImageData(S, S), d = img.data;
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < S; y++) {
    const u = y / S, band = 1 + 0.05 * (ss(0.0, 0.03, u) - ss(0.5, 0.53, u) + ss(0.97, 1, u) - 0.5) * 2;
    for (let x = 0; x < S; x++) { const n = (Math.random() - 0.5) * 16, i = (y * S + x) * 4;
      d[i] = (68 + n * 0.8) * band; d[i + 1] = (108 + n) * band; d[i + 2] = (54 + n * 0.5) * band; d[i + 3] = 255; }
  }
  c.putImageData(img, 0, 0);
  for (let i = 0; i < 90; i++) {                                    // patchy growth, wrapped so the tile repeats cleanly
    const x = Math.random() * S, y = Math.random() * S, r = rnd(18, 60), col = Math.random() < 0.5 ? '40,80,34' : '120,160,80';
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { const q = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      q.addColorStop(0, `rgba(${col},0.07)`); q.addColorStop(1, `rgba(${col},0)`); c.fillStyle = q; c.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r); }
  }
  const t = tex(cv, true); t.repeat.set(20, 22.5); return t;
}

// Pitch: the same worn club net strip (same size, same wear in the same places), drawn more like rolled clay:
// soft mottling, hairline cracks that run with the pitch, and grass that fades in at the edges.
function pitchTex() {
  const W = 512, H = 2048, [cv, c] = canvas(W, H);
  const Z0 = -3.41, L = 24.5, zy = z => (z - Z0) / L * H, xx = x => (x / 3.05 + 0.5) * W;
  c.fillStyle = '#a08a62'; c.fillRect(0, 0, W, H);
  const img = c.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n * 0.9; d[i + 2] += n * 0.7; }
  c.putImageData(img, 0, 0);
  const soft = (x, y, r, col, a) => { const q = c.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, `rgba(${col},${a})`); q.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = q; c.fillRect(x - r, y - r, 2 * r, 2 * r); };
  for (let i = 0; i < 420; i++) soft(Math.random() * W, Math.random() * H, rnd(30, 95), Math.random() < 0.5 ? '186,164,120' : '128,108,74', rnd(0.05, 0.11));   // mottling
  c.globalAlpha = 0.05; c.fillStyle = '#d8c59a';                                                   // faint roller streaks down the pitch
  for (let i = 0; i < 16; i++) c.fillRect(rnd(40, W - 40), 0, rnd(6, 22), H);
  c.globalAlpha = 1;
  const wear = (x, z, rx, rz, col, n, a) => { for (let i = 0; i < n; i++) soft(xx(x + (Math.random() - 0.5) * rx), zy(z + (Math.random() - 0.5) * rz), rnd(10, 34), col, a * rnd(0.5, 1)); };
  wear(0, 4.5, 1.6, 5, '104,84,54', 170, 0.13); wear(0, 13, 1.6, 5, '104,84,54', 150, 0.13);        // worn length areas (both ends)
  wear(-0.45, 18.1, 0.8, 2.6, '86,68,44', 150, 0.17); wear(0.35, 19.4, 0.6, 1.4, '86,68,44', 80, 0.17);   // bowler's landing + follow-through
  wear(-0.15, 0.3, 0.7, 1.4, '86,68,44', 110, 0.17); wear(-0.1, -0.6, 0.4, 0.6, '74,58,38', 60, 0.2);     // batter's front-foot area + guard
  wear(0.2, 17.0, 0.7, 2.0, '86,68,44', 60, 0.17);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const crack = (x, y, n, w, a) => { c.strokeStyle = `rgba(66,50,32,${a})`; c.lineWidth = w; c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < n; k++) { x += rnd(-7, 7); y += rnd(8, 26); c.lineTo(x, y); if (Math.random() < 0.18) crack(x, y, 2, w * 0.7, a * 0.8), c.moveTo(x, y); }
    c.stroke(); };
  for (let i = 0; i < 46; i++) crack(rnd(30, W - 30), Math.random() * H, 4 + Math.floor(Math.random() * 6), rnd(0.6, 1.1), rnd(0.16, 0.3));
  for (const side of [0, 1]) {                                                                     // grass fading in at the edges
    const g = c.createLinearGradient(side ? W : 0, 0, side ? W - 46 : 46, 0); g.addColorStop(0, 'rgba(70,116,56,0.85)'); g.addColorStop(0.45, 'rgba(84,120,58,0.3)'); g.addColorStop(1, 'rgba(84,120,58,0)');
    c.fillStyle = g; c.fillRect(side ? W - 46 : 0, 0, 46, H);
    for (let i = 0; i < 1500; i++) { const x = side ? W - Math.pow(Math.random(), 2) * 50 : Math.pow(Math.random(), 2) * 50;
      c.fillStyle = `rgba(${60 + Math.random() * 30},${105 + Math.random() * 35},48,${0.2 + Math.random() * 0.3})`; c.fillRect(x, Math.random() * H, 1.5, 2 + Math.random() * 4); }
  }
  return tex(cv);
}

// Net: thinner twine on a larger tile, so far away it blurs to a light haze and the pitch stays easy to see through it.
function netTex(maxAniso) {
  const [cv, c] = canvas(128, 128);
  c.strokeStyle = 'rgba(34,40,46,0.95)'; c.lineWidth = 4; c.strokeRect(0, 0, 128, 128);
  const t = tex(cv, true); t.anisotropy = Math.min(8, maxAniso); t.repeat.set(26 / 0.14, 3.2 / 0.14); return t;
}

export function buildScene2(maxAniso) {
  const sTex = skyTex(); sTex.repeat.set(2, 1);
  const skyMat = new THREE.MeshBasicMaterial({ map: sTex, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), skyMat);
  sky.position.z = 20; sky.renderOrder = -1;
  const tTex = treeTex(); tTex.repeat.set(5, 1); tTex.anisotropy = Math.min(4, maxAniso);
  const treeMat = new THREE.MeshBasicMaterial({ map: tTex, side: THREE.BackSide, transparent: true, depthWrite: false });
  const trees = new THREE.Mesh(new THREE.CylinderGeometry(98, 98, 17, 64, 1, true), treeMat);
  trees.position.set(0, 7.2, 15);
  return {
    sky, trees, grassTex: grassTex(), pitchTex: pitchTex(), netTex: netTex(maxAniso),
    tint(night, late) {
      skyMat.color.setHex(night ? 0x3a4660 : late ? 0xffd2a8 : 0xffffff);
      treeMat.color.setHex(night ? 0x2c3648 : late ? 0xd6a680 : 0xffffff);
    },
  };
}
