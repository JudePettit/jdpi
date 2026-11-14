// Highbrowse: the analysis and the search behind its landing page, with no DOM, shared by the page (app.js) and the
// tests (tests/highbrowse.test.mjs). It reads the four briefings' own stores as they are (the Political Briefing's
// briefing/data/latest.json and the Scientific, Economics and Digital Briefings' data/stories.json), turns every item
// into one shape, and works out, for the last 24 hours and for the last 7 days: the biggest stories (headlines from
// several outlets grouped as one story), the biggest topics (the names and terms the most outlets used), what each
// briefing covers most, the stories and terms several briefings share, and how the Political Briefing's five positions
// spread across its stories. It also searches all four at once, by words in titles and summaries, with briefing, date
// and topic filters. Everything here is plain data: the page escapes every string before it reaches the DOM.
// Free sources lead (design/prp-access.js, Jude's rule of 6 November 2026): each item carries its source's access class
// (`acc`), a story's lead is a headline anyone can read wherever one of its outlets is free, and a story only paywalled
// or sign-up sources carry never takes the top place of a list (it keeps its place lower down).

import '../design/prp-access.js'; // globalThis.PRPAccess
const { PRPAccess } = globalThis;
/** Whether an item is free to read: its source's class, as normalise gave it (no class counts as free). */
export const isFree = i => PRPAccess.isFree(i?.acc);
const leadFree = (list, free) => PRPAccess.leadFree(list, free);
// The access table's name for each briefing (design/prp-access.json keys sources as "<briefing>:<feed id>").
const ACCESS_KEY = { political: 'political', scientific: 'science', economics: 'econ', digital: 'digital' };

/* ---------------------------------------------------------------- the four briefings */
// `page` and `data` are paths from the site root; `cat` is the briefing's categorical colour (--prp-cat-<n>, in the
// fixed order); `hashTopic` is the hash key its page reads a topic from (the Political Briefing keeps its topics in the
// viewer's browser, so it has none) and `all` what that key takes for every topic.
export const BRIEFINGS = [
  { key: 'political', id: 'briefing', name: 'Political Briefing', short: 'Political', page: 'q/briefing.html', data: 'briefing/data/latest.json', cat: 1, hashTopic: null, all: null },
  { key: 'scientific', id: 'science-briefing', name: 'Scientific Briefing', short: 'Scientific', page: 'science/briefing/index.html', data: 'science/briefing/data/stories.json', cat: 2, hashTopic: 'd', all: 'all' },
  { key: 'economics', id: 'econ-briefing', name: 'Economics Briefing', short: 'Economics', page: 'econ/briefing/index.html', data: 'econ/briefing/data/stories.json', cat: 3, hashTopic: 'f', all: 'all' },
  { key: 'digital', id: 'digital-briefing', name: 'Digital Briefing', short: 'Digital', page: 'digital/briefing/index.html', data: 'digital/briefing/data/stories.json', cat: 4, hashTopic: 'f', all: 'all' },
];
export const BRIEFING = Object.fromEntries(BRIEFINGS.map(b => [b.key, b]));

// The Political Briefing's five positions, in its order (briefing/data/latest.json `positions` gives their labels).
export const POSITIONS = ['far_left', 'left', 'centre', 'right', 'far_right'];
export const POSITION_LABELS = { far_left: 'Far left', left: 'Left', centre: 'Centre', right: 'Right', far_right: 'Far right' };

// The Political Briefing's default topics, exactly as q/briefing.html defines them (DEFAULT_TOPICS there; the test holds
// the two in step). A viewer who has edited their topics in the Political Briefing sees theirs here (topicsFrom).
export const POLITICAL_TOPICS = [
  ['US politics', 'Trump, Congress, Senate, White House, Republicans, Democrats, midterms, Supreme Court'],
  ['Ukraine & Russia', 'Ukraine, Ukrainian, Russia, Russian, Kremlin, Putin, Zelensky, Kyiv, Moscow'],
  ['Middle East', 'Israel, Israeli, Gaza, Hamas, Hezbollah, Iran, Iranian, West Bank, Netanyahu, Lebanon, Syria, Yemen, Houthi'],
  ['China', 'China, Chinese, Beijing, Xi Jinping, Taiwan, Hong Kong'],
  ['UK politics', 'Starmer, Labour, Tory, Tories, Conservatives, Reform UK, Farage, Westminster, Downing Street, Badenoch, Burnham'],
  ['Europe', 'EU, European Union, Brussels, Macron, Merz, Meloni, Le Pen, NATO, European Commission'],
  ['Economy', 'inflation, recession, interest rates, Federal Reserve, Fed, tariffs, tariff, GDP, jobs report, stocks, markets'],
  ['Immigration', 'immigration, immigrants, migrants, migrant, asylum, border, deportation, deportations, ICE'],
  ['AI & tech', 'AI, artificial intelligence, OpenAI, Anthropic, Google, Meta, Nvidia, chatbot, Silicon Valley'],
  ['Climate & energy', 'climate, emissions, net zero, renewable, oil, gas, OPEC, heatwave, wildfire, hurricane'],
];
export const TOPICS_KEY = 'jdpi.briefing.topics.v1'; // where the Political Briefing keeps a viewer's own topics

export const WINDOWS = { '24h': 24, '3d': 72, '7d': 168 };
export const WINDOW_LABELS = { '24h': 'Last 24 hours', '3d': 'Last 3 days', '7d': 'Last 7 days' };
const H = 36e5, DAY = 24 * H;

/* ---------------------------------------------------------------- text */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Lower case, accents off, curly quotes straight: how the search and the terms compare text. Keeps the length of
 *  almost all text (an accented letter folds to one letter), which the page's highlighting relies on. */
export const fold = s => String(s ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[‘’ʼ′]/g, "'").replace(/[“”]/g, '"').toLowerCase();
export const slug = s => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'topic'; // "Ukraine & Russia" → ukraine-russia

// Words that carry no story on their own: function words, the verbs and fillers of headlines ("says", "new", "amid"),
// the calendar, and the words every paper's announcement uses ("study", "finds"). A term is a word left over. ("us" is
// not here: in lower case it is the pronoun, which terms() drops by its case, and in capitals the country.)
const STOP = new Set(`a about above across after again against ago ahead all almost along already also although always am amid among an and
another any anyone anything are around as at away back be became because become becomes been before behind being below best better between
beyond big bigger biggest both but by call called calls came can cannot could did do does doing done down during each early either else even
ever every few first five for four from further get gets getting give given gives go goes going gone good got great had has have having he her
here hers herself him himself his how however i if in inside into is it its itself just keep know known last late later latest least less let
like likely little live long look looks lot made major make makes making many may me might more most much must my near nearly need needs never
new news next nine no none nor not now of off often old on once one ones only onto or other others our out over own part past per perhaps
put rather re really said same say saying says second see seen set seven several she should show shows since six so some something soon still
such take taken takes talk talks tell ten than that the their them themselves then there these they thing things think third this those though
three through thus time times to today told too top toward towards two under until up upon use used uses using very via want wants was way
ways we well went were what whats when where whether which while who whole whom whose why will with within without would yet you your yours
year years month months week weeks day days daily weekly tonight yesterday tomorrow morning night pm
monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december
report reports reported reporting according update updates watch video videos photo photos opinion analysis exclusive breaking explainer
podcast newsletter review reviews interview column editorial letter letters read reading
study studies finds find found shows suggests suggest reveals reveal researcher researchers scientist scientists research paper papers
plan face warn urge slam blast vow vows seek seeks claim claims deny denies unveil announce begin begins start starts remain continue expect
expected help helps lead leads leave leaves join joins turn turns bring brings run runs win wins lose loses rise rises fall falls drop drops
boost spark sparks fuel fuels hit hits key move moves sets reportedly allegedly
here's heres it's don't dont can't cant won't wont isn't isnt doesn't doesnt didn't didnt that's thats what's there's theres
mr mrs ms dr st vs`.split(/\s+/).filter(Boolean));
// Names of several words read as one term, checked before the stop list could take "new" out of New York.
const JOIN = new Map();
for (const p of [['new', 'york'], ['new', 'jersey'], ['new', 'zealand'], ['new', 'delhi'], ['new', 'mexico'], ['new', 'hampshire'], ['new', 'orleans'],
  ['hong', 'kong'], ['west', 'bank'], ['white', 'house'], ['supreme', 'court'], ['united', 'nations'], ['united', 'kingdom'], ['united', 'states'],
  ['european', 'union'], ['federal', 'reserve'], ['wall', 'street'], ['silicon', 'valley'], ['downing', 'street'], ['prime', 'minister'],
  ['climate', 'change'], ['artificial', 'intelligence'], ['machine', 'learning'], ['interest', 'rates'], ['interest', 'rate'], ['bank', 'of', 'england'],
  ['los', 'angeles'], ['san', 'francisco'], ['saudi', 'arabia'], ['south', 'africa'], ['south', 'korea'], ['north', 'korea'], ['el', 'salvador']]) {
  (JOIN.get(p[0]) || JOIN.set(p[0], []).get(p[0])).push(p);
}
const SAME = { 'united-states': 'us', usa: 'us', 'united-kingdom': 'uk', 'united-nations': 'un', 'european-union': 'eu', 'artificial-intelligence': 'ai', 'interest-rate': 'interest-rates' };
// A term's light stem: possessive and plural off ("tariffs" → "tariff"), but not from words that only look plural
// (Texas, virus, analysis, Paris, boss). Stems are for comparing; the page shows each term as the headlines wrote it.
const stem = w => (w.length > 4 && /[^siua]s$/.test(w) ? (/ies$/.test(w) && w.length > 5 ? w.slice(0, -3) + 'y' : w.slice(0, -1)) : w);

// Words, read character by character: a regular expression with Unicode classes (\p{L}) is many times slower in the
// browser, and these run over every headline and summary. A letter or digit is any \p{L} or \p{N} (ASCII at once, the
// rest asked once per character and remembered). `scan` gives runs of letters and digits; with `inner` a word may also
// hold those characters inside it (an apostrophe, a full stop, &, a hyphen: "U.S.", "AT&T", "far-right", "Trump's").
const LN = new Map();
const isLN = c => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || (c >= 48 && c <= 57)
  || (c > 127 && (LN.get(c) ?? (LN.set(c, /[\p{L}\p{N}]/u.test(String.fromCharCode(c))), LN.get(c))));
const INNER = new Set([39, 8217, 46, 38, 45]); // ' ’ . & -
export function scan(text, inner = false) {
  const s = String(text || ''), out = [];
  let start = -1;
  for (let i = 0; i <= s.length; i++) {
    const c = i < s.length ? s.charCodeAt(i) : 32;
    if (isLN(c) || (inner && start >= 0 && INNER.has(c))) { if (start < 0) start = i; }
    else if (start >= 0) { out.push(s.slice(start, i)); start = -1; }
  }
  return out;
}
const WORDS = new Map(); // a word as written → { k, f }, worked out once (headlines repeat their words a great deal)
function word(w) {
  let x = WORDS.get(w);
  if (x) return x;
  const f = w.replace(/['’]s$/i, '').replace(/[.'’&-]+$/, '');
  let k = fold(f);
  if (/^U\.S(\.A)?$/.test(f) || f === 'US' || f === 'USA') k = 'us';
  else if (k === 'us') k = '';
  else if (/^U\.K$/.test(f)) k = 'uk';
  else if (/^U\.N$/.test(f)) k = 'un';
  else if (f === 'AI' || f === 'A.I') k = 'ai';
  x = { k, f };
  if (WORDS.size < 200000) WORDS.set(w, x);
  return x;
}
/**
 * The terms of a headline, in order, each { k: its key, f: the words as written, p, e: the first and last word's
 * place }: words folded, joined where a name spans several (New York, White House), stemmed, and without the stop list
 * or bare numbers. "US", "U.S." and "AI" in capitals are the country and the field whatever the case around them;
 * "us" in lower case is a pronoun.
 */
export function terms(text) {
  const words = scan(text, true).map(word);
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w.k) continue;
    const j = (JOIN.get(w.k) || []).find(p => p.every((x, n) => words[i + n]?.k === x));
    if (j) { out.push({ k: j.join('-'), f: words.slice(i, i + j.length).map(x => x.f).join(' '), p: i, e: i + j.length - 1 }); i += j.length - 1; continue; }
    out.push({ k: w.k, f: w.f, p: i, e: i });
  }
  const res = [];
  for (const w of out) {
    let k = SAME[w.k] || w.k;
    if (!k.includes('-') && !k.includes('.')) k = stem(k);
    if (k.length < 2 || STOP.has(k) || STOP.has(w.k) || /^[\d.,]+$/.test(k) || /^\d+(st|nd|rd|th|am|pm|m|bn|k|s|mph|kg|km|ft)$/.test(k)) continue;
    res.push({ k, f: w.f, p: w.p, e: w.e });
  }
  return res;
}

/* ---------------------------------------------------------------- time (the briefings' own rules) */
/** Feeds that give a date without a time are stored at midnight UTC; they count from midday UTC of that date. */
export const isDateOnly = iso => /T00:00:00(?:\.000)?Z$/.test(String(iso || ''));
export const effectiveTime = iso => (Date.parse(iso) || 0) + (isDateOnly(iso) ? 12 * H : 0);
const pad = n => String(n).padStart(2, '0');
export const localDay = ms => { const t = new Date(ms); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
/** The day an item belongs to: its UTC date when the feed gave only a date, otherwise the viewer's local date. */
export const dayKey = iso => (isDateOnly(iso) ? String(iso).slice(0, 10) : localDay(Date.parse(iso) || 0));
/** The seven local days that end on the reference time's day, oldest first. */
export const weekDays = ref => Array.from({ length: 7 }, (_, k) => localDay(ref - (6 - k) * DAY));

/**
 * The time every window counts back from: now, or the newest of the four refreshes when even that is more than a day
 * old (a failed refresh then leaves the last stories on the page, and the page says how old they are).
 */
export function referenceTime(stores, now = Date.now()) {
  const newest = Math.max(0, ...stores.map(s => Date.parse(s?.generated) || 0));
  return newest && now - newest > DAY ? newest : now;
}

/* ---------------------------------------------------------------- the Political Briefing's topics */
/** Topics as the Political Briefing keeps them ([{name, keywords, paused}]), or its defaults; paused ones are left out. */
export function topicsFrom(saved) {
  const list = Array.isArray(saved) && saved.length ? saved : POLITICAL_TOPICS.map(([name, keys]) => ({ name, keywords: keys.split(',').map(s => s.trim()) }));
  const seen = new Set();
  return list.filter(t => t && !t.paused && typeof t.name === 'string' && t.name.trim() && Array.isArray(t.keywords) && t.keywords.some(k => typeof k === 'string' && k.trim())).map(t => {
    let id = slug(t.name);
    while (seen.has(id)) id += '-2';
    seen.add(id);
    const keywords = t.keywords.filter(k => typeof k === 'string' && k.trim()).map(k => k.trim());
    return { id, label: t.name.trim(), keywords, test: matcher(keywords) };
  });
}
// The Political Briefing's matching: whole words; short capitalised keywords such as "UN" or "AI" match case-sensitively
// (q/briefing.html, matcher). A keyword of letters and digits alone matches exactly where it is a whole word of the text,
// so those are looked up among the text's words (wordsOf, worked out once per item); only keywords of several words,
// or with other characters, run the Political Briefing's own regular expression, and only when their first word is there.
export const wordsOf = text => { const ws = scan(text); return { lo: new Set(ws.map(w => w.toLowerCase())), as: new Set(ws) }; };
function matcher(keywords) {
  const e = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const plain = w => /^[\p{L}\p{N}]+$/u.test(w), caps = w => /^[A-Z0-9]{1,4}$/.test(w);
  const exact = keywords.filter(w => plain(w) && caps(w)), word = keywords.filter(w => plain(w) && !caps(w)).map(w => w.toLowerCase());
  const other = keywords.filter(w => !plain(w));
  const re = other.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${other.map(e).join('|')})(?![\\p{L}\\p{N}])`, 'iu') : null;
  const firsts = other.map(w => w.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)[0] || '');
  return (text, words = wordsOf(text)) => exact.some(w => words.as.has(w)) || word.some(w => words.lo.has(w))
    || (!!re && firsts.some(w => !w || words.lo.has(w)) && re.test(text));
}

/* ---------------------------------------------------------------- one shape for every item */
/**
 * A briefing's store as Highbrowse items:
 *   { b: briefing key, id, t: title, d: summary, u: article URL, at: time (ms), day, dateOnly: the feed gave a date and
 *     no time (or, in the Economics Briefing, no date: `at` is when the feed changed), src: outlet, sid: outlet id,
 *     tp: [topic ids], type: 'paper' | 'news' (the three subject briefings), pos: position (the Political Briefing),
 *     soft: sport, entertainment or lifestyle (the Political Briefing's own tag, hidden by its "Hard news only"),
 *     tier, caution: the outlet's factual reliability is rated mixed or low, acc: its access class }
 * with the briefing's topics ([{id, label, short}]), when it was generated and how many days it keeps.
 * `access` is the access table (PRPAccess.table): each item is classed by its feed, its address and its publisher's own
 * mark. Without one, an item keeps the class its briefing's builder stored (`access`), and the Political Briefing's
 * count as free.
 */
export function normalise(key, data, { topics = topicsFrom(null), access = null } = {}) {
  const cls = (id, url, stored, mark) => (access ? access.classify({ briefing: ACCESS_KEY[key], id, url, mark }) : stored || 'free');
  const b = BRIEFING[key];
  const base = { key, generated: data?.generated || null, keepDays: data?.keepDays || 7, topics: [], items: [] };
  if (!b || !data || !Array.isArray(data.items)) return { ...base, missing: true };
  if (key === 'political') {
    const src = new Map((data.sources || []).map(s => [s.id, s]));
    const items = data.items.filter(i => i && i.t && i.u).map((i, n) => {
      const s = src.get(i.s) || {}, text = `${i.t} ${i.d || ''}`, words = wordsOf(text);
      return { b: key, id: `p${n}`, t: String(i.t), d: i.d && i.d !== i.t ? String(i.d) : '', u: String(i.u), at: Date.parse(i.p) || 0, day: dayKey(i.p), src: s.name || String(i.s), sid: String(i.s),
        tp: topics.filter(t => t.test(text, words)).map(t => t.id), type: null, pos: POSITIONS.includes(s.position) ? s.position : null, soft: !!i.c, tier: null, caution: !!s.caution,
        acc: cls(String(i.s), String(i.u), null, null) };
    });
    const labels = Object.fromEntries((data.positions || []).map(p => [p.key, p.label]));
    return { ...base, topics: topics.map(({ id, label }) => ({ id, label, short: label })), positions: POSITIONS.map(k => ({ key: k, label: labels[k] || POSITION_LABELS[k] })),
      perPosition: data.perPosition || 10, items };
  }
  const facets = data.disciplines || data.fields || [], fk = data.disciplines ? 'disciplines' : 'fields';
  const src = new Map((data.sources || []).map(s => [s.id, s]));
  const items = data.items.filter(i => i && i.title && i.url).map(i => {
    const s = src.get(i.source) || {};
    return { b: key, id: String(i.id), t: String(i.title), d: i.summary ? String(i.summary) : '', u: String(i.url), at: effectiveTime(i.published), day: dayKey(i.published),
      dateOnly: isDateOnly(i.published) || !!i.undated, src: s.outlet || s.name || String(i.source), sid: String(s.outletId || i.source), tp: Array.isArray(i[fk]) ? i[fk].map(String) : [],
      type: i.type === 'paper' ? 'paper' : 'news', pos: null, soft: false, tier: Number.isFinite(i.tier) ? i.tier : null, caution: false,
      acc: cls(String(i.source), String(i.url), i.access, i.accessMark) };
  });
  return { ...base, topics: facets.map(f => ({ id: String(f.id), label: String(f.label), short: String(f.short || f.label) })), items };
}

/* ---------------------------------------------------------------- links into the briefings */
/**
 * A briefing page's address (from the site root), with a search, a topic and a window in the hash its page reads.
 * The subject briefings match every word of `q` in an item's title or summary, the Political Briefing `q` within a
 * headline; both read at most 120 characters. The subject pages remember a viewer's last discipline or field, so their
 * links name one ("all" when none), or the story might be filtered out. The Political Briefing hides sport,
 * entertainment and lifestyle by default ("Hard news only"), so a link to one of those says `soft` (soft=1, which it
 * shows on that visit only); on a hash move it also clears any topic or filter picked there before.
 */
export function briefingPage(key, { q = '', topic = '', w = '7d', soft = false } = {}) {
  const b = BRIEFING[key];
  if (!b) return '';
  const p = new URLSearchParams();
  if (b.hashTopic) p.set(b.hashTopic, topic || b.all);
  if (w && w !== '3d') p.set('w', w);
  if (q) p.set('q', String(q).slice(0, 120));
  if (soft && key === 'political') p.set('soft', '1');
  const h = p.toString();
  return b.page + (h ? '#' + h : '');
}
/** Where an item opens in its briefing: the briefing's page searching for its headline over seven days. */
export const itemPage = item => briefingPage(item.b, { q: item.b === 'political' ? item.t : item.t.replace(/\s+/g, ' ').trim(), soft: item.soft });

/* ---------------------------------------------------------------- windows */
/** Items in a window: '24h', '3d' or '7d' back from the reference time, or one day ('2026-11-02'). */
export function inWindow(items, w, ref) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(w))) return items.filter(i => i.day === w);
  const since = ref - (WINDOWS[w] || WINDOWS['7d']) * H, until = ref + 36 * H; // feeds a little ahead of the clock still count
  return items.filter(i => i.at >= since && i.at <= until);
}

/* ---------------------------------------------------------------- stories: headlines grouped */
/**
 * Groups items into stories: two headlines are one story when their terms overlap enough, each term weighted by how
 * rare it is (a shared "Mamdani" counts for far more than a shared "Trump"; cosine similarity of the weighted terms,
 * at least `threshold`, and at least `minShared` terms in common). Pairs are only looked for through the rarer terms, so
 * the cost stays close to linear, and joined pairwise (union-find). A headline that joined a story through one other
 * and shares little with the rest of it is taken out again, so one headline about two stories does not join them.
 * Every item ends up in exactly one group (most are alone). Each group: { items, toks: [[keys]], tf, key: its main
 * terms, df/idf of the whole set }.
 */
export function cluster(items, { threshold = 0.5, minShared = 2, keys = items.map(i => [...new Set(terms(i.t).map(w => w.k))]) } = {}) {
  const N = items.length;
  // Terms as numbers, each headline's sorted, so two headlines' shared terms are one merge of two short lists.
  const vocab = new Map(), names = [];
  const toks = keys.map(ks => Int32Array.from(ks.map(k => { let v = vocab.get(k); if (v === undefined) { v = names.length; vocab.set(k, v); names.push(k); } return v; })).sort());
  const df = new Int32Array(names.length);
  for (const ts of toks) for (const v of ts) df[v]++;
  const w2 = Float64Array.from(df, d => Math.log(1 + N / (d || 1)) ** 2);
  const norm = toks.map(ts => { let a = 0; for (const v of ts) a += w2[v]; return Math.sqrt(a) || 1; });
  const sim = (x, y) => {
    const a = toks[x], b = toks[y];
    let i = 0, j = 0, shared = 0, dot = 0;
    while (i < a.length && j < b.length) { if (a[i] === b[j]) { shared++; dot += w2[a[i]]; i++; j++; } else if (a[i] < b[j]) i++; else j++; }
    return shared < minShared ? 0 : dot / (norm[x] * norm[y]);
  };
  const maxDf = Math.max(12, Math.round(N * 0.02));
  const post = Array.from({ length: names.length }, () => null);
  toks.forEach((ts, n) => { for (const v of ts) if (df[v] > 1 && df[v] <= maxDf) (post[v] || (post[v] = [])).push(n); });
  const parent = Int32Array.from({ length: N }, (_, n) => n);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const links = new Int32Array(N); // how many others each headline was linked to
  const stamp = new Int32Array(N); // the headline whose candidates were last looked at (+1), so each pair is weighed once
  for (let x = 0; x < N; x++) {
    for (const v of toks[x]) {
      const list = post[v];
      if (!list) continue;
      for (const y of list) {
        if (y <= x || stamp[y] === x + 1) continue;
        stamp[y] = x + 1;
        if (sim(x, y) < threshold) continue;
        links[x]++; links[y]++;
        const rx = find(x), ry = find(y);
        if (rx !== ry) parent[rx] = ry;
      }
    }
  }
  const byRoot = new Map();
  for (let n = 0; n < N; n++) { const r = find(n); (byRoot.get(r) || byRoot.set(r, []).get(r)).push(n); }
  const idfOf = new Map(names.map((k, v) => [k, Math.sqrt(w2[v])]));
  const idf = k => idfOf.get(k) ?? Math.log(1 + N);
  const groups = [];
  const make = ns => {
    const tf = new Map();
    for (const n of ns) for (const k of keys[n]) tf.set(k, (tf.get(k) || 0) + 1);
    return { members: ns, items: ns.map(n => items[n]), toks: ns.map(n => keys[n]), tf };
  };
  for (const ns of byRoot.values()) {
    if (ns.length < 3) { groups.push(make(ns)); continue; }
    // A headline linked to just one other, which shares under a fifth of its weight with the story as a whole, is a
    // bridge between two stories: it leaves, and stands alone.
    const g = make(ns), keep = [], out = [];
    for (const n of ns) {
      if (links[n] > 1) { keep.push(n); continue; }
      let dot = 0, tot = 0;
      for (const k of keys[n]) { const w = idf(k) ** 2; tot += w; dot += w * ((g.tf.get(k) || 0) - 1) / (ns.length - 1); }
      (tot && dot / tot < 0.2 ? out : keep).push(n);
    }
    groups.push(make(keep));
    for (const n of out) groups.push(make([n]));
  }
  for (const g of groups) {
    g.key = [...g.tf].filter(([, c]) => g.items.length === 1 || c >= Math.max(2, g.items.length * 0.34))
      .sort((a, b) => b[1] * idf(b[0]) - a[1] * idf(a[0]) || (a[0] < b[0] ? -1 : 1)).slice(0, 4).map(([k]) => k);
  }
  return { groups, idf, N };
}

/* ---------------------------------------------------------------- how a term is written */
// The form a term is shown in: as most headlines wrote it, in lower case when sentence-case headlines write it so (a
// common noun), never in a headline's shouting capitals unless it is an acronym of four letters or fewer.
function formsTable() {
  const forms = new Map();
  return {
    add(k, f) { const m = forms.get(k) || forms.set(k, new Map()).get(k); m.set(f, (m.get(f) || 0) + 1); },
    show(k) {
      const m = forms.get(k);
      if (!m) return k;
      const list = [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)), total = list.reduce((a, x) => a + x[1], 0);
      const lower = list.filter(([f]) => f === f.toLowerCase() && /\p{Ll}/u.test(f)).reduce((a, x) => a + x[1], 0);
      if (lower >= total * 0.2) return list.find(([f]) => f === f.toLowerCase())[0];
      const shout = f => f.length > 4 && f === f.toUpperCase() && /\p{Lu}{2}/u.test(f);
      return (list.find(([f]) => !shout(f)) || list[0])[0];
    },
  };
}

/* ---------------------------------------------------------------- the model */
/**
 * Everything the page shows, from the four stores ([political, scientific, economics, digital], any of them null when
 * it could not be read). `savedTopics` is the viewer's own Political Briefing topics, if any. The stories are found
 * once, over the last seven days' hard news (the Political Briefing's sport, entertainment and lifestyle left out, as
 * its "Hard news only" does by default); each window then ranks them by its own headlines.
 */
export function buildModel(stores, { now = Date.now(), savedTopics = null, access = null } = {}) {
  const topics = topicsFrom(savedTopics);
  const briefings = BRIEFINGS.map((b, k) => normalise(b.key, stores[k], { topics, access }));
  const items = briefings.flatMap(x => x.items);
  items.forEach((it, n) => { it.n = n; it.ht = fold(it.t); it.hay = it.ht + '\n' + fold(it.d); });
  const ref = referenceTime(stores.filter(Boolean), now);
  const week = inWindow(items, '7d', ref).filter(i => !i.soft);
  const forms = formsTable();
  for (const i of week) { i.tm = terms(i.t); for (const w of i.tm) forms.add(w.k, w.f); }
  const { groups, idf } = cluster(week, { keys: week.map(i => [...new Set(i.tm.map(w => w.k))]) });
  groups.forEach((g, n) => { g.id = 's' + n; });
  const groupOf = new Map(groups.flatMap(g => g.items.map(i => [i.n, g])));
  return { ref, now, briefings, items, week, groups, groupOf, idf, forms, topics, days: weekDays(ref) };
}

// An outlet is one outlet in whichever briefings carry it (BBC News in the Political and the Digital Briefing), and an
// article one article (the same address in two briefings, with or without "www." or a query).
const outletKey = i => i.ok || (i.ok = fold(i.src).replace(/^the\s+/, ''));
const countOutlets = items => new Set(items.map(outletKey)).size;
export const urlKey = u => String(u).replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
const byNewest = (a, b) => b.at - a.at || a.n - b.n;

/**
 * A story as the page shows it, from one group's headlines in the window: `lead` first, then one headline per other
 * outlet, newest first, then the rest; an article two briefings carry is listed once, with the other briefing's copy in
 * its `also` (each briefing's link searches for its own copy's headline, which a feed may word differently).
 * `headlines` counts articles, `outlets` outlets, `positions` the Political Briefing's publishers per position.
 */
function storyOf(model, g, win) {
  const inWin = g.items.filter(i => win.has(i.n));
  if (!inWin.length) return null;
  const size = g.items.length;
  // The lead: the headline most like the story as a whole (its terms the story's most shared, weighted by rarity).
  const score = new Map(g.items.map((i, m) => { const ts = g.toks[m]; return [i, ts.reduce((a, k) => a + ((g.tf.get(k) || 0) / size) * model.idf(k), 0) / Math.sqrt(ts.length || 1)]; }));
  const ranked = [...inWin].sort((a, b) => score.get(b) - score.get(a) || a.at - b.at || a.n - b.n);
  const byUrl = new Map(), entries = [];
  for (const i of ranked) {
    const had = byUrl.get(urlKey(i.u));
    if (had) { if (had.item.b !== i.b && !had.also.some(a => a.b === i.b)) had.also.push(i); continue; }
    const e = { item: i, also: [] };
    byUrl.set(urlKey(i.u), e); entries.push(e);
  }
  // Free sources lead: the most typical headline anyone can read, where one of the story's outlets is free.
  const lead = leadFree(entries, e => isFree(e.item))[0], seen = new Set([outletKey(lead.item)]), rest = [], dupes = [];
  for (const e of entries) if (e !== lead) (seen.has(outletKey(e.item)) ? dupes : (seen.add(outletKey(e.item)), rest)).push(e);
  const order = (a, b) => byNewest(a.item, b.item);
  const briefings = BRIEFINGS.map(b => b.key).filter(k => inWin.some(i => i.b === k));
  const positions = Object.fromEntries(POSITIONS.map(p => [p, new Set(inWin.filter(i => i.pos === p).map(i => i.sid)).size]));
  return {
    id: g.id, lead: lead.item, free: isFree(lead.item), entries: [lead, ...rest.sort(order), ...dupes.sort(order)], headlines: entries.length, outlets: countOutlets(inWin), briefings,
    keys: g.key, key: g.key.map(k => model.forms.show(k)), positions, publishers: POSITIONS.reduce((a, p) => a + positions[p], 0),
    first: Math.min(...inWin.map(i => i.at)), last: Math.max(...inWin.map(i => i.at)), query: politicalQuery(model, g, inWin.filter(i => i.b === 'political')),
  };
}
/**
 * A free headline of the same story, to offer beside one that is not free: the story's free lead (or another of its
 * free headlines) from another outlet, or, for an item shown outside a story (the search), a free headline that the
 * analysis grouped with it as one story. null for a free item, and wherever VM has not grouped a free copy with it.
 */
export function freeAlt(model, item, story = null) {
  if (!item || isFree(item)) return null;
  const pool = story ? story.entries.map(e => e.item) : (model?.groupOf?.get(item.n)?.items || []);
  return pool.find(x => x !== item && isFree(x) && outletKey(x) !== outletKey(item) && /^https?:\/\//i.test(x.u)) || null;
}

// What the Political Briefing's search box needs to show a story's headlines side by side: words its political
// headlines contain (the box matches within a headline), either one of the story's main terms as written or two of them
// side by side ("hunter biden"), whichever best covers those headlines and is rarest elsewhere: the square of the share
// of the headlines it is in, times its terms' rarity squared ("binance" shows one story, "hack" every hack, and "binance
// hack" only the headlines that put the two words together); the lead headline itself when no term is in any.
function politicalQuery(model, g, political) {
  if (!political.length) return '';
  const titles = political.map(i => i.t.toLowerCase());
  const cands = g.key.map(k => ({ f: model.forms.show(k).toLowerCase(), w: model.idf(k) ** 2 }));
  for (const a of g.key) for (const b of g.key) if (a !== b) cands.push({ f: `${model.forms.show(a)} ${model.forms.show(b)}`.toLowerCase(), w: model.idf(a) ** 2 + model.idf(b) ** 2 });
  let best = '', score = 0;
  for (const c of cands) {
    const n = titles.filter(t => t.includes(c.f)).length, s = (n / titles.length) ** 2 * c.w;
    if (n && s > score) { best = c.f; score = s; }
  }
  return best || political[0].t;
}

/* ---------------------------------------------------------------- the digest of a window */
/**
 * The analysis of one window ('24h' or '7d'):
 *   counts   { all, political, scientific, economics, digital, soft }  hard-news items in the window, and soft ones left out
 *   stories  the biggest stories: groups with headlines from two outlets or more, the most outlets first
 *   topics   the biggest topics: the terms the most outlets used in their headlines, with each briefing's count and a
 *            count for each of the seven days
 *   coverage per briefing: its items, its own topics by count, its most-used terms and its biggest story
 *   shared   { stories: groups with headlines in two briefings or more, terms: terms two briefings or more use }
 *   spread   the Political Briefing: items and publishers per position, its biggest stories' publishers per position,
 *            and the stories covered mostly from one side
 */
export function digest(model, w = '24h', { stories: nStories = 8, topics: nTopics = 12 } = {}) {
  const all = inWindow(model.items, w, model.ref), items = all.filter(i => !i.soft);
  const win = new Set(items.map(i => i.n));
  const counts = { all: items.length, soft: all.length - items.length };
  for (const b of BRIEFINGS) counts[b.key] = items.filter(i => i.b === b.key).length;

  // Only groups with two headlines or more in the window can be a story two outlets covered, be in two briefings, or be
  // a briefing's biggest story, so the rest (most headlines stand alone) are not looked at.
  const storiesAll = model.groups.filter(g => g.items.length > 1 && g.items.filter(i => win.has(i.n)).length > 1).map(g => storyOf(model, g, win));
  const big = s => s.outlets >= 2;
  const rank = (a, b) => b.outlets - a.outlets || b.headlines - a.headlines || b.last - a.last;
  // Free sources lead: a story only paywalled or sign-up sources carry (its lead is not free) never comes first.
  const free = s => s.free;
  const stories = leadFree(storiesAll.filter(big).sort(rank), free);

  // The biggest topics: names (what headlines capitalise: Trump, AI, Binance, Michigan) by the outlets that used them;
  // other words by the share of those outlets that used them in stories three outlets or more covered, where the word
  // is one of the story's main terms ("hack" in the Binance story, "stroke" in Chris Murphy's), and at least a third:
  // a word every kind of story uses ("state", "plans", "world") ranks below a name with fewer outlets.
  const storyOutlets = new Map();
  for (const s of stories) if (s.outlets >= 3) for (const k of s.keys) {
    const set = storyOutlets.get(k) || storyOutlets.set(k, new Set()).get(k);
    for (const e of s.entries) set.add(outletKey(e.item));
  }
  const weight = t => (t.named ? 1 : Math.max(1 / 3, Math.min(1, Math.max(...t.k.split(' ').map(k => storyOutlets.get(k)?.size || 0)) / t.outlets)));
  const topics = termStats(model, items, w).map(t => ({ ...t, score: t.outlets * weight(t) }))
    .sort((a, b) => b.score - a.score || b.named - a.named || b.outlets - a.outlets || b.items - a.items || (a.k < b.k ? -1 : 1));
  topics.all = topics;
  const coverage = BRIEFINGS.map(b => {
    const mine = items.filter(i => i.b === b.key), meta = model.briefings.find(x => x.key === b.key);
    const tally = new Map((meta?.topics || []).map(t => [t.id, 0]));
    for (const i of mine) for (const t of i.tp) if (tally.has(t)) tally.set(t, tally.get(t) + 1);
    const facets = (meta?.topics || []).map(t => ({ ...t, count: tally.get(t.id) })).sort((x, y) => y.count - x.count || 0);
    const untagged = mine.filter(i => !i.tp.length).length;
    // Its biggest story: the story the most of its own outlets covered, shown by its own headline (a free one where it
    // has one; a story none of its free outlets carried comes after those that one did).
    const own = leadFree(storiesAll.map(s => ({ s, mine: s.entries.map(e => [e.item, ...e.also].find(i => i.b === b.key)).filter(Boolean) })).filter(x => countOutlets(x.mine) >= 2)
      .sort((x, y) => countOutlets(y.mine) - countOutlets(x.mine) || y.mine.length - x.mine.length || y.s.last - x.s.last), x => x.mine.some(isFree));
    return {
      key: b.key, name: b.name, count: mine.length, generated: meta?.generated || null, missing: !!meta?.missing,
      papers: mine.filter(i => i.type === 'paper').length, news: mine.filter(i => i.type === 'news').length,
      facets, untagged, terms: topics.filter(t => t.by[b.key] > 0).sort((x, y) => weight(y) - weight(x) || y.byOutlets[b.key] - x.byOutlets[b.key] || y.by[b.key] - x.by[b.key]).slice(0, 6),
      story: own[0] ? { ...own[0].s, here: own[0].mine.find(isFree) || own[0].mine[0], mine: own[0].mine.length, mineOutlets: countOutlets(own[0].mine) } : null,
    };
  });

  const sharedStories = leadFree(storiesAll.filter(s => s.briefings.length >= 2)
    .sort((a, b) => b.briefings.length - a.briefings.length || b.outlets - a.outlets || b.headlines - a.headlines || b.last - a.last), free);
  // Terms two briefings or more use (twice each at least): names first (a term the headlines capitalise, such as AI,
  // China or Binance, says more across briefings than "world" or "prices"), then the most briefings, then the term
  // with the largest share of the smallest of its briefings, so the Political Briefing's size does not decide.
  const share = (t, k) => (counts[k] ? t.by[k] / counts[k] : 0);
  const sharedTerms = topics.all.filter(t => BRIEFINGS.filter(b => t.by[b.key] >= 2).length >= 2)
    .map(t => ({ ...t, briefings: BRIEFINGS.filter(b => t.by[b.key] >= 2).map(b => b.key) }))
    .sort((a, b) => b.named - a.named || b.briefings.length - a.briefings.length || Math.min(...b.briefings.map(k => share(b, k))) - Math.min(...a.briefings.map(k => share(a, k))) || b.outlets - a.outlets);

  return {
    w, ref: model.ref, counts, stories: stories.slice(0, nStories), storyCount: stories.length, topics: topics.slice(0, nTopics), coverage,
    shared: { stories: sharedStories.slice(0, 6), storyCount: sharedStories.length, terms: sharedTerms.slice(0, 10) },
    spread: spread(model, items, stories),
  };
}

// The terms of a window's headlines, each with the items and outlets that used it, per briefing and per day. Two terms
// that headlines write side by side, nearly always together (Haley Stevens, Christa Pike), are shown as one name, and
// on their own only where they are often used apart. The list is ranked by outlets, then headlines; `all` keeps every
// term two outlets used, for the shared terms.
const BI = Object.fromEntries(BRIEFINGS.map((b, x) => [b.key, x]));
function termStats(model, items, w) {
  const stat = new Map(), pairs = new Map();
  const get = (k, m) => m.get(k) || m.set(k, { k, items: 0, outlets: new Set(), by: [0, 0, 0, 0], byOutlet: [null, null, null, null], forms: m === pairs ? new Map() : null }).get(k);
  const add = (s, i, f) => {
    const x = BI[i.b];
    s.items++; s.outlets.add(outletKey(i)); s.by[x]++;
    (s.byOutlet[x] || (s.byOutlet[x] = new Set())).add(i.sid);
    if (s.forms) s.forms.set(f, (s.forms.get(f) || 0) + 1); // a name of two words is shown as headlines wrote it
  };
  // Each headline's terms once, and each pair of terms it writes side by side.
  const each = (i, onTerm, onPair) => {
    const ts = i.tm || (i.tm = terms(i.t)), once = [], twice = [];
    for (let m = 0; m < ts.length; m++) {
      const t = ts[m];
      if (!once.includes(t.k)) { once.push(t.k); onTerm(t); }
      const nx = ts[m + 1];
      if (onPair && nx && nx.p === t.e + 1 && nx.k !== t.k) { const pk = t.k + ' ' + nx.k; if (!twice.includes(pk)) { twice.push(pk); onPair(pk, t.f + ' ' + nx.f); } }
    }
  };
  // Words first; then the pairs of words that three headlines or more each used (a name needs three outlets).
  for (const i of items) each(i, t => add(get(t.k, stat), i, t.f));
  const common = k => stat.get(k)?.items >= 3;
  for (const i of items) each(i, () => {}, (pk, f) => { const sp = pk.indexOf(' '); if (common(pk.slice(0, sp)) && common(pk.slice(sp + 1))) add(get(pk, pairs), i, f); });
  // A pair becomes a name when at least three outlets wrote it and it is most of either word's uses.
  const names = [...pairs.values()].filter(p => {
    const [a, b] = p.k.split(' ').map(k => stat.get(k));
    return p.outlets.size >= 3 && p.items >= 0.6 * Math.min(a.items, b.items);
  }).sort((x, y) => y.items - x.items);
  const gone = new Set();
  for (const p of names) {
    const [a, b] = p.k.split(' ');
    if (gone.has(a) || gone.has(b)) continue;
    stat.set(p.k, p);
    for (const k of [a, b]) if (p.items >= 0.7 * stat.get(k).items) { stat.delete(k); gone.add(k); }
  }
  const show = s => {
    if (!s.k.includes(' ')) return model.forms.show(s.k);
    return [...s.forms].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0][0];
  };
  const list = [...stat.values()].filter(s => s.outlets.size >= 2).map(s => {
    const term = show(s);
    return { k: s.k, term, named: /\p{Lu}/u.test(term), items: s.items, outlets: s.outlets.size, by: Object.fromEntries(BRIEFINGS.map((b, x) => [b.key, s.by[x]])),
      byOutlets: Object.fromEntries(BRIEFINGS.map((b, x) => [b.key, s.byOutlet[x]?.size || 0])), days: Array(7).fill(0), w };
  }).sort((a, b) => b.outlets - a.outlets || b.items - a.items || (a.k < b.k ? -1 : 1));
  // Each term's headlines on each of the seven days, whatever the window, so a term's trend shows beside its count.
  const byKey = new Map(list.map(t => [t.k, t])), dayIndex = new Map(model.days.map((d, k) => [d, k]));
  for (const i of model.week) {
    const d = dayIndex.get(i.day);
    if (d === undefined) continue;
    each(i, t => { const x = byKey.get(t.k); if (x) x.days[d]++; }, pk => { const x = byKey.get(pk); if (x) x.days[d]++; });
  }
  const top = list.slice();
  top.all = list;
  return top;
}

// The Political Briefing's five positions in a window: items and publishers per position, the biggest stories with
// their publishers per position (of the ten each position has), and the stories covered mostly from one side: of
// those with four publishers or more, the furthest to the left (far left and left against right and far right, with the
// centre in the count) and the furthest to the right.
function spread(model, items, stories) {
  const pol = items.filter(i => i.b === 'political');
  const meta = model.briefings.find(b => b.key === 'political');
  const per = POSITIONS.map(p => ({ key: p, label: meta?.positions?.find(x => x.key === p)?.label || POSITION_LABELS[p], items: pol.filter(i => i.pos === p).length,
    publishers: new Set(pol.filter(i => i.pos === p).map(i => i.sid)).size }));
  // Free sources lead in each list, as in the biggest stories.
  const free = x => (x.s || x).free;
  const covered = leadFree(stories.filter(s => s.publishers >= 3), free);
  const lean = s => { const L = s.positions.far_left + s.positions.left, R = s.positions.right + s.positions.far_right; return (R - L) / (s.publishers || 1); };
  const sided = covered.filter(s => s.publishers >= 4).map(s => ({ s, lean: lean(s) }));
  return {
    total: pol.length, perPosition: meta?.perPosition || 10, positions: per,
    stories: covered.slice(0, 10),
    left: leadFree(sided.filter(x => x.lean <= -0.5).sort((a, b) => a.lean - b.lean || b.s.publishers - a.s.publishers), free).slice(0, 3).map(x => ({ ...x.s, lean: x.lean })),
    right: leadFree(sided.filter(x => x.lean >= 0.5).sort((a, b) => b.lean - a.lean || b.s.publishers - a.s.publishers), free).slice(0, 3).map(x => ({ ...x.s, lean: x.lean })),
  };
}

/* ---------------------------------------------------------------- search */
/**
 * A query as words and "quoted phrases", folded, at most twelve. A word matches where a word in the text starts (so
 * "elect" finds "election"), a plural finds its singular too ("tariffs" finds "tariff", "companies" "company", and
 * either finds "companies": findWord), and a word of three letters or fewer only as a whole word or its plural (so "ai"
 * finds AI and "eu" the EU, not "said" or "Europe"). A phrase's last word is a plural like any other ("senate races"
 * finds "Senate race" too: a topic of two words is shown as headlines most often wrote it, and its link searches for it).
 */
export function parseQuery(q) {
  const out = [];
  const s = fold(q).slice(0, 200);
  for (const m of s.matchAll(/"([^"]+)"|(\S+)/g)) {
    let t = (m[1] ?? m[2]).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/\s+/g, ' ');
    if (!t) continue;
    if (m[2] === undefined) t = t.replace(/(^|\s)(\p{L}+)$/u, (_, sp, w) => sp + stem(w));
    else if (/^\p{L}+$/u.test(t)) t = stem(t);
    if (!out.includes(t)) out.push(t);
  }
  return out.slice(0, 12);
}
const isWordChar = c => c !== undefined && isLN(c.charCodeAt(0));
// How far a match of `x` at `at` reaches: to the end of x, or past a plural "s" on it; 0 when x does not end a word there.
const wordEnd = (hay, x, at) => (!isWordChar(hay[at + x.length]) ? at + x.length : hay[at + x.length] === 's' && !isWordChar(hay[at + x.length + 1]) ? at + x.length + 1 : 0);
// A word (or a phrase's last word) that ends in a consonant and "y" is also looked for as the start of its plural in
// "ies": "companies" is searched as its stem "company", which "companies" does not contain, so "companie" finds it (and
// "spy" finds "spies").
const iesForm = x => (x.length >= 3 && /[^aeiou]y$/.test(x) ? x.slice(0, -1) + 'ie' : null);
// Initials with and without their stops, and the names they stand for, as terms() counts them as one (US, U.S., USA and
// United States are the one topic US): each finds the others ("US" finds "U.S." and "United States", and the phrase
// "United States", searched as "united state", finds "US"), so a topic's search finds every headline the topic counted.
const STOPS = new Map();
for (const [forms, name] of [[['us', 'u.s', 'usa', 'u.s.a'], 'united states'], [['uk', 'u.k'], 'united kingdom'], [['un', 'u.n'], 'united nations'], [['ai', 'a.i'], 'artificial intelligence'], [['eu'], 'european union']]) {
  const all = [...forms, name];
  for (const f of [...all, name.replace(/\p{L}+$/u, w => stem(w))]) STOPS.set(f, all.filter(x => x !== f));
}
/**
 * Where query word `x` matches in folded text `hay`, at or after `from`: [start, end, whole] of the first match that
 * starts a word (and, for a word of three letters or fewer, ends one), `whole` when it is the whole word or its plural;
 * or null. A word in "y" also matches its plural in "ies" (iesForm), and initials their other spelling (STOPS).
 */
export function findWord(hay, x, from = 0) {
  let best = null;
  for (const y of [x, iesForm(x), ...(STOPS.get(x) || [])]) {
    if (!y) continue;
    const short = y.length <= 3;
    for (let at = hay.indexOf(y, from); at >= 0 && (!best || at <= best[0]); at = hay.indexOf(y, at + 1)) {
      if (isWordChar(hay[at - 1])) continue;
      const end = wordEnd(hay, y, at);
      if (short && !end) continue;
      if (!best || at < best[0] || (end || at + y.length) > best[1]) best = [at, end || at + y.length, !!end]; // the first, then the longest
      break;
    }
  }
  return best;
}

/**
 * The search: every word (or phrase) of `q` in an item's title or summary, within the window ('24h', '3d', '7d' or a
 * day), the briefings `b` (none means all four), the topic `t` ('<briefing>.<topic id>'), and the Political Briefing's
 * sport, entertainment and lifestyle left out unless `soft`. Ordered by `sort`: 'best' (a word in the headline counts
 * four times one only in the summary, a whole word more than its start, the newer first among equals) or 'newest'; by
 * default best with a query and newest without. The same article in two briefings is one result, shown by its copy that
 * passes the filters (the better match of the two), with the other briefing in its `also`.
 * Returns { results: [{ item, also: [the same article in other briefings], score }], total, all, byBriefing, byTopic }:
 * `all` and the counts are articles for the query, window and soft setting, before the briefing and topic filters, so
 * they show what each filter holds (an article in two briefings counts in both, and once in `all`).
 */
export function search(model, { q = '', b = [], w = '7d', t = '', soft = false, sort = '' } = {}) {
  const words = parseQuery(q), only = new Set((Array.isArray(b) ? b : String(b).split(',')).filter(k => BRIEFING[k]));
  const [tb, tid] = String(t || '').split('.');
  const ref = model.ref, span = 7 * DAY;
  const base = inWindow(model.items, w, ref).filter(i => soft || !i.soft);
  const scored = [];
  for (const i of base) {
    let score = 0, ok = true;
    for (const x of words) {
      const inTitle = findWord(i.ht, x), m = inTitle || findWord(i.hay, x, i.ht.length);
      if (!m) { ok = false; break; }
      score += (inTitle ? 4 : 1) * (m[2] ? 1.25 : 1);
    }
    if (!ok) continue;
    score += Math.max(0, Math.min(1, 1 - (ref - i.at) / span)) * 0.5;
    scored.push({ item: i, score });
  }
  // One article, however many briefings carry it.
  const byUrl = new Map();
  for (const r of scored) { const u = urlKey(r.item.u), g = byUrl.get(u); if (g) g.push(r); else byUrl.set(u, [r]); }
  const articles = [...byUrl.values()];
  const byBriefing = Object.fromEntries(BRIEFINGS.map(x => [x.key, 0]));
  const byTopic = {};
  for (const g of articles) {
    for (const k of new Set(g.map(r => r.item.b))) byBriefing[k]++;
    for (const k of new Set(g.flatMap(r => r.item.tp.map(id => `${r.item.b}.${id}`)))) byTopic[k] = (byTopic[k] || 0) + 1;
  }
  const passes = r => (!only.size || only.has(r.item.b)) && (!tb || (r.item.b === tb && r.item.tp.includes(tid)));
  const results = [];
  for (const g of articles) {
    const ok = g.filter(passes).sort((x, y) => y.score - x.score || x.item.n - y.item.n);
    if (!ok.length) continue;
    const best = ok[0], also = [];
    for (const r of g) if (r.item.b !== best.item.b && !also.some(a => a.b === r.item.b)) also.push(r.item);
    results.push({ item: best.item, also, score: Math.max(...g.map(r => r.score)) });
  }
  const order = sort === 'newest' || sort === 'best' ? sort : words.length ? 'best' : 'newest';
  results.sort(order === 'best' ? (x, y) => y.score - x.score || byNewest(x.item, y.item) : (x, y) => byNewest(x.item, y.item));
  // Free sources lead here too, in both orders and after every filter: the first free result takes the top place.
  const led = leadFree(results, r => isFree(r.item));
  return { results: led, total: led.length, all: articles.length, byBriefing, byTopic, words, order };
}

/* ---------------------------------------------------------------- the page's address */
// #tab=week · #q=binance&b=political,digital&w=24h&t=digital.ai&soft=1&sort=newest (any search setting opens the
// Search tab). Unknown values fall back to the defaults.
export const DEFAULTS = Object.freeze({ tab: 'today', q: '', b: [], w: '7d', t: '', soft: false, sort: '' });
// Trends (#tab=trends&t=<briefing>.<topic>) is drawn from each briefing's trends.json alone (app.js); its t picks a row.
const TABS = ['today', 'week', 'search', 'trends'];
export function parseHash(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#\/?/, ''));
  const s = { ...DEFAULTS, b: [] };
  if (p.has('q')) s.q = String(p.get('q') || '').slice(0, 200);
  if (p.has('b')) s.b = [...new Set(String(p.get('b')).split(',').map(x => x.trim().toLowerCase()).filter(x => BRIEFING[x]))];
  const w = String(p.get('w') || '').toLowerCase();
  if (WINDOWS[w] || /^\d{4}-\d{2}-\d{2}$/.test(w)) s.w = w;
  const t = String(p.get('t') || '');
  if (/^[a-z]+\.[\w-]+$/.test(t) && BRIEFING[t.split('.')[0]]) s.t = t;
  if (/^(1|true|yes)$/i.test(p.get('soft') || '')) s.soft = true;
  const sort = String(p.get('sort') || '').toLowerCase();
  if (sort === 'best' || sort === 'newest') s.sort = sort;
  const tab = String(p.get('tab') || '').toLowerCase();
  const searching = !!(s.q || s.b.length || s.t || s.w !== DEFAULTS.w || s.soft || s.sort);
  s.tab = TABS.includes(tab) ? tab : searching ? 'search' : DEFAULTS.tab;
  return s;
}
export function toHash(s) {
  const p = new URLSearchParams();
  const searching = !!(s.q || s.b?.length || s.t || (s.w && s.w !== DEFAULTS.w) || s.soft || s.sort);
  if (s.tab && s.tab !== DEFAULTS.tab && !(s.tab === 'search' && searching)) p.set('tab', s.tab);
  if (s.q) p.set('q', s.q);
  if (s.b?.length) p.set('b', s.b.join(','));
  if (s.w && s.w !== DEFAULTS.w) p.set('w', s.w);
  if (s.t) p.set('t', s.t);
  if (s.soft) p.set('soft', '1');
  if (s.sort) p.set('sort', s.sort);
  const h = p.toString();
  return h ? '#' + h : '';
}
