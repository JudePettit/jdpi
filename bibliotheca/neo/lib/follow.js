/* Which Master Index entry the pane shows while the narrator reads: the tagged term nearest the sentence being read,
   under a rule that stops the pane flickering. Pure (no DOM, no clock): the page asks it at the start of each unit and
   the tests run it over every book (tests/bibliotheca-narrator.test.mjs).

   Places are counted in a chapter's running text: its readable paragraphs (lib/narrate.js, readable: not notes, not
   tables, so their terms do not count) one after another, each paragraph's own text offsets plus where it starts.

   The rule (follow). The pane can change only at the moment a new sentence begins, never during one; short sentences
   read as one unit count as one sentence, and the later pieces of a long sentence do not ask again.
     1. The sentence names terms: if one of them is the term already showing, nothing changes; otherwise the first.
     2. It names none: the nearest term in the chapter's running text, backwards or forwards, counted in characters
        from the sentence to the term; of two equally near, the one already read.
     3. The candidate is shown only once at least WAIT (300) characters have been read since the pane last changed:
        about 23 seconds at normal speed, 15 at the fastest. Otherwise the pane stays, and the question is asked afresh
        at the next sentence. The first sentence after Play, a jump or letting go of Hold (state.fresh) is shown at once.
     4. A chapter that names no term changes nothing.
   The count is of characters read, not of seconds, so the rule gives the same result at every speed. */
import { validTerms } from './text.js';
import { readable } from './narrate.js';

export const WAIT = 300;

/** A chapter's terms in reading order, in its running text: { terms: [{ qid, at, end, pid }], base: Map(pid → where
    the paragraph starts) }. */
export function chapterTerms(chapter) {
  const terms = [], base = new Map();
  let at = 0;
  for (const p of chapter?.paragraphs || []) {
    if (!readable(p)) continue;
    base.set(p.id, at);
    for (const t of validTerms(p)) terms.push({ qid: t.qid, at: at + t.s, end: at + t.e, pid: p.id });
    at += p.text.length + 1;
  }
  return { terms, base };
}

/** A unit of lib/narrate.js as the rule sees it: { from, to, chars, asks }, in the chapter's running text. */
export function span(base, pid, unit) {
  const b = base.get(pid) ?? 0;
  return { from: b + unit.from, to: b + unit.to, chars: unit.text.length, asks: unit.asks !== false };
}

/** The term nearest a stretch of the running text: the first inside it, or else the nearest outside, the one already
    read on a tie; null in a chapter with none. */
export function nearestTerm(terms, from, to = from) {
  let best = null, dist = Infinity;
  for (const t of terms) {
    if (t.at < Math.max(to, from + 1) && t.end > from) return t.qid; // inside (terms are in reading order)
    const d = t.end <= from ? from - t.end : t.at - to;
    if (d < dist) { best = t.qid; dist = d; } // strictly nearer: a tie keeps the earlier, already read
  }
  return best;
}

/** The starting state: nothing showing, and the first sentence shown at once. */
export const fresh = (showing = null) => ({ showing, read: 0, fresh: true });

/** One unit begins: { state, show }, show the entry to move the pane to, or null to leave it. While an era screen has
    the pane (tour, below: state.showing is SCREEN) a term takes it back only once TOUR_STAY characters have been read. */
export function follow(state, unit, terms) {
  const s = { showing: state?.showing ?? null, read: state?.read ?? 0, fresh: !!state?.fresh };
  let show = null;
  if (unit.asks !== false && terms.length) {
    const inside = terms.filter(t => t.at < unit.to && t.end > unit.from);
    const cand = inside.length ? (inside.some(t => t.qid === s.showing) ? s.showing : inside[0].qid) : nearestTerm(terms, unit.from, unit.to);
    if (cand && cand !== s.showing && (s.fresh || s.read >= (s.showing === SCREEN ? TOUR_STAY : WAIT))) { show = cand; s.showing = cand; s.read = 0; }
    s.fresh = false;
  }
  s.read += unit.chars || 0;
  return { state: s, show };
}

/* Screens only (B2: the documentary shows "data and screens" of Vitruvian Manager "along with GIFs used especially for
   the books", not only Master Index entries). While the pane fills the page and is not held, the book's pictures
   (lib/pictures.js) and the screens for its era (the Invention Timeline, the Kardashev Tracker, and from 1926 the
   screens of those years) take their turn with the entries, at a sentence that moves the pane to no new term:
     - when TOUR_AFTER characters (about 45 seconds at normal speed) have been read since the pane last changed; so in
       a chapter that names no term the pictures and screens take turns at that pace;
     - or when TOUR_EVERY characters (about two minutes) have been read since the last turn and the entry showing has
       had its WAIT, so a chapter thick with terms still has its turns; the count starts at TOUR_EVERY with each
       chapter, so the chapter's picture comes early;
     - a term takes the pane back by the rule of follow, once TOUR_STAY characters have been read on the turn.
   Asked after follow, at the start of each unit, with follow's answer; `since` is what has been read since the last
   turn, kept by the page. Pure, and counted in characters, as follow is. */
export const SCREEN = '#screen';
export const TOUR_AFTER = 600;
export const TOUR_EVERY = 1500;
export const TOUR_STAY = 450;
/** { state, screen }: screen is true when a picture or a screen is to take the pane now. */
export function tour(state, show, { screens = 0, since = 0 } = {}) {
  if (show || screens < 1 || !state) return { state, screen: false };
  const due = state.read >= TOUR_AFTER || (since >= TOUR_EVERY && state.read >= WAIT);
  if (!due) return { state, screen: false };
  return { state: { ...state, showing: SCREEN, read: 0, fresh: false }, screen: true };
}
