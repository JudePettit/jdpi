/* Retrospective Battlefield (PRP · Retrospective Geopolitics) — every war and armed conflict, year by year, 1926–2025.
   Borders: CShapes 2.0. Conflicts: UCDP/PRIO ACD (1946–2025) and Correlates of War (1926–1945).
   Views (tabs): the map and a table of the conflicts; both follow the timeline (design/prp-period.js), one year or a
   period of years: the start handle rests on the end, so a plain year is that year; pulled back, it opens a period,
   and every conflict active in at least one of its years is shown, at its peak level then.
   Every state of the year is drawn (design/PRP-STYLE.md §6): as its CShapes shape, or, for the 22 CShapes has no border
   for, as the map kit's dot (design/prp-mapkit.js) from its first day as a state. A country with no conflict in the
   year or period says so in one sentence naming the record: UCDP/PRIO from 1946, the Correlates of War before.
   URL: #y=<year, the end of the period>[&f=<first year of a period>]&c=<gw, or the ISO3 of a dot with none>&w=<war>&v=table */
import { displayName } from './names.mjs';

const W = 1000, H = 600, DOT_R = 3.2;
// from/year: the first and last year shown (the same year unless a period is set). dots: the kit's dots for CShapes,
// each with its Gleditsch–Ward number and first day from wars.json (`key`: the number, or the ISO3 where it has none).
const state = { year: 2025, from: 2025, selected: null, war: null, data: null, features: [], dots: [], focus: {}, view: 'map' };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n).toLocaleString('en-GB');
// Map fills are tokens (styles.css), so the map follows the light or dark theme without a redraw.
const FILL = { war: 'var(--c-war)', minor: 'var(--c-minor)', abroad: 'var(--c-abroad)', peace: 'var(--c-peace)' };
const motion = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250);

// War Focus is a sibling submodule: inside the PRP shell its links open it there (deep link); on its own, directly.
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
const SHELL = new URL('../../', location.href).href;
const sibling = rel => (embedded ? `${SHELL}#/rs/war-focus?at=${encodeURIComponent(new URL(rel, location.href).href)}` : rel);
const siblingTarget = embedded ? '_top' : '_self';

let svg, g, projection, path, zoom, focusView = null;
const focusHits = new Set(); // states (GW codes) Documentary mode is discussing

/* ---------------------------------------------------------------- data helpers */
const dateFor = y => `${y}-07-01`;
const activeOn = date => state.features.filter(f => f.properties.s <= date && date <= f.properties.e);
const levelIn = (w, y) => w.years.find(([yy]) => yy === y)?.[1] || 0;
// Where a war was fought: the same places every year, or the year's own for a war that moved (World War II, a
// government fighting rebels abroad).
const locIn = (w, y) => w.locYears?.[y] || w.loc;
// The period [a, b] (a === b for one year): the years a war was active in it, its peak level there, and the conflicts
// active in at least one of its years, the most intense first, then those active longest in it (World War II leads
// 1939–1945), then by name.
const yearsIn = (w, a, b) => w.years.filter(([y]) => y >= a && y <= b);
const peakIn = (w, a, b) => yearsIn(w, a, b).reduce((m, [, l]) => Math.max(m, l), 0);
const warsInPeriod = (a, b) => state.data.wars.filter(w => peakIn(w, a, b))
  .sort((x, y) => peakIn(y, a, b) - peakIn(x, a, b) || yearsIn(y, a, b).length - yearsIn(x, a, b).length || x.name.localeCompare(y.name));
const warsIn = y => warsInPeriod(y, y);
const onSoil = (w, gw, a, b) => yearsIn(w, a, b).some(([y]) => locIn(w, y).includes(gw));
// The states taking part in a year: a UCDP conflict's parties that year (Tonga in Iraq in 2004, 2007 and 2008 only),
// a Correlates of War war's for all its years.
const statesIn = (w, y) => (w.statesYears ? w.statesYears[y] || [] : w.states);
const partyIn = (w, gw, a, b) => yearsIn(w, a, b).some(([y]) => statesIn(w, y).includes(gw));
// A dot is drawn from its first day as a state (null: before the page's first year), on the map's day of the year.
const dotOn = (d, date) => d.from == null || d.from <= date;
const dotsOn = date => state.dots.filter(d => dotOn(d, date));
// The first year whose 1 July it is drawn on.
const firstDrawn = d => { if (d.from == null) return state.data.firstYear; const y = +d.from.slice(0, 4); return d.from <= dateFor(y) ? y : y + 1; };
const dotOf = key => state.dots.find(d => d.key === key);
const single = () => state.from === state.year;
const periodText = () => (single() ? String(state.year) : `${state.from}–${state.year}`);
// "1939–45 · 7 yrs": the years a war was active in the period.
function activeSpan(w, a, b) {
  const ys = yearsIn(w, a, b).map(([y]) => y);
  if (!ys.length) return '';
  const first = ys[0], last = ys.at(-1), end = String(last).slice(0, 2) === String(first).slice(0, 2) ? String(last).slice(2) : last;
  return `${first === last ? first : `${first}–${end}`} · ${ys.length} yr${ys.length > 1 ? 's' : ''}`;
}
const nameOf = (gw, y) => {
  const f = activeOn(dateFor(y)).find(x => x.properties.gw === gw) || state.features.find(x => x.properties.gw === gw);
  return f ? displayName(gw, f.properties.name, dateFor(y)) : dotOf(gw)?.name || `State ${gw}`;
};
// What a war's place is called in year y: the war's own name for a shape that held another place that year
// ("Georgia (then in the Soviet Union)"), else the name the shape had that year.
const placeName = (w, gw, y) => w.placeNames?.[y]?.[gw] ?? nameOf(gw, y);
// The places a war was fought in during the period, each by its name in the year it was fought there, not by the
// period's last year (the Soviet Union for 1946–48, not Russia, in a table of 1946–2025); `where` names places the map
// has no shape for.
const placesIn = (w, a, b) => w.where || [...new Set(yearsIn(w, a, b).flatMap(([y]) => locIn(w, y).map(gw => placeName(w, gw, y))))];
// "Costa Rica: no armed conflict of 25 or more battle deaths recorded by UCDP/PRIO in 1990." (design/prp-mapkit.js):
// from 1946 UCDP/PRIO's record, before it the Correlates of War's, and a period across 1946 names both.
const NO_CONFLICT = { what: 'armed conflict of 25 or more battle deaths', source: 'UCDP/PRIO' };
const NO_WAR = { what: 'war of 1,000 or more battle deaths', source: 'the Correlates of War' };
const yearsText = (a, b) => (a === b ? `in ${a}` : `from ${a} to ${b}`);
function noConflict(name, a, b) {
  const u = state.data.ucdpFrom, reason = PRPMapkit.REASONS.NOTHING_RECORDED;
  if (b < u) return PRPMapkit.sentence({ name, reason, ...NO_WAR, when: yearsText(a, b) });
  if (a >= u) return PRPMapkit.sentence({ name, reason, ...NO_CONFLICT, when: yearsText(a, b) });
  return PRPMapkit.sentence({ name, reason, ...NO_WAR, when: yearsText(a, u - 1), and: { ...NO_CONFLICT, when: yearsText(u, b) } });
}
const notYet = (name, y) => PRPMapkit.sentence({ name, reason: PRPMapkit.REASONS.NOT_INDEPENDENT, when: `in ${y}` });
const NO_BORDER = 'Not drawn as a shape: CShapes 2.0 has no border for it.';
const DOT_FROM = { retrospective: 'the Political Retrospective’s leader lists', wikidata: 'Wikidata' };
const fmtFrom = s => (s.length === 4 ? s : new Date(`${s}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }));
// Per-country status over the period: the most intense conflict on its territory in any of its years (war, then a
// minor conflict), else fighting only abroad. For one year this is that year's status.
function statusMap(a, b) {
  const m = new Map(), rank = { war: 3, minor: 2, abroad: 1 };
  const put = (gw, v) => { if ((rank[m.get(gw)] || 0) < rank[v]) m.set(gw, v); };
  for (const w of warsInPeriod(a, b)) for (const [y, l] of yearsIn(w, a, b)) {
    for (const gw of locIn(w, y)) put(gw, l === 2 ? 'war' : 'minor');
    for (const gw of statesIn(w, y)) put(gw, 'abroad');
  }
  return m;
}
const wikiUrl = w => w.wiki ? `https://en.wikipedia.org/wiki/${encodeURIComponent(w.wiki.replace(/ /g, '_'))}`
  : `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(warQuery(w))}`;
function warQuery(w) {
  if (w.src === 'cow') return `${w.name} war ${w.span.slice(0, 4)}`;
  const b = w.sideB.filter(s => !/^Government of/.test(s)).slice(0, 2).join(' ');
  return `${w.name.split(':')[0]} ${b || 'war'} ${w.years[0][0]}`;
}
const span = w => w.src === 'cow' ? w.span : `${w.years[0][0]}–${w.years.at(-1)[0] >= state.data.lastYear ? 'ongoing' : w.years.at(-1)[0]}`;
// The two datasets' thresholds for a conflict, in battle deaths: a war (both), and an armed conflict (UCDP/PRIO only).
const WAR_DEATHS = 1000, CONFLICT_DEATHS = 25;
const levelLabel = l => l === 2 ? 'War · 1,000+ deaths this year' : 'Minor conflict · 25–999 deaths this year';
const LEVEL_WORD = ['', 'Minor', 'War'];

/* ---------------------------------------------------------------- map */
// A selected, outlined or focused dot is drawn larger, so its fill still shows inside the thicker ring.
const DOT_RING = 1.6, STATUS_RANK = { abroad: 1, minor: 2, war: 3 };
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
  // Fitted to the shapes and the dots, so Tonga and Samoa stay inside the frame on a phone, where the map has no margin.
  const points = state.dots.map(d => ({ type: 'Feature', geometry: { type: 'Point', coordinates: d.lonlat } }));
  projection = d3.geoNaturalEarth1().fitExtent([[10, 10], [W - 10, H - 10]], { type: 'FeatureCollection', features: [...activeOn('2020-01-01'), ...points] });
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
// When the reader talks about wars, the states they were fought in are outlined in the module accent and the map
// eases to fit them all; ⟲ or the end of the reading brings back the whole world.
// A shape's state, or a dot's (its key: the Gleditsch–Ward number, or the ISO3 where it has none).
const keyOf = d => (d.properties ? d.properties.gw : d.key);
function paintFocus() {
  if (!g) return;
  g.selectAll('.shape').classed('prp-focus-hit', d => focusHits.has(keyOf(d)));
  g.selectAll('path.shape.prp-focus-hit').raise();
  g.selectAll('circle.dot').raise();
  raiseDots();
}
function clearFocus() { focusHits.clear(); paintFocus(); }
window.PRPFocus?.listen({
  focus(t) {
    if (!state.data || !focusView) return;
    const live = activeOn(dateFor(state.year)), gws = new Set();
    const r = PRPFocus.resolve(t, {
      country: id => {
        const gw = /^gw:\d+$/.test(id) ? +id.slice(3) : PRPFocus.gwOf(id), fs = live.filter(f => f.properties.gw === gw);
        if (fs.length) { gws.add(gw); return fs; }
        // A state drawn as a dot: its point, found by its ISO3 as well as its number (PRPFocus's table has no number for
        // eleven of them, and the Holy See has none).
        const d = dotsOn(dateFor(state.year)).find(x => x.iso3 === id || (gw != null && x.gw === gw));
        if (d) { gws.add(d.key); return [...d.lonlat]; }
        return null;
      },
      minSpan: 4,
    });
    if (!r.box) return;
    focusHits.clear(); gws.forEach(gw => focusHits.add(gw)); paintFocus();
    focusView.fit(r.box, r.padding);
  },
  reset() { clearFocus(); focusView?.reset(); },
});

function renderMap() {
  const a = state.from, b = state.year, date = dateFor(b), status = statusMap(a, b), tip = $('#tooltip'), live = activeOn(date);
  // The selected war's places and parties in the period's years. When it was not active in the period only its places
  // (as of the end year) are outlined: a party of other years is not a party of the years shown (Tonga in Iraq, 2003).
  const wys = state.war ? yearsIn(state.war, a, b).map(([y]) => y) : [];
  const involved = new Set(state.war ? (wys.length ? wys.flatMap(y => [...locIn(state.war, y), ...statesIn(state.war, y)]) : locIn(state.war, b)) : []);
  // Pointing at a state: the conflicts on its territory or with it as a party in the year or period, or one sentence.
  const hover = (ev, key, name) => {
    const box = $('.map-wrap').getBoundingClientRect();
    const ws = warsInPeriod(a, b).filter(w => onSoil(w, key, a, b) || partyIn(w, key, a, b));
    tip.classList.toggle('is-sentence', !ws.length);
    tip.innerHTML = ws.length ? `<strong>${esc(name)}</strong>${a === b ? '' : `<span class="tip-when">${a}–${b}</span>`}${ws.slice(0, 3).map(w => esc(w.name)).join('<br>') + (ws.length > 3 ? `<br>+${ws.length - 3} more` : '')}`
      : `<strong>${esc(noConflict(name, a, b))}</strong>`;
    tip.hidden = false;
    tip.style.left = `${Math.max(4, Math.min(ev.clientX - box.left + 14, box.width - tip.offsetWidth - 8))}px`;
    tip.style.top = `${Math.min(ev.clientY - box.top + 14, box.height - tip.offsetHeight - 8)}px`;
  };
  const classOf = (key, extra = '') => `shape active${extra}${key === state.selected ? ' selected' : ''}${involved.has(key) ? ' involved' : ''}${focusHits.has(key) ? ' prp-focus-hit' : ''}`;
  g.selectAll('path.shape')
    .data(live, d => `${d.properties.gw}|${d.properties.s}`)
    .join('path')
    .attr('d', path)
    .attr('class', d => classOf(d.properties.gw))
    .attr('fill', d => FILL[status.get(d.properties.gw) || 'peace'])
    .on('mousemove', (ev, d) => hover(ev, d.properties.gw, displayName(d.properties.gw, d.properties.name, date)))
    .on('mouseleave', () => { tip.hidden = true; })
    .on('click', (ev, d) => select(d.properties.gw));
  // The selected or involved countries draw last, so their outlines are not hidden under their neighbours'.
  g.selectAll('path.shape.involved, path.shape.selected').raise();
  g.selectAll('path.shape.prp-focus-hit').raise();
  // The states CShapes has no border for, as dots over the shapes, from their first day as a state. Where island dots
  // touch, a dot at war lies over one at peace, and the selected, outlined and focused ones over all.
  g.selectAll('circle.dot')
    .data(dotsOn(date), d => d.iso3)
    .join('circle')
    .attr('class', d => classOf(d.key, ' dot'))
    .attr('data-iso3', d => d.iso3)
    .attr('cx', d => projection(d.lonlat)[0])
    .attr('cy', d => projection(d.lonlat)[1])
    .attr('fill', d => FILL[status.get(d.key) || 'peace'])
    .on('mousemove', (ev, d) => hover(ev, d.key, d.name))
    .on('mouseleave', () => { tip.hidden = true; })
    .on('click', (ev, d) => select(d.key))
    .sort((p, q) => (STATUS_RANK[status.get(p.key)] || 0) - (STATUS_RANK[status.get(q.key)] || 0))
    .raise();
  raiseDots();
  const outlined = state.war ? `; countries in ${state.war.name} are outlined` : '';
  if (a === b) { $('#caption').textContent = `Countries on the borders of ${b}, shaded by the most intense armed conflict ${state.war ? 'on their territory' : 'fought on their territory'}${outlined}.`; return; }
  // A period is drawn on its last year's borders; states of the period that had gone by then are listed, not drawn.
  const drawn = new Set(live.map(f => f.properties.gw)), start = `${a}-01-01`;
  const gone = [...status.keys()].filter(gw => !drawn.has(gw) && state.features.some(f => f.properties.gw === gw && f.properties.s <= date && f.properties.e >= start)).length;
  $('#caption').textContent = `Countries on the borders of ${b}, shaded by the most intense armed conflict on their territory in any year from ${a} to ${b}${outlined}.${gone ? ` ${gone} state${gone > 1 ? 's' : ''} of the period that had gone by ${b} ${gone > 1 ? 'are' : 'is'} counted in the lists but not drawn.` : ''}`;
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
  return `<div class="war${state.war === w ? ' sel' : ''}" data-level="${l}" data-id="${w.id}" role="button" tabindex="0"><div class="who"><span>${esc(w.name)}</span>${l ? `<span class="lvl l${l}">${LEVEL_WORD[l]} · ${a === b ? b : activeSpan(w, a, b)}</span>` : ''}</div><div class="meta">${esc(w.type)} · ${span(w)}${w.deaths ? ` · ${num(w.deaths)} battle deaths in total` : ''}</div></div>`;
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

function warDetail(w) {
  const a = state.from, y = state.year, l = peakIn(w, a, y), ys = yearsIn(w, a, y);
  const activeYears = w.years.length;
  const warYears = w.years.filter(([, x]) => x === 2).length;
  // The war's own places (`loc`): a shape it borrowed for a year ("Georgia (then in the Soviet Union)") is left out, so
  // no place is named twice.
  const places = w.where || [...new Set(w.loc.map(gw => nameOf(gw, y)))];
  const intro = w.src === 'cow'
    ? `${esc(w.name)} was ${/^[aeiou]/i.test(w.type) ? 'an' : 'a'} ${esc(w.type.toLowerCase())} fought ${w.span.replace('–', ' to ')}${w.deaths ? `, with about ${num(w.deaths)} battle deaths according to the Correlates of War project` : ''}.`
    : `UCDP records this ${esc(w.type.toLowerCase())} over ${esc(w.aim)}${places.length ? ` in ${esc(places.join(', '))}` : ''}, active in ${activeYears} year${activeYears > 1 ? 's' : ''} between ${w.years[0][0]} and ${w.years.at(-1)[0]}${warYears ? `, ${warYears} of them at war level (1,000+ battle deaths)` : ''}.`;
  const years = y - a + 1, atWar = ys.filter(([, x]) => x === 2).length;
  const shown = a === y
    ? (l ? `<p><span class="tag ${l === 2 ? 'war-level' : 'minor-level'}">${y}</span>${levelLabel(l)}</p>` : `<p class="empty">Not active in ${y}.</p>`)
    : (l ? `<p><span class="tag ${l === 2 ? 'war-level' : 'minor-level'}">${a}–${y}</span>Active in ${ys.length} of the ${years} years ${a}–${y}${atWar ? `, ${atWar} at war level (1,000+ battle deaths)` : ', none at war level'}.</p>` : `<p class="empty">Not active in ${a}–${y}.</p>`);
  const inP = yy => yy >= a && yy <= y;
  return `<button class="close" id="close-war" aria-label="Back to the ${a === y ? 'year' : 'period'}">×</button>
    <h2>${esc(w.name)}</h2><p class="sub">${esc(w.type)} · ${span(w)}</p>
    <p>${intro}</p>
    ${shown}
    <div class="sides"><b>Side A</b>${seeMoreText(w.sideA, 8, `${w.name} · side A`)}<b>Side B</b>${seeMoreText(w.sideB, 8, `${w.name} · side B`)}</div>
    ${w.sideNote ? `<p class="note side-note">${esc(w.sideNote)}</p>` : ''}
    <a class="btn" href="${wikiUrl(w)}" target="_blank" rel="noreferrer">${w.wiki ? 'Wikipedia article ↗' : 'Search Wikipedia ↗'}</a>
    ${focusLink(w)}
    ${w.src === 'ucdp' ? `<h3>Year by year <span class="count">bold red = war level${a === y ? '' : `; underlined = ${a}–${y}`}</span></h3><p class="years">${seeMore(w.years.map(([yy, x]) => `<span class="l${x}${a !== y && inP(yy) ? ' in' : ''}">${yy}</span> `), 24, `${w.name} · active years`)}</p>` : ''}`;
}

function renderPanel() {
  const a = state.from, y = state.year, panel = $('#panel'), when = periodText();
  popouts.clear();
  let html;
  if (state.war) html = warDetail(state.war);
  else if (state.selected) {
    const gw = state.selected, list = warsInPeriod(a, y), dot = dotOf(gw);
    const here = list.filter(w => onSoil(w, gw, a, y)), abroad = list.filter(w => !onSoil(w, gw, a, y) && partyIn(w, gw, a, y));
    // Every conflict this state took part in or hosted, across the whole century, oldest first. On its territory, by
    // the same rule as the year's list: a year the war was drawn on its shape.
    const soilEver = w => onSoil(w, gw, state.data.firstYear, state.data.lastYear);
    const ever = state.data.wars.filter(w => soilEver(w) || w.states.includes(gw)).sort((p, q) => p.years[0][0] - q.years[0][0]);
    const soil = ever.filter(soilEver), away = ever.filter(w => !soilEver(w));
    const cards = l => l.map(w => warCard(w));
    const byDecade = l => [...new Set(l.map(w => Math.floor(w.years[0][0] / 10) * 10))]
      .map(d => `<h3>${d}s</h3>${l.filter(w => Math.floor(w.years[0][0] / 10) * 10 === d).map(w => warCard(w)).join('')}`).join('');
    const cname = nameOf(gw, y), heading = a === y ? ` in ${y}` : `, ${a}–${y}`;
    // A state drawn on the map at the end of the year or period with no conflict there or abroad: the sentence naming
    // the record (the tooltip's); a dot before its first day as a state: that it was not yet one.
    const drawnNow = dot ? dotOn(dot, dateFor(y)) : activeOn(dateFor(y)).some(f => f.properties.gw === gw);
    const sub = here.length ? `${here.length} conflict${here.length > 1 ? 's' : ''} on its territory in ${when}${abroad.length ? ` · fighting in ${abroad.length} abroad` : ''}`
      : abroad.length ? `No conflict on its territory in ${when} · fighting in ${abroad.length} abroad`
        : dot && !drawnNow ? notYet(cname, y) : drawnNow ? noConflict(cname, a, y) : `No conflict on its territory in ${when}`;
    const dotNote = dot ? `<p class="note dot-note">${NO_BORDER} ${dot.from ? `A state from ${fmtFrom(dot.from)}` : `A state before ${state.data.firstYear}`} (${DOT_FROM[dot.src]}).</p>` : '';
    html = `<button class="close" id="close" aria-label="Close">×</button><h2>${esc(cname)}</h2>
      <p class="sub">${esc(sub)}</p>${dotNote}
      ${here.length ? `<h3>On its territory${heading}</h3>${seeMore(cards(here), 6, `${cname} · conflicts on its territory in ${when}`)}` : ''}
      ${abroad.length ? `<h3>Fighting abroad${heading}</h3>${seeMore(cards(abroad), 6, `${cname} · fighting abroad in ${when}`)}` : ''}
      <h3>All conflicts ${state.data.firstYear}–${state.data.lastYear} <span class="count">${ever.length} · ${soil.length} on its territory · ${away.length} abroad</span></h3>
      ${ever.length ? seeMore(cards(ever), 6, `${cname} · all conflicts ${state.data.firstYear}–${state.data.lastYear}`,
        `<p class="sub">${ever.length} conflicts: ${soil.length} fought on its territory, ${away.length} fought abroad. Before ${state.data.ucdpFrom} only wars with 1,000+ battle deaths are recorded.</p>${byDecade(ever)}`) : '<p class="empty">None recorded.</p>'}`;
  } else {
    const list = warsInPeriod(a, y), wars = list.filter(w => peakIn(w, a, y) === 2).length;
    html = `<h2>${when}</h2><p class="sub">${list.length} armed conflict${list.length === 1 ? '' : 's'}, ${wars} at war level${a === y ? '' : ' at some point'}</p>
      ${list.length ? seeMore(list.map(w => warCard(w)), 15, `All armed conflicts in ${when}`) : '<p class="empty">No conflicts recorded.</p>'}
      <p class="note">${a === y ? 'Click a country or a war for details. Press ▶ or drag the slider to move through the years; drag its hollow start handle back to cover a period of years.' : `Every armed conflict active in at least one year from ${a} to ${y}, at its peak level then. Click a country or a war for details; bring the hollow start handle back onto the end for a single year.`}</p>`;
  }
  // Before 1946 the Correlates of War records wars only; a period that spans 1946 draws on both datasets.
  const { cow, ucdp } = state.data.sources, from = state.data.ucdpFrom;
  const src = y < from ? `${cow}. Before ${from} only wars with 1,000+ battle deaths are recorded.` : a < from ? `${cow}, to ${from - 1}; ${ucdp}, from ${from}. Before ${from} only wars with 1,000+ battle deaths are recorded.` : `${ucdp}.`;
  // The citation's link is live (the Correlates of War asks for its citation, S0 16 November 2026).
  panel.innerHTML = html + `<p class="src-note"><b>Source:</b> ${esc(src).replace(/https:\/\/[^\s()<]+[^\s()<.]/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`)} Borders: CShapes 2.0.</p>`;
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
  $('#k-wars').textContent = list.filter(w => peakIn(w, a, y) === 2).length;
}

/* ---------------------------------------------------------------- table view */
// The conflicts of the year or period as a table: the list view of what the map shows.
function renderTable() {
  if (state.view !== 'table' || !state.data) return;
  const a = state.from, y = state.year, list = warsInPeriod(a, y);
  $('#table-title').textContent = `Armed conflicts ${a === y ? `in ${y}` : `${a}–${y}`} · ${list.length}`;
  $('#th-year').textContent = a === y ? `In ${y}` : `${a}–${y}`;
  $('#table-rows').innerHTML = list.map(w => {
    const l = peakIn(w, a, y), places = placesIn(w, a, y);
    return `<tr data-id="${w.id}"${state.war === w ? ' class="sel"' : ''}><td><button type="button" class="rowbtn">${esc(w.name)}</button></td><td class="mono">${esc(w.type)}</td>
      <td><span class="lvl l${l}">${l === 2 ? 'War' : 'Minor'}</span>${a === y ? '' : `<span class="cell-sub">${activeSpan(w, a, y)}</span>`}</td><td class="mono">${span(w)}</td><td class="num">${w.deaths ? num(w.deaths) : '–'}</td>
      <td class="wrap">${esc(places.slice(0, 4).join(', '))}${places.length > 4 ? ` +${places.length - 4}` : ''}</td></tr>`;
  }).join('') || `<tr><td colspan="6" class="empty">No conflicts recorded in ${periodText()}.</td></tr>`;
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
function render() { renderMap(); renderPanel(); renderKpis(); renderTable(); }
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
  render();
  if (push) writeHash();
}
function setupTimeline() {
  const { firstYear: a, lastYear: b } = state.data, years = Array.from({ length: b - a + 1 }, (_, k) => a + k);
  // Decade ticks from 1930; every other one drops out on narrow screens.
  const ticks = years.filter(y => (y - a - 4) % 10 === 0).map((y, k) => ({ at: y, text: String(y), kind: k % 2 ? 'minor' : 'key' }));
  // Above the track: how many conflicts were under way each year.
  const counts = years.map(y => state.data.wars.filter(w => levelIn(w, y)).length);
  period.update({ stops: years, ticks, strip: counts, from: null, to: b });
  // Under the timeline, what each dataset counts, so the jump in the strip at UCDP's first year reads for what it is: the
  // Correlates of War lists only wars of 1,000 or more battle deaths, UCDP/PRIO every armed conflict of 25 or more in a
  // year (the Method below; the levels are levelLabel's). The years are the data's own.
  const u = state.data.ucdpFrom;
  $('#thresholds').textContent = `What is counted: ${a}–${u - 1}, wars of ${num(WAR_DEATHS)}+ battle deaths (Correlates of War); ${u}–${b}, armed conflicts of ${num(CONFLICT_DEATHS)}+ battle deaths in a year (UCDP/PRIO). Smaller conflicts before ${u} are missing.`;
}
function select(gw) { state.selected = gw; state.war = null; renderMap(); renderPanel(); renderTable(); writeHash(); }
function selectWar(id) {
  state.war = state.data.wars.find(w => w.id === id) || null;
  // A war not active in the year or period: its first year, as one year.
  if (state.war && !peakIn(state.war, state.from, state.year)) setPeriod(null, state.war.years[0][0], { push: false });
  renderMap(); renderPanel(); renderTable(); writeHash();
}
function writeHash() {
  const f = PRPPeriod.rules.startParam(period.get());
  const m = PRPPeriod.rules.movementParam(period.movement()); // MP-12: the movement, written only away from Independent
  const h = `#y=${state.year}${f != null ? `&f=${f}` : ''}${state.selected ? `&c=${state.selected}` : ''}${state.war ? `&w=${state.war.id}` : ''}${state.view === 'table' ? '&v=table' : ''}${m ? `&${PRPPeriod.MOVE_PARAM}=${m}` : ''}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}
// MP-03 (15 Nov 2026): on a phone the opening's two handles sit at least about 24 px apart at the track's drawn
// width, the latest year still at the right handle; on wider screens they open one year apart, as before.
function openSteps() {
  if (!matchMedia('(max-width: 767px)').matches) return 1;
  // The track, not #year: the input's box takes in the thumb, while the track (inset half a thumb at each end) is
  // exactly the distance the handles travel, whatever sits beside it (the movement buttons, MP-12).
  const w = document.querySelector('#timeline .prp-period-track')?.getBoundingClientRect().width || $('#timeline').getBoundingClientRect().width;
  return PRPPeriod.rules.openSteps(period.get().stops.length, w);
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1)), y = +p.get('y') || state.data.lastYear;
  const years = period.get().stops;
  // An f at or after the year, or unreadable, is a single year; an address with no year at all opens on the last two.
  // c: a Gleditsch–Ward number, or the ISO3 of a dot that has none (the Holy See).
  const c = p.get('c') || '', key = /^\d+$/.test(c) ? +c || null : /^[A-Z]{3}$/.test(c) && dotOf(c) ? c : null;
  return { y, f: PRPPeriod.rules.readStart(years, p.get('f'), y, 'end', !p.get('y') && !p.get('f'), openSteps()), c: key, w: p.get('w'), v: p.get('v') === 'table' ? 'table' : 'map',
    m: PRPPeriod.rules.readMovement(p.get(PRPPeriod.MOVE_PARAM)) };
}

function setupSearch() {
  const input = $('#search'), list = $('#search-results');
  const index = state.data.wars.map(w => ({ label: w.name, sub: `${w.type} · ${span(w)}`, key: `${w.name} ${w.sideA.join(' ')} ${w.sideB.join(' ')}`.toLowerCase(), war: w.id }));
  const seenGw = new Set();
  for (const f of state.features) {
    const k = `${f.properties.gw}|${f.properties.name}`;
    if (seenGw.has(k)) continue; seenGw.add(k);
    index.push({ label: f.properties.name, sub: `Country · ${f.properties.s.slice(0, 4)}–${f.properties.e.slice(0, 4)}`, key: f.properties.name.toLowerCase(), gw: f.properties.gw, year: Math.max(+f.properties.s.slice(0, 4), state.data.firstYear) });
  }
  // The states drawn as dots, opening in the first year they are drawn when the year shown is earlier.
  // VM's list of countries calls the Vatican the Holy See.
  const ALSO = { VAT: 'Holy See' };
  for (const d of state.dots) index.push({ label: d.name, sub: `Country · ${d.from ? `from ${d.from.slice(0, 4)}` : `before ${state.data.firstYear}`} · drawn as a dot`, key: `${d.name} ${d.iso3} ${ALSO[d.iso3] || ''}`.toLowerCase(), gw: d.key, year: firstDrawn(d) });
  let results = [];
  const choose = r => {
    input.value = ''; list.hidden = true;
    // A country that did not yet exist at the end of the year or period opens in its first year.
    if (r.war) selectWar(r.war); else { if (r.year > state.year || +r.year < state.data.firstYear) setPeriod(null, r.year, { push: false }); select(r.gw); }
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
// A year as told, and where: the states the named wars were fought in (or, when none is named, every conflict's).
function yearStory(y) {
  const all = warsIn(y), wars = all.filter(w => levelIn(w, y) === 2), fresh = all.filter(w => warNew(w, y) && levelIn(w, y) === 2);
  const ended = state.data.wars.filter(w => w.years.at(-1)[0] === y - 1 && levelIn(w, y - 1) === 2 && y - 1 < state.data.lastYear);
  const parts = [`${y}.`];
  parts.push(all.length ? `${all.length} armed conflict${all.length > 1 ? 's are' : ' is'} under way, ${wars.length ? `${wars.length} of ${all.length > 1 ? 'them' : 'it'} at the level of war, with a thousand or more battle deaths` : 'none of them at the level of war'}.` : 'The world records no armed conflict this year.');
  const big = (fresh.length ? fresh : wars).slice().sort((a, b) => (b.deaths || 0) - (a.deaths || 0)).slice(0, 3);
  if (fresh.length) parts.push(`New this year: ${big.map(w => w.name.replace(/:/, ',')).join('; ')}.`);
  else if (big.length) parts.push(`The largest: ${big.map(w => w.name.replace(/:/, ',')).join('; ')}.`);
  if (ended.length) parts.push(`Coming to an end: ${ended.slice(0, 2).map(w => w.name.replace(/:/, ',')).join('; ')}.`);
  const focusWar = big.find(w => state.focus[w.id]);
  if (focusWar) parts.push(`War Focus follows ${state.focus[focusWar.id][0].name} month by month.`);
  // The places of the wars named (those ending, as of their last year), or of every conflict when none is named.
  const named = [...big.map(w => locIn(w, y)), ...ended.slice(0, 2).map(w => locIn(w, y - 1))];
  const gws = [...new Set((named.length ? named : all.map(w => locIn(w, y))).flat())];
  return { text: parts.join(' '), focus: gws.length ? { countries: gws.map(gw => `gw:${gw}`), padding: 36 } : { reset: true } };
}
window.jdpiDocumentary = {
  get title() { return `Retrospective Battlefield · ${periodText()}`; },
  async *story() {
    period.stop();
    if (state.view !== 'map') setView('map');
    yield { text: `A century of war, from ${state.data.firstYear} to ${state.data.lastYear}, drawn on the map as the world stood each year. We begin in ${state.year}.`, el: $('#year-big'), focus: { reset: true } };
    // Year by year, one year at a time, whatever period was set.
    for (let y = state.year; y <= state.data.lastYear; y++) {
      setPeriod(null, y, { push: false });
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
    const [topo, data, focus] = await Promise.all([
      fetch('data/borders.topo.json').then(r => r.json()),
      fetch('data/wars.json').then(r => r.json()),
      fetch('../focus/data/index.json').then(r => r.json()).catch(() => ({ wars: [] })),
    ]);
    state.data = data;
    for (const f of focus.wars) if (f.bf) (state.focus[f.bf] ||= []).push(f);
    state.features = topojson.feature(topo, topo.objects.borders).features;
    // The kit's dots for the states CShapes 2.0 has no border for, with wars.json's number and first day for each.
    state.dots = PRPMapkit.dots('cshapes').filter(d => data.dots?.[d.iso3]).map(d => ({ iso3: d.iso3, name: d.name, lonlat: [...d.lonlat], ...data.dots[d.iso3], key: data.dots[d.iso3].gw ?? d.iso3 }));
    $('.legend ul').insertAdjacentHTML('beforeend', '<li><span class="swatch dot-swatch"></span>A state with no border in CShapes 2.0, as a dot</li>');
    $('.map-wrap').classList.add('has-dots'); // styles.css: the key under the map, clear of the dots
    $('#status').innerHTML = `<span><b>${data.wars.length}</b> wars and armed conflicts</span><span>Coverage <b>${data.firstYear}–${data.lastYear}</b></span><span>Sources <b>UCDP/PRIO · Correlates of War · CShapes 2.0</b></span>${data.generated ? `<span>Built <b>${esc(fmtDay(data.generated))}</b></span>` : ''}`;
    drawMap(); setupTimeline(); setupSearch();
    const { y, f, c, w, v, m } = readHash();
    state.selected = c;
    setView(v, { push: false });
    period.setMovement(m, { silent: true }); // the address's movement first, so its period is placed by that rule
    setPeriod(f, y, { push: false });
    if (w) selectWar(w);
    window.addEventListener('hashchange', () => {
      const h = readHash();
      if (h.v !== state.view) setView(h.v, { push: false });
      const moved = h.m !== period.movement();
      if (moved) period.setMovement(h.m, { silent: true });
      if (moved || h.y !== state.year || (h.f ?? h.y) !== state.from) setPeriod(h.f, h.y, { push: false });
      if (h.c !== state.selected) select(h.c);
      if ((h.w || null) !== (state.war?.id || null)) selectWar(h.w);
    });
  } catch (err) {
    console.error(err);
    $('#status').textContent = 'Could not load conflict history.';
  }
})();
