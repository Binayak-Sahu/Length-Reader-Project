// The 3D world: nets, pitch, ball, trail, Hawk-Eye and cameras.
// Performance rules: everything is built once and re-used (no per-ball geometry, no per-frame allocation);
// repeated objects are instanced or merged; the shadow map is re-rendered only on frames where the bowler moved.
import * as THREE from 'three';
import { Z_STUMPS, R, bandsFor } from '../core/physics.js';
import { TIERS } from '../core/quality.js';
import { createBowler } from './bowler.js';

const d2r = Math.PI / 180;
// Batter's eye: 1.5 m (6 ft in stance), head on the off-stump line. In the right-hander frame off side = −x;
// for left-handers the frame group is mirrored (scale.x = −1) and the camera's x flips.
export const EYE = { x: -0.1, y: 1.5, z: 0.15 };
const VIEWS = { normal: { fov: 34, look: [0.15, 0.22, 10] }, wide: { fov: 44, look: [0.15, -0.08, 10] }, tight: { fov: 26, look: [0.2, 0.82, 13] },
  portrait: { fov: 40, look: [0.15, -0.63, 10] } };
const SKY = 0xaec3d3;

function rnd(a, b) { return a + Math.random() * (b - a); }

function noiseTex(w, h, base, spread, stripes) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
  const img = c.createImageData(w, h), [r, g, b] = base;
  for (let y = 0; y < h; y++) {
    const band = stripes ? ((y < h / 2) ? 1.06 : 0.94) : 1;
    for (let x = 0; x < w; x++) {
      const n = (Math.random() - 0.5) * spread, i = (y * w + x) * 4;
      img.data[i] = Math.min(255, (r + n) * band); img.data[i + 1] = Math.min(255, (g + n) * band); img.data[i + 2] = Math.min(255, (b + n * 0.6) * band); img.data[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function radialTex(size, inner) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const c = cv.getContext('2d');
  const g = c.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}
// Flat rectangles on the ground merged into one mesh (one draw call for every crease line).
function groundQuads(rects, y) {
  const pos = [], idx = [];
  rects.forEach(([w, l, x, z], k) => {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - l / 2, z1 = z + l / 2, o = k * 4;
    pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1); idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY); scene.fog = new THREE.Fog(SKY, 70, 190);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 400);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // Lights (physically based units in r155+: ≈ π × the old r128 values)
  scene.add(new THREE.HemisphereLight(0xe6eef6, 0x4b5a3c, 2.5));
  const sun = new THREE.DirectionalLight(0xfff6e8, 3.0);
  sun.target.position.set(0, 0, 24); sun.position.set(-7, 20, 18); scene.add(sun.target, sun);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
  const SUN_DIR = new THREE.Vector3(-7, 20, -6).normalize();

  // Grass with mowing stripes (a depth cue), pitch, crease lines
  const gTex = noiseTex(128, 128, [70, 112, 58], 26, true); gTex.repeat.set(40, 45);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(160, 180), new THREE.MeshLambertMaterial({ map: gTex }));
  grass.rotation.x = -Math.PI / 2; grass.position.z = 20; grass.receiveShadow = true; scene.add(grass);
  const pTex = noiseTex(128, 128, [196, 172, 124], 30, false); pTex.repeat.set(2, 14);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 24.5), new THREE.MeshLambertMaterial({ map: pTex }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, 0.004, 8.84); pitch.receiveShadow = true; scene.add(pitch);
  const lines = new THREE.Mesh(groundQuads([
    [3.66, 0.05, 0, 0], [3.66, 0.05, 0, 17.68], [2.64, 0.05, 0, Z_STUMPS], [2.64, 0.05, 0, 18.9],
    [0.05, 2.44, -1.32, Z_STUMPS], [0.05, 2.44, 1.32, Z_STUMPS], [0.05, 2.44, -1.32, 18.3], [0.05, 2.44, 1.32, 18.3]], 0.008),
  new THREE.MeshBasicMaterial({ color: 0xf4f4ee }));
  scene.add(lines);

  // Stumps and bails: two instanced meshes for both ends
  const stumpMat = new THREE.MeshLambertMaterial({ color: 0xf0ebdc });
  const stumps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.711, 10), stumpMat, 6);
  const bails = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 6), stumpMat, 4);
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), s = new THREE.Vector3(1, 1, 1);
    let i = 0, j = 0;
    for (const z of [Z_STUMPS, 18.9]) {
      for (const x of [-0.11, 0, 0.11]) stumps.setMatrixAt(i++, m.makeTranslation(x, 0.355, z));
      for (const x of [-0.055, 0.055]) bails.setMatrixAt(j++, m.compose(new THREE.Vector3(x, 0.72, z), q, s));
    } }
  stumps.castShadow = true; scene.add(stumps, bails);

  // Nets: two side nets (one texture) + instanced poles
  { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
    c.strokeStyle = 'rgba(30,34,38,0.9)'; c.lineWidth = 3; c.strokeRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, maxAniso); t.repeat.set(26 / 0.14, 3.2 / 0.14);
    const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const geo = new THREE.PlaneGeometry(26, 3.2);
    for (const x of [-1.75, 1.75]) { const n = new THREE.Mesh(geo, mat); n.rotation.y = Math.PI / 2; n.position.set(x, 1.6, 9); scene.add(n); }
    const zs = []; for (let z = -4; z <= 22; z += 4.33) zs.push(z);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 3.3, 6), new THREE.MeshLambertMaterial({ color: 0x2a2f35 }), zs.length * 2);
    const m = new THREE.Matrix4(); let i = 0;
    for (const x of [-1.75, 1.75]) for (const z of zs) poles.setMatrixAt(i++, m.makeTranslation(x, 1.65, z));
    poles.castShadow = true; scene.add(poles); }

  // Distant trees: one instanced mesh (was 70 separate meshes)
  { const N = 70, trees = new THREE.InstancedMesh(new THREE.ConeGeometry(3, 9, 7), new THREE.MeshLambertMaterial({ color: 0x2c4630 }), N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < N; i++) { const a = rnd(-1.25, 1.25) + Math.PI / 2, r = rnd(70, 100), k = rnd(0.8, 1.5);
      trees.setMatrixAt(i, m.compose(p.set(Math.cos(a) * r, rnd(3, 5), Math.sin(a) * r * 0.9 + 15), q, s.set(k, k, k))); }
    scene.add(trees); }

  const bowler = createBowler(scene);
  // Cheap blob shadow under the bowler for low tiers (no shadow map)
  const blobTex = radialTex(64, 0.15);
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.35, depthWrite: false, color: 0x000000 });
  const bBlob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat); bBlob.rotation.x = -Math.PI / 2; bBlob.scale.set(0.9, 1.3, 1); scene.add(bBlob);

  // Batter-frame group: ball, trail and pitch marker live here; mirrored for left-handers.
  const frame = new THREE.Group(); scene.add(frame);
  const ballTex = (() => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#8e0f19'); g.addColorStop(0.5, '#b3141f'); g.addColorStop(1, '#8e0f19'); c.fillStyle = g; c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#efe4d2'; c.fillRect(0, 59, 256, 10);
    c.strokeStyle = '#7a0c14'; c.lineWidth = 1.5; for (let x = 0; x < 256; x += 6) { c.beginPath(); c.moveTo(x, 57); c.lineTo(x + 3, 71); c.stroke(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const ballGeo = new THREE.SphereGeometry(R, 24, 16); ballGeo.rotateZ(Math.PI / 2);   // seam upright, along the line of flight
  const ball = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.35, metalness: 0.05 }));
  ball.visible = false; frame.add(ball);
  // Ball's shadow on the pitch: a soft blob placed along the sun direction (a real depth cue, and nearly free)
  const ballBlob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.5, depthWrite: false, color: 0x000000 }));
  ballBlob.rotation.x = -Math.PI / 2; ballBlob.visible = false; scene.add(ballBlob);

  // Trail: one preallocated tube re-filled for each ball (no geometry is created or disposed per ball)
  const SEG = 160, RAD = 6, tPos = new Float32Array((SEG + 1) * RAD * 3), tIdx = [];
  for (let i = 0; i < SEG; i++) for (let j = 0; j < RAD; j++) {
    const a = i * RAD + j, b = i * RAD + (j + 1) % RAD, c = a + RAD, d = b + RAD; tIdx.push(a, c, b, b, c, d);
  }
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage)); tGeo.setIndex(tIdx);
  const trail = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ color: 0xffd34d })); trail.frustumCulled = false; trail.visible = false; frame.add(trail);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.12, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; frame.add(ring);
  const P = Array.from({ length: SEG + 1 }, () => new THREE.Vector3()), T = new THREE.Vector3(), N_ = new THREE.Vector3(), B_ = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function setTrail(tr, color) {
    const end = tr.ta + 0.05;
    for (let i = 0; i <= SEG; i++) { const p = tr.pos(end * i / SEG); P[i].set(p.x, p.y, p.z); }
    for (let i = 0; i <= SEG; i++) {
      T.subVectors(P[Math.min(SEG, i + 1)], P[Math.max(0, i - 1)]).normalize();
      N_.crossVectors(T, UP).normalize(); B_.crossVectors(N_, T);
      for (let j = 0; j < RAD; j++) {
        const a = j / RAD * Math.PI * 2, cs = Math.cos(a) * 0.024, sn = Math.sin(a) * 0.024, k = (i * RAD + j) * 3;
        tPos[k] = P[i].x + N_.x * cs + B_.x * sn; tPos[k + 1] = P[i].y + N_.y * cs + B_.y * sn; tPos[k + 2] = P[i].z + N_.z * cs + B_.z * sn;
      }
    }
    tGeo.attributes.position.needsUpdate = true; tGeo.setDrawRange(0, SEG * RAD * 6);
    ring.material.color.set(color); ring.position.set(tr.pb.x, 0.012, tr.pb.z);
    trail.visible = ring.visible = true;
  }
  function clearTrail() { trail.visible = ring.visible = false; }

  // Hawk-Eye: high camera behind the bowler, length bands for this ball's pace, the path drawn in
  const heCam = new THREE.PerspectiveCamera(40, 1, 0.1, 250);
  const heBands = new THREE.Group(); heBands.visible = false; scene.add(heBands);
  const bandMeshes = [0, 1, 2, 3, 4].map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; heBands.add(m); return m; });
  const heLines = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.013; heBands.add(m); return m; });
  let he = null;
  function placeHe(w, h) { const port = w < h; heCam.fov = port ? 60 : 40; heCam.aspect = w / h;
    heCam.position.set(0, port ? 7.5 : 5.4, port ? 27 : 26); heCam.lookAt(0, 0, port ? 6.5 : 5.5); heCam.updateProjectionMatrix(); }

  // State
  let W = 1, H = 1, hx = 1, tier = TIERS[2], shadowDirty = true, view = null;
  const v3 = new THREE.Vector3();

  function size() { W = Math.max(1, innerWidth); H = Math.max(1, innerHeight); }
  function applyTier(t) {
    tier = t;
    renderer.setPixelRatio(Math.min(t.dpr, window.devicePixelRatio || 1));
    renderer.setSize(W, H, false);
    const want = t.shadow > 0;
    if (sun.castShadow !== want) sun.castShadow = want;
    if (want && sun.shadow.mapSize.x !== t.shadow) { sun.shadow.mapSize.set(t.shadow, t.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    bBlob.visible = !want;
    for (const tx of [gTex, pTex]) { const a = Math.min(t.aniso, maxAniso); if (tx.anisotropy !== a) { tx.anisotropy = a; tx.needsUpdate = true; } }
    shadowDirty = true;
  }
  function applyView(S, hand) {
    view = S; hx = hand === 'L' ? -1 : 1; frame.scale.x = hx;
    let v;
    if (S.view === 'life') {
      const h = Math.max(0.1, (+S.lifeCm || 60) / 100), dist = Math.max(0.5, +S.lifeM || 1.5);
      const fov = 2 * Math.atan(h / 2 / dist) / d2r, center = (5 - fov / 2) * d2r;        // top edge 5° above horizon: bowler's hand in view
      v = { fov, look: [0.15, EYE.y + 10 * Math.tan(center), 10] };
    } else v = (W < H) ? VIEWS.portrait : (VIEWS[S.view] || VIEWS.normal);
    camera.fov = v.fov; camera.position.set(EYE.x * hx, EYE.y, EYE.z);
    camera.lookAt(-v.look[0] * hx, v.look[1], v.look[2]); camera.aspect = W / H; camera.updateProjectionMatrix();
    ball.scale.setScalar(S.view === 'life' ? 1 : (+S.boost || 1));     // life-size: true size, so its growth is a true timing cue
    placeHe(W, H);
  }
  function resize() { size(); renderer.setSize(W, H, false); if (view) applyView(view, hx === -1 ? 'L' : 'R'); else placeHe(W, H); }
  size(); applyTier(tier);

  function updateBlobs() {
    // ball shadow along the sun direction; softer and lighter the higher the ball
    if (ball.visible) {
      const h = Math.max(0, ball.position.y - R), x = ball.position.x * hx;
      ballBlob.visible = true;
      ballBlob.position.set(x - h * SUN_DIR.x / SUN_DIR.y, 0.009, ball.position.z - h * SUN_DIR.z / SUN_DIR.y);
      const s = 2 * R * ball.scale.x * (1.1 + 0.6 * h); ballBlob.scale.set(s, s, 1);
      ballBlob.material.opacity = 0.55 / (1 + 1.2 * h);
    } else ballBlob.visible = false;
    if (bBlob.visible) bBlob.position.set(bowler.root.position.x, 0.01, bowler.root.position.z);
  }

  return {
    renderer, scene, camera, heCam, bowler, ball, frame,
    get tier() { return tier; }, get hx() { return hx; },
    applyTier, applyView, resize,
    // Call after posing the bowler: the shadow map is redrawn on the next render only.
    bowlerMoved() { shadowDirty = true; },
    // Release point in the batter frame (mirrored for left-handers).
    releasePoint() { bowler.handWorld(v3); return { x: v3.x * hx, y: v3.y, z: v3.z }; },
    ballToHand() { bowler.handWorld(v3); ball.position.set(v3.x * hx, v3.y, v3.z); },
    setTrail, clearTrail,
    heStart(tr, dur, now) {
      bandsFor(tr.kph, tr.spin).forEach((b, i) => { const e = Math.min(b.b, 14), m = bandMeshes[i]; m.material.color.set(b.c);
        m.scale.y = Math.max(0.01, e - b.a); m.position.set(0, 0.01, Z_STUMPS + (b.a + e) / 2); });
      heLines[0].position.z = Z_STUMPS + tr.fmax; heLines[1].position.z = Z_STUMPS + tr.bmin;
      heBands.visible = true; bowler.root.visible = false; bBlob.visible = false;
      he = { start: now, dur: dur || 1500, tr, frozen: null }; tGeo.setDrawRange(0, 0);
    },
    heStep(now) {
      if (!he) return;
      const f = he.frozen != null ? he.frozen : Math.min(1, (now - he.start) / he.dur);
      tGeo.setDrawRange(0, Math.floor(f * SEG) * RAD * 6); ball.visible = f < 1; he.tr.pos(f * he.tr.ta, ball.position);
    },
    heHold(on, now) {
      if (!he) return;
      if (on && he.frozen == null) he.frozen = Math.min(1, (now - he.start) / he.dur);
      else if (!on && he.frozen != null) { he.start = now - he.frozen * he.dur; he.frozen = null; }
    },
    heStop() { he = null; heBands.visible = false; bowler.root.visible = true; bBlob.visible = !sun.castShadow; },
    get heActive() { return !!he; },
    render(cam, black) {
      // occlusion: this frame is black, drawn by the renderer itself. (three.js leaves the clear colour set to the
      // sky background after a render, so set black explicitly; the next render resets it from scene.background.)
      if (black) { renderer.setClearColor(0x000000, 1); renderer.clear(); return; }
      updateBlobs();
      if (shadowDirty && sun.castShadow) { renderer.shadowMap.needsUpdate = true; }
      shadowDirty = false;
      renderer.render(scene, cam || camera);
    },
    info() { const r = renderer.info.render; return { calls: r.calls, tris: r.triangles, dpr: renderer.getPixelRatio(), w: W, h: H }; },
  };
}
