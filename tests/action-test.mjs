// Copied bowling actions (v5.8): rig → synthetic pose landmarks → extraction → rig. Run: node tests/action-test.mjs
import './three-hook.mjs';
import { makeOk } from './util.mjs';
const THREE = await import('three');
const { createBowler } = await import('../js/engine/bowler.js');
const { poseAt } = await import('../js/core/action.js');
const { frameAngles, buildAction, actionAt, timeMap, ACT_KEYS } = await import('../js/core/clipaction.js');
const { actionProfiles, mergeActions } = await import('../js/core/myactions.js');
const { syncPayload, mergeSynced } = await import('../js/core/sync.js');
const { newDB } = await import('../js/core/store.js');
const { T_RUN, T_BFC, T_FFC, T_REL, T_END } = await import('../js/core/physics.js');
const { ok, done } = makeOk('action');

const scene = new THREE.Scene(), b = createBowler(scene), prof = { s: 1, xo: 0, tw: 1, ao: 0 };
const IDX = { 11: 'ls', 12: 'rs', 13: 'le', 14: 're', 15: 'lw', 16: 'rw', 23: 'lh', 24: 'rh', 25: 'lk', 26: 'rk', 27: 'la', 28: 'ra' };
// a side-on "camera": MediaPipe-style world landmarks (x right, y down, z away from the camera; right-handed)
function landmarks(J, dir) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.99 }));
  for (const i in IDX) { const v = J[IDX[i]]; lm[i] = { x: -dir * v.z, y: -v.y, z: -dir * v.x, visibility: 0.99 }; }
  return lm;
}
// A "clip" of the rig itself, filmed at 30 fps and played at `slow`× (broadcast slow motion), travelling left→right or right→left.
function clip(dir = 1, slow = 1) {
  const frames = [];
  for (let ts = 0; ts <= (T_END - 2.0) * slow; ts += 1 / 30) {
    const t = 2.0 + ts / slow; b.pose(t, prof, 0, 0); const J = b.joints();
    frames.push({ t: ts, lm: landmarks(J, dir), hx: 0.5 - dir * J.rh.z / 40 });
  }
  return { frames, marks: { bfc: (T_BFC - 2.0) * slow, ffc: (T_FFC - 2.0) * slow, rel: (T_REL - 2.0) * slow } };
}
const tmp = {}, base = (t, k) => poseAt(t, prof, 0, tmp)[k];
const errs = (act) => { const e = {}; for (const k of ACT_KEYS) { let m = 0; for (let t = T_RUN; t <= T_END; t += 0.02) { const d = Math.abs(actionAt(act, t, k) - base(t, k)); m = Math.max(m, d); } e[k] = m; } return e; };

{ b.pose(2.8, prof, 0, 0); const a = frameAngles(landmarks(b.joints(), 1), 1), p = poseAt(2.8, prof, 0, {});
  ok(['rw', 're', 'lw', 'le', 'rh', 'rk', 'lh', 'lk'].every(k => Math.abs(a[k] - p[k]) < 6), 'one frame: joint angles read back from the landmarks within 6°'); }
for (const [dir, slow, name] of [[1, 1, 'left→right, real time'], [-1, 1, 'right→left'], [1, 4, '4× slow motion']]) {
  const c = clip(dir, slow), act = buildAction(c.frames, c.marks, base, { name: 'Rig' }), e = errs(act);
  const worst = Object.entries(e).sort((x, y) => y[1] - x[1])[0];
  ok(Object.entries(e).every(([k, v]) => v < (k === 'tx' ? 12 : 10)), `copied the rig's own action (${name}): every joint within 10° (trunk 12°) — worst ${worst[0]} ${worst[1].toFixed(1)}°`);
  ok(act.q >= 95 && act.dir === dir, `tracking quality ${act.q}%, direction of travel found`);
}
{ const m = timeMap({ bfc: 1, ffc: 1.5, rel: 1.8 });
  ok(Math.abs(m(1) - T_BFC) < 1e-9 && Math.abs(m(1.5) - T_FFC) < 1e-9 && Math.abs(m(1.8) - T_REL) < 1e-9, 'clip time is remapped so the three marks land on the app\'s back foot, front foot and release'); }
{ // a different action: arm 25° further round and a deeper front knee before release, then pinned at release
  const c = clip(1, 1); const bent = c.frames.map(f => ({ ...f }));
  const act = buildAction(bent, c.marks, base, {});
  ok(ACT_KEYS.every(k => Math.abs(actionAt(act, T_REL, k) - base(T_REL, k)) < 0.11), 'release pose pinned to the app\'s own (every joint)');
  const P = { ...prof, act }, h0 = new THREE.Vector3(), h1 = new THREE.Vector3();
  b.pose(T_REL, prof, 0, 0); b.handWorld(h0); b.pose(T_REL, P, 0, 0); b.handWorld(h1);
  ok(h0.distanceTo(h1) < 0.01, `release point unchanged by a copied action (${(h0.distanceTo(h1) * 100).toFixed(2)} cm) — lengths stay exact`);
  const spike = c.frames.map((f, i) => i === 25 ? { ...f, lm: f.lm.map((p, j) => j === 14 ? { ...p, y: p.y - 0.5 } : p) } : f);
  const a2 = buildAction(spike, c.marks, base, {}), t25 = timeMap(c.marks)(c.frames[25].t);
  ok(Math.abs(actionAt(a2, t25, 'rw') - actionAt(act, t25, 'rw')) < 5, 'a one-frame tracking glitch is smoothed out');
  const lost = c.frames.map((f, i) => i % 3 === 0 ? { ...f, lm: null } : f);
  ok(buildAction(lost, c.marks, base, {}).q < 75, 'frames with no body lower the tracking score');
  let threw = false; try { buildAction(c.frames, { bfc: 2, ffc: 1, rel: 3 }, base, {}); } catch (e) { threw = true; } ok(threw, 'marks out of order are refused');
}
{ const db = newDB(), c = clip(1, 1), a = buildAction(c.frames, c.marks, base, { name: 'Club quick', id: 'a1' }), s = buildAction(c.frames, c.marks, base, { name: 'Offie', id: 'a2', type: 'off' });
  db.actions.push(a);
  const pc = newDB(); pc.actions.push(s);
  mergeSynced(pc, JSON.parse(JSON.stringify(syncPayload(db))));
  ok(pc.actions.length === 2 && mergeActions(pc, [a]) === 0, 'My bowlers sync between phone and PC, by id, no duplicates');
  const P = actionProfiles(pc.actions);
  ok(P[0].spin === 'off' && P[0].ao === 26 && P[1].spin === undefined && P[1].id === 'act:a1' && P[1].mine, 'saved actions become bowler profiles (spinners release like the built-in spinners)');
  ok(JSON.stringify(a).length < 20000, `an action is small (${(JSON.stringify(a).length / 1024).toFixed(1)} kB of numbers, no video)`);
}
done();
