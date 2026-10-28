/* Kino text rules, shared by the player (browser) and the validator (node). No DOM here.
   - Captions are split into words on whitespace, so a full stop that is not followed by a space never ends a sentence.
   - Speech rule (the decimal rule): a full stop with no space after it is read "point" between digits (5.5 → "5 point 5")
     and "dot" between letters (jdpi.pages.dev → "jdpi dot pages dot dev"). It is never read as the end of a sentence.
   - Year spans written with an en dash (1939–1945) are read "1939 to 1945". */

const END = /[.!?…]["'’”)\]]*$/;

/** The caption's words, exactly as displayed (punctuation stays attached). */
export function tokens(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean);
}

/** The decimal rule, applied to any string. As in the shell's reader (design/jdpi-documentary.js), the digits after
    the point are said one by one: 5.6 → "5 point 6", 0.73 → "0 point 7 3", .5 → "point 5". */
const digits = d => d.split('').join(' ');
export function speechRule(text) {
  return String(text ?? '')
    .replace(/(\d)\.(\d+)/g, (_, a, b) => `${a} point ${digits(b)}`)
    .replace(/(^|[^\w.])\.(\d+)/g, (_, a, b) => `${a}point ${digits(b)}`)
    .replace(/([A-Za-z])\.(?=[A-Za-z])/g, '$1 dot ');
}

/** How one displayed word is spoken. */
export function spoken(word) {
  let w = speechRule(word);
  w = w.replace(/(\d)\s*[–—-]\s*(?=\d)/g, '$1 to ');    // 1939–1945 → 1939 to 1945; 24–27 → 24 to 27
  w = w.replace(/[·•]/g, ',');
  return w;
}

/** True when this displayed word closes a sentence (it ends in . ! ? or …, perhaps followed by a closing quote). */
export const endsSentence = word => END.test(word);

/** Sentences as runs of word indexes: [[0..n], …]. A full stop inside a word ("5.5", "pages.dev") never splits. */
export function sentenceRuns(text) {
  const words = tokens(text), runs = [];
  let cur = [];
  words.forEach((w, i) => { cur.push(i); if (endsSentence(w)) { runs.push(cur); cur = []; } });
  if (cur.length) runs.push(cur);
  return runs;
}

export const sentences = text => { const w = tokens(text); return sentenceRuns(text).map(r => r.map(i => w[i]).join(' ')); };
export const countSentences = text => sentenceRuns(text).length;
export const wordCount = text => tokens(text).length;

/**
 * One utterance per sentence, with a map from character offsets in the spoken string back to caption words,
 * so speech boundary events can highlight the word being said.
 * Returns [{ text, words: [{ i, from, to }] }] where i indexes tokens(text).
 */
export function utterances(text) {
  const words = tokens(text);
  return sentenceRuns(text).map(run => {
    let s = '', map = [];
    for (const i of run) {
      const say = spoken(words[i]);
      if (s) s += ' ';
      map.push({ i, from: s.length, to: s.length + say.length });
      s += say;
    }
    return { text: s, words: map };
  });
}

/** The caption word being spoken at a character offset of an utterance. */
export function wordAt(utt, charIndex) {
  let hit = utt.words[0];
  for (const w of utt.words) { if (w.from <= charIndex) hit = w; else break; }
  return hit ? hit.i : 0;
}

/** Seconds to read a passage aloud at a speech rate (1 = the voice's normal pace, about 165 words a minute). */
export function estimateSeconds(text, rate = 0.92) {
  const n = wordCount(text);
  return Math.round((n / (165 * rate / 60)) * 10) / 10;
}

/** Words that the decimal rule would read oddly ("e.g." → "e dot g"): authors should write them out. */
export function speechWarnings(text) {
  const out = [];
  for (const w of tokens(text)) {
    if (/[A-Za-z]\.[A-Za-z]/.test(w) && !/^https?:|\.(com|org|dev|uk|net)\b/i.test(w)) out.push(`"${w}" would be read with "dot"; write it out`);
    if (/^(Mr|Mrs|Dr|St|Mt|Gen|Col|Capt|Lt|Sgt|Prof|No|vs|etc|c|ca)\.$/i.test(w)) out.push(`"${w}" ends a sentence when read aloud; drop the full stop (British style) or write it out`);
  }
  return out;
}
