// War Focus: one war, month by month. Data: data/index.json and data/wars/<id>.json (scripts/build.mjs);
// borders from Retrospective Battlefield's CShapes file. Wars and battles carry their Wikidata IDs (data-qid), so the
// JDP-I entity linker adds Encyclopaedia links, and lake/scripts/adapters.mjs links the Encyclopaedia back here.
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
const go = (module, url) => embedded ? `${SHELL}#/hp/${module}?at=${encodeURIComponent(new URL(url, SHELL).href)}` : new URL(url, SHELL).href;

const state = { index: null, borders: null, war: null, m: 0, playing: null, zoomK: 1 };
let svg, g, gStates, gLabels, gCells, gBattles, path, projection, zoom, features = [];

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
  $('#zoom-in').onclick = () => svg.transition().call(zoom.scaleBy, 1.6);
  $('#zoom-out').onclick = () => svg.transition().call(zoom.scaleBy, 1 / 1.6);
  $('#zoom-reset').onclick = () => svg.transition().call(zoom.transform, d3.zoomIdentity);
  features = topojson.feature(state.borders, state.borders.objects.borders).features;
  new ResizeObserver(() => state.war && fitProjection()).observe($('.map-wrap'));
}
function fitProjection() {
  const w = state.war, box = $('.map-wrap').getBoundingClientRect(), W = Math.max(320, box.width), H = Math.max(280, box.height);
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
}
const R = b => Math.min(16, 3.2 + Math.sqrt(b.deaths || b.cas || 0) / 22);
function sizeMarks() {
  const k = state.zoomK;
  gBattles.selectAll('circle.battle').attr('r', d => R(d) / Math.sqrt(k));
  gCells.selectAll('circle').attr('r', d => Math.min(22, 2 + Math.sqrt(d[2]) * 0.9) / Math.sqrt(k));
  gLabels.selectAll('text').attr('font-size', 10 / Math.sqrt(k));
}

function draw(full) {
  const w = state.war, i = state.m, m = w.months[i], date = dateOf(i);
  // States as they stood that month, coloured by side or occupation.
  const live = features.filter(f => f.properties.s <= date && f.properties.e >= date);
  const prevDate = i ? dateOf(i - 1) : null;
  gStates.selectAll('path').data(live, f => f.properties.gw + f.properties.s).join('path')
    .attr('d', path)
    .attr('class', f => { const s = sideOf(f.properties.gw, date); const was = prevDate ? sideOf(f.properties.gw, prevDate) : s; return `state ${s}${!full && s !== was ? ' joined' : ''}`; })
    .on('mousemove', (e, f) => tip(e, `<strong>${esc(displayName(f.properties.gw, f.properties.name, date))}</strong>${sideText(sideOf(f.properties.gw, date))}`))
    .on('mouseleave', hideTip);
  // Labels for the states taking part.
  const named = live.filter(f => sideOf(f.properties.gw, date) && path.area(f) > 900);
  gLabels.selectAll('text').data(named, f => f.properties.gw).join('text').attr('class', 'state-label')
    .attr('transform', f => `translate(${path.centroid(f)})`).text(f => displayName(f.properties.gw, f.properties.name, date));
  // UCDP events: this month, plus the two before it faded.
  const cells = [];
  for (let k = Math.max(0, i - 2); k <= i; k++) for (const c of w.cells[k] || []) cells.push([...c, k === i]);
  gCells.selectAll('circle').data(cells).join('circle').attr('class', d => (d[4] ? 'cell' : 'cell old'))
    .attr('cx', d => projection([d[1], d[0]])[0]).attr('cy', d => projection([d[1], d[0]])[1])
    .on('mousemove', (e, d) => tip(e, `<strong>${num(d[2])} deaths</strong>${d[3]} recorded clash${d[3] > 1 ? 'es' : ''}${d[4] ? '' : ' (earlier month)'}`)).on('mouseleave', hideTip);
  // Battles: started by this month; active ones bright with a pulse, older ones faded.
  const shown = w.battles.filter(b => b.lat != null && b.s.slice(0, 7) <= m);
  const isNow = b => b.p !== 'y' && b.s.slice(0, 7) <= m && (b.e || b.s).slice(0, 7) >= m;
  gBattles.selectAll('circle.ring').data(shown.filter(isNow), b => b.q).join('circle').attr('class', 'ring')
    .attr('cx', b => projection([b.lon, b.lat])[0]).attr('cy', b => projection([b.lon, b.lat])[1]);
  gBattles.selectAll('circle.battle').data(shown, b => b.q).join('circle')
    .attr('class', b => `battle ${isNow(b) ? 'now' : 'past'}`)
    .attr('cx', b => projection([b.lon, b.lat])[0]).attr('cy', b => projection([b.lon, b.lat])[1])
    .on('mousemove', (e, b) => tip(e, `<strong>${esc(b.n)}</strong>${esc(bDates(b))}${b.deaths ? `<br>${num(b.deaths)} deaths` : b.cas ? `<br>${num(b.cas)} casualties` : ''}`))
    .on('mouseleave', hideTip).on('click', (e, b) => openBattle(b));
  gBattles.selectAll('circle.battle').filter(isNow).raise();
  sizeMarks();
  renderCounters(); renderSpark(); renderPanel(); renderLegend();
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
function tip(e, html) { const t = $('#tooltip'), r = $('.map-wrap').getBoundingClientRect(); t.hidden = false; t.innerHTML = html; t.style.left = e.clientX - r.left + 14 + 'px'; t.style.top = e.clientY - r.top + 14 + 'px'; }
function hideTip() { $('#tooltip').hidden = true; }

/* ---------------------------------------------------------------- counters, sparkline, legend */
let cumulative = [];
function renderCounters() {
  const w = state.war, i = state.m, m = w.months[i];
  $('#date').textContent = monthLabel(m);
  $('#c-total').textContent = num(cumulative[i]);
  $('#c-month').textContent = (w.estimated[i] ? '~' : '') + num(w.deaths[i]);
  $('#c-battles').textContent = num(w.battles.filter(b => b.s.slice(0, 7) <= m).length);
  $('#month').value = i;
}
function renderSpark() {
  const w = state.war, el = d3.select('#spark'), W = el.node().clientWidth || 600, H = 44;
  el.attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleLinear().domain([0, Math.max(1, w.months.length - 1)]).range([8, W - 8]), y = d3.scaleLinear().domain([0, d3.max(w.deaths) || 1]).range([H - 2, 4]);
  const area = d3.area().x((_, k) => x(k)).y0(H - 2).y1(d => y(d)).curve(d3.curveMonotoneX);
  el.selectAll('path.area').data([w.deaths]).join('path').attr('class', `area${w.estimated.every(Boolean) ? ' est' : ''}`).attr('d', area);
  el.selectAll('line.now').data([state.m]).join('line').attr('class', 'now').attr('x1', x).attr('x2', x).attr('y1', 0).attr('y2', H);
}
function renderLegend() {
  const w = state.war, any = c => features.some(() => false) || c;
  const items = [];
  if (w.sides.a.states.length) items.push(`<li><span class="swatch" style="background:var(--side-a)"></span>${esc(w.sides.a.label)}</li>`);
  if (w.sides.b.states.length) items.push(`<li><span class="swatch" style="background:var(--side-b)"></span>${esc(w.sides.b.label)}</li>`);
  if (w.control.length) items.push('<li><span class="swatch hatch"></span>Occupied (whole country)</li>');
  if (w.theatre.length) items.push('<li><span class="swatch" style="background:var(--contested)"></span>Contested (civil war)</li>');
  if (w.battles.some(b => b.lat != null)) items.push('<li><span class="swatch" style="background:#fff2c2;border-radius:50%;box-shadow:0 0 0 2px #ff8f1f"></span>Battle this month</li><li><span class="swatch" style="background:#c9b16b;opacity:.5;border-radius:50%"></span>Earlier battle</li>');
  if (w.events) items.push('<li><span class="swatch" style="background:#ff5a4f;opacity:.6;border-radius:50%"></span>Recorded clashes (UCDP)</li>');
  $('#legend').innerHTML = `<h4>${esc(monthLabel(w.months[state.m]))}</h4><ul>${items.join('')}</ul>`;
  void any;
}

/* ---------------------------------------------------------------- panel */
const popouts = new Map();
const addPop = (title, html) => { const id = 'p' + popouts.size; popouts.set(id, { title, html }); return id; };
function seeMoreList(items, limit, title) {
  if (items.length <= limit) return `<ul class="blist">${items.join('')}</ul>`;
  return `<ul class="blist">${items.slice(0, limit).join('')}</ul><button class="more" data-pop="${addPop(title, `<ul class="blist">${items.join('')}</ul>`)}">See all ${items.length} ›</button>`;
}
function battleItem(b) {
  return `<li data-qid="${esc(b.q)}"><button class="bname" data-b="${esc(b.q)}">${esc(b.n)}</button>${b.w ? `<a class="wl" href="${wikiUrl(b.w)}" target="_blank" rel="noreferrer">Wikipedia ↗</a>` : ''}
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
  const w = state.war, i = state.m, m = w.months[i], date = dateOf(i);
  // Under way this month: those starting this month first, then the shortest, so war-long campaigns sink.
  const span = b => Date.parse(b.e || b.s) - Date.parse(b.s);
  const now = w.battles.filter(b => b.p !== 'y' && b.s.slice(0, 7) <= m && (b.e || b.s).slice(0, 7) >= m)
    .sort((x, y) => (y.s.slice(0, 7) === m) - (x.s.slice(0, 7) === m) || span(x) - span(y));
  const deadliest = [...w.battles].filter(b => b.deaths || b.cas).sort((a, b) => (b.deaths || b.cas) - (a.deaths || a.cas));
  const months = w.months.length, years = Math.floor(months / 12);
  const sides = ['a', 'b'].map(s => {
    const on = statesOn(s, date), list = on.length > 14 ? `${on.slice(0, 14).join(', ')} <button class="more" data-pop="${addPop(`${w.sides[s].label}, ${monthLabel(m)}`, `<p>${esc(on.join(', '))}</p>`)}">+${on.length - 14} more</button>` : esc(on.join(', '));
    return `<div class="side-chip"><i style="background:var(--side-${s})"></i><b>${esc(w.sides[s].label)}</b></div>${on.length ? `<div class="meta" style="color:var(--muted);font-size:12px">${list}</div>` : ''}`;
  }).join('');
  const top = (w.top[i] || []).map(([d, deaths, where, dyad]) => `<li><b>${num(deaths)} deaths</b> · ${esc(where)}<small>${esc(fmtDate(d))} · ${esc(dyad)}</small></li>`);
  const bfYear = Math.min(2025, +m.slice(0, 4));
  $('#panel').innerHTML = `
    <h2 data-qid="${esc(w.qid || '')}">${esc(w.name)}</h2>
    <p class="sub">${esc(fmtDate(w.start))} – ${w.end ? esc(fmtDate(w.end)) : 'ongoing'} · ${years ? `${years} yr${years > 1 ? 's' : ''} ` : ''}${months % 12 ? `${months % 12} mo` : ''}</p>
    <div class="sides" style="margin-top:10px">${sides}</div>
    <div class="stat-row">
      <div class="stat"><span>Deaths, whole war</span><b>${num(w.totalDeaths)}</b><small>battle-related${w.ongoing ? `, to ${esc(fmtDate(w.dataThrough))}` : ''}</small></div>
      <div class="stat"><span>Battles &amp; operations</span><b>${num(w.battles.length)}</b><small>${num(w.battles.filter(b => b.lat != null).length)} mapped</small></div>
      <div class="stat"><span>Deaths so far</span><b>${num(cumulative[i])}</b><small>${Math.round(cumulative[i] / Math.max(1, w.totalDeaths) * 100)}% of the war's total</small></div>
      <div class="stat"><span>Clashes recorded</span><b>${w.events ? num(w.events) : '–'}</b><small>${w.events ? 'UCDP geolocated events' : 'no event data before 1989'}</small></div>
    </div>
    <a class="btn" href="${wikiUrl(w.wiki)}" target="_blank" rel="noreferrer">Wikipedia ↗</a>
    ${w.bf ? `<a class="btn" href="${esc(go('battlefield-history', `battlefield/history/index.html#y=${bfYear}&w=${w.bf}`))}" target="${embedded ? '_top' : '_self'}">World map, ${bfYear} ↗</a>` : ''}
    <h3>${esc(monthLabel(m))} <span class="count">${now.length} battle${now.length === 1 ? '' : 's'} or operation${now.length === 1 ? '' : 's'} under way</span></h3>
    ${now.length ? seeMoreList(now.map(battleItem), 8, `${w.name} · ${monthLabel(m)}`) : '<p class="empty">No battles or operations recorded as under way this month.</p>'}
    ${top.length ? `<h3>Deadliest clashes this month <span class="count">UCDP</span></h3><ul class="blist">${top.join('')}</ul>` : ''}
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
  const j = $('#jump'); if (j) j.onclick = () => { closeModal(); setMonth(mi); };
}
function closeModal() { $('#modal').hidden = true; }
$('#modal-close').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); else if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') { if (e.key === 'ArrowRight') setMonth(state.m + 1); if (e.key === 'ArrowLeft') setMonth(state.m - 1); } });

/* ---------------------------------------------------------------- timeline, playback, routing */
function setMonth(i) { if (!state.war) return; state.m = Math.max(0, Math.min(state.war.months.length - 1, i)); draw(false); writeHash(); }
function stop() { clearInterval(state.playing); state.playing = null; $('#play').textContent = '▶'; $('#play').setAttribute('aria-label', 'Play month by month'); }
function play() {
  if (state.playing) return stop();
  if (state.m >= state.war.months.length - 1) setMonth(0);
  $('#play').textContent = '❚❚'; $('#play').setAttribute('aria-label', 'Pause');
  state.playing = setInterval(() => { if (state.m >= state.war.months.length - 1) return stop(); setMonth(state.m + 1); }, +$('#speed').value);
}
$('#play').onclick = play;
$('#speed').onchange = () => { if (state.playing) { stop(); play(); } };
$('#prev').onclick = () => setMonth(state.m - 1);
$('#next').onclick = () => setMonth(state.m + 1);
$('#month').oninput = e => setMonth(+e.target.value);

/* ---------------------------------------------------------------- documentary narration */
// Told month by month for JDP-I Documentary mode (design/jdpi-narrator.js asks for one step at a time).
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
    if (kind) events.push({ kind, text, area: d3.geoArea(f) });
  }
  // Largest countries first; when several join one side at once, name the two largest and count the rest.
  events.sort((a, b) => b.area - a.area);
  const out = [];
  for (const k of ['joina', 'joinb']) {
    const js = events.filter(e => e.kind === k);
    if (js.length) out.push(js[0].text + (js.length > 1 ? `, ${js.length > 2 ? `with ${js.length - 1} other states and territories` : `as does ${js[1].text.split(' enters')[0].replace(/^The /, 'the ')}`}.` : '.'));
  }
  out.push(...events.filter(e => !e.kind.startsWith('join')).slice(0, 4).map(e => e.text));
  return out;
}
function monthStory(i) {
  const w = state.war, m = w.months[i], parts = [monthLabel(m) + '.'];
  if (i === 0) {
    const a = statesOn('a', dateOf(0)), b = statesOn('b', dateOf(0));
    if (a.length || b.length) parts.push(`On one side, ${a.length ? listNames(a.slice(0, 5)) : w.sides.a.label}; on the other, ${b.length ? listNames(b.slice(0, 5)) : w.sides.b.label}.`);
  }
  parts.push(...changes(i).slice(0, 4));
  const begun = w.battles.filter(b => b.p !== 'y' && b.s.slice(0, 7) === m).sort((x, y) => (y.deaths || 0) - (x.deaths || 0) || !!y.w - !!x.w).slice(0, 3);
  for (const b of begun) parts.push(battleLine(b));
  const ended = w.battles.filter(b => b.p !== 'y' && b.e && b.e !== b.s && b.e.slice(0, 7) === m && (b.deaths || 0) >= 10000).slice(0, 2);
  for (const b of ended) parts.push(`The ${b.n.replace(/^the /i, '')} ends, at a cost of some ${spokenNumber(b.deaths)} lives.`);
  if (w.deaths[i] > 0) parts.push(`${w.estimated[i] ? 'An estimated' : 'Some'} ${spokenNumber(w.deaths[i])} die in battle this month, bringing the toll to about ${spokenNumber(cumulative[i])}.`);
  const top = w.top[i]?.[0];
  if (top && top[1] >= 20) parts.push(`The deadliest recorded clash is at ${String(top[2]).replace(/\s*\(.*\)$/, '')}, where ${spokenNumber(top[1])} are killed.`);
  if (parts.length === 1) parts.push('The fighting continues.');
  return parts.join(' ');
}
window.jdpiDocumentary = {
  get title() { return state.war ? `War Focus · ${state.war.name}` : 'War Focus'; },
  async *story() {
    stop();
    const w = state.war;
    let intro = `${w.name}. ${fmtDate(w.start)} to ${w.end ? fmtDate(w.end) : 'the present day'}: ${w.sides.a.label} against ${w.sides.b.label}.`;
    try {
      const s = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(w.wiki.replace(/ /g, '_'))}`).then(r => r.json());
      if (s.extract) intro += ' ' + (s.extract.match(/[^.!?]+[.!?]+/g) || [s.extract]).slice(0, 3).join(' ').trim();
    } catch {}
    intro += ` In all, about ${spokenNumber(w.totalDeaths)} died in battle${w.ongoing ? ' so far' : ''}.`;
    yield { text: intro, el: document.querySelector('#panel h2') };
    for (let i = state.m; i < w.months.length; i++) {
      if (state.war !== w) return;
      setMonth(i); await sleepMs(500);
      yield { text: monthStory(i), el: document.querySelector('.counters') };
      const next = w.months[i + 1];
      if (next && next.slice(0, 4) !== w.months[i].slice(0, 4)) yield { chapterEnd: true, label: `Continue to ${next.slice(0, 4)}` };
    }
    yield { text: w.end ? `The war ended on ${fmtDate(w.end)}. About ${spokenNumber(w.totalDeaths)} had died in battle.` : `The war goes on. The record here runs to ${fmtDate(w.dataThrough)}, with about ${spokenNumber(w.totalDeaths)} battle deaths so far.`, el: document.querySelector('#panel h2') };
  },
};

function writeHash() { if (state.war) history.replaceState(null, '', `#war=${state.war.id}&m=${state.war.months[state.m]}`); }
async function loadWar(id, month) {
  stop();
  const w = await fetch(`data/wars/${id}.json`).then(r => r.json());
  state.war = w; cumulative = []; w.deaths.reduce((s, v, k) => (cumulative[k] = s + v), 0);
  const mi = month ? w.months.indexOf(month) : -1;
  state.m = mi >= 0 ? mi : 0;
  $('#war').value = id;
  const sl = $('#month'); sl.max = w.months.length - 1; sl.value = state.m;
  const step = w.months.length > 150 ? 60 : w.months.length > 60 ? 24 : w.months.length > 24 ? 12 : w.months.length > 8 ? 3 : 1;
  $('#ticks').innerHTML = w.months.map((m, k) => (k % step === 0 ? `<span style="left:${(k / Math.max(1, w.months.length - 1)) * 100}%">${step >= 12 ? m.slice(0, 4) : m.slice(2).replace('-', '/')}</span>` : '')).join('');
  $('#status').textContent = `${w.sides.a.label} v ${w.sides.b.label}`;
  fitProjection(); writeHash();
}
function readHash() { const p = new URLSearchParams(location.hash.slice(1)); return { war: p.get('war'), m: p.get('m') }; }
window.addEventListener('hashchange', () => { const h = readHash(); if (h.war && h.war !== state.war?.id) loadWar(h.war, h.m); else if (h.m && state.war) { const k = state.war.months.indexOf(h.m); if (k >= 0 && k !== state.m) setMonth(k); } });

Promise.all([fetch('data/index.json').then(r => r.json()), fetch('../history/data/borders.topo.json').then(r => r.json())]).then(([idx, borders]) => {
  state.index = idx; state.borders = borders;
  const eras = [['1926–1945', w => w.start < '1946'], ['1946–1988', w => w.start >= '1946' && w.start < '1989'], ['1989 to today', w => w.start >= '1989']];
  $('#war').innerHTML = eras.map(([l, f]) => `<optgroup label="${l}">${idx.wars.filter(f).map(w => `<option value="${w.id}">${esc(w.name)} (${w.start.slice(0, 4)}–${w.end ? w.end.slice(0, 4) : 'now'})</option>`).join('')}</optgroup>`).join('');
  $('#war').onchange = e => loadWar(e.target.value);
  initMap();
  const h = readHash();
  loadWar(idx.wars.some(w => w.id === h.war) ? h.war : 'ww2', h.m);
}).catch(e => { $('#status').textContent = 'War data could not load: ' + e.message; });
