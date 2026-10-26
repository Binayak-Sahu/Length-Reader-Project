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
//   script   fixed balls for the tutorial ([{cat, d, lx}])      coach  a banner before each ball      labels  keep tap-zone labels on
export function seg(o) {
  return Object.assign({ n: 50, name: '', adapt: true, levelDelta: 0, fb: 'auto', walk: false, drill: null, weakP: 0.4,
    xpCtx: '', fixed: null, boss: null, intro: null, script: null, coach: null, labels: false }, o);
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
    case 'nets': return { kind, title: 'Nets session', drill: 'nets', segs: [seg({ n: 24, adapt: false, fb: 'end', walk: true, weakP: 0, xpCtx: 'nets', gap: S.netsGap })] };
    case 'trial': case 'boss': {
      const b = opts.boss;
      return { kind, title: (kind === 'trial' ? 'Trial: ' : 'Boss nets: ') + b.n, boss: b, segs: [seg({ n: 12, adapt: false, fb: 'end', walk: true, weakP: 0,
        xpCtx: kind, fixed: b.spec, boss: b, gap: Math.min(12, S.netsGap || 20), intro: `${b.n.toUpperCase()} · 2 overs · ${kind === 'trial' ? '80% to pass' : 'beat your best'}` })] };
    }
    default: throw new Error('unknown mode ' + kind);
  }
}
