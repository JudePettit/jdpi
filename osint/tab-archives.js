// OSINT Dashboard · Archives: is a page in the Wayback Machine (availability API, keyless, CORS-enabled); one capture a
// year by sampling that API; the full capture list from the CDX API, which browsers cannot read directly (it sends no
// CORS header), so the page opens it for the user to paste back; Save Page Now and archive.today as links; and SHA-256
// hashing of the user's own captures, on this device.
import {
  esc, normaliseUrl, waybackAvailabilityUrl, parseAvailability, waybackCalendarUrl, savePageNowUrl, archiveTodayUrls, cdxUrl, parseCdx,
  markChanges, yearSampleTimestamps, distinctCaptures, utcLabel, dayLabel, isoDay, sha256Hex, formatBytes, waybackTimestamp,
} from './lib.js';
import { $, fetchData, failText, copyText, wireDropzone, readFile, num } from './ui.js';

const EXAMPLES = ['https://www.gov.ie/en/', 'https://www.gdeltproject.org/', 'https://www.bbc.com/news'];
let panelEl, ctxRef, current = null, run = 0;

export function init(panel, ctx) {
  panelEl = panel; ctxRef = ctx;
  const form = $('#arch-form', panel);
  $('#arch-examples', panel).insertAdjacentHTML('beforeend', EXAMPLES.map(u => `<button type="button" class="prp-chip" data-url="${esc(u)}">${esc(u.replace(/^https:\/\//, ''))}</button>`).join(''));
  $('#arch-examples', panel).addEventListener('click', e => { const b = e.target.closest('[data-url]'); if (b) { form.url.value = b.dataset.url; check(); } });
  form.addEventListener('submit', e => { e.preventDefault(); check(); });
  wireDropzone($('#arch-drop', panel), $('#arch-file', panel), hashFile);
  if (ctx.state.q) { form.url.value = ctx.state.q; check(); }
}

export function show(state) {
  const form = $('#arch-form', panelEl);
  if (state.q && normaliseUrl(state.q) !== current?.url) { form.url.value = state.q; check(); }
}

async function check() {
  const form = $('#arch-form', panelEl), out = $('#arch-out', panelEl);
  const url = normaliseUrl(form.url.value);
  if (!url) { out.innerHTML = '<div class="prp-note bad">Enter a web address, such as <code>www.example.com/page</code>.</div>'; return; }
  form.url.value = url;
  const date = form.date.value;
  const me = ++run;
  current = { url, date, oldest: null, newest: null, closest: null };
  ctxRef.setParam({ q: url });
  ctxRef.log({ kind: 'lookup', text: `Wayback Machine check: ${url}`, url: waybackCalendarUrl(url) });
  out.innerHTML = '<div class="prp-panel"><div class="loading">Asking the Wayback Machine…</div></div>';
  const ask = ts => fetchData(waybackAvailabilityUrl(url, ts), { timeout: 25000 });
  const [newestR, oldestR, closestR] = await Promise.all([ask(''), ask('19960101'), date ? ask(waybackTimestamp(date)) : Promise.resolve(null)]);
  if (me !== run) return;
  if (!newestR.ok && !oldestR.ok) { out.innerHTML = `<div class="prp-note bad">${esc(failText(newestR, 'The Wayback Machine'))} You can still <a href="${esc(waybackCalendarUrl(url))}" target="_blank" rel="noopener noreferrer">open its calendar for this page</a>.</div>`; return; }
  current.newest = newestR.ok ? parseAvailability(newestR.json) : null;
  current.oldest = oldestR.ok ? parseAvailability(oldestR.json) : null;
  current.closest = closestR?.ok ? parseAvailability(closestR.json) : null;
  render();
}

function kpi(label, cap, extra = '') {
  return `<div class="prp-kpi"><span>${esc(label)}</span><b>${cap ? esc(dayLabel(cap.date)) : '—'}</b><small>${cap ? `${esc(utcLabel(cap.date).split(', ')[1] || '')} · <a href="${esc(cap.url)}" target="_blank" rel="noopener noreferrer">open the capture<span class="sr-only"> (opens in a new tab)</span></a>` : esc(extra)}</small></div>`;
}

function render() {
  const { url, date, oldest, newest, closest } = current;
  const archived = !!(oldest || newest);
  const at = archiveTodayUrls(url);
  const years = archived ? `${(oldest?.date || newest.date).getUTCFullYear()}–${(newest?.date || oldest.date).getUTCFullYear()}` : '';
  $('#arch-out', panelEl).innerHTML = `
    <div class="prp-kpis arch-kpis">
      <div class="prp-kpi"><span>In the Wayback Machine</span><b>${archived ? 'Yes' : 'No captures'}</b><small>${archived ? 'Captures span ' + esc(years) : 'Save it now, below'}</small></div>
      ${kpi('Oldest capture', oldest, 'None found')}
      ${kpi('Newest capture', newest, 'None found')}
      ${date ? kpi('Closest to ' + dayLabel(date), closest, 'None found') : ''}
    </div>
    <div class="prp-panel">
      <div class="prp-panel-head"><h2 class="prp-h2">Save and compare</h2><span class="prp-label break">${esc(url)}</span></div>
      <div class="prp-panel-body arch-save">
        <div class="save-card"><h3>Save Page Now</h3><p>Ask the Internet Archive to capture the page as it is now. Check the capture when it finishes.</p><div class="btn-row"><a class="prp-btn primary sm" href="${esc(savePageNowUrl(url))}" target="_blank" rel="noopener noreferrer">Save in the Wayback Machine</a></div></div>
        <div class="save-card"><h3>Every capture by date</h3><p>The Wayback Machine’s calendar for this address, to compare versions.</p><div class="btn-row"><a class="prp-btn sm" href="${esc(waybackCalendarUrl(url))}" target="_blank" rel="noopener noreferrer">Open the calendar</a></div></div>
        <div class="save-card caution"><h3>archive.today (use with caution)</h3><p>Often captures what the Wayback Machine cannot, but English Wikipedia deprecated it in February 2026 after its CAPTCHA page ran a denial-of-service script and some snapshots were found altered. Keep it as a secondary copy only.</p><div class="btn-row"><a class="prp-btn sm" href="${esc(at.newest)}" target="_blank" rel="noopener noreferrer">Newest copy</a><a class="prp-btn sm" href="${esc(at.list)}" target="_blank" rel="noopener noreferrer">All copies</a><a class="prp-btn sm ghost" href="${esc(at.save)}" target="_blank" rel="noopener noreferrer">Save</a></div></div>
        <div class="save-card"><h3>Log it</h3><p>Add the page and its newest capture to the case notebook, to grade later.</p><div class="btn-row"><button type="button" class="prp-btn sm" id="arch-add">Add to the notebook</button></div></div>
      </div>
    </div>
    <div class="prp-panel" id="arch-years-panel">
      <div class="prp-panel-head"><h2 class="prp-h2">One capture a year</h2><button type="button" class="prp-btn sm" id="arch-years-btn"${archived ? '' : ' disabled'}>Find them</button></div>
      <div class="prp-panel-body"><p class="small muted" id="arch-years-status">Asks the availability API for the capture nearest to 1 July of each year, from the oldest capture to now: a quick way to see how a page changed. Each request goes from your browser to archive.org.</p><div class="years" id="arch-years"></div></div>
    </div>
    <div class="prp-panel" id="arch-cdx-panel">
      <div class="prp-panel-head"><h2 class="prp-h2">Every capture (CDX)</h2><button type="button" class="prp-btn sm" id="arch-cdx-btn"${archived ? '' : ' disabled'}>Open the list</button></div>
      <div class="prp-panel-body" id="arch-cdx"><p class="small muted">The CDX API lists every capture with its HTTP status, type and a fingerprint of its content, so you can see exactly when the page changed.</p></div>
    </div>`;
  $('#arch-add', panelEl).onclick = () => ctxRef.addToNotebook({ claim: `Archived copy of ${url}`, url, archive: newest?.url || oldest?.url || '', accessed: isoDay(), notes: archived ? `Wayback Machine captures from ${dayLabel(oldest?.date || newest.date)} to ${dayLabel(newest?.date || oldest.date)}.` : 'No Wayback Machine capture found when checked.' });
  $('#arch-years-btn', panelEl).onclick = sampleYears;
  $('#arch-cdx-btn', panelEl).onclick = loadCdx;
}

async function sampleYears() {
  const { url, oldest, newest } = current, me = run;
  const btn = $('#arch-years-btn', panelEl), status = $('#arch-years-status', panelEl), box = $('#arch-years', panelEl);
  const from = (oldest?.date || newest.date).getUTCFullYear(), to = new Date().getUTCFullYear();
  const stamps = yearSampleTimestamps(from, to);
  btn.disabled = true; box.innerHTML = '';
  const found = [];
  for (let i = 0; i < stamps.length; i++) {
    if (me !== run) return;
    status.textContent = `Asking for ${stamps[i].slice(0, 4)} (${i + 1} of ${stamps.length})…`;
    const r = await fetchData(waybackAvailabilityUrl(url, stamps[i]), { timeout: 20000 });
    const cap = r.ok ? parseAvailability(r.json) : null;
    if (cap) found.push(cap);
    const caps = distinctCaptures(found);
    box.innerHTML = caps.map(c => `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer"><b>${c.date.getUTCFullYear()}</b><small>${esc(dayLabel(c.date).replace(/ \d{4}$/, ''))}</small><span class="sr-only"> (opens in a new tab)</span></a>`).join('');
    await new Promise(ok => setTimeout(ok, 250));
  }
  const n = distinctCaptures(found).length;
  status.textContent = `${num(n)} distinct capture${n === 1 ? '' : 's'} found across ${num(stamps.length)} years. Years with no capture of their own share their neighbour’s.`;
  btn.disabled = false;
}

async function loadCdx() {
  const { url } = current;
  const box = $('#arch-cdx', panelEl), link = cdxUrl(url, { limit: 500, collapseDigest: true });
  // Browsers cannot read the CDX API (no CORS header, checked 28 October 2026), so the list is opened for the user to paste back.
  box.innerHTML = `<p class="small">Browsers can’t read the Wayback CDX API from another site: it sends no CORS header (checked 28 October 2026). Open the list in a new tab, select everything (<kbd>Ctrl</kbd>+<kbd>A</kbd> or <kbd>Cmd</kbd>+<kbd>A</kbd>), copy it and paste it below (in Firefox, choose <b>Raw Data</b> first). Nothing leaves your browser.</p>
    <div class="btn-row"><a class="prp-btn primary sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open the capture list (changes only, up to 500)</a><a class="prp-btn sm" href="${esc(cdxUrl(url, { limit: 2000, collapseDigest: false }))}" target="_blank" rel="noopener noreferrer">Every capture (up to 2,000)</a></div>
    <label class="field" style="margin-top:12px"><span class="prp-label">Paste the list here</span><textarea class="prp-input area cdx-paste" id="cdx-paste" spellcheck="false" placeholder='[["timestamp","original","statuscode",…], …]'></textarea></label>
    <div class="btn-row" style="margin-top:8px"><button type="button" class="prp-btn sm" id="cdx-read">Read the list</button><span class="small error-text" id="cdx-err" role="alert"></span></div>`;
  $('#cdx-read', panelEl).onclick = () => {
    try { showCdx($('#cdx-paste', panelEl).value, 'Read from the list you pasted.'); }
    catch (e) { $('#cdx-err', panelEl).textContent = e.message; }
  };
}

function showCdx(text, how) {
  const rows = markChanges(parseCdx(text));
  const box = $('#arch-cdx', panelEl);
  if (!rows.length) throw new Error('No captures found in that text. Copy the whole page, from the first [ to the last ].');
  let only200 = false;
  const draw = () => {
    const list = rows.filter(r => !only200 || r.status === '200');
    const versions = rows.filter(r => r.changed).length;
    box.innerHTML = `<p class="small">${esc(how)} <b>${num(rows.length)}</b> captures from ${esc(dayLabel(rows[0].date))} to ${esc(dayLabel(rows.at(-1).date))}, <b>${num(versions)}</b> with new content (marked <span class="changed-dot" aria-hidden="true"></span>).</p>
      <label class="check"><input type="checkbox" id="cdx-200"${only200 ? ' checked' : ''}> Only successful captures (HTTP 200)</label>
      <div class="scroll" style="margin-top:8px"><table class="prp-table cdx-table"><thead><tr><th scope="col">Captured (UTC)</th><th scope="col">Status</th><th scope="col">Type</th><th scope="col" class="num">Size</th><th scope="col">Address</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${list.slice(-500).reverse().map(r => `<tr><td class="mono">${r.changed ? '<span class="changed-dot" title="New content" aria-label="New content"></span>' : ''}${esc(utcLabel(r.date).replace(' UTC', ''))}</td><td class="mono">${esc(r.status || '–')}</td><td>${esc(r.mime)}</td><td class="num mono">${r.length ? esc(formatBytes(r.length)) : ''}</td><td class="break"><a href="${esc(r.capture)}" target="_blank" rel="noopener noreferrer">${esc(r.original)}<span class="sr-only"> (opens in a new tab)</span></a></td><td><button type="button" class="prp-btn sm ghost" data-ts="${esc(r.timestamp)}">Add</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#cdx-200', panelEl).onchange = e => { only200 = e.target.checked; draw(); };
    box.querySelector('tbody').onclick = e => {
      const b = e.target.closest('[data-ts]'); if (!b) return;
      const r = rows.find(x => x.timestamp === b.dataset.ts);
      ctxRef.addToNotebook({ claim: `Wayback capture of ${r.original} on ${dayLabel(r.date)}`, url: r.original.replace(/^http:\/\/([^/]+):80\//, 'http://$1/'), archive: r.capture, accessed: isoDay(), eventDate: isoDay(r.date), notes: `HTTP ${r.status}; ${r.mime}; content digest ${r.digest}.` });
    };
  };
  draw();
}

async function hashFile(file) {
  const out = $('#arch-hash-out', panelEl);
  out.innerHTML = '<div class="loading">Hashing on this device…</div>';
  try {
    const buf = await readFile(file);
    const hex = await sha256Hex(buf);
    out.innerHTML = `<div class="hash-out"><dl class="kv"><dt>File</dt><dd class="break">${esc(file.name)}</dd><dt>Size</dt><dd>${esc(formatBytes(file.size))} (${num(file.size)} bytes)</dd><dt>Type</dt><dd>${esc(file.type || 'unknown')}</dd><dt>Last modified</dt><dd>${esc(utcLabel(file.lastModified))} <span class="sub">from your computer’s file system, not from the file’s contents</span></dd></dl>
      <code id="arch-hex">${hex}</code><div class="btn-row"><button type="button" class="prp-btn sm" id="arch-copy">Copy the hash</button><button type="button" class="prp-btn sm primary" id="arch-hash-add">Add to the notebook</button></div></div>`;
    $('#arch-copy', panelEl).onclick = () => copyText(hex, 'Hash copied');
    $('#arch-hash-add', panelEl).onclick = () => ctxRef.addToNotebook({ claim: `Captured file ${file.name}`, url: current?.url || '', archive: current?.newest?.url || '', hash: hex, accessed: isoDay(), notes: `${formatBytes(file.size)}, ${file.type || 'unknown type'}. SHA-256 computed in the OSINT Dashboard on ${utcLabel(new Date())}.` });
    ctxRef.log({ kind: 'capture', text: `Hashed ${file.name}: SHA-256 ${hex}` });
  } catch (e) {
    out.innerHTML = `<p class="small error-text">The file could not be read (${esc(e.message)}).</p>`;
  }
}
