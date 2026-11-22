/* Retrospective Battlefield (PRP · Retrospective Geopolitics) — every war and armed conflict, year by year, 1926–2025.
   Borders: Cliopatria v0.2.1 (CC BY 4.0), the polities of each year, wound for d3 by design/prp-map-d3.js; from 1946
   a small state no row holds as Natural Earth's point (public domain). No place is drawn on a border of today (fixer,
   20 November 2026). Conflicts: UCDP/PRIO ACD (1946–2025) and Wikidata's wars of 1926–1945 as VM lists them (CC0).
   Places are keyed by Wikidata Q-ids (data/places.json, battlefield/scripts/history-places.mjs), never by a
   Gleditsch–Ward number.
   Views (tabs): the map and a table of the conflicts; both follow the timeline (design/prp-period.js), one year or a
   period of years: the start handle rests on the end, so a plain year is that year; pulled back, it opens a period,
   and every conflict active in at least one of its years is shown, at its peak level then.
   Every polity of the year is drawn (design/PRP-STYLE.md §6) as its Cliopatria row (2025 on 2024's, the last year
   Cliopatria holds); from 1946 a small state no row holds is drawn as its point, and any other war place no row holds
   that year is listed under the map ("VM cannot place this on a free border for <year>"), as "today’s …" where
   Wikidata dates the place after that year.
   URL: #y=<year, the end of the period>[&f=<first year of a period>]&c=<Q-id>&w=<war>&v=table. Addresses written
   before 20 November 2026 still open: c=<number> (a Gleditsch–Ward number UCDP's rows give a country) through
   places.json's oldCountries, c=<ISO3> through the places' ISO3, and w=c<number> (a Correlates of War war) through
   wars.json's oldIds; one VM can no longer show says so. */
import { oldCountry } from './old-countries.js';
import { OLD_NUMBERS } from '../focus/old-numbers.mjs';

const W = 1000, H = 600, DOT_R = 3.2;
const state = { year: 2025, from: 2025, selected: null, war: null, data: null, places: null, focus: {}, view: 'map', note: null,
  borders: new Map(), small: new Map(), features: [], points: [] };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n).toLocaleString('en-GB');
// Map fills are tokens (styles.css), so the map follows the light or dark theme without a redraw.
const FILL = { war: 'var(--c-war)', listed: 'var(--c-listed)', minor: 'var(--c-minor)', abroad: 'var(--c-abroad)', peace: 'var(--c-peace)' };
const motion = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250);

// War Focus is a sibling submodule: inside the PRP shell its links open it there (deep link); on its own, directly.
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
const SHELL = new URL('../../', location.href).href;
const sibling = rel => (embedded ? `${SHELL}#/rs/war-focus?at=${encodeURIComponent(new URL(rel, location.href).href)}` : rel);
const siblingTarget = embedded ? '_top' : '_self';

let svg, g, projection, path, zoom, focusView = null;
const focusHits = new Set(); // places (Q-ids) Documentary mode is discussing

/* ---------------------------------------------------------------- borders and places */
const bordersYear = y => Math.min(y, state.places.bordersTo);
const fileFor = y => state.places.borders[bordersYear(y) < 2000 ? 0 : 1];
// A Cliopatria row VM fills and lets a reader click: a polity, not a composite (its name in brackets), with a shape
// (battlefield/scripts/history-places.mjs drawnRow).
const drawnRow = f => f.properties.k === 'POLITY' && !/^\(.+\)$/.test(f.properties.n || '') && !!f.geometry;
function rowQ(id, y) {
  const v = state.places.rows[id];
  if (typeof v === 'string') return v;
  return Array.isArray(v) ? v.find(([a, b]) => a <= y && y <= b)?.[2] || null : null;
}
async function loadBorders(y) {
  const file = fileFor(y);
  // Rewound once, as d3 reads rings (design/prp-map-d3.js): a row wound the other way would fill the globe less itself.
  if (!state.borders.has(file)) state.borders.set(file, fetch(`../../${file}`).then(r => { if (!r.ok) throw new Error(`${file}: ${r.status}`); return r.json(); }).then(t => PRPMapD3.rewind(PRPMap.decode(t), d3)));
  return state.borders.get(file);
}
// The shapes of year y: Cliopatria's rows, each under its place's Q-id (or its own row id where VM holds no place for
// it); from 1946, the points of the small states no row holds.
async function shapesOf(y) {
  const fc = await loadBorders(y), yb = bordersYear(y);
  const rows = PRPMap.sliceAt(fc, yb).filter(drawnRow).map(f => ({ type: 'Feature', geometry: f.geometry,
    properties: { key: rowQ(f.id, yb) || `row:${f.id}`, row: f.properties.n, kind: 'row', id: f.id } }));
  const points = Object.entries(state.places.points[y] || {}).filter(([, id]) => state.small.get(id))
    .map(([q, id]) => ({ key: q, lonlat: state.small.get(id).at, id }));
  return { features: rows, points };
}
// A place named for a year before Wikidata dates it (its inception) is "today’s …": the land, not a state of then.
// One that has an earlier state's name for the year (`was`) is that state, by its name.
const unplacedName = (q, y) => (!earlierName(q, y) && placeOf(q)?.since > y ? `today’s ${nameOf(q, y)}` : nameOf(q, y));
const placeOf = q => state.places.places[q] || null;
// The earlier state's name a place has in year y (places.json `was`, oldest first, each to its last year: the build's,
// from history-places.mjs NAMED_AS): Yugoslavia is the Kingdom of Serbs, Croats and Slovenes to 1929 and the Kingdom of
// Yugoslavia to 1945.
const earlierName = (q, y) => placeOf(q)?.was?.find(w => y <= w.to)?.n || null;
// A place's name in year y (the year shown, where none is given): Wikidata's English label (the build's), or its
// earlier state's for that year; a row VM holds no place for keeps Cliopatria's name.
function nameOf(key, y = state.year) {
  if (key?.startsWith('row:')) return state.features.find(f => f.properties.key === key)?.properties.row || 'This polity';
  return earlierName(key, y) || placeOf(key)?.n || key;
}
const rowNameOf = key => state.features.find(f => f.properties.key === key && f.properties.kind === 'row')?.properties.row || null;

/* ---------------------------------------------------------------- data helpers */
const levelIn = (w, y) => w.years.find(([yy]) => yy === y)?.[1] || 0;
// Where a war was fought: the same places every year, or the year's own for a war that moved (World War II, a
// government fighting rebels abroad).
const locIn = (w, y) => w.locYears?.[y] || w.loc;
// The period [a, b] (a === b for one year): the years a war was active in it, its peak level there, and the conflicts
// active in at least one of its years, the most intense first (a UCDP war, then a war Wikidata lists, then a minor
// conflict), then those active longest in it (World War II leads 1939–1945), then by name.
const RANK = { 2: 3, 3: 2, 1: 1, 0: 0 };
const yearsIn = (w, a, b) => w.years.filter(([y]) => y >= a && y <= b);
const peakIn = (w, a, b) => yearsIn(w, a, b).reduce((m, [, l]) => (RANK[l] > RANK[m] ? l : m), 0);
const warsInPeriod = (a, b) => state.data.wars.filter(w => peakIn(w, a, b))
  .sort((x, y) => RANK[peakIn(y, a, b)] - RANK[peakIn(x, a, b)] || yearsIn(y, a, b).length - yearsIn(x, a, b).length || x.name.localeCompare(y.name));
const warsIn = y => warsInPeriod(y, y);
const onSoil = (w, q, a, b) => yearsIn(w, a, b).some(([y]) => locIn(w, y).includes(q));
// The states taking part in a year: a UCDP conflict's parties that year (Tonga in Iraq in 2004, 2007 and 2008 only).
const statesIn = (w, y) => (w.statesYears ? w.statesYears[y] || [] : w.states);
const partyIn = (w, q, a, b) => yearsIn(w, a, b).some(([y]) => statesIn(w, y).includes(q));
const atWarLevel = l => l === 2 || l === 3;
// What the conflicts of a year or period amount to. "At war level" is a measured size (UCDP/PRIO: 1,000 or more
// battle deaths in a year); a war on VM's list from Wikidata has no coded size, so it is counted apart and is never
// said to be "at war level" (before 1946 every conflict shown is such a listed war).
function tally(list, a, y) {
  const peak = list.map(w => peakIn(w, a, y)), war = peak.filter(l => l === 2).length, listed = peak.filter(l => l === 3).length;
  const n = list.length, s = k => (k === 1 ? '' : 's'), some = a === y ? '' : ' at some point';
  if (!listed) return { label: 'At war level', count: war, sub: `${n} armed conflict${s(n)}, ${war} at war level${some}` };
  if (listed === n) return { label: 'Listed wars', count: n, sub: `${n} war${s(n)} on VM’s list from Wikidata; no free source codes their size` };
  return { label: 'Wars', count: war + listed, sub: `${n} armed conflict${s(n)}: ${war} at war level${some}, ${listed} listed war${s(listed)} of no coded size` };
}
const single = () => state.from === state.year;
const periodText = () => (single() ? String(state.year) : `${state.from}–${state.year}`);
// "1939–45 · 7 yrs": the years a war was active in the period.
function activeSpan(w, a, b) {
  const ys = yearsIn(w, a, b).map(([y]) => y);
  if (!ys.length) return '';
  const first = ys[0], last = ys.at(-1), end = String(last).slice(0, 2) === String(first).slice(0, 2) ? String(last).slice(2) : last;
  return `${first === last ? first : `${first}–${end}`} · ${ys.length} yr${ys.length > 1 ? 's' : ''}`;
}
// The places a war was fought in during the period; `where` names places the map has no shape for.
// A place Wikidata dates from a later year than the one shown is "today’s …" (the land, not a state of then), as
// under the map; over a period that reaches the state's own years, its plain name stands alone.
function placesIn(w, a, b) {
  const all = new Set([...yearsIn(w, a, b).flatMap(([y]) => locIn(w, y).map(q => unplacedName(q, y))), ...(w.where || [])]);
  return [...all].filter(n => !(n.startsWith('today’s ') && all.has(n.slice('today’s '.length))));
}
// "Costa Rica: no armed conflict of 25 or more battle deaths recorded by UCDP/PRIO in 1990." (design/prp-mapkit.js):
// from 1946 UCDP/PRIO's record, before it VM's list from Wikidata, and a period across 1946 names both.
const NO_CONFLICT = { what: 'armed conflict of 25 or more battle deaths', source: 'UCDP/PRIO' };
const NO_WAR = { what: 'war', source: 'VM’s list of wars from Wikidata' };
const yearsText = (a, b) => (a === b ? `in ${a}` : `from ${a} to ${b}`);
function noConflict(name, a, b) {
  const u = state.data.ucdpFrom, reason = PRPMapkit.REASONS.NOTHING_RECORDED;
  if (b < u) return PRPMapkit.sentence({ name, reason, ...NO_WAR, when: yearsText(a, b) });
  if (a >= u) return PRPMapkit.sentence({ name, reason, ...NO_CONFLICT, when: yearsText(a, b) });
  return PRPMapkit.sentence({ name, reason, ...NO_WAR, when: yearsText(a, u - 1), and: { ...NO_CONFLICT, when: yearsText(u, b) } });
}
// Per-place status over the period: the most intense conflict on its territory in any of its years (a UCDP war, a war
// Wikidata lists, then a minor conflict), else fighting only abroad. For one year this is that year's status.
function statusMap(a, b) {
  const m = new Map(), rank = { war: 4, listed: 3, minor: 2, abroad: 1 };
  const put = (q, v) => { if ((rank[m.get(q)] || 0) < rank[v]) m.set(q, v); };
  for (const w of warsInPeriod(a, b)) for (const [y, l] of yearsIn(w, a, b)) {
    for (const q of locIn(w, y)) put(q, l === 2 ? 'war' : l === 3 ? 'listed' : 'minor');
    for (const q of statesIn(w, y)) put(q, 'abroad');
  }
  return m;
}
const wikiUrl = w => w.wiki ? `https://en.wikipedia.org/wiki/${encodeURIComponent(w.wiki.replace(/ /g, '_'))}`
  : `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(warQuery(w))}`;
function warQuery(w) {
  const b = w.sideB.filter(s => !/^Government of/.test(s)).slice(0, 2).join(' ');
  return `${w.name.split(':')[0]} ${b || 'war'} ${w.years[0][0]}`;
}
const span = w => w.src === 'wikidata' ? w.span : `${w.years[0][0]}–${w.years.at(-1)[0] >= state.data.lastYear ? 'ongoing' : w.years.at(-1)[0]}`;
// UCDP's thresholds for a conflict, in battle deaths: a war, and an armed conflict.
const WAR_DEATHS = 1000, CONFLICT_DEATHS = 25;
const levelLabel = l => l === 2 ? 'War · 1,000+ deaths this year' : l === 3 ? 'War on Wikidata’s list · its intensity is not coded' : 'Minor conflict · 25–999 deaths this year';
const LEVEL_WORD = ['', 'Minor', 'War', 'Listed war'];
const TAG = { 1: 'minor-level', 2: 'war-level', 3: 'listed-level' };

/* ---------------------------------------------------------------- map */
const DOT_RING = 1.6, STATUS_RANK = { abroad: 1, minor: 2, listed: 3, war: 4 };
const ringed = el => el.classList.contains('selected') || el.classList.contains('involved') || el.classList.contains('prp-focus-hit');
function sizeDots(k = d3.zoomTransform(svg.node()).k) {
  g.selectAll('circle.dot').attr('r', function () { return (DOT_R + (ringed(this) ? DOT_RING : 0)) / k; });
}
function raiseDots() {
  g.selectAll('circle.dot.involved, circle.dot.selected').raise();
  g.selectAll('circle.dot.prp-focus-hit').raise();
  sizeDots();
}
function drawMap() {
  svg = d3.select('#map').attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet');
  projection = d3.geoNaturalEarth1().fitExtent([[10, 10], [W - 10, H - 10]], { type: 'Sphere' });
  path = d3.geoPath(projection);
  g = svg.append('g');
  // A dot keeps its size on screen as the map zooms.
  zoom = d3.zoom().scaleExtent([1, 40]).on('zoom', ev => { g.attr('transform', ev.transform); sizeDots(ev.transform.k); });
  svg.call(zoom);
  $('#zoom-in').onclick = () => svg.transition().duration(motion()).call(zoom.scaleBy, 1.6);
  $('#zoom-out').onclick = () => svg.transition().duration(motion()).call(zoom.scaleBy, 1 / 1.6);
  $('#zoom-reset').onclick = () => { clearFocus(); svg.transition().duration(motion()).call(zoom.transform, d3.zoomIdentity); };
  focusView = window.PRPFocus?.d3View({ svg, zoom, project: () => projection, maxScale: 8, clamp: true });
}

/* ---------------------------------------------------------------- documentary focus (design/prp-focus.js) */
// When the reader talks about wars, the places they were fought in are outlined in the module accent and the map
// eases to fit them all; ⟲ or the end of the reading brings back the whole world.
const keyOf = d => (d.properties ? d.properties.key : d.key);
function paintFocus() {
  if (!g) return;
  g.selectAll('.shape').classed('prp-focus-hit', d => focusHits.has(keyOf(d)));
  g.selectAll('path.shape.prp-focus-hit').raise();
  g.selectAll('circle.dot').raise();
  raiseDots();
}
function clearFocus() { focusHits.clear(); paintFocus(); }
// A Q-id, an ISO3 or an old gw:N (Kino's scenes, PRPFocus's table) as a place on this year's map.
function keyFor(id, y = state.year) {
  if (/^Q\d+$/.test(id)) return id;
  // UCDP's number for a country, kept from before 20 November 2026; one it gave two places (365: the Soviet Union to
  // 1991, then Russia) opens the place of the year shown, a year between them too (old-countries.js). A number only
  // War Focus used (its links here wrote c=<number> until 21 November 2026: 255, Germany) is read as War Focus keyed
  // it (../focus/old-numbers.mjs; second review X4).
  if (/^gw:\d+$/.test(id)) return oldCountry(state.places.oldCountries, state.places.places, id.slice(3), y) || oldCountry(OLD_NUMBERS, state.places.places, id.slice(3), y);
  if (/^[A-Z]{3}$/.test(id)) return Object.entries(state.places.places).find(([, p]) => p.iso3 === id)?.[0] || null;
  return null;
}
function shapesFor(q) {
  const fs = state.features.filter(f => f.properties.key === q);
  if (fs.length) return fs;
  const p = state.points.find(x => x.key === q);
  return p ? [...p.lonlat] : null;
}
window.PRPFocus?.listen({
  focus(t) {
    if (!state.data || !focusView) return;
    const hits = new Set();
    const take = id => { const q = keyFor(id); const s = q ? shapesFor(q) : null; if (s) hits.add(q); return s; };
    const r = PRPFocus.resolve(t, { country: take, qid: take, minSpan: 4 });
    if (!r.box) return;
    focusHits.clear(); hits.forEach(q => focusHits.add(q)); paintFocus();
    focusView.fit(r.box, r.padding);
  },
  reset() { clearFocus(); focusView?.reset(); },
});

let drawSeq = 0;
async function renderMap() {
  const a = state.from, b = state.year, seq = ++drawSeq;
  const { features, points } = await shapesOf(b);
  if (seq !== drawSeq) return; // a later year was asked for meanwhile
  state.features = features; state.points = points;
  const status = statusMap(a, b), tip = $('#tooltip');
  // The selected war's places and parties in the period's years. When it was not active in the period only its places
  // (as of the end year) are outlined: a party of other years is not a party of the years shown (Tonga in Iraq, 2003).
  const wys = state.war ? yearsIn(state.war, a, b).map(([y]) => y) : [];
  const involved = new Set(state.war ? (wys.length ? wys.flatMap(y => [...locIn(state.war, y), ...statesIn(state.war, y)]) : locIn(state.war, b)) : []);
  // Pointing at a place: the conflicts on its territory or with it as a party in the year or period, or one sentence.
  const hover = (ev, key) => {
    const box = $('.map-wrap').getBoundingClientRect(), name = nameOf(key);
    const ws = key.startsWith('row:') ? [] : warsInPeriod(a, b).filter(w => onSoil(w, key, a, b) || partyIn(w, key, a, b));
    tip.classList.toggle('is-sentence', !ws.length);
    tip.innerHTML = ws.length ? `<strong>${esc(name)}</strong>${a === b ? '' : `<span class="tip-when">${a}–${b}</span>`}${ws.slice(0, 3).map(w => esc(w.name)).join('<br>') + (ws.length > 3 ? `<br>+${ws.length - 3} more` : '')}`
      : `<strong>${esc(noConflict(name, a, b))}</strong>`;
    tip.hidden = false;
    tip.style.left = `${Math.max(4, Math.min(ev.clientX - box.left + 14, box.width - tip.offsetWidth - 8))}px`;
    tip.style.top = `${Math.min(ev.clientY - box.top + 14, box.height - tip.offsetHeight - 8)}px`;
  };
  const classOf = (key, extra = '') => `shape active${extra}${key === state.selected ? ' selected' : ''}${involved.has(key) ? ' involved' : ''}${focusHits.has(key) ? ' prp-focus-hit' : ''}`;
  g.selectAll('path.shape')
    .data(features, d => `${d.properties.kind}|${d.properties.id}`)
    .join('path')
    .attr('d', path)
    .attr('class', d => classOf(d.properties.key))
    .attr('data-key', d => d.properties.key)
    .attr('fill', d => FILL[status.get(d.properties.key) || 'peace'])
    .on('mousemove', (ev, d) => hover(ev, d.properties.key))
    .on('mouseleave', () => { tip.hidden = true; })
    .on('click', (ev, d) => select(d.properties.key));
  // The selected or involved places draw last, so their outlines are not hidden under their neighbours'.
  g.selectAll('path.shape.involved, path.shape.selected').raise();
  g.selectAll('path.shape.prp-focus-hit').raise();
  // Places Natural Earth draws as a point, over the shapes; where they touch, a dot at war lies over one at peace.
  g.selectAll('circle.dot')
    .data(points, d => d.id)
    .join('circle')
    .attr('class', d => classOf(d.key, ' dot'))
    .attr('data-key', d => d.key)
    .attr('cx', d => projection(d.lonlat)[0])
    .attr('cy', d => projection(d.lonlat)[1])
    .attr('fill', d => FILL[status.get(d.key) || 'peace'])
    .on('mousemove', (ev, d) => hover(ev, d.key))
    .on('mouseleave', () => { tip.hidden = true; })
    .on('click', (ev, d) => select(d.key))
    .sort((p, q) => (STATUS_RANK[status.get(p.key)] || 0) - (STATUS_RANK[status.get(q.key)] || 0))
    .raise();
  raiseDots();
  renderUnplaced(a, b);
  const outlined = state.war ? `; places in ${state.war.name} are outlined` : '';
  const late = b > state.places.bordersTo ? ` Cliopatria’s borders end in ${state.places.bordersTo}, so ${b} is drawn on ${state.places.bordersTo}’s.` : '';
  // Beside the map, what the borders can and cannot show (P7): one border a year, so no change within a year.
  const yearly = ' One border a year, in Cliopatria’s sample years: the map cannot show a border that changed within a year.';
  if (a === b) { $('#caption').textContent = `Polities on Cliopatria’s borders for ${b}, shaded by the most intense armed conflict ${state.war ? 'on their territory' : 'fought on their territory'}${outlined}.${yearly}${late}`; return; }
  $('#caption').textContent = `Polities on Cliopatria’s borders for ${b}, shaded by the most intense armed conflict on their territory in any year from ${a} to ${b}${outlined}. A place of the period that had gone by ${b} is counted in the lists but not drawn.${yearly}${late}`;
}
// The war places of the year or period that no Cliopatria row (nor, from 1946, a small state's point) holds, by name;
// never drawn on a border of today. One sentence, said under the map, above the table and, for a war's own places, in
// its panel (review X3, 21 November 2026); a country's panel says it of that country.
const cannotPlace = (what, when) => `VM cannot place ${what} on a free border for ${when}`;
function unplacedLine(a, b, keep = () => true) {
  const rows = [];
  for (let y = a; y <= b; y++) {
    const qs = (state.places.unplaced[y] || []).filter(q => keep(q, y));
    if (qs.length) rows.push(`${y}: ${qs.map(q => unplacedName(q, y)).sort((p, r) => p.localeCompare(r)).join(', ')}`);
  }
  return rows.length ? `<b>${cannotPlace('this', a === b ? b : `${a}–${b}`)}:</b> ${esc(rows.length === 1 && a === b ? rows[0].replace(/^\d+: /, '') : rows.join('; '))}.` : '';
}
function renderUnplaced(a, b) {
  const html = unplacedLine(a, b);
  for (const el of [$('#unplaced'), $('#table-unplaced')]) if (el) { el.hidden = !html; el.innerHTML = html; }
}

/* ---------------------------------------------------------------- see more */
// Long lists and long text show their first items in the panel; "See more" opens the rest in a pop-out.
const popouts = new Map();
function seeMore(items, limit, title, full) {
  if (items.length <= limit) return items.join('');
  const key = 'm' + popouts.size;
  popouts.set(key, { title, html: full ?? items.join('') });
  return items.slice(0, limit).join('') + `<button type="button" class="more" data-more="${key}">See more (${items.length - limit} more)</button>`;
}
function seeMoreText(list, limit, title) {
  if (list.length <= limit) return esc(list.join(', ') || '—');
  const key = 'm' + popouts.size;
  popouts.set(key, { title, html: `<p>${esc(list.join(', '))}</p>` });
  return `${esc(list.slice(0, limit).join(', '))} <button type="button" class="more" data-more="${key}">See more (${list.length - limit} more)</button>`;
}
let lastFocus = null;
function openPopout(key) {
  const p = popouts.get(key);
  if (!p) return;
  lastFocus = document.activeElement;
  $('#modal-title').textContent = p.title;
  $('#modal-body').innerHTML = p.html;
  $('#modal').hidden = false;
  wireCards($('#modal-body'), id => { closePopout(); selectWar(id); });
  $('#modal-close').focus();
}
function closePopout() { if ($('#modal').hidden) return; $('#modal').hidden = true; lastFocus?.focus?.(); }
$('#modal-close').onclick = closePopout;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closePopout(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopout(); });

/* ---------------------------------------------------------------- panel */
// A war card names its level in the year in words as well as colour; over a period, its peak level and the years it
// was active in it ("War · 1939–45 · 7 yrs").
function warCard(w) {
  const a = state.from, b = state.year, l = peakIn(w, a, b);
  return `<div class="war${state.war === w ? ' sel' : ''}" data-level="${l}" data-id="${w.id}" role="button" tabindex="0"><div class="who"><span>${esc(w.name)}</span>${l ? `<span class="lvl l${l}">${LEVEL_WORD[l]} · ${a === b ? b : activeSpan(w, a, b)}</span>` : ''}</div><div class="meta">${esc(w.type)} · ${span(w)}</div></div>`;
}
function wireCards(root, open) {
  root.querySelectorAll('.war[data-id]').forEach(el => {
    el.onclick = () => open(el.dataset.id);
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(el.dataset.id); } };
  });
}

// War Focus covers the major wars month by month; a UCDP conflict can span several of them (Afghanistan, Chechnya),
// so pick the one running in the year shown (the period's last), else the nearest. A period opens there as one too:
// War Focus's months from January of its first year (when the war was running then) to December of its last.
function focusLink(w) {
  const fs = state.focus[w.id]; if (!fs) return '';
  const a = state.from, y = state.year;
  const f = fs.find(f => +f.start.slice(0, 4) <= y && (!f.end || +f.end.slice(0, 4) >= y)) || fs.reduce((p, q) => (Math.abs(+p.start.slice(0, 4) - y) <= Math.abs(+q.start.slice(0, 4) - y) ? p : q));
  const first = f.start.slice(0, 7), last = f.end ? f.end.slice(0, 7) : null;
  const clampM = m => (m < first ? first : last && m > last ? last : m);
  const month = clampM(`${Math.min(Math.max(y, +f.start.slice(0, 4)), +(f.end || '9999').slice(0, 4))}-${a === y ? '01' : '12'}`);
  const start = a === y ? null : clampM(`${a}-01`);
  return `<a class="btn go" href="${esc(sibling(`../focus/index.html#war=${f.id}&m=${month}${start && start > first && start < month ? `&f=${start}` : ''}`))}" target="${siblingTarget}">Open in War Focus: ${esc(f.name)}, month by month →</a>`;
}

// A Wikidata war's dates as Wikidata gives them, each at its own precision ("from 9 September 1932 to 12 June 1935",
// "from July 1936", "in 1940"); its years where it has no dates.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function dayText(s) {
  const [y, m, d] = String(s || '').split('-');
  return d ? `${+d} ${MONTHS[+m - 1]} ${y}` : m ? `${MONTHS[+m - 1]} ${y}` : y;
}
function wdDates(w) {
  if (!w.start) return w.span.replace('–', ' to ');
  if (!w.end || w.end === w.start) return /-/.test(w.start) ? `on ${dayText(w.start)}` : `in ${w.start}`;
  return `from ${dayText(w.start)} to ${dayText(w.end)}`;
}
function warDetail(w) {
  const a = state.from, y = state.year, l = peakIn(w, a, y), ys = yearsIn(w, a, y);
  const activeYears = w.years.length;
  const warYears = w.years.filter(([, x]) => x === 2).length;
  // The war's places and parties over all its years, by their names in the year it began.
  const began = w.years[0][0];
  const places = [...new Set([...w.loc.map(q => unplacedName(q, began)), ...(w.where || [])])];
  const parties = w.states.filter(q => !w.loc.includes(q)).map(q => unplacedName(q, began));
  const intro = w.src === 'wikidata'
    ? `Wikidata lists ${esc(w.name)} as ${/^[aeiou]/i.test(w.type) ? 'an' : 'a'} ${esc(w.type.toLowerCase())}, ${esc(wdDates(w))}${places.length ? `, fought in ${esc(places.join(', '))}` : ''}. No free source codes how intense it was, and VM gives no battle-death total for it.`
    : `UCDP records this ${esc(w.type.toLowerCase())} over ${esc(w.aim)}${places.length ? ` in ${esc(places.join(', '))}` : ''}, active in ${activeYears} year${activeYears > 1 ? 's' : ''} between ${w.years[0][0]} and ${w.years.at(-1)[0]}${warYears ? `, ${warYears} of them at war level (1,000+ battle deaths)` : ''}.`;
  const years = y - a + 1, atWar = ys.filter(([, x]) => x === 2).length;
  const shown = a === y
    ? (l ? `<p><span class="tag ${TAG[l]}">${y}</span>${levelLabel(l)}</p>` : `<p class="empty">Not active in ${y}.</p>`)
    : (l ? `<p><span class="tag ${TAG[l]}">${a}–${y}</span>Active in ${ys.length} of the ${years} years ${a}–${y}${w.src === 'wikidata' ? '' : atWar ? `, ${atWar} at war level (1,000+ battle deaths)` : ', none at war level'}.</p>` : `<p class="empty">Not active in ${a}–${y}.</p>`);
  const inP = yy => yy >= a && yy <= y;
  // Its own places in the years shown that VM cannot place on a free border, in the map's words.
  const activeYs = new Set(ys.map(([yy]) => yy));
  const unplaced = unplacedLine(a, y, (q, yy) => activeYs.has(yy) && (locIn(w, yy).includes(q) || statesIn(w, yy).includes(q)));
  const sides = w.src === 'wikidata'
    ? `<div class="sides"><b>States taking part (Wikidata’s participants)</b>${seeMoreText(parties.length ? parties : places, 10, `${w.name} · states taking part`)}</div>`
    : `<div class="sides"><b>Side A</b>${seeMoreText(w.sideA, 8, `${w.name} · side A`)}<b>Side B</b>${seeMoreText(w.sideB, 8, `${w.name} · side B`)}</div>`;
  return `<button class="close" id="close-war" aria-label="Back to the ${a === y ? 'year' : 'period'}">×</button>
    <h2>${esc(w.name)}</h2><p class="sub">${esc(w.type)} · ${span(w)}</p>
    <p>${intro}</p>
    ${shown}
    ${unplaced ? `<p class="note unplaced-note">${unplaced}</p>` : ''}
    ${sides}
    <a class="btn" href="${wikiUrl(w)}" target="_blank" rel="noreferrer">${w.wiki ? 'Wikipedia article ↗' : 'Search Wikipedia ↗'}</a>
    ${w.q ? `<a class="btn" href="https://www.wikidata.org/wiki/${esc(w.q)}" target="_blank" rel="noreferrer">Wikidata item ↗</a>` : ''}
    ${focusLink(w)}
    ${w.src === 'ucdp' ? `<h3>Year by year <span class="count">bold red = war level${a === y ? '' : `; underlined = ${a}–${y}`}</span></h3><p class="years">${seeMore(w.years.map(([yy, x]) => `<span class="l${x}${a !== y && inP(yy) ? ' in' : ''}">${yy}</span> `), 24, `${w.name} · active years`)}</p>` : ''}`;
}

function renderPanel() {
  const a = state.from, y = state.year, panel = $('#panel'), when = periodText();
  popouts.clear();
  let html;
  const note = state.note ? `<p class="note old-address">${esc(state.note)}</p>` : '';
  if (state.war) html = warDetail(state.war);
  else if (state.selected) {
    const q = state.selected, list = warsInPeriod(a, y), rowOnly = q.startsWith('row:');
    const here = rowOnly ? [] : list.filter(w => onSoil(w, q, a, y)), abroad = rowOnly ? [] : list.filter(w => !onSoil(w, q, a, y) && partyIn(w, q, a, y));
    // Every conflict this place took part in or hosted, across the whole century, oldest first.
    const soilEver = w => onSoil(w, q, state.data.firstYear, state.data.lastYear);
    const ever = rowOnly ? [] : state.data.wars.filter(w => soilEver(w) || w.states.includes(q)).sort((p, r) => p.years[0][0] - r.years[0][0]);
    const soil = ever.filter(soilEver), away = ever.filter(w => !soilEver(w));
    const cards = l => l.map(w => warCard(w));
    const byDecade = l => [...new Set(l.map(w => Math.floor(w.years[0][0] / 10) * 10))]
      .map(d => `<h3>${d}s</h3>${l.filter(w => Math.floor(w.years[0][0] / 10) * 10 === d).map(w => warCard(w)).join('')}`).join('');
    const cname = nameOf(q), heading = a === y ? ` in ${y}` : `, ${a}–${y}`;
    const drawnNow = state.features.some(f => f.properties.key === q) || state.points.some(p => p.key === q);
    const sub = here.length ? `${here.length} conflict${here.length > 1 ? 's' : ''} on its territory in ${when}${abroad.length ? ` · fighting in ${abroad.length} abroad` : ''}`
      : abroad.length ? `No conflict on its territory in ${when} · fighting in ${abroad.length} abroad`
        : drawnNow ? noConflict(cname, a, y) : `No conflict on its territory in ${when}`;
    // Where its shape comes from this year, in a line.
    const row = rowNameOf(q), pt = state.points.some(p => p.key === q);
    const border = row ? `Border: Cliopatria’s “${row}” for ${bordersYear(y)}.` : pt ? 'Drawn as a point (Natural Earth), since no free border holds it.'
      : (state.places.unplaced[y] || []).includes(q) ? `${cannotPlace(unplacedName(q, y), y)}, so it is not drawn.` : '';
    const rowNote = rowOnly ? '<p class="note">VM holds no state for this Cliopatria polity, so no war is listed under it here.</p>' : '';
    html = `<button class="close" id="close" aria-label="Close">×</button><h2>${esc(cname)}</h2>
      <p class="sub">${esc(sub)}</p>${border ? `<p class="note border-note">${esc(border)}</p>` : ''}${rowNote}
      ${here.length ? `<h3>On its territory${heading}</h3>${seeMore(cards(here), 6, `${cname} · conflicts on its territory in ${when}`)}` : ''}
      ${abroad.length ? `<h3>Fighting abroad${heading}</h3>${seeMore(cards(abroad), 6, `${cname} · fighting abroad in ${when}`)}` : ''}
      ${rowOnly ? '' : `<h3>All conflicts ${state.data.firstYear}–${state.data.lastYear} <span class="count">${ever.length} · ${soil.length} on its territory · ${away.length} abroad</span></h3>
      ${ever.length ? seeMore(cards(ever), 6, `${cname} · all conflicts ${state.data.firstYear}–${state.data.lastYear}`,
        `<p class="sub">${ever.length} conflicts: ${soil.length} fought on its territory, ${away.length} fought abroad. Before ${state.data.ucdpFrom} only the wars on VM’s list from Wikidata are shown.</p>${byDecade(ever)}`) : '<p class="empty">None recorded.</p>'}`}`;
  } else {
    const list = warsInPeriod(a, y);
    html = `<h2>${when}</h2><p class="sub">${tally(list, a, y).sub}</p>
      ${list.length ? seeMore(list.map(w => warCard(w)), 15, `All armed conflicts in ${when}`) : '<p class="empty">No conflicts recorded.</p>'}
      <p class="note">${a === y ? 'Click a country or a war for details. Press ▶ or drag the slider to move through the years; drag its hollow start handle back to cover a period of years.' : `Every armed conflict active in at least one year from ${a} to ${y}, at its peak level then. Click a country or a war for details; bring the hollow start handle back onto the end for a single year.`}</p>`;
  }
  // Before 1946 VM's list of wars from Wikidata; a period that spans 1946 draws on both.
  const { wikidata, ucdp, borders } = state.data.sources, from = state.data.ucdpFrom;
  const src = y < from ? `${wikidata}.` : a < from ? `${wikidata}, to ${from - 1}; ${ucdp}, from ${from}.` : `${ucdp}.`;
  panel.innerHTML = note + html + `<p class="src-note"><b>Source:</b> ${esc(src)} Borders: ${esc(borders)}.</p>`;
  wireCards(panel, selectWar);
  panel.querySelectorAll('[data-more]').forEach(b => b.onclick = () => openPopout(b.dataset.more));
  $('#close')?.addEventListener('click', () => select(null));
  $('#close-war')?.addEventListener('click', () => selectWar(null));
}

// Header figures for the year or period.
function renderKpis() {
  const a = state.from, y = state.year, list = warsInPeriod(a, y);
  $('#year-label').textContent = a === y ? 'Year' : 'Period';
  $('.kpis').classList.toggle('is-period', a !== y);
  $('#year-big').textContent = periodText();
  $('#k-conflicts').textContent = list.length;
  const t = tally(list, a, y);
  $('#k-wars-label').textContent = t.label;
  $('#k-wars').textContent = t.count;
}

/* ---------------------------------------------------------------- table view */
// The conflicts of the year or period as a table: the list view of what the map shows.
function renderTable() {
  if (state.view !== 'table' || !state.data) return;
  const a = state.from, y = state.year, list = warsInPeriod(a, y);
  renderUnplaced(a, y);
  $('#table-title').textContent = `Armed conflicts ${a === y ? `in ${y}` : `${a}–${y}`} · ${list.length}`;
  $('#th-year').textContent = a === y ? `In ${y}` : `${a}–${y}`;
  $('#table-rows').innerHTML = list.map(w => {
    const l = peakIn(w, a, y), places = placesIn(w, a, y);
    return `<tr data-id="${w.id}"${state.war === w ? ' class="sel"' : ''}><td><button type="button" class="rowbtn">${esc(w.name)}</button></td><td class="mono">${esc(w.type)}</td>
      <td><span class="lvl l${l}">${LEVEL_WORD[l]}</span>${a === y ? '' : `<span class="cell-sub">${activeSpan(w, a, y)}</span>`}</td><td class="mono">${span(w)}</td>
      <td class="wrap">${esc(places.slice(0, 4).join(', '))}${places.length > 4 ? ` +${places.length - 4}` : ''}</td></tr>`;
  }).join('') || `<tr><td colspan="5" class="empty">No conflicts recorded in ${periodText()}.</td></tr>`;
  $('#table-rows').querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () => selectWar(tr.dataset.id));
}

/* ---------------------------------------------------------------- tabs */
const TABS = [...document.querySelectorAll('[role="tab"]')];
function setView(v, { push = true } = {}) {
  state.view = v === 'table' ? 'table' : 'map';
  for (const t of TABS) {
    const on = t.dataset.view === state.view;
    t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    $('#' + t.getAttribute('aria-controls')).hidden = !on;
  }
  $('#tooltip').hidden = true;
  renderTable();
  if (push) writeHash();
}
TABS.forEach((t, i) => {
  t.onclick = () => setView(t.dataset.view);
  t.onkeydown = e => {
    const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!k) return;
    const n = TABS[(i + k + TABS.length) % TABS.length]; n.focus(); setView(n.dataset.view);
  };
});

/* ---------------------------------------------------------------- the timeline, selection, URL */
// The years shown (design/prp-period.js): the start rests on the end, so one year is shown and ‹ ›, play, a click on
// the track and the end handle move it as before; the start handle pulled back opens a period. Every move by the
// reader lands in onChange; play travels year by year, or grows a period from its first year.
const fromPeriod = p => { state.from = p.from; state.year = p.to; };
// The map draws once its year's borders are in; the panel, which names places by the year's shapes, follows it.
function render() { const done = renderMap().then(() => { renderPanel(); }); renderKpis(); renderTable(); return done; }
const period = PRPPeriod.mount($('#timeline'), {
  rest: 'end', ids: { from: 'from', to: 'year', prev: 'prev', play: 'play', next: 'next' },
  names: { from: 'First year of the period', to: 'Year shown, or the last of the period', prev: 'Previous year', next: 'Next year' },
  play: { interval: 900, label: 'Play through the years' }, open: () => openSteps(),
  onChange: p => { fromPeriod(p); render(); writeHash(); },
});
// The period from code (the address, a war, the search, Documentary mode): a start after the end becomes the end, and
// a start of null is a single year.
function setPeriod(from, to, { push = true } = {}) {
  fromPeriod(period.set(from, to, { silent: true }));
  const done = render();
  if (push) writeHash();
  return done;
}
function setupTimeline() {
  const { firstYear: a, lastYear: b } = state.data, years = Array.from({ length: b - a + 1 }, (_, k) => a + k);
  // Decade ticks from 1930; every other one drops out on narrow screens.
  const ticks = years.filter(y => (y - a - 4) % 10 === 0).map((y, k) => ({ at: y, text: String(y), kind: k % 2 ? 'minor' : 'key' }));
  // Above the track: how many conflicts were under way each year.
  const counts = years.map(y => state.data.wars.filter(w => levelIn(w, y)).length);
  period.update({ stops: years, ticks, strip: counts, from: null, to: b });
  // Under the timeline, what each source counts, so the jump in the strip at UCDP's first year reads for what it is.
  const u = state.data.ucdpFrom;
  $('#thresholds').textContent = `What is counted: ${a}–${u - 1}, the wars VM lists from Wikidata (no free source codes their size, so smaller conflicts are missing); ${u}–${b}, armed conflicts of ${num(CONFLICT_DEATHS)}+ battle deaths in a year (UCDP/PRIO), at war level from ${num(WAR_DEATHS)}.`;
}
function select(q) { state.selected = q; state.war = null; state.note = null; renderMap().then(renderPanel); renderTable(); writeHash(); }
function selectWar(id) {
  state.war = state.data.wars.find(w => w.id === id) || null;
  // A war not active in the year or period: its first year, as one year.
  if (state.war && !peakIn(state.war, state.from, state.year)) setPeriod(null, state.war.years[0][0], { push: false });
  renderMap().then(renderPanel); renderTable(); writeHash();
}
function writeHash() {
  const f = PRPPeriod.rules.startParam(period.get());
  const m = PRPPeriod.rules.movementParam(period.movement()); // MP-12: the movement, written only away from Independent
  const c = state.selected && !state.selected.startsWith('row:') ? state.selected : null;
  const h = `#y=${state.year}${f != null ? `&f=${f}` : ''}${c ? `&c=${c}` : ''}${state.war ? `&w=${state.war.id}` : ''}${state.view === 'table' ? '&v=table' : ''}${m ? `&${PRPPeriod.MOVE_PARAM}=${m}` : ''}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}
// MP-03 (15 Nov 2026): on a phone the opening's two handles sit at least about 24 px apart at the track's drawn
// width, the latest year still at the right handle; on wider screens they open one year apart, as before.
function openSteps() {
  if (!matchMedia('(max-width: 767px)').matches) return 1;
  const w = document.querySelector('#timeline .prp-period-track')?.getBoundingClientRect().width || $('#timeline').getBoundingClientRect().width;
  return PRPPeriod.rules.openSteps(period.get().stops.length, w);
}
// c: a Q-id; an old address's number (UCDP's Gleditsch–Ward number for the country) or ISO3 opens the same country.
// w: a war id; an old Correlates of War id opens the same war where VM's list holds it. An address VM can no longer
// show says so (note).
function readCountry(c, y) {
  if (!c) return { c: null };
  if (/^Q\d+$/.test(c)) return { c };
  const q = keyFor(/^\d+$/.test(c) ? `gw:${c}` : c, y);
  return q ? { c: q } : { c: null, note: `This address named a country by ${/^\d+$/.test(c) ? `the number ${c}` : `the code ${c}`}, which VM can no longer show: search for it by name.` };
}
function readWar(w) {
  if (!w) return { w: null };
  if (state.data.wars.some(x => x.id === w)) return { w };
  if (state.data.oldIds?.[w]) return { w: state.data.oldIds[w] };
  if (state.data.oldWithin?.[w]) {
    const [q, title] = state.data.oldWithin[w], whole = state.data.wars.find(x => x.id === q);
    return { w: q, note: `This address named ${title}, from the Correlates of War’s list, which VM no longer uses (its terms bar commercial use). VM’s list of 1926–1945 from Wikidata holds it as part of ${whole?.name || q}, shown here.` };
  }
  if (state.data.oldGone?.[w]) return { w: null, note: `This address named ${state.data.oldGone[w]}, from the Correlates of War’s list, which VM no longer uses (its terms bar commercial use); VM’s list of 1926–1945 from Wikidata does not hold it.` };
  return { w: null, note: `This address named a war VM does not hold (${w}).` };
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1)), y = +p.get('y') || state.data.lastYear;
  const years = period.get().stops;
  // An f at or after the year, or unreadable, is a single year; an address with no year at all opens on the last two.
  const cc = readCountry(p.get('c') || '', y), ww = readWar(p.get('w'));
  return { y, f: PRPPeriod.rules.readStart(years, p.get('f'), y, 'end', !p.get('y') && !p.get('f'), openSteps()), c: cc.c, w: ww.w, v: p.get('v') === 'table' ? 'table' : 'map',
    m: PRPPeriod.rules.readMovement(p.get(PRPPeriod.MOVE_PARAM)), note: ww.note || cc.note || null };
}

function setupSearch() {
  const input = $('#search'), list = $('#search-results');
  const index = state.data.wars.map(w => ({ label: w.name, sub: `${w.type} · ${span(w)}`, key: `${w.name} ${w.sideA.join(' ')} ${w.sideB.join(' ')}`.toLowerCase(), war: w.id }));
  // Places, each opening in the first year a war touched it when the year shown is outside its years.
  const firstYear = new Map();
  for (const w of state.data.wars) for (const [y] of w.years) for (const q of [...locIn(w, y), ...statesIn(w, y)]) if (!firstYear.has(q) || firstYear.get(q) > y) firstYear.set(q, y);
  // A place with earlier names (`was`) is found by each: an earlier name opens in the first year a war touched the place
  // under it, the later name in the first such year after the earlier names' last. A year in which the place is drawn
  // comes before one in which it cannot be placed (Yugoslavia under occupation, 1941 to 1944, opens in 1945).
  const firstFrom = (q, from, to) => {
    const ys = [...new Set(state.data.wars.flatMap(w => w.years.map(([y]) => y).filter(y => y >= from && y <= to && [...locIn(w, y), ...statesIn(w, y)].includes(q))))].sort((a, b) => a - b);
    return ys.find(y => !(state.places.unplaced[y] || []).includes(q)) ?? ys[0] ?? null;
  };
  for (const [q, p] of Object.entries(state.places.places)) {
    const was = p.was || [], after = was.length ? was.at(-1).to + 1 : null;
    index.push({ label: p.n, sub: `Country${p.iso3 ? ` · ${p.iso3}` : ''}`, key: `${p.n} ${p.iso3 || ''}`.toLowerCase(), q, year: (after ? firstFrom(q, after, state.data.lastYear) || after : firstYear.get(q)) || null, from: after });
    was.forEach((w, i) => { const from = i ? was[i - 1].to + 1 : state.data.firstYear; index.push({ label: w.n, sub: `Country · to ${w.to}`, key: w.n.toLowerCase(), q, year: firstFrom(q, from, w.to) || w.to, from, to: w.to }); });
  }
  let results = [];
  const choose = r => {
    input.value = ''; list.hidden = true;
    // A place opens in the year shown where it is drawn then under the name chosen; else in the year the name gives.
    const named = r.from == null && r.to == null ? true : state.year >= (r.from ?? state.data.firstYear) && state.year <= (r.to ?? state.data.lastYear);
    if (r.war) selectWar(r.war); else { if (r.year && !(named && state.features.some(f => f.properties.key === r.q))) setPeriod(null, Math.max(r.year, state.data.firstYear), { push: false }); select(r.q); }
  };
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    results = q.length < 2 ? [] : index.filter(r => r.key.includes(q)).slice(0, 12);
    list.hidden = !results.length;
    list.innerHTML = results.map((r, i) => `<li role="option" aria-selected="${i === 0}">${esc(r.label)}<small>${esc(r.sub)}</small></li>`).join('');
    list.querySelectorAll('li').forEach((li, i) => li.onmousedown = () => choose(results[i]));
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && results[0]) choose(results[0]); else if (e.key === 'Escape') list.hidden = true; });
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
}

/* ---------------------------------------------------------------- documentary narration */
// For PRP Documentary mode (design/jdpi-narrator.js): the century of conflict, year by year, pausing each decade.
const warNew = (w, y) => w.years[0][0] === y;
// A year as told, and where: the places the named wars were fought in (or, when none is named, every conflict's).
function yearStory(y) {
  const all = warsIn(y), wars = all.filter(w => atWarLevel(levelIn(w, y))), fresh = all.filter(w => warNew(w, y) && atWarLevel(levelIn(w, y)));
  const ended = state.data.wars.filter(w => w.years.at(-1)[0] === y - 1 && atWarLevel(levelIn(w, y - 1)) && y - 1 < state.data.lastYear);
  const parts = [`${y}.`];
  const before = y < state.data.ucdpFrom;
  parts.push(all.length ? (before ? `${all.length} war${all.length > 1 ? 's are' : ' is'} under way on VM’s list from Wikidata.` : `${all.length} armed conflict${all.length > 1 ? 's are' : ' is'} under way, ${wars.length ? `${wars.length} of ${all.length > 1 ? 'them' : 'it'} at the level of war, with a thousand or more battle deaths` : 'none of them at the level of war'}.`) : 'The world records no armed conflict this year.');
  const big = (fresh.length ? fresh : wars).slice().sort((a, b) => yearsIn(b, y, y + 100).length - yearsIn(a, y, y + 100).length).slice(0, 3);
  if (fresh.length) parts.push(`New this year: ${big.map(w => w.name.replace(/:/, ',')).join('; ')}.`);
  else if (big.length) parts.push(`The longest under way: ${big.map(w => w.name.replace(/:/, ',')).join('; ')}.`);
  if (ended.length) parts.push(`Coming to an end: ${ended.slice(0, 2).map(w => w.name.replace(/:/, ',')).join('; ')}.`);
  const focusWar = big.find(w => state.focus[w.id]);
  if (focusWar) parts.push(`War Focus follows ${state.focus[focusWar.id][0].name} month by month.`);
  const named = [...big.map(w => locIn(w, y)), ...ended.slice(0, 2).map(w => locIn(w, y - 1))];
  const qs = [...new Set((named.length ? named : all.map(w => locIn(w, y))).flat())];
  return { text: parts.join(' '), focus: qs.length ? { qids: qs, padding: 36 } : { reset: true } };
}
window.jdpiDocumentary = {
  get title() { return `Retrospective Battlefield · ${periodText()}`; },
  async *story() {
    period.stop();
    if (state.view !== 'map') setView('map');
    yield { text: `A century of war, from ${state.data.firstYear} to ${state.data.lastYear}, drawn on the map as the world stood each year. We begin in ${state.year}.`, el: $('#year-big'), focus: { reset: true } };
    // Year by year, one year at a time, whatever period was set.
    for (let y = state.year; y <= state.data.lastYear; y++) {
      await setPeriod(null, y, { push: false });
      await new Promise(r => setTimeout(r, 400));
      const { text, focus } = yearStory(y);
      yield { text, el: $('#panel'), focus };
      if (y % 10 === 9 && y < state.data.lastYear) yield { chapterEnd: true, label: `Continue to the ${y + 1}s` };
    }
  },
};

const fmtDay = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
(async function init() {
  const link = $('#sibling'); link.href = sibling('../focus/index.html'); link.target = siblingTarget;
  try {
    const [data, places, focus, small] = await Promise.all([
      fetch('data/wars.json').then(r => r.json()),
      fetch('data/places.json').then(r => r.json()),
      fetch('../focus/data/index.json').then(r => r.json()).catch(() => ({ wars: [] })),
      fetch('../../omni/data/base/small-states.json').then(r => r.json()),
    ]);
    state.data = data; state.places = places;
    for (const f of focus.wars) if (f.bf) (state.focus[data.oldIds?.[f.bf] || f.bf] ||= []).push(f);
    for (const p of small.points) state.small.set(p.id, p);
    $('.legend ul').insertAdjacentHTML('beforeend', '<li><span class="swatch dot-swatch"></span>A small state no free border holds, as a point (Natural Earth), from 1946</li>');
    $('.map-wrap').classList.add('has-dots'); // styles.css: the key under the map, clear of the dots
    $('#status').innerHTML = `<span><b>${data.wars.length}</b> wars and armed conflicts</span><span>Coverage <b>${data.firstYear}–${data.lastYear}</b></span><span>Sources <b>UCDP/PRIO · Wikidata · Cliopatria · Natural Earth</b></span>${data.generated ? `<span>Built <b>${esc(fmtDay(data.generated))}</b></span>` : ''}`;
    drawMap(); setupTimeline(); setupSearch();
    const { y, f, c, w, v, m, note } = readHash();
    state.selected = c;
    setView(v, { push: false });
    period.setMovement(m, { silent: true }); // the address's movement first, so its period is placed by that rule
    await setPeriod(f, y, { push: false });
    if (w) selectWar(w);
    if (note) { state.note = note; renderPanel(); }
    window.addEventListener('hashchange', () => {
      const h = readHash();
      if (h.v !== state.view) setView(h.v, { push: false });
      const moved = h.m !== period.movement();
      if (moved) period.setMovement(h.m, { silent: true });
      if (moved || h.y !== state.year || (h.f ?? h.y) !== state.from) setPeriod(h.f, h.y, { push: false });
      if (h.c !== state.selected) select(h.c);
      if ((h.w || null) !== (state.war?.id || null)) selectWar(h.w);
      if (h.note) { state.note = h.note; renderPanel(); }
    });
  } catch (err) {
    console.error(err);
    $('#status').textContent = 'Could not load conflict history.';
  }
})();
