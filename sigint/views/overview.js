// SIGINT Dashboard · Overview: status tiles for every feed and connector, the public-feed checks, and the bridge setup.
import { esc, ago, fetchJSON, explainError } from '../lib/util.js';
import { fetchAdsbPublic, loadGp, bridgeHealth, SWPC, wsprUrl } from '../lib/sources.js';
import { normaliseAircraft, normaliseScales } from '../lib/feeds.js';

const TILES = [
  { id: 'adsb', name: 'Aircraft · adsb.lol', kind: 'Public feed', tab: 'aircraft', idle: 'Checked when the page opens.' },
  { id: 'celestrak', name: 'Orbits · CelesTrak', kind: 'Public feed', tab: 'satellites', idle: 'Orbital elements for pass predictions.' },
  { id: 'swpc', name: 'Space weather · NOAA SWPC', kind: 'Public feed', tab: 'spaceweather', idle: 'Kp, X-rays, solar wind, alerts.' },
  { id: 'wspr', name: 'HF propagation · wspr.live', kind: 'Public feed', tab: 'spaceweather', idle: 'WSPR spots heard near you.' },
  { id: 'gpsjam', name: 'GNSS interference · GPSJam', kind: 'Link only', tab: 'gnss' },
  { id: 'aisstream', name: 'Ships · aisstream.io', kind: 'Public · key + bridge', tab: 'ships' },
  { id: 'rx-adsb', name: 'My ADS-B receiver', kind: 'Your receiver', tab: 'aircraft', idle: 'readsb, dump1090-fa or tar1090 aircraft.json.' },
  { id: 'rx-ais', name: 'My AIS-catcher', kind: 'Your receiver', tab: 'ships', idle: 'AIS-catcher’s /api/ships.json.' },
  { id: 'rx-mesh', name: 'My Meshtastic radio', kind: 'USB or Wi-Fi', tab: 'mesh', idle: 'Node list over Web Serial or /json/nodes.' },
  { id: 'rx-gnss', name: 'My GNSS receiver', kind: 'USB · Web Serial', tab: 'gnss', idle: 'NMEA from a USB GPS.' },
  { id: 'rx-owrx', name: 'My OpenWebRX', kind: 'Your receiver', tab: 'listen', idle: 'Receiver status from /status.json.' },
  { id: 'bridge', name: 'Vitruvian Manager bridge', kind: 'On this computer', tab: 'overview', anchor: 'connect', idle: 'Off. Needed for local receivers on other machines, aisstream.io and OpenSky.' },
  { id: 'webusb', name: 'RTL-SDR in the browser', kind: 'WebUSB', tab: 'listen' },
];
const WORD = { ok: ['good', 'Working'], warn: ['warn', 'Needs attention'], bad: ['bad', 'Not reachable'], idle: ['', 'Not set up'], link: ['', 'Link only'], planned: ['warn', 'Planned'], na: ['', 'Not supported here'], checking: ['', 'Checking…'] };

export function create(ctx, panel) {
  const $ = s => panel.querySelector(s);
  // Static states that need no network.
  ctx.setStatus('gpsjam', 'link', 'Daily interference maps; shown by link because the data carries no re-use licence and blocks other sites.');
  ctx.setStatus('webusb', 'planned', 'Driving an RTL-SDR from this page over WebUSB is planned. Use OpenWebRX or SDR++ meanwhile.');
  if (!('serial' in navigator)) {
    ctx.setStatus('rx-gnss', 'na', 'Web Serial needs Chrome, Edge or Opera on a desktop.');
    ctx.setStatus('rx-mesh', 'idle', 'Web Serial needs Chrome, Edge or Opera on a desktop; the Wi-Fi option works anywhere.');
  }
  if (!ctx.status.has('aisstream')) ctx.setStatus('aisstream', 'idle', 'aisstream.io does not permit browser connections: paste your free key in Ships and run the bridge.');

  const renderTiles = () => {
    $('#tiles').innerHTML = TILES.map(t => {
      const s = ctx.status.get(t.id);
      const [cls, word] = WORD[s?.state || 'idle'];
      return `<div class="tile" role="listitem" data-id="${t.id}">
        <div class="t-head"><span class="t-name">${esc(t.name)}</span><span class="t-kind">${esc(t.kind)}</span></div>
        <span class="prp-status ${cls}">${esc(word)}</span>
        <span class="t-detail">${esc(s?.detail || t.idle || '')}</span>
        <div class="t-foot"><span class="t-at">${s?.at && !['link', 'planned', 'na', 'idle'].includes(s.state) ? esc(ago(Date.now() - s.at)) : ''}</span>
          <button type="button" class="linkish" data-goto="${t.tab}"${t.anchor ? ` data-anchor="${t.anchor}"` : ''}>${t.tab === 'overview' ? 'Set up' : 'Open'}</button></div>
      </div>`;
    }).join('');
  };
  ctx.on('status', renderTiles);
  renderTiles();
  setInterval(() => { if (ctx.visible('overview')) renderTiles(); }, 30000);

  /* ---- Public checks ---- */
  let checking = false, checkedAt = 0;
  async function checkPublic() {
    if (checking) return;
    checking = true;
    $('#check-all').disabled = true;
    $('#feeds-checked').textContent = 'Checking…';
    const { lat, lon } = ctx.loc;
    const jobs = [
      ['adsb', async () => {
        const { json, route } = await fetchAdsbPublic(ctx, lat, lon, 50, { force: true });
        const n = normaliseAircraft(json).aircraft.length;
        return `${n} aircraft within 50 nm of you, via the ${route.label}.`;
      }],
      ['celestrak', async () => {
        const r = await loadGp('weather');
        return `${r.data.length} weather satellites${r.cached ? `, cached ${ago(Date.now() - r.at)}` : ', just downloaded'}.`;
      }],
      ['swpc', async () => {
        const s = normaliseScales(await fetchJSON(`${SWPC}/products/noaa-scales.json`, { timeout: 10000 }));
        return s ? `Now: radio blackouts R${s.R.scale ?? 0}, radiation storms S${s.S.scale ?? 0}, geomagnetic storms G${s.G.scale ?? 0}.` : 'Answered, but in an unexpected format.';
      }],
      ['wspr', async () => {
        const j = await fetchJSON(wsprUrl('SELECT count() AS n FROM wspr.rx WHERE time > now() - INTERVAL 10 MINUTE FORMAT JSON'), { timeout: 12000 });
        const n = Number(j?.data?.[0]?.n ?? 0);
        return `${n.toLocaleString('en-GB')} spots worldwide in the last 10 minutes.`;
      }],
    ];
    await Promise.all(jobs.map(async ([id, fn]) => {
      ctx.setStatus(id, 'checking', 'Checking…');
      try { ctx.setStatus(id, 'ok', await fn()); }
      catch (e) {
        const why = e.budget ? e.message : explainError(e);
        const extra = id === 'adsb' ? ' adsb.lol sends no CORS headers: this works once the site’s Vitruvian Manager proxy is deployed, or with the Vitruvian Manager bridge turned on.' : '';
        ctx.setStatus(id, 'bad', `${why}.${extra}`);
      }
    }));
    checkedAt = Date.now();
    $('#feeds-checked').textContent = `Checked ${new Date(checkedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    $('#check-all').disabled = false;
    checking = false;
  }
  $('#check-all').addEventListener('click', checkPublic);

  /* ---- Bridge ---- */
  const on = $('#bridge-on'), url = $('#bridge-url'), state = $('#bridge-state');
  on.checked = !!ctx.settings.bridgeOn; url.value = ctx.bridge.url;
  const showBridge = (cls, word) => { state.className = `prp-status ${cls}`; state.textContent = word; };
  async function checkBridge() {
    if (!ctx.settings.bridgeOn) { showBridge('', 'Off'); ctx.setStatus('bridge', 'idle', 'Off. Turn it on under “Connect your own receivers”.'); return; }
    showBridge('', 'Checking…');
    try {
      const h = await bridgeHealth(ctx);
      const routes = Object.keys(h.routes || {});
      showBridge('good', `Running · v${h.version}`);
      ctx.setStatus('bridge', 'ok', `v${h.version} at ${ctx.bridge.url}; routes: ${routes.length ? routes.join(', ') : 'none set'}${h.aisstream?.configured ? '; aisstream key set' : ''}.`);
    } catch (e) {
      showBridge('bad', 'Not reachable');
      ctx.setStatus('bridge', 'bad', `${explainError(e)} at ${ctx.bridge.url}. Is it running, and did you allow local network access?`);
    }
  }
  on.addEventListener('change', () => { ctx.save({ bridgeOn: on.checked }); checkBridge(); });
  url.addEventListener('change', () => { const v = url.value.trim().replace(/\/+$/, ''); if (/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(v)) { ctx.save({ bridgeUrl: v }); checkBridge(); } else { url.value = ctx.bridge.url; showBridge('bad', 'Use http://localhost:port'); } });
  $('#bridge-check').addEventListener('click', () => { if (!on.checked) { on.checked = true; ctx.save({ bridgeOn: true }); } checkBridge(); });

  /* The command line for the user's own settings. */
  const cmd = () => {
    const s = ctx.settings, port = (/:(\d+)$/.exec(ctx.bridge.url) || [])[1];
    const strip = u => String(u || '').replace(/\/+$/, '');
    const parts = ['node prp-bridge.mjs'];
    if (port && port !== '8790') parts.push(`--port ${port}`);
    parts.push(`--route adsb=${s.rxUrl}`, `--route ais=${s.aisUrl}`, `--route mesh=${strip(s.meshUrl)}/json/nodes`, `--route owrx=${strip(s.owrxUrl)}/status.json`);
    return parts.join(' \\\n    ') + '\n# optional, for Ships → aisstream.io: set AISSTREAM_API_KEY first, or paste the key in the Ships tab';
  };
  const showCmd = () => { $('#bridge-cmd').firstElementChild.textContent = cmd(); };
  showCmd();
  ctx.on('settings', showCmd);
  $('#copy-bridge').addEventListener('click', async e => {
    try { await navigator.clipboard.writeText(cmd().replace(/ \\\n {4}/g, ' ')); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Select and copy'; }
    setTimeout(() => { e.target.textContent = 'Copy command'; }, 2000);
  });

  // Connectors set up earlier are reported by their views; here, only say what is configured.
  if (ctx.settings.adsbSource === 'receiver' && !ctx.status.has('rx-adsb')) ctx.setStatus('rx-adsb', 'idle', `Set to ${ctx.settings.rxViaBridge ? 'the bridge route “adsb”' : ctx.settings.rxUrl}. Open Aircraft to connect.`);
  if (ctx.settings.bridgeOn) checkBridge();

  return {
    show() { if (!checkedAt || Date.now() - checkedAt > 10 * 60e3) checkPublic(); renderTiles(); },
    hide() {},
  };
}
