// Invention Timeline: pure helpers for the data build (build-progress.mjs) and its tests.
// No I/O here, so tests can import everything without touching the network.

/** The eight disciplines, in the fixed order of the categorical colour tokens (--prp-cat-1 … --prp-cat-8). */
export const DISCIPLINES = [
  { id: 'astro', name: 'Astronomy & Space' },
  { id: 'phys', name: 'Physics' },
  { id: 'chem', name: 'Chemistry' },
  { id: 'bio', name: 'Biology' },
  { id: 'med', name: 'Medicine & Health' },
  { id: 'earth', name: 'Earth & Environment' },
  { id: 'math', name: 'Mathematics' },
  { id: 'tech', name: 'Technology & Engineering' },
];
export const DISCIPLINE_IDS = DISCIPLINES.map(d => d.id);

/** How an event's map position was chosen, in the order the rules are tried. */
export const BASIS = {
  curated: 'Set by hand where Wikidata’s facts would mislead',
  discovery: 'Location of discovery (Wikidata)',
  site: 'The site itself (Wikidata coordinates)',
  'shared-institution': 'Institution the discoverers shared (Wikidata)',
  'institution-at-time': 'Discoverer’s institution at the time (Wikidata, dated)',
  'work-location': 'Discoverer’s work location (Wikidata)',
  institution: 'Discoverer’s main institution (Wikidata)',
  education: 'Where the discoverer studied (Wikidata)',
  birthplace: 'Discoverer’s birthplace (Wikidata)',
  fallback: 'Place set by hand (Wikidata gives the discoverers no dated institution near it, nor a more exact place)',
};
/** How far (km) a discoverer's institution or work place may lie from the seed's hand-set place; a weaker clue (an
 *  undated work place, where they studied, where they were born) must lie within 10 km of the seed's town, and only
 *  where the seed names a town (choosePlace): Coventry is 18 km from Rugby and Leiden 15 km from The Hague, and both are
 *  other towns. */
export const ANCHOR_KM = 100, ANCHOR_KM_WEAK = 10;

/** "Q935 Isaac Newton" → { qid: 'Q935', name: 'Isaac Newton' }; "Isaac Newton" → { qid: null, name }. */
export function parseRef(s) {
  const t = String(s ?? '').trim();
  const m = /^(Q\d+)(?:\s+(.*))?$/.exec(t);
  return m ? { qid: m[1], name: (m[2] || '').trim() } : { qid: null, name: t };
}

/** Lower-case ASCII words, without diacritics, parenthetical qualifiers or punctuation. */
export function normName(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[ʻʼ’'`]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const STOP = new Set(['of', 'the', 'de', 'da', 'di', 'van', 'von', 'al', 'el', 'ibn', 'bin', 'la', 'le', 'and', 'der', 'den', 'du', 'des', 'y', 'abu', 'st', 'saint', 'sir', 'jr', 'sr', 'baron', 'lord', '1st', '3rd']);
const tokens = s => normName(s).split(' ').filter(w => w && !STOP.has(w));

/**
 * Does an expected name plausibly name the same thing as any candidate (Wikidata label, aliases, enwiki title)?
 * Exact match after normalising, one containing the other, or most of the expected words present.
 */
export function nameMatches(expected, candidates) {
  const e = normName(expected);
  if (!e) return false;
  const et = tokens(expected);
  for (const c of candidates.filter(Boolean)) {
    const n = normName(c);
    if (!n) continue;
    if (n === e || ` ${n} `.includes(` ${e} `) || ` ${e} `.includes(` ${n} `)) return true;
    const ct = new Set(tokens(c));
    if (!et.length || !ct.size) continue;
    const hit = et.filter(w => ct.has(w)).length;
    if (hit / et.length >= 0.6 && (ct.has(et.at(-1)) || hit >= 2)) return true;
  }
  return false;
}

/** WDQS writes BCE years astronomically (0 = 1 BC, −286 = 287 BC); convert to the historical year (−287). */
export const astroToYear = y => (y <= 0 ? y - 1 : y);

/** Year from an xsd:dateTime literal as WDQS returns it ("-0286-01-01T00:00:00Z" → −287). */
export function yearOf(iso) {
  const m = /^([+-]?)(\d{1,})-/.exec(String(iso ?? ''));
  if (!m) return null;
  const y = (m[1] === '-' ? -1 : 1) * +m[2];
  return astroToYear(y);
}

/** "Point(lon lat)" on Earth → [lat, lon] (rounded); points on other globes → null. */
export function parsePoint(wkt) {
  const s = String(wkt ?? '');
  if (/^<http/.test(s) && !/entity\/Q2>/.test(s)) return null;
  const m = /Point\(\s*([-\d.eE]+)\s+([-\d.eE]+)\s*\)/.exec(s);
  if (!m) return null;
  const lon = +m[1], lat = +m[2];
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4];
}

/** Great-circle distance in km. */
export function distanceKm([lat1, lon1], [lat2, lon2]) {
  const r = Math.PI / 180, a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The years a dated statement covers, given the person's life. A missing end runs to death (at most 40 years);
 * a missing start begins 40 years before the end (not before age 15). Undated statements return null.
 */
// A statement with one end open is assumed to run `open` years from the other: 40 for a post, EDUCATION_YEARS for a
// school or university, so that a pupil's "educated at" with only a start year (Hawking at St Albans School from 1952)
// is not read as covering his work twenty years later.
export const EDUCATION_YEARS = 8;
export function span(st, life = {}, open = 40) {
  const s = st.s ?? null, e = st.e ?? null;
  if (s == null && e == null) return null;
  const born = life.born ?? null, died = life.died ?? null;
  const start = s ?? Math.max(e - open, born != null ? born + 15 : -Infinity);
  const end = e ?? Math.min(died ?? s + open, s + open);
  return [start, Math.max(start, end)];
}
export const covers = (st, year, life, open) => { const r = span(st, life, open); return !!r && r[0] <= year + 1 && year - 1 <= r[1]; };

/** The first year a Wikidata date { y, pr } may mean: a date given only to the decade, century or millennium counts from
 *  its first year ("16th century", stored as 1600 with precision 7, is 1501); a year or finer is itself. The build
 *  takes a place's founding year (place().founded) as the earliest of these over its P571 statements. */
export const firstYear = ({ y, pr = 9 }) => (pr >= 9 ? y : pr === 8 ? Math.floor(y / 10) * 10 : pr === 7 ? Math.floor((y - 1) / 100) * 100 + 1 : pr === 6 ? Math.floor((y - 1) / 1000) * 1000 + 1 : null);

// "organization" as a whole word, and "non-profit": Wikidata describes the Carnegie Institution for Science (Q1043963),
// labelled "Carnegie Science" as read on 28 November 2026, as a "non-profit organization in the USA", and the Bureau des
// Longitudes as an "organization" (whole words, so that "organisms" or "organizational" in a theory's description do not
// count).
const ACADEMIC = /universit|college|institut|laborator|observator|academ|école|ecole|school|hospital|polytechn|research|society|station|museum|centre|center|faculty|abbey|monastery|librar|bell labs|cern|nasa|agency|company|corporation|\borgani[sz]ations?\b|\bnon-?profit\b/i;
/** Does a Wikidata description or label read like an institution rather than a town or a house? */
export const looksInstitutional = (label, desc) => ACADEMIC.test(`${label || ''} ${desc || ''}`);

/**
 * Choose where an event goes on the map.
 *   event  { year, at?, fb?, item? }  at/fb: curated place QIDs; item: { loc: [QID], coord: [lat, lon] }
 *   people [{ qid, born, died, employer: [st], affiliation: [st], educated: [st], work: [st], birthplace: [QID] }]
 *           st = { q, s?, e?, preferred? }
 *   place(q) → { lat, lon, label, inst?, founded? } or null (has coordinates); founded: the earliest P571 year
 *   weight(q) → how many seed scientists share this institution (to prefer main ones when undated)
 * Rules, in order: curated override; location of discovery (P189); the item's own coordinates; an institution two or
 * more of the discoverers shared at the time; the discoverer's employer, affiliation or place of study dated around
 * the event year; dated work location; main employer or affiliation; work location; education; birthplace; curated
 * fallback. The fallback place, when the seed gives one, also anchors the person-based rules: a candidate more than
 * maxKm from it is skipped (Wikidata often lists later, earlier or honorary posts without dates). Every person-based
 * rule also skips a place founded (its earliest P571) after the year, and the undated rules (main institution, work
 * location, education) drop a statement whose own start or end rules the year out.
 * The weak clues (an undated work location, where they studied, their birthplace) give way to the seed's fallback
 * place unless they agree with it: the clue is that very place, or the seed names a town rather than an institution and
 * the clue lies within ANCHOR_KM_WEAK of it, in the town or beside it. So a seed that names the body where the thing
 * was done (the Berlin Observatory, the Vienna General Hospital) keeps the event there against a city, a school or a
 * birthplace nearby; a seed's town (Geesthacht, Rugby, Pavia) keeps it against another town within reach (Hamburg,
 * Coventry, Milan); and a clue within 10 km of the seed's town (Merchiston Tower in Edinburgh, Jiankang where Nanjing
 * stands) still places it, as more exact. Within 10 km is not always within the town (Harvard, in Cambridge, for
 * Boston; the University of Manchester for Salford): where it matters the seed sets the place by hand.
 * A main institution (undated) gives way in the same way to a seed place that is itself an institution, unless it is
 * that place: Nüsslein-Volhard's Tübingen (from 1981) to the European Molecular Biology Laboratory for 1980, Vine's
 * East Anglia to Cambridge for 1963. Against a seed town it still comes first, within maxKm. A dated clue (an
 * institution or work location at the time) and an institution the discoverers shared still come before any seed place.
 */
export function choosePlace(event, people, place, weight = () => 0, maxKm = ANCHOR_KM) {
  const y = event.year;
  const at = q => (q ? place(q) : null);
  const out = (q, basis, p, via) => ({ qid: q, name: p.label, lat: p.lat, lon: p.lon, basis, ...(via ? { via } : {}) });
  if (event.at) { const p = at(event.at); if (p) return out(event.at, 'curated', p); }
  for (const q of event.item?.loc || []) { const p = at(q); if (p) return out(q, 'discovery', p); }
  if (event.item?.coord && event.item.qid) {
    const [lat, lon] = event.item.coord;
    return { qid: event.item.qid, name: event.item.label || event.item.qid, lat, lon, basis: 'site' };
  }
  const anchor = at(event.fb);
  // A place founded after the year (its earliest P571) cannot be where the discoverer worked then: the University of
  // Zurich (1833) for Gessner in 1551, Imperial College (1907) for Perkin in 1856.
  const fits = (q, km = maxKm) => { const p = at(q); return !!p && !(p.founded != null && p.founded > y) && (!anchor || distanceKm([p.lat, p.lon], [anchor.lat, anchor.lon]) <= km); };
  // The undated rules (3 to 5) still drop a statement whose own dates rule out the year: a post that began after it or
  // ended before it (Avogadro's Turin chair from 1820, for 1811), or a school entered after it. Only the explicit dates
  // count here, not span()'s 40-year guess for an open end (Hawking's Cambridge post, given only its end in 2018).
  const datedOut = st => (st.s != null && st.s > y + 1) || (st.e != null && st.e < y - 1);
  const weak = Math.min(maxKm, ANCHOR_KM_WEAK);
  const life = p => ({ born: p.born, died: p.died });
  const width = (st, p) => { const r = span(st, life(p)); return r ? r[1] - r[0] : 999; };
  // 0. An employer or affiliation shared by two or more of the people (current at the time, or undated).
  if (people.length > 1) {
    const who = new Map();
    for (const p of people) {
      const qs = new Set(['employer', 'affiliation'].flatMap(k => (p[k] || []).filter(st => (!span(st, life(p)) || covers(st, y, life(p))) && fits(st.q)).map(st => st.q)));
      for (const q of qs) who.set(q, [...(who.get(q) || []), p.qid]);
    }
    const best = [...who].filter(([, ps]) => ps.length > 1).sort((a, b) => b[1].length - a[1].length || !!at(b[0]).inst - !!at(a[0]).inst)[0];
    if (best) return out(best[0], 'shared-institution', at(best[0]), best[1][0]);
  }
  // 1. Institution at the time: employer > affiliation > education, narrowest span first.
  for (const p of people) {
    const dated = [['employer', 0], ['affiliation', 1], ['educated', 2]]
      .flatMap(([k, rank]) => (p[k] || []).filter(st => covers(st, y, life(p), k === 'educated' ? EDUCATION_YEARS : undefined)).map(st => ({ st, rank })))
      .filter(({ st }) => fits(st.q))
      .sort((a, b) => a.rank - b.rank || width(a.st, p) - width(b.st, p) || !!b.st.preferred - !!a.st.preferred);
    if (dated.length) return out(dated[0].st.q, 'institution-at-time', at(dated[0].st.q), p.qid);
  }
  // 2. Work location in use at the time.
  for (const p of people) {
    const w = (p.work || []).filter(st => covers(st, y, life(p)) && fits(st.q)).sort((a, b) => width(a, p) - width(b, p));
    if (w.length) return out(w[0].q, 'work-location', at(w[0].q), p.qid);
  }
  // The undated clues (3 to 5) agree with the seed's fallback place, or give way to it (see the header): a main
  // institution gives way to a seed place that is itself an institution, unless it is that place; the weak clues (4 and
  // 5) give way to any seed place, unless they are that place or lie within ANCHOR_KM_WEAK of a seed town.
  const agreesMain = q => !anchor?.inst || q === event.fb;
  const agrees = q => !anchor || q === event.fb || (!anchor.inst && distanceKm([at(q).lat, at(q).lon], [anchor.lat, anchor.lon]) <= weak);
  // 3. Main institution: preferred rank, then the one nearest in time, then the most shared, academic ones first.
  const near = (st, p) => { const r = span(st, life(p)); return r ? Math.max(0, r[0] - y, y - r[1]) : 500; };
  for (const p of people) {
    for (const k of ['employer', 'affiliation']) {
      const c = (p[k] || []).filter(st => !datedOut(st) && fits(st.q) && agreesMain(st.q)).sort((a, b) => !!b.preferred - !!a.preferred || near(a, p) - near(b, p)
        || !!at(b.q).inst - !!at(a.q).inst || weight(b.q) - weight(a.q));
      if (c.length) return out(c[0].q, 'institution', at(c[0].q), p.qid);
    }
  }
  // 4. Work location (only if there is one obvious candidate, or the preferred one).
  for (const p of people) {
    const w = (p.work || []).filter(st => !datedOut(st) && fits(st.q) && agrees(st.q));
    const pick = w.find(st => st.preferred) || (w.length === 1 ? w[0] : w.sort((a, b) => near(a, p) - near(b, p))[0]);
    if (pick) return out(pick.q, 'work-location', at(pick.q), p.qid);
  }
  // 5. Education (the latest: usually the most advanced), then birthplace.
  for (const p of people) {
    const ed = (p.educated || []).filter(st => !(st.s != null && st.s > y) && fits(st.q, weak) && at(st.q).inst && agrees(st.q)).sort((a, b) => (span(b, life(p))?.[1] ?? -1e9) - (span(a, life(p))?.[1] ?? -1e9));
    if (ed.length) return out(ed[0].q, 'education', at(ed[0].q), p.qid);
  }
  for (const p of people) for (const q of p.birthplace || []) { if (fits(q, weak) && agrees(q)) return out(q, 'birthplace', at(q), p.qid); }
  if (anchor) return out(event.fb, 'fallback', anchor);
  return null;
}

/** Institutions linked to an event: first the institution it is placed at (the one a rule through the people chose,
 *  or the place set by hand or found on Wikidata when that is an institution, not a birthplace or the item's own site),
 *  then those its people belonged to in the event year by Wikidata's dates.
 *  A place founded after the year is left out, as choosePlace leaves it out: Goethe University Frankfurt (1914) for
 *  Salvarsan in 1909, the University of Palermo (1806) for Ceres in 1801. So is a statement whose own dates begin
 *  after the year or end before it: covers() allows a year either side, for the placing rules, but the card lists
 *  where the people were in the year itself, not Le Verrier's University of Paris (from 1847) for Neptune in 1846,
 *  nor ETH Zurich (to 1914) for general relativity in 1915. A school with only its start date is taken to run
 *  EDUCATION_YEARS, as choosePlace takes it: not St Albans School (from 1952) for Hawking radiation in 1974.
 *  The placing institution is listed even where the people's statements at it fall a year either side (covers()) or,
 *  for the education rule, before the year: it is where the card says the thing was done. */
export function eventInstitutions(event, people, place, chosen) {
  const y = event.year, out = [];
  const add = q => { if (q && !out.includes(q)) out.push(q); };
  const inYear = st => !((st.s != null && st.s > y) || (st.e != null && st.e < y));
  if (chosen && (['shared-institution', 'institution-at-time', 'institution', 'education'].includes(chosen.basis)
    || (!['birthplace', 'site'].includes(chosen.basis) && place(chosen.qid)?.inst && !(place(chosen.qid).founded > y)))) add(chosen.qid);
  for (const p of people) {
    for (const k of ['employer', 'affiliation', 'educated']) {
      for (const st of p[k] || []) if (covers(st, y, { born: p.born, died: p.died }, k === 'educated' ? EDUCATION_YEARS : undefined) && inYear(st) && place(st.q)?.inst !== false && !(place(st.q)?.founded > y)) add(st.q);
    }
  }
  return out.slice(0, 8);
}

/** A display year: 300 BC, AD 105, 1687. */
export const yearLabel = (y, approx) => `${approx ? 'c. ' : ''}${y < 0 ? `${-y} BC` : y < 1000 ? `AD ${y}` : y}`;

/** Validate one seed entry; returns a list of problems (empty when fine). */
export function seedProblems(e) {
  const p = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id || '')) p.push('id');
  if (!Number.isInteger(e.y) || e.y < -3000 || e.y > new Date().getUTCFullYear()) p.push('year');
  const ds = String(e.d || '').split(/\s+/).filter(Boolean);
  if (!ds.length || ds.some(d => !DISCIPLINE_IDS.includes(d))) p.push('disciplines');
  if (!e.t || e.t.length > 90) p.push('title');
  if (!e.n || e.n.length > 260) p.push('note');
  if (!Array.isArray(e.p)) p.push('people');
  if (!e.p?.length && !e.at && !e.fb) p.push('no people and no place');
  return p;
}
