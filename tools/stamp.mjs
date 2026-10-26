// Stamps the service worker with the list of offline files and a hash of their contents, and writes the
// <link rel="modulepreload"> list into index.html (flattens the module waterfall on first load).
// Run after changing any app file:   node tools/stamp.mjs        Check only (CI):   node tools/stamp.mjs --check
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const check = process.argv.includes('--check');
const walk = (d) => fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];

const files = [
  'index.html', 'length-reader.html', 'mirror.html', 'manifest.webmanifest', 'legacy/v4.html',
  ...walk('css'), ...walk('js'), ...walk('icons'), ...walk('fonts'),
  'vendor/three/three.module.min.js',
].filter(f => fs.existsSync(path.join(ROOT, f))).map(f => f.split(path.sep).join('/')).sort();

// modulepreload: every module the page imports (not the worker, which runs in its own context)
const mods = ['vendor/three/three.module.min.js', ...files.filter(f => f.startsWith('js/') && f.endsWith('.js') && f !== 'js/traj-worker.js')];
const preload = mods.map(f => `<link rel="modulepreload" href="${f}">`).join('\n');
const idxPath = path.join(ROOT, 'index.html'), idx = fs.readFileSync(idxPath, 'utf8');
const idxNew = idx.replace(/(<!-- @preload-start[^\n]*-->\n)[\s\S]*?(<!-- @preload-end -->)/, `$1${preload}\n$2`);

const h = crypto.createHash('sha256');
for (const f of files) { h.update(f); h.update(f === 'index.html' ? idxNew : fs.readFileSync(path.join(ROOT, f))); }
const version = h.digest('hex').slice(0, 12);
const swPath = path.join(ROOT, 'sw.js'), sw = fs.readFileSync(swPath, 'utf8');
const core = ['./', ...files];
const swNew = sw.replace(/(\/\/ @stamp-start\n)[\s\S]*?(\/\/ @stamp-end)/,
  `$1const VERSION = '${version}';\nconst CORE = [\n${core.map(f => `  '${f}',`).join('\n')}\n];\n$2`);

if (check) {
  const stale = [];
  if (idx !== idxNew) stale.push('index.html (modulepreload list)');
  if (sw !== swNew) stale.push('sw.js (offline file list / version)');
  if (stale.length) { console.log('FAIL stamp is stale: ' + stale.join(', ') + ' — run: node tools/stamp.mjs'); process.exit(1); }
  console.log(`ok   service worker stamp is current (${version}, ${core.length} files)`);
} else {
  fs.writeFileSync(idxPath, idxNew); fs.writeFileSync(swPath, swNew);
  console.log(`stamped ${version}: ${core.length} offline files, ${mods.length} module preloads`);
}
