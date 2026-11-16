// War Focus: how a death figure is written. A month marked as estimated (scripts/build.mjs) is a share of a yearly
// (PRIO) or whole-war (Correlates of War) total, spread over its months by the battles or UCDP events recorded in each,
// so it is no count of people: it is shown rounded and marked ~. A month, or a period of months, to two significant
// figures; a running or whole-war total that includes such months to three (it gathers many months, and the sources'
// own totals carry more digits than any one month's share); a running total of one month is that month, written as one.
// A recorded count (UCDP's events) stays as it is.
// Pure functions, no DOM: app.js uses them, and tests/warfocus.test.mjs tests them in Node.

/** n rounded to `digits` significant figures (a number below 10^digits is unchanged). */
export function sig(n, digits) {
  if (!Number.isFinite(n) || n === 0) return n;
  const k = 10 ** (Math.floor(Math.log10(Math.abs(n))) + 1 - digits);
  return k <= 1 ? Math.round(n) : Math.round(n / k) * k;
}

const whole = n => Math.round(n).toLocaleString('en-GB');

/** A figure as written: `est` marks one built on estimated months; `total` a running or whole-war total. */
export function deaths(n, est, { total = false } = {}) {
  return est ? `~${whole(sig(n, total ? 3 : 2))}` : whole(n);
}

/** Whose estimate a war's ~ figures are, from its deathsSource (scripts/build.mjs writes it), in a few words. */
export function estimateOf(source) {
  const s = String(source || '');
  if (/^Correlates of War/.test(s)) return 'Correlates of War’s war total';
  if (/PRIO/.test(s)) return 'PRIO’s yearly totals';
  return '';
}

// ---- A whole and its parts (RV-05 A1, 16 November 2026). One rule for every war, never a list of cases: when an
// event and one or more of its own parts are both in a war's list (Wikidata's "part of", P361, from the part, or "has
// part(s)", P527, from the whole), the data records the link both ways (`up` on the part, `parts` on the whole) and
// each death is counted once. The atomic bombings of Hiroshima and Nagasaki are a heading over the two bombings, not a
// third entry beside them. scripts/build.mjs uses linkParts and ownDeaths; app.js uses groupBattles and figureText.

const qnum = q => +String(q).slice(1);

/**
 * The links between a war's battles. `qids` in the list's order; `edges` [{ c: part, parent: whole }], P361 and P527
 * alike. Only links between two items of the list count. A part with more than one whole in the list is put under one
 * (`up`), so its deaths sit under one heading: the whole that is itself a part of another of them; else (the second
 * reader, WF2-04) the whole whose own recorded figure is at least the part's, as it contains it, then the whole whose
 * dates contain the part's; then the one with fewer parts, then the lower QID number. The others are kept as `upAlso`.
 * `facts` (optional): Map q → { v: the largest figure Wikidata records for it, s, e: its dates }. A cycle (two items
 * each part of the other) is broken at the first item in the list's order that closes it. Returns Map q → { up,
 * upAlso, parts }.
 */
export function linkParts(qids, edges, facts = new Map()) {
  const inList = new Set(qids), wholes = new Map(), partsOf = new Map();
  for (const { c, parent } of edges) {
    if (c === parent || !inList.has(c) || !inList.has(parent)) continue;
    (wholes.get(c) || wholes.set(c, new Set()).get(c)).add(parent);
    (partsOf.get(parent) || partsOf.set(parent, new Set()).get(parent)).add(c);
  }
  const above = q => { const out = new Set(), todo = [...(wholes.get(q) || [])]; while (todo.length) { const x = todo.pop(); if (out.has(x)) continue; out.add(x); todo.push(...(wholes.get(x) || [])); } return out; };
  const up = new Map(), also = new Map();
  for (const q of qids) {
    const cands = [...(wholes.get(q) || [])];
    if (!cands.length) continue;
    const depth = new Map(cands.map(p => { const a = above(p); return [p, cands.filter(o => o !== p && a.has(o)).length]; }));
    const me = facts.get(q) || {}, f = p => facts.get(p) || {};
    const holds = p => (me.v > 0 && f(p).v >= me.v ? 1 : 0);
    const within = p => (me.s && f(p).s && f(p).s.slice(0, 10) <= me.s.slice(0, 10) && (f(p).e || f(p).s).slice(0, 10) >= (me.e || me.s).slice(0, 10) ? 1 : 0);
    cands.sort((a, b) => depth.get(b) - depth.get(a) || holds(b) - holds(a) || within(b) - within(a) || (partsOf.get(a)?.size || 0) - (partsOf.get(b)?.size || 0) || qnum(a) - qnum(b));
    up.set(q, cands[0]); also.set(q, cands.slice(1).sort((a, b) => qnum(a) - qnum(b)));
  }
  for (const q of qids) {
    const seen = new Set([q]);
    for (let x = up.get(q); x; x = up.get(x)) {
      if (x === q) { also.get(q).unshift(up.get(q)); up.delete(q); break; }
      if (seen.has(x)) break;
      seen.add(x);
    }
  }
  const out = new Map(qids.map(q => [q, { up: up.get(q) || null, upAlso: also.get(q) || [], parts: [] }]));
  for (const q of qids) if (up.has(q)) out.get(up.get(q)).parts.push(q);
  return out;
}

/**
 * An item's own death figure from the distinct figures Wikidata records for it (`values`) and those its parts in the
 * list record for themselves (`partValues`): a figure that is one of its parts' own is that part's, not the whole's
 * (Wikidata gives the atomic bombings of Hiroshima and Nagasaki Hiroshima's 286,818 and Nagasaki's 162,083). The
 * largest of the rest is its own, as before. `dv` keeps every figure recorded when there is more than one, or when one
 * was left to a part.
 */
export function ownDeaths(values, partValues) {
  const all = [...new Set(values)].filter(v => v > 0).sort((a, b) => b - a), own = all.filter(v => !partValues.has(v));
  return { deaths: own[0] ?? null, dv: all.length > 1 || own.length < all.length ? all : null };
}

/**
 * A war's battles as wholes and parts. Each node: { b, up, parts, shown, own, sum, fig, from, cfig, key, late }. A
 * node's figure (`fig`) is its own recorded deaths where Wikidata records any, else the sum of its parts' figures
 * (`sum`), so each death is counted once: a whole contains its parts. `from` says which: 'own' (recorded for the whole)
 * or 'parts' (the sum of its parts' recorded figures). Where a whole's own figure is below its parts' sum, it is still
 * ranked by its own (the second reader, WF2-03: in each such case a part was at fault, as the October 7 attacks' 1,200
 * against a part's 579 where Wikipedia gives 5), and the sum is said beside it. Casualties (`cfig`) follow the same
 * rule apart, and rank an entry only where no deaths are recorded in it at all, as before. `late`: [[year, deaths]],
 * the share of its figure counted long after the event (a battle's `dAt`), by the year it was counted. `ranked`: the
 * entries with no whole above them, largest first; a whole's parts are `shown` under it, never beside it. `total`: the
 * sum over the ranking, each death once.
 */
export function groupBattles(battles) {
  const byQ = new Map(battles.map(b => [b.q, { b, up: null, parts: [], shown: [], own: b.deaths || 0, ownCas: b.cas || 0, sum: 0, fig: 0, cfig: 0, from: null, key: 0, late: [] }]));
  for (const n of byQ.values()) { const u = n.b.up && byQ.get(n.b.up); if (u && u !== n) { n.up = u; u.parts.push(n); } }
  const order = new Map(battles.map((b, k) => [b.q, k]));
  const done = new Set(), busy = new Set();
  const visit = n => {
    if (done.has(n) || busy.has(n)) return n;
    busy.add(n);
    n.parts.forEach(visit);
    n.sum = n.parts.reduce((s, p) => s + p.fig, 0);
    const csum = n.parts.reduce((s, p) => s + p.cfig, 0);
    n.fig = n.own || n.sum; n.cfig = n.ownCas || csum;
    n.from = !n.fig ? null : n.own ? 'own' : 'parts';
    n.key = n.fig || n.cfig;
    // The share counted long after the battle (`dAt`), by year: the whole's own figure, or its parts' shares.
    const late = new Map();
    if (n.from === 'own' && n.b.dAt) late.set(n.b.dAt.slice(0, 4), n.fig);
    if (n.from === 'parts') for (const p of n.parts) for (const [y, v] of p.late) late.set(y, (late.get(y) || 0) + v);
    n.late = [...late].sort((x, y) => (x[0] < y[0] ? -1 : 1));
    n.shown = n.parts.filter(p => p.key > 0).sort((x, y) => y.key - x.key || order.get(x.b.q) - order.get(y.b.q));
    busy.delete(n); done.add(n);
    return n;
  };
  byQ.forEach(visit);
  const ranked = [...byQ.values()].filter(n => !n.up && n.key > 0).sort((x, y) => y.key - x.key || order.get(x.b.q) - order.get(y.b.q));
  return { byQ, ranked, total: ranked.reduce((s, n) => s + n.fig, 0) };
}

// A figure counted long after the event (the second reader, WF2-01): Wikidata dates the atomic bombings' figures to
// 2013, the cities' registers of the dead, which take in people who died in later years.
export const LATE = 'a late count, which can include later deaths';
const years = ys => (ys.length > 2 ? `${ys.slice(0, -1).join(', ')} and ${ys.at(-1)}` : ys.join(' and '));
/** What of a node's figure was counted late, in words: ", counted in 2013 (…)" where all of it was, "; 448,901 of them
 *  counted in 2013 (…)" where a share was; '' where none. `num` writes a number (spoken, in the narrator). */
export function lateText(n, num = whole, { spoken = false } = {}) {
  if (!n.late?.length || !n.fig) return '';
  const counted = n.late.reduce((s, [, v]) => s + v, 0);
  if (counted >= n.fig) return spoken ? `, counted in ${years(n.late.map(([y]) => y))}, ${LATE}` : `, counted in ${years(n.late.map(([y]) => y))} (${LATE})`;
  const shares = n.late.map(([y, v], k) => (k ? `${num(v)} in ${y}` : `${num(v)} of them counted in ${y}`)).join(', ');
  return spoken ? `; some ${shares}, ${LATE}` : `; ${shares} (${LATE})`;
}

/** A node's figure in words: "286,818 deaths", "105,400 deaths recorded for the whole", "448,901 deaths, the sum of its
 * parts' recorded figures", "1,200 deaths recorded for the whole; its parts' figures add up to 1,317", with the year
 * of a late count beside the share counted in it. */
export function figureText(n) {
  const shownParts = n.shown.length > 0;
  if (n.fig) {
    const how = !shownParts ? '' : n.from === 'own' ? ' recorded for the whole' : ', the sum of its parts\' recorded figures';
    const more = n.from === 'own' && n.sum > n.fig ? `; its parts' figures add up to ${whole(n.sum)}` : '';
    return `${whole(n.fig)} deaths${how}${lateText(n)}${more}`;
  }
  if (n.cfig) return `${whole(n.cfig)} casualties${!shownParts ? '' : n.ownCas ? ' recorded for the whole' : ', the sum of its parts\' recorded figures'}`;
  return '';
}

/** Whether a battle's name is said as a plural ("The air raids on Japan end", "The Arctic convoys begin"). */
export const plural = name => /\bconvoys\b|s of\b|\b(?:raids|bombings|attacks|strikes|landings|massacres|killings|shellings|deportations|offensives|operations|battles|campaigns)\b/i.test(String(name).replace(/^the /i, ''));

/** The narrator's line for a battle that ends that month, by its node (groupBattles): a toll only where Wikidata
 *  records one for the item itself; a whole with none, its parts' sum said as theirs (the second reader, WF2-02); ''
 *  under ten thousand. `spoken` writes a number to be read aloud. */
export function endLine(b, n, spoken) {
  const name = b.n.replace(/^the /i, ''), many = plural(name), verb = many ? 'end' : 'ends';
  if (n?.own ?? b.deaths) { const v = n?.own ?? b.deaths; return v >= 10000 ? `The ${name} ${verb}, at a cost of some ${spoken(v)} lives${n ? lateText(n, spoken, { spoken: true }) : ''}.` : ''; }
  if (!n || n.from !== 'parts' || n.fig < 10000) return '';
  return `The ${name} ${verb}, with some ${spoken(n.fig)} deaths recorded in ${many ? 'their' : 'its'} parts${lateText(n, spoken, { spoken: true })}.`;
}

/** The figures Wikidata gives a battle that are its parts' own, so counted with them: [{ v, part }], over every part
 *  that names it as a whole (`up` or `upAlso`), whichever whole the part is counted under (the second reader, WF2-04). */
export function leftToParts(b, battles) {
  const parts = battles.filter(p => p.q !== b.q && (p.up === b.q || (p.upAlso || []).includes(b.q)));
  return (b.dv || []).filter(v => v !== b.deaths).map(v => ({ v, part: parts.find(p => (p.dv || [p.deaths]).includes(v)) })).filter(x => x.part);
}

/** The deaths a battle's mark on the map is sized by: what its figure has beyond its mapped parts' (`drawn`, set by the
 *  page); a battle with casualties only, by them, unless a whole above it records deaths, which hold the same people
 *  (the Bombing of Tokyo of 10 March 1945 under the Bombing of Tokyo: the second reader, WF2-05). */
export function markValue(n) {
  if (n.fig) return n.drawn ?? n.fig;
  if (n.shown.length) return 0;
  for (let u = n.up, k = 0; u && k < 40; u = u.up, k++) if (u.fig) return 0;
  return n.b.cas || 0;
}
