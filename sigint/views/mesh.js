// SIGINT Dashboard · Mesh & APRS: the node database of the user's own Meshtastic radio, over USB (Web Serial, protobuf
// frames) or from the radio's HTTP API (/json/nodes) directly or through the Vitruvian Manager bridge. Messages are never decoded.
import { esc, fmt, ago, explainError, mixedContentProblem } from '../lib/util.js';
import { distanceKm } from '../lib/geo.js';
import { normaliseMeshNodes } from '../lib/feeds.js';
import { frameParser, decodeFromRadio, applyFromRadio, wantConfigFrame, WAKE, frame, hwModelName, nodeId } from '../lib/meshtastic.js';
import { fetchReceiverJSON } from '../lib/sources.js';
import { LINKS } from '../lib/catalog.js';
import { makeMap } from '../lib/maps.js';
import { kpis, emptyRow, ticker } from './ui.js';

const HEARTBEAT = frame(Uint8Array.of(0x3a, 0x00));      // ToRadio { heartbeat: {} }
const DISCONNECT = frame(Uint8Array.of(0x20, 0x01));     // ToRadio { disconnect: true }

export function create(ctx, panel) {
  const $ = s => panel.querySelector(s);
  const S = ctx.settings;
  const serialBtn = $('#ms-serial'), stopBtn = $('#ms-stop'), url = $('#ms-url'), via = $('#ms-via-bridge'), httpBtn = $('#ms-http');
  const tbody = $('#ms-table tbody'), tick = ticker($('#ms-status'));
  url.value = S.meshUrl; via.checked = !!S.meshViaBridge;
  let db = new Map(), port = null, reader = null, writer = null, beat = null, map = null, layer = null, markers = new Map(), alive = false, pending = false, mode = '';

  const aprs = () => { $('#aprs-link').href = LINKS.aprs(ctx.loc.lat, ctx.loc.lon); };
  aprs();
  ctx.on('loc', () => { aprs(); map?.setHome(ctx.loc.lat, ctx.loc.lon); render(); });
  url.addEventListener('change', () => ctx.save({ meshUrl: url.value.trim().replace(/\/+$/, '') }));
  via.addEventListener('change', () => ctx.save({ meshViaBridge: via.checked }));
  if (!('serial' in navigator)) { serialBtn.disabled = true; serialBtn.title = 'Web Serial needs Chrome, Edge or Opera on a desktop'; }
  kpis($('#ms-kpis'), [{ label: 'Nodes known', value: '–', sub: 'no radio connected' }, { label: 'Heard in 2 hours', value: '–' }, { label: 'Sharing a position', value: '–' },
    { label: 'Direct (no hops)', value: '–' }, { label: 'Your radio', value: '–', small: true, sub: 'Connect over USB or Wi-Fi' }]);

  serialBtn.addEventListener('click', async () => {
    try { port = await navigator.serial.requestPort({}); await port.open({ baudRate: 115200 }); }
    catch (e) { if (e.name !== 'NotFoundError') tick.msg(`Could not open the port: ${e.message}`); port = null; return; }
    mode = 'usb'; db = new Map(); clearMarkers();
    serialBtn.disabled = true; stopBtn.disabled = false; httpBtn.disabled = true;
    tick.msg('Connected; asking the radio for its node list…');
    const parse = frameParser(bytes => {
      if (applyFromRadio(db, decodeFromRadio(bytes))) schedule();
    });
    try {
      writer = port.writable.getWriter();
      await writer.write(WAKE);
      await new Promise(r => setTimeout(r, 120));
      await writer.write(wantConfigFrame((Math.random() * 0xffffffff) >>> 0));
      beat = setInterval(() => writer?.write(HEARTBEAT).catch(() => {}), 60e3);
      reader = port.readable.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parse(value);
      }
    } catch (e) {
      ctx.setStatus('rx-mesh', 'bad', `USB connection lost: ${e.message}`);
      tick.msg(`Disconnected: ${e.message}`);
    } finally { await disconnect(); }
  });
  stopBtn.addEventListener('click', () => disconnect(true));
  async function disconnect(polite = false) {
    clearInterval(beat); beat = null;
    if (polite && writer) { try { await writer.write(DISCONNECT); } catch { /* ignore */ } }
    try { await reader?.cancel(); } catch { /* closed */ }
    try { reader?.releaseLock(); writer?.releaseLock(); } catch { /* ignore */ }
    try { await port?.close(); } catch { /* ignore */ }
    reader = null; writer = null; port = null;
    serialBtn.disabled = !('serial' in navigator); stopBtn.disabled = true; httpBtn.disabled = false;
    if (mode === 'usb') { tick.msg(`Disconnected · ${db.size} nodes kept on screen`); ctx.setStatus('rx-mesh', 'idle', 'Disconnected.'); }
  }

  httpBtn.addEventListener('click', async () => {
    const base = url.value.trim().replace(/\/+$/, '');
    ctx.save({ meshUrl: base });
    const problem = via.checked ? '' : mixedContentProblem(base, location.protocol);
    if (problem) { tick.msg(problem); return; }
    if (via.checked && !ctx.bridge.on) { tick.msg('Turn on the Vitruvian Manager bridge in the Overview first.'); return; }
    tick.msg('Reading the node list…');
    try {
      const json = await fetchReceiverJSON(ctx, { url: `${base}/json/nodes`, viaBridge: via.checked, route: 'mesh' }, 15000);
      mode = 'http'; db = new Map(); clearMarkers();
      for (const n of normaliseMeshNodes(json)) if (n.num != null) db.set(n.num, n);
      render();
      tick.set(`${db.size} nodes from the radio’s web API`);
      ctx.setStatus('rx-mesh', 'ok', `${db.size} nodes from ${via.checked ? 'the bridge' : base}.`);
    } catch (e) {
      const why = explainError(e);
      tick.msg(`Couldn’t read ${base}/json/nodes: ${why}`);
      ctx.setStatus('rx-mesh', 'bad', why);
    }
  });

  function schedule() { if (!pending) { pending = true; setTimeout(() => { pending = false; render(); }, 400); } }
  async function ensureMap() {
    if (map) return;
    try { map = await makeMap($('#ms-map'), { lat: ctx.loc.lat, lon: ctx.loc.lon, radiusKm: 60, label: 'Map of mesh nodes' }); layer = map.layer(); }
    catch (e) { $('#ms-map').innerHTML = `<p class="prp-empty">${esc(e.message)}</p>`; }
  }
  function clearMarkers() { markers.forEach(m => layer?.removeLayer(m)); markers.clear(); }

  function render() {
    if (!db.size && !mode) return;
    const now = Date.now() / 1000;
    const nodes = [...db.values()].map(n => ({ ...n, dKm: n.lat != null ? distanceKm(ctx.loc.lat, ctx.loc.lon, n.lat, n.lon) : null }))
      .sort((a, b) => (b.num === db.myNodeNum) - (a.num === db.myNodeNum) || (b.lastHeard || 0) - (a.lastHeard || 0));
    const recent = nodes.filter(n => n.lastHeard && now - n.lastHeard < 7200);
    const mine = db.myNodeNum != null ? db.get(db.myNodeNum) : null;
    kpis($('#ms-kpis'), [
      { label: 'Nodes known', value: fmt(nodes.length), sub: mode === 'usb' ? 'over USB' : 'from the web API' },
      { label: 'Heard in 2 hours', value: fmt(recent.length) },
      { label: 'Sharing a position', value: fmt(nodes.filter(n => n.lat != null).length) },
      { label: 'Direct (no hops)', value: fmt(nodes.filter(n => n.hopsAway === 0).length), sub: 'heard without relays' },
      { label: 'Your radio', value: mine ? (mine.longName || mine.id) : '–', small: true, sub: mine ? hwModelName(mine.hwModel) : '' },
    ]);
    if (mode === 'usb') { tick.set(`${nodes.length} nodes over USB`); ctx.setStatus('rx-mesh', 'ok', `${nodes.length} nodes over USB.`); }
    $('#ms-count').textContent = `${fmt(nodes.length)} nodes`;
    if (!nodes.length) emptyRow(tbody, 7, 'Connected; no nodes yet.');
    else tbody.innerHTML = nodes.slice(0, 400).map(n => `<tr>
      <td><span class="sat-name">${esc(n.longName || n.id || nodeId(n.num))}</span>${n.shortName ? ` <span class="badge">${esc(n.shortName)}</span>` : ''}${n.num === db.myNodeNum ? ' <span class="badge good">You</span>' : ''}${n.viaMqtt ? ' <span class="badge">MQTT</span>' : ''}<span class="sat-sub mono">${esc(n.id || nodeId(n.num))}</span></td>
      <td>${esc(hwModelName(n.hwModel))}</td><td>${n.lastHeard ? esc(ago(Date.now() - n.lastHeard * 1000)) : '–'}</td>
      <td class="num">${n.snr != null ? fmt(n.snr, 1) : '–'}</td><td class="num">${n.hopsAway ?? '–'}</td><td class="num">${n.battery != null ? (n.battery > 100 ? 'Powered' : `${n.battery}%`) : '–'}</td>
      <td class="num">${n.dKm != null ? fmt(n.dKm, 1) : '–'}</td></tr>`).join('');
    if (!layer) return;
    const seen = new Set();
    for (const n of nodes.filter(x => x.lat != null)) {
      seen.add(n.num);
      const tip = `<b>${esc(n.longName || n.id)}</b>${n.shortName ? ` (${esc(n.shortName)})` : ''}<br>${esc(hwModelName(n.hwModel))}${n.snr != null ? ` · SNR ${fmt(n.snr, 1)} dB` : ''}${n.lastHeard ? `<br>Heard ${esc(ago(Date.now() - n.lastHeard * 1000))}` : ''}`;
      let m = markers.get(n.num);
      if (!m) {
        m = map.L.circleMarker([n.lat, n.lon], { radius: 6, weight: 2, color: getComputedStyle(document.documentElement).getPropertyValue('--prp-surface').trim(), fillColor: getComputedStyle(document.documentElement).getPropertyValue('--prp-cat-1').trim(), fillOpacity: 1 }).addTo(layer);
        m.bindTooltip(tip, { direction: 'top' });
        markers.set(n.num, m);
      } else { m.setLatLng([n.lat, n.lon]); m.setTooltipContent(tip); }
    }
    for (const [k, m] of markers) if (!seen.has(k)) { layer.removeLayer(m); markers.delete(k); }
  }
  window.addEventListener('prp:themechange', () => { clearMarkers(); render(); });

  return {
    async show() { alive = true; await ensureMap(); map?.map.invalidateSize(); render(); },
    hide() { alive = false; },
  };
}
