// War Focus (PRP · Retrospective Geopolitics): one war, month by month. Data: data/index.json and data/wars/<id>.json
// (scripts/build.mjs); borders from Retrospective Battlefield's CShapes file. Wars and battles carry their Wikidata IDs
// (data-qid), so the PRP entity linker adds Master Index links, and lake/scripts/adapters.mjs links the Master Index back here.
// Views (tabs): the map, a table of the war's battles and a table of deaths by month. All follow the timeline
// (design/prp-period.js): its start rests on the war's first month, so the map shows the war up to the month shown, as
// before; moved, it sets a period of months, whose deaths, battles and clashes the page shows instead.
// URL: #war=<id>&m=<yyyy-mm, the month shown or the period's last>[&f=<yyyy-mm, the period's first>]&v=battles|months
import { displayName } from '../history/names.mjs';
import { deaths as shown, noun, count, estimateOf, groupBattles, figureText, plural, endLine, leftToParts, markValue, LATE, figureLine, kindWords, rangeText, ownFigure, shownFigure, sourceNote, deadliest as rankDeadliest, deadliestNote, completeness, completenessText, stateOf, searched, COW_CITE, beforeWarNote, wikipediaIntro } from './figures.mjs';
import { sideOf as sideAt, periodSides, inRange, runText } from './sides.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Math.round(n).toLocaleString('en-GB');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthLabel = m => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
// One formatter for every date: toLocaleDateString with options builds a new one on each call, and a long war's battle
// list formats thousands of dates (seconds of a slow machine's time, with the shell and Kino waiting on the same thread).
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fmtDate = d => { if (!d) return ''; const t = new Date(d + 'T00:00:00Z'); return Number.isNaN(+t) ? 'Invalid Date' : DAY.format(t); };
// A battle's dates at the precision Wikidata records (p: 'm' month, 'y' year; pe the end's when it differs, 'd' a day).
// With no end to show (u, scripts/rules.mjs), its start and why: none recorded, or Wikidata's end (eW) before its
// start or after the war's end, which is not drawn as a span.
const END_NOTE = { end: 'end not recorded', order: 'dates uncertain: Wikidata ends it before its start', after: 'Wikidata ends it after the war' };
// A battle Wikidata dates only to its decade (s null) has no date to show; one whose Wikidata end is over a month after
// its Wikipedia article's (u 'conflict', scripts/rules.mjs endAgainstArticle) is drawn to the article's, and says so.
// A battle whose start falls before the war's says so after its dates (figures.mjs beforeWarNote, S0).
const bDates = b => { const d = bDatesOnly(b), early = beforeWarNote(b, state.war?.start); return early ? `${d} · ${early}` : d; };
const bDatesOnly = b => {
  const f = (d, p) => (p === 'y' ? d.slice(0, 4) : p === 'm' ? monthLabel(d.slice(0, 7)) : fmtDate(d));
  if (!b.s) return `date not recorded${b.dec != null ? ` (Wikidata gives only the decade, the ${b.dec}s)` : ''}`;
  const a = f(b.s, b.p);
  if (!b.e) return b.u ? `${a} · ${END_NOTE[b.u] || 'end uncertain'}${b.eW ? ` (${fmtDate(b.eW)})` : ''}` : a;
  const z = f(b.e, b.pe === 'd' ? null : b.pe || b.p);
  const span = a === z ? a : `${a} – ${z}`;
  return b.u === 'conflict' && b.eW ? `${span} · end uncertain: Wikidata ends it ${fmtDate(b.eW)}, its Wikipedia article ${z}` : span;
};
const battleOf = q => state.war.battles.find(x => x.q === q) || state.war.undated.find(x => x.q === q);
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
// sides.mjs: a state's side at a date, and over a period every month between the handles (16 November 2026).
const sideOf = (gw, date) => sideAt(state.war, gw, date);
// The months of the period shown, each with the date read for it (dateOf).
const periodDates = () => { const out = []; for (let k = state.f; k <= state.m; k++) out.push({ m: state.war.months[k], d: dateOf(k) }); return out; };
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
// A mark's size from the deaths it alone stands for (nodeOf(b).drawn, loadWar): a whole whose parts are on the map
// with their own figures is drawn by what its figure has beyond theirs, so the same deaths are not drawn twice (the
// atomic bombings of Hiroshima and Nagasaki, a small mark over its two parts'); casualties only where no deaths are
// recorded in it at all, and never for a part under a whole whose deaths hold the same people (figures.mjs markValue).
const R = b => { const n = nodeOf(b); return Math.min(16, 3.2 + Math.sqrt(n ? markValue(n) : b.deaths || b.cas || 0) / 22); };
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
  // Over a period, every month between the handles (sides.mjs periodSides): a state is coloured by its side in the last
  // month; one on a side only earlier in the period is drawn faded with a broken outline in the side it last held; a
  // change of side or occupation at any month is outlined. Borders are the last month's.
  const ps = p ? periodSides(w, [...new Set(live.map(f => f.properties.gw))], periodDates()) : null;
  const look = gw => { const s = sideOf(gw, date), x = ps?.get(gw); return { s, cls: s || (x?.earlier ? `${x.held} earlier` : ''), changed: !!x?.changed, runs: x?.runs || [] }; };
  state.changed = p ? live.filter(f => look(f.properties.gw).changed).length : 0; // for the legend
  state.earlier = p ? live.filter(f => ps.get(f.properties.gw)?.earlier).length : 0;
  gStates.selectAll('path').data(live, f => f.properties.gw + f.properties.s).join('path')
    .attr('d', path)
    .attr('class', f => { const gw = f.properties.gw, l = look(gw); const was = prevDate ? sideOf(gw, prevDate) : l.s; return `state ${l.cls}${!full && l.s !== was ? ' joined' : ''}${l.changed ? ' changed' : ''}${hits.gws.has(gw) ? ' prp-focus-hit' : ''}`; })
    .on('mousemove', (e, f) => {
      const gw = f.properties.gw, l = look(gw);
      // Over a period, each side it held and when, month by month (a state on none of them in the last month says so).
      const when = p && (l.changed || !l.s) && l.runs.length ? `<span class="tip-when">${l.runs.map(r => `${esc(cap(sideWord(r.side)))}: ${esc(runText(r))}`).join('<br>')}</span>` : '';
      tip(e, `<strong>${esc(displayName(gw, f.properties.name, date))}</strong>${l.s ? sideText(l.s) : l.runs.length ? `<br>Not at war in ${esc(monthLabel(m))}` : ''}${when}`);
    })
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
    .on('mousemove', (e, d) => tip(e, `<strong>${count(d[2], 'death', 'deaths', num)}</strong>${count(d[3], 'recorded clash', 'recorded clashes', num)}${p ? `, ${esc(periodLabel())}${d[4] ? '' : ` (none in ${esc(monthLabel(m))})`}` : d[4] ? '' : ' (earlier month)'}`)).on('mouseleave', hideTip);
  // Battles: started by this month; those under way in it bright and ringed, those of the period bright, older ones faded.
  const shown = w.battles.filter(b => b.lat != null && b.s.slice(0, 7) <= m);
  const isNow = b => underWay(b, m, m), inP = b => p && underWay(b, a, m);
  gBattles.selectAll('circle.ring').data(shown.filter(isNow), b => b.q).join('circle').attr('class', 'ring')
    .attr('cx', b => projection([b.lon, b.lat])[0]).attr('cy', b => projection([b.lon, b.lat])[1]);
  gBattles.selectAll('circle.battle').data(shown, b => b.q).join('circle')
    .attr('class', b => `battle ${isNow(b) ? 'now' : inP(b) ? 'in' : 'past'}${hits.qids.has(b.q) ? ' prp-focus-hit' : ''}`)
    .attr('cx', b => projection([b.lon, b.lat])[0]).attr('cy', b => projection([b.lon, b.lat])[1])
    .on('mousemove', (e, b) => tip(e, `<strong>${esc(b.n)}</strong>${esc(bDates(b))}${figureOf(b) ? `<br>${esc(figureOf(b))}` : ''}${relation(b) ? `<br>${esc(relation(b))}` : ''}`))
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
// The running total to each month, and whether an estimated month is in it by then (the total is then an estimate too).
let cumulative = [], estimatedTo = [];
// The war so far to the month shown, as before; over a period, the period's deaths and battles beside the running total.
function renderCounters() {
  const w = state.war, i = state.m, m = w.months[i], p = isPeriod(), a = w.months[state.f];
  $('#date-label').textContent = p ? 'Period' : 'Month';
  $('.counters').classList.toggle('is-period', p);
  $('#date').textContent = periodLabel();
  $('#c-total').textContent = shown(cumulative[i], estimatedTo[i], { total: i > 0 });
  const pd = periodDeaths(), est = p ? pd.est : !!w.estimated[i], n = p ? pd.deaths : w.deaths[i];
  $('#c-month-label').textContent = p ? 'In the period' : 'This month';
  // Beside the figure, whose it is: an estimate and its source, or UCDP's own count (with the share of events UCDP
  // dates only to a longer period, scripts/rules.mjs eventMonths); a month outside its source's years has no figure.
  const shared = w.shared ? w.shared.slice(p ? state.f : i, i + 1).reduce((s, v) => s + v, 0) : 0;
  const covered = !w.covered || (m >= w.covered[0] && (p ? a : m) <= w.covered[1]);
  $('#c-month').textContent = covered ? shown(n, est) : '–';
  $('#c-month-note').textContent = est ? `Estimate from ${estimateOf(w.deathsSource)}` : !covered ? 'No figure in the source' : n ? (shared ? `UCDP, ${num(shared)} spread from periods` : 'As recorded by UCDP') : 'None recorded';
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
  if (p && state.earlier) items.push('<li><span class="swatch earlier"></span>On a side earlier in the period, not in its last month</li>');
  if (p && state.changed) items.push('<li><span class="swatch changed"></span>Side or occupation changed during the period</li>');
  if (w.battles.some(b => b.lat != null)) items.push(p
    ? `<li><span class="swatch dot b-now"></span>Battle under way in ${esc(m)}</li><li><span class="swatch dot b-in"></span>Battle in the period</li><li><span class="swatch dot b-past"></span>Earlier battle</li>`
    : '<li><span class="swatch dot b-now"></span>Battle this month</li><li><span class="swatch dot b-past"></span>Earlier battle</li>');
  if (w.events) items.push(`<li><span class="swatch dot clash"></span>Recorded clashes (UCDP)${p ? ', by place' : ''}</li>`);
  $('#legend').innerHTML = `<h4>${esc(periodLabel())}</h4><ul>${items.join('')}</ul>`;
}
function renderCaption() {
  const w = state.war, m = monthLabel(w.months[state.m]);
  if (!isPeriod()) { $('#caption').textContent = `${w.name}, ${m}: the states at war coloured by side (${w.sides.a.label} blue, ${w.sides.b.label} red) on the borders of the day${w.control.length ? ', hatched while wholly occupied' : ''}${w.theatre.length ? ', the contested state in amber' : ''}; battles under way are ringed${w.events ? ', UCDP clashes in red' : ''}.`; return; }
  $('#caption').textContent = `${w.name}, ${periodLabel()}: the states at war coloured by their side in ${m} (${w.sides.a.label} blue, ${w.sides.b.label} red) on its borders${w.control.length ? ', hatched while wholly occupied' : ''}${w.theatre.length ? ', the contested state in amber' : ''}${state.earlier ? ', those on a side only earlier in the period faded with a broken outline in the side they last held' : ''}${state.changed ? ', and outlined where their side or occupation changed in any month of the period' : ''}; battles under way in the period are drawn full and those under way in ${m} ringed${w.events ? '; UCDP clashes of the period are grouped by place, in red, sized by deaths a month and faded where none fell in its last month' : ''}.`;
}

/* ---------------------------------------------------------------- panel */
const popouts = new Map();
const addPop = (title, html) => { const id = 'p' + popouts.size; popouts.set(id, { title, html }); return id; };
// `full`, where the window's list is longer than the panel's lines (a whole's parts cut to a few in the panel).
function seeMoreList(items, limit, title, cls = '', full = null) {
  const ul = cls ? `<ul class="blist ${cls}">` : '<ul class="blist">';
  if (items.length <= limit && !full) return `${ul}${items.join('')}</ul>`;
  return `${ul}${items.slice(0, limit).join('')}</ul><button class="more" data-pop="${addPop(title, `${ul}${(full || items).join('')}</ul>`)}">See all ${items.length} ›</button>`;
}
// A whole and its parts (figures.mjs groupBattles, built in loadWar): each battle's node, its figure in words, and
// what it is part of or has as parts in this war's list.
const nodeOf = b => state.war?.groups?.byQ.get(b.q);
// Every battle shows a figure with its kind, a recorded zero, "Figures not read" or "No figure found" (BF-08): never nothing.
const figureOf = b => { const n = nodeOf(b); return n ? figureLine(n) : b.deaths ? count(b.deaths, 'death', 'deaths', num) : b.cas ? count(b.cas, 'casualty', 'casualties', num) : 'No figure found'; };
function relation(b, { under = false } = {}) {
  const n = nodeOf(b); if (!n) return '';
  const out = [];
  if (n.up && !under) out.push(`part of ${n.up.b.n}`);
  if (n.parts.length) out.push(`${count(n.parts.length, 'part')} listed${n.shown.length && n.shown.length < n.parts.length ? `, ${n.shown.length} with figures` : ''}`);
  return out.join(' · ');
}
// One line of a list; `inner`, a whole's parts under it (the deadliest battles), `under` when it stands under its whole.
function battleItem(b, { inner = '', under = false } = {}) {
  // The Wikidata ID sits on the name, so the Master Index linker puts its ◈ beside it (and not again by the Wikipedia link).
  const fig = figureOf(b), rel = relation(b, { under });
  return `<li data-q="${esc(b.q)}"${inner ? ' class="whole"' : ''}><button class="bname" data-b="${esc(b.q)}" data-qid="${esc(b.q)}">${esc(b.n)}</button>${b.w ? `<a class="wl jdpi-no-ency" href="${wikiUrl(b.w)}" target="_blank" rel="noreferrer">Wikipedia ↗</a>` : ''}
    <small>${esc(bDates(b))}${fig ? ` · ${esc(fig)}` : ''}${rel ? ` · ${esc(rel)}` : ''}${b.lat == null ? ' · not mapped' : !b.s ? ' · not on the map' : ''}</small>${inner}</li>`;
}
// The deadliest battles: each entry with no whole above it, a whole as a heading over its parts with figures, largest
// first; in the panel (`few`) three parts a heading, the rest counted and in the window's full list.
function rankedItem(n, { under = false, few = 0 } = {}) {
  const parts = few ? n.shown.slice(0, few) : n.shown, more = n.shown.length - parts.length;
  const inner = n.shown.length ? `<ul class="blist parts">${parts.map(p => rankedItem(p, { under: true, few })).join('')}${more ? `<li class="more-parts">and ${more} more ${noun(more, 'part')} with figures (See all)</li>` : ''}</ul>` : '';
  return battleItem(n.b, { under, inner });
}
// The states on a side that month, largest first, so the major powers lead the list.
function statesOn(side, date) {
  const found = state.war.sides[side].states.filter(s => inRange(date, s.from, s.to))
    .map(s => features.find(f => f.properties.gw === s.gw && f.properties.s <= date && f.properties.e >= date)).filter(Boolean)
    .sort((a, b) => d3.geoArea(b) - d3.geoArea(a));
  return [...new Set(found.map(f => displayName(f.properties.gw, f.properties.name, date)))];
}
// Month by Month (monthly/data, design/prp-mark.js): the latest month's mark for an ongoing war, with its explanation,
// in the panel when that month is shown; and every war's year strip above the Deaths by month table. VM's own
// calculation from the figures this page shows, never a judgement.
let MARKS = null;
const strips = new Map();
window.PRPMark?.load().then(m => { MARKS = m; if (state.war) { renderPanel(); if (state.view === 'months') renderMonthsStrip(); } });
const stripOf = id => strips.get(id) || strips.set(id, window.PRPMark ? PRPMark.loadStrip('focus-' + id) : Promise.resolve(null)).get(id);
const markHtml = (w, m) => {
  const u = MARKS && window.PRPMark ? PRPMark.unitOf(MARKS, 'focus:' + w.id) : null;
  return u && u.fighting.month === m ? `<h3>Month by Month · ${esc(PRPMark.monthName(m))}</h3>${PRPMark.full(u.fighting, u)}` : '';
};
async function renderMonthsStrip() {
  const box = $('#months-strip'), w = state.war;
  if (!box || !w || !window.PRPMark) return;
  const s = await stripOf(w.id);
  if (state.war !== w) return;
  box.innerHTML = s ? PRPMark.strip(s) : '';
  PRPMark.wire(box);
}

function renderPanel() {
  popouts.clear();
  const w = state.war, i = state.m, m = w.months[i], date = dateOf(i), p = isPeriod(), a = p ? w.months[state.f] : m;
  // Under way this month, or at some point in the period: those starting in it first, then the shortest, so war-long
  // campaigns sink.
  const span = b => Date.parse(b.e || b.s) - Date.parse(b.s), begins = b => b.s.slice(0, 7) >= a && b.s.slice(0, 7) <= m;
  const now = w.battles.filter(b => underWay(b, a, m)).sort((x, y) => begins(y) - begins(x) || span(x) - span(y));
  // Each death once (figures.mjs groupBattles): wholes and lone battles, a whole's parts under it, never beside it.
  // Ranked by deaths only, by the lowest figure given (figures.mjs deadliest); a battle dated only to its decade is in no
  // month, so it is counted, not ranked, as before.
  const dl = rankDeadliest(w.groups), deadliest = dl.ranked.filter(n => n.b.s), undatedRanked = dl.ranked.length - deadliest.length;
  const dlShown = { ...dl, ranked: deadliest, estimates: deadliest.filter(n => n.kind === 'estimate').length, disputed: deadliest.filter(n => n.kind === 'disputed').length, none: dl.none + undatedRanked };
  const months = w.months.length, years = Math.floor(months / 12);
  const sides = ['a', 'b'].map(s => {
    const on = statesOn(s, date), list = on.length > 14 ? `${on.slice(0, 14).join(', ')} <button class="more" data-pop="${addPop(`${w.sides[s].label}, ${monthLabel(m)}`, `<p>${esc(on.join(', '))}</p>`)}">+${on.length - 14} more</button>` : esc(on.join(', '));
    return `<div class="side-chip"><i style="background:var(--side-${s})"></i><b>${esc(w.sides[s].label)}</b></div>${on.length ? `<div class="side-list">${list}</div>` : ''}`;
  }).join('');
  // The deadliest UCDP clashes of the month, or of all the period's months.
  // An event UCDP dates only to a period (it carries its last day and whole count) is one entry with its share of
  // the month, or of the period's months together.
  const merged = new Map();
  for (const c of (p ? w.top.slice(state.f, i + 1).flat() : (w.top[i] || []))) {
    const k = c[4] ? c.filter((_, j) => j !== 1).join('|') : Symbol(); const o = merged.get(k);
    if (o) o[1] += c[1]; else merged.set(k, [...c]);
  }
  const clashes = [...merged.values()].sort((x, y) => y[1] - x[1]).slice(0, p ? 8 : 5);
  const top = clashes.map(([d, deaths, where, dyad, de, all]) => `<li><b>${count(deaths, 'death', 'deaths', num)}</b> · ${esc(where || 'no place given')}<small>${de ? `${esc(fmtDate(d))} – ${esc(fmtDate(de))}, a share of ${num(all)}` : esc(fmtDate(d))} · ${esc(dyad)}</small></li>`);
  // Retrospective Battlefield shows the year, or the period's years as a period.
  const bfYear = Math.min(2025, +m.slice(0, 4)), bfFrom = Math.min(2025, +a.slice(0, 4)), bfPeriod = p && bfFrom < bfYear;
  const pd = periodDeaths();
  $('#panel').innerHTML = `
    <h2><span data-qid="${esc(w.qid || '')}">${esc(w.name)}</span></h2>
    <p class="sub">${esc(fmtDate(w.start))} – ${w.end ? esc(fmtDate(w.end)) : 'ongoing'} · ${years ? `${years} yr${years > 1 ? 's' : ''} ` : ''}${months % 12 ? `${months % 12} mo` : ''}</p>
    <div class="sides" style="margin-top:10px">${sides}</div>
    <div class="stat-row">
      <div class="stat"><span>Deaths, whole war</span><b>${shown(w.totalDeaths, estimatedTo.at(-1), { total: w.months.length > 1 })}</b><small>battle-related${w.ongoing ? `, to ${esc(fmtDate(w.dataThrough))}` : ''}${w.covered ? `, ${esc(monthLabel(w.covered[0]))} – ${esc(monthLabel(w.covered[1]))} only` : ''}</small></div>
      <div class="stat"><span>Battles &amp; operations</span><b>${num(w.battles.length + w.undated.length)}</b><small>${num(w.battles.filter(b => b.lat != null).length)} mapped${w.undated.length ? ` · ${num(w.undated.length)} undated` : ''} · <button type="button" class="fig-jump">figures for ${num(w.fig.figure)}</button></small></div>
      ${p ? `<div class="stat"><span>Deaths in the period</span><b>${shown(pd.deaths, pd.est)}</b><small>${Math.round(pd.deaths / Math.max(1, w.totalDeaths) * 100)}% of the war's total · ${shown(cumulative[i], estimatedTo[i], { total: i > 0 })} by ${esc(monthLabel(m))}</small></div>`
        : `<div class="stat"><span>Deaths so far</span><b>${shown(cumulative[i], estimatedTo[i], { total: i > 0 })}</b><small>${soFarNote(w, m, cumulative[i])}</small></div>`}
      <div class="stat"><span>Clashes recorded</span><b>${w.events ? num(w.events) : '–'}</b><small>${w.events ? 'UCDP geolocated events' : 'no event data before 1989'}</small></div>
    </div>
    ${p ? '' : markHtml(w, m)}
    <a class="btn" href="${wikiUrl(w.wiki)}" target="_blank" rel="noreferrer">Wikipedia ↗</a>
    ${w.bf ? `<a class="btn go" href="${esc(go('battlefield-history', `battlefield/history/index.html#y=${bfYear}${bfPeriod ? `&f=${bfFrom}` : ''}&w=${w.bf}`))}" target="${embedded ? '_top' : '_self'}">Open in Retrospective Battlefield: ${bfPeriod ? `${bfFrom}–${bfYear}` : bfYear} →</a>` : ''}
    <h3>${esc(periodLabel())} <span class="count">${count(now.length, 'battle')} or ${noun(now.length, 'operation')} under way</span></h3>
    ${now.length ? seeMoreList(now.map(b => battleItem(b)), 8, `${w.name} · ${periodLabel()}`) : `<p class="empty">No battles or operations recorded as under way ${p ? 'in the period' : 'this month'}.</p>`}
    ${top.length ? `<h3>Deadliest clashes ${p ? 'in the period' : 'this month'} <span class="count">UCDP</span></h3><ul class="blist">${top.join('')}</ul>` : ''}
    <h3>Deadliest battles of the war</h3>${deadliest.length ? seeMoreList(deadliest.map(n => rankedItem(n, { few: 3 })), 6, `${w.name} · battles by deaths`, 'deadliest', deadliest.some(n => n.shown.length) ? deadliest.map(n => rankedItem(n)) : null) : '<p class="empty">No battle of this war has a deaths figure.</p>'}
    <p class="fig-note" id="deadliest-note">${esc(deadliestNote(dlShown))}</p>
    <h3>All battles &amp; operations <span class="count">${w.battles.length + w.undated.length}</span></h3><p class="fig-note" id="fig-complete">${esc(completenessText(w.fig))}</p>${w.battles.length + w.undated.length ? seeMoreList([...w.battles, ...w.undated].map(b => battleItem(b)), 5, `${w.name} · all battles`) : '<p class="empty">None recorded in Wikidata.</p>'}
    <p class="src-note"><b>Deaths:</b> ${esc(w.deathsSource)}.${/^Correlates of War/.test(w.deathsSource) ? ` Cited as the Correlates of War asks: ${esc(COW_CITE.text)} (<a href="${COW_CITE.url}" target="_blank" rel="noopener">${COW_CITE.url}</a>).` : ''}${w.estimated.some(Boolean) ? ` Figures marked ~ are estimates from ${esc(estimateOf(w.deathsSource))}, shared out over the months, not counts: a month or a period is rounded to two significant figures, a total that includes such months to three.` : ''}
      <b>Battles &amp; operations:</b> Wikidata battles, sieges and military operations recorded as part of this war; dates as recorded there, an end more than a month after the battle's Wikipedia article's drawn to the article's and marked uncertain${w.undated.length ? '; a battle Wikidata dates only to the decade is listed as undated, in no month' : ''}.
      <b>Battle figures:</b> ${esc(FIGURE_METHOD)}
      <b>Wholes and their parts:</b> where Wikidata records an operation and its own parts and both are listed here (one part of the other, or the other among its parts), each death is counted once: the whole is shown as a heading over its parts, never ranked beside them, ranked by the figure recorded for the whole where there is one, else by the sum of its parts' recorded figures, and says which it is (where its parts' figures add up to more than the whole's own, that is said beside it); a figure Wikidata gives the whole that is one of its parts' own is left to that part, and a part of two wholes is counted under one of them, which its window names. A figure counted long after the event (the atomic bombings' registers of the dead, counted to 2013) gives the year it was counted, beside the share counted then: such a count can include people who died of their injuries in later years. On the map a whole is drawn only by what its figure has beyond its parts' marks. The count of battles and operations counts the whole and each part, as Wikidata lists them.
      <b>Territory:</b> CShapes borders as they stood that month${w.control.length ? ', with whole countries hatched while occupied' : ''}${w.theatre.length ? '; the contested state is shaded as a whole' : ''}. Front lines are not drawn: no open data records them month by month.</p>`;
  $('#panel').querySelectorAll('[data-b]').forEach(b => b.onclick = () => openBattle(battleOf(b.dataset.b)));
  $('#panel').querySelectorAll('[data-pop]').forEach(b => b.onclick = () => openPop(popouts.get(b.dataset.pop)));
  // Beside the count of battles, how many have figures; the full line sits over the list of all battles (review P9).
  const jump = $('#panel .fig-jump'); if (jump) jump.onclick = () => $('#fig-complete')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
// Beside the running total, its share of the war's; outside the months the source covers (w.covered: Correlates of
// War's own years, as the Second Sino-Japanese War's 1937–41), how far the figure goes, not a share as if no one died.
function soFarNote(w, m, n) {
  if (w.covered && m > w.covered[1]) return `to ${esc(monthLabel(w.covered[1]))}; no figure after`;
  if (w.covered && m < w.covered[0]) return `no figure before ${esc(monthLabel(w.covered[0]))}`;
  return `${Math.round(n / Math.max(1, w.totalDeaths) * 100)}% of the war's total`;
}
function openPop(p) {
  $('#modal-title').textContent = p.title; $('#modal-body').innerHTML = p.html; showModal();
  $('#modal-body').querySelectorAll('[data-b]').forEach(b => b.onclick = () => openBattle(battleOf(b.dataset.b)));
}
function openBattle(b) {
  if (!b) return;
  const w = state.war, mi = b.s ? w.months.indexOf(b.s.slice(0, 7)) : -1;
  $('#modal-title').innerHTML = `<span data-qid="${esc(b.q)}">${esc(b.n)}</span>`;
  // The detail its file fills in comes last (17 November 2026): above the links and "Go to <month>", its arrival pushed
  // them down, and the window, centred, moved up by half its growth (70 to 150 px on a phone) as the reader went to
  // choose the month. Now nothing above it moves, and the window keeps its top (focus.css).
  $('#modal-body').innerHTML = `<p class="sub">${esc(bDates(b))} · part of ${esc(w.name)}</p>
    ${b.desc ? `<p>${esc(b.desc.replace(/^./, c => c.toUpperCase()))}.</p>` : ''}
    <div class="stat-row figs">${figBox(b, 'd')}${figBox(b, 'c')}</div>
    ${figNone(b)}
    ${wholeHtml(b)}
    ${b.w ? `<a class="btn" href="${wikiUrl(b.w)}" target="_blank" rel="noreferrer">Wikipedia ↗</a>` : ''}
    <a class="btn" href="https://www.wikidata.org/wiki/${esc(b.q)}" target="_blank" rel="noreferrer">Wikidata ↗</a>
    ${mi >= 0 && mi !== state.m ? `<button class="btn" id="jump">Go to ${esc(monthLabel(w.months[mi]))}</button>` : ''}
    ${b.lat == null ? '<p class="empty">No coordinates recorded, so it is not on the map.</p>' : !b.s ? '<p class="empty">With no date recorded, it is not on the map.</p>' : ''}
    <div id="fig-detail" class="fig-detail" data-q="${esc(b.q)}" aria-live="polite" aria-busy="true"><p class="fig-note">Reading the sources…</p></div>`;
  showModal();
  $('#modal-body').querySelectorAll('[data-b]').forEach(x => x.onclick = () => openBattle(battleOf(x.dataset.b)));
  // Its first month: the month shown moves there; one before a period's start widens the period to begin there.
  const j = $('#jump'); if (j) j.onclick = () => { closeModal(); if (isPeriod() && mi < state.f) setPeriod(w.months[mi], w.months[state.m]); else setMonth(mi); };
  // Each side's figures, the readings and the sources read (data/figures/<war>.json, loaded when a window first opens).
  detailOf(w.id).then(d => { const box = $('#fig-detail'); if (box && box.dataset.q === b.q && state.war === w) { box.innerHTML = detailHtml(b, d?.battles?.[b.q], d); box.setAttribute('aria-busy', 'false'); } });
}
// The window takes the keyboard while open (review P11): focus moves into it, Tab stays inside it, and on closing goes
// back to what opened it.
let opener = null;
function showModal() {
  if ($('#modal').hidden) opener = document.activeElement;
  $('#modal').hidden = false;
  $('#modal-close').focus();
}
$('#modal').addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const items = [...$('#modal').querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

/* ---------------------------------------------------------------- a battle's figures (BF-08) */
// How this is worked out, as the panel's method note and the page's Method say it.
const FIGURE_METHOD = 'Deaths and casualties come from Wikidata, then the casualties box of the battle\'s English Wikipedia article (the revision read is named in its window); since 1989, where neither gives one, UCDP\'s recorded clashes within 25 km in the battle\'s dates are shown apart and never ranked. Deaths are the killed; casualties add the wounded, missing and captured; neither stands in for the other, and casualties fewer than the deaths beside them are said not to be given for the whole. Recorded: one source\'s count; where the other side gives none it stays Recorded, marked "at least" and "one side". Estimate: approximate, a range, or VM adding the sides. Disputed or unreliable: a claim, a figure marked doubtful, or sources differing by half again (both are shown, Wikidata\'s and the article\'s). A figure that is the civilians\' alone says so and is not ranked. A box VM cannot read surely is left as "Figures not read", never guessed. The deadliest are ranked by deaths, by the lowest figure given (the lower of two sources that differ). Battle figures are never added into the war\'s deaths by month.';
const details = new Map();
const detailOf = id => details.get(id) || details.set(id, fetch(`data/figures/${id}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null)).get(id);
const FIG_SRC = { wikidata: 'Wikidata', wikipedia: 'the Wikipedia infobox' };
// One of the window's two boxes: a figure with its kind and source, a recorded zero, the sum of its parts, or why none.
// The same figure, kind and scope as the battle's line in every list and tooltip (figures.mjs shownFigure, review P1).
function figBox(b, m) {
  const label = m === 'd' ? 'Deaths' : 'Casualties', n = nodeOf(b), raw = m === 'd' ? b.fd : b.fc;
  const f = n ? shownFigure(n, m) : ownFigure(b, m), own = ownFigure(b, m);
  // Casualties below the deaths beside them are no figure for the whole (the killed are casualties): said so, with what
  // the figures given add up to (review F7, P3).
  if (f?.below) return `<div class="stat fig none"><span>${label}</span><b class="nofig">Not given for the whole</b><small>${esc(f.from === 'parts' ? `its parts with a figure add up to ${rangeText(f)}, fewer than the deaths` : `the figures given add up to ${rangeText(f)}, fewer than the deaths: not every side gives its casualties`)}</small></div>`;
  if (f) {
    const kind = `${kindWords(f.status)}${f.civ ? ', civilians only' : f.one ? ', one side only' : ''}`;
    const note = f.from === 'parts'
      ? ['the sum of its listed parts\' figures', own ? `the article gives ${rangeText(own)} for the whole${own.one ? ', one side only' : ''}` : ''].filter(Boolean).join(' · ')
      : [`from ${FIG_SRC[f.src] || f.src}`, f.origin === 'vm' ? 'VM adds the sides' : '', sourceNote(f), raw?.alt ? `${raw.alt.src === 'wikidata' ? 'Wikidata' : 'the Wikipedia infobox'} gives ${rangeText(raw.alt)}${f.src === 'wikidata' ? `, Wikidata ${num(m === 'd' ? b.deaths : b.cas)}` : ''}` : ''].filter(Boolean).join(' · ');
    return `<div class="stat fig k-${f.status}"><span>${label}</span><b>${esc(rangeText(f))}</b><small class="kind">${esc(kind)}</small><small>${esc(note)}</small>${m === 'd' && b.dAt && f.from !== 'parts' ? `<small>counted in ${esc(b.dAt.slice(0, 4))}: ${esc(LATE)}</small>` : ''}</div>`;
  }
  if (raw && (raw.v === 0 || (raw.low === 0 && raw.high === 0))) return `<div class="stat fig k-fact"><span>${label}</span><b>0</b><small class="kind">${esc(kindWords(raw.status))}</small><small>${raw.src === 'wikidata' ? 'Wikidata records none' : 'every side records none'}</small></div>`;
  // A figure of the other measure, or a recorded zero: this one is not given (one word for it, in the table too: P12).
  const other = n ? shownFigure(n, m === 'd' ? 'c' : 'd') : ownFigure(b, m === 'd' ? 'c' : 'd');
  if (other || stateOf(b, n) === 'zero') return `<div class="stat fig none"><span>${label}</span><b class="nofig">Not given</b><small>${m === 'd' ? 'no deaths figure apart from the other losses' : stateOf(b, n) === 'zero' ? 'no casualties figure beside the deaths' : 'only deaths are given'}</small></div>`;
  return `<div class="stat fig none"><span>${label}</span><b class="nofig">${b.fs === 'unread' ? 'Figures not read' : 'No figure found'}</b></div>`;
}
// Under the boxes, for a battle with no figure: what was searched, and UCDP's clashes nearby, apart.
function figNone(b) {
  const s = stateOf(b, nodeOf(b));
  if (s === 'figure' || s === 'zero' || s === 'parts') return '';
  const u = b.fu ? `<p class="ucdp-near"><b>UCDP, nearby:</b> ${count(b.fu.v, 'death', 'deaths', num)}${b.fu.low !== b.fu.high ? ` (${num(b.fu.low)}–${num(b.fu.high)})` : ''} in ${count(b.fu.n, 'recorded clash', 'recorded clashes', num)} within ${b.fu.km} km in its dates · Estimate. A separate measure: not this battle's own count, and never ranked.</p>` : '';
  return `<p class="searched">${esc(searched(b))}</p>${u}`;
}
const fmtTs = ts => (ts ? fmtDate(ts.slice(0, 10)) : '');
const WD_WORD = { P1120: 'deaths', P1590: 'casualties', P1339: 'injured', P1446: 'missing' };
const wdRef = s => (s.ref === 'stated' ? `stated in <a href="https://www.wikidata.org/wiki/${esc(s.in)}" target="_blank" rel="noreferrer">${esc(s.in)}</a>` : s.ref === 'url' ? `from <a href="${esc(s.in)}" target="_blank" rel="noreferrer">${esc(String(s.in).replace(/^https?:\/\/(www\.)?/, '').split('/')[0])}</a>` : s.ref === 'wikipedia' ? 'imported from Wikipedia, no other reference' : 'no reference');
// The window's detail: each side's figures with their kind and whose they are, the readings where sources differ, and
// the sources read, each with its revision or statement.
function detailHtml(b, d, file) {
  const out = [];
  // Each figure with its own kind: "218 killed, recorded · 767–1,000 casualties, estimate".
  const sideFig = s => [s.d && `${rangeText(s.d)} killed, ${kindWords(s.d.status).toLowerCase()}`, s.c && `${rangeText(s.c)} casualties, ${kindWords(s.c.status).toLowerCase()}`].filter(Boolean).join(' · ');
  if (d?.sides?.length) {
    const whole = d.sides.length === 1 && !/^casualties\d$/.test(d.sides[0].n);
    out.push(`<h4>${whole ? 'As the infobox gives it' : 'By side'}</h4><ul class="side-figs">`);
    for (const s of d.sides) {
      // Every side named (review P2): its combatant in the box, or what its own words say it is (the build names it).
      const who = whole ? 'The whole battle' : s.label || `Combatant ${s.n.slice(-1)}, not named in the article's box`;
      const fig = sideFig(s) || (s.z === 'yes' ? 'none' : s.z === 'claimed' ? 'none, a claim' : s.ref ? 'not taken from the article' : s.w?.length ? s.w.map(x => `"${x}"`).join('; ') : 'nothing given');
      // Why a field was not read, in plain words (review P7): what VM did, never "the reader".
      const why = s.ref ? `VM's reading of this field stopped here: ${String(s.ref).replace(/the reader/g, 'VM')}; see the article` : '';
      const notes = [s.d?.by || s.c?.by ? `by ${s.d?.by || s.c?.by}` : '', s.ko ? 'only deaths given' : '', s.kw ? 'deaths not given apart from the wounded' : '', why,
        s.refs?.length ? `the article cites ${s.refs.join('; ')}` : (sideFig(s) ? 'the article cites nothing here' : '')].filter(Boolean);
      const rd = (s.rd || []).length > 1 ? `<small class="readings">Readings: ${s.rd.map(r => `${esc(r.by || 'as listed')}: ${esc([r.d && `${rangeText(r.d)} killed`, r.c && `${rangeText(r.c)} casualties`, r.z && 'none', r.w?.length && r.w.map(x => `"${x}"`).join('; ')].filter(Boolean).join(', ') || 'nothing given')}${r.d || r.c ? ` (${esc(kindWords((r.d || r.c).status))})` : ''}`).join(' · ')}</small>` : '';
      out.push(`<li><b>${esc(who)}:</b> ${esc(fig)}${notes.length ? `<small>${esc(notes.join(' · '))}</small>` : ''}${rd}</li>`);
    }
    out.push('</ul>');
  }
  const src = [];
  if (d?.wp) src.push(`Wikipedia, <a href="https://en.wikipedia.org/w/index.php?oldid=${esc(d.wp.rev)}" target="_blank" rel="noreferrer">‘${esc(d.wp.t)}’, revision ${esc(d.wp.rev)}</a> (${esc(fmtTs(d.wp.ts))}), CC BY-SA 4.0`);
  else if (d?.mismatch) src.push(`Wikipedia: <a href="https://en.wikipedia.org/w/index.php?oldid=${esc(d.mismatch.rev)}" target="_blank" rel="noreferrer">‘${esc(d.mismatch.t)}’, revision ${esc(d.mismatch.rev)}</a> is about another event (its box dates it ${esc(d.mismatch.dy[0] === d.mismatch.dy[1] ? d.mismatch.dy[0] : d.mismatch.dy.join('–'))}), so its figures are not taken`);
  else if (b.w) src.push(`Wikipedia: ${esc({ redirect: 'the article is a redirect to another page, so not read', nobox: 'the article has no infobox', nofield: 'its infobox has no casualties', failed: 'not read this time', blank: 'its casualties are left blank', noart: 'the linked article does not exist', mismatch: 'the linked article is about another event, by its dates, so not read' }[b.fwp] || 'not read')}`);
  else src.push('Wikipedia: no English article linked from Wikidata');
  const wd = (d?.wd || []).filter(s => WD_WORD[s.p]);
  // Each statement with its qualifiers in words (review F9): "at least", "the minimum", "presumably".
  src.push(wd.length ? `Wikidata: ${wd.map(s => `${WD_WORD[s.p]} ${s.unknown ? 'unknown value' : num(s.v)}${s.low != null ? ` (${s.atLeast && s.low === s.high ? `at least ${num(s.low)}` : `${num(s.low)}–${num(s.high)}`})` : ''}${s.q?.length ? `, ${esc(s.q.join(', '))}` : ''}${s.at ? `, counted ${esc(fmtDate(s.at))}` : ''}${s.rank === 'preferred' ? ', preferred' : ''}, ${wdRef(s)}`).join('; ')}` : 'Wikidata gives none');
  if (!d && !file) return `<p class="fig-note">${src.join('. ')}.</p>`;
  out.push(`<p class="fig-note fig-sources"><b>Sources read:</b> ${src.join('. ')}. Battle figures are not added into the war's deaths by month.</p>`);
  return out.join('');
}
// In a battle's window: the whole it is part of, and a whole's parts with its figure counted once (figures.mjs), and
// where Wikidata gives the whole a figure that is one of its parts' own, that it is left to the part.
function wholeHtml(b) {
  const n = nodeOf(b); if (!n) return '';
  const name = x => `<button class="bname" data-b="${esc(x.q)}" data-qid="${esc(x.q)}">${esc(x.n)}</button>`;
  const out = [];
  if (n.up) out.push(`<p>Part of ${name(n.up.b)}${(b.upAlso || []).map(battleOf).filter(Boolean).map(x => `, and also of ${name(x)}`).join('')}.</p>`);
  if (n.parts.length) {
    out.push(`<p>Its parts listed here: ${n.parts.map(p => name(p.b)).join(', ')}.${n.fig ? ` Counted once, the whole: ${esc(figureText(n))}.` : ''}</p>`);
  }
  // A figure Wikidata gives it that is a part's own, counted with that part, under whichever whole the part is (WF2-04).
  const left = leftToParts(b, [...state.war.battles, ...state.war.undated]);
  if (left.length) out.push(`<p class="empty">Wikidata also gives it ${left.map(x => num(x.v)).join(' and ')}, ${left.length > 1 ? 'figures' : 'a figure'} of its parts' own, counted with ${left.map(x => `${name(x.part)}${x.part.up && x.part.up !== b.q && battleOf(x.part.up) ? `, under ${name(battleOf(x.part.up))}` : ''}`).join(' and ')}.</p>`);
  return out.join('');
}
function closeModal() {
  if ($('#modal').hidden) return;
  $('#modal').hidden = true;
  if (opener?.isConnected) opener.focus();
  opener = null;
}
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
    const status = b => (!b.s ? ['', 'Date not recorded'] : b.s.slice(0, 7) > m ? ['later', 'Not yet'] : underWay(b, a, m) ? ['now', p ? 'In the period' : 'Under way'] : ['', 'Earlier']);
    const list = [...[...w.battles].sort((a, b) => a.s.localeCompare(b.s) || a.n.localeCompare(b.n)), ...w.undated];
    $('#battles-title').textContent = `${w.name} · ${count(list.length, 'battle', 'battles', num)} and ${noun(list.length, 'operation')}`;
    $('#battles-note').textContent = completenessText(w.fig);
    $('#th-status').textContent = periodLabel();
    // Each figure with its kind under it; a battle with none says so across both cells, with what was searched (BF-08).
    // The figure the window and the lists give (review P1), a whole's by its parts where they hold more.
    const cell = (b, m) => {
      const n = nodeOf(b), f = n ? shownFigure(n, m) : ownFigure(b, m), raw = m === 'd' ? b.fd : b.fc;
      if (f?.below) return `<span class="nofig">Not given for the whole</span><small class="kind">${esc(`${f.from === 'parts' ? 'its parts' : 'the sides'} with a figure: ${rangeText(f)}`)}</small>`;
      if (f) return `${esc(rangeText(f))}<small class="kind">${esc(kindWords(f.status))}${f.civ ? ', civilians only' : f.one ? ', one side' : ''}${f.from === 'parts' ? ', its parts' : ''}</small>`;
      if (raw && raw.v === 0) return `0<small class="kind">${esc(kindWords(raw.status))}</small>`;
      return '<span class="nofig">Not given</span>';
    };
    $('#battles-rows').innerHTML = list.map(b => {
      const [cls, word] = status(b);
      const rel = relation(b), n = nodeOf(b), st = stateOf(b, n);
      const figs = st === 'figure' || st === 'zero' ? `<td class="num">${cell(b, 'd')}</td><td class="num">${cell(b, 'c')}</td>`
        : `<td colspan="2" class="nofig-cell">${esc(st === 'parts' ? figureLine(n) : figureOf(b))}${st === 'parts' ? '' : `<small>${esc(searched(b))}</small>`}</td>`;
      return `<tr${cls === 'later' ? ' class="later"' : cls === 'now' ? ' class="sel"' : ''}><td><button type="button" class="rowbtn" data-b="${esc(b.q)}">${esc(b.n)}</button>${rel ? `<small class="rel">${esc(rel)}</small>` : ''}<small class="fig-m">${esc(figureOf(b))}</small></td><td class="mono">${esc(bDates(b))}</td>
        <td><span class="st ${cls}">${word}</span></td>${figs}<td class="mono">${b.lat == null ? 'Not mapped' : !b.s ? 'Not on the map (no date)' : 'Mapped'}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">No battles or operations recorded in Wikidata.</td></tr>';
    $('#battles-rows').querySelectorAll('[data-b]').forEach(el => el.onclick = () => openBattle(battleOf(el.dataset.b)));
  } else if (state.view === 'months') {
    const begun = new Map();
    for (const b of w.battles) if (b.p !== 'y') begun.set(b.s.slice(0, 7), (begun.get(b.s.slice(0, 7)) || 0) + 1);
    $('#months-title').textContent = `${w.name} · battle deaths by month${p ? ` · ${periodLabel()} highlighted` : ''}`;
    $('#months-note').textContent = `Select a month to go to it · ${w.estimated.some(Boolean) ? `~ estimated from ${estimateOf(w.deathsSource)}, rounded` : 'as recorded by UCDP'}`;
    // The month shown is highlighted, or every month of the period; the list keeps the month shown in view.
    $('#months-rows').innerHTML = w.months.map((mm, k) => {
      const clashes = (w.cells[k] || []).reduce((s, c) => s + (c[3] || 0), 0), cls = k === i ? 'sel end' : p && k >= state.f && k < i ? 'sel' : '';
      return `<tr data-k="${k}"${cls ? ` class="${cls}"` : ''}><td><button type="button" class="rowbtn">${esc(monthLabel(mm))}</button></td><td class="num">${w.covered && (mm < w.covered[0] || mm > w.covered[1]) ? '–' : shown(w.deaths[k], w.estimated[k])}</td>
        <td class="num">${shown(cumulative[k], estimatedTo[k], { total: k > 0 })}</td><td class="num">${begun.get(mm) || '–'}</td><td class="num">${w.events ? num(clashes) : '–'}</td></tr>`;
    }).join('');
    // A month goes to it, keeping the period's start; one before the start widens the period to begin there, as a
    // battle's "Go to" does (moving the end there would pull the start along, to a one-month period).
    $('#months-rows').querySelectorAll('tr[data-k]').forEach(tr => tr.onclick = () => {
      const k = +tr.dataset.k;
      if (isPeriod() && k < state.f) setPeriod(state.war.months[k], state.war.months[state.m]); else setMonth(k);
    });
    $('#months-rows tr.end')?.scrollIntoView({ block: 'nearest' });
    renderMonthsStrip();
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
  return `${subject} ${b.s === b.e ? (plural(n) ? 'take place' : 'takes place') : plural(n) ? 'begin' : 'begins'}.`;
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
  // A whole and its parts that begin (or end) in the same month are told once, as the whole; a toll is the whole's,
  // each death counted once (figures.mjs).
  const once = list => { const q = new Set(list.map(b => b.q)); return list.filter(b => { for (let u = nodeOf(b)?.up, k = 0; u && k < 40; u = u.up, k++) if (q.has(u.b.q)) return false; return true; }); };
  const fig = b => nodeOf(b)?.fig ?? (b.deaths || 0);
  const begun = once(w.battles.filter(b => b.p !== 'y' && b.s.slice(0, 7) === m)).sort((x, y) => fig(y) - fig(x) || !!y.w - !!x.w).slice(0, 3);
  for (const b of begun) parts.push(battleLine(b));
  const ended = once(w.battles.filter(b => b.p !== 'y' && b.e && b.e !== b.s && b.e.slice(0, 7) === m)).filter(b => fig(b) >= 10000).slice(0, 2);
  // Its own toll only; a whole with none, its parts' recorded figures said as theirs (figures.mjs endLine, WF2-02).
  for (const b of ended) { const line = endLine(b, nodeOf(b), spokenNumber); if (line) parts.push(line); }
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
      // Wikipedia's words, said to be its (CC BY-SA 4.0; S0, 16 November 2026), in the voice and the captions alike.
      if (said.length) intro += ' ' + wikipediaIntro(said.slice(0, 3), w.wiki);
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
  // A battle Wikidata dates only to its decade (s null, u 'undated') is listed with the war's battles but has no month:
  // it is kept apart, so the map, the months and the counts of battles under way leave it out.
  w.undated = w.battles.filter(b => !b.s); w.battles = w.battles.filter(b => b.s);
  // Wholes and their parts, once for the war (figures.mjs): every list, the ranking, the marks and the narrator read it.
  // `drawn`: the deaths a mapped item's own mark stands for, its figure less what its parts' marks below it show.
  w.groups = groupBattles([...w.battles, ...w.undated]);
  w.fig = completeness([...w.battles, ...w.undated], w.groups); // how complete its battle figures are (BF-08)
  const onMap = (n, d = 0) => (d > 40 ? 0 : n.b.lat != null && n.b.s ? n.fig : n.parts.reduce((s, p) => s + onMap(p, d + 1), 0));
  for (const n of w.groups.byQ.values()) n.drawn = Math.max(0, n.fig - n.parts.reduce((s, p) => s + onMap(p, 1), 0));
  state.war = w; cumulative = []; w.deaths.reduce((s, v, k) => (cumulative[k] = s + v), 0);
  estimatedTo = []; w.estimated.reduce((e, v, k) => (estimatedTo[k] = e || !!v), false);
  $('#war').value = id;
  // Ticks every few months or years, by the war's length; a month the war does not have opens at its second (below).
  const step = w.months.length > 150 ? 60 : w.months.length > 60 ? 24 : w.months.length > 24 ? 12 : w.months.length > 8 ? 3 : 1;
  const ticks = w.months.filter((m, k) => k % step === 0).map((m, k) => ({ at: m, text: step >= 12 ? m.slice(0, 4) : m.slice(2).replace('-', '/'), kind: k % 2 ? 'minor' : 'key' })); // every other one drops out on narrow screens
  // A war opens on its second month (MP-03, 15 Nov 2026): the start resting on the first, so both handles show, one
  // month apart, and the map shows the first two months; a war of one month opens on it.
  const to = w.months.includes(month) ? month : w.months[Math.min(1, w.months.length - 1)];
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
