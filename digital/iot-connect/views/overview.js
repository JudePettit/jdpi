// IoT Connect · Overview: the bridge switch and its check, the figures that say where things stand, and the limits.
import { h, fill, say, busy } from './dom.js';
import { LIMITS, WHY_BRIDGE, REQUEST_LOG } from '../lib/words.js';
import { logRow } from '../lib/model.js';

export function create(ctx, panel) {
  const $ = s => panel.querySelector(s);
  $('#why-bridge').textContent = WHY_BRIDGE;
  fill($('#limits'), LIMITS.map(([t, d]) => [h('dt', {}, t), h('dd', {}, d)]));

  const on = $('#bridge-on'), state = $('#bridge-state');
  on.checked = !!ctx.settings.bridgeOn;
  const show = (cls, word) => { state.className = `prp-status ${cls}`; state.textContent = word; };
  async function check() {
    if (!ctx.settings.bridgeOn) { show('', 'Off'); ctx.connected = false; ctx.emit('status'); return; }
    show('', 'Checking…');
    if (await ctx.check()) await ctx.read('devices', 'candidates', 'phones');
  }
  on.addEventListener('change', () => { ctx.save({ bridgeOn: on.checked }); check(); });
  $('#bridge-check').addEventListener('click', () => { if (!on.checked) { on.checked = true; ctx.save({ bridgeOn: true }); } check(); });

  const kpi = (label, value, small, tone = '') => h('div', { class: 'prp-kpi' }, h('span', {}, label), h('b', { class: tone ? `word ${tone}` : '' }, value), h('small', {}, small));
  function render() {
    if (!ctx.settings.bridgeOn) show('', 'Off');
    else if (ctx.connected) show('good', `Running · v${ctx.health?.version || '?'}`);
    else if (ctx.problem) show('bad', 'Not reachable');
    const s = ctx.status;
    if (!ctx.connected || !s) {
      fill($('#kpis'), kpi('Bridge', ctx.settings.bridgeOn ? 'Not reachable' : 'Off', ctx.problem || 'Turn it on below, once it is running.', ctx.settings.bridgeOn ? 'bad' : ''));
      return;
    }
    const net = s.network || {};
    fill($('#kpis'),
      kpi('Bridge', `v${s.version}`, s.console ? 'Setup steps ask in its window' : 'No window: setup is refused', s.console ? 'good' : 'warn'),
      kpi('Devices', String(ctx.devices.length || s.devices || 0), `Home connection: ${s.interface || 'not set in the config file'}`),
      kpi('Network', net.shared && !net.ownHome ? 'Looks shared' : net.ownHome ? 'Your own home' : 'Not flagged', net.shared ? (net.reasons || []).join('; ') : 'No sign of a shared network', net.shared && !net.ownHome ? 'warn' : ''),
      kpi('Broker', !s.broker?.configured ? 'None set' : s.broker.connected ? 'Connected' : 'Not connected', s.broker?.configured ? `${s.broker.json ? 'JSON tree' : ''}${s.broker.sparkplug ? ' · Sparkplug B' : ''}` : 'Set iot.broker in the config file', s.broker?.connected ? 'good' : ''),
      kpi('Home Assistant', !s.homeAssistant?.configured ? 'None set' : s.homeAssistant.tokenSet ? `${s.homeAssistant.ticked} ticked` : 'Needs a token', s.homeAssistant?.configured ? 'Only ticked entities reach VM' : 'Set iot.homeAssistant.url'),
      kpi('Phone remote', s.lan?.listening ? `${s.phones} paired` : 'Off', s.lan?.listening ? `On ${s.lan.address}:${s.lan.port}` : s.lan?.problem || 'Start the bridge with --lan', s.lan?.listening ? 'good' : ''));
  }
  /* ---- The bridge's request log (first run, finding 3): read with GET on a click, cleared with POST on a click ---- */
  $('#log-words').textContent = REQUEST_LOG;
  const logRead = $('#log-read'), logClear = $('#log-clear'), logSay = $('#log-say');
  function showLog(entries) {
    const rows = (entries || []).map(e => logRow(e, ctx.devices));
    $('#log-table').hidden = !rows.length;
    $('#log-count').textContent = `${rows.length} kept`;
    fill($('#log-rows'), rows.map(r => h('tr', {}, h('td', { class: 'mono' }, r.time), h('td', {}, r.from), h('td', { class: 'mono' }, r.request), h('td', {}, r.device), h('td', {}, r.action),
      h('td', {}, h('span', { class: `prp-status ${r.tone}` }, r.result)))));
    say(logSay, rows.length ? '' : 'The log is empty: nothing has reached the bridge since it started or was cleared.');
  }
  logRead.addEventListener('click', busy(logRead, async () => {
    try { showLog((await ctx.client.get('/iot/log')).entries); } catch (e) { say(logSay, e.message, 'bad'); }
  }));
  logClear.addEventListener('click', busy(logClear, async () => {
    try { const j = await ctx.client.post('/iot/log/clear', {}); showLog([]); say(logSay, `Cleared: ${j.cleared} ${j.cleared === 1 ? 'entry' : 'entries'} removed from the bridge’s memory.`, 'good'); }
    catch (e) { say(logSay, e.message, 'bad'); }
  }));
  function renderLog() {
    logRead.disabled = logClear.disabled = !ctx.connected;
    if (!ctx.connected) { $('#log-table').hidden = true; $('#log-count').textContent = ''; say(logSay, 'Turn on the bridge above to read its log.'); }
    else if (logSay.textContent === 'Turn on the bridge above to read its log.') say(logSay, '');
  }

  ctx.on(w => { if (['status', 'devices'].includes(w)) { render(); renderLog(); } });
  renderLog();
  render();
  return { show() { render(); } };
}
