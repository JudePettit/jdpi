// The Political Briefing's Top stories (q/briefing.html), worked out away from the page's main thread: Highbrowse's own
// grouping (analysis.js: buildModel over the four briefings' stores, then politicalTops for each window), so the same
// headlines make the same story on both pages. The page fetches the stores itself (so a test's fixtures reach this too)
// and posts { stores: their text (null for one it could not read), access: design/prp-access.json's content, now, first:
// the window it shows }; this posts back one message a window, the one shown first, each story's political headlines with
// only what the page shows of them (plain data, small to copy):
//   { w, tops: politicalTops(model, w) in that shape, ref: the time the windows count back from, failed: [briefing keys
//     not read], ms: { build, window } }   or, should anything throw, { error }
// As a module worker: new Worker('../highbrowse/tops-worker.js', { type: 'module' }). Where a browser cannot start one,
// the page imports this file and calls topsOf itself, after its first paint.
import { BRIEFINGS, WINDOWS, buildModel, politicalTops } from './analysis.js';

const plain = i => ({ u: i.u, t: i.t, src: i.src, sid: i.sid, pos: i.pos, at: i.at, acc: i.acc, caution: i.caution });
const now = () => (globalThis.performance ? performance.now() : Date.now());

export function topsOf({ stores = [], access = null, now: at = Date.now(), first = '3d' } = {}, post) {
  const t0 = now();
  const parsed = BRIEFINGS.map((b, k) => { const s = stores[k]; if (s == null) return null; try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return null; } });
  const model = buildModel(parsed, { now: at, access: globalThis.PRPAccess.table(access || { sources: [] }) });
  const build = now() - t0;
  const failed = BRIEFINGS.filter((b, k) => !parsed[k]).map(b => b.key);
  const order = [first, ...Object.keys(WINDOWS).filter(w => w !== first)].filter(w => WINDOWS[w]);
  for (const w of order) {
    const t1 = now();
    const tops = politicalTops(model, w).map(s => ({ ...s, entries: s.entries.map(e => ({ item: plain(e.item), rank: e.rank, alt: e.alt ? { u: e.alt.u, t: e.alt.t, src: e.alt.src } : null })) }));
    post({ w, tops, ref: model.ref, failed, ms: { build, window: now() - t1 } });
  }
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = e => {
    try { topsOf(e.data, m => globalThis.postMessage(m)); } catch (err) { globalThis.postMessage({ error: String(err?.message || err) }); }
  };
}
