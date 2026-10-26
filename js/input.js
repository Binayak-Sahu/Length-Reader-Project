// Controller polling with accurate press times. Keyboard, mouse and touch use event.timeStamp in their handlers.
import { padStamp } from './core/timing.js';

// Standard mapping (Xbox): 0 A · 1 B · 2 X · 3 Y · 4 LB · 5 RB · 6 LT · 7 RT · 8 View · 9 Menu · 12–15 D-pad
export function createPads() {
  const prev = [], E = new Uint8Array(32);
  let connected = false;
  const list = () => { try { return navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return []; } };
  addEventListener('gamepadconnected', () => { connected = true; });
  addEventListener('gamepaddisconnected', () => { connected = Array.from(list()).some(Boolean); });
  return {
    get connected() { return connected; },
    list: () => Array.from(list()).filter(Boolean),
    // cb(E, stickUp, stickDown, pressTime, gp) is called once per controller per poll, only when something was newly pressed.
    poll(cb) {
      if (!connected) return;
      const gps = list(), now = performance.now();
      for (let k = 0; k < gps.length; k++) {
        const gp = gps[k]; if (!gp) continue;
        let p = prev[gp.index];
        if (!p) p = prev[gp.index] = { b: new Uint8Array(32), up: false, dn: false, poll: null };
        const ay = gp.axes[1] || 0, up = ay < -0.6, dn = ay > 0.6;
        let any = false;
        for (let i = 0; i < 32; i++) {
          const btn = gp.buttons[i], on = btn ? (btn.pressed ? 1 : 0) : 0;
          E[i] = on && !p.b[i] ? 1 : 0; if (E[i]) any = true; p.b[i] = on;
        }
        const su = up && !p.up, sd = dn && !p.dn; p.up = up; p.dn = dn;
        if (any || su || sd) cb(E, su, sd, padStamp(gp.timestamp, p.poll, now), gp);
        p.poll = now;
      }
    },
  };
}
