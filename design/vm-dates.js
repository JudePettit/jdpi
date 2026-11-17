/* VM's dates at their recorded precision (PRP-SCHOLAR-USP-DESIGN.md 3.2 and 5.2). Pure: no DOM, no fetch, so the
   Omni-Map, Neo Book and the tests share it.

   Everything VM stores counts years as history does: signed, with no year 0 (-0356 is 356 BC, -1 is 1 BC and 1 is AD 1),
   as the lake keeps them (lake/scripts/dates.mjs). EDTF, which counts astronomically (1 BC is 0000), appears only at
   export, and only from this file: toEdtf('-0356') is '-0355', intervalToEdtf('-426..-425') is '-0425/-0424'. No '~'
   ("approximate" in EDTF) ever enters a recipe; valueDateToEdtf writes one in a download only.

   A value's date (5.2): { from, to?, p, approx?, uncertain?, cal?, chron?, orig? }
     from, to   lake values: '1495-07-06' (a day), '1513-12' (a month), '-0323' or 1494 (a year or coarser)
     p          Wikidata's precision: 11 day, 10 month, 9 year, 8 decade, 7 century, 6 millennium
     cal        'julian' or 'gregorian', as the source records it (absent: the source gives none, and none is claimed)
     chron      the chronology, where it is disputed; orig the source's own dating ("426/5 BC")
   formatValueDate shows it never more precise than p, with the Master Index's own words (formatDate, imported, so the
   two never drift apart). */
import { formatDate, yearSpan } from '../lake/scripts/dates.mjs';

const VALUE = /^(-?)(\d{1,6})(?:-(\d\d))?(?:-(\d\d))?$/;
const EDTF = /^(-?)(\d{4,6})(?:-(\d\d))?(?:-(\d\d))?$/;
const pad = n => String(n).padStart(4, '0');

/** Astronomical year from a historical one (-1 → 0, -356 → -355), and back. */
export const toAstro = y => (y < 0 ? y + 1 : y);
export const fromAstro = a => (a <= 0 ? a - 1 : a);

/** The signed historical year of a lake value, a number or a date object; null for none (there is no year 0). */
export function yearOf(v) {
  if (v && typeof v === 'object') return yearOf(v.from);
  if (typeof v === 'number') return Number.isInteger(v) && v !== 0 ? v : null;
  const m = VALUE.exec(String(v ?? '').trim());
  if (!m) return null;
  const y = (m[1] ? -1 : 1) * +m[2];
  return y === 0 ? null : y;
}
/** The year a dated value sorts by (5.2's sortYear). */
export const sortYear = date => yearOf(date?.from ?? date);
/** A historical year moved by n years, stepping over the year 0 that does not exist: addYears(-1, 1) is 1. */
export const addYears = (y, n) => fromAstro(toAstro(y) + n);
/** Years from a to b, as a length (1446 to 1514 is 68; 50 BC to AD 14 is 63). */
export const yearsBetween = (a, b) => toAstro(b) - toAstro(a);

/** The precision a lake value carries: 11 for a day, 10 a month, 9 a year, or the record's own `fp` when coarser. */
export function precisionOf(v, fp) {
  if (Number.isInteger(fp)) return fp;
  const m = VALUE.exec(String(v ?? '').trim());
  if (!m) return null;
  return m[4] ? 11 : m[3] ? 10 : 9;
}
const WORDS = { 11: 'day', 10: 'month', 9: 'year', 8: 'decade', 7: 'century', 6: 'millennium' };
/** The precision as a word for a download's `precision` column. */
export const precisionWord = p => WORDS[p] || (Number.isInteger(p) && p < 6 ? 'coarser than a millennium' : null);

/** A lake value (or a historical year) in EDTF: '-0356' → '-0355', '-0356-07-20' → '-0355-07-20', 1494 → '1494'. */
export function toEdtf(v) {
  const m = VALUE.exec(typeof v === 'number' ? String(v) : String(v ?? '').trim());
  if (!m) return null;
  const y = (m[1] ? -1 : 1) * +m[2];
  if (y === 0) return null;
  const a = toAstro(y);
  return `${a < 0 ? '-' : ''}${pad(Math.abs(a))}${m[3] ? `-${m[3]}` : ''}${m[4] ? `-${m[4]}` : ''}`;
}
/** An EDTF date back to the lake's form: '-0355' → '-0356', '0000' → '-0001'. Qualified forms (~ ? %) are refused. */
export function fromEdtf(s) {
  const m = EDTF.exec(String(s ?? '').trim());
  if (!m) return null;
  const y = fromAstro((m[1] ? -1 : 1) * +m[2]);
  return `${y < 0 ? '-' : ''}${pad(Math.abs(y))}${m[3] ? `-${m[3]}` : ''}${m[4] ? `-${m[4]}` : ''}`;
}
/** An interval in EDTF: intervalToEdtf('-426..-425') or (-426, -425) → '-0425/-0424'. */
export function intervalToEdtf(a, b) {
  if (b === undefined && typeof a === 'string' && a.includes('..')) [a, b] = a.split('..');
  const x = toEdtf(a), y = toEdtf(b);
  return x && y ? `${x}/${y}` : null;
}
// A value cut to its precision: '1495-07-06' at 9 is '1495'. Coarser than a year keeps the year (its span is read by p).
function cut(v, p) {
  const m = VALUE.exec(String(v ?? '').trim());
  if (!m) return null;
  const y = `${m[1]}${m[2]}`;
  if (p >= 11 && m[4]) return `${y}-${m[3]}-${m[4]}`;
  if (p >= 10 && m[3]) return `${y}-${m[3]}`;
  return y;
}
/** A value's date in EDTF for a download: at its precision, a decade or century as the interval Wikidata reads it
    ('1500' at 7 is '1401/1500'), a range as from/to, '~' for approximate and '?' for uncertain. */
export function valueDateToEdtf(date) {
  if (!date || date.from == null) return null;
  const p = Number.isInteger(date.p) ? date.p : precisionOf(date.from);
  const one = v => {
    if (p >= 9) return toEdtf(cut(v, p));
    const span = yearSpan(cut(v, p), p);
    return span && Number.isFinite(span[0]) ? intervalToEdtf(span[0], span[1]) : null;
  };
  let s = one(date.from);
  if (s && date.to != null) {
    const t = one(date.to);
    if (!t) return null;
    s = `${s.split('/')[0]}/${t.split('/').at(-1)}`;
  }
  if (!s) return null;
  return `${s}${date.uncertain && date.approx ? '%' : date.approx ? '~' : date.uncertain ? '?' : ''}`;
}

/** A historical year in words: -356 → '356 BC', 1494 → '1494'. */
export function formatYear(y) {
  y = yearOf(y);
  return y == null ? '' : y < 0 ? `${-y} BC` : String(y);
}
/** A span of years: '1446–1514', '431–404 BC', '50 BC–AD 14', '1494' for one year. */
export function formatSpan(a, b) {
  a = yearOf(a); b = yearOf(b);
  if (a == null || b == null) return formatYear(a ?? b);
  if (a === b) return formatYear(a);
  if (a < 0 && b < 0) return `${-a}–${-b} BC`;
  if (a < 0) return `${-a} BC–AD ${b}`;
  return `${a}–${b}`;
}

/** A value's date in words, never more precise than stored, with its calendar where the source records one:
    { from: '1509-05-14', p: 11, cal: 'julian' } → '14 May 1509 (Julian calendar)' (the Master Index's words);
    a Gregorian day or month before 1583 says so, and who recorded it (opts.source, e.g. 'Wikidata'):
    '6 July 1495 (Gregorian calendar, as Wikidata records it; the Gregorian calendar began in 1582)'. */
export function formatValueDate(date, { source } = {}) {
  if (!date || date.from == null) return '';
  const p = Number.isInteger(date.p) ? date.p : precisionOf(date.from);
  const coarse = p != null && p < 9 ? p : undefined;
  const words = v => formatDate(cut(v, p ?? 11), coarse, !!date.approx, date.cal === 'julian' ? 'julian' : undefined);
  let s;
  if (date.to != null && p != null && p <= 9 && coarse === undefined) s = (date.approx ? 'c. ' : '') + formatSpan(date.from, date.to)
    + (date.cal === 'julian' ? ' (Julian calendar)' : '');
  else if (date.to != null) s = `${words(date.from)} to ${words(date.to)}`;
  else s = words(date.from);
  const y = yearOf(date.from);
  if (date.cal === 'gregorian' && p >= 10 && y != null && y < 1583)
    s += ` (Gregorian calendar, as ${source || 'its source'} records it; the Gregorian calendar began in 1582)`;
  if (date.chron) s += ` (${date.chron})`;
  if (date.uncertain) s += ' (uncertain)';
  if (date.orig) s += ` (recorded as ${date.orig})`;
  return s;
}
