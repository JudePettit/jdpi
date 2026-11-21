// Daily Synopsis: the check. A scheduled Claude run writes a draft (a short lead, two to four sentences a story, and each
// story's written 5 Sided Analysis) from the day's input file alone; this check decides whether any of it is published.
// The draft is untrusted text: headlines can carry text meant to steer a model, so nothing in it is believed, and the page
// renders whatever passes as text only, never as markup. Pure functions, no network, no model, no clock:
//   checkDraft(input, draftText) → { ok, reasons, five: { <story id>: { ok, reasons } } }
// Part 4 (the digest): the draft is REFUSED WHOLE, the lead, every story's sentences and every written analysis with it,
// when its shape is wrong; a sentence cites an item that is not in the day's input (or, for a story, not that story's),
// or cites none; a sentence holds a quotation mark or reported speech; a number, a date or a capitalised name in a
// sentence is not in the text (headline and feed summary) of the items it cites; a name is in only one outlet's items
// (a private person is not carried); it names an outlet; it is longer than the limits; it holds a link, markup or an
// instruction-like line.
// Part 8 (the written 5 Sided Analysis): ONE STORY'S written analysis is refused, and that story alone keeps only its
// rules layer, when a side's sentence cites another side's item or none; a side with no items has a sentence, or a side
// with items has none; a sentence names an outlet, a publisher or a journalist; holds a quotation mark or reported speech;
// holds a number, a date or a name not in the items it cites; states a motive, an intent or a judgement (the fixed list
// in check-words.json); the closing sentence compares left and right when only one of the two halves carried the story,
// or cites anything but those halves' items; it is longer than its limit; or the story was not one to analyse.
// A reason is a code and a place ("stories[2].sentences[1]"), never the draft's own words, so a refused draft's text is
// published nowhere.
//
// How a name is matched (names): the sentence is split into words (letters and digits, with ' ’ . & - inside a word, so
// U.S., AT&T and far-right are one word each). A word with a capital letter in it is a name word; the sentence's first
// word is not, when it is one of the fixed openers (check-words.json: The, In, Both, Left, …). Name words next to each
// other, with nothing but spaces between them, are one name ("Van Hollen", "New York City"). A name is folded (accents
// off, lower case), its possessive ’s dropped and its full stops taken out (U.S. → us), and it must then appear as whole
// words, in the same order, in the folded text of a cited item treated the same way: "President Trump" needs
// "president trump" in one cited headline or summary, "Trump" alone is not enough. And it must be in the items of at
// least two different outlets of the story (of the stories cited, for the lead), so a name only one outlet printed, as
// a private person's would be, is never carried.
import { readFileSync } from 'node:fs';
import { SOURCES } from '../../briefing/scripts/sources.mjs';

export const WORDS = JSON.parse(readFileSync(new URL('./check-words.json', import.meta.url), 'utf8'));
export const SIDE_KEYS = ['far_left', 'left', 'centre', 'right', 'far_right'];
export const LEFT_HALF = ['far_left', 'left'];
export const RIGHT_HALF = ['right', 'far_right'];
export const DRAFT_FORMAT = 'vm-daily-synopsis-draft/1';
export const LIMITS = Object.freeze({
  draftBytes: 100_000, sentenceChars: 280, leadSentences: [1, 3], leadChars: 600, storySentences: [2, 4], storyChars: 900,
  sideSentences: [1, 2], closingChars: 300,
});

// What each reason says on a workflow run and in the day's file: fixed words, never the draft's.
export const MESSAGES = {
  'not-json': 'The draft is not a JSON file.',
  'too-large': `The draft is larger than ${LIMITS.draftBytes / 1000} KB.`,
  shape: 'The draft is not in the shape the prompt asks for.',
  day: 'The draft is for another day.',
  input: 'The draft names another input file than the day’s.',
  'cites-none': 'A sentence cites no item.',
  'cites-unknown': 'A sentence cites an item that is not in the day’s input.',
  'cites-other-story': 'A story’s sentence cites an item of another story.',
  quote: 'A sentence holds a quotation mark.',
  'reported-speech': 'A sentence holds reported speech.',
  instruction: 'A sentence reads as an instruction.',
  link: 'A sentence holds a link or an address.',
  markup: 'A sentence holds markup or a character the page does not show.',
  outlet: 'A sentence names an outlet.',
  number: 'A sentence holds a number that is not in the items it cites.',
  date: 'A sentence holds a date that is not in the items it cites.',
  name: 'A sentence holds a name that is not in the items it cites.',
  'private-name': 'A sentence holds a name that only one outlet’s items carry.',
  length: 'A sentence, a story or the lead is longer than its limit, or has too many or too few sentences.',
  'not-a-sentence': 'A sentence does not end with a full stop, or asks or exclaims.',
  'five-shape': 'The story’s written analysis is not in the shape the prompt asks for.',
  'not-eligible': 'The story is not one the written analysis is made for.',
  'side-cites-other-side': 'A side’s sentence cites an item that is not that side’s.',
  'side-without-items': 'A side that carried none of the story has a sentence.',
  'side-missing': 'A side that carried the story has no sentence.',
  journalist: 'A sentence names a journalist or a publisher.',
  judgement: 'A sentence states a motive, an intent or a judgement.',
  'closing-one-half': 'The closing sentence compares left and right, but only one of the two carried the story.',
  'closing-cites': 'The closing sentence cites an item that is not left or right of centre, or not one from each.',
  'closing-kind': 'The closing sentence says the opposite of its kind: that the two halves differ when it is of kind same, or are alike when it is of kind differ.',
};

/* ------------------------------------------------------------------------------------------------ text */
export const fold = s => String(s ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').replace(/[‘’ʼ′`´]/g, "'").toLowerCase();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const B = '(?<![\\p{L}\\p{N}])', E = '(?![\\p{L}\\p{N}])';
const phraseRe = (p, flags = 'iu') => new RegExp(B + esc(p).replace(/\s+/g, '\\s+') + E, flags);
// A list entry as a pattern, on folded text: words in order with any spaces between; a word ending in * is that word
// and every longer one (ignor* is ignore, ignored, ignoring); … is a gap of one to six words, the first of them not
// for, on, off, up, in, out or back (called … a is called the summit a, never called for a ceasefire). NFKD makes …
// three full stops, so both are read as the gap.
const GAP = "\\s+(?!(?:for|on|off|up|in|out|back)(?![\\p{L}\\p{N}]))[\\p{L}\\p{N}'.-]+(?:\\s+[\\p{L}\\p{N}'.-]+){0,5}\\s+";
const entryRe = w => fold(w).split(/\s*(?:…|\.\.\.)\s*/).map(part => part.trim().split(/\s+/)
  .map(x => (x.endsWith('*') ? esc(x.slice(0, -1)) + '[\\p{L}\\p{N}]*' : esc(x))).join('\\s+')).join(GAP);
const listRe = (words, flags = 'u') => new RegExp(B + '(?:' + words.map(entryRe).join('|') + ')' + E, flags);
const REPORTED = listRe(WORDS.reportedSpeech.words);
const JUDGEMENT = listRe(WORDS.judgement.words);
const EVERYWHERE = listRe(WORDS.judgementEverywhere.words, 'gu');
const JOURNALIST = listRe(WORDS.journalist.words);
const INSTRUCTION = listRe(WORDS.instructionLike.words);
const CLOSING_SAME = listRe(WORDS.closingSame.words);
const CLOSING_DIFFER = listRe(WORDS.closingDiffer.words);
const OPENERS = new Set(WORDS.openers.words);
const COMMON_NAMES = new Set(WORDS.commonWordNames.words.map(fold));
const NUMBER_WORDS = WORDS.numberWords.words;
const RELATIVE = WORDS.relativeDates.words;
const DATE_NAMES = new Set(WORDS.dateNames.words.map(fold));
// Full month and weekday names are dates in lower case too ("on monday", "in march"); May is left out, being also a verb.
const DATE_WORDS = new Set(WORDS.dateNames.words.filter(w => w.length > 3 && w !== 'May' && w !== 'Sept').map(fold));
// A purpose after "first" in a side's sentence: to and a verb ("first to stir fear", "first, to court small firms"),
// never to and a noun ("first, next to the river").
const PURPOSE = /(?<![\p{L}\p{N}])first(?![\p{L}\p{N}])[^.]*?(?<![\p{L}\p{N}])to\s+(?!(?:the|a|an|his|her|its|their|this|that|these|those|our|my|some|any|each|every|all|both|one|which|what|whom|where|who|more|most|less)(?![\p{L}\p{N}]))\p{Ll}/u;
// Outlet names: the catalogue's names and the fixed list, with the day's own outlets (the input's `outlet` names)
// added for each draft. Each matches in any case ("bbc", "the guardian", "fox news"), but for a name that is also an
// ordinary word (outletCommonWords: Fox, Slate, Reason, The Nation …), which matches only with its capital.
export const OUTLET_NAMES = [...new Set([...SOURCES.map(s => s.name), ...WORDS.outlets.words])].filter(n => n.length >= 2);
const COMMON_OUTLET = new Set(WORDS.outletCommonWords.words.map(fold));
const outletRes = names => names.filter(n => n && n.length >= 2).map(n => {
  const the = /^The\s/.test(n), rest = the ? n.slice(4) : n;
  const exact = COMMON_OUTLET.has(fold(rest)) && !/\s/.test(rest);
  return new RegExp(B + (the ? '[Tt]he\\s+' : '') + esc(rest).replace(/\s+/g, '\\s+') + E, exact ? 'u' : 'iu');
});
const OUTLET_RES = outletRes(OUTLET_NAMES);

export const hasReported = t => REPORTED.test(fold(t));
export const hasJudgement = t => JUDGEMENT.test(fold(t)) || everywhereWords(t).length > 0 || PURPOSE.test(String(t));
export const hasJournalist = t => JOURNALIST.test(fold(t));
export const hasInstruction = t => INSTRUCTION.test(fold(t));
export const hasOutlet = (t, extra = []) => { const s = String(t).replace(/[‘’]/g, "'"); return OUTLET_RES.some(re => re.test(s)) || extra.some(re => re.test(s)); };
/** The words of judgementEverywhere in a text (folded): refused in every sentence, unless the digest cites them. */
export const everywhereWords = t => [...fold(t).matchAll(EVERYWHERE)].map(m => m[0]);
/** The closing sentence's words against its kind: a same closing may not say they differ, nor a differ one that they are alike. */
export const kindFault = (kind, t) => (kind === 'same' ? CLOSING_SAME : CLOSING_DIFFER).test(fold(t));

// Any quotation mark: every double quote, prime, ornament, guillemet and corner bracket anywhere; a single quote or
// apostrophe only inside a word, between two letters (Trump’s, don’t), never at a word's edge, where it quotes.
const DOUBLE_QUOTES = /["“”„‟«»‹›「」『』〝〞〟＂＇`´″‴‶‷❛❜❝❞ʺˮ〃]/u;
export function hasQuote(t) {
  const s = String(t);
  if (DOUBLE_QUOTES.test(s)) return true;
  for (let i = 0; i < s.length; i++) {
    if (!/['‘’‚‛′ʼ]/u.test(s[i])) continue;
    if (!(/\p{L}/u.test(s[i - 1] || '') && /\p{L}/u.test(s[i + 1] || ''))) return true;
  }
  return false;
}
const CONTROL_SET = '[' + [[0x0, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0xfeff, 0xfeff]].map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']';
const CONTROL = new RegExp(CONTROL_SET, 'u'); // controls, soft hyphen, zero-width and direction marks
const CONTROL_ALL = new RegExp(CONTROL_SET, 'gu');
/** Publisher text as the input file holds it: every run of white space (line breaks and tabs too) one space, and the
 *  characters CONTROL holds taken out, so nothing in a headline or summary is hidden from a person reading the file. */
export const plainText = t => String(t ?? '').replace(/\s+/gu, ' ').replace(CONTROL_ALL, '').replace(/ {2,}/g, ' ').trim();
const MARKUP = /[<>[\]{}*_#|\\~^=]|&[#a-z0-9]+;/iu;
// A link or an address: a scheme, www., //, @, or any word.ending of two letters or more (example.org, example.ie);
// U.S. and St. are not addresses (one letter, or a space, after the full stop).
const LINK = /https?:|www\.|:\/\/|@|(?<![\p{L}\p{N}])[\p{L}\p{N}-]+\.\p{L}{2,}(?![\p{L}\p{N}])/iu;
export const hasMarkup = t => CONTROL.test(t) || MARKUP.test(t);
export const hasLink = t => LINK.test(String(t));
// A full stop followed by a capital inside a text starts a second sentence, unless it ends an abbreviation (U.S., a
// single letter, or one of these).
const ABBREVIATIONS = new Set(['Mr', 'Mrs', 'Ms', 'Dr', 'St', 'Sr', 'Jr', 'Gen', 'Lt', 'Col', 'Sgt', 'Capt', 'Rep', 'Sen', 'Gov', 'Rev', 'Prof', 'No', 'Inc', 'Ltd', 'Co', 'Corp', 'Mt', 'Ft', 'vs']);
const twoSentences = t => [...String(t).matchAll(/([\p{L}\p{N}.'’-]*)\.\s+(?=\p{Lu})/gu)].some(m => !(m[1].includes('.') || /^\p{L}$/u.test(m[1]) || ABBREVIATIONS.has(m[1])));

/** The words of a text, each { w, i, e }: letters and digits, with ' ’ . & - inside a word. */
export function words(text) {
  const out = [], re = /[\p{L}\p{N}]+(?:['’.&-][\p{L}\p{N}]+)*/gu;
  for (const m of String(text).matchAll(re)) out.push({ w: m[0], i: m.index, e: m.index + m[0].length });
  return out;
}
/** A text as names are compared: folded, possessives and full stops inside words out, every other mark a space. */
export const normText = t => ' ' + fold(t).replace(/(\p{L})'s(?![\p{L}])/gu, '$1').replace(/(\p{L})\.(?=\p{L})/gu, '$1').replace(/[^\p{L}\p{N}&]+/gu, ' ').trim() + ' ';
const normWord = w => fold(w).replace(/'s$/, '').replace(/'$/, '').replace(/\./g, '').replace(/[^\p{L}\p{N}&]+/gu, ' ').trim();

/**
 * The names in a sentence: runs of capitalised words, the first word left out when it is a fixed opener. Given the
 * day's `vocab` (the words its headlines and summaries print in lower case), a first word standing alone is left out
 * too when the day prints it in lower case (Federal, Floods), unless it is in commonWordNames (Hope, Rose).
 */
export function namesIn(text, { vocab = null } = {}) {
  const ws = words(text), runs = [];
  let run = null;
  ws.forEach((x, k) => {
    const cap = /\p{Lu}/u.test(x.w) && /\p{L}/u.test(x.w) && !(k === 0 && OPENERS.has(x.w));
    const joined = run && /^\s+$/.test(text.slice(ws[k - 1].e, x.i));
    if (cap && joined) run.push(x.w);
    else if (cap) runs.push(run = Object.assign([x.w], { first: k === 0 }));
    else run = null;
  });
  return runs.filter(r => !(vocab && r.first && r.length === 1 && vocab.has(normWord(r[0])) && !COMMON_NAMES.has(normWord(r[0]))))
    .map(r => r.map(normWord).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}
/** Figures in a text ("2,500" → "2500", "2.89", "12"). */
export const figures = t => (String(t).match(/\d+(?:[.,]\d+)*/g) || []).map(n => n.replace(/,/g, ''));
const wordSet = t => new Set((fold(t).match(/[\p{L}]+/gu) || []));

/* --------------------------------------------------------------------------------- names, with their capitals */
// A capital says a word is a name only where a capital is not there anyway: not on the first word of a text or of a
// part of it (after . : ! ? ; | or a dash, though not after U.S. or St.), and not in a part written in title case.
// Elsewhere a capital is "telling". A part is in title case when it prints more of the small words below with a
// capital (not as its first word) than in lower case (Summit With Xi And Putin), or when most of its other words of four
// letters or more are capitalised and it has at most one small word in lower case (Man Accused of Starting Deadly
// Pacific Palisades Fire Found Guilty); or when it is in capitals throughout.
const textsOf = i => [i.headline, i.summary].filter(t => typeof t === 'string' && t.trim());
const SMALL = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'nor', 'of', 'to', 'in', 'on', 'at', 'for', 'by', 'as', 'with', 'from', 'after', 'into',
  'over', 'about', 'amid', 'than', 'that', 'this', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'we', 'our', 'how', 'why', 'what', 'who',
  'will', 'has', 'have', 'can', 'not', 'his', 'her', 'their', 'they', 'he', 'she', 'up', 'out', 'off', 'down', 'says', 'before', 'under', 'against']);
const breakBefore = (t, ws, k) => {
  if (k === 0) return true;
  const gap = t.slice(ws[k - 1].e, ws[k].i), prev = ws[k - 1].w;
  if (/[:!?;|–—]/u.test(gap)) return true;
  return gap.includes('.') && !(prev.includes('.') || /^\p{L}$/u.test(prev) || ABBREVIATIONS.has(prev));
};
function titleParts(t, ws) {
  const parts = [];
  ws.forEach((x, k) => { if (breakBefore(t, ws, k)) parts.push([]); parts[parts.length - 1].push(x.w); });
  const flags = parts.map(p => {
    const letters = p.join('').replace(/[^\p{L}]/gu, '');
    if (p.length >= 3 && letters === letters.toUpperCase() && /\p{Lu}/u.test(letters)) return true;
    let capSmall = 0, lowSmall = 0, big = 0, capBig = 0;
    p.forEach((w, j) => {
      const f = fold(w);
      if (SMALL.has(f)) { if (/^\p{Lu}/u.test(w)) { if (j > 0) capSmall++; } else lowSmall++; } else if (/^\p{L}{4,}/u.test(w)) { big++; if (/^\p{Lu}/u.test(w)) capBig++; }
    });
    return capSmall > lowSmall || (big >= 3 && capBig >= 0.6 * big && lowSmall <= 1);
  });
  return { parts, flags };
}
/** A text's words as names are compared (folded, possessive and full stops out), each with its capital and whether the capital is telling. */
function tokens(t) {
  const ws = words(t), { flags } = titleParts(t, ws), out = [];
  let part = -1;
  ws.forEach((x, k) => {
    const start = breakBefore(t, ws, k);
    if (start) part++;
    const cap = /\p{Lu}/u.test(x.w);
    normWord(x.w).split(' ').filter(Boolean).forEach((n, j) => out.push({ n, cap, telling: cap && !flags[part] && !(start && j === 0) }));
  });
  return out;
}
/** The words the day's items print in lower case: these are ordinary words, whatever else they may be. */
export function lowerVocab(items) {
  const v = new Set();
  for (const i of items) for (const t of textsOf(i)) for (const x of words(t)) if (!/\p{Lu}/u.test(x.w)) for (const n of normWord(x.w).split(' ')) if (n) v.add(n);
  return v;
}
/** Words the items print only with a telling capital, never in lower case: names, even where a sentence writes them in lower case. */
function properWords(items, vocab) {
  const p = new Set();
  for (const i of items) for (const t of textsOf(i)) for (const x of tokens(t)) if (x.telling && !vocab.has(x.n) && /\p{L}/u.test(x.n)) p.add(x.n);
  return p;
}
/** Runs of words a sentence writes in lower case that the items print as names ("jane doakes"). */
function lowerNames(text, proper) {
  const ws = words(text), runs = [];
  let run = null;
  ws.forEach((x, k) => {
    const parts = normWord(x.w).split(' ').filter(Boolean);
    const hit = !/\p{Lu}/u.test(x.w) && parts.length > 0 && parts.every(n => proper.has(n));
    const joined = run && /^\s+$/.test(text.slice(ws[k - 1].e, x.i));
    if (hit && joined) run.push(...parts);
    else if (hit) runs.push(run = [...parts]);
    else run = null;
  });
  return runs.map(r => r.join(' '));
}
/**
 * The outlets whose items print a name. A name of ordinary words only (each word printed in lower case somewhere in
 * the day's items, or in commonWordNames: Hope, US, White House) counts only where an item prints it with a telling
 * capital on every word: hope in lower case, Hope fades at the start of a headline, or Rescuers Lose Hope in a title-
 * case headline is no second outlet for a person called Hope. A name with a word the day never prints in lower case
 * (Peltola, Alaska) is told by that word, and counts in any case (Alaska senate).
 */
function outletsPrinting(name, pool, vocab) {
  const parts = name.split(' '), weak = parts.every(n => vocab.has(n) || COMMON_NAMES.has(n));
  const out = new Set();
  for (const i of pool) {
    if (out.has(i.outletId)) continue;
    for (const t of textsOf(i)) {
      const tk = tokens(t);
      let found = false;
      for (let j = 0; j + parts.length <= tk.length && !found; j++) {
        if (!parts.every((n, q) => tk[j + q].n === n)) continue;
        if (weak && !parts.every((n, q) => tk[j + q].telling)) continue;
        found = true;
      }
      if (found) { out.add(i.outletId); break; }
    }
  }
  return out;
}

/* --------------------------------------------------------------------------------------- the one sentence */
/**
 * The checks every sentence gets: the first that fails gives its code, or null. `cited` are the input items the sentence
 * cites, `pool` the items a name must be found among in two outlets' text.
 */
export function sentenceFault(text, cited, pool, { max = LIMITS.sentenceChars, five = false, outlets = outletRes([...new Set(pool.map(i => i.outlet))]), vocab = lowerVocab(pool) } = {}) {
  if (typeof text !== 'string' || !text.trim() || text !== text.trim()) return 'shape';
  if (text.length > max) return 'length';
  if (CONTROL.test(text)) return 'markup';
  if (hasLink(text)) return 'link';
  if (MARKUP.test(text)) return 'markup';
  if (!/\.$/.test(text) || /[?!]/.test(text) || twoSentences(text)) return 'not-a-sentence';
  if (hasQuote(text)) return 'quote';
  if (hasReported(text)) return 'reported-speech';
  if (hasInstruction(text)) return 'instruction';
  if (hasOutlet(text, outlets)) return 'outlet';
  if (five && hasJournalist(text)) return 'journalist';
  const citedText = cited.map(i => `${i.headline} ${i.summary || ''}`).join(' \n ');
  if (five ? hasJudgement(text) : everywhereWords(text).some(w => !phraseRe(w).test(fold(citedText)))) return 'judgement';
  if (/(?![0-9])\p{N}/u.test(text)) return 'number'; // a figure in any digits but 0 to 9 (full-width, Arabic-Indic, ², ½)
  const figs = new Set(figures(citedText)), have = wordSet(citedText);
  for (const n of figures(text)) if (!figs.has(n)) return 'number';
  for (const w of wordSet(text)) {
    if (Object.hasOwn(NUMBER_WORDS, w) && !have.has(w) && !(NUMBER_WORDS[w] != null && figs.has(String(NUMBER_WORDS[w])))) return 'number';
    const base = w.replace(/s$/, '');
    if ((RELATIVE.includes(w) || RELATIVE.includes(base)) && !have.has(base) && !have.has(base + 's')) return 'date';
    if (DATE_WORDS.has(w) && !have.has(w)) return 'date';
  }
  const citedNorm = cited.map(i => normText(`${i.headline} ${i.summary || ''}`));
  const names = [...namesIn(text, { vocab }), ...lowerNames(text, properWords(pool, vocab))];
  for (const name of names) {
    if (!citedNorm.some(t => t.includes(` ${name} `))) return name.split(' ').some(w => DATE_NAMES.has(w)) ? 'date' : 'name';
    if (outletsPrinting(name, pool, vocab).size < 2) return 'private-name';
  }
  return null;
}

/* -------------------------------------------------------------------------------------------- the draft */
const isObj = x => !!x && typeof x === 'object' && !Array.isArray(x);
const onlyKeys = (o, keys) => isObj(o) && Object.keys(o).every(k => keys.includes(k));
const isSentence = s => onlyKeys(s, ['text', 'cites']) && typeof s.text === 'string' && Array.isArray(s.cites) && s.cites.every(c => typeof c === 'string');

/**
 * Checks a draft (its text, as read from the file) against the day's input. Returns
 *   { ok, reasons: [{ code, where }], five: { <story id>: { ok, reasons } } }
 * ok false: the whole draft is refused, and `five` is empty. ok true: the digest is published, and each story's written
 * analysis where its own `five` entry is ok.
 */
export function checkDraft(input, draftText) {
  const fail = (code, where = '') => ({ ok: false, reasons: [{ code, where }], five: {} });
  if (typeof draftText !== 'string') return fail('not-json');
  if (Buffer.byteLength(draftText) > LIMITS.draftBytes) return fail('too-large');
  let d;
  try { d = JSON.parse(draftText); } catch { return fail('not-json'); }
  if (!onlyKeys(d, ['format', 'day', 'input', 'model', 'lead', 'stories']) || d.format !== DRAFT_FORMAT || typeof d.model !== 'string' || !/^Claude\b/.test(d.model) || !Array.isArray(d.lead) || !Array.isArray(d.stories)) return fail('shape');
  if (d.day !== input.day) return fail('day');
  if (d.input !== input.id) return fail('input');
  const items = new Map(input.stories.flatMap(s => s.items.map(i => [i.id, { ...i, story: s.id }])));
  const storyOf = new Map(input.stories.map(s => [s.id, s]));
  const outlets = outletRes([...new Set([...items.values()].map(i => i.outlet))]); // every outlet of the day, in every sentence
  const vocab = lowerVocab([...items.values()]); // the words the day prints in lower case
  const ids = d.stories.map(s => s?.id);
  if (new Set(ids).size !== ids.length || ids.length !== input.stories.length || !input.stories.every(s => ids.includes(s.id))) return fail('shape', 'stories');
  const reasons = [];
  const cite = (s, where, story) => {
    if (!s.cites.length) return 'cites-none';
    for (const c of s.cites) {
      if (!items.has(c)) return 'cites-unknown';
      if (story && items.get(c).story !== story) return 'cites-other-story';
    }
    return null;
  };
  // The lead: one to three sentences, citing any of the day's items; a name must be in two outlets of the stories cited.
  if (d.lead.length < LIMITS.leadSentences[0] || d.lead.length > LIMITS.leadSentences[1]) return fail('length', 'lead');
  if (!d.lead.every(isSentence)) return fail('shape', 'lead');
  if (d.lead.reduce((a, s) => a + s.text.length, 0) > LIMITS.leadChars) return fail('length', 'lead');
  d.lead.forEach((s, k) => {
    const where = `lead[${k}]`, c = cite(s, where, null);
    if (c) return reasons.push({ code: c, where });
    const cited = s.cites.map(id => items.get(id));
    const pool = [...new Set(cited.map(i => i.story))].flatMap(id => storyOf.get(id).items);
    const f = sentenceFault(s.text, cited, pool, { outlets, vocab });
    if (f) reasons.push({ code: f, where });
  });
  // Each story: two to four sentences citing its own items.
  for (const [n, s] of d.stories.entries()) {
    const where = `stories[${n}]`;
    if (!onlyKeys(s, ['id', 'sentences', 'five']) || !Array.isArray(s.sentences) || !s.sentences.every(isSentence)) { reasons.push({ code: 'shape', where }); continue; }
    if (s.sentences.length < LIMITS.storySentences[0] || s.sentences.length > LIMITS.storySentences[1] || s.sentences.reduce((a, x) => a + x.text.length, 0) > LIMITS.storyChars) { reasons.push({ code: 'length', where }); continue; }
    const story = storyOf.get(s.id);
    s.sentences.forEach((x, k) => {
      const w = `${where}.sentences[${k}]`, c = cite(x, w, s.id);
      if (c) return reasons.push({ code: c, where: w });
      const f = sentenceFault(x.text, x.cites.map(id => items.get(id)), story.items, { outlets, vocab });
      if (f) reasons.push({ code: f, where: w });
    });
  }
  if (reasons.length) return { ok: false, reasons, five: {} };
  // The digest passed. Each story's written analysis is judged on its own.
  const five = {};
  for (const [n, s] of d.stories.entries()) five[s.id] = checkFive(storyOf.get(s.id), s.five, `stories[${n}].five`, outlets, vocab);
  return { ok: true, reasons: [], five };
}

/** One story's written 5 Sided Analysis: { ok, reasons }, or null when the story has none and is not one to analyse. */
export function checkFive(story, five, where = 'five', outlets = outletRes([...new Set(story.items.map(i => i.outlet))]), vocab = lowerVocab(story.items)) {
  const no = (code, w = where) => ({ ok: false, reasons: [{ code, where: w }] });
  if (five === undefined || five === null) return story.written5 ? no('five-shape') : null;
  if (!story.written5) return no('not-eligible');
  if (!onlyKeys(five, ['sides', 'closing']) || !onlyKeys(five.sides, SIDE_KEYS)) return no('five-shape');
  const bySide = Object.fromEntries(SIDE_KEYS.map(k => [k, story.items.filter(i => i.side === k)]));
  const reasons = [];
  for (const k of SIDE_KEYS) {
    const list = five.sides[k], w = `${where}.sides.${k}`;
    if (list === undefined) { if (bySide[k].length) reasons.push({ code: 'side-missing', where: w }); continue; }
    if (!Array.isArray(list) || !list.every(isSentence)) { reasons.push({ code: 'five-shape', where: w }); continue; }
    if (!bySide[k].length) { reasons.push({ code: 'side-without-items', where: w }); continue; }
    if (list.length < LIMITS.sideSentences[0] || list.length > LIMITS.sideSentences[1]) { reasons.push({ code: 'length', where: w }); continue; }
    const own = new Map(bySide[k].map(i => [i.id, i]));
    list.forEach((x, j) => {
      const ww = `${w}[${j}]`;
      if (!x.cites.length) return reasons.push({ code: 'cites-none', where: ww });
      if (!x.cites.every(id => own.has(id))) return reasons.push({ code: story.items.some(i => x.cites.includes(i.id)) ? 'side-cites-other-side' : 'cites-unknown', where: ww });
      const f = sentenceFault(x.text, x.cites.map(id => own.get(id)), story.items, { five: true, outlets, vocab });
      if (f) reasons.push({ code: f, where: ww });
    });
  }
  // The closing sentence: far left and left together against right and far right together, only when both carried it.
  const L = story.items.filter(i => LEFT_HALF.includes(i.side)), R = story.items.filter(i => RIGHT_HALF.includes(i.side));
  const c = five.closing, w = `${where}.closing`;
  if (!L.length || !R.length) {
    if (c !== undefined && c !== null) reasons.push({ code: 'closing-one-half', where: w });
  } else if (!onlyKeys(c, ['kind', 'text', 'cites']) || !['differ', 'same'].includes(c.kind) || typeof c.text !== 'string' || !Array.isArray(c.cites) || !c.cites.every(x => typeof x === 'string')) {
    reasons.push({ code: 'five-shape', where: w });
  } else {
    const halves = new Map([...L, ...R].map(i => [i.id, i]));
    if (!c.cites.length || !c.cites.every(id => halves.has(id)) || !c.cites.some(id => LEFT_HALF.includes(halves.get(id).side)) || !c.cites.some(id => RIGHT_HALF.includes(halves.get(id).side))) reasons.push({ code: 'closing-cites', where: w });
    else {
      const f = sentenceFault(c.text, c.cites.map(id => halves.get(id)), story.items, { max: LIMITS.closingChars, five: true, outlets, vocab });
      if (f) reasons.push({ code: f, where: w });
      else if (kindFault(c.kind, c.text)) reasons.push({ code: 'closing-kind', where: w });
    }
  }
  return reasons.length ? { ok: false, reasons } : { ok: true, reasons: [] };
}

