// SIGINT Dashboard (Realtime Intelligence). Entry module: in-page tabs kept in the URL (#tab=…), the location setting,
// shared settings, feed status, and views loaded when their tab first opens. Views poll only while visible.
import { store, esc } from './lib/util.js';
import { maidenhead, fromMaidenhead, parseCoord, fmtLatLon } from './lib/geo.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TABS = ['overview', 'aircraft', 'ships', 'satellites', 'spaceweather', 'gnss', 'mesh', 'listen', 'cookbook', 'hardware', 'law'];
const ALIASES = { adsb: 'aircraft', planes: 'aircraft', ais: 'ships', sats: 'satellites', space: 'spaceweather', 'space-weather': 'spaceweather', gps: 'gnss', meshtastic: 'mesh', aprs: 'mesh', websdr: 'listen', sdr: 'listen', software: 'cookbook', kit: 'hardware', legal: 'law', ethics: 'law' };
const VIEWS = {
  overview: () => import('./views/overview.js'), aircraft: () => import('./views/aircraft.js'), ships: () => import('./views/ships.js'),
  satellites: () => import('./views/satellites.js'), spaceweather: () => import('./views/spaceweather.js'), gnss: () => import('./views/gnss.js'),
  mesh: () => import('./views/mesh.js'), listen: () => import('./views/listen.js'),
  cookbook: () => import('./views/docs.js'), hardware: () => import('./views/docs.js'), law: () => import('./views/docs.js'),
};
export const DEFAULT_LOC = { lat: 53.3498, lon: -6.2603, name: 'Dublin', source: 'default' };
const DEFAULTS = {
  adsbSource: 'auto', adsbRadiusNm: 50, respectPrivacy: true, rxUrl: 'http://localhost:8080/data/aircraft.json', rxViaBridge: false,
  aisSource: 'receiver', aisUrl: 'http://localhost:8100/api/ships.json', aisViaBridge: false, aisRadiusKm: 50,
  meshUrl: 'http://meshtastic.local', meshViaBridge: false, owrxUrl: 'http://localhost:8073', owrxViaBridge: false,
  bridgeOn: false, bridgeUrl: 'http://localhost:8790',
  satGroups: ['weather', 'stations', 'amateur'], satMinEl: 10, satHours: 24, satSimple: true, gnssBaud: 9600, gnssRound: true,
};
const K = { loc: 'prp.sigint.location', settings: 'prp.sigint.settings' };

/* ---- Shared context handed to every view -------------------------------------------------------------------------- */
const listeners = { loc: new Set(), status: new Set(), settings: new Set() };
const ctx = {
  loc: sanitizeLoc(store.get(K.loc, null)) || { ...DEFAULT_LOC },
  settings: { ...DEFAULTS, ...(store.get(K.settings, {}) || {}) },
  status: new Map(),
  tab: null,
  save(patch) {
    Object.assign(ctx.settings, patch);
    store.set(K.settings, ctx.settings);
    for (const f of listeners.settings) f(patch);
  },
  setLoc(loc) {
    ctx.loc = sanitizeLoc(loc) || { ...DEFAULT_LOC };
    if (ctx.loc.source === 'default') store.del(K.loc); else store.set(K.loc, ctx.loc);
    renderMeta();
    for (const f of listeners.loc) f(ctx.loc);
  },
  on(kind, fn) { listeners[kind].add(fn); return () => listeners[kind].delete(fn); },
  setStatus(id, state, detail = '', extra = {}) {
    ctx.status.set(id, { state, detail, at: Date.now(), ...extra });
    for (const f of listeners.status) f(id);
    renderMeta();
  },
  get bridge() { return { on: !!ctx.settings.bridgeOn, url: String(ctx.settings.bridgeUrl || DEFAULTS.bridgeUrl).replace(/\/+$/, '') }; },
  visible: id => ctx.tab === id && document.visibilityState === 'visible',
  go(tab, params = {}) { select(tab, params, { focusTab: false }); },
  param: name => hashParams().get(name),
  setParam(name, value) {
    const p = hashParams();
    if (value == null || value === '') p.delete(name); else p.set(name, value);
    p.set('tab', ctx.tab);
    const h = '#' + [...p].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    if (h !== location.hash) history.replaceState(null, '', h);
  },
  embedded: (() => { try { return window.self !== window.top; } catch { return true; } })(),
  shell: new URL('../', location.href).href,
};
window.prpSigint = ctx; // handy for debugging in the console

function sanitizeLoc(l) {
  if (!l || typeof l !== 'object') return null;
  const lat = Number(l.lat), lon = Number(l.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, name: typeof l.name === 'string' ? l.name.slice(0, 40) : '', source: ['default', 'manual', 'device'].includes(l.source) ? l.source : 'manual' };
}
export function locLabel(l = ctx.loc) {
  const name = l.name || (l.source === 'device' ? 'This device' : 'Custom');
  return `${name}${l.source === 'default' ? ' (default)' : ''}`;
}

/* ---- Header meta line ---------------------------------------------------------------------------------------------- */
function renderMeta() {
  $('#meta-loc').textContent = `${locLabel()} · ${fmtLatLon(ctx.loc.lat, ctx.loc.lon, 2)} · ${maidenhead(ctx.loc.lat, ctx.loc.lon, 6)}`;
  const pub = ['adsb', 'celestrak', 'swpc', 'wspr'].map(id => ctx.status.get(id)).filter(Boolean);
  const own = [...ctx.status.entries()].filter(([id, s]) => /^rx-|^bridge$/.test(id) && s.state === 'ok').length;
  if (pub.length) $('#meta-feeds').innerHTML = `<b>Feeds</b> ${pub.filter(s => s.state === 'ok').length} of ${pub.length} public working${own ? ` · ${own} of yours connected` : ''}`;
}

/* ---- Tabs --------------------------------------------------------------------------------------------------------- */
const hashParams = () => {
  const raw = location.hash.replace(/^#/, '');
  if (raw && !raw.includes('=')) return new URLSearchParams({ tab: raw });
  return new URLSearchParams(raw);
};
const normTab = t => { t = String(t || '').toLowerCase(); t = ALIASES[t] || t; return TABS.includes(t) ? t : null; };
const views = new Map();
let current = null;

async function select(tab, params = {}, { focusTab = false, fromHash = false } = {}) {
  tab = normTab(tab) || 'overview';
  const changed = tab !== ctx.tab;
  if (changed && current) { try { current.hide?.(); } catch (e) { console.error(e); } }
  ctx.tab = tab;
  for (const id of TABS) {
    const b = $(`#tab-${id}`), on = id === tab;
    b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    $(`#panel-${id}`).hidden = !on;
  }
  if (focusTab) $(`#tab-${tab}`).focus();
  keepTabVisible(tab);
  document.fonts?.ready.then(() => keepTabVisible(ctx.tab)); // web fonts change the tabs' widths
  if (!fromHash) {
    const p = new URLSearchParams({ tab, ...params });
    const h = '#' + [...p].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    if (h !== location.hash) history.replaceState(null, '', h);
  }
  document.title = `${tab === 'overview' ? '' : $(`#tab-${tab}`).textContent + ' · '}SIGINT Dashboard · PRP`;
  let view = views.get(tab);
  if (!view) {
    try {
      const mod = await VIEWS[tab]();
      view = mod.create(ctx, $(`#panel-${tab}`), tab);
      views.set(tab, view);
    } catch (e) {
      console.error(e);
      $(`#panel-${tab}`).insertAdjacentHTML('afterbegin', `<p class="prp-note bad">This view failed to load: ${esc(e.message)}</p>`);
      return;
    }
  }
  if (ctx.tab !== tab) return; // the user moved on while the module loaded
  current = view;
  try { view.show?.(fromHash ? Object.fromEntries(hashParams()) : params); } catch (e) { console.error(e); }
}

/** On narrow screens the tab row scrolls: keep the chosen tab in view (the bar is sticky, so it is the offset parent). */
function keepTabVisible(tab) {
  const bar = $('#tabs'), btn = $(`#tab-${tab}`);
  if (!bar || !btn) return;
  const l = btn.offsetLeft, r = l + btn.offsetWidth;
  if (l < bar.scrollLeft) bar.scrollLeft = Math.max(0, l - 16); else if (r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = r - bar.clientWidth + 16;
}

function wireTabs() {
  const list = $('#tabs');
  list.addEventListener('click', e => { const b = e.target.closest('[role="tab"]'); if (b) select(b.id.slice(4)); });
  list.addEventListener('keydown', e => {
    const i = TABS.indexOf(ctx.tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(TABS[(next + TABS.length) % TABS.length], {}, { focusTab: true });
  });
  // Links and buttons elsewhere on the page that switch tabs: data-goto="tab" [data-section="id"] [data-focus="id"].
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-goto]');
    if (!a) return;
    e.preventDefault();
    const params = a.dataset.section ? { s: a.dataset.section } : {};
    select(a.dataset.goto, params).then(() => {
      if (a.dataset.focus) $(`#${a.dataset.focus}`)?.focus();
      if (a.dataset.anchor) $(`#${a.dataset.anchor}`)?.scrollIntoView({ block: 'start' });
    });
  });
  window.addEventListener('hashchange', () => {
    const p = hashParams();
    select(p.get('tab'), {}, { fromHash: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (!current) return;
    if (document.visibilityState === 'visible') current.resume?.(); else current.pause?.();
  });
}

/* ---- Location form (on the Overview) ----------------------------------------------------------------------------- */
function wireLocation() {
  const form = $('#loc-form'), lat = $('#loc-lat'), lon = $('#loc-lon'), grid = $('#loc-grid'), name = $('#loc-name'), now = $('#loc-now');
  const fill = () => {
    lat.value = ctx.loc.lat.toFixed(4); lon.value = ctx.loc.lon.toFixed(4); name.value = ctx.loc.source === 'default' ? '' : ctx.loc.name || '';
    grid.value = '';
    now.classList.remove('bad');
    now.innerHTML = `Now: <b>${esc(fmtLatLon(ctx.loc.lat, ctx.loc.lon, 4))}</b> · locator <b>${esc(maidenhead(ctx.loc.lat, ctx.loc.lon, 6))}</b> · ${esc(locLabel())}`;
  };
  const say = (msg, bad = false) => { now.textContent = msg; now.classList.toggle('bad', bad); };
  form.addEventListener('submit', e => {
    e.preventDefault();
    let a, b;
    if (grid.value.trim()) {
      const c = fromMaidenhead(grid.value);
      if (!c) return say('That locator isn’t valid: two letters A–R, two digits, then optionally two letters A–X (e.g. IO63ui).', true);
      a = c.lat; b = c.lon;
    } else {
      a = parseCoord(lat.value, 'lat'); b = parseCoord(lon.value, 'lon');
      if (a == null || b == null) return say('Enter a latitude between −90 and 90 and a longitude between −180 and 180 (decimal, or degrees and minutes with N/S/E/W).', true);
    }
    ctx.setLoc({ lat: a, lon: b, name: name.value.trim() || (grid.value.trim() ? grid.value.trim().toUpperCase() : ''), source: 'manual' });
    fill();
  });
  $('#loc-gps').addEventListener('click', () => {
    if (!('geolocation' in navigator)) return say('This browser can’t share its location; enter it by hand.', true);
    say('Asking the browser for this device’s location…');
    navigator.geolocation.getCurrentPosition(
      p => { ctx.setLoc({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), name: name.value.trim() || 'This device', source: 'device' }); fill(); },
      err => say(err.code === 1 ? 'Location permission was declined. Enter a position by hand instead.' : 'The browser couldn’t determine a position. Enter it by hand instead.', true),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
  });
  $('#loc-reset').addEventListener('click', () => { ctx.setLoc({ ...DEFAULT_LOC }); fill(); });
  fill();
  ctx.on('loc', fill);
}

wireTabs();
wireLocation();
renderMeta();
const first = hashParams();
const params = Object.fromEntries(first);
delete params.tab;
select(first.get('tab') || new URLSearchParams(location.search).get('tab') || 'overview', params, { fromHash: false });
