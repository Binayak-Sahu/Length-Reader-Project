// Lets Node tests import modules that use the browser import map's bare "three" specifier.
import { register } from 'node:module';
const target = new URL('../vendor/three/three.module.min.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) { if (spec === 'three') return { url: ${JSON.stringify(target)}, shortCircuit: true }; return next(spec, ctx); }`));
