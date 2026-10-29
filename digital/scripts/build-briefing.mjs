// Digital Briefing build: fetch every feed in the catalogue, parse and classify the items, pick each arXiv category's
// papers for the day, merge them into the rolling seven-day store and write digital/briefing/data/stories.json (items
// plus a per-feed status for the Sources tab).
//   node digital/scripts/build-briefing.mjs
// Polite fetching: an honest user agent, a 20-second timeout, one retry for server errors and timeouts, at most six
// hosts at a time and one request at a time per host (with a pause between them, longer for arXiv), and conditional
// requests (ETag / Last-Modified) so unchanged feeds cost the publisher almost nothing. Headlines, links, authors and
// short summaries only: full articles are never stored. A run with too few working feeds (MIN_WORKING_SHARE in
// briefing-sources.mjs) exits 1 without writing.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SOURCES, TIERS, KINDS, DEFAULT_CAP, MIN_WORKING_SHARE, outletId } from './briefing-sources.mjs';
import { FIELDS } from './classify.mjs';
import { parseDigitalFeed, normalise, mergeStore, pickDaily } from './briefing-feeds.mjs';

const OUT_DIR = fileURLToPath(new URL('../briefing/data/', import.meta.url));
const OUT = OUT_DIR + 'stories.json';
const UA = 'Mozilla/5.0 (compatible; PRP Digital Briefing; +https://jdpi.pages.dev)';
const ACCEPT = 'application/rss+xml, application/atom+xml, application/rdf+xml;q=0.9, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5';
const KEEP_DAYS = 7, MAX_ITEMS = 2500, TIMEOUT = 20000, HOSTS_AT_ONCE = 6, GAP_MS = 400;
// arXiv asks for gentle crawling; nature.com sometimes answers quick successive requests with a bot challenge.
const HOST_GAP = { 'rss.arxiv.org': 1500, 'www.nature.com': 2500 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const now = Date.now(), stamp = new Date(now).toISOString();
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { items: [], sources: [] };
const prevStatus = new Map((prev.sources || []).map(s => [s.id, s]));

async function fetchFeed(s) {
  const p = prevStatus.get(s.id);
  const headers = { 'User-Agent': UA, Accept: ACCEPT };
  if (p?.status === 'ok' && p.etag) headers['If-None-Match'] = p.etag;
  if (p?.status === 'ok' && p.lastModified) headers['If-Modified-Since'] = p.lastModified;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(s.feed, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) });
      if (r.status === 304) return { status: 'ok', notModified: true, items: [], etag: p?.etag, lastModified: p?.lastModified };
      if (!r.ok) {
        if (r.status >= 500 && attempt === 0) { await sleep(3000); continue; }
        return { status: 'error', error: `HTTP ${r.status}` };
      }
      const text = await r.text();
      if (!/<(?:rss|feed|rdf:RDF)\b/i.test(text.slice(0, 5000))) return { status: 'error', error: 'not a feed (HTML, sign-in or challenge page)' };
      // A feed with no items delivers nothing, so it does not count as working, unless it is empty on quiet days
      // (arXiv's announcements at weekends; mayBeEmpty in the catalogue).
      const items = parseDigitalFeed(text);
      if (!items.length && !s.mayBeEmpty) return { status: 'error', error: 'empty feed (no items)' };
      return { status: 'ok', items, etag: r.headers.get('etag') || undefined, lastModified: r.headers.get('last-modified') || undefined };
    } catch (e) {
      if (attempt === 0) { await sleep(3000); continue; }
      return { status: 'error', error: e.name === 'TimeoutError' ? 'timeout' : String(e.cause?.code || e.message || 'network error') };
    }
  }
}

// One queue per host, at most HOSTS_AT_ONCE hosts in flight.
const byHost = new Map();
for (const s of SOURCES) { const h = new URL(s.feed).hostname; (byHost.get(h) || byHost.set(h, []).get(h)).push(s); }
const hosts = [...byHost.entries()], results = new Map();
await Promise.all(Array.from({ length: HOSTS_AT_ONCE }, async () => {
  for (let next; (next = hosts.shift());) {
    const [host, list] = next;
    for (const s of list) { results.set(s.id, await fetchFeed(s)); await sleep(HOST_GAP[host] || GAP_MS); }
  }
}));

// Normalise this run's items (dropping front matter, corrections, sponsored posts, the feeds' own skip rules and
// off-topic posts) and merge them into the store. arXiv's announcement feeds give one day's submissions: each keeps at
// most perDay of them. Undated items take the feed's Last-Modified time when it is recent, which is when the feed last
// changed, and otherwise this run's time; once stored they keep that first stamp.
const fresh = [];
for (const s of SOURCES) {
  const r = results.get(s.id);
  const lm = Date.parse(r.lastModified || '');
  const fallback = Number.isFinite(lm) && lm <= now && lm >= now - KEEP_DAYS * 864e5 ? new Date(lm).toISOString() : stamp;
  let kept = (r.items || []).map(raw => ({ raw, item: normalise(raw, s, stamp, fallback) })).filter(e => e.item);
  r.matched = kept.length;
  if (s.perDay) kept = pickDaily(kept, s.perDay);
  r.kept = kept.length;
  for (const e of kept) fresh.push(e.item);
}
// Refuse a degraded run before it touches the store: the run fails (exit 1), and the store's `generated` time ages,
// which the page ("Data is N hours old") and the freshness check report.
const working = SOURCES.filter(s => results.get(s.id).status === 'ok').length, need = Math.ceil(SOURCES.length * MIN_WORKING_SHARE);
if (working < need) {
  console.error(`Only ${working} of ${SOURCES.length} feeds could be fetched (need ${need}); the store was left as it was. Failed: ${SOURCES.filter(s => results.get(s.id).status !== 'ok').map(s => `${s.id} (${results.get(s.id).error})`).join(', ')}.`);
  process.exit(1);
}
const prevIds = new Set((prev.items || []).map(i => i.id));
const items = mergeStore({ prevItems: prev.items || [], freshItems: fresh, sources: SOURCES, now, keepDays: KEEP_DAYS, maxItems: MAX_ITEMS, defaultCap: DEFAULT_CAP });

// Per-feed status for the Sources tab.
const sources = SOURCES.map(s => {
  const r = results.get(s.id), p = prevStatus.get(s.id) || {};
  const mine = items.filter(i => i.source === s.id || (i.also || []).includes(s.id));
  const newest = Math.max(0, ...mine.map(i => Date.parse(i.published) || 0), ...(r.items || []).map(i => Date.parse(i.published) || 0).filter(t => t <= now + 36e5));
  const out = {
    id: s.id, outlet: s.outlet, outletId: outletId(s.outlet), name: s.name, url: s.url, feed: s.feed, kind: s.kind, tier: s.tier,
    fields: s.fields, qid: s.qid, status: r.status,
    count: r.notModified ? (p.count ?? 0) : r.kept, stored: mine.length, latest: newest ? new Date(newest).toISOString() : (p.latest || null),
    checked: stamp, lastOk: r.status === 'ok' ? stamp : (p.lastOk || null),
  };
  if (s.perDay) { out.perDay = s.perDay; out.matched = r.notModified ? (p.matched ?? 0) : r.matched; }
  if (s.badge) out.badge = s.badge;
  if (s.strict) out.strict = true;
  if (r.error) out.error = r.error;
  if (r.notModified) out.notModified = true;
  if (r.etag) out.etag = r.etag;
  if (r.lastModified) out.lastModified = r.lastModified;
  return out;
});

const by = (k, v) => items.filter(i => i[k] === v).length;
const counts = {
  items: items.length, papers: by('type', 'paper'), news: by('type', 'news'),
  sources: new Set(items.map(i => i.source)).size, feeds: SOURCES.length, working,
  fields: Object.fromEntries(FIELDS.map(f => [f.id, items.filter(i => i.fields.includes(f.id)).length])),
  general: items.filter(i => !i.fields.length).length,
};
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify({
  generated: stamp, keepDays: KEEP_DAYS, maxItems: MAX_ITEMS,
  fields: FIELDS.map(({ id, label, short, qid, aliases }) => ({ id, label, short, qid, aliases })), tiers: TIERS, kinds: KINDS, counts, sources, items,
}));

for (const s of sources) console.log(`${s.status === 'ok' ? 'ok ' : 'ERR'} ${s.id.padEnd(16)} ${String(s.count).padStart(4)} kept${s.perDay ? ` of ${String(s.matched).padStart(3)}` : '       '}  ${String(s.stored).padStart(4)} stored  ${s.latest ? s.latest.slice(0, 16) : '-'}${s.notModified ? '  (not modified)' : ''}${s.error ? '  ' + s.error : ''}`);
console.log(`${items.length} items (${counts.papers} papers, ${counts.news} news) from ${counts.sources} feeds; ${working}/${SOURCES.length} feeds working; ${items.filter(i => !prevIds.has(i.id)).length} new this run`);
console.log('by field:', JSON.stringify(counts.fields), 'general:', counts.general);
