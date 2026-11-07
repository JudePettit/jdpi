// IoT Connect · UNS: the broker link as the bridge reports it (GET /iot/uns): connected or not, the JSON tree's root,
// Sparkplug B's sequence numbers, and the last messages. The page can read it, never change it: the broker, its
// address and whether it may send commands are set in the bridge's config file.
import { h, fill } from './dom.js';
import { ago } from '../lib/model.js';

export function create(ctx, panel) {
  const $ = s => panel.querySelector(s);
  const kpi = (label, value, small, tone = '') => h('div', { class: 'prp-kpi' }, h('span', {}, label), h('b', { class: tone ? `word ${tone}` : '' }, value), h('small', {}, small));
  function render() {
    const u = ctx.uns;
    if (!ctx.connected || !u) {
      fill($('#uns-kpis'), kpi('Broker', ctx.connected ? 'Reading…' : 'Bridge off', 'The broker link lives in the bridge'));
      return;
    }
    if (!u.configured) {
      fill($('#uns-kpis'), kpi('Broker', 'None set', 'Set iot.broker in the bridge’s config file'));
      fill($('#uns-rows'), h('tr', {}, h('td', { colspan: 4, class: 'prp-empty' }, 'No broker is set, so nothing is published.')));
      fill($('#uns-limits'));
      $('#uns-root').textContent = '';
      return;
    }
    fill($('#uns-kpis'),
      kpi('Broker', u.connected ? 'Connected' : 'Not connected', u.url || '', u.connected ? 'good' : 'warn'),
      kpi('JSON tree', u.json ? 'On' : 'Off', u.root ? `${u.root}/…/state` : ''),
      kpi('Sparkplug B', u.sparkplug ? 'On' : 'Off', u.sparkplug ? `spBv1.0/${u.group}/…/${u.edgeNode} · bdSeq ${u.bdSeq} · seq ${u.seq}` : '"sparkplug": true in the config file'),
      kpi('Commands from the broker', u.acceptCommands ? 'Simple ones only' : 'Off', u.acceptCommands ? 'power, dimming, colour, volume, playback' : 'Only a Rebirth request is heard'));
    if (u.error) $('#uns-kpis').append(h('p', { class: 'prp-note bad' }, u.error));
    $('#uns-root').textContent = u.root || '';
    const recent = u.recent || [];
    fill($('#uns-rows'), recent.length ? recent.slice(-30).reverse().map(m => h('tr', {}, h('td', { class: 'mono' }, m.topic), h('td', {}, ago(m.at)), h('td', { class: 'num' }, String(m.bytes)), h('td', {}, m.retain ? 'Yes' : 'No')))
      : h('tr', {}, h('td', { colspan: 4, class: 'prp-empty' }, 'Nothing published yet.')));
    fill($('#uns-limits'), (u.limits || []).map(t => h('li', {}, t)));
  }
  $('#uns-refresh').addEventListener('click', () => ctx.read('uns'));
  ctx.on(w => { if (['uns', 'status'].includes(w)) render(); });
  render();
  return { show() { render(); if (ctx.connected) ctx.read('uns'); } };
}
