// "My bowlers": actions copied from clips (core/clipaction.js) turned into bowler profiles the game can use. Pure.
const KIT = [0x0f766e, 0x9a3412, 0x1e3a8a, 0x6b21a8, 0x854d0e, 0x334155];
// Release arm angles of the built-in spinners (core/bowling.js BOWLERS), so a copied spinner releases from the same place.
const AO = { off: 26, leg: 24 };

export function actionProfiles(actions) {
  return (actions || []).filter(a => a && a.keys && a.id).map((a, i) => {
    const spin = a.type === 'off' || a.type === 'leg' ? a.type : undefined;
    return { id: 'act:' + a.id, n: a.name || 'My bowler', s: spin ? 1.0 : 1.03, xo: spin ? 0.05 : 0, c: KIT[i % KIT.length], tw: spin ? 0.5 : 1, ao: spin ? AO[spin] : 0, spin, act: a, mine: true };
  });
}

// Union by id (sync, import): never loses an action; a renamed copy keeps the newer name.
export function mergeActions(db, list) {
  db.actions = db.actions || []; let added = 0;
  for (const a of list || []) {
    if (!a || !a.id || !a.keys) continue;
    const i = db.actions.findIndex(x => x.id === a.id);
    if (i < 0) { db.actions.push(a); added++; }
    else if ((a.renamed || a.created) > (db.actions[i].renamed || db.actions[i].created)) db.actions[i] = a;
  }
  return added;
}
