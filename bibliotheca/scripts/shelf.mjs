// The Bibliotheca shelf: the public-domain books NEO CLASSIC reads, one entry each, with everything the build needs
// to fetch, split and tag a book, the rights finding that lets PRP redistribute it, and the tagging decisions a human
// took after reading the tagger's report. This file is the one place a book is described; the scripts read it.
//   build-book.mjs  downloads the Gutenberg text, cuts its boilerplate, splits chapters and paragraphs, tags, writes
//   tag-terms.mjs   re-tags a built book in place (after a decision is added here) and prints the report again
// Built files: bibliotheca/data/books/<slug>.json (the data contract is in build-book.mjs) and bibliotheca/data/index.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wordCount } from '../../kino/lib/text.js';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const DATA = join(ROOT, 'bibliotheca', 'data');
export const BOOKS = join(DATA, 'books');
export const INDEX = join(DATA, 'index.json');
// Downloaded source files are kept here between builds and never committed (cache/.gitignore): a Project Gutenberg
// file carries the trademark and licence that the built book must not.
export const CACHE = join(ROOT, 'bibliotheca', 'scripts', 'cache');

/* Rights. A book is written only when both `us` and `uk` say "pd", and build-book.mjs also checks that the dates
   bear the finding out (checkRights below): in the UK copyright lasts until 70 years after the death of the author,
   and of the translator for a translation (CDPA s.12), so a death year d means public domain from 1 January d + 71;
   in the US a work published before 1978 is in the public domain at most 95 years after its publication: that is the
   longest term any of them can have, and only those published from 1923 that were still protected in 1998 had it
   (the 1998 extension); earlier ones ran out sooner, a 1908 publication by 31 December 1983 at the latest (28 years
   and a renewal, extended to 75 in all). So a publication year before this year − 95 is a safe test; a later one
   fails it whatever its true term, so no book published after 1977 is cleared by its date alone (Cornell, "Copyright
   Term and the Public Domain"). `basis` says it in words, `checked` is the day the finding was made. The research
   report behind these findings is the Bibliotheca feasibility report of 30 October 2026. */
export const SHELF = [
  {
    slug: 'the-prince',
    title: 'The Prince',
    author: { name: 'Niccolò Machiavelli', qid: 'Q1399', born: 1469, died: 1527 },
    translator: { name: 'W. K. Marriott', died: 1927 },
    // The work itself: written in 1513, printed in 1532. Its era, for the screens that take a period (the Invention
    // Timeline, Kardashev), runs from Charles VIII's invasion of Italy, the event the book keeps returning to, to the
    // author's death.
    work: { qid: 'Q131719', written: 1513, published: 1532 },
    era: [1494, 1527],
    // The edition: Marriott's translation (London: J. M. Dent, Everyman's Library, 1908), as Project Gutenberg
    // eBook #1232 (plain text, UTF-8).
    gutenberg: 1232,
    published: 1908,
    rights: {
      us: 'pd', uk: 'pd',
      basis: 'Machiavelli died in 1527 and the translator W. K. Marriott in 1927, so the UK term (life plus 70 years, '
        + 'CDPA s.12) ended on 31 December 1997. The translation was first published in 1908, and every work published '
        + 'before 1931 is in the public domain in the United States (a 1908 publication could be protected for at most '
        + '75 years, to 31 December 1983; the 95-year term applies only to works published from 1923). The Project '
        + 'Gutenberg licence allows the text to be used freely once its header, footer and licence are removed '
        + '(gutenberg.org/policy/license.html).',
      checked: '2026-10-30',
    },
    // How the Gutenberg file is cut up (text.mjs, splitChapters). A chapter heading stands alone on a line
    // ("CHAPTER XII."; chapter XVIII's carries a footnote mark, "CHAPTER XVIII.[1]"), with the title in capitals on
    // the line or two after it. Marriott's introduction and the two other works his edition appends (the Vitelli
    // murders and the life of Castruccio Castracani) are not The Prince and are left out; the dedication to Lorenzo
    // de' Medici is Machiavelli's own and opens the book as chapter 0. `proper` lists the words that keep their
    // capital when a title is set in sentence case.
    layout: {
      chapter: /^CHAPTER ([IVXL]+)\.(?:\[\d+\])?$/,
      numbering: 'roman',
      count: 26,
      sections: [{ heading: /^DEDICATION$/, n: 0, title: 'Dedication', until: /^THE PRINCE$/ }],
      end: /^DESCRIPTION OF THE METHODS ADOPTED BY THE DUKE VALENTINO/,
      proper: ['Darius', 'Alexander', 'Italy'],
    },
    // Tagging decisions, read after the tagger's report (tag-terms.mjs): a string → the entity it means in this book
    // (added when the lake lacks the word, retargeted when the lake's match is wrong), a string → null to leave it
    // untagged, an entity's QID → null to leave that entity out of this book altogether. Strings are matched whole,
    // as names (case and all) when they start with a capital. A leading "the" is ignored.
    decisions: {
      // "France" and "Spain" in a text of 1513 are the kingdoms of the Italian Wars. The lake's bare words are the
      // present-day states (France founded 1958, Spain 1715, both let through by their exact names), and it has the
      // Kingdom of France and the Spanish Empire (1492–1899) under their own names only.
      France: 'Q70972',
      Spain: 'Q80702',
      // The Swiss of 1513 are the Old Swiss Confederacy (1291–1798). The lake's "Switzerland" and "Swiss" are the
      // present-day state, founded on the same day of 1291, which would win the tie by its mentions; Marriott's
      // "Switzers" is a word the lake lacks.
      Switzerland: 'Q435583',
      Swiss: 'Q435583',
      Switzers: 'Q435583',
      // Machiavelli's Germany (chapter X: "the cities of Germany are absolutely free") is the Empire's German lands;
      // the lake's bare word is the Federal Republic of 1949, let through by its exact name.
      Germany: 'Q12548',
      // The Encyclopaedia's "Republic" is a party founded in 2021, let through by its exact name; in this book a
      // republic is a form of state, so the word is left untagged.
      Republic: null,
      // Three more exact names of modern states that mean something else here: Pescennius Niger, the rival of
      // Severus (chapter XIX), the people of Israel led by Moses (chapter VI), and Alba Longa, where Romulus was not
      // to remain (chapter VI).
      Niger: null,
      Israel: null,
      Alba: null,
      // Two more, the book's most frequent: the lake has no Italy before the Kingdom of 1861 and no Greece before the
      // state of 1821, so Machiavelli's Italy (the peninsula and its states, 48 times) and his Greece (the Turk's in
      // chapter III, that of Philip and Antiochus about 200 BC, the Spartans', 12 times) are left untagged rather
      // than open the entries of the republic of 1946 and the state of 1821, with their screens from 1926.
      Italy: null,
      Greece: null,
      // Egypt, where Moses found the people of Israel (chapter VI), is Ancient Egypt, not the state of 1922; Marriott's
      // Russia of 1908 (the "artel" that "exist in Russia to-day", and the title of Wallace's book: chapter XXI's note
      // 9) is the Russian Empire, not the federation of 1991. Sigismund, Duke of Austria in 1487 (chapter XII's note
      // 13), ruled none of the Austrias the lake has (the republic of 1918, the empires of 1804 and 1867).
      Egypt: 'Q11768',
      Russia: 'Q34266',
      Austria: null,
      // "The Church" is the papacy as a temporal power, the Papal States (22 times, in chapters III, VII, XI, XII, XXI
      // and XXVI: aggrandized, holding the Romagna, its states robbed); the lake has them as "State of the Church" and
      // "Church State", not the bare word.
      Church: 'Q170174',
      // Machiavelli's Rome is the ancient city and state through kings, republic and emperors (Romulus, Scipio,
      // Severus); the lake's bare "Rome" is an alias of the Roman Republic alone, so the word and the Romans go to
      // Ancient Rome (753 BC–476), which the lake has under that name only.
      Rome: 'Q1747689',
      Romans: 'Q1747689',
      // The Italian states of the book, which the lake knows under their formal names only: Machiavelli says Milan,
      // Venice, Florence and Pisa, and the Milanese, Venetians and Florentines. (Pisa in 1499 was a city in revolt
      // from Florence; the Republic of Pisa is the only Pisa the lake has.)
      Milan: 'Q153529',
      Milanese: 'Q153529',
      Venice: 'Q4948',
      Venetians: 'Q4948',
      Florence: 'Q148540',
      Florentines: 'Q148540',
      Pisa: 'Q1365493',
      Pisans: 'Q1365493',
      // "The Turk" is the Ottoman sultan and his state (chapters IV and XIX); the French, Spaniards and Germans are
      // the armies of the kingdoms and the Empire above.
      Turk: 'Q12560',
      Turks: 'Q12560',
      French: 'Q70972',
      Spaniards: 'Q80702',
      Germans: 'Q12548',
    },
  },
];

export const shelfEntry = slug => {
  const e = SHELF.find(b => b.slug === slug);
  if (!e) throw new Error(`"${slug}" is not on the shelf (bibliotheca/scripts/shelf.mjs has ${SHELF.map(b => b.slug).join(', ')})`);
  return e;
};

/** Refuses a book that may not be redistributed: both rights findings must say "pd", and the death years and the
    publication year must agree with them by the term rules above (so a finding copied in error is caught). Returns the
    reasons the book is clear; throws otherwise. */
export function checkRights(entry, year = new Date().getUTCFullYear()) {
  const r = entry.rights || {};
  if (r.us !== 'pd' || r.uk !== 'pd') throw new Error(`${entry.slug}: rights are ${r.us || '?'} (US) / ${r.uk || '?'} (UK), not pd/pd; the book is not written`);
  if (!r.basis || !r.checked) throw new Error(`${entry.slug}: the rights finding needs a basis in words and the date it was checked`);
  const reasons = [];
  for (const who of [entry.author, entry.translator].filter(Boolean)) {
    if (!Number.isFinite(who.died)) throw new Error(`${entry.slug}: ${who.name} has no death year, so the UK term cannot be checked`);
    if (who.died + 70 >= year) throw new Error(`${entry.slug}: ${who.name} died in ${who.died}, so the UK term runs to 31 December ${who.died + 70}; the finding "uk: pd" is wrong`);
    reasons.push(`${who.name} died ${who.died}: UK term ended 31 December ${who.died + 70}`);
  }
  if (!Number.isFinite(entry.published)) throw new Error(`${entry.slug}: no publication year, so the US term cannot be checked`);
  if (entry.published + 95 >= year) throw new Error(`${entry.slug}: published ${entry.published} is not before ${year - 95}, so the date alone cannot confirm "us: pd"`);
  reasons.push(`published ${entry.published}, before ${year - 95}: public domain in the US`);
  return reasons;
}

export const bookPath = slug => join(BOOKS, `${slug}.json`);
export const readBook = slug => JSON.parse(readFileSync(bookPath(slug), 'utf8'));

/** The book file's text: the head and each chapter's fields pretty-printed, every paragraph on one line of its own,
    so the file diffs by paragraph when a book is rebuilt and stays well under the size a page loads in one go. */
export function bookJson(book) {
  const { chapters, ...head } = book;
  const out = ['{'];
  for (const [k, v] of Object.entries(head)) out.push(` ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  out.push(' "chapters": [');
  chapters.forEach((c, i) => {
    const { paragraphs, ...fields } = c;
    out.push('  {');
    for (const [k, v] of Object.entries(fields)) out.push(`   ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
    out.push('   "paragraphs": [');
    paragraphs.forEach((p, j) => out.push(`    ${JSON.stringify(p)}${j < paragraphs.length - 1 ? ',' : ''}`));
    out.push('   ]', `  }${i < chapters.length - 1 ? ',' : ''}`);
  });
  out.push(' ]', '}');
  return out.join('\n') + '\n';
}

export function writeBook(book) {
  mkdirSync(BOOKS, { recursive: true });
  writeFileSync(bookPath(book.slug), bookJson(book));
}

/** One shelf entry per built book, in shelf order: the data contract's { slug, title, author, year, words, chapters,
    terms }, plus the era, the translator and the paragraph count, which a shelf card can show. */
export function indexEntry(book) {
  const paragraphs = book.chapters.flatMap(c => c.paragraphs);
  return {
    slug: book.slug, title: book.title, author: book.author.name, translator: book.translator?.name || null,
    year: book.work.published, era: book.era,
    words: paragraphs.reduce((n, p) => n + wordCount(p.text), 0),
    chapters: book.chapters.length, paragraphs: paragraphs.length,
    terms: paragraphs.reduce((n, p) => n + p.terms.length, 0),
    generated: book.generated,
  };
}

export function writeIndex() {
  const books = SHELF.filter(b => existsSync(bookPath(b.slug))).map(b => indexEntry(readBook(b.slug)));
  mkdirSync(DATA, { recursive: true });
  writeFileSync(INDEX, JSON.stringify({ generated: new Date().toISOString(), books }, null, 1) + '\n');
  return books;
}
