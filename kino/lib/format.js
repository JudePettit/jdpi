/* Kino's six categories (one submodule page each) and the vocabulary of its script format. Shared by the player and
   the validator; see kino/README.md for the format. */

export const CATEGORIES = [
  { id: 'political-events', name: 'Political Events', dek: 'Revolutions, elections, treaties and crises that changed how countries are governed.' },
  { id: 'political-figures', name: 'Political Figures', dek: 'The lives of leaders, reformers and revolutionaries, told from their sources.' },
  { id: 'political-parties', name: 'Political Parties', dek: 'How parties formed, what they stood for, and how they won and lost power.' },
  { id: 'wars', name: 'Wars', dek: 'Wars from their causes to their aftermath, with the maps and figures that explain them.',
    note: 'The maps are illustrative. They are drawn on present-day borders for orientation, with movements and fronts sketched from the sources and marked approximate where they are simplified: they are not historical boundary or front-line data.' },
  // The examples are films in the two categories (tests/kino.test.mjs holds them to the catalogue).
  { id: 'geopolitical-events', name: 'Geopolitical Events', dek: 'Shifts in the balance between powers: alliances, blockades, crises between states and the end of empires. Political Events follows how a country is governed, as in the Russian Revolutions of 1917; Geopolitical Events follows how states stand towards one another, as in the Cuban Missile Crisis.',
    examples: { 'political-events': 'russian-revolutions-1917', 'geopolitical-events': 'cuban-missile-crisis' } },
  { id: 'great-thinkers', name: 'Great Thinkers', dek: 'Short introductions to the great minds met across Vitruvian Manager: economists, philosophers, political theorists and scientists.', courses: true },
];
export const CATEGORY_IDS = CATEGORIES.map(c => c.id);

/* A film about a subject that carries on after it (a party still in being) says where its story stops: its "cutoff",
   a year or a month and year ("2024", "February 2026"), no earlier than the last year its narration names
   (scripts/validate.mjs). Its catalogue card and its player then read "From 1929 · told to 2024" in place of the era. */
export const CUTOFF = /^(?:(January|February|March|April|May|June|July|August|September|October|November|December) )?(\d{4})$/;
export const cutoffYear = s => { const m = CUTOFF.exec(String(s ?? '')); return m ? +m[2] : null; };
const year = y => (y < 0 ? `${-y} BC` : String(y));
/** The period a card and the player show: "1939–1945", "1962", or "From 1921 · told to 2022" for a film with a cutoff. */
export function spanLabel(doc) {
  const [a, b] = doc.era;
  if (doc.cutoff) return `From ${year(a)} · told to ${doc.cutoff}`;
  return a === b ? year(a) : `${year(a)}–${year(b)}`;
}
/** The years a script's narration names (four-digit years from 1500 to 2099), for the cutoff check. */
export function narratedYears(doc) {
  return flatScenes(doc).flatMap(s => [...`${s.title || ''} ${s.narration || ''}`.matchAll(/\b(1[5-9]\d\d|20\d\d)\b/g)].map(m => +m[1]));
}
/** Great Thinkers' line on its courses (after its dek, "Short introductions to …"), from their own lengths. */
export function courseWords(docs) {
  const m = docs.map(d => d.minutes).filter(Number.isFinite), lo = Math.min(...m), hi = Math.max(...m);
  const len = !m.length ? '' : lo === hi ? ` about ${lo} minutes` : ` ${lo} to ${hi} minutes`;
  const books = docs.some(d => d.books?.length) ? ', and links to the thinker’s own book where Bibliotheca’s shelf holds one' : '';
  return `Each runs${len}, in parts, with a short quiz at the end${books}.`;
}
export const categoryOf = id => CATEGORIES.find(c => c.id === id) || null;

export const VISUAL_KINDS = ['title', 'map', 'timeline', 'portrait', 'quote', 'chart', 'module'];
export const SOURCE_KINDS = ['wikidata', 'book', 'article', 'web'];

/** Map tones: groups of countries are coloured by tone (the categorical palette in its fixed order). */
export const TONES = { 1: '--prp-cat-1', 2: '--prp-cat-2', 3: '--prp-cat-3' };

/** All scenes of a script in order, with their part (courses keep scenes inside parts). */
export function flatScenes(doc) {
  if (Array.isArray(doc.parts)) return doc.parts.flatMap((p, k) => (p.scenes || []).map(s => ({ ...s, part: p.id, partTitle: p.title, partNo: k + 1 })));
  return (doc.scenes || []).map(s => ({ ...s }));
}

/* Family names from an author string, in order. Authors are written naturally ("Antony Beevor"; "Charles Hirschman,
   Samuel Preston and Vu Manh Loi"), and "Surname, Given" forms are read too: "Beevor, Antony"; "Glantz, David M. and
   Jonathan M. House"; "Hirschman, Charles; Preston, Samuel"; "Hirschman, C., Preston, S., & Vu, M. L.". The family name
   of a natural name is its last word, with the particles before it ("Charles de Gaulle" → "de Gaulle") and without
   Jr or III. Names written family name first ("Shen Zhihua"), surnames of two words ("Timothy Garton Ash") and
   institutions need the source's "cite". */
const PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'del', 'della', 'di', 'da', 'du', 'dos', 'das', 'la', 'le', 'ter', 'ten', 'Ó', 'Ní']);
const SUFFIX = /^(?:Jr|Sr|II|III|IV)\.?$/;
const words = s => s.split(/\s+/).filter(Boolean);
const isSuffix = s => words(s).length === 1 && SUFFIX.test(s.trim());
const isInitials = s => words(s).every(x => /^(?:\p{Lu}\.?)+$/u.test(x));
// One surname word, perhaps after particles ("Beevor", "van der Berg"), as written before the comma of "Surname, Given".
const isSurname = s => { const w = words(s); return w.length > 0 && /^\p{Lu}/u.test(w[w.length - 1]) && w.slice(0, -1).every(x => PARTICLES.has(x)); };
// Given names or initials ("Antony", "David M.", "C.", "M. L."), as written after the comma.
const isGiven = s => !isSuffix(s) && words(s).length > 0 && words(s).every(x => /^\p{Lu}[\p{L}\p{M}'’.-]*$/u.test(x) || PARTICLES.has(x));
function natural(name) {
  const w = words(name);
  while (w.length > 1 && SUFFIX.test(w[w.length - 1])) w.pop();
  let k = w.length - 1;
  while (k > 0 && PARTICLES.has(w[k - 1])) k--;
  return w.slice(k).join(' ');
}
const AND = /\s*,?\s+(?:and|&)\s+|\s*&\s*/;
function readAuthors(author) {
  let etAl = false;
  const s = String(author ?? '')
    .replace(/\s*\([^)]*\)/g, '')                                             // (ed.), (eds), (trans.)
    .replace(/,?\s+(?:eds?|trans|translators?|editors?)\.?\s*$/i, '')         // …, eds.
    .replace(/,?\s+et\s+al\.?\s*$/i, () => { etAl = true; return ''; })
    .trim();
  const out = [];
  if (s.includes(';')) {
    // Separated by semicolons: one author each, "Surname, Given" or natural.
    for (const one of s.split(/\s*;\s*/).flatMap(p => p.split(AND)).filter(Boolean)) {
      const [first, ...rest] = one.split(/\s*,\s*/);
      out.push(rest.length && isGiven(rest[0]) ? first : natural(one.replace(/,/g, ' ')));
    }
  } else if (s) {
    const parts = s.split(AND).filter(Boolean), [a, b, more] = parts[0].split(/\s*,\s*/).filter(Boolean);
    // One author, "Surname, Given" ("Beevor, Antony"; "Garton Ash, Timothy"), unless it reads as two natural names.
    if (parts.length === 1 && b && !more && isGiven(b) && (isSurname(a) || words(b).length === 1 || isInitials(b))) out.push(a);
    else {
      for (const part of parts) {
        const pieces = part.split(/\s*,\s*/).filter(Boolean);
        for (let i = 0; i < pieces.length; i++) {
          if (isSuffix(pieces[i])) continue;                                  // "Martin Luther King, Jr."
          if (i + 1 < pieces.length && isSurname(pieces[i]) && isGiven(pieces[i + 1])) { out.push(pieces[i]); i++; } // "Glantz, David M."
          else out.push(natural(pieces[i]));
        }
      }
    }
  }
  return { names: out.map(n => n.trim()).filter(Boolean), etAl };
}
export const familyNames = author => readAuthors(author).names;

/** A short citation for a source: "Beevor 2012", "Glantz & House 1995", "Hirschman et al. 1995". A source's "cite"
    ("Shen 2012") overrides it ("short" is its older name); without an author, the publisher or title stands in. */
export function shortCite(src) {
  if (!src) return '';
  const given = src.cite ?? src.short;
  if (given) return String(given);
  if (src.kind === 'wikidata') return 'Wikidata';
  const year = src.year ? ' ' + src.year : '';
  if (!src.author) return `${String(src.publisher || src.title || '').replace(/\s*\(.*\)$/, '')}${year}`; // an institution, named in full
  const { names, etAl } = readAuthors(src.author);
  if (!names.length) return `${String(src.author).trim()}${year}`;
  return `${names.length > 2 || etAl ? `${names[0]} et al.` : names.join(' & ')}${year}`;
}
