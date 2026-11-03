/**
 * A stand-in for claude.ai's artifact runtime: window.claude.use('db') over an in-memory store,
 * seeded with `seed` ({ "rows/vm~33": {...}, ... }), keeping the page's writes in window.__writes;
 * window.__put(path, data) plays the sync agent writing a document.
 * It runs as a classic script before the page, as the real viewer's runtime does.
 */
export function fakeClaude(seed: Record<string, unknown>, { writable = true } = {}): string {
  return `(() => {
  const docs = new Map(Object.entries(${JSON.stringify(seed).replaceAll('</', '<\\/')}));
  const listeners = new Set();
  window.__writes = [];
  const snap = (path) => ({ id: path.split('/').pop(), exists: docs.has(path), data: () => structuredClone(docs.get(path)), metadata: { fromCache: false } });
  const inCollection = (coll, path) => path.startsWith(coll + '/') && !path.slice(coll.length + 1).includes('/');
  const notify = () => setTimeout(() => { for (const l of listeners) l(); });
  const doc = (path) => ({
    id: path.split('/').pop(), path,
    async get() { return snap(path); },
    async set(data) {
      if (!${writable}) throw Object.assign(new Error('read only'), { code: 'invalid_argument' });
      docs.set(path, structuredClone(data)); window.__writes.push({ path, data }); notify();
    },
    onSnapshot(next) { const l = () => next(snap(path)); listeners.add(l); setTimeout(l); return () => listeners.delete(l); },
  });
  const collection = (coll) => ({
    path: coll,
    doc: (id) => doc(coll + '/' + id),
    onSnapshot(next) {
      const l = () => next({ docs: [...docs.keys()].filter((p) => inCollection(coll, p)).map(snap), metadata: { fromCache: false } });
      listeners.add(l); setTimeout(l); return () => listeners.delete(l);
    },
  });
  const db = { doc, collection };
  window.__put = (path, data) => { docs.set(path, data); notify(); };
  window.claude = { use: async (name) => name === 'db' ? db : name === 'user' ? { can: async () => ${writable} } : null };
})();`
}
