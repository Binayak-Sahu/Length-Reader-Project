// Skill check (the standard test) and save backups. Run: node tests/check-test.mjs
import { checkBalls, checkReport, checkAdvice, checkHistory, checkTrend, checkDue, zOf, CHECK_N, CHECK_OCC, CHECK_KPH, CHECK_NOISE } from '../js/core/check.js';
import { buildPlan } from '../js/game/modes.js';
import { genBall } from '../js/core/bowling.js';
import { makeTraj } from '../js/core/physics.js';
import { footFor, categorize } from '../js/core/rules.js';
import { inspectRaw, makeSnapshot, shouldReplace, pruneList, restoreSnapshot, mergeOtherTab, snapKey } from '../js/core/backup.js';
import { newDB, save, load, KEY, DEF } from '../js/core/store.js';
import { streak, totalXP, progressData } from '../js/core/progress.js';
import { mulberry32, makeOk, fakeStorage } from './util.mjs';
const { ok, done } = makeOk('check');

console.log('— Skill check: the same test every time —');
const count = (xs, f) => xs.filter(f).length;
for (const seed of [1, 2, 3]) {
  const B = checkBalls(mulberry32(seed));
  const pace = B.filter(b => !b.spin), spin = B.filter(b => b.spin);
  ok(B.length === CHECK_N && pace.length === 18 && spin.length === 6, `seed ${seed}: 24 balls, 18 pace and 6 spin`);
  ok(count(pace, b => b.cat === 'Full') === 8 && count(pace, b => b.cat === 'Short') === 8 && count(pace, b => b.cat === 'Good') === 2
    && count(spin, b => b.cat === 'Full') === 3 && count(spin, b => b.cat === 'Short') === 3, `seed ${seed}: the same lengths every time (pace 8 full, 8 short, 2 good · spin 3 full, 3 short)`);
  ok(count(B, b => b.cat === 'Full' && b.occ === CHECK_OCC) === 5 && count(B, b => b.cat === 'Short' && b.occ === CHECK_OCC) === 5 && B.every(b => b.occ === null || b.occ === CHECK_OCC),
    `seed ${seed}: full and short are blacked out equally often (5 each at +160 ms)`);
  let run = 1, worst = 1; for (let i = 1; i < B.length; i++) { run = B[i].cat === B[i - 1].cat ? run + 1 : 1; worst = Math.max(worst, run); }
  ok(worst <= 3, `seed ${seed}: never more than 3 of one length in a row (longest run ${worst})`);
}
ok(JSON.stringify(checkBalls(mulberry32(7))) !== JSON.stringify(checkBalls(mulberry32(8))), 'the order changes from test to test, so it cannot be memorised');
{
  const p = buildPlan('check', { S: DEF, rng: mulberry32(5) }), s = p.segs[0];
  ok(p.segs.length === 1 && s.n === CHECK_N && s.test && s.fb === 'end' && !s.adapt && s.weakP === 0 && s.fixed.m === 1 && s.fixed.k === CHECK_KPH && s.balls.length === CHECK_N && !s.walk && !s.xpCtx,
    'plan: 24 planned balls, feet only at 110 kph, no feedback, level fixed, no weak-spot feeding, no XP bonus');
  // every planned ball really is what the plan says once it goes through the bowling + physics + grading used in play
  const rng = mulberry32(11), p0 = { x: -0.57, y: 2.16, z: 17.6 }, ps = { x: -0.4, y: 2.05, z: 17.9 };
  let bad = 0, lines = 0;
  for (let rep = 0; rep < 20; rep++) for (const pb of s.balls) {
    const g = genBall(DEF, { kph: CHECK_KPH, mode: 1, spin: pb.spin, hand: 'R', club: true, force: { cat: pb.cat, line: 'stumps' } }, rng);
    const tr = makeTraj(pb.spin ? ps : p0, g.kph, g.d, g.lx, g.opt), fe = footFor(tr), want = pb.cat === 'Full' ? 'F' : pb.cat === 'Short' ? 'B' : 'FB';
    if (fe !== want) bad++;
    const c = categorize(tr);
    if (Math.abs(g.lx) > 0.111 || c === 'Wide off' || c === 'Bouncer' || c === 'Full toss') lines++;
  }
  ok(bad === 0, `480 planned balls through the real bowling and physics: every "full" needs the front foot, every "short" the back (${bad} off)`);
  ok(lines === 0, `all on the stumps: no wides, bouncers or full tosses in a test (${lines} strays)`);
}

console.log('— Skill check: the report —');
const mk = (fe, foot, o = {}) => ({ fe, foot, fv: foot === fe ? 'good' : 'bad', v: foot === fe ? 'good' : 'bad', sc: foot === fe ? 1 : 0, ok: foot === fe && !o.guess && !o.late, rt: 0.4, tbP: 0.6, occ: null, kph: 110, spin: false, ...o });
const either = (foot, occ) => ({ fe: 'FB', foot, fv: 'good', v: 'good', sc: 1, ok: true, rt: 0.4, tbP: 0.6, occ, kph: 110, spin: false });
const test = (f) => { const out = []; for (let i = 0; i < 11; i++) { out.push(f('F', i)); out.push(f('B', i)); } out.push(either('F', null), either('B', 0.16)); return out; };
{
  const r = checkReport(test((fe) => mk(fe, fe)));
  ok(r.complete && r.score === 100 && r.short === 100 && r.full === 100 && r.lean === null && r.tell >= 95, `a perfect test: 100%, tells short from full ${r.tell}/100, no lean`);
  ok(Math.abs(r.early - 0.2) < 1e-9, 'reports how long before the bounce the feet were decided (median)');
  ok(/Strong/.test(checkAdvice(r)), 'advice for a strong test is one short line');
}
{
  const r = checkReport(test((fe) => mk(fe, 'F')));           // always forward
  ok(r.score === 54 && r.short === 0 && r.full === 100 && r.lean === 'front' && r.tell <= 5 && r.fwdShort === 11, `always forward: ${r.score}%, cannot tell them apart (${r.tell}/100), lean = front`);
  ok(/forward to 11 short/.test(checkAdvice(r)), 'advice names the one fault: forward to short balls');
  const b = checkReport(test((fe) => mk(fe, 'B')));
  ok(b.lean === 'back' && b.tell <= 5 && /went back to 11/.test(checkAdvice(b)), 'always back: lean = back, and the advice says get forward');
}
{
  const rng = mulberry32(3), r = checkReport(test((fe) => mk(fe, rng() < 0.5 ? 'F' : 'B')));
  ok(r.tell <= 35 && r.score < 75, `coin-flip feet score low on both numbers (${r.score}%, tell ${r.tell}/100)`);
}
{
  const r = checkReport(test((fe, i) => mk(fe, fe, i < 4 ? { guess: true, fv: 'warn', v: 'warn', sc: 0.5 } : {})));
  ok(r.score === 67 && r.tell >= 95 && r.guess === 8, `right feet pressed too quickly are not reads: score ${r.score}% although the feet were right`);
  ok(/too quick/.test(checkAdvice(r)), 'advice: too quick to be a read');
}
{
  const r = checkReport(test((fe, i) => mk(fe, i < 2 ? null : fe)));
  ok(r.froze === 4 && /move on 4/.test(checkAdvice(r)), 'frozen feet are counted and called out');
  const part = checkReport(test((fe) => mk(fe, fe)).slice(0, 10));
  ok(!part.complete && part.n === 10, 'a test stopped early is marked incomplete');
}
ok(Math.abs(zOf(0.975) - 1.96) < 0.001 && Math.abs(zOf(0.5)) < 1e-9 && Math.abs(zOf(0.1) + 1.2816) < 0.001, 'normal quantiles are right (d-prime maths)');
{
  const S = (date, score, complete = true) => ({ date, kind: 'check', n: complete ? 24 : 9, check: { score, complete } });
  const ss = [S('2026-11-01T10:00:00Z', 62), { date: '2026-11-02T10:00:00Z', kind: 'daily', n: 34 }, S('2026-11-08T10:00:00Z', 50, false), S('2026-11-09T10:00:00Z', 67), S('2026-11-16T10:00:00Z', 79)];
  const h = checkHistory(ss);
  ok(h.length === 3 && h[0].score === 62 && h[2].score === 79, 'history keeps complete tests only (one stopped early is left out)');
  const t = checkTrend(h);
  ok(t.state === 'up' && t.delta === 17 && t.best === 79, 'three tests, +17 since the first: real improvement');
  ok(checkTrend(h.slice(0, 2)).state === 'flat' && CHECK_NOISE === 10, '+5 between two 24-ball tests is called "about the same", not progress (within the noise)');
  ok(checkTrend([]).state === 'none' && checkTrend(h.slice(0, 1)).state === 'first', 'no test yet / first test handled');
  ok(checkDue(ss, Date.parse('2026-11-20T10:00:00Z')).due === false && checkDue(ss, Date.parse('2026-11-23T10:00:00Z')).due === true, 'due again a week after the last test');
  ok(checkDue([], 0).due === false && checkDue([{ date: 'x', kind: 'daily' }], 0).due === true, 'first test is offered after the first real session, not before');
}
{
  const db = newDB(), balls = test((fe) => mk(fe, fe)).map(b => ({ ...b, xp: 0, mode: 1, cat: b.fe === 'B' ? 'Short' : 'Full' }));
  db.sessions.push({ date: new Date().toISOString(), kind: 'check', n: 24, score: 100, balls, xp: 0, check: checkReport(balls) });
  ok(totalXP(db) === 0, 'a Skill check earns no XP (nothing to farm)');
  ok(streak(db) === 1, 'it still counts as a practice day (24 real balls)');
  ok(progressData(db).length === 0, 'and it stays out of the day-by-day training table (it has its own card)');
}

console.log('— backups: a save is never lost —');
ok(inspectRaw(null) === 'empty' && inspectRaw('') === 'empty' && inspectRaw('{"v":5}') === 'ok' && inspectRaw('{"v":5,"sess') === 'damaged' && inspectRaw('null') === 'damaged' && inspectRaw('[1]') === 'damaged' && inspectRaw('7') === 'damaged',
  'tells an empty slot, a good save and a damaged one apart');
const sess = (d, n = 30) => ({ date: d, kind: 'quick', n, score: 80, xp: 100, balls: [] });
{
  const db = newDB(); ok(makeSnapshot(db) === null, 'nothing to back up before the first session');
  db.sessions.push(sess('2026-11-10T10:00:00.000Z'), sess('2026-11-11T10:00:00.000Z'));
  const now = new Date(2026, 10, 12, 9, 0), s = makeSnapshot(db, now);
  ok(s.k === 'day-2026-11-12' && s.k === snapKey(now) && s.n === 2 && s.balls === 60 && JSON.parse(s.text).sessions.length === 2, 'snapshot: one per day, with the whole save inside');
  ok(shouldReplace(null, s) && shouldReplace({ n: 2 }, s) && shouldReplace({ n: 1 }, s) && !shouldReplace({ n: 3 }, s), 'a snapshot with fewer sessions never replaces a fuller one from the same day');
  const keys = ['day-2026-11-01', 'day-2026-11-03', 'damaged-2026-11-02T00:00:00.000Z', ...Array.from({ length: 7 }, (_, i) => 'day-2026-11-' + String(5 + i).padStart(2, '0'))];
  ok(JSON.stringify(pruneList(keys)) === JSON.stringify(['day-2026-11-01', 'day-2026-11-03']), 'keeps the newest 7 days, drops older ones, never touches a kept damaged save');
}
{
  // the save got damaged: the app starts fresh, plays one session, then the backup comes back
  const old = newDB(); old.profile.hand = 'L'; old.profile.onboarded = true; old.level = 9; old.rtBase = 0.24; old.settings.maxKph = 110; old.badges.first = '2026-11-01';
  old.sessions.push(sess('2026-11-10T10:00:00.000Z'), sess('2026-11-11T10:00:00.000Z')); old.actions.push({ id: 'a1', keys: [1], name: 'Jimmy', created: '2026-11-01' });
  const snap = makeSnapshot(old).text;
  const st = fakeStorage({ [KEY]: snap.slice(0, snap.length - 40) });        // truncated JSON
  ok(inspectRaw(st.getItem(KEY)) === 'damaged', 'a truncated save is spotted as damaged');
  const boot = load(st); boot.db.sessions.push(sess('2026-11-12T10:00:00.000Z'));
  const r = restoreSnapshot(boot.db, snap, true);
  ok(r.full && boot.db.sessions.length === 3 && boot.db.level === 9 && boot.db.profile.hand === 'L' && boot.db.rtBase === 0.24 && boot.db.settings.maxKph === 110 && boot.db.badges.first && boot.db.actions.length === 1,
    'full restore: sessions, level, hand, reaction time, settings, badges and bowlers all come back, and the session played since is kept');
  ok(save(st, boot.db) && inspectRaw(st.getItem(KEY)) === 'ok' && load(st).db.sessions.length === 3, 'and the repaired save reads back');
}
{
  // a restore on a healthy save only adds what is missing
  const cur = newDB(); cur.level = 12; cur.settings.maxKph = 130; cur.sessions.push(sess('2026-11-11T10:00:00.000Z'), sess('2026-11-12T10:00:00.000Z'));
  const old = newDB(); old.level = 5; old.sessions.push(sess('2026-11-09T10:00:00.000Z'), sess('2026-11-11T10:00:00.000Z')); old.badges.first = '2026-11-01'; old.bosses.metro = 85;
  const r = restoreSnapshot(cur, JSON.stringify(old), false);
  ok(!r.full && r.added === 1 && cur.sessions.length === 3 && cur.level === 12 && cur.settings.maxKph === 130 && cur.badges.first && cur.bosses.metro === 85,
    'merge restore: adds the 1 missing session, badge and boss best; keeps the current level and settings; removes nothing');
  ok(cur.sessions.map(s => s.date).join() === [...cur.sessions.map(s => s.date)].sort().join(), 'sessions stay in date order');
  let threw = false; try { restoreSnapshot(cur, '{"oops', false); } catch (e) { threw = true; }
  ok(threw && cur.sessions.length === 3, 'an unreadable backup is refused and changes nothing');
}
{
  const a = newDB(); a.sessions.push(sess('2026-11-12T09:00:00.000Z'));
  const b = newDB(); b.sessions.push(sess('2026-11-12T09:00:00.000Z'), sess('2026-11-12T09:30:00.000Z')); b.actions.push({ id: 'z', keys: [1], created: '1' });
  const r = mergeOtherTab(a, JSON.stringify(b));
  ok(r.sessions === 1 && r.actions === 1 && a.sessions.length === 2, 'two tabs open: a session saved by the other tab is picked up, not overwritten');
  ok(mergeOtherTab(a, 'garbage').sessions === 0 && a.sessions.length === 2, 'garbage from another tab is ignored');
}
done();
