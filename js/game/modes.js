import { checkBalls, CHECK_KPH, CHECK_N } from '../core/check.js';

// Every mode is a plan: one or more segments with their own rules. The runner (game.js) just follows the plan.
//   n        balls in the segment (Infinity = endless)
//   adapt    the 85% staircase moves your level during this segment
//   levelDelta  bowl this many steps easier/harder than your level (warm-up = −1)
//   fb       'auto' (fades with mastery; Settings can force 'always' or 'end') · 'full' · 'end' (nets rules: no verdicts)
//   walk     nets realism: the bowler walks back, real gap between balls, bowlers take turns
//   drill    'short' | 'spin' | null      weakP  smart feeding: chance of bowling your weakest length
//   xpCtx    XP multiplier context ('nets', 'pressure', 'trial', 'boss')
//   fixed    {m, k, o} a fixed level spec (trials, bosses) instead of your level
//   boss     boss bowler (profile + trademark ball)
//   spell    selection sim: 'pace' | 'spin' | 'mixed' (who bowls the segment)
//   sandbox  the player picks every ball (settings.sandbox); never moves the level, earns no XP
//   test     a standard test (Skill check): no XP, no smart-feeding stats, no length bands, trigger not scored
//   balls    per-ball plan for a test ([{cat, occ, spin}]); the same bowlers every time
//   script   fixed balls for the tutorial ([{cat, d, lx}])      coach  a banner before each ball      labels  keep tap-zone labels on
export function seg(o) {
  return Object.assign({ n: 50, name: '', adapt: true, levelDelta: 0, fb: 'auto', walk: false, drill: null, weakP: 0.4,
    xpCtx: '', fixed: null, boss: null, intro: null, spell: null, sandbox: false, test: false, balls: null, script: null, coach: null, labels: false }, o);
}

export const MODE_INFO = {
  daily: { title: 'Daily session', sub: 'Warm-up · focus · pressure over · ~10 min' },
  session: { title: 'Classic 50', sub: '50 balls · adapts to you' },
  quick: { title: 'Quick 30', sub: '30 balls · adapts to you' },
  endless: { title: 'Endless', sub: 'Stop when you like' },
  nets: { title: 'Nets session', sub: '24 balls · bowlers take turns · no feedback till the end' },
  short: { title: 'Short-ball drill', sub: '30 balls · 60% short' },
  spin: { title: 'Spin drill', sub: '30 balls · off- and leg-spin' },
  match: { title: 'Match · 3 overs', sub: 'Chase a target · 3 wickets' },
  selection: { title: 'Selection sim', sub: '4 spells · pace + spin · ~120 kph · no feedback till the end' },
  leave: { title: 'Leave drill', sub: '30 balls · 40% wide outside off · use the mirror for your head' },
  sandbox: { title: 'Sandbox', sub: 'Pick every ball · keeps bowling' },
  check: { title: 'Skill check', sub: '24 balls · the same test every time · shows real change' },
};

export function buildPlan(kind, opts = {}) {
  const S = opts.S || {};
  switch (kind) {
    case 'daily': return { kind, title: 'Daily session', segs: [
      seg({ n: 8, name: 'Warm-up', adapt: false, levelDelta: -1, fb: 'full', weakP: 0, intro: 'WARM-UP · 8 balls · one step easier' }),
      seg({ n: 20, name: 'Focus', adapt: true, weakP: 0.5, intro: 'FOCUS · 20 balls · your weak spot comes more often' }),
      seg({ n: 6, name: 'Pressure over', adapt: false, fb: 'end', walk: true, weakP: 0, xpCtx: 'pressure', gap: Math.min(10, S.netsGap || 20), intro: 'PRESSURE OVER · 6 balls · no feedback till the end' })] };
    case 'tutorial': {
      const r = Math.random() < 0.5;
      return { kind, title: 'Tutorial', segs: [seg({ n: 4, name: 'Tutorial', adapt: false, fb: 'full', weakP: 0, fixed: { m: 1, k: 80, o: null }, labels: true,
        script: [{ cat: 'Full', d: 2.6 }, { cat: 'Short', d: 8.4 }, r ? { cat: 'Short', d: 7.6 } : { cat: 'Full', d: 3.4 }, r ? { cat: 'Full', d: 3.4 } : { cat: 'Short', d: 7.6 }],
        coach: ['BALL 1 · watch the hand · this one is pitched up → FRONT', 'BALL 2 · this one is short → BACK', 'BALL 3 · your call: front or back?', 'BALL 4 · your call'] })] };
    }
    case 'session': return { kind, title: "Classic 50", segs: [seg({ n: 50 })] };
    case 'quick': return { kind, title: 'Quick 30', segs: [seg({ n: 30 })] };
    case 'endless': return { kind, title: 'Endless', segs: [seg({ n: Infinity })] };
    case 'short': return { kind, title: 'Short-ball drill', drill: 'short', segs: [seg({ n: 30, adapt: false, drill: 'short', weakP: 0 })] };
    case 'spin': return { kind, title: 'Spin drill', drill: 'spin', segs: [seg({ n: 30, adapt: false, drill: 'spin', weakP: 0 })] };
    case 'match': return { kind, title: 'Match', match: true, segs: [seg({ n: 18, adapt: false, fb: 'full', weakP: 0 })] };
    case 'selection': {       // the selection nets: club bowlers at ~120 kph plus spinners, play/leave, nets rules, a report at the end
      const sp = (spell, name, intro) => seg({ n: 6, name, adapt: false, fb: 'end', walk: true, weakP: 0, xpCtx: 'nets', fixed: { m: 2, k: 120, o: null },
        spell, gap: Math.min(12, S.netsGap || 20), intro });
      return { kind, title: 'Selection sim', drill: 'nets', segs: [
        sp('pace', 'Spell 1 · pace', 'SELECTION NETS · SPELL 1 · PACE · first ball cold, like the real thing'),
        sp('spin', 'Spell 2 · spin', 'SPELL 2 · SPIN · get to the pitch or go right back'),
        sp('pace', 'Spell 3 · pace', 'SPELL 3 · A NEW QUICK · leave well outside off'),
        sp('mixed', 'Spell 4 · mixed', 'SPELL 4 · MIXED · bowlers take turns')] };
    }
    case 'leave': return { kind, title: 'Leave drill', drill: 'leave', segs: [seg({ n: 30, name: 'Leave drill', adapt: false, fb: 'full', weakP: 0, drill: 'leave',
      fixed: { m: 2, k: 115, o: null }, intro: 'LEAVE DRILL · phone on the mirror, front-on · leave the wide ones, play at the stumps, head still' })] };
    case 'sandbox': return { kind, title: 'Sandbox', segs: [seg({ n: Infinity, name: 'Sandbox', adapt: false, fb: 'full', weakP: 0, sandbox: true })] };
    // The standard test: 24 planned balls at a fixed pace, feet only, no feedback until the end. Never moves the level.
    case 'check': return { kind, title: 'Skill check', segs: [seg({ n: CHECK_N, name: 'Skill check', adapt: false, fb: 'end', weakP: 0, test: true,
      fixed: { m: 1, k: CHECK_KPH, o: null }, balls: checkBalls(opts.rng), intro: 'SKILL CHECK · 24 balls · front or back · no feedback till the end' })] };
    case 'nets': return { kind, title: 'Nets session', drill: 'nets', segs: [seg({ n: 24, adapt: false, fb: 'end', walk: true, weakP: 0, xpCtx: 'nets', gap: S.netsGap })] };
    case 'trial': case 'boss': {
      const b = opts.boss;
      return { kind, title: (kind === 'trial' ? 'Trial: ' : 'Boss nets: ') + b.n, boss: b, segs: [seg({ n: 12, adapt: false, fb: 'end', walk: true, weakP: 0,
        xpCtx: kind, fixed: b.spec, boss: b, gap: Math.min(12, S.netsGap || 20), intro: `${b.n.toUpperCase()} · 2 overs · ${kind === 'trial' ? '80% to pass' : 'beat your best'}` })] };
    }
    default: throw new Error('unknown mode ' + kind);
  }
}
