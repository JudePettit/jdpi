/* Bibliotheca · Neo Book (its own module since November 2026; it was Kino's): public-domain classics read on screen, every term the Master Index knows
   highlighted, and a companion pane beside the text (AR Mode) with the terms on screen, a term's entry and the era's screens.

   Data, built by bibliotheca/scripts/build-book.mjs (its header holds the contract):
     ../data/index.json            the shelf: { generated, books: [{ slug, title, author, translator, year, era, words, … }] }
     ../data/books/<slug>.json     one book: { …, chapters: [{ n, heading, title, words, paragraphs: [{ id, kind, text,
                                   terms: [{ s, e, qid, label }] }] }] }, s/e being string offsets into text
   Address (lib/hash.js): #book=<slug>&ch=<n>&p=<paragraph id>&t=<QID>&pane=<terms|ency|vm>&show=<screen>&era=term (show:
   the screen shown in the pane, with pane=vm; era=term: the term's own era chosen there). The page writes it with
   history.replaceState as the reader moves, so the shell's Back and Forward stay the shell's own, and re-reads it on
   hashchange (the shell moves a frame by changing only its hash; people edit links).

   One chapter is on the page at a time. An IntersectionObserver over its paragraphs (the document as root, less the
   sticky head above and the pane's sheet below on narrow screens) keeps the set on screen: the pane's "On screen" tab
   lists the distinct terms whose links are in view within them, and the paragraph under the reading line
   (30% down the free height) is the current one, outlined, put in the address and counted in the head's position and
   progress bar. A jump (a link, J/K, the contents) pins its paragraph until the reader scrolls by hand, so a short
   paragraph scrolled to the top is the one shown, and it stays put while the layout settles.

   AR Mode (BI-23, Jude, 15 November 2026: one button where the terms bar's ◈ and Links were; P, or T for its terms):
   the pane, whose first tab, "On screen", lists the terms in the text in view with their counts. It replaces the
   floating bar, which lay over the text (BI-22); choosing a term opens its Master Index entry on the next tab.

   A term is "used" by clicking it, in the text or on the "On screen" tab: all its occurrences are ringed and the pane opens on its
   Master Index entry. The pane holds two same-origin frames moved the way the shell moves its own (lib/frame.js): the
   Master Index page for the entry (encyclopedia/index.html#<QID>; nothing on this site sends X-Frame-Options, and if
   the page cannot be shown a link replaces it), and "In Vitruvian Manager": the screens that take a year or period in
   their address, for the book's period or the term's own dates (lib/era.js), plus the places the Master Index records
   for the term. Each can be shown in the pane or opened in the shell: inside the shell through its 'prp:navigate'
   message (as Kino's follow-along does), on its own in a new tab. The frames get the page's theme (prp:theme) as the
   shell gives it to its own frames. A framed page believes it is in the shell (window.self !== window.top) and opens
   its cross-links at the top (target="_top"): inside the shell that is the shell, but on its own the top is this page,
   so there such a link opens in a new tab instead of replacing the book (keepTop). From 1000 px the page splits
   (book | pane), with a divider the reader can drag (design/prp-split.js, splitter); below, the pane is a sheet docked
   under the text. The frames are the shared pane's (sideFrame), and full screen is the whole page's (fullScreen).

   AR Reader (A; &ar=1 in the address, lib/mode.js; called Augmented Reading until 15 November 2026): a narrator (lib/narrator.js, on design/prp-voice.js)
   reads the chapter aloud from the paragraph under the reading line; the unit being read is marked with the CSS
   Custom Highlight API (nc-say, and nc-say-part for a piece of a long sentence) and kept in view; the pane's Master
   Index tab follows the term nearest it (lib/follow.js) unless it is held (the reader has a term of their own, t=, or
   is on the other tab; Hold, H, makes the term showing theirs). The pane can fill the page (Screens only, D), with the
   words under it as subtitles (S); there the book's pictures (../data/pictures.json, drawn by Kino's stage: maps,
   timelines and portraits looping like GIFs, from the Kino film about the author or made for the book) and the
   screens for its era take their turn with the entries (lib/follow.js, tour; lib/pictures.js). The online voice is used only when the reader chooses it, after an offer that
   shows what it costs, and never for more than the offer allowed. */
import { readHash, writeHash, readMap } from './lib/hash.js';
import { readRecipe, writeRecipe } from '../../design/vm-recipe.js';
import { clickDetail, kindOf, readPeriods, resolve } from '../../design/vm-click.js';
import { formatSpan } from '../../design/vm-dates.js';
import { readMode, writeMode } from './lib/mode.js';
import { esc, paragraphHtml, distinctTerms, termCount, chapterLabel, validTerms } from './lib/text.js';
import { eraRows, eraFromFacts, bookEra, fmtEra, fmtYear, kardashevStep, kardashevPolity, todayCountries, KARDASHEV_STEPS } from './lib/era.js';
import { inSidePane, sideFrame, splitter, fullScreen, skipFrontMatter as skipMatter, watchEntry, shellGo, SHELL_ROUTE, canFrame, card } from '../../design/prp-split.js';
import { shellHash, shellUrl } from '../../kino/lib/links.js';
import { SPEEDS } from './lib/narrate.js';
import { chapterTerms, span, nearestTerm, follow, fresh, tour, SCREEN, TOUR_EVERY } from './lib/follow.js';
import { picturesFor, turnOf } from './lib/pictures.js';
import { flatScenes } from '../../kino/lib/format.js';
import { Narrator, KEYS } from './lib/narrator.js';

const $ = s => document.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const PRODUCT = 'Vitruvian Manager';
const SHORT = 'VM'; // the end of a page title, "<Submodule> · VM" (design/PRP-STYLE.md); visible text says PRODUCT
const connector = document.querySelector('script[src*="prp-bar.js"]');
const SHELL = new URL(connector?.dataset.shell || '../../', location.href).href; // the site root, where the shell lives
const DATA = new URL('../data/', import.meta.url).href;
const LAKE = new URL('lake/data/', SHELL).href;
const LIVE = 'https://jdpi.pages.dev/';
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
// styles.css: with the pane shut the bar is a list in the margin. 1150 px leaves (1150 − 48 − 606) / 2 = 248 px beside
const SPLIT = matchMedia('(min-width: 1000px)');                    // styles.css: book | pane side by side (the shell's frame at 1366 too)
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = n => Number(n || 0).toLocaleString('en-GB');
const plainClick = e => e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

// Per-viewer conveniences only (whether the terms bar is shown, and open once the reader has chosen); everything else
// is in the address.
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode or blocked storage */ } },
};

const S = {
  shelf: [], generated: null, row: null, book: null, chapters: [], ci: -1, labels: new Map(),
  visible: new Set(), current: null, pin: null, p: null, chipsKey: '',
  term: null, pane: null, eraOf: 'book', vmShown: null, pendingShow: null, vmSeq: 0, bookSeq: 0,
  entities: new Map(), observer: null, headH: 56,
  // Augmented Reading: the mode; the term the narrator has reached (near), and the follow rule's state (fs) over the
  // chapter's terms (terms); the unit being read (say); whether the next unit is to be kept in view whatever (look);
  // the pane filling the page (fill) and the subtitles under it (subs); a message for the narrator's row (msg).
  ar: false, near: null, fs: fresh(), terms: { terms: [], base: new Map() }, say: null, look: false,
  fill: false, subs: store.get(KEYS.subs, true), msg: null, offer: null,
  // Screens only: the era screen that has the pane now (tour), the next one's turn, and the chapter's screens.
  // (since: characters read since the last turn, from TOUR_EVERY at each chapter so its picture comes early.)
  tour: null, turn: 0, eraI: 0, since: TOUR_EVERY, tourList: null,
  // The Map tab (PRP-SCHOLAR-USP-DESIGN.md S1, contract 4): the Omni-Map's recipe as the frame last posted it (map=
  // in the address), the selection (sel=), which term and paragraph the view was made for (mapKey), the paragraph a
  // click came from (mapPid), and the click's offers and related items for the card under the frame (mapRes).
  map: null, sel: null, mapKey: null, mapPid: null, mapRes: null, mapSeq: 0,
};
const inSide = inSidePane();
let narr = null; // the narrator, made when the mode is first turned on
const chapter = () => S.chapters[S.ci] || null;

/* ---------- addresses ---------- */
// Links recorded for the live site (the lake's mentions) point at this copy when it is served elsewhere, as the
// Master Index does.
const here = url => (SHELL !== LIVE && String(url).startsWith(LIVE) ? SHELL + url.slice(LIVE.length) : url);
const pageUrl = at => new URL(here(at), SHELL).href;
const entryUrl = qid => pageUrl(`encyclopedia/index.html#${qid}`);
/** A place in Vitruvian Manager as a link: the shell's route to it (inside the shell it moves the shell; on its own
    it opens the shell in a new tab). */
function placeLink(suite, module, at) {
  const link = { suite, module, at: pageUrl(at) };
  return { href: shellUrl(link, SHELL), hash: shellHash(link, SHELL), page: link.at, target: embedded ? '_top' : '_blank' };
}
// A term's own link (what Ctrl+click or the middle button opens): its entry, through the shell when embedded.
const termHref = qid => (embedded ? placeLink('rs', 'encyclopedia', `encyclopedia/index.html#${qid}`).href : entryUrl(qid));
const linkAttrs = l => `href="${esc(l.href)}" target="${l.target}" rel="noopener" data-shell-hash="${esc(l.hash)}"`;
const hashFor = (n, extra = {}) => writeHash({ book: S.book?.slug, ch: n, ...extra });

// Moving the shell to a route: shellGo (design/prp-split.js), as Kino does.

/* ---------- loading ---------- */
async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${new URL(url, location.href).pathname}`);
  return r.json();
}
const once = f => { let p = null; return () => (p ||= f().catch(e => { p = null; throw e; })); };
const loadRegistry = once(() => getJson(new URL('registry.json', SHELL)));
const loadWars = once(() => getJson(new URL('battlefield/focus/data/index.json', SHELL)).then(d => d.wars || []));
const loadEnergy = once(() => getJson(new URL('kardashev/data/energy.json', SHELL)));
// National Analysis's countries by Wikidata ID (its brief, the small file Geopolitical Volatility reads): QID → ISO3,
// for the row that opens one country as it is today (lib/era.js, todayCountries).
const loadNational = once(() => getJson(new URL('national/data/brief.json', SHELL)).then(d => new Map((d.countries || []).filter(c => c.qid && c.iso3).map(c => [c.qid, c.iso3]))));
// A Master Index entity from the lake's shards (lake/data/e/<qid mod 512>.json, as encyclopedia/index.html reads them).
function entity(qid) {
  if (!S.entities.has(qid)) S.entities.set(qid, getJson(`${LAKE}e/${+qid.slice(1) % 512}.json`).then(s => s[qid] || null).catch(() => null));
  return S.entities.get(qid);
}
function moduleInfo(reg, id) {
  for (const s of reg?.suites || []) {
    const m = s.modules.find(x => x.id === id || x.aliases?.includes(id));
    if (!m) continue;
    // An old submodule id that is now one of a submodule's views (Tally Stick: Auto Trader's Omni Trade) is named as the view.
    const v = id !== m.id ? m.views?.find(x => x.id === id || x.aliases?.includes(id)) : null;
    return { suite: s.id, name: v?.name || m.name, url: v?.url || m.url };
  }
  return null;
}

async function loadBook(slug) {
  const seq = ++S.bookSeq;
  $('#text').innerHTML = '<p class="prp-empty">Loading the book…</p>';
  // The old chapter's paragraphs have just left the page: nothing may ask where they are while the next book loads (a
  // frame scheduled by the observer would look for them, and a big volume takes a moment).
  S.observer?.disconnect(); S.observer = null;
  S.ci = -1; S.visible = new Set(); S.current = null; S.pin = null; S.chipsKey = '';
  let book;
  try { book = await getJson(`${DATA}books/${encodeURIComponent(slug)}.json`); } catch (e) {
    if (seq === S.bookSeq) $('#text').innerHTML = `<p class="prp-empty">This book could not load: ${esc(e.message)}</p>`;
    return false;
  }
  if (seq !== S.bookSeq) return false;
  S.book = book; S.row = S.shelf.find(b => b.slug === slug) || null; S.chapters = book.chapters || []; S.ci = -1;
  S.labels = new Map(book.author?.qid ? [[book.author.qid, book.author.name]] : []);
  for (const c of S.chapters) for (const p of c.paragraphs) for (const t of validTerms(p)) if (!S.labels.has(t.qid)) S.labels.set(t.qid, t.label);
  $('#shelf').value = slug;
  renderBookFront(); renderToc(); renderSources();
  return true;
}

/* ---------- the page and the book's front matter ---------- */
function renderMeta() {
  const n = S.shelf.length, words = S.shelf.reduce((a, b) => a + (b.words || 0), 0);
  const day = S.generated ? new Date(S.generated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  $('#meta').innerHTML = [`<span><b>${n}</b> book${n === 1 ? '' : 's'} on the shelf</span>`, `<span><b>${fmt(words)}</b> words</span>`,
    '<span>Rights <b>public domain in the US and the UK</b></span>', '<span>Terms <b>the Master Index</b></span>', day ? `<span>Built <b>${esc(day)}</b></span>` : ''].join('');
}
// Years as the companion pane gives them: 431 BC, not -431 (lib/era.js).
const year = y => (Number.isFinite(y) ? fmtYear(y) : String(y ?? ''));
function renderShelf() {
  $('#shelf').innerHTML = S.shelf.map(b => `<option value="${esc(b.slug)}">${esc(b.title)} · ${esc(b.author || '')}${b.year != null ? ` (${esc(year(b.year))})` : ''}</option>`).join('');
}
const pd = v => /^(pd|public domain)$/i.test(String(v || ''));
// The people whose death dates were not found after a reasonable search (shelf.mjs, rights.unknown: a translator of the
// 1890s), named in the rights line and the badge, so the record says plainly what the finding rests on.
const unknownDeaths = r => (r?.unknown || []).map(u => u.name).filter(Boolean).join(' and ');
/* The EU finding (shelf.mjs, rights.eu and rights.euBasis, 16 November 2026): "pd" only when everyone whose words the
   text carries died more than 70 years ago, each death year read from a named source; else "unconfirmed", which the
   page says as it is, and such a book is not quoted anywhere in VM (bibliotheca/scripts/quotes.mjs). The page claims no
   more than the record. */
const euPd = r => r?.eu === 'pd';
const euUnconfirmed = r => r?.eu === 'unconfirmed';
// whose death year is missing: each line of euBasis.missing opens with the name, then the part in brackets
const euMissing = r => (r?.euBasis?.missing || []).map(m => m.split(' (')[0]).filter(Boolean).join(' and ');
function euSentence(r) {
  if (!euPd(r) && !euUnconfirmed(r)) return '';
  const b = r.euBasis || {};
  const day = s => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
  const source = s => {
    const q = /Wikidata (Q\d+)/.exec(s || '');
    const label = /^Wikisource/.test(s || '') ? 'Wikisource and Wikidata' : 'Wikidata';
    return q ? `<a href="https://www.wikidata.org/wiki/${esc(q[1])}" target="_blank" rel="noreferrer" title="${esc(s)}">${label}</a>` : esc(s || '');
  };
  const deaths = (b.deaths || []).map(d => `${esc(d.name)}, ${esc(year(d.died))} (${source(d.source)})`).join('; ');
  const read = b.checked ? ` Death years as read on ${esc(day(b.checked))}: ${deaths}.` : '';
  if (euPd(r)) return ` In the European Union (Ireland among its members) the text is in the public domain: everyone whose words it carries died more than 70 years ago. The EU term: ${esc(b.rule || 'life plus 70 years')}.${read}`;
  const decided = (r.unknown || [])[0]?.checked;
  return ` EU rights unconfirmed: the death year of ${esc(euMissing(r))} was not found, so the EU term (life plus 70 years) cannot be confirmed, and ${PRODUCT} quotes nothing from this book.${read}`
    + (decided ? ` On a reasonable search ${PRODUCT}’s editor decided on ${esc(day(decided))} to treat the translation as free in Ireland and the United Kingdom; that is a judgement of risk, not a finding.` : '');
}
/* The book's chapters as it numbers them ("Chapter XII", "Book II, Chapter III"), and what else it has: the one other
   piece by its title ("26 chapters and the dedication", "15 chapters and the prefaces"), or how many there are (Smith's
   introductions and appendix, the five pieces before On War's Book I). A book divided into sections counts sections
   (the Communist Manifesto's four). */
function contentsLine(chapters) {
  const unit = chapters.some(c => /\bSection [IVXLCDM]+$/.test(c.heading || '')) ? 'Section' : 'Chapter';
  const isNumbered = c => new RegExp(`\\b${unit} [IVXLCDM]+$`).test(c.heading || '');
  const numbered = chapters.filter(isNumbered).length, other = chapters.length - numbered;
  const rest = other === 1 ? ` and the ${(chapters.find(c => !isNumbered(c)).title || 'front matter').toLowerCase()}`
    : other > 1 ? ` and ${other} other pieces` : '';
  return `<b>${numbered}</b> ${unit.toLowerCase()}${numbered === 1 ? '' : 's'}${esc(rest)}`;
}
// A second author stands with the edition's others, his part named "co-author" (shelf.mjs: Engels, of the Manifesto).
const coauthors = b => (b.editors || []).filter(e => /^co-author/.test(e.role || '')).map(e => e.name);
function renderBookFront() {
  const b = S.book, a = b.author || {}, t = b.translator;
  document.title = `${b.title} · Neo Book · Bibliotheca · ${SHORT}`;
  $('#book-title').textContent = b.title;
  // The author's name links to his Master Index entry only once the entry is found: a shelf author the Master Index has
  // no record of (Clausewitz, Gibbon and Wieser in November 2026) is named plainly, not linked to an empty address.
  const who = `<span id="byline-author">${esc(a.name || '')}</span>`;
  if (a.qid) entity(a.qid).then(e => {
    const el = $('#byline-author');
    if (!e || S.book !== b || !el) return;
    el.outerHTML = `<a class="term" id="byline-author" data-qid="${esc(a.qid)}" data-jdpi-ency="${esc(a.qid)}" href="${esc(termHref(a.qid))}" title="${esc(a.name)} · Master Index">${esc(a.name)}</a>`;
  });
  const life = Number.isFinite(a.born) && Number.isFinite(a.died) ? ` (${esc(fmtEra([a.born, a.died]))})` : '';
  const co = coauthors(b).map(n => ` and ${esc(n)}`).join('');
  // The year after the translator is the edition's (Graham's On War of 1873 is read in Maude's revision of 1908).
  $('#byline').innerHTML = `${who}${life}${co}${t ? `, translated by ${esc(t.name)}${b.edition?.published ? ` (edition of ${esc(year(b.edition.published))})` : ''}` : ''}`;
  const all = S.chapters.flatMap(c => c.paragraphs), terms = termCount(all);
  const words = S.chapters.reduce((x, c) => x + (c.words || 0), 0);
  $('#book-meta').innerHTML = [`<span>${contentsLine(S.chapters)}</span>`,
    `<span><b>${fmt(words)}</b> words</span>`, `<span><b>${fmt(terms.n)}</b> terms · <b>${terms.distinct}</b> entries</span>`,
    b.work?.written != null ? `<span>Written <b>${esc(year(b.work.written))}</b>${b.work.published != null ? `, published <b>${esc(year(b.work.published))}</b>` : ''}</span>` : '',
    pd(b.rights?.us) && pd(b.rights?.uk) ? (unknownDeaths(b.rights)
      ? `<span>Public domain <b>US</b> · <b>UK</b> on a reasonable search${euPd(b.rights) ? ' · <b>EU</b>' : euUnconfirmed(b.rights) ? ' · <b>EU rights unconfirmed</b>' : ''}</span>`
      : `<span>Public domain <b>US · UK${euPd(b.rights) ? ' · EU' : ''}</b>${euUnconfirmed(b.rights) ? ' · <b>EU rights unconfirmed</b>' : ''}</span>`) : ''].join('');
}
function renderToc() {
  $('#toc-list').innerHTML = S.chapters.map((c, i) => {
    const l = chapterLabel(c);
    return `<li><a href="${esc(hashFor(c.n))}" data-ci="${i}"><span class="no">${esc(l.no)}</span><span>${esc(l.title)}</span><span class="w">${fmt(c.words)} words</span></a></li>`;
  }).join('');
}
function renderSources() {
  const b = S.book, e = b.edition || {}, r = b.rights || {}, a = b.author || {}, t = b.translator;
  const checked = r.checked ? new Date(r.checked).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
  const terms = termCount(S.chapters.flatMap(c => c.paragraphs));
  $('#sources').innerHTML = `
    <p><b>Text.</b> ${esc(b.title)} by ${esc(a.name || '')}${coauthors(b).map(n => ` and ${esc(n)}`).join('')}${t ? `, translated by ${esc(t.name)}` : ''}${e.published ? ` (${esc(e.published)})` : ''}: ${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noreferrer">${esc(e.source || 'source')}${e.id ? ` ${esc(e.id)}` : ''}</a>` : esc(e.source || '')}. ${esc(e.licence || '')}</p>
    <p><b>Rights.</b> ${pd(r.us) ? 'Public domain in the United States' : `United States: ${esc(r.us)}`}; ${pd(r.uk) ? (unknownDeaths(r) ? `treated as public domain in Ireland and the United Kingdom, the death date of ${esc(unknownDeaths(r))} not having been found after a reasonable search` : 'public domain in the United Kingdom') : `United Kingdom: ${esc(r.uk)}`}. ${esc(r.basis || '')}${checked ? ` Checked ${esc(checked)}.` : ''}${euSentence(r)}</p>
    <p><b>Terms.</b> Every highlighted term is an entry of the Master Index, matched at build time to its Wikidata labels and aliases (bibliotheca/scripts/tag-terms.mjs, with this book's own decisions): ${fmt(terms.n)} in this book, ${terms.distinct} entries. AR Mode's "On screen" tab lists those in the text on screen.</p>
    <p><b>In ${PRODUCT}.</b> AR Mode (the pane beside the text) offers the screens that take a year or a period in their address: the Invention Timeline a period from 3000 BC, the Kardashev Tracker its century steps, the Political Retrospective, Retrospective Battlefield and War Focus from 1926, the Historical Calendar from 1980. National Analysis has no year in its address, so it shows a country as it is today: the term’s, when the term is one of today’s countries or a place in one, or else those the book names most; with none, it is not offered.</p>
    <p><b>AR Reader.</b> The book read aloud, the sentence being read marked and kept in view, with the Master Index entry of the nearest term beside it; Hold keeps the pane still, and Screens only lets the pane fill the page with the words under it as subtitles, the screens for the book's era (the Invention Timeline, the Kardashev Tracker and, from 1926, the screens of those years) taking their turn with the entries.</p>
    <p><b>Voice.</b> This device's own voice reads the book, and nothing leaves the browser. An online voice (Microsoft Azure, through ${PRODUCT}'s own proxy) reads only when you choose it, after it says what it will cost: each sentence it reads is then sent to Microsoft Azure to be spoken, and counts against the site's allowance of characters. It is never remembered from one visit to the next.</p>
    <p><b>Keys.</b> ← → chapters · J K paragraphs · P AR Mode · T its terms on screen · A AR Reader · R read or pause · &lt; &gt; slower, faster · H hold the pane · D Screens only · S subtitles · F full screen · Esc closes.</p>`;
}

/* ---------- the chapter ---------- */
function renderChapter(ci) {
  S.ci = ci;
  const c = chapter(), l = chapterLabel(c);
  $('#chapter-no').textContent = l.no.replace(/^chapter\s+/i, ''); // the head is narrow: "XII" says it
  $('#chapter-name').textContent = l.title;
  $('#chapter-title').title = [l.no, l.title].filter(Boolean).join(': ');
  document.title = `${S.book.title}${l.no ? `, ${l.no}` : `: ${l.title}`} · Neo Book · Bibliotheca · ${SHORT}`;
  unmark(); // the marks are on ranges of the old text, which is about to go
  S.say = null;
  drawSubs(); // nothing of the new chapter is said yet
  $('#text').innerHTML = c.paragraphs.map(p => paragraphHtml(p, { href: termHref })).join('') || '<p class="prp-empty">This chapter has no text.</p>';
  S.terms = chapterTerms(c);
  if (S.tour) endTour(); // a screen of the last chapter's era
  S.turn = 0; S.since = TOUR_EVERY; // each chapter's turns begin with its picture, early
  if (S.ar) { narr?.load(c, chapterKey(), 0); S.look = true; nearHere(c.paragraphs[0]?.id); }
  for (const [a, b, d] of [['#prev', '#prev2', -1], ['#next', '#next2', 1]]) {
    const to = S.chapters[ci + d];
    for (const el of [$(a), $(b)]) {
      el.href = to ? hashFor(to.n) : '#';
      if (to) el.removeAttribute('aria-disabled'); else el.setAttribute('aria-disabled', 'true');
      el.tabIndex = to ? 0 : -1;
    }
    if (to) { const tl = chapterLabel(to); $(b).textContent = d < 0 ? `‹ ${tl.no || tl.title}` : `${tl.no || tl.title} ›`; $(b).title = tl.title; }
  }
  $$('#toc-list a').forEach(a => { if (+a.dataset.ci === ci) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  S.current = null; S.pin = null; S.p = null; S.chipsKey = '';
  highlight();
  observe();
  if (S.pane === 'vm') renderVm(); // a chapter may carry its own period
}

// The reading region in viewport coordinates: under the sticky head and the terms strip, above the pane's sheet
// (narrow screens). Text the strip covers is not in view: its terms stay out of the bar, and reveal() scrolls a term
// out from under it.
function region() {
  const top = $('#head').getBoundingClientRect().bottom;
  return { top: Math.max(0, top), bottom: window.innerHeight - sheetH() };
}
// The pane's sheet over the foot of the screen (narrow screens); none while the pane fills the page (Screens only),
// which the reading region ignores: the text is still laid out, and read, beneath it.
const sheetH = () => (S.pane && !S.fill && !SPLIT.matches ? Math.round($('#pane').getBoundingClientRect().height) : 0);
/* (Re)builds the observer for the layout as it is now: called when a chapter is drawn, the pane opens, closes or grows,
   and the window resizes. (--nc-bar, the depth of the terms strip that lay over the text until BI-23, is 0.) */
function observe() {
  S.observer?.disconnect();
  S.headH = $('#head').offsetHeight;
  const strip = 0; // (no strip over the text since BI-23: the terms are a tab of the pane)
  document.documentElement.style.setProperty('--nc-head', `${S.headH}px`);
  document.documentElement.style.setProperty('--nc-bar', `${strip}px`);
  const sheet = sheetH();
  // Until the new observer reports, the set is what the layout shows now, so the bar never empties for a frame (the
  // strip opening forces a redraw of the chips straight after this); the observer's first report covers every
  // paragraph and keeps the set from then on. The pin is not known to have been seen until the observer says so.
  const { top, bottom } = region();
  S.visible = new Set($$('#text p.para').filter(p => { const r = p.getBoundingClientRect(); return r.bottom > top && r.top < bottom; }).map(p => p.id));
  S.pinSeen = false;
  // The document as root: its own viewport even inside the shell's frame (an implicit root would be the shell's).
  S.observer = new IntersectionObserver(entries => {
    for (const e of entries) { if (e.isIntersecting) S.visible.add(e.target.id); else S.visible.delete(e.target.id); }
    schedule();
  }, { root: document, rootMargin: `-${S.headH + strip}px 0px -${sheet}px 0px`, threshold: 0 });
  $$('#text p.para').forEach(p => S.observer.observe(p));
}

let frame = 0;
function schedule() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); }
function update() { if (!chapter()) return; updateCurrent(); renderChips(); updateProgress(); fillTop(); }
// Screens only: the pane lies over the text from under the sticky head (wherever the head is now) to the foot.
function fillTop() { if (S.fill) document.documentElement.style.setProperty('--nc-fill-top', `${Math.max(0, Math.round($('#head').getBoundingClientRect().bottom))}px`); }

function onScreen() { return chapter().paragraphs.filter(p => S.visible.has(p.id)); }
// Scrolled to the end of the page (a page too short to scroll has not been read to its end just by opening it).
const atBottom = () => window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
/* A jump pins its paragraph (S.pin) at the height it landed (S.pinTop): the paragraph stays current, and stays put
   while the layout settles (the web font arriving reflows the text above it; the pane opening narrows the column),
   until the reader scrolls by hand (wheel, touch, a press, a scrolling key) or the paragraph has been on screen and
   left it (a drag of the scroll bar sends no event to the page). */
function pinAt(id, top = null) { S.pin = id; S.pinTop = top; S.pinSeen = false; }
function holdPin() {
  const el = S.pin && S.pinTop !== null && document.getElementById(S.pin);
  if (el) { const d = el.getBoundingClientRect().top - S.pinTop; if (Math.abs(d) > 1) window.scrollBy(0, d); }
}
function updateCurrent() {
  const shown = onScreen();
  let cur = null;
  if (S.pin) { if (S.visible.has(S.pin)) S.pinSeen = true; else if (S.pinSeen) S.pin = null; }
  if (S.pin && document.getElementById(S.pin)) cur = S.pin;
  else if (shown.length) {
    const { top, bottom } = region(), line = top + (bottom - top) * 0.3;
    for (const p of shown) { const el = document.getElementById(p.id); if (!el) continue; if (el.getBoundingClientRect().top <= line) cur = p.id; else break; }
    cur ||= shown[0].id;
    if (atBottom()) cur = shown.at(-1).id; // the last lines can never reach the reading line
  }
  if (cur === S.current) return;
  document.getElementById(S.current)?.classList.remove('current');
  S.current = cur;
  if (cur) document.getElementById(cur)?.classList.add('current');
  if (cur) { S.p = cur; queueWrite(); }
}
function updateProgress() {
  const c = chapter(), text = $('#text').getBoundingClientRect(), { top, bottom } = region();
  let f = text.height ? (top + (bottom - top) * 0.3 - text.top) / text.height : 0;
  f = atBottom() ? 1 : Math.min(1, Math.max(0, f));
  $('#progress i').style.width = `${(f * 100).toFixed(1)}%`;
  $('#progress').setAttribute('aria-valuenow', String(Math.round(f * 100)));
  const i = c.paragraphs.findIndex(p => p.id === S.current);
  $('#pos').textContent = `¶ ${i < 0 ? '–' : i + 1} of ${c.paragraphs.length} · ${Math.round(f * 100)}%`;
}

/* ---------- the terms on screen: AR Mode's "On screen" tab ---------- */
// The observer says which paragraphs are on screen; within them, the term links actually in view (a long paragraph
// half off screen keeps the terms of its hidden half out of the bar), in reading order.
function termsInView() {
  const { top, bottom } = region(), seen = [];
  for (const p of onScreen()) for (const a of document.getElementById(p.id)?.querySelectorAll('a.term') || []) {
    const r = a.getBoundingClientRect();
    if (r.bottom > top && r.top < bottom) seen.push({ qid: a.dataset.qid, label: S.labels.get(a.dataset.qid), form: a.textContent });
  }
  return distinctTerms(seen);
}
function renderChips(force = false) {
  const terms = chapter() ? termsInView() : [];
  const key = `${terms.map(t => `${t.qid}:${t.n}`).join(',')}|${S.term}`;
  if (key === S.chipsKey && !force) return;
  S.chipsKey = key;
  $('#terms-count').textContent = terms.length;
  $('#tab-terms').setAttribute('aria-label', `On screen: ${terms.length} term${terms.length === 1 ? '' : 's'}`);
  if (S.pane === 'terms') setPaneHead('AR Mode · On screen', `${terms.length} term${terms.length === 1 ? '' : 's'} in view`, null);
  // data-term, not data-qid: the entity linker (design/jdpi-entities.js) badges every [data-qid] with a ◈ link.
  const focused = document.activeElement?.closest?.('.nc-chip')?.dataset.term;
  $('#chips').innerHTML = terms.length
    ? terms.map(t => `<button type="button" class="nc-chip" data-term="${t.qid}" aria-pressed="${t.qid === S.term}" title="${esc(t.forms.join(', '))}: ${t.n} on screen · ${t.qid}">${esc(t.label)}<span class="n">${t.n}</span></button>`).join('')
    : '<p class="none">No terms in view.</p>';
  if (focused) $(`#chips .nc-chip[data-term="${focused}"]`)?.focus({ preventScroll: true });
}

/* ---------- using a term ---------- */
function highlight() {
  $$('a.term.lit').forEach(a => a.classList.remove('lit'));
  if (S.term) $$(`a.term[data-qid="${S.term}"]`).forEach(a => a.classList.add('lit'));
}
// `from` is the link clicked; from the bar, it is the term's first occurrence in view. Either stays in view when the
// pane opens over the lower half of a phone's screen.
function useTerm(qid, from = null) {
  const { top, bottom } = region();
  const inText = !!from; // the tagged name itself, clicked in the text (a chip in the bar passes none)
  from ||= $$(`#text a.term[data-qid="${qid}"]`).find(a => { const r = a.getBoundingClientRect(); return r.bottom > top && r.top < bottom; }) || null;
  S.term = qid;
  S.mapPid = from?.closest?.('p.para')?.id || S.current || S.p || null;
  highlight(); renderChips(true);
  if (S.tour) endTour();
  // A click on a tagged name in the text opens its card (design S1 and 2.4: the view, its offers and what is related),
  // the Map tab, with the Master Index entry one tab away (10.2's default). A chip in the "On screen" bar, and any click
  // while the AR Reader is on (its pane follows the narrator on the Master Index), open the entry as before; while
  // the Map tab is open, every click redraws the map.
  openPane(S.pane === 'map' || (inText && !S.ar) ? 'map' : 'ency');
  reveal(from);
  dispatchClick(qid, S.mapPid);
}
/* Contract 1: the click, as a vm:click event on window, with the detail design/vm-click.js validates. The Map tab
   listens for it (here; in S4 any view beside the text may). */
async function dispatchClick(qid, pid) {
  const c = chapter(), ent = await entity(qid);
  if (!c || S.term !== qid) return;
  const detail = clickDetail({ subject: { qid, label: ent?.label || S.labels.get(qid) || qid, kind: kindOf(ent) || 'unknown' },
    from: { module: 'neo-classic', at: `bibliotheca/neo/index.html${hashFor(c.n, { p: pid, t: qid })}`, ...(pid ? { passage: { book: S.book.slug, ch: c.n, p: pid } } : {}) },
    gesture: 'term' });
  if (detail) window.dispatchEvent(new CustomEvent('vm:click', { detail }));
}
function clearTerm() {
  S.term = null;
  highlight(); renderChips(true);
  // In Augmented Reading, letting go of a term is letting go of the pane: it shows the nearest term at once.
  if (S.ar) { letGo(); return; }
  if (S.pane) renderPane();
  writeState();
}

/* ---------- the companion pane ---------- */
// Keep the reader's place when the text reflows (the pane opening or closing changes the column's width).
function keepPlace(change) {
  const el = S.current && document.getElementById(S.current), before = el ? el.getBoundingClientRect().top : null;
  change();
  if (el) { window.scrollBy(0, el.getBoundingClientRect().top - before); pinAt(S.current, before); }
  observe();
}
// Bring a term link into the free part of the screen (below the terms strip, above the pane's sheet on a phone): a
// term the strip has just come down over (the margin list turning into the strip as the pane opens) moves only clear
// of it, so the reader's place barely moves; one under the sheet, or off the screen, a third of the way down.
function reveal(a) {
  if (!a?.isConnected) return;
  const r = a.getBoundingClientRect(), { top, bottom } = region();
  if (r.top >= top && r.bottom <= bottom) return;
  window.scrollBy(0, r.top - (top + (bottom - top) / 3));
  S.pin = null;
}
function openPane(tab) {
  if (!S.pane) keepPlace(() => { S.pane = tab; $('#pane').hidden = false; $('#layout').classList.add('split'); });
  S.pane = tab;
  if (tab !== 'ency' && S.tour) endTour();
  $('#pane-toggle').setAttribute('aria-pressed', 'true');
  selectTab(tab);
  renderPane();
  writeState();
}
function closePane() {
  if (!S.pane) return;
  if (S.fill) setFill(false);
  keepPlace(() => { S.pane = null; $('#pane').hidden = true; $('#layout').classList.remove('split'); });
  $('#pane-toggle').setAttribute('aria-pressed', 'false');
  writeState();
}
function selectTab(tab) {
  for (const t of TABS) {
    const on = t === tab, b = $(`#tab-${t}`);
    b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    $(`#panel-${t}`).hidden = !on;
    if (on) showTab(b);
  }
}
// The selected tab is scrolled into its row when the row is narrower than its tabs (a phone), sideways only.
function showTab(b) {
  const row = b.closest('[role="tablist"]');
  if (!row || row.scrollWidth <= row.clientWidth) return;
  const r = row.getBoundingClientRect(), t = b.getBoundingClientRect();
  if (t.right > r.right) row.scrollLeft += t.right - r.right + 8;
  else if (t.left < r.left) row.scrollLeft -= r.left - t.left + 8;
}
function renderPane() { if (S.pane === 'ency') renderMasterIndex(); else if (S.pane === 'vm') renderVm(); else if (S.pane === 'terms') renderChips(true); else if (S.pane === 'map') renderMap(); }
// The pane's tabs, in order. AR Mode opens it on the entry (a term in use, or the AR Reader on), else on the terms.
const TABS = ['terms', 'ency', 'vm', 'map'];
const paneTab = () => (S.term || S.ar ? 'ency' : 'terms');
function toggleArMode() { if (S.pane) closePane(); else openPane(paneTab()); }
function setPaneHead(kicker, title, link) {
  $('#pane-kicker').textContent = kicker;
  $('#pane-title').textContent = title;
  const open = $('#pane-open');
  open.hidden = !link;
  if (link) { open.href = link.href; open.target = link.target; open.rel = 'noopener'; open.dataset.shellHash = link.hash; open.title = `Open in ${PRODUCT}`; }
}

/* The entry the Master Index tab shows: the reader's own term; in Augmented Reading, while the pane is not held (no
   term of the reader's own), the term the narrator has reached. */
const shownTerm = () => S.term || (S.ar ? S.near : null);
const held = () => !!S.term || S.pane === 'vm';
function renderMasterIndex() {
  const q = shownTerm(), f = $('#ency-frame');
  // Screens only, an era screen's turn: it has the tab, in its own frame.
  const t = touring();
  $('#tour-frame').hidden = !t || !!t.picture;
  $('#picture').hidden = !t?.picture;
  if (!t?.picture) stopPicture();
  if (t) {
    f.hidden = true; $('#ency-empty').hidden = true; $('#ency-fallback').hidden = true;
    if (t.picture) {
      const tf = $('#tour-frame');
      if (tf.getAttribute('src') && tf.dataset.url !== 'about:blank') frames.tour.go('about:blank'); // the last screen's page goes
      setPaneHead('AR Reader · A picture for the book', t.name, t.film?.link || null);
      drawPicture(t);
      return;
    }
    $('#tour-frame').title = `${t.name} · ${t.place}`;
    $('#tour-frame').dataset.key = t.key;
    setPaneHead(`AR Reader · ${PRODUCT}`, `${t.name} · ${t.place}`, t);
    frames.tour.go(t.page);
    return;
  }
  const kicker = S.ar ? 'AR Reader · Master Index' : 'Master Index';
  $('#ency-empty').hidden = !!q;
  $('#ency-empty').innerHTML = S.ar ? 'This chapter names nothing the Master Index knows.' : EMPTY_ENCY;
  if (!q) { f.hidden = true; $('#ency-fallback').hidden = true; setPaneHead(kicker, S.ar ? 'Nothing to show' : 'No term chosen', null); return; }
  const label = S.labels.get(q);
  setPaneHead(kicker, label || q, placeLink('rs', 'encyclopedia', `encyclopedia/index.html#${q}`));
  if (!label) entity(q).then(e => { if (e && shownTerm() === q && S.pane === 'ency') $('#pane-title').textContent = e.label; });
  const fallback = $('#ency-link'), l = placeLink('rs', 'encyclopedia', `encyclopedia/index.html#${q}`);
  fallback.href = l.href; fallback.target = l.target; fallback.rel = 'noopener'; fallback.dataset.shellHash = l.hash;
  if ($('#ency-fallback').hidden) f.hidden = false;
  if (frames.ency.go(entryUrl(q)) === 'hash') watchEntry(f);
}
let EMPTY_ENCY = '';
// The Master Index frame is checked when it loads: a page that could not be framed, or failed, leaves a link instead.
function encyFrameLoaded() {
  const f = $('#ency-frame');
  let ok = false;
  try { ok = !!f.contentDocument?.querySelector('#entity, #explorer'); } catch { ok = false; }
  $('#ency-fallback').hidden = ok || !shownTerm() || !!touring();
  f.hidden = !ok || !shownTerm() || !!touring();
  if (ok) watchEntry(f);
}

/* "In Vitruvian Manager": the screens for an era, and where the term itself appears. */
async function renderVm() {
  const seq = ++S.vmSeq, q = S.term;
  const own = bookEra(S.book, S.row, chapter());
  const ent = q ? await entity(q) : null;
  const termEra = ent ? eraFromFacts(ent.facts) : null;
  // A term's own era is offered only when the term existed by the end of the book's period: a present-day state the
  // tagger let through (or an address that names one) would otherwise offer 1946 to today beside a text of 1513.
  const termOk = termEra && (!own || termEra[0] <= own.years[1]);
  const [reg, wars, energy, national] = await Promise.all([loadRegistry().catch(() => null), loadWars().catch(() => []), loadEnergy().catch(() => null), loadNational().catch(() => new Map())]);
  if (seq !== S.vmSeq) return;
  const label = ent?.label || S.labels.get(q) || q;
  // The countries of today the National Analysis row opens: the term's, else the book's most named; none, no row.
  const countries = todayCountries({ qid: q, entity: ent, terms: (S.book?.chapters || []).flatMap(c => c.paragraphs.flatMap(p => p.terms || [])), byQid: national });
  const byTerm = S.eraOf === 'term' && termOk;
  const years = byTerm ? termEra : own?.years;
  // Whose era: the book's (or the chapter's), or the term's own dates when the Master Index has them.
  const pick = $('#era-pick');
  pick.hidden = !termOk || !own;
  if (termOk && own) {
    pick.innerHTML = `<label><input type="radio" name="era-of" value="book"${byTerm ? '' : ' checked'}> ${esc(S.book.title)} · ${esc(fmtEra(own.years))}</label>`
      + `<label><input type="radio" name="era-of" value="term"${byTerm ? ' checked' : ''}> ${esc(label)} · ${esc(fmtEra(termEra))}</label>`;
  }
  if (!years) {
    $('#era-title').textContent = 'This book records no period.'; $('#era-rows').innerHTML = ''; setPaneHead(`In ${PRODUCT}`, S.book.title, null);
    if (S.pendingShow) { S.pendingShow = null; writeState(); } // nothing to show it in
    return;
  }
  $('#era-title').innerHTML = byTerm ? `The screens for <b>${esc(fmtEra(years))}</b>, the dates of ${esc(label)}.` : `The screens for <b>${esc(fmtEra(years))}</b>, ${esc(own.label)}.`;
  const steps = energy?.steps?.map(s => s.year) || KARDASHEV_STEPS;
  const step = kardashevStep(Math.round((years[0] + years[1]) / 2), steps);
  // With the term's own era, War Focus lists only the war that is the term (the wars of its centuries are not its own).
  const rows = eraRows(years, { wars, qid: q, ownEra: !!byTerm, polity: ent ? kardashevPolity(ent.wiki, energy?.polities, step) : null, steps, countries });
  const name = r => moduleInfo(reg, r.module)?.name || r.name;
  // The places the Master Index records for the term (its "Appears in"), when it has any. Each place is shown in the
  // pane only where the shell's own rule allows (canFrame): a private page (Omni Trade, Algo Trader), a page off its
  // submodule's own page or a submodule the registry does not list gets a card with its link instead.
  // Since the Master Index counts every book's tags (MI-08, 15 November 2026) an entry names each book of the shelf
  // that names it: the other modules' places come first, then the other books, and the book open here (it is this
  // page) is left out; eight are listed. A place's key is its index in the entry (m<i>), not its row, so an address's
  // show= names the same place whatever the order (lib/hash.js reads m0 to m99).
  const here = m => { try { return m.m === 'neo-classic' && readHash(new URL(m.u, location.href).hash).book === S.book?.slug; } catch { return false; } };
  const all = (ent?.mentions || []).map((m, i) => ({ m, i })).filter(x => !here(x.m)).slice(0, 100);
  const ments = [...all.filter(x => x.m.m !== 'neo-classic'), ...all.filter(x => x.m.m === 'neo-classic')].map(({ m, i }) => {
    const info = moduleInfo(reg, m.m);
    const l = info ? placeLink(info.suite, m.m, m.u) : { href: pageUrl(m.u), hash: '', page: pageUrl(m.u), target: '_blank' };
    return { key: `m${i}`, ...l, module: m.m, name: info?.name || m.m, place: m.c || '', fit: canFrame({ module: m.m, page: l.page }, reg, SHELL) };
  });
  // Every place resolves (an address may name one past the eighth); eight are listed, the first eight, or, when the
  // place shown is past them, the first seven and that one in the eighth row (keeping its own key).
  const listed = ments.slice(0, 8), wanted = S.vmShown || S.pendingShow, past = ments.findIndex((m, n) => n >= 8 && m.key === wanted);
  if (past >= 0) listed[listed.length - 1] = ments[past];
  const places = new Map([
    ...rows.filter(r => r.available).map(r => { const l = placeLink(r.suite, r.module, r.at); return [r.id, { ...l, module: r.module, name: name(r), place: r.place, fit: canFrame({ module: r.module, page: l.page }, reg, SHELL) }]; }),
    ...ments.map(m => [m.key, m]),
  ]);
  // The screen shown in the pane follows the era (the same screen, at the new place); one the new era closes, or a
  // place of another term, leaves the pane, and the address.
  if (S.vmShown && (!places.has(S.vmShown) || (S.vmShown.startsWith('m') && S.vmShownTerm !== q))) { hideVm(); writeState(); }
  S.vmRows = places;
  const acts = (key, l, what) => `<div class="acts"><button type="button" class="prp-btn sm" data-show="${esc(key)}">Show here</button><a class="prp-btn sm ghost" ${linkAttrs(l)} title="Open in ${PRODUCT}" aria-label="Open ${esc(what)} in ${PRODUCT}">↗</a></div>`;
  const cur = key => (S.vmShown === key ? ' aria-current="true"' : '');
  $('#era-rows').innerHTML = rows.map(r => (!r.available
    ? `<li class="off" data-key="${esc(r.id)}"><div class="what"><b>${esc(name(r))}</b><span>${esc(r.reason)}</span></div></li>`
    : `<li data-key="${esc(r.id)}"${cur(r.id)}><div class="what"><b>${esc(name(r))}${r.today ? '<span class="prp-kind">Today</span>' : ''}</b><span>${esc(r.place)}</span></div>${acts(r.id, places.get(r.id), name(r))}</li>`)).join('');
  $('#mentions').hidden = !listed.length;
  $('#mentions-label').textContent = `Where ${label} appears`;
  $('#mention-rows').innerHTML = listed.map(m => `<li data-key="${m.key}"${cur(m.key)}><div class="what"><b>${esc(m.name)}</b><span>${esc(m.place)}</span></div>${acts(m.key, m, m.name)}</li>`).join('');
  const shown = S.vmShown && places.get(S.vmShown);
  if (shown) vmShow(shown);
  setPaneHead(`In ${PRODUCT}`, shown ? `${shown.name} · ${shown.place}` : fmtEra(years), shown || null);
  // The screen the address names (show=, on a reload or an edited link) once its row exists; one this era does not
  // offer is dropped from the address.
  // An old address's show=pestle (before 15 November 2026 the row had no country) means the first country's row.
  if (S.pendingShow) {
    const k = S.pendingShow === 'pestle' ? [...places.keys()].find(x => x.startsWith('pestle:')) || 'pestle' : S.pendingShow;
    S.pendingShow = null;
    if (places.has(k)) showVm(k); else writeState();
  }
}
function hideVm() {
  S.vmShown = null;
  $('#vm-frame').hidden = true;
  $('#panel-vm .prp-side-card')?.remove();
  $('#vm-list').classList.remove('with-frame');
  $('#vm-empty').hidden = false;
}
/* A place in the pane's frame, or, where it cannot be framed (canFrame) or its page turned out not to be a submodule's
   (vmLoaded), a card with its link; the frame is then emptied, so nothing of it runs in the pane. */
function vmCard(r, why) {
  const f = $('#vm-frame');
  f.hidden = true;
  if (f.getAttribute('src') && f.dataset.url !== 'about:blank') frames.vm.go('about:blank');
  $('#panel-vm .prp-side-card')?.remove();
  $('#panel-vm').appendChild(card(r, why, { embedded, toShell: shellGo }));
}
function vmShow(r) {
  if (!r.fit?.ok) { vmCard(r, r.fit?.why || 'unlisted'); return; }
  $('#panel-vm .prp-side-card')?.remove();
  $('#vm-frame').hidden = false;
  frames.vm.go(r.page);
}
// The frame has loaded: a page without the connector (a missing page; the live site answers one with the shell itself)
// leaves the pane, and a card says so.
function vmLoaded({ ok, frame }) {
  if (frame.dataset.url === 'about:blank') return;
  const r = S.vmShown && S.vmRows?.get(S.vmShown);
  if (!ok) { if (r) vmCard(r, 'missing'); else { frame.hidden = true; frames.vm.go('about:blank'); } return; }
  if (!SPLIT.matches || S.fill) skipMatter(frame); // a sheet, or Screens only: the screen itself, not its front matter
}
function showVm(key) {
  const r = S.vmRows?.get(key);
  if (!r) return;
  S.vmShown = key; S.vmShownTerm = S.term;
  $$('#vm-list li').forEach(li => { if (li.dataset.key === key) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current'); });
  $('#vm-list').classList.add('with-frame');
  $('#vm-empty').hidden = true;
  $('#vm-frame').title = `${r.name} · ${r.place}`;
  vmShow(r);
  setPaneHead(`In ${PRODUCT}`, `${r.name} · ${r.place}`, r);
  writeState(); // the address names the screen, so a reload shows it again
}
/* The pane's two frames, as the shared pane moves its own (design/prp-split.js, sideFrame): named 'prp-side', moved by
   hash where they can be, given the page's theme, their top links kept out of the book when it is on its own, and a
   framed page's request to move the shell passed on (inside the shell) or opened in a new tab (on its own). On a phone
   the pane is a sheet, and a screen's own front matter (title, description, readings) fills a frame that tall: once the
   screen has loaded it is scrolled to just below its .prp-meta line (skipFrontMatter), as the Master Index frame is to
   the entry (watchEntry). */
const frames = {};
function makeFrames() {
  const common = { embedded, shell: SHELL, toShell: shellGo, onBlocked: url => notice(`The browser did not open a new tab for this page. <a href="${esc(url)}" target="_blank" rel="noopener">Open it</a>`) };
  frames.ency = sideFrame($('#ency-frame'), { ...common, onLoad: () => encyFrameLoaded() });
  frames.vm = sideFrame($('#vm-frame'), { ...common, onLoad: vmLoaded });
  // The Map tab's frame: the Omni-Map (a page with the connector, so a page without it is not shown).
  frames.map = sideFrame($('#map-frame'), { ...common, onLoad: ({ ok, frame }) => {
    if (frame.dataset.url === 'about:blank' || ok) return;
    frame.hidden = true; $('#map-empty').hidden = false; $('#map-empty').textContent = 'The Omni-Map could not be shown inside the page.';
  } });
  window.addEventListener('message', mapMessage);
  // Screens only's era screens: a page that loaded without the connector ends the screen's turn.
  frames.tour = sideFrame($('#tour-frame'), { ...common, onLoad: ({ ok, frame }) => {
    if (frame.dataset.url === 'about:blank') return;
    if (!ok) { const i = S.tourList?.list.findIndex(p => p.key === frame.dataset.key) ?? -1; if (i >= 0) S.tourList.list.splice(i, 1); endTour(); return; }
    skipMatter(frame);
  } });
  // Screens only scales a screen to its frame (fitScreens): again whenever a frame's box changes.
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => fitScreens()); ro.observe($('#vm-frame')); ro.observe($('#tour-frame')); }
}
// A line hanging from the head (a new tab the browser refused): one at a time, closed by its × or Escape.
function notice(html) {
  const n = $('#notice');
  $('#notice-text').innerHTML = html;
  n.hidden = !html;
}

/* ---------- the Map tab: the Omni-Map for the term in use (PRP-SCHOLAR-USP-DESIGN.md S1, 2.1, contract 1–5) ----------
   A click on a term (or the tab opened with a term in use) is resolved by design/vm-click.js into a view recipe, the
   offers beside it ("This passage", "Its whole life", the Master Index entry, the Wikipedia article) and what is
   related; the frame (omni/index.html#<recipe>&host=neo) draws it and posts { type: 'vm:view', recipe, state } on
   every change, which this page keeps in its address (&map=, written with replaceState: the address is the single source
   of truth) and in window.omniState. An address that names map= opens on that view; one with pane=map and no map=
   resolves the term (t=) in its paragraph (p=). */
const loadOmniLayers = once(() => getJson(new URL('omni/data/layers.json', SHELL)));
const loadBattles = once(() => getJson(new URL('omni/data/layers/battles.json', SHELL)).then(d => d.rows || []));
const periodsOf = new Map();
// The books with a periods file (periods/index.json): only those are asked for, so a book without one costs no 404.
const loadPeriodsIndex = once(() => getJson(`${DATA}periods/index.json`).then(d => new Set(Array.isArray(d?.books) ? d.books : [])).catch(() => new Set()));
function loadPeriods(slug) {
  if (!periodsOf.has(slug)) periodsOf.set(slug, loadPeriodsIndex().then(have => (have.has(slug) ? getJson(`${DATA}periods/${encodeURIComponent(slug)}.json`) : null))
    .then(readPeriods).catch(() => readPeriods(null)));
  return periodsOf.get(slug);
}
const omniAt = recipe => pageUrl(`omni/index.html#${recipe}&host=neo`);
/** The click's view for a term in a paragraph: { entry, res } (res is vm-click's { recipe, offers, related, thin }), or
    null when the Master Index has no record of the term. */
async function clickView(qid, pid) {
  const c = chapter(), ent = await entity(qid);
  if (!ent || !c) return null;
  const para = c.paragraphs.find(p => p.id === pid) || null;
  const passageQs = para ? [...new Set(validTerms(para).map(t => t.qid))] : [];
  const relQs = ['Country', 'Participants', 'Member of'].flatMap(k => (ent.rel?.[k] || []).map(x => x[0]));
  const recs = new Map();
  await Promise.all([...new Set([...passageQs, ...relQs])].map(async q => { recs.set(q, await entity(q)); }));
  const [periods, battles, layers, wars] = await Promise.all([loadPeriods(S.book.slug), loadBattles().catch(() => []), loadOmniLayers().catch(() => null), loadWars().catch(() => [])]);
  const ctx = {
    today: new Date().toISOString().slice(0, 10), era: bookEra(S.book, S.row, c)?.years, record: pid ? periods(pid) : null,
    lookup: q => recs.get(q) || null, passagePlaces: passageQs.filter(q => recs.get(q)?.type === 'place'), battles, wars,
    layers: { borders: { step: layers?.layers?.find(l => l.id === 'borders')?.time?.step || 'y' } },
  };
  const from = { module: 'neo-classic', at: `bibliotheca/neo/index.html${hashFor(c.n, { p: pid, t: qid })}`, ...(pid ? { passage: { book: S.book.slug, ch: c.n, p: pid } } : {}) };
  return { entry: ent, res: resolve(ent, from, ctx) };
}
// The tab: the view for the term in use, made once per term and paragraph; the address's own view (map=) when it names one.
async function renderMap() {
  const q = S.term, pid = S.mapPid || S.current || S.p || null, key = `${q}|${pid}`;
  const f = $('#map-frame');
  if (!q) {
    $('#map-empty').hidden = false; f.hidden = true; $('#map-card').hidden = true;
    setPaneHead('Omni-Map', 'No term chosen', null);
    return;
  }
  const seq = ++S.mapSeq;
  const label = S.labels.get(q) || q;
  if (S.mapKey !== key || !S.mapRes) {
    setPaneHead('Omni-Map', label, null);
    const v = await clickView(q, pid);
    if (seq !== S.mapSeq) return;
    S.mapRes = v; S.mapKey = key;
    if (!v) { $('#map-empty').hidden = false; $('#map-empty').textContent = `The Master Index holds no record of ${label} yet, so VM cannot map it.`; f.hidden = true; $('#map-card').hidden = true; S.map = null; writeState(); return; }
    if (!S.mapFromAddress) S.map = v.res.recipe;
  }
  S.mapFromAddress = false;
  $('#map-empty').hidden = true;
  f.hidden = false;
  drawMapCard();
  showMapRecipe(S.map || S.mapRes.res.recipe);
}
function showMapRecipe(recipe) {
  S.map = recipe;
  const r = readRecipe(recipe), win = r?.t ? formatSpan(r.t.from, r.t.to) : '';
  const label = S.mapRes?.entry?.label || S.labels.get(S.term) || S.term;
  setPaneHead('Omni-Map', win ? `${label} · ${win}` : label, placeLink('ds', 'omni-map', `omni/index.html#${recipe}`));
  $('#map-frame').title = `Omni-Map: ${label}`;
  frames.map.go(omniAt(recipe));
  writeState();
}
// Two recipes are the same view whatever year the slider shows (an offer stays marked as the reader moves it).
const sameView = (a, b) => { const x = readRecipe(a || ''), y = readRecipe(b || ''); if (!x || !y) return false; delete x.at; delete y.at; return writeRecipe(x) === writeRecipe(y); };
// Under the frame: the click's offers (2.2), what is related, and 2.5's words when VM holds little.
function drawMapCard() {
  const v = S.mapRes, card = $('#map-card');
  if (!v) { card.hidden = true; return; }
  const { offers, related, thin } = v.res;
  const off = o => {
    if (!o.available) return `<li class="off"><b>${esc(o.name)}</b><span>${esc(o.reason || '')}</span></li>`;
    if (o.recipe) return `<li><button type="button" class="prp-btn sm${sameView(o.recipe, S.map) ? ' on' : ''}" data-recipe="${esc(o.recipe)}" aria-pressed="${sameView(o.recipe, S.map)}">${esc(o.name)}</button><span>${esc(o.why)}</span></li>`;
    const ext = /^https?:/.test(o.at);
    const l = ext ? { href: o.at, target: '_blank' } : placeLink('rs', o.id === 'entry' ? 'encyclopedia' : 'war-focus', o.at);
    return `<li><a class="prp-btn sm ghost" href="${esc(l.href)}" target="${esc(l.target)}" rel="noopener"${l.hash ? ` data-shell-hash="${esc(l.hash)}"` : ''}>${esc(o.name)} ↗</a><span>${esc(o.why)}</span></li>`;
  };
  card.innerHTML = (thin ? `<p class="nc-map-thin">${esc(thin.text)}</p>` : '')
    + `<ul class="nc-map-offers" aria-label="Views offered">${offers.map(off).join('')}</ul>`
    + related.map(g => `<p class="prp-label">${esc(g.group)}</p><ul class="nc-map-related">${g.items.map(i => { const l = placeLink('rs', 'encyclopedia', i.at); return `<li><a ${linkAttrs(l)}><bdi>${esc(i.label)}</bdi></a> <span>${esc(i.why)}</span></li>`; }).join('')}</ul>`).join('');
  card.hidden = false;
}
// The frame's view, as it posts it: only from the Map tab's own frame, and only from this site.
function mapMessage(e) {
  const f = $('#map-frame');
  const ours = !!f && e.source === f.contentWindow && e.origin === location.origin;
  if (!ours) return;
  if (!e.data || e.data.type !== 'vm:view' || typeof e.data.recipe !== 'string') return;
  const r = readRecipe(e.data.recipe);
  if (!r) return;
  S.map = writeRecipe(r);
  if (e.data.state && typeof e.data.state === 'object') window.omniState = e.data.state;
  if (S.mapRes) $$('#map-card [data-recipe]').forEach(b => { const on = sameView(b.dataset.recipe, S.map); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  if (S.pane === 'map') writeState();
}

/* ---------- Augmented Reading ---------- */
const chapterKey = () => `${S.book?.slug}#${chapter()?.n}`;
const HL = typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight === 'function';

/* The mode. Turned on (the button, A, or ar=1 in the address): the narrator's row in the head, the pane on its Master
   Index tab showing the term nearest the reader's paragraph (only when it was turned on by hand: an address says
   itself whether the pane is open). Turned off: the narrator stops and the marks go; the pane stays as it is. */
function setAr(on, { byHand = false } = {}) {
  on = !!on && !inSide && !!chapter();
  if (on === S.ar) return;
  keepPlace(() => {
    S.ar = on;
    $('#nar').hidden = !on; $('#nar-msg').hidden = !on;
    $('#ar-toggle').setAttribute('aria-pressed', String(on));
    $('#pane-fill').hidden = !on;
  });
  if (on) {
    makeNarrator();
    narr.load(chapter(), chapterKey(), Math.max(0, chapter().paragraphs.findIndex(p => p.id === S.current)));
    nearHere(S.current);
    if (byHand && S.pane !== 'ency') openPane('ency');
    else if (S.pane === 'ency') renderMasterIndex();
    // The proxy is asked whether it is set up (and which voices it has) when the mode is first turned on.
    if (!narr.online) narr.refresh().then(drawNar);
    deviceCheck();
  } else {
    narr?.pause();
    unmark(); S.say = null; S.near = null; S.msg = null; closeOffer();
    if (S.fill) setFill(false);
    if (S.pane === 'ency') renderMasterIndex();
  }
  drawNar();
  writeState();
}

// The term nearest a paragraph (or the next one that is read, if it is a note or a table), shown at once.
function nearHere(pid) {
  const c = chapter();
  if (!c) return;
  const i = Math.max(0, c.paragraphs.findIndex(p => p.id === pid));
  const p = c.paragraphs.slice(i).find(x => S.terms.base.has(x.id)) || [...c.paragraphs].reverse().find(x => S.terms.base.has(x.id));
  const b = p ? S.terms.base.get(p.id) : 0;
  S.near = nearestTerm(S.terms.terms, b, b + (p?.text.length || 0));
  if (S.tour) endTour();
  S.fs = fresh(S.near);
  if (S.pane === 'ency' && !S.term) renderMasterIndex();
  drawNar();
}
// Letting go of the pane (Hold pressed again, or the reader's term cleared): the Master Index tab, the nearest term.
function letGo() {
  S.term = null; highlight(); renderChips(true);
  if (S.tour) endTour();
  const u = S.say;
  if (u) { const sp = span(S.terms.base, u.pid, u.unit); S.near = nearestTerm(S.terms.terms, sp.from, sp.to); S.fs = { showing: S.near, read: 0, fresh: false }; }
  else nearHere(S.current);
  if (S.pane !== 'ency') openPane('ency'); else { renderMasterIndex(); writeState(); }
  drawNar();
}
/* Hold: the term showing becomes the reader's own (ringed, and t= in the address), exactly as if they had chosen it;
   pressed again, it lets go. */
function setHold(on) {
  if (!S.ar) return;
  if (!on) { letGo(); return; }
  // An era screen's turn in Screens only: Hold keeps that screen, on the "In Vitruvian Manager" tab (show= in the
  // address), as if the reader had chosen it there.
  const t = touring();
  if (t?.picture) return; // a picture's turn passes by itself: there is nothing to hold it on
  if (t) { S.pendingShow = t.key; endTour(); openPane('vm'); drawNar(); return; }
  const q = shownTerm();
  if (!q) return;
  S.term = q; highlight(); renderChips(true);
  if (S.pane) renderPane();
  writeState(); drawNar();
}

/* ---------- the narrator ---------- */
function makeNarrator() {
  if (narr) return;
  narr = new Narrator({
    store,
    onUnit: onUnit,
    onWord: i => subsWord(i),
    onState: () => { drawNar(); keepAwake(narr.playing); },
    onMessage: m => { S.msg = m; if (m && /^(used|daily|monthly|unavailable|error)$/.test(m.why)) narr.refresh().then(drawNar); drawNar(); },
    onChapterEnd: () => chapterEnd(),
  });
  window.__narrator = narr; // for the page tests: the narrator's position and count, read only
  fillVoices();
  narr.device.device.onChange(() => { fillVoices(); deviceCheck(); });
}
// No voice on this device, decided only once the browser has listed its voices or 1.6 s after the mode is turned on
// (Chrome and Edge list them a moment after the page loads: before that, every browser looks as if it had none).
let deviceTimer = 0;
function deviceCheck() {
  if (narr.hasDeviceVoice()) { S.noDevice = false; drawNar(); return; }
  clearTimeout(deviceTimer);
  deviceTimer = setTimeout(() => { S.noDevice = !narr.hasDeviceVoice(); drawNar(); }, 1600);
}
function play() {
  if (!narr || S.noDevice && !narr.permit) return;
  // From the start of the unit it paused on (or the paragraph the mode, or a jump, put it at), brought into view.
  S.look = true; S.fs.fresh = true;
  if (S.msg?.why === 'end' || S.msg?.why === 'nodevice' || S.msg?.why === 'failed') S.msg = null;
  narr.play();
}
function toggleRead() { if (!narr) return; if (narr.playing) narr.pause(); else play(); }

// Each unit as it starts: marked, kept in view, the pane's rule asked, the subtitles drawn.
function onUnit({ pid, unit }) {
  if (!S.ar) return;
  const prev = S.say, followed = S.look || (prev && inRegion(rangeRect(prev)));
  S.say = { pid, unit };
  S.look = false;
  mark();
  if (followed) keepInView();
  if (S.pin && S.pin !== pid) S.pin = null; // the jump's paragraph is read: the current one follows the voice now
  const { state, show } = follow(S.fs, span(S.terms.base, pid, unit), S.terms.terms);
  S.fs = state;
  if (show) { S.near = show; if (S.tour) endTour(); if (!held() && S.pane === 'ency') renderMasterIndex(); }
  else if (S.fill && !held() && S.pane === 'ency') {
    // Screens only: a picture of the book or a screen for its era takes its turn (lib/follow.js, tour).
    if (S.tourList?.key !== chapterKey()) loadTour();
    const tl = S.tourList?.key === chapterKey() ? S.tourList : { list: [], pictures: [] };
    const t = tour(S.fs, show, { screens: tl.list.length + tl.pictures.length, since: S.since });
    if (t.screen) {
      const turn = turnOf(S.turn++, tl.pictures.length, tl.list.length);
      S.fs = t.state; S.since = 0;
      S.tour = turn.kind === 'picture' ? tl.pictures[turn.i] : tl.list[S.eraI++ % tl.list.length];
      renderMasterIndex();
    }
  }
  S.since += unit.text.length;
  drawSubs();
  if (S.offer) drawOffer();
  drawNar();
  if (textHidden()) narr.pause();
}
function chapterEnd() {
  if (S.ci >= S.chapters.length - 1) { S.msg = { why: 'end' }; drawNar(); return; }
  const at = S.ci;
  // A moment between chapters, then the next one, read from its start (unless the reader has done something else).
  setTimeout(() => { if (!S.ar || S.ci !== at || narr.playing) return; goChapter(at + 1); S.look = true; S.fs.fresh = true; narr.play(); }, 900);
}
// Inside the shell, leaving the page hides its frame: the text then has no box, and the narrator pauses. (The
// frame's window keeps its size; an IntersectionObserver hears the moment it goes, and each unit looks again.)
const textHidden = () => { const r = $('#text').getBoundingClientRect(); return r.width === 0 && r.height === 0; };

/* ---------- the marks ---------- */
// A range over a paragraph's text offsets: its text nodes in order, each <br> of a verse counted as the one
// character ("\n") it stands for, which the element's own text leaves out.
function rangeIn(el, s, e) {
  const r = document.createRange();
  let at = 0, started = false;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 1) {
      if (n.tagName !== 'BR') continue;
      if (!started && s <= at) { r.setStartBefore(n); started = true; }
      at += 1;
      if (started && e <= at) { r.setEndAfter(n); return r; }
      continue;
    }
    const len = n.data.length;
    if (!started && s < at + len) { r.setStart(n, Math.max(0, s - at)); started = true; }
    if (started && e <= at + len) { r.setEnd(n, e - at); return r; }
    at += len;
  }
  if (!started) r.setStart(el, 0);
  r.setEnd(el, el.childNodes.length);
  return r;
}
function unmark() {
  if (HL) { CSS.highlights.delete('nc-say'); CSS.highlights.delete('nc-say-part'); }
  $$('#text p.saying').forEach(p => p.classList.remove('saying'));
}
function mark() {
  unmark();
  const u = S.say, el = u && document.getElementById(u.pid);
  if (!el) return;
  if (HL) {
    CSS.highlights.set('nc-say', new Highlight(rangeIn(el, u.unit.say[0], u.unit.say[1])));
    if (u.unit.part) CSS.highlights.set('nc-say-part', new Highlight(rangeIn(el, u.unit.from, u.unit.to)));
  } else el.classList.add('saying'); // no Highlight API: a rule down the paragraph's side
}
function rangeRect(u) {
  const el = u && document.getElementById(u.pid);
  if (!el) return null;
  const r = rangeIn(el, u.unit.from, u.unit.to).getBoundingClientRect();
  return r.width || r.height ? r : el.getBoundingClientRect();
}
function inRegion(r) { if (!r) return false; const { top, bottom } = region(); return r.bottom > top && r.top < bottom; }
/* Kept in view: a unit outside the upper three quarters of the reading region is scrolled to the reading line, 30% of
   the way down (the line that decides the current paragraph, so it, the progress and p= in the address follow the
   voice). Smooth, or at once with reduced motion. The narrator's scroll lets go of a pinned paragraph. */
function keepInView() {
  const r = rangeRect(S.say);
  if (!r) return;
  const { top, bottom } = region(), h = bottom - top;
  if (r.top >= top && r.bottom <= top + h * 0.75) return;
  S.pin = null;
  // A unit taller than the room under the reading line (a phone, with the sheet) sits as low as it can and still
  // clear the foot of the region; one taller than the region, at its top.
  let want = top + h * 0.3;
  if (r.height > bottom - want - 4) want = Math.max(top + 4, bottom - r.height - 4);
  window.scrollBy({ top: Math.round(r.top - want), behavior: reduced() ? 'auto' : 'smooth' });
}

/* ---------- Screens only, and the subtitles ---------- */
function setFill(on) {
  on = !!on && S.ar;
  if (on && !S.pane) openPane('ency');
  if (on === S.fill) return;
  S.fill = on;
  $('#layout').classList.toggle('fill', on);
  document.documentElement.classList.toggle('nc-filled', on); // the page's own scroll bar goes (styles.css)
  $('#pane-fill').setAttribute('aria-pressed', String(on));
  if (on) loadTour(); else endTour();
  // A screen already shown on the other tab is moved past its front matter, as one shown in Screens only is (vmLoaded).
  if (on && S.vmShown && !$('#vm-frame').hidden && $('#vm-frame').dataset.url !== 'about:blank') skipMatter($('#vm-frame'));
  fillTop(); drawSubs();
  if (chapter()) observe();
  fitScreens();
}
/* Screens only, side by side or wider (BI-20, 15 November 2026): a screen of Vitruvian Manager is drawn for a window,
   and the pane is a little over half one; framed at the pane's own size its map or timeline was cut off at the foot.
   So the screen is given the window's height, at most, and scaled down to the pane (CSS zoom on the frame: the frame
   keeps its box, its page lays out in a viewport 1/zoom as large), never below 0.6, where its words would be too small
   to read. On a phone the screen keeps its own phone layout, unscaled. Called when a frame's box changes (the pane
   filling the page, the subtitles coming and going, the window) and when the mode changes. */
const SCREEN_ZOOM_MIN = 0.6;
function fitScreens() {
  for (const f of [$('#vm-frame'), $('#tour-frame')]) {
    const h = f.getBoundingClientRect().height;
    const z = S.fill && SPLIT.matches && !f.hidden && h > 0 ? Math.max(SCREEN_ZOOM_MIN, Math.min(1, h / window.innerHeight)) : 1;
    const want = z < 0.995 ? z.toFixed(3) : '';
    if (f.style.zoom !== want) f.style.zoom = want;
  }
}

/* Screens only: the era's screens take their turn with the entries (lib/follow.js, tour), so the documentary shows
   Vitruvian Manager's data and screens, not only Master Index entries. They are the rows of the "In Vitruvian Manager"
   tab for the book's (or the chapter's) era that can be framed, less National Analysis, which shows countries as they
   are today. A screen in turn is shown in its own frame on the Master Index tab, so the pane is not held by it: the
   next term takes the pane back, and Hold keeps the screen (it moves to the other tab, with show= in the address). */
const touring = () => (S.tour && S.ar && S.fill && !S.term && S.pane === 'ency' ? S.tour : null);
const KINO_DATA = new URL('kino/data/', SHELL).href;
const loadPictures = once(() => getJson(`${DATA}pictures.json`));
const loadMedia = once(() => getJson(`${KINO_DATA}media.json`));
const films = new Map();
const loadFilm = path => { if (!films.has(path)) films.set(path, getJson(`${KINO_DATA}${path}.json`).catch(() => null)); return films.get(path); };
let tourSeq = 0;
/* The chapter's turns: its pictures (lib/pictures.js; a film's scene is looked up in the film) and the era's screens
   that can be framed. Kept for the chapter (S.tourList); the turns count from 0 with each chapter (S.turn), and the
   era's screens go round across chapters (S.eraI). */
async function loadTour() {
  const key = chapterKey();
  if (S.tourList?.key === key || S.tourList?.loading === key) return;
  const seq = ++tourSeq, own = bookEra(S.book, S.row, chapter()), slug = S.book?.slug, n = chapter()?.n;
  S.tourList = { key: null, loading: key, list: [], pictures: [] };
  const [reg, wars, energy, pics] = await Promise.all([loadRegistry().catch(() => null), loadWars().catch(() => []), loadEnergy().catch(() => null), loadPictures().catch(() => null)]);
  const steps = energy?.steps?.map(s => s.year) || KARDASHEV_STEPS;
  const list = !own ? [] : eraRows(own.years, { wars, steps }).filter(r => r.available && !r.today).map(r => {
    const l = placeLink(r.suite, r.module, r.at);
    return { key: r.id, ...l, module: r.module, name: moduleInfo(reg, r.module)?.name || r.name, place: r.place, fit: canFrame({ module: r.module, page: l.page }, reg, SHELL) };
  }).filter(p => p.fit.ok);
  const pictures = [];
  for (const p of picturesFor(pics, slug, n)) {
    let scene = p.scene, doc = null;
    if (p.film) {
      doc = await loadFilm(p.film);
      scene = doc ? flatScenes(doc).find(s => s.id === p.scene) : null;
    }
    if (!scene?.visual || scene.visual.kind === 'module') continue;
    const film = doc ? { title: doc.title, link: placeLink('kino', `kino-${p.film.split('/')[0]}`, `kino/index.html?cat=${p.film.split('/')[0]}#doc=${doc.id}&s=${scene.id}`) } : null;
    pictures.push({ key: p.key, picture: true, scene, doc: doc || { title: S.book.title, sources: [] }, film, name: scene.title, place: film ? `from the Kino film ${film.title}` : `made for ${S.book.title}` });
  }
  if (seq !== tourSeq || key !== chapterKey()) return;
  S.tourList = { key, list, pictures };
}
/* A picture's turn: Kino's stage (kino/lib/stage.js, loaded the first time) draws the scene, with Kino's credited
   images (kino/data/media.json); its loops stop when the turn ends. */
let stage = null, stagePromise = null;
async function drawPicture(t) {
  const el = $('#picture-stage');
  el.setAttribute('aria-label', t.name);
  el.dataset.key = t.key;
  $('#picture-cap').innerHTML = `<b>${esc(t.name)}</b> · ${t.film ? `from the Kino film ${esc(t.film.title)}` : `a picture made for ${esc(S.book.title)}`}`;
  try {
    stagePromise ||= Promise.all([import('../../kino/lib/stage.js'), loadMedia().catch(() => ({ files: {}, qids: {} }))])
      .then(([m, media]) => new m.Stage(el, { media, base: KINO_DATA, embedded, moduleInfo: () => ({}), onLink: () => {} }));
    stage = await stagePromise;
  } catch { stagePromise = null; $('#picture-cap').textContent = 'The picture could not load.'; return; }
  if (touring() !== t) return;
  await stage.show(t.scene, t.doc);
}
function stopPicture() { if (stage?.scene) { stage.scene = null; stage.stopLoops(); } }
// The screen's turn is over (a term took the pane back, the chapter changed, Screens only or the mode ended): its
// frame is emptied, so no page runs hidden in the pane.
function endTour() {
  if (S.fs?.showing === SCREEN) S.fs.showing = S.near;
  const was = !!S.tour;
  S.tour = null;
  $('#picture').hidden = true; stopPicture();
  const f = $('#tour-frame');
  f.hidden = true;
  if (f.getAttribute('src') && f.dataset.url !== 'about:blank') frames.tour.go('about:blank');
  if (was && S.pane === 'ency') renderMasterIndex();
}
function setSubs(on) { S.subs = !!on; store.set(KEYS.subs, S.subs); drawSubs(); }
// The strip at the foot of the pane, in Screens only: the unit being read, three lines, scrolled by whole lines to
// the word being said. Hidden from screen readers: the same words are spoken, and marked in the text. With nothing
// said yet (before Play, or a new chapter) the strip is not there at all, so the screen runs to the foot of the pane
// rather than over an empty band (BI-20, 15 November 2026).
function drawSubs() {
  const u = S.say?.unit, on = S.fill && S.subs;
  $('#nar-subs').hidden = !S.fill;
  $('#nar-subs').setAttribute('aria-pressed', String(S.subs));
  $('#subs').hidden = !on || !u;
  if (!on) return;
  const box = $('#subs-box');
  const key = u ? `${S.say.pid}:${u.s}` : '';
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.innerHTML = u ? u.words.map(w => `<span data-i="${w.i}">${esc(u.text.slice(w.from, w.to))}</span>`).join(' ') : '';
  box.scrollTop = 0;
}
function subsWord(i) {
  if (!S.fill || !S.subs) return;
  const box = $('#subs-box'), w = box.querySelector(`span[data-i="${i}"]`);
  if (!w) return;
  box.querySelector('span.on')?.classList.remove('on');
  w.classList.add('on');
  const line = parseFloat(getComputedStyle(box).lineHeight) || w.offsetHeight || 1;
  const top = w.offsetTop - box.offsetTop;
  if (top < box.scrollTop || top + w.offsetHeight > box.scrollTop + box.clientHeight + 1) box.scrollTop = Math.floor(top / line) * line;
}

/* ---------- the narrator's row ---------- */
const deviceId = name => `device:${name}`;
function fillVoices() {
  if (!narr) return;
  const sel = $('#nar-voice'), dev = narr.deviceVoices(), online = narr.online?.available ? narr.online.voices : [];
  const groups = [];
  groups.push(`<optgroup label="This device">${dev.length ? dev.map(v => `<option value="${esc(deviceId(v.name))}">${esc(v.name)}</option>`).join('') : '<option value="" disabled>No voice on this device</option>'}</optgroup>`);
  if (online.length) groups.push(`<optgroup label="Azure (online)">${online.map(v => `<option value="${esc(v.id)}">${esc(v.label)}</option>`).join('')}</optgroup>`);
  const html = groups.join('');
  if (sel.dataset.html !== html) { sel.innerHTML = html; sel.dataset.html = html; }
  sel.value = narr.permit ? narr.permit.voice : narr.deviceVoice ? deviceId(narr.deviceVoice) : '';
}
function drawNar() {
  if (!narr || !S.ar) return;
  fillVoices();
  const playing = narr.playing, b = $('#nar-play');
  b.setAttribute('aria-pressed', String(playing));
  b.setAttribute('aria-label', playing ? 'Pause' : 'Read aloud');
  b.title = playing ? 'Pause (R)' : 'Read aloud (R)';
  b.querySelector('.ico').textContent = playing ? '❚❚' : '▶';
  b.querySelector('.lbl').textContent = playing ? 'Pause' : 'Read';
  b.disabled = !!S.noDevice && !narr.permit;
  $('#nar-speed').value = String(narr.speed);
  $('#nar-hold').setAttribute('aria-pressed', String(held()));
  $('#nar-hold').disabled = !held() && (touring() ? !!touring().picture : !shownTerm());
  const fsOn = !!fs?.on;
  $('#nar-full').setAttribute('aria-pressed', String(fsOn));
  // Where the narrator is, for the page tests (and nothing else).
  const nar = $('#nar');
  nar.dataset.pid = narr.passage?.id || ''; nar.dataset.k = String(narr.pos.k); nar.dataset.voice = narr.voiceKind;
  // The message line: what happened; else the running count of the online voice; else nothing. And, when an online
  // voice has been chosen this visit and none is reading now, one button that offers the rest of the chapter.
  let text = '';
  const m = S.msg, fmtc = n => `${fmt(n)} character${n === 1 ? '' : 's'}`;
  if (m) {
    text = {
      used: `The ${fmtc(m.permit?.chars || 0)} you allowed have been read. This device's voice reads on.`,
      daily: 'The online voice has used today’s allowance. This device’s voice reads on.',
      monthly: 'The online voice has used this month’s allowance. This device’s voice reads on.',
      unavailable: 'The online voice is not answering. This device’s voice reads on.',
      error: 'The online voice is not answering. This device’s voice reads on.',
      nodevice: narr.online?.available ? 'This browser has no voice of its own: the reading pauses. Choose an online voice to hear the book.' : 'This browser has no voice of its own, so it cannot read the book aloud.',
      failed: 'This device’s voice could not read this paragraph.',
      end: 'The end of the book.',
    }[m.why] || '';
  } else if (S.noDevice && !narr.permit) {
    text = narr.online?.available ? 'This browser has no voice of its own. Choose an online voice to hear the book.' : 'This browser has no voice of its own, so it cannot read the book aloud.';
  } else if (narr.count) text = `Online voice: ${fmt(narr.count.used)} of ${fmtc(narr.count.chars)}`;
  $('#nar-msg-text').textContent = text;
  const again = $('#nar-again');
  // (At a new chapter the narrator asks the proxy afresh what is left; the offer waits for that answer.)
  const f = narr.lastOnline && !narr.permit && !narr.stale && !S.offer && narr.online?.available ? narr.figures(narr.lastOnline) : null;
  again.hidden = !(f && f.allow.chars > 0);
  if (f && f.allow.chars > 0) {
    again.dataset.voice = f.voice;
    again.textContent = `Read on with ${f.name} (online): ${fmtc(f.allow.chars)}`;
    again.title = f.allow.all ? `From here to the end of this chapter, ${fmtc(f.cost)}, about ${f.minutes} minutes` : `Of ${fmtc(f.cost)} to the end of this chapter, today’s allowance covers ${fmtc(f.allow.chars)}, to the end of a paragraph`;
  }
}

/* The offer of an online voice, hanging from the head: what it costs from here to the end of the chapter, and what is
   left (asked afresh). Choosing the voice in the list reads nothing: "Read with it" gives permission for the figure
   shown, worked out again at the press; "Keep this device's voice" closes it. */
async function openOffer(voiceId) {
  S.offer = { voice: voiceId, ready: false };
  const o = $('#nar-offer');
  o.hidden = false;
  $('#nar-offer-text').textContent = 'Asking the online voice what is left…';
  $('#nar-accept').disabled = true;
  await narr.offer(voiceId);
  if (S.offer?.voice !== voiceId) return;
  S.offer.ready = true;
  drawOffer();
  $('#nar-accept').focus({ preventScroll: true });
}
function drawOffer() {
  if (!S.offer?.ready) return;
  const f = narr.figures(S.offer.voice), about = f.about ? 'about ' : '', About = f.about ? 'About ' : '';
  const today = Math.min(f.today, narr.day.allowed(f.today));
  let t = `${f.name} (online): from here to the end of this chapter is ${fmt(f.cost)} characters, about ${f.minutes} minute${f.minutes === 1 ? '' : 's'}. ${About}${fmt(today)} are left to you today, and ${about}${fmt(f.month)} to the site this month. Each sentence is sent to Microsoft Azure to be spoken.`;
  if (!f.allow.chars) t += ' Nothing more can be read with it today: this device’s voice reads on.';
  else if (!f.allow.all) t += ` Today’s allowance covers the first ${fmt(f.allow.chars)}, about ${f.allow.minutes} minute${f.allow.minutes === 1 ? '' : 's'}, to the end of a paragraph; this device’s voice reads the rest.`;
  $('#nar-offer-text').textContent = t;
  $('#nar-offer').dataset.cost = String(f.cost); $('#nar-offer').dataset.allow = String(f.allow.chars);
  $('#nar-accept').disabled = !f.allow.chars;
}
function closeOffer() { S.offer = null; $('#nar-offer').hidden = true; if (narr) { fillVoices(); drawNar(); } }
// In the press: permission, the audio unlocked, the unit read again with the online voice.
function acceptOnline(voiceId) {
  if (!narr) return;
  S.msg = null;
  if (!narr.accept(voiceId)) { drawOffer(); return; }
  S.look = true;
  closeOffer(); drawNar();
}

/* ---------- full screen: the whole page ---------- */
let fs = null;
function toggleFull() {
  if (!fs?.supported) return;
  const el = S.current && document.getElementById(S.current);
  S.fsKeep = el ? { id: S.current, top: el.getBoundingClientRect().top } : null;
  fs.toggle();
}
// The reader's paragraph is kept where it was on the way in and on the way out.
function fullChanged() {
  const k = S.fsKeep, el = k && document.getElementById(k.id);
  if (el) { window.scrollBy(0, el.getBoundingClientRect().top - k.top); pinAt(k.id, k.top); }
  S.fsKeep = null;
  if (chapter()) observe();
  drawNar();
}

// While it reads the screen is kept awake (where the browser can), and let go on pause.
let wake = null;
async function keepAwake(on) {
  try {
    if (on && !wake && navigator.wakeLock && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener?.('release', () => { wake = null; }); }
    else if (!on && wake) { const w = wake; wake = null; await w.release(); }
  } catch { wake = null; }
}

/* ---------- the address ---------- */
let writeTimer = 0;
function queueWrite() { clearTimeout(writeTimer); writeTimer = setTimeout(writeState, 350); }
function writeState() {
  clearTimeout(writeTimer);
  if (!S.book) return;
  // The screen shown in the pane, or the one the address named and the pane has not drawn yet (so a write in between
  // does not drop it); the era choice whenever it is the term's.
  const show = S.pane === 'vm' ? S.vmShown || S.pendingShow : null;
  const hash = writeMode(writeHash({ book: S.book.slug, ch: chapter()?.n, p: S.p, t: S.term, pane: S.pane, show, era: S.eraOf === 'term' ? 'term' : null,
    map: S.pane === 'map' ? S.map : null, sel: S.sel }), { ar: S.ar });
  if (hash !== location.hash) { try { history.replaceState(history.state, '', hash); } catch { /* rate-limited: the next move writes it */ } }
  if (S.ar) drawNar(); // Hold follows the reader's term and the tab
}
// A chapter opens with its head at the top of the screen, its first paragraph pinned there (lest the web fonts,
// arriving, reflow the front matter above and push it down).
function scrollToReader() {
  window.scrollTo({ top: $('#reader').getBoundingClientRect().top + window.scrollY, behavior: 'auto' });
  const first = $('#text p.para');
  if (first) pinAt(first.id, first.getBoundingClientRect().top);
}
function jumpTo(id, { smooth = false } = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  const glide = smooth && !reduced();
  el.scrollIntoView({ block: 'start', behavior: glide ? 'smooth' : 'auto' });
  pinAt(id, glide ? null : el.getBoundingClientRect().top); // a glide lands later: nothing to hold yet
  S.p = id;
  // In Augmented Reading the reading moves too: it carries on from the paragraph landed on (the term nearest it shown
  // at once while it is paused; the first sentence read there while it reads).
  if (S.ar && narr) { narr.at(chapter().paragraphs.findIndex(p => p.id === id)); S.look = true; S.fs.fresh = true; if (!narr.playing) nearHere(id); }
  schedule(); writeState();
}
function goChapter(i) {
  if (i < 0 || i >= S.chapters.length || i === S.ci) return;
  renderChapter(i);
  scrollToReader();
  writeState();
}

async function applyHash({ first = false } = {}) {
  const h = readHash(location.hash), mode = readMode(location.hash); // read before anything rewrites the address
  // The Map tab's view and the selection: map= is the view to draw (the address is its single source of truth).
  const mp = readMap(location.hash);
  S.sel = mp.sel;
  if (h.pane === 'map') {
    S.mapPid = h.p || S.mapPid;
    if (mp.map && mp.map !== S.map) { S.map = mp.map; S.mapFromAddress = true; }
  }
  const slug = S.shelf.some(b => b.slug === h.book) ? h.book : S.shelf[0].slug;
  if (S.book?.slug !== slug) { if (S.vmShown) hideVm(); if (!(await loadBook(slug))) return; }
  let ci = h.ch === null ? 0 : S.chapters.findIndex(c => c.n === h.ch);
  if (ci < 0) ci = 0;
  const moved = ci !== S.ci;
  // Whose era, and the screen the pane shows (shown by renderVm once its row exists); an address on the pane's list
  // with no screen named shows the list alone.
  S.eraOf = h.era === 'term' ? 'term' : 'book';
  S.pendingShow = h.show;
  if (h.pane === 'vm' && !h.show && S.vmShown) hideVm();
  if (moved) renderChapter(ci);
  if (h.t !== S.term) { S.term = h.t; highlight(); }
  if (h.pane && h.pane !== S.pane) openPane(h.pane);
  else if (!h.pane && S.pane) closePane();
  else if (S.pane) renderPane();
  // ar=1 turns the mode on, and its absence turns it off, as the pane follows pane=.
  if (mode.ar !== S.ar) setAr(mode.ar);
  if (h.p && document.getElementById(h.p) && h.p !== S.current) jumpTo(h.p);
  else if (moved && !(first && h.ch === null)) scrollToReader();
  renderChips(true);
  writeState(); // the address as the page reads it (an unknown chapter becomes the first)
}

/* ---------- events ---------- */
function wire() {
  // A term in the text or the byline: a plain click uses it; Ctrl, Shift or the middle button open its entry.
  for (const box of [$('#text'), $('#byline')]) box.addEventListener('click', e => {
    const a = e.target.closest('a.term');
    if (!a || !plainClick(e)) return;
    e.preventDefault();
    useTerm(a.dataset.qid, a);
  });
  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('.nc-chip');
    if (!b) return;
    if (b.getAttribute('aria-pressed') === 'true') clearTerm(); else useTerm(b.dataset.term);
    // A term chosen here opens its entry on the Master Index tab and hides this one: focus goes to that tab, not to a
    // chip in the hidden panel (Tab, Enter on a chip left no focus to be seen).
    if (S.pane && S.pane !== 'terms') $(`#tab-${S.pane}`).focus({ preventScroll: true });
  });

  // Contents: a list hanging from the head; a click outside it, Escape or a choice closes it.
  const toc = open => { $('#toc').hidden = !open; $('#toc-toggle').setAttribute('aria-expanded', String(open)); if (open) $('#toc-list a[aria-current]')?.focus({ preventScroll: true }); };
  $('#toc-toggle').addEventListener('click', () => toc($('#toc').hidden));
  $('#toc-list').addEventListener('click', e => {
    const a = e.target.closest('a[data-ci]');
    if (!a || !plainClick(e)) return;
    e.preventDefault(); toc(false); goChapter(+a.dataset.ci); $('#toc-toggle').focus({ preventScroll: true });
  });
  document.addEventListener('click', e => { if (!$('#toc').hidden && !e.target.closest('#toc, #toc-toggle')) toc(false); });
  for (const [id, d] of [['#prev', -1], ['#next', 1], ['#prev2', -1], ['#next2', 1]]) $(id).addEventListener('click', e => {
    if (!plainClick(e)) return;
    e.preventDefault(); goChapter(S.ci + d);
  });

  // Another book: its first chapter, with the page at the book's own front matter.
  $('#shelf').addEventListener('change', async () => {
    history.replaceState(history.state, '', writeHash({ book: $('#shelf').value, ch: null }));
    await applyHash({ first: true });
    window.scrollTo({ top: Math.max(0, $('#layout').getBoundingClientRect().top + window.scrollY - 8), behavior: 'auto' });
  });

  // The pane.
  $('#pane-toggle').addEventListener('click', toggleArMode);
  $('#pane-close').addEventListener('click', () => { closePane(); $('#pane-toggle').focus({ preventScroll: true }); });
  const setTall = tall => {
    $('#pane').classList.toggle('tall', tall); $('#pane-tall').setAttribute('aria-pressed', String(tall));
    observe();
  };
  $('#pane-tall').addEventListener('click', () => setTall(!$('#pane').classList.contains('tall')));
  const tabs = TABS;
  for (const t of tabs) $(`#tab-${t}`).addEventListener('click', () => openPane(t));
  $('[role="tablist"]').addEventListener('keydown', e => {
    const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!k) return;
    e.preventDefault(); e.stopPropagation();
    const next = tabs[(tabs.indexOf(S.pane) + k + tabs.length) % tabs.length];
    openPane(next); $(`#tab-${next}`).focus();
  });
  $('#era-pick').addEventListener('change', e => { S.eraOf = e.target.value === 'term' ? 'term' : 'book'; renderVm(); writeState(); });
  // The Map tab: an offer's view ("Its whole life", "This passage") in the frame; a click on a term redraws it.
  $('#map-card').addEventListener('click', e => {
    const b = e.target.closest('button[data-recipe]');
    if (b && readRecipe(b.dataset.recipe)) showMapRecipe(writeRecipe(readRecipe(b.dataset.recipe)));
  });
  window.addEventListener('vm:click', e => { if (S.pane === 'map' && e.detail?.subject?.qid === S.term) renderMap(); });
  // "Show here": the screen in the pane; on a phone the sheet opens taller for it (Taller again gives the text back).
  $('#vm-list').addEventListener('click', e => {
    const b = e.target.closest('[data-show]');
    if (!b) return;
    showVm(b.dataset.show);
    if (!SPLIT.matches && !$('#pane').classList.contains('tall')) setTall(true);
  });
  makeFrames();

  // Links into the shell: inside it, move it without reloading it; on its own, the link opens the shell in a new tab.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-shell-hash]');
    if (!a || !embedded || !plainClick(e) || !SHELL_ROUTE.test(a.dataset.shellHash || '')) return;
    e.preventDefault(); shellGo(a.dataset.shellHash);
  });
  $('#notice-close').addEventListener('click', () => notice(''));

  // The divider between the text and the pane (beside each other from 1,000 px): dragged, or moved with the keys. A
  // drag reflows the text, so the reader's paragraph is pinned where it is while it lasts (the reflow watcher below
  // holds it there), and the reading region is measured again after.
  splitter($('#layout'), $('#pane'), { share: 44, min: 30, max: 60, minMain: 420, minSide: 380, rowFrom: 1000, storeKey: 'prp.split.bibliotheca', label: 'Resize the text and the pane',
    onStart: () => { const el = S.current && document.getElementById(S.current); if (el) pinAt(S.current, el.getBoundingClientRect().top); },
    onEnd: () => { holdPin(); if (chapter()) observe(); } });
  // Full screen: the whole page, so it scrolls and reads as it always does.
  fs = fullScreen(document.documentElement, { onChange: fullChanged });
  $('#nar-full').hidden = !fs.supported;
  $('#nar-full').addEventListener('click', toggleFull);

  // Augmented Reading.
  if (inSide) $('#ar-toggle').hidden = true; // a page shown in another page's pane offers no pane, and no narrator, of its own
  $('#ar-toggle').addEventListener('click', () => setAr(!S.ar, { byHand: true }));
  $('#nar-play').addEventListener('click', toggleRead);
  $('#nar-speed').innerHTML = SPEEDS.map(v => `<option value="${v}">${v}×</option>`).join('');
  $('#nar-speed').addEventListener('change', e => { narr && (narr.speed = +e.target.value); });
  $('#nar-voice').addEventListener('change', e => {
    const v = e.target.value;
    if (!narr || !v) return;
    if (/^device:/.test(v)) { closeOffer(); if (narr.permit) { narr.endPermit(null); } narr.deviceVoice = v.slice(7); return; }
    openOffer(v); // an online voice: an offer first, nothing read
  });
  $('#nar-accept').addEventListener('click', () => S.offer && acceptOnline(S.offer.voice));
  $('#nar-decline').addEventListener('click', () => { closeOffer(); $('#nar-voice').focus({ preventScroll: true }); });
  $('#nar-again').addEventListener('click', e => acceptOnline(e.currentTarget.dataset.voice));
  $('#nar-hold').addEventListener('click', () => setHold(!held()));
  $('#pane-fill').addEventListener('click', () => setFill(!S.fill));
  $('#nar-subs').addEventListener('click', () => setSubs(!S.subs));
  document.addEventListener('click', e => { if (S.offer && !e.target.closest('#nar-offer, #nar-voice, #nar-again')) closeOffer(); });
  // The narrator pauses when the page is left inside the shell (its text has no box any more); the screen stays awake
  // while it reads.
  new IntersectionObserver(() => { if (narr?.playing && textHidden()) narr.pause(); }).observe($('#reader'));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && narr?.playing) keepAwake(true); });
  window.addEventListener('pagehide', () => narr?.pause());

  // Reading: the observer and the scroll keep the current paragraph, the bar and the progress; a hand scroll unpins.
  window.addEventListener('scroll', schedule, { passive: true });
  // Anything that reflows the page (the web fonts arriving, the pane narrowing the column) holds a pinned paragraph.
  const reflow = new ResizeObserver(() => { holdPin(); schedule(); });
  reflow.observe($('#text')); reflow.observe($('.nc-page'));
  // The head's height follows the chapter's title, which takes a second line where it is long (at every width since
  // 13 November 2026), and can change after the chapter is drawn (the web fonts arriving): measure it again then, so a
  // jump still lands below the head.
  new ResizeObserver(() => { if (chapter() && $('#head').offsetHeight !== S.headH) observe(); }).observe($('#head'));
  document.fonts?.ready.then(() => { holdPin(); schedule(); });
  for (const ev of ['wheel', 'touchstart', 'pointerdown']) window.addEventListener(ev, e => { if (!e.target.closest?.('.nc-pane, .nc-toc')) S.pin = null; }, { passive: true });
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (chapter()) observe(); fitScreens(); }, 150); });
  // Crossing a breakpoint reflows the text and may turn the margin list into a strip (or collapse it, by default).
  SPLIT.addEventListener?.('change', () => { if (chapter()) keepPlace(() => {}); });
  window.addEventListener('hashchange', () => applyHash());

  // Keys: ← → chapters, J K paragraphs, P AR Mode (the pane), T its terms on screen, Escape closes the innermost open thing.
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const typing = /^(input|select|textarea)$/i.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === 'Escape') {
      if (!$('#toc').hidden) { toc(false); $('#toc-toggle').focus({ preventScroll: true }); }
      else if (S.offer) { closeOffer(); $('#nar-voice').focus({ preventScroll: true }); }
      else if (!$('#notice').hidden) notice('');
      else if (S.fill) setFill(false); // Screens only gives the text back before the pane closes
      else if (S.pane) { closePane(); $('#pane-toggle').focus({ preventScroll: true }); }
      return;
    }
    if (typing || !chapter()) return;
    if (['PageUp', 'PageDown', ' ', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(e.key)) { S.pin = null; return; }
    const paras = chapter().paragraphs, i = paras.findIndex(p => p.id === S.current);
    const act = {
      ArrowLeft: () => goChapter(S.ci - 1), ArrowRight: () => goChapter(S.ci + 1),
      j: () => paras[i + 1] && jumpTo(paras[i + 1].id, { smooth: true }), k: () => i > 0 && jumpTo(paras[i - 1].id, { smooth: true }),
      t: () => (S.pane === 'terms' ? closePane() : openPane('terms')), p: toggleArMode,
      f: toggleFull,
      ...(inSide ? {} : { a: () => setAr(!S.ar, { byHand: true }) }),
      // The narrator's keys, while the mode is on.
      ...(S.ar ? {
        r: toggleRead, h: () => setHold(!held()), d: () => setFill(!S.fill), s: () => S.fill && setSubs(!S.subs),
        '<': () => stepSpeed(-1), ',': () => stepSpeed(-1), '>': () => stepSpeed(1), '.': () => stepSpeed(1),
      } : {}),
    }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!act) return;
    e.preventDefault(); act();
  });
}

function stepSpeed(d) {
  if (!narr) return;
  const i = SPEEDS.indexOf(narr.speed), j = Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 1 : i) + d));
  narr.speed = SPEEDS[j];
}

async function init() {
  EMPTY_ENCY = $('#ency-empty').innerHTML;
  wire();
  try {
    const idx = await getJson(`${DATA}index.json`);
    S.shelf = (idx.books || []).filter(b => b && /^[a-z0-9][a-z0-9-]*$/.test(b.slug || ''));
    S.generated = idx.generated || null;
  } catch (e) {
    $('#meta').innerHTML = `<span>The shelf could not load: ${esc(e.message)}</span>`;
    $('#text').innerHTML = '<p class="prp-empty">No book to show.</p>';
    return;
  }
  if (!S.shelf.length) { $('#meta').innerHTML = '<span>The shelf is empty.</span>'; $('#text').innerHTML = '<p class="prp-empty">No book to show.</p>'; return; }
  renderShelf(); renderMeta();
  await applyHash({ first: true });
}
init();
