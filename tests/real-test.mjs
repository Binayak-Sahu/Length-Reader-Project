// Real bowlers (real.html) logic. Run from the repo root:  node tests/real-test.mjs
import { parseYouTubeId, parseStart, load, save, addBall, tapToRelease, cutTime, makeDeck, tagCounts, summary, nextLevel, emptyDb, KEY, SUGGESTED, fmtTime } from '../js/core/real.js';
import { makeOk, fakeStorage, mulberry32 } from './util.mjs';
const { ok, done } = makeOk('real');

// links
const ID = 'ZRsME7iKznA';
for (const s of [ID, `https://www.youtube.com/watch?v=${ID}`, `https://youtu.be/${ID}?si=abc`, `youtube.com/watch?v=${ID}&t=42s`, `https://m.youtube.com/watch?v=${ID}`,
  `https://www.youtube.com/shorts/${ID}`, `https://www.youtube-nocookie.com/embed/${ID}`, `https://www.youtube.com/live/${ID}?feature=share`])
  ok(parseYouTubeId(s) === ID, `link → id: ${s}`);
for (const s of ['', 'hello', 'https://example.com/watch?v=' + ID, 'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/@channel'])
  ok(parseYouTubeId(s) === null, `not a video: "${s}"`);
ok(parseStart(`https://youtu.be/${ID}?t=95`) === 95 && parseStart(`https://www.youtube.com/watch?v=${ID}&t=1m20s`) === 80 && parseStart(ID) === 0, 'start time from t= (seconds and 1m20s)');

// saved data
{
  const st = fakeStorage();
  const d = load(st);
  ok(d.videos.length === SUGGESTED.length && d.videos.every(v => v.balls.length === 0) && d.level === 1, 'first run: suggested videos, untagged, level 1');
  ok(load(fakeStorage({ [KEY]: '{not json' })).videos.length === SUGGESTED.length, 'broken data → fresh library, no crash');
  const bad = { videos: [{ id: ID, title: 'a', start: 12, balls: [{ t: 9, len: 'S' }, { t: 3, len: 'F' }, { t: -1, len: 'F' }, { t: 5, len: 'X' }, null] }, { id: ID, balls: [] }, { id: 'nope' }], level: 9, sessions: [{ n: 3, right: 2 }, {}] };
  const r = load(fakeStorage({ [KEY]: JSON.stringify(bad) }));
  ok(r.videos.length === 1 && r.videos[0].balls.map(b => b.t).join() === '3,9' && r.videos[0].start === 12, 'repair: bad balls, duplicate and invalid videos dropped; balls sorted; start kept');
  ok(r.level === 1 && r.sessions.length === 1, 'repair: unknown level → 1, bad sessions dropped');
  ok(save(st, r) && load(st).videos[0].balls.length === 2, 'save → load round trip');
  ok(save(fakeStorage({}, 10), r) === false, 'storage full → save reports failure, no throw');
}

// tagging
{
  const v = { id: ID, balls: [] };
  addBall(v, 12.3456, 'F'); addBall(v, 4, 'S');
  ok(v.balls.map(b => b.t).join() === '4,12.346', 'balls kept sorted, times rounded to ms');
  addBall(v, 12.6, 'G');
  ok(v.balls.length === 2 && v.balls[1].len === 'G', 'a second tap on the same ball (within 1 s) replaces it');
  ok(!addBall(v, 20, 'Z') && !addBall(v, NaN, 'F') && v.balls.length === 2, 'bad length or time rejected');
  ok(Math.abs(tapToRelease(10, 0.5) - 9.94) < 1e-9 && tapToRelease(10, 0) === 10 && tapToRelease(0.01, 1) === 0, 'tap delay taken off in video time (½× → 0.06 s), none when paused, never negative');
}

// cut points
ok(Math.abs(cutTime(10, 1) - 10.2) < 1e-9 && Math.abs(cutTime(10, 2) - 10.1) < 1e-9 && cutTime(10, 3) === 10 && Math.abs(cutTime(10, 7) - 10.2) < 1e-9, 'cut: L1 +0.20 s, L2 +0.10 s, L3 at release, unknown → L1');

// deck
{
  const vids = [{ id: 'a'.repeat(11), title: 'A', balls: Array.from({ length: 15 }, (_, i) => ({ t: i * 10, len: 'FGS'[i % 3] })) },
    { id: 'b'.repeat(11), title: 'B', balls: Array.from({ length: 15 }, (_, i) => ({ t: i * 10 + 5, len: 'S' })) },
    { id: 'c'.repeat(11), title: 'C', blocked: true, balls: [{ t: 1, len: 'F' }] }];
  const d = makeDeck(vids, 20, mulberry32(7));
  ok(d.length === 20 && new Set(d.map(b => b.id + b.t)).size === 20, 'deck: 20 different balls');
  ok(!d.some(b => b.id === 'c'.repeat(11)), 'deck: blocked videos left out');
  ok(new Set(d.map(b => b.id)).size === 2, 'deck: mixes balls from both videos');
  ok(makeDeck(vids.slice(0, 1), 20).length === 15, 'deck: fewer tagged balls than 20 → uses them all');
  const c = tagCounts(vids);
  ok(c.total === 30 && c.F === 5 && c.G === 5 && c.S === 20, 'tag counts by length (blocked not counted)');
}

// summary + level
{
  const ans = [{ len: 'S', call: 'F', ms: 400 }, { len: 'S', call: 'S', ms: 300 }, { len: 'F', call: 'F', ms: 200 }, { len: 'G', call: 'S', ms: 500 }];
  const s = summary(ans);
  ok(s.n === 4 && s.right === 2 && s.pct === 50 && s.by.S.join() === '1,2' && s.wentForwardToShort === 1 && s.medianMs === 300, 'summary: score, by length, forward-to-short count, median call time');
  const S = (n, pct) => ({ n, pct });
  ok(nextLevel(1, S(20, 85)) === 2 && nextLevel(3, S(20, 100)) === 3 && nextLevel(2, S(20, 55)) === 1 && nextLevel(1, S(20, 10)) === 1 && nextLevel(2, S(20, 70)) === 2 && nextLevel(1, S(6, 100)) === 1,
    'level: up at 85%, down below 60%, clamped 1–3, needs 10 balls');
}
ok(fmtTime(83.456) === '1:23.46' && fmtTime(5) === '0:05.00', 'time format m:ss.cc');
ok(emptyDb().videos !== emptyDb().videos, 'fresh libraries are separate objects');
done();
