// Month by Month: the rule behind every monthly direction mark (vm-direction-1), as pure functions with no I/O, so the
// builder (monthly/scripts/build.mjs), the tests (tests/monthly.test.mjs) and anyone checking a mark by hand use the
// same arithmetic. The design, with the critic's findings taken in, is PRP-CONFLICT-WATCH-DESIGN.md beside the repo.
//
// A unit's series is a list of months, oldest first, each a row:
//   { m: 'yyyy-mm', d: deaths, e: events, sh: deaths from events whose dates run across more than one month (null when
//     the figures count each event in the month it starts, so this cannot be told), top: the month's largest event
//     { date, n (its deaths in this month), place, end, whole, headline, office } or null, src: the UCDP dataset and
//     version the month comes from, est: true when the deaths are an estimate spread from a yearly or war total,
//     prov: true for UCDP candidate events (provisional), part: { from, to, why } when the figures count only some
//     of the month's days (a war's first or last month) }
//
// THE RULE, for month M against the three months before it (B1, B2, B3), the same for every war and every country:
//   deaths D and events E in M; the baseline's median deaths B (the middle of the three) and median events.
//   More deaths recorded ('worse'): D ≥ 1.5 × B, D − B ≥ 25, and D above every one of the three months.
//   Fewer deaths recorded ('better'): D ≤ B ÷ 1.5, B − D ≥ 25, and D below every one of the three months.
//   Otherwise no large change by this rule ('same'), and the mark names the condition that failed.
//   Events, as a check only: up when E ≥ 1.5 × the median and at least 5 more, down when E ≤ the median ÷ 1.5 and at
//   least 5 fewer.
// No mark ('none', always with a reason): a month of the four is not held, is not a whole month in the figures (a
// war's first or last month), is an estimate, or comes from another UCDP dataset; fewer than 10 events in M or an
// average under 10 a month before it; under 25 deaths in the four months; one event decides it (the mark does not
// hold with M's largest event taken out; for fewer, nor with each of the four months' own largest event taken out,
// nor with the baseline's largest taken out of its month, a test skipped when every one of the four months is led by
// one event or report holding more than half its deaths, since that compares like with like only in the first test);
// for fewer, more than a quarter of the three months' deaths come from events whose dates run across more than one
// month and a quarter or less of M's do (later releases may yet add such deaths to M; design F3); three or more of
// the confidence steps below; or a stated reason from the unit (before a state's independence or unification; a UCDP
// conflict counted in only one of the two years the months span).
// Confidence starts high and drops one step for each of: fewer than 25 events in M or an average under 25 before it;
// one event holds more than half of M's deaths; more than a quarter of the deaths in any of the four months come from
// events whose dates run across more than one month (or the figures cannot tell); deaths and events point opposite
// ways; a month of the four is UCDP's candidate events, which are provisional (UCDP revises them, and its final
// figures come the next year). One step is medium, two low, three or more no mark.

export const RULE = Object.freeze({
  id: 'vm-direction-1',
  ratio: 1.5,               // one and a half times the median, or two thirds of it
  minDeathChange: 25,       // and at least 25 deaths more or fewer
  minEventChange: 5,        // the events check: at least 5 more or fewer
  minEventsMonth: 10,       // no mark with fewer events than this in M ...
  minEventsBaseline: 10,    // ... or fewer than this a month, on average, in the three months before
  minDeathsFour: 25,        // no mark with fewer deaths than this in the four months
  thinEvents: 25,           // one step down under this many events (M, or the baseline's average)
  oneEventShare: 0.5,       // one step down when one event holds more than this share of M's deaths
  spanShare: 0.25,          // one step down when events over several months hold more than this share of a month
  stepsForNone: 3,          // this many steps or more: no mark
});

export const VOL_RULE = Object.freeze({
  id: 'vm-volatility-1',
  points: 4,                // the average score 4 points or more higher or lower; provisional, re-derived in April 2027
  minDays: 20,              // no mark with fewer scored days than this in any of the four months
  fewDays: 25,              // one step down with fewer scored days than this in M
  firstMonth: '2027-04',    // the first month whose four months can all have scores with a full 90-day baseline
  watchPoints: 4,           // the watch list: the last 7 days' average this much above the 28 days before
});

// The words a reader sees; the data keeps Jude's values (12 November 2026).
export const WORDS = Object.freeze({ worse: 'More deaths recorded', better: 'Fewer deaths recorded', same: 'No large change by this rule', none: 'No mark' });
export const VOL_WORDS = Object.freeze({ worse: 'More volatile', better: 'Less volatile', same: 'No large change by this rule', none: 'No mark' });
export const SIGNS = Object.freeze({ worse: '+', better: '−', same: '=', none: '' });
export const CONFIDENCE = ['high', 'medium', 'low'];

/* ------------------------------------------------------------------------------------------ months and words */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const addMonths = (m, k) => { const [y, mo] = m.split('-').map(Number), t = y * 12 + (mo - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
export const monthsFrom = (a, b) => { const out = []; for (let m = a; m <= b; m = addMonths(m, 1)) out.push(m); return out; };
export const monthName = m => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const monthOnly = m => MONTHS[+m.slice(5, 7) - 1];
export const fmt = n => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-GB') : '–');
const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('en-GB', { maximumFractionDigits: 1 });
const pct = (a, b) => (b > 0 ? `${a >= b ? '+' : '−'}${fmt(Math.abs(a - b) / b * 100)}%` : 'none before');
// "June–August 2026", or "November 2026–January 2027" across a year.
export const spanName = (a, b) => (a.slice(0, 4) === b.slice(0, 4) ? `${monthOnly(a)}–${monthName(b)}` : `${monthName(a)}–${monthName(b)}`);
const dayName = d => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; };
const daySpan = (a, b) => {
  if (!b || b === a) return dayName(a);
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  if (y1 === y2 && m1 === m2) return `${d1} to ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  if (y1 === y2) return `${d1} ${MONTHS[m1 - 1]} to ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  return `${dayName(a)} to ${dayName(b)}`;
};
const list3 = xs => `${xs[0]}, ${xs[1]} and ${xs[2]}`;
const andList = xs => (xs.length < 2 ? xs.join('') : xs.length === 2 ? `${xs[0]}, and ${xs[1]}` : `${xs.slice(0, -1).join('; ')}; and ${xs.at(-1)}`);
// A month-long tally UCDP records as one event names its span in its headline ("… 01.09.2026 - 30.09.2026"): the
// wording then says it is a report covering those days, not an event on its first day.
const HEAD_SPAN = /(\d{1,2})\.(\d{1,2})\.(\d{4})\s*[-–]\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/;
export function reportSpan(t) {
  const x = HEAD_SPAN.exec(String(t?.headline || ''));
  if (!x || !t?.date) return null;
  const p = (d, m, y) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, from = p(x[1], x[2], x[3]), to = p(x[4], x[5], x[6]);
  return to > from && from.slice(0, 7) === t.date.slice(0, 7) ? { from, to } : null;
}
export const median3 = xs => [...xs].sort((a, b) => a - b)[1];
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
export const short = (s, n = 80) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };

/* ------------------------------------------------------------------------------------------- the comparisons */
/** Deaths in M against three months: 'worse' | 'better' | 'same' (the rule above). */
export function deathsDirection(D, base, r = RULE) {
  const B = median3(base), hi = Math.max(...base), lo = Math.min(...base);
  if (D >= r.ratio * B && D - B >= r.minDeathChange && D > hi) return 'worse';
  if (D <= B / r.ratio && B - D >= r.minDeathChange && D < lo) return 'better';
  return 'same';
}
/** Events in M against three months, as a check: 'up' | 'down' | 'level'. */
export function eventsDirection(E, base, r = RULE) {
  const B = median3(base);
  if (E >= r.ratio * B && E - B >= r.minEventChange) return 'up';
  if (E <= B / r.ratio && B - E >= r.minEventChange) return 'down';
  return 'level';
}

/**
 * Why a month is 'same': the conditions of the nearer direction (more when D is at or above the median, else fewer)
 * that D does not meet. months: the three months' names, oldest first. Returns { text, ratioFailed }.
 */
export function sameReason(D, base, M, months, r = RULE) {
  const B = median3(base), fails = [];
  let ratioFailed = false;
  const at = v => { let k = -1; base.forEach((x, i) => { if (x === v) k = i; }); return monthOnly(months[k]); };
  if (D >= B) {
    if (D < r.ratio * B) { fails.push(`under one and a half times the median of ${fmt(B)}`); ratioFailed = true; }
    if (D - B < r.minDeathChange) fails.push(`fewer than ${r.minDeathChange} more than the median`);
    const hi = Math.max(...base);
    if (!(D > hi)) fails.push(`not above every one of the three months: ${at(hi)} had ${fmt(hi)}`);
  } else {
    if (D > B / r.ratio) { fails.push(`over two thirds of the median of ${fmt(B)}`); ratioFailed = true; }
    if (B - D < r.minDeathChange) fails.push(`fewer than ${r.minDeathChange} below the median`);
    const lo = Math.min(...base);
    if (!(D < lo)) fails.push(`not below every one of the three months: ${at(lo)} had ${fmt(lo)}`);
  }
  return { text: `No large change by this rule because ${monthOnly(M)}'s ${fmt(D)} deaths are ${andList(fails)}.`, ratioFailed };
}

/* ------------------------------------------------------------------------------------------- one mark */
const none = (base, code, why) => ({ ...base, direction: 'none', words: WORDS.none, sign: '', confidence: null, why: { code, text: why } });

/**
 * The fighting mark of one unit for month M.
 *   series   the unit's months (see the top); any order
 *   M        'yyyy-mm'
 *   ctx      { from: the unit's first month that can be counted (a state's independence), with fromWhy;
 *              seam: a reason why the four months cannot be compared (a conflict counted in one year only);
 *              evidence: [...] (the datasets, filled in by the builder); yearBefore: deaths a year before M, if held }
 * Returns a Mark: { month, strand, direction, words, sign, period, figures, confidence, steps, provisional, what, why,
 *                   notes }. Every mark has `what` (figures), `period` and `steps`; a 'none' has `why`.
 */
export function fightingMark(series, M, ctx = {}, r = RULE) {
  const at = new Map(series.map(x => [x.m, x]));
  const months = [addMonths(M, -3), addMonths(M, -2), addMonths(M, -1)];
  const row = at.get(M), bs = months.map(m => at.get(m));
  const period = { month: M, baseline: months };
  const base = { month: M, strand: 'fighting', period, steps: [], provisional: !!row?.prov, notes: [] };
  if (!row) return none({ ...base, figures: null, what: `VM holds no figures for ${monthName(M)} yet.` }, 'unpublished', `UCDP has not yet published figures for ${monthName(M)}: it does so three to four weeks after a month ends.`);
  const four = [...bs, row];
  const D = row.d, E = row.e;
  if (bs.some(x => !x)) {
    const gone = months.filter((m, k) => !bs[k]);
    return none({ ...base, figures: { deaths: D, events: E }, what: `${fmt(D)} deaths recorded in ${monthName(M)}, in ${fmt(E)} events; VM holds no figures for ${gone.map(monthName).join(', ')} to compare them with.` },
      'missing', `The rule compares a month with the three before it, and VM holds no figures for ${gone.map(monthName).join(', ')}.`);
  }
  const bd = bs.map(x => x.d), be = bs.map(x => x.e), B = median3(bd), Be = median3(be);
  const figures = {
    deaths: D, baseline: bd, median: B, change: D - B, pct: B > 0 ? Math.round((D - B) / B * 100) : null,
    events: E, eventBaseline: be, eventMedian: Be, prev: { month: months[2], deaths: bd[2] },
    yearBefore: Number.isFinite(ctx.yearBefore) ? { month: addMonths(M, -12), deaths: ctx.yearBefore } : null,
    top: row.top || null, shared: four.some(x => x.sh == null) ? null : four.map(x => x.sh),
  };
  const what = `${fmt(D)} deaths recorded in ${monthName(M)}, in ${fmt(E)} event${E === 1 ? '' : 's'}, against ${list3(months.map((m, k) => `${monthOnly(m)} ${fmt(bd[k])}`))}: a median of ${fmt(B)} a month. That is ${D >= B ? `${fmt(D - B)} more` : `${fmt(B - D)} fewer`} (${pct(D, B)}).`;
  const withFigs = { ...base, figures, what };
  const part = four.find(x => x.part);
  if (part) return none(withFigs, 'partial', part.part.why || `${monthName(part.m)} is not a whole month in these figures: they count it only from ${dayName(part.part.from)} to ${dayName(part.part.to)}.`);
  if (ctx.from && months[0] < ctx.from) return none(withFigs, 'start', ctx.fromWhy || `The four months begin before ${monthName(ctx.from)}.`);
  if (four.some(x => x.est)) return none(withFigs, 'estimate', `At least one of the four months is an estimate (a yearly or whole-war total spread over its months), not recorded events.`);
  const srcs = [...new Set(four.map(x => x.src))];
  if (srcs.length > 1) return none(withFigs, 'datasets', `The four months come from different UCDP datasets (${srcs.join(' and ')}), which count events differently.`);
  if (ctx.seam) return none(withFigs, 'seam', ctx.seam);
  if (E < r.minEventsMonth || mean(be) < r.minEventsBaseline) return none(withFigs, 'thin', `Too few events to say: ${fmt(E)} in ${monthName(M)} and an average of ${fmt1(mean(be))} a month before it; the rule needs at least ${r.minEventsMonth} in each.`);
  if (D + bd.reduce((s, x) => s + x, 0) < r.minDeathsFour) return none(withFigs, 'thin', `Too few deaths to say: ${fmt(D + bd.reduce((s, x) => s + x, 0))} in the four months; the rule needs at least ${r.minDeathsFour}.`);

  const dir = deathsDirection(D, bd, r);
  const evDir = eventsDirection(E, be, r);
  figures.direction = dir; figures.eventsDirection = evDir;
  if (dir === 'same') {
    const sr = sameReason(D, bd, M, months, r);
    base.reason = sr.text;
    if (sr.ratioFailed && Math.abs(D - B) >= 100) base.notes.push('Because the rule uses proportions, a change of hundreds of deaths in a large war can fall below it.');
  }
  // One event decides it: the mark must hold with M's largest event taken out; for fewer, also with each month's own
  // largest event taken out of it (like with like), and with the largest event of the three months before taken out of
  // its month, unless every one of the four months is led by one event holding more than half its deaths.
  const rep = t => reportSpan(t);
  const noun = t => (rep(t) ? 'report' : 'event');
  const ev = t => { const s = rep(t); return `${s ? `a report covering ${daySpan(s.from, s.to)}` : t.date ? daySpan(t.date, t.end) : 'an undated event'}${t.place ? `, ${short(t.place, 60)}` : ''}: ${fmt(t.n)} deaths`; };
  if (dir !== 'same' && row.top) {
    const d1 = deathsDirection(D - row.top.n, bd, r);
    figures.withoutTop = { deaths: D - row.top.n, direction: d1 };
    if (d1 !== dir) return none(withFigs, 'one-event', `One ${noun(row.top)} decides it (${ev(row.top)}). Without it ${monthName(M)} has ${fmt(D - row.top.n)} deaths against the median of ${fmt(B)}: no large change by this rule.`);
  }
  if (dir === 'better') {
    const tops = four.map(x => x.top?.n || 0), bdL = bd.map((x, i) => x - tops[i]), DL = D - tops[3], dL = deathsDirection(DL, bdL, r);
    figures.likeForLike = { deaths: DL, baseline: bdL, median: median3(bdL), direction: dL };
    if (dL !== 'better') return none(withFigs, 'one-event', `Single events decide it: with each month's own largest event taken out of it, ${monthName(M)} has ${fmt(DL)} deaths against ${list3(months.map((m, k) => `${monthOnly(m)} ${fmt(bdL[k])}`))}, a median of ${fmt(median3(bdL))}: no large change by this rule.`);
    const led = four.every(x => x.top && x.d > 0 && x.top.n > r.oneEventShare * x.d);
    const k = bs.reduce((best, x, i) => ((x.top?.n || 0) > (bs[best].top?.n || 0) ? i : best), 0);
    if (!led && bs[k].top?.n) {
      const bd2 = bd.map((x, i) => (i === k ? x - bs[k].top.n : x)), d2 = deathsDirection(D, bd2, r);
      if (d2 !== 'better') return none(withFigs, 'one-event', `One ${noun(bs[k].top)} in the months before decides it (${ev(bs[k].top)}, in ${monthName(months[k])}). Without it the median is ${fmt(median3(bd2))}: no large change by this rule.`);
    }
  }
  // Reports covering several months: when more than a quarter of the three months' deaths come from them and a quarter
  // or less of M's do, later releases may add such deaths to M, so a fall is not marked. A share, not presence: a few
  // deaths from one such report in a baseline month do not stop a fall (the design, F3: "more than a quarter").
  const shareOf = x => (x.d > 0 && x.sh != null ? x.sh / x.d : 0);
  if (dir === 'better' && figures.shared) {
    const bsh = bs.reduce((s, x) => s + x.sh, 0), btot = bd.reduce((s, x) => s + x, 0);
    if (btot > 0 && bsh / btot > r.spanShare && shareOf(row) <= r.spanShare)
      return none(withFigs, 'period-gap', `More than a quarter of the deaths in the three months before come from events UCDP dates only to a span running across months (${fmt(bsh)} of ${fmt(btot)}), against ${row.sh ? `${fmt(row.sh)} of ${monthName(M)}'s ${fmt(D)}` : `none of ${monthName(M)}'s ${fmt(D)}`}: a later UCDP release may add such deaths to ${monthName(M)}.`);
  }

  const steps = [];
  if (E < r.thinEvents || mean(be) < r.thinEvents) steps.push({ code: 'few-events', text: `Few events: ${fmt(E)} in ${monthName(M)} and an average of ${fmt1(mean(be))} a month before it (fewer than ${r.thinEvents} in either lowers confidence).` });
  if (row.top && row.top.n > r.oneEventShare * D) {
    const named = row.top.headline ? ` “${short(row.top.headline, 110)}”${row.top.office ? ` (${short(row.top.office, 40)}, as UCDP records it)` : ''}` : '';
    const s = reportSpan(row.top);
    steps.push({ code: 'one-event', text: `One ${s ? 'report' : 'event'} holds more than half of ${monthOnly(M)}'s deaths: ${fmt(row.top.n)} of ${fmt(D)} (${fmt(row.top.n / D * 100)}%),${named} ${s ? `covering ${daySpan(s.from, s.to)}` : `${row.top.end && row.top.end !== row.top.date ? 'dated' : 'on'} ${daySpan(row.top.date, row.top.end)}`}.` });
    if (row.top.headline) base.notes.push(`Most of ${monthOnly(M)}'s deaths come from one report:${named}. A count compiled from one source's reports can change as more deaths are documented.`);
  }
  if (figures.shared == null) steps.push({ code: 'span-unknown', text: 'These figures count each event in the month it starts, so deaths UCDP dates only to a span of months could not be checked.' });
  else {
    const over = four.map((x, k) => [x, k]).filter(([x]) => shareOf(x) > r.spanShare);
    if (over.length) steps.push({ code: 'span', text: `More than a quarter of a month's deaths come from events UCDP dates only to a span running across months: ${over.map(([x]) => `${monthName(x.m)}, ${fmt(x.sh)} of ${fmt(x.d)} (${fmt(x.sh / x.d * 100)}%)`).join('; ')}.` });
  }
  if ((dir === 'worse' && evDir === 'down') || (dir === 'better' && evDir === 'up'))
    steps.push({ code: 'disagree', text: `Deaths and events point opposite ways: deaths ${dir === 'worse' ? 'rose' : 'fell'} while events ${evDir === 'up' ? 'rose' : 'fell'} (${fmt(E)} against a median of ${fmt(Be)}).` });
  const provs = four.filter(x => x.prov);
  if (provs.length) steps.push({ code: 'provisional', text: `Provisional figures: ${provs.length === 4 ? 'all four months come' : `${provs.length === 1 ? `${monthName(provs[0].m)} comes` : `${provs.slice(0, -1).map(x => monthName(x.m)).join(', ')} and ${monthName(provs.at(-1).m)} come`}`} from UCDP's candidate events, which UCDP revises; its final figures come the next year.` });
  // Context that never changes the mark.
  if (dir !== 'same' && bd[2] >= D / r.ratio && bd[2] <= D * r.ratio) base.notes.push(`Most of this change came in ${monthName(months[2])}: ${monthOnly(M)}'s ${fmt(D)} deaths are close to ${monthOnly(months[2])}'s ${fmt(bd[2])}.`);
  if (figures.yearBefore) base.notes.push(`A year earlier, ${monthName(figures.yearBefore.month)}: ${fmt(figures.yearBefore.deaths)} deaths. The rule does not adjust for fighting seasons.`);
  const { reason, ...rest } = base;
  const out = { ...rest, figures, what, steps };
  if (steps.length >= r.stepsForNone) return none(out, 'uncertain', `Too uncertain to mark: ${steps.length} of the rule's checks lower its confidence (listed below).`);
  return { ...out, ...(reason ? { what: `${what} ${reason}`, reason } : {}), direction: dir, words: WORDS[dir], sign: SIGNS[dir], confidence: CONFIDENCE[steps.length], why: null };
}

/* ------------------------------------------------------------------------------------------- volatility */
/**
 * The volatility mark of a country for month M, kept apart from deaths. days: [[day, score, components, events, tone,
 * coverage], ...] (volatility/data/index.json); methodOf(day): the method that scored the day, or null when the store
 * does not say (it does not yet: then there is no mark); fullBaseline(day): whether the day's score was ranked against
 * a full 90-day window.
 */
export function volatilityMark(days, M, { methodOf = () => null, fullBaseline = () => false } = {}, r = VOL_RULE) {
  const months = [addMonths(M, -3), addMonths(M, -2), addMonths(M, -1)];
  const period = { month: M, baseline: months };
  const of = m => days.filter(x => x[0].startsWith(m) && x[1] != null);
  const rows = [...months, M].map(of), mRows = rows[3];
  const base = { month: M, strand: 'volatility', period, steps: [], provisional: false, notes: [], figures: null };
  const nm = (code, why, what) => ({ ...base, what: what || `Volatility for ${monthName(M)} is not compared yet.`, direction: 'none', words: VOL_WORDS.none, sign: '', confidence: null, why: { code, text: why } });
  const avg = xs => (xs.length ? mean(xs.map(x => x[1])) : null);
  const what = mRows.length ? `An average score of ${fmt1(avg(mRows))} over ${mRows.length} scored days in ${monthName(M)}${rows.slice(0, 3).every(x => x.length) ? `, against ${fmt1(avg(rows.slice(0, 3).flat()))} over ${spanName(months[0], months[2])}` : ''}.` : null;
  if (M < r.firstMonth) return nm('too-early', `No volatility mark before ${monthName(r.firstMonth)}: every scored day in the four months must have been ranked against a full 90 days, under one method, and VM's scores begin on 26 September 2026.`, what);
  const all = rows.flat();
  if (all.some(x => !methodOf(x[0]))) return nm('method-unknown', 'The volatility store does not say which method scored each day, so the four months cannot be shown to be alike.', what);
  if (new Set(all.map(x => methodOf(x[0]))).size > 1) return nm('methods', 'The four months were scored by different methods, whose scores cannot be compared.', what);
  if (all.some(x => !fullBaseline(x[0]))) return nm('baseline', 'Some days in the four months were ranked against fewer than 90 days.', what);
  if (rows.some(x => x.length < r.minDays)) return nm('thin', `Fewer than ${r.minDays} scored days in a month of the four.`, what);
  const lowCover = x => x.filter(d => d[5] === 'l' || d[5] === 'i').length > x.length / 2;
  if (rows.some(lowCover)) return nm('coverage', 'Most days in a month of the four had little news coverage, and a rise in coverage alone can move a score.', what);
  const a = avg(mRows), b = avg(rows.slice(0, 3).flat()), dir = a - b >= r.points ? 'worse' : b - a >= r.points ? 'better' : 'same';
  const reports = x => mean(x.map(d => d[3] || 0));
  const figures = { score: +a.toFixed(1), baseline: +b.toFixed(1), change: +(a - b).toFixed(1), days: mRows.length, reportsPerDay: Math.round(reports(mRows)), baselineReportsPerDay: Math.round(reports(rows.slice(0, 3).flat())) };
  const steps = [];
  if (mRows.length < r.fewDays) steps.push({ code: 'few-days', text: `Only ${mRows.length} scored days in ${monthName(M)}.` });
  return { ...base, figures, what: `${what} News reports a day: ${fmt(figures.reportsPerDay)} against ${fmt(figures.baselineReportsPerDay)}.`, steps, direction: dir, words: VOL_WORDS[dir], sign: SIGNS[dir], confidence: CONFIDENCE[steps.length], why: null };
}

/** The watch list's volatility line: countries whose last 7 scored days average watchPoints or more above the 28 days
 *  before, with at least 5 and 20 scored days, most of the 35 days at medium or high coverage. */
export function volatilityRise(days, lastDay, r = VOL_RULE) {
  const day = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
  const a7 = day(lastDay, -6), a28 = day(lastDay, -34), b28 = day(lastDay, -7);
  const last = days.filter(x => x[0] >= a7 && x[0] <= lastDay && x[1] != null), before = days.filter(x => x[0] >= a28 && x[0] <= b28 && x[1] != null);
  if (last.length < 5 || before.length < 20) return null;
  const all = [...last, ...before];
  if (all.filter(x => x[5] === 'h' || x[5] === 'm').length <= all.length / 2) return null;
  const s = x => mean(x.map(d => d[1])), rep = x => Math.round(mean(x.map(d => d[3] || 0)));
  const now = s(last), was = s(before);
  if (now - was < r.watchPoints) return null;
  return { last: +now.toFixed(1), before: +was.toFixed(1), change: +(now - was).toFixed(1), from: a7, to: lastDay, beforeFrom: a28, beforeTo: b28, days: last.length, beforeDays: before.length, reportsPerDay: rep(last), beforeReportsPerDay: rep(before) };
}

/* ------------------------------------------------------------------------------------------- checks of marks */
/** Everything a published mark must carry (tests/monthly.test.mjs, and the builder before it writes). [] when whole. */
export function markProblems(mark) {
  const p = [];
  if (!mark || typeof mark !== 'object') return ['no mark object'];
  if (!['worse', 'better', 'same', 'none'].includes(mark.direction)) p.push(`direction ${mark.direction}`);
  if (typeof mark.what !== 'string' || !mark.what) p.push('no what');
  const per = mark.period;
  if (!per || per.month !== mark.month || !Array.isArray(per.baseline) || per.baseline.length !== 3 || per.baseline.some((m, k) => m !== addMonths(mark.month, k - 3))) p.push('period is not four consecutive months');
  if (mark.direction === 'same' && mark.strand === 'fighting' && !mark.reason) p.push('a same without the condition that failed');
  if (mark.direction === 'none') { if (!mark.why?.text) p.push('a none without its why'); }
  else {
    if (!CONFIDENCE.includes(mark.confidence)) p.push('no confidence');
    if (CONFIDENCE.indexOf(mark.confidence) !== (mark.steps || []).length) p.push('confidence is not high less its steps');
    if (!Array.isArray(mark.evidence) || !mark.evidence.length) p.push('no evidence');
    for (const e of mark.evidence || []) for (const k of ['dataset', 'version', 'released', 'counts', 'page']) if (!e?.[k]) p.push(`evidence without ${k}`);
  }
  for (const s of mark.steps || []) if (!s?.code || !s?.text) p.push('a step without its words');
  return p;
}
