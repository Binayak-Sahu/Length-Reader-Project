// Optional sync through the player's own GitHub: the shared data lives in one secret (unlisted) gist in their account.
// The token stays on this device (its own storage key, never exported or synced). Failures never block play.
import { SYNC_FILE, syncPayload, mergeSynced } from './core/sync.js';

export const SYNC_KEY = 'lr5-sync';
const API = 'https://api.github.com';

export function createSync(storage) {
  let st = {}, running = null;
  try { st = JSON.parse(storage.getItem(SYNC_KEY)) || {}; } catch (e) { st = {}; }
  const keep = () => { try { storage.setItem(SYNC_KEY, JSON.stringify(st)); } catch (e) { /* storage blocked: sync still works this visit */ } };
  async function gh(path, opt = {}) {
    const res = await fetch(API + path, Object.assign({ cache: 'no-store' }, opt, {
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + st.token, 'X-GitHub-Api-Version': '2022-11-28',
        ...(opt.body ? { 'Content-Type': 'application/json' } : {}) },
    }));
    if (res.status === 401) throw new Error('GitHub rejected the token. Make a new one (Gists: Read and write) and paste it again.');
    if (res.status === 403) throw new Error('The token can’t use gists. Give it Account permissions → Gists: Read and write.');
    return res;
  }
  async function findGist() {
    for (let page = 1; page <= 10; page++) {
      const res = await gh(`/gists?per_page=100&page=${page}`);
      if (!res.ok) throw new Error('GitHub error ' + res.status);
      const list = await res.json();
      const g = list.find(x => x.files && x.files[SYNC_FILE]);
      if (g) return g.id;
      if (list.length < 100) return null;
    }
    return null;
  }
  async function readGist(id) {
    const res = await gh('/gists/' + id);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('GitHub error ' + res.status);
    const f = (await res.json()).files[SYNC_FILE];
    if (!f) return null;
    let text = f.content;
    if (f.truncated) { const raw = await fetch(f.raw_url, { cache: 'no-store' }); if (!raw.ok) throw new Error('GitHub error ' + raw.status); text = await raw.text(); }
    return { remote: JSON.parse(text) };
  }
  async function run(db) {
    if (!st.token) return null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Offline: will sync next time.');
    let got = st.gist ? await readGist(st.gist) : null;
    if (!got) { st.gist = await findGist(); got = st.gist ? await readGist(st.gist) : null; }
    const res = got ? mergeSynced(db, got.remote) : { sessions: 0, badges: 0, level: false };
    const out = syncPayload(db), body = JSON.stringify({ files: { [SYNC_FILE]: { content: JSON.stringify(out) } } });
    if (!got) {
      const r = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'Length Reader sync (private data for the app)', public: false,
        files: { [SYNC_FILE]: { content: JSON.stringify(out) } } }) });
      if (!r.ok) throw new Error('GitHub error ' + r.status);
      st.gist = (await r.json()).id;
    } else if (JSON.stringify(got.remote.data) !== JSON.stringify(out.data)) {      // only write when something changed
      const r = await gh('/gists/' + st.gist, { method: 'PATCH', body });
      if (!r.ok) throw new Error('GitHub error ' + r.status);
    }
    st.last = new Date().toISOString(); st.added = res.sessions; st.err = null; keep();
    return res;
  }
  return {
    get on() { return !!st.token; },
    get status() { return { last: st.last || null, added: st.added || 0, err: st.err || null, gist: st.gist || null }; },
    connect(token) { st = { token: String(token).trim() }; keep(); },
    disconnect() { st = {}; try { storage.removeItem(SYNC_KEY); } catch (e) { /* nothing to remove */ } },
    // One sync at a time; a call while one is running waits for it.
    sync(db) {
      if (!running) running = run(db).catch(e => { st.err = e.message; keep(); throw e; }).finally(() => { running = null; });
      return running;
    },
  };
}
