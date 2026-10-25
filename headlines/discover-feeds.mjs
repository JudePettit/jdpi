// Finds and verifies an RSS/Atom feed for every outlet in outlets.txt.
//   node headlines/discover-feeds.mjs   → headlines/outlets.json + a failure report
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = new URL('./', import.meta.url);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36 JDP-I-headlines';
const FALLBACKS = ['/rss', '/feed', '/rss.xml', '/feed/', '/index.rss', '/rss/index.xml', '/feeds/rss', '/arc/outboundfeeds/rss/', '/rss/home.xml', '/news/rss.xml'];

const countries = {};
for (const line of readFileSync(new URL('outlets.txt', DIR), 'utf8').split('\n')) {
  const m = /^([A-Z]{2}):\s*(.+)$/.exec(line.trim());
  if (!m) continue;
  countries[m[1]] = m[2].split(';').map(s => { const [name, home, rss] = s.split('|').map(x => x.trim()); return { name, home: rss ? `${home}|${rss}` : home }; })
    .filter((o, i, a) => a.findIndex(x => x.home === o.home) === i);
}

async function get(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/rss+xml,application/xml,*/*' }, redirect: 'follow', signal: ctrl.signal });
    return res.ok ? { url: res.url, text: await res.text() } : null;
  } catch { return null; } finally { clearTimeout(t); }
}

function feedItems(xml) {
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) return 0;
  return (xml.match(/<(item|entry)[\s>]/gi) || []).length;
}

async function discover(o) {
  const page = await get(o.home);
  const candidates = [];
  if (page) {
    for (const m of page.text.matchAll(/<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*>/gi)) {
      const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1];
      if (href && !/comments/i.test(href)) candidates.push(new URL(href.replace(/&amp;/g, '&'), page.url).href);
    }
  }
  const origin = new URL(o.home).origin;
  const base = o.home.replace(/\/$/, '');
  for (const f of FALLBACKS) candidates.push(base + f, origin + f);
  for (const url of [...new Set(candidates)].slice(0, 14)) {
    const r = await get(url);
    const n = r ? feedItems(r.text) : 0;
    if (n >= 3) return { ...o, rss: r.url, items: n, via: 'site' };
  }
  // Fallback: Google News' feed of the outlet's own articles (recent stories, not front-page order).
  const host = new URL(o.home).hostname.replace(/^www\./, '');
  const path = new URL(o.home).pathname.replace(/\/$/, '');
  const gn = `https://news.google.com/rss/search?q=${encodeURIComponent(`site:${host}${path} when:2d`)}&hl=en-US&gl=US&ceid=US:en`;
  const r = await get(gn);
  const n = r ? feedItems(r.text) : 0;
  return n >= 3 ? { ...o, rss: gn, items: n, via: 'google-news' } : { ...o, rss: null };
}

// Known feeds for large outlets that hide or block feed discovery: "Name|home|rss" in outlets.txt wins.
for (const list of Object.values(countries)) for (const o of list) {
  const parts = o.home.split('|');
  if (parts.length > 1) { o.home = parts[0]; o.known = parts[1]; }
}
let previous = {};
try { previous = JSON.parse(readFileSync(new URL('outlets.json', DIR), 'utf8')); } catch { /* first run */ }
const found = (cc, o) => (previous[cc] || []).find(p => p.home === o.home);

const tasks = Object.entries(countries).flatMap(([cc, list]) => list.map((o, i) => ({ cc, i, o })));
const out = Object.fromEntries(Object.keys(countries).map(cc => [cc, []]));
let next = 0;
// Retry passes go slowly (3 at a time, paced) so Google News doesn't throttle the fallback.
const retry = Object.keys(previous).length > 0;
await Promise.all(Array.from({ length: retry ? 3 : 10 }, async () => {
  while (next < tasks.length) {
    const t = tasks[next++];
    const prior = found(t.cc, t.o);
    if (prior && !t.o.known) { out[t.cc][t.i] = { ...t.o, ...prior }; continue; }
    if (t.o.known) {
      const r = await get(t.o.known);
      if (r && feedItems(r.text) >= 3) { out[t.cc][t.i] = { ...t.o, rss: r.url, via: 'site' }; continue; }
    }
    out[t.cc][t.i] = await discover(t.o);
    if (retry) await new Promise(r => setTimeout(r, 1500));
  }
}));

const failed = Object.entries(out).flatMap(([cc, l]) => l.filter(o => !o.rss).map(o => `${cc} ${o.name} (${o.home})`));
const thin = Object.entries(out).filter(([, l]) => l.filter(o => o.rss).length < 3).map(([cc, l]) => `${cc}:${l.filter(o => o.rss).length}`);
writeFileSync(new URL('outlets.json', DIR), JSON.stringify(Object.fromEntries(Object.entries(out).map(([cc, l]) => [cc, l.filter(o => o.rss).map(({ name, home, rss, via }) => ({ name, home, rss, via }))])), null, 1));
const viaGoogle = Object.values(out).flat().filter(o => o.via === 'google-news').length;
console.log(`own site feeds: ${tasks.length - failed.length - viaGoogle}; via Google News: ${viaGoogle}`);
console.log(`outlets: ${tasks.length}; feeds found: ${tasks.length - failed.length}; failed: ${failed.length}`);
console.log(`countries with <3 feeds: ${thin.join(' ') || 'none'}`);
console.log('failed:\n  ' + failed.join('\n  '));
