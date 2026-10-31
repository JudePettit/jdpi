/* Retrospective Battlefield (PRP · Retrospective Geopolitics) — every war and armed conflict, year by year, 1926–2025.
   Borders: CShapes 2.0. Conflicts: UCDP/PRIO ACD (1946–2025) and Correlates of War (1926–1945).
   Views (tabs): the map and a table of the conflicts; both follow the timeline (design/prp-period.js), one year or a
   period of years: the start handle rests on the end, so a plain year is that year; pulled back, it opens a period,
   and every conflict active in at least one of its years is shown, at its peak level then.
   URL: #y=<year, the end of the period>[&f=<first year of a period>]&c=<gw>&w=<war>&v=table */
import { displayName } from './names.mjs';

const W = 1000, H = 600;
// from/year: the first and last year shown (the same year unless a period is set).
const state = { year: 2025, from: 2025, selected: null, war: null, data: null, features: [], focus: {}, view: 'map' };
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
  return f ? displayName(gw, f.properties.name, dateFor(y)) : `State ${gw}`;
};
// The places a war was fought in during the period, by name (`where` names places the map has no shape for).
const placesIn = (w, a, b) => w.where || [...new Set(yearsIn(w, a, b).flatMap(([y]) => locIn(w, y)).map(gw => nameOf(gw, b)))];
// Per-country status over the period: the most intense conflict on its territory in any of its years (war, then a
// minor conflict), else fighting only abroad. For one year this is that year's status.
function statusMap(a, b) {
  const m = new Map(), rank = { war: 3, minor: 2, abroad: 1 };
  const put = (gw, v) => { if ((rank[m.get(gw)] || 0) < rank[v]) m.set(gw, v); };
  for (const w of warsInPeriod(a, b)) for (const [y, l] of yearsIn(w, a, b)) {
    for (const gw of locIn(w, y)) put(gw, l === 2 ? 'war' : 'minor');
    for (const gw of w.states) put(gw, 'abroad');
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
const levelLabel = l => l === 2 ? 'War · 1,000+ deaths this year' : 'Minor conflict · 25–999 deaths this year';
const LEVEL_WORD = ['', 'Minor', 'War'];

/* ---------------------------------------------------------------- map */
function drawMap() {
  svg = d3.select('#map').attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet');
  projection = d3.geoNaturalEarth1().fitExtent([[10, 10], [W - 10, H - 10]], { type: 'FeatureCollection', features: activeOn('2020-01-01') });
  path = d3.geoPath(projection);
  g = svg.append('g');
  zoom = d3.zoom().scaleExtent([1, 40]).on('zoom', ev => g.attr('transform', ev.transform));
  svg.call(zoom);
  $('#zoom-in').onclick = () => svg.transition().duration(motion()).call(zoom.scaleBy, 1.6);
  $('#zoom-out').onclick = () => svg.transition().duration(motion()).call(zoom.scaleBy, 1 / 1.6);
  $('#zoom-reset').onclick = () => { clearFocus(); svg.transition().duration(motion()).call(zoom.transform, d3.zoomIdentity); };
  focusView = window.PRPFocus?.d3View({ svg, zoom, project: () => projection, maxScale: 8, clamp: true });
}

/* ---------------------------------------------------------------- documentary focus (design/prp-focus.js) */
// When the reader talks about wars, the states they were fought in are outlined in the module accent and the map
// eases to fit them all; ⟲ or the end of the reading brings back the whole world.
function paintFocus() {
  if (!g) return;
  g.selectAll('path.shape').classed('prp-focus-hit', d => focusHits.has(d.properties.gw));
  g.selectAll('path.shape.prp-focus-hit').raise();
}
function clearFocus() { focusHits.clear(); paintFocus(); }
window.PRPFocus?.listen({
  focus(t) {
    if (!state.data || !focusView) return;
    const live = activeOn(dateFor(state.year)), gws = new Set();
    const r = PRPFocus.resolve(t, {
      country: id => {
        const gw = /^gw:\d+$/.test(id) ? +id.slice(3) : PRPFocus.gwOf(id), fs = live.filter(f => f.properties.gw === gw);
        if (fs.length) gws.add(gw);
        return fs.length ? fs : null;
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
  // The selected war's places in the period's years (or as of the end year when it was not active then).
  const wys = state.war ? yearsIn(state.war, a, b).map(([y]) => y) : [];
  const involved = new Set(state.war ? [...(wys.length ? wys : [b]).flatMap(y => locIn(state.war, y)), ...state.war.states] : []);
  g.selectAll('path.shape')
    .data(live, d => `${d.properties.gw}|${d.properties.s}`)
    .join('path')
    .attr('d', path)
    .attr('class', d => `shape active${d.properties.gw === state.selected ? ' selected' : ''}${involved.has(d.properties.gw) ? ' involved' : ''}${focusHits.has(d.properties.gw) ? ' prp-focus-hit' : ''}`)
    .attr('fill', d => FILL[status.get(d.properties.gw) || 'peace'])
    .on('mousemove', (ev, d) => {
      const box = $('.map-wrap').getBoundingClientRect(), gw = d.properties.gw;
      const ws = warsInPeriod(a, b).filter(w => onSoil(w, gw, a, b) || w.states.includes(gw));
      tip.innerHTML = `<strong>${esc(displayName(gw, d.properties.name, date))}</strong>${a === b ? '' : `<span class="tip-when">${a}–${b}</span>`}${ws.length ? ws.slice(0, 3).map(w => esc(w.name)).join('<br>') + (ws.length > 3 ? `<br>+${ws.length - 3} more` : '') : 'No recorded armed conflict'}`;
      tip.hidden = false;
      tip.style.left = `${Math.max(4, Math.min(ev.clientX - box.left + 14, box.width - tip.offsetWidth - 8))}px`;
      tip.style.top = `${Math.min(ev.clientY - box.top + 14, box.height - tip.offsetHeight - 8)}px`;
    })
    .on('mouseleave', () => { tip.hidden = true; })
    .on('click', (ev, d) => select(d.properties.gw));
  // The selected or involved countries draw last, so their outlines are not hidden under their neighbours'.
  g.selectAll('path.shape.involved, path.shape.selected').raise();
  g.selectAll('path.shape.prp-focus-hit').raise();
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
    const gw = state.selected, list = warsInPeriod(a, y);
    const here = list.filter(w => onSoil(w, gw, a, y)), abroad = list.filter(w => !onSoil(w, gw, a, y) && w.states.includes(gw));
    // Every conflict this state took part in or hosted, across the whole century, oldest first.
    const ever = state.data.wars.filter(w => w.loc.includes(gw) || w.states.includes(gw)).sort((p, q) => p.years[0][0] - q.years[0][0]);
    const soil = ever.filter(w => w.loc.includes(gw)), away = ever.filter(w => !w.loc.includes(gw));
    const cards = l => l.map(w => warCard(w));
    const byDecade = l => [...new Set(l.map(w => Math.floor(w.years[0][0] / 10) * 10))]
      .map(d => `<h3>${d}s</h3>${l.filter(w => Math.floor(w.years[0][0] / 10) * 10 === d).map(w => warCard(w)).join('')}`).join('');
    const cname = nameOf(gw, y), heading = a === y ? ` in ${y}` : `, ${a}–${y}`;
    html = `<button class="close" id="close" aria-label="Close">×</button><h2>${esc(cname)}</h2>
      <p class="sub">${here.length ? `${here.length} conflict${here.length > 1 ? 's' : ''} on its territory in ${when}` : `No conflict on its territory in ${when}`}${abroad.length ? ` · fighting in ${abroad.length} abroad` : ''}</p>
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
  panel.innerHTML = html + `<p class="src-note"><b>Source:</b> ${esc(src)} Borders: CShapes 2.0.</p>`;
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
  play: { interval: 900, label: 'Play through the years' },
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
  const h = `#y=${state.year}${f != null ? `&f=${f}` : ''}${state.selected ? `&c=${state.selected}` : ''}${state.war ? `&w=${state.war.id}` : ''}${state.view === 'table' ? '&v=table' : ''}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1)), y = +p.get('y') || state.data.lastYear;
  const years = period.get().stops;
  // An f at or after the year, or unreadable, is a single year.
  return { y, f: PRPPeriod.rules.readStart(years, p.get('f'), y, 'end'), c: +p.get('c') || null, w: p.get('w'), v: p.get('v') === 'table' ? 'table' : 'map' };
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
    $('#status').innerHTML = `<span><b>${data.wars.length}</b> wars and armed conflicts</span><span>Coverage <b>${data.firstYear}–${data.lastYear}</b></span><span>Sources <b>UCDP/PRIO · Correlates of War · CShapes 2.0</b></span>${data.generated ? `<span>Built <b>${esc(fmtDay(data.generated))}</b></span>` : ''}`;
    drawMap(); setupTimeline(); setupSearch();
    const { y, f, c, w, v } = readHash();
    state.selected = c;
    setView(v, { push: false });
    setPeriod(f, y, { push: false });
    if (w) selectWar(w);
    window.addEventListener('hashchange', () => {
      const h = readHash();
      if (h.v !== state.view) setView(h.v, { push: false });
      if (h.y !== state.year || (h.f ?? h.y) !== state.from) setPeriod(h.f, h.y, { push: false });
      if (h.c !== state.selected) select(h.c);
      if ((h.w || null) !== (state.war?.id || null)) selectWar(h.w);
    });
  } catch (err) {
    console.error(err);
    $('#status').textContent = 'Could not load conflict history.';
  }
})();
