// OSINT Dashboard: the case notebook's store. Cases live in this browser's localStorage (key prp.osint.notebook.v1);
// when storage is blocked (private windows, some previews) the notebook still works for the session and says so.
// Other open tabs of the dashboard stay in step through the "storage" event. Models and checks are in lib.js.
import { normaliseStore, normaliseCase, newCase, normaliseItem, normaliseLogEntry, STORE_VERSION } from './lib.js';

const KEY = 'prp.osint.notebook.v1';

export function createStore() {
  let data, persistent = true;
  const listeners = new Set();
  const read = () => {
    try { const raw = localStorage.getItem(KEY); return normaliseStore(raw ? JSON.parse(raw) : null); }
    catch { persistent = false; return normaliseStore(null); }
  };
  data = read();
  const emit = () => listeners.forEach(f => { try { f(data); } catch (e) { console.error(e); } });
  const save = () => {
    data.version = STORE_VERSION;
    try { localStorage.setItem(KEY, JSON.stringify(data)); persistent = true; } catch { persistent = false; }
    emit();
  };
  const cur = () => data.cases.find(c => c.id === data.current) || data.cases[0];
  const touch = c => { c.updated = new Date().toISOString(); };
  window.addEventListener('storage', e => { if (e.key === KEY) { data = read(); emit(); } });

  return {
    get data() { return data; },
    get persistent() { return persistent; },
    current: cur,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setCurrent(id) { if (data.cases.some(c => c.id === id)) { data.current = id; save(); } },
    addCase(title) { const c = newCase(title); data.cases.push(c); data.current = c.id; save(); return c; },
    renameCase(title) { const c = cur(); c.title = String(title || '').trim().slice(0, 200) || c.title; touch(c); save(); },
    deleteCase() {
      const c = cur();
      data.cases = data.cases.filter(x => x.id !== c.id);
      if (!data.cases.length) data.cases.push(newCase('My first case'));
      data.current = data.cases[0].id;
      save();
    },
    addItem(fields) { const c = cur(); const item = normaliseItem(fields); if (!item.claim && !item.url) return null; c.items.unshift(item); touch(c); save(); return item; },
    updateItem(id, fields) {
      const c = cur(), i = c.items.findIndex(x => x.id === id);
      if (i < 0) return null;
      const item = normaliseItem({ ...c.items[i], ...fields, id, created: c.items[i].created, updated: new Date().toISOString() });
      c.items[i] = item; touch(c); save(); return item;
    },
    deleteItem(id) { const c = cur(); c.items = c.items.filter(x => x.id !== id); touch(c); save(); },
    log(entry) { const c = cur(); const e = normaliseLogEntry(entry); if (!e.text) return; c.log.push(e); if (c.log.length > 5000) c.log.splice(0, c.log.length - 5000); touch(c); save(); },
    clearLog() { const c = cur(); c.log = []; touch(c); save(); },
    /** Add imported cases; a case whose id already exists comes in as a copy with a new id. */
    importCases(cases) {
      const ids = new Set(data.cases.map(c => c.id)), titles = new Set(data.cases.map(c => c.title));
      const added = cases.map(c => {
        const x = normaliseCase(c);
        if (ids.has(x.id)) x.id = newCase().id;
        if (titles.has(x.title)) x.title = (x.title + ' (imported)').slice(0, 200);
        ids.add(x.id); titles.add(x.title);
        return x;
      });
      data.cases.push(...added);
      if (added.length) data.current = added[0].id;
      save();
      return added;
    },
  };
}
