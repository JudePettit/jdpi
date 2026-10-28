// GEOINT & IMINT Dashboard · Imagery: NASA GIBS daily imagery on a Leaflet map, one day or a before/after swipe.
// URL keys: l (product id), d (day, or "before"), d2 ("after"), cmp=1 (swipe), fire=1, lab=0 (labels off).
import { esc, fmtDay, addDays, isISODate, clampDay, daysBetween } from './util.js';
import {
  IMAGERY, imageryById, gibsTileUrl, maxNativeZoom, IMAGERY_PRESETS, FIRE_LAYERS, GIBS_WMS, GIBS_CREDIT, fireLayerNames,
  copernicusUrl, COPERNICUS_DATASETS, worldviewUrl, waybackUrl, googleEarthUrl, EARTHEXPLORER, LANDSATLOOK, ESRI_LABELS,
  domainsInclude, nearestDay,
} from './sources.js';
import { createMap, syncToView, baseLayers } from './maps.js';

const FIRE_IDS = ['n20', 'n21', 'snpp'];
const apart = (a, b) => { const d = Math.abs(daysBetween(a, b)); return d > 730 ? `${Math.round(d / 365.25)} years apart` : d > 90 ? `${Math.round(d / 30.44)} months apart` : `${d} ${d === 1 ? 'day' : 'days'} apart`; };

export async function init(panel, ctx) {
  const $ = s => panel.querySelector(s);
  const latest = await ctx.latest(), newest = await ctx.newest();
  const st = { layer: IMAGERY[0], d1: latest, d2: latest, cmp: false, fires: false, labels: true, preset: null, pos: 0.5 };
  readState(ctx.state, true);

  /* ---------- controls ---------- */
  const groups = [...new Set(IMAGERY.map(l => l.group))];
  $('#im-layer').innerHTML = groups.map(g => `<optgroup label="${esc(g)}">${IMAGERY.filter(l => l.group === g).map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</optgroup>`).join('');
  $('#im-preset').insertAdjacentHTML('beforeend', IMAGERY_PRESETS.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join(''));

  /* ---------- map ---------- */
  const map = createMap($('#im-map'), ctx, 'imagery', { minZoom: 2, maxZoom: 12 });
  baseLayers(map, { kind: 'map', labels: false });
  map.createPane('fires').style.zIndex = 320;
  const labels = L.tileLayer(ESRI_LABELS, { pane: 'labels', maxNativeZoom: 12, maxZoom: 12, attribution: 'Labels © Esri' });
  let A = null, B = null, FA = null, FB = null;

  // Swipe: the "after" layer shows right of the divider, the "before" layer left of it (CSS clip on each layer container).
  const box = $('#im-map');
  box.insertAdjacentHTML('beforeend', `<div class="swipe" hidden><div class="swipe-line" aria-hidden="true"></div>
    <span class="swipe-tag left" id="im-tag1"></span><span class="swipe-tag right" id="im-tag2"></span>
    <input class="swipe-range" type="range" min="0" max="1" step="0.001" value="0.5" aria-label="Swipe between before (left) and after (right)"></div>`);
  const swipe = box.querySelector('.swipe'), range = swipe.querySelector('input'), line = swipe.querySelector('.swipe-line');
  L.DomEvent.disableClickPropagation(swipe);
  ['mousedown', 'touchstart', 'pointerdown'].forEach(ev => range.addEventListener(ev, () => map.dragging.disable()));
  ['mouseup', 'touchend', 'pointerup', 'blur'].forEach(ev => range.addEventListener(ev, () => map.dragging.enable()));
  range.addEventListener('input', () => { st.pos = +range.value; clip(); });
  range.addEventListener('keydown', e => {
    const to = { ArrowLeft: st.pos - 0.02, ArrowDown: st.pos - 0.02, ArrowRight: st.pos + 0.02, ArrowUp: st.pos + 0.02, PageDown: st.pos - 0.1, PageUp: st.pos + 0.1, Home: 0, End: 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault(); e.stopPropagation();
    st.pos = Math.min(1, Math.max(0, to)); range.value = String(st.pos); clip();
  });

  function clip() {
    const left = [A, FA], right = [B, FB];
    if (!st.cmp) { [...left, ...right].forEach(l => { const c = l?.getContainer?.(); if (c) c.style.clip = ''; }); return; }
    const size = map.getSize(), nw = map.containerPointToLayerPoint([0, 0]), se = map.containerPointToLayerPoint(size);
    const x = nw.x + size.x * st.pos;
    left.forEach(l => { const c = l?.getContainer?.(); if (c) c.style.clip = `rect(${nw.y}px, ${x}px, ${se.y}px, ${nw.x}px)`; });
    right.forEach(l => { const c = l?.getContainer?.(); if (c) c.style.clip = `rect(${nw.y}px, ${se.x}px, ${se.y}px, ${x}px)`; });
    line.style.left = `${st.pos * 100}%`;
  }
  map.on('move zoom zoomend resize viewreset', clip);

  const gibs = (day) => L.tileLayer(gibsTileUrl(st.layer, day), {
    pane: 'imagery', maxNativeZoom: maxNativeZoom(st.layer), maxZoom: 12, attribution: GIBS_CREDIT, keepBuffer: 1,
  });
  const fireLayer = (day) => L.tileLayer.wms(GIBS_WMS, {
    pane: 'fires', layers: fireLayerNames(FIRE_IDS), format: 'image/png', transparent: true, version: '1.3.0', TIME: day, tileSize: 512, zoomOffset: 0, attribution: 'Fires: NASA GIBS (VIIRS)',
  });

  function draw() {
    [A, B, FA, FB].forEach(l => l && map.removeLayer(l));
    A = gibs(st.d1).addTo(map);
    B = st.cmp ? gibs(st.d2).addTo(map) : null;
    FA = st.fires ? fireLayer(st.d1).addTo(map) : null;
    FB = st.fires && st.cmp ? fireLayer(st.d2).addTo(map) : null;
    if (st.labels) labels.addTo(map); else map.removeLayer(labels);
    swipe.hidden = !st.cmp;
    clip();
    // Clip again as soon as the new containers exist with tiles in them.
    requestAnimationFrame(clip);
  }

  /* ---------- state ---------- */
  function readState(s, first = false) {
    st.layer = imageryById(s.l || st.layer.id);
    st.cmp = s.cmp === '1';
    st.fires = s.fire === '1';
    st.labels = s.lab !== '0';
    const d = isISODate(s.d) ? s.d : null, d2 = isISODate(s.d2) ? s.d2 : null;
    if (st.cmp) { st.d2 = clampDay(d2 || latest, st.layer.start, newest); st.d1 = clampDay(d || addDays(st.d2, -7), st.layer.start, newest); }
    else st.d1 = clampDay(d || (first ? latest : st.d1), st.layer.start, newest);
  }
  function writeState() {
    ctx.set({ l: st.layer.id === IMAGERY[0].id ? null : st.layer.id, d: st.d1 === latest && !st.cmp ? null : st.d1, d2: st.cmp ? st.d2 : null, cmp: st.cmp || null, fire: st.fires || null, lab: st.labels ? null : '0' });
  }
  function syncControls() {
    $('#im-layer').value = st.layer.id;
    for (const [id, v] of [['#im-d1', st.d1], ['#im-d2', st.d2]]) { const el = $(id); el.min = st.layer.start; el.max = newest; el.value = v; }
    $('#im-d1').disabled = !!st.layer.fixed; $('#im-d2').disabled = !!st.layer.fixed;
    $('#im-d1-l').textContent = st.cmp ? 'Before (UTC)' : 'Date (UTC)';
    $('#im-compare').checked = st.cmp;
    $('#im-d2-f').hidden = !st.cmp;
    $('#im-fires').setAttribute('aria-pressed', String(st.fires));
    $('#im-labels').setAttribute('aria-pressed', String(st.labels));
    $('#im-tag1').textContent = `Before · ${fmtDay(st.d1)}`;
    $('#im-tag2').textContent = `After · ${fmtDay(st.d2)}`;
  }
  function update({ redraw = true } = {}) {
    syncControls();
    if (redraw) draw();
    info();
    links();
    caption();
    writeState();
  }

  /* ---------- side panel ---------- */
  let checkSeq = 0;
  async function info() {
    const L1 = st.layer, seq = ++checkSeq;
    const days = st.cmp ? [st.d1, st.d2] : [st.d1];
    const preset = st.preset ? IMAGERY_PRESETS.find(p => p.id === st.preset) : null;
    const row = (k, v) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`;
    const base = row('Product', esc(L1.name)) + row('Pixel size', esc(L1.res)) + row('Taken', esc(L1.pass)) +
      row(st.cmp ? 'Days' : 'Day', L1.fixed ? 'Annual composite, 2016' : days.map(d => `${fmtDay(d)}`).join(' → ') + (st.cmp ? ` <span class="muted">(${apart(st.d1, st.d2)})</span>` : ''));
    $('#im-info').innerHTML = `<dl class="kv">${base}<div><dt>Coverage</dt><dd id="im-avail"><span class="muted">checking…</span></dd></div></dl>${preset ? `<p class="preset-note">${esc(preset.note)}</p>` : ''}`;
    if (L1.fixed) { $('#im-avail').textContent = 'Composite available'; return; }
    try {
      const out = [];
      for (const d of days) {
        const ranges = await ctx.domains(L1, addDays(d, -30) < L1.start ? L1.start : addDays(d, -30), clampDay(addDays(d, 30), L1.start, newest));
        if (seq !== checkSeq) return;
        if (domainsInclude(ranges, d)) out.push(`<span class="ok">✓</span> ${fmtDay(d)}`);
        else {
          const near = nearestDay(ranges, d);
          out.push(`<span class="no">✕</span> No imagery on ${fmtDay(d)}${near ? `. <button type="button" class="linkish" data-goto="${near}" data-which="${d === st.d1 ? 1 : 2}">Show ${fmtDay(near)}</button>` : ''}`);
        }
      }
      $('#im-avail').innerHTML = out.join('<br>');
    } catch { if (seq === checkSeq) $('#im-avail').textContent = 'Could not check availability'; }
  }
  $('#im-info').addEventListener('click', e => {
    const b = e.target.closest('[data-goto]');
    if (!b) return;
    if (b.dataset.which === '2') st.d2 = b.dataset.goto; else st.d1 = b.dataset.goto;
    update();
  });

  function links() {
    const c = map.getCenter(), z = map.getZoom(), b = map.getBounds();
    const day = st.cmp ? st.d2 : st.d1, lat = c.lat, lon = c.lng;
    const item = (href, t, u) => `<li><a href="${esc(href)}" target="_blank" rel="noopener"><span class="t">${esc(t)} ↗</span><span class="u">${esc(u)}</span></a></li>`;
    const cop = COPERNICUS_DATASETS.map(ds => item(copernicusUrl({ lat, lon, z: z + 3, day, from: addDays(day, -ds.days), dataset: ds.dataset, layer: ds.layer }), `Copernicus Browser · ${ds.name}`, `Newest image in the ${ds.days} days to ${fmtDay(day)}`));
    const wv = worldviewUrl({ bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((v, i) => (i % 2 ? Math.max(-85, Math.min(85, v)) : Math.max(-180, Math.min(180, v)))), layer: st.layer.layer, day: st.d1, day2: st.cmp ? st.d2 : null });
    $('#im-links').innerHTML = [
      ...cop,
      item(wv, 'NASA Worldview', st.cmp ? 'Same product and both days, in its own swipe view' : 'Same product and day, with animation and more layers'),
      item(waybackUrl({ lat, lon, z: Math.max(14, z + 4) }), 'Esri World Imagery Wayback', 'Dated sub-metre archive since 2014, to look at'),
      item(googleEarthUrl({ lat, lon, range: 40000000 / 2 ** z }), 'Google Earth (web)', 'Historical imagery and 3D terrain'),
      item(EARTHEXPLORER, 'USGS EarthExplorer', 'Landsat since 1972 and more; free login to download. Search by these coordinates'),
      item(LANDSATLOOK, 'USGS LandsatLook', 'Landsat scenes in the browser, no download needed'),
    ].join('') + `<li class="coords"><span class="muted">Centre</span> <code>${lat.toFixed(5)}, ${lon.toFixed(5)}</code> <button type="button" class="prp-btn sm ghost" data-copy-text="${lat.toFixed(5)}, ${lon.toFixed(5)}">Copy</button></li>`;
  }
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-copy-text]');
    if (!b) return;
    navigator.clipboard?.writeText(b.dataset.copyText).then(() => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); }, () => {});
  });

  function caption() {
    const L1 = st.layer;
    const when = L1.fixed ? 'composite of 2016' : st.cmp ? `${fmtDay(st.d1)} (left) and ${fmtDay(st.d2)} (right), UTC days` : `${fmtDay(st.d1)}, UTC day`;
    $('#im-caption').innerHTML = `<b>Figure 1.</b> ${esc(L1.name)}, ${esc(when)}${st.fires ? ', with VIIRS fire and thermal-anomaly detections in red' : ''}. Pixels about ${esc(L1.res)}; ${L1.night ? 'night-time radiance, brighter where more light is emitted' : 'imagery taken ' + esc(L1.pass)}. ${st.cmp ? 'Drag the handle, or focus it and use the arrow keys, to compare. ' : ''}Source: NASA EOSDIS GIBS.`;
  }

  /* ---------- events ---------- */
  $('#im-layer').addEventListener('change', e => { st.layer = imageryById(e.target.value); st.preset = null; $('#im-preset').value = ''; st.d1 = clampDay(st.d1, st.layer.start, newest); st.d2 = clampDay(st.d2, st.layer.start, newest); update(); });
  for (const id of ['#im-d1', '#im-d2']) {
    $(id).addEventListener('change', e => {
      const v = e.target.value;
      if (!isISODate(v)) return;
      if (id === '#im-d1') st.d1 = clampDay(v, st.layer.start, newest); else st.d2 = clampDay(v, st.layer.start, newest);
      update();
    });
  }
  panel.querySelectorAll('.datebox [data-step]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.for === 'im-d1') st.d1 = clampDay(addDays(st.d1, +b.dataset.step), st.layer.start, newest);
    else if (b.dataset.for === 'im-d2') st.d2 = clampDay(addDays(st.d2, +b.dataset.step), st.layer.start, newest);
    else return;
    update();
  }));
  $('#im-compare').addEventListener('change', e => {
    st.cmp = e.target.checked;
    if (st.cmp && st.d1 >= st.d2) { st.d2 = st.d1; st.d1 = clampDay(addDays(st.d2, -7), st.layer.start, newest); }
    update();
  });
  $('#im-fires').addEventListener('click', () => { st.fires = !st.fires; update(); });
  $('#im-labels').addEventListener('click', () => { st.labels = !st.labels; update(); });
  $('#im-latest').addEventListener('click', () => { if (st.cmp) st.d2 = latest; else st.d1 = latest; update(); });
  $('#im-preset').addEventListener('change', e => applyPreset(e.target.value));
  map.on('moveend', links);

  function applyPreset(id) {
    const p = IMAGERY_PRESETS.find(x => x.id === id);
    if (!p) return;
    st.preset = p.id;
    st.layer = imageryById(p.layer);
    st.d1 = p.before; st.d2 = p.after; st.cmp = true; st.fires = !!p.fires; st.pos = 0.5; range.value = '0.5';
    map.setView(p.ll, p.z, { animate: false });
    ctx.setView(p.ll[0], p.ll[1], p.z);
    update();
  }

  update();
  if (ctx.state.preset) { $('#im-preset').value = ctx.state.preset; applyPreset(ctx.state.preset); ctx.set({ preset: null }); }

  return {
    show() { syncToView(map, ctx); clip(); links(); },
    apply(s) {
      if (s.preset) { $('#im-preset').value = s.preset; applyPreset(s.preset); ctx.set({ preset: null }); return; }
      readState(s); syncToView(map, ctx); update();
    },
  };
}
