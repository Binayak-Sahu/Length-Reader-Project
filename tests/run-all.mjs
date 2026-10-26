// Runs every Node test (no browser needed) and checks the service-worker stamp.
// Usage: node tests/run-all.mjs        (browser tests: node tests/browser-test.mjs)
import { spawnSync } from 'node:child_process';
const runs = [['tests/core-test.mjs'], ['tests/timing-test.mjs'], ['tests/game-test.mjs'], ['tools/stamp.mjs', '--check']];
let failed = 0;
for (const args of runs) {
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const fails = out.split('\n').filter(l => l.startsWith('FAIL'));
  const n = out.split('\n').filter(l => l.startsWith('ok')).length;
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'}  ${args.join(' ')}  (${n} checks${fails.length ? ', ' + fails.length + ' failed' : ''})`);
  for (const f of fails) console.log('      ' + f);
  if (r.status !== 0) { failed++; if (!fails.length) console.log(out.split('\n').slice(-15).join('\n')); }
}
console.log(failed ? `\n${failed} suite(s) FAILED` : '\nALL SUITES PASSED');
process.exit(failed ? 1 : 0);
