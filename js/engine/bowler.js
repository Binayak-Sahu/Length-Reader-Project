// The bowler: a rig driven by core/action.js. One shared pose object, so no allocation per frame.
// Two bodies hang on the same skeleton: the classic mannequin (default) and, with the New look (v6.2), an athletic body
// with a shaped torso, shoulders, tapered limbs, knees, elbows and proper boots. Only the meshes differ: every joint,
// length and the hand (the release point) are shared, so the action, the cues and the ball are identical in both.
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
    return { sh, up, el, fo, hand };
  }
  function leg(side) {
    const hip = new THREE.Group(); hip.position.set(0.1 * side, -0.06, 0); root.add(hip);
    const th = seg(0.47, 0.075, 0.06, cream); hip.add(th);
    const kn = new THREE.Group(); kn.position.y = -0.47; th.add(kn);
    const sh = seg(0.46, 0.055, 0.045, cream); kn.add(sh);
    const ft = mesh(new THREE.CapsuleGeometry(0.045, 0.17, 4, 8), dark); ft.rotation.x = Math.PI / 2; ft.position.set(0, -0.48, -0.06); sh.add(ft);
    return { hip, th, kn, sh, ft };
  }
  const rA = arm(1), lA = arm(-1), rL = leg(1), lL = leg(-1);
  const P = {};

  // ---- the athletic body (New look). Built on first use; hangs on the same groups as the classic one. ----
  const classic = casters.slice().concat([trim, cap, peak]);
  let athlete = null;
  function buildAthlete() {
    const list = [], add = (parent, geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, shadow = true) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = shadow; m.visible = false;
      parent.add(m); list.push(m); return m;
    };
    const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    const taper = (r1, r2, len, seg = 12) => { const g = new THREE.CylinderGeometry(r1, r2, len, seg, 1, true); g.translate(0, -len / 2, 0); return g; };
    const ball = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
    const shirt = new THREE.MeshLambertMaterial({ color: 0xf5f4ef }), pants = new THREE.MeshLambertMaterial({ color: 0xe9e5d7 });
    const sole = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
    // torso: waist → chest → shoulders, flatter front to back; the open collar and a belt in the kit colour
    add(torso, lathe([[0.001, -0.02], [0.138, -0.02], [0.15, 0.08], [0.162, 0.2], [0.186, 0.33], [0.2, 0.43], [0.19, 0.51], [0.15, 0.575], [0.07, 0.615], [0.001, 0.62]]), shirt, 0, 0, 0, 1.17, 1, 0.68);
    add(torso, taper(0.072, 0.082, 0.05, 14), shirt, 0, 0.635, 0.004, 1, 1, 0.9);                                    // collar
    add(torso, new THREE.CylinderGeometry(0.143, 0.143, 0.04, 20, 1, true), dark, 0, 0.0, 0, 1.17, 1, 0.69, false);   // belt
    add(torso, taper(0.046, 0.05, 0.11, 10), skin, 0, 0.69, 0);                                                       // neck
    const head = add(torso, ball(0.1, 18, 14), skin, 0, 0.75, 0, 0.92, 1.12, 1.02);
    add(torso, ball(0.075, 12, 8), skin, 0, 0.695, -0.03, 0.95, 0.75, 0.95);                                          // jaw
    for (const sx of [1, -1]) add(torso, ball(0.022, 8, 6), skin, 0.093 * sx, 0.748, 0.005, 0.6, 1, 1, false);        // ears
    add(torso, new THREE.ConeGeometry(0.016, 0.04, 6), skin, 0, 0.738, -0.104, 1, 1, 1, false).rotation.x = -Math.PI / 2;  // nose (faces the batter)
    add(torso, new THREE.SphereGeometry(0.107, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark, 0, 0.785, 0, 0.95, 0.85, 1.03);  // cap
    const pk = add(torso, new THREE.CylinderGeometry(0.09, 0.09, 0.01, 18, 1, false, -Math.PI / 2, Math.PI), dark, 0, 0.79, -0.075, 1, 1, 1.2, false);
    pk.rotation.x = -0.12; head.userData.athlete = true;
    // hips and seat: carry the trousers from the belt into the thighs
    add(root, lathe([[0.001, 0.09], [0.15, 0.09], [0.158, 0.02], [0.162, -0.06], [0.135, -0.11], [0.07, -0.14], [0.001, -0.145]]), pants, 0, 0, 0, 1.18, 1, 0.78);
    for (const A of [rA, lA]) {
      add(A.up, ball(0.057, 14, 10), shirt, 0, -0.012, 0, 0.98, 1.1, 0.98);                                                // shoulder
      add(A.up, taper(0.058, 0.047, 0.29, 12), shirt, 0, -0.005, 0);                                                 // upper arm (sleeve)
      add(A.up, taper(0.05, 0.052, 0.03, 12), shirt, 0, -0.27, 0);                                                    // sleeve cuff
      add(A.el, ball(0.042, 10, 8), skin);                                                                             // elbow
      add(A.fo, taper(0.044, 0.031, 0.27, 12), skin, 0, -0.005, 0);                                                  // forearm
      add(A.fo, ball(0.04, 12, 8), skin, 0, -0.305, -0.005, 0.85, 1.3, 0.62);                                          // hand
    }
    for (const L of [rL, lL]) {
      add(L.th, taper(0.086, 0.062, 0.47, 14), pants);                                                                 // thigh
      add(L.kn, ball(0.06, 12, 10), pants, 0, 0, -0.004);                                                              // knee
      add(L.sh, taper(0.059, 0.043, 0.43, 14), pants);                                                                 // shin
      add(L.sh, taper(0.044, 0.05, 0.035, 12), pants, 0, -0.42, 0);                                                    // trouser hem
      add(L.sh, ball(0.056, 14, 10), dark, 0, -0.478, -0.05, 0.92, 0.82, 2.3);                                         // boot
      add(L.sh, new THREE.BoxGeometry(0.088, 0.02, 0.25), sole, 0, -0.514, -0.05, 1, 1, 1, false);                     // sole
    }
    return list;
  }
  let style = false;
  function setStyle(on) {
    on = !!on; if (on === style) return; style = on;
    if (on && !athlete) athlete = buildAthlete();
    for (const m of classic) m.visible = !on;
    if (athlete) for (const m of athlete) m.visible = on;
  }

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
    setStyle, get style() { return style; },
    // For the tests: meshes drawn in the current style
    meshCount() { let n = 0; root.traverse(o => { if (o.isMesh && o.visible) n++; }); return n; },
    setKit(hex) { dark.color.setHex(hex); },
    // Pose at scene time t (s). rel = release-angle offset (deg), jx = small sideways shift of the release.
    pose(t, prof, rel, jx, cue) { apply(poseAt(t, prof, rel, P, cue), prof, jx); },
    handWorld(out) { return rA.hand.getWorldPosition(out); },
    // World positions of the main joints (tests: rig → landmarks → clip extraction round trip). Allocates; not for the frame loop.
    joints() {
      const w = (o) => o.getWorldPosition(new THREE.Vector3());
      const ankle = (leg) => leg.kn.localToWorld(new THREE.Vector3(0, -0.46, 0));
      return { rs: w(rA.sh), re: w(rA.el), rw: w(rA.hand), ls: w(lA.sh), le: w(lA.el), lw: w(lA.hand),
        rh: w(rL.hip), rk: w(rL.kn), ra: ankle(rL), lh: w(lL.hip), lk: w(lL.kn), la: ankle(lL) };
    },
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
