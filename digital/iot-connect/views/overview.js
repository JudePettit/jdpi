// IoT Connect · Overview: the bridge switch and its check, the figures that say where things stand, and the limits.
import { h, fill } from './dom.js';
import { LIMITS, WHY_BRIDGE } from '../lib/words.js';

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
  ctx.on(w => { if (['status', 'devices'].includes(w)) render(); });
  render();
  return { show() { render(); } };
}
