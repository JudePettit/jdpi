// SIGINT Dashboard · Satellites: pass predictions for the user's location from CelesTrak GP data (OMM JSON), propagated
// in the browser with satellite.js (SGP4). satellite.js loads only when this tab opens.
import { esc, fmt, hhmm, dayLabel, duration, ago, explainError } from '../lib/util.js';
import { compass } from '../lib/geo.js';
import { findPasses, passTrack, makeLookAt, satrecFromOmm, orbitClass } from '../lib/passes.js';
import { satMeta, SAT_GROUPS, LINKS } from '../lib/catalog.js';
import { loadGp } from '../lib/sources.js';
import { skyPlot } from '../lib/charts.js';
import { legend, emptyRow } from './ui.js';

const SATJS = 'https://cdn.jsdelivr.net/npm/satellite.js@7.1.0/+esm';
const GROUP_TOKEN = { weather: '--prp-cat-1', stations: '--prp-cat-2', amateur: '--prp-cat-3' };

export function create(ctx, panel) {
  const $ = s => panel.querySelector(s);
  const S = ctx.settings;
  const minEl = $('#sat-minel'), hours = $('#sat-hours'), simple = $('#sat-simple'), status = $('#sat-status'), tbody = $('#sat-table tbody');
  minEl.value = String(S.satMinEl); hours.value = String(S.satHours); simple.checked = S.satSimple !== false;
  let sat = null, data = new Map(), sats = [], passes = [], selected = null, timer = null, alive = false, computedAt = 0, loadedAt = null;

  const groupsOn = () => new Set(S.satGroups?.length ? S.satGroups : ['weather', 'stations', 'amateur']);
  const renderChips = () => {
    const on = groupsOn();
    $('#sat-groups').innerHTML = SAT_GROUPS.map(g => `<button type="button" class="prp-chip${on.has(g.id) ? ' on' : ''}" data-g="${g.id}" aria-pressed="${on.has(g.id)}">${esc(g.label)}<span class="n">${data.get(g.id) ? fmt(data.get(g.id).length) : ''}</span></button>`).join('');
  };
  renderChips();
  $('#sat-groups').addEventListener('click', e => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    const on = groupsOn();
    if (on.has(b.dataset.g) && on.size > 1) on.delete(b.dataset.g); else on.add(b.dataset.g);
    ctx.save({ satGroups: [...on] }); renderChips(); compute();
  });
  minEl.addEventListener('change', () => { ctx.save({ satMinEl: +minEl.value }); compute(); });
  hours.addEventListener('change', () => { ctx.save({ satHours: +hours.value }); compute(); });
  simple.addEventListener('change', () => { ctx.save({ satSimple: simple.checked }); compute(); });
  tbody.addEventListener('click', e => { const tr = e.target.closest('tr[data-row]'); if (tr && !e.target.closest('a')) choose(tr.dataset.row); });
  tbody.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const tr = e.target.closest('tr[data-row]'); if (tr) { e.preventDefault(); choose(tr.dataset.row); } });
  ctx.on('loc', () => { if (sat) compute(); });
  window.addEventListener('prp:themechange', () => { if (alive) drawSky(); });
  legend($('#sky-legend'), [
    ...SAT_GROUPS.map(g => ({ label: g.label, token: GROUP_TOKEN[g.id], shape: 'dot' })),
    { label: 'Rises', token: '--prp-text-2', shape: 'hollow' }, { label: 'Sets', token: '--prp-text-2', shape: 'dot' },
  ]);

  async function load() {
    status.textContent = 'Loading orbits…';
    try {
      sat = sat || await import(SATJS);
    } catch (e) {
      emptyRow(tbody, 6, `The orbit library (satellite.js) could not be loaded: ${esc(e.message)}.`);
      status.textContent = 'satellite.js failed to load'; return false;
    }
    const want = SAT_GROUPS.filter(g => !data.has(g.id));
    const results = await Promise.allSettled(want.map(g => loadGp(g.celestrak)));
    let err = null;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') { data.set(want[i].id, r.value.data); loadedAt = Math.min(loadedAt ?? r.value.at, r.value.at); }
      else err = r.reason;
    });
    renderChips();
    if (!data.size) {
      ctx.setStatus('celestrak', 'bad', explainError(err));
      emptyRow(tbody, 6, `Orbital elements could not be downloaded from CelesTrak: ${esc(explainError(err))}.`);
      status.textContent = 'No orbital data'; return false;
    }
    ctx.setStatus('celestrak', err ? 'warn' : 'ok', `${[...data.values()].reduce((n, a) => n + a.length, 0)} satellites in ${data.size} groups; elements ${ago(Date.now() - loadedAt)}.`);
    return true;
  }

  function compute() {
    if (!sat || !data.size) return;
    const t0 = performance.now();
    const on = groupsOn(), seen = new Set(), obs = { lat: ctx.loc.lat, lon: ctx.loc.lon, heightKm: 0.05 };
    sats = [];
    for (const g of SAT_GROUPS) {
      if (!on.has(g.id)) continue;
      for (const omm of data.get(g.id) || []) {
        if (seen.has(omm.NORAD_CAT_ID)) continue;
        seen.add(omm.NORAD_CAT_ID);
        const meta = satMeta(omm.OBJECT_NAME);
        if (meta?.silent) continue;
        if (simple.checked && !meta?.simple) continue;
        if (!simple.checked && g.id === 'stations' && !meta) continue; // modules and visiting craft add nothing to listen to
        let rec;
        try { rec = satrecFromOmm(sat, omm); } catch { continue; }
        const look = makeLookAt(sat, rec, obs);
        sats.push({ norad: omm.NORAD_CAT_ID, name: omm.OBJECT_NAME, group: g.id, meta, look, cls: orbitClass(omm), epoch: omm.EPOCH });
      }
    }
    const start = Date.now();
    passes = [];
    for (const s of sats.filter(x => x.cls === 'leo' || x.cls === 'meo' || x.cls === 'heo')) {
      for (const p of findPasses(s.look, { start, hours: +hours.value, minEl: +minEl.value, stepSec: s.cls === 'leo' ? 60 : 180 })) passes.push({ ...p, s, id: `${s.norad}-${p.aos}` });
    }
    passes.sort((a, b) => a.aos - b.aos);
    computedAt = Date.now();
    if (!selected || !passes.some(p => p.id === selected)) {
      const want = ctx.param('sat');
      selected = (want && passes.find(p => String(p.s.norad) === want)?.id) || passes.find(p => p.los > Date.now())?.id || null;
    }
    renderTable();
    renderGeo();
    drawSky();
    status.textContent = `${fmt(sats.length)} satellites · ${fmt(passes.length)} passes · computed in ${fmt(performance.now() - t0)} ms`;
  }

  function renderTable() {
    $('#sat-count').textContent = `${fmt(Math.min(passes.length, 80))} of ${fmt(passes.length)}`;
    if (!passes.length) { emptyRow(tbody, 6, 'No passes match. Lower the minimum elevation, widen the window or include more satellites.'); return; }
    const now = Date.now();
    tbody.innerHTML = passes.slice(0, 80).map(p => {
      const m = p.s.meta, live = p.aos <= now && p.los > now;
      const label = m?.label || p.s.name;
      const day = dayLabel(new Date(p.aos));
      return `<tr data-row="${p.id}" tabindex="0" class="${p.id === selected ? 'sel' : ''}">
        <td><span class="sat-name">${esc(label)}</span>${live ? ' <span class="now-tag">Overhead now</span>' : ''}<span class="sat-sub">${esc(SAT_GROUPS.find(g => g.id === p.s.group)?.label || '')} · <a href="${LINKS.satnogs(p.s.norad)}" target="_blank" rel="noopener">${p.s.norad}</a></span></td>
        <td><span class="when">${hhmm(new Date(p.aos))}<small>${esc(day)} · ${compass(p.aosAz, 8)}</small></span></td>
        <td class="num"><span class="when">${fmt(p.maxEl)}°<span class="el-bar" aria-hidden="true"><i style="width:${Math.round(p.maxEl / 90 * 100)}%"></i></span><small>${hhmm(new Date(p.tca))}</small></span></td>
        <td><span class="when">${hhmm(new Date(p.los))}<small>${duration(p.duration)}</small></span></td>
        <td>${compass(p.aosAz, 8)} → ${compass(p.losAz, 8)}</td>
        <td class="dl">${m ? `${esc(m.downlink)}<small>${esc(m.antenna || '')}</small>` : '<span class="muted">Check SatNOGS for transmitters and status</span>'}</td></tr>`;
    }).join('');
  }
  function renderGeo() {
    const now = Date.now();
    const geo = sats.filter(s => s.cls === 'geo').map(s => ({ s, p: s.look(now) })).filter(x => x.p.el > 0).sort((a, b) => b.p.el - a.p.el);
    $('#geo-panel').hidden = !geo.length;
    $('#geo-table tbody').innerHTML = geo.map(({ s, p }) => `<tr><td><span class="sat-name">${esc(s.meta?.label || s.name)}</span><span class="sat-sub">${s.norad}</span></td>
      <td class="num">${fmt(p.az, 1)}° <span class="muted">${compass(p.az)}</span></td><td class="num">${fmt(p.el, 1)}°</td>
      <td class="dl">${s.meta ? `${esc(s.meta.downlink)}<small>${esc([s.meta.antenna, s.meta.note].filter(Boolean).join(' · '))}</small>` : '<span class="muted">No amateur reception route listed</span>'}</td></tr>`).join('');
  }
  function drawSky() {
    const host = $('#sky');
    if (!host || panel.hidden) return;
    const p = passes.find(x => x.id === selected);
    const now = Date.now();
    const dots = sats.filter(s => s.cls !== 'geo').map(s => ({ s, q: s.look(now) })).filter(x => x.q.el > 0).map(({ s, q }) => ({
      az: q.az, el: q.el, token: GROUP_TOKEN[s.group], label: (s.meta?.label || s.name).replace(/ \(.*\)$/, '').slice(0, 14),
      title: `${s.meta?.label || s.name}: ${fmt(q.el)}° up, ${compass(q.az)}`, tip: `<b>${esc(s.meta?.label || s.name)}</b><span>${fmt(q.el)}° elevation · ${fmt(q.az)}° ${compass(q.az)}</span>`,
    }));
    const tracks = p ? [{ token: GROUP_TOKEN[p.s.group], points: passTrack(p.s.look, p), start: hhmm(new Date(p.aos)), end: hhmm(new Date(p.los)), peak: { az: p.tcaAz, el: p.maxEl } }] : [];
    skyPlot(host, { tracks, dots, label: p ? `Sky track of ${p.s.meta?.label || p.s.name}` : 'Sky plot' });
    $('#sky-title').textContent = p ? `${p.s.meta?.label || p.s.name}, ${dayLabel(new Date(p.aos)).toLowerCase()} ${hhmm(new Date(p.aos))}` : 'Sky plot';
    $('#sky-sub').textContent = p ? `highest ${fmt(p.maxEl)}° at ${hhmm(new Date(p.tca))}` : '';
  }
  function choose(id) {
    selected = id;
    const p = passes.find(x => x.id === id);
    if (p) ctx.setParam('sat', p.s.norad);
    renderTable(); drawSky();
  }
  const loop = () => {
    clearTimeout(timer);
    if (!alive) return;
    if (Date.now() - computedAt > 5 * 60e3) compute(); else { drawSky(); renderGeo(); }
    timer = setTimeout(loop, 10000);
  };

  return {
    async show() {
      alive = true;
      if (!sat || !data.size) { if (!(await load())) return; compute(); }
      loop();
    },
    hide() { alive = false; clearTimeout(timer); },
    pause() { clearTimeout(timer); },
    resume() { if (alive) loop(); },
  };
}
