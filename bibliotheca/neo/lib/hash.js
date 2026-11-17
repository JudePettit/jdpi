/* The Neo Book reader's address:
     #book=<slug>&ch=<chapter number>&p=<paragraph id>&t=<QID of the term in use>&pane=<terms|ency|vm|map>&show=<screen>&era=term
       &map=<the Omni-Map's VR/1 recipe, percent-encoded once>&sel=<pid>:<s>-<e>[,…]
   Pure (no DOM), so the tests read and write it in Node. Every key is optional:
     book  the shelf's slug (bibliotheca/data/books/<slug>.json); none means the first book on the shelf;
     ch    the book's own chapter number `n` (0 for a dedication or preface, as the-prince.json numbers them), not a
           position in the list; none means the book's first chapter;
     p     the paragraph being read (c12-p03, c03-n04, c26-v13); none means the top of the chapter;
     t     the term in use: its occurrences are highlighted and the pane's Master Index tab shows its entry;
     pane  which tab of the companion pane is open (terms: the terms on screen, ency: the Master Index, vm: the screens of Vitruvian
           Manager, map: the Omni-Map for the term in use, PRP-SCHOLAR-USP-DESIGN.md S1 and its contract 4); none means
           the pane is closed, so a term can stay highlighted with the pane shut;
     show  the screen shown in the pane's "In Vitruvian Manager" tab, by its row's key there: a screen for the era
           (progress, kardashev, retrospective, battlefield-history, historical-calendar, one country of National
           Analysis, pestle:<iso3>, the old pestle meaning its first, or one War Focus war,
           war-focus:<war id>) or one of the places the term appears (m0 to m9, in the Master Index's order); kept
           only with pane=vm, since it means nothing on the other tab or with the pane shut;
     era   'term' when that tab shows the screens for the term's own dates rather than the book's; none means the
           book's (or the chapter's) period;
     map   the view the Map tab shows: a VR/1 recipe (design/vm-recipe.js), percent-encoded once so its own & and = stay
           inside it; kept only with pane=map. The reader's hash is the single source of truth: the frame
           (omni/index.html#<recipe>&host=neo) posts each change and the page writes it here (contract 4);
     sel   a selection in the text, <paragraph id>:<s>-<e> (the book file's character offsets into the paragraph's text),
           several joined by commas (S4 draws them; S1 keeps them in the address).
   readHash gives the first seven keys (book to era), as it always has; readMap gives map and sel.
   Anything malformed (a chapter that is not a whole number, a term that is not a Wikidata ID, a slug or paragraph id
   with characters a file name or an element id would not have, a screen that is not one of the keys above, a recipe
   that is not VR/1) reads as absent rather than throwing, because the hash is typed by people, edited in links and
   moved by the shell (shell.js moves a frame by changing only its hash). */
import { readRecipe, writeRecipe } from '../../../design/vm-recipe.js';

const QID = /^Q[1-9]\d*$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;   // a book file is ../data/books/<slug>.json, so the slug must be a plain name
const PID = /^[A-Za-z0-9][\w-]{0,40}$/;      // the corpus writes c12-p03; anything an element id can safely be
const SEL = /^([A-Za-z0-9][\w-]{0,40}):(\d{1,6})-(\d{1,6})$/;
// The pane's row keys (lib/era.js's row ids, and app.js's m<i> for the places the term appears, i being the place's
// index in the Master Index entry, 0 to 99).
const SHOW = /^(progress|kardashev|retrospective|battlefield-history|historical-calendar|pestle(?::[a-z]{3})?|war-focus:[a-z0-9-]{1,60}|m\d{1,2})$/;
export const PANES = ['terms', 'ency', 'vm', 'map']; // terms: AR Mode's "On screen" tab (BI-23); map: the Omni-Map (S1)

/** { book, ch, p, t, pane, show, era } from a hash (with or without its #); absent or malformed parts are null. */
export function readHash(hash) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const get = k => (q.get(k) || '').trim();
  const book = get('book'), ch = get('ch'), p = get('p'), t = get('t').toUpperCase(), pane = get('pane').toLowerCase();
  const show = get('show').toLowerCase(), era = get('era').toLowerCase();
  const tab = PANES.includes(pane) ? pane : null;
  return {
    book: SLUG.test(book) ? book : null,
    ch: /^\d{1,4}$/.test(ch) ? +ch : null,
    p: PID.test(p) ? p : null,
    t: QID.test(t) ? t : null,
    pane: tab,
    show: tab === 'vm' && SHOW.test(show) ? show : null,
    era: era === 'term' ? 'term' : null,
  };
}

/** The hash for a state, keys in a fixed order so equal states give equal strings; '' when there is no book (the page
    then shows the shelf's first book). Parts that would not read back (a malformed id, a screen without pane=vm, a
    recipe without pane=map) are left out. */
export function writeHash({ book, ch, p, t, pane, show, era, map, sel } = {}) {
  if (!book || !SLUG.test(book)) return '';
  const parts = [`book=${book}`];
  if (Number.isInteger(ch) && ch >= 0) parts.push(`ch=${ch}`);
  if (p && PID.test(p)) parts.push(`p=${p}`);
  if (t && QID.test(t)) parts.push(`t=${t}`);
  if (PANES.includes(pane)) parts.push(`pane=${pane}`);
  if (pane === 'vm' && show && SHOW.test(show)) parts.push(`show=${show}`);
  if (era === 'term') parts.push('era=term');
  const recipe = pane === 'map' ? canonRecipe(map) : null;
  if (recipe) parts.push(`map=${encodeURIComponent(recipe)}`);
  const s = selText(sel);
  if (s) parts.push(`sel=${s}`);
  return `#${parts.join('&')}`;
}

// A recipe as VR/1 writes it (host=, the frame's own key, left out), or null when it is not VR/1.
function canonRecipe(v) {
  if (typeof v !== 'string' || !v) return null;
  const r = readRecipe(v);
  return r ? writeRecipe(r) : null;
}
const selPart = x => !!x && PID.test(String(x.p ?? '')) && Number.isInteger(x.s) && Number.isInteger(x.e) && x.s >= 0 && x.s <= x.e && x.e < 1e6;
function selText(sel) {
  if (!Array.isArray(sel) || !sel.length || sel.length > 20 || !sel.every(selPart)) return '';
  return sel.map(x => `${x.p}:${x.s}-${x.e}`).join(',');
}

/** { map, sel } from a hash: map, the Map tab's recipe (written canonically; only with pane=map), and sel, the
    selection as [{ p, s, e }]; either null when absent or malformed (a selection with one bad part reads as none). */
export function readMap(hash) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const pane = (q.get('pane') || '').trim().toLowerCase();
  const map = pane === 'map' ? canonRecipe((q.get('map') || '').trim()) : null;
  const raw = (q.get('sel') || '').trim();
  let sel = null;
  if (raw) {
    const parts = raw.split(',').map(x => SEL.exec(x));
    if (parts.length <= 20 && parts.every(m => m && +m[2] <= +m[3])) sel = parts.map(m => ({ p: m[1], s: +m[2], e: +m[3] }));
  }
  return { map, sel };
}
