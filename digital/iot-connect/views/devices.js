// IoT Connect · Devices: look for devices or type one address, Hermes's finding for each answer, Add behind the
// ownership tick, your devices by room with their controls, Roku's policy and Home Assistant. Device text is shown as
// text only. Every change is a POST sent by a click, and setup steps wait for Y in the bridge window.
import { h, fill, say, busy } from './dom.js';
import { TYPED_KINDS, kindLabel, protocolLabel, statusWord, typedAddress, byRoom, canList, commandBody, stateLine } from '../lib/model.js';
import { TICK_OWNED, TICK_HOME, SHARED, SHORT } from '../lib/words.js';

const NEEDS_PAIRING = new Set(['hue-clip2', 'lg-webos', 'samsung-tizen']);
const WAIT = 'Waiting for Y in the bridge window…';

export function create(ctx, panel) {
  const $ = s => panel.querySelector(s);
  $('#discover-hint').textContent = SHORT.discover;
  $('#typed-hint').textContent = SHORT.typed;
  fill($('#typed-kind'), TYPED_KINDS.map(([v, l]) => h('option', { value: v }, l)));
  $('#own-home-words').textContent = TICK_HOME;
  $('#ha-warn').textContent = SHORT.haSwitch;

  /* ---- Look for devices, or one typed address ---- */
  const findSay = $('#find-say');
  $('#discover').addEventListener('click', busy($('#discover'), async () => {
    say(findSay, 'Asking the network… (about three seconds)');
    try {
      const j = await ctx.client.post('/iot/discover', {});
      ctx.candidates = j.candidates || []; ctx.network = j.network || null;
      ctx.emit('candidates');
      say(findSay, ctx.candidates.length ? `${ctx.candidates.length} answered.` : 'Nothing answered. Is the device on and on the same Wi-Fi? You can also type its address.', ctx.candidates.length ? 'good' : '');
    } catch (e) { say(findSay, e.message, 'bad'); }
  }));
  $('#typed').addEventListener('submit', e => { e.preventDefault(); identify(); });
  const identify = busy($('#typed-go'), async () => {
    const address = typedAddress($('#typed-address').value);
    if (!address) { say(findSay, 'Type an address such as 192.168.1.31, with no port: the kind decides the port.', 'bad'); return; }
    say(findSay, `Asking ${address}…`);
    try {
      await ctx.client.post('/iot/identify', { kind: $('#typed-kind').value, address });
      await ctx.read('candidates');
      say(findSay, 'It answered: see below.', 'good');
    } catch (err) { say(findSay, err.message, 'bad'); }
  });

  /* ---- The shared-network lock ---- */
  const ownHome = $('#own-home'), ownSave = $('#own-home-save');
  ownHome.addEventListener('change', () => { ownSave.disabled = !ownHome.checked; });
  ownSave.addEventListener('click', busy(ownSave, async () => {
    say(findSay, WAIT);
    try { const j = await ctx.client.post('/iot/network', { ownHome: true }); ctx.network = j.network; ctx.emit('candidates'); say(findSay, 'Marked as your own home network.', 'good'); }
    catch (e) { say(findSay, e.message, 'bad'); }
  }));

  /* ---- Roku's policy ---- */
  const rokuTick = $('#roku-tick'), rokuSave = $('#roku-save');
  rokuTick.addEventListener('change', () => { rokuSave.disabled = !rokuTick.checked; });
  rokuSave.addEventListener('click', busy(rokuSave, async () => {
    say($('#roku-say'), WAIT);
    try { await ctx.client.post('/iot/policy', { roku: true }); await ctx.read('status'); say($('#roku-say'), 'The Roku route is on.', 'good'); }
    catch (e) { say($('#roku-say'), e.message, 'bad'); }
  }));

  /* ---- Candidates ---- */
  function candidateCard(c) {
    const f = c.finding || {}, yours = c.known === 'yours', unknown = f.source === 'rule:none' || !f.source;
    const net = ctx.network || {};
    const locked = net.shared && !net.ownHome && !NEEDS_PAIRING.has(c.protocol);
    const li = h('li', { class: 'card cand', dataset: { candidate: c.id } });
    const meta = [c.maker, c.model].filter(Boolean).join(' ');
    li.append(
      h('div', { class: 'card-head' }, h('h3', { class: 'card-name' }, c.name || 'Unnamed device'), h('span', { class: `badge ${yours ? 'good' : 'warn'}` }, c.label || (yours ? 'Already one of your devices' : 'Found on this network, not yet known to be yours'))),
      h('p', { class: 'card-meta mono' }, [meta, c.address, `found by ${c.via}`].filter(Boolean).join(' · ')),
      h('p', { class: 'says' }, h('b', {}, 'Hermes: '), unknown ? 'Hermes does not know this device. Here is what it announced.' : (f.says || '')));
    if (!unknown && (f.routes || []).length) li.append(h('p', { class: 'hint' }, `Route: ${(f.routes || []).map(protocolLabel).join(', ')}.${f.pairing?.consentOnDevice ? ' You will confirm on the device itself.' : ''}`));
    if ((f.pairing?.steps || []).length) li.append(h('ol', { class: 'steps-sm' }, f.pairing.steps.map(s => h('li', {}, s))));
    if ((f.limits || []).length) li.append(h('ul', { class: 'limits-list' }, f.limits.map(s => h('li', {}, s))));
    if (c.announcement) {
      const pre = h('pre', { class: 'code announce' }, c.announcement);
      const copy = h('button', { type: 'button', class: 'prp-btn sm ghost' }, 'Copy announcement');
      copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(c.announcement); copy.textContent = 'Copied'; } catch { const r = document.createRange(); r.selectNodeContents(pre); getSelection().removeAllRanges(); getSelection().addRange(r); copy.textContent = 'Selected'; } setTimeout(() => { copy.textContent = 'Copy announcement'; }, 1800); });
      li.append(h('details', { class: 'announce-box', open: unknown || null }, h('summary', {}, 'What it announced'), pre, h('p', { class: 'hint' }, 'Remove addresses and serial numbers before you share it.'), copy));
    }
    if (yours || !c.canAdd) { if (!c.canAdd && !yours) li.append(h('p', { class: 'hint' }, 'VM cannot drive this device.')); return li; }
    const tick = h('input', { type: 'checkbox', class: 'owned' });
    const name = h('input', { class: 'prp-input', value: c.name || '', maxlength: 64, 'aria-label': 'Name' });
    const room = h('input', { class: 'prp-input', placeholder: 'Living room', maxlength: 40, 'aria-label': 'Room' });
    const add = h('button', { type: 'button', class: 'prp-btn primary add', disabled: true }, c.generic ? 'Add as a generic DLNA player' : 'Add');
    const line = h('p', { class: 'say', role: 'status' });
    tick.addEventListener('change', () => { add.disabled = !tick.checked || locked; });
    add.addEventListener('click', busy(add, async () => {
      if (!tick.checked) return;
      say(line, WAIT);
      try {
        await ctx.client.post('/iot/add', { candidate: c.id, owned: true, name: name.value.trim() || undefined, room: room.value.trim() || undefined });
        await ctx.read('devices', 'candidates', 'status');
      } catch (e) { say(line, e.message, 'bad'); tick.checked = false; add.disabled = true; }
    }));
    li.append(h('div', { class: 'add-form' },
      h('label', { class: 'field' }, h('span', { class: 'prp-label' }, 'Name'), name),
      h('label', { class: 'field' }, h('span', { class: 'prp-label' }, 'Room'), room),
      h('label', { class: 'check tick' }, tick, h('span', {}, TICK_OWNED)),
      add),
    h('p', { class: 'hint' }, locked ? `${SHARED} Confirm above that this is your own home network first.` : SHORT.add), line);
    return li;
  }
  function renderCandidates() {
    const net = ctx.network || {};
    $('#shared').hidden = !(net.shared && !net.ownHome);
    $('#shared-words').textContent = net.words || SHARED;
    $('#shared-why').textContent = (net.reasons || []).length ? `(${net.reasons.join('; ')}.)` : '';
    const list = ctx.candidates || [];
    $('#cand-count').textContent = list.length ? `${list.length} answered` : '';
    fill($('#candidates'), list.length ? list.map(candidateCard) : h('li', { class: 'prp-empty' }, ctx.connected ? 'Nothing yet: press “Look for devices”, or type an address.' : 'Turn on the bridge first.'));
  }

  /* ---- Your devices ---- */
  function control(d, label, action, args, cls = '') {
    const b = h('button', { type: 'button', class: `prp-btn sm ${cls}`, dataset: { action } }, label);
    b.addEventListener('click', busy(b, () => send(d, action, typeof args === 'function' ? args() : args)));
    return b;
  }
  async function send(d, action, args) {
    const line = $(`[data-answer="${CSS.escape(d.id)}"]`);
    say(line, 'Sending…');
    try {
      const j = await ctx.client.post('/iot/command', commandBody(d, action, args));
      const dev = ctx.devices.find(x => x.id === d.id);
      if (dev) dev.state = j.state || dev.state;
      const st = $(`[data-state="${CSS.escape(d.id)}"]`); if (st) st.textContent = stateLine(j.state);
      say(line, j.note ? `Done. ${j.note}` : 'Done.', 'good');
    } catch (e) { say(line, e.message, e.code === 'rate-limited' ? 'warn' : 'bad'); }
  }
  function deviceCard(d) {
    const [tone, word] = statusWord(d.status), A = new Set(d.actions || []);
    const li = h('li', { class: 'card dev', dataset: { device: d.id } });
    li.append(
      h('div', { class: 'card-head' }, h('h4', { class: 'card-name' }, d.name), h('span', { class: `prp-status ${tone}` }, word)),
      h('p', { class: 'card-meta mono' }, [kindLabel(d.kind), protocolLabel(d.protocol), d.address].filter(Boolean).join(' · ')),
      h('p', { class: 'state', dataset: { state: d.id } }, stateLine(d.state)));
    for (const n of d.notes || []) li.append(h('p', { class: 'hint' }, n));
    const rows = [];
    if (A.has('power')) rows.push([control(d, 'On', 'power', { on: true }), control(d, 'Off', 'power', { on: false })]);
    if (A.has('toggle')) rows.push([control(d, 'Toggle', 'toggle')]);
    if (A.has('brightness')) { const r = h('input', { type: 'range', min: 0, max: 100, value: d.state?.brightness ?? 60, 'aria-label': `Brightness of ${d.name}` }); rows.push([r, control(d, 'Set brightness', 'brightness', () => ({ level: Number(r.value) }))]); }
    if (A.has('colour')) { const c = h('input', { type: 'color', value: '#ffb060', 'aria-label': `Colour of ${d.name}` }); rows.push([c, control(d, 'Set colour', 'colour', () => ({ hex: c.value }))]); }
    if (A.has('colour-temp')) { const t = h('input', { type: 'range', min: 2000, max: 6500, step: 100, value: 2700, 'aria-label': `White temperature of ${d.name}, kelvin` }); rows.push([t, control(d, 'Set white', 'colour-temp', () => ({ kelvin: Number(t.value) }))]); }
    if (A.has('volume')) { const v = h('input', { type: 'range', min: 0, max: d.volumeCeiling ?? 80, value: Math.min(d.state?.volume ?? 20, d.volumeCeiling ?? 80), 'aria-label': `Volume of ${d.name}` }); rows.push([v, control(d, 'Set volume', 'volume', () => ({ level: Number(v.value) })), h('span', { class: 'hint inline' }, `Stops at ${d.volumeCeiling ?? 80}`)]); }
    if (A.has('mute')) rows.push([control(d, 'Mute', 'mute', { on: true }), control(d, 'Unmute', 'mute', { on: false })]);
    if (A.has('play-url')) { const u = h('input', { class: 'prp-input mono', type: 'url', placeholder: 'http://192.168.1.10:8200/film.mp4', maxlength: 2048, 'aria-label': `Address for ${d.name} to play` }); rows.push([u, control(d, 'Play address', 'play-url', () => ({ url: u.value.trim() }))]); }
    const play = ['play', 'pause', 'stop'].filter(a => A.has(a));
    if (play.length) rows.push(play.map(a => control(d, a[0].toUpperCase() + a.slice(1), a)));
    if (A.has('launch')) { const l = h('input', { class: 'prp-input mono', maxlength: 64, placeholder: d.protocol === 'roku-ecp' ? 'Channel number, e.g. 12' : 'App id, e.g. netflix', 'aria-label': `Channel or app for ${d.name}` }); rows.push([l, control(d, 'Open', 'launch', () => ({ app: l.value.trim() }))]); }
    if (A.has('key')) rows.push([h('button', { type: 'button', class: 'linkish', dataset: { goto: 'remote' } }, 'Open the Remote tab for its arrow keys')]);
    if (d.protocol === 'home-assistant' && String(d.entity || '').startsWith('remote.')) rows.push((d.commands || []).map(cmd => control(d, cmd, 'ha', { domain: 'remote', service: 'send_command', entity: d.entity, command: cmd })));
    if (rows.length) li.append(h('div', { class: 'controls' }, rows.map(r => h('div', { class: 'ctl-row' }, r))));
    else if (!NEEDS_PAIRING.has(d.protocol) && !d.protected) li.append(h('p', { class: 'hint' }, `Takes: ${canList(d.actions) || 'nothing yet'}.`));
    // Pairing: the maker's documented step, with consent on the device and Y in the bridge window.
    if ((NEEDS_PAIRING.has(d.protocol) || d.protected) && !d.paired) {
      const pw = d.protected ? h('input', { class: 'prp-input', type: 'password', autocomplete: 'off', 'aria-label': `The password you gave ${d.name}` }) : null;
      const b = h('button', { type: 'button', class: 'prp-btn sm primary', dataset: { action: 'pair' } }, d.protocol === 'hue-clip2' ? 'Continue' : 'Pair');
      b.addEventListener('click', busy(b, async () => {
        const line = $(`[data-answer="${CSS.escape(d.id)}"]`);
        say(line, `${WAIT} ${d.protocol === 'lg-webos' || d.protocol === 'samsung-tizen' ? 'Then accept on the TV screen.' : ''}`);
        try {
          const j = await ctx.client.post('/iot/pair', { device: d.id, ...(pw ? { password: pw.value } : {}) });
          if (pw) pw.value = '';
          await ctx.read('devices');
          say($(`[data-answer="${CSS.escape(d.id)}"]`), j.lights ? `Paired: ${j.lights.length} lights added.` : 'Paired.', 'good');
        } catch (e) { say(line, e.message, 'bad'); }
      }));
      li.append(h('div', { class: 'ctl-row pair-row' }, d.protocol === 'hue-clip2' ? h('span', { class: 'hint inline' }, 'Press the round button on the Hue bridge, then Continue.') : null, pw, b, h('span', { class: 'hint inline' }, SHORT.pair)));
    }
    if (d.protocol === 'hue-clip2' && d.paired) li.append(h('p', { class: 'hint' }, 'Paired: its lights are listed as devices of their own.'));
    const readBtn = h('button', { type: 'button', class: 'prp-btn sm ghost' }, 'Read state');
    readBtn.addEventListener('click', busy(readBtn, async () => {
      const line = $(`[data-answer="${CSS.escape(d.id)}"]`);
      try { const j = await ctx.client.post('/iot/state', { device: d.id }); $(`[data-state="${CSS.escape(d.id)}"]`).textContent = stateLine(j.state); say(line, 'Read.', 'good'); }
      catch (e) { say(line, e.message, 'bad'); }
    }));
    const rm = h('button', { type: 'button', class: 'prp-btn sm ghost danger' }, 'Remove');
    rm.addEventListener('click', busy(rm, async () => {
      try { await ctx.client.post('/iot/remove', { device: d.id }); await ctx.read('devices', 'candidates', 'status'); }
      catch (e) { say($(`[data-answer="${CSS.escape(d.id)}"]`), e.message, 'bad'); }
    }));
    li.append(h('div', { class: 'card-foot' }, readBtn, rm), h('p', { class: 'say', role: 'status', 'aria-live': 'polite', dataset: { answer: d.id } }));
    return li;
  }
  function renderDevices() {
    const list = ctx.devices || [];
    $('#dev-count').textContent = list.length ? `${list.length} added · ${SHORT.command}` : '';
    const groups = byRoom(list);
    fill($('#rooms'), groups.length ? groups.map(g => h('section', { class: 'room' }, h('h3', { class: 'prp-h3 room-name' }, g.label), h('ul', { class: 'cards' }, g.devices.map(deviceCard))))
      : h('p', { class: 'prp-empty' }, ctx.connected ? 'No devices yet: look for them above, tick that each is yours, and add it.' : 'Turn on the bridge first.'));
    const roku = list.some(d => d.protocol === 'roku-ecp') || (ctx.candidates || []).some(c => c.protocol === 'roku-ecp');
    $('#roku-panel').hidden = !roku || !!ctx.status?.policies?.roku;
  }

  /* ---- Home Assistant ---- */
  $('#ha-form').addEventListener('submit', busy($('#ha-form').querySelector('button'), async e => {
    e.preventDefault();
    const input = $('#ha-token'), token = input.value.trim();
    if (!token) { say($('#ha-say'), 'Paste the long-lived token first.', 'bad'); return; }
    say($('#ha-say'), WAIT);
    try { await ctx.client.post('/iot/ha/token', { token }); say($('#ha-say'), 'The bridge has the token and checked it once.', 'good'); await ctx.read('status', 'ha'); }
    catch (err) { say($('#ha-say'), err.message, 'bad'); }
    finally { input.value = ''; }
  }));
  function renderHa() {
    const s = ctx.status?.homeAssistant;
    $('#ha-panel').hidden = !s?.configured;
    if (!s?.configured) return;
    $('#ha-state').textContent = s.tokenSet ? `Token set · ${s.ticked} ticked` : 'No token yet';
    const rows = ctx.ha || [];
    $('#ha-table').hidden = !rows.length;
    fill($('#ha-rows'), rows.map(e => {
      const tick = h('input', { type: 'checkbox', checked: e.ticked || null, 'aria-label': `Let VM control ${e.name}` });
      const cmds = e.domain === 'remote' ? h('input', { class: 'prp-input mono', placeholder: 'tv_power, tv_volume_up', 'aria-label': `Commands for ${e.name}, separated by commas` }) : null;
      const line = h('span', { class: 'say' });
      tick.addEventListener('change', async () => {
        say(line, tick.checked ? WAIT : '');
        try { await ctx.client.post('/iot/ha/tick', { entity: e.entity, on: tick.checked, ...(cmds ? { commands: cmds.value.split(',').map(x => x.trim()).filter(Boolean) } : {}) }); say(line, tick.checked ? 'Ticked.' : 'Off.', 'good'); await ctx.read('devices', 'status'); }
        catch (err) { tick.checked = !tick.checked; say(line, err.message, 'bad'); }
      });
      return h('tr', {}, h('td', { class: 'mono' }, e.entity), h('td', {}, e.name), h('td', {}, h('label', { class: 'check' }, tick, h('span', {}, 'Ticked')), line), h('td', {}, cmds || '–'));
    }));
  }

  function renderAll() {
    $('#dev-off').hidden = ctx.connected;
    for (const b of [$('#discover'), $('#typed-go')]) b.disabled = !ctx.connected;
    renderCandidates(); renderDevices(); renderHa();
  }
  ctx.on(w => { if (['status', 'devices', 'candidates', 'ha'].includes(w)) renderAll(); });
  renderAll();
  return {
    show() { renderAll(); if (ctx.connected) ctx.read('devices', 'candidates', ...(ctx.status?.homeAssistant?.tokenSet ? ['ha'] : [])); },
  };
}
