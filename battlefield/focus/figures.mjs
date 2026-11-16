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
  const byQ = new Map(battles.map(b => { const d = ownFigure(b, 'd'), c = ownFigure(b, 'c'); return [b.q, { b, up: null, parts: [], shown: [], own: d?.low || 0, ownCas: c?.low || 0, ownFig: d, ownCasFig: c, sum: 0, fig: 0, cfig: 0, from: null, key: 0, late: [], kind: null, wdOnly: true }]; }));
  for (const n of byQ.values()) { const u = n.b.up && byQ.get(n.b.up); if (u && u !== n) { n.up = u; u.parts.push(n); } }
  const order = new Map(battles.map((b, k) => [b.q, k]));
  const done = new Set(), busy = new Set();
  const visit = n => {
    if (done.has(n) || busy.has(n)) return n;
    busy.add(n);
    n.parts.forEach(visit);
    n.sum = n.parts.reduce((s, p) => s + p.fig, 0);
    const csum = n.parts.reduce((s, p) => s + p.cfig, 0);
    // An infobox's figure for a whole (BF-08) gives way to its parts' sum where that is larger: an infobox often gives
    // one side, or "at least" (the air raids on Japan's 2,691 against its parts' 554,301). Wikidata's own count for a
    // whole still ranks it, as before (WF2-03).
    const infoboxOwn = n.ownFig && n.ownFig.src !== 'wikidata';
    if (infoboxOwn && n.sum > n.own) { n.own = 0; n.ownFig = null; }
    if (n.ownCasFig && n.ownCasFig.src !== 'wikidata' && csum > n.ownCas) { n.ownCas = 0; n.ownCasFig = null; }
    n.fig = n.own || n.sum; n.cfig = n.ownCas || csum;
    n.from = !n.fig ? null : n.own ? 'own' : 'parts';
    // Its kind (BF-08): its own figure's, or the weakest of its parts' (a sum is no surer than its least sure part); and
    // whether every death in it is one Wikidata records (the narrator speaks only those).
    const counted = n.from === 'parts' ? n.parts.filter(p => p.fig) : [];
    n.kind = n.from === 'own' ? n.ownFig.status : n.from === 'parts' ? counted.reduce((k, p) => (KIND_ORDER[p.kind] > KIND_ORDER[k] ? p.kind : k), 'fact') : null;
    n.wdOnly = n.from === 'own' ? n.ownFig.src === 'wikidata' : n.from === 'parts' ? counted.every(p => p.wdOnly) : true;
    n.atLeast = n.from === 'own' ? !!n.ownFig.atLeast : n.from === 'parts' ? counted.some(p => p.atLeast) : false;
    n.high = n.from === 'own' ? n.ownFig.high : n.from === 'parts' ? counted.reduce((s, p) => s + p.high, 0) : 0;
    // Its casualties the same way (review P1, P3): their kind, their top, and "at least" where a listed part gives none.
    const ccounted = n.ownCas ? [] : n.parts.filter(p => p.cfig);
    n.ckind = n.ownCas ? n.ownCasFig.status : ccounted.length ? ccounted.reduce((k, p) => (KIND_ORDER[p.ckind] > KIND_ORDER[k] ? p.ckind : k), 'fact') : null;
    n.chigh = n.ownCas ? n.ownCasFig.high : ccounted.reduce((s, p) => s + p.chigh, 0);
    n.catLeast = n.ownCas ? !!n.ownCasFig.atLeast : ccounted.length > 0 && (ccounted.some(p => p.catLeast) || n.parts.some(p => !p.cfig));
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
  // "Recorded" is a kind (BF-08): the words say "recorded" only of Wikidata's plain counts; any other figure is "given"
  // (the review's F10, P8, R3-01). A figure as its source gives it: a range, or "at least" where a side gives none.
  const rec = (kind, wd) => wd && kind === 'fact';
  const word = (f, one, many) => (f.low === 1 && f.high === 1 && !f.atLeast ? one : many);
  const f = shownFigure(n, 'd');
  if (f) {
    const how = !shownParts ? '' : f.from === 'own' ? (rec(n.kind, n.wdOnly) ? ' recorded for the whole' : ' given for the whole') : `, the sum of its parts' ${rec(n.kind, n.wdOnly) ? 'recorded figures' : 'figures'}`;
    const more = f.from === 'own' && n.sum > n.fig ? `; its parts' figures add up to ${whole(n.sum)}` : '';
    return `${rangeText(f)} ${word(f, 'death', 'deaths')}${how}${lateText(n)}${more}`;
  }
  const c = shownFigure(n, 'c');
  if (c) {
    const wd = c.from === 'own' && c.src === 'wikidata';
    return `${rangeText(c)} ${word(c, 'casualty', 'casualties')}${!shownParts ? '' : c.from === 'own' ? (rec(c.status, wd) ? ' recorded for the whole' : ' given for the whole') : `, the sum of its parts' ${rec(c.status, wd) ? 'recorded figures' : 'figures'}`}`;
  }
  return '';
}

// ---- A figure, or a reason, for every battle (BF-08, 16 November 2026). A battle's deaths and casualties come from
// Wikidata (`deaths`, `cas`), else from its English Wikipedia article's infobox (`fd`, `fc`, written by
// scripts/build.mjs through scripts/infobox.mjs): { v } or { low, high }, its kind (`status`: fact, estimate or
// disputed), whose (`src`: wikidata or wikipedia), `origin` (source, or vm where VM added the sides), `atLeast` (a
// side gives none), `one` (one side only), `uv` (no reference beyond Wikipedia). A battle with neither has `fs`: words,
// unread (figures the reader refused), none; `fwp` says why Wikipedia gave nothing; `fu` UCDP's clashes nearby.

export const KIND_ORDER = { fact: 0, estimate: 1, disputed: 2 };
/** The kind of a figure in words, as the page shows it. */
export const kindWords = status => ({ fact: 'Recorded', estimate: 'Estimate', disputed: 'Disputed or unreliable' })[status] || '';
/** A figure object's amount in words: "843", "100–224", "at least 218", "569–1,200 or more". */
export function rangeText(f) {
  const lo = f.low ?? f.v, hi = f.high ?? f.v;
  const base = lo === hi ? whole(lo) : `${whole(lo)}–${whole(hi)}`;
  return f.atLeast ? (lo === hi ? `at least ${base}` : `${base} or more`) : base;
}
/**
 * A battle's own figure of a measure ('d' deaths, 'c' casualties) from whichever source gives it: Wikidata's count
 * (`deaths`, `cas`, with its kind from `fd`/`fc` where the build marked it) or the infobox's (`fd`, `fc`). { low,
 * high, status, src, atLeast, one, origin, uv } or null; a recorded zero is { low: 0, high: 0 } (no figure to count).
 */
export function ownFigure(b, m = 'd') {
  const wd = m === 'd' ? b.deaths : b.cas, f = m === 'd' ? b.fd : b.fc;
  let out = null;
  if (wd > 0) {
    // Wikidata's count, with the range its qualifiers give (a minimum and a maximum, or limits), and where the infobox
    // disputes it, both readings: ranked by the lower (the review's F9 and F10).
    const own = f?.src === 'wikidata' ? f : null;
    let low = own?.low ?? wd, high = own?.high ?? wd, atLeast = !!own?.atLeast;
    // The range stays open at the top where the reading that gives its top is an "at least" (the second review's X2).
    if (own?.alt?.src === 'wikipedia') { const aHigh = own.alt.high ?? own.alt.v; low = Math.min(low, own.alt.low ?? own.alt.v); atLeast = aHigh > high ? !!own.alt.atLeast : aHigh === high ? atLeast || !!own.alt.atLeast : atLeast; high = Math.max(high, aHigh); }
    out = { low, high, status: own ? own.status : 'fact', src: 'wikidata', origin: 'source', ...(atLeast ? { atLeast: true } : {}), ...(own?.uv ? { uv: own.uv } : {}) };
  } else if (f) {
    const low = f.low ?? f.v, high = f.high ?? f.v;
    if (low > 0 || high > 0) out = { low, high, status: f.status, src: f.src, origin: f.origin || 'source', ...(f.atLeast ? { atLeast: true } : {}), ...(f.one ? { one: true } : {}), ...(f.civ ? { civ: true } : {}), ...(f.uv ? { uv: f.uv } : {}) };
  }
  // Casualties below the deaths beside them are no figure for the whole (the killed are casualties): a partial count,
  // said so (review F7).
  if (out && m === 'c') { const d = ownFigure(b, 'd'); if (d && out.high < d.low) out.below = true; }
  return out;
}
/** A node's figure of a measure as every list, tooltip and the window show it (review P1): its own, or the sum of its
 *  parts' (`from`), with the kind; a casualties figure below the deaths shown is `below`, no figure for the whole. */
export function shownFigure(n, m = 'd') {
  if (m === 'd') {
    if (!n.fig) return null;
    return n.from === 'own' ? { ...n.ownFig, from: 'own' } : { low: n.fig, high: n.high, status: n.kind, src: 'parts', from: 'parts', ...(n.atLeast ? { atLeast: true } : {}) };
  }
  if (!n.cfig) return null;
  const f = n.ownCas ? { ...n.ownCasFig, from: 'own' } : { low: n.cfig, high: n.chigh, status: n.ckind, src: 'parts', from: 'parts', ...(n.catLeast ? { atLeast: true } : {}) };
  delete f.below;
  const d = shownFigure(n, 'd');
  if (d && f.high < d.low) f.below = true;
  return f;
}
/** A node's figure in words with its kind: "at least 1,428 deaths · Recorded, one side", "0 deaths · Recorded". */
export function figureLine(n) {
  const text = figureText(n);
  if (text) {
    const f = shownFigure(n, 'd') || shownFigure(n, 'c');
    const note = sourceNote(f);
    return `${text} · ${kindWords(f.status || 'fact')}${scopeWords(f)}${note ? ` · ${note}` : ''}`;
  }
  return noFigureText(n.b, n);
}
/** Whose figures a figure covers, after its kind: ", one side", ", civilians only". */
export const scopeWords = f => (f?.civ ? ', civilians only' : f?.one ? ', one side' : '');
/** What stands behind a figure where it has no reference of its own (Scholar 5.1), one note for each case (review P4):
 *  Wikidata's statement citing nothing, or only imported from Wikipedia; the infobox citing nothing. */
export function sourceNote(f) {
  if (!f?.uv) return '';
  if (f.src === 'wikidata') return f.uv === 'w' ? 'Wikidata, imported from Wikipedia, no other reference' : 'Wikidata, no reference';
  return 'the article cites nothing for it';
}
/** Whether a battle's figure is a recorded zero: of deaths, or Wikidata's of casualties, which take in the killed (the
 *  second review's X8). An infobox's injuries of none, beside deaths not given, are no zero of the whole. */
const zeroOf = b => [b.fd, b.fc?.src === 'wikidata' ? b.fc : null].some(f => f && (f.v === 0 || (f.low === 0 && f.high === 0)));
/** What a battle with no figure of its own shows: a recorded zero, figures not read, or none found. */
export function noFigureText(b, n = null) {
  const zero = f => f && (f.v === 0 || (f.low === 0 && f.high === 0));
  if (zero(b.fd)) return `0 deaths · ${kindWords(b.fd.status)}`;
  if (zeroOf(b)) return `0 casualties · ${kindWords(b.fc.status)}`;
  if (n && !n.fig && !n.cfig && n.parts.length) return 'No figure for the whole or its listed parts';
  if (b.fs === 'unread') return 'Figures not read';
  return 'No figure found';
}
/** The state a battle is in, one of five: 'figure', 'zero', 'parts' (counted through its parts), 'unread', 'none'. */
export function stateOf(b, n = null) {
  if (ownFigure(b, 'd') || ownFigure(b, 'c')) return 'figure';
  if (zeroOf(b)) return 'zero';
  if (n && (n.fig || n.cfig)) return 'parts';
  return b.fs === 'unread' ? 'unread' : 'none';
}
/**
 * How complete a war's battle figures are: { battles, figure, recorded, estimate, disputed, zero, parts, unread, none,
 * noArticle, ucdp, deaths, casOnly } over its battles (each in one state, stateOf). A figure's kind is its deaths
 * figure's where it has one, else its casualties'.
 */
export function completeness(battles, groups = groupBattles(battles)) {
  const c = { battles: battles.length, figure: 0, recorded: 0, estimate: 0, disputed: 0, zero: 0, parts: 0, unread: 0, none: 0, noArticle: 0, ucdp: 0, deaths: 0, casOnly: 0 };
  for (const b of battles) {
    const s = stateOf(b, groups.byQ.get(b.q));
    c[s]++;
    if (s === 'figure') {
      const f = ownFigure(b, 'd') || ownFigure(b, 'c');
      c[{ fact: 'recorded', estimate: 'estimate', disputed: 'disputed' }[f.status]]++;
      if (ownFigure(b, 'd')) c.deaths++; else c.casOnly++;
    }
    if (s === 'none' && !b.w) c.noArticle++;
    if (s === 'none' && b.fu) c.ucdp++;
  }
  return c;
}
/** The completeness line, as the panel and the Battles tab show it. */
export function completenessText(c) {
  const n = v => v.toLocaleString('en-GB');
  const kinds = [c.recorded && `${n(c.recorded)} recorded`, c.estimate && `${n(c.estimate)} ${c.estimate === 1 ? 'estimate' : 'estimates'}`, c.disputed && `${n(c.disputed)} disputed or unreliable`].filter(Boolean).join(', ');
  const rest = [c.zero && `a recorded zero for ${n(c.zero)}`, c.parts && `counted through their parts for ${n(c.parts)}`, c.unread && `not read for ${n(c.unread)}`, c.none && `none found for ${n(c.none)}${c.noArticle ? ` (${n(c.noArticle)} without an article)` : ''}`].filter(Boolean).join('; ');
  return `Figures for ${n(c.figure)} of ${n(c.battles)} battles${kinds ? `: ${kinds}` : ''}${rest ? `; ${rest}` : ''}.`;
}
/**
 * The deadliest battles (BF-08): ranked by deaths only, each by the lowest figure given (a range's low end, an "at
 * least"'s known part; Wikidata's own count where it gives one, as before), one measure, all sides. The entries with no
 * whole above them; the rest counted, not ranked. { ranked, estimates, disputed, casOnly, none }.
 */
export function deadliest(groups) {
  const top = [...groups.byQ.values()].filter(n => !n.up);
  // A battle whose only deaths figure is its civilians' (the combatants' not read or not given) is counted, not ranked
  // among the battles' deaths (review F2).
  const civOnly = n => n.from === 'own' && n.ownFig?.civ;
  const ranked = top.filter(n => n.fig > 0 && !civOnly(n)).sort((x, y) => y.fig - x.fig || (x.b.n < y.b.n ? -1 : 1));
  return { ranked, top: top.length, estimates: ranked.filter(n => n.kind === 'estimate').length, disputed: ranked.filter(n => n.kind === 'disputed').length,
    civ: top.filter(civOnly).length, casOnly: top.filter(n => !n.fig && n.cfig).length, none: top.filter(n => !n.fig && !n.cfig).length };
}
/** The line under the deadliest battles: what is ranked, of what kinds, and what is not, of how many. */
export function deadliestNote(d) {
  const n = v => v.toLocaleString('en-GB');
  const kinds = [d.estimates && `${n(d.estimates)} ${d.estimates === 1 ? 'estimate' : 'estimates'}`, d.disputed && `${n(d.disputed)} disputed or unreliable`].filter(Boolean).join(', ');
  const not = [d.civ && `${n(d.civ)} with civilian deaths only`, d.casOnly && `${n(d.casOnly)} with casualties only`, d.none && `${n(d.none)} with no figure`].filter(Boolean).join(', ');
  const of = d.top != null ? ` Of the ${n(d.top)} ${d.top === 1 ? 'battle' : 'battles'} not counted under a larger one,` : '';
  return `${of ? `${of.trim()} ranked` : 'Ranked'} by deaths: ${n(d.ranked.length)}${kinds ? ` (${kinds})` : ''}, each by the lowest figure given.${not ? ` Not ranked: ${not}.` : ''} Not added into the war's deaths by month.`;
}
const UCDP_FROM = '1989-01-01';
/** What was searched for a battle with no figure, in words: "Searched: Wikidata (nothing recorded); English Wikipedia
 *  (no article); UCDP (does not cover 1950)." */
export function searched(b) {
  // In plain words (review P7): what VM did, never what "the reader" did.
  const wp = !b.w ? 'no English article linked from Wikidata' : { noart: 'the linked article does not exist', redirect: 'the article is a redirect to another page', nobox: 'no infobox', nofield: 'no casualties in its infobox', failed: 'could not be read this time', blank: 'its casualties left blank', mismatch: 'the linked article is about another event, by its dates, so not read' }[b.fwp]
    || (b.fs === 'unread' ? 'its casualties box has figures VM could not interpret surely: see the article' : b.fs === 'words' ? `no figure, only words${b.fw?.length ? `: ${b.fw.map(w => `"${w}"`).join(', ')}` : ''}` : 'no figure');
  const year = (b.s || '').slice(0, 4) || (b.dec != null ? `the ${b.dec}s` : '');
  const ucdp = (b.s || '') < UCDP_FROM ? `does not cover ${year || 'its date'}` : b.fu ? `${whole(b.fu.v)} deaths in ${b.fu.n} recorded clash${b.fu.n === 1 ? '' : 'es'} within ${b.fu.km} km, shown apart` : b.lat == null ? 'not mapped, so not matched' : b.p != null || (b.pe && b.pe !== 'd') ? 'dates not to the day, so not matched' : `no clashes recorded within 25 km in its dates`;
  return `Searched: Wikidata (nothing recorded); English Wikipedia (${wp}); UCDP (${ucdp}).`;
}

/** Whether a battle's name is said as a plural ("The air raids on Japan end", "The Arctic convoys begin"). */
export const plural = name => /\bconvoys\b|s of\b|\b(?:raids|bombings|attacks|strikes|landings|massacres|killings|shellings|deportations|offensives|operations|battles|campaigns)\b/i.test(String(name).replace(/^the /i, ''));

/** The narrator's line for a battle that ends that month, by its node (groupBattles): a toll only where Wikidata
 *  records one for the item itself; a whole with none, its parts' sum said as theirs (the second reader, WF2-02); ''
 *  under ten thousand. `spoken` writes a number to be read aloud. */
export function endLine(b, n, spoken) {
  const name = b.n.replace(/^the /i, ''), many = plural(name), verb = many ? 'end' : 'ends';
  // Wikidata's own counts only (BF-08): an estimate from an article's infobox is shown with its kind, not spoken as a toll.
  if (b.deaths) { const v = b.deaths; return v >= 10000 ? `The ${name} ${verb}, at a cost of some ${spoken(v)} lives${n ? lateText(n, spoken, { spoken: true }) : ''}.` : ''; }
  if (!n || n.from !== 'parts' || n.fig < 10000 || !n.wdOnly) return '';
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
  return n.ownCas || 0;
}
