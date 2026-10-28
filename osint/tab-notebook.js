// OSINT Dashboard · Case notebook: claims with their source, archived copy, dates, Admiralty grades (reliability A–F,
// credibility 1–6), notes, tags and file hashes, kept per case in this browser. Views: items, a timeline by event date,
// a numbered sources table for the write-up, and the activity log. Export and import as JSON or Markdown.
import {
  esc, RELIABILITY, CREDIBILITY, gradeCode, gradeLabel, caseStats, timelineGroups, sourcesTable, sourcesMarkdown, exportJson,
  exportMarkdown, importNotebook, isoDay, dayLabel, utcLabel, safeHttpUrl, normaliseUrl, waybackAvailabilityUrl, parseAvailability, savePageNowUrl, LESSONS, lessonSlug,
} from './lib.js';
import { $, $$, num, toast, copyText, download, readTextFile, fetchData, courseLink } from './ui.js';

let panelEl, ctxRef, store, form, view = 'items', editing = '';
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'case';

export function init(panel, ctx) {
  panelEl = panel; ctxRef = ctx; store = ctx.store; form = $('#nb-form', panel);
  $('#nb-rel', panel).innerHTML = '<option value="">Not graded</option>' + Object.entries(RELIABILITY).map(([k, v]) => `<option value="${k}">${k} · ${esc(v)}</option>`).join('');
  $('#nb-cred', panel).innerHTML = '<option value="">Not graded</option>' + Object.entries(CREDIBILITY).map(([k, v]) => `<option value="${k}">${k} · ${esc(v)}</option>`).join('');
  const l = courseLink(lessonSlug(LESSONS.grading));
  $('#nb-grades', panel).innerHTML = `<div class="grades-tables">
    <table class="prp-table"><thead><tr><th scope="col">Letter</th><th scope="col">Source reliability</th></tr></thead><tbody>${Object.entries(RELIABILITY).map(([k, v]) => `<tr><td class="mono">${k}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
    <table class="prp-table"><thead><tr><th scope="col">Number</th><th scope="col">Information credibility</th></tr></thead><tbody>${Object.entries(CREDIBILITY).map(([k, v]) => `<tr><td class="mono">${k}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>
    <p class="small" style="margin:12px 0 0">Grade the two separately: a usually reliable agency can relay a claim it could not check (B3), and an unknown new account can post something satellite imagery confirms (F1). The source is whoever originated the information, not the platform that carried it. Course: <a href="${esc(l.href)}" target="${l.target}">${esc(LESSONS.grading)}</a>.</p>`;
  form.accessed.value = isoDay();
  form.addEventListener('submit', save);
  $('#nb-cancel', panel).addEventListener('click', resetForm);
  $('#nb-find-archive', panel).addEventListener('click', findArchive);
  $('#nb-case', panel).addEventListener('change', e => store.setCurrent(e.target.value));
  $('#nb-new', panel).addEventListener('click', () => { const t = prompt('Name the new case', 'New case'); if (t !== null) { store.addCase(t.trim() || 'New case'); toast('Case created'); } });
  $('#nb-rename', panel).addEventListener('click', () => { const t = prompt('Rename this case', store.current().title); if (t !== null && t.trim()) store.renameCase(t); });
  $('#nb-delete', panel).addEventListener('click', () => {
    const c = store.current();
    if (confirm(`Delete the case “${c.title}” and its ${c.items.length} item${c.items.length === 1 ? '' : 's'} from this browser? Export it first if you may need it.`)) { store.deleteCase(); toast('Case deleted'); }
  });
  $('#nb-export-json', panel).addEventListener('click', () => { const c = store.current(); download(`${slug(c.title)}-${isoDay()}.json`, exportJson(c), 'application/json'); });
  $('#nb-export-md', panel).addEventListener('click', () => { const c = store.current(); download(`${slug(c.title)}-${isoDay()}.md`, exportMarkdown(c), 'text/markdown'); });
  $('#nb-import', panel).addEventListener('change', importFile);
  $('#nb-views', panel).addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) { view = b.dataset.view; render(); } });
  $('#nb-filter', panel).addEventListener('input', render);
  $('#nb-view', panel).addEventListener('click', viewAction);
  store.on(() => { if (editing && !store.current().items.some(i => i.id === editing)) resetForm(); render(); });
  render();
}
export function show() { render(); }

function render() {
  if (!panelEl) return;
  const c = store.current(), s = caseStats(c);
  $('#nb-case', panelEl).innerHTML = store.data.cases.map(x => `<option value="${esc(x.id)}"${x.id === c.id ? ' selected' : ''}>${esc(x.title)} (${x.items.length})</option>`).join('');
  $('#nb-kpis', panelEl).innerHTML = [['Items', s.items, ''], ['Graded', s.graded, s.items ? `${Math.round((s.graded / s.items) * 100)}% of items` : ''], ['Archived', s.archived, 'with an archive link'], ['Sources', s.sources, 'distinct addresses'], ['Confirmed', s.confirmed, 'credibility 1']]
    .map(([k, v, sub]) => `<div class="prp-kpi"><span>${k}</span><b>${num(v)}</b><small>${esc(sub)}</small></div>`).join('')
    + (store.persistent ? '' : '<div class="prp-kpi"><span>Storage</span><b>Blocked</b><small>Export before you close this tab</small></div>');
  $$('#nb-views [data-view]', panelEl).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  $('#nb-filter', panelEl).closest('.field').hidden = view === 'log' || view === 'sources';
  const box = $('#nb-view', panelEl);
  if (view === 'items') box.innerHTML = itemsView(c);
  else if (view === 'timeline') box.innerHTML = timelineView(c);
  else if (view === 'sources') box.innerHTML = sourcesView(c);
  else box.innerHTML = logView(c);
}

const filterText = () => $('#nb-filter', panelEl).value.trim().toLowerCase();
const matches = (i, f) => !f || [i.claim, i.notes, i.url, i.archive, i.tags.join(' ')].join(' ').toLowerCase().includes(f);
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const gradeChip = (i, cls = '') => (i.reliability && i.credibility)
  ? `<span class="grade ${cls}" title="${esc(gradeLabel(i.reliability, i.credibility))}">${gradeCode(i.reliability, i.credibility)}</span>`
  : `<span class="grade none ${cls}" title="Not graded yet">${i.reliability || i.credibility ? esc(gradeCode(i.reliability, i.credibility)) : cls === 'sm' ? '–<span class="sr-only"> not graded</span>' : 'grade<br>me'}</span>`;

function itemsView(c) {
  const f = filterText(), list = c.items.filter(i => matches(i, f));
  if (!c.items.length) return `<div class="prp-empty">This case is empty. Add a claim with the form, or use “Add to the notebook” on the other tabs: archive checks, domains, organisations, articles and images all send their findings here.</div>`;
  if (!list.length) return '<div class="prp-empty">No items match the filter.</div>';
  return `<ul class="items">${list.map(i => `<li>
      ${gradeChip(i)}
      <p class="claim">${esc(i.claim || i.url)}</p>
      <div class="info">${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(host(i.url))}<span class="sr-only"> (opens in a new tab)</span></a>` : '<span>No source address</span>'}
        ${i.archive ? `<a href="${esc(i.archive)}" target="_blank" rel="noopener noreferrer">archived copy<span class="sr-only"> (opens in a new tab)</span></a>` : '<span class="badge warn">not archived</span>'}
        <span>accessed ${esc(dayLabel(i.accessed))}</span>${i.eventDate ? `<span>event ${esc(dayLabel(i.eventDate))}</span>` : ''}${i.reliability && i.credibility ? `<span>${esc(gradeLabel(i.reliability, i.credibility))}</span>` : ''}</div>
      ${i.notes ? `<p class="notes">${esc(i.notes)}</p>` : ''}
      ${i.tags.length || i.hash ? `<div class="tags">${i.tags.map(t => `<span class="prp-chip">${esc(t)}</span>`).join('')}${i.hash ? `<span class="prp-chip mono" title="SHA-256 ${esc(i.hash)}">SHA-256 ${esc(i.hash.slice(0, 12))}…</span>` : ''}</div>` : ''}
      <div class="acts"><button type="button" class="prp-btn sm" data-edit="${esc(i.id)}">Edit</button>${i.url && !i.archive ? `<a class="prp-btn sm ghost" href="${esc(savePageNowUrl(i.url))}" target="_blank" rel="noopener noreferrer">Save Page Now</a>` : ''}<button type="button" class="prp-btn sm ghost" data-cite="${esc(i.id)}">Copy as citation</button><button type="button" class="prp-btn sm ghost danger" data-del="${esc(i.id)}">Delete</button></div>
    </li>`).join('')}</ul>
    <div class="view-actions"><button type="button" class="prp-btn sm" data-act="backup">Back up every case (JSON)</button><span class="small muted">The notebook is stored only in this browser; clearing site data deletes it.</span></div>`;
}

function timelineView(c) {
  const f = filterText();
  const groups = timelineGroups({ ...c, items: c.items.filter(i => matches(i, f)) });
  if (!groups.length) return '<div class="prp-empty">Nothing to put on a timeline yet. Give items an event date (when the thing happened) for a timeline of the event; items without one appear on the day you accessed them.</div>';
  const span = groups.length > 1 ? `${dayLabel(groups[0].date)} to ${dayLabel(groups.at(-1).date)}` : dayLabel(groups[0].date);
  return `<p class="small" style="margin:12px 14px 0">${num(groups.reduce((n, g) => n + g.entries.length, 0))} items, ${esc(span)}. Dates are event dates where given, otherwise the day accessed (marked).</p>
    <ol class="timeline">${groups.map(g => `<li><div class="when">${esc(dayLabel(g.date))}</div>${g.entries.map(x => `<div class="entry">${gradeChip(x.item, 'sm')}<div><p>${esc(x.item.claim || x.item.url)}</p><span>${x.byEvent ? '' : 'accessed, no event date · '}${x.item.url ? `<a href="${esc(x.item.url)}" target="_blank" rel="noopener noreferrer">${esc(host(x.item.url))}</a>` : 'no source'}${x.item.archive ? ` · <a href="${esc(x.item.archive)}" target="_blank" rel="noopener noreferrer">archived</a>` : ''}</span></div></div>`).join('')}</li>`).join('')}</ol>`;
}

function sourcesView(c) {
  const rows = sourcesTable(c);
  if (!rows.length) return '<div class="prp-empty">No sources yet.</div>';
  return `<div class="scroll"><table class="prp-table"><thead><tr><th scope="col" class="num">#</th><th scope="col">Source</th><th scope="col">Archived copy</th><th scope="col">Accessed</th><th scope="col">Grade</th><th scope="col">Supports</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="num">${r.n}</td><td class="nowrap">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.domain)}</a>` : 'No source address'}</td><td>${r.archive ? `<a href="${esc(r.archive)}" target="_blank" rel="noopener noreferrer">archive</a>` : '<span class="badge warn">none</span>'}</td><td class="mono nowrap">${esc(r.accessed)}</td><td class="mono">${esc(r.grade || '—')}</td><td>${esc(r.claims.join('; ').slice(0, 220))}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="view-actions"><button type="button" class="prp-btn sm primary" data-act="copy-sources">Copy as a Markdown table</button><span class="small muted">One row per source address, numbered in the order you accessed them: paste it under your report.</span></div>`;
}

function logView(c) {
  if (!c.log.length) return '<div class="prp-empty">No activity yet. Searches you open on the Search and Events tabs and lookups on the other tabs are logged here (you can turn this off on the Search tab).</div>';
  return `<ul class="log-list">${[...c.log].reverse().slice(0, 500).map(l => `<li><time datetime="${esc(l.at)}">${esc(utcLabel(l.at))}</time><span class="kind">${esc(l.kind)}</span><span class="break">${esc(l.text)}${l.url ? ` · <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">open</a>` : ''}</span></li>`).join('')}</ul>
    <div class="view-actions"><button type="button" class="prp-btn sm" data-act="copy-log">Copy the log</button><button type="button" class="prp-btn sm ghost danger" data-act="clear-log">Clear the log</button><span class="small muted">${num(c.log.length)} entries, newest first. The log is your audit trail: it goes into both exports.</span></div>`;
}

function viewAction(e) {
  const t = e.target.closest('button'); if (!t) return;
  const c = store.current();
  if (t.dataset.edit) return edit(t.dataset.edit);
  if (t.dataset.del) { const i = c.items.find(x => x.id === t.dataset.del); if (i && confirm(`Delete “${(i.claim || i.url).slice(0, 80)}”?`)) store.deleteItem(i.id); return; }
  if (t.dataset.cite) { const i = c.items.find(x => x.id === t.dataset.cite); if (i) copyText(`${i.claim} Source: ${i.url || 'no address'}${i.archive ? ` (archived: ${i.archive})` : ''}, accessed ${i.accessed}${i.reliability && i.credibility ? `; graded ${gradeCode(i.reliability, i.credibility)}` : ''}.`, 'Citation copied'); return; }
  const act = t.dataset.act;
  if (act === 'backup') download(`osint-notebook-backup-${isoDay()}.json`, exportJson(store.data), 'application/json');
  else if (act === 'copy-sources') copyText(sourcesMarkdown(c), 'Sources table copied');
  else if (act === 'copy-log') copyText(c.log.map(l => `${l.at}\t${l.kind}\t${l.text}${l.url ? '\t' + l.url : ''}`).join('\n'), 'Log copied');
  else if (act === 'clear-log' && confirm('Clear this case’s activity log? Export the case first if you need it as an audit trail.')) store.clearLog();
}

function edit(id) {
  const i = store.current().items.find(x => x.id === id);
  if (!i) return;
  editing = id;
  for (const k of ['claim', 'url', 'archive', 'accessed', 'eventDate', 'reliability', 'credibility', 'notes', 'hash']) form[k].value = i[k] || '';
  form.tags.value = i.tags.join(', ');
  $('#nb-form-title', panelEl).textContent = 'Edit the claim';
  $('#nb-save', panelEl).textContent = 'Save changes';
  $('#nb-cancel', panelEl).hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.claim.focus({ preventScroll: true });
}
function resetForm() {
  editing = '';
  form.reset();
  form.accessed.value = isoDay();
  $('#nb-form-title', panelEl).textContent = 'Add a claim';
  $('#nb-save', panelEl).textContent = 'Add to the case';
  $('#nb-cancel', panelEl).hidden = true;
  $('#nb-archive-hint', panelEl).textContent = '';
}

function save(e) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(form));
  const bad = [];
  if (f.url && !safeHttpUrl(normaliseUrl(f.url))) bad.push('The source address is not a web address.');
  if (f.archive && !safeHttpUrl(normaliseUrl(f.archive))) bad.push('The archived copy is not a web address.');
  if (f.hash && !/^[a-f0-9]{64}$/i.test(f.hash.trim())) bad.push('A SHA-256 hash is 64 characters, 0–9 and a–f.');
  if (bad.length) { toast(bad.join(' '), { tone: 'bad' }); return; }
  const fields = { ...f, url: f.url ? normaliseUrl(f.url) : '', archive: f.archive ? normaliseUrl(f.archive) : '', hash: f.hash.trim() };
  if (editing) { store.updateItem(editing, fields); toast('Changes saved'); resetForm(); }
  else { store.addItem(fields); toast('Added to the case'); resetForm(); }
}

async function findArchive() {
  const hint = $('#nb-archive-hint', panelEl), url = normaliseUrl(form.url.value);
  if (!url) { hint.textContent = 'Enter the source address first.'; return; }
  hint.textContent = 'Asking the Wayback Machine…';
  const r = await fetchData(waybackAvailabilityUrl(url), { timeout: 20000 });
  const cap = r.ok ? parseAvailability(r.json) : null;
  if (cap) { form.archive.value = cap.url; hint.textContent = `Newest capture: ${utcLabel(cap.date)}. Check it shows the claim.`; }
  else hint.innerHTML = r.ok ? `Not archived yet. <a href="${esc(savePageNowUrl(url))}" target="_blank" rel="noopener noreferrer">Save it now</a>, then try again.` : 'The Wayback Machine did not answer. Try again in a minute.';
}

async function importFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const cases = importNotebook(await readTextFile(file));
    const added = store.importCases(cases);
    toast(`Imported ${added.length} case${added.length === 1 ? '' : 's'} (${added.reduce((n, c) => n + c.items.length, 0)} items)`);
  } catch (err) { toast(`Import failed: ${err.message}`, { tone: 'bad', ms: 8000 }); }
}
