// Adds a short plain-text `summary` to every historical calendar event.
//   node calendar/scripts/enrich-summaries.mjs
// Events with an English Wikipedia source get the article's lead summary (Wikipedia REST API, CC BY-SA);
// the page fetches the full introduction on demand for "See more". Summaries are cached in
// summary-cache.json so rebuilds only fetch new articles.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const DATA = new URL('../data/', import.meta.url);
const CACHE = new URL('./summary-cache.json', import.meta.url);
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const UA = { 'User-Agent': 'JDP-I Historical Calendar (https://jdpi.pages.dev)' };
const titleOf = url => /en\.wikipedia\.org\/wiki\//.test(url || '') ? decodeURIComponent(url.split('/wiki/')[1].split('#')[0]) : null;

// Two or three sentences, at most ~360 characters, ending on a sentence boundary where possible.
function shorten(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 360) return t;
  const cut = t.slice(0, 360), end = cut.lastIndexOf('. ');
  return end > 120 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '') + '…';
}

async function summary(title) {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`, { headers: UA });
    if (res.status === 404) return '';
    if (res.ok) return shorten((await res.json()).extract);
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  return null; // leave uncached; try again next run
}

const files = readdirSync(DATA).filter(f => /^\d{4}s\.json$/.test(f));
const decades = files.map(f => [f, JSON.parse(readFileSync(new URL(f, DATA), 'utf8'))]);
const titles = [...new Set(decades.flatMap(([, d]) => d.events.filter(e => !e.summary).map(e => titleOf(e.source)).filter(Boolean)))].filter(t => !(t in cache));
console.log(`${titles.length} articles to fetch (${Object.keys(cache).length} cached)`);
let done = 0;
const queue = [...titles];
await Promise.all(Array.from({ length: 8 }, async () => {
  for (let t; (t = queue.shift()) !== undefined;) {
    const s = await summary(t);
    if (s !== null) cache[t] = s;
    if (++done % 250 === 0) { console.log(done); writeFileSync(CACHE, JSON.stringify(cache)); }
  }
}));
writeFileSync(CACHE, JSON.stringify(cache));

let withSummary = 0, total = 0;
for (const [f, d] of decades) {
  for (const e of d.events) {
    total++;
    const t = titleOf(e.source);
    // "Events in the year 1990 in X" style intros of year pages say nothing about the event itself.
    const fromWiki = t && cache[t] && !/^(Events|The following lists events|This is a list)/i.test(cache[t]) ? cache[t] : '';
    // An account the build wrote for this event (a news report, a resignation, a UCDP record) says more about the
    // day itself than the article's lead does, so it stays; build-events.mjs never writes Wikipedia's text itself.
    const s = e.summary || fromWiki || '';
    if (s) { e.summary = s; withSummary++; } else delete e.summary;
  }
  writeFileSync(new URL(f, DATA), JSON.stringify(d));
}
console.log(`${withSummary} of ${total} events have a summary`);
