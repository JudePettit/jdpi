// SIGINT Dashboard · Listen: public web receivers anyone can tune (nearest first) and the user's own OpenWebRX.
import { esc, fmt, explainError, mixedContentProblem } from '../lib/util.js';
import { distanceKm } from '../lib/geo.js';
import { normaliseOwrxStatus } from '../lib/feeds.js';
import { fetchReceiverJSON } from '../lib/sources.js';
import { RECEIVERS, DIRECTORIES } from '../lib/catalog.js';

export function create(ctx, panel) {
  const $ = s => panel.querySelector(s);
  const S = ctx.settings;
  const url = $('#ow-url'), via = $('#ow-via-bridge'), state = $('#ow-state'), open = $('#ow-open');
  url.value = S.owrxUrl; via.checked = !!S.owrxViaBridge; open.href = S.owrxUrl;

  const renderReceivers = () => {
    const { lat, lon } = ctx.loc;
    const list = RECEIVERS.map(r => ({ ...r, d: distanceKm(lat, lon, r.lat, r.lon) })).sort((a, b) => a.d - b.d);
    $('#rx-table tbody').innerHTML = list.map(r => `<tr><td><a href="${esc(r.url)}" target="_blank" rel="noopener" class="sat-name">${esc(r.name)} ↗</a></td><td>${esc(r.kind)}</td><td>${esc(r.place)}</td><td>${esc(r.bands)}</td><td class="num">${fmt(r.d)} km</td></tr>`).join('');
    $('#rx-dirs').innerHTML = DIRECTORIES.map(d => `<a class="card" href="${esc(d.url)}" target="_blank" rel="noopener"><b>${esc(d.name)}</b><span>${esc(d.what)}</span><i>${esc(d.kind)} · open ↗</i></a>`).join('');
  };
  renderReceivers();
  ctx.on('loc', renderReceivers);

  const setState = (cls, word) => { state.className = `prp-status ${cls}`; state.textContent = word; };
  url.addEventListener('change', () => { const v = url.value.trim().replace(/\/+$/, ''); ctx.save({ owrxUrl: v }); open.href = v; });
  via.addEventListener('change', () => ctx.save({ owrxViaBridge: via.checked }));
  $('#ow-check').addEventListener('click', async () => {
    const base = url.value.trim().replace(/\/+$/, '');
    ctx.save({ owrxUrl: base }); open.href = base;
    const problem = via.checked ? '' : mixedContentProblem(base, location.protocol);
    if (problem) { setState('bad', 'Blocked'); $('#ow-info').innerHTML = `<p class="prp-note warn">${esc(problem)}</p>`; return; }
    if (via.checked && !ctx.bridge.on) { setState('warn', 'Bridge off'); $('#ow-info').innerHTML = '<p class="prp-note warn">Turn on the PRP bridge in the Overview first.</p>'; return; }
    setState('', 'Checking…');
    try {
      const s = normaliseOwrxStatus(await fetchReceiverJSON(ctx, { url: `${base}/status.json`, viaBridge: via.checked, route: 'owrx' }));
      if (!s) throw new Error('Unexpected reply');
      setState('good', 'Running');
      ctx.setStatus('rx-owrx', 'ok', `${s.name || 'OpenWebRX'}${s.version ? ` v${s.version}` : ''}; ${s.sdrs.length} SDR${s.sdrs.length === 1 ? '' : 's'}.`);
      $('#ow-info').innerHTML = `<dl><dt>Name</dt><dd>${esc(s.name || '–')}</dd><dt>Location</dt><dd>${esc(s.location || '–')}</dd><dt>Version</dt><dd>${esc(s.version || '–')}</dd>` +
        `<dt>SDRs</dt><dd>${s.sdrs.map(x => `${esc(x.name || x.type)} <span class="muted">(${esc(x.type || '')})</span>: ${x.profiles.map(p => esc(p.name)).join(', ') || 'no profiles'}`).join('<br>') || '–'}</dd></dl>`;
    } catch (e) {
      setState('bad', 'Not reachable');
      ctx.setStatus('rx-owrx', 'bad', explainError(e));
      $('#ow-info').innerHTML = `<p class="prp-note warn">No status from <code>${esc(base)}/status.json</code>: ${esc(explainError(e))}. OpenWebRX doesn’t send CORS headers, so from this site use the PRP bridge (route <code>owrx</code>). The receiver itself still opens in its own tab.</p>`;
    }
  });
  return { show() {}, hide() {} };
}
