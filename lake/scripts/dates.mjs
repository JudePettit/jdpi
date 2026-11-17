// Wikidata time values as the lake keeps them (build.mjs, an entity's `facts`), and as the Master Index shows them
// (encyclopedia/index.html, fmtDate, which follows the same rules).
//
// A Wikidata time is a signed year with a month and day, and a precision: 11 a day, 10 a month, 9 a year, 8 a decade,
// 7 a century, 6 a millennium, lower still for ages and aeons. Its years are counted as history counts them: -0356 is
// 356 BC, and there is no year 0. The lake keeps the value at its precision, the year first and signed, so every reader
// that takes the leading year (bibliotheca/scripts/tag-terms.mjs firstYear, bibliotheca/neo/lib/era.js yearOf) reads it
// right: "-0356-07-20" for a day, "1513-12" for a month, "-0323" or "1500" for a year or coarser. A precision coarser
// than a year cannot be read off the value, so the record also keeps it (`fp`: { born: 7 }), and the facts the source
// marks "circa" (qualifier P1480, sourcing circumstances, = Q5727902): `fc`: ['born'].
export const CIRCA = 'Q5727902';
// A time's calendar (calendarmodel): Gregorian unless Wikidata says Julian, whose value is then a Julian date (S0,
// 16 November 2026: Alexander the Great's birth, -0356-07-20, is Julian there, and was shown as if Gregorian). The
// record lists such facts in `fcal`: ['born'].
export const JULIAN = 'http://www.wikidata.org/entity/Q1985786';

/** A claim's time as { v, p, c }: the value as the lake keeps it, its precision, whether the source says circa; with
 *  cal: 'julian' when Wikidata gives it in the Julian calendar; or null. */
export function wikidataDate(claim) {
  const t = claim?.mainsnak?.datavalue?.value;
  const m = String(t?.time || '').match(/^([+-]?)(\d+)-(\d\d)-(\d\d)/);
  if (!m) return null;
  const p = Number.isInteger(t.precision) ? t.precision : 11;
  const y = `${m[1] === '-' ? '-' : ''}${m[2].replace(/^0+(?=\d{4})/, '').padStart(4, '0')}`;
  const v = p >= 11 && m[4] !== '00' ? `${y}-${m[3]}-${m[4]}` : p >= 10 && m[3] !== '00' ? `${y}-${m[3]}` : y;
  const c = (claim.qualifiers?.P1480 || []).some(q => q.datavalue?.value?.id === CIRCA);
  return t.calendarmodel === JULIAN ? { v, p, c, cal: 'julian' } : { v, p, c };
}

/** The statement Wikidata itself gives for a property: the first of preferred rank, else the first of normal rank,
 *  never a deprecated one (refIds in build.mjs drops those too). Until November 2026 the first statement was read
 *  whatever its rank, so the 2026 South Sudanese general election, whose first P585 is a deprecated 2018-07, showed
 *  July 2018 (sweep MI-10, 1b). */
export function bestClaim(list) {
  const ok = (list || []).filter(c => c && c.rank !== 'deprecated');
  return ok.find(c => c.rank === 'preferred') || ok[0] || null;
}

/** The Explorer's Century tag from a claim (the best statement of the date it is drawn from: build.mjs tagsFor):
 *  "Century:15th century", "Century:4th century BC"; null for a date coarser than a century (precision below 7), since
 *  its year names a century Wikidata does not give (Moses, born in the 2nd millennium BC, was "20th century BC", and
 *  the Chicxulub crater "660000th century BC", until the second reader's F2, 16 November 2026). */
export function centuryTag(claim) {
  const d = wikidataDate(claim);
  if (!d || d.p < 7) return null;
  const y = parseInt(d.v, 10);
  if (!Number.isFinite(y) || y === 0) return null;
  const c = Math.floor((Math.abs(y) - 1) / 100) + 1;
  return `Century:${c}${[, 'st', 'nd', 'rd'][c % 100 > 10 && c % 100 < 14 ? 0 : c % 10] || 'th'} century${y < 0 ? ' BC' : ''}`;
}

/** The years a value can mean at its precision (8 a decade, 7 a century, 6 a millennium, Wikidata's own reading:
 *  1500 at 7 is 1401–1500); [-Infinity, Infinity] for anything coarser; null for no year. */
export function yearSpan(v, p) {
  const y = parseInt(String(v), 10);
  if (!Number.isFinite(y)) return null;
  if (p == null || p >= 9) return [y, y];
  if (p === 8) return [Math.floor(y / 10) * 10, Math.floor(y / 10) * 10 + 9];
  const size = p === 7 ? 100 : p === 6 ? 1000 : null;
  if (!size) return [-Infinity, Infinity];
  const n = Math.floor((Math.abs(y) - 1) / size) + 1;
  return y > 0 ? [(n - 1) * size + 1, n * size] : [-(n * size), -((n - 1) * size + 1)];
}
// Two values of one date agree when one is the other at a coarser precision ("1452" and "1452-04-15"), or a value
// coarser than a year spans the other's year ("1500" at century precision and 1452).
const agreeAsWritten = (a, b) => {
  if (a.v.startsWith(b.v) || b.v.startsWith(a.v)) return true;
  if (a.p >= 9 && b.p >= 9) return false;
  const x = yearSpan(a.v, a.p), y = yearSpan(b.v, b.p);
  return !!(x && y && x[0] <= y[1] && y[0] <= x[1]);
};
// A value in one calendar and a value in the other are compared as Gregorian: a Julian day is moved to its Gregorian
// day first, so the October Revolution's 25 October 1917 (Julian) agrees with 7 November 1917 (the second reviewer, X2,
// 17 November 2026). A Julian value coarser than a day is compared as written.
const calOf = d => (d.cal === 'julian' ? 'julian' : 'gregorian');
const agree = (a, b) => {
  if (calOf(a) === calOf(b)) return agreeAsWritten(a, b);
  const g = d => { const v = d.cal === 'julian' && d.p >= 11 ? julianToGregorian(d.v) : null; return v ? { ...d, v } : d; };
  return agreeAsWritten(g(a), g(b));
};

/** A Julian day as the lake keeps it ("1917-10-25", "-0356-07-20": a year BC signed, no year 0) moved to the same day
 *  in the Gregorian calendar, written the same way; null for a value that is not a whole day, or older than 4713 BC. */
export function julianToGregorian(v) {
  const m = String(v ?? '').match(/^(-?)(\d+)-(\d\d)-(\d\d)$/);
  if (!m) return null;
  const year = m[1] === '-' ? 1 - +m[2] : +m[2], month = +m[3], day = +m[4]; // year: astronomical (1 BC is 0)
  if (year < -4712 || month < 1 || month > 12 || day < 1) return null;
  const a = Math.floor((14 - month) / 12), y = year + 4800 - a, mo = month + 12 * a - 3;
  const jdn = day + Math.floor((153 * mo + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  const A = jdn + 32044, B = Math.floor((4 * A + 3) / 146097), C = A - Math.floor(146097 * B / 4);
  const D = Math.floor((4 * C + 3) / 1461), E = C - Math.floor(1461 * D / 4), M = Math.floor((5 * E + 2) / 153);
  const gd = E - Math.floor((153 * M + 2) / 5) + 1, gm = M + 3 - 12 * Math.floor(M / 10), gy = 100 * B + D - 4800 + Math.floor(M / 10);
  const two = n => String(n).padStart(2, '0');
  return `${gy <= 0 ? '-' : ''}${String(gy <= 0 ? 1 - gy : gy).padStart(4, '0')}-${two(gm)}-${two(gd)}`;
}

/** The facts of an entity (each property's best statement, bestClaim) with their precisions and circa marks:
 *  { facts, fp, fc }, fp and fc only for the facts that need them; `fcal` the facts in the Julian calendar and `fd`
 *  the disputed ones, only when there are any. A fact is disputed when Wikidata's best rank (its preferred statements,
 *  else its normal ones) holds a value that does not agree with the first: fd: { born: [['1452-04-14', 11]] }, the
 *  other values with their precisions (and the calendar of one that is not in the fact's calendar: [v, p, 'gregorian']);
 *  the first stays the fact (S0, 16 November 2026). */
export function datedFacts(claims, props) {
  const facts = {}, fp = {}, fc = [], fcal = [], fd = {};
  for (const [p, name] of Object.entries(props)) {
    const best = bestClaim(claims?.[p]), d = wikidataDate(best);
    if (!d) continue;
    facts[name] = d.v;
    if (d.p < 9) fp[name] = d.p;
    if (d.c) fc.push(name);
    if (d.cal === 'julian') fcal.push(name);
    const rank = best.rank === 'preferred' ? 'preferred' : 'normal';
    // Each other value keeps its calendar, as a third element, when it is not the fact's: [v, p, 'gregorian' | 'julian'].
    const others = [];
    for (const c of claims[p]) {
      if (c === best || (c.rank || 'normal') !== rank) continue;
      const o = wikidataDate(c);
      if (!o || agree(o, d)) continue;
      const alt = calOf(o) === calOf(d) ? [o.v, o.p] : [o.v, o.p, calOf(o)];
      if (!others.some(([v, , k]) => v === alt[0] && k === alt[2])) others.push(alt);
    }
    if (others.length) fd[name] = others;
  }
  return { facts, fp, fc, ...(fcal.length ? { fcal } : {}), ...(Object.keys(fd).length ? { fd } : {}) };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ordinal = n => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;

/** A lake date as a reader should see it, at its precision: "20 July 356 BC", "December 1513", "323 BC", "1560s",
 *  "15th century", "c. 1500" (circa, or a precision coarser than a millennium). `p` is the precision when it is coarser
 *  than a year (the record's fp), `c` circa, `cal` 'julian' for a Julian date ("… (Julian calendar)"). A value with no
 *  precision given reads as precise as it is written. The century is Wikidata's own reading of the year: 1500 is the
 *  15th, 1501 the 16th. */
export function formatDate(d, p, c, cal) {
  const s = formatPlain(d, p, c);
  return cal === 'julian' && /^(-?)(\d+)(?:-(\d\d))?(?:-(\d\d))?$/.test(String(d ?? '')) ? `${s} (Julian calendar)` : s;
}

/** A record's fact as the Master Index shows it (encyclopedia/index.html factText gives the same answers): its date
 *  at its precision, then any other value Wikidata gives it at the same rank, and the calendar once for them all:
 *  "15 April 1452 or 14 April 1452 (Julian calendar; Wikidata gives both)". When the values are in different calendars
 *  each says its own: "15 April 1452 (Julian calendar) or 14 April 1452 (Gregorian calendar); Wikidata gives both". */
export function factText(e, f) {
  const julian = (e.fcal || []).includes(f), alts = e.fd?.[f] || [];
  const main = formatPlain(e.facts[f], e.fp?.[f], (e.fc || []).includes(f));
  const gives = `Wikidata gives ${alts.length === 1 ? 'both' : 'all of them'}`, own = julian ? 'julian' : 'gregorian';
  if (alts.some(a => a[2] && a[2] !== own)) {
    const cal = k => (k === 'julian' ? 'Julian calendar' : 'Gregorian calendar');
    return `${[`${main} (${cal(own)})`, ...alts.map(([v, p, k]) => `${formatPlain(v, p < 9 ? p : undefined, false)} (${cal(k || own)})`)].join(' or ')}; ${gives}`;
  }
  const notes = [julian ? 'Julian calendar' : '', alts.length ? gives : ''].filter(Boolean);
  return `${[main, ...alts.map(([v, p]) => formatPlain(v, p < 9 ? p : undefined, false))].join(' or ')}${notes.length ? ` (${notes.join('; ')})` : ''}`;
}
function formatPlain(d, p, c) {
  const m = String(d ?? '').match(/^(-?)(\d+)(?:-(\d\d))?(?:-(\d\d))?$/);
  if (!m) return String(d ?? '');
  const bc = m[1] === '-', y = +m[2], era = bc ? ' BC' : '';
  let s;
  if (p !== undefined && p !== null && p < 9) {
    if (p === 8) s = `${Math.floor(y / 10) * 10}s${era}`;
    else if (p === 7) s = `${ordinal(Math.floor((y - 1) / 100) + 1)} century${era}`;
    else if (p === 6) s = `${ordinal(Math.floor((y - 1) / 1000) + 1)} millennium${era}`;
    else return `c. ${y.toLocaleString('en-GB')}${era}`;
  } else {
    s = `${y}${era}`;
    if (m[3] && +m[3] >= 1 && +m[3] <= 12) s = `${MONTHS[+m[3] - 1]} ${s}`;
    if (m[3] && m[4] && +m[4] >= 1) s = `${+m[4]} ${s}`;
  }
  return c ? `c. ${s}` : s;
}
