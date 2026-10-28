// OSINT Dashboard · Media check: read an image's metadata on this device (exif.js: EXIF, GPS, XMP, IPTC, PNG text,
// Content Credentials markers), hash it, show any GPS position on a map (Leaflet, pinned, loaded only when needed; Esri
// light or dark tiles, swapped on prp:themechange), explain what the metadata can and can't support, and launch
// reverse image searches that the user opens. Nothing is uploaded.
import { esc, sha256Hex, formatBytes, utcLabel, isoDay, reverseImageLinks, mapLinks, formatLatLon, safeHttpUrl } from './lib.js';
import { readMetadata, describe, assess, insertExif, sampleExif, exifDate, cameraName, FORMAT_NAMES } from './exif.js';
import { $, readFile, wireDropzone, copyText, tok, prpLink, toast } from './ui.js';

const LEAFLET = { css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', cssSri: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=', js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', jsSri: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=' };
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
const BASEMAP = { light: ['World_Light_Gray_Base', 'World_Light_Gray_Reference'], dark: ['World_Dark_Gray_Base', 'World_Dark_Gray_Reference'] };
const MAX_BYTES = 300 * 1024 * 1024;
let panelEl, ctxRef, urls = [], map = null, tiles = [], tileTheme = '', leaflet = null, current = null, seq = 0;

export function init(panel, ctx) {
  panelEl = panel; ctxRef = ctx;
  wireDropzone($('#media-drop', panel), $('#media-file', panel), check);
  $('#media-sample', panel).addEventListener('click', sample);
  const ris = $('#ris-url', panel);
  ris.addEventListener('input', renderRis);
  $('#ris-links', panel).addEventListener('click', e => {
    const a = e.target.closest('a[data-paste="1"]');
    if (a && safeHttpUrl(ris.value)) { navigator.clipboard?.writeText(ris.value.trim()).then(() => toast('Image address copied: paste it into Bing’s camera search')).catch(() => {}); }
    const l = e.target.closest('a.lcard');
    if (l) ctxRef.log({ kind: 'search', text: `Reverse image search (${l.dataset.name})${safeHttpUrl(ris.value) ? ': ' + ris.value.trim() : ', upload page'}`, url: l.href });
  });
  if (ctx.state.q && safeHttpUrl(ctx.state.q)) ris.value = ctx.state.q;
  renderRis();
  window.addEventListener('prp:themechange', setTiles);
}
export function show(state) {
  if (state.q && safeHttpUrl(state.q) && $('#ris-url', panelEl).value !== state.q) { $('#ris-url', panelEl).value = state.q; renderRis(); }
  map?.invalidateSize();
}

function renderRis() {
  const u = $('#ris-url', panelEl).value.trim(), ok = !!safeHttpUrl(u);
  $('#ris-links', panelEl).innerHTML = reverseImageLinks(ok ? u : '').map(l => `<a class="lcard" href="${esc(l.href)}" target="_blank" rel="noopener noreferrer" data-name="${esc(l.name)}" data-paste="${l.paste ? '1' : ''}"><b>${esc(l.name)}</b><span>${esc(l.desc)}</span><em>${l.byUrl ? 'Searches the address directly' : l.paste ? 'Copies the address; paste it in the camera search' : 'Opens the upload page: drop your file there'}</em><span class="sr-only"> (opens in a new tab)</span></a>`).join('');
}

/* ---------- A sample image made in the browser, with metadata for a public place ---------- */
async function sample() {
  const c = document.createElement('canvas');
  c.width = 960; c.height = 640;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 380);
  sky.addColorStop(0, tok('--prp-seq-200')); sky.addColorStop(1, tok('--prp-seq-100'));
  g.fillStyle = sky; g.fillRect(0, 0, 960, 400);
  g.fillStyle = tok('--prp-seq-500'); g.fillRect(0, 430, 960, 210);           // river
  g.fillStyle = tok('--prp-line-strong'); g.fillRect(0, 400, 960, 30);        // quay wall
  g.fillStyle = tok('--prp-surface-3'); g.fillRect(180, 250, 600, 150);       // building
  g.fillStyle = tok('--prp-line'); for (let x = 300; x < 660; x += 40) g.fillRect(x, 270, 14, 130); // columns
  g.fillStyle = tok('--prp-surface-3'); g.beginPath(); g.moveTo(430, 250); g.lineTo(480, 200); g.lineTo(530, 250); g.fill(); // pediment
  g.beginPath(); g.arc(480, 175, 34, Math.PI, 0); g.fill(); g.fillRect(470, 120, 20, 30); // dome and drum
  g.fillStyle = tok('--prp-text'); g.font = '600 22px system-ui, sans-serif';
  g.fillText('PRP sample image: not a real photograph', 24, 40);
  g.font = '16px system-ui, sans-serif'; g.fillText('Generated in your browser, with metadata for a public place', 24, 66);
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
  const bytes = insertExif(new Uint8Array(await blob.arrayBuffer()), sampleExif());
  check(new File([bytes], 'prp-sample-georges-quay-dublin.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
}

/* ---------- Checking a file ---------- */
async function check(file) {
  const me = ++seq, out = $('#media-out', panelEl);
  urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
  if (map) { map.remove(); map = null; tiles = []; tileTheme = ''; }
  if (file.size > MAX_BYTES) { out.innerHTML = `<div class="prp-note bad">That file is ${esc(formatBytes(file.size))}. This page reads files up to ${formatBytes(MAX_BYTES)}; use ExifTool for larger ones.</div>`; return; }
  out.innerHTML = '<div class="prp-panel"><div class="loading">Reading the file on this device…</div></div>';
  let buf;
  try { buf = await readFile(file); } catch (e) { out.innerHTML = `<div class="prp-note bad">The file could not be read (${esc(e.message)}).</div>`; return; }
  if (me !== seq) return;
  const meta = readMetadata(buf);
  current = { file, meta, hash: '' };
  const imgUrl = URL.createObjectURL(file); urls.push(imgUrl);
  let thumbUrl = '';
  if (meta.thumbnail) { thumbUrl = URL.createObjectURL(new Blob([new Uint8Array(buf, meta.thumbnail.offset, meta.thumbnail.length)], { type: 'image/jpeg' })); urls.push(thumbUrl); }
  const groups = describe(meta), notes = assess(meta);
  const gp = meta.gps;
  out.innerHTML = `
    <div class="media-grid">
      <div class="prp-panel">
        <div class="prp-panel-head"><h2 class="prp-h2">The file</h2><span class="prp-label">${esc(FORMAT_NAMES[meta.format] || meta.format)}</span></div>
        <div class="preview">
          ${thumbUrl ? `<div class="thumbs"><figure><img src="${imgUrl}" alt="The image you checked"><figcaption>Main image</figcaption></figure><figure><img src="${thumbUrl}" alt="The thumbnail stored inside the file"><figcaption>Embedded thumbnail</figcaption></figure></div>` : `<div class="img"><img src="${imgUrl}" alt="The image you checked"></div>`}
          <dl class="kv">
            <dt>Name</dt><dd class="break">${esc(file.name)}</dd>
            <dt>Size</dt><dd>${esc(formatBytes(file.size))}${meta.width ? ` · ${meta.width} × ${meta.height} pixels` : ''}</dd>
            <dt>SHA-256</dt><dd><code class="mono break" id="media-hash">computing…</code></dd>
            <dt>File date</dt><dd>${esc(utcLabel(file.lastModified))}<span class="sub">From your computer, not from the image: copying a file can change it</span></dd>
          </dl>
          <div class="btn-row"><button type="button" class="prp-btn sm" id="media-copy-hash" disabled>Copy the hash</button><button type="button" class="prp-btn sm primary" id="media-add">Add to the notebook</button></div>
        </div>
      </div>
      <div class="prp-panel">
        <div class="prp-panel-head"><h2 class="prp-h2">What the metadata says</h2><span class="prp-label">${groups.length ? `${groups.reduce((n, g) => n + g.rows.length, 0)} fields` : 'Nothing found'}</span></div>
        ${groups.length ? `<div class="meta-groups">${groups.map(g => `<section class="meta-group${g.group.startsWith('Details that') ? ' personal' : ''}"><h3>${esc(g.group)}</h3>${g.group.startsWith('Details that') ? '<p class="small muted" style="margin:0 0 8px">Personal data: note these only if your question needs them, and never publish them.</p>' : ''}<dl class="kv">${g.rows.map(r => `<dt>${esc(r.label)}</dt><dd${r.mono ? ' class="mono"' : ''}>${esc(r.value)}</dd>`).join('')}</dl></section>`).join('')}</div>`
          : '<p class="prp-empty">No camera, location, editing or caption metadata in this file.</p>'}
        ${meta.warnings.length ? `<div class="panel-foot">${meta.warnings.map(esc).join(' ')}</div>` : ''}
      </div>
    </div>
    <div class="prp-panel"><div class="prp-panel-head"><h2 class="prp-h2">What this can and can’t tell you</h2></div><div class="assess">${notes.map(n => `<p class="${n.tone}">${esc(n.text)}${n.text.startsWith('Content Credentials') ? ` <a href="https://contentcredentials.org/verify" target="_blank" rel="noopener noreferrer">Open the inspector<span class="sr-only"> (opens in a new tab)</span></a> (it uploads the file to that service).` : ''}</p>`).join('') || '<p>Nothing notable.</p>'}</div></div>
    ${gp && !gp.nullIsland ? mapPanel(gp, meta) : ''}
    <details class="prp-panel"><summary class="prp-panel-head" style="cursor:pointer"><b>All fields read</b><span class="prp-label">for checking against ExifTool</span></summary><div class="prp-panel-body"><pre class="raw">${esc(rawDump(meta))}</pre></div></details>`;
  $('#media-add', panelEl).onclick = addToNotebook;
  if (gp && !gp.nullIsland) drawMap(gp, me);
  const hex = await sha256Hex(buf);
  if (me !== seq) return;
  current.hash = hex;
  $('#media-hash', panelEl).textContent = hex;
  const cb = $('#media-copy-hash', panelEl); cb.disabled = false; cb.onclick = () => copyText(hex, 'Hash copied');
  ctxRef.log({ kind: 'note', text: `Read the metadata of ${file.name} (SHA-256 ${hex})` });
}

function rawDump(meta) {
  const fmt = v => Array.isArray(v) ? (Array.isArray(v[0]) ? v.map(r => `${r[0]}/${r[1]}`).join(' ') : v.length === 2 && typeof v[0] === 'number' && v[1] > 1 && v[0] % 1 === 0 ? `${v[0]}/${v[1]}` : v.join(' ')) : v && typeof v === 'object' ? JSON.stringify(v) : String(v);
  const lines = [`Format: ${FORMAT_NAMES[meta.format] || meta.format}${meta.tiff ? ` · EXIF in ${meta.tiff.where} (${meta.tiff.littleEndian ? 'little' : 'big'}-endian)` : ''}`];
  for (const [ifd, label] of [['ifd0', 'IFD0'], ['exif', 'EXIF'], ['gps', 'GPS']]) for (const [k, v] of Object.entries(meta.tiff?.[ifd] || {})) lines.push(`${label}:${k} = ${fmt(v)}`);
  for (const [k, v] of Object.entries(meta.iptc || {})) lines.push(`IPTC:${k} = ${v}`);
  for (const t of meta.pngText) lines.push(`PNG text ${t.key} = ${t.value.slice(0, 500)}`);
  for (const [k, v] of Object.entries(meta.xmp?.fields || {})) lines.push(`XMP ${k} = ${v}`);
  for (const h of meta.xmp?.history || []) lines.push(`XMP history: ${[h.action, h.software, h.when, h.changed].filter(Boolean).join(' · ')}`);
  if (meta.c2pa) lines.push(`C2PA: manifest found (${meta.c2pa.where})`);
  if (meta.xmpRaw) lines.push('', '--- XMP packet ---', meta.xmpRaw.slice(0, 20000));
  return lines.join('\n');
}

function mapPanel(gp, meta) {
  const t = exifDate(meta.tiff?.exif?.DateTimeOriginal, meta.tiff?.exif?.OffsetTimeOriginal);
  const links = mapLinks(gp.lat, gp.lon, t?.day || '', t?.time || '');
  const geo = prpLink('rt', 'geoint', 'geoint/index.html');
  return `<div class="prp-panel"><div class="prp-panel-head"><h2 class="prp-h2">Recorded position</h2><span class="prp-label mono">${esc(formatLatLon(gp.lat, gp.lon))}</span></div><div class="prp-panel-body">
    <figure class="prp-figure"><div class="map" id="media-map" role="img" aria-label="Map of the position recorded in the file: ${esc(formatLatLon(gp.lat, gp.lon))}"></div>
    <figcaption><b>Figure 1.</b> The position written into the file’s GPS metadata${gp.accuracy != null ? `, with the device’s reported accuracy (dashed circle, ± ${Math.round(gp.accuracy)} m)` : ''}${gp.direction != null ? ` and the direction the camera faced (${Math.round(gp.direction)}°, shaded)` : ''}. A recorded position is a claim to check against the scene, not proof. Tiles: Esri.</figcaption></figure>
    <div class="map-links">${[['OpenStreetMap', links.osm], ['Google Maps', links.google], [t ? 'Sun position on that day (SunCalc)' : 'Sun position (SunCalc)', links.suncalc]].map(([n, u]) => `<a class="prp-btn sm" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n)}<span class="sr-only"> (opens in a new tab)</span></a>`).join('')}<a class="prp-btn sm" href="${esc(geo.href)}" target="${geo.target}">Satellite imagery in the GEOINT dashboard</a></div>
    <p class="small muted">If the position is a private home, or points to a private person, do not publish it.</p></div></div>`;
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return leaflet ||= new Promise((ok, no) => {
    const css = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: LEAFLET.css, integrity: LEAFLET.cssSri, crossOrigin: '' });
    document.head.prepend(css); // before osint.css, so the page's theme overrides win
    const s = Object.assign(document.createElement('script'), { src: LEAFLET.js, integrity: LEAFLET.jsSri, crossOrigin: '' });
    s.onload = () => ok(window.L); s.onerror = () => { leaflet = null; no(new Error('the map library did not load')); };
    document.head.append(s);
  });
}
const theme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function setTiles() {
  if (!map || !window.L) return;
  const t = theme();
  if (t === tileTheme) return;
  tileTheme = t;
  BASEMAP[t].forEach((name, i) => {
    const url = `${ESRI}${name}/MapServer/tile/{z}/{y}/{x}`;
    if (tiles[i]) tiles[i].setUrl(url);
    else tiles[i] = window.L.tileLayer(url, { attribution: i ? '' : 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors', maxZoom: 16, maxNativeZoom: 16 }).addTo(map);
  });
}
async function drawMap(gp, me) {
  let L;
  try { L = await loadLeaflet(); } catch (e) { const el = $('#media-map', panelEl); if (el) el.innerHTML = `<div class="panel-msg bad">The map could not load (${esc(e.message)}). The links below still work.</div>`; return; }
  if (me !== seq || !$('#media-map', panelEl)) return;
  const at = [gp.lat, gp.lon], layers = [];
  map = L.map('media-map', { scrollWheelZoom: false, maxZoom: 18 }).setView(at, 16); // a view first: circles need one to project
  setTiles();
  if (gp.accuracy != null && gp.accuracy > 0) layers.push(L.circle(at, { radius: gp.accuracy, className: 'map-acc', interactive: false }));
  if (gp.direction != null) {
    const d = Math.max(60, Math.min(400, (gp.accuracy || 20) * 4)), pts = [at];
    for (let a = -30; a <= 30; a += 10) {
      const th = ((gp.direction + a) * Math.PI) / 180;
      pts.push([gp.lat + (d * Math.cos(th)) / 111320, gp.lon + (d * Math.sin(th)) / (111320 * Math.cos((gp.lat * Math.PI) / 180))]);
    }
    layers.push(L.polygon(pts, { className: 'map-cone', interactive: false }));
  }
  const pt = L.circleMarker(at, { radius: 7, className: 'map-point' }).bindTooltip(`Recorded position<br>${esc(formatLatLon(gp.lat, gp.lon))}${gp.direction != null ? `<br>Facing ${Math.round(gp.direction)}°` : ''}`, { direction: 'top' });
  layers.push(pt);
  const group = L.featureGroup(layers).addTo(map);
  map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 16 });
}

function addToNotebook() {
  if (!current) return;
  const { file, meta, hash } = current;
  const ex = meta.tiff?.exif || {}, t = exifDate(ex.DateTimeOriginal, ex.OffsetTimeOriginal), cam = cameraName(meta.tiff?.ifd0 || {});
  const parts = [cam && `made with ${cam}`, t && `taken ${t.text}${t.offset ? ' UTC' + t.offset : ' (no time zone)'}`, meta.gps && !meta.gps.nullIsland && `at ${formatLatLon(meta.gps.lat, meta.gps.lon)}`].filter(Boolean);
  ctxRef.addToNotebook({
    claim: `Image ${file.name}: ${parts.length ? 'metadata says it was ' + parts.join(', ') : 'no camera, time or location metadata'}`,
    hash, accessed: isoDay(), eventDate: t?.day || '', tags: ['image'],
    notes: assess(meta).map(n => '- ' + n.text).join('\n'),
  });
}
