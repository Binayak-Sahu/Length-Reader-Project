// Core maths test for length-reader.html — no dependencies.
// Run from the repo root:  node tests/core-test.mjs
// It pulls the code between "// @core-start" and "// @core-end" out of the HTML and checks the physics and grading.
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../length-reader.html', import.meta.url), 'utf8');
const js = html.split('<script>')[1].split('</script>')[0];
const core = js.split('// @core-start')[1].split('// @core-end')[0].split('\n').slice(1).join('\n');
const api = new Function(core + '\nreturn {makeTraj,zones,categorize,footFor,grade,gradeShot,idealShots,genBall,outcome,Z_STUMPS};')();
const {makeTraj,zones,categorize,footFor,grade,gradeShot,idealShots,genBall,Z_STUMPS} = api;
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const p0 = {x:-0.57, y:2.16, z:17.6}, ps = {x:-0.4, y:2.05, z:17.9};
const pitch = tr => tr.pos(tr.tb).z - Z_STUMPS;

// 1. ball pitches where asked, finishes on the asked line, even with swing/seam/spin
for (const [k,d,lx,o] of [[80,5,0,{}],[120,8,0,{}],[110,5,0.05,{swing:-3}],[110,5,0.05,{swing:3}],[110,8,0,{seam:0.6}],
                          [80,4.5,0,{spin:true,ev:.58,eh:.8,drift:.3,seam:1.5}],[100,-1.5,0,{}]]) {
  const tr = makeTraj(k===80&&o.spin?ps:p0, k, d, lx, o);
  ok(Math.abs(pitch(tr)-d) < 0.06, `pitches at ${d} m (${k} kph ${JSON.stringify(o)}) → ${pitch(tr).toFixed(2)}`);
  ok(Math.abs(tr.lxArr-lx) < 0.01, `  line at stumps ${lx} → ${tr.lxArr.toFixed(3)}`);
}
// 2. air drag: arrives ~15–18% slower than release
{ const tr = makeTraj(p0,120,5,0), a=tr.pos(tr.ta), b=tr.pos(tr.ta-0.01);
  const v = Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)/0.01*3.6; ok(v>95 && v<106, `120 kph arrives at ${v.toFixed(0)} kph`); }
// 3. pace-based zones
ok(JSON.stringify(zones(80,false).map(x=>+x.toFixed(2)))==='[4.8,6.3]', 'zones 80 kph = 4.8 / 6.3');
ok(JSON.stringify(zones(140,false).map(x=>+x.toFixed(2)))==='[6,8]', 'zones 140 kph = 6.0 / 8.0');
ok(JSON.stringify(zones(80,true))==='[4.8,6]', 'zones spin = 4.8 / 6.0');
// 4. foot decisions
{ const t=makeTraj(p0,80,8,0); ok(footFor(t)==='B' && grade(t,'F',0.1,false,1).fv==='bad', '80 kph, 8 m → back; forward is wrong'); }
{ const t=makeTraj(p0,120,4.5,0); ok(footFor(t)==='F', '120 kph, 4.5 m → front'); }
{ const t=makeTraj(p0,100,6,0); ok(footFor(t)==='FB', '100 kph, 6 m → either'); }
// 5. play/leave
{ const t=makeTraj(p0,110,5,0); ok(grade(t,'F',0.1,false,2).pv==='bad', 'leaving a ball hitting the stumps is wrong'); }
{ const t=makeTraj(p0,110,8,0.5); ok(grade(t,'B',0.1,true,2).pv==='bad' && grade(t,'B',0.1,false,2).v==='good', 'wide one: leave right, play wrong'); }
// 6. shot choice
{ const t=makeTraj(p0,110,3,0); ok(idealShots(t).best[0]==='SD', 'half-volley → straight drive'); }
{ const t=makeTraj(p0,120,10.2,0); ok(idealShots(t).best[0]==='PU', 'waist-high short → pull'); }
{ const t=makeTraj(p0,120,12.5,0); ok(categorize(t)==='Bouncer' && idealShots(t).best[0]==='LV', 'bouncer → leave'); }
// 7. full tosses never above waist (≈1.0 m)
{ const S={widePct:22,bouncerPct:8}; let mx=0;
  for (const c of [{kph:80,mode:2,club:true},{kph:120,mode:2,club:true}]) for (let i=0;i<1500;i++){ const g=genBall(S,c); if(g.cat!=='Full toss') continue;
    mx=Math.max(mx, makeTraj(p0,g.kph,g.d,g.lx,g.opt).yC); }
  ok(mx<1.0, `max full-toss height ${mx.toFixed(2)} m`); }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails?1:0);
