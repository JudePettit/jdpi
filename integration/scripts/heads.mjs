// Heads: the small summary files a page reads in place of a large store, written beside the store and in step with it.
//
// Every summary here names the store it was made from, as it read it:
//   "summaryOf": { "<store path>": { "generated": "<the store's own time>", "sha1": "<hash of the store's content>" } }
// and on every commit of main that must equal the store as committed (tests/heads.test.mjs, in the whole suite, so the
// site never deploys a summary out of step with its store). The hash is of the parsed JSON written out again
// (JSON.stringify(JSON.parse(text))), so line endings and spacing cannot change it, while a store edited without being
// restamped still can.
//
// Each builder that writes a store calls writeHeads() as its last act, so a store cannot be written, on GitHub or on
// this computer, without its summaries; and `node integration/scripts/heads.mjs <store>…` (or --all) mends any that
// are out of step. A summary is written only when its content changed, so a run that changed nothing commits nothing.
//
// The summaries (all generated: never edit them by hand):
//   science|econ|digital/briefing/data/stories.head.json, briefing/data/latest.head.json
//                                  each briefing's time, stories held and most-covered topic (the Dashboard)
//   …/trends.json, …/history.json  each briefing's headline trends and the per-day counts behind them (design/prp-trends.js)
//   volatility/data/index.head.json  the newest scored day and the Volatility page's "Biggest movers · 7 days" lists
//   calendar/data/upcoming.json      the calendars' events from a week back onward, each with its key (eventKey)
//   battlefield/data/realtime.head.json, traders/data/congress.head.json, traders/data/investors.head.json,
//   science/progress/data/events.head.json, national/data/index.head.json, integration/catalog.head.json
//                                  each store's own time and what its data runs to, for the freshness lines
//
//   node integration/scripts/heads.mjs --all                 write every summary that is out of step
//   node integration/scripts/heads.mjs <store path>…         just these stores' summaries
//   node integration/scripts/heads.mjs --check [<store>…]    write nothing; list what is out of step (exit 1 if any)
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accrue, trends, emptyHistory, utcDay, LATE_HOURS } from '../../design/prp-trends.js';
import { topicsFrom, wordsOf } from '../../highbrowse/analysis.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/* ---------------------------------------------------------------- reading a store */
const readText = (root, p) => readFileSync(join(root, p), 'utf8');
export const contentHash = text => createHash('sha1').update(JSON.stringify(JSON.parse(text))).digest('hex');
// What a summary records of its store.
export function stamp(root, p) {
  const text = readText(root, p), j = JSON.parse(text);
  return { generated: typeof j.generated === 'string' ? j.generated : null, sha1: createHash('sha1').update(JSON.stringify(j)).digest('hex'), json: j };
}
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------------------------------------------------------------- the briefings */
export const BRIEFINGS = [
  { key: 'scientific', id: 'science-briefing', name: 'Scientific Briefing', short: 'Scientific', order: 1, store: 'science/briefing/data/stories.json', dir: 'science/briefing/data', head: 'stories.head.json' },
  { key: 'economics', id: 'econ-briefing', name: 'Economics Briefing', short: 'Economics', order: 2, store: 'econ/briefing/data/stories.json', dir: 'econ/briefing/data', head: 'stories.head.json' },
  { key: 'digital', id: 'digital-briefing', name: 'Digital Briefing', short: 'Digital', order: 3, store: 'digital/briefing/data/stories.json', dir: 'digital/briefing/data', head: 'stories.head.json' },
  { key: 'political', id: 'briefing', name: 'Political Briefing', short: 'Political', order: 0, store: 'briefing/data/latest.json', dir: 'briefing/data', head: 'latest.head.json' },
];

// A briefing store in three facts (stories held, its most-covered topic, when it was made): the Dashboard's line for it
// while there is too little history for trends, and the Integration Hub's daily copy (integration/data/
// briefing-activity.json, build-catalog.mjs). The topic briefings' own tally of their topics; the Political Briefing has
// political positions as well as topics, and its line keeps its most-represented position, by its outlets' stories.
export function briefingFacts(s) {
  const items = Array.isArray(s.items) ? s.items : [];
  const top = (tally, defs, key) => { let best = null; for (const def of defs || []) if (Number(tally?.[def[key]]) > 0 && (!best || tally[def[key]] > tally[best[key]])) best = def; return best?.label || null; };
  let facet = ['disciplines', 'fields', 'topics', 'areas'].find(k => Array.isArray(s[k])), topic = null;
  if (facet) {
    const tally = s.counts?.[facet] || items.reduce((t, it) => { for (const f of it[facet] || []) t[f] = (t[f] || 0) + 1; return t; }, {});
    topic = top(tally, s[facet], 'id');
  } else if (Array.isArray(s.positions)) {
    facet = 'positions';
    const pos = new Map((s.sources || []).map(x => [x.id, x.position]));
    topic = top(items.reduce((t, it) => { const p = pos.get(it.s); if (p) t[p] = (t[p] || 0) + 1; return t; }, {}), s.positions, 'key');
  }
  return { items: items.length, days: s.keepDays ?? null, topic, facet: facet || null, generated: s.generated || null };
}

// The Political Briefing's ten standing topics, as q/briefing.html and Highbrowse match them (never a viewer's own).
const POLITICAL_TOPICS = topicsFrom(null);
const keyOf = v => createHash('sha1').update(String(v)).digest('hex').slice(0, 12);
const dayOf = v => { const t = Date.parse(v); return Number.isFinite(t) ? utcDay(t) : null; };

// A store as the trend rule reads it: each story's key, UTC day and topics. The Political Briefing: hard news only
// (its own soft tag `c` left out), each story keyed by its address (its items have no id), its topics matched in the
// headline and its summary; the others: every item, keyed by its id, its disciplines or fields as the store has them.
export function snapshot(b, s) {
  if (b.key === 'political') {
    return {
      generated: s.generated, keepDays: s.keepDays ?? 7,
      topics: POLITICAL_TOPICS.map(t => ({ id: t.id, label: t.label, short: t.label })),
      items: (s.items || []).filter(i => i && i.t && i.u && !i.c).map(i => {
        const text = `${i.t} ${i.d || ''}`, words = wordsOf(text);
        return { key: keyOf(i.u), day: dayOf(i.p), tp: POLITICAL_TOPICS.filter(t => t.test(text, words)).map(t => t.id) };
      }).filter(i => i.day),
    };
  }
  const fk = Array.isArray(s.disciplines) ? 'disciplines' : 'fields';
  return {
    generated: s.generated, keepDays: s.keepDays ?? 7,
    topics: (s[fk] || []).map(f => ({ id: String(f.id), label: String(f.label), short: String(f.short || f.label) })),
    items: (s.items || []).filter(i => i && i.title && i.url).map(i => ({ key: /^[0-9a-f]{12}$/.test(String(i.id)) ? String(i.id) : keyOf(i.id || i.url), day: dayOf(i.published), tp: Array.isArray(i[fk]) ? i[fk].map(String) : [] })).filter(i => i.day),
  };
}

const HISTORY_ABOUT = 'Stories a UTC day by topic, kept as the briefing\'s store rolls forward (design/prp-trends.js). Generated by integration/scripts/heads.mjs; never edit by hand.';
const TRENDS_ABOUT = 'Headline trends: each topic\'s share of the briefing\'s stories this week against the weeks before (design/prp-trends.js METHOD). Generated by integration/scripts/heads.mjs; never edit by hand.';

function briefingSummaries(root, b, store) {
  const st = stamp(root, b.store), s = st.json;
  const summaryOf = { [b.store]: { generated: st.generated, sha1: st.sha1 } };
  const facts = briefingFacts(s);
  const head = { summaryOf, briefing: b.key, id: b.id, name: b.name, generated: facts.generated, keepDays: facts.days, stories: facts.items, topic: facts.topic, facet: facts.facet };
  const hp = `${b.dir}/history.json`;
  const prev = existsSync(join(root, hp)) ? JSON.parse(readText(root, hp)) : null;
  const prevHistory = prev?.history || emptyHistory();
  const snap = snapshot(b, s);
  const history = accrue(prevHistory, snap, { lateHours: LATE_HOURS[b.key] });
  const histFile = { summaryOf, briefing: b.key, about: HISTORY_ABOUT, lateHours: LATE_HOURS[b.key], rebuilt: prev?.rebuilt || null, history };
  const t = trends(history, { generated: s.generated, topics: snap.topics });
  const trendFile = {
    summaryOf, briefing: b.key, id: b.id, name: b.name, short: b.short, about: TRENDS_ABOUT, generated: s.generated,
    stories: facts.items, topic: facts.topic, facet: facts.facet,
    history: { since: history.since, from: Object.keys(history.days).find(d => history.days[d].ok) || null, rebuilt: prev?.rebuilt || null },
    ...t,
  };
  return { [`${b.dir}/${b.head}`]: head, [hp]: histFile, [`${b.dir}/trends.json`]: trendFile };
}

/* ---------------------------------------------------------------- Geopolitical Volatility */
// The Geopolitical Volatility page's "Biggest movers · 7 days" panel, worked out exactly as q/volatility.html does it on
// its latest day (derive, then renderMovers). A country's 7-day change is the mean of its scored days among the last 7
// days of the series minus the mean of its scored days among the 7 before, the days being those of the global series
// (VOL.global), as the page counts them; a country needs a score in both weeks. The page lists the six biggest rises
// (Rising) and the six biggest falls (Easing) among all such countries, whatever their coverage. This holds just those
// countries (twelve, or fewer when fewer moved; one in both lists once), in the page's order (change descending,
// compared at full precision as the page does, so ties fall the same way), with avg7 and change7 rounded to the one
// decimal the page shows. coverage is the latest day's level, as the page's country profile gives it (null when the
// country has no row that day). The Dashboard keeps the medium and high ones.
export function volatilityMovers(VOL) {
  const DAYS = VOL.global.map(g => g[0]);
  const i = DAYS.length - 1, d = DAYS[i], d7 = DAYS[Math.max(0, i - 7)], d14 = DAYS[Math.max(0, i - 14)];
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const LEVEL = { h: 'high', m: 'medium', l: 'low', i: 'insufficient' };
  const moved = Object.entries(VOL.countries).map(([iso3, c]) => {
    const rows = (c.days || []).filter(r => r[0] <= d), row = rows.at(-1)?.[0] === d ? rows.at(-1) : null;
    const scored = rows.filter(r => r[1] != null);
    const last7 = scored.filter(r => r[0] > d7).map(r => r[1]), prev7 = scored.filter(r => r[0] <= d7 && r[0] > d14).map(r => r[1]);
    return { iso3, name: c.name, score: row?.[1] ?? null, avg7: last7.length ? mean(last7) : null, change7: last7.length && prev7.length ? mean(last7) - mean(prev7) : null, coverage: LEVEL[row?.[5]] || null };
  }).filter(c => c.change7 != null).sort((a, b) => b.change7 - a.change7);
  const one = v => +v.toFixed(1);
  return {
    date: d, countries: moved.length,
    records: moved.filter((c, k) => k < 6 || k >= moved.length - 6).map(c => ({ iso3: c.iso3, name: c.name, score: c.score, avg7: one(c.avg7), change7: one(c.change7), coverage: c.coverage, date: d })),
  };
}

/* ---------------------------------------------------------------- the calendars */
// An event's key in an address: its date, its country and its title, each folded to plain lower-case letters and
// digits with hyphens between ("2026-11-29~honduras~general-election"). q/calendar.html keeps an exact copy of this
// function (tests/calendar.test.mjs holds the two equal).
export function eventKey(e) {
  const slug = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return `${String(e.date || '')}~${slug(e.country)}~${slug(e.title)}`;
}
const decadeFiles = root => (existsSync(join(root, 'calendar/data')) ? readdirSync(join(root, 'calendar/data')).filter(f => /^\d{4}s\.json$/.test(f)).sort().map(f => `calendar/data/${f}`) : []);
// The decade files upcoming.json reads: the one holding the day a week before the calendars were built (the newest
// decade file's own time, so the choice depends on the data alone), and every later one.
function calendarStores(root) {
  const files = decadeFiles(root);
  if (!files.length) return [];
  const built = Date.parse(JSON.parse(readText(root, files.at(-1))).generated) || Date.now();
  const from = utcDay(built - 7 * 864e5).slice(0, 3) + '0s';
  return files.filter(p => p.slice(-10, -5) >= from);
}

/* ---------------------------------------------------------------- the table of stores and their summaries */
const simpleHead = (store, facts) => root => {
  const st = stamp(root, store);
  return { [store.replace(/\.json$/, '.head.json')]: { summaryOf: { [store]: { generated: st.generated, sha1: st.sha1 } }, generated: st.generated, ...facts(st.json) } };
};
const maxOf = xs => xs.filter(x => typeof x === 'string' && x).sort().at(-1) || null;

export const HEADS = [
  ...BRIEFINGS.map(b => ({ name: b.name, stores: () => [b.store], heads: [`${b.dir}/${b.head}`, `${b.dir}/trends.json`, `${b.dir}/history.json`], make: root => briefingSummaries(root, b) })),
  {
    name: 'Geopolitical Volatility', stores: () => ['volatility/data/index.json'], heads: ['volatility/data/index.head.json'],
    make: root => {
      const st = stamp(root, 'volatility/data/index.json'), V = st.json;
      return { 'volatility/data/index.head.json': { summaryOf: { 'volatility/data/index.json': { generated: st.generated, sha1: st.sha1 } }, generated: st.generated, latest: V.latest || null, days: V.days ?? null, page: 'q/volatility.html', movers: volatilityMovers(V) } };
    },
  },
  {
    name: 'Realtime and Historical Calendars', stores: calendarStores, heads: ['calendar/data/upcoming.json'],
    make: root => {
      const stores = calendarStores(root), summaryOf = {}, events = [];
      let generated = null;
      for (const p of stores) {
        const st = stamp(root, p);
        summaryOf[p] = { generated: st.generated, sha1: st.sha1 };
        if (!generated || (st.generated && st.generated > generated)) generated = st.generated;
        events.push(...(st.json.events || []));
      }
      const from = utcDay(Date.parse(generated || new Date().toISOString()) - 7 * 864e5);
      const list = events.filter(e => e && typeof e.date === 'string' && e.date >= from).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .map(e => ({ key: eventKey(e), date: e.date, country: e.country || '', title: e.title || '', type: e.type || '', status: e.status || '' }));
      return { 'calendar/data/upcoming.json': { summaryOf, generated, from, about: 'The calendars\' events from a week before the build onward, each with the key q/calendar.html opens it by (?event=). Generated by integration/scripts/heads.mjs; never edit by hand.', events: list } };
    },
  },
  { name: 'Realtime Battlefield', stores: () => ['battlefield/data/realtime.json'], heads: ['battlefield/data/realtime.head.json'],
    make: simpleHead('battlefield/data/realtime.json', j => ({ latest: j.latest || null, version: j.version || null, source: j.source || null, months: Array.isArray(j.months) ? j.months.length : null })) },
  { name: 'Auto Trader House trades', stores: () => ['traders/data/congress.json'], heads: ['traders/data/congress.head.json'],
    make: simpleHead('traders/data/congress.json', j => ({ trades: Array.isArray(j.trades) ? j.trades.length : null, latestFiled: maxOf((j.trades || []).map(t => t?.filed)), latestTrade: maxOf((j.trades || []).map(t => t?.date)) })) },
  { name: 'Auto Trader 13F holdings', stores: () => ['traders/data/investors.json'], heads: ['traders/data/investors.head.json'],
    make: simpleHead('traders/data/investors.json', j => ({ investors: Array.isArray(j.investors) ? j.investors.length : null, latestPeriod: maxOf((j.investors || []).map(x => x?.period)), latestFiled: maxOf((j.investors || []).map(x => x?.filed)) })) },
  { name: 'Invention Timeline', stores: () => ['science/progress/data/events.json'], heads: ['science/progress/data/events.head.json'],
    make: simpleHead('science/progress/data/events.json', j => ({ events: Array.isArray(j.events) ? j.events.length : null })) },
  { name: 'National Analysis', stores: () => ['national/data/index.json'], heads: ['national/data/index.head.json'],
    make: simpleHead('national/data/index.json', j => ({ countries: Array.isArray(j.countries) ? j.countries.length : null, years: j.years || null })) },
  { name: 'Integration Hub catalogue', stores: () => ['integration/catalog.json'], heads: ['integration/catalog.head.json'],
    make: simpleHead('integration/catalog.json', j => ({ datasets: Array.isArray(j.datasets) ? j.datasets.length : null })) },
];

const norm = p => String(p).split(sep).join('/').replace(/^\.\//, '');
// The summaries of these stores (paths from the repository's root, or names in HEADS).
const pick = (root, stores) => HEADS.filter(h => existsSync(join(root, h.stores(root)[0] || '\0')) && (!stores || stores.some(s => h.name === s || h.stores(root).includes(norm(s)) || h.heads.includes(norm(s)))));

/** Write the summaries of `stores` (all when none given) that changed; returns the paths written. Never throws on a
 *  missing store: a store that is not there has no summaries to write. */
export function writeHeads(stores = null, { root = ROOT, quiet = false } = {}) {
  const list = stores == null ? null : (Array.isArray(stores) ? stores : [stores]).map(s => norm(relative(root, resolve(root, s))));
  const written = [];
  for (const h of pick(root, list)) {
    for (const [p, obj] of Object.entries(h.make(root))) {
      const file = join(root, p);
      const old = existsSync(file) ? (() => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } })() : null;
      if (old && sameJson(old, obj)) continue;
      writeFileSync(file, JSON.stringify(obj));
      written.push(p);
    }
  }
  if (!quiet) console.log(written.length ? `Summaries written: ${written.join(', ')}` : 'Summaries already in step with their stores.');
  return written;
}

/** Every summary that is missing or out of step with its store, as plain sentences (none: all in step). */
export function checkHeads(stores = null, { root = ROOT } = {}) {
  const list = stores == null ? null : (Array.isArray(stores) ? stores : [stores]).map(norm);
  const problems = [];
  for (const h of pick(root, list)) {
    const want = Object.fromEntries(h.stores(root).map(p => { const st = stamp(root, p); return [p, { generated: st.generated, sha1: st.sha1 }]; }));
    for (const p of h.heads) {
      if (!existsSync(join(root, p))) { problems.push(`${p} is missing`); continue; }
      let j;
      try { j = JSON.parse(readText(root, p)); } catch { problems.push(`${p} is not JSON`); continue; }
      for (const [store, w] of Object.entries(want)) {
        const got = j.summaryOf?.[store];
        if (!got) problems.push(`${p} does not name ${store}`);
        else if (got.generated !== w.generated) problems.push(`${p} was made from ${store} of ${got.generated}, but the store is of ${w.generated}`);
        else if (got.sha1 !== w.sha1) problems.push(`${p} was made from another version of ${store} (same time ${w.generated}, different content)`);
      }
      for (const store of Object.keys(j.summaryOf || {})) if (!(store in want)) problems.push(`${p} names ${store}, which it should not read`);
    }
  }
  return problems;
}

/* ---------------------------------------------------------------- the command line */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), check = args.includes('--check'), all = args.includes('--all');
  const stores = args.filter(a => !a.startsWith('--'));
  const which = all || !stores.length ? null : stores;
  if (check) {
    const problems = checkHeads(which);
    for (const p of problems) console.error(p);
    if (problems.length) { console.error('Run node integration/scripts/heads.mjs --all to bring the summaries into step.'); process.exit(1); }
    console.log('Every summary is in step with its store.');
  } else writeHeads(which);
}
