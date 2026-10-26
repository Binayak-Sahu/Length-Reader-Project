// In-session DOM: HUD chips, tap zones, the big call flash, the result card, timing bar and pitch map.
// Kept light: nothing here runs per frame except text changes when a value actually changes.
import { app, $, show, VCOL, MARK, BADGE, esc } from '../app.js';
import { zones, bandsFor } from '../core/physics.js';
import { targetFor, SHOTS } from '../core/rules.js';

const hudCache = {};
function setHTML(id, html) { if (hudCache[id] !== html) { hudCache[id] = html; $(id).innerHTML = html; } }
export function hud(parts) { for (const k in parts) setHTML(k, parts[k]); }
export function hudVisible(id, on) { $(id).classList.toggle('hidden', !on); }

export function flash(txt, cls) {
  const f = $('flash'); f.textContent = txt; f.className = ''; void f.offsetWidth; f.className = 'show ' + cls;
}
// Big verdict mark for faded feedback (shape + colour, readable from 3 m).
export function bigMark(v) {
  const m = $('bigmark'); m.innerHTML = BADGE[v]; m.className = ''; void m.offsetWidth; m.className = 'show';
}

// Speed gun: the release speed, shown after the ball (like the radar board at nets). Not a length cue.
let speedTm = 0;
export function speedGun(kph) {
  const el = $('speed'); el.querySelector('b').textContent = kph + ' kph'; show(el, true);
  clearTimeout(speedTm); speedTm = setTimeout(() => show(el, false), 3000);
}

export function setZones(mode, S) {
  const z = $('zones'); z.classList.toggle('six', mode === 4);
  const trig = S.trigger ? '1ST TAP BEFORE RELEASE = TRIGGER<br>' : '';
  z.innerHTML = mode === 4
    ? `<div>${trig}FLICK</div><div>FRONT DEFENCE</div><div>DRIVE</div><div>PULL</div><div>BACK DEFENCE</div><div>PUNCH<br>NO TAP = LEAVE</div>`
    : `<div>${trig}TAP TOP = FRONT</div><div>TAP BOTTOM = BACK${mode >= 2 ? '<br>THEN TAP AGAIN = PLAY · NO TAP = LEAVE' : ''}</div>`;
  $('hint').innerHTML = (S.trigger ? 'SPACE TRIGGER &nbsp;·&nbsp; ' : '') + (mode === 4 ? 'Q FLICK · W DEFEND · E DRIVE &nbsp;/&nbsp; A PULL · S DEFEND · D PUNCH'
    : '← FRONT / → BACK' + (mode >= 2 ? ' &nbsp;·&nbsp; ↓ PLAY' : '')) + ' &nbsp;&nbsp;|&nbsp;&nbsp; P PAUSE';
}

export function barHTML(tr, rt, v, tbP, rtBase, guessAt) {
  const T = tr.ta, pc = x => Math.max(0, Math.min(100, 100 * x / T)).toFixed(1), tg = targetFor(tr.kph), base = rtBase || 0, tb = tbP != null ? tbP : tr.tb;
  return `<div class="bb"><div class="bbT">${base ? `<i class="bbBase" style="width:${pc(guessAt || base)}%" title="too quick to be a read"></i>` : ''}<i class="bbTgt" style="left:${pc(tg)}%"></i><i class="bbBnc" style="left:${pc(tb)}%"></i>${rt != null ? `<i class="bbYou ${v}" style="left:${pc(Math.max(0, rt))}%"></i>` : ''}</div>
  <div class="bbL"><span>You <b>${rt != null ? Math.max(0, rt).toFixed(2) + ' s' : '—'}</b></span><span class="g">Target ${tg.toFixed(2)}</span><span>Bounce ${tb.toFixed(2)}</span>${base && rt != null ? `<span>Reading <b>${Math.max(0, rt - base).toFixed(2)} s</b></span>` : ''}</div></div>`;
}

export function showCard(o) {
  $('badge').innerHTML = BADGE[o.g.v];
  const vd = $('verdict'); vd.textContent = o.g.v === 'good' ? 'RIGHT' : o.g.v === 'warn' ? 'CLOSE' : 'WRONG'; vd.className = 'v-' + o.g.v;
  const tr = o.tr, rec = o.rec;
  $('rLen').textContent = `${rec.cat.toUpperCase()} · ${tr.d.toFixed(1)} m · ${rec.kph} kph` + (tr.varn ? ` · ${tr.varn}` : '');
  if (o.mode === 4) {
    $('rCorrect').innerHTML = `${MARK[o.g.v]} SHOT: ${o.shot ? SHOTS[o.shot].n : 'Leave'}${o.shot && o.rt != null ? ' · ' + Math.max(0, o.rt).toFixed(2) + ' s' : ''} — ${esc(o.g.fmsg)}`;
    $('rYou').innerHTML = o.g.v !== 'good' ? `Best: <b>${o.g.best.map(x => SHOTS[x].n).join(' or ')}</b>` : '';
  } else {
    $('rCorrect').innerHTML = `${MARK[o.g.fv]} FEET: ${o.foot ? (o.foot === 'F' ? 'FRONT' : 'BACK') + (o.rt != null ? ' · ' + Math.max(0, o.rt).toFixed(2) + ' s' : '') : 'none'} — ${esc(o.g.fmsg)}`;
    $('rYou').innerHTML = o.g.pv ? `${MARK[o.g.pv]} ${o.played ? 'PLAYED' : 'LEFT IT'} — ${esc(o.g.pmsg)}` : '';
  }
  $('rBar').innerHTML = barHTML(tr, o.foot ? o.rt : null, o.g.fv, o.tbP, o.rtBase, o.guessAt);
  $('rMsg').innerHTML = (o.g.tg ? `${MARK[o.g.tg.v]} ${esc(o.g.tg.msg)}` : '') + (o.fed ? `<div class="sub">Fed to your weak spot: ${esc(o.fed)}</div>` : '')
    + (o.xp ? `<div class="xpline">+${o.xp} XP</div>` : '');
  const rl = $('rLevel');
  if (o.oc) { rl.textContent = o.oc.txt + `  ·  ${o.score}`; rl.style.color = o.oc.out ? 'var(--bad)' : (o.oc.r >= 4 ? 'var(--good)' : 'var(--text)'); rl.classList.add('big'); }
  else { rl.textContent = o.lvlMsg || ''; rl.style.color = o.lvlMsg && o.lvlMsg.startsWith('LEVEL UP') ? 'var(--good)' : 'var(--warn)'; rl.classList.remove('big'); }
  show('card', true);
  drawMap($('map'), o.balls, o.balls.length - 1, o.hand);
  const live = $('live'); if (live) live.textContent = vd.textContent + '. ' + $('rCorrect').textContent;
}

// Pitch map: where every ball pitched, coloured (and sized) by the verdict; zones for this ball's pace.
export function drawMap(cv, list, hi, hand) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
  cv.width = W * dpr; cv.height = H * dpr; const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const DMAX = 14, top = 10, bot = H - 26, pw = W * 0.6, x0 = (W - pw) / 2, mir = hand === 'L' ? -1 : 1;
  const yOf = d => bot - (Math.max(0, Math.min(d, DMAX)) / DMAX) * (bot - top), xOf = lx => W / 2 + mir * (lx / 1.525) * (pw / 2);
  c.fillStyle = '#0b1016'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#3b3327'; c.fillRect(x0, top, pw, bot - top);
  const fs = Math.max(10, Math.min(15, W * 0.06)), font = 'system-ui, sans-serif';
  const pace = list.filter(x => !x.spin).map(x => x.kph).sort((a, b) => a - b);
  const ref = hi != null && list[hi] ? list[hi] : null, pk = ref ? ref.kph : (pace[pace.length >> 1] || 100), psp = ref ? !!ref.spin : false;
  const ZB = bandsFor(pk, psp), [ZF, ZK] = zones(pk, psp);
  ZB.forEach(b => { const y1 = yOf(b.b), y0 = yOf(b.a); c.fillStyle = b.c + '66'; c.fillRect(x0, y1, pw, y0 - y1);
    c.fillStyle = 'rgba(255,255,255,.8)'; c.font = `700 ${fs}px ${font}`; c.textAlign = 'left'; c.fillText(b.n.toUpperCase(), x0 + 5, y1 + (y0 - y1) / 2 + fs / 3); });
  c.setLineDash([6, 5]); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.5;
  [ZF, ZK].forEach(d => { c.beginPath(); c.moveTo(x0, yOf(d)); c.lineTo(x0 + pw, yOf(d)); c.stroke(); });
  c.setLineDash([]); c.textAlign = 'right'; c.font = `600 ${fs * 0.85}px ${font}`; c.fillStyle = 'rgba(255,255,255,.75)';
  c.fillText('▼ FRONT', x0 + pw - 4, yOf(ZF) + fs); c.fillText('BACK ▲', x0 + pw - 4, yOf(ZK) - 5);
  c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, yOf(1.22)); c.lineTo(x0 + pw, yOf(1.22)); c.stroke();
  c.fillStyle = '#f0ebdc'; [-0.11, 0, 0.11].forEach(lx => c.fillRect(xOf(lx) - 2, yOf(0) - 3, 4, 8));
  c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.55)'; c.font = `600 ${fs * 0.8}px ${font}`;
  if (mir > 0) { c.fillText('OFF →', x0 + pw - 18, H - 8); c.fillText('← LEG', x0 + 18, H - 8); }
  else { c.fillText('LEG →', x0 + pw - 18, H - 8); c.fillText('← OFF', x0 + 18, H - 8); }
  const dot = (b, r, a) => { const x = xOf(b.lxB), y = yOf(b.d); c.globalAlpha = a; c.fillStyle = VCOL[b.v]; c.beginPath();
    if (b.v === 'good') c.arc(x, y, r, 0, 7);
    else if (b.v === 'warn') { c.moveTo(x, y - r * 1.2); c.lineTo(x + r * 1.1, y + r * 0.8); c.lineTo(x - r * 1.1, y + r * 0.8); c.closePath(); }
    else c.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
    c.fill(); return [x, y]; };
  list.forEach((b, i) => { if (i !== hi) dot(b, 4, 0.6); });
  c.globalAlpha = 1;
  if (hi != null && list[hi]) { dot(list[hi], 9, 1); const b = list[hi], x = xOf(b.lxB), y = yOf(b.d); c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, 11, 0, 7); c.stroke(); }
  c.globalAlpha = 1;
}
