// Briefing feed build: fetch every catalogue feed, keep the first PER_POSITION sources per political position that
// return fresh stories (so each position contributes the same number of publishers), and merge the stories into a
// rolling seven-day store at briefing/data/latest.json. Topic matching happens in the page, so topics stay private
// to each browser.
//   node briefing/scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { POSITIONS, PER_POSITION, SOURCES } from './sources.mjs';
import { parseFeed, titleKey } from './rss.mjs';
import { categorize } from './categorize.mjs';

const OUT = fileURLToPath(new URL('../data/latest.json', import.meta.url));
mkdirSync(fileURLToPath(new URL('../data/', import.meta.url)), { recursive: true });
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; JDP-I Briefing; +https://jdpi.pages.dev)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' };
const KEEP_DAYS = 7, FRESH_DAYS = 4, PER_SOURCE = 60;
const now = Date.now(), since = now - KEEP_DAYS * 864e5;

async function fetchSource(s) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(s.feed, { headers: UA, signal: AbortSignal.timeout(25000), redirect: 'follow' });
      if (!r.ok) { if (r.status >= 500 && i === 0) continue; return { status: `HTTP ${r.status}`, items: [] }; }
      return { status: 'ok', items: parseFeed(await r.text()) };
    } catch (e) { if (i) return { status: e.name === 'TimeoutError' ? 'timeout' : 'error', items: [] }; }
  }
}
const results = await Promise.all(SOURCES.map(async s => [s, await fetchSource(s)]));

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { items: [] };
const sources = [], fresh = [];
for (const p of POSITIONS) {
  let used = 0;
  for (const [s, r] of results.filter(([s]) => s.position === p.key)) {
    // Undated items are stamped with the fetch time the first time they are seen.
    const items = r.items.map(i => ({ ...i, published: i.published && Date.parse(i.published) <= now + 36e5 ? i.published : null }));
    const newest = Math.max(0, ...items.map(i => Date.parse(i.published) || 0));
    const healthy = r.status === 'ok' && items.length > 0 && (newest === 0 || newest > now - FRESH_DAYS * 864e5);
    const active = healthy && used < PER_POSITION;
    if (active) { used++; fresh.push(...items.slice(0, PER_SOURCE).map(i => ({ ...i, s: s.id }))); }
    sources.push({ id: s.id, name: s.name, position: s.position, country: s.country, caution: s.caution, active, reserve: !active && healthy, status: r.status === 'ok' && !items.length ? 'empty' : r.status === 'ok' && !healthy ? 'stale' : r.status, count: items.length });
  }
  console.log(`${p.key}: ${used}/${PER_POSITION} active`);
}

// Merge with the previous store: same URL → keep the earliest sighting; drop items older than KEEP_DAYS.
const seen = new Map(prev.items.map(i => [i.u, i]));
const stamp = new Date(now).toISOString();
for (const i of fresh) {
  if (seen.has(i.url)) continue;
  seen.set(i.url, { s: i.s, t: i.title, u: i.url, p: i.published || stamp, d: i.summary.slice(0, 240) });
}
const activeIds = new Set(sources.filter(s => s.active).map(s => s.id));
const byKey = new Set();
const items = [...seen.values()]
  .filter(i => Date.parse(i.p) >= since && SOURCES.some(s => s.id === i.s))
  .sort((a, b) => (a.p < b.p ? 1 : -1))
  .filter(i => { const k = i.s + '|' + titleKey(i.t); if (byKey.has(k)) return false; byKey.add(k); return true; })
  // Tag soft news (s = sport, e = entertainment, l = lifestyle) so the page can hide it; re-tagged every run so rule
  // changes apply to the whole store.
  .map(({ c: _c, ...i }) => { const c = categorize(i.t, i.u); return c === 'news' ? i : { ...i, c: c[0] }; });

writeFileSync(OUT, JSON.stringify({ generated: stamp, keepDays: KEEP_DAYS, perPosition: PER_POSITION, positions: POSITIONS, sources, items }));
console.log(`${items.length} stories from ${new Set(items.map(i => i.s)).size} sources (${activeIds.size} active this run); ${items.filter(i => i.c === 's').length} sport, ${items.filter(i => i.c === 'e').length} entertainment, ${items.filter(i => i.c === 'l').length} lifestyle`);
