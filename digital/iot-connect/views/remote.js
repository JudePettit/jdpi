// IoT Connect · Remote: large keys for a TV or player on this computer, and the phone as the remote. Pairing a phone
// makes a one-time six-digit code in the bridge (POST, from a click only); the page shows it and a QR code of the
// phone's address, and the bridge window asks Y before the phone gets its key. The page never sees that key.
import { h, fill, say, svg, busy } from './dom.js';
import { LABELS, PAD, ROW, isKey } from '../lib/keymap.js';
import { commandBody, remoteable, ago } from '../lib/model.js';
import { qrEncode, qrPath } from '../lib/qr.js';
import { PHONE_LIMITS, SHORT } from '../lib/words.js';

export function create(ctx, panel) {
  const $ = s => panel.querySelector(s);
  const sel = $('#remote-device'), line = $('#remote-say');
  fill($('#phone-limits'), PHONE_LIMITS.map(t => h('li', {}, t)));

  const current = () => (ctx.devices || []).find(d => d.id === sel.value) || null;
  async function send(action, args) {
    const d = current();
    if (!d) { say(line, 'Choose a device first.', 'bad'); return; }
    say(line, 'Sending…');
    try { const j = await ctx.client.post('/iot/command', commandBody(d, action, args)); say(line, j.note ? `Done. ${j.note}` : 'Done.', 'good'); }
    catch (e) { say(line, e.message, e.code === 'rate-limited' ? 'warn' : 'bad'); }
  }
  // Vol + and Vol − set a level where the device takes one, so its ceiling holds; other keys go as keys where the
  // device takes keys, and Mute falls back to its own command.
  function pressKey(name) {
    const d = current();
    if (!d || !isKey(name)) return;
    const A = new Set(d.actions || []);
    if ((name === 'VolumeUp' || name === 'VolumeDown') && A.has('volume')) {
      const now = Number(d.state?.volume ?? 20), level = Math.max(0, Math.min(d.volumeCeiling ?? 80, now + (name === 'VolumeUp' ? 5 : -5)));
      d.state = { ...(d.state || {}), volume: level };
      return send('volume', { level });
    }
    if (A.has('key')) return send('key', { name });
    if (name === 'Mute' && A.has('mute')) return send('mute', { on: true });
    say(line, `${d.name} does not take that key.`, 'bad');
  }
  const keyButton = name => {
    const [text, aria] = LABELS[name];
    const b = h('button', { type: 'button', class: 'key', dataset: { key: name }, 'aria-label': aria }, text);
    b.addEventListener('click', busy(b, () => pressKey(name)));
    return b;
  };
  fill($('#pad'), PAD.flat().map(k => (k ? keyButton(k) : h('span', { class: 'key-gap', 'aria-hidden': 'true' }))));
  fill($('#pad-row'), ROW.map(keyButton));
  const act = (label, action, args) => { const b = h('button', { type: 'button', class: 'key wide', dataset: { action } }, label); b.addEventListener('click', busy(b, () => send(action, args))); return b; };
  fill($('#pad-play'), act('Play', 'play'), act('Pause', 'pause'), act('Stop', 'stop'), act('On', 'power', { on: true }), act('Off', 'power', { on: false }));

  function renderPad() {
    const list = (ctx.devices || []).filter(remoteable);
    const keep = sel.value;
    fill(sel, list.map(d => h('option', { value: d.id }, d.room ? `${d.name} (${d.room})` : d.name)));
    if (list.some(d => d.id === keep)) sel.value = keep;
    $('#remote-none').hidden = list.length > 0 || !ctx.connected;
    const d = current(), A = new Set(d?.actions || []);
    for (const b of panel.querySelectorAll('.key[data-key]')) {
      const k = b.dataset.key, vol = (k === 'VolumeUp' || k === 'VolumeDown') && A.has('volume'), mute = k === 'Mute' && A.has('mute');
      b.disabled = !d || !(A.has('key') || vol || mute);
    }
    for (const b of panel.querySelectorAll('.key[data-action]')) b.disabled = !d || !A.has(b.dataset.action);
  }
  sel.addEventListener('change', renderPad);

  /* ---- The phone ---- */
  const phoneSay = $('#phone-say');
  let timer = null;
  function drawQr(url) {
    const q = qrEncode(url), n = q.size + 8;
    const s = svg('svg', { viewBox: `0 0 ${n} ${n}`, role: 'img', 'aria-label': `QR code of ${url}`, 'shape-rendering': 'crispEdges' });
    s.append(svg('rect', { width: n, height: n, class: 'qr-paper' }), svg('path', { d: qrPath(q.modules), class: 'qr-ink' }));
    fill($('#qr'), s);
  }
  $('#pair-phone').addEventListener('click', busy($('#pair-phone'), async () => {
    say(phoneSay, '');
    try {
      const j = await ctx.client.post('/iot/phone/pair', {});
      $('#pairing').hidden = false;
      $('#pair-code').textContent = j.code;
      $('#pair-url').textContent = j.url;
      drawQr(j.url);
      const until = Date.parse(j.expiresAt);
      clearInterval(timer);
      const tick = () => {
        const s = Math.round((until - Date.now()) / 1000);
        if (s <= 0) { clearInterval(timer); $('#pairing').hidden = true; say(phoneSay, 'The code expired: make a new one.'); return; }
        $('#pair-expiry').textContent = `The code works once, for ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} more, with five tries. Then press Y in the bridge window.`;
      };
      tick(); timer = setInterval(tick, 1000);
      say(phoneSay, SHORT.phone);
      setTimeout(() => ctx.read('phones'), 4000);
    } catch (e) { $('#pairing').hidden = true; say(phoneSay, e.message, 'bad'); }
  }));
  $('#revoke-all').addEventListener('click', busy($('#revoke-all'), async () => {
    try { const j = await ctx.client.post('/iot/phone/revoke', { all: true }); say(phoneSay, `Revoked ${j.revoked}.`, 'good'); await ctx.read('phones', 'status'); }
    catch (e) { say(phoneSay, e.message, 'bad'); }
  }));
  function renderPhones() {
    const lan = ctx.lan || ctx.status?.lan || {};
    $('#lan-state').textContent = !ctx.connected ? '' : lan.listening ? `On ${lan.address}` : 'Off: start the bridge with --lan';
    $('#pair-phone').disabled = !ctx.connected || !lan.listening;
    const phones = ctx.phones || [];
    $('#phones-table').hidden = !phones.length;
    $('#revoke-all').hidden = phones.length < 2;
    fill($('#phones'), phones.map(p => {
      const b = h('button', { type: 'button', class: 'prp-btn sm danger' }, 'Revoke');
      b.addEventListener('click', busy(b, async () => {
        try { await ctx.client.post('/iot/phone/revoke', { phone: p.id }); say(phoneSay, `${p.name} revoked.`, 'good'); await ctx.read('phones', 'status'); }
        catch (e) { say(phoneSay, e.message, 'bad'); }
      }));
      return h('tr', { dataset: { phone: p.id } }, h('td', {}, p.name), h('td', { class: 'mono' }, p.address), h('td', {}, ago(p.created)), h('td', {}, p.expired ? 'Expired' : new Date(p.expires).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })), h('td', {}, b));
    }));
  }

  ctx.on(w => { if (['devices', 'status'].includes(w)) renderPad(); if (['phones', 'status'].includes(w)) renderPhones(); });
  renderPad(); renderPhones();
  return { show() { renderPad(); renderPhones(); if (ctx.connected) ctx.read('devices', 'phones'); } };
}
