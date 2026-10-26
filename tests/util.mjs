// Shared test helpers.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeOk(label) {
  let fails = 0;
  const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
  const done = () => { console.log(fails ? `\n${label}: ${fails} FAILED` : `\n${label}: ALL PASSED`); process.exit(fails ? 1 : 0); };
  return { ok, done };
}
// In-memory stand-in for localStorage, with an optional quota (characters).
export function fakeStorage(init = {}, quota = Infinity) {
  const m = new Map(Object.entries(init));
  return {
    getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => { if (String(v).length > quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } m.set(k, String(v)); },
    removeItem: k => m.delete(k), _m: m,
  };
}
