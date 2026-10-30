// GEOINT & IMINT Dashboard (PRP · International Mystery Management). One page, eight tabs, state in the URL hash:
//   #tab=imagery&ll=47.15,34.1&z=8&l=terra&d=2023-05-28&d2=2023-06-18&cmp=1   (old ?tab= links open the same tab)
// Each tab's code loads the first time the tab opens. Maps share one view (ll, z) so a place follows you between tabs.
import { TABS, parseHash, buildHash, parseLatLon, fmtLatLon, clamp, isoDay, addDays, esc } from './util.js';
import { lessonPath, IMAGERY, gibsDomainsUrl, parseGibsDomains, latestDay } from './sources.js';

const $ = s => document.querySelector(s);
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
const SHELL = new URL('../', location.href).href;
const SUITE_OF = { 'osint-training': 'oi', osint: 'oi', sigint: 'oi', geoint: 'oi', battlefield: 'rt' };
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = parseHash(location.hash, location.search);
const start = parseLatLon(state.ll);
let hashTimer = 0;

const ctx = {
  embedded, SHELL, reduceMotion,
  state,
  tab: null,
  view: start ? { lat: start[0], lon: start[1], z: clamp(+state.z || 6, 1, 19) } : { lat: 30, lon: 15, z: 3 },
  /** Merge keys into the URL state (null or '' removes a key) and rewrite the hash without adding history. */
  set(patch) {
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined || v === '' || v === false) delete this.state[k]; else this.state[k] = String(v === true ? 1 : v); }
    writeHash();
  },
  /** The shared map view; maps call this on moveend. */
  setView(lat, lon, z) {
    this.view = { lat, lon, z };
    this.state.ll = fmtLatLon(lat, lon, 4); this.state.z = String(Math.round(z * 10) / 10);
    clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 250);
  },
  /** A link to another PRP submodule: inside the shell it opens there (target _top), on its own it opens directly. */
  prpLink(path) {
    const [module, ...rest] = String(path).split('/');
    const rel = rest.join('/');
    const suite = SUITE_OF[module] || 'rt';
    if (embedded) return { href: `${SHELL}#/${suite}/${module}${rel ? `?at=${encodeURIComponent(new URL(rel, SHELL).href)}` : ''}`, target: '_top' };
    return { href: new URL(rel || `${module}/index.html`, SHELL).href, target: '_self' };
  },
  lessonLink(id) { return this.prpLink(`osint-training/${lessonPath(id)}`); },
  /** Point every <a data-lesson="…"> inside root at that OSINT Training lesson. */
  wireLessons(root = document) {
    root.querySelectorAll('a[data-lesson]').forEach(a => { const l = this.lessonLink(a.dataset.lesson); a.href = l.href; a.target = l.target; });
  },
  /** fetch() JSON or text with a small in-memory cache (per URL, ttl in ms) and a timeout. */
  async get(url, { ttl = 5 * 60e3, as = 'json', force = false, timeout = 45000 } = {}) {
    const hit = cache.get(url);
    if (!force && hit && Date.now() - hit.t < ttl) return hit.v;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
    const res = await fetch(url, { signal: ctl.signal, credentials: 'omit' }).catch(err => { throw err.name === 'AbortError' ? new Error('no answer in time') : err; }).finally(() => clearTimeout(timer));
    if (!res.ok) throw Object.assign(new Error(`${res.status} ${res.statusText || 'error'}`), { status: res.status });
    const v = as === 'text' ? await res.text() : await res.json();
    cache.set(url, { t: Date.now(), v });
    return v;
  },
  /** The days a GIBS layer has imagery between two dates, as ranges. Cached for 30 minutes. */
  async domains(def, from, to) {
    const xml = await this.get(gibsDomainsUrl(def, from, to), { as: 'text', ttl: 30 * 60e3 });
    return parseGibsDomains(xml);
  },
  /** Newest day with any VIIRS NOAA-20 imagery (falls back to yesterday). It may still be filling in. */
  newest() {
    newestPromise ||= (async () => {
      const today = isoDay();
      try { return latestDay(await this.domains(IMAGERY[0], addDays(today, -14), today)) || addDays(today, -1); }
      catch { return addDays(today, -1); }
    })();
    return newestPromise;
  },
  /** Newest complete day: a UTC day's passes and processing finish about six hours after it ends. The default view. */
  async latest() {
    const day = await this.newest();
    return Date.now() < Date.parse(day + 'T00:00:00Z') + 30 * 3600e3 ? addDays(day, -1) : day;
  },
};
const cache = new Map();
let newestPromise = null;

function writeHash() {
  clearTimeout(hashTimer);
  const h = buildHash(ctx.state);
  if (h !== location.hash && h !== '#') history.replaceState(null, '', location.pathname + location.search + h);
}

/* ---------------------------------------------------------------- tabs */
const LOAD = {
  overview: () => import('./overview.js'), imagery: () => import('./imagery.js'), hazards: () => import('./hazards.js'),
  features: () => import('./features.js'), measure: () => import('./measure.js'),
  cookbook: () => import('./content.js'), hardware: () => import('./content.js'), law: () => import('./content.js'),
};
const views = {}, starting = {};
const tabButtons = TABS.map(id => $('#tab-' + id));

async function show(id) {
  if (ctx.tab === id) { views[id]?.apply?.(ctx.state); return; }
  const prev = ctx.tab;
  ctx.tab = id;
  TABS.forEach((t, i) => {
    const on = t === id;
    tabButtons[i].setAttribute('aria-selected', String(on));
    tabButtons[i].tabIndex = on ? 0 : -1;
    $('#panel-' + t).hidden = !on;
  });
  revealTab(tabButtons[TABS.indexOf(id)]);
  if (prev) views[prev]?.hide?.();
  try {
    if (!views[id]) {
      // One start per tab, even if the tab is opened again while its code is still loading.
      starting[id] ||= LOAD[id]().then(mod => mod.init($('#panel-' + id), ctx, id)).then(v => (views[id] = v), err => { delete starting[id]; throw err; });
      await starting[id];
    }
    if (ctx.tab === id) views[id].show?.(ctx.state);
  } catch (err) {
    console.error(err);
    const panel = $('#panel-' + id);
    if (!panel.querySelector('.load-error')) panel.insertAdjacentHTML('afterbegin', `<p class="prp-note bad load-error">This view could not load: ${esc(err.message)}. Check your connection and reload the page.</p>`);
  }
}

/** On a phone the tab row scrolls sideways: bring the chosen tab into view without moving the page. */
function revealTab(btn) {
  const bar = $('#tabs');
  if (!btn || bar.scrollWidth <= bar.clientWidth + 1) return;
  const left = btn.offsetLeft - (bar.clientWidth - btn.offsetWidth) / 2;
  bar.scrollTo({ left: Math.max(0, left), behavior: 'auto' });
}

function go(id, extra = {}) {
  ctx.set({ tab: id, s: null, ...extra });
  show(id);
}

tabButtons.forEach((b, k) => {
  b.addEventListener('click', () => go(TABS[k]));
  b.addEventListener('keydown', e => {
    const next = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const to = tabButtons[(next + TABS.length) % TABS.length];
    to.focus(); to.click();
    to.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
});

// In-page links such as <a href="#tab=imagery&l=bm" data-tab-link>, from the overview and the guides.
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-tab-link]');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  const want = parseHash(a.getAttribute('href'));
  const { tab, ...rest } = want;
  go(tab, rest);
  if (rest.l || rest.preset) views[tab]?.apply?.(ctx.state);
  document.querySelector('#tabs').scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
});

// Back/forward and edited links.
window.addEventListener('hashchange', () => {
  const next = parseHash(location.hash, '');
  for (const k of Object.keys(ctx.state)) delete ctx.state[k];
  Object.assign(ctx.state, next);
  const ll = parseLatLon(next.ll);
  if (ll) ctx.view = { lat: ll[0], lon: ll[1], z: clamp(+next.z || ctx.view.z, 1, 19) };
  if (next.tab !== ctx.tab) show(next.tab); else views[ctx.tab]?.apply?.(ctx.state);
});

/* ---------------------------------------------------------------- boot */
ctx.wireLessons(document);
show(state.tab);
ctx.latest().then(day => {
  const el = $('#meta-latest');
  if (el) el.innerHTML = `Latest full day of imagery: <b>${esc(new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }))}</b>`;
});
window.geoint = ctx; // handy in the console; also used by the tests through the page
