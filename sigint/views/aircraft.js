// SIGINT Dashboard · Aircraft (ADS-B): public adsb.lol (via the Vitruvian Manager proxy or bridge), OpenSky (via the bridge), or the
// user's own readsb/dump1090/tar1090 aircraft.json. Polls every 15 s (public) or 5 s (own receiver) while visible.
import { esc, fmt, explainError, mixedContentProblem, fetchWithTimeout } from '../lib/util.js';
import { distanceKm, bearingDeg, compass, kmToNm, nmToKm, bboxAround } from '../lib/geo.js';
import { normaliseAircraft, altitudeBand, ALT_BANDS } from '../lib/feeds.js';
import { fetchAdsbPublic, fetchReceiverJSON } from '../lib/sources.js';
import { LINKS } from '../lib/catalog.js';
import { makeMap } from '../lib/maps.js';
import { kpis, legend, emptyRow, ticker, selectableRows } from './ui.js';

const BAND_TOKENS = ['--prp-faint', '--prp-seq-300', '--prp-seq-400', '--prp-seq-500', '--prp-seq-600', '--prp-seq-700'];
const PLANE = 'M0,-9 L1.6,-3 L8,1.2 L8,3 L1.6,1.6 L1.2,6 L3.6,7.8 L3.6,9 L0,8.1 L-3.6,9 L-3.6,7.8 L-1.2,6 L-1.6,1.6 L-8,3 L-8,1.2 L-1.6,-3 Z';

export function create(ctx, panel) {
  const $ = s => panel.querySelector(s);
  const S = ctx.settings;
  const src = $('#ac-source'), radius = $('#ac-radius'), url = $('#ac-url'), via = $('#ac-via-bridge'), privacy = $('#ac-privacy'), pause = $('#ac-pause');
  const tbody = $('#ac-table tbody');
  const tick = ticker($('#ac-status'));
  src.value = S.adsbSource; radius.value = String(S.adsbRadiusNm); url.value = S.rxUrl; via.checked = !!S.rxViaBridge; privacy.checked = S.respectPrivacy !== false;

  let map = null, layer = null, markers = new Map(), timer = null, paused = false, busy = false, last = null, selected = null, alive = false;

  const controls = () => {
    const rx = src.value === 'receiver';
    $('#ac-url-f').hidden = !rx; $('#ac-bridge-f').hidden = !rx; $('#ac-radius-f').hidden = rx;
  };
  controls();
  legend($('#ac-legend'), ALT_BANDS.map((b, i) => ({ label: b.label, token: BAND_TOKENS[i], shape: 'dot' })), 'Altitude');
  const links = () => {
    const { lat, lon } = ctx.loc;
    $('#ac-links').innerHTML = `Open this area in <a href="${LINKS.adsbGlobe(lat, lon)}" target="_blank" rel="noopener">adsb.lol globe ↗</a> <a href="${LINKS.adsbx(lat, lon)}" target="_blank" rel="noopener">ADS-B Exchange ↗</a> <a href="${LINKS.fr24(lat, lon)}" target="_blank" rel="noopener">Flightradar24 ↗</a>`;
  };
  links();

  src.addEventListener('change', () => { ctx.save({ adsbSource: src.value }); controls(); restart(true); });
  radius.addEventListener('change', () => { ctx.save({ adsbRadiusNm: +radius.value }); restart(true); });
  url.addEventListener('change', () => { ctx.save({ rxUrl: url.value.trim() }); restart(true); });
  via.addEventListener('change', () => { ctx.save({ rxViaBridge: via.checked }); restart(true); });
  privacy.addEventListener('change', () => { ctx.save({ respectPrivacy: privacy.checked }); if (last) render(last); });
  pause.addEventListener('click', () => {
    paused = !paused; pause.setAttribute('aria-pressed', String(paused)); pause.textContent = paused ? 'Resume' : 'Pause';
    if (paused) { clearTimeout(timer); tick.paused('Paused'); } else restart(false);
  });
  selectableRows(tbody, hex => select(hex, true));
  ctx.on('loc', () => { links(); if (map) { map.setHome(ctx.loc.lat, ctx.loc.lon); fitRings(); } restart(true); });

  async function ensureMap() {
    if (map) return;
    try {
      map = await makeMap($('#ac-map'), { lat: ctx.loc.lat, lon: ctx.loc.lon, radiusKm: nmToKm(src.value === 'receiver' ? 100 : +radius.value), label: 'Map of aircraft near your location' });
      layer = map.layer();
      fitRings();
      window.addEventListener('prp:themechange', () => { if (last) render(last); });
    } catch (e) { $('#ac-map').innerHTML = `<p class="prp-empty">${esc(e.message)} The table still works.</p>`; }
  }
  function fitRings() {
    if (!map) return;
    const rx = src.value === 'receiver', nm = rx ? 100 : +radius.value;
    const step = nm / 4;
    map.setRings(ctx.loc.lat, ctx.loc.lon, [1, 2, 3, 4].map(k => nmToKm(step * k)), km => `${Math.round(kmToNm(km))} nm`);
    map.fitRadius(ctx.loc.lat, ctx.loc.lon, nmToKm(nm));
  }

  const interval = () => (src.value === 'receiver' ? 5000 : src.value === 'opensky' ? 30000 : 15000);
  let forceNext = false;
  function restart(clear) {
    clearTimeout(timer);
    if (clear) { forceNext = true; last = null; markers.forEach(m => layer?.removeLayer(m.marker)); markers.clear(); emptyRow(tbody, 7, 'Loading…'); fitRings(); }
    if (!paused && alive) poll();
  }
  async function poll() {
    if (busy || paused || !ctx.visible('aircraft')) return;
    busy = true;
    const mode = src.value, { lat, lon } = ctx.loc, nm = +radius.value;
    try {
      let json, viaText = '';
      if (mode === 'receiver') {
        const u = url.value.trim();
        const problem = S.rxViaBridge ? '' : mixedContentProblem(u, location.protocol);
        if (problem) throw Object.assign(new Error(problem), { setup: true });
        if (S.rxViaBridge && !ctx.bridge.on) throw Object.assign(new Error('Turn on the Vitruvian Manager bridge in the Overview first.'), { setup: true });
        json = await fetchReceiverJSON(ctx, { url: u, viaBridge: S.rxViaBridge, route: 'adsb' });
        viaText = S.rxViaBridge ? 'your receiver via the bridge' : 'your receiver';
      } else if (mode === 'opensky') {
        if (!ctx.bridge.on) throw Object.assign(new Error('OpenSky blocks other websites (CORS). Turn on the Vitruvian Manager bridge in the Overview to use it.'), { setup: true });
        const b = bboxAround(lat, lon, nmToKm(nm));
        const r = await fetchWithTimeout(`${ctx.bridge.url}/public/opensky/states?lamin=${b.south.toFixed(3)}&lomin=${b.west.toFixed(3)}&lamax=${b.north.toFixed(3)}&lomax=${b.east.toFixed(3)}`, { timeout: 15000, cache: 'no-store' });
        if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
        json = await r.json(); viaText = 'OpenSky via the bridge';
      } else {
        const force = forceNext;
        forceNext = false;
        const r = await fetchAdsbPublic(ctx, lat, lon, nm, { force });
        json = r.json; viaText = `adsb.lol via the ${r.route.label}`;
      }
      last = { data: normaliseAircraft(json), via: viaText, at: Date.now(), mode };
      render(last);
      const statusId = mode === 'receiver' ? 'rx-adsb' : 'adsb';
      ctx.setStatus(statusId, 'ok', `${last.data.aircraft.length} aircraft from ${viaText}.`);
      tick.set(`${fmt(last.data.aircraft.length)} aircraft · ${viaText}`, Date.now() + interval());
    } catch (e) {
      const why = e.setup ? e.message : explainError(e);
      const statusId = mode === 'receiver' ? 'rx-adsb' : 'adsb';
      ctx.setStatus(statusId, e.setup ? 'warn' : 'bad', why);
      tick.msg(`Not updated: ${why}`);
      if (!last) {
        emptyRow(tbody, 7, setupHelp(mode, e));
        kpis($('#ac-kpis'), [{ label: 'Aircraft', value: '–', sub: 'no data yet' }, { label: 'Nearest', value: '–' }, { label: 'Highest', value: '–' }, { label: 'Alerts', value: '–' },
          { label: 'Source', value: mode === 'receiver' ? 'Your receiver' : mode === 'opensky' ? 'OpenSky' : 'adsb.lol', sub: 'not reachable from this browser yet', small: true }]);
      }
    } finally {
      busy = false;
      clearTimeout(timer);
      if (!paused && alive) timer = setTimeout(poll, interval());
    }
  }
  function setupHelp(mode, e) {
    if (mode === 'receiver') return `Couldn’t read your receiver: ${esc(e.setup ? e.message : explainError(e))}.<br>Check the address (tar1090: <code>http://pi/tar1090/data/aircraft.json</code>; dump1090-fa: <code>http://pi:8080/data/aircraft.json</code>), that the receiver allows this site (CORS), or route it through the Vitruvian Manager bridge.`;
    if (mode === 'opensky') return esc(e.message);
    if (e.budget) return esc(e.message) + '. It resets at midnight UTC.';
    return `The public aircraft feed isn’t reachable from this browser: adsb.lol doesn’t allow other websites to read it directly.<br>It works once this site’s Vitruvian Manager proxy is deployed, or right now with the <button type="button" class="linkish" data-goto="overview" data-anchor="connect">Vitruvian Manager bridge</button>. Meanwhile, open the area on a public map below.`;
  }

  function render({ data, via, mode }) {
    const { lat, lon } = ctx.loc;
    const withheld = a => privacy.checked && (a.ladd || a.pia);
    let list = data.aircraft.map(a => {
      const has = a.lat != null;
      const dkm = has ? distanceKm(lat, lon, a.lat, a.lon) : null;
      return { ...a, dNm: dkm != null ? kmToNm(dkm) : null, brg: has ? bearingDeg(lat, lon, a.lat, a.lon) : null };
    });
    if (mode !== 'receiver') list = list.filter(a => a.dNm == null || a.dNm <= +radius.value + 1);
    list.sort((a, b) => (a.dNm ?? 1e9) - (b.dNm ?? 1e9));
    const pos = list.filter(a => a.lat != null), air = pos.filter(a => !a.onGround);
    const highest = air.reduce((m, a) => (a.altFt != null && (!m || a.altFt > m.altFt) ? a : m), null);
    const alerts = list.filter(a => a.alert);
    kpis($('#ac-kpis'), [
      { label: 'Aircraft', value: fmt(list.length), sub: `${fmt(pos.length)} with a position` },
      { label: 'Nearest', value: pos[0] ? `${fmt(pos[0].dNm, 1)} nm` : '–', sub: pos[0] ? `${withheld(pos[0]) ? 'Withheld' : pos[0].flight || pos[0].reg || pos[0].hex.toUpperCase()} · ${compass(pos[0].brg)}` : '' },
      { label: 'Highest', value: highest ? `${fmt(highest.altFt)} ft` : '–', sub: highest ? (withheld(highest) ? 'Withheld' : highest.flight || highest.type || '') : '' },
      { label: 'Alerts', value: alerts.length ? `${alerts.length}` : 'None', sub: alerts.length ? alerts.map(a => a.alert).join('; ') : 'No emergency squawks', word: !alerts.length, wordToken: '--prp-status-good' },
      { label: 'Source', value: mode === 'receiver' ? 'Your receiver' : mode === 'opensky' ? 'OpenSky' : 'adsb.lol', sub: via, small: true },
    ]);
    $('#ac-count').textContent = `${fmt(list.length)} shown`;
    $('#ac-caption').innerHTML = `<b>Figure 1.</b> Aircraft ${mode === 'receiver' ? 'heard by your receiver' : `within ${radius.value} nautical miles of your location`}, coloured by altitude and pointing along their track${mode === 'receiver' ? '' : '; rings every quarter of the radius'}. Source: ${esc(via)}${mode === 'auto' ? ' (ODbL)' : ''}.`;
    $('#ac-note').innerHTML = `<p>${mode === 'receiver' ? 'Your own receiver: what your antenna hears, including aircraft the aggregators filter.' : 'Public data from volunteer receivers: low-level aircraft far from a receiver are missing, and the aggregators hide some military and privacy-listed aircraft.'} ${privacy.checked ? 'Aircraft in the US FAA privacy programmes (LADD, PIA) appear without identity.' : ''}</p><p>Tracking is for situational awareness and the hobby. Don’t use it to follow or expose private individuals.</p>`;
    // Table
    const rows = list.slice(0, 250).map(a => {
      const w = withheld(a);
      const flight = w ? '<span class="muted">Withheld</span>' : esc(a.flight || a.hex.toUpperCase());
      const reg = w ? '–' : esc([a.reg, a.type].filter(Boolean).join(' · ') || '–');
      const tags = (a.alert ? ` <span class="badge bad">${esc(a.alert.replace(/ \(\d+\)$/, ''))}</span>` : '') + (a.military ? ' <span class="badge">Military</span>' : '') + (a.onGround ? ' <span class="badge">Ground</span>' : '');
      return `<tr data-row="${esc(a.hex)}" tabindex="0" class="${a.alert ? 'alert' : ''}${a.hex === selected ? ' sel' : ''}">
        <td>${flight}${tags}</td><td>${reg}</td><td class="num">${a.onGround ? '0' : fmt(a.altFt)}</td><td class="num">${fmt(a.gsKt)}</td>
        <td class="num">${a.dNm != null ? fmt(a.dNm, 1) : '–'}</td><td>${a.brg != null ? `${compass(a.brg)} <span class="muted">${fmt(a.brg)}°</span>` : '<span class="muted">no position</span>'}</td><td class="num mono">${esc(a.squawk || '–')}</td></tr>`;
    });
    if (rows.length) tbody.innerHTML = rows.join(''); else emptyRow(tbody, 7, mode === 'receiver' ? 'Your receiver reports no aircraft right now.' : 'No aircraft within this radius right now. Try a larger radius.');
    // Map
    if (!layer) return;
    const seen = new Set();
    for (const a of pos) {
      seen.add(a.hex);
      const band = altitudeBand(a), token = BAND_TOKENS[band];
      const key = `${band}|${a.track == null ? 'x' : Math.round(a.track / 5)}|${a.alert ? 1 : 0}|${a.hex === selected ? 1 : 0}`;
      const tip = `<b>${w2(a, withheld)}</b><br>${a.onGround ? 'On the ground' : `${fmt(a.altFt)} ft`} · ${fmt(a.gsKt)} kt · ${fmt(a.dNm, 1)} nm ${compass(a.brg)}${a.alert ? `<br>${esc(a.alert)}` : ''}`;
      let m = markers.get(a.hex);
      if (!m) {
        const marker = map.L.marker([a.lat, a.lon], { icon: icon(token, a, a.hex === selected), keyboard: false, riseOnHover: true }).addTo(layer);
        marker.bindTooltip(tip, { direction: 'top', offset: [0, -10] });
        marker.on('click', () => select(a.hex, false));
        m = { marker, key };
        markers.set(a.hex, m);
      } else {
        m.marker.setLatLng([a.lat, a.lon]);
        if (m.key !== key) { m.marker.setIcon(icon(token, a, a.hex === selected)); m.key = key; }
        m.marker.setTooltipContent(tip);
      }
    }
    for (const [hex, m] of markers) if (!seen.has(hex)) { layer.removeLayer(m.marker); markers.delete(hex); }
  }
  const w2 = (a, withheld) => (withheld(a) ? 'Withheld' : esc([a.flight, a.reg, a.type].filter(Boolean).join(' · ') || a.hex.toUpperCase()));
  function icon(token, a, sel) {
    const shape = a.track == null ? '<circle class="body" r="5"/>' : `<path class="body" transform="rotate(${Math.round(a.track)})" d="${PLANE}"/>`;
    return map.L.divIcon({ className: `sg-mark${a.alert ? ' alert' : ''}${sel ? ' sel' : ''}`, html: `<svg width="24" height="24" viewBox="-12 -12 24 24" style="--c:var(${token})" aria-hidden="true">${shape}</svg>`, iconSize: [24, 24], iconAnchor: [12, 12] });
  }
  function select(hex, pan) {
    selected = selected === hex ? null : hex;
    if (last) render(last);
    const m = markers.get(hex);
    if (m && pan && selected) { map.map.panTo(m.marker.getLatLng()); m.marker.openTooltip(); }
    tbody.querySelector(`tr[data-row="${CSS.escape(hex)}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  return {
    async show() { alive = true; await ensureMap(); if (map) map.map.invalidateSize(); restart(false); },
    hide() { alive = false; clearTimeout(timer); tick.paused('Paused while hidden'); },
    pause() { clearTimeout(timer); },
    resume() { if (alive && !paused) restart(false); },
  };
}
