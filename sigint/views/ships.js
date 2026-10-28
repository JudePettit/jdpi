// SIGINT Dashboard · Ships (AIS): the user's AIS-catcher web viewer JSON, or aisstream.io through the PRP bridge
// (aisstream.io does not permit direct browser connections, so the key stays on this computer and the bridge connects).
import { esc, fmt, store, explainError, mixedContentProblem, fetchWithTimeout } from '../lib/util.js';
import { distanceKm, bearingDeg, compass, bboxAround } from '../lib/geo.js';
import { normaliseShips, SHIP_GROUPS, NAV_STATUS } from '../lib/feeds.js';
import { fetchReceiverJSON } from '../lib/sources.js';
import { LINKS } from '../lib/catalog.js';
import { makeMap } from '../lib/maps.js';
import { kpis, legend, emptyRow, ticker, selectableRows } from './ui.js';

const KEY = 'prp.sigint.aisstreamKey';
const HULL = 'M0,-9 L4,-3 L4,8 L-4,8 L-4,-3 Z';
const tokenOf = g => SHIP_GROUPS.find(x => x.id === g)?.token || '--prp-faint';

export function create(ctx, panel) {
  const $ = s => panel.querySelector(s);
  const S = ctx.settings;
  const src = $('#sh-source'), url = $('#sh-url'), via = $('#sh-via-bridge'), key = $('#sh-key'), radius = $('#sh-radius'), connectBtn = $('#sh-connect');
  const tbody = $('#sh-table tbody');
  const tick = ticker($('#sh-status'));
  src.value = S.aisSource; url.value = S.aisUrl; via.checked = !!S.aisViaBridge; radius.value = String(S.aisRadiusKm);
  key.value = store.get(KEY, '') || '';
  let map = null, layer = null, markers = new Map(), timer = null, busy = false, last = null, selected = null, alive = false, running = !!S.aisAuto;

  const controls = () => {
    const st = src.value === 'aisstream';
    $('#sh-url-f').hidden = st; $('#sh-bridge-f').hidden = st; $('#sh-key-f').hidden = !st; $('#sh-radius-f').hidden = !st;
    connectBtn.textContent = running ? 'Disconnect' : 'Connect';
    connectBtn.classList.toggle('primary', !running);
  };
  controls();
  legend($('#sh-legend'), SHIP_GROUPS.map(g => ({ label: g.label, token: g.token, shape: 'dot' })), 'Vessel type');
  const links = () => {
    const { lat, lon } = ctx.loc;
    $('#sh-links').innerHTML = `Public ship maps: <a href="${LINKS.marineTraffic(lat, lon)}" target="_blank" rel="noopener">MarineTraffic ↗</a> <a href="${LINKS.vesselFinder()}" target="_blank" rel="noopener">VesselFinder ↗</a> <a href="${LINKS.myShipTracking()}" target="_blank" rel="noopener">MyShipTracking ↗</a>`;
  };
  links();
  const setupNote = () => {
    $('#sh-note').innerHTML = `<p><b>No public AIS feed can be read straight from a web page.</b> aisstream.io gives a free API key but forbids browser connections, and the big ship-tracking sites are commercial. Two ways to see ships here:</p>
      <p>1. <b>Your own receiver</b>: AIS-catcher with an RTL-SDR and a marine VHF antenna in sight of the sea or a busy river. Its web viewer serves <code>/api/ships.json</code> with CORS already on (start it with <code>AIS-catcher -N 8100</code>, or set the web viewer in its setup wizard).</p>
      <p>2. <b>aisstream.io through the PRP bridge</b>: sign up free at <a href="https://aisstream.io/" target="_blank" rel="noopener">aisstream.io</a>, paste the key above (kept in this browser and sent only to the bridge on this computer), and run the bridge.</p>
      <p>Or open the public maps listed here.</p>`;
  };
  setupNote();

  src.addEventListener('change', () => { ctx.save({ aisSource: src.value }); controls(); if (running) restart(true); });
  url.addEventListener('change', () => { ctx.save({ aisUrl: url.value.trim() }); if (running) restart(true); });
  via.addEventListener('change', () => { ctx.save({ aisViaBridge: via.checked }); if (running) restart(true); });
  radius.addEventListener('change', () => { ctx.save({ aisRadiusKm: +radius.value }); fitRings(); if (running) restart(true); });
  key.addEventListener('change', () => { const v = key.value.trim(); if (v) store.set(KEY, v); else store.del(KEY); });
  $('#sh-key-forget').addEventListener('click', () => { key.value = ''; store.del(KEY); tick.msg('Key forgotten in this browser.'); });
  connectBtn.addEventListener('click', () => {
    running = !running; ctx.save({ aisAuto: running }); controls();
    if (running) restart(true); else { clearTimeout(timer); tick.msg('Disconnected.'); }
  });
  selectableRows(tbody, mmsi => select(mmsi, true));
  ctx.on('loc', () => { links(); if (map) { map.setHome(ctx.loc.lat, ctx.loc.lon); fitRings(); } if (running) restart(true); });

  async function ensureMap() {
    if (map) return;
    try {
      map = await makeMap($('#sh-map'), { lat: ctx.loc.lat, lon: ctx.loc.lon, radiusKm: +radius.value, label: 'Map of ships near your location' });
      layer = map.layer();
      fitRings();
    } catch (e) { $('#sh-map').innerHTML = `<p class="prp-empty">${esc(e.message)}</p>`; }
  }
  function fitRings() {
    if (!map) return;
    const km = +radius.value;
    map.setRings(ctx.loc.lat, ctx.loc.lon, [km / 2, km], r => `${Math.round(r)} km`);
    map.fitRadius(ctx.loc.lat, ctx.loc.lon, km);
  }
  function restart(clear) {
    clearTimeout(timer);
    if (clear) { last = null; markers.forEach(m => layer?.removeLayer(m.marker)); markers.clear(); emptyRow(tbody, 7, 'Connecting…'); }
    if (running && alive) poll();
  }
  async function poll() {
    if (busy || !running || !ctx.visible('ships')) return;
    busy = true;
    const mode = src.value, statusId = mode === 'aisstream' ? 'aisstream' : 'rx-ais';
    try {
      let json, viaText;
      if (mode === 'aisstream') {
        if (!ctx.bridge.on) throw Object.assign(new Error('aisstream.io needs the PRP bridge: turn it on under Overview → Connect your own receivers.'), { setup: true });
        const k = key.value.trim();
        const b = bboxAround(ctx.loc.lat, ctx.loc.lon, +radius.value);
        const r = await fetchWithTimeout(`${ctx.bridge.url}/aisstream/ships.json?bbox=${[b.south, b.west, b.north, b.east].map(v => v.toFixed(3)).join(',')}`, { timeout: 10000, cache: 'no-store', headers: k ? { 'X-AISStream-Key': k } : {} });
        if (!r.ok) { const j = await r.json().catch(() => null); throw Object.assign(new Error(j?.error || `HTTP ${r.status}`), { setup: r.status === 400 || r.status === 401 }); }
        json = await r.json();
        if (json.error && !json.ships?.length) throw Object.assign(new Error(json.error), { setup: true });
        viaText = `aisstream.io via the bridge${json.connected ? '' : ' (connecting)'}`;
      } else {
        const u = url.value.trim();
        const problem = S.aisViaBridge ? '' : mixedContentProblem(u, location.protocol);
        if (problem) throw Object.assign(new Error(problem), { setup: true });
        if (S.aisViaBridge && !ctx.bridge.on) throw Object.assign(new Error('Turn on the PRP bridge in the Overview first.'), { setup: true });
        json = await fetchReceiverJSON(ctx, { url: u, viaBridge: S.aisViaBridge, route: 'ais' });
        viaText = S.aisViaBridge ? 'your AIS-catcher via the bridge' : 'your AIS-catcher';
      }
      last = { data: normaliseShips(json), via: viaText, mode };
      render(last);
      ctx.setStatus(statusId, 'ok', `${last.data.ships.length} vessels from ${viaText}.`);
      tick.set(`${fmt(last.data.ships.length)} vessels · ${viaText}`, Date.now() + 10000);
    } catch (e) {
      const why = e.setup ? e.message : explainError(e);
      ctx.setStatus(statusId, e.setup ? 'warn' : 'bad', why);
      tick.msg(`Not updated: ${why}`);
      if (!last) emptyRow(tbody, 7, esc(why));
    } finally {
      busy = false; clearTimeout(timer);
      if (running && alive) timer = setTimeout(poll, 10000);
    }
  }

  function render({ data, via, mode }) {
    const { lat, lon } = ctx.loc;
    let list = data.ships.map(s => {
      const has = s.lat != null, d = has ? distanceKm(lat, lon, s.lat, s.lon) : null;
      return { ...s, dKm: d, brg: has ? bearingDeg(lat, lon, s.lat, s.lon) : null };
    });
    if (mode === 'aisstream') list = list.filter(s => s.dKm == null || s.dKm <= +radius.value * 1.05);
    list.sort((a, b) => (a.dKm ?? 1e9) - (b.dKm ?? 1e9));
    const moving = list.filter(s => (s.sogKt ?? 0) >= 0.5);
    const byGroup = Object.fromEntries(SHIP_GROUPS.map(g => [g.id, list.filter(s => s.group === g.id).length]));
    kpis($('#sh-kpis'), [
      { label: 'Vessels', value: fmt(list.length), sub: `${fmt(list.filter(s => s.lat != null).length)} with a position` },
      { label: 'Under way', value: fmt(moving.length), sub: `${fmt(list.length - moving.length)} stationary or unknown` },
      { label: 'Cargo and tankers', value: fmt(byGroup.cargo), sub: `${fmt(byGroup.passenger)} passenger · ${fmt(byGroup.fishing)} fishing` },
      { label: 'Nearest', value: list[0]?.dKm != null ? `${fmt(list[0].dKm, 1)} km` : '–', sub: list[0] ? `${list[0].name || list[0].mmsi} · ${compass(list[0].brg)}` : '' },
      { label: 'Source', value: mode === 'aisstream' ? 'aisstream.io' : 'AIS-catcher', sub: via, small: true },
    ]);
    $('#sh-count').textContent = `${fmt(list.length)} shown`;
    $('#sh-note').innerHTML = `<p>AIS is broadcast by ships for collision avoidance and is meant to be received by anyone. Small craft often don’t carry it, and positions can be stale or wrong. Use it for awareness, not navigation.</p>`;
    const rows = list.slice(0, 300).map(s => `<tr data-row="${s.mmsi}" tabindex="0" class="${String(s.mmsi) === String(selected) ? 'sel' : ''}">
      <td><span class="sat-name">${esc(s.name || 'Unnamed')}</span>${s.callsign ? ` <span class="muted">${esc(s.callsign)}</span>` : ''}</td>
      <td>${esc(s.typeLabel)}</td><td class="num">${s.sogKt != null ? fmt(s.sogKt, 1) : '–'}</td><td class="num">${s.cog != null ? fmt(s.cog) + '°' : '–'}</td>
      <td class="num">${s.dKm != null ? fmt(s.dKm, 1) : '–'}</td><td>${esc([s.status != null ? NAV_STATUS[s.status] : null, s.destination].filter(Boolean).join(' · ') || '–')}</td><td class="mono">${s.mmsi}</td></tr>`);
    if (rows.length) tbody.innerHTML = rows.join(''); else emptyRow(tbody, 7, mode === 'aisstream' ? 'Connected; waiting for ships to report in this area (AIS reports arrive every few seconds to minutes).' : 'Your receiver reports no vessels right now.');
    if (!layer) return;
    const seen = new Set();
    for (const s of list.filter(x => x.lat != null)) {
      const id = String(s.mmsi); seen.add(id);
      const dir = s.heading ?? s.cog, still = (s.sogKt ?? 0) < 0.5 || dir == null;
      const k = `${s.group}|${still ? 'x' : Math.round(dir / 5)}|${id === String(selected)}`;
      const tip = `<b>${esc(s.name || 'Unnamed')}</b> · ${esc(s.typeLabel)}<br>${s.sogKt != null ? `${fmt(s.sogKt, 1)} kn` : 'speed –'}${s.cog != null ? ` · ${fmt(s.cog)}°` : ''} · ${fmt(s.dKm, 1)} km ${compass(s.brg)}${s.destination ? `<br>To ${esc(s.destination)}` : ''}`;
      let m = markers.get(id);
      const ic = () => map.L.divIcon({ className: `sg-mark${id === String(selected) ? ' sel' : ''}`, html: `<svg width="22" height="22" viewBox="-11 -11 22 22" style="--c:var(${tokenOf(s.group)})" aria-hidden="true">${still ? '<circle class="body" r="4.5"/>' : `<path class="body" transform="rotate(${Math.round(dir)})" d="${HULL}"/>`}</svg>`, iconSize: [22, 22], iconAnchor: [11, 11] });
      if (!m) {
        const marker = map.L.marker([s.lat, s.lon], { icon: ic(), keyboard: false, riseOnHover: true }).addTo(layer);
        marker.bindTooltip(tip, { direction: 'top', offset: [0, -9] });
        marker.on('click', () => select(id, false));
        markers.set(id, { marker, k });
      } else {
        m.marker.setLatLng([s.lat, s.lon]); m.marker.setTooltipContent(tip);
        if (m.k !== k) { m.marker.setIcon(ic()); m.k = k; }
      }
    }
    for (const [id, m] of markers) if (!seen.has(id)) { layer.removeLayer(m.marker); markers.delete(id); }
  }
  function select(id, pan) {
    selected = String(selected) === String(id) ? null : id;
    if (last) render(last);
    const m = markers.get(String(id));
    if (m && pan && selected) { map.map.panTo(m.marker.getLatLng()); m.marker.openTooltip(); }
  }

  return {
    async show() {
      alive = true; await ensureMap(); map?.map.invalidateSize();
      if (running) { restart(false); return; }
      tick.msg('Not connected.');
      if (!last) {
        emptyRow(tbody, 7, 'Not connected. Choose a source above and press Connect.');
        kpis($('#sh-kpis'), [{ label: 'Vessels', value: '–', sub: 'not connected' }, { label: 'Under way', value: '–' }, { label: 'Cargo and tankers', value: '–' }, { label: 'Nearest', value: '–' },
          { label: 'Source', value: src.value === 'aisstream' ? 'aisstream.io' : 'AIS-catcher', sub: 'press Connect', small: true }]);
      }
    },
    hide() { alive = false; clearTimeout(timer); },
    pause() { clearTimeout(timer); },
    resume() { if (alive && running) restart(false); },
  };
}
