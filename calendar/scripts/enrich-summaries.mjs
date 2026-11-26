// Adds a short plain-text `summary` to every historical calendar event.
//   node calendar/scripts/enrich-summaries.mjs
// Events with an English Wikipedia source get the article's lead summary (Wikipedia REST API, CC BY-SA);
// the page fetches the full introduction on demand for "See more". Summaries are cached in
// summary-cache.json so rebuilds only fetch new articles, except that an event whose day has just passed has its lead
// fetched again (staleTitles, below).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { writeHeads } from '../../integration/scripts/heads.mjs';

const UA = { 'User-Agent': 'JDP-I Historical Calendar (https://jdpi.pages.dev)' };
export const titleOf = url => /en\.wikipedia\.org\/wiki\//.test(url || '') ? decodeURIComponent(url.split('/wiki/')[1].split('#')[0]) : null;

// Where the sentences of a lead end: after a full stop, "!" or "?" followed by a space or the end, but not the full
// stop of a common abbreviation or of initials ("St. John's", "the fifty U.S. states", "John F. Kennedy"). Cutting at
// those left "It was held in St." and "an unprecedented China–Russia–U.S." on the page (second readers, 25 November
// 2026), and splitting at a decimal point lost Bulgaria's result ("57.6% of the votes").
const ABBREVIATION = /(?:\b(?:St|Ste|Mt|Ft|Dr|Mr|Mrs|Ms|Jr|Sr|No|Nos|Gen|Lt|Col|Capt|Gov|Sen|Rep|Rev|Prof|vs)|\b(?:[A-Z]\.)+[A-Z]|\b[A-HJ-Z])$/; // not "I": "World War I." ends a sentence
export function sentenceEnds(text) {
  const out = [];
  for (const m of String(text).matchAll(/[.!?](?=\s|$)/g))
    if (m[0] !== '.' || !ABBREVIATION.test(text.slice(Math.max(0, m.index - 12), m.index))) out.push(m.index + 1);
  return out;
}

/** A cached lead that ends at an abbreviation ("… the fifty U.S."). On 25 and 26 November 2026 every such lead an older
 *  shorten() had cut was fetched again (build 8); those that still end so are whole leads, as Wikipedia writes them
 *  ("ratified by the U.S." in Hamdan v. Rumsfeld; "about 63% Yes to 37% No." for California's Proposition 12;
 *  "Washington, D.C." for the 2024 Libertarian National Convention: Wikipedia REST summaries, read 26 November 2026).
 *  They are not fetched again: this shorten() never cuts at an abbreviation, so a lead it wrote that ends at one is
 *  whole. Fetching them on every run cost three requests a day for nothing (follow-up of 26 November 2026). The check
 *  is kept only to tell such a lead from one that ends a sentence (the tests read it); no run fetches by it. */
export const cutAtAbbreviation = lead => !!lead && /\.$/.test(lead) && !sentenceEnds(lead).includes(lead.length);

// Two or three sentences, about 360 characters, ending on a sentence boundary where possible: the sentence still
// running at 360 characters is finished if it ends by 480, otherwise the summary stops at the last sentence before.
export function shorten(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 360) return t;
  const ends = sentenceEnds(t);
  const end = ends.find(i => i > 360 && i <= 480) || ends.filter(i => i <= 360).at(-1);
  return end > 120 ? t.slice(0, end) : t.slice(0, 360).replace(/\s+\S*$/, '') + '…';
}

// A lead is cached once, so an election's or a summit's stayed as it read before the day ("are scheduled to be held",
// "will take place", "is currently visiting") after the day had passed (ChatGPT's page reviews, front-pages-16). The
// leads of event articles (the Retrospective's votes, Wikipedia's lists, Wikidata's events) whose day has passed in the
// last 30 days are fetched again on every run, since Wikipedia's own lead may take some days to be brought up to date.
// The news items of Wikipedia's Current events portal are left alone: their sentence is the day's news.
export const REFRESH_CLASSES = new Set(['retrospective', 'wikipedia-list', 'wikidata']);
export const REFRESH_DAYS = 30;
const daysBefore = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') - n * 864e5).toISOString().slice(0, 10);
/** The article titles whose cached lead is fetched again: events of REFRESH_CLASSES dated in the last 30 days before
 *  `today`, whose summary is the lead (none yet, or the cached one), not an account the build wrote. */
export function staleTitles(events, cache, today) {
  const from = daysBefore(today, REFRESH_DAYS), out = new Set();
  for (const e of events) {
    const t = titleOf(e.source);
    if (!t || !(t in cache) || !REFRESH_CLASSES.has(e.class) || e.date >= today || e.date < from) continue;
    if (!e.summary || e.summary === cache[t] || e.summary === roundLead(e, cache[t])) out.add(t);
  }
  return [...out];
}

// A second round shares its article with the first: its summary starts at the lead's sentence that names that round
// ("… with a second round held on 1 November 2026 …"), where the lead has one (front-pages-16).
const SECOND_ROUND = /\((?:second|2nd|third|3rd) round\)|\brun-?off\b/i;
const ROUND_SENTENCE = /\b(?:second|third) round\b|\brun-?off\b/i;
// The lead is cut only at sentence ends (sentenceEnds), so a figure ("57.6%") or an abbreviation stays whole.
export function roundLead(e, lead) {
  if (!lead || !SECOND_ROUND.test(e.title || '')) return lead;
  const starts = [0, ...sentenceEnds(lead).filter(i => i < lead.length)];
  const i = starts.findIndex((s, k) => ROUND_SENTENCE.test(lead.slice(s, starts[k + 1] ?? lead.length)));
  return i < 0 ? lead : lead.slice(starts[i]).trim();
}

/**
 * The summary an event takes: an account the build wrote for it (a news report, a resignation, a UCDP record) stays,
 * since it says more about the day than the article's lead does (build-events.mjs never writes Wikipedia's text
 * itself); a summary that is a lead cached before this run (`before`, as the last run wrote it) gives way to the lead
 * now cached; otherwise the lead, a second round's from its own sentence. Year pages' "Events in the year …" intros say
 * nothing about the event and are not used. An empty refetch never reaches the cache (main), so the old lead stays.
 */
export function pickSummary(e, cache, before = {}) {
  const t = titleOf(e.source);
  const fromWiki = t && cache[t] && !/^(Events|The following lists events|This is a list)/i.test(cache[t]) ? roundLead(e, cache[t]) : '';
  const lead = !!t && (e.summary === before[t] || e.summary === cache[t] || (!!before[t] && e.summary === roundLead(e, before[t])));
  const own = e.summary && !lead ? e.summary : '';
  return own || fromWiki || e.summary || '';
}

/** The articles a run fetches: those with no cached lead yet, and the leads fetched again (staleTitles), which are
 *  `recent` alone. */
export function titlesToFetch(events, cache, today) {
  const recent = staleTitles(events, cache, today);
  const titles = [...new Set([...events.filter(e => !e.summary).map(e => titleOf(e.source)).filter(Boolean).filter(t => !(t in cache)), ...recent])];
  return { recent, titles };
}

/** A lead fetched again keeps the cached one when it comes back empty: a failed or moved page is not a better text. */
export const keepLead = (title, fetched, before) => fetched !== null && !(title in before && !fetched);

// A network error (a reset socket, a cut-off answer) is retried like an HTTP error, so one bad connection costs one
// summary until the next run, not the day's whole refresh.
async function summary(title) {
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`, { headers: UA });
      if (res.status === 404) return '';
      if (res.ok) return shorten((await res.json()).extract);
    } catch { /* try again */ }
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  return null; // leave uncached; try again next run
}

async function main() {
  const DATA = new URL('../data/', import.meta.url);
  const CACHE = new URL('./summary-cache.json', import.meta.url);
  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  const TODAY = new Date().toISOString().slice(0, 10);
  const files = readdirSync(DATA).filter(f => /^\d{4}s\.json$/.test(f));
  const decades = files.map(f => [f, JSON.parse(readFileSync(new URL(f, DATA), 'utf8'))]);
  const all = decades.flatMap(([, d]) => d.events);
  const { recent, titles } = titlesToFetch(all, cache, TODAY);
  const stale = recent;
  // The leads as cached before this run: an event whose summary is one of them takes the lead fetched now.
  const before = Object.fromEntries(stale.map(t => [t, cache[t]]));
  console.log(`${titles.length} articles to fetch (${Object.keys(cache).length} cached; ${recent.length} leads fetched again, their day passed in the last ${REFRESH_DAYS} days)`);
  let done = 0;
  const queue = [...titles];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let t; (t = queue.shift()) !== undefined;) {
      const s = await summary(t);
      if (keepLead(t, s, before)) cache[t] = s;
      if (++done % 250 === 0) { console.log(done); writeFileSync(CACHE, JSON.stringify(cache)); }
    }
  }));
  writeFileSync(CACHE, JSON.stringify(cache));
  const changed = stale.filter(t => cache[t] !== before[t]).length;
  if (stale.length) console.log(`${changed} of ${stale.length} leads fetched again have changed`);

  let withSummary = 0, total = 0, merged = 0;
  for (const [f, d] of decades) {
    // Two titles that open one article (a redirect: "Pope Leo XIV's 2026 visit to Uruguay" and "Visit by Pope Leo XIV to
    // Uruguay, Argentina, and Peru") bring the same lead: a summit or visit with the same host within a day is then one
    // event (not other kinds: a battle or an election can redirect to its campaign or to another vote held that day), and
    // the first record stays (ChatGPT's review, ledger RV-05).
    const lead = e => { const t = titleOf(e.source); return t && cache[t] && cache[t].length > 80 ? cache[t] : null; };
    const seen = [];
    d.events = d.events.filter(e => {
      const l = lead(e);
      if (l && e.type === 'summit' && seen.some(x => x.type === e.type && x.country === e.country && titleOf(x.source) !== titleOf(e.source) && lead(x) === l
        && Math.abs(Date.parse(x.date) - Date.parse(e.date)) <= 864e5)) { merged++; return false; }
      seen.push(e);
      return true;
    });
    for (const e of d.events) {
      total++;
      const s = pickSummary(e, cache, before);
      if (s) { e.summary = s; withSummary++; } else delete e.summary;
    }
    writeFileSync(new URL(f, DATA), JSON.stringify(d));
  }
  console.log(`${withSummary} of ${total} events have a summary; ${merged} merged as one article under two titles`);
  // calendar/data/upcoming.json (the Dashboard's next events, with their keys) in step with the decades it reads.
  writeHeads('Realtime and Historical Calendars');
}

// Run when called directly, not when the tests import it. Node 24 says so itself (import.meta.main); before that the
// paths are compared, without regard to case on Windows, where "node c:\users\…" keeps the case typed.
export const samePath = (a, b, platform = process.platform) => {
  const f = p => (platform === 'win32' ? p.toLowerCase() : p);
  return f(resolve(a)) === f(resolve(b));
};
if (import.meta.main ?? (!!process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url)))) await main();
