/* What the narrator says, and what it costs. Pure (no DOM): the page reads with it and the tests run it in Node over
   every book (tests/bibliotheca-narrator.test.mjs).

   A paragraph is one passage of the voice layer (design/prp-voice.js), and its units are made here, not by
   PRPVoice.utterances (which cuts a long sentence at every comma: 12.5 requests a minute to the online voice over the
   shelf, and up to 42 in one minute, against the 20 a minute Azure's free tier allows the whole site):
     - the spoken text is the paragraph's text without its footnote marks ("[12]"), white space collapsed (a verse's
       line breaks too); every character of it knows its place in the paragraph's own text (map), so a unit and a term
       can be compared directly;
     - a sentence, as PRPVoice.sentences finds it, is one unit;
     - short sentences that follow one another are one unit, as long as together they are at most 200 characters;
     - a sentence over 200 characters is cut at commas, semicolons and colons into the fewest pieces of at most 200
       characters, each piece filled as far as it goes; a piece with no such mark is cut at a space.
   That gives units of about 136 characters, and about 6 requests a minute at normal speed. Units stop at 200
   characters also because some browsers cut a network voice off after about 15 seconds.

   Notes, tables and chapter headings are not read. A unit is what the proxy counts: PRPVoice.canon of its text, which
   it already is, so the cost of a chapter from a point is the sum of its units' lengths, and exact. */
import '../../../design/prp-voice.js';
import { isTable } from './text.js';

const V = globalThis.PRPVoice;
export const MAX_UNIT = 200;
/** The lecture pace (Kino's) and the narrator's five speeds, as multiples of it. */
export const LECTURE = 0.92;
export const SPEEDS = [0.8, 1, 1.15, 1.3, 1.5];
const MARK = /\[\d{1,4}\]/g; // a footnote mark, as lib/text.js sets them small

/** Whether the narrator reads a paragraph: running text and verse, not a note or a table of figures. */
export const readable = p => !!p && (p.kind === 'para' || p.kind === 'verse' || !p.kind) && !isTable(p) && /\S/.test(p.text || '');

/** The paragraph's text as it is spoken: { text, map }, map[i] the offset in p.text of spoken character i. */
export function spoken(p) {
  const src = String(p?.text ?? ''), drop = new Uint8Array(src.length);
  for (const m of src.matchAll(MARK)) drop.fill(1, m.index, m.index + m[0].length);
  let text = '';
  const map = [];
  let space = false;
  for (let i = 0; i < src.length; i++) {
    if (drop[i]) continue;
    if (/\s/.test(src[i])) { space = text.length > 0; continue; }
    if (space) { text += ' '; map.push(i - 1); space = false; }
    text += src[i]; map.push(i);
  }
  return { text, map };
}

// Where the piece of a long sentence starting at `pos` ends: the farthest break after , ; or : (the mark kept, the
// space after it dropped) at most MAX_UNIT on; failing that, the farthest space; failing that, MAX_UNIT on.
function cutAt(t, pos, end) {
  const limit = Math.min(end, pos + MAX_UNIT);
  let space = -1;
  for (let j = limit; j > pos; j--) {
    if (t[j] !== ' ') continue;
    if (/[,;:]/.test(t[j - 1])) return j;
    if (space < 0) space = j;
  }
  return space > 0 ? space : limit;
}

/** A paragraph as the narrator reads it: { id, text, map, units }, each unit
      { text, words: [{ i, from, to }],   what the voice layer is given (words numbered through the paragraph)
        s, e,                             its place in the spoken text
        from, to,                         its place in the paragraph's own text
        say: [from, to],                  the sentence, or the short sentences read together, it belongs to
        part,                             true when it is one piece of a sentence that was cut
        asks }                            false for the later pieces of a cut sentence (the pane's rule asks once)
    A paragraph the narrator does not read has no units. */
export function speakable(p) {
  const { text, map } = spoken(p);
  const out = { id: p?.id, text, map, units: [] };
  if (!readable(p) || !text) return out;
  const at = (s, e) => [map[s], map[e - 1] + 1];
  const sents = [];
  let cursor = 0;
  for (const s of V.sentences(text)) {
    const i = text.indexOf(s, cursor);
    if (i < 0) continue; // cannot happen: sentences() returns slices of this very text
    sents.push([i, i + s.length]); cursor = i + s.length;
  }
  let words = 0;
  const push = (s, e, say, part, asks) => {
    const u = V.unit(text.slice(s, e), words);
    words += u.words.length;
    const [from, to] = at(s, e);
    out.units.push({ text: u.text, words: u.words, s, e, from, to, say, part, asks });
  };
  let group = null;
  const flush = () => { if (group) push(group[0], group[1], at(group[0], group[1]), false, true); group = null; };
  for (const [s, e] of sents) {
    if (e - s > MAX_UNIT) {
      flush();
      const say = at(s, e);
      let pos = s, first = true;
      while (e - pos > MAX_UNIT) {
        const j = cutAt(text, pos, e);
        push(pos, j, say, true, first); first = false;
        pos = text[j] === ' ' ? j + 1 : j;
      }
      push(pos, e, say, true, first);
      continue;
    }
    if (group && e - group[0] <= MAX_UNIT) group[1] = e;
    else { flush(); group = [s, e]; }
  }
  flush();
  return out;
}

/** A chapter's readable paragraphs, in order, each as speakable gives it, with its index in chapter.paragraphs. */
export function chapterPassages(chapter) {
  const out = [];
  (chapter?.paragraphs || []).forEach((p, pi) => { const sp = speakable(p); if (sp.units.length) out.push({ ...sp, pi }); });
  return out;
}

/** What the units of a chapter cost from a point (a paragraph id and a unit in it), in characters: what the proxy
    counts. With no point, the whole chapter. */
export function costFrom(passages, pid = null, k = 0) {
  let start = pid == null ? 0 : passages.findIndex(x => x.id === pid);
  if (start < 0) return 0;
  let n = 0;
  for (let i = start; i < passages.length; i++) for (let j = i === start ? Math.max(0, k) : 0; j < passages[i].units.length; j++) n += passages[i].units[j].text.length;
  return n;
}

/** The permission an allowance of `left` characters buys from a point: the units to the end of the last paragraph
    that fits whole. { chars, through (the last paragraph's id, or null when not even the first fits), all (true when
    it reaches the chapter's end), total (the cost to the end) } */
export function permitFrom(passages, pid, k, left) {
  const total = costFrom(passages, pid, k);
  let start = passages.findIndex(x => x.id === pid);
  if (start < 0) return { chars: 0, through: null, all: false, total };
  let chars = 0, through = null;
  for (let i = start; i < passages.length; i++) {
    let c = 0;
    for (let j = i === start ? Math.max(0, k) : 0; j < passages[i].units.length; j++) c += passages[i].units[j].text.length;
    if (chars + c > left) break;
    chars += c; through = passages[i].id;
  }
  return { chars, through, all: chars === total, total };
}

/** About how long some characters take to say at a speed: the voice layer's pace (14.2 characters a second at rate 1)
    at the lecture pace times the speed. In seconds. */
export const secondsFor = (chars, speed = 1) => chars / (V.CHARS_PER_SEC * LECTURE * speed);
