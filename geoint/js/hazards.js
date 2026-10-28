// GEOINT & IMINT Dashboard · Fires & hazards: GIBS thermal anomalies (keyless), NASA FIRMS (your free MAP_KEY),
// USGS earthquakes and GDACS disaster alerts, on one map with lists underneath.
// URL keys: hd (fire day), hf (fire sensors: v, m, vm or none), hq (USGS feed or off), hg (current, recent or off), hl (list).
import { esc, fmtNum, fmtDay, fmtUTC, addDays, isISODate, clampDay, ago } from './util.js';
import {
  GIBS_WMS, FIRE_LAYERS, fireLayerNames, QUAKE_FEEDS, quakeFeedUrl, normalizeQuakes, GDACS_CURRENT, GDACS_RECENT, normalizeGdacs,
  isFirmsKey, firmsWmsBase, firmsWmsLayers, FIRMS_WINDOWS, firmsAreaUrl, parseFirmsCsv, FIRMS_KEY_PAGE, firmsMapUrl,
} from './sources.js';
import { createMap, syncToView, baseLayers, tok, popupOpts, flyTo } from './maps.js';

const KEY = 'prp.geoint.firmsKey';
const keyStore = {
  get() { try { const k = localStorage.getItem(KEY); return isFirmsKey(k) ? k : ''; } catch { return ''; } },
  set(k) { try { localStorage.setItem(KEY, k); return true; } catch { return false; } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* storage blocked */ } },
};
const rgb = hex => { const m = String(hex).trim().match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i); return m ? m.slice(1).map(h => parseInt(h, 16)).join('+') : '235+104+52'; };

export async function init(panel, ctx) {
  const $ = s => panel.querySelector(s);
  const latest = await ctx.latest(), newest = await ctx.newest();
  const s0 = ctx.state;
  const st = {
    day: isISODate(s0.hd) ? clampDay(s0.hd, '2012-01-20', newest) : latest,
    viirs: s0.hf === undefined ? true : s0.hf.includes('v'), modis: s0.hf === undefined ? false : s0.hf.includes('m'),
    quakes: s0.hq === 'off' || QUAKE_FEEDS.some(f => f.id === s0.hq) ? s0.hq : '4.5_week',
    gdacs: ['current', 'recent', 'off'].includes(s0.hg) ? s0.hg : 'current',
    list: ['quakes', 'gdacs', 'firms'].includes(s0.hl) ? s0.hl : 'quakes',
    key: keyStore.get(), firmsWin: '24', firmsOn: true,
  };
  let quakes = [], events = [], detections = null, firmsBlocked = false, loadedAt = 0;
  const pending = { q: false, g: false };

  /* ---------- controls ---------- */
  $('#hz-quakes').innerHTML = QUAKE_FEEDS.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('') + '<option value="off">Off</option>';

  /* ---------- map ---------- */
  const map = createMap($('#hz-map'), ctx, 'hazards', { minZoom: 2, maxZoom: 12 });
  baseLayers(map, { kind: 'map', labels: true });
  $('#hz-map').appendChild($('#hz-legend')); // over the map, above the attribution (not over the caption)
  map.createPane('fires').style.zIndex = 330;
  map.createPane('firms').style.zIndex = 340;
  const quakeLayer = L.layerGroup().addTo(map), gdacsLayer = L.layerGroup().addTo(map), firmsPts = L.layerGroup().addTo(map);
  let fireLayer = null, firmsLayer = null;

  function drawFires() {
    if (fireLayer) map.removeLayer(fireLayer);
    const ids = [...(st.viirs ? ['n20', 'n21', 'snpp'] : []), ...(st.modis ? ['modis'] : [])];
    fireLayer = ids.length ? L.tileLayer.wms(GIBS_WMS, { pane: 'fires', layers: fireLayerNames(ids), format: 'image/png', transparent: true, version: '1.3.0', TIME: st.day, tileSize: 512, attribution: 'Fires: NASA GIBS' }).addTo(map) : null;
  }
  function drawFirms() {
    if (firmsLayer) { map.removeLayer(firmsLayer); firmsLayer = null; }
    if (!st.key || !st.firmsOn) return;
    const c = rgb(tok('--prp-cat-2'));
    firmsLayer = L.tileLayer.wms(firmsWmsBase(st.key), {
      pane: 'firms', layers: firmsWmsLayers(st.firmsWin), format: 'image/png', transparent: true, version: '1.1.1', tileSize: 512,
      SYMBOLS: 'square,square', COLORS: `${c},${c}`, SIZE: '4,5', attribution: 'NASA FIRMS',
    }).addTo(map);
  }
  window.addEventListener('prp:themechange', () => { if (firmsLayer) firmsLayer.setParams({ COLORS: `${rgb(tok('--prp-cat-2'))},${rgb(tok('--prp-cat-2'))}` }); });

  function drawQuakes() {
    quakeLayer.clearLayers();
    for (const q of quakes) {
      const r = Math.max(3, 3 + ((q.mag ?? 2.5) - 2.5) * 2.4);
      L.circleMarker([q.lat, q.lon], { radius: r, className: `mk-quake${q.mag >= 6 ? ' big' : ''}`, bubblingMouseEvents: false })
        .bindTooltip(`<b>M${q.mag?.toFixed(1) ?? '?'}</b> · ${esc(q.place)}<br><span class="meta">${fmtUTC(q.time)} · depth ${fmtNum(q.depth, 0)} km</span>`, { direction: 'top', offset: [0, -r] })
        .bindPopup(`<h4>M${q.mag?.toFixed(1) ?? '?'} earthquake</h4><div class="meta">${fmtUTC(q.time)}</div><p>${esc(q.place)}. Depth ${fmtNum(q.depth, 0)} km.${q.tsunami ? ' Tsunami information issued.' : ''}${q.alert ? ` PAGER alert: ${esc(q.alert)}.` : ''}</p><a href="${esc(q.url)}" target="_blank" rel="noopener">USGS event page ↗</a>`, popupOpts)
        .addTo(quakeLayer);
    }
  }
  function drawGdacs() {
    gdacsLayer.clearLayers();
    for (const e of events) {
      const icon = L.divIcon({ className: `gd-icon ${e.level}`, html: `<i><b>${esc(e.type)}</b></i>`, iconSize: [24, 24] });
      L.marker([e.lat, e.lon], { icon, keyboard: false, riseOnHover: true, zIndexOffset: e.level === 'Red' ? 300 : e.level === 'Orange' ? 200 : 0 })
        .bindTooltip(`<b>${esc(e.level)} alert</b> · ${esc(e.typeName)}<br>${esc(e.name)}`, { direction: 'top', offset: [0, -10] })
        .bindPopup(`<h4>${esc(e.name)}</h4><div class="meta">${esc(e.level)} alert · ${esc(e.typeName)}${e.country ? ' · ' + esc(e.country) : ''}</div><p>${esc(e.severity)}${e.from ? `<br>${fmtUTC(e.from)}${e.to && e.to !== e.from ? ` to ${fmtUTC(e.to)}` : ''}` : ''}</p>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">GDACS report ↗</a>` : ''}`, popupOpts)
        .addTo(gdacsLayer);
    }
  }
  function drawFirmsPoints() {
    firmsPts.clearLayers();
    for (const d of (detections || []).slice(0, 3000)) {
      L.circleMarker([d.lat, d.lon], { radius: 3.5, className: 'mk-firms', bubblingMouseEvents: false })
        .bindTooltip(`${fmtUTC(d.time)} · ${esc(d.satellite || d.instrument)}<br>FRP ${fmtNum(d.frp, 1)} MW · confidence ${esc(d.confidence)}`, { direction: 'top' })
        .addTo(firmsPts);
    }
  }

  /* ---------- data ---------- */
  // Each feed draws as soon as it arrives (GDACS can take several seconds).
  async function load(force = false) {
    loadedAt = Date.now();
    const part = { q: st.quakes === 'off' ? 'off' : 'loading', g: st.gdacs === 'off' ? 'off' : 'loading' };
    const say = () => {
      const q = part.q === 'loading' ? 'earthquakes loading…' : part.q === 'ok' ? `${fmtNum(quakes.length)} earthquakes` : part.q === 'off' ? '' : part.q;
      const g = part.g === 'loading' ? 'GDACS loading…' : part.g === 'ok' ? `${fmtNum(events.length)} GDACS events` : part.g === 'off' ? '' : part.g;
      const done = part.q !== 'loading' && part.g !== 'loading';
      status([done ? `Updated ${fmtUTC(Date.now()).split(', ')[1]}` : '', q, g].filter(Boolean).join(' · '));
    };
    pending.q = st.quakes !== 'off'; pending.g = st.gdacs !== 'off';
    say(); renderList();
    const pq = (st.quakes === 'off' ? Promise.resolve([]) : ctx.get(quakeFeedUrl(st.quakes), { ttl: 60e3, force }).then(normalizeQuakes))
      .then(v => { quakes = v; if (part.q !== 'off') part.q = 'ok'; }, err => { quakes = []; part.q = `USGS unavailable (${err.message})`; })
      .then(() => { pending.q = false; drawQuakes(); renderList(); legend(); say(); });
    const pg = (st.gdacs === 'off' ? Promise.resolve([]) : ctx.get(st.gdacs === 'recent' ? GDACS_RECENT : GDACS_CURRENT, { ttl: 5 * 60e3, force }).then(normalizeGdacs))
      .then(v => { events = v; if (part.g !== 'off') part.g = 'ok'; }, err => { events = []; part.g = `GDACS unavailable (${err.message})`; })
      .then(() => { pending.g = false; drawGdacs(); renderList(); legend(); say(); });
    await Promise.all([pq, pg]);
  }
  const status = t => { $('#hz-status').textContent = t; };

  /* ---------- lists ---------- */
  function renderList() {
    $('#hz-n-quakes').textContent = pending.q ? '…' : fmtNum(quakes.length);
    $('#hz-n-gdacs').textContent = pending.g ? '…' : fmtNum(events.length);
    $('#hz-n-firms').textContent = detections ? fmtNum(detections.length) : '–';
    panel.querySelectorAll('#hz-seg [data-v]').forEach(b => { const on = b.dataset.v === st.list; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    const el = $('#hz-list'), note = $('#hz-list-note');
    if (st.list === 'quakes') {
      note.textContent = st.quakes === 'off' ? '' : `USGS · ${QUAKE_FEEDS.find(f => f.id === st.quakes)?.name || ''}`;
      el.innerHTML = !quakes.length ? `<p class="prp-empty">${st.quakes === 'off' ? 'Earthquakes are switched off.' : pending.q ? 'Loading earthquakes from USGS…' : 'No earthquakes in this feed.'}</p>` :
        `<table class="prp-table"><thead><tr><th scope="col">Time (UTC)</th><th scope="col" class="num">Mag.</th><th scope="col">Place</th><th scope="col" class="num">Depth km</th><th scope="col">Notes</th><th scope="col"><span class="sr">Link</span></th></tr></thead><tbody>${
          quakes.slice(0, 400).map((q, i) => `<tr class="clickable" tabindex="0" data-kind="q" data-i="${i}"><td class="nowrap"><time>${fmtUTC(q.time).replace(' UTC', '')}</time></td><td class="num"><span class="mag">${q.mag?.toFixed(1) ?? '–'}</span></td><td>${esc(q.place)}</td><td class="num">${fmtNum(q.depth, 0)}</td><td>${[q.tsunami ? 'Tsunami information' : '', q.alert ? `PAGER ${esc(q.alert)}` : ''].filter(Boolean).join(' · ')}</td><td><a href="${esc(q.url)}" target="_blank" rel="noopener">USGS ↗</a></td></tr>`).join('')}</tbody></table>`;
    } else if (st.list === 'gdacs') {
      note.textContent = st.gdacs === 'off' ? '' : st.gdacs === 'recent' ? 'GDACS · orange and red alerts, recent months' : 'GDACS · current events';
      el.innerHTML = !events.length ? `<p class="prp-empty">${st.gdacs === 'off' ? 'GDACS alerts are switched off.' : pending.g ? 'Loading events from GDACS (this can take 20 seconds)…' : 'No events.'}</p>` :
        `<table class="prp-table"><thead><tr><th scope="col">Alert</th><th scope="col">Type</th><th scope="col">Event</th><th scope="col">Country</th><th scope="col">Dates (UTC)</th><th scope="col">Severity</th><th scope="col"><span class="sr">Link</span></th></tr></thead><tbody>${
          events.map((e, i) => `<tr class="clickable" tabindex="0" data-kind="g" data-i="${i}"><td><span class="pill ${e.level}">${esc(e.level)}</span></td><td>${esc(e.typeName)}</td><td>${esc(e.name)}</td><td>${esc(e.country)}</td><td class="nowrap">${e.from ? fmtDay(new Date(e.from).toISOString().slice(0, 10)) : ''}${e.to && new Date(e.to).toISOString().slice(0, 10) !== new Date(e.from).toISOString().slice(0, 10) ? ' – ' + fmtDay(new Date(e.to).toISOString().slice(0, 10)) : ''}</td><td>${esc(e.severity)}</td><td>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">Report ↗</a>` : ''}</td></tr>`).join('')}</tbody></table>`;
    } else {
      note.textContent = 'NASA FIRMS · VIIRS, this view';
      if (!st.key) el.innerHTML = `<p class="prp-empty">Add a free FIRMS MAP_KEY (on the right) to list detections. Without one, the GIBS fire layer on the map shows each day's detections.</p>`;
      else if (!detections) el.innerHTML = `<p class="prp-empty">${firmsBlocked ? 'Your browser was not allowed to read FIRMS data from this page (FIRMS sends no CORS header). The FIRMS layer on the map still works; use “Open the CSV” on the right for the list.' : 'Use “List detections in this view” on the right.'}</p>`;
      else {
        const rows = [...detections].sort((a, b) => (b.frp || 0) - (a.frp || 0)).slice(0, 300);
        el.innerHTML = !rows.length ? '<p class="prp-empty">No detections in this view for the window.</p>' :
          `<table class="prp-table"><thead><tr><th scope="col">Time (UTC)</th><th scope="col">Satellite</th><th scope="col">Confidence</th><th scope="col" class="num">FRP (MW)</th><th scope="col">Day/night</th><th scope="col">Position</th></tr></thead><tbody>${
            rows.map((d, i) => `<tr class="clickable" tabindex="0" data-kind="f" data-lat="${d.lat}" data-lon="${d.lon}"><td class="nowrap">${fmtUTC(d.time).replace(' UTC', '')}</td><td>${esc(d.satellite || d.instrument)}</td><td>${esc(d.confidence)}</td><td class="num">${fmtNum(d.frp, 1)}</td><td>${d.daynight === 'D' ? 'Day' : d.daynight === 'N' ? 'Night' : ''}</td><td><code>${d.lat.toFixed(4)}, ${d.lon.toFixed(4)}</code></td></tr>`).join('')}</tbody></table>${detections.length > rows.length ? `<p class="prp-empty">Showing the ${rows.length} strongest of ${fmtNum(detections.length)} detections by fire radiative power.</p>` : ''}`;
      }
    }
  }
  function goRow(tr) {
    if (!tr) return;
    let lat, lon, z = 7;
    if (tr.dataset.kind === 'q') ({ lat, lon } = quakes[+tr.dataset.i]);
    else if (tr.dataset.kind === 'g') ({ lat, lon } = events[+tr.dataset.i]);
    else { lat = +tr.dataset.lat; lon = +tr.dataset.lon; z = 10; }
    flyTo(map, lat, lon, z, ctx);
    $('#hz-map').scrollIntoView({ block: 'nearest', behavior: ctx.reduceMotion() ? 'auto' : 'smooth' });
  }
  $('#hz-list').addEventListener('click', e => { if (!e.target.closest('a')) goRow(e.target.closest('tr.clickable')); });
  $('#hz-list').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const tr = e.target.closest('tr.clickable'); if (tr) { e.preventDefault(); goRow(tr); } } });
  const segs = [...panel.querySelectorAll('#hz-seg [data-v]')];
  segs.forEach((b, k) => {
    b.addEventListener('click', () => { st.list = b.dataset.v; ctx.set({ hl: st.list === 'quakes' ? null : st.list }); renderList(); });
    b.addEventListener('keydown', e => { const n = { ArrowRight: k + 1, ArrowLeft: k - 1 }[e.key]; if (n === undefined) return; e.preventDefault(); const t = segs[(n + segs.length) % segs.length]; t.focus(); t.click(); });
  });

  /* ---------- FIRMS key panel ---------- */
  function firmsPanel() {
    const state = $('#firms-state');
    state.textContent = st.key ? 'Key saved' : 'No key';
    state.className = `prp-status ${st.key ? 'good' : ''}`;
    const v = map.getCenter();
    const mapLink = `<a href="${esc(firmsMapUrl({ lat: v.lat, lon: v.lng, z: map.getZoom() }))}" target="_blank" rel="noopener">FIRMS Fire Map ↗</a>`;
    if (!st.key) {
      $('#firms-body').innerHTML = `<p>FIRMS adds detections from the last 24 hours to 7 days, refreshed every 15 minutes. It needs a free MAP_KEY: request one with your email address on the FIRMS site, then paste it here.</p>
        <form class="firms-form" id="firms-form"><label class="prp-label" for="firms-key">MAP_KEY</label>
        <div class="inline"><input class="prp-input" id="firms-key" type="password" autocomplete="off" spellcheck="false" inputmode="text" maxlength="40" placeholder="32 letters and digits"><button type="submit" class="prp-btn">Save key</button></div>
        <span class="muted" id="firms-msg" aria-live="polite"></span></form>
        <p class="keynote">The key stays in this browser's local storage and is sent only to firms.modaps.eosdis.nasa.gov. <a href="${FIRMS_KEY_PAGE}" target="_blank" rel="noopener">Get a free key ↗</a> · ${mapLink}</p>`;
      $('#firms-form').addEventListener('submit', e => {
        e.preventDefault();
        const k = $('#firms-key').value.trim();
        if (!isFirmsKey(k)) { $('#firms-msg').textContent = 'That does not look like a MAP_KEY (32 hexadecimal characters).'; return; }
        if (!keyStore.set(k)) { $('#firms-msg').textContent = 'This browser blocks local storage, so the key is kept for this visit only.'; }
        st.key = k; detections = null; firmsBlocked = false;
        drawFirms(); firmsPanel(); renderList(); legend();
      });
    } else {
      $('#firms-body').innerHTML = `<p class="inline"><span>Key <code>${esc(st.key.slice(0, 4))}…${esc(st.key.slice(-4))}</code> saved in this browser.</span><button type="button" class="prp-btn sm danger" id="firms-forget">Forget key</button></p>
        <div class="inline"><label class="field check"><input type="checkbox" id="firms-on"${st.firmsOn ? ' checked' : ''}> <span>Show FIRMS layer</span></label>
        <select class="prp-select" id="firms-win" aria-label="FIRMS time window">${FIRMS_WINDOWS.map(w => `<option value="${w.id}"${w.id === st.firmsWin ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>
        <p><button type="button" class="prp-btn sm" id="firms-list">List detections in this view</button> <span class="muted" id="firms-msg" aria-live="polite"></span></p>
        <p class="keynote">Orange squares: FIRMS VIIRS and MODIS detections for the window. Each map tile or list request counts against the key's 5,000 requests per 10 minutes. ${mapLink}</p>`;
      $('#firms-forget').addEventListener('click', () => { keyStore.clear(); st.key = ''; detections = null; firmsPts.clearLayers(); drawFirms(); firmsPanel(); renderList(); legend(); });
      $('#firms-on').addEventListener('change', e => { st.firmsOn = e.target.checked; drawFirms(); legend(); });
      $('#firms-win').addEventListener('change', e => { st.firmsWin = e.target.value; detections = null; firmsPts.clearLayers(); drawFirms(); renderList(); });
      $('#firms-list').addEventListener('click', listFirms);
    }
  }
  async function listFirms() {
    const msg = $('#firms-msg'), b = map.getBounds();
    const box = [Math.max(-180, b.getWest()), Math.max(-90, b.getSouth()), Math.min(180, b.getEast()), Math.min(90, b.getNorth())];
    const days = st.firmsWin === '7' ? 5 : st.firmsWin === '48' ? 2 : 1;
    const urls = ['VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'VIIRS_SNPP_NRT'].map(src => firmsAreaUrl(st.key, src, box, days));
    msg.textContent = 'Asking FIRMS…';
    try {
      const texts = await Promise.all(urls.map(u => fetch(u, { credentials: 'omit', referrerPolicy: 'no-referrer' }).then(async r => { const t = await r.text(); if (!r.ok || /^Invalid|exceeded/i.test(t.trim())) throw new Error(t.trim().slice(0, 120) || r.status); return t; })));
      detections = texts.flatMap(parseFirmsCsv);
      firmsBlocked = false;
      msg.textContent = `${fmtNum(detections.length)} detections${days === 5 && st.firmsWin === '7' ? ' (FIRMS lists at most 5 days at a time)' : ''}.`;
      drawFirmsPoints();
      st.list = 'firms'; renderList();
    } catch (err) {
      if (err instanceof TypeError) {
        firmsBlocked = true;
        msg.innerHTML = `Blocked by the browser: FIRMS does not let web pages read its data directly. <a href="${esc(urls[0])}" target="_blank" rel="noopener noreferrer">Open the CSV (NOAA-20) ↗</a>`;
      } else msg.textContent = `FIRMS said: ${err.message}`;
      st.list = 'firms'; renderList();
    }
  }

  function legend() {
    const rows = [];
    if (st.viirs || st.modis) rows.push(`<div class="row"><i class="sw fire"></i>Fire or thermal anomaly, ${esc(fmtDay(st.day))} (GIBS)</div>`);
    if (st.key && st.firmsOn) rows.push(`<div class="row"><i class="sw firms"></i>FIRMS detection, ${esc(FIRMS_WINDOWS.find(w => w.id === st.firmsWin).name.toLowerCase())}</div>`);
    if (st.quakes !== 'off') rows.push(`<div class="row"><i class="sw dot quake"></i>Earthquake, size by magnitude</div>`);
    if (st.gdacs !== 'off') rows.push(`<div class="row"><i class="sw dia red"></i><i class="sw dia orange"></i><i class="sw dia green"></i>GDACS alert: red, orange, green</div>`);
    $('#hz-legend').innerHTML = rows.join('');
    $('#hz-legend').hidden = !rows.length;
  }

  /* ---------- toolbar ---------- */
  function syncControls() {
    $('#hz-viirs').setAttribute('aria-pressed', String(st.viirs));
    $('#hz-modis').setAttribute('aria-pressed', String(st.modis));
    const d = $('#hz-d'); d.max = newest; d.min = '2012-01-20'; d.value = st.day;
    $('#hz-quakes').value = st.quakes; $('#hz-gdacs').value = st.gdacs;
    ctx.set({ hd: st.day === latest ? null : st.day, hf: st.viirs && !st.modis ? null : `${st.viirs ? 'v' : ''}${st.modis ? 'm' : ''}` || 'none', hq: st.quakes === '4.5_week' ? null : st.quakes, hg: st.gdacs === 'current' ? null : st.gdacs });
  }
  $('#hz-viirs').addEventListener('click', () => { st.viirs = !st.viirs; syncControls(); drawFires(); legend(); });
  $('#hz-modis').addEventListener('click', () => { st.modis = !st.modis; syncControls(); drawFires(); legend(); });
  $('#hz-d').addEventListener('change', e => { if (isISODate(e.target.value)) { st.day = clampDay(e.target.value, '2012-01-20', newest); syncControls(); drawFires(); legend(); } });
  panel.querySelectorAll('.datebox [data-for="hz-d"]').forEach(b => b.addEventListener('click', () => { st.day = clampDay(addDays(st.day, +b.dataset.step), '2012-01-20', newest); syncControls(); drawFires(); legend(); }));
  $('#hz-quakes').addEventListener('change', e => { st.quakes = e.target.value; syncControls(); load(); });
  $('#hz-gdacs').addEventListener('change', e => { st.gdacs = e.target.value; syncControls(); load(); });
  $('#hz-refresh').addEventListener('click', () => load(true));
  map.on('moveend', () => { if (!st.key) return; const a = $('#firms-body a[href*="/map/"]'); if (a) { const c = map.getCenter(); a.href = firmsMapUrl({ lat: c.lat, lon: c.lng, z: map.getZoom() }); } });

  syncControls(); drawFires(); drawFirms(); firmsPanel(); legend();
  load();
  setInterval(() => { if (ctx.tab === 'hazards' && !document.hidden && Date.now() - loadedAt > 5 * 60e3) load(); }, 60e3);

  return {
    show() { syncToView(map, ctx); if (Date.now() - loadedAt > 5 * 60e3) load(); },
  };
}
