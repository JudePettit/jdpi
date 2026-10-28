// SIGINT Dashboard · Space weather: NOAA SWPC indices (scales, Kp, GOES X-rays, real-time solar wind, alerts) and
// WSPR spots near the user from wspr.live, with a plain reading of what they mean for HF radio, GNSS and VHF.
import { esc, fmt, fetchJSON, explainError, hhmm } from '../lib/util.js';
import { normaliseKp, latestKp1m, kpToG, kpWord, normaliseXray, xrayClass, normaliseWind, normaliseMag, normaliseScales, normaliseAlerts, wsprQuery, normaliseWspr, downsample } from '../lib/feeds.js';
import { SWPC, wsprUrl } from '../lib/sources.js';
import { lineChart, barChart, fmtDayClock } from '../lib/charts.js';
import { kpis, legend } from './ui.js';

const STATUS = [
  { max: 4, token: '--prp-status-good', word: 'Quiet or unsettled (Kp below 4)' },
  { max: 5, token: '--prp-status-warning', word: 'Active (Kp 4)' },
  { max: 7, token: '--prp-status-serious', word: 'Storm G1–G2 (Kp 5–6)' },
  { max: 10, token: '--prp-status-critical', word: 'Strong storm G3+ (Kp 7–9)' },
];
const kpToken = kp => STATUS.find(s => kp < s.max)?.token || STATUS[3].token;
const scaleToken = n => (!n ? '--prp-status-good' : n <= 2 ? '--prp-status-warning' : n === 3 ? '--prp-status-serious' : '--prp-status-critical');
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const pow10 = v => `10${String(Math.round(Math.log10(v))).split('').map(c => SUP[c]).join('')}`;
const sci = v => { const e = Math.floor(Math.log10(v)); return `${(v / 10 ** e).toFixed(1)}×10${String(e).split('').map(c => SUP[c]).join('')}`; };

export function create(ctx, panel) {
  const $ = s => panel.querySelector(s);
  let d = {}, timer = null, alive = false, fetchedAt = 0, wsprAt = 0;
  legend($('#kp-legend'), [...STATUS.map(s => ({ label: s.word, token: s.token })), { label: 'Paler bars: forecast', token: '--prp-line-strong' }]);

  async function load() {
    $('#sw-status').textContent = 'Updating…';
    const get = (p, t = 15000) => fetchJSON(`${SWPC}${p}`, { timeout: t, cache: 'no-store' });
    const keys = { kpf: '/products/noaa-planetary-k-index-forecast.json', kp1m: '/json/planetary_k_index_1m.json', xray: '/json/goes/primary/xrays-1-day.json',
      wind: '/json/rtsw/rtsw_wind_1m.json', mag: '/json/rtsw/rtsw_mag_1m.json', scales: '/products/noaa-scales.json', alerts: '/products/alerts.json', f107: '/json/f107_cm_flux.json' };
    const res = await Promise.allSettled(Object.values(keys).map(p => get(p, 25000)));
    const raw = Object.fromEntries(Object.keys(keys).map((k, i) => [k, res[i].status === 'fulfilled' ? res[i].value : null]));
    let kp = normaliseKp(raw.kpf);
    if (!kp.length) { try { kp = normaliseKp(await get('/products/noaa-planetary-k-index.json')); } catch { /* keep empty */ } }
    d = {
      kp, kp1m: latestKp1m(raw.kp1m), xray: normaliseXray(raw.xray), wind: normaliseWind(raw.wind), mag: normaliseMag(raw.mag),
      scales: normaliseScales(raw.scales), alerts: normaliseAlerts(raw.alerts, 10),
      f107: Array.isArray(raw.f107) ? raw.f107.map(r => Number(r.flux)).find(Number.isFinite) : null,
    };
    const failed = res.filter(r => r.status === 'rejected').length;
    fetchedAt = Date.now();
    ctx.setStatus('swpc', failed === res.length ? 'bad' : failed ? 'warn' : 'ok', failed === res.length ? explainError(res[0].reason) : `${res.length - failed} of ${res.length} products${failed ? '; some failed' : ''}. Kp ${d.kp1m ? fmt(d.kp1m.kp, 2) : '–'}, X-rays ${d.xray.length ? xrayClass(d.xray.at(-1).flux) : '–'}.`);
    $('#sw-status').textContent = failed === res.length ? `Not updated: ${explainError(res[0].reason)}` : `Updated ${hhmm(new Date())}${failed ? ` · ${failed} products unavailable` : ''}`;
    render();
  }

  function render() {
    if (panel.hidden) return;
    const sc = d.scales, kpNow = d.kp1m?.kp ?? d.kp.filter(k => k.kind !== 'predicted').at(-1)?.kp;
    const xr = d.xray, xNow = xr.at(-1)?.flux, xMax = xr.reduce((m, r) => Math.max(m, r.flux), 0);
    const w = d.wind.at(-1), m = d.mag.at(-1);
    kpis($('#sw-kpis'), [
      { label: 'Radio blackouts', value: sc ? (sc.R.scale ? `R${sc.R.scale} ${sc.R.text}` : 'None') : '–', sub: sc?.days?.[0] ? `Today: M-flare ${sc.days[0].rMinor ?? '–'}%, X ${sc.days[0].rMajor ?? '–'}%` : '', word: !!sc, wordToken: scaleToken(sc?.R.scale) },
      { label: 'Radiation storms', value: sc ? (sc.S.scale ? `S${sc.S.scale} ${sc.S.text}` : 'None') : '–', sub: sc?.days?.[0] ? `Today: ${sc.days[0].sProb ?? '–'}% chance of S1+` : '', word: !!sc, wordToken: scaleToken(sc?.S.scale) },
      { label: 'Geomagnetic storms', value: sc ? (sc.G.scale ? `G${sc.G.scale} ${sc.G.text}` : 'None') : '–', sub: sc?.days?.length ? `Next days: ${sc.days.map(x => `G${x.g ?? 0}`).join(', ')}` : '', word: !!sc, wordToken: scaleToken(sc?.G.scale) },
      { label: 'Kp now', value: kpNow != null ? fmt(kpNow, 2) : '–', sub: kpWord(kpNow), word: kpNow != null, wordToken: kpToken(kpNow ?? 0) },
      { label: 'X-rays now', value: xNow ? xrayClass(xNow) : '–', sub: xMax ? `24 h peak ${xrayClass(xMax)}` : '' },
      { label: 'Solar wind', value: w ? `${fmt(w.speed)} km/s` : '–', sub: m ? `Bz ${fmt(m.bz, 1)} nT · Bt ${fmt(m.bt, 1)} nT` : '' },
      { label: 'Solar flux F10.7', value: d.f107 ? `${fmt(d.f107)} sfu` : '–', sub: 'Higher means better upper HF bands' },
    ]);
    meanings(kpNow, xNow, sc);
    charts();
    alerts();
  }

  function meanings(kp, x, sc) {
    const k = kp ?? 0, r = sc?.R.scale ?? 0, s = sc?.S.scale ?? 0, g = Math.max(sc?.G.scale ?? 0, kpToG(k)), f = d.f107 ?? 0;
    const hf = r >= 1 || (x ?? 0) >= 1e-5
      ? ['warn', 'HF fade-outs on the sunlit side', 'An M- or X-class flare is under way or recent: bands below about 10 MHz are absorbed first and worst, for minutes to an hour per flare. Paths in darkness are unaffected.']
      : k >= 5 ? ['warn', 'Disturbed', 'A geomagnetic storm absorbs and distorts high-latitude and polar paths; the usable frequencies usually fall for a day or two afterwards. Low-latitude and north–south paths hold up best.']
        : k >= 4 ? ['warn', 'Unsettled', 'Polar paths may flutter; mid-latitude contacts are mostly normal.']
          : ['good', 'Normal', `Quiet geomagnetic field. With solar flux at ${f ? fmt(f) : '–'}, ${f >= 130 ? 'the upper bands (15–10 m) should open in daylight' : f >= 90 ? 'the upper bands open only on good days; 20 m carries most daytime long distance' : '40 and 20 m carry most long-distance traffic; 15–10 m are mostly quiet'}. A rule of thumb, not a forecast.`];
    const gnss = g >= 3 ? ['bad', 'Possible degradation', 'A strong geomagnetic storm: larger ionospheric errors and scintillation, especially at high latitudes; augmentation (EGNOS, WAAS) may drop out and single-frequency receivers may lose accuracy or lock.']
      : g >= 1 ? ['warn', 'Minor effects', 'Storm-time ionospheric errors grow at high latitudes; single-frequency receivers may wander a few metres more than usual.']
        : s >= 1 ? ['warn', 'Radiation storm', 'High-energy protons can upset satellites and absorb HF over the poles. Navigation accuracy is usually unaffected at mid-latitudes.']
          : ['good', 'No effect expected', 'Space weather is not degrading satellite navigation. Local jamming and spoofing are a separate problem: see GNSS interference.'];
    const vhf = k >= 6 ? ['warn', 'Aurora likely', 'Aurora may be seen at mid-latitudes, and auroral propagation (rough, buzzing signals beamed north) can open 6 m and 2 m for northern stations.']
      : k >= 5 ? ['warn', 'Aurora possible', 'Aurora is possible at high latitudes and occasionally further south; watch 6 m for auroral openings.']
        : ['good', 'No aurora expected', 'VHF openings now come from sporadic E (mostly May to August) and tropospheric ducting under high pressure, not from space weather.'];
    const tok = c => (c === 'good' ? '--prp-status-good' : c === 'warn' ? '--prp-status-warning' : '--prp-status-critical');
    $('#sw-means').innerHTML = [['HF radio', hf], ['GNSS and satellites', gnss], ['VHF and aurora', vhf]].map(([h, [c, word, text]]) =>
      `<div><h3>${esc(h)} <span class="state" style="--s:var(${tok(c)})">${esc(word)}</span></h3><p>${esc(text)}</p></div>`).join('');
  }

  function charts() {
    const now = Date.now();
    barChart($('#ch-kp'), {
      bars: d.kp.map(k => ({ t: k.t, v: k.kp, token: kpToken(k.kp), kind: k.kind })), slotMs: 3 * 3600e3, now,
      y: { min: 0, max: 9, ticks: [0, 3, 5, 7, 9] }, label: 'Planetary K index, three-hourly, with forecast',
      tooltip: b => `<b>Kp ${fmt(b.v, 2)} · ${esc(kpWord(b.v))}</b><span>${esc(fmtDayClock(b.t))}–${hhmm(new Date(b.t + 3 * 3600e3))} · ${esc(b.kind)}</span>`,
    });
    const xs = downsample(d.xray.map(r => ({ t: r.t, v: r.flux })), 700);
    lineChart($('#ch-xray'), {
      series: [{ label: 'X-ray flux', token: '--prp-cat-2', points: xs }], y: { log: true, min: 1e-9, max: 1e-3, ticks: [1e-8, 1e-7, 1e-6, 1e-5, 1e-4], format: pow10 },
      refs: [{ v: 1e-8, label: 'A' }, { v: 1e-7, label: 'B' }, { v: 1e-6, label: 'C' }, { v: 1e-5, label: 'M' }, { v: 1e-4, label: 'X' }], endLabel: false,
      label: 'GOES long-channel X-ray flux, last 24 hours, logarithmic',
      tooltip: (t, rows) => rows[0].v == null ? '<b>–</b>' : `<b>${esc(xrayClass(rows[0].v))}</b><span>${esc(sci(rows[0].v))} W/m² · ${esc(fmtDayClock(rows[0].t))}</span>`,
    });
    lineChart($('#ch-wind'), {
      series: [{ label: 'Solar wind speed', token: '--prp-cat-1', points: downsample(d.wind.map(r => ({ t: r.t, v: r.speed })), 700) }],
      y: { padTo: [250, 600], format: v => fmt(v) }, label: 'Solar wind speed, last 24 hours',
      tooltip: (t, rows) => rows[0].v == null ? '<b>–</b>' : `<b>${fmt(rows[0].v)} km/s</b><span>${esc(fmtDayClock(rows[0].t))}</span>`,
    });
    lineChart($('#ch-bz'), {
      series: [{ label: 'Bz', token: '--prp-cat-7', points: downsample(d.mag.map(r => ({ t: r.t, v: r.bz })), 700) }],
      y: { padTo: [-10, 10], format: v => fmt(v) }, refs: [{ v: 0, label: '0' }], endLabel: false, label: 'Interplanetary magnetic field Bz, last 24 hours',
      tooltip: (t, rows) => rows[0].v == null ? '<b>–</b>' : `<b>${fmt(rows[0].v, 1)} nT</b><span>${rows[0].v < -5 ? 'Southward: storm-favourable · ' : rows[0].v < 0 ? 'Southward · ' : 'Northward · '}${esc(fmtDayClock(rows[0].t))}</span>`,
    });
    tables();
  }
  function hourly(rows, f) {
    const by = new Map();
    for (const r of rows) { const h = Math.floor(r.t / 3600e3) * 3600e3; if (!by.has(h)) by.set(h, []); by.get(h).push(r); }
    return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([h, list]) => ({ h, ...f(list) }));
  }
  const table = (head, rows) => `<table class="prp-table"><thead><tr>${head.map((h, i) => `<th scope="col"${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  function tables() {
    $('#tb-kp').innerHTML = table(['Three hours from', 'Kp', 'Level', 'Kind'], [...d.kp].reverse().map(k => [fmtDayClock(k.t), fmt(k.kp, 2), kpWord(k.kp), k.kind]));
    $('#tb-xray').innerHTML = table(['Hour', 'Peak class', 'Peak W/m²'], hourly(d.xray, l => { const mx = Math.max(...l.map(r => r.flux)); return { mx }; }).map(r => [fmtDayClock(r.h), xrayClass(r.mx), sci(r.mx)]));
    $('#tb-wind').innerHTML = table(['Hour', 'Mean km/s', 'Max km/s'], hourly(d.wind, l => ({ mean: l.reduce((a, r) => a + r.speed, 0) / l.length, mx: Math.max(...l.map(r => r.speed)) })).map(r => [fmtDayClock(r.h), fmt(r.mean), fmt(r.mx)]));
    $('#tb-bz').innerHTML = table(['Hour', 'Mean Bz nT', 'Lowest Bz nT'], hourly(d.mag, l => ({ mean: l.reduce((a, r) => a + r.bz, 0) / l.length, mn: Math.min(...l.map(r => r.bz)) })).map(r => [fmtDayClock(r.h), fmt(r.mean, 1), fmt(r.mn, 1)]));
  }
  function alerts() {
    $('#sw-alerts').innerHTML = d.alerts.length ? d.alerts.map(a => `<details><summary><span class="t">${esc(fmtDayClock(a.issued))}</span><span class="h">${esc(a.title)}</span></summary><pre>${esc(a.text)}</pre></details>`).join('') : '<p class="prp-empty">No alerts in the feed.</p>';
  }

  async function loadWspr() {
    const { lat, lon } = ctx.loc;
    const tbody = $('#wspr-table tbody');
    try {
      const rows = normaliseWspr(await fetchJSON(wsprUrl(wsprQuery(lat, lon, { minutes: 60, boxDeg: 4 })), { timeout: 20000 }));
      wsprAt = Date.now();
      const max = Math.max(1, ...rows.map(r => r.spots));
      $('#wspr-sub').textContent = `WSPR spots · last hour · updated ${hhmm(new Date())}`;
      tbody.innerHTML = rows.length ? rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num">${fmt(r.spots)}</td><td class="num">${fmt(r.transmitters)}</td><td class="num">${fmt(r.maxKm)}</td><td class="num">${r.snr == null ? '–' : fmt(r.snr)}</td>
        <td><span class="bar-cell" title="${fmt(r.spots)} spots"><i style="width:${(r.spots / max * 100).toFixed(1)}%"></i></span></td></tr>`).join('')
        : '<tr><td colspan="6" class="prp-empty">No WSPR receivers near you reported spots in the last hour.</td></tr>';
      ctx.setStatus('wspr', 'ok', `${rows.reduce((n, r) => n + r.spots, 0)} spots near you in the last hour, on ${rows.length} bands.`);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="prp-empty">wspr.live didn’t answer: ${esc(explainError(e))}.</td></tr>`;
      ctx.setStatus('wspr', 'bad', explainError(e));
    }
  }

  const loop = () => {
    clearTimeout(timer);
    if (!alive) return;
    if (Date.now() - fetchedAt > 5 * 60e3) load().catch(e => { $('#sw-status').textContent = explainError(e); }); else render();
    if (Date.now() - wsprAt > 10 * 60e3) loadWspr();
    timer = setTimeout(loop, 60e3);
  };
  window.addEventListener('prp:themechange', () => { if (alive && fetchedAt) charts(); });
  let rz = 0;
  new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (alive && fetchedAt) charts(); }); }).observe($('.chart-grid'));
  ctx.on('loc', () => { wsprAt = 0; if (alive) loadWspr(); });

  return {
    show() { alive = true; loop(); },
    hide() { alive = false; clearTimeout(timer); },
    pause() { clearTimeout(timer); },
    resume() { if (alive) loop(); },
  };
}
