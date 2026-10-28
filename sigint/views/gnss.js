// SIGINT Dashboard · GNSS: interference maps (linked) and a USB GNSS receiver read over Web Serial (NMEA 0183), with
// per-satellite C/N0, a sky plot and the strongest-four average as a simple interference indicator. A generated sample
// (clearly labelled) shows the view without hardware, including a simulated jamming episode.
import { esc, fmt, isoDay, hhmmss } from '../lib/util.js';
import { fmtLatLon } from '../lib/geo.js';
import { parseSentence, createGnssState, updateGnss, pruneGnss, gnssSummary, interferenceHint, lineSplitter, CONSTELLATIONS } from '../lib/nmea.js';
import { LINKS } from '../lib/catalog.js';
import { skyPlot, snrBars, lineChart } from '../lib/charts.js';
import { kpis, legend } from './ui.js';

const ORDER = Object.fromEntries(CONSTELLATIONS.map((c, i) => [c.id, i]));
const TOKEN = Object.fromEntries(CONSTELLATIONS.map(c => [c.id, c.token]));

export function create(ctx, panel) {
  const $ = s => panel.querySelector(s);
  const S = ctx.settings;
  const baud = $('#gn-baud'), connectBtn = $('#gn-connect'), sampleBtn = $('#gn-sample'), stopBtn = $('#gn-stop'), hide = $('#gn-hide'), state = $('#gn-state');
  baud.value = String(S.gnssBaud); hide.checked = S.gnssRound !== false;
  let st = createGnssState(), raw = [], history = [], port = null, reader = null, sample = null, drawPending = false, alive = false, source = '', lastHist = 0;

  const yesterday = isoDay(new Date(Date.now() - 864e5));
  const setLinks = () => { $('#gpsjam-link').href = LINKS.gpsjam(ctx.loc.lat, ctx.loc.lon, yesterday); };
  setLinks();
  ctx.on('loc', setLinks);
  baud.addEventListener('change', () => ctx.save({ gnssBaud: +baud.value }));
  hide.addEventListener('change', () => { ctx.save({ gnssRound: hide.checked }); draw(); });

  const supported = 'serial' in navigator;
  $('#gn-support').textContent = supported
    ? 'Uses Web Serial: the browser asks you to pick the port, and nothing is sent to the receiver. The position stays on this page.'
    : 'Web Serial isn’t available in this browser (it needs Chrome, Edge or Opera on a desktop computer). The sample still plays.';
  connectBtn.disabled = !supported;
  if (!supported) ctx.setStatus('rx-gnss', 'na', 'Web Serial needs Chrome, Edge or Opera on a desktop.');
  const setState = (cls, word) => { state.className = `prp-status ${cls}`; state.textContent = word; };

  function reset(src) {
    st = createGnssState(); raw = []; history = []; source = src; lastHist = 0;
    stopBtn.disabled = false; connectBtn.disabled = true; sampleBtn.disabled = true;
  }
  function feed(line, now = Date.now()) {
    raw.push(line); if (raw.length > 30) raw.shift();
    updateGnss(st, parseSentence(line), now);
    if (now - lastHist >= 1000) {
      lastHist = now;
      pruneGnss(st, now);
      const s = gnssSummary(st);
      history.push({ t: now, v: s.cn0Top4 });
      if (history.length > 900) history.shift();
    }
    if (!drawPending) { drawPending = true; setTimeout(() => { drawPending = false; draw(); }, 250); }
  }

  connectBtn.addEventListener('click', async () => {
    try {
      port = await navigator.serial.requestPort({});
      await port.open({ baudRate: +baud.value });
    } catch (e) {
      setState('bad', e.name === 'NotFoundError' ? 'No port chosen' : 'Could not open');
      if (e.name !== 'NotFoundError') $('#gn-hint').textContent = `The port could not be opened (${e.message}). Close other programs using it (u-center, GPSD, a map app) and try again.`;
      port = null; return;
    }
    reset('usb');
    setState('good', `Connected at ${baud.value} baud`);
    ctx.setStatus('rx-gnss', 'ok', `Reading NMEA at ${baud.value} baud.`);
    const split = lineSplitter();
    try {
      reader = port.readable.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const line of split(value)) feed(line);
      }
    } catch (e) {
      setState('bad', 'Disconnected');
      ctx.setStatus('rx-gnss', 'bad', `Lost the receiver: ${e.message}`);
    } finally { await stop(); }
  });
  sampleBtn.addEventListener('click', () => {
    reset('sample');
    setState('warn', 'Sample recording');
    const gen = sampleGenerator();
    sample = setInterval(() => { for (const l of gen(Date.now())) feed(l); }, 1000);
    for (const l of gen(Date.now())) feed(l);
  });
  stopBtn.addEventListener('click', () => stop());
  async function stop() {
    if (sample) { clearInterval(sample); sample = null; }
    try { await reader?.cancel(); } catch { /* already closed */ }
    try { reader?.releaseLock(); } catch { /* ignore */ }
    try { await port?.close(); } catch { /* ignore */ }
    reader = null; port = null;
    stopBtn.disabled = true; connectBtn.disabled = !supported; sampleBtn.disabled = false;
    if (source === 'usb') { setState('', 'Not connected'); ctx.setStatus('rx-gnss', 'idle', 'Disconnected.'); }
    if (source === 'sample') setState('', 'Sample stopped');
  }

  function draw() {
    if (panel.hidden) return;
    const s = gnssSummary(st);
    const pos = st.lat == null ? '–' : hide.checked ? fmtLatLon(st.lat, st.lon, 2) : fmtLatLon(st.lat, st.lon, 5);
    kpis($('#gn-kpis'), [
      st.sentences ? { label: 'Fix', value: s.fix, sub: s.quality, word: true, wordToken: s.hasFix ? '--prp-status-good' : '--prp-status-critical' } : { label: 'Fix', value: '–', sub: 'no receiver yet' },
      { label: 'Satellites', value: `${s.used} / ${s.inView}`, sub: 'used / in view' },
      { label: 'Top-4 C/N0', value: s.cn0Top4 == null ? '–' : `${fmt(s.cn0Top4, 1)}`, sub: 'dB-Hz' },
      { label: 'HDOP', value: s.hdop == null ? '–' : fmt(s.hdop, 1), sub: s.pdop != null ? `PDOP ${fmt(s.pdop, 1)} · VDOP ${fmt(s.vdop, 1)}` : '' },
      { label: 'Position', value: pos, small: true, sub: st.alt != null ? `${fmt(st.alt, 0)} m above sea level` : '' },
      { label: 'Time (UTC)', value: st.timeUtc || '–', small: true, sub: st.sogKn != null ? `${fmt(st.sogKn * 1.852, 1)} km/h${st.cog != null ? ` · ${fmt(st.cog)}°` : ''}` : (st.antenna ? `Antenna ${st.antenna}` : '') },
    ]);
    const h = interferenceHint(s);
    const hint = $('#gn-hint');
    hint.className = `prp-note${h.level === 'bad' ? ' bad' : h.level === 'warn' ? ' warn' : ''}`;
    hint.textContent = (source === 'sample' ? 'Sample recording (generated, near Greenwich): ' : '') + h.text + (st.fixLosses ? ` Fix lost ${st.fixLosses} time${st.fixLosses === 1 ? '' : 's'} this session.` : '') + (st.antenna && st.antenna !== 'OK' ? ` The receiver reports its antenna as ${st.antenna}.` : '');
    const sats = [...st.sats.values()].sort((a, b) => (ORDER[a.sys] - ORDER[b.sys]) || a.prn - b.prn);
    snrBars($('#gn-snr'), { rows: sats.map(x => ({ label: `${x.sys === 'GLONASS' ? 'GLO' : x.sys === 'Galileo' ? 'GAL' : x.sys === 'BeiDou' ? 'BDS' : x.sys.slice(0, 4)} ${x.prn}`, v: x.snr, token: TOKEN[x.sys] || '--prp-faint', hollow: !x.used, title: `${x.sys} ${x.prn}: ${x.snr ?? '–'} dB-Hz, elevation ${x.el ?? '–'}°, ${x.used ? 'used in the fix' : 'tracked, not used'}` })) });
    const present = CONSTELLATIONS.filter(c => sats.some(x => x.sys === c.id));
    legend($('#gn-legend'), [...present.map(c => ({ label: c.label, token: c.token })), { label: 'Hollow: not used in the fix', token: '--prp-text-2', shape: 'hollow' }]);
    skyPlot($('#gn-sky'), { dots: sats.filter(x => x.el != null && x.az != null).map(x => ({ az: x.az, el: x.el, token: TOKEN[x.sys] || '--prp-faint', hollow: !x.used, label: String(x.prn), title: `${x.sys} ${x.prn}`, tip: `<b>${esc(x.sys)} ${x.prn}</b><span>${x.snr ?? '–'} dB-Hz · elevation ${x.el}° · azimuth ${x.az}°</span>` })), label: 'Satellites in view', size: 300 });
    lineChart($('#gn-trend'), { series: [{ label: 'Top-4 C/N0', token: '--prp-cat-1', points: history.filter(p => p.v != null) }], y: { min: 0, max: 55, ticks: [0, 15, 30, 45] }, height: 170, x: { format: t => hhmmss(new Date(t)).slice(0, 5) }, gapMs: 5000, label: 'Average C/N0 of the four strongest satellites', tooltip: (t, r) => `<b>${r[0].v == null ? '–' : fmt(r[0].v, 1) + ' dB-Hz'}</b><span>${hhmmss(new Date(t))}</span>` });
    $('#gn-raw').firstElementChild.textContent = raw.join('\n');
    if (source === 'usb') ctx.setStatus('rx-gnss', 'ok', `${s.fix} · ${s.used}/${s.inView} satellites · top-4 ${s.cn0Top4 == null ? '–' : fmt(s.cn0Top4, 1)} dB-Hz.`);
  }
  window.addEventListener('prp:themechange', () => { if (alive) draw(); });

  return {
    show() { alive = true; draw(); },
    hide() { alive = false; },
  };
}

/* ---- Generated sample: NMEA 4.10 sentences with real checksums, near Greenwich, with a 15-second jamming episode ---- */
function cs(body) { let x = 0; for (let i = 0; i < body.length; i++) x ^= body.charCodeAt(i); return `$${body}*${x.toString(16).toUpperCase().padStart(2, '0')}`; }
function sampleGenerator() {
  const t0 = Date.now();
  const sats = [
    ...[[2, 64, 112], [5, 22, 310], [12, 48, 250], [13, 15, 45], [15, 71, 190], [18, 33, 80], [20, 9, 140], [25, 40, 290], [29, 27, 20]].map(([prn, el, az]) => ({ sys: 'GP', id: 1, prn, el, az })),
    ...[[66, 35, 60], [67, 58, 150], [76, 21, 260], [77, 44, 330]].map(([prn, el, az]) => ({ sys: 'GL', id: 2, prn, el, az })),
    ...[[4, 52, 200], [9, 30, 100], [11, 18, 300], [24, 61, 20], [36, 12, 230]].map(([prn, el, az]) => ({ sys: 'GA', id: 3, prn, el, az })),
    { sys: 'GP', id: 1, prn: 44, el: 26, az: 165 }, // EGNOS (SBAS PRN 123 in NMEA 4.0 numbering)
  ];
  const dm = (v, lat) => { const a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60; return `${String(d).padStart(lat ? 2 : 3, '0')}${m.toFixed(5).padStart(8, '0')},${lat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W')}`; };
  return now => {
    const s = (now - t0) / 1000, jam = s > 20 && s < 35;
    const d = new Date(now), hh = d.toISOString().slice(11, 19).replace(/:/g, '') + '.00', dd = d.toISOString().slice(8, 10) + d.toISOString().slice(5, 7) + d.toISOString().slice(2, 4);
    const lat = 51.4769 + Math.sin(s / 40) * 0.00002, lon = -0.0005 + Math.cos(s / 50) * 0.00002;
    const snr = x => Math.max(0, Math.round(22 + x.el * 0.38 + Math.sin(s / 7 + x.prn) * 2 - (jam ? 24 : 0)));
    const used = sats.filter(x => snr(x) >= 28 && x.el >= 12);
    const fix = !jam && used.length >= 4;
    const out = [];
    out.push(cs(`GNRMC,${hh},${fix ? 'A' : 'V'},${dm(lat, true)},${dm(lon, false)},0.02,,${dd},,,${fix ? 'A' : 'N'},V`));
    out.push(cs(`GNGGA,${hh},${dm(lat, true)},${dm(lon, false)},${fix ? 1 : 0},${String(fix ? used.length : 0).padStart(2, '0')},${fix ? '0.71' : ''},${fix ? '46.2' : ''},M,45.6,M,,`));
    for (const [talker, id] of [['GP', 1], ['GL', 2], ['GA', 3]]) {
      const ids = fix ? used.filter(x => x.id === id).map(x => String(x.prn).padStart(2, '0')).slice(0, 12) : [];
      out.push(cs(`GNGSA,A,${fix ? 3 : 1},${[...ids, ...Array(12 - ids.length).fill('')].join(',')},${fix ? '1.28,0.71,1.06' : '99.99,99.99,99.99'},${id}`));
      const list = sats.filter(x => x.sys === talker);
      const n = Math.ceil(list.length / 4);
      for (let i = 0; i < n; i++) {
        const chunk = list.slice(i * 4, i * 4 + 4).map(x => `${String(x.prn).padStart(2, '0')},${x.el},${String(x.az).padStart(3, '0')},${snr(x) || ''}`);
        out.push(cs(`${talker}GSV,${n},${i + 1},${String(list.length).padStart(2, '0')},${chunk.join(',')},1`));
      }
    }
    if (Math.floor(s) % 10 === 0) out.push(cs('GPTXT,01,01,02,ANTSTATUS=OK'));
    return out;
  };
}
