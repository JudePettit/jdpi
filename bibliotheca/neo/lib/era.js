/* Which Vitruvian Manager screens can show "that era", and where in each. Pure (no DOM, no fetch): the page hands it
   an era and what it has loaded (the War Focus index, the Kardashev polities), and the tests call it directly. Every
   address was read from the target page's own hash or query code:
     science/progress/app.js     readHash: #y=<end>&f=<start> (a period; the page clamps it to its data, 3000 BC to now)
     kardashev/index.html        #y=<step>&p=<polity>: century steps to 1800, then 1850, 1900, 1950, 2000, 2025; a
                                 year that is not a step is ignored, so the address must name a step
     battlefield/history/app.js  #y=<year>, 1926 to last year
     battlefield/focus/app.js    #war=<id>&m=<yyyy-mm>, the major wars since 1926, month by month
     q/calendar.html             ?period=history&month=<yyyy-mm>, 1980 to today (a query, so the frame reloads)
     Political Retrospective     https://hp-retrospective.pages.dev/#y=<year>&c=<GW code>, 1926 to today
   National Analysis (q/national.html) has no year in its address, so it can only honestly show "this country today".
   Paths are relative to the site root (the page resolves them against its data-shell); suite and module ids are the
   registry's, for the shell route #/<suite>/<module>?at=<url>. Every screen here can be framed: the pages on this site
   send no X-Frame-Options or frame-ancestors header (_headers), and neither does hp-retrospective.pages.dev. */

export const TIMELINE_FIRST = -3000;
export const RETRO_FIRST = 1926;     // Political Retrospective and Retrospective Battlefield begin here
export const CALENDAR_FIRST = 1980;  // the Historical Calendar's first month is 1980-01
// kardashev/data/energy.json's steps (the page passes the loaded ones when it has them): there is no year 0, so the
// step between 100 BC and AD 100 is AD 1.
export const KARDASHEV_STEPS = (() => { const s = []; for (let y = -2000; y <= 1800; y += 100) s.push(y || 1); return [...s, 1850, 1900, 1950, 2000, 2025]; })();

/** The year in a date the lake writes: "1527-06-21" → 1527, "0697" → 697, "-0500" → -500, 1469 → 1469; null when none. */
export function yearOf(d) {
  if (d === null || d === undefined || d === '') return null;
  if (typeof d === 'number') return Number.isFinite(d) ? Math.trunc(d) : null;
  const m = String(d).trim().match(/^(-?\d{1,4})(?:-|$)/);
  return m ? +m[1] : null;
}

export const fmtYear = y => (y < 0 ? `${-y} BC` : String(y));
export const fmtEra = ([a, b]) => (a === b ? fmtYear(a) : `${fmtYear(a)}–${fmtYear(b)}`);

/** The Kardashev step nearest a year (the earlier one when two are as near). */
export function kardashevStep(year, steps = KARDASHEV_STEPS) {
  let best = steps[0];
  for (const s of steps) if (Math.abs(s - year) < Math.abs(best - year)) best = s;
  return best;
}

/** The Kardashev polity that is this entity, by its English Wikipedia title (the lake's `wiki`, with spaces; the
    tracker's `wiki`, with underscores), and only when it existed at the step: its id for #p=, or null. */
export function kardashevPolity(wiki, polities = [], step = null) {
  if (!wiki) return null;
  const key = String(wiki).replace(/_/g, ' ').trim().toLowerCase();
  const p = polities.find(x => String(x.wiki || '').replace(/_/g, ' ').trim().toLowerCase() === key);
  if (!p) return null;
  return step === null || ((p.from ?? -Infinity) <= step && step <= (p.to ?? Infinity)) ? p.id : null;
}

/** An entity's years from the facts the lake records: a person's born/died, a state's founded/dissolved, an event's
    start/end, or a single date. The record may mix the pairs (the lake has the Roman Empire as dissolved 476, start
    27 BC, end 395), so the era runs from the earliest beginning it records to the latest end: [-27, 476], not the
    476 alone that the first pair with any value would give. A beginning with no end: a living person or a standing
    state runs to this year; an end with no beginning is that year alone. A date alone is that year. Null when the
    record has no dates at all. */
export function eraFromFacts(facts, thisYear = new Date().getUTCFullYear()) {
  if (!facts) return null;
  const ys = ks => ks.map(k => yearOf(facts[k])).filter(y => y !== null);
  const first = ys(['born', 'founded', 'start']), last = ys(['died', 'dissolved', 'end']);
  if (!first.length && !last.length) { const d = yearOf(facts.date); return d === null ? null : [d, d]; }
  const a = first.length ? Math.min(...first) : Math.min(...last);
  const b = last.length ? Math.max(...last) : Math.max(a, thisYear);
  return [Math.min(a, b), Math.max(a, b)];
}

/** A book's era: the period the book itself records (`era: [from, to]`, the years its matter belongs to: 1494–1527
    for The Prince), else the author's lifetime, else the year of the work (the shelf row's year) or of the edition.
    A chapter may carry its own `era`, which wins. Returns { years: [from, to], label } or null. */
export function bookEra(book, row, chapter = null) {
  const pair = e => (Array.isArray(e) && e.length === 2 && e.map(yearOf).every(y => y !== null) ? [Math.min(...e.map(yearOf)), Math.max(...e.map(yearOf))] : null);
  const ch = pair(chapter?.era);
  if (ch) return { years: ch, label: 'this chapter’s period' };
  const era = pair(book?.era);
  if (era) return { years: era, label: 'the book’s period' };
  const a = yearOf(book?.author?.born), b = yearOf(book?.author?.died);
  if (a !== null && b !== null) return { years: [Math.min(a, b), Math.max(a, b)], label: 'the author’s lifetime' };
  const y = yearOf(row?.year) ?? yearOf(book?.work?.published) ?? yearOf(book?.edition?.published);
  return y === null ? null : { years: [y, y], label: 'the year of the book' };
}

const off = (id, suite, name, reason) => ({ id, suite, module: id, name, available: false, reason });
const month = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

/** A War Focus war's first and last year and first month: the index writes `start` and `end` (ISO dates; no end while
    `ongoing`); `from`/`to` are read too, for a hand-written list. */
const warYears = (w, thisYear) => {
  const from = yearOf(w.start ?? w.from), end = w.end ?? w.to;
  return { from, to: end ? yearOf(end) : thisYear, first: String(w.start ?? w.from ?? '').slice(0, 7) };
};

/** The screens for an era [from, to]: one row per screen, available (with its address `at` and a plain `place`) or
    not (with the reason). Options:
      wars      battlefield/focus/data/index.json's `wars` ({ id, name, qid, start, end?, ongoing })
      qid       the term in use: a War Focus war that is this entity comes first, at its own first month
      ownEra    the era is the term's own dates, not the book's: War Focus then lists only the war that is the term,
                since the wars that merely fall in a state's or a person's lifetime are not theirs (Italy's 1946 to
                today would list the Greek, Chinese and Indochina wars); its own places come from the lake's mentions
      polity    a Kardashev polity id to select (kardashevPolity above), added to the tracker's address
      steps     the tracker's steps, when loaded (else KARDASHEV_STEPS)
      today     the date "today" is (tests pass one) */
export function eraRows(era, { wars = [], qid = null, ownEra = false, polity = null, steps = KARDASHEV_STEPS, today = new Date() } = {}) {
  const [a, b] = era;
  const thisYear = today.getUTCFullYear(), thisMonth = month(thisYear, today.getUTCMonth() + 1);
  const rows = [];

  // Invention Timeline: a period, clamped to its data; the start may not pass the end.
  const y = Math.min(Math.max(b, TIMELINE_FIRST), thisYear), f = Math.min(Math.max(a, TIMELINE_FIRST), y);
  rows.push({ id: 'progress', suite: 'ns', module: 'progress', name: 'Invention Timeline', available: true, at: `science/progress/index.html#y=${y}&f=${f}`, place: f === y ? `in ${fmtYear(y)}` : `${fmtYear(f)} to ${fmtYear(y)}` });

  // Kardashev Tracker: the step nearest the middle of the era, and the polity when the term is one alive then.
  const step = kardashevStep(Math.round((a + b) / 2), steps);
  rows.push({ id: 'kardashev', suite: 'rs', module: 'kardashev', name: 'Kardashev Tracker', available: true, at: `kardashev/index.html#y=${step}${polity ? `&p=${encodeURIComponent(polity)}` : ''}`, place: `the century step at ${fmtYear(step)}` });

  // 1926 to today: the first year of the era within that range.
  const retroYear = b >= RETRO_FIRST ? Math.min(Math.max(a, RETRO_FIRST), thisYear) : null;
  rows.push(retroYear === null ? off('retrospective', 'rs', 'Political Retrospective', `covers ${RETRO_FIRST} to today`)
    : { id: 'retrospective', suite: 'rs', module: 'retrospective', name: 'Political Retrospective', available: true, external: true, at: `https://hp-retrospective.pages.dev/#y=${retroYear}`, place: `in ${retroYear}` });
  const battleYear = retroYear === null ? null : Math.min(retroYear, thisYear - 1); // its map runs to last year
  rows.push(battleYear === null ? off('battlefield-history', 'rs', 'Retrospective Battlefield', `covers ${RETRO_FIRST} to ${thisYear - 1}`)
    : { id: 'battlefield-history', suite: 'rs', module: 'battlefield-history', name: 'Retrospective Battlefield', available: true, at: `battlefield/history/index.html#y=${battleYear}`, place: `in ${battleYear}` });

  // War Focus: the war that is the term itself, then (for the book's era) every war that overlaps the era, at the
  // war's first month within it (four at most).
  const self = qid ? wars.filter(w => w.qid === qid) : [];
  const overlapping = ownEra ? [] : wars.filter(w => !self.includes(w) && (() => { const { from, to } = warYears(w, thisYear); return from !== null && from <= b && to >= a; })());
  const listed = [...self, ...overlapping].slice(0, 4);
  if (!listed.length) rows.push(off('war-focus', 'rs', 'War Focus', b < RETRO_FIRST ? `its wars begin in ${RETRO_FIRST}` : ownEra ? 'none of its wars is this term' : `none of its wars falls in ${fmtEra(era)}`));
  for (const w of listed) {
    const { first } = warYears(w, thisYear), m = self.includes(w) || first > month(a, 1) ? first : month(a, 1);
    rows.push({ id: `war-focus:${w.id}`, suite: 'rs', module: 'war-focus', name: 'War Focus', available: true, at: `battlefield/focus/index.html#war=${encodeURIComponent(w.id)}&m=${m}`, place: `${w.name}, ${m}` });
  }

  // Historical Calendar: 1980-01 to this month.
  if (b >= CALENDAR_FIRST) {
    let m = a > CALENDAR_FIRST ? month(Math.min(a, thisYear), 1) : month(CALENDAR_FIRST, 1);
    if (m > thisMonth) m = thisMonth;
    rows.push({ id: 'historical-calendar', suite: 'rs', module: 'historical-calendar', name: 'Historical Calendar', available: true, at: `q/calendar.html?period=history&month=${m}`, place: `the month ${m}` });
  } else rows.push(off('historical-calendar', 'rs', 'Historical Calendar', `covers ${CALENDAR_FIRST} to today`));

  // National Analysis: countries as they are today, and said so.
  rows.push({ id: 'pestle', suite: 'rt', module: 'pestle', name: 'National Analysis', available: true, today: true, at: 'q/national.html', place: 'countries today, not then' });
  return rows;
}
