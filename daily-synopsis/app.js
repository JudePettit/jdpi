// Daily Synopsis's page. It reads the days the build wrote (daily-synopsis/data: index.json, days/<day>.json and
// corrections.json), or the test fixture's with ?data=fixture, and shows one day at a time: #day=2026-11-21 is its
// address. Everything from the data is put on the page as text (textContent), never as markup, and a link is made only
// from an https address: the written text came from a model, and the headlines from publishers.
import { freshnessLine } from '../design/prp-freshness.js';
import '../design/prp-access.js'; // globalThis.PRPAccess: the Paywall and Sign-up labels
import '../design/prp-rsp.js'; // globalThis.PRPRsp: Wikipedia's list of perennial sources, the flag beside ⚠

const { PRPAccess, PRPRsp } = globalThis;
const $ = s => document.querySelector(s);
const FIXTURE = new URLSearchParams(location.search).get('data') === 'fixture';
const BASE = FIXTURE ? '../tests/fixtures/daily-synopsis/data/' : 'data/';
const SIDES = ['far_left', 'left', 'centre', 'right', 'far_right'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const NO_SIDE = 'None of Vitruvian Manager’s outlets on this side was found reporting it in the 24 hours.';
const NO_STORIES = 'No story met the threshold on this day: none was run by at least three of the Political Briefing’s publishers from at least two of the five sides.';

/** An element with attributes and children; strings become text nodes, never markup. */
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(typeof k === 'string' ? document.createTextNode(k) : k);
  return e;
}
/** A link to a publisher's article, or plain text when the address is not https. */
const safeHref = u => (/^https:\/\//i.test(String(u || '')) ? String(u) : null);
function link(url, text, attrs = {}) {
  const href = safeHref(url);
  return href ? el('a', { href, rel: 'noopener', ...attrs }, text) : el('span', {}, text);
}
const dateOf = d => { const t = new Date(`${d}T00:00:00Z`); return `${WEEKDAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`; };
const timeOf = iso => { const t = new Date(iso); return Number.isFinite(+t) ? `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')} UTC on ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}` : ''; };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

// CURRENT: the day being loaded or shown; SHOWN: the day whose stories are on the page.
let INDEX = null, CORR = [], RSP = PRPRsp.table(null), RSP_SETTLED = false, CURRENT = null, SHOWN = null, USED = null;
const cache = new Map();
const dayFile = d => { if (!cache.has(d)) cache.set(d, getJSON(`${BASE}days/${d}.json`)); return cache.get(d); };

/* ------------------------------------------------------------------------------------------- one day */
function sourceMarks(h) {
  const marks = [];
  if (h.caution) marks.push(el('span', { class: 'caution', title: 'Media Bias/Fact Check rates this publisher mixed or low for factual reliability.', 'aria-label': 'Caution: Media Bias/Fact Check rates this publisher mixed or low for factual reliability.' }, '⚠'));
  // Until Wikipedia's list has been read, an empty slot; filled in place when it arrives (the stories never wait).
  if (!RSP_SETTLED) marks.push(el('span', { class: 'rsp-slot', 'data-outlet': h.outletId, hidden: true }));
  else { const f = rspFlag(h.outletId); if (f) marks.push(f); }
  return marks;
}
function rspFlag(id) {
  const f = RSP.flag(id);
  if (!f) return null;
  const read = f.read ? `, read by Vitruvian Manager on ${PRPRsp.day(f.read)}` : '';
  const words = f.kind === 'none' ? 'Not on Wikipedia’s list' : f.kind === 'split' ? `Wikipedia varies by ${f.by}: see the list` : `Wikipedia ${f.words}`;
  const about = `${words}. Wikipedia’s list of perennial sources${read}: ${PRPRsp.WHAT} (opens in a new tab)`;
  return link(f.href, words, { class: `rsp${f.kind === 'none' ? ' none' : ''}`, target: '_blank', title: about, 'aria-label': about });
}
function fillFlags() {
  for (const s of document.querySelectorAll('.rsp-slot[data-outlet]')) { const f = rspFlag(s.dataset.outlet); if (f) s.replaceWith(f); else s.remove(); }
}
function headline(h) {
  const cls = h.access && !PRPAccess.isFree(h.access) ? h.access : null;
  const a = link(h.url, h.headline, { class: 'hl', id: `h-${CURRENT}-${h.id}` });
  if (cls) a.append(el('span', { class: 'prp-vh' }, ', '), el('span', { class: 'prp-access', 'data-access': cls, title: PRPAccess.TITLE[cls] || '' }, PRPAccess.LABEL[cls] || cls));
  return el('li', { class: 'headline' }, a, el('span', { class: 'by' }, el('span', { class: 'outlet' }, h.outlet), ...sourceMarks(h)));
}
/** A sentence of the written text, and links to the headlines it cites. */
function sentence(s, byId, tag = 'span') {
  const refs = s.cites.map(id => byId.get(id)).filter(Boolean);
  return el(tag, { class: 'sentence' }, s.text, ' ', el('span', { class: 'cites' }, '(',
    refs.flatMap((h, k) => [k ? ', ' : '', el('a', { href: `#day=${CURRENT}&h=${h.id}`, 'data-h': h.id, title: h.headline }, h.outlet)]), ')'));
}

function storyView(s, day) {
  const byId = new Map(s.headlines.map(h => [h.id, h]));
  const lead = byId.get(s.lead) || s.headlines[0];
  const sides = s.five.sides.filter(x => x.outlets > 0).length;
  const corr = CORR.filter(c => c.day === day.day && c.story === s.id);
  const li = el('li', { class: 'story prp-panel', id: `story-${s.id}`, 'aria-labelledby': `st-${s.id}` },
    el('h2', { class: 'prp-h2 story-h', id: `st-${s.id}` }, el('span', { class: 'rank' }, `${s.rank}.`), ' ', link(lead.url, lead.headline)),
    el('p', { class: 'story-meta prp-muted' }, `${plural(s.outlets, 'outlet')} · ${plural(sides, 'side')} of five · the first headline is ${lead.outlet}’s`),
    s.sentences ? el('p', { class: 'digest' }, s.sentences.flatMap((x, k) => [k ? ' ' : '', sentence(x, byId)])) : null,
    corr.length ? el('ul', { class: 'story-corr' }, corr.map(c => el('li', {}, el('b', {}, `Correction, ${dateOf(c.date)}:`), ' ', c.text))) : null,
    fiveView(s, day, byId));
  return li;
}

function fiveView(s, day, byId) {
  const f = s.five, w = f.status === 'published' ? f.written : null;
  const box = el('section', { class: 'five', 'aria-labelledby': `five-${s.id}` },
    el('h3', { class: 'prp-h3', id: `five-${s.id}` }, '5 Sided Analysis'));
  const list = el('ol', { class: 'sides' });
  for (const side of f.sides) {
    const hs = side.headlines.map(id => byId.get(id)).filter(Boolean);
    const item = el('li', { class: `side side-${side.key}${hs.length ? '' : ' empty'}`, 'data-side': side.key },
      el('h4', { class: 'side-h' }, el('span', { class: 'side-mark', 'aria-hidden': 'true' }), side.label, ' ', el('span', { class: 'count prp-muted' }, `· ${plural(side.outlets, 'outlet')}`)));
    if (hs.length) item.append(el('ul', { class: 'headlines' }, hs.map(headline)));
    else item.append(el('p', { class: 'no-side prp-muted' }, NO_SIDE));
    if (w && w.sides[side.key]) item.append(el('p', { class: 'written' }, w.sides[side.key].flatMap((x, k) => [k ? ' ' : '', sentence(x, byId)])));
    list.append(item);
  }
  box.append(list);
  if (w && w.closing) box.append(el('p', { class: 'closing' }, el('b', {}, w.closing.kind === 'same' ? 'Left and right of centre alike: ' : 'Left and right of centre: '), sentence(w.closing, byId)));
  if (f.note) box.append(el('p', { class: 'five-note prp-muted' }, f.note));
  box.append(el('p', { class: 'not-proof prp-muted' }, day.label.notProof));
  return box;
}

/** The link to the Method paragraph, which says where the five positions come from. The address keeps naming the day:
 *  the link takes the reader and the focus to the paragraph without changing it. */
function positionsLink() {
  const a = el('a', { href: '#positions', class: 'positions-link' }, 'Where the five positions come from');
  a.addEventListener('click', e => {
    const p = document.getElementById('positions');
    if (!p) return;
    e.preventDefault();
    p.scrollIntoView({ block: 'start' });
    p.focus({ preventScroll: true });
  });
  return a;
}

function labelView(day) {
  const box = $('#label');
  box.replaceChildren(...[
    el('p', { class: `authorship ${day.authorship}`, id: 'authorship' }, el('b', {}, day.authorship === 'model' ? 'Written by an AI model. ' : 'Assembled by rules. '), day.label.text),
    el('p', { class: 'five-label prp-muted' }, day.label.five, ' ', positionsLink()),
    day.written.status !== 'published' ? el('p', { class: 'unavailable', id: 'unavailable' }, day.written.note) : null,
    el('p', { class: 'window prp-muted' }, `The 24 hours to ${timeOf(day.window.to)}.${day.storeGenerated && Date.parse(day.window.to) - Date.parse(day.storeGenerated) > 36e5 ? ` The Political Briefing’s store was last refreshed at ${timeOf(day.storeGenerated)}.` : ''}`),
  ].filter(Boolean));
  document.querySelector('meta[name="vm-authorship"]').setAttribute('content', day.label.meta);
  document.documentElement.dataset.authorship = day.authorship;
}

function leadView(day) {
  const box = $('#lead');
  if (!day.lead) { box.hidden = true; box.replaceChildren(); return; }
  const byId = new Map(day.stories.flatMap(s => s.headlines.map(h => [h.id, h])));
  box.replaceChildren(el('h2', { class: 'prp-h2' }, 'The day in brief'), el('p', { class: 'lead-text' }, day.lead.flatMap((x, k) => [k ? ' ' : '', sentence(x, byId)])));
  box.hidden = false;
}

/* --------------------------------------------------------------------------------- a day file's shape */
// A day file that reads as JSON is still checked for the shape the page draws from before anything on the page changes
// (the second review, X5): a file of the wrong shape leaves the day shown as it was, with a plain line saying so.
const isStr = x => typeof x === 'string';
const isArr = Array.isArray;
const isObj = x => !!x && typeof x === 'object' && !isArr(x);
const isNum = x => typeof x === 'number' && Number.isFinite(x);
const isSentence = s => isObj(s) && isStr(s.text) && isArr(s.cites) && s.cites.every(isStr);
const isHeadline = h => isObj(h) && isStr(h.id) && isStr(h.headline) && isStr(h.outlet) && (h.url == null || isStr(h.url));
function isStory(s) {
  if (!isObj(s) || !isStr(s.id) || !isNum(s.rank) || !isNum(s.outlets) || !isArr(s.headlines) || !s.headlines.length || !s.headlines.every(isHeadline)) return false;
  if (!(s.sentences === null || (isArr(s.sentences) && s.sentences.every(isSentence)))) return false;
  const f = s.five;
  if (!isObj(f) || !isArr(f.sides) || f.sides.length !== SIDES.length) return false;
  if (!f.sides.every((x, k) => isObj(x) && x.key === SIDES[k] && isStr(x.label) && isNum(x.outlets) && isArr(x.headlines) && x.headlines.every(isStr))) return false;
  if (!isStr(f.status) || !(f.note === null || isStr(f.note))) return false;
  if (f.status === 'published') {
    const w = f.written;
    if (!isObj(w) || !isObj(w.sides) || !Object.entries(w.sides).every(([k, l]) => SIDES.includes(k) && isArr(l) && l.every(isSentence))) return false;
    if (!(w.closing === null || (isObj(w.closing) && ['same', 'differ'].includes(w.closing.kind) && isSentence(w.closing)))) return false;
  }
  return true;
}
/** Whether a day file has the shape the page draws: the day asked for, its label, its window, its stories. */
function isDayFile(x, d) {
  if (!isObj(x) || x.day !== d || !['model', 'rules'].includes(x.authorship)) return false;
  const l = x.label;
  if (!isObj(l) || ![l.text, l.five, l.notProof, l.meta].every(isStr)) return false;
  if (!isObj(x.written) || !isStr(x.written.status) || !(x.written.note === null || isStr(x.written.note))) return false;
  if (!isObj(x.window) || !isStr(x.window.to) || !(x.storeGenerated == null || isStr(x.storeGenerated))) return false;
  if (!(x.lead === null || (isArr(x.lead) && x.lead.every(isSentence)))) return false;
  return isArr(x.stories) && x.stories.every(isStory);
}

/** A real calendar day in the form 2026-11-21, or false (2026-02-30 and nonsense are not days). */
const isDay = d => DAY_RE.test(d || '') && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

async function show(d, { focus = false, note = '' } = {}) {
  const i = INDEX.days.findIndex(x => x.day === d);
  if (i < 0) {
    // A day that is not kept, or an address that names no day: the newest day, with a plain line saying so, and the
    // address put in step with it in place (no new history entry, and no hashchange to follow).
    const line = isDay(d) ? `No digest is kept for ${dateOf(d)}; the newest day is shown.` : 'That address names no day; the newest day is shown.';
    history.replaceState(null, '', `${location.pathname}${location.search}#day=${INDEX.latest}`);
    return show(INDEX.latest, { focus, note: line });
  }
  CURRENT = d;
  $('#status').textContent = `Loading ${dateOf(d)}…`;
  let day = null;
  try { day = await dayFile(d); } catch { day = null; }
  if (CURRENT !== d) return;
  if (!isDayFile(day, d)) {
    // Nothing on the page changes: the day shown stays (its heading, the chooser, its stories), and CURRENT names it
    // again, so Earlier and Later step from it. The file is read afresh next time.
    cache.delete(d);
    CURRENT = SHOWN;
    $('#status').textContent = `${dateOf(d)} could not be read just now.${SHOWN ? ` ${dateOf(SHOWN)} is still shown.` : ''}`;
    if (SHOWN) $('#day').value = SHOWN;
    USED = null;
    return;
  }
  SHOWN = d;
  document.title = `Daily Synopsis · ${dateOf(d)} · VM`;
  $('#title').textContent = `Daily Synopsis: ${dateOf(d)}`;
  $('#day').value = d;
  $('#earlier').disabled = i === INDEX.days.length - 1; // the index is newest first
  $('#later').disabled = i === 0;
  // The button just used, turned off at the first or last day, hands the focus to the other one.
  if (USED && $(`#${USED}`).disabled) $(USED === 'earlier' ? '#later' : '#earlier').focus();
  USED = null;
  labelView(day);
  leadView(day);
  // A day with no story that met the threshold is a day too: one plain line says so.
  $('#stories').replaceChildren(...(day.stories.length ? day.stories.map(s => storyView(s, day)) : [el('li', { class: 'no-stories prp-empty', id: 'no-stories' }, NO_STORIES)]));
  const corr = CORR.filter(c => c.day === d && !c.story);
  $('#corrections').hidden = !corr.length;
  $('#corr-list').replaceChildren(...corr.map(c => el('li', {}, el('b', {}, `${dateOf(c.date)}:`), ' ', c.text)));
  for (const a of document.querySelectorAll('#all a')) a.toggleAttribute('aria-current', a.dataset.day === d);
  $('#status').textContent = `${note ? `${note} ` : ''}${plural(day.stories.length, 'story', 'stories')}${day.written.status === 'published' ? ', with the written digest' : ', the outlets’ headlines alone'}.`;
  const target = hashHeadline() && document.getElementById(`h-${d}-${hashHeadline()}`);
  if (target) { target.scrollIntoView({ block: 'center' }); target.focus(); }
  else if (focus) $('#title').focus();
}

/* ------------------------------------------------------------------------------------------ the page */
const hashDay = () => { const m = location.hash.match(/(?:^#|&)day=(\d{4}-\d{2}-\d{2})/); return m && DAY_RE.test(m[1]) ? m[1] : null; };
// The day the address asks for, as written ("2026-11-19", "nonsense"), or null when it asks for none.
const askedDay = () => { const m = location.hash.match(/(?:^#|&)day=([^&]*)/); if (!m) return null; try { return decodeURIComponent(m[1]); } catch { return m[1]; } };
const hashHeadline = () => { const m = location.hash.match(/&h=(s\d{1,2}-\d{1,2})$/); return m ? m[1] : null; }; // a cited headline
// The day controls change the address; the focus stays on the control used. A link to a day (the list of all days, a
// day's address typed in) takes the focus to the day's heading.
let FROM_CONTROL = false;
const go = d => { if (d && d !== hashDay()) { FROM_CONTROL = true; location.hash = `day=${d}`; } else show(d); };

async function start() {
  $('#fixture').hidden = !FIXTURE;
  try { INDEX = await getJSON(`${BASE}index.json`); } catch (e) {
    $('#meta').replaceChildren(el('span', {}, 'The days could not be read just now.'));
    $('#stories').replaceChildren(el('li', { class: 'prp-empty' }, 'Please try again later.'));
    return;
  }
  if (!INDEX.days?.length) { $('#meta').replaceChildren(el('span', {}, 'No day has been built yet.')); return; }
  try { CORR = (await getJSON(`${BASE}corrections.json`)).notes || []; } catch { CORR = []; }
  const label = x => `${dateOf(x.day)} · ${x.written === 'published' ? 'written digest' : 'headlines alone'}`;
  $('#day').replaceChildren(...INDEX.days.map(x => el('option', { value: x.day }, label(x))));
  $('#all').replaceChildren(...INDEX.days.map(x => el('li', {}, el('a', { href: `#day=${x.day}`, 'data-day': x.day }, dateOf(x.day)), el('span', { class: 'prp-muted' }, ` · ${x.written === 'published' ? 'written digest, labelled' : 'the outlets’ headlines alone'} · ${plural(x.stories, 'story', 'stories')}${x.corrections ? ` · ${plural(x.corrections, 'correction')}` : ''}`))));
  $('#day').addEventListener('change', e => go(e.target.value));
  $('#earlier').addEventListener('click', () => { const i = INDEX.days.findIndex(x => x.day === CURRENT); if (i < INDEX.days.length - 1) { USED = 'earlier'; go(INDEX.days[i + 1].day); } });
  $('#later').addEventListener('click', () => { const i = INDEX.days.findIndex(x => x.day === CURRENT); if (i > 0) { USED = 'later'; go(INDEX.days[i - 1].day); } });
  addEventListener('hashchange', () => {
    if (location.hash === '#positions') return; // the link to the Method paragraph, opened by hand: the day stays
    const keep = FROM_CONTROL; FROM_CONTROL = false;
    const asked = askedDay();
    show(asked ?? INDEX.latest, { focus: asked !== null && !keep });
  });
  // The freshness line, as the shell's sidebar gives it (design/prp-freshness.js), for the real days only.
  if (FIXTURE) $('#meta').replaceChildren(el('span', {}, 'Test fixture: three made-up days.'));
  else {
    try {
      const reg = await getJSON('../registry.json');
      const m = reg.suites.flatMap(s => s.modules).find(x => x.id === 'daily-synopsis');
      const line = freshnessLine(m, { [m.data.parts[0].read]: INDEX });
      $('#meta').replaceChildren(el('span', { class: line.late ? 'late' : '' }, line.text));
    } catch { $('#meta').replaceChildren(el('span', {}, `Latest day ${dateOf(INDEX.latest)}`)); }
  }
  await show(askedDay() ?? INDEX.latest);
  // The reliability flags arrive when Wikipedia's list has been read; the stories never wait for it.
  getJSON('../briefing/data/rsp.json').then(j => {
    RSP = PRPRsp.table(j); RSP_SETTLED = true;
    const d = RSP.doc;
    if (d) $('#rsp-credit').replaceChildren('Wikipedia flags: statuses and row names from ', link(d.sourceUrl, d.source), ` by ${d.credit}, read on ${PRPRsp.day(d.read)}, under `, link(d.licenceUrl, d.licence), '.');
    fillFlags();
  }).catch(() => {
    RSP_SETTLED = true; fillFlags();
    $('#rsp-credit').textContent = 'Wikipedia’s list of perennial sources could not be read just now, so no publisher shows its flag.';
  });
}
start();
