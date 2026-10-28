// GEOINT & IMINT Dashboard · Features: OpenStreetMap infrastructure through the Overpass API, with Nominatim place search.
// Courtesy rules built in: one Overpass query at a time with a pause between them (30 s after a 429/406, as the operators ask),
// a 25 s server timeout, a size cap and a result limit; Nominatim only when you press Search, at most once a second, cached.
// Two public Overpass servers: the user picks one (remembered in this browser); when it does not answer, the page offers
// the other, because each server's operator sees the area and features asked for.
// URL keys: fp (preset), fa=point, fr (radius m), fn (near preset), fnr (near distance m).
import { esc, fmtNum, fmtArea, fmtUTC } from './util.js';
import {
  OSM_PRESETS, OSM_EXAMPLES, presetById, buildOverpassQuery, normalizeOverpass, toGeoJSON, OVERPASS_SERVERS, overpassServer, OVERPASS_LIMIT,
  overpassTurboUrl, osmElementUrl, nominatimSearchUrl, NOMINATIM_POLICY,
} from './sources.js';
import { polygonArea } from './geo.js';
import { createMap, syncToView, baseLayers, popupOpts, flyTo, fitTo } from './maps.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SERVER_KEY = 'prp.geoint.overpass';
const serverStore = {
  get() { try { return localStorage.getItem(SERVER_KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(SERVER_KEY, v); } catch { /* storage blocked: kept for this visit */ } },
};

export async function init(panel, ctx) {
  const $ = s => panel.querySelector(s);
  const s0 = ctx.state;
  const st = {
    preset: presetById(s0.fp) || presetById('airfields'),
    area: s0.fa === 'point' ? 'point' : 'view',
    radius: [1000, 2000, 5000, 10000, 25000].includes(+s0.fr) ? +s0.fr : 5000,
    nearOn: !!presetById(s0.fn), near: presetById(s0.fn) || presetById('stations'), nearR: [100, 200, 500, 1000].includes(+s0.fnr) ? +s0.fnr : 200,
    point: null, results: [], busy: false, cooldown: {}, lastQuery: 0, meta: null,
    server: overpassServer(serverStore.get()), ctl: null, running: null,
  };

  /* ---------- controls ---------- */
  const groups = [...new Set(OSM_PRESETS.map(p => p.group))];
  const options = groups.map(g => `<optgroup label="${esc(g)}">${OSM_PRESETS.filter(p => p.group === g).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('');
  $('#ft-preset').innerHTML = options;
  $('#ft-near').innerHTML = options;
  $('#ft-server').innerHTML = OVERPASS_SERVERS.map(s => `<option value="${s.id}">${esc(s.name)}, ${esc(s.operator.split(' in ').pop())}</option>`).join('');
  $('#ft-server').value = st.server.id;
  $('#ft-server').addEventListener('change', e => { st.server = overpassServer(e.target.value); serverStore.set(st.server.id); preview(); });
  const other = () => OVERPASS_SERVERS.find(s => s.id !== st.server.id);

  /* ---------- map ---------- */
  const map = createMap($('#ft-map'), ctx, 'features', { minZoom: 2, maxZoom: 19 });
  baseLayers(map, { kind: 'map', labels: true });
  const results = L.layerGroup().addTo(map), areaLayer = L.layerGroup().addTo(map);

  function drawArea() {
    areaLayer.clearLayers();
    if (st.area !== 'point' || !st.point) return;
    L.circle(st.point, { radius: st.radius, className: 'mk-area-search', interactive: false }).addTo(areaLayer);
    L.circleMarker(st.point, { radius: 6, className: 'mk-point', interactive: false }).addTo(areaLayer);
  }
  map.on('click', e => {
    if (st.area !== 'point') return;
    st.point = [e.latlng.lat, wrapLon(e.latlng.lng)];
    drawArea(); preview();
  });
  const wrapLon = l => ((l + 540) % 360) - 180;

  /* ---------- query building ---------- */
  function area() {
    if (st.area === 'point') return st.point ? { around: { lat: st.point[0], lon: st.point[1], r: st.radius } } : null;
    const b = map.getBounds();
    const w = Math.max(-180, b.getWest()), e = Math.min(180, b.getEast()), s = Math.max(-85, b.getSouth()), n = Math.min(85, b.getNorth());
    return { bbox: [s, w, n, e], km2: polygonArea([[s, w], [s, e], [n, e], [n, w]]) / 1e6 };
  }
  function query() {
    const a = area();
    if (!a) return { error: 'Click the map to choose the centre of the search.' };
    const limit = Math.min(st.preset.maxKm2, st.nearOn ? Math.max(st.near.maxKm2, st.preset.maxKm2) : Infinity);
    if (a.bbox && a.km2 > limit) return { error: `This view covers ${fmtArea(a.km2 * 1e6)}. For ${st.preset.name.toLowerCase()}, zoom in to under ${fmtArea(limit * 1e6)}, or search around a point.`, a };
    try { return { ql: buildOverpassQuery(st.preset, a, { near: st.nearOn ? { preset: st.near, r: st.nearR } : null }), a }; }
    catch (err) { return { error: err.message }; }
  }
  function preview() {
    const q = query();
    const near = st.nearOn ? { preset: st.near, r: st.nearR } : null;
    const turbo = q.ql || buildOverpassQuery(st.preset, { turbo: true }, { near });
    $('#ft-error').hidden = !q.error;
    $('#ft-error').textContent = q.error || '';
    $('#ft-ql').textContent = turbo;
    $('#ft-ql-label').textContent = q.ql ? 'Overpass QL' : 'Overpass QL for Overpass Turbo';
    const c = map.getCenter();
    $('#ft-turbo').href = overpassTurboUrl(turbo, { lat: c.lat, lon: c.lng, z: map.getZoom() }, { run: !!q.ql });
    const s = st.server;
    $('#ft-note').innerHTML = `${q.ql ? '' : '<code>{{bbox}}</code> stands for the map view in Overpass Turbo. '}Queries run on <b>${esc(s.name)}</b>, run by ${esc(s.operator)} (${esc(s.policy)}), with a 25-second limit and at most ${fmtNum(OVERPASS_LIMIT)} results. The server sees the area and the features you ask for. OpenStreetMap shows what volunteers have mapped and how they tagged it: an empty result does not mean nothing is there.`;
    if (!st.busy) setStatus(q.error ? '' : 'Ready');
    return q;
  }
  const setStatus = t => { $('#ft-status').textContent = t; };
  const offer = (alt, why) => alt ? `<button type="button" class="prp-btn sm" data-server="${alt.id}">${esc(why)} ${esc(alt.name)}</button><span class="muted">${esc(alt.name)} is run by ${esc(alt.operator)}.</span>` : '';

  /* ---------- running a query (one at a time, politely) ---------- */
  function run() {
    if (st.busy) return st.running;
    st.running = runQuery().finally(() => { st.running = null; });
    return st.running;
  }
  async function runQuery() {
    const server = st.server;
    const wait = Math.max(st.cooldown[server.id] || 0, st.lastQuery + 4000) - Date.now();
    if (wait > 0) { setStatus(`Please wait ${Math.ceil(wait / 1000)} s before the next query`); return; }
    const q = preview();
    if (!q.ql) { $('#ft-table').innerHTML = `<p class="prp-empty">${esc(q.error)}</p>`; return; }
    st.busy = true; st.lastQuery = Date.now();
    $('#ft-run').disabled = true;
    setStatus(`Querying ${server.name}…`);
    const t0 = performance.now();
    const ctl = new AbortController();
    st.ctl = ctl;
    const timer = setTimeout(() => ctl.abort('timeout'), 45000);
    const slow = setTimeout(() => {
      $('#ft-table').innerHTML = `<div class="prp-note"><p>Still waiting for ${esc(server.name)}. Big areas take longer, and public servers are sometimes busy or down.</p>
        <p class="inline"><button type="button" class="prp-btn sm" data-cancel>Cancel</button>${offer(other(), 'Stop and use')}</p></div>`;
    }, 12000);
    try {
      const res = await fetch(server.url, { method: 'POST', body: new URLSearchParams({ data: q.ql }), signal: ctl.signal, credentials: 'omit' });
      if (res.status === 429 || res.status === 406) { st.cooldown[server.id] = Date.now() + 30000; throw Object.assign(new Error(`${server.name} asked us to slow down (${res.status}). Try again in 30 seconds.`), { busy: true }); }
      if (res.status === 504) { st.cooldown[server.id] = Date.now() + 15000; throw Object.assign(new Error(`${server.name} ran out of time (504). Zoom in, use a smaller radius or choose fewer features, or try again later.`), { down: true }); }
      if (!res.ok) throw Object.assign(new Error(`${server.name} answered with error ${res.status}: ${(await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)}`), { down: res.status >= 500 });
      const json = await res.json();
      st.results = normalizeOverpass(json);
      st.meta = { osm: json.osm3s?.timestamp_osm_base || '', remark: json.remark || '', secs: (performance.now() - t0) / 1000, server: server.name };
      draw();
      setStatus(`${fmtNum(st.results.length)} found in ${st.meta.secs.toFixed(1)} s on ${server.name}${st.meta.remark ? ' (incomplete: see note)' : ''}`);
    } catch (err) {
      const reason = ctl.signal.aborted ? ctl.signal.reason : null;
      if (reason === 'switch') return;
      if (reason === 'cancel') { setStatus('Cancelled'); $('#ft-table').innerHTML = '<p class="prp-empty">Query cancelled.</p>'; return; }
      const down = reason === 'timeout' || err instanceof TypeError || err?.down;
      const msg = reason === 'timeout' ? `${server.name} did not answer within 45 seconds. It may be busy or down; try a smaller area, or later.`
        : err instanceof TypeError ? `Could not reach ${server.name}. Check your connection; the server may be down.` : err?.message || String(err);
      setStatus('Query failed');
      $('#ft-table').innerHTML = `<div class="prp-note warn"><p>${esc(msg)}</p>${down && other() ? `<p class="inline">${offer(other(), 'Run it on')}</p>` : ''}<p class="muted">Or open the same query in <a href="${esc($('#ft-turbo').href)}" target="_blank" rel="noopener">Overpass Turbo ↗</a>, which uses its own server.</p></div>`;
    } finally {
      clearTimeout(timer); clearTimeout(slow);
      st.busy = false; st.ctl = null;
      setTimeout(() => { $('#ft-run').disabled = false; }, 1500);
    }
  }
  // Cancel, or move the query to the other server (only when the user asks: each operator sees the query).
  $('#ft-table').addEventListener('click', async e => {
    if (e.target.closest('[data-cancel]')) { st.ctl?.abort('cancel'); return; }
    const ex = OSM_EXAMPLES.find(x => x.id === e.target.closest('[data-example]')?.dataset.example);
    if (ex) {
      st.preset = presetById(ex.preset); st.area = 'view'; st.nearOn = false;
      map.setView(ex.ll, ex.z, { animate: false });
      ctx.setView(ex.ll[0], ex.ll[1], ex.z);
      syncControls();
      run();
      return;
    }
    const b = e.target.closest('[data-server]');
    if (!b) return;
    b.disabled = true;
    if (st.ctl) { st.ctl.abort('switch'); await st.running; }
    st.server = overpassServer(b.dataset.server); serverStore.set(st.server.id);
    $('#ft-server').value = st.server.id;
    st.lastQuery = 0;
    run();
  });

  function draw() {
    results.clearLayers();
    const rows = [...st.results].sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || a.name.localeCompare(b.name));
    for (const f of rows) {
      const tags = Object.entries(f.tags).slice(0, 40).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
      L.circleMarker([f.lat, f.lon], { radius: 6, className: 'mk-feature', bubblingMouseEvents: false })
        .bindTooltip(`<b>${esc(f.name || 'Unnamed')}</b><br><span class="meta">${esc(f.kind)}</span>`, { direction: 'top', offset: [0, -6] })
        .bindPopup(`<h4>${esc(f.name || 'Unnamed')}</h4><div class="meta">${esc(f.type)} ${f.id} · ${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}</div><dl>${tags}</dl><p><a href="${esc(osmElementUrl(f.type, f.id))}" target="_blank" rel="noopener">Open in OpenStreetMap ↗</a></p>`, popupOpts)
        .addTo(results);
    }
    $('#ft-count').textContent = `${fmtNum(rows.length)} ${rows.length === 1 ? 'feature' : 'features'}: ${st.preset.name}${st.nearOn ? `, within ${fmtNum(st.nearR)} m of ${st.near.name.toLowerCase()}` : ''}`;
    $('#ft-osmdate').textContent = st.meta?.osm ? `OSM data as of ${fmtUTC(Date.parse(st.meta.osm))} · via ${st.meta.server}` : '';
    $('#ft-download').disabled = !rows.length;
    const remark = st.meta?.remark ? `<p class="prp-note warn">The server stopped early: ${esc(st.meta.remark.slice(0, 200))}. Results may be incomplete; use a smaller area.</p>` : '';
    const capped = rows.length >= OVERPASS_LIMIT ? `<p class="prp-note warn">Only the first ${fmtNum(OVERPASS_LIMIT)} results are shown. Zoom in for the rest.</p>` : '';
    $('#ft-table').innerHTML = remark + capped + (!rows.length ? '<p class="prp-empty">Nothing mapped here for this preset. Try a larger area or another preset.</p>' :
      `<table class="prp-table"><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Operator</th><th scope="col">Position</th><th scope="col">OSM</th></tr></thead><tbody>${
        rows.map((f, i) => `<tr class="clickable" tabindex="0" data-i="${i}"><td>${esc(f.name || '–')}${f.nameEn && f.nameEn !== f.name ? `<br><span class="muted">${esc(f.nameEn)}</span>` : ''}</td><td><code>${esc(f.kind)}</code></td><td>${esc(f.operator)}</td><td class="nowrap"><code>${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}</code></td><td><a href="${esc(osmElementUrl(f.type, f.id))}" target="_blank" rel="noopener">${esc(f.type)} ↗</a></td></tr>`).join('')}</tbody></table>`);
    st.sorted = rows;
    if (rows.length && st.area === 'point') fitTo(map, rows.map(f => [f.lat, f.lon]).concat(st.point ? [st.point] : []), ctx, 16);
  }
  function goRow(tr) {
    const f = st.sorted?.[+tr?.dataset.i];
    if (!f) return;
    flyTo(map, f.lat, f.lon, Math.max(map.getZoom(), 15), ctx);
    results.eachLayer(l => { const p = l.getLatLng(); if (p.lat === f.lat && p.lng === f.lon) setTimeout(() => l.openPopup(), ctx.reduceMotion() ? 0 : 900); });
    $('#ft-map').scrollIntoView({ block: 'nearest', behavior: ctx.reduceMotion() ? 'auto' : 'smooth' });
  }
  $('#ft-table').addEventListener('click', e => { if (!e.target.closest('a')) { const tr = e.target.closest('tr.clickable'); if (tr) goRow(tr); } });
  $('#ft-table').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const tr = e.target.closest('tr.clickable'); if (tr) { e.preventDefault(); goRow(tr); } } });
  $('#ft-download').addEventListener('click', () => {
    const gj = toGeoJSON(st.results, { name: st.preset.name, generated: new Date().toISOString(), source: '© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)', osm_base: st.meta?.osm || '' });
    const url = URL.createObjectURL(new Blob([JSON.stringify(gj, null, 1)], { type: 'application/geo+json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `osm-${st.preset.id}-${new Date().toISOString().slice(0, 10)}.geojson` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  /* ---------- Nominatim place search (pressed Search only; ≤ 1 request per second; cached) ---------- */
  const geoCache = new Map();
  let lastGeo = 0, geoBusy = false;
  $('#ft-geo').addEventListener('submit', async e => {
    e.preventDefault();
    const q = $('#ft-q').value.trim();
    if (q.length < 2 || geoBusy) return;
    const key = q.toLowerCase();
    const panelEl = $('#ft-geo-panel');
    panelEl.hidden = false;
    let list = geoCache.get(key);
    if (!list) {
      geoBusy = true;
      $('#ft-geo-status').textContent = 'Searching…';
      const wait = lastGeo + 1100 - Date.now();
      if (wait > 0) await sleep(wait);
      lastGeo = Date.now();
      try {
        const res = await fetch(nominatimSearchUrl(q, { lang: (navigator.language || 'en').slice(0, 2) }), { credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin' });
        if (!res.ok) throw new Error(`Nominatim error ${res.status}`);
        list = (await res.json()).map(r => ({ name: r.display_name, type: [r.category || r.class, r.type].filter(Boolean).join(' · '), lat: +r.lat, lon: +r.lon, bbox: r.boundingbox?.map(Number) }));
        geoCache.set(key, list);
      } catch (err) {
        $('#ft-geo-status').textContent = '';
        $('#ft-geo-results').innerHTML = `<li class="attr">${esc(err instanceof TypeError ? 'Could not reach the search service.' : err.message)}</li>`;
        return;
      } finally { geoBusy = false; }
    }
    $('#ft-geo-status').textContent = `${list.length} ${list.length === 1 ? 'match' : 'matches'}`;
    $('#ft-geo-results').innerHTML = (list.length ? list.map((r, i) => `<li><button type="button" data-i="${i}"><span class="t">${esc(r.name.split(',').slice(0, 2).join(','))}</span><span class="u">${esc(r.name.split(',').slice(2).join(',').trim())}${r.type ? ` · ${esc(r.type)}` : ''}</span></button></li>`).join('') : '<li class="attr">No match. Try another spelling or a nearby town.</li>') +
      `<li class="attr">Search by Nominatim · © OpenStreetMap contributors · <a href="${NOMINATIM_POLICY}" target="_blank" rel="noopener">usage policy</a></li>`;
    $('#ft-geo-results').dataset.key = key;
  });
  $('#ft-geo-results').addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const r = geoCache.get($('#ft-geo-results').dataset.key)?.[+b.dataset.i];
    if (!r) return;
    if (r.bbox && r.bbox.length === 4) map.fitBounds([[r.bbox[0], r.bbox[2]], [r.bbox[1], r.bbox[3]]], { maxZoom: 15, animate: !ctx.reduceMotion() });
    else flyTo(map, r.lat, r.lon, 14, ctx);
    if (st.area === 'point') { st.point = [r.lat, r.lon]; drawArea(); }
    setTimeout(preview, 400);
  });

  /* ---------- toolbar ---------- */
  function syncControls() {
    $('#ft-preset').value = st.preset.id;
    $('#ft-near').value = st.near.id;
    $('#ft-near-on').checked = st.nearOn;
    $('#ft-near').disabled = !st.nearOn; $('#ft-near-r').disabled = !st.nearOn;
    $('#ft-near-r').value = String(st.nearR);
    $('#ft-radius').value = String(st.radius);
    panel.querySelectorAll('#ft-area [data-v]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === st.area)));
    $('#ft-radius-f').hidden = st.area !== 'point';
    $('#ft-map').classList.toggle('pick', st.area === 'point');
    ctx.set({ fp: st.preset.id === 'airfields' ? null : st.preset.id, fa: st.area === 'point' ? 'point' : null, fr: st.area === 'point' && st.radius !== 5000 ? st.radius : null, fn: st.nearOn ? st.near.id : null, fnr: st.nearOn && st.nearR !== 200 ? st.nearR : null });
    drawArea(); preview();
  }
  $('#ft-preset').addEventListener('change', e => { st.preset = presetById(e.target.value); syncControls(); });
  $('#ft-near').addEventListener('change', e => { st.near = presetById(e.target.value); syncControls(); });
  $('#ft-near-on').addEventListener('change', e => { st.nearOn = e.target.checked; syncControls(); });
  $('#ft-near-r').addEventListener('change', e => { st.nearR = +e.target.value; syncControls(); });
  $('#ft-radius').addEventListener('change', e => { st.radius = +e.target.value; syncControls(); });
  panel.querySelectorAll('#ft-area [data-v]').forEach(b => b.addEventListener('click', () => {
    st.area = b.dataset.v;
    if (st.area === 'point' && !st.point) { const c = map.getCenter(); st.point = [c.lat, wrapLon(c.lng)]; }
    syncControls();
    $('#ft-status').textContent = st.area === 'point' ? 'Click the map to move the centre' : '';
  }));
  $('#ft-run').addEventListener('click', run);
  panel.querySelector('.code [data-copy]').addEventListener('click', e => {
    const btn = e.currentTarget;
    navigator.clipboard?.writeText($('#ft-ql').textContent).then(() => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); }, () => { btn.textContent = 'Select and copy'; });
  });
  map.on('moveend', () => { if (!st.busy) preview(); });

  syncControls();
  $('#ft-table').innerHTML = `<div class="prp-empty ft-intro"><p>Choose features and an area, then run the query. Or start from an example:</p>
    <p class="inline">${OSM_EXAMPLES.map(x => `<button type="button" class="prp-btn sm" data-example="${x.id}">${esc(x.name)}</button>`).join('')}</p></div>`;
  return { show() { syncToView(map, ctx); preview(); } };
}
