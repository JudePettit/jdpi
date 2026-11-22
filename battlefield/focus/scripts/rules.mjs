// War Focus build rules: pure functions, no I/O. scripts/build.mjs uses them and tests/warfocus.test.mjs tests them.
// Review of 15 November 2026 (a historian, a professor and a strategist) found four faults that start here: battles of
// one war filed under another, Wikidata dates taken unchecked, UCDP period estimates counted on one day, and a
// Correlates of War total spread over years it does not cover.

/** Days between two ISO dates, inclusive. */
const dayNo = d => Date.parse(d + 'T00:00:00Z') / 864e5;
const iso = n => new Date(n * 864e5).toISOString().slice(0, 10);

/**
 * A Wikidata time value as a date: the first (or, atEnd, the last) day of its day, month or year. Precision 11 is a
 * day, 10 a month, 9 a year; a decade (8) or anything coarser is no date at all ("the 2020s" is not 31 December 2020).
 */
export function wdDate(value, precision, atEnd = false) {
  const s = String(value || '').slice(0, 10), p = +(precision ?? 11);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || p < 9) return null;
  if (p >= 11) return s;
  if (p === 10) return atEnd ? new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7), 0)).toISOString().slice(0, 10) : s.slice(0, 7) + '-01';
  return atEnd ? s.slice(0, 4) + '-12-31' : s.slice(0, 4) + '-01-01';
}
const PREC = p => (+p >= 11 ? null : +p === 10 ? 'm' : 'y');
const FIRST = { null: d => d, m: d => d.slice(0, 7) + '-01', y: d => d.slice(0, 4) + '-01-01' };

// An item whose name says it lasted: a point in time given for it is when it began, not its whole span.
const LASTING = /\b(campaigns?|offensives?|counteroffensives?|counter-offensives?|sieges?|occupations?|fronts?|insurgency|blockades?|war)\b/i;

/**
 * A battle's dates from Wikidata's start (P580), end (P582) and point in time (P585), each [{ v, p }] (value and
 * precision). Returns { s, e, p, pe, u, eW }, { s: null, u: 'undated', dec } when its only date is a decade
 * (undatedOf), or null when it has no date at all:
 *   s, e   start and end (ISO); e is null when there is no end to show as a span, and u says why:
 *          'end'   no end recorded (a start with no end is not a one-day battle)
 *          'order' Wikidata's end (eW) is before its start: the end is dropped, the start kept and both are doubtful
 *          'after' Wikidata's end (eW) is after the war's own end: the battle is not drawn running past the war
 *   p, pe  the precision of the start ('m' month, 'y' year, null day) and, when it differs, of the end ('d' a day)
 * A point in time alone is the battle's start and end, unless its name says it lasted (a campaign, an offensive, a
 * siege, an occupation), when it is its start.
 */
export function battleDates({ start = [], end = [], point = [], name = '', warEnd = null }) {
  const pick = (list, atEnd) => list.map(x => ({ d: wdDate(x.v, x.p, atEnd), p: PREC(x.p ?? 11) })).filter(x => x.d)
    .sort((a, b) => (a.d < b.d ? -1 : 1));
  const st = pick(start)[0], pt = pick(point)[0], en = pick(end, true).at(-1), ptEnd = pick(point, true)[0];
  const first = st || pt;
  if (!first) return undatedOf([...start, ...point, ...end]);
  const out = { s: first.d, e: null, p: first.p, pe: null, u: null, eW: null };
  let last = en;
  if (!last && !st && pt && !LASTING.test(name)) last = ptEnd;
  if (!last) { out.u = 'end'; return out; }
  if (last.d < out.s) return { ...out, u: 'order', eW: last.d };
  if (warEnd && FIRST[last.p](last.d) > warEnd) return { ...out, u: 'after', eW: last.d };
  out.e = last.d;
  if (last.p !== out.p) out.pe = last.p || 'd';
  return out;
}

/**
 * A battle Wikidata dates only to a decade (precision 8: Siege of Tigray, "the 2020s"): kept, with no date, as
 * { s: null, e: null, u: 'undated', dec } (dec the decade's first year), so it is listed with its war but counted in no
 * month and not drawn on the map. A battle with no date at all, or only a century or coarser, is null: left out.
 */
function undatedOf(times) {
  const decs = times.filter(x => +(x.p ?? 11) === 8 && /^\d{4}-/.test(String(x.v || ''))).map(x => Math.floor(+String(x.v).slice(0, 4) / 10) * 10);
  if (!decs.length) return null;
  return { s: null, e: null, p: null, pe: null, u: 'undated', eW: null, dec: Math.min(...decs) };
}

/** Whether a battle dated only to a decade (battleDates' dec) can fall within a war's years. */
export const decadeFits = (dec, warStart, warEnd) => dec <= +String(warEnd).slice(0, 4) && dec + 9 >= +String(warStart).slice(0, 4);

/**
 * The items that are part of a war, from Wikidata's "part of" (P361) links within it: edges [{ c, parent }] and each
 * item's dates (Map q → { s, e }, either null). Walks down from the war, and does not go through an item that cannot be
 * part of it: one that began after the war ended or ended before it began (a wider or later campaign such as the war
 * against the Islamic State, 2014 on, which Wikidata also makes part of the Iraq War through the Iraqi insurgency, and
 * of which it makes the War in Afghanistan a part).
 * And where the war's theatre is known, it does not go from an item that is also part of something outside the war (a
 * wider operation, as Operation Enduring Freedom, part of both the War in Afghanistan and the War on Terror) to a part
 * of it fought elsewhere: `places` (Map q → [lon, lat], the item's coordinates or its location's) against the theatre.
 * The theatre is the area (1st–99th percentile, widened by 5° each way) of `points` (the war's UCDP events) and of the
 * places of the items reached without passing below such a shared item, together with each part of a side's or the
 * contested state's territory that reaches into that area (`states`, [w, s, e, n] boxes from stateBoxes, widened the
 * same): India and Pakistan for the Bangladesh Liberation War's western front of December 1971, not the United States
 * for the War in Afghanistan. A war fought across the world (an area wider than 120° of longitude: World War II) is not
 * checked. Operation Enduring Freedom – Philippines and – Horn of Africa and the capture of the So San in the Arabian
 * Sea are then not battles of the War in Afghanistan, nor battles in Afghanistan and Mali of the Syrian civil war.
 * Returns the set of items reached.
 */
export function partsWithin(edges, dates, root, span, { places = null, points = [], states = [] } = {}) {
  const kids = new Map(), parents = new Map();
  for (const { c, parent } of edges) {
    (kids.get(parent) || kids.set(parent, new Set()).get(parent)).add(c);
    (parents.get(c) || parents.set(c, new Set()).get(c)).add(parent);
  }
  const fits = q => {
    const d = dates.get(q); if (!d) return true;
    if (d.s && span.end && d.s > span.end) return false;
    if (d.e && (!d.s || d.e >= d.s) && d.e < span.start) return false;
    return true;
  };
  const walk = (may = () => true) => {
    const seen = new Set([root]), queue = [root];
    while (queue.length) { const p = queue.shift(); for (const c of kids.get(p) || []) if (!seen.has(c) && fits(c) && may(p, c)) { seen.add(c); queue.push(c); } }
    return seen;
  };
  let seen = walk();
  if (places) {
    const shared = new Set([...seen].filter(q => q !== root && [...(parents.get(q) || [])].some(p => !seen.has(p))));
    const core = walk(p => !shared.has(p));
    const pts = [...points, ...[...core].map(q => places.get(q)).filter(Boolean)];
    if (shared.size && pts.length >= 5) {
      const q = (arr, f) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(f * (s.length - 1))))]; };
      const lon = pts.map(x => x[0]), lat = pts.map(x => x[1]);
      const wide = b => [b[0] - 5, b[1] - 5, b[2] + 5, b[3] + 5];
      const box = wide([q(lon, 0.01), q(lat, 0.01), q(lon, 0.99), q(lat, 0.99)]);
      const meets = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
      const area = [box, ...states.map(wide).filter(b => meets(b, box))];
      const inside = (x, b) => x[0] >= b[0] && x[0] <= b[2] && x[1] >= b[1] && x[1] <= b[3];
      const away = c => { const x = places.get(c); return !!x && !area.some(b => inside(x, b)); };
      if (box[2] - box[0] <= 130) seen = walk((p, c) => !(shared.has(p) && away(c)));
    }
  }
  seen.delete(root);
  return seen;
}

/**
 * The bounding boxes [w, s, e, n] of each part (polygon) of each state's territory on Cliopatria's borders (a quantized
 * TopoJSON of the Omni-Map's, omni/data/borders, or one of War Focus's spans of it), for the rows of some year from
 * `from` to `to` (years, inclusive). A row is a state's where `placeOf(row id, year)` gives the state's Q-id (the
 * Retrospective Battlefield's crosswalk, places.json `rows`); a composite, a row with no shape and a row with no place
 * give none (21 November 2026: until then CShapes 2.0's borders, by Gleditsch–Ward number).
 * Cliopatria's rows can draw the same land twice: its Kingdom of Great Britain of 1969–2023 carries a part over Oman,
 * Qatar and Bahrain, each also a row of its own; its British Colonial Empire of 1947–57 carries Newfoundland, part of
 * Canada's row from 1949. A part whose box is mostly another place's part in the same years (overlap at least half of
 * the two boxes together) goes to the place whose land it is: `whose(a, b, polygon, year)` (lands.mjs makeLands, the
 * one of the two whose rows alone hold it in the nearest year after, failing that before; second review X3), so Oman,
 * Qatar and Bahrain are not Britain's and Newfoundland is Canada's. Where `whose` is not given or names neither, the
 * part goes to the place for which it is the larger share of its territory, so a state's area never reaches lands
 * another row holds.
 * Returns Map Q → [[w, s, e, n], ...].
 */
export function stateBoxes(topo, from, to, placeOf, whose = null) {
  const [sx, sy] = topo.transform?.scale || [1, 1], [tx, ty] = topo.transform?.translate || [0, 0];
  const arcBox = topo.arcs.map(arc => {
    let x = 0, y = 0, b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [dx, dy] of arc) {
      x += dx; y += dy;
      const X = x * sx + tx, Y = y * sy + ty;
      b = [Math.min(b[0], X), Math.min(b[1], Y), Math.max(b[2], X), Math.max(b[3], Y)];
    }
    return b;
  });
  const area = b => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  // A part's polygon as [lon, lat] rings, decoded only when `whose` is asked about it.
  const arcPts = new Map(), arcOf = i => {
    if (!arcPts.has(i)) { let x = 0, y = 0; arcPts.set(i, topo.arcs[i].map(([dx, dy]) => (topo.transform ? [(x += dx) * sx + tx, (y += dy) * sy + ty] : [dx, dy]))); }
    return arcPts.get(i);
  };
  const ringOf = idx => { const out = []; for (const i of idx) { const a = i < 0 ? arcOf(~i).slice().reverse() : arcOf(i); if (out.length) out.pop(); out.push(...a); } return out; };
  const parts = [], total = new Map(); // { id, qs, a, z, box, poly }, and each place's summed part areas
  for (const g of Object.values(topo.objects)[0].geometries) {
    const p = g.properties || {};
    if (!(p.f <= to && p.t >= from) || p.k !== 'POLITY' || /^\(.+\)$/.test(p.n || '')) continue;
    const qs = new Set(), a = Math.max(from, p.f), z = Math.min(to, p.t);
    for (let y = a; y <= z; y++) { const q = placeOf(p.id, y); if (q) qs.add(q); }
    if (!qs.size) continue;
    const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    for (const poly of polys) {
      let b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const ring of poly) for (const i of ring) { const x = arcBox[i < 0 ? ~i : i]; b = [Math.min(b[0], x[0]), Math.min(b[1], x[1]), Math.max(b[2], x[2]), Math.max(b[3], x[3])]; }
      if (!isFinite(b[0])) continue;
      parts.push({ id: p.id, qs, a, z, box: b, poly });
      for (const q of qs) total.set(q, (total.get(q) || 0) + area(b));
    }
  }
  // Parts bucketed by the 10° cells their boxes touch, so each is checked only against its neighbours.
  const cells = new Map(), cellsOf = b => { const out = []; for (let i = Math.floor(b[0] / 10); i <= Math.floor(b[2] / 10); i++) for (let j = Math.floor(b[1] / 10); j <= Math.floor(b[3] / 10); j++) out.push(i + ',' + j); return out; };
  parts.forEach((x, k) => { for (const c of cellsOf(x.box)) (cells.get(c) || cells.set(c, []).get(c)).push(k); });
  const share = x => Math.max(...[...x.qs].map(q => area(x.box) / (total.get(q) || 1)));
  const out = new Map();
  parts.forEach((x, k) => {
    const near = new Set(cellsOf(x.box).flatMap(c => cells.get(c)));
    for (const m of near) {
      const o = parts[m];
      if (m === k || o.a > x.z || o.z < x.a || [...o.qs].some(q => x.qs.has(q))) continue;
      const i = [Math.max(x.box[0], o.box[0]), Math.max(x.box[1], o.box[1]), Math.min(x.box[2], o.box[2]), Math.min(x.box[3], o.box[3])], ia = area(i);
      if (!(ia > 0 && ia >= 0.5 * (area(x.box) + area(o.box) - ia))) continue;
      const y = Math.max(x.a, o.a), qx = placeOf(x.id, y), qo = placeOf(o.id, y);
      const w = whose && qx && qo ? whose(qx, qo, x.poly.map(ringOf), y) : null;
      if (w ? w === qo : share(o) > share(x)) return;
    }
    for (const q of x.qs) (out.get(q) || out.set(q, []).get(q)).push(x.box);
  });
  return out;
}

/**
 * Whole numbers in proportion to `weights` that add up to Math.round(total) exactly (largest remainder), so a spread
 * figure sums back to its source: Correlates of War's 1,000,000 stays 1,000,000, not 999,999.
 */
export function apportion(total, weights) {
  const n = Math.round(total), sum = weights.reduce((s, w) => s + w, 0);
  if (!weights.length) return [];
  if (!(sum > 0)) return apportion(n, weights.map(() => 1));
  const raw = weights.map(w => (n * w) / sum), out = raw.map(Math.floor);
  let left = n - out.reduce((s, v) => s + v, 0);
  const order = raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++;
  return out;
}

/**
 * The months an event's deaths fall in: UCDP dates some events only to a period (date_prec above 1, from date_start to
 * date_end: a week, a month, two months, a year). Those deaths are shared out over the days of the period that fall
 * within [from, to] (the war's months), in whole deaths; an event within one month stays in it.
 * Returns [[yyyy-mm, deaths]].
 */
export function eventMonths(dStart, dEnd, deaths, from, to) {
  const a = Math.max(dayNo(dStart), dayNo(from)), z = Math.min(dayNo(dEnd && dEnd >= dStart ? dEnd : dStart), dayNo(to));
  if (!(z >= a) || iso(a).slice(0, 7) === iso(z).slice(0, 7)) return [[(z >= a ? iso(a) : dStart).slice(0, 7), deaths]];
  const days = new Map();
  for (let n = a; n <= z; n++) { const m = iso(n).slice(0, 7); days.set(m, (days.get(m) || 0) + 1); }
  const ms = [...days.keys()], share = apportion(deaths, ms.map(m => days.get(m)));
  return ms.map((m, i) => [m, share[i]]);
}

/**
 * How much each month weighs when a yearly or whole-war total is spread by recorded battles (no UCDP events): 1, plus
 * one for each battle under way in it. Only a battle whose start and end are known at least to the month weighs: one
 * Wikidata dates only to its year (p 'y', or an end pe 'y') could fall in any month of it, so it weighs none, where it
 * used to weigh all twelve (S0, the spread fix, 16 November 2026: "Battle of Łódź", 1939, weighed January to August,
 * before the war began). `months` are yyyy-mm; a battle { s, e, p, pe } as scripts/rules.mjs battleDates gives it.
 */
export function monthWeights(months, battles) {
  const endPrec = b => (b.pe === 'd' ? null : b.pe || b.p);
  const known = (battles || []).filter(b => b.s && b.p !== 'y' && endPrec(b) !== 'y');
  return months.map(m => 1 + known.filter(b => b.s.slice(0, 7) <= m && (b.e || b.s).slice(0, 7) >= m).length);
}

const MONTH_NO = Object.fromEntries(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].map((m, i) => [m, i + 1]));
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
/**
 * The end date in an English Wikipedia article's infobox (the lead section's wikitext): the last date, to the day or
 * the month, in the infobox's `date` field, once its references, notes and templates are taken out ("July 2022 –
 * 20 May 2023" → 20 May 2023). Returns { d, p } (d the last day at its precision, p 'm' for a month, null a day), or
 * null when the field says the fighting is ongoing, ends with a year alone, or cannot be read.
 */
export function infoboxEnd(wikitext) {
  const t = String(wikitext || ''), i = t.search(/\{\{\s*Infobox military (conflict|operation|campaign)/i);
  if (i < 0) return null;
  // References first (they hold cite templates with dates of their own, over several lines), then the field to the
  // next parameter of the infobox.
  const box = t.slice(i).replace(/<ref[^>]*\/>/gi, ' ').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const m = box.match(/\n\s*\|\s*date\s*=([\s\S]*?)(?=\n\s*\|\s*[a-z_ ]+?\s*=|\n\s*\}\})/i);
  if (!m) return null;
  let s = m[1];
  for (let k = 0; k < 10 && /\{\{[^{}]*\}\}/.test(s); k++) s = s.replace(/\{\{[^{}]*\}\}/g, ' ');
  s = s.replace(/<[^>]+>/g, ' ').replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/&nbsp;/g, ' ');
  if (/\b(ongoing|present)\b/i.test(s)) return null;
  const MON = 'January|February|March|April|May|June|July|August|September|October|November|December';
  const re = new RegExp(`(?:(\\d{1,2})\\s+(${MON})|(${MON})(?:\\s+(\\d{1,2}),)?)\\s+(\\d{4})|\\b(\\d{4})\\b`, 'gi');
  let last = null;
  for (const x of s.matchAll(re)) last = x;
  if (!last || last[6]) return null; // nothing, or a year alone at the end
  const y = +last[5], mo = MONTH_NO[(last[2] || last[3]).toLowerCase()], day = +(last[1] || last[4] || 0);
  if (!day) return { d: lastDay(y, mo), p: 'm' };
  if (day > +lastDay(y, mo).slice(8)) return null;
  return { d: `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`, p: null };
}

/**
 * A battle's end checked against its Wikipedia article (infoboxEnd): where Wikidata ends it (its end e, or eW when that
 * is after the war) more than a month after the article does, and the article's end falls within the battle's start
 * and the war's end, the battle is drawn to the article's end, the earlier, which both sources agree it lasted to, and
 * marked u 'conflict' with Wikidata's end in eW and the article's in eA. Battle of Bakhmut: Wikidata 7 January 2024,
 * Wikipedia 20 May 2023, when the city fell. Otherwise the dates are returned as they were.
 */
export function endAgainstArticle(d, wp, warEnd = null) {
  const wd = d && (d.e || (d.u === 'after' ? d.eW : null));
  if (!wd || !wp || !d.s || wp.d < d.s || (warEnd && FIRST[wp.p](wp.d) > warEnd)) return d;
  if (dayNo(wd) - dayNo(wp.d) <= 31) return d;
  return { ...d, e: wp.d, pe: (wp.p || null) === d.p ? null : wp.p || 'd', u: 'conflict', eW: wd, eA: wp.d };
}

// ---- The second reader of the whole-and-parts rule (16 November 2026), WF2-06 and WF2-09.

/** An item's casualties from its P1590 statements ([{ v, rank, about }], `about` its P805 qualifier, "statement is
 *  subject of"): the preferred statements, else the normal ones, never a deprecated one, and never one about something
 *  else (the atomic bombings' 201,779, P805 hibakusha, counts living survivors, not casualties); the largest, or null. */
export function casualtiesOf(statements = []) {
  const ok = statements.filter(s => s.rank !== 'deprecated' && s.v > 0);
  const best = ok.some(s => s.rank === 'preferred') ? ok.filter(s => s.rank === 'preferred') : ok;
  const own = best.filter(s => !s.about);
  return own.length ? Math.max(...own.map(s => s.v)) : null;
}

/** The order of a war's battles: by start, the undated last, and battles that start together by QID number, so a
 *  rebuild gives the same order whatever order Wikidata answered in. */
export const byStart = (a, b) => (!a.s !== !b.s ? !a.s - !b.s : a.s && a.s !== b.s ? (a.s < b.s ? -1 : 1) : +a.q.slice(1) - +b.q.slice(1));

/** One place for an item Wikidata gives several ([lat, lon] each, its best-ranked coordinates): the one nearest its
 *  first part's place where it has parts with places (the atomic bombings at Hiroshima), else the southern-most, then
 *  western-most, the same on every run; null with none. */
export function pickCoord(coords = [], partCoords = []) {
  if (!coords.length) return null;
  if (coords.length === 1) return coords[0];
  const p = partCoords[0], d = c => (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2;
  return [...coords].sort((x, y) => (p ? d(x) - d(y) : 0) || x[0] - y[0] || x[1] - y[1])[0];
}
