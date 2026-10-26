/* Retrospective Battlefield — every war and armed conflict, year by year, 1926–2025.
   Borders: CShapes 2.0. Conflicts: UCDP/PRIO ACD (1946–2025) and Correlates of War (1926–1945). */
import { displayName } from './names.mjs';

const W = 1000, H = 600;
const state = { year: 2025, selected: null, war: null, data: null, features: [], playing: null, focus: {} };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n).toLocaleString('en-GB');
const FILL = { war: 'var(--c-war)', minor: 'var(--c-minor)', abroad: 'var(--c-abroad)', peace: 'var(--c-peace)' };

let svg, g, projection, path, zoom;

/* ---------------------------------------------------------------- data helpers */
const dateFor = y => `${y}-07-01`;
const activeOn = date => state.features.filter(f => f.properties.s <= date && date <= f.properties.e);
const levelIn = (w, y) => w.years.find(([yy]) => yy === y)?.[1] || 0;
const warsIn = y => state.data.wars.filter(w => levelIn(w, y)).sort((a, b) => levelIn(b, y) - levelIn(a, y) || a.name.localeCompare(b.name));
const nameOf = (gw, y) => {
  const f = activeOn(dateFor(y)).find(x => x.properties.gw === gw) || state.features.find(x => x.properties.gw === gw);
  return f ? displayName(gw, f.properties.name, dateFor(y)) : `State ${gw}`;
};
// Per-country status this year: war or minor conflict on its territory, or fighting only abroad.
function statusMap(y) {
  const m = new Map();
  for (const w of warsIn(y)) {
    const lvl = levelIn(w, y);
    for (const gw of w.loc) { const cur = m.get(gw); if (cur !== 'war') m.set(gw, lvl === 2 ? 'war' : 'minor'); }
    for (const gw of w.states) if (!m.has(gw)) m.set(gw, 'abroad');
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

/* ---------------------------------------------------------------- map */
function drawMap() {
  svg = d3.select('#map').attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'xMidYMid meet');
  projection = d3.geoNaturalEarth1().fitExtent([[10, 10], [W - 10, H - 10]], { type: 'FeatureCollection', features: activeOn('2020-01-01') });
  path = d3.geoPath(projection);
  g = svg.append('g');
  zoom = d3.zoom().scaleExtent([1, 40]).on('zoom', ev => g.attr('transform', ev.transform));
  svg.call(zoom);
  $('#zoom-in').onclick = () => svg.transition().call(zoom.scaleBy, 1.6);
  $('#zoom-out').onclick = () => svg.transition().call(zoom.scaleBy, 1 / 1.6);
  $('#zoom-reset').onclick = () => svg.transition().call(zoom.transform, d3.zoomIdentity);
}

function renderMap() {
  const y = state.year, date = dateFor(y), status = statusMap(y), tip = $('#tooltip');
  const involved = new Set(state.war ? [...state.war.loc, ...state.war.states] : []);
  g.selectAll('path.shape')
    .data(activeOn(date), d => `${d.properties.gw}|${d.properties.s}`)
    .join('path')
    .attr('d', path)
    .attr('class', d => `shape active${d.properties.gw === state.selected ? ' selected' : ''}${involved.has(d.properties.gw) ? ' involved' : ''}`)
    .attr('fill', d => FILL[status.get(d.properties.gw) || 'peace'])
    .on('mousemove', (ev, d) => {
      const box = $('.map-wrap').getBoundingClientRect();
      const ws = warsIn(y).filter(w => w.loc.includes(d.properties.gw) || w.states.includes(d.properties.gw));
      tip.innerHTML = `<strong>${esc(displayName(d.properties.gw, d.properties.name, date))}</strong>${ws.length ? ws.slice(0, 3).map(w => esc(w.name)).join('<br>') + (ws.length > 3 ? `<br>+${ws.length - 3} more` : '') : 'No recorded armed conflict'}`;
      tip.hidden = false;
      tip.style.left = `${Math.min(ev.clientX - box.left + 14, box.width - tip.offsetWidth - 8)}px`;
      tip.style.top = `${ev.clientY - box.top + 14}px`;
    })
    .on('mouseleave', () => { tip.hidden = true; })
    .on('click', (ev, d) => select(d.properties.gw));
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
function openPopout(key) {
  const p = popouts.get(key);
  if (!p) return;
  $('#modal-title').textContent = p.title;
  $('#modal-body').innerHTML = p.html;
  $('#modal').hidden = false;
  $('#modal-body').querySelectorAll('.war[data-id]').forEach(el => el.onclick = () => { closePopout(); selectWar(el.dataset.id); });
  $('#modal-close').focus();
}
function closePopout() { $('#modal').hidden = true; }
$('#modal-close').onclick = closePopout;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closePopout(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopout(); });

/* ---------------------------------------------------------------- panel */
function warCard(w, y) {
  const l = levelIn(w, y);
  return `<div class="war${state.war === w ? ' sel' : ''}" data-level="${l}" data-id="${w.id}"><div class="who">${esc(w.name)}</div><div class="meta">${esc(w.type)} · ${span(w)}${w.deaths ? ` · ${num(w.deaths)} battle deaths in total` : ''}</div></div>`;
}

// War Focus covers the major wars month by month; a UCDP conflict can span several of them (Afghanistan, Chechnya),
// so pick the one running in the selected year, else the nearest.
function focusLink(w, y) {
  const fs = state.focus[w.id]; if (!fs) return '';
  const f = fs.find(f => +f.start.slice(0, 4) <= y && (!f.end || +f.end.slice(0, 4) >= y)) || fs.reduce((a, b) => (Math.abs(+a.start.slice(0, 4) - y) <= Math.abs(+b.start.slice(0, 4) - y) ? a : b));
  const m = `${Math.min(Math.max(y, +f.start.slice(0, 4)), +(f.end || '9999').slice(0, 4))}-01`;
  const month = m < f.start.slice(0, 7) ? f.start.slice(0, 7) : f.end && m > f.end.slice(0, 7) ? f.end.slice(0, 7) : m;
  return `<a class="btn" href="../focus/index.html#war=${f.id}&m=${month}">War Focus: ${esc(f.name)}, month by month →</a>`;
}

function warDetail(w, y) {
  const l = levelIn(w, y);
  const activeYears = w.years.length;
  const warYears = w.years.filter(([, x]) => x === 2).length;
  const places = w.loc.map(gw => nameOf(gw, y)).filter((v, i, a) => a.indexOf(v) === i);
  const intro = w.src === 'cow'
    ? `${esc(w.name)} was ${/^[aeiou]/i.test(w.type) ? 'an' : 'a'} ${esc(w.type.toLowerCase())} fought ${w.span.replace('–', ' to ')}${w.deaths ? `, with about ${num(w.deaths)} battle deaths according to the Correlates of War project` : ''}.`
    : `UCDP records this ${esc(w.type.toLowerCase())} over ${esc(w.aim)} in ${esc(places.join(', '))}, active in ${activeYears} year${activeYears > 1 ? 's' : ''} between ${w.years[0][0]} and ${w.years.at(-1)[0]}${warYears ? `, ${warYears} of them at war level (1,000+ battle deaths)` : ''}.`;
  return `<button class="close" id="close-war" aria-label="Back">×</button>
    <h2>${esc(w.name)}</h2><p class="sub">${esc(w.type)} · ${span(w)}</p>
    <p>${intro}</p>
    ${l ? `<p><span class="tag ${l === 2 ? 'irregular' : 'office'}">${y}</span> ${levelLabel(l)}</p>` : `<p class="empty">Not active in ${y}.</p>`}
    <div class="sides"><b>Side A</b>${seeMoreText(w.sideA, 8, `${w.name} · side A`)}<b>Side B</b>${seeMoreText(w.sideB, 8, `${w.name} · side B`)}</div>
    <a class="btn" href="${wikiUrl(w)}" target="_blank" rel="noreferrer">${w.wiki ? 'Wikipedia article ↗' : 'Search Wikipedia ↗'}</a>
    ${focusLink(w, y)}
    ${w.src === 'ucdp' ? `<h3>Year by year <span class="count">red = war level</span></h3><p class="meta">${seeMore(w.years.map(([yy, x]) => `<span style="color:${x === 2 ? 'var(--c-war)' : 'var(--c-minor)'}">${yy}</span> `), 24, `${w.name} · active years`)}</p>` : ''}`;
}

function renderPanel() {
  const y = state.year, panel = $('#panel');
  popouts.clear();
  let html;
  if (state.war) html = warDetail(state.war, y);
  else if (state.selected) {
    const gw = state.selected;
    const here = warsIn(y).filter(w => w.loc.includes(gw)), abroad = warsIn(y).filter(w => !w.loc.includes(gw) && w.states.includes(gw));
    // Every conflict this state took part in or hosted, across the whole period, oldest first.
    const ever = state.data.wars.filter(w => w.loc.includes(gw) || w.states.includes(gw)).sort((a, b) => a.years[0][0] - b.years[0][0]);
    const onSoil = ever.filter(w => w.loc.includes(gw)), away = ever.filter(w => !w.loc.includes(gw));
    const cards = list => list.map(w => warCard(w, y));
    const byDecade = list => [...new Set(list.map(w => Math.floor(w.years[0][0] / 10) * 10))]
      .map(d => `<h3>${d}s</h3>${list.filter(w => Math.floor(w.years[0][0] / 10) * 10 === d).map(w => warCard(w, y)).join('')}`).join('');
    const cname = nameOf(gw, y);
    html = `<button class="close" id="close" aria-label="Close">×</button><h2>${esc(cname)}</h2>
      <p class="sub">${here.length ? `${here.length} conflict${here.length > 1 ? 's' : ''} on its territory in ${y}` : `No conflict on its territory in ${y}`}${abroad.length ? ` · fighting in ${abroad.length} abroad` : ''}</p>
      ${here.length ? `<h3>On its territory in ${y}</h3>${seeMore(cards(here), 6, `${cname} · conflicts on its territory in ${y}`)}` : ''}
      ${abroad.length ? `<h3>Fighting abroad in ${y}</h3>${seeMore(cards(abroad), 6, `${cname} · fighting abroad in ${y}`)}` : ''}
      <h3>All conflicts ${state.data.firstYear}–${state.data.lastYear} <span class="count">${ever.length} · ${onSoil.length} on its territory · ${away.length} abroad</span></h3>
      ${ever.length ? seeMore(cards(ever), 6, `${cname} · all conflicts ${state.data.firstYear}–${state.data.lastYear}`,
        `<p class="sub">${ever.length} conflicts: ${onSoil.length} fought on its territory, ${away.length} fought abroad. Before ${state.data.ucdpFrom} only wars with 1,000+ battle deaths are recorded.</p>${byDecade(ever)}`) : '<p class="empty">None recorded.</p>'}`;
  } else {
    const list = warsIn(y), wars = list.filter(w => levelIn(w, y) === 2).length;
    html = `<h2>${y}</h2><p class="sub">${list.length} armed conflict${list.length === 1 ? '' : 's'}, ${wars} at war level</p>
      ${list.length ? seeMore(list.map(w => warCard(w, y)), 15, `All armed conflicts in ${y}`) : '<p class="empty">No conflicts recorded.</p>'}
      <p class="note">Click a country or a war for details. Drag the slider or press ▶ to move through the years.</p>`;
  }
  const src = y < state.data.ucdpFrom ? state.data.sources.cow + '. Before 1946 only wars with 1,000+ battle deaths are recorded.' : state.data.sources.ucdp + '.';
  panel.innerHTML = html + `<p class="src-note">Source: ${esc(src)} Borders: CShapes 2.0.</p>`;
  panel.querySelectorAll('.war[data-id]').forEach(el => el.onclick = () => selectWar(el.dataset.id));
  panel.querySelectorAll('[data-more]').forEach(b => b.onclick = () => openPopout(b.dataset.more));
  $('#close')?.addEventListener('click', () => select(null));
  $('#close-war')?.addEventListener('click', () => selectWar(null));
}

/* ---------------------------------------------------------------- year control, selection, URL */
function setYear(y, { push = true } = {}) {
  state.year = Math.max(state.data.firstYear, Math.min(state.data.lastYear, y));
  $('#year').value = state.year;
  $('#year-big').textContent = state.year;
  renderMap(); renderPanel();
  if (push) writeHash();
}
function stopPlay() {
  clearInterval(state.playing); state.playing = null;
  $('#play').textContent = '▶'; $('#play').setAttribute('aria-label', 'Play through the years');
}
function setupTimeline() {
  const { firstYear: a, lastYear: b } = state.data, slider = $('#year');
  slider.min = a; slider.max = b;
  $('#ticks').innerHTML = Array.from({ length: Math.floor((b - a) / 10) + 1 }, (_, i) => a + 4 + i * 10)
    .filter(y => y <= b).map(y => `<span style="left:${((y - a) / (b - a)) * 100}%">${y}</span>`).join('');
  slider.addEventListener('input', () => setYear(+slider.value));
  $('#prev').onclick = () => { stopPlay(); setYear(state.year - 1); };
  $('#next').onclick = () => { stopPlay(); setYear(state.year + 1); };
  $('#play').onclick = () => {
    if (state.playing) return stopPlay();
    if (state.year >= b) setYear(a);
    $('#play').textContent = '❚❚'; $('#play').setAttribute('aria-label', 'Pause');
    state.playing = setInterval(() => { if (state.year >= b) stopPlay(); else setYear(state.year + 1); }, 900);
  };
}
function select(gw) { state.selected = gw; state.war = null; renderMap(); renderPanel(); writeHash(); }
function selectWar(id) {
  state.war = state.data.wars.find(w => w.id === id) || null;
  if (state.war && !levelIn(state.war, state.year)) setYear(state.war.years[0][0], { push: false });
  renderMap(); renderPanel(); writeHash();
}
function writeHash() {
  const h = `#y=${state.year}${state.selected ? `&c=${state.selected}` : ''}${state.war ? `&w=${state.war.id}` : ''}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return { y: +p.get('y') || state.data.lastYear, c: +p.get('c') || null, w: p.get('w') };
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
    if (r.war) selectWar(r.war); else { if (r.year > state.year || +r.year < state.data.firstYear) setYear(r.year, { push: false }); select(r.gw); }
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
// For JDP-I Documentary mode (design/jdpi-narrator.js): the century of conflict, year by year, pausing each decade.
const warNew = (w, y) => w.years[0][0] === y;
function yearStory(y) {
  const all = warsIn(y), wars = all.filter(w => levelIn(w, y) === 2), fresh = all.filter(w => warNew(w, y) && levelIn(w, y) === 2);
  const ended = state.data.wars.filter(w => w.years.at(-1)[0] === y - 1 && levelIn(w, y - 1) === 2 && y - 1 < state.data.lastYear);
  const parts = [`${y}.`];
  parts.push(all.length ? `${all.length} armed conflict${all.length > 1 ? 's are' : ' is'} under way, ${wars.length ? `${wars.length} of ${all.length > 1 ? 'them' : 'it'} at the level of war, with a thousand or more battle deaths` : 'none of them at the level of war'}.` : 'The world records no armed conflict this year.');
  const big = (fresh.length ? fresh : wars).slice().sort((a, b) => (b.deaths || 0) - (a.deaths || 0)).slice(0, 3);
  if (fresh.length) parts.push(`New this year: ${big.map(w => w.name.replace(/:/, ',')).join('; ')}.`);
  else if (big.length) parts.push(`The largest: ${big.map(w => w.name.replace(/:/, ',')).join('; ')}.`);
  if (ended.length) parts.push(`Coming to an end: ${ended.slice(0, 2).map(w => w.name.replace(/:/, ',')).join('; ')}.`);
  const focus = big.find(w => state.focus[w.id]);
  if (focus) parts.push(`War Focus follows ${state.focus[focus.id][0].name} month by month.`);
  return parts.join(' ');
}
window.jdpiDocumentary = {
  get title() { return `Retrospective Battlefield · ${state.year}`; },
  async *story() {
    if (state.playing) $('#play')?.click();
    yield { text: `A century of war, from ${state.data.firstYear} to ${state.data.lastYear}, drawn on the map as the world stood each year. We begin in ${state.year}.`, el: $('#year-big') };
    for (let y = state.year; y <= state.data.lastYear; y++) {
      setYear(y, { push: false });
      await new Promise(r => setTimeout(r, 400));
      yield { text: yearStory(y), el: $('#panel') };
      if (y % 10 === 9 && y < state.data.lastYear) yield { chapterEnd: true, label: `Continue to the ${y + 1}s` };
    }
  },
};

(async function init() {
  try {
    const [topo, data, focus] = await Promise.all([
      fetch('data/borders.topo.json').then(r => r.json()),
      fetch('data/wars.json').then(r => r.json()),
      fetch('../focus/data/index.json').then(r => r.json()).catch(() => ({ wars: [] })),
    ]);
    state.data = data;
    for (const f of focus.wars) if (f.bf) (state.focus[f.bf] ||= []).push(f);
    state.features = topojson.feature(topo, topo.objects.borders).features;
    $('#status').textContent = `${data.wars.length} wars and armed conflicts · ${data.firstYear}–${data.lastYear} · historical borders`;
    drawMap(); setupTimeline(); setupSearch();
    const { y, c, w } = readHash();
    state.selected = c;
    setYear(y, { push: false });
    if (w) selectWar(w);
    window.addEventListener('hashchange', () => {
      const h = readHash();
      if (h.y !== state.year) setYear(h.y, { push: false });
      if (h.c !== state.selected) select(h.c);
      if ((h.w || null) !== (state.war?.id || null)) selectWar(h.w);
    });
  } catch (err) {
    console.error(err);
    $('#status').textContent = 'Could not load conflict history.';
  }
})();
