// War Focus (PRP · Retrospective Geopolitics): one war, month by month. Data: data/index.json and data/wars/<id>.json
// (scripts/build.mjs); borders from Retrospective Battlefield's CShapes file. Wars and battles carry their Wikidata IDs
// (data-qid), so the PRP entity linker adds Encyclopaedia links, and lake/scripts/adapters.mjs links the Encyclopaedia back here.
// Views (tabs): the map, a table of the war's battles and a table of deaths by month. All follow the timeline
// (design/prp-period.js): its start rests on the war's first month, so the map shows the war up to the month shown, as
// before; moved, it sets a period of months, whose deaths, battles and clashes the page shows instead.
// URL: #war=<id>&m=<yyyy-mm, the month shown or the period's last>[&f=<yyyy-mm, the period's first>]&v=battles|months
import { displayName } from '../history/names.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Math.round(n).toLocaleString('en-GB');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLabel = m => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const fmtDate = d => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
// A battle's dates at the precision Wikidata records (p: 'm' month, 'y' year).
const bDates = b => { const f = d => (b.p === 'y' ? d.slice(0, 4) : b.p === 'm' ? monthLabel(d.slice(0, 7)) : fmtDate(d)); const a = f(b.s), z = b.e ? f(b.e) : a; return a === z ? a : `${a} – ${z}`; };
const wikiUrl = t => `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
const SHELL = new URL('../../', location.href).href;
// Retrospective Battlefield is a sibling submodule: inside the PRP shell its links open it there; on its own, directly.
const go = (module, url) => embedded ? `${SHELL}#/rs/${module}?at=${encodeURIComponent(new URL(url, SHELL).href)}` : new URL(url, SHELL).href;
const motion = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250);

// m: the month shown (the end of the period), f: the period's first month (0, the war's first, while the start rests).
const state = { index: null, borders: null, war: null, m: 0, f: 0, atRest: true, zoomK: 1, view: 'map' };
let svg, g, gStates, gLabels, gCells, gBattles, path, projection, zoom, features = [], focusView = null, focusFit = null;
const hits = { gws: new Set(), qids: new Set() }; // what Documentary mode is discussing: states (GW codes) and battles (QIDs)

/* ---------------------------------------------------------------- side logic */
const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
function sideOf(gw, date) {
  const w = state.war;
  for (const c of w.control) if (c.gw === gw && inRange(date, c.from, c.to)) return 'occ-' + c.side;
  for (const s of ['a', 'b']) if (w.sides[s].states.some(x => x.gw === gw && inRange(date, x.from, x.to))) return 'side-' + s;
  if (w.theatre.includes(gw)) return 'theatre';
  return '';
}
const dateOf = i => { const w = state.war, d = w.months[i] + '-15'; return d < w.start ? w.start : w.end && d > w.end ? w.end : d; };

/* ---------------------------------------------------------------- map */
function initMap() {
  svg = d3.select('#map');
  g = svg.append('g');
  gStates = g.append('g'); gCells = g.append('g'); gBattles = g.append('g'); gLabels = g.append('g');
  zoom = d3.zoom().scaleExtent([1, 40]).on('zoom', e => { g.attr('transform', e.transform); state.zoomK = e.transform.k; sizeMarks(); });
  svg.call(zoom);
  $('#zoom-in').onclick = () => svg.transition().duration(motion()).call(zoom.scaleBy, 1.6);
  $('#zoom-out').onclick = () => svg.transition().duration(motion()).call(zoom.scaleBy, 1 / 1.6);
  $('#zoom-reset').onclick = () => { clearFocus(); svg.transition().duration(motion()).call(zoom.transform, d3.zoomIdentity); };
  focusView = window.PRPFocus?.d3View({ svg, zoom, project: () => projection, maxScale: 8 });
  features = topojson.feature(state.borders, state.borders.objects.borders).features;
  new ResizeObserver(() => state.war && fitProjection()).observe($('.map-wrap'));
}
function fitProjection() {
  // The map's own box (on phones the key sits under it, inside the same frame).
  const w = state.war, box = $('#map').getBoundingClientRect(), W = Math.max(320, box.width), H = Math.max(280, box.height);
  svg.attr('viewBox', `0 0 ${W} ${H}`);
  let target;
  if (w.bbox) {
    const [x0, y0, x1, y1] = w.bbox, px = Math.max(2, (x1 - x0) * 0.25), py = Math.max(2, (y1 - y0) * 0.25);
    // Corner and edge points rather than a polygon, so ring winding can't turn the box inside out.
    const xs = d3.range(9).map(k => x0 - px + (x1 - x0 + 2 * px) * k / 8);
    target = { type: 'MultiPoint', coordinates: [...xs.map(x => [x, Math.max(-85, y0 - py)]), ...xs.map(x => [x, Math.min(85, y1 + py)])] };
  } else {
    const gws = new Set([...w.theatre, ...w.sides.a.states.map(s => s.gw), ...w.sides.b.states.map(s => s.gw)]), d = dateOf(0);
    target = { type: 'FeatureCollection', features: features.filter(f => gws.has(f.properties.gw) && f.properties.s <= d && f.properties.e >= d) };
  }
  projection = d3.geoNaturalEarth1().fitExtent([[16, 16], [W - 16, H - 16]], target);
  path = d3.geoPath(projection);
  svg.call(zoom.transform, d3.zoomIdentity);
  draw(true);
  if (focusFit) focusView?.fit(...focusFit); // a refit (the frame resized) keeps what Documentary mode is showing
}
const R = b => Math.min(16, 3.2 + Math.sqrt(b.deaths || b.cas || 0) / 22);
function sizeMarks() {
  const k = state.zoomK;
  gBattles.selectAll('circle.battle').attr('r', d => R(d) / Math.sqrt(k));
  gCells.selectAll('circle').attr('r', d => d[5] / Math.sqrt(k));
  gLabels.selectAll('text').attr('font-size', 10 / Math.sqrt(k));
}
// A clash circle's radius from its deaths (over a period, its deaths a month, so a long period stays legible).
const cellR = deaths => Math.min(22, 2 + Math.sqrt(deaths) * 0.9);

/* ---------------------------------------------------------------- the months shown */
// One month (the start at rest: the war up to it), or a period of months [first, last]. A battle is under way in a
// span of months when it began by its end and ended at or after its start; one dated only to its year counts in the
// war-so-far tally but is never "under way", as it would read so for the whole year, so a period's count leaves it out.
const isPeriod = () => !state.atRest;
// The months shown in words: one month in full ("November 1943", also when the start meets the end away from the
// first month), a period in short months with its year once where it has one ("Jun – Nov 1943", "Sep 2022 – Sep
// 2024"), so the header figure keeps one width (focus.css) and fits a phone.
const shortMonth = m => MONTHS[+m.slice(5, 7) - 1].slice(0, 3);
const periodLabel = () => {
  const w = state.war, a = w.months[state.f], z = w.months[state.m];
  if (!isPeriod() || a === z) return monthLabel(z);
  return a.slice(0, 4) === z.slice(0, 4) ? `${shortMonth(a)} – ${shortMonth(z)} ${z.slice(0, 4)}` : `${shortMonth(a)} ${a.slice(0, 4)} – ${shortMonth(z)} ${z.slice(0, 4)}`;
};
const overlaps = (b, a, z) => b.s.slice(0, 7) <= z && (b.e || b.s).slice(0, 7) >= a;
const underWay = (b, a, z) => b.p !== 'y' && overlaps(b, a, z);
function periodDeaths() {
  const w = state.war; let deaths = 0, est = false;
  for (let k = state.f; k <= state.m; k++) { deaths += w.deaths[k]; est ||= !!w.estimated[k]; }
  return { deaths, est };
}

function draw(full) {
  const w = state.war, i = state.m, m = w.months[i], date = dateOf(i), p = isPeriod(), a = w.months[state.f], startDate = dateOf(state.f);
  // States as they stood that month, coloured by side or occupation; over a period, outlined where that changed since
  // its first month.
  const live = features.filter(f => f.properties.s <= date && f.properties.e >= date);
  const prevDate = i ? dateOf(i - 1) : null;
  state.changed = p ? live.filter(f => sideOf(f.properties.gw, date) !== sideOf(f.properties.gw, startDate)).length : 0; // for the legend
  gStates.selectAll('path').data(live, f => f.properties.gw + f.properties.s).join('path')
    .attr('d', path)
    .attr('class', f => { const gw = f.properties.gw, s = sideOf(gw, date); const was = prevDate ? sideOf(gw, prevDate) : s; return `state ${s}${!full && s !== was ? ' joined' : ''}${p && s !== sideOf(gw, startDate) ? ' changed' : ''}${hits.gws.has(gw) ? ' prp-focus-hit' : ''}`; })
    .on('mousemove', (e, f) => { const gw = f.properties.gw, s = sideOf(gw, date), then = p ? sideOf(gw, startDate) : s; tip(e, `<strong>${esc(displayName(gw, f.properties.name, date))}</strong>${sideText(s)}${then !== s ? `<span class="tip-when">${esc(monthLabel(a))}: ${esc(sideWord(then))}</span>` : ''}`); })
    .on('mouseleave', hideTip);
  // Labels for the states taking part.
  const named = live.filter(f => sideOf(f.properties.gw, date) && path.area(f) > 900);
  gLabels.selectAll('text').data(named, f => f.properties.gw).join('text').attr('class', 'state-label')
    .attr('transform', f => `translate(${path.centroid(f)})`).text(f => displayName(f.properties.gw, f.properties.name, date));
  // UCDP events: this month, plus the two before it faded; over a period, grouped by place across its months (deaths
  // and clashes summed), the places active in its last month bright and drawn last. [lat, lon, deaths, clashes, now, r]
  let cells = [];
  if (!p) { for (let k = Math.max(0, i - 2); k <= i; k++) for (const c of w.cells[k] || []) cells.push([c[0], c[1], c[2], c[3], k === i, cellR(c[2])]); }
  else {
    const by = new Map(), months = i - state.f + 1;
    for (let k = state.f; k <= i; k++) for (const c of w.cells[k] || []) {
      const key = `${c[0]},${c[1]}`, cell = by.get(key) || by.set(key, [c[0], c[1], 0, 0, false, 0]).get(key);
      cell[2] += c[2]; cell[3] += c[3]; if (k === i) cell[4] = true;
    }
    cells = [...by.values()].sort((x, y) => x[4] - y[4]);
    for (const c of cells) c[5] = cellR(c[2] / months);
  }
  gCells.selectAll('circle').data(cells).join('circle').attr('class', d => (d[4] ? 'cell' : 'cell old'))
    .attr('cx', d => projection([d[1], d[0]])[0]).attr('cy', d => projection([d[1], d[0]])[1])
    .on('mousemove', (e, d) => tip(e, `<strong>${num(d[2])} deaths</strong>${d[3]} recorded clash${d[3] > 1 ? 'es' : ''}${p ? `, ${esc(periodLabel())}${d[4] ? '' : ` (none in ${esc(monthLabel(m))})`}` : d[4] ? '' : ' (earlier month)'}`)).on('mouseleave', hideTip);
  // Battles: started by this month; those under way in it bright and ringed, those of the period bright, older ones faded.
  const shown = w.battles.filter(b => b.lat != null && b.s.slice(0, 7) <= m);
  const isNow = b => underWay(b, m, m), inP = b => p && underWay(b, a, m);
  gBattles.selectAll('circle.ring').data(shown.filter(isNow), b => b.q).join('circle').attr('class', 'ring')
    .attr('cx', b => projection([b.lon, b.lat])[0]).attr('cy', b => projection([b.lon, b.lat])[1]);
  gBattles.selectAll('circle.battle').data(shown, b => b.q).join('circle')
    .attr('class', b => `battle ${isNow(b) ? 'now' : inP(b) ? 'in' : 'past'}${hits.qids.has(b.q) ? ' prp-focus-hit' : ''}`)
    .attr('cx', b => projection([b.lon, b.lat])[0]).attr('cy', b => projection([b.lon, b.lat])[1])
    .on('mousemove', (e, b) => tip(e, `<strong>${esc(b.n)}</strong>${esc(bDates(b))}${b.deaths ? `<br>${num(b.deaths)} deaths` : b.cas ? `<br>${num(b.cas)} casualties` : ''}`))
    .on('mouseleave', hideTip).on('click', (e, b) => openBattle(b));
  if (p) gBattles.selectAll('circle.battle').filter(inP).raise();
  gBattles.selectAll('circle.battle').filter(isNow).raise();
  raiseHits();
  sizeMarks();
  renderCounters(); renderPanel(); renderLegend(); renderCaption(); renderTables();
}
function sideText(s) {
  const w = state.war;
  if (s === 'side-a') return `<br>${esc(w.sides.a.label)}`;
  if (s === 'side-b') return `<br>${esc(w.sides.b.label)}`;
  if (s === 'occ-a') return `<br>Held by ${esc(w.sides.a.label)}`;
  if (s === 'occ-b') return `<br>Held by ${esc(w.sides.b.label)}`;
  if (s === 'theatre') return '<br>Contested (civil war)';
  return '';
}
// The same in words, for the period's first month in a tooltip.
function sideWord(s) {
  const w = state.war;
  return { 'side-a': w.sides.a.label, 'side-b': w.sides.b.label, 'occ-a': `held by ${w.sides.a.label}`, 'occ-b': `held by ${w.sides.b.label}`, theatre: 'contested (civil war)' }[s] || 'not at war';
}
function tip(e, html) { const t = $('#tooltip'), r = $('.map-wrap').getBoundingClientRect(); t.hidden = false; t.innerHTML = html; t.style.left = e.clientX - r.left + 14 + 'px'; t.style.top = e.clientY - r.top + 14 + 'px'; }
function hideTip() { $('#tooltip').hidden = true; }

/* ---------------------------------------------------------------- documentary focus (design/prp-focus.js) */
// When the reader talks about states or battles, they are outlined in the module accent (drawn over their neighbours)
// and the map eases to fit them all; ⟲ or the end of the reading brings back the whole theatre.
const featureAt = (gw, date) => features.find(f => f.properties.gw === gw && f.properties.s <= date && f.properties.e >= date);
function raiseHits() { gStates.selectAll('path.prp-focus-hit').raise(); gBattles.selectAll('circle.prp-focus-hit').raise(); }
function paintHits() {
  if (!gStates) return;
  gStates.selectAll('path.state').classed('prp-focus-hit', f => hits.gws.has(f.properties.gw));
  gBattles.selectAll('circle.battle').classed('prp-focus-hit', b => hits.qids.has(b.q));
  raiseHits();
}
function clearFocus() { hits.gws.clear(); hits.qids.clear(); focusFit = null; paintHits(); }
window.PRPFocus?.listen({
  focus(t) {
    const w = state.war; if (!w || !projection || !focusView) return;
    const date = dateOf(state.m), gws = new Set(), qids = new Set();
    const r = PRPFocus.resolve(t, {
      country: id => { const gw = /^gw:\d+$/.test(id) ? +id.slice(3) : PRPFocus.gwOf(id), f = gw == null ? null : featureAt(gw, date); if (f) gws.add(gw); return f; },
      qid: q => { const b = w.battles.find(x => x.q === q && x.lat != null); if (b) { qids.add(q); return [b.lon, b.lat]; } return q === w.qid ? w.bbox : null; },
      minSpan: 5,
    });
    if (!r.box) return;
    hits.gws = gws; hits.qids = qids; paintHits();
    focusFit = [r.box, r.padding];
    focusView.fit(...focusFit);
  },
  reset() { clearFocus(); focusView?.reset(); },
});

/* ---------------------------------------------------------------- counters, sparkline, legend */
let cumulative = [];
// The war so far to the month shown, as before; over a period, the period's deaths and battles beside the running total.
function renderCounters() {
  const w = state.war, i = state.m, m = w.months[i], p = isPeriod(), a = w.months[state.f];
  $('#date-label').textContent = p ? 'Period' : 'Month';
  $('.counters').classList.toggle('is-period', p);
  $('#date').textContent = periodLabel();
  $('#c-total').textContent = num(cumulative[i]);
  const pd = periodDeaths();
  $('#c-month-label').textContent = p ? 'In the period' : 'This month';
  $('#c-month').textContent = p ? `${pd.est ? '~' : ''}${num(pd.deaths)}` : (w.estimated[i] ? '~' : '') + num(w.deaths[i]);
  // Over a period, the battles under way in it: the panel's count, so the two figures on screen agree.
  $('#c-battles-label').textContent = p ? 'Battles in the period' : 'Battles so far';
  $('#c-battles').textContent = num(p ? w.battles.filter(b => underWay(b, a, m)).length : w.battles.filter(b => b.s.slice(0, 7) <= m).length);
}
// Deaths month by month, drawn by the timeline above its track (the control's strip, inset like its handles, so a
// month sits over its stop): the whole war while the start rests, as before; a period's months solid and the rest
// faded. The line marks the month shown.
function renderSpark(svg, p) {
  const w = state.war; if (!w || !w.months.length) return;
  const el = d3.select(svg), W = Math.max(1, svg.clientWidth || 600), H = Math.max(1, svg.clientHeight || 38);
  el.attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleLinear().domain([0, Math.max(1, w.months.length - 1)]).range([0, W]), y = d3.scaleLinear().domain([0, d3.max(w.deaths) || 1]).range([H - 2, 4]);
  const area = keep => d3.area().defined((_, k) => keep(k)).x((_, k) => x(k)).y0(H - 2).y1(d => y(d)).curve(d3.curveMonotoneX);
  const est = w.estimated.every(Boolean) ? ' est' : '';
  const parts = p.atRest ? [['all', () => true]] : [['out', () => true], ['in', k => k >= p.fromIndex && k <= p.toIndex]];
  el.selectAll('path.area').data(parts).join('path').attr('class', ([k]) => `area ${k}${est}`).attr('d', ([, keep]) => area(keep)(w.deaths));
  el.selectAll('line.now').data([p.toIndex]).join('line').attr('class', 'now').attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', H);
}
function renderLegend() {
  const w = state.war, items = [], p = isPeriod(), m = monthLabel(w.months[state.m]);
  if (w.sides.a.states.length) items.push(`<li><span class="swatch" style="background:var(--side-a)"></span>${esc(w.sides.a.label)}</li>`);
  if (w.sides.b.states.length) items.push(`<li><span class="swatch" style="background:var(--side-b)"></span>${esc(w.sides.b.label)}</li>`);
  if (w.control.length) items.push('<li><span class="swatch hatch"></span>Occupied (whole country)</li>');
  if (w.theatre.length) items.push('<li><span class="swatch" style="background:var(--contested)"></span>Contested (civil war)</li>');
  if (p && state.changed) items.push(`<li><span class="swatch changed"></span>Side or occupation changed since ${esc(monthLabel(w.months[state.f]))}</li>`);
  if (w.battles.some(b => b.lat != null)) items.push(p
    ? `<li><span class="swatch dot b-now"></span>Battle under way in ${esc(m)}</li><li><span class="swatch dot b-in"></span>Battle in the period</li><li><span class="swatch dot b-past"></span>Earlier battle</li>`
    : '<li><span class="swatch dot b-now"></span>Battle this month</li><li><span class="swatch dot b-past"></span>Earlier battle</li>');
  if (w.events) items.push(`<li><span class="swatch dot clash"></span>Recorded clashes (UCDP)${p ? ', by place' : ''}</li>`);
  $('#legend').innerHTML = `<h4>${esc(periodLabel())}</h4><ul>${items.join('')}</ul>`;
}
function renderCaption() {
  const w = state.war, m = monthLabel(w.months[state.m]);
  if (!isPeriod()) { $('#caption').textContent = `${w.name}, ${m}: the states at war coloured by side (${w.sides.a.label} blue, ${w.sides.b.label} red) on the borders of the day${w.control.length ? ', hatched while wholly occupied' : ''}${w.theatre.length ? ', the contested state in amber' : ''}; battles under way are ringed${w.events ? ', UCDP clashes in red' : ''}.`; return; }
  $('#caption').textContent = `${w.name}, ${periodLabel()}: the states at war coloured by their side in ${m} (${w.sides.a.label} blue, ${w.sides.b.label} red) on its borders${w.control.length ? ', hatched while wholly occupied' : ''}${w.theatre.length ? ', the contested state in amber' : ''}${state.changed ? `, and outlined where their side or occupation changed since ${monthLabel(w.months[state.f])}` : ''}; battles under way in the period are drawn full and those under way in ${m} ringed${w.events ? '; UCDP clashes of the period are grouped by place, in red, sized by deaths a month and faded where none fell in its last month' : ''}.`;
}

/* ---------------------------------------------------------------- panel */
const popouts = new Map();
const addPop = (title, html) => { const id = 'p' + popouts.size; popouts.set(id, { title, html }); return id; };
function seeMoreList(items, limit, title) {
  if (items.length <= limit) return `<ul class="blist">${items.join('')}</ul>`;
  return `<ul class="blist">${items.slice(0, limit).join('')}</ul><button class="more" data-pop="${addPop(title, `<ul class="blist">${items.join('')}</ul>`)}">See all ${items.length} ›</button>`;
}
function battleItem(b) {
  // The Wikidata ID sits on the name, so the Encyclopaedia linker puts its ◈ beside it (and not again by the Wikipedia link).
  return `<li><button class="bname" data-b="${esc(b.q)}" data-qid="${esc(b.q)}">${esc(b.n)}</button>${b.w ? `<a class="wl jdpi-no-ency" href="${wikiUrl(b.w)}" target="_blank" rel="noreferrer">Wikipedia ↗</a>` : ''}
    <small>${esc(bDates(b))}${b.deaths ? ` · ${num(b.deaths)} deaths` : b.cas ? ` · ${num(b.cas)} casualties` : ''}${b.lat == null ? ' · not mapped' : ''}</small></li>`;
}
// The states on a side that month, largest first, so the major powers lead the list.
function statesOn(side, date) {
  const found = state.war.sides[side].states.filter(s => inRange(date, s.from, s.to))
    .map(s => features.find(f => f.properties.gw === s.gw && f.properties.s <= date && f.properties.e >= date)).filter(Boolean)
    .sort((a, b) => d3.geoArea(b) - d3.geoArea(a));
  return [...new Set(found.map(f => displayName(f.properties.gw, f.properties.name, date)))];
}
function renderPanel() {
  popouts.clear();
  const w = state.war, i = state.m, m = w.months[i], date = dateOf(i), p = isPeriod(), a = p ? w.months[state.f] : m;
  // Under way this month, or at some point in the period: those starting in it first, then the shortest, so war-long
  // campaigns sink.
  const span = b => Date.parse(b.e || b.s) - Date.parse(b.s), begins = b => b.s.slice(0, 7) >= a && b.s.slice(0, 7) <= m;
  const now = w.battles.filter(b => underWay(b, a, m)).sort((x, y) => begins(y) - begins(x) || span(x) - span(y));
  const deadliest = [...w.battles].filter(b => b.deaths || b.cas).sort((a, b) => (b.deaths || b.cas) - (a.deaths || a.cas));
  const months = w.months.length, years = Math.floor(months / 12);
  const sides = ['a', 'b'].map(s => {
    const on = statesOn(s, date), list = on.length > 14 ? `${on.slice(0, 14).join(', ')} <button class="more" data-pop="${addPop(`${w.sides[s].label}, ${monthLabel(m)}`, `<p>${esc(on.join(', '))}</p>`)}">+${on.length - 14} more</button>` : esc(on.join(', '));
    return `<div class="side-chip"><i style="background:var(--side-${s})"></i><b>${esc(w.sides[s].label)}</b></div>${on.length ? `<div class="side-list">${list}</div>` : ''}`;
  }).join('');
  // The deadliest UCDP clashes of the month, or of all the period's months.
  const clashes = p ? w.top.slice(state.f, i + 1).flat().sort((x, y) => y[1] - x[1]).slice(0, 8) : (w.top[i] || []);
  const top = clashes.map(([d, deaths, where, dyad]) => `<li><b>${num(deaths)} deaths</b> · ${esc(where)}<small>${esc(fmtDate(d))} · ${esc(dyad)}</small></li>`);
  // Retrospective Battlefield shows the year, or the period's years as a period.
  const bfYear = Math.min(2025, +m.slice(0, 4)), bfFrom = Math.min(2025, +a.slice(0, 4)), bfPeriod = p && bfFrom < bfYear;
  const pd = periodDeaths();
  $('#panel').innerHTML = `
    <h2><span data-qid="${esc(w.qid || '')}">${esc(w.name)}</span></h2>
    <p class="sub">${esc(fmtDate(w.start))} – ${w.end ? esc(fmtDate(w.end)) : 'ongoing'} · ${years ? `${years} yr${years > 1 ? 's' : ''} ` : ''}${months % 12 ? `${months % 12} mo` : ''}</p>
    <div class="sides" style="margin-top:10px">${sides}</div>
    <div class="stat-row">
      <div class="stat"><span>Deaths, whole war</span><b>${num(w.totalDeaths)}</b><small>battle-related${w.ongoing ? `, to ${esc(fmtDate(w.dataThrough))}` : ''}</small></div>
      <div class="stat"><span>Battles &amp; operations</span><b>${num(w.battles.length)}</b><small>${num(w.battles.filter(b => b.lat != null).length)} mapped</small></div>
      ${p ? `<div class="stat"><span>Deaths in the period</span><b>${pd.est ? '~' : ''}${num(pd.deaths)}</b><small>${Math.round(pd.deaths / Math.max(1, w.totalDeaths) * 100)}% of the war's total · ${num(cumulative[i])} by ${esc(monthLabel(m))}</small></div>`
        : `<div class="stat"><span>Deaths so far</span><b>${num(cumulative[i])}</b><small>${Math.round(cumulative[i] / Math.max(1, w.totalDeaths) * 100)}% of the war's total</small></div>`}
      <div class="stat"><span>Clashes recorded</span><b>${w.events ? num(w.events) : '–'}</b><small>${w.events ? 'UCDP geolocated events' : 'no event data before 1989'}</small></div>
    </div>
    <a class="btn" href="${wikiUrl(w.wiki)}" target="_blank" rel="noreferrer">Wikipedia ↗</a>
    ${w.bf ? `<a class="btn go" href="${esc(go('battlefield-history', `battlefield/history/index.html#y=${bfYear}${bfPeriod ? `&f=${bfFrom}` : ''}&w=${w.bf}`))}" target="${embedded ? '_top' : '_self'}">Open in Retrospective Battlefield: ${bfPeriod ? `${bfFrom}–${bfYear}` : bfYear} →</a>` : ''}
    <h3>${esc(periodLabel())} <span class="count">${now.length} battle${now.length === 1 ? '' : 's'} or operation${now.length === 1 ? '' : 's'} under way</span></h3>
    ${now.length ? seeMoreList(now.map(battleItem), 8, `${w.name} · ${periodLabel()}`) : `<p class="empty">No battles or operations recorded as under way ${p ? 'in the period' : 'this month'}.</p>`}
    ${top.length ? `<h3>Deadliest clashes ${p ? 'in the period' : 'this month'} <span class="count">UCDP</span></h3><ul class="blist">${top.join('')}</ul>` : ''}
    ${deadliest.length ? `<h3>Deadliest battles of the war</h3>${seeMoreList(deadliest.map(battleItem), 6, `${w.name} · battles by deaths`)}` : ''}
    <h3>All battles &amp; operations <span class="count">${w.battles.length}</span></h3>${w.battles.length ? seeMoreList(w.battles.map(battleItem), 5, `${w.name} · all battles`) : '<p class="empty">None recorded in Wikidata.</p>'}
    <p class="src-note"><b>Deaths:</b> ${esc(w.deathsSource)}.${w.estimated.some(Boolean) ? ' Months marked ~ are estimates; the yearly or war totals are as published.' : ''}
      <b>Battles &amp; operations:</b> Wikidata battles, sieges and military operations recorded as part of this war; dates and deaths as recorded there.
      <b>Territory:</b> CShapes borders as they stood that month${w.control.length ? ', with whole countries hatched while occupied' : ''}${w.theatre.length ? '; the contested state is shaded as a whole' : ''}. Front lines are not drawn: no open data records them month by month.</p>`;
  $('#panel').querySelectorAll('[data-b]').forEach(b => b.onclick = () => openBattle(w.battles.find(x => x.q === b.dataset.b)));
  $('#panel').querySelectorAll('[data-pop]').forEach(b => b.onclick = () => openPop(popouts.get(b.dataset.pop)));
}
function openPop(p) {
  $('#modal-title').textContent = p.title; $('#modal-body').innerHTML = p.html; $('#modal').hidden = false;
  $('#modal-body').querySelectorAll('[data-b]').forEach(b => b.onclick = () => openBattle(state.war.battles.find(x => x.q === b.dataset.b)));
}
function openBattle(b) {
  if (!b) return;
  const w = state.war, mi = w.months.indexOf(b.s.slice(0, 7));
  $('#modal-title').innerHTML = `<span data-qid="${esc(b.q)}">${esc(b.n)}</span>`;
  $('#modal-body').innerHTML = `<p class="sub">${esc(bDates(b))} · part of ${esc(w.name)}</p>
    ${b.desc ? `<p>${esc(b.desc.replace(/^./, c => c.toUpperCase()))}.</p>` : ''}
    <div class="stat-row"><div class="stat"><span>Deaths</span><b>${b.deaths ? num(b.deaths) : '–'}</b></div><div class="stat"><span>Casualties</span><b>${b.cas ? num(b.cas) : '–'}</b></div></div>
    ${b.w ? `<a class="btn" href="${wikiUrl(b.w)}" target="_blank" rel="noreferrer">Wikipedia ↗</a>` : ''}
    <a class="btn" href="https://www.wikidata.org/wiki/${esc(b.q)}" target="_blank" rel="noreferrer">Wikidata ↗</a>
    ${mi >= 0 && mi !== state.m ? `<button class="btn" id="jump">Go to ${esc(monthLabel(w.months[mi]))}</button>` : ''}
    ${b.lat != null ? '' : '<p class="empty">No coordinates recorded, so it is not on the map.</p>'}`;
  $('#modal').hidden = false;
  // Its first month: the month shown moves there; one before a period's start widens the period to begin there.
  const j = $('#jump'); if (j) j.onclick = () => { closeModal(); if (isPeriod() && mi < state.f) setPeriod(w.months[mi], w.months[state.m]); else setMonth(mi); };
}
function closeModal() { $('#modal').hidden = true; }
$('#modal-close').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
// ← → step the month shown (the period's end), as ‹ › do; not while typing, choosing or in the tabs.
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); else if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && !e.target.closest('[role="tablist"]') && $('#modal').hidden) { if (e.key === 'ArrowRight') period.step(1); if (e.key === 'ArrowLeft') period.step(-1); } });

/* ---------------------------------------------------------------- table views */
// The war's battles (the list view of the map's marks) and its deaths month by month (the table of the sparkline).
function renderTables() {
  const w = state.war; if (!w) return;
  const i = state.m, m = w.months[i], p = isPeriod(), a = p ? w.months[state.f] : m;
  if (state.view === 'battles') {
    // Status against the month shown, or against the period.
    const status = b => (b.s.slice(0, 7) > m ? ['later', 'Not yet'] : underWay(b, a, m) ? ['now', p ? 'In the period' : 'Under way'] : ['', 'Earlier']);
    const list = [...w.battles].sort((a, b) => a.s.localeCompare(b.s) || a.n.localeCompare(b.n));
    $('#battles-title').textContent = `${w.name} · ${num(list.length)} battles and operations`;
    $('#th-status').textContent = periodLabel();
    $('#battles-rows').innerHTML = list.map(b => {
      const [cls, word] = status(b);
      return `<tr${cls === 'later' ? ' class="later"' : cls === 'now' ? ' class="sel"' : ''}><td><button type="button" class="rowbtn" data-b="${esc(b.q)}">${esc(b.n)}</button></td><td class="mono">${esc(bDates(b))}</td>
        <td><span class="st ${cls}">${word}</span></td><td class="num">${b.deaths ? num(b.deaths) : '–'}</td><td class="num">${b.cas ? num(b.cas) : '–'}</td><td class="mono">${b.lat == null ? 'Not mapped' : 'Mapped'}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">No battles or operations recorded in Wikidata.</td></tr>';
    $('#battles-rows').querySelectorAll('[data-b]').forEach(el => el.onclick = () => openBattle(w.battles.find(x => x.q === el.dataset.b)));
  } else if (state.view === 'months') {
    const begun = new Map();
    for (const b of w.battles) if (b.p !== 'y') begun.set(b.s.slice(0, 7), (begun.get(b.s.slice(0, 7)) || 0) + 1);
    $('#months-title').textContent = `${w.name} · battle deaths by month${p ? ` · ${periodLabel()} highlighted` : ''}`;
    // The month shown is highlighted, or every month of the period; the list keeps the month shown in view.
    $('#months-rows').innerHTML = w.months.map((mm, k) => {
      const clashes = (w.cells[k] || []).reduce((s, c) => s + (c[3] || 0), 0), cls = k === i ? 'sel end' : p && k >= state.f && k < i ? 'sel' : '';
      return `<tr data-k="${k}"${cls ? ` class="${cls}"` : ''}><td><button type="button" class="rowbtn">${esc(monthLabel(mm))}</button></td><td class="num">${w.estimated[k] ? '~' : ''}${num(w.deaths[k])}</td>
        <td class="num">${num(cumulative[k])}</td><td class="num">${begun.get(mm) || '–'}</td><td class="num">${w.events ? num(clashes) : '–'}</td></tr>`;
    }).join('');
    // A month goes to it, keeping the period's start; one before the start widens the period to begin there, as a
    // battle's "Go to" does (moving the end there would pull the start along, to a one-month period).
    $('#months-rows').querySelectorAll('tr[data-k]').forEach(tr => tr.onclick = () => {
      const k = +tr.dataset.k;
      if (isPeriod() && k < state.f) setPeriod(state.war.months[k], state.war.months[state.m]); else setMonth(k);
    });
    $('#months-rows tr.end')?.scrollIntoView({ block: 'nearest' });
  }
}
const VIEWS = ['map', 'battles', 'months'];
const TABS = [...document.querySelectorAll('[role="tab"]')];
function setView(v, { push = true } = {}) {
  state.view = VIEWS.includes(v) ? v : 'map';
  for (const t of TABS) {
    const on = t.dataset.view === state.view;
    t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    $('#' + t.getAttribute('aria-controls')).hidden = !on;
  }
  hideTip();
  if (state.view === 'map' && state.war && projection) fitProjection();
  renderTables();
  if (push) writeHash();
}
TABS.forEach((t, k) => {
  t.onclick = () => setView(t.dataset.view);
  t.onkeydown = e => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!d) return;
    const n = TABS[(k + d + TABS.length) % TABS.length]; n.focus(); setView(n.dataset.view);
  };
});

/* ---------------------------------------------------------------- timeline, playback, routing */
// The months shown (design/prp-period.js): the start rests on the war's first month, so the page shows the war up to
// the month shown, as before; moved, it sets a period. ‹ ›, ← →, the end handle and play move the month shown (play
// runs from the start handle, at the chosen speed); every move by the reader lands in onChange.
const fromPeriod = p => { state.f = p.fromIndex; state.m = p.toIndex; state.atRest = p.atRest; };
const period = PRPPeriod.mount($('#timeline'), {
  rest: 'first', labels: monthLabel,
  ids: { from: 'month-from', to: 'month', prev: 'prev', play: 'play', next: 'next' },
  names: { from: 'First month of the period', to: 'Month shown, or the last of the period', prev: 'Previous month', next: 'Next month' },
  play: { interval: () => +$('#speed').value, label: 'Play month by month' },
  strip: (svg, p) => renderSpark(svg, p),
  onChange: p => { fromPeriod(p); draw(false); writeHash(); },
});
// The period from code (the address, a table row, a battle's month, Documentary mode), in months: a start after the
// end becomes the end, and a start of null rests on the war's first month.
function setPeriod(from, to, { push = true } = {}) {
  if (!state.war) return;
  fromPeriod(period.set(from, to, { silent: true }));
  draw(false);
  if (push) writeHash();
}
// Move the month shown, keeping the period's start (the start comes back with it if the month is before it).
function setMonth(k) {
  const w = state.war; if (!w) return;
  const p = period.get();
  setPeriod(p.atRest ? null : p.from, w.months[Math.max(0, Math.min(w.months.length - 1, k))]);
}
$('#speed').onchange = () => { if (period.get().playing) { period.stop(); period.play(); } };

/* ---------------------------------------------------------------- documentary narration */
// Told month by month for PRP Documentary mode (design/jdpi-narrator.js asks for one step at a time).
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
function spokenNumber(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')} million`;
  if (n >= 1e4) return Math.round(n / 1000).toLocaleString('en-GB') + ' thousand';
  if (n >= 1000) return (Math.round(n / 100) * 100).toLocaleString('en-GB');
  return String(Math.round(n / 10) * 10 || n);
}
// Countries said with "the" (the Soviet Union, the United States…); cap() for the start of a sentence.
const the = n => (/^(Soviet Union|United (States|Kingdom|Arab Emirates)|Netherlands|Philippines|Czech Republic|Dominican Republic|Central African Republic|Gambia|Bahamas|Democratic Republic|Republic of)/.test(n) ? 'the ' + n : n);
const cap = s => s.replace(/^./, c => c.toUpperCase());
const plainName = n => n.replace(/\s*\([^)]*\)/g, '').trim(); // "Iran (Persia)" → "Iran"
const listNames = l => { l = l.map(n => the(plainName(n))); return l.length <= 2 ? l.join(' and ') : `${l.slice(0, -1).join(', ')} and ${l.at(-1)}`; };
// Side labels said as groups: "the Allies", "the Axis"; others ("Finland", "South Korea & UN forces") as they are.
const sideName = label => (/^(Allies|Axis)$/.test(label) ? 'the ' + label : label);
// Battle names as spoken: "The Battle of Kiev begins", "The Iași pogrom begins", "Operation Barbarossa begins".
function battleLine(b) {
  const n = b.n.replace(/^the /i, '');
  const common = /^(battle|siege|offensive|invasion|campaign|capture|liberation|occupation|bombing|landing|evacuation)\b/i.test(n) || /\b(pogrom|massacre|attack|raid|uprising|campaign|offensive|convoys?|front|participation|bombing|landing)\b/.test(n);
  const subject = /^Operation\b/.test(n) ? n : common ? `The ${n}` : cap(n);
  return `${subject} ${b.s === b.e ? 'takes place' : /\bconvoys\b|s of\b/.test(n) ? 'begin' : 'begins'}.`;
}
function changes(i) {
  const w = state.war, d = dateOf(i), p = i ? dateOf(i - 1) : null;
  if (!p) return [];
  const gws = new Set([...w.sides.a.states, ...w.sides.b.states].map(s => s.gw).concat(w.control.map(c => c.gw)));
  const featAt = (gw, date) => features.find(f => f.properties.gw === gw && f.properties.s <= date && f.properties.e >= date);
  const label = s => sideName(s === 'a' ? w.sides.a.label : w.sides.b.label);
  const events = [];
  for (const gw of gws) {
    const now = sideOf(gw, d), before = sideOf(gw, p), f = featAt(gw, d) || featAt(gw, p);
    if (!f || now === before) continue;
    const raw = plainName(displayName(gw, f.properties.name, d)), name = cap(the(raw));
    let kind, text;
    if (now.startsWith('occ-')) { kind = 'occ'; text = `${name} is occupied by ${label(now.slice(4))}.`; }
    else if (before.startsWith('occ-')) { kind = 'free'; text = now ? `${name} is liberated.` : `The occupation of ${the(raw)} ends.`; }
    else if (now.startsWith('side-') && before.startsWith('side-')) { kind = 'switch'; text = `${name} changes sides, joining ${label(now.slice(5))}.`; }
    else if (now.startsWith('side-')) { kind = 'join' + now.slice(5); text = `${name} enters the war on the side of ${label(now.slice(5))}`; }
    else if (before.startsWith('side-')) { kind = 'leave'; text = `${name} leaves the war.`; }
    if (kind) events.push({ kind, text, gw, area: d3.geoArea(f) });
  }
  // Largest countries first; when several join one side at once, name the two largest and count the rest. Each line
  // keeps the states it is about (all the joiners, counted or named), for the map.
  events.sort((a, b) => b.area - a.area);
  const out = [];
  for (const k of ['joina', 'joinb']) {
    const js = events.filter(e => e.kind === k);
    if (js.length) out.push({ text: js[0].text + (js.length > 1 ? `, ${js.length > 2 ? `with ${js.length - 1} other states and territories` : `as does ${js[1].text.split(' enters')[0].replace(/^The /, 'the ')}`}.` : '.'), gws: js.map(e => e.gw) });
  }
  out.push(...events.filter(e => !e.kind.startsWith('join')).slice(0, 4).map(e => ({ text: e.text, gws: [e.gw] })));
  return out;
}
// A month as told, and where it happens: the states that join, leave or change hands, the battles that begin or end,
// and the deadliest clash (the month's deadliest UCDP cell). A month with none of these shows the whole theatre.
function monthStory(i) {
  const w = state.war, m = w.months[i], parts = [monthLabel(m) + '.'], gws = [], qids = [], points = [];
  if (i === 0) {
    const a = statesOn('a', dateOf(0)), b = statesOn('b', dateOf(0));
    if (a.length || b.length) parts.push(`On one side, ${a.length ? listNames(a.slice(0, 5)) : w.sides.a.label}; on the other, ${b.length ? listNames(b.slice(0, 5)) : w.sides.b.label}.`);
  }
  for (const c of changes(i).slice(0, 4)) { parts.push(c.text); gws.push(...c.gws); }
  const begun = w.battles.filter(b => b.p !== 'y' && b.s.slice(0, 7) === m).sort((x, y) => (y.deaths || 0) - (x.deaths || 0) || !!y.w - !!x.w).slice(0, 3);
  for (const b of begun) parts.push(battleLine(b));
  const ended = w.battles.filter(b => b.p !== 'y' && b.e && b.e !== b.s && b.e.slice(0, 7) === m && (b.deaths || 0) >= 10000).slice(0, 2);
  for (const b of ended) parts.push(`The ${b.n.replace(/^the /i, '')} ends, at a cost of some ${spokenNumber(b.deaths)} lives.`);
  qids.push(...[...begun, ...ended].filter(b => b.lat != null).map(b => b.q));
  if (w.deaths[i] > 0) parts.push(`${w.estimated[i] ? 'An estimated' : 'Some'} ${spokenNumber(w.deaths[i])} die in battle this month, bringing the toll to about ${spokenNumber(cumulative[i])}.`);
  const top = w.top[i]?.[0];
  if (top && top[1] >= 20) {
    parts.push(`The deadliest recorded clash is at ${String(top[2]).replace(/\s*\(.*\)$/, '')}, where ${spokenNumber(top[1])} are killed.`);
    const cell = (w.cells[i] || []).reduce((a, c) => (!a || c[2] > a[2] ? c : a), null);
    if (cell) points.push([cell[1], cell[0]]);
  }
  if (parts.length === 1) parts.push('The fighting continues.');
  const focus = gws.length || qids.length || points.length ? { countries: [...new Set(gws)].map(gw => `gw:${gw}`), qids, points, padding: 48 } : { reset: true };
  return { text: parts.join(' '), focus };
}
window.jdpiDocumentary = {
  get title() { return state.war ? `War Focus · ${state.war.name}` : 'War Focus'; },
  async *story() {
    period.stop();
    const w = state.war;
    let intro = `${w.name}. ${fmtDate(w.start)} to ${w.end ? fmtDate(w.end) : 'the present day'}: ${w.sides.a.label} against ${w.sides.b.label}.`;
    try {
      const s = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(w.wiki.replace(/ /g, '_'))}`).then(r => r.json());
      // The first sentences: a full stop inside a number ("3.5 million") or after "U.S." does not end one.
      const said = window.jdpiNarrator?.sentences?.(s.extract || '') || (s.extract || '').match(/(?:[^.!?]|[.!?](?=\S))+[.!?]*/g) || [];
      if (said.length) intro += ' ' + said.slice(0, 3).join(' ').trim();
    } catch {}
    intro += ` In all, about ${spokenNumber(w.totalDeaths)} died in battle${w.ongoing ? ' so far' : ''}.`;
    yield { text: intro, el: document.querySelector('#panel h2'), focus: { reset: true } };
    // Month by month, the war so far to each (whatever period was set), as the narration counts it.
    for (let i = state.m; i < w.months.length; i++) {
      if (state.war !== w) return;
      setPeriod(null, w.months[i]); await sleepMs(500);
      const { text, focus } = monthStory(i);
      yield { text, el: document.querySelector('.counters'), focus };
      const next = w.months[i + 1];
      if (next && next.slice(0, 4) !== w.months[i].slice(0, 4)) yield { chapterEnd: true, label: `Continue to ${next.slice(0, 4)}` };
    }
    yield { text: w.end ? `The war ended on ${fmtDate(w.end)}. About ${spokenNumber(w.totalDeaths)} had died in battle.` : `The war goes on. The record here runs to ${fmtDate(w.dataThrough)}, with about ${spokenNumber(w.totalDeaths)} battle deaths so far.`, el: document.querySelector('#panel h2'), focus: { reset: true } };
  },
};

// The address: exactly #war=…&m=…[&v=…] while the start rests (the shell's deep links and Kino rely on it), with
// &f=<first month> after m for a period.
function writeHash() {
  if (!state.war) return;
  const f = PRPPeriod.rules.startParam(period.get());
  history.replaceState(null, '', `#war=${state.war.id}&m=${state.war.months[state.m]}${f != null ? `&f=${f}` : ''}${state.view !== 'map' ? `&v=${state.view}` : ''}`);
}
async function loadWar(id, month, from = null) {
  period.stop();
  const w = await fetch(`data/wars/${id}.json`).then(r => r.json());
  state.war = w; cumulative = []; w.deaths.reduce((s, v, k) => (cumulative[k] = s + v), 0);
  $('#war').value = id;
  // Ticks every few months or years, by the war's length; a month the war does not have opens at its first.
  const step = w.months.length > 150 ? 60 : w.months.length > 60 ? 24 : w.months.length > 24 ? 12 : w.months.length > 8 ? 3 : 1;
  const ticks = w.months.filter((m, k) => k % step === 0).map((m, k) => ({ at: m, text: step >= 12 ? m.slice(0, 4) : m.slice(2).replace('-', '/'), kind: k % 2 ? 'minor' : 'key' })); // every other one drops out on narrow screens
  const to = w.months.includes(month) ? month : w.months[0];
  fromPeriod(period.update({ stops: w.months, ticks, from: PRPPeriod.rules.readStart(w.months, from, to, 'first'), to }));
  $('#status').innerHTML = `<span><b>${esc(w.sides.a.label)}</b> v <b>${esc(w.sides.b.label)}</b></span><span>${esc(fmtDate(w.start))} – ${w.end ? esc(fmtDate(w.end)) : 'ongoing'}</span>${w.ongoing && w.dataThrough ? `<span>Data through <b>${esc(fmtDate(w.dataThrough))}</b></span>` : ''}<span><b>${state.index.wars.length}</b> major wars since 1926</span>`;
  hits.gws.clear(); hits.qids.clear(); focusFit = null;
  fitProjection(); writeHash();
}
function readHash() { const p = new URLSearchParams(location.hash.slice(1)); return { war: p.get('war'), m: p.get('m'), f: p.get('f'), v: VIEWS.includes(p.get('v')) ? p.get('v') : 'map' }; }
// Another war loads; another month or period of the same war moves the timeline (no f: the start back at rest).
window.addEventListener('hashchange', () => {
  const h = readHash();
  if (h.v !== state.view) setView(h.v, { push: false });
  if (h.war && h.war !== state.war?.id) return loadWar(h.war, h.m, h.f);
  if (!state.war || !(h.m || h.f)) return;
  const w = state.war, to = w.months.includes(h.m) ? h.m : w.months[state.m], from = PRPPeriod.rules.readStart(w.months, h.f, to, 'first'), p = period.get();
  if (to !== p.to || from !== PRPPeriod.rules.startParam(p)) setPeriod(from, to, { push: false });
});

{ const a = $('#sibling'); a.href = go('battlefield-history', 'battlefield/history/index.html'); a.target = embedded ? '_top' : '_self'; }
Promise.all([fetch('data/index.json').then(r => r.json()), fetch('../history/data/borders.topo.json').then(r => r.json())]).then(([idx, borders]) => {
  state.index = idx; state.borders = borders;
  const eras = [['1926–1945', w => w.start < '1946'], ['1946–1988', w => w.start >= '1946' && w.start < '1989'], ['1989 to today', w => w.start >= '1989']];
  $('#war').innerHTML = eras.map(([l, f]) => `<optgroup label="${l}">${idx.wars.filter(f).map(w => `<option value="${w.id}">${esc(w.name)} (${w.start.slice(0, 4)}–${w.end ? w.end.slice(0, 4) : 'now'})</option>`).join('')}</optgroup>`).join('');
  $('#war').onchange = e => loadWar(e.target.value);
  initMap();
  const h = readHash();
  setView(h.v, { push: false });
  loadWar(idx.wars.some(w => w.id === h.war) ? h.war : 'ww2', h.m, h.f);
}).catch(e => { $('#status').textContent = 'War data could not load: ' + e.message; });
