// Sound: all synthesised with WebAudio (nothing to download, works offline).
// Timing sounds (footsteps, bounce) are scheduled so they are HEARD at the right moment: we ask the audio
// device what is playing now (getOutputTimestamp) or subtract its reported latency. Android output latency can be
// 40–100 ms, so an unscheduled "thud" would arrive late and mislead the timing.
export function createAudio(settings) {
  let ctx = null, master = null, nStep = null, nThud = null, nNet = null;
  const live = [];                                     // scheduled sources (cancelled on pause)

  function noiseBuf(dur, pow) {
    const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, pow);
    return b;
  }
  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
        nStep = noiseBuf(0.07, 3); nThud = noiseBuf(0.12, 4); nNet = noiseBuf(0.35, 1.5);
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  // Audio-context time at which a sound must start to be heard at page time perfMs.
  function at(perfMs) {
    if (perfMs == null) return ctx.currentTime;
    let t;
    try {
      const ts = ctx.getOutputTimestamp && ctx.getOutputTimestamp();
      if (ts && ts.performanceTime > 0) t = ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    } catch (e) { t = undefined; }
    if (t === undefined || !isFinite(t)) t = ctx.currentTime + (perfMs - performance.now()) / 1000 - (ctx.outputLatency || 0) - (ctx.baseLatency || 0);
    return Math.max(ctx.currentTime, t);
  }
  function track(src, end) { live.push({ src, end }); src.onended = () => { const i = live.findIndex(x => x.src === src); if (i >= 0) live.splice(i, 1); }; }
  function burst(buf, freq, vol, perfMs, q) {
    if (!settings.sound || !ensure()) return;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master);
    const t = at(perfMs); s.start(t); track(s, t + buf.duration);
  }
  function tone(f1, f2, dur, type, vol, perfMs) {
    if (!settings.sound || !ensure()) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = at(perfMs);
    o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02); track(o, t + dur);
  }
  return {
    unlock: ensure,
    get latencyMs() { return ctx ? Math.round(((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000) : null; },
    step(vol, perfMs) { burst(nStep, 380, vol, perfMs); },
    thud(perfMs) { burst(nThud, 900, 0.9, perfMs); },
    net(perfMs) { burst(nNet, 1800, 0.18, perfMs, 0.7); burst(nThud, 300, 0.25, perfMs); },       // ball into the back net
    tone,
    click() { tone(900, 900, 0.03, 'sine', 0.06); },
    good() { tone(880, 1320, 0.18, 'sine', 0.22); },
    warn() { tone(620, 620, 0.22, 'triangle', 0.22); },
    bad() { tone(220, 140, 0.3, 'square', 0.1); },
    chime() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 'sine', 0.16, performance.now() + i * 90)); },
    fanfare() { [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.001, 0.2, 'triangle', 0.14, performance.now() + i * 85)); },
    cancel() { const now = ctx ? ctx.currentTime : 0; for (const x of live.slice()) if (x.end > now) { try { x.src.stop(); } catch (e) { /* already stopped */ } } live.length = 0; },
  };
}

export function createVoice(settings) {
  return {
    say(t) {
      if (!settings.voice || !window.speechSynthesis) return;
      try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.rate = 1.08; speechSynthesis.speak(u); } catch (e) { /* no voice */ }
    },
  };
}

// Haptics: phone vibration and controller rumble (both optional, both respect the Haptics setting).
export function createHaptics(settings, pads) {
  return {
    tap() { if (settings.haptics && navigator.vibrate) navigator.vibrate(12); },
    result(v) {
      if (!settings.haptics) return;
      if (navigator.vibrate) navigator.vibrate(v === 'good' ? 25 : v === 'warn' ? [20, 60, 20] : [60, 50, 60]);
      for (const gp of pads()) {
        const a = gp && gp.vibrationActuator;
        if (a && a.playEffect) { try { const r = a.playEffect('dual-rumble', { duration: v === 'bad' ? 260 : 110, strongMagnitude: v === 'bad' ? 0.9 : 0.15, weakMagnitude: 0.5 }); if (r && r.catch) r.catch(() => {}); } catch (e) { /* no rumble */ } }
      }
    },
    reward() { if (settings.haptics && navigator.vibrate) navigator.vibrate([30, 40, 30, 40, 80]); },
  };
}
