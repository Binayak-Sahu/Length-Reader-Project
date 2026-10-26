// The bowler: a simple mannequin rig driven by core/action.js. One shared pose object, so no allocation per frame.
import * as THREE from 'three';
import { poseAt, RUN_START_Z } from '../core/action.js';

const d2r = Math.PI / 180;

export function createBowler(scene) {
  const whites = new THREE.MeshLambertMaterial({ color: 0xf1f1ea });
  const cream = new THREE.MeshLambertMaterial({ color: 0xe6e2d3 });           // trousers a touch darker than the shirt
  const skin = new THREE.MeshLambertMaterial({ color: 0x7a4a30 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1d2530 });            // kit colour: cap, trim, shoes
  const casters = [];
  const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; casters.push(m); return m; };
  // Limb segment hanging from its joint: a capsule, so knees and elbows stay rounded with no gaps
  function seg(len, r1, r2, mat) {
    const r = (r1 + r2) / 2, g = new THREE.Group(), m = mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - r), 4, 10), mat);
    m.position.y = -len / 2; g.add(m); return g;
  }
  const root = new THREE.Group(); scene.add(root);
  const pel = mesh(new THREE.CapsuleGeometry(0.11, 0.16, 4, 10), cream); pel.rotation.z = Math.PI / 2; root.add(pel);
  const torso = new THREE.Group(); torso.position.y = 0.06; root.add(torso);
  const ch = mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.52, 14), whites); ch.position.y = 0.3; torso.add(ch);
  const sh = mesh(new THREE.CapsuleGeometry(0.075, 0.3, 4, 10), whites); sh.rotation.z = Math.PI / 2; sh.position.y = 0.53; torso.add(sh);   // shoulder line
  const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.035, 14), dark); trim.position.y = 0.06; torso.add(trim);      // waistband
  const neck = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), skin); neck.position.y = 0.62; torso.add(neck);
  const hd = mesh(new THREE.SphereGeometry(0.105, 16, 12), skin); hd.scale.set(1, 1.1, 1.05); hd.position.y = 0.74; torso.add(hd);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.113, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark); cap.position.y = 0.77; torso.add(cap);
  const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), dark);
  peak.position.set(0, 0.772, -0.07); peak.scale.set(1, 1, 1.15); torso.add(peak);                  // peak faces the batter (−z)
  function arm(side) {
    const sh = new THREE.Group(); sh.position.set(0.21 * side, 0.54, 0); torso.add(sh);
    const up = seg(0.31, 0.05, 0.045, whites); sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.31; up.add(el);
    const fo = seg(0.29, 0.043, 0.036, skin); el.add(fo);
    const hand = mesh(new THREE.SphereGeometry(0.045, 10, 8), skin); hand.position.y = -0.31; fo.add(hand);
    return { sh, el, hand };
  }
  function leg(side) {
    const hip = new THREE.Group(); hip.position.set(0.1 * side, -0.06, 0); root.add(hip);
    const th = seg(0.47, 0.075, 0.06, cream); hip.add(th);
    const kn = new THREE.Group(); kn.position.y = -0.47; th.add(kn);
    const sh = seg(0.46, 0.055, 0.045, cream); kn.add(sh);
    const ft = mesh(new THREE.CapsuleGeometry(0.045, 0.17, 4, 8), dark); ft.rotation.x = Math.PI / 2; ft.position.set(0, -0.48, -0.06); sh.add(ft);
    return { hip, kn, ft };
  }
  const rA = arm(1), lA = arm(-1), rL = leg(1), lL = leg(-1);
  const P = {};

  function apply(p, prof, jx) {
    root.scale.setScalar(prof.s);
    root.position.set(p.x + prof.xo + jx, p.y * prof.s, p.z);
    root.rotation.set(0, p.hy * d2r, 0);
    torso.rotation.set(p.tx * d2r, (p.sy - p.hy) * d2r, p.tz * d2r, 'YXZ');
    rA.sh.rotation.set(p.rx * d2r, 0, p.rw * d2r); rA.el.rotation.x = p.re * d2r;
    lA.sh.rotation.set(p.lx * d2r, 0, p.lw * d2r); lA.el.rotation.x = p.le * d2r;
    rL.hip.rotation.x = p.rh * d2r; rL.kn.rotation.x = p.rk * d2r;
    lL.hip.rotation.x = p.lh * d2r; lL.kn.rotation.x = p.lk * d2r;
    root.updateMatrixWorld(true);
  }

  return {
    root, casters, materials: [whites, cream, skin, dark],
    setKit(hex) { dark.color.setHex(hex); },
    // Pose at scene time t (s). rel = release-angle offset (deg), jx = small sideways shift of the release.
    pose(t, prof, rel, jx) { apply(poseAt(t, prof, rel, P), prof, jx); },
    handWorld(out) { return rA.hand.getWorldPosition(out); },
    // Nets: walks back to his mark between balls. e = seconds since the ball finished; w = {from:{x,z}, dur (ms)}.
    walkBack(e, w, prof) {
      const Z1 = prof.spin ? 23 : RUN_START_Z, dist = Z1 - w.from.z, tw = dist / Math.max(1.5, dist / Math.max(1, w.dur / 1000 - 2.5));
      let z = w.from.z, x = w.from.x, face = Math.PI, mv = 0;
      if (e < 0.6) face = Math.PI * e / 0.6;
      else if (e - 0.6 < tw) { const u = (e - 0.6) / tw; z = w.from.z + dist * u; x = w.from.x + (-1.0 - w.from.x) * u; mv = 1; }
      else { z = Z1; x = -1.0; const k = Math.min(1, (e - 0.6 - tw) / 0.8); face = Math.PI * (1 - k); }
      const sn = Math.sin(e * 2 * Math.PI * 0.95) * mv;
      root.scale.setScalar(prof.s);
      root.position.set(x, prof.s * (1.0 + 0.02 * Math.abs(sn)), z); root.rotation.set(0, face, 0); torso.rotation.set(0, 0, 0);
      rA.sh.rotation.set(0.35 * sn, 0, 0); rA.el.rotation.x = 0.3; lA.sh.rotation.set(-0.35 * sn, 0, 0); lA.el.rotation.x = 0.3;
      rL.hip.rotation.x = 0.4 * sn; lL.hip.rotation.x = -0.4 * sn; rL.kn.rotation.x = -0.1 - 0.5 * Math.max(0, -sn); lL.kn.rotation.x = -0.1 - 0.5 * Math.max(0, sn);
      root.updateMatrixWorld(true);
    },
  };
}
