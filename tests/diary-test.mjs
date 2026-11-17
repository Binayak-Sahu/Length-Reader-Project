// Real nets diary (v6.2): entries, merging (sync, import, backups, other tabs) and the carry-over summary.
import { makeEntry, addEntry, deleteEntry, mergeDiary, liveEntries, diaryCarry, validEntry, netScore, DIARY_MAX } from '../js/core/diary.js';
import { newDB, normalize, save, load, importData, exportData } from '../js/core/store.js';
import { syncPayload, mergeSynced } from '../js/core/sync.js';
import { makeSnapshot, restoreSnapshot, mergeOtherTab } from '../js/core/backup.js';
import { mulberry32, makeOk, fakeStorage } from './util.mjs';
const { ok, done } = makeOk('diary');
const rng = mulberry32(7), day = (n) => new Date(Date.UTC(2026, 10, 1 + n, 12));
const E = (n, r, s, l) => makeEntry({ read: r, short: s, leave: l }, day(n), rng);

// entries
const e1 = E(0, 1, 0, 2);
ok(validEntry(e1) && e1.id.startsWith('2026-11-01-') && netScore(e1) === 50, 'an entry has an id from its day, three 0–2 answers and a 0–100 score');
ok(!validEntry({ id: 'x', date: day(0).toISOString(), read: 3, short: 0, leave: 0 }) && !validEntry({ id: 'x', date: 'nope', read: 0, short: 0, leave: 0 }) && !validEntry(null), 'bad entries are refused');

// old saves get an empty diary; bad entries are dropped on load
const old = normalize({ v: 5, sessions: [] });
ok(Array.isArray(old.diary) && old.diary.length === 0, 'a save from before v6.2 loads with an empty diary');
ok(normalize({ diary: [e1, { id: 'bad' }, 5] }).diary.length === 1, 'normalize keeps only valid diary entries');

// add, delete (tombstone), save/load round trip
let db = newDB(); addEntry(db, E(2, 2, 2, 2)); addEntry(db, e1);
ok(db.diary.map(e => e.date).join() === [day(0), day(2)].map(d => d.toISOString()).join(), 'entries are kept in date order');
const st = fakeStorage(); save(st, db); const back = load(st).db;
ok(back.diary.length === 2 && back.diary[0].id === e1.id, 'the diary survives save and load');
ok(deleteEntry(db, e1.id) && liveEntries(db.diary).length === 1 && db.diary.length === 2 && db.diary.find(e => e.id === e1.id).del === true, 'remove keeps a tombstone, so sync cannot bring it back');
ok(!deleteEntry(db, e1.id) && !deleteEntry(db, 'nope'), 'removing twice or an unknown id does nothing');

// sync: both ways, deletions win over the old copy, nothing lost
const pc = newDB(), phone = newDB();
const a = E(3, 1, 1, 1), b = E(4, 2, 1, 0); addEntry(pc, a); addEntry(phone, b);
const r1 = mergeSynced(pc, syncPayload(phone)); mergeSynced(phone, syncPayload(pc));
ok(r1.diary === 1 && liveEntries(pc.diary).length === 2 && liveEntries(phone.diary).length === 2, 'sync: each device gets the other’s nets');
deleteEntry(phone, a.id); mergeSynced(pc, syncPayload(phone));
ok(liveEntries(pc.diary).length === 1 && liveEntries(pc.diary)[0].id === b.id, 'sync: a net removed on one device is removed on the other');
const stale = JSON.parse(JSON.stringify(syncPayload(newDB()))); stale.data.diary = [a];      // an old copy still has it
ok(mergeSynced(pc, stale).diary === 0 && liveEntries(pc.diary).length === 1, 'sync: an older copy cannot bring a removed net back');
ok(mergeSynced(pc, syncPayload(pc)).diary === 0, 'sync with itself changes nothing');

// import (v5 export), backups, other tabs
const imp = newDB(); importData(imp, JSON.parse(JSON.stringify(exportData(pc))), 'test');
ok(imp.diary.length === pc.diary.length && liveEntries(imp.diary).length === 1, 'import of a v5 export brings the diary (and its removals)');
const snapDb = newDB(); addEntry(snapDb, E(5, 0, 0, 0));
const snapText = makeSnapshot(snapDb, day(6)).text;
const live1 = newDB(); addEntry(live1, E(6, 2, 2, 2)); restoreSnapshot(live1, snapText, false);
ok(liveEntries(live1.diary).length === 2, 'restoring a backup adds its nets and keeps the ones made since');
const live2 = newDB(); addEntry(live2, E(7, 1, 1, 1)); restoreSnapshot(live2, snapText, true);
ok(liveEntries(live2.diary).length === 2, 'a full restore also keeps the nets added on this device');
const tab = newDB(); addEntry(tab, E(8, 1, 2, 1)); const mine = newDB();
const rt = mergeOtherTab(mine, JSON.stringify(tab));
ok(rt.diary === 1 && liveEntries(mine.diary).length === 1, 'another tab’s new net is merged in');

// cap
const big = newDB(); for (let i = 0; i < DIARY_MAX + 5; i++) addEntry(big, E(i % 300, 1, 1, 1));
ok(big.diary.length === DIARY_MAX, `the diary keeps the newest ${DIARY_MAX} entries`);

// carry-over summary
ok(diaryCarry([]).state === 'none' && diaryCarry([e1]).state === 'few' && diaryCarry([e1, E(1, 1, 1, 1)]).state === 'few', 'under 3 nets: no trend is claimed');
const up = [E(0, 0, 0, 1), E(1, 1, 0, 1), E(2, 1, 1, 1), E(3, 2, 2, 1)];
const C = diaryCarry(up, [{ date: day(-1).toISOString(), score: 60 }, { date: day(2).toISOString(), score: 75 }]);
ok(C.state === 'up' && C.first < C.last && C.parts.short > 0 && C.parts.leave === 0, 'feeling better on short balls shows as up, with short balls the part that moved');
ok(C.rows[0].check === 60 && C.rows[3].check === 75 && C.rows[1].check === 60, 'each net is paired with the latest Skill check from the 14 days before it');
ok(diaryCarry([E(0, 1, 1, 1), E(1, 1, 1, 1), E(2, 1, 1, 2)]).state === 'same', 'one small step is called about the same');
ok(diaryCarry([E(0, 2, 2, 2), E(1, 2, 2, 2), E(2, 0, 0, 1), E(3, 0, 1, 0)]).state === 'down', 'feeling worse shows as down');
const del = [E(0, 0, 0, 0), E(1, 2, 2, 2), E(2, 2, 2, 2)]; const dd = { diary: del.slice() }; deleteEntry(dd, del[0].id);
ok(diaryCarry(dd.diary).state === 'few', 'removed nets are left out of the summary');
done();
