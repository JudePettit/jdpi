/* The Omni-Map's layer engine, pure (PRP-SCHOLAR-USP-DESIGN.md 4.2, stage S5a): which layers a view draws, by the
   catalogue (omni/data/layers.json) and the recipe (design/vm-recipe.js), under the clutter rule. No DOM, no fetch:
   omni/lib/layer-view.js loads, draws and lists; this decides. S5b and S5c add catalogue entries, builders, data and
   draw rules, and nothing here.

   A view's layers, its "set": { fill, base, points: [ids, the oldest first], anyway, filters: { id: { field, value } } }
     fill    the one fill (a by-country or gridded layer, role 'fill'), or null: the borders fill alone
     base    the one base (role 'base': Natural Earth's countries of today), or null: the plain base, land only
     points  the point and line layers (roles 'point', 'line'), at most three (MAX_POINTS) unless anyway
     anyway  the reader's "Show anyway": the limit on point and line layers is lifted (all=1 in the recipe)
   The borders (role 'borders') are always drawn: under a fill they are outlines only.

   In the recipe (3.2's keys): fill=<the fill> (a World Bank series as wb:<code>, the design's own form; another fill by
   its id), base=countries, l=<the point and line layers in the order switched on>, all=1 for Show anyway. A fill's or
   a base's id given in l= is read into its own key, so l=density-grid opens the grid. An address from before S5a opens
   as it did: l=battles is the battles; an id the catalogue does not hold is named (unknown) and not drawn. */

export const MAX_POINTS = 3;
export const CLUSTER_AT = 2000; // above this many points drawn, a point layer clusters (4.2)

const ROLES = ['borders', 'fill', 'base', 'point', 'line'];
/** A layer's role: its own, else by its geometry (as design/prp-map.js roleOf). */
export function roleOf(entry) {
  if (ROLES.includes(entry?.role)) return entry.role;
  if (entry?.id === 'borders') return 'borders';
  return entry?.geometry === 'point' ? 'point' : entry?.geometry === 'line' ? 'line' : 'fill';
}
const isPoint = e => ['point', 'line'].includes(roleOf(e));

/** The catalogue as the engine reads it: { list, byId, absent, byFill }. byFill maps a recipe's fill (wb:<code> or an id). */
export function catalogue(doc) {
  const list = Array.isArray(doc?.layers) ? doc.layers : [];
  const byId = new Map(list.map(e => [e.id, e]));
  const byFill = new Map();
  for (const e of list) if (roleOf(e) === 'fill') { byFill.set(e.id, e.id); if (e.wb) byFill.set(`wb:${e.wb}`, e.id); }
  return { list, byId, byFill, absent: Array.isArray(doc?.absent) ? doc.absent : [] };
}

export const emptySet = () => ({ fill: null, base: null, points: [], anyway: false, filters: {} });
const copy = s => ({ fill: s.fill, base: s.base, points: [...s.points], anyway: !!s.anyway, filters: { ...s.filters } });

/** Switches a layer on: { set, dropped: [{ id, why }], note }. A second fill replaces the first, a second base the
    first; a fourth point or line layer switches off the oldest that is not the subject's (the layer of the view's
    clicked object), unless anyway. A layer the catalogue does not hold is refused (note says so). */
export function switchOn(set, id, cat, { subject = null, filter = null } = {}) {
  const e = cat.byId.get(id), next = copy(set), dropped = [];
  if (!e) return { set: next, dropped, note: `VM holds no "${id}" layer, so it is not drawn.` };
  const role = roleOf(e);
  if (role === 'borders') return { set: next, dropped, note: null };
  if (filter) next.filters[id] = filter;
  if (role === 'fill' || role === 'base') {
    const prev = next[role];
    next[role] = id;
    if (prev && prev !== id) {
      dropped.push({ id: prev, why: role });
      return { set: next, dropped, note: `${e.title} replaces ${cat.byId.get(prev)?.title || prev}: the map draws one ${role === 'fill' ? 'fill' : 'base'} at a time.` };
    }
    return { set: next, dropped, note: null };
  }
  next.points = [...next.points.filter(x => x !== id), id];
  if (!next.anyway) {
    while (next.points.length > MAX_POINTS) {
      const old = next.points.find(x => x !== subject && x !== id);
      if (!old) break;
      next.points = next.points.filter(x => x !== old);
      delete next.filters[old];
      dropped.push({ id: old, why: 'points' });
    }
  }
  return { set: next, dropped, note: dropped.length ? pointsNote(dropped, cat) : null };
}
// The note of point or line layers switched off by the clutter rule, naming each.
function pointsNote(dropped, cat) {
  const names = dropped.map(d => cat.byId.get(d.id)?.title || d.id);
  const list = names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(' and ');
  return `${list} switched off: the map draws at most ${MAX_POINTS} point or line layers at a time, the oldest giving way. Tick “Show anyway” to keep them all.`;
}
/** Switches a layer off. */
export function switchOff(set, id) {
  const next = copy(set);
  if (next.fill === id) next.fill = null;
  if (next.base === id) next.base = null;
  next.points = next.points.filter(x => x !== id);
  delete next.filters[id];
  return next;
}
/** "Show anyway" ticked or not; unticked, the clutter rule applies again to what is on (the oldest giving way). */
export function setAnyway(set, on, cat, { subject = null } = {}) {
  let next = { ...copy(set), anyway: !!on }, dropped = [], note = null;
  if (!on && next.points.length > MAX_POINTS) {
    const keep = next.points.slice();
    next = { ...next, points: [] };
    for (const id of keep) { const r = switchOn(next, id, cat, { subject, filter: set.filters[id] || null }); next = r.set; dropped.push(...r.dropped); }
    // V3 (S5b/S5c review): the note names every layer switched off, not only the last switchOn's.
    if (dropped.length) note = pointsNote(dropped, cat);
  }
  return { set: next, dropped, note };
}
/** The layers on, in drawing order: base, fill, then point and line layers. */
export const layersOn = set => [set.base, set.fill, ...set.points].filter(Boolean);

/** A recipe's layers: { set, unknown: [ids], notes: [] }. Its fill, base and l= in that order, then the clutter rule
    (all=1 lifts it); 'borders' as a fill is the default. */
export function fromRecipe(R, cat, { subject = null } = {}) {
  let set = { ...emptySet(), anyway: R?.all === 1 };
  const unknown = [], notes = [];
  const take = (id, filter = null) => { const r = switchOn(set, id, cat, { subject, filter }); set = r.set; if (r.note && r.dropped.length) notes.push(r.note); };
  if (R?.base === 'countries' && cat.byId.has('countries')) take('countries');
  if (R?.fill && R.fill !== 'borders') {
    const id = cat.byFill.get(R.fill);
    if (id) take(id); else unknown.push(R.fill);
  }
  for (const l of R?.l || []) {
    if (l.id === 'borders') continue;
    if (!cat.byId.has(l.id)) { unknown.push(l.id); continue; }
    take(l.id, l.field ? { field: l.field, value: l.value } : null);
  }
  return { set, unknown, notes };
}
/** The recipe's keys for a set: { fill, base, l, all } (undefined where the default stands). A filter rides on its l=
    entry (battles:partOf=Q33143). */
export function toRecipe(set, cat) {
  const fillE = set.fill ? cat.byId.get(set.fill) : null;
  const l = set.points.map(id => (set.filters[id] ? { id, field: set.filters[id].field, value: set.filters[id].value } : { id }));
  return {
    fill: fillE ? (fillE.wb ? `wb:${fillE.wb}` : fillE.id) : 'borders',
    base: set.base === 'countries' ? 'countries' : 'plain',
    l: l.length ? l : undefined,
    all: set.anyway ? 1 : undefined,
  };
}

/** Whether a point layer of n points drawn clusters (4.2: above 2,000 visible points, points cluster). */
export const clusters = n => n > CLUSTER_AT;

/** The cell of a 0.25° grid: { row, col, west, north } from its index (vm-grid/1, row 0 at 90° N). */
export function cellOf(index, { cols = 1440, deg = 0.25, west = -180, north = 90 } = {}) {
  const row = Math.floor(index / cols), col = index % cols;
  return { row, col, west: west + col * deg, north: north - row * deg };
}
/** A grid file's cells as { index, people } (vm-grid/1 holds [step, people] pairs, the step from the last cell). */
export function gridCells(cells) {
  const out = [];
  let i = 0;
  for (let k = 0; k + 1 < cells.length; k += 2) { i += cells[k]; out.push({ index: i, people: cells[k + 1] }); }
  return out;
}
/** A 0.25° row's area in km², on a sphere of radius 6,371.0088 km (as omni/scripts/build-density.mjs). */
export function cellArea(row, { deg = 0.25, north = 90, radiusKm = 6371.0088 } = {}) {
  const r = Math.PI / 180, a = (north - row * deg) * r, b = (north - (row + 1) * deg) * r;
  return radiusKm * radiusKm * deg * r * Math.abs(Math.sin(a) - Math.sin(b));
}
/** The class of a value by rising breaks: 0 below the first, breaks.length at or above the last. */
export function classOf(v, breaks) {
  let k = 0;
  while (k < breaks.length && v >= breaks[k]) k++;
  return k;
}
/** The class labels of a layer's breaks: ['under 10', '10 to 25', …, '500 and over'], with its unit. */
export function classLabels(breaks, fmt = n => n.toLocaleString('en-GB')) {
  const out = [`under ${fmt(breaks[0])}`];
  for (let i = 1; i < breaks.length; i++) out.push(`${fmt(breaks[i - 1])} to ${fmt(breaks[i])}`);
  out.push(`${fmt(breaks.at(-1))} and over`);
  return out;
}
/** The colour token (2 … 10 of omni/styles.css's --om-seq-1 … 10) of class k of n: the classes spread over the ramp
    from its second step, since the first is so pale that a country of the lowest class would read as sea (R3 of the
    S5a review). The key and the map take the same token. */
export const RAMP_FIRST = 2, RAMP_LAST = 10;
export function tokenOf(k, n) {
  return RAMP_FIRST + Math.round((k * (RAMP_LAST - RAMP_FIRST)) / Math.max(1, n - 1));
}
/* ---------- stage S5b: states, points at a country, a period, a filter ---------- */
/** The first year VM draws Natural Earth's countries of today (as the countries base). */
export const NE_FROM = 1886;
/** Where VM draws a state at a year: { how, features, at, reason }.
      how 'cliopatria'     on Cliopatria's border for the year (featuresFor(q, year), VM's crosswalk by Q-id)
          'natural-earth'  else on Natural Earth's border of today, from 1886 and from the state's inception (since),
                           matched by Q-id or ISO3 (never by a Gleditsch and Ward code)
          'point'          else at Natural Earth's point of a small state (small-states.json), by the same rule
          null             VM cannot place it: reason 'before-ne', 'before-since' or 'no-shape'. */
export function placeState(place, year, { featuresFor = null, countries = null, small = null } = {}) {
  const q = place?.q || null, iso3 = place?.iso3 || null;
  if (featuresFor && q) {
    const r = featuresFor(q, year);
    if (r?.features?.length) return { how: 'cliopatria', features: r.features, at: null, reason: null };
  }
  const since = Number.isFinite(place?.since) ? place.since : null;
  if (year < NE_FROM) return { how: null, features: [], at: null, reason: 'before-ne' };
  if (since != null && year < since) return { how: null, features: [], at: null, reason: 'before-since' };
  const is = p => (q && p?.q === q) || (iso3 && p?.iso3 === iso3);
  const fs = (countries?.features || []).filter(f => f.geometry && is(f.properties));
  if (fs.length) return { how: 'natural-earth', features: fs, at: null, reason: null };
  const p = (small || []).find(is);
  if (p) return { how: 'point', features: [], at: p.at, reason: null };
  return { how: null, features: [], at: null, reason: 'no-shape' };
}
/** The states a by-state layer fills at a year: [{ q, v, t, a }] by Q-id order; v its class (conflict on territory: the
    highest intensity of its conflicts that year, 0 when it only fights abroad; political change: 1 a new head of
    government, 2 a new head of state, 3 both), t the conflict ids or term indexes, a the conflicts it fights abroad. */
export function stateValues(doc, year) {
  const Y = doc?.years?.[year];
  if (!Y) return [];
  const qs = [...new Set([...Object.keys(Y.t || {}), ...Object.keys(Y.a || {})])].sort((x, y) => +x.slice(1) - +y.slice(1));
  return qs.map(q => {
    const t = Y.t?.[q] || [], a = Y.a?.[q] || [];
    const v = doc.format === 'vm-terms/1'
      ? t.reduce((m, i) => m | (doc.terms[i]?.role === 'hos' ? 2 : 1), 0)
      : t.reduce((m, id) => Math.max(m, Y.c?.[id]?.[0] || 0), 0);
    return { q, v, t, a };
  });
}
/** The colour token (4 … 10 of --om-seq-*) of class k of n classes of a by-state layer: its classes are few, so they
    start darker than a ramp of values, and a state of the first class does not read as land with no value. */
export function stateTokenOf(k, n) {
  return 4 + Math.round((k * 6) / Math.max(1, n - 1));
}
/** The number of conflicts a year of a vm-territory/1 file holds: [{ y, n }] for every year from `from` to `to`. */
export function conflictCounts(doc) {
  const out = [];
  for (let y = doc?.from; y <= doc?.to; y++) out.push({ y, n: Object.keys(doc.years?.[y]?.c || {}).length });
  return out;
}
/** Whether a row passes a layer's filter ({ field, value }; a list field passes when it holds the value). */
export function passes(row, filter) {
  if (!filter?.field) return true;
  const v = row?.[filter.field];
  return Array.isArray(v) ? v.map(String).includes(String(filter.value)) : String(v ?? '') === String(filter.value);
}
/** The rows of a point layer drawn in the period [lo, year] (design 2.1 rule 4), through its filter. */
export function inPeriod(rows, lo, year, filter = null) {
  const from = Math.min(lo ?? year, year);
  return (rows || []).filter(r => r.sortYear != null && r.sortYear >= from && r.sortYear <= year && passes(r, filter));
}
/** A set with a layer's filter set (filter null: its filter cleared). */
export function setFilter(set, id, filter) {
  const next = copy(set);
  if (filter?.field && filter.value != null && filter.value !== '') next.filters[id] = { field: filter.field, value: String(filter.value) };
  else delete next.filters[id];
  return next;
}
/** The address of a module's page at a place and year (the four modules a layer opens).
      battlefield-history  battlefield/history/index.html#y=<y>&c=<ISO3, else the Gleditsch and Ward code as UCDP gives it>
      war-focus            battlefield/focus/index.html#war=<War Focus id>
      retrospective        https://hp-retrospective.pages.dev/#y=<y>&c=<its own key, found by ISO3>
      progress             science/progress/index.html#y=<y>&e=<event id>
      calendar             q/calendar.html?event=<the calendars' event key> (stage S5c) */
export function moduleLink(kind, { year, iso3 = null, gw = null, war = null, key = null, event = null } = {}) {
  const y = Number.isInteger(year) ? `y=${year}` : '';
  const join = (...p) => p.filter(Boolean).join('&');
  if (kind === 'battlefield-history') return `battlefield/history/index.html#${join(y, iso3 || gw ? `c=${encodeURIComponent(iso3 || gw)}` : '')}`;
  if (kind === 'war-focus') return war ? `battlefield/focus/index.html#war=${encodeURIComponent(String(war).replace(/^wf-/, ''))}` : null;
  if (kind === 'retrospective') return `https://hp-retrospective.pages.dev/#${join(y, key ? `c=${encodeURIComponent(key)}` : '')}`;
  if (kind === 'progress') return `science/progress/index.html#${join(y, event ? `e=${encodeURIComponent(event)}` : '')}`;
  if (kind === 'calendar') return `q/calendar.html${event ? `?event=${encodeURIComponent(event)}` : ''}`;
  return null;
}
/** The Political Retrospective's key for a state (retro-keys.json's keys, by ISO3; of two, the one of the same name). */
export function retroKey(keys, iso3, name = null) {
  const ks = (iso3 && keys?.[iso3]) || [];
  return (ks.find(k => name && k.n === name) || ks[0])?.k || null;
}

/** Web Mercator's latitude for a row of an image n rows tall over ±85.0511°: the grid is re-projected so MapLibre's
    linear image quad puts each cell where it is. */
export function mercatorLat(y, n) {
  const t = Math.PI * (1 - 2 * (y + 0.5) / n);
  return (Math.atan(Math.sinh(t)) * 180) / Math.PI;
}
