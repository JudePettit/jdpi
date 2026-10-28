/* Timeline of Progress (PRP · Natural Science): humanity's key scientific breakthroughs, 3000 BC to today, on a world map.
   Data: data/events.json, built by science/scripts/build-progress.mjs from PRP's curated list and Wikidata (CC0).
   Views (tabs): Map, Scientists and List; all three follow the year slider and the discipline filter.
   URL: #y=<year>&e=<event id>[&v=scientists|list][&d=<shown discipline ids>]. Dots and swatches are var(--prp-cat-n)
   fills, so a theme change needs no redraw. */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const WORLD = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json';
const RECENT_STOPS = 10; // "recent" = the last ten steps of the timeline (decades in antiquity, years in the modern era)

const state = { data: null, year: 0, stop: 0, sel: null, view: 'map', off: new Set(), trail: 'all', playing: null, q: '', peopleShown: 120 };
let D, EVENTS = [], byId = new Map(), DISC = [], DIDX = {}, STOPS = [];

/* ---------------------------------------------------------------- formatting */
const yearText = (y, approx) => `${approx ? 'c. ' : ''}${y < 0 ? `${-y} BC` : y < 1000 ? `AD ${y}` : y}`;
const evYear = e => yearText(e.y, e.ca);
// Life dates; "c." when Wikidata gives them only to the decade or century (then a span of under ten years is one date).
function life(p) {
  const b = p.born, d = p.died, c = p.approx ? 'c. ' : '';
  if (b == null && d == null) return '';
  if (b == null) return `died ${c}${yearText(d)}`;
  if (d == null) return b > 1900 ? `born ${b}` : `born ${c}${yearText(b)}`;
  if (p.approx && Math.abs(d - b) < 10) return `${c}${yearText(Math.min(b, d))}`;
  if (b < 0 && d < 0) return `${c}${-b}–${-d} BC`;
  if (b < 0) return `${c}${-b} BC – AD ${d}`;
  return `${c}${b}–${d}`;
}
const discName = id => DISC[DIDX[id]]?.name || id;
const colourVar = id => `var(--prp-cat-${DIDX[id] + 1})`;
const mainShown = e => e.d.find(d => !state.off.has(d)) || e.d[0];
const colourOf = e => colourVar(mainShown(e));
const isShown = e => e.d.some(d => !state.off.has(d));
const personName = q => D.people[q]?.name || q;
const instName = q => D.institutions[q]?.name || q;
const wikiUrl = t => `https://en.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}`;

/* ---------------------------------------------------------------- the non-linear timeline */
// Slider positions ("stops"): centuries in the Bronze Age, half-centuries in antiquity and the Middle Ages, then
// decades, four-year steps from 1600 and single years from 1800, roughly following where breakthroughs cluster.
function buildStops(first, last) {
  const s = [], add = (a, b, step) => { for (let y = a; y <= b; y += step) if (y && y >= first && y <= last) s.push(y); };
  add(-3000, -1100, 100); add(-1000, -50, 50); add(1, 1, 1); add(50, 1350, 50); add(1400, 1590, 10); add(1600, 1796, 4); add(1800, last, 1);
  if (s.at(-1) !== last) s.push(last);
  return [...new Set(s)].sort((a, b) => a - b);
}
const stopFor = y => { let i = 0; while (i + 1 < STOPS.length && STOPS[i + 1] <= y) i++; return i; };
const recentFrom = () => (state.stop - RECENT_STOPS >= 0 ? STOPS[state.stop - RECENT_STOPS] : -Infinity);
const prevStopYear = () => (state.stop > 0 ? STOPS[state.stop - 1] : -Infinity);
const upTo = () => EVENTS.filter(e => e.y <= state.year);
const isRecent = e => e.y > recentFrom() && e.y <= state.year;
const isNew = e => e.y > prevStopYear() && e.y <= state.year;
const visible = () => upTo().filter(e => isShown(e) && (state.trail === 'all' || isRecent(e)));

/* ---------------------------------------------------------------- map */
let svg, gBase, gDots, gLabels, projection, path, zoom, transform = d3.zoomIdentity, W = 0, H = 0, land = null, focusView = null, focusFit = null;
const focusIds = new Set(); // breakthroughs Documentary mode is discussing
function setupMap(world) {
  land = topojson.feature(world, world.objects.land);
  svg = d3.select('#map');
  gBase = svg.append('g').attr('class', 'base');
  gDots = svg.append('g').attr('class', 'dots');
  gLabels = svg.append('g').attr('class', 'labels').attr('aria-hidden', 'true');
  zoom = d3.zoom().scaleExtent([1, 18]).on('zoom', ev => { transform = ev.transform; gBase.attr('transform', transform); placeDots(); $('#tooltip').hidden = true; });
  svg.call(zoom);
  const step = k => () => svg.transition().duration(reduced() ? 0 : 250).call(zoom.scaleBy, k);
  $('#zoom-in').onclick = step(1.6); $('#zoom-out').onclick = step(1 / 1.6);
  $('#zoom-reset').onclick = () => { clearFocus(); svg.transition().duration(reduced() ? 0 : 250).call(zoom.transform, d3.zoomIdentity); };
  focusView = window.PRPFocus?.d3View({ svg, zoom, project: () => projection, maxScale: 10, clamp: true });
  let raf = 0;
  new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(resize); }).observe($('#map-canvas'));
  resize();
}
function resize() {
  const box = $('#map-canvas').getBoundingClientRect(), w = Math.round(box.width), h = Math.round(box.height);
  if (!w || !h || (w === W && h === H)) return;
  W = w; H = h;
  svg.attr('viewBox', `0 0 ${W} ${H}`);
  projection = d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: 'Sphere' });
  path = d3.geoPath(projection);
  zoom.extent([[0, 0], [W, H]]).translateExtent([[0, 0], [W, H]]);
  gBase.selectAll('*').remove();
  gBase.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
  gBase.append('path').attr('class', 'graticule').attr('d', path(d3.geoGraticule10()));
  if (land) gBase.append('path').attr('class', 'land').attr('d', path(land));
  for (const e of EVENTS) e._xy = projection([e.place.lon, e.place.lat]);
  svg.call(zoom.transform, d3.zoomIdentity);
  renderMap();
  if (focusFit) focusView?.fit(...focusFit); // a refit (the frame resized) keeps what Documentary mode is showing
}
// Breakthroughs at the same place fan out on a small spiral (in screen pixels, so it holds at every zoom).
const offset = e => { const k = e._slot || 0, r = 4.4 * Math.sqrt(k), a = k * 2.39996; return [r * Math.cos(a), r * Math.sin(a)]; };
const sx = e => transform.applyX(e._xy[0]) + offset(e)[0];
const sy = e => transform.applyY(e._xy[1]) + offset(e)[1];
const radius = e => (e.id === state.sel ? 7 : isRecent(e) ? 4.8 : 3.1);
function placeDots() {
  if (!gDots) return;
  gDots.selectAll('circle.dot').attr('cx', sx).attr('cy', sy);
  gLabels.selectAll('text').attr('x', e => sx(e) + radius(e) + 5).attr('y', e => sy(e) + 4);
}
function renderMap() {
  if (!projection) return;
  const list = visible().filter(e => e._xy).sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const slots = new Map();
  for (const e of list) { const k = `${e.place.lat},${e.place.lon}`; e._slot = slots.get(k) || 0; slots.set(k, e._slot + 1); }
  // Earlier breakthroughs first, then recent ones, then those being read about, then the selection on top.
  const rank = e => (e.id === state.sel ? 3 : focusIds.has(e.id) ? 2 : isRecent(e) ? 1 : 0);
  list.sort((a, b) => rank(a) - rank(b) || a.y - b.y);
  const tip = $('#tooltip');
  gDots.selectAll('circle.dot').data(list, e => e.id).join(enter => enter.append('circle').attr('class', 'dot')
    .on('mouseenter mousemove', (ev, e) => showTip(ev, e))
    .on('mouseleave', () => { tip.hidden = true; })
    .on('click', (ev, e) => { ev.stopPropagation(); select(e.id); }))
    .attr('r', radius)
    .style('fill', colourOf)
    .attr('class', e => `dot${isRecent(e) ? ' recent' : ' old'}${isNew(e) ? ' new' : ''}${e.id === state.sel ? ' sel' : ''}${focusIds.has(e.id) ? ' prp-focus-hit' : ''}`)
    .order();
  // Direct labels: the selection, those being read about, and the recent breakthroughs when there are only a few.
  const recent = list.filter(isRecent);
  const labelled = list.filter(e => e.id === state.sel || focusIds.has(e.id) || (recent.length <= 4 && isRecent(e)));
  gLabels.selectAll('text').data(labelled, e => e.id).join('text').attr('class', e => (e.id === state.sel ? 'sel' : '')).text(e => e.t.length > 46 ? `${e.t.slice(0, 44)}…` : e.t);
  placeDots();
  $('#caption').textContent = `${state.trail === 'all' ? 'Breakthroughs up to' : 'Breakthroughs in the steps leading to'} ${yearText(state.year)}, coloured by main discipline; ${state.trail === 'all' ? 'the most recent are drawn larger, earlier ones faded.' : 'earlier ones are hidden.'}`;
}
function showTip(ev, e) {
  const tip = $('#tooltip'), box = $('#map-canvas').getBoundingClientRect();
  const ppl = e.people.slice(0, 3).map(personName).join(', ') + (e.people.length > 3 ? ` +${e.people.length - 3}` : '');
  tip.innerHTML = `<strong>${esc(e.t)}</strong><span class="tip-meta">${esc(evYear(e))} · ${esc(e.place.n)}</span>`
    + `<span class="tip-disc">${e.d.map(d => `<i style="background:${colourVar(d)}"></i>${esc(discName(d))}`).join(' ')}</span>${ppl ? `<span>${esc(ppl)}</span>` : ''}`;
  tip.hidden = false;
  const x = ev.clientX - box.left, y = ev.clientY - box.top;
  tip.style.left = `${Math.max(4, Math.min(x + 14, box.width - tip.offsetWidth - 6))}px`;
  tip.style.top = `${y + 16 + tip.offsetHeight > box.height ? Math.max(4, y - tip.offsetHeight - 12) : y + 16}px`;
}

/* ---------------------------------------------------------------- documentary focus (design/prp-focus.js) */
// When the reader names breakthroughs (by Wikidata ID) or places, the breakthroughs are ringed in the module accent and
// labelled, and the map eases to fit everything named; ⟲ or the end of the reading brings back the whole world.
function clearFocus() { focusFit = null; if (!focusIds.size) return; focusIds.clear(); renderMap(); }
window.PRPFocus?.listen({
  focus(t) {
    if (!D || !focusView || !projection) return;
    const ids = new Set();
    const r = PRPFocus.resolve(t, {
      qid: q => { const es = EVENTS.filter(e => e.q === q && e.y <= state.year); es.forEach(e => ids.add(e.id)); return es.length ? es.map(e => [e.place.lon, e.place.lat]) : null; },
      minSpan: 10,
    });
    if (!r.box) return;
    focusIds.clear(); ids.forEach(id => focusIds.add(id)); renderMap();
    focusFit = [r.box, r.padding];
    focusView.fit(...focusFit);
  },
  reset() { clearFocus(); focusView?.reset(); },
});

/* ---------------------------------------------------------------- legend = discipline filter */
function setupLegend() {
  $('#legend-list').innerHTML = DISC.map(d => `<li><button type="button" class="lg" data-d="${d.id}" aria-pressed="true" title="Show or hide ${esc(d.name)} (double-click: only this)">`
    + `<i class="sw" style="background:${colourVar(d.id)}"></i><span class="lg-n">${esc(d.name)}</span><span class="lg-c" data-c="${d.id}">0</span></button></li>`).join('');
  for (const b of document.querySelectorAll('.lg')) {
    b.onclick = () => { const id = b.dataset.d; if (state.off.has(id)) state.off.delete(id); else state.off.add(id); if (state.off.size === DISC.length) state.off.clear(); filterChanged(); };
    b.ondblclick = () => { state.off = new Set(DISC.map(d => d.id).filter(x => x !== b.dataset.d)); filterChanged(); };
  }
  $('#legend-reset').onclick = () => { state.off.clear(); filterChanged(); };
}
function renderLegend() {
  const list = upTo();
  for (const b of document.querySelectorAll('.lg')) {
    const id = b.dataset.d;
    b.setAttribute('aria-pressed', String(!state.off.has(id)));
    b.querySelector('.lg-c').textContent = list.filter(e => e.d.includes(id)).length;
  }
  $('#legend-reset').hidden = !state.off.size;
}
function filterChanged() { state.peopleShown = 120; renderAll(); writeHash(); }

/* ---------------------------------------------------------------- density strip above the slider */
function renderDensity() {
  const n = STOPS.length, counts = new Array(n).fill(0);
  for (const e of EVENTS) if (isShown(e)) counts[stopFor(e.y)]++;
  const max = Math.max(1, ...counts);
  const s = d3.select('#density').attr('viewBox', `0 0 ${n} 1`);
  s.selectAll('rect').data(counts).join('rect')
    .attr('x', (_, i) => i + 0.1).attr('width', 0.8)
    .attr('y', c => 1 - (c ? 0.12 + 0.88 * Math.sqrt(c / max) : 0)).attr('height', c => (c ? 0.12 + 0.88 * Math.sqrt(c / max) : 0))
    .attr('class', (_, i) => (i <= state.stop ? 'past' : 'future'));
}

/* ---------------------------------------------------------------- side panel: the card, or what happened up to the year */
const evButton = (e, cls = 'ev') => `<button type="button" class="${cls}${e.id === state.sel ? ' sel' : ''}" data-e="${esc(e.id)}"><i class="dot" style="background:${colourOf(e)}"></i>`
  + `<span class="ev-y">${esc(evYear(e))}</span><span class="ev-t">${esc(e.t)}</span><span class="ev-p">${esc(e.place.n)}</span></button>`;
function card(e) {
  const b = D.basis[e.positionBasis] || e.positionBasis;
  const via = e.via && D.people[e.via] && e.people.length > 1 ? ` · via ${esc(personName(e.via))}` : '';
  const people = e.people.map(q => {
    const p = D.people[q] || { name: q }, others = EVENTS.filter(x => x !== e && x.people.includes(q));
    const meta = [life(p), p.country?.[0], p.occupation?.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
    return `<li><span class="pname" data-qid="${esc(q)}">${esc(p.name)}</span>${meta ? `<small class="pmeta">${esc(meta)}</small>` : ''}`
      + `${others.length ? `<span class="also">Also: ${others.slice(0, 4).map(x => `<button type="button" class="link" data-e="${esc(x.id)}">${esc(x.t)} (${esc(evYear(x))})</button>`).join(', ')}${others.length > 4 ? ` and ${others.length - 4} more` : ''}</span>` : ''}</li>`;
  }).join('');
  const inst = e.inst.map(q => `<li><span data-qid="${esc(q)}">${esc(instName(q))}</span>${D.institutions[q]?.desc ? `<small class="pmeta">${esc(D.institutions[q].desc)}</small>` : ''}</li>`).join('');
  const links = [e.w ? `<a class="btn go" href="${wikiUrl(e.w)}" target="_blank" rel="noreferrer">Wikipedia ↗</a>` : '',
    e.q ? `<a class="btn" href="https://www.wikidata.org/wiki/${esc(e.q)}" target="_blank" rel="noreferrer">Wikidata ↗</a>` : ''].join('');
  return `<article class="card" data-e="${esc(e.id)}">
    <button type="button" class="close" id="close" aria-label="Close the card">×</button>
    <p class="disc">${e.d.map(d => `<span class="dtag"><i style="background:${colourVar(d)}"></i>${esc(discName(d))}</span>`).join('')}</p>
    <h2>${e.q ? `<span data-qid="${esc(e.q)}">${esc(e.t)}</span>` : esc(e.t)}</h2>
    <p class="sub"><b>${esc(evYear(e))}</b> · ${D.institutions[e.place.q] ? `<span data-qid="${esc(e.place.q)}">${esc(e.place.n)}</span>` : esc(e.place.n)}</p>
    <p class="note">${esc(e.n)}</p>
    <dl class="facts"><dt>Placed at</dt><dd>${esc(e.place.n)}<small>${esc(b)}${via}</small></dd></dl>
    ${people ? `<h3>People <span class="count">${e.people.length}</span></h3><ul class="plist">${people}</ul>` : ''}
    ${inst ? `<h3>Institutions <span class="count">${e.inst.length}</span></h3><ul class="plist">${inst}</ul>` : ''}
    ${links ? `<p class="links jdpi-no-ency">${links}</p>` : ''}
  </article>`;
}
function renderPanel() {
  const panel = $('#panel'), e = state.sel && byId.get(state.sel);
  $('.work').classList.toggle('has-sel', !!e); // phones hide the side list under the List and Scientists views
  $('.work').dataset.view = state.view;
  if (e) {
    const near = EVENTS.filter(x => x !== e && isShown(x)).sort((a, b) => Math.abs(a.y - e.y) - Math.abs(b.y - e.y) || a.y - b.y).slice(0, 6).sort((a, b) => a.y - b.y);
    panel.innerHTML = `${card(e)}<h3 class="side-h">Around the same time</h3><ul class="evlist">${near.map(x => `<li>${evButton(x)}</li>`).join('')}</ul>`;
  } else {
    const all = upTo().filter(isShown).sort((a, b) => b.y - a.y || a.id.localeCompare(b.id));
    const recent = all.filter(isRecent), earlier = all.filter(x => !isRecent(x)).slice(0, Math.max(0, 40 - recent.length));
    panel.innerHTML = `<h2 class="side-title">Up to ${esc(yearText(state.year))}</h2>
      <p class="sub">${all.length ? `${all.length} breakthrough${all.length === 1 ? '' : 's'}${state.off.size ? ' in the disciplines shown' : ''}. Select one for its people, institutions and place.` : 'No breakthroughs in the disciplines shown yet. Move the slider forward.'}</p>
      ${recent.length ? `<h3 class="side-h">Recent <span class="count">since ${esc(yearText(Math.max(recentFrom() + 1, STOPS[0])))}</span></h3><ul class="evlist">${recent.map(x => `<li>${evButton(x)}</li>`).join('')}</ul>` : ''}
      ${earlier.length ? `<h3 class="side-h">Earlier</h3><ul class="evlist">${earlier.map(x => `<li>${evButton(x)}</li>`).join('')}</ul>` : ''}
      ${all.length > recent.length + earlier.length ? `<p class="more-row"><button type="button" class="more" id="to-list">All ${all.length} in the List tab</button></p>` : ''}`;
    $('#to-list')?.addEventListener('click', () => setView('list'));
  }
  $('#close')?.addEventListener('click', () => select(null));
}
// One delegated handler for every "open this breakthrough" button (side list, card, scientists, table).
document.addEventListener('click', ev => {
  const b = ev.target.closest('button[data-e], tr[data-e]');
  if (!b || ev.target.closest('a')) return;
  select(b.dataset.e, { reveal: true });
});

/* ---------------------------------------------------------------- Scientists and List views */
const matches = (txt, q) => !q || txt.toLowerCase().includes(q);
function renderPeople() {
  if (state.view !== 'scientists' || !D) return;
  const q = state.q.trim().toLowerCase(), evs = upTo().filter(isShown), firstOf = new Map(), evsOf = new Map();
  for (const e of evs.sort((a, b) => a.y - b.y)) for (const p of e.people) { if (!firstOf.has(p)) firstOf.set(p, e.y); (evsOf.get(p) || evsOf.set(p, []).get(p)).push(e); }
  const rows = [...firstOf.keys()].filter(p => matches(`${personName(p)} ${D.people[p]?.field?.join(' ') || ''} ${D.people[p]?.country?.join(' ') || ''}`, q))
    .sort((a, b) => firstOf.get(a) - firstOf.get(b) || personName(a).localeCompare(personName(b)));
  $('#people-title').textContent = `Scientists up to ${yearText(state.year)} · ${rows.length}`;
  $('#people-list').innerHTML = rows.slice(0, state.peopleShown).map(p => {
    const x = D.people[p] || {}, meta = [life(x), x.country?.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
    const fields = (x.field?.length ? x.field : x.occupation || []).slice(0, 3).join(', ');
    return `<li class="sci"><div class="sci-head"><span class="pname" data-qid="${esc(p)}">${esc(personName(p))}</span></div>
      ${meta ? `<p class="sci-meta">${esc(meta)}</p>` : ''}${fields ? `<p class="sci-meta">${esc(fields)}</p>` : ''}
      ${x.inst?.length ? `<p class="sci-inst">${esc(x.inst.slice(0, 3).map(instName).join(' · '))}</p>` : ''}
      <ul class="sci-evs">${evsOf.get(p).map(e => `<li>${evButton(e, 'ev compact')}</li>`).join('')}</ul></li>`;
  }).join('') || `<li class="empty">No scientists match${q ? ` “${esc(state.q)}”` : ''} up to ${esc(yearText(state.year))}.</li>`;
  const more = $('#people-more');
  more.hidden = rows.length <= state.peopleShown;
  more.textContent = `Show more (${rows.length - state.peopleShown} left)`;
}
$('#people-more').onclick = () => { state.peopleShown += 200; renderPeople(); };
function renderList() {
  if (state.view !== 'list' || !D) return;
  const q = state.q.trim().toLowerCase();
  const list = upTo().filter(e => isShown(e) && matches(`${e.t} ${e.place.n} ${e.people.map(personName).join(' ')}`, q)).sort((a, b) => b.y - a.y || a.id.localeCompare(b.id));
  $('#list-title').textContent = `Breakthroughs up to ${yearText(state.year)} · ${list.length}`;
  $('#list-rows').innerHTML = list.map(e => `<tr data-e="${esc(e.id)}"${e.id === state.sel ? ' class="sel"' : ''}>
    <td class="num mono">${esc(evYear(e))}</td><td><button type="button" class="rowbtn" data-e="${esc(e.id)}">${esc(e.t)}</button></td>
    <td class="disc-cell">${e.d.map(d => `<span class="dtag"><i style="background:${colourVar(d)}"></i>${esc(discName(d))}</span>`).join('')}</td>
    <td class="wrap">${esc(e.place.n)}</td><td class="wrap">${esc(e.people.slice(0, 3).map(personName).join(', '))}${e.people.length > 3 ? ` +${e.people.length - 3}` : ''}</td></tr>`).join('')
    || `<tr><td colspan="5" class="empty">No breakthroughs match${q ? ` “${esc(state.q)}”` : ''} up to ${esc(yearText(state.year))}.</td></tr>`;
}

/* ---------------------------------------------------------------- tabs */
const TABS = [...document.querySelectorAll('[role="tab"]')];
function setView(v, { push = true } = {}) {
  state.view = ['scientists', 'list'].includes(v) ? v : 'map';
  for (const t of TABS) {
    const on = t.dataset.view === state.view;
    t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
  }
  $('#tooltip').hidden = true;
  $('.work').dataset.view = state.view;
  if (state.view === 'map') resize();
  renderPeople(); renderList();
  if (push) writeHash();
}
TABS.forEach((t, i) => {
  t.onclick = () => setView(t.dataset.view);
  t.onkeydown = e => { const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!k) return; const n = TABS[(i + k + TABS.length) % TABS.length]; n.focus(); setView(n.dataset.view); };
});

/* ---------------------------------------------------------------- year, selection, URL */
function renderKpis() {
  const list = upTo().filter(isShown);
  $('#year-big').textContent = yearText(state.year);
  $('#k-events').textContent = list.length.toLocaleString('en-GB');
  $('#k-people').textContent = new Set(list.flatMap(e => e.people)).size.toLocaleString('en-GB');
}
function renderAll() { renderMap(); renderLegend(); renderDensity(); renderPanel(); renderKpis(); renderPeople(); renderList(); }
function setYear(y, { push = true, stop = null } = {}) {
  state.year = Math.max(D.firstYear, Math.min(D.lastYear, Math.round(y)));
  state.stop = stop ?? stopFor(state.year);
  const s = $('#year');
  s.value = state.stop; s.setAttribute('aria-valuetext', yearText(state.year));
  renderAll();
  if (push) writeHash();
}
const setStop = (i, opts) => { const k = Math.max(0, Math.min(STOPS.length - 1, i)); setYear(STOPS[k], { ...opts, stop: k }); };
function select(id, { reveal = false, push = true } = {}) {
  const e = id && byId.get(id);
  state.sel = e ? e.id : null;
  if (e && e.y > state.year) { setYear(e.y, { push: false }); }
  else renderAll();
  if (e && reveal && window.matchMedia('(max-width: 900px)').matches) $('#panel').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  if (push) writeHash();
}
function writeHash() {
  const parts = [`y=${state.year}`];
  if (state.sel) parts.push(`e=${state.sel}`);
  if (state.view !== 'map') parts.push(`v=${state.view}`);
  if (state.off.size) parts.push(`d=${DISC.filter(d => !state.off.has(d.id)).map(d => d.id).join(',')}`);
  const h = `#${parts.join('&')}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1)), e = byId.get(p.get('e') || '');
  let y = parseInt(p.get('y'), 10);
  if (!Number.isFinite(y)) y = e ? e.y : D.lastYear;
  if (e && e.y > y) y = e.y;
  const shown = (p.get('d') || '').split(',').filter(d => d in DIDX);
  return { y, e: e?.id || null, v: p.get('v') || 'map', off: new Set(shown.length ? DISC.map(d => d.id).filter(d => !shown.includes(d)) : []) };
}
function applyHash() {
  const h = readHash();
  state.off = h.off;
  if (h.v !== state.view) setView(h.v, { push: false });
  state.sel = h.e;
  setYear(h.y, { push: false });
}

/* ---------------------------------------------------------------- play, steps and keys */
function stopPlay() {
  clearInterval(state.playing); state.playing = null;
  $('#play').textContent = '▶'; $('#play').setAttribute('aria-label', 'Play through history');
}
function togglePlay() {
  if (state.playing) return stopPlay();
  if (state.stop >= STOPS.length - 1) setStop(0);
  state.sel = null;
  $('#play').textContent = '❚❚'; $('#play').setAttribute('aria-label', 'Pause');
  state.playing = setInterval(() => { if (state.stop >= STOPS.length - 1) stopPlay(); else setStop(state.stop + 1); }, 420);
}
// Jump to the previous or next year with a breakthrough in the disciplines shown.
function jump(dir) {
  const ys = [...new Set(EVENTS.filter(isShown).map(e => e.y))].sort((a, b) => a - b);
  const y = dir > 0 ? ys.find(v => v > state.year) : ys.filter(v => v < state.year).at(-1);
  if (y != null) setYear(y);
}
function setupTimeline() {
  const s = $('#year');
  s.min = 0; s.max = STOPS.length - 1;
  s.addEventListener('input', () => { stopPlay(); setStop(+s.value); });
  $('#prev').onclick = () => { stopPlay(); setStop(state.stop - (STOPS[state.stop] < state.year ? 0 : 1)); };
  $('#next').onclick = () => { stopPlay(); setStop(state.stop + 1); };
  $('#play').onclick = togglePlay;
  const at = y => `${(stopFor(y) / (STOPS.length - 1)) * 100}%`;
  // minor ticks drop out below 900px; on phones only the key ones (and the ends) stay.
  const ticks = [[-3000, '3000 BC'], [1, 'AD 1'], [1000, '1000', 'minor'], [1500, '1500'], [1700, '1700', 'minor'], [1800, '1800', 'key'], [1850, '1850', 'minor'], [1900, '1900', 'key'], [1950, '1950', 'minor'], [2000, '2000']];
  $('#ticks').innerHTML = ticks.filter(([y]) => y >= D.firstYear && y <= D.lastYear)
    .map(([y, l, c], i, a) => `<span class="${[c, i === 0 ? 'start' : '', i === a.length - 1 ? 'end' : ''].filter(Boolean).join(' ')}" style="left:${at(y)}">${l}</span>`).join('');
  for (const b of document.querySelectorAll('#trail button')) b.onclick = () => {
    state.trail = b.dataset.v;
    for (const x of document.querySelectorAll('#trail button')) x.setAttribute('aria-pressed', String(x === b));
    renderMap();
  };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { $('#search-results').hidden = true; if (state.sel) select(null); return; }
    const t = e.target, typing = t.closest?.('input, textarea, select, [contenteditable="true"]');
    if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === ' ' && !t.closest('button, a')) { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if (t.closest('[role="tab"]')) return;
      e.preventDefault(); stopPlay();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      if (e.shiftKey) jump(dir); else (dir > 0 ? $('#next') : $('#prev')).click();
    }
    else if (e.key === 'Home') { stopPlay(); setStop(0); }
    else if (e.key === 'End') { stopPlay(); setStop(STOPS.length - 1); }
  });
}

/* ---------------------------------------------------------------- search */
function setupSearch() {
  const input = $('#search'), list = $('#search-results');
  const index = [
    ...EVENTS.map(e => ({ label: e.t, sub: `${evYear(e)} · ${e.place.n}`, key: `${e.t} ${e.people.map(personName).join(' ')} ${e.place.n}`.toLowerCase(), e: e.id })),
    ...Object.entries(D.people).map(([q, p]) => { const first = EVENTS.find(e => e.people.includes(q)); return first && { label: p.name, sub: `Scientist · ${[life(p), first.t].filter(Boolean).join(' · ')}`, key: p.name.toLowerCase(), e: first.id, person: true }; }).filter(Boolean),
  ];
  let results = [], active = 0;
  const choose = r => { input.value = ''; state.q = ''; list.hidden = true; input.setAttribute('aria-expanded', 'false'); select(r.e, { reveal: true }); };
  const paint = () => {
    list.innerHTML = results.map((r, i) => `<li role="option" id="sr-${i}" aria-selected="${i === active}">${esc(r.label)}<small>${esc(r.sub)}</small></li>`).join('');
    list.querySelectorAll('li').forEach((li, i) => { li.onmousedown = ev => { ev.preventDefault(); choose(results[i]); }; });
    input.setAttribute('aria-activedescendant', results.length ? `sr-${active}` : '');
  };
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    state.q = input.value;
    results = q.length < 2 ? [] : index.filter(r => r.key.includes(q)).sort((a, b) => b.label.toLowerCase().startsWith(q) - a.label.toLowerCase().startsWith(q) || !!b.person - !!a.person).slice(0, 10);
    active = 0; list.hidden = !results.length; input.setAttribute('aria-expanded', String(!!results.length)); paint();
    renderPeople(); renderList();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); active = (active + 1) % results.length; paint(); }
    else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); active = (active - 1 + results.length) % results.length; paint(); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active]); }
    else if (e.key === 'Escape') { list.hidden = true; input.setAttribute('aria-expanded', 'false'); }
  });
  input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); }, 150));
}

/* ---------------------------------------------------------------- documentary narration (PRP Documentary mode) */
const ERAS = [[-3000, -501, 'The Bronze and Iron Ages'], [-500, 500, 'Classical antiquity'], [501, 1450, 'The medieval world'], [1451, 1700, 'The Scientific Revolution'],
  [1701, 1800, 'The Enlightenment'], [1801, 1900, 'The nineteenth century'], [1901, 1945, 'The early twentieth century'], [1946, 2000, 'The late twentieth century'], [2001, 9999, 'The twenty-first century']];
window.jdpiDocumentary = {
  get title() { return `Timeline of Progress · ${yearText(state.year)}`; },
  async *story() {
    if (state.playing) stopPlay();
    if (state.view !== 'map') setView('map');
    state.off.clear(); state.sel = null;
    yield { text: `Five thousand years of discovery, from the first written numbers to the latest telescopes: ${EVENTS.length} breakthroughs, each placed where it happened.`, el: $('#year-big'), focus: { reset: true } };
    for (const [a, b, name] of ERAS) {
      if (a > D.lastYear) break;
      const list = EVENTS.filter(e => e.y >= a && e.y <= Math.min(b, D.lastYear));
      setYear(Math.min(b, D.lastYear), { push: false });
      await new Promise(r => setTimeout(r, 400));
      const top = list.filter(e => e.people.length).slice(0, 3).concat(list.filter(e => !e.people.length)).slice(0, 3);
      const places = [...new Set(list.map(e => e.place.n))].slice(0, 3);
      // The map frames the places named and the breakthroughs named (ringed and labelled when Wikidata knows them).
      const named = [...top, ...places.map(n => list.find(e => e.place.n === n))].filter(Boolean);
      const focus = named.length ? { qids: [...new Set(top.map(e => e.q).filter(Boolean))], points: named.map(e => [e.place.lon, e.place.lat]), padding: 48 } : { reset: true };
      yield { text: `${name}, ${yearText(Math.max(a, D.firstYear))} to ${yearText(Math.min(b, D.lastYear))}: ${list.length} breakthroughs${places.length ? `, from ${places.join(', ')} and beyond` : ''}. Among them: ${top.map(e => `${e.t.replace(/[:;]/g, ',')} (${evYear(e)})`).join('; ')}.`, el: $('#panel'), focus };
      if (b < D.lastYear) yield { chapterEnd: true, label: 'Continue' };
    }
  },
};

/* ---------------------------------------------------------------- start */
const fmtDay = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
(async function init() {
  try {
    const [data, world] = await Promise.all([
      fetch('data/events.json').then(r => { if (!r.ok) throw new Error(`events.json: HTTP ${r.status}`); return r.json(); }),
      fetch(WORLD).then(r => r.json()).catch(() => null),
    ]);
    D = state.data = data;
    DISC = data.disciplines; DIDX = Object.fromEntries(DISC.map((d, i) => [d.id, i]));
    EVENTS = data.events; byId = new Map(EVENTS.map(e => [e.id, e]));
    STOPS = buildStops(data.firstYear, data.lastYear);
    $('#status').innerHTML = `<span><b>${EVENTS.length}</b> breakthroughs</span><span><b>${Object.keys(data.people).length}</b> scientists</span>`
      + `<span><b>${Object.keys(data.institutions).length}</b> institutions</span><span>Coverage <b>${esc(yearText(data.firstYear))}–${data.lastYear}</b></span>`
      + `<span>Facts <b>Wikidata (CC0)</b></span>${data.generated ? `<span>Built <b>${esc(fmtDay(data.generated))}</b></span>` : ''}`;
    if (!world) $('#caption').textContent = 'The world outline could not be loaded; breakthroughs are still placed by their coordinates.';
    setupLegend(); setupTimeline(); setupSearch(); setupMap(world || { type: 'Topology', objects: { land: { type: 'GeometryCollection', geometries: [] } }, arcs: [] });
    applyHash();
    window.addEventListener('hashchange', applyHash);
    window.addEventListener('prp:themechange', () => renderMap());
  } catch (err) {
    console.error(err);
    $('#status').textContent = 'Could not load the timeline.';
  }
})();
