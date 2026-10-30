/* The Neo Classic reader's address:
     #book=<slug>&ch=<chapter number>&p=<paragraph id>&t=<QID of the term in use>&pane=<ency|vm>&show=<screen>&era=term
   Pure (no DOM), so the tests read and write it in Node. Every key is optional:
     book  the shelf's slug (bibliotheca/data/books/<slug>.json); none means the first book on the shelf;
     ch    the book's own chapter number `n` (0 for a dedication or preface, as the-prince.json numbers them), not a
           position in the list; none means the book's first chapter;
     p     the paragraph being read (c12-p03, c03-n04, c26-v13); none means the top of the chapter;
     t     the term in use: its occurrences are highlighted and the pane's Encyclopaedia tab shows its entry;
     pane  which tab of the companion pane is open (ency: the Encyclopaedia, vm: the other screens of Vitruvian
           Manager); none means the pane is closed, so a term can stay highlighted with the pane shut;
     show  the screen shown in the pane's "In Vitruvian Manager" tab, by its row's key there: a screen for the era
           (progress, kardashev, retrospective, battlefield-history, historical-calendar, pestle, or one War Focus war,
           war-focus:<war id>) or one of the places the term appears (m0 to m9, in the Encyclopaedia's order); kept
           only with pane=vm, since it means nothing on the other tab or with the pane shut;
     era   'term' when that tab shows the screens for the term's own dates rather than the book's; none means the
           book's (or the chapter's) period.
   Anything malformed (a chapter that is not a whole number, a term that is not a Wikidata ID, a slug or paragraph id
   with characters a file name or an element id would not have, a screen that is not one of the keys above) reads as
   absent rather than throwing, because the hash is typed by people, edited in links and moved by the shell (shell.js
   moves a frame by changing only its hash). */

const QID = /^Q[1-9]\d*$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;   // a book file is ../data/books/<slug>.json, so the slug must be a plain name
const PID = /^[A-Za-z0-9][\w-]{0,40}$/;      // the corpus writes c12-p03; anything an element id can safely be
// The pane's row keys (lib/era.js's row ids, and app.js's m<i> for the places the term appears).
const SHOW = /^(progress|kardashev|retrospective|battlefield-history|historical-calendar|pestle|war-focus:[a-z0-9-]{1,60}|m\d)$/;
export const PANES = ['ency', 'vm'];

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
    then shows the shelf's first book). Parts that would not read back (a malformed id, a screen without pane=vm) are
    left out. */
export function writeHash({ book, ch, p, t, pane, show, era } = {}) {
  if (!book || !SLUG.test(book)) return '';
  const parts = [`book=${book}`];
  if (Number.isInteger(ch) && ch >= 0) parts.push(`ch=${ch}`);
  if (p && PID.test(p)) parts.push(`p=${p}`);
  if (t && QID.test(t)) parts.push(`t=${t}`);
  if (PANES.includes(pane)) parts.push(`pane=${pane}`);
  if (pane === 'vm' && show && SHOW.test(show)) parts.push(`show=${show}`);
  if (era === 'term') parts.push('era=term');
  return `#${parts.join('&')}`;
}
