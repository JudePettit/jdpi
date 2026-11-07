// IoT Connect · Hermes: the agent's state and rules, its findings (the Hub messages it publishes at GET /iot/hermes),
// and the optional AI question, which shows the exact text and host before anything is sent and needs a second click.
import { h, fill, say, busy } from './dom.js';
import { kindLabel, protocolLabel, ago } from '../lib/model.js';
import { SHORT } from '../lib/words.js';

export function create(ctx, panel) {
  const $ = s => panel.querySelector(s);
  $('#ai-words').textContent = SHORT.ai;

  function finding(f) {
    const ai = f.source === 'ai';
    return h('li', { class: `card finding${ai ? ' ai' : ''}` },
      h('div', { class: 'card-head' }, h('h3', { class: 'card-name' }, f.device?.name || 'Unnamed device'), h('span', { class: `badge ${ai ? 'warn' : f.known === 'yours' ? 'good' : ''}` }, ai ? 'AI suggestion, not checked' : f.known === 'yours' ? 'Yours' : 'Not yet known to be yours')),
      h('p', { class: 'card-meta mono' }, [kindLabel(f.device?.kind), f.device?.maker, f.device?.model, ago(f.at)].filter(Boolean).join(' · ')),
      h('p', { class: 'says' }, f.says || ''),
      (f.routes || []).length ? h('p', { class: 'hint' }, `Route: ${f.routes.map(protocolLabel).join(', ')}`) : null,
      (f.pairing?.steps || []).length ? h('ol', { class: 'steps-sm' }, f.pairing.steps.map(s => h('li', {}, s))) : null,
      (f.limits || []).length ? h('ul', { class: 'limits-list' }, f.limits.map(s => h('li', {}, s))) : null,
      h('p', { class: 'hint mono' }, `Source: ${f.source} · message ${f.type} v${f.v}`));
  }
  function render() {
    const j = ctx.hermes;
    const st = $('#hermes-state');
    if (!ctx.connected || !j) { st.className = 'prp-status'; st.textContent = ctx.connected ? 'Checking…' : 'Bridge off'; }
    else { st.className = 'prp-status good'; st.textContent = `${j.agent}: ${j.status}`; }
    $('#hermes-rules').textContent = j ? `${j.rules.length} rules: ${j.rules.join(', ')}.` : 'Its rules load from the bridge once it is on.';
    const list = j?.findings || [];
    fill($('#findings'), list.length ? list.map(finding) : h('li', { class: 'prp-empty' }, ctx.connected ? 'No findings yet: look for devices on the Devices tab.' : 'Turn on the bridge first.'));
    // The AI question: only when the bridge has it switched on, and only for devices Hermes does not know.
    const ai = j?.ai || ctx.status?.ai;
    $('#ai-state').textContent = ai?.enabled ? `On · ${ai.host}` : 'Off';
    const unknown = (ctx.candidates || []).filter(c => !c.finding || c.finding.source === 'rule:none');
    const box = $('#ai-box');
    if (!ai?.enabled) { fill(box, h('p', { class: 'hint' }, 'Switched off in the bridge (the default).')); return; }
    if (!unknown.length) { fill(box, h('p', { class: 'hint' }, 'No unknown device to ask about.')); return; }
    fill(box, h('ul', { class: 'cards' }, unknown.map(c => {
      const ask = h('button', { type: 'button', class: 'prp-btn sm' }, 'Show what would be sent');
      const out = h('div', { class: 'ai-preview' });
      ask.addEventListener('click', busy(ask, async () => {
        try {
          const p = await ctx.client.post('/iot/hermes/ask', { candidate: c.id });
          const send = h('button', { type: 'button', class: 'prp-btn sm primary' }, `Send this to ${p.preview.host}`);
          send.addEventListener('click', busy(send, async () => {
            try { const r = await ctx.client.post('/iot/hermes/ask', { candidate: c.id, confirm: p.confirm }); fill(out, finding(r.finding)); }
            catch (e) { say($('#ai-say'), e.message, 'bad'); }
          }));
          fill(out, h('p', { class: 'prp-label' }, `To ${p.preview.host}, exactly:`), h('pre', { class: 'code' }, p.preview.text), send);
        } catch (e) { say($('#ai-say'), e.message, 'bad'); }
      }));
      return h('li', { class: 'card' }, h('p', {}, h('b', {}, c.name || 'Unnamed device'), ` · ${[c.maker, c.model].filter(Boolean).join(' ') || 'no maker given'}`), ask, out);
    })));
  }
  $('#hermes-refresh').addEventListener('click', () => ctx.read('hermes', 'candidates'));
  ctx.on(w => { if (['hermes', 'status', 'candidates'].includes(w)) render(); });
  render();
  return { show() { render(); if (ctx.connected) ctx.read('hermes'); } };
}
