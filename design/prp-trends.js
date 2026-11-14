// Headline trends: the rule behind Highbrowse's Trends tab and the Dashboard's "Headline trends" card, worked out once
// per briefing refresh (integration/scripts/heads.mjs writes each briefing's history.json and trends.json from it), so
// the two can never disagree. Pure and DOM-free, with no imports: the same file runs in Node (the refreshes, the
// backfill, tests/trends.test.mjs) and in the browser (Highbrowse reads METHOD from it, so the page states the rule
// the numbers were worked out by).
//
// THE RULE, in the words the page uses (METHOD below says it in full):
// - A topic is one of a briefing's own topics: the Scientific Briefing's disciplines, the Economics and Digital
//   Briefings' fields, the Political Briefing's ten standing topics, matched in the headline or its summary as that
//   briefing matches them (a viewer's own edited topics are not used, so every week is measured alike). A story in two
//   topics counts in both; the Political Briefing counts its hard news only.
// - Stories are counted by the UTC day they were published. A day's count is every story VM collected for that day
//   while the briefing's store held the whole day (a story the store later dropped still counts for its day).
// - A day is held in full when the store was already running when the day began, and a store made no later than the
//   briefing's lateness limit after the day ended (15 hours, the Political Briefing 27: the data check's limits) held
//   all of it. A week counts when its seven days are held in full and the briefing held at least 50 stories in it.
// - This week is the seven whole UTC days before the day the store was made. A topic's share of a week is its stories
//   that week divided by all the briefing's stories that week.
// - The baseline is the four most recent earlier weeks that count, within the twelve weeks before; b is the mean of
//   the topic's shares in them, and e = this week's stories x b, the count the baseline share would give this week.
// - Rising: this week's share is above each of the four, at least 1.25 b, with at least 20 stories, and at least
//   2 x sqrt(e) more than e. Falling: below each of the four, at most 0.8 b, e at least 20, and at least 2 x sqrt(e)
//   fewer than e. A topic not in the briefing's list in all four weeks is a new topic: no comparison yet.
// - Percentile: P = round(100 x (earlier weeks with a lower share + half those with an equal share) / N), over the N
//   earlier weeks that count, up to 52; shown once N is at least 8.

export const DAY = 864e5;
export const HOUR = 36e5;
export const WEEK_MIN_STORIES = 50; // a week with fewer stories than this does not count
export const BASE_WEEKS = 4;        // the baseline: this many earlier weeks that count…
export const BASE_WITHIN = 12;      // …the most recent among this many weeks before
export const PCT_MIN = 8;           // a percentile needs at least this many earlier weeks that count…
export const PCT_MAX = 52;          // …and uses at most this many
export const RISE_RATIO = 1.25;
export const FALL_RATIO = 0.8;
export const MIN_STORIES = 20;      // rising: stories this week; falling: the expected count e
export const SIGMAS = 2;            // the change must be at least this many times sqrt(e)
export const KEEP_DAYS = 400;       // history.json keeps this many days back from the store's day
// How late a store may be and still vouch for a day (hours after the day ended): the data check's own limits, twice the
// refresh rhythm plus three hours (.github/scripts/freshness.mjs STORES; tests/trends.test.mjs holds the two equal).
export const LATE_HOURS = { political: 27, scientific: 15, economics: 15, digital: 15 };

export const utcDay = ms => new Date(ms).toISOString().slice(0, 10);
export const dayStart = day => Date.parse(day + 'T00:00:00Z');
export const addDays = (day, n) => utcDay(dayStart(day) + n * DAY);

/* ---------------------------------------------------------------- accruing a store into the history
   history: {
     version: 1,
     since:   the store's first time VM accrued (its first committed version, for a rebuilt history),
     last:    the newest store time accrued,
     topics:  every topic id ever seen, in order of first sight (open days index into it),
     days:    { 'YYYY-MM-DD': { n: stories, t: { topic: stories, … every topic in the list that day, 0 included }, ok } },
     open:    { 'YYYY-MM-DD': { <story key>: [topic indexes] } }   the days the store still holds whole
   }
   snap (heads.mjs snapshot()): { generated: ISO, keepDays, topics: [{ id, label, short }], items: [{ key, day, tp }] }
   Returns a new history; the arguments are not changed. Accruing the same store twice changes nothing. */
export function emptyHistory() { return { version: 1, since: null, last: null, topics: [], days: {}, open: {} }; }

export function accrue(history, snap, { lateHours }) {
  const h = structuredClone(history || emptyHistory());
  const G = Date.parse(snap.generated);
  if (!Number.isFinite(G)) return h;
  if (!h.since || Date.parse(h.since) > G) h.since = snap.generated;
  if (!h.last || Date.parse(h.last) < G) h.last = snap.generated;
  const since = Date.parse(h.since);
  const keep = Number.isFinite(snap.keepDays) ? snap.keepDays : 7;
  const winStart = G - keep * DAY;
  const listed = (snap.topics || []).map(t => String(t.id));
  for (const id of listed) if (!h.topics.includes(id)) h.topics.push(id);
  const index = new Map(h.topics.map((id, k) => [id, k]));
  // The days the store holds whole: begun no earlier than its window, ended by its time.
  const whole = d => dayStart(d) >= winStart && dayStart(d) + DAY <= G;
  const touched = new Set();
  for (const it of snap.items || []) {
    if (!it || typeof it.day !== 'string' || !whole(it.day)) continue;
    const open = (h.open[it.day] ||= {});
    open[String(it.key)] = (it.tp || []).map(String).filter(id => index.has(id)).map(id => index.get(id));
    touched.add(it.day);
  }
  // Every whole day of the window, even an empty one, is recounted from its open set.
  for (let d = utcDay(winStart + DAY - 1); dayStart(d) + DAY <= G; d = addDays(d, 1)) if (whole(d)) touched.add(d);
  for (const d of touched) {
    const open = (h.open[d] ||= {}), prev = h.days[d] || { n: 0, t: {}, ok: false };
    const t = {};
    for (const id of new Set([...Object.keys(prev.t || {}), ...listed])) t[id] = 0;
    for (const tps of Object.values(open)) for (const k of tps) { const id = h.topics[k]; if (id in t) t[id]++; }
    const vouches = G <= dayStart(d) + DAY + lateHours * HOUR && since <= dayStart(d);
    h.days[d] = { n: Object.keys(open).length, t, ok: !!prev.ok || vouches };
  }
  // A day the window no longer holds whole is closed: its count is kept, its story keys are dropped.
  for (const d of Object.keys(h.open)) if (!whole(d)) delete h.open[d];
  // Days over KEEP_DAYS old go.
  const oldest = addDays(utcDay(G), -KEEP_DAYS);
  for (const d of Object.keys(h.days)) if (d < oldest) delete h.days[d];
  h.days = Object.fromEntries(Object.entries(h.days).sort(([a], [b]) => (a < b ? -1 : 1)));
  h.open = Object.fromEntries(Object.entries(h.open).sort(([a], [b]) => (a < b ? -1 : 1)));
  return h;
}

/* ---------------------------------------------------------------- the weeks and the trends */
// Week k (0 = this week) of a store made on day `today`: the seven days from today − 7(k+1) to today − 7k − 1.
export function weekDays(today, k) { return Array.from({ length: 7 }, (_, i) => addDays(today, -7 * (k + 1) + i)); }

// One week of a history: its days, its stories, whether it counts (and why not), and each topic's count where the topic
// was in the briefing's list on all seven days.
export function week(history, today, k) {
  const days = weekDays(today, k), rows = days.map(d => history.days?.[d]);
  const gaps = days.filter((d, i) => !rows[i] || !rows[i].ok), missing = gaps.length;
  const stories = rows.reduce((s, r) => s + (r?.n || 0), 0);
  const counts = {};
  if (rows.every(Boolean)) for (const id of Object.keys(rows[0].t || {})) if (rows.every(r => r.t && id in r.t)) counts[id] = rows.reduce((s, r) => s + r.t[id], 0);
  const why = missing ? `${missing} of its days ${missing === 1 ? 'is' : 'are'} not held in full` : stories < WEEK_MIN_STORIES ? `fewer than ${WEEK_MIN_STORIES} stories` : null;
  return { k, from: days[0], to: days[6], stories, counts: why ? false : true, why, missing: gaps, topics: counts };
}

// Days as a reader says them: "10 Nov", "10 and 11 Nov", "31 Oct and 1 Nov", "8, 9 and 10 Nov".
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayList(days) {
  const parts = days.map(d => ({ d: +d.slice(8, 10), m: MON[+d.slice(5, 7) - 1] }));
  const oneMonth = parts.every(p => p.m === parts[0]?.m);
  const words = parts.map((p, i) => (oneMonth && i < parts.length - 1 ? String(p.d) : `${p.d} ${p.m}`));
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words.join('');
}

const share = (w, id) => (w.stories ? (w.topics[id] || 0) / w.stories : 0);

/* trends(history, { generated, topics }) -> the object trends.json holds (beside the store facts heads.mjs adds):
   { week: { from, to }, status: 'ok' | 'short' | 'week', reason, have, need, startsAbout, percentilesAbout,
     weeks: [{ k, from, to, stories, counts, why, missing? }] (this week first, then every earlier week back to 52;
       missing: this week's days not held in full, when there are any),
     baseline: [k…], topics: [{ id, label, short, n0, s0, base: [{ k, n, s }], b, e, ratio, trend, percentile, rank }] }
   trend is 'rising' | 'falling' | 'steady' | 'new' | null (null: no comparison, status not 'ok'). */
export function trends(history, { generated, topics = [] }) {
  const G = Date.parse(generated), today = utcDay(G);
  const weeks = Array.from({ length: PCT_MAX + 1 }, (_, k) => week(history, today, k));
  const w0 = weeks[0];
  const counted = weeks.slice(1).filter(w => w.counts);
  const baseline = weeks.slice(1, BASE_WITHIN + 1).filter(w => w.counts).slice(0, BASE_WEEKS);
  const status = !w0.counts ? 'week' : baseline.length < BASE_WEEKS ? 'short' : 'ok';
  const pctWeeks = counted.slice(0, PCT_MAX);
  const out = {
    week: { from: w0.from, to: w0.to },
    status,
    reason: status === 'week' ? (w0.missing.length
      ? `This week cannot be compared yet: ${dayList(w0.missing)} ${w0.missing.length === 1 ? 'is' : 'are'} not held in full in the store's history.`
      : `This week cannot be compared yet: it has ${w0.why}.`)
      : status === 'short' ? `Not enough history yet: ${baseline.length} of the ${BASE_WEEKS} earlier weeks.` : null,
    have: baseline.length, need: BASE_WEEKS,
    weeksCounted: counted.length, percentileNeed: PCT_MIN,
    startsAbout: status === 'ok' ? null : firstDay(history, today, BASE_WEEKS, BASE_WITHIN),
    percentilesAbout: counted.length >= PCT_MIN && w0.counts ? null : firstDay(history, today, PCT_MIN, PCT_MAX),
    baseline: baseline.map(w => w.k),
    weeks: weeks.filter(w => w.k === 0 || w.counts || w.stories).map(({ k, from, to, stories, counts, why, missing }) => ({ k, from, to, stories, counts, why, ...(k === 0 && missing.length ? { missing } : {}) })),
    topics: [],
  };
  for (const tp of topics) {
    const id = String(tp.id);
    const row = { id, label: String(tp.label || id), short: String(tp.short || tp.label || id), n0: null, s0: null, base: [], b: null, e: null, ratio: null, trend: null, percentile: null, rank: null, history: [] };
    if (w0.counts && id in w0.topics) {
      row.n0 = w0.topics[id]; row.s0 = share(w0, id);
      // Every earlier week that counts, with its stories and share, so a reader can count the percentile by hand.
      row.history = pctWeeks.filter(w => id in w.topics).map(w => ({ k: w.k, from: w.from, n: w.topics[id], stories: w.stories, s: share(w, id) }));
      if (status === 'ok') {
        if (baseline.every(w => id in w.topics)) {
          const s = baseline.map(w => share(w, id));
          row.base = baseline.map((w, j) => ({ k: w.k, n: w.topics[id], s: s[j] }));
          const b = s.reduce((a, x) => a + x, 0) / s.length, e = w0.stories * b, n0 = row.n0, s0 = row.s0;
          row.b = b; row.e = e; row.ratio = b > 0 ? s0 / b : null;
          const rising = s0 > Math.max(...s) && s0 >= RISE_RATIO * b && n0 >= MIN_STORIES && n0 - e >= SIGMAS * Math.sqrt(e);
          const falling = s0 < Math.min(...s) && s0 <= FALL_RATIO * b && e >= MIN_STORIES && e - n0 >= SIGMAS * Math.sqrt(e);
          row.trend = rising ? 'rising' : falling ? 'falling' : 'steady';
        } else row.trend = 'new';
      }
      const earlier = row.history;
      if (earlier.length >= PCT_MIN) {
        const lower = earlier.filter(w => w.s < row.s0).length, equal = earlier.filter(w => w.s === row.s0).length;
        row.percentile = percentile(lower, equal, earlier.length);
        row.rank = { lower, equal, of: earlier.length };
      }
    }
    out.topics.push(row);
  }
  return out;
}

export const percentile = (lower, equal, of) => Math.round((100 * (lower + equal / 2)) / of);

// The first day, from `today` on, when `need` earlier weeks that count (within `within` weeks) and a whole week of its
// own could be held, if every day from today counts and every week holds enough stories: the "about" date the page
// gives while there is too little history. Days before today are as the history has them.
export function firstDay(history, today, need, within) {
  const okDay = d => (d >= today ? true : !!history.days?.[d]?.ok);
  const okWeek = (ref, k) => {
    const days = weekDays(ref, k);
    if (!days.every(okDay)) return false;
    if (days.every(d => d < today)) return days.reduce((s, d) => s + (history.days?.[d]?.n || 0), 0) >= WEEK_MIN_STORIES;
    return true;
  };
  for (let i = 0; i <= 7 * (within + 2); i++) {
    const ref = addDays(today, i);
    if (!okWeek(ref, 0)) continue;
    let n = 0;
    for (let k = 1; k <= within && n < need; k++) if (okWeek(ref, k)) n++;
    if (n >= need) return ref;
  }
  return null;
}

// What the Dashboard lists: up to `rising` rising and `falling` falling topics across the briefings, the biggest change
// first (rising: the highest ratio to the baseline, a topic up from nothing first; falling: the lowest); a tie goes to
// more stories this week, then the briefings' order, then the topic's name.
export function movers(list, { rising = 3, falling = 2 } = {}) {
  const all = list.flatMap(({ briefing, order, trends: t }) => (t?.status === 'ok' ? t.topics : []).filter(x => x.trend === 'rising' || x.trend === 'falling').map(x => ({ ...x, briefing, order })));
  const by = dir => (a, b) => {
    const ra = a.ratio ?? (dir > 0 ? Infinity : 0), rb = b.ratio ?? (dir > 0 ? Infinity : 0);
    if (ra !== rb) return dir > 0 ? rb - ra : ra - rb;
    if (a.n0 !== b.n0) return b.n0 - a.n0;
    if (a.order !== b.order) return a.order - b.order;
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  };
  return {
    rising: all.filter(x => x.trend === 'rising').sort(by(1)).slice(0, rising),
    falling: all.filter(x => x.trend === 'falling').sort(by(-1)).slice(0, falling),
  };
}

/* ---------------------------------------------------------------- how it is worked out, as the page says it */
export const METHOD = [
  'The counts are of stories Vitruvian Manager collected from each briefing\'s feeds. They show how often a topic came up, not how important or how true the stories are, and a change in the feeds can move a topic\'s share as well as a change in the news.',
  'A topic is one of a briefing\'s own topics: the Scientific Briefing\'s disciplines, the Economics and Digital Briefings\' fields, and the Political Briefing\'s ten standing topics, matched in the headline or its summary as that briefing matches them (your own edited topics are not used, so every week is measured alike). A story in two topics counts in both. The Political Briefing counts its hard news only.',
  'Stories are counted by the UTC day they were published, every story collected for that day while the briefing\'s store held the whole day; a story the store later dropped still counts for its day. A day is held in full when the store was already running when the day began and a store made no later than 15 hours after the day ended (the Political Briefing: 27 hours) held all of it. A week counts when all seven of its days are held in full and the briefing held at least 50 stories in it.',
  'This week is the seven whole UTC days before the day the store was made. A topic\'s share of a week is its stories that week divided by all the briefing\'s stories that week.',
  'The baseline is the four most recent earlier weeks that count, within the twelve weeks before. A topic is rising when its share this week is above its share in each of those four weeks, at least 1.25 times their average, with at least 20 stories, and at least twice the square root of the expected count above it (the expected count is this week\'s stories times the average share). It is falling when its share is below each of the four, at most 0.8 times their average, the expected count is at least 20, and the count is at least twice the square root of the expected count below it. A topic that was not in the briefing\'s list in all four weeks is new: there is no comparison yet.',
  'The percentile ranks this week\'s share against the topic\'s share in every earlier week that counts, up to 52: the weeks with a lower share, plus half the weeks with an equal share, as a part of all those weeks. Higher than in 9 of 12 earlier weeks is the 75th percentile. It is shown once there are at least 8 earlier weeks.',
  'With too little history the page says so and shows no number.',
];
