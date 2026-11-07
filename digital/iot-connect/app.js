// IoT Connect (Digital Science). Entry module: the in-page tabs kept in the address (#tab=…), the bridge switch, the
// data every view shares (read from the bridge with GET only), and the views. The bridge is contacted only once the
// user turns it on or presses Check; after that, views read it when they open. Only a click ever sends a change (POST):
// no address, hash or key press does.
import { createClient, normaliseBase, DEFAULT_BRIDGE, BridgeError } from './lib/bridge.js';
import * as overview from './views/overview.js';
import * as devices from './views/devices.js';
import * as remote from './views/remote.js';
import * as hermes from './views/hermes.js';
import * as uns from './views/uns.js';
import * as law from './views/law.js';

const $ = s => document.querySelector(s);
const TABS = ['overview', 'devices', 'remote', 'hermes', 'uns', 'law'];
const ALIASES = { phone: 'remote', agent: 'hermes', mqtt: 'uns', sparkplug: 'uns', safety: 'law', legal: 'law', home: 'overview' };
const VIEWS = { overview, devices, remote, hermes, uns, law };
const K = { settings: 'prp.iot.settings', bridge: 'prp.iot.bridgeUrl' };
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: the switch lasts this visit */ } },
};

/* ---- The context every view shares -------------------------------------------------------------------------------- */
const listeners = new Set();
// The bridge address: http://localhost:8790, the one port the site's security policy lets this page reach. A
// loopback address kept in this browser (prp.iot.bridgeUrl) overrides it for local testing; there is no field for it.
const base = normaliseBase(store.get(K.bridge, null)) || DEFAULT_BRIDGE;
const ctx = {
  client: createClient(base),
  settings: { bridgeOn: false, ...(store.get(K.settings, {}) || {}) },
  tab: null,
  connected: false,
  health: null, status: null, devices: [], candidates: [], network: null, phones: [], lan: null, hermes: null, uns: null, ha: null,
  problem: '',
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(what) { for (const f of listeners) { try { f(what); } catch (e) { console.error(e); } } renderMeta(); },
  save(patch) { Object.assign(ctx.settings, patch); store.set(K.settings, ctx.settings); },
  go(tab) { select(tab); },

  /** Check the bridge: /health, then /iot/status. Says what is wrong in plain words. */
  async check() {
    ctx.problem = '';
    try {
      ctx.health = await ctx.client.health();
      if (!(ctx.health.features || []).includes('iot-1')) throw new BridgeError('old', `This bridge is version ${ctx.health.version || 'unknown'}, which has no IoT Connect: download version 2.0.0 or later.`);
      if (!ctx.health.iot?.enabled) throw new BridgeError('iot-off', 'The bridge is running, but IoT Connect is off in it. Start it with --iot.');
      ctx.status = await ctx.client.get('/iot/status');
      ctx.connected = true;
    } catch (e) {
      ctx.connected = false; ctx.status = null;
      ctx.problem = e instanceof BridgeError ? e.message : String(e.message || e);
    }
    ctx.emit('status');
    return ctx.connected;
  },
  /** Read one or more of the bridge's lists (GET only). */
  async read(...what) {
    if (!ctx.connected) return;
    const jobs = {
      status: async () => { ctx.status = await ctx.client.get('/iot/status'); },
      devices: async () => { ctx.devices = (await ctx.client.get('/iot/devices')).devices || []; },
      candidates: async () => { const j = await ctx.client.get('/iot/candidates'); ctx.candidates = j.candidates || []; ctx.network = j.network || null; },
      phones: async () => { const j = await ctx.client.get('/iot/phone'); ctx.phones = j.phones || []; ctx.lan = j.lan || null; },
      hermes: async () => { ctx.hermes = await ctx.client.get('/iot/hermes'); },
      uns: async () => { ctx.uns = await ctx.client.get('/iot/uns'); },
      ha: async () => { ctx.ha = (await ctx.client.get('/iot/ha/entities')).entities || []; },
    };
    for (const w of what) {
      try { await jobs[w](); } catch (e) {
        if (e.code === 'unreachable') { ctx.connected = false; ctx.problem = e.message; ctx.emit('status'); return; }
        console.warn(`IoT Connect: ${w}: ${e.message}`);
      }
      ctx.emit(w);
    }
  },
};
window.prpIot = ctx; // handy in the console

/* ---- Header meta line --------------------------------------------------------------------------------------------- */
function renderMeta() {
  $('#meta-bridge').textContent = !ctx.settings.bridgeOn ? 'off' : ctx.connected ? `running · v${ctx.health?.version || '?'} at ${ctx.client.base}` : (ctx.problem ? 'not reachable' : 'checking…');
  $('#meta-devices').textContent = ctx.connected ? String(ctx.devices.length || ctx.status?.devices || 0) : '–';
}

/* ---- Tabs ----------------------------------------------------------------------------------------------------------- */
const hashTab = () => {
  const raw = location.hash.replace(/^#/, '');
  const t = String((raw.includes('=') ? new URLSearchParams(raw).get('tab') : raw) || '').toLowerCase();
  const n = ALIASES[t] || t;
  return TABS.includes(n) ? n : 'overview';
};
const views = new Map();
function select(tab, { focus = false, fromHash = false } = {}) {
  tab = TABS.includes(tab) ? tab : 'overview';
  ctx.tab = tab;
  for (const id of TABS) {
    const b = $(`#tab-${id}`), on = id === tab;
    b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    $(`#panel-${id}`).hidden = !on;
  }
  if (focus) $(`#tab-${tab}`).focus();
  if (!fromHash) { const h = `#tab=${tab}`; if (location.hash !== h) history.replaceState(null, '', h); }
  document.title = `${tab === 'overview' ? '' : $(`#tab-${tab}`).textContent + ' · '}IoT Connect · VM`;
  keepTabVisible(tab);
  let v = views.get(tab);
  if (!v) { v = VIEWS[tab].create(ctx, $(`#panel-${tab}`)); views.set(tab, v); }
  try { v.show?.(); } catch (e) { console.error(e); }
}
function keepTabVisible(tab) {
  const bar = $('#tabs'), btn = $(`#tab-${tab}`);
  const l = btn.offsetLeft, r = l + btn.offsetWidth;
  if (l < bar.scrollLeft) bar.scrollLeft = Math.max(0, l - 16); else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = r - bar.clientWidth + 16;
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('[role="tab"]'); if (b) select(b.id.slice(4)); });
$('#tabs').addEventListener('keydown', e => {
  const i = TABS.indexOf(ctx.tab), next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  select(TABS[(next + TABS.length) % TABS.length], { focus: true });
});
document.addEventListener('click', e => { const a = e.target.closest('[data-goto]'); if (!a) return; e.preventDefault(); select(a.dataset.goto); });
window.addEventListener('hashchange', () => select(hashTab(), { fromHash: true }));

renderMeta();
// Every view is made once, so the Overview's bridge switch and the header follow the data from the start.
for (const id of TABS) if (!views.has(id)) views.set(id, VIEWS[id].create(ctx, $(`#panel-${id}`)));
select(hashTab(), { fromHash: false });
if (ctx.settings.bridgeOn) ctx.check().then(ok => { if (ok) ctx.read('devices', 'candidates', 'phones'); });
