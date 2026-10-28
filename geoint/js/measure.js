// GEOINT & IMINT Dashboard · Measure & geolocate: distance, area, bearing and bearing-line tools on the WGS84 ellipsoid,
// elevation and hillshade from Terrain Tiles (Terrarium PNGs), elevation profile and line of sight, coordinates (DD, DMS,
// MGRS), a sun-and-shadow calculator (SunCalc 2.1.1) and chronolocation, plus street-level and 3D link-outs.
// URL keys: mb (base: map, imagery, s2), mh=1 (hillshade), mp (selected point "lat,lon").
import { esc, fmtNum, fmtDistance, fmtMiles, fmtNautical, fmtArea, fmtDay, isISODate, clamp, parseLatLon, fmtLatLon, addDays } from './util.js';
import {
  inverse, pathLength, polygonArea, destination, greatCircle, intersection, compass, normDeg, toDMS, toMGRS, parseCoordinates, tileOf,
  metersPerPixel, decodeTerrarium, hillshade, samplePath, lineOfSight, shadowLength, altitudeFromShadow, shadowBearing, sunAzimuthFromShadow,
  chronolocate, zonedToUtc, utcToZoned, fmtOffset, etcZoneForLon,
} from './geo.js';
import { terrariumUrl, mapillaryUrl, kartaviewUrl, streetViewUrl, peakvisorUrl, googleEarthUrl, osmUrl } from './sources.js';
import { createMap, syncToView, baseLayers, flyTo, cased } from './maps.js';

const TZ_URL = 'https://cdn.jsdelivr.net/npm/@photostructure/tz-lookup@11.7.0/tz.js';
const TZ_SRI = 'sha384-pcNp83JCLtH2AjMn2L88ZP852oNdQA2RNmIOWED8WgkU0Kr6rkTMXunp+nlDnWGn';
let SunCalc = null, tzPromise = null;
const loadSun = async () => (SunCalc ||= await import('suncalc'));
function loadTz() {
  tzPromise ||= new Promise(resolve => {
    if (typeof window.tzlookup === 'function') return resolve(window.tzlookup);
    const s = Object.assign(document.createElement('script'), { src: TZ_URL, integrity: TZ_SRI, crossOrigin: 'anonymous', async: true });
    s.onload = () => resolve(typeof window.tzlookup === 'function' ? window.tzlookup : null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return tzPromise;
}
const ZONES = (() => { let z = []; try { z = Intl.supportedValuesOf('timeZone'); } catch { /* old browser */ } return z.includes('UTC') ? z : ['UTC', ...z]; })();
const HINTS = {
  inspect: 'Click the map to read a point: coordinates, MGRS, elevation, and the sun and shadow directions there.',
  distance: 'Click to add points along a route; double-click, press Enter or Finish to end. Then draw its elevation profile.',
  area: 'Click the corners of the area; double-click, press Enter or Finish to close it.',
  bearing: 'Click the start, then the end: bearing, back bearing and distance.',
  line: 'Click a known landmark, then type the bearing it was seen on, or click a second point to set the direction.',
  shadow: 'Click the base of an upright object, then the tip of its shadow on level ground. Fills in the chronolocation form.',
};

export async function init(panel, ctx) {
  const $ = s => panel.querySelector(s);
  const s0 = ctx.state;
  const st = {
    tool: 'inspect', base: ['map', 'imagery', 's2'].includes(s0.mb) ? s0.mb : 'imagery', hill: s0.mh === '1',
    point: parseLatLon(s0.mp), pts: [], shape: null, lines: [], pendingOrigin: null, profile: null, elev: null,
    sun: { day: null, time: null, tz: null, tzManual: false, height: 10 },
    chrono: { dir: '', h: '', L: '', alt: '', tolAz: 4, tolAlt: 2, scope: 'day', results: null },
    lastBearing: 0,
  };

  /* ---------- map ---------- */
  const map = createMap($('#ms-map'), ctx, 'measure', { minZoom: 2, maxZoom: 19 });
  map.doubleClickZoom.disable();
  const base = baseLayers(map, { kind: st.base, labels: true });
  map.attributionControl.addAttribution('Elevation: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles</a>');
  const draft = L.layerGroup().addTo(map), shapes = L.layerGroup().addTo(map), linesLayer = L.layerGroup().addTo(map), sunLayer = L.layerGroup().addTo(map), pointLayer = L.layerGroup().addTo(map);
  let hillLayer = null;

  /* ---------- terrain: Terrarium tiles decoded in a canvas (CORS-enabled S3 bucket) ---------- */
  const tiles = new Map();
  function tilePixels({ z, x, y }) {
    const key = `${z}/${x}/${y}`;
    if (!tiles.has(key)) {
      if (tiles.size > 160) tiles.delete(tiles.keys().next().value);
      tiles.set(key, new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const c = document.createElement('canvas'); c.width = c.height = 256;
          const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
          resolve(g.getImageData(0, 0, 256, 256).data);
        };
        img.onerror = () => { tiles.delete(key); reject(new Error('Elevation tile unavailable')); };
        img.src = terrariumUrl({ z, x, y });
      }));
    }
    return tiles.get(key);
  }
  async function elevationAt(lat, lon, z = 14) {
    const t = tileOf(lat, lon, z), d = await tilePixels(t), i = (t.py * 256 + t.px) * 4;
    return decodeTerrarium(d[i], d[i + 1], d[i + 2]);
  }
  const Hill = L.GridLayer.extend({
    createTile(coords, done) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      tilePixels(coords).then(px => {
        const elev = new Float32Array(256 * 256);
        for (let i = 0; i < elev.length; i++) elev[i] = decodeTerrarium(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
        const n = 2 ** coords.z, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (coords.y + 0.5) / n))) * 180 / Math.PI;
        const shade = hillshade(elev, 256, 256, metersPerPixel(lat, coords.z), { zFactor: coords.z < 7 ? 4 : coords.z < 10 ? 2.2 : 1.4 });
        const dark = (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
        const g = canvas.getContext('2d'), img = g.createImageData(256, 256), out = img.data;
        for (let i = 0; i < shade.length; i++) {
          const s = shade[i], j = i * 4;
          if (s < 0.7) { out[j] = out[j + 1] = out[j + 2] = 10; out[j + 3] = Math.min(200, (0.7 - s) * (dark ? 330 : 300)); }
          else { out[j] = out[j + 1] = out[j + 2] = 255; out[j + 3] = Math.min(90, (s - 0.7) * (dark ? 260 : 160)); }
        }
        g.putImageData(img, 0, 0);
        done(null, canvas);
      }, err => done(err, canvas));
      return canvas;
    },
  });
  function drawHill() {
    if (hillLayer) { map.removeLayer(hillLayer); hillLayer = null; }
    if (st.hill) hillLayer = new Hill({ pane: 'imagery', maxNativeZoom: 15, maxZoom: 19, opacity: 1, attribution: 'Hillshade from Terrain Tiles' }).addTo(map);
  }
  window.addEventListener('prp:themechange', () => { if (hillLayer) hillLayer.redraw(); });

  /* ---------- drawing tools ---------- */
  const ll = p => L.latLng(p[0], p[1]);
  const vertex = p => L.circleMarker(ll(p), { radius: 4.5, className: 'mk-vertex', interactive: false });
  function setTool(t) {
    st.tool = t; st.pts = []; st.pendingOrigin = null; draft.clearLayers();
    panel.querySelectorAll('#ms-tool [data-v]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === t)));
    $('#ms-hint').textContent = HINTS[t];
    $('#ms-map').classList.toggle('pick', t !== 'inspect');
    finishState();
    readout();
  }
  function finishState() { $('#ms-finish').disabled = !((st.tool === 'distance' && st.pts.length >= 2) || (st.tool === 'area' && st.pts.length >= 3)); }
  function drawDraft(cursor) {
    draft.clearLayers();
    const pts = cursor ? [...st.pts, cursor] : st.pts;
    if (st.tool === 'area' && pts.length >= 2) cased(pts.map(ll), 'mk-area', { polygon: true }).addTo(draft);
    else if (pts.length >= 2) cased(pts.map(ll), st.tool === 'shadow' ? 'mk-shadow-measured' : 'mk-line').addTo(draft);
    st.pts.forEach(p => vertex(p).addTo(draft));
    if (st.pendingOrigin) L.circleMarker(ll(st.pendingOrigin), { radius: 6, className: 'mk-cross', interactive: false }).addTo(draft);
  }
  map.on('mousemove', e => { if (st.pts.length && ['distance', 'area', 'bearing', 'shadow'].includes(st.tool)) drawDraft([e.latlng.lat, e.latlng.lng]); });
  map.on('click', e => {
    const p = [e.latlng.lat, e.latlng.lng];
    switch (st.tool) {
      case 'inspect': setPoint(p); break;
      case 'distance': case 'area': st.pts.push(p); drawDraft(); finishState(); readout(); break;
      case 'bearing': case 'shadow':
        st.pts.push(p);
        if (st.pts.length === 2) { finish(); } else drawDraft();
        break;
      case 'line':
        if (!st.pendingOrigin) { st.pendingOrigin = p; drawDraft(); readout(); }
        else { const inv = inverse(st.pendingOrigin, p); addLine(st.pendingOrigin, inv.initialBearing, inv.distance); }
        break;
    }
  });
  map.on('dblclick', () => { if (['distance', 'area'].includes(st.tool)) finish(); });
  $('#ms-map').addEventListener('keydown', e => {
    if (e.key === 'Escape') { st.pts = []; st.pendingOrigin = null; draft.clearLayers(); finishState(); readout(); }
    if (e.key === 'Enter' && ['distance', 'area'].includes(st.tool)) { e.preventDefault(); finish(); }
  });
  function finish() {
    // A double-click also fires two clicks: drop a repeated last vertex.
    const pts = st.pts.filter((p, i, a) => i === 0 || Math.abs(p[0] - a[i - 1][0]) > 1e-9 || Math.abs(p[1] - a[i - 1][1]) > 1e-9);
    if (st.tool === 'distance' && pts.length >= 2) st.shape = { kind: 'distance', pts };
    else if (st.tool === 'area' && pts.length >= 3) st.shape = { kind: 'area', pts };
    else if (st.tool === 'bearing' && pts.length === 2) st.shape = { kind: 'bearing', pts };
    else if (st.tool === 'shadow' && pts.length === 2) { st.shape = { kind: 'shadow', pts }; useShadow(pts); }
    else return;
    st.pts = []; draft.clearLayers(); finishState();
    drawShape(); readout();
  }
  function drawShape() {
    shapes.clearLayers();
    const sh = st.shape;
    if (!sh) return;
    if (sh.kind === 'area') cased(sh.pts.map(ll), 'mk-area', { polygon: true }).addTo(shapes);
    else if (sh.kind === 'shadow') cased(sh.pts.map(ll), 'mk-shadow-measured').addTo(shapes);
    else {
      const path = sh.pts.slice(1).flatMap((p, i) => greatCircle(sh.pts[i], p, Math.max(2, Math.ceil(inverse(sh.pts[i], p).distance / 20000))).slice(i ? 1 : 0));
      cased(path.map(ll), 'mk-line').addTo(shapes);
    }
    sh.pts.forEach(p => vertex(p).addTo(shapes));
  }
  $('#ms-finish').addEventListener('click', finish);
  $('#ms-clear').addEventListener('click', () => {
    st.pts = []; st.shape = null; st.lines = []; st.pendingOrigin = null; st.profile = null;
    draft.clearLayers(); shapes.clearLayers(); linesLayer.clearLayers();
    $('#ms-profile').hidden = true; finishState(); readout();
  });

  /* ---------- bearing lines and where they cross ---------- */
  function addLine(origin, bearing, length, reverse = false) {
    st.lines.push({ origin, bearing: normDeg(bearing), length: Math.max(100, length), reverse });
    st.pendingOrigin = null; st.lastBearing = normDeg(bearing);
    drawDraft(); drawLines(); readout(); links();
  }
  const lineDir = l => (l.reverse ? normDeg(l.bearing + 180) : l.bearing);
  function crossings() {
    const out = [];
    for (let i = 0; i < st.lines.length; i++) for (let j = i + 1; j < st.lines.length; j++) {
      const a = st.lines[i], b = st.lines[j], x = intersection(a.origin, lineDir(a), b.origin, lineDir(b));
      if (!x) continue;
      const da = inverse(a.origin, x).distance, db = inverse(b.origin, x).distance;
      if (da <= a.length * 1.0001 && db <= b.length * 1.0001) out.push({ i, j, p: x });
    }
    return out;
  }
  function drawLines() {
    linesLayer.clearLayers();
    st.lines.forEach((l, k) => {
      const end = destination(l.origin, lineDir(l), l.length);
      cased(greatCircle(l.origin, end, 48).map(ll), 'mk-bearing').addTo(linesLayer);
      L.circleMarker(ll(l.origin), { radius: 5, className: 'mk-cross' }).bindTooltip(`Line ${k + 1}: ${lineDir(l).toFixed(1)}°`, { direction: 'top' }).addTo(linesLayer);
    });
    crossings().forEach(c => L.circleMarker(ll(c.p), { radius: 7, className: 'mk-point' }).bindTooltip(`Lines ${c.i + 1} and ${c.j + 1} cross<br>${c.p[0].toFixed(5)}, ${c.p[1].toFixed(5)}`, { direction: 'top' }).addTo(linesLayer));
  }

  /* ---------- the selected point ---------- */
  async function setPoint(p, { fly = false } = {}) {
    st.point = [p[0], ((p[1] + 540) % 360) - 180];
    ctx.set({ mp: fmtLatLon(st.point[0], st.point[1], 5) });
    pointLayer.clearLayers();
    L.circleMarker(ll(st.point), { radius: 7, className: 'mk-point', interactive: false }).addTo(pointLayer);
    if (fly) flyTo(map, st.point[0], st.point[1], Math.max(map.getZoom(), 15), ctx);
    st.elev = null;
    if (!st.sun.tzManual) st.sun.tz = null;
    readout(); links(); sunUpdate();
    try { const h = await elevationAt(st.point[0], st.point[1]); st.elev = h; readout(); } catch { st.elev = NaN; readout(); }
  }
  $('#ms-go').addEventListener('submit', e => {
    e.preventDefault();
    const p = parseCoordinates($('#ms-coords').value);
    const msg = $('#ms-hint');
    if (!p) { msg.textContent = 'Could not read those coordinates. Try “48.8584, 2.2945”, “48°51′30″N 2°17′40″E” or an MGRS reference.'; return; }
    setTool('inspect');
    setPoint(p, { fly: true });
  });

  /* ---------- readout ---------- */
  function readout() {
    const out = [];
    if (st.point) {
      const [lat, lon] = st.point, mg = toMGRS(lat, lon);
      out.push(`<div><span class="prp-label">Point</span><div class="coord-lines">
        <div><span class="k">DD</span><span class="v">${lat.toFixed(6)}, ${lon.toFixed(6)} <button type="button" class="prp-btn sm ghost" data-copy-text="${lat.toFixed(6)}, ${lon.toFixed(6)}">Copy</button></span></div>
        <div><span class="k">DMS</span><span class="v">${esc(toDMS(lat, true))} ${esc(toDMS(lon, false))}</span></div>
        ${mg ? `<div><span class="k">MGRS</span><span class="v">${esc(mg)}</span></div>` : ''}
        <div><span class="k">Height</span><span class="v">${st.elev === null ? '<span class="muted">reading terrain…</span>' : Number.isFinite(st.elev) ? `${fmtNum(st.elev, 0)} m above sea level <span class="muted">(Terrain Tiles; ±10–30 m)</span>` : '<span class="muted">unavailable</span>'}</span></div></div></div>`);
    } else if (st.tool === 'inspect' && !st.shape && !st.lines.length) out.push(`<p class="muted">${esc(HINTS.inspect)}</p>`);
    const sh = st.shape;
    if (sh?.kind === 'distance') {
      const total = pathLength(sh.pts), segs = sh.pts.slice(1).map((p, i) => inverse(sh.pts[i], p));
      out.push(`<div class="readout"><div><span class="prp-label">Distance</span><div class="big">${fmtDistance(total)}</div><div class="sub">${fmtMiles(total)} · ${fmtNautical(total)} · ${sh.pts.length - 1} ${sh.pts.length === 2 ? 'segment' : 'segments'}</div></div>
        ${segs.length > 1 ? `<details class="as-table"><summary>Segments</summary><table class="prp-table"><thead><tr><th>#</th><th class="num">Length</th><th class="num">Bearing</th></tr></thead><tbody>${segs.map((s, i) => `<tr><td>${i + 1}</td><td class="num">${fmtDistance(s.distance)}</td><td class="num">${s.initialBearing.toFixed(1)}°</td></tr>`).join('')}</tbody></table></details>` : ''}
        <div class="inline"><button type="button" class="prp-btn sm" id="ms-prof-btn">Elevation profile and line of sight</button></div></div>`);
    } else if (sh?.kind === 'area') {
      const a = polygonArea(sh.pts), per = pathLength([...sh.pts, sh.pts[0]]);
      out.push(`<div class="readout"><div><span class="prp-label">Area</span><div class="big">${fmtArea(a)}</div><div class="sub">${fmtNum(a / 1e6, 3)} km² · ${fmtNum(a / 2589988.11, 3)} sq mi · perimeter ${fmtDistance(per)}</div></div></div>`);
    } else if (sh?.kind === 'bearing') {
      const inv = inverse(sh.pts[0], sh.pts[1]);
      st.lastBearing = inv.initialBearing;
      out.push(`<div class="readout"><div><span class="prp-label">Bearing</span><div class="big">${inv.initialBearing.toFixed(1)}° <span class="sub">${compass(inv.initialBearing)} (true north)</span></div>
        <div class="sub">Back bearing ${normDeg(inv.finalBearing + 180).toFixed(1)}° · arriving on ${inv.finalBearing.toFixed(1)}° · distance ${fmtDistance(inv.distance)}</div></div></div>`);
    } else if (sh?.kind === 'shadow') {
      const inv = inverse(sh.pts[0], sh.pts[1]);
      out.push(`<div class="readout"><div><span class="prp-label">Measured shadow</span><div class="big">${inv.initialBearing.toFixed(1)}° <span class="sub">${compass(inv.initialBearing)}</span></div>
        <div class="sub">Length ${fmtNum(inv.distance, inv.distance < 100 ? 1 : 0)} m on the map. The sun was in the ${compass(sunAzimuthFromShadow(inv.initialBearing))} (${sunAzimuthFromShadow(inv.initialBearing).toFixed(1)}°). Copied to the chronolocation form.</div></div></div>`);
    } else if (st.tool === 'distance' || st.tool === 'area') {
      if (st.pts.length) out.push(`<p class="sub">${st.pts.length} ${st.pts.length === 1 ? 'point' : 'points'} so far: ${st.tool === 'distance' ? fmtDistance(pathLength(st.pts)) : st.pts.length >= 3 ? fmtArea(polygonArea(st.pts)) : ''}</p>`);
    }
    if (st.tool === 'line' || st.lines.length) {
      const cr = crossings();
      out.push(`<div><span class="prp-label">Bearing lines</span>
        ${st.pendingOrigin ? `<form class="inline line-form" id="ms-line-form"><label>From ${st.pendingOrigin[0].toFixed(4)}, ${st.pendingOrigin[1].toFixed(4)} on <input class="prp-input num" id="ms-line-b" type="number" min="0" max="360" step="0.1" required value="${st.lastBearing.toFixed(1)}">°</label>
          <label>for <input class="prp-input num" id="ms-line-l" type="number" min="0.1" max="2000" step="0.1" value="10"> km</label>
          <label class="check-l"><input type="checkbox" id="ms-line-r"> seen from the camera (draw the back bearing)</label><button type="submit" class="prp-btn sm primary">Add line</button></form>` : ''}
        ${st.lines.length ? `<ol class="lines-list">${st.lines.map((l, k) => `<li>${lineDir(l).toFixed(1)}° ${compass(lineDir(l))} from ${l.origin[0].toFixed(4)}, ${l.origin[1].toFixed(4)}, ${fmtDistance(l.length)}${l.reverse ? ' (back bearing)' : ''} <button type="button" class="linkish" data-del-line="${k}">remove</button></li>`).join('')}</ol>` : ''}
        ${cr.length ? `<p class="sub">${cr.map(c => `Lines ${c.i + 1} and ${c.j + 1} cross at <code>${c.p[0].toFixed(5)}, ${c.p[1].toFixed(5)}</code>`).join('<br>')}</p>` : st.lines.length > 1 ? '<p class="sub">These lines do not cross within their lengths.</p>' : ''}</div>`);
    }
    $('#ms-readout').innerHTML = `<div class="readout">${out.join('')}</div>`;
    const form = $('#ms-line-form');
    if (form) form.addEventListener('submit', e => { e.preventDefault(); const b = +$('#ms-line-b').value, km = +$('#ms-line-l').value; if (Number.isFinite(b) && km > 0) addLine(st.pendingOrigin, b, km * 1000, $('#ms-line-r').checked); });
    $('#ms-prof-btn')?.addEventListener('click', profile);
  }
  $('#ms-readout').addEventListener('click', e => {
    const d = e.target.closest('[data-del-line]');
    if (d) { st.lines.splice(+d.dataset.delLine, 1); drawLines(); readout(); }
  });
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-copy-text]');
    if (!b) return;
    navigator.clipboard?.writeText(b.dataset.copyText).then(() => { const t = b.textContent; b.textContent = 'Copied'; setTimeout(() => { b.textContent = t; }, 1500); }, () => {});
  });

  /* ---------- elevation profile and line of sight ---------- */
  async function profile() {
    const pts = st.shape?.pts;
    if (!pts) return;
    const box = $('#ms-profile');
    box.hidden = false;
    $('#ms-profile-cap').textContent = 'Reading terrain…';
    const total = pathLength(pts), lat = pts[0][0];
    const z = clamp(Math.floor(Math.log2(40075016 * Math.cos(lat * Math.PI / 180) * 12 / Math.max(total, 1))), 5, 14);
    const samples = samplePath(pts, 160);
    try {
      const hs = await Promise.all(samples.map(s => elevationAt(s.lat, s.lon, z)));
      st.profile = samples.map((s, i) => ({ d: s.d, h: hs[i], lat: s.lat, lon: s.lon }));
      st.profileZ = z;
      drawProfile();
      box.scrollIntoView({ block: 'nearest', behavior: ctx.reduceMotion() ? 'auto' : 'smooth' });
    } catch { $('#ms-profile-cap').textContent = 'Terrain data could not be read for this line.'; }
  }
  function drawProfile() {
    const prof = st.profile;
    if (!prof) return;
    const obs = Math.max(0, +$('#ms-obs').value || 0), tgt = Math.max(0, +$('#ms-tgt').value || 0);
    const los = lineOfSight(prof, { observerHeight: obs, targetHeight: tgt });
    const el = $('#ms-profile-chart'), W = Math.max(320, el.clientWidth || 640), H = 220, m = { l: 48, r: 14, t: 12, b: 30 };
    const D = prof[prof.length - 1].d, ys = los.adjusted.flatMap(a => [a.ground, a.sight]);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = Math.max(10, (y1 - y0) * 0.08); y0 -= pad; y1 += pad;
    const X = d => m.l + (d / D) * (W - m.l - m.r), Y = h => m.t + (1 - (h - y0) / (y1 - y0)) * (H - m.t - m.b);
    const ticks = niceTicks(y0, y1, 4), xt = niceTicks(0, D / 1000, 5);
    const ground = los.adjusted.map(a => `${X(a.d).toFixed(1)},${Y(a.ground).toFixed(1)}`).join(' ');
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Elevation profile, ${fmtDistance(D)} long, ${los.visible ? 'with a clear line of sight' : 'with the line of sight blocked'}">`;
    svg += ticks.map(t => `<line class="ch-grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ch-tick" x="${m.l - 6}" y="${Y(t) + 3.5}" text-anchor="end">${fmtNum(t, 0)}</text>`).join('');
    const xd = xt.length > 1 && xt[1] - xt[0] < 1 ? 1 : 0;
    svg += xt.map((t, i) => `<text class="ch-tick" x="${X(t * 1000)}" y="${H - 10}" text-anchor="${i === xt.length - 1 && X(t * 1000) > W - m.r - 30 ? 'end' : 'middle'}">${fmtNum(t, xd)}${i === xt.length - 1 ? ' km' : ''}</text>`).join('');
    svg += `<text class="ch-label" x="${m.l - 6}" y="${m.t - 2}" text-anchor="end">m</text>`;
    svg += `<polygon class="ch-ground" points="${X(0)},${Y(y0)} ${ground} ${X(D)},${Y(y0)}"/>`;
    svg += `<line class="ch-sight" x1="${X(0)}" y1="${Y(los.observer)}" x2="${X(D)}" y2="${Y(los.target)}"/>`;
    if (los.obstruction) { const ob = los.adjusted.find(a => a.d === los.obstruction.d); svg += `<circle class="ch-block" cx="${X(ob.d)}" cy="${Y(ob.ground)}" r="5"/>`; }
    svg += `<line class="ch-hover" id="ms-ph" y1="${m.t}" y2="${H - m.b}" x1="0" x2="0" visibility="hidden"/><rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent" id="ms-pr"/></svg>`;
    el.innerHTML = svg + `<div class="ch-legend"><span><i class="ground"></i>Ground, with Earth curvature and refraction</span><span><i class="sight"></i>Line of sight, ${fmtNum(obs, 1)} m to ${fmtNum(tgt, 1)} m above ground</span></div>`;
    const cap = los.visible ? `Clear line of sight: the closest approach is ${fmtNum(los.minClearance, 0)} m above the ground.` : `Blocked: the ground rises ${fmtNum(-los.obstruction.clearance, 0)} m above the line of sight ${fmtDistance(los.obstruction.d)} from the start.`;
    $('#ms-profile-cap').innerHTML = `<b>Figure 2.</b> Elevation along the measured line (${fmtDistance(D)}), from Terrain Tiles read at zoom ${st.profileZ} (about ${fmtNum(metersPerPixel(prof[0].lat, st.profileZ), 0)} m per pixel). ${esc(cap)} Terrain models miss buildings and trees, so treat a clear result as “possible”, not “proven”.`;
    $('#ms-profile-table').innerHTML = `<table class="prp-table"><thead><tr><th class="num">Distance</th><th class="num">Ground m</th><th class="num">Clearance m</th><th>Position</th></tr></thead><tbody>${los.adjusted.filter((_, i) => i % 8 === 0 || i === los.adjusted.length - 1).map((a, i) => { const p = prof[prof.findIndex(q => q.d === a.d)]; return `<tr><td class="num">${fmtDistance(a.d)}</td><td class="num">${fmtNum(p.h, 0)}</td><td class="num">${fmtNum(a.clearance, 0)}</td><td><code>${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</code></td></tr>`; }).join('')}</tbody></table>`;
    const rect = el.querySelector('#ms-pr'), hl = el.querySelector('#ms-ph'), tip = document.getElementById('tip');
    rect.addEventListener('mousemove', e => {
      const r = el.querySelector('svg').getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width);
      const d = clamp((x - m.l) / (W - m.l - m.r), 0, 1) * D;
      const k = los.adjusted.reduce((best, a, i) => (Math.abs(a.d - d) < Math.abs(los.adjusted[best].d - d) ? i : best), 0), a = los.adjusted[k];
      hl.setAttribute('x1', X(a.d)); hl.setAttribute('x2', X(a.d)); hl.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>${fmtDistance(a.d)}</b><br>Ground ${fmtNum(prof[k].h, 0)} m<br>${a.clearance >= 0 ? 'Clearance' : 'Blocked by'} ${fmtNum(Math.abs(a.clearance), 0)} m`;
      tip.hidden = false;
      tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px'; tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 10) + 'px';
    });
    rect.addEventListener('mouseleave', () => { tip.hidden = true; hl.setAttribute('visibility', 'hidden'); });
  }
  $('#ms-obs').addEventListener('input', drawProfile);
  $('#ms-tgt').addEventListener('input', drawProfile);

  /* ---------- sun and shadows ---------- */
  const sunBox = $('#ms-sun .prp-panel-body');
  sunBox.innerHTML = `<p class="small" id="ms-sun-place"></p>
    <div class="form-grid">
      <label class="field"><span class="prp-label">Day</span><input class="prp-input" type="date" id="ms-sun-day"></label>
      <label class="field"><span class="prp-label">Local time</span><input class="prp-input" type="time" id="ms-sun-time" step="60"></label>
      <label class="field full"><span class="prp-label">Time zone</span><select class="prp-select" id="ms-sun-tz">${ZONES.map(z => `<option>${esc(z)}</option>`).join('')}</select></label>
      <label class="field"><span class="prp-label">Object height, m</span><input class="prp-input" type="number" id="ms-sun-h" min="0.1" step="0.1" value="10"></label>
      <div class="field"><span class="prp-label">&nbsp;</span><button type="button" class="prp-btn" id="ms-sun-now">Now</button></div>
    </div>
    <div class="sun-out" id="ms-sun-out"></div>
    <p class="times-line" id="ms-sun-times"></p>
    <figure class="prp-figure"><div class="chart" id="ms-sun-chart"></div><figcaption id="ms-sun-cap"></figcaption></figure>`;
  function place() { if (st.point) return st.point; const c = map.getCenter(); return [c.lat, ((c.lng + 540) % 360) - 180]; }
  async function sunUpdate() {
    const status = $('#ms-sun-status');
    let S;
    try { S = await loadSun(); } catch { status.textContent = 'SunCalc could not load'; $('#ms-sun-out').innerHTML = '<p class="prp-note warn">The sun calculator needs the SunCalc library from cdn.jsdelivr.net, which did not load.</p>'; return; }
    const [lat, lon] = place();
    if (!st.sun.tz) {
      const look = await loadTz();
      let tz = null;
      try { tz = look ? look(lat, lon) : null; } catch { tz = null; }
      st.sun.tz = tz && ZONES.includes(tz) ? tz : (ZONES.includes(etcZoneForLon(lon)) ? etcZoneForLon(lon) : 'UTC');
      if (!st.sun.day) { const now = utcToZoned(Date.now(), st.sun.tz); st.sun.day = now.day; st.sun.time = now.time; }
    }
    const tz = st.sun.tz, day = st.sun.day, time = st.sun.time || '12:00';
    $('#ms-sun-tz').value = tz; $('#ms-sun-day').value = day; $('#ms-sun-time').value = time; $('#ms-sun-h').value = String(st.sun.height);
    $('#ms-sun-place').innerHTML = `${st.point ? 'For the selected point' : 'For the map centre (click the map with Inspect to choose a point)'}: <code>${lat.toFixed(4)}, ${lon.toFixed(4)}</code>. Time zone ${st.sun.tzManual ? 'chosen by you' : 'estimated from the position'}; check it, and daylight saving, for the place.`;
    const t = zonedToUtc(day, time, tz), pos = S.getPosition(new Date(t), lat, lon);
    const up = pos.altitude > 0, sb = shadowBearing(pos.azimuth), L0 = shadowLength(st.sun.height, pos.altitude);
    $('#ms-sun-out').innerHTML = [
      ['Sun azimuth', `${pos.azimuth.toFixed(1)}°`, `${compass(pos.azimuth)}, from true north`],
      ['Sun altitude', `${pos.altitude.toFixed(1)}°`, up ? 'above the horizon (refraction included)' : 'below the horizon'],
      ['Shadow direction', up ? `${sb.toFixed(1)}°` : '–', up ? `${compass(sb)}, away from the sun` : 'no sun shadow'],
      ['Shadow length', up ? `${fmtNum(L0, L0 < 100 ? 1 : 0)} m` : '–', up ? `for ${fmtNum(st.sun.height, 1)} m; ratio ${fmtNum(L0 / st.sun.height, 2)} : 1` : ''],
    ].map(([k, v, s]) => `<div class="cell"><span>${k}</span><b>${v}</b><small>${esc(s)}</small></div>`).join('');
    status.textContent = `${fmtDay(day)}, ${time} ${fmtOffset(utcToZoned(t, tz).offset)}`;
    const noonish = zonedToUtc(day, '12:00', tz), times = S.getTimes(new Date(noonish), lat, lon);
    const f = d => (d && !Number.isNaN(+d) ? utcToZoned(+d, tz).time : '–');
    $('#ms-sun-times').textContent = times.alwaysUp ? 'The sun does not set on this day.' : times.alwaysDown ? 'The sun does not rise on this day.' : `Sunrise ${f(times.sunrise)} · solar noon ${f(times.solarNoon)} · sunset ${f(times.sunset)} (local time)`;
    drawSunLines(lat, lon, up ? pos.azimuth : null);
    sunChart(S, lat, lon, tz, day, t);
  }
  function drawSunLines(lat, lon, az) {
    sunLayer.clearLayers();
    if (az === null) return;
    const b = map.getBounds(), len = Math.max(20, inverse([b.getSouth(), b.getWest()], [b.getNorth(), b.getWest()]).distance * 0.3);
    cased([ll([lat, lon]), ll(destination([lat, lon], az, len))], 'mk-sun').addTo(sunLayer);
    cased([ll([lat, lon]), ll(destination([lat, lon], shadowBearing(az), len * 0.6))], 'mk-shadow').addTo(sunLayer);
  }
  map.on('zoomend', () => { if (SunCalc) sunUpdate(); });
  function sunChart(S, lat, lon, tz, day, tNow) {
    const el = $('#ms-sun-chart'), W = Math.max(280, el.clientWidth || 320), H = 170, m = { l: 34, r: 10, t: 10, b: 24 };
    const start = zonedToUtc(day, '00:00', tz), end = zonedToUtc(addDays(day, 1), '00:00', tz), span = end - start;
    const pts = [];
    for (let t = start; t <= end; t += 10 * 60e3) { const p = S.getPosition(new Date(t), lat, lon); pts.push({ t, alt: p.altitude, az: p.azimuth }); }
    const y0 = Math.min(-20, Math.floor(Math.min(...pts.map(p => p.alt)) / 10) * 10), y1 = 90;
    const X = t => m.l + ((t - start) / span) * (W - m.l - m.r), Y = a => m.t + (1 - (a - y0) / (y1 - y0)) * (H - m.t - m.b);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sun altitude through ${fmtDay(day)} at this place">`;
    svg += `<rect class="ch-night" x="${m.l}" y="${Y(0)}" width="${W - m.l - m.r}" height="${Y(y0) - Y(0)}"/>`;
    svg += [0, 30, 60, 90].filter(v => v >= y0).map(v => `<line class="ch-grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ch-tick" x="${m.l - 5}" y="${Y(v) + 3.5}" text-anchor="end">${v}°</text>`).join('');
    svg += [0, 6, 12, 18, 24].map(h => `<text class="ch-tick" x="${X(start + h * 3600e3 * (span / 864e5))}" y="${H - 7}" text-anchor="middle">${String(h).padStart(2, '0')}:00</text>`).join('');
    const wins = (st.chrono.results || []).filter(w => w.end >= start && w.start <= end);
    svg += wins.map(w => `<rect class="ch-match" x="${X(Math.max(start, w.start))}" y="${m.t}" width="${Math.max(2, X(Math.min(end, w.end)) - X(Math.max(start, w.start)))}" height="${H - m.t - m.b}"/>`).join('');
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.alt).toFixed(1)}`).join('');
    svg += `<path class="ch-line" d="${path}"/>`;
    if (Number.isFinite(+st.chrono.alt) && st.chrono.alt !== '') svg += `<line class="ch-target" x1="${m.l}" x2="${W - m.r}" y1="${Y(+st.chrono.alt)}" y2="${Y(+st.chrono.alt)}"/>`;
    const pn = S.getPosition(new Date(tNow), lat, lon);
    if (tNow >= start && tNow <= end) svg += `<line class="ch-now" x1="${X(tNow)}" x2="${X(tNow)}" y1="${m.t}" y2="${H - m.b}"/><circle class="ch-dot" cx="${X(tNow)}" cy="${Y(pn.altitude)}" r="5"/>`;
    svg += `<line class="ch-hover" id="ms-sh" y1="${m.t}" y2="${H - m.b}" x1="0" x2="0" visibility="hidden"/><rect id="ms-sr" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/></svg>`;
    el.innerHTML = svg + (wins.length || st.chrono.alt !== '' ? `<div class="ch-legend"><span><i class="sun"></i>Sun altitude</span>${wins.length ? '<span><i class="match"></i>Times that fit the shadow</span>' : ''}</div>` : '');
    $('#ms-sun-cap').innerHTML = `<b>Figure 3.</b> Sun altitude through ${esc(fmtDay(day))}, local time (${esc(tz)}); grey below the horizon. The vertical line marks the chosen time.`;
    const rect = el.querySelector('#ms-sr'), hl = el.querySelector('#ms-sh'), tip = document.getElementById('tip');
    rect.addEventListener('mousemove', e => {
      const r = el.querySelector('svg').getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width);
      const t = start + clamp((x - m.l) / (W - m.l - m.r), 0, 1) * span, p = pts[Math.round((t - start) / (10 * 60e3))] || pts[pts.length - 1];
      hl.setAttribute('x1', X(p.t)); hl.setAttribute('x2', X(p.t)); hl.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>${utcToZoned(p.t, tz).time}</b> local<br>Altitude ${p.alt.toFixed(1)}°<br>Azimuth ${p.az.toFixed(1)}° ${compass(p.az)}`;
      tip.hidden = false;
      tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px'; tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 10) + 'px';
    });
    rect.addEventListener('mouseleave', () => { tip.hidden = true; hl.setAttribute('visibility', 'hidden'); });
    rect.addEventListener('click', e => {
      const r = el.querySelector('svg').getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width);
      const t = start + clamp((x - m.l) / (W - m.l - m.r), 0, 1) * span;
      st.sun.time = utcToZoned(Math.round(t / 60e3) * 60e3, tz).time; sunUpdate();
    });
  }
  $('#ms-sun-day').addEventListener('change', e => { if (isISODate(e.target.value)) { st.sun.day = e.target.value; sunUpdate(); } });
  $('#ms-sun-time').addEventListener('change', e => { if (/^\d\d:\d\d/.test(e.target.value)) { st.sun.time = e.target.value.slice(0, 5); sunUpdate(); } });
  $('#ms-sun-tz').addEventListener('change', e => { st.sun.tz = e.target.value; st.sun.tzManual = true; sunUpdate(); });
  $('#ms-sun-h').addEventListener('input', e => { const v = +e.target.value; if (v > 0) { st.sun.height = v; sunUpdate(); } });
  $('#ms-sun-now').addEventListener('click', () => { const now = utcToZoned(Date.now(), st.sun.tz || 'UTC'); st.sun.day = now.day; st.sun.time = now.time; sunUpdate(); });

  /* ---------- chronolocation ---------- */
  const chBox = $('#ms-chrono .prp-panel-body');
  chBox.innerHTML = `<p class="small">A shadow points away from the sun, and its length against the object's height gives the sun's altitude: <i>altitude = arctan(height ÷ shadow length)</i>. Measure both on level ground (use the <b>Shadow</b> tool on sharp imagery, or estimate from the photo), then find the times on the day above when the sun stood there. <a href="#" data-lesson="satellite-imagery-and-chronolocation">Lesson: chronolocation →</a></p>
    <div class="form-grid">
      <label class="field"><span class="prp-label">Shadow direction, °</span><input class="prp-input" type="number" id="ch-dir" min="0" max="360" step="0.5" placeholder="e.g. 45"></label>
      <div class="field"><span class="prp-label">&nbsp;</span><button type="button" class="prp-btn" id="ch-measure">Measure on map</button></div>
      <label class="field"><span class="prp-label">Object height, m</span><input class="prp-input" type="number" id="ch-h" min="0" step="0.1" placeholder="e.g. 3"></label>
      <label class="field"><span class="prp-label">Shadow length, m</span><input class="prp-input" type="number" id="ch-l" min="0" step="0.1" placeholder="e.g. 5.2"></label>
      <label class="field"><span class="prp-label">Sun altitude, °</span><input class="prp-input" type="number" id="ch-alt" min="0" max="90" step="0.1" placeholder="from height ÷ length"></label>
      <label class="field"><span class="prp-label">Search</span><select class="prp-select" id="ch-scope"><option value="day">The chosen day</option><option value="month">15 days either side</option><option value="year">The whole year</option></select></label>
      <label class="field"><span class="prp-label">Direction ±°</span><input class="prp-input" type="number" id="ch-taz" min="0.5" max="30" step="0.5" value="4"></label>
      <label class="field"><span class="prp-label">Altitude ±°</span><input class="prp-input" type="number" id="ch-talt" min="0.5" max="20" step="0.5" value="2"></label>
    </div>
    <p class="inline"><button type="button" class="prp-btn primary" id="ch-run">Find matching times</button><span class="status" id="ch-status" aria-live="polite"></span></p>
    <div class="results-list" id="ch-out"></div>`;
  function useShadow([a, b]) {
    const inv = inverse(a, b);
    st.chrono.dir = inv.initialBearing.toFixed(1); st.chrono.L = inv.distance.toFixed(1);
    $('#ch-dir').value = st.chrono.dir; $('#ch-l').value = st.chrono.L;
    if (+$('#ch-h').value > 0) { st.chrono.alt = altitudeFromShadow(+$('#ch-h').value, inv.distance).toFixed(1); $('#ch-alt').value = st.chrono.alt; }
    setPoint(a);
    $('#ch-status').textContent = 'Shadow measured. Add the object height, then search.';
  }
  const syncAlt = () => { const h = +$('#ch-h').value, Lm = +$('#ch-l').value; if (h > 0 && Lm > 0) { $('#ch-alt').value = altitudeFromShadow(h, Lm).toFixed(1); } };
  $('#ch-h').addEventListener('input', syncAlt);
  $('#ch-l').addEventListener('input', syncAlt);
  $('#ch-measure').addEventListener('click', () => { setTool('shadow'); $('#ms-map').focus(); $('#ms-map').scrollIntoView({ block: 'nearest', behavior: ctx.reduceMotion() ? 'auto' : 'smooth' }); });
  $('#ch-run').addEventListener('click', async () => {
    const S = await loadSun().catch(() => null);
    if (!S) { $('#ch-status').textContent = 'SunCalc could not load.'; return; }
    if (!st.sun.tz) await sunUpdate();
    const dir = $('#ch-dir').value === '' ? NaN : +$('#ch-dir').value, alt = $('#ch-alt').value === '' ? NaN : +$('#ch-alt').value;
    st.chrono = { ...st.chrono, dir: $('#ch-dir').value, alt: $('#ch-alt').value, h: $('#ch-h').value, L: $('#ch-l').value, tolAz: +$('#ch-taz').value || 4, tolAlt: +$('#ch-talt').value || 2, scope: $('#ch-scope').value };
    if (!Number.isFinite(dir) && !Number.isFinite(alt)) { $('#ch-status').textContent = 'Give the shadow direction, the sun altitude, or both.'; return; }
    const [lat, lon] = place(), tz = st.sun.tz, day = st.sun.day;
    const scope = st.chrono.scope, first = scope === 'year' ? `${day.slice(0, 4)}-01-01` : scope === 'month' ? addDays(day, -15) : day;
    const days = scope === 'year' ? (Number(day.slice(0, 4)) % 4 === 0 && (Number(day.slice(0, 4)) % 100 !== 0 || Number(day.slice(0, 4)) % 400 === 0) ? 366 : 365) : scope === 'month' ? 31 : 1;
    $('#ch-status').textContent = 'Searching…';
    await new Promise(r => setTimeout(r, 30));
    const t0 = performance.now();
    const res = chronolocate({
      lat, lon, startMs: zonedToUtc(first, '00:00', tz), days, getPosition: (d, a, b) => S.getPosition(d, a, b),
      azimuth: Number.isFinite(dir) ? sunAzimuthFromShadow(dir) : undefined, altitude: Number.isFinite(alt) ? alt : undefined,
      tolAz: st.chrono.tolAz, tolAlt: st.chrono.tolAlt, stepMin: scope === 'year' ? 3 : 2,
    });
    st.chrono.results = res.windows;
    $('#ch-status').textContent = `${res.windows.length} ${res.windows.length === 1 ? 'window' : 'windows'} · ${fmtNum(res.evaluated)} sun positions in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
    renderChrono(res.windows, tz, dir, alt, 10);
    sunUpdate();
  });
  // Results as a compact list (it has to fit the side column): day and window, best time in local and UTC, sun, fit.
  function renderChrono(wins, tz, dir, alt, limit) {
    const z = ms => utcToZoned(ms, tz), rows = wins.slice(0, limit), fit = w => Math.round((1 - Math.min(1, w.error)) * 100);
    $('#ch-out').innerHTML = !rows.length ? `<p class="prp-note warn">No time fits within the tolerances. Check the time zone, widen the tolerances, search more days, or re-measure (sloping ground and guessed heights are the usual culprits).</p>` :
      `<ol class="chrono-list">${rows.map(w => `<li>
        <div class="l1"><b>${fmtDay(z(w.best).day)}</b><span>${z(w.start).time}–${z(w.end).time} local</span><span class="fitv"><i class="fit" style="width:${Math.round(fit(w) * 0.4) + 4}px" aria-hidden="true"></i>${fit(w)}% fit</span></div>
        <div class="l2"><button type="button" class="linkish" data-set-time="${w.best}">Best ${z(w.best).time}</button> (${new Date(w.best).toISOString().slice(11, 16)} UTC) · sun ${w.azimuth.toFixed(1)}° ${compass(w.azimuth)}, ${w.altitude.toFixed(1)}° high</div></li>`).join('')}</ol>
        ${wins.length > rows.length ? `<p><button type="button" class="prp-btn sm" id="ch-more">Show all ${wins.length} windows</button></p>` : ''}
        <p class="small muted">Best first. Times in ${esc(tz)}; choose a time to see it in the calculator above. ${!Number.isFinite(dir) ? 'Without a direction, each day has a morning and an afternoon match. ' : !Number.isFinite(alt) ? 'Without an altitude, each day has one match by direction alone. ' : ''}With both, a year usually has two dates that fit, either side of the solstice: use the season, foliage and weather to choose.</p>`;
    $('#ch-more')?.addEventListener('click', () => renderChrono(wins, tz, dir, alt, wins.length));
  }
  $('#ch-out').addEventListener('click', e => {
    const b = e.target.closest('[data-set-time]');
    if (!b) return;
    const z = utcToZoned(+b.dataset.setTime, st.sun.tz);
    st.sun.day = z.day; st.sun.time = z.time; sunUpdate();
    $('#ms-sun').scrollIntoView({ block: 'nearest', behavior: ctx.reduceMotion() ? 'auto' : 'smooth' });
  });
  ctx.wireLessons(chBox);

  /* ---------- street level and 3D ---------- */
  function links() {
    const [lat, lon] = place();
    const item = (href, t, u) => `<li><a href="${esc(href)}" target="_blank" rel="noopener"><span class="t">${esc(t)} ↗</span><span class="u">${esc(u)}</span></a></li>`;
    $('#ms-links').innerHTML = [
      item(mapillaryUrl({ lat, lon }), 'Mapillary', 'Crowd-sourced street photos, CC BY-SA'),
      item(kartaviewUrl({ lat, lon }), 'KartaView', 'Crowd-sourced street photos, CC BY-SA'),
      item(streetViewUrl({ lat, lon }), 'Google Street View', 'Where Google has driven or walked'),
      item(peakvisorUrl({ lat, lon, bearing: st.lastBearing }), 'PeakVisor 3D', `Mountain names and skyline, looking ${st.lastBearing.toFixed(0)}° ${compass(st.lastBearing)}`),
      item(googleEarthUrl({ lat, lon, range: 1500 }), 'Google Earth (web)', '3D buildings and historical imagery'),
      item(osmUrl({ lat, lon, z: 17 }), 'OpenStreetMap', 'What is mapped here, with history'),
    ].join('') + `<li class="coords"><span class="muted">${st.point ? 'Point' : 'Map centre'}</span> <code>${lat.toFixed(5)}, ${lon.toFixed(5)}</code></li>`;
  }
  map.on('moveend', () => { if (!st.point) { links(); if (SunCalc) sunUpdate(); } });

  /* ---------- toolbar ---------- */
  panel.querySelectorAll('#ms-tool [data-v]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.v)));
  panel.querySelectorAll('#ms-base [data-v]').forEach(b => b.addEventListener('click', () => {
    st.base = b.dataset.v; base.set(st.base);
    panel.querySelectorAll('#ms-base [data-v]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === st.base)));
    ctx.set({ mb: st.base === 'imagery' ? null : st.base });
  }));
  panel.querySelectorAll('#ms-base [data-v]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === st.base)));
  $('#ms-hill').checked = st.hill;
  $('#ms-hill').addEventListener('change', e => { st.hill = e.target.checked; drawHill(); ctx.set({ mh: st.hill || null }); });
  let rz;
  new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => { if (SunCalc) sunUpdate(); if (st.profile) drawProfile(); }, 150); }).observe($('#ms-sun-chart'));

  setTool('inspect'); drawHill(); links();
  if (st.point) setPoint(st.point); else sunUpdate();

  return {
    show() { syncToView(map, ctx); if (SunCalc) sunUpdate(); },
    apply(s) { const p = parseLatLon(s.mp); if (p && (!st.point || p[0] !== st.point[0] || p[1] !== st.point[1])) setPoint(p); },
  };
}

function niceTicks(a, b, n = 4) {
  const span = b - a, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), r = step0 / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
