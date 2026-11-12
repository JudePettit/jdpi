// The Bibliotheca shelf: the public-domain books NEO CLASSIC reads, one entry each, with everything the build needs
// to fetch, split and tag a book, the rights finding that lets PRP redistribute it, and the tagging decisions a human
// took after reading the tagger's report. This file is the one place a book is described; the scripts read it.
//   build-book.mjs  downloads the Gutenberg text, cuts its boilerplate, splits chapters and paragraphs, tags, writes
//   tag-terms.mjs   re-tags a built book in place (after a decision is added here) and prints the report again
// Built files: bibliotheca/data/books/<slug>.json (the data contract is in build-book.mjs) and bibliotheca/data/index.json.
// The books share one lake: the entities a book's cast feeds it (cast.mjs; the Prince's brought Africa, Asia, Sicily,
// Septimius Severus and the Kingdom of Naples) are terms of every book that names them, and a decision here may name
// one (Smith's and Gibbon's Kingdom of Naples is the Prince's cast's). So a cast record dropped, moved to another
// entity or made book-only changes the other books' terms at their next re-tag, and a decision naming an entity no
// cast or module feeds any longer stops tag-terms.mjs: after a change to a cast, re-tag every book and read the counts.
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
// The most a book file may weigh: the page loads a book in one go. The largest on the shelf is a volume of Gibbon,
// text and notes whole; build-book.mjs stops over it and the data test checks every file. Volume II is 1.94 MB with
// its terms, and a term costs some 50 bytes: a cast of Gibbon's own, thousands of terms more, needs that volume split
// or the terms' labels shortened first.
export const MAX_BYTES = 2 * 1024 * 1024;

// Tagging decisions that leave strings untagged (decisions below): untag('Italy', 'Greece') is { Italy: null, Greece: null }.
const untag = (...names) => Object.fromEntries(names.map(n => [n, null]));
// Present-day states the lake has under their exact names, which the tagger therefore lets through whatever the book's
// era, and which every book here written before 1900 uses for something older: a region, a Roman province, a colony,
// a kingdom gone since (the Prince's Italy and Greece). The data test would refuse most of them (first dated after
// the text); those it would let pass (Libya 1551, Netherlands 1795) are as wrong. A book that means one of these as the
// lake has it, or has a better entity for it, says so in its own decisions instead.
const LATER_STATES = ['Italy', 'Greece', 'Egypt', 'Syria', 'Armenia', 'India', 'Cyprus', 'Ireland', 'Israel', 'Libya',
  'Mauritania', 'Yemen', 'Albania', 'Jordan', 'Lebanon', 'Iran', 'Turkey', 'Malta', 'Morocco', 'Oman', 'Ethiopia',
  'Croatia', 'Lithuania', 'Finland', 'Iceland', 'Norway', 'Senegal', 'Mauritius', 'Maldives', 'Grenada', 'Dominica',
  'Guyana', 'Peru', 'Ukraine', 'Netherlands', 'Austria', 'Niger', 'New Zealand', 'Guinea', 'Madagascar', 'Australia',
  'South Africa', 'Panama', 'Cape Verde', 'Seychelles', 'Faroe Islands', 'Cameroon', 'Solomon Islands', 'Jamaica',
  'Cuba', 'Angola', 'Germany', 'France'];

/* Rights. A book is written only when both `us` and `uk` say "pd", and build-book.mjs also checks that the dates
   bear the finding out (checkRights below): in the UK copyright lasts until 70 years after the death of the author,
   and of the translator for a translation (CDPA s.12), and of anyone else whose words an edition carries (`editors`:
   an editor's notes and introduction, a preface), so a death year d means public domain from 1 January d + 71;
   in the US a work published before 1978 is in the public domain at most 95 years after its publication: that is the
   longest term any of them can have, and only those published from 1923 that were still protected in 1998 had it
   (the 1998 extension); earlier ones ran out sooner, a 1908 publication by 31 December 1983 at the latest (28 years
   and a renewal, extended to 75 in all). So a publication year before this year − 95 is a safe test; a later one
   fails it whatever its true term, so no book published after 1977 is cleared by its date alone (Cornell, "Copyright
   Term and the Public Domain"). `basis` says it in words, `checked` is the day the finding was made. The research
   report behind these findings is the Bibliotheca feasibility report of 30 October 2026. */

/* The History of the Decline and Fall of the Roman Empire, in six volumes: one book file each (decline-and-fall-1 …
   -6), which `set` ties into one work, described once here. The edition is Henry Hart Milman's (1838–39, revised 1845),
   with the notes of Gibbon, of François Guizot ("G.") and F. A. W. Wenck ("W."), both translated by Milman, and his
   own ("M."); in Chapter XLIV, on the Roman law, "W." is L. A. Warnkönig, whose notes to the French translation of the
   chapter (Liège, 1821) Milman inserted, two of them Gustav Hugo's ("Hugo.—W."), and the chapter opens on Milman's own
   note on his sources, set apart from Gibbon's first paragraph (volume IV's `fix`, `editors` and `carries`). Project
   Gutenberg #731–736, the 1996 set made with every note (the file of the complete work, #25717,
   says so; the 1997 set, #890–895, has no notes in its first five volumes, and #25718 and #25719 are other books).
   The Gutenberg volumes divide the 71 chapters as Milman's do: I–XV, XVI–XXVI, XXVII–XXXVIII, XXXIX–XLVIII, XLIX–LVIII,
   LIX–LXXI (Gibbon's quartos ended the first volume at XVI and the fifth at LVII). Each volume's `work.published` is the
   latest year its chapters first appeared (I–XV in 1776; XVI–XXXVIII in 1781, though XVI closed the quarto of 1776;
   the rest in 1788), the year the era rule tags it by; its era is the span its chapters narrate.
   The layout: a volume's text starts after its contents list (`start`), its chapters are numbered by Gibbon through
   the six (n = 1–71), and each opens on a heading block of the Gutenberg's short title ("Chapter V: Sale Of The Empire
   To Didius Julianus.—Part I.") and then Gibbon's own long title, which is the title kept (in sentence case, by his
   own usage: "Public sale of the empire to Didius Julianus by the Prætorian guards—Clodius Albinus in Britain …").
   The Gutenberg cuts every chapter into parts ("Part II", "Part III" …) that are no divisions of Gibbon's; they are
   joined again. The notes stand after the paragraph that cites them as "12 (return) [ … ]", running over blocks to the
   closing bracket when a later editor's note follows Gibbon's, and the paragraph has "12" (or "12a") standing on its
   own: both become "[12]". Their numbers are the edition's (Gibbon's through each chapter, the editors' insertions
   numbered after the note they follow: 82 then 821), so a reference such as Milman's "see Gibbon, note 16 to chap. L"
   still finds its note. No block is verse: the files' few indented blocks are quotations rewrapped as prose. */
const GIBBON = {
  author: { name: 'Edward Gibbon', qid: 'Q161841', born: 1737, died: 1794 },
  editors: [
    { name: 'H. H. Milman', died: 1868, role: 'editor: notes and preface (1838–39, revised 1845), with his translations of Guizot’s and Wenck’s notes' },
    { name: 'François Guizot', died: 1874, role: 'notes to his French edition (1812), translated by Milman' },
    { name: 'F. A. W. Wenck', died: 1810, role: 'notes to the German translation (1779–), translated by Milman' },
  ],
  set: { slug: 'decline-and-fall', title: 'The History of the Decline and Fall of the Roman Empire', volumes: 6 },
  published: 1845,
  chapter: { heading: /^\s*Chapter ([IVXLC]+)[:.]/, title: 'next', continued: /Part\s*([IVX]+)\.?$/, case: 'text' },
  // Tagging decisions shared by the six volumes (see the Prince's for the form); each volume adds its own, for the
  // words whose meaning moves with the centuries the volume covers (Rome, Germany, Mahomet, Athens).
  decisions: {
    ...untag(...LATER_STATES, 'Spain', 'Mexico', 'Brazil', 'Canada', 'Romania'),
    // Gibbon's own day, which his text and his notes compare: France is the kingdom of 1788, Hungary the Habsburg
    // kingdom (not the republic the lake has under the bare word), the Swiss the Old Confederacy.
    France: 'Q70972',
    Hungary: 'Q171150',
    Switzerland: 'Q435583', Swiss: 'Q435583',
    // "The second, or German Empire of the West" is Charlemagne's and the Ottos', not the empire of 1871.
    'German Empire': 'Q12548',
    // Places the lake's match gets wrong here: Byzantium is the city before Constantine, not the empire named after
    // it; Caledonia, Alba and "Scot" are the Roman north of Britain and its people, not the kingdom of 843; "Saxony" is
    // Charlemagne's and the Saxons', not the Electorate; "Man" is Beausobre's "Hist. de Man[ichée]"; "States" is not the
    // United States, nor Valencia the modern region, nor Tonquin (Tonkin) the French protectorate; Neapolis is Sichem
    // (Nablus) or the Neapolis of Cyprus, not Naples, which Gibbon calls Naples.
    ...untag('Byzantium', 'Caledonia', 'Alba', 'Scot', 'Saxony', 'Man', 'States', 'Valencia', 'Tonquin', 'Tonkin', 'Neapolis'),
    // "The kingdom of Naples" is the Kingdom (Gibbon's own day's, or the Normans' and Angevins'), the entity the
    // Prince's cast feeds the lake; the bare "Naples" is the city as often, and is left to the lake.
    'kingdom of Naples': 'Q173065',
    // Namesakes of the lake's entities: Saint-Martin, the orientalist of Milman's notes ("St. Martin note to Le Beau");
    // the emperor Zeno and Zeno the Stoic, not Zeno of Elea; Hero and Leander; bishop Eudoxus; Olof Celsius the
    // runologist; T. S. Bayer the orientalist, not the company; the promontory Capella; William von Humboldt; the
    // Trinity, Unity and Independence of the text, not a nuclear test and two parties; Ceres the goddess, not the
    // dwarf planet; the "Tenth"; Hume's "Natural History" of Religion; geographies that are other men's books.
    ...untag('St. Martin', 'Zeno', 'Hero', 'Eudoxus', 'Celsius', 'Bayer', 'Capella', 'Humboldt', 'Republic', 'Trinity',
      'Unity', 'Independence', 'Morena', 'Colossus', 'Ceres', 'Tenth', 'Natural History', 'Geography', 'Geographia'),
    // The notes' "Elements" are Heineccius' of Germanic and civil law, Taylor's of civil law and Watson's of chemistry,
    // never Euclid's.
    ...untag('Elements'),
    // Antiochus is half a dozen Seleucid kings and imperial officials, not Antiochus III alone; Alexander III is the
    // pope of 1159; the Two Sicilies are the medieval kingdom, not the Bourbons' of 1816 (a string left untagged is
    // left whole, so the lake's alias "Sicilies" inside it is not a term either: tag-terms.mjs).
    ...untag('Antiochus', 'Alexander III', 'Two Sicilies'),
    // "Oxon." in a reference is Oxford as a place of printing, and the lake's alias would end a term on its full stop.
    ...untag('Oxon.'),
  },
};
const VOLUME = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const toRoman = n => [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  .reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
// `editors` and `carries`: others whose words one volume alone carries, and the clause of the rights finding that names
// them (volume IV's chapter XLIV has Warnkönig's notes, and Hugo's through him).
function gibbon(volume, { gutenberg, first, count, start, written, published, appeared, era, front, fix, lower, drop, editors = [], carries = '', decisions = {} }) {
  const [a, b] = [first, first + count - 1].map(toRoman);
  return {
    slug: `decline-and-fall-${volume}`,
    title: `The History of the Decline and Fall of the Roman Empire, Volume ${VOLUME[volume]}`,
    author: { ...GIBBON.author },
    translator: null,
    editors: [...GIBBON.editors, ...editors].map(e => ({ ...e })),
    set: { ...GIBBON.set, volume },
    work: { qid: 'Q313030', written, published },
    era,
    gutenberg,
    published: GIBBON.published,
    edition: `H. H. Milman’s edition, volume ${volume} of 6`,
    rights: {
      us: 'pd', uk: 'pd',
      basis: `Edward Gibbon died on 16 January 1794 and the editor Henry Hart Milman on 24 September 1868; the edition also carries `
        + `the notes of François Guizot (died 1874) and F. A. W. Wenck (died 1810), which Milman translated${carries ? `, ${carries}` : ''}, so the last UK term (life plus `
        + `70 years, CDPA s.12) ended on 31 December 1944. This volume’s chapters (${a}–${b}) were first published in ${appeared}, and Milman’s `
        + 'edition in 1838–39, revised in 1845 (the text here: his preface is dated June 1845); every work published before 1931 is in the '
        + 'public domain in the United States. Project Gutenberg #731–736 are the six volumes with the notes (the file of the complete work, '
        + '#25717, says so); #890–895 are a second set with no notes in its first five volumes, and #25718 and #25719 are other books. The '
        + 'Project Gutenberg licence allows the text to be used freely once its header, footer and licence are removed '
        + '(gutenberg.org/policy/license.html).',
      checked: '2026-10-31',
    },
    layout: {
      start, ...(fix ? { fix } : {}), ...(front ? { front } : {}), ...(lower ? { lower } : {}), ...(drop ? { drop } : {}),
      chapter: { ...GIBBON.chapter, first, count },
      notes: 'return', verse: false, indent: 6,
    },
    decisions: { ...GIBBON.decisions, ...decisions },
  };
}

/* An Inquiry into the Nature and Causes of the Wealth of Nations, in its first edition's two volumes (Books I–III, Books
   IV–V; London: W. Strahan and T. Cadell, 9 March 1776): one book file each (wealth-of-nations-1, -2) tied by `set`,
   since the whole, 380,000 words, is more than one file may weigh (MAX_BYTES) however it is set. The edition is
   Project Gutenberg eBook #3300, which does not name the printing it was made from; it has the chapter Smith added to
   the third edition of 1784 (Book IV, Chapter VIII), so it is that edition's text or a later one's, and no editor's
   introduction or notes. The work's era runs from the Peace of Paris (1763), which ended "the late war" the book keeps
   returning to, to its publication.
   The layout: five books of chapters numbered within each (n = book × 100 + chapter: Book I, Chapter X is 110, unique
   across the two volumes), every line of the text indented six spaces. "BOOK II." and "CHAPTER I." stand flush left
   with their titles in capitals on the lines after them. Books II and IV open with an introduction of their own (200,
   400; Book II's is headed "INTRODUCTION.", Book IV's is not). The parts, articles and digressions inside chapters
   (Book I, Chapter XI's "Digression concerning the variations in the value of silver", Book V's "Part III … Article
   I") are paragraphs of their chapters. The tables of the prices of wheat at the end of Book I, and the accounts of the
   appendix, keep their lines; the file heads the first "# PRICES OF WHEAT", its only "#". */
function smith(volume, { start, end, parts, chapters, sections }) {
  return {
    slug: `wealth-of-nations-${volume}`,
    title: `The Wealth of Nations, Volume ${VOLUME[volume]}`,
    author: { name: 'Adam Smith', qid: 'Q9381', born: 1723, died: 1790 },
    translator: null,
    set: { slug: 'wealth-of-nations', title: 'The Wealth of Nations', volume, volumes: 2 },
    work: { qid: 'Q233562', written: 1776, published: 1776 },
    era: [1763, 1776],
    gutenberg: 3300,
    published: 1784,
    rights: {
      us: 'pd', uk: 'pd',
      basis: 'Adam Smith died on 17 July 1790, so the UK term (life plus 70 years, CDPA s.12) ended on 31 December 1860. The Wealth of '
        + 'Nations was first published in 1776, in two volumes (London: W. Strahan and T. Cadell), the division kept here; this text has '
        + 'the chapter Smith added to the third edition of 1784 (Book IV, Chapter VIII, "Conclusion of the mercantile system"), and every '
        + 'work published before 1931 is in the public domain in the United States. The Gutenberg file does not name the printing it was '
        + 'made from, but it carries no editor’s introduction or notes: the words are Smith’s alone. The Project Gutenberg licence allows '
        + 'the text to be used freely once its header, footer and licence are removed (gutenberg.org/policy/license.html).',
      checked: '2026-10-31',
    },
    layout: {
      ...(start ? { start } : {}), ...(end ? { end } : {}),
      indent: 6,
      fix: [['      # PRICES OF WHEAT', '      PRICES OF WHEAT']],
      sections,
      part: { heading: /^BOOK ([IVX]+)\.$/, label: 'Book', title: 'block', count: parts },
      chapter: { heading: /^CHAPTER ([IVXL]+)\.$/, title: 'block', within: true, count: chapters },
      intro: { title: 'Introduction', drop: /^\s*INTRODUCTION\.$/ },
      tables: true,
    },
    // Tagging decisions (see the Prince's for the form).
    decisions: {
      ...untag(...LATER_STATES, 'Mexico', 'Brazil', 'Canada', 'Paraguay', 'Georgia'),
      // Smith's Europe of 1776: France is the kingdom, Germany the Empire's lands, Prussia the kingdom of 1701, Hungary
      // the Habsburg kingdom, Switzerland the Old Confederacy, Turkey the Ottoman Empire; his Rome is ancient Rome.
      // (Georgia, Canada, Brazil, Mexico and Paraguay are colonies here, not the states of the lake's records.)
      France: 'Q70972', Germany: 'Q12548', Prussia: 'Q27306', Hungary: 'Q171150',
      Switzerland: 'Q435583', Swiss: 'Q435583', Turkey: 'Q12560', Rome: 'Q1747689',
      // "Man" is not the Isle of Man; St Augustine's is the abbey at Canterbury; Alexander III is the king of Scots;
      // Zeno of Citium, not of Elea (whom Smith names in full); Tonquin is not the French protectorate.
      ...untag('Man', 'St Augustine', 'Alexander III', 'Zeno', 'Tonquin'),
      // Smith's Naples is the Kingdom ("the expedition of Charles VIII. to Naples", "the kingdom of Naples"), which the
      // Prince's cast feeds the lake; the lake's bare word was the city.
      Naples: 'Q173065',
    },
  };
}

/* Böhm-Bawerk's Kapital und Kapitalzins in William Smart's translation: Capital and Interest (the history and criticism of
   the theories, 1884; London, 1890) and The Positive Theory of Capital (1889; London, 1891). Neither is on Project
   Gutenberg, so the text is the Internet Archive's scan of the University of Toronto's copy (`scan`), its OCR checked
   word by word against Econlib's transcription of the same edition (`econlib`, its pages `files`), which says "The text
   of this edition is in the public domain", and against the OCR of a second copy (`witness`: Harvard's copy of the 1890
   edition, scanned by Google; Duke's copy of the 1923 reprint): bibliotheca/scripts/scan-text.mjs aligns them, keeps
   the scan's word where it and Econlib agree, Econlib's where the OCR misread, and the scans' where both read a word
   Econlib's own OCR got wrong ("aides" for "sides", "œ100" for "£100") or dropped; and it takes the
   chapters, paragraphs, the notes and their marks from Econlib's pages, leaving out Econlib's own matter (its
   bracketed editorial notes and cross-references, its links and headings). The edition's notes, numbered on each
   page, run 1, 2 … through each chapter here, each after the paragraph that cites it; Smart's are signed "W. S.". The
   two books' rights finding is one: Böhm-Bawerk and Smart died in 1914 and 1915. `copy` and `printing` say which copy
   was scanned and what it is ("the University of Toronto’s copy of the London edition", "Macmillan, 1890");
   `second` is the second copy, and what its record says of its rights (the Internet Archive's records of the two
   Toronto scans give no copyright status: the books are free by the dates alone). */
function bohmBawerk({ slug, title, work, era, published, edition, scan, econlib, files, pages, witness, cut, fix, copy, printing, second, sections, books, chapters, proper, lower, decisions }) {
  return {
    slug, title,
    author: { name: 'Eugen von Böhm-Bawerk', qid: 'Q311535', born: 1851, died: 1914 },
    translator: { name: 'William Smart', died: 1915 },
    work, era, published, edition,
    scan: {
      id: scan, econlib: `https://www.econlib.org/library/BohmBawerk/${econlib}.html`, files, pages, witness, ...(cut ? { cut } : {}), ...(fix ? { fix } : {}),
      licence: `Internet Archive scan ${scan}, ${copy} (${printing}), `
        + `its OCR checked word by word against Econlib’s transcription of the same edition (econlib.org/library/BohmBawerk/${econlib}.html), `
        + `which states that the text of this edition is in the public domain, and against the OCR of a second copy (archive.org/details/${witness}). `
        + 'The words are the edition’s; Econlib’s own notes, links and layout are not used.',
    },
    rights: {
      us: 'pd', uk: 'pd',
      basis: 'Eugen von Böhm-Bawerk died on 27 August 1914 and the translator William Smart on 19 March 1915 (Edwin Cannan’s obituary '
        + 'of him, Economic Journal, 1915), so the last term in Ireland and the UK (life plus 70 years: Copyright and Related Rights Act '
        + `2000, s.24; CDPA s.12) ended on 31 December 1985. ${published === 1890 ? 'Smart’s translation was published in London by Macmillan in 1890'
          : `Smart’s translation was published in London by Macmillan in 1891 and reprinted in New York by G. E. Stechert in ${published}, the printing scanned here`}, `
        + 'and every work published before 1931 is in the public domain in the United States. The text is from the Internet Archive’s '
        + `scan of ${copy} (archive.org/details/${scan}), whose record gives no copyright status, read against a second copy `
        + `(archive.org/details/${witness}), ${second}; Econlib, whose `
        + 'transcription the OCR was checked against, says that the text of this edition is in the public domain, and none of Econlib’s own '
        + 'matter is used.',
      checked: '2026-11-07',
    },
    layout: {
      sections,
      part: { heading: /^BOOK ([IVX]+)$/, label: 'Book', title: 'block', count: books },
      chapter: { heading: /^CHAPTER ([IVX]+)$/, title: 'block', within: true, count: chapters },
      // tables of every size, Carey's of one row too (build-book.mjs): scan-text.mjs sets the cells of Econlib's
      // tables in columns, in a quotation or a note as well
      notes: 'bracket', verse: false, tables: 'rows', ...(proper ? { proper } : {}), ...(lower ? { lower } : {}),
    },
    // Tagging decisions (see the Prince's for the form), the two books' and each one's own.
    decisions: {
      ...untag(...LATER_STATES),
      // The economists by the names the books give them, which the lake has in full only. Smith is Adam Smith in
      // both; the bare "Say" is left alone, since a sentence may open on the verb ("Say, then, that …"), and so is
      // "Mill" (James Mill in Book V of the history, J. S. Mill elsewhere); the Physiocrats are physiocracy.
      'Böhm-Bawerk': 'Q311535', Smith: 'Q9381', Ricardo: 'Q160270', Malthus: 'Q13526', Marx: 'Q9061', Menger: 'Q84177',
      Hume: 'Q37160', Bentham: 'Q60887', Quesnay: 'Q13575', Locke: 'Q9353', Proudhon: 'Q5749', 'J. B. Say': 'Q13513',
      Physiocrats: 'Q183244', physiocrats: 'Q183244', Grotius: 'Q154959',
      // Böhm-Bawerk's Rome is the ancient city and its law, his Great Britain the United Kingdom of his day; England
      // in the 1880s has no entry of its time (the lake's is the kingdom of 927–1707). "Man" is mankind, not the Isle;
      // "Elements" are other men's books (Elements of Political Economy); Brutus, John Murray (the publisher) and
      // Walker (Francis A. Walker, the economist) are not the lake's Samuel Morse, John Murray and John Walker.
      Rome: 'Q1747689', 'Great Britain': 'Q174193',
      ...untag('England', 'Man', 'Elements', 'Élements', 'Brutus', 'John Murray', 'Walker'),
      ...decisions,
    },
  };
}

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
      // The Master Index's "Republic" is a party founded in 2021, let through by its exact name; in this book a
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
      // The book's own names for people and a state its cast feeds the lake without them ("local" in the cast's
      // overrides, bibliotheca/data/cast/the-prince.json), since elsewhere they mean others: San Giorgio, Cardinal
      // Raffaele Riario's title (a church, a bank, a place elsewhere); Cyrus the Great (Thucydides' is Cyrus the Younger,
      // Gibbon's a river and a bishop); Antiochus III (half a dozen Seleucids in Gibbon); Braccio da Montone; and Naples,
      // every time the Kingdom of Naples ("the kingdom of Naples", "the King of Naples"), not the city.
      'San Giorgio': 'Q966188',
      Cyrus: 'Q8423',
      Antiochus: 'Q3365',
      Braccio: 'Q896536',
      Naples: 'Q173065',
    },
  },
  {
    slug: 'peloponnesian-war',
    title: 'The History of the Peloponnesian War',
    author: { name: 'Thucydides', qid: 'Q41683', born: -460, died: -395 },
    translator: { name: 'Richard Crawley', died: 1893 },
    // The work: begun "at the moment that it broke out" (431 BC), left unfinished in the twenty-first year of the war
    // and known after the author's death, about 400 BC. Its era is the war as the book narrates it, from 431 to the
    // winter of 411 BC where the text breaks off (Book I's look back to the Trojan war is a preface to it).
    work: { qid: 'Q639493', written: -431, published: -400 },
    era: [-431, -411],
    // The edition: Crawley's translation (Book I, Oxford: James Parker, 1866; the whole, London: Longmans, Green,
    // 1874), Project Gutenberg eBook #7142, whose header names him ("Translator: Richard Crawley").
    gutenberg: 7142,
    published: 1874,
    rights: {
      us: 'pd', uk: 'pd',
      basis: 'Thucydides died about 395 BC, and the translator Richard Crawley on 30 March 1893, so the UK term of the translation '
        + '(life plus 70 years, CDPA s.12) ended on 31 December 1963. Crawley published his first book in 1866 (Oxford: James Parker) '
        + 'and the whole in 1874 (London: Longmans, Green), and every work published before 1931 is in the public domain in the United '
        + 'States. The Gutenberg file’s header names the translator ("Translator: Richard Crawley"). The Project Gutenberg licence '
        + 'allows the text to be used freely once its header, footer and licence are removed (gutenberg.org/policy/license.html).',
      checked: '2026-10-31',
    },
    // Eight books of 26 chapters numbered once through (Book II opens with Chapter VI), each heading alone on its line
    // ("BOOK II", "CHAPTER VI"), the chapter's title in the block after it, in Crawley's own capitals. Crawley's
    // dedication to Connop Thirlwall is the translator's and is left out with the title page; "THE END" closes the book.
    // The file's title of Chapter XI has lost its first word: the chapter runs from the end of the fifth year to "and
    // with it ended the sixth year of this war", and Crawley's title is "Sixth Year of the War—Campaigns of
    // Demosthenes in Western Greece—Ruin of Ambracia". (The closing bracket of the book's last sentence, an editor's
    // addition, loses the space before it.)
    layout: {
      fix: [['\nYear of the War—Campaigns of Demosthenes', '\nSixth Year of the War—Campaigns of Demosthenes'], ['will be completed. ]', 'will be completed.]']],
      part: { heading: /^BOOK ([IVX]+)$/, label: 'Book', title: 'none', count: 8 },
      chapter: { heading: /^CHAPTER ([IVXL]+)$/, title: 'next', count: 26 },
      end: /^THE END$/,
    },
    // Tagging decisions (see the Prince's for the form).
    decisions: {
      // Egypt, which revolted from Artaxerxes, is Ancient Egypt; Samos is the polis of Samos (the lake's "Ancient
      // Samos"), not the island's modern municipality the bare word would reach. Italy (Magna Graecia), Libya (Africa
      // west of Egypt), Cyprus, Ethiopia and the village of Polis are not the lake's states and idea; Hellas, its
      // Greece of 1821, the era rule already skips.
      Egypt: 'Q11768',
      Samos: 'Q13580795',
      ...untag('Italy', 'Libya', 'Cyprus', 'Ethiopia', 'polis', 'Neapolis'),
      // Athenians and Spartans who share a famous name: Hippocrates son of Ariphron, Hipparchus son of Pisistratus,
      // Lycophron the Spartan commissioner, Alcmaeon son of Amphiaraus, Aristotle son of Timocrates, Paches son of
      // Epicurus, Socrates son of Antigenes, Xenophon son of Euripides. (Homer and Thucydides himself are who the lake
      // says.) The village of Polis is the lake's idea "polis" (an idea's name matches in any case, so the decision is
      // the lower-case word) and Neapolis in Thrace is not Naples.
      ...untag('Hippocrates', 'Hipparchus', 'Lycophron', 'Alcmaeon', 'Aristotle', 'Epicurus', 'Socrates', 'Xenophon'),
    },
  },
  {
    slug: 'origin-of-species',
    title: 'On the Origin of Species',
    author: { name: 'Charles Darwin', qid: 'Q1035', born: 1809, died: 1882 },
    translator: null,
    // The work: first published on 24 November 1859. Its era runs from the voyage of the Beagle, where the book's first
    // observations were made (its Introduction begins there), to this sixth edition.
    work: { qid: 'Q20124', written: 1859, published: 1859 },
    era: [1831, 1872],
    // The edition: the sixth (London: John Murray, 1872), "with all additions and corrections", the last Darwin
    // revised: Project Gutenberg eBook #2009, which says so in a note of its own before the title page.
    gutenberg: 2009,
    published: 1872,
    edition: 'the sixth edition',
    rights: {
      us: 'pd', uk: 'pd',
      basis: 'Charles Darwin died on 19 April 1882, so the UK term (life plus 70 years, CDPA s.12) ended on 31 December 1952. This is the '
        + 'sixth edition (London: John Murray, 1872), the last Darwin revised, and every work published before 1931 is in the public domain '
        + 'in the United States. The words are Darwin’s: the glossary W. S. Dallas compiled for this edition and the index are not part of '
        + 'the book here. The Project Gutenberg licence allows the text to be used freely once its header, footer and licence are removed '
        + '(gutenberg.org/policy/license.html).',
      checked: '2026-10-31',
    },
    // Fifteen chapters ("CHAPTER I." with its title in capitals on the next line; then the chapter's argument, a list of
    // its topics, which is the chapter's first paragraph). Before chapter I come Darwin's three epigraphs, the
    // historical sketch he added in 1861 and his Introduction, which share chapter 0 under their own headings. The
    // file's note on its editions and the title page go (`start`), so do the contents, the detailed contents and the
    // half-title between the sketch and the Introduction (`skip`), and the book ends before Dallas's glossary and the
    // index of page numbers this text does not have (`end`). The sketch's three footnotes are set as Marriott's are
    // ("[1] …"); its one indented block is Darwin's own aside, prose, so no block is verse.
    layout: {
      start: /^“But with regard to the material world/,
      skip: [{ from: /^Contents$/, to: /^ORIGIN OF SPECIES\.$/ }, { from: /^ORIGIN OF SPECIES\.$/, to: /^INTRODUCTION\.$/ }],
      end: /^GLOSSARY OF THE PRINCIPAL SCIENTIFIC TERMS USED IN THE PRESENT VOLUME/,
      front: {
        title: 'Historical sketch and introduction',
        pieces: [
          { heading: /^AN HISTORICAL SKETCH OF THE PROGRESS OF OPINION ON THE ORIGIN OF/, title: 'An historical sketch of the progress of opinion on the origin of species, previously to the publication of the first edition of this work' },
          { heading: /^INTRODUCTION\.$/, title: 'Introduction' },
        ],
      },
      chapter: { heading: /^CHAPTER ([IVXL]+)\.$/, title: 'block', count: 15 },
      notes: 'bracket', verse: false,
    },
    // Tagging decisions (see the Prince's for the form).
    decisions: {
      ...untag(...LATER_STATES),
      // Darwin's Italy and Great Britain are the kingdoms of his day (1861, and the United Kingdom of 1801), not the
      // republic of 1946 and the kingdom of 1707–1800; his England (not the kingdom of 927–1707) and Saxony (not the
      // Electorate) have no entry of their time, nor his Brazil, Mexico and Canada any need to be refused (1822, 1821, 1867).
      Italy: 'Q172579',
      'Great Britain': 'Q174193',
      ...untag('England', 'Saxony'),
      // "Man", Darwin's mankind ("Man's power of selection"), is not the Isle of Man; "Caledonia" is New Caledonia;
      // "States" is not the United States (the full name is); "Mexican" is no language; Prion is a genus of petrels (the
      // lake's "prion" is a topic, whose name matches in any case, so the decision is the lower-case word).
      ...untag('Man', 'Mann', 'Caledonia', 'States', 'Mexican', 'prion', 'Unity', 'Natural History'),
      // Namesakes: Elias Fries the botanist, Colonel Hamilton Smith.
      ...untag('Fries', 'Hamilton'),
    },
  },
  smith(1, {
    // Smith's Introduction and Plan of the Work (0) and Books I–III; the volume ends where Book IV begins.
    end: /^BOOK IV\.$/, parts: 3, chapters: 20,
    sections: [{ heading: /^INTRODUCTION AND PLAN OF THE WORK\.$/, n: 0, title: 'Introduction and plan of the work' }],
  }),
  smith(2, {
    // Books IV and V, and the appendix Smith added to Book IV in 1784 (the accounts of the herring bounty), which
    // follows its last chapter as a chapter of its own (499: book × 100 + 99).
    start: /^BOOK IV\.$/, parts: 2, chapters: 12,
    sections: [{ heading: /^\s*APPENDIX TO BOOK IV$/, n: 499, title: 'Appendix', part: true }],
  }),
  gibbon(1, {
    gutenberg: 731, first: 1, count: 15, written: 1775, published: 1776, appeared: '1776 (London: W. Strahan and T. Cadell)',
    // From the age of Trajan and the Antonines to the reunion of the empire under Constantine (324).
    era: [98, 324],
    // Rome, to 476, is Ancient Rome (the lake's bare "Rome" is the Republic alone); Germany is the barbarians' Germania.
    // Moses is more often Moses of Chorene, the historian of Armenia, than the lawgiver; "Marcus Aurelius Antoninus" is
    // Marcus Aurelius as often as Caracalla, whose name the lake files it under. The bare "Severus" is Septimius Severus
    // most often, but a quarter of the time "Alexander [Severus]" (Severus Alexander), Severus II, the Caesar of
    // chapter XIV, or the historian Sulpicius Severus, so it is left untagged here as in the later volumes; "Septimius
    // Severus" in full is still a term. Cyrus is the founder of Persia every time in this volume ("the empire of
    // Cyrus", Xerxes "the descendant of Cyrus"), a name the Prince's cast feeds the lake without (the later volumes'
    // Cyrus are others).
    decisions: { Rome: 'Q1747689', Germany: null, Moses: null, 'Marcus Aurelius Antoninus': null, Severus: null, Cyrus: 'Q8423' },
    // After the contents: the editor's preface and Gibbon's three share chapter 0 (the Gutenberg heads them all
    // "Introduction", a label of its own that goes). Chapter I's long title is the file's "Introduction." block and
    // the title after it, joined as Milman prints them. Three words of the long titles are broken in the file, in its
    // contents and again at the chapter: "Barbari Ans" (X), "Maxen Tius" and "Licinus" (XIV, for Licinius).
    start: /^ {6}Preface By The Editor\.$/,
    front: {
      title: 'Prefaces',
      pieces: [
        { heading: /^\s*Preface By The Editor\.$/, title: 'Preface by the editor' },
        { heading: /^\s*Preface Of The Author\.$/, title: 'Preface of the author' },
        { heading: /^\s*Preface To The First Volume\.$/, title: 'Preface to the first volume' },
        { heading: /^\s*Preface To The Fourth Volume Of The Original Quarto Edition\.$/, title: 'Preface to the fourth volume of the original quarto edition' },
      ],
    },
    fix: [
      ['      Introduction.\n\n     The Extent And Military Force', '     Introduction.—The Extent And Military Force'],
      ['Barbari Ans', 'Barbarians', 2], ['Maxen Tius', 'Maxentius', 2], ['\n     Licinus.—Reunion', '\n     Licinius.—Reunion', 2],
    ],
  }),
  gibbon(2, {
    gutenberg: 732, first: 16, count: 11, written: 1781, published: 1781, appeared: '1776 (Chapter XVI) and 1781',
    // From Constantine's accession (306) to the Goths' victory at Adrianople (378); Chapter XVI looks back to Nero.
    era: [306, 378],
    start: /^ {6}Chapter XVI:/,
    // The Gutenberg's links to two pictures it chose (the HTML edition's), not Gibbon's; volume V's "[See Table 1 …]"
    // stays, since it stands where Gibbon's own table of the first crusade was (his note 41 there: "See table").
    drop: [/^\[See (Basilica Of Constantinople|The Pantheon: The severe simplicity of the Pantheon)\]$/],
    // Chapter XVII's long title has lost a word, in the contents and at the chapter: "Political system of Constantine".
    fix: [['Political System Constantine', 'Political System Of Constantine', 2]],
    // From here the cast of the Prince the lake now has is mostly other men of the same name: Severus is Sulpicius
    // Severus, Alexander Severus, Severus of Antioch; Cyrus a river, a bishop and a prefect; David of Armenia and the
    // Comneni; Moses still of Chorene. Socrates is the church historian more than the philosopher, Mahomet "Mahomet
    // the Second", Bentivoglio the cardinal and historian.
    decisions: { Rome: 'Q1747689', Germany: null, Socrates: null, Mahomet: null, ...untag('Severus', 'Cyrus', 'David', 'Moses', 'Bentivoglio') },
  }),
  gibbon(3, {
    gutenberg: 733, first: 27, count: 12, written: 1781, published: 1781, appeared: '1781',
    // From Gratian and Theodosius (378) to Clovis and the Saxon conquest of Britain (about 600).
    era: [378, 600],
    start: /^ {6}Chapter XXVII:/,
    // A verb of Chapter XXX's long title that the text, in the past tense, never has ("The Germans Overrun Gaul").
    lower: ['overrun'],
    // Chapter XXXVII's long title has lost a comma, in the contents and at the chapter: "Origin, progress, and effects".
    fix: [['Origin Progress,', 'Origin, Progress,', 2]],
    // Anthemius is the western emperor of 467, not the architect of St. Sophia (volume IV's).
    // Romulus is Romulus Augustulus, the last emperor of the West, as often as the founder (and see volume II's).
    decisions: { Rome: 'Q1747689', Germany: null, Socrates: null, Anthemius: null, ...untag('Severus', 'Cyrus', 'David', 'Moses', 'Romulus') },
  }),
  gibbon(4, {
    gutenberg: 734, first: 39, count: 10, written: 1787, published: 1788, appeared: '1788',
    // From Zeno and Theodoric (474) through Justinian to Chapter XLVIII's survey of the Greek emperors to 1204.
    era: [474, 1204],
    // Its contents list is set flush left like the text, so the text starts at the second heading of the chapter's
    // first part (the contents list has the first).
    start: { line: /^Chapter XXXIX: Gothic Kingdom Of Italy\.—Part I\.$/, nth: 2 },
    fix: [
      // Chapter XLIV opens on Milman's note on his sources, which the file runs on into Gibbon's first paragraph.
      ['distinguished by the letter W.—M. The vain titles of the', 'distinguished by the letter W.—M.\n\n      The vain titles of the'],
      // Chapter XLVI's long title, in the contents and at the chapter: "Revolutions of Persia after the death of
      // Chosroes or Nushirvan".
      ['Revolutions On Persia', 'Revolutions Of Persia', 2], ['Chosroes On Nushirvan', 'Chosroes Or Nushirvan', 2],
    ],
    // Chapter XLIV's notes on the Roman law are Warnkönig's ("W." there), two of them Hugo's, which Milman translated.
    editors: [
      { name: 'L. A. Warnkönig', died: 1866, role: 'notes to chapter XLIV, from the French translation of the chapter (Liège, 1821), translated by Milman' },
      { name: 'Gustav Hugo', died: 1844, role: 'two notes to chapter XLIV, through Warnkönig’s, translated by Milman' },
    ],
    carries: 'and in Chapter XLIV those of L. A. Warnkönig (died 1866), from the French translation of that chapter (Liège, 1821), two '
      + 'of them Gustav Hugo’s (died 1844)',
    // From here Rome is the city of the Goths, the exarchs and the popes, which the lake has no entry for (Ancient Rome
    // ends in 476), so the bare word is left untagged; the Roman Empire under its own name is still a term. Proclus is
    // four men in this volume (the Neoplatonist, Justin's quaestor, the engineer said to have burned the Gothic fleet,
    // and a bishop of Constantinople), and the lake has only the philosopher (one of Hegel's "Influenced by"), so the
    // name is left untagged like Severus and Cyrus: tagged, nine of its fourteen would be him and wrong.
    decisions: { Rome: null, Germany: null, Socrates: null, ...untag('Severus', 'Cyrus', 'David', 'Moses', 'Proclus') },
  }),
  gibbon(5, {
    gutenberg: 735, first: 49, count: 10, written: 1787, published: 1788, appeared: '1788',
    // From Mahomet's birth (570) and the worship of images to the First Crusade (1099).
    era: [570, 1099],
    start: /^ {6}Chapter XLIX:/,
    // Germany is the Empire's ("the constitution of the Germanic body"); Russia the Russians of the ninth to the
    // eleventh century, not the empire of 1721.
    decisions: { Rome: null, Germany: 'Q12548', Socrates: null, Russia: null, ...untag('Severus', 'Cyrus', 'David', 'Pope Alexander') },
  }),
  gibbon(6, {
    gutenberg: 736, first: 59, count: 13, written: 1787, published: 1788, appeared: '1788',
    // From the crusades (1096) to the fall of Constantinople and the ruins of Rome in the fifteenth century.
    era: [1096, 1500],
    start: /^ {6}Chapter LIX:/,
    // Chapter LXV's long title has lost a comma: "Georgia, Tartary, Russia, India" (the file has the title once).
    fix: [['Tartary Russia', 'Tartary, Russia']],
    // Mahomet is the prophet and the sultans Mahomet I and II; Athens the Latin duchy, not Classical Athens. The Song
    // of Chapter LXIV ("the dynasty of the Song", in italics in the file) are the Song dynasty, a word the text also
    // has in lower case.
    decisions: { Rome: null, Germany: 'Q12548', Socrates: null, Mahomet: null, Athens: null, Song: 'Q7462', ...untag('Severus', 'Cyrus', 'David') },
  }),
  {
    slug: 'on-war',
    title: 'On War',
    author: { name: 'Carl von Clausewitz', qid: 'Q76430', born: 1780, died: 1831 },
    translator: { name: 'J. J. Graham', died: 1883 },
    // Others whose words this edition carries: the author's widow, who published the work and prefaced it, and the
    // editor of the revised translation, whose introduction opens it and whose notes run through it. (The notes signed
    // "TR." are Graham's.)
    editors: [
      { name: 'Marie von Clausewitz', died: 1836, role: 'preface to the first edition (1832)' },
      { name: 'F. N. Maude', died: 1933, role: 'editor: introduction and notes to the revised edition (1908)' },
    ],
    // The work: written from 1816 to 1830 and left unrevised at the author's death; published by his widow, 1832–34.
    // Its era is the wars of the French Revolution and of Napoleon, which the book keeps returning to.
    work: { qid: 'Q1981770', written: 1830, published: 1832 },
    era: [1792, 1815],
    // The edition: Colonel J. J. Graham's translation (London: N. Trübner, 1873, from the third German edition) as revised
    // by Colonel F. N. Maude (London: Kegan Paul, Trench, Trübner, 1908): Project Gutenberg eBook #1946, whose header
    // names Graham ("Translator: J. J. Graham"; its catalogue, author 4650, is Wikidata's James John Graham, Q29584485,
    // 1808–1883). Its title page says "1874 was 1st edition of this translation. 1909 was the London reprinting."
    gutenberg: 1946,
    published: 1908,
    edition: 'J. J. Graham’s translation as revised by F. N. Maude',
    rights: {
      us: 'pd', uk: 'pd',
      basis: 'Carl von Clausewitz died on 16 November 1831 and his widow Marie, whose preface opens the first edition, on 28 January 1836; '
        + 'the translator Colonel J. J. Graham died in 1883 and the editor Colonel F. N. Maude, whose introduction and notes this revised '
        + 'edition adds, in 1933, so the last UK term (life plus 70 years, CDPA s.12) ended on 31 December 2003. Graham’s translation was '
        + 'first published in 1873 (London: N. Trübner; the Gutenberg file says 1874) and Maude’s revision of it in 1908 (London: Kegan '
        + 'Paul, Trench, Trübner; the file calls its source the London reprinting of 1909), and every work published before 1931 is in the '
        + 'public domain in the United States. Graham’s dates are those of Wikidata’s James John Graham (Q29584485, 1808–1883), whom the '
        + 'Gutenberg catalogue names as the translator. The Project Gutenberg licence allows the text to be used freely once its header, '
        + 'footer and licence are removed (gutenberg.org/policy/license.html).',
      checked: '2026-10-31',
    },
    // Five pieces before Book I, each a chapter of its own (0–4): Maude's introduction, Marie von Clausewitz's
    // preface, the author's notice of 1827 and his own introduction, and Graham's memoir of him. Then eight books of
    // chapters numbered within each (n = book × 100 + chapter), headings flush left with the title on the line
    // ("BOOK I. ON THE NATURE OF WAR", "CHAPTER III. The Genius for War", a long title running on to the next line).
    // The text starts at the second "INTRODUCTION" (the contents list has the first). Fixes: the file numbers Book
    // VI's Chapter XXII "XX" (its contents, and the order, have XXII); Books VII and VIII are headed "SKETCHES FOR BOOK
    // VII …", which the heading keeps as "(sketches)". Chapter titles stay as Graham capitalised them (War, Defence);
    // chapters XX of Book VI and III and VI of Book VIII are in two sections, A and B, the B's heading a paragraph.
    // The notes are Maude's and Graham's, "(*)" in the text and "(*) …" after it ("(**)" for a second), two of them on
    // a chapter's title (IV.IX, VII.XXII), so they come first. The Bhagavad Gita that Maude quotes keeps its lines.
    layout: {
      start: { line: /^INTRODUCTION$/, nth: 2 },
      fix: [
        ['CHAPTER XX. The Cordon', 'CHAPTER XXII. The Cordon'],
        ['SKETCHES FOR BOOK VII THE ATTACK', 'BOOK VII. THE ATTACK (SKETCHES)'],
        ['SKETCHES FOR BOOK VIII PLAN OF WAR', 'BOOK VIII. PLAN OF WAR (SKETCHES)'],
        // Four titles broken over two lines lose the dash the contents list gives them.
        ['More Precisely Defined\nOverthrow of the Enemy', 'More Precisely Defined—Overthrow of the Enemy'],
        ['More Precisely Defined (_continued_) Limited\nObject', 'More Precisely Defined (_continued_)—Limited Object'],
        ['(_continued_) Successive\nResistance.', '(_continued_)—Successive Resistance.'],
        ['(_continued_) When no Decision\nis Sought for.', '(_continued_)—When no Decision is Sought for.'],
        // The chapters in two sections take the second's title too, as the contents list has both ("B. War as an
        // Instrument of Policy" is one to find); the B heading stays where it is in the text.
        ['CHAPTER XX. A. Defence of Swamps', 'CHAPTER XX. A. Defence of Swamps.—B. Inundations'],
        ['CHAPTER III. A. Interdependence of the Parts in War', 'CHAPTER III. A. Interdependence of the Parts in War.—B. On the Magnitude of the Object of the War, and the Efforts to be Made'],
        ['CHAPTER VI. A. Influence of the Political Object on the Military Object', 'CHAPTER VI. A. Influence of the Political Object on the Military Object.—B. War as an Instrument of Policy'],
      ],
      sections: [
        { heading: /^INTRODUCTION$/, n: 0, title: 'Introduction' },
        { heading: /^PREFACE TO THE FIRST EDITION$/, n: 1, title: 'Preface to the first edition' },
        { heading: /^NOTICE$/, n: 2, title: 'Notice' },
        { heading: /^THE INTRODUCTION OF THE AUTHOR$/, n: 3, title: 'The introduction of the author' },
        { heading: /^BRIEF MEMOIR OF GENERAL CLAUSEWITZ$/, n: 4, title: 'Brief memoir of General Clausewitz' },
      ],
      part: { heading: /^BOOK ([IVX]+)\.?\s+(.+)$/, label: 'Book', title: 'line', count: 8 },
      chapter: { heading: /^CHAPTER ([IVXL]+)\.\s+(.+)$/, title: 'line', within: true, count: 125 },
      notes: 'star',
      keep: [/^This Life within all living things/],
    },
    // Tagging decisions (see the Prince's for the form).
    decisions: {
      ...untag(...LATER_STATES),
      // Clausewitz's Europe of 1792–1830: Prussia is the kingdom (1701), Hungary the Habsburg kingdom, Turkey the
      // Ottoman Empire, the "German Empire" whose army fought in 1792 the Holy Roman Empire; Great Britain the United
      // Kingdom of 1801. His France (the Republic and Napoleon's empire), Italy (the Army of Italy, 1796), Germany and
      // England have no entry of their time in the lake, so they are left untagged.
      Prussia: 'Q27306', Hungary: 'Q171150', Turkey: 'Q12560', 'German Empire': 'Q12548', 'Great Britain': 'Q174193',
      // Austria is the Austrian Empire of 1804 (the lake's, and Clausewitz's when he wrote); Holland, the campaigns of
      // 1672 to 1795, the Dutch Republic.
      Austria: 'Q131964', Holland: 'Q170072',
      ...untag('England'),
      // Graham's "States" are states, not the United States; "King’s" is no college; Marshal Luxembourg is not the
      // grand duchy; a Bologna phial is not the city; the North German Confederation of a plan of 1830 is not 1867's.
      ...untag('States', 'King\'s', 'Unity', 'Republic', 'Luxembourg', 'Bologna', 'North German Confederation'),
    },
  },
  {
    slug: 'communist-manifesto',
    title: 'Manifesto of the Communist Party',
    author: { name: 'Karl Marx', qid: 'Q9061', born: 1818, died: 1883 },
    translator: { name: 'Samuel Moore', died: 1911 },
    // The book has two authors; the contract has one, so the second stands with the others whose words the edition
    // carries, his part named (the page's byline and shelf row give both names: app.js).
    editors: [{ name: 'Frederick Engels', died: 1895, role: 'co-author; preface to the English edition (1888) and its notes' }],
    // The work: written in December 1847 and January 1848 for the Communist League, printed in London in February
    // 1848. Its era runs from the League's congress that commissioned it (November 1847) to Engels's preface of 1888.
    work: { qid: 'Q40591', written: 1848, published: 1848 },
    era: [1847, 1888],
    // The edition: Samuel Moore's authorised translation (London: William Reeves, 1888), with Engels's preface of 30
    // January 1888 and his notes, in the New York Labor News Company's reprint of 1908: Project Gutenberg eBook #31193
    // (its preface: "The present translation is by Mr. Samuel Moore"; Gutenberg #61 has neither the preface nor the
    // notes). The reprint spells in the American way ("specter", "labor").
    gutenberg: 31193,
    published: 1908,
    edition: 'Samuel Moore’s authorised translation of 1888, edited and annotated by Engels',
    rights: {
      us: 'pd', uk: 'pd',
      basis: 'Karl Marx died on 14 March 1883 and Frederick Engels, his co-author, who wrote the preface of 1888 and its notes, on 5 '
        + 'August 1895; the translator Samuel Moore died in 1911, so the last term in Ireland and the UK (life plus 70 years: '
        + 'Copyright and Related Rights Act 2000, s.24; CDPA s.12) ended on 31 December 1981. Moore’s translation was first published in '
        + 'London in 1888 (William Reeves) with Engels’s preface and notes; this text is the New York Labor News Company’s reprint of 1908, '
        + 'and every work published before 1931 is in the public domain in the United States. The reprint’s own words are left out: its '
        + 'notice in the preface’s second note ("To be had from the N. Y. Labor News Co. …") and its advertisements after the text. The '
        + 'Project Gutenberg licence allows the text to be used freely once its header, footer and licence are removed '
        + '(gutenberg.org/policy/license.html).',
      checked: '2026-11-07',
    },
    // Engels's preface to the English edition of 1888 (its signature and date kept; headed "Preface" as printed), then the Manifesto's own opening, under its title, share chapter
    // 0; its four sections ("I." alone on a line, the title in capitals in the block after it) are numbered once
    // through and called sections, as the book calls them ("Section IV."). Engels's notes are lettered through each
    // section and set together at its end, "(a) …"; the mark "(a)" stands against its word, and Section I's first is on
    // the section's title. The title page and the reprint's notice and advertisements go (`start`, `fix`, `end`), and
    // the three lines of the Manifesto's title (`drop`). Section III's subheadings ("I. REACTIONARY SOCIALISM.", "(a)
    // Feudal Socialism.") are paragraphs of the section, as printed.
    layout: {
      start: /^PREFACE$/,
      end: /^THE END\.$/,
      fix: [['  To be had\nfrom the N. Y. Labor News Co., 28 City Hall Place, New York.', '']],
      front: {
        title: 'Preface and preamble',
        pieces: [
          { heading: /^PREFACE$/, title: 'Preface' },
          { heading: /^MANIFESTO$/, title: 'Manifesto of the Communist Party' },
        ],
      },
      drop: [/^OF THE$/, /^COMMUNIST PARTY\.$/, /^BY KARL MARX AND FREDERICK ENGELS\.$/],
      chapter: { heading: /^([IV]+)\.$/, title: 'next', count: 4, label: 'Section' },
      notes: 'letter', verse: false,
    },
    // Tagging decisions (see the Prince's for the form).
    decisions: {
      ...untag(...LATER_STATES),
      // The authors by the names the preface gives them, which the lake has only in full; Saint-Simon, Fourier and
      // Proudhon as the text names them (Section III, the preface). Robert Owen is not in the lake, and its bare "Owen"
      // is Richard Owen the anatomist; England in 1848 and 1888 is no entry of its time (the lake's is the kingdom of
      // 927–1707); ancient Rome is Ancient Rome, not the Republic alone; the "nucleus" of the Manifesto is no topic.
      Marx: 'Q9061', Engels: 'Q34787', 'St. Simon': 'Q82934', Fourier: 'Q181707', Proudhon: 'Q5749',
      // and the preface's Darwin, Herzen (his "Kolokol") and Bakunin, whom Moore's English spells as the French do
      Darwin: 'Q1035', Herzen: 'Q201221', Bakounine: 'Q27645',
      Rome: 'Q1747689',
      ...untag('Owen', 'England', 'nucleus'),
    },
  },
  bohmBawerk({
    slug: 'capital-and-interest',
    title: 'Capital and Interest',
    // The work: Kapital und Kapitalzins, volume I, Geschichte und Kritik der Kapitalzins-Theorien (Innsbruck, 1884),
    // the history and criticism of the theories of interest. Its era runs from the Wealth of Nations (1776), where the
    // book has the modern problem begin (Book I, Chapter IV), to the book; Book I's survey of the canonists and of the
    // sixteenth to eighteenth centuries is its preface.
    work: { qid: 'Q4212911', written: 1884, published: 1884 },
    era: [1776, 1884],
    // Smart's translation (London: Macmillan, 1890), "translated with a preface and analysis".
    published: 1890,
    edition: 'William Smart’s translation (London: Macmillan, 1890)',
    scan: 'capitalinterestc00bhuoft', econlib: 'bbCI', files: 31, copy: 'the University of Toronto’s copy of the London edition', printing: 'Macmillan, 1890',
    second: 'Harvard’s, scanned by Google, which the Internet Archive’s record marks as not in copyright',
    // The scan's pages: Smart's preface (9–26) and the text (53–481); not his "Analysis" (27–52) or the index.
    // The transcription's slips that the merge leaves (one scan's reading alone, or a word of the edition's foreign
    // quotations that the shelf does not know), each read again in the scans: a stop and a comma for a space, and
    // the letters its own OCR got wrong ("soprappi\uFFFD" for "soprappiù").
    pages: '9-26,53-481', witness: 'capitalandinter00smargoog',
    fix: [['but.not destroyed', 'but not destroyed'], ['Nations,book', 'Nations, book'], ['Nutzung voll Grundstücken', 'Nutzung von Grundstücken'],
      ['soprappi\uFFFD', 'soprappiù'], ['justIce', 'justice'], ['Sozialwirthscaftslehre', 'Sozialwirthschaftslehre'], ['Undarum Foenus', 'Unciarum Foenus'],
      ['lucrum aliqod', 'lucrum aliquod'], ['huc deterta est', 'huc detorta est'], ['censequetur', 'consequetur'], ['(si’l n’avait', '(s’il n’avait'],
      ['Handlungswisenschaft', 'Handlungswissenschaft'], ['etc. , 1849', 'etc., 1849'], ['(p. 21 , etc.)', '(p. 21, etc.)'],
      // Econlib's slips that are words too, where both scans read the edition's ("quid lex dicat", "After saying",
      // "Here he puts", "Thus, instead"), a stop for a comma; and its own matter ending two notes: its next heading
      // ("Introduction") and a stray "s".
      ['quid leg dicat', 'quid lex dicat'], ['After saving that', 'After saying that'], ['Here be puts down', 'Here he puts down'],
      ['interest. This, instead of the existence', 'interest. Thus, instead of the existence'], ['wrong name to one of them,\n', 'wrong name to one of them.\n'],
      ['April 1889. Introduction\n', 'April 1889.\n'], ['etc. (p. 93).s\n', 'etc. (p. 93)\n'], ['economical loss.’ “\n', 'economical loss.’”\n']],
    // Smart's preface (0, signed and dated at Glasgow, April 1890) and the Introduction (1); seven books of chapters
    // numbered within each (n = book × 100 + chapter), Book V's one chapter under the book's own title (its three
    // groups, English, French and German, are headings in it, as printed), and the Conclusion after Book VII (800).
    // Smart's "Analysis", the contents in detail, is a contents list and goes, as does the index of authors.
    sections: [
      { heading: /^TRANSLATOR’S PREFACE$/, n: 0, title: 'Translator’s preface' },
      { heading: /^INTRODUCTION$/, n: 1, title: 'Introduction: the problem of interest' },
      { heading: /^CONCLUSION$/, n: 800, title: 'Conclusion', after: true },
    ],
    books: 7, chapters: 28,
    // The Say-Hermann school keeps both its names in the titles of Book III, Chapters IV and VI.
    proper: ['Say-Hermann'],
    decisions: {},
  }),
  bohmBawerk({
    slug: 'positive-theory-of-capital',
    title: 'The Positive Theory of Capital',
    // The work: Kapital und Kapitalzins, volume II, Positive Theorie des Kapitales (Innsbruck, 1889; the author's
    // preface is dated November 1888). Its era runs from Menger's Grundsätze (1871), from which the book's theory of
    // value comes, to the book.
    work: { qid: null, written: 1888, published: 1889 },
    era: [1871, 1889],
    // Smart's translation (London: Macmillan, 1891) in G. E. Stechert's New York reprint of 1923, the copy the
    // University of Toronto has and the Internet Archive scanned (no scan of the London printing is public). The OCR of
    // both copies' title pages reads its year "1928" and "i9‘J8", the 3 taken for an 8; the catalogues read "reprint,
    // 1923" (HathiTrust's record of the University of California's copy, OCLC 1632238, LCCN agr23001126, which also
    // holds Duke's), as do both scans' records.
    published: 1923,
    edition: 'William Smart’s translation (London: Macmillan, 1891), reprinted New York: G. E. Stechert, 1923',
    scan: 'positivetheoryof00bhuoft', econlib: 'bbPTC', files: 53, copy: 'the University of Toronto’s copy of the New York reprint',
    printing: 'G. E. Stechert, 1923; first published London: Macmillan, 1891',
    second: 'Duke University’s, whose record gives no copyright status either and which HathiTrust, holding the same scan, classes as public domain',
    // The scan's pages: the two prefaces (9–32) and the text (45–470); not the "Analysis" or the index. Its notes are
    // set close to the text's size, so a line under 50 (the OCR's x_size) is a note. The transcription's slips that the
    // merge leaves, each read again in the scans (two commas for a space, "Walrus" for Walras, "Loris" for Lexis), and
    // one word both scans misread alike ("alio" for the Italian "allo").
    pages: '9-32,45-470', witness: 'positivetheoryof01bohm', cut: 50,
    fix: [['Élements,d’Économie', 'Élements d’Économie'], ['above,p.', 'above, p.'], ['alio scopo', 'allo scopo'], ['pi\uFFFD la sua', 'più la sua'],
      ['Ziepulnkt', 'Zielpunkt'], ['Steurlehre', 'Steuerlehre'], ['Rechtsprinicip', 'Rechtsprincip'], ['theoretischen Staatswirthshaft', 'theoretischen Staatswirthschaft'],
      ['twelve oclock', 'twelve o’clock'], ['B 5‘s horse', 'B 5’s horse'], ['See Manger’s', 'See Menger’s'], ['Emil has (', 'Emil Sax ('],
      ['tortures aye must', 'tortures we must'], ['L. Walrus', 'L. Walras'], ['and Walrus,', 'and Walras,'], ['log but', 'log-hut'], ['future—conipete', 'future—compete'],
      ['successivea', 'successiva'], ['Arbeitskal und', 'Arbeitskapital und'], ['und irh Grundbegriff', 'und ihr Grundbegriff'],
      ['Staatswirthschaftstlehre', 'Staatswirthschaftslehre'], ['of Loris (', 'of Lexis ('], ['Grudsätze', 'Grundsätze'], ['shape[2] :—', 'shape[2]:—'],
      // Econlib's slips that are words too, where both scans read the edition's: Walras's year, the title of the
      // author's Rechte und Verhältnisse (three times), "hand to mouth", "as", "he", "an", "my", "buy", "now", "in",
      // "hand", the French "que" and "ne", Smart's "labour", "pp." for two pages.
      ['Lausanne, 1814', 'Lausanne, 1874'], ['Rechte and Verhältnisse', 'Rechte und Verhältnisse', 3], ['from hand to month', 'from hand to mouth'],
      ['distinguishes them an “', 'distinguishes them as “'], ['clear of themselves se we go on', 'clear of themselves as we go on'], ['p. 50) be makes', 'p. 50) he makes'],
      ['quoi quo ce soit', 'quoi que ce soit'], ['frais de production no sont', 'frais de production ne sont'], ['bring me all intensity', 'bring me an intensity'],
      ['In 1889 be has', 'In 1889 he has'], ['as equivalent, be gives', 'as equivalent, he gives'], ['produced by the labor of his', 'produced by the labour of his'],
      ['Einkommens, p. 155, 168', 'Einkommens, pp. 155, 168'], ['the utility, us will be', 'the utility, as will be'], ['on the other band,', 'on the other hand,'],
      ['compelled to bay,', 'compelled to buy,'], ['another plan than new,', 'another plan than now,'], ['figures given is the text', 'figures given in the text'],
      ['in taking it is a strong', 'in taking it as a strong'], ['majority of many readers', 'majority of my readers'],
      // Note ends Econlib cut short (a word, three stops) or ran on into its next heading.
      ['had perhaps a dim\n', 'had perhaps a dim presentiment.\n'], ['to his economical position\n', 'to his economical position.\n'],
      ['out of his rent, and so on\n', 'out of his rent, and so on.\n'], ['zero, not 100.—W. S. Book III, Chapter V\n', 'zero, not 100.—W. S.\n'],
      // Two sentences of Book II, Chapter V that Econlib breaks at its tables: "The" opens the first table's first row,
      // and "1 million labour-years." ends the paragraph before the second (the edition's "an addition of 1 million
      // labour-years. The 3d class needs an addition of 1 ” ”").
      ['circles. The\n\n1st circle contains', 'circles.\n\nThe 1st circle contains'],
      [`an addition of\n\n${' '.repeat(40)}1 million labour-years.\n`, 'an addition of 1 million labour-years.\n\n']],
    // Smart's preface (0, Glasgow, June 1891), the author's (1, Innsbruck, November 1888) and the Introduction (2);
    // seven books of chapters numbered within each, and the "Appendix to page 327" (Book VI, Chapter V) after Book VII
    // (800). The book's tables keep their columns; its figure, the concentric circles of Book II, Chapter V, is a
    // picture and is not here (the text describes it); its two worked averages (Book II, Chapter II) are set in one
    // line each.
    sections: [
      { heading: /^TRANSLATOR’S PREFACE$/, n: 0, title: 'Translator’s preface' },
      { heading: /^AUTHOR’S PREFACE$/, n: 1, title: 'Author’s preface' },
      { heading: /^INTRODUCTION$/, n: 2, title: 'Introduction' },
      { heading: /^APPENDIX TO PAGE 327$/, n: 800, title: 'Appendix to page 327: amount of subsistence fund necessary before entering on a production period of given length', after: true },
    ],
    books: 7, chapters: 49,
    // A chapter that carries one on is "(continued)", in lower case, as Darwin's are.
    lower: ['continued'],
    // The book's own "degree of capitalism" is how roundabout a process of production is, and "the joint capitalism of
    // the worker" his share in owning capital: neither is capitalism the economic system (its "Capitalism and
    // Socialism" is).
    decisions: { ...untag('degree of capitalism', 'degrees of capitalism', 'joint capitalism', 'degrees of “Capitalism') },
  }),
  /* Carl Menger's essay on the origin of money, written for The Economic Journal and published there in Caroline A.
     Foley's translation (vol. 2, no. 6, June 1892, pp. 239–255), signed "Karl Menger". No transcription of it is free to
     reuse (JSTOR's, the Mises Institute's and the Online Library of Liberty's carry their sites' terms), so the text is the
     scan's own OCR (scan-text.mjs, `scan` with no `econlib`): the Internet Archive's microfilm of the journal's second
     volume, its images 244–260 the article's seventeen pages, read against a second copy (Google's scan of the volume,
     whose OCR of the article's first page is torn and of the rest good), which puts the scan's misreadings right and is
     used for nothing else. The running heads ("240 THE ECONOMIC JOURNAL", "ON THE ORIGIN OF MONEY 241") and the issue's
     signature line ("No. 6.—VOL. II.") go. */
  {
    slug: 'origin-of-money',
    title: 'On the Origin of Money',
    author: { name: 'Carl Menger', qid: 'Q84177', born: 1840, died: 1921 },
    // Caroline Augusta Foley, later Rhys Davids (27 September 1857 – 26 June 1942: Wikidata Q622047, Who Was Who).
    translator: { name: 'Caroline A. Foley', died: 1942 },
    // The work: written for the journal and first printed there, in English. Its era runs from Menger's Grundsätze
    // (1871), whose chapter on money the essay cites, to the essay.
    work: { qid: null, written: 1892, published: 1892 },
    era: [1871, 1892],
    published: 1892,
    edition: 'Caroline A. Foley’s translation, The Economic Journal, vol. 2, no. 6 (June 1892), pp. 239–255',
    scan: {
      id: 'sim_economic-journal_march-december-1892_2_5-8', pages: '244-260', witness: 'economicjournal00socigoog',
      witnessFrom: 'OX  THE  Oiil-rl', witnessTo: 'Translated  by  Caroline  A.  Foley,  M.A.',
      furniture: [/^(?:\d{3} )?THE ECONOMIC JOURNAL(?: \d{3})?$/, /^ON THE ORIGIN OF MONEY \S{2,3}$/, /^No\. 6\.—VO[LU]\. [IV1l]+/i],
      // the OCR's readings of the sections' numerals ("[.—", "IT.—", "ILL.", "LV.")
      restart: /^[[IVXLT]{1,5}\.(?:—| )/,
      // Section VI's note is on its heading
      marks: { 252: ['h:EXCHANGE:.\''] },
      // The OCR's slips that the witness did not put right (the two misread a word differently, or the scan's reading is a
      // word too), each read again in both scans: the sections' numerals and two headings' letters; the list items of
      // Section V that the OCR took for headings (set in capitals); the Greek of notes 5 and 6, which the OCR read as
      // Latin letters (both scans: "dapyvpiov", "iipyvpiov"; "véuioua", "vS/xiafia"); "i.e." and "e.g." read "¢.e."
      // and "¢.¢."; and the German and French titles' accents.
      fix: [['[.—INTRODUCTION.', 'I.—INTRODUCTION.'], ['IT.—ATRREMPRS AT SOLUTION', 'II.—ATTEMPTS AT SOLUTION'], ['ILL. THR PROBLEM', 'III. THE PROBLEM'],
        ['LV. COMMODITIES', 'IV. COMMODITIES'], ['DEGREES OF”\n\nSALEABLENESS', 'DEGREES OF\nSALEABLENESS'], ['MEDIA OF EXCHANGE:.', 'MEDIA OF EXCHANGE.'],
        ['VII. Tuer Process oF DIFFERENTIATION', 'VII. THE PROCESS OF DIFFERENTIATION'], ['THE PRECTIOUS METALS', 'THE PRECIOUS METALS'],
        ['3. THE COST OF PRESERVING AND STORING THEM.', '3. The cost of preserving and storing them.'], ['4. The rate of interest.:', '4. The rate of interest.'],
        ['5. THE PERIODICITY OF A MARKET FOR THE SAME.', '5. The periodicity of a market for the same.'], ['of timebargains', 'of time-bargains'],
        ['togethe1 subsequently', 'together subsequently'], ['thinker lke Savigny', 'thinker like Savigny'], ['to what. still obtains', 'to what still obtains'],
        ['much less-testifying', 'much less testifying'], ['my Grundsdtze der', 'my Grundsätze der'], ['Les Progrés de la', 'Les Progrès de la'],
        ['at what hes first', 'at what lies first'], ['saleabieness (Absatzfihigkeit)', 'saleableness (Absatzfähigkeit)'], ['economic lfe—namely', 'economic life—namely'],
        ['and im a given market', 'and in a given market'], ['does not le within', 'does not lie within'], ['of cloth ‘or silk-stuffs', 'of cloth or silk-stuffs'],
        ['consulting the, greater', 'consulting the greater'], ['only finda sale', 'only find a sale'], ['depends. upon', 'depends upon'],
        ['durability, ¢.e. their', 'durability, i.e. their'], ['markets, ¢.i.e. within', 'markets, i.e. within'], ['for, ¢.i.e. has already', 'for, i.e. has already'],
        ['Consider, ¢.¢., the owner', 'Consider, e.g., the owner'], ['at any time, 7.¢. at any', 'at any time, i.e. at any'],
        ['the Handwirterbuch der', 'the Handwörterbuch der'], ['the Greek dapyvpiov,', 'the Greek ἀργύριον,'], ['argent, &e.', 'argent, &c.'],
        ['the Greek véuioua, Ke.', 'the Greek νόμισμα, &c.'], ['things of whreh he', 'things of which he'], ['my Grundsétze der', 'my Grundsätze der'],
        ['practical life, Inasmuch', 'practical life, inasmuch'], ['to market,.the more', 'to market, the more'], ['wants at.a market', 'wants at a market'],
        ['in return foi money', 'in return for money'], ['discernment cf the', 'discernment of the'], ['of traffic— goods', 'of traffic—goods'],
        ['reason of them costliness', 'reason of their costliness'], ['must im the first', 'must in the first'], ['a state-Imstitution.', 'a state-institution.'],
        ['at ecomomic prices', 'at economic prices'], ['CAROLINE A. Foury, M.A.', 'CAROLINE A. FOLEY, M.A.'],
        // the dash that closes "respects—personally …", lost at a line's end in the scan, which the witness reads
        // ("temporally — as the precious metals"). (Note 8's "the Polish pienondze" stands as the scan reads it; the
        // witness reads "pieiumdzCy", and the printed form wants the page image.)
        ['and temporally as the precious metals', 'and temporally—as the precious metals']],
      licence: 'Internet Archive scan sim_economic-journal_march-december-1892_2_5-8, the Internet Archive’s microfilm of The Economic Journal, vol. 2 '
        + '(London: Macmillan, 1892), pp. 239–255, its OCR checked word by word against the OCR of a second copy of the volume '
        + '(archive.org/details/economicjournal00socigoog, scanned by Google). No transcription is used. The words are the journal’s, '
        + 'and the article is in the public domain.',
    },
    rights: {
      us: 'pd', uk: 'pd',
      basis: 'Carl Menger died on 26 February 1921 and the translator, Caroline A. Foley (later Caroline Rhys Davids), on 26 June 1942 '
        + '(Wikidata Q84177 and Q622047; Who Was Who), so the last term in Ireland and the UK (life plus 70 years: Copyright and Related '
        + 'Rights Act 2000, s.24; CDPA s.12) ended on 31 December 2012. Her translation was published in The Economic Journal, vol. 2, '
        + 'no. 6, in June 1892, and every work published before 1931 is in the public domain in the United States. The text is from the '
        + 'Internet Archive’s microfilm of the journal’s second volume (archive.org/details/sim_economic-journal_march-december-1892_2_5-8), '
        + 'read against a second copy (archive.org/details/economicjournal00socigoog, scanned by Google, whose front page asks for '
        + 'non-commercial use and attribution: requests, not a licence; it is used only to check the OCR). No transcription is used.',
      checked: '2026-11-07',
    },
    // Nine sections, numbered "I.—Introduction.", "II.—Attempts at Solution hitherto.", then "III. The Problem …" (the
    // dash only in the first two, as printed), called sections; the signature and the translator's line close
    // Section IX, as printed. The article's title goes (`start`).
    layout: {
      start: /^I\.—/,
      chapter: { heading: /^([IVX]+)\.(?:—|\s)\s*(.+)$/, title: 'line', count: 9, label: 'Section' },
      notes: 'bracket', verse: false, tables: 'rows',
    },
    // Tagging decisions (see the Prince's for the form).
    decisions: {
      ...untag(...LATER_STATES),
      Menger: 'Q84177', Smith: 'Q9381',
    },
  },
  /* Böhm-Bawerk's Zum Abschluss des Marxschen Systems (1896), his essay on the third volume of Marx's Capital, in Alice M.
     Macdonald's translation (London: T. Fisher Unwin, 1898) with James Bonar's preface. The only transcriptions (the
     Online Library of Liberty's, the Mises Institute's) carry their sites' own terms, so the text is the scan's own OCR
     (scan-text.mjs, `scan` with no `econlib`): the Internet Archive's scan of a copy of the London edition, read against a
     second copy (the University of Michigan's, scanned by Google), which puts the scan's misreadings right and is used for
     nothing else. The 1949 and 1966 New York reprints, which add Paul Sweezy's introduction and Hilferding's reply, are
     not used. The translator's death date was not found (rights below). */
  {
    slug: 'karl-marx-and-the-close-of-his-system',
    title: 'Karl Marx and the Close of His System',
    author: { name: 'Eugen von Böhm-Bawerk', qid: 'Q311535', born: 1851, died: 1914 },
    // She signs as "Mrs. Murray Macdonald" in Bonar's preface; no death date was found (rights.unknown).
    translator: { name: 'Alice M. Macdonald', died: null },
    editors: [{ name: 'James Bonar', died: 1941, role: 'preface (13 January 1898)' }],
    // The work: written for the essays in honour of Karl Knies (Staatswissenschaftliche Arbeiten: Festgaben für Karl
    // Knies, Berlin, 1896). Its era runs from the first volume of Capital (1867) to the essay.
    work: { qid: null, written: 1896, published: 1896 },
    era: [1867, 1896],
    published: 1898,
    edition: 'Alice M. Macdonald’s translation, with a preface by James Bonar (London: T. Fisher Unwin, 1898)',
    scan: {
      // its notes are set close to the text's size: a line under 50 (the OCR's x_size) is a note's
      id: 'karlmarxcloseofh0000euge', pages: '9-21,25-225', witness: 'karlmarxandclos00macdgoog', cut: 50,
      witnessFrom: 'PREFACE', witnessTo: 'but no abiding future.',
      // the witness's running heads and page numbers (its copy ends three pages short, at "no abiding future.")
      witnessDrop: [/^[|\d\s.:a]*Kar[l!1]\]? Marx$/, /^[|_\s]*(?:Preface|Introduction|Theory of Value|Average Rate of Profit|The Question of the Contradiction|Error in the Marxian System|Werner Sombart.?s A ?pology)\s+\S{1,4}$/,
        /^\d{1,3}\s+(?:Preface|Introduction)$/, /^[|\s]*\d{1,3}\s*[.|]*$/],
      // the pages where the OCR lost a note's mark, or read a sign of the text as one ("alas!"): the tokens that carry the marks
      marks: { 34: ['23)!', 'market.'], 41: ['2?!'], 169: ['them.!', '2'], 175: ['!', 'conditions.2'], 219: ['complementary?’’!)'] },
      // The OCR's slips that the witness did not put right, each read again in both scans (the comments in the list say which)
      fix: [
        // the openings: a drop capital the OCR read as another letter, its line set apart; the chapters' titles a block of
        // their own
        ['“T*HE work here translated was one of a\n\nseries of', '“The work here translated was one of a series of'],
        ['Fanuary 13, 1898.', 'January 13, 1898.'],
        ['INTRODUCTION\n\njs an author Karl Marx was enviably fortu-\n\nnate. ', 'INTRODUCTION\n\nAs an author Karl Marx was enviably fortunate. '],
        ['\n\n9\n\nCHAPTER I\n\nTHE THEORY OF VALUE AND SURPLUS\n\nVALUE\n\ni Siae pillars of the system of Marx are his\n\nconception', '\n\nCHAPTER I\nTHE THEORY OF VALUE AND SURPLUS VALUE\n\nThe pillars of the system of Marx are his conception'],
        ['CHAPTER <I\n\nTHE THEORY OF THE AVERAGE RATE OF PROFIT AND OF THE PRICE OF PRO- DUCTION.\n\nHAT result is as follows. The “organic\n\ncomposition”',
          'CHAPTER II\nTHE THEORY OF THE AVERAGE RATE OF PROFIT AND OF THE PRICE OF PRODUCTION.\n\nThat result is as follows. The “organic composition”'],
        ['CHAPTER III\n\nTHE QUESTION OF THE CONTRADICTION ANY years ago, long before the above-\n\nmentioned', 'CHAPTER III\nTHE QUESTION OF THE CONTRADICTION\n\nMany years ago, long before the above-mentioned'],
        ['CHAPTER LY.\n\nTHE ERROR IN THE MARXIAN SYSTEM—\n\nITS ORIGIN AND RAMIFICATIONS\nSECTION I\n\nHe evidence that an author has contra-\n\ndicted',
          'CHAPTER IV\nTHE ERROR IN THE MARXIAN SYSTEM—ITS ORIGIN AND RAMIFICATIONS\n\nSECTION I\n\nThe evidence that an author has contradicted'],
        ['WERNER SOMBART’S APOLOGY\n\nre apologist of Marx, as intelligent as he is\n\nardent,', 'WERNER SOMBART’S APOLOGY\n\nThe apologist of Marx, as intelligent as he is ardent,'],
        ['SEECOND ARGUMENT.', 'SECOND ARGUMENT.'], ['FOURTTH ARGUMENT.', 'FOURTH ARGUMENT.'],
        // a paragraph that opens a page with no indent, run into the one before
        ['as such exchange for each other.[4] In many places', 'as such exchange for each other.[4]\n\nIn many places'],
        // the OCR's quotation marks: a double one read as two or three ("‘“‘average”", "variable capital”’")
        [/‘“‘/, '“', 13], [/“‘/, '“', 29], [/‘“/, '“', 12], [/’”’/, '”', 4], [/”’/, '”', 45],
        // the references: "seq." read "seg.", the volumes' numerals read with figures and other strokes, "p." with a hyphen
        ['seg.s Schmidt', 'seq.; Schmidt'], ['seg.5 finally', 'seq.; finally'], [/(?<=\s)seg(?=[.,;)\s-]|$)/, 'seq', 25],['seqg.3 English', 'seq.; English'],
        [/\((?:111|iil|ili|ill|itl)\./, '(iii.', 17], [' ili. (1892)', ' iii. (1892)'], ['(1. ', '(i. ', 3], ['(Gi. 142):', '(i. 142).'], ['(it. 133-4)', '(iii. 133-4)'],
        ['by ui. the first section', 'by iii. the first section'], [' p- ', ' p. ', 2], [' P- 590', ' p. 590'], [' pp- 211', ' pp. 211'],
        // the Preface and the Introduction's notes
        ['Wendell Holmes: “JT was just', 'Wendell Holmes: “I was just'], ['among illwritten manuscripts', 'among ill-written manuscripts'],
        ['(compare Marx Mills. 374, and: 1. Ist 31,9, s2tit040 amas himself', '(compare Marx iii. i. 374, and i. 1st 313, 2nd 340). Marx himself'],
        ['cf. 426, Ist ed. 376', 'cf. 426, 1st ed. 376'], ['i., ist edition', 'i., 1st edition'],
        ['Nor-has the fact', 'Nor has the fact'], ['Lexis, Fahrbicher fir Nationalokonomie', 'Lexis, Jahrbücher für Nationalökonomie'],
        ['Tébinger Zeitschrift', 'Tübinger Zeitschrift'], ['Loria in the Fahrbicher fur Nationalokonomie', 'Loria in the Jahrbücher für Nationalökonomie'],
        ['Das Ratsel der', 'Das Rätsel der'], ['Fahrb. f. Nationalok., third', 'Jahrb. f. Nationalök., third', 1], ['Fahrb. f. Nationalck., third', 'Jahrb. f. Nationalök., third'],
        ['Newe Zeit, 1892-3', 'Neue Zeit, 1892-3'], ['(Karl Marx’ Nationalokonomische Irrlehren', '(Karl Marx’ Nationalökonomische Irrlehren'],
        ['Dopera postuma ai Carlo Marx, Nuova Antologia, February)1, 1895, pp.’ 20, 225,23:', 'L’opera postuma di Carlo Marx, Nuova Antologia, February 1, 1895, pp. 20, 22, 23.'],
        ['a mvystification.”', 'a mystification.”'], ['(labdicazione pit esplicita', '(l’abdicazione più esplicita'],
        // Chapter I
        ['Kritik der Kapitalzinstheoricen', 'Kritik der Kapitalzinstheorieen'], ['as Marx calls it?![', 'as Marx calls it?['],
        ['benefit (exp/oité),', 'benefit (exploité),'], ['benefit (explate) .i. 207 seq.). If, .for instance,~the | working', 'benefit (exploité) (i. 207 seq.). If, for instance, the working'],
        ['“surplus value” | without', '“surplus value” without'], ['reckoned at 1OOF,:', 'reckoned at 100%.'],
        ['with equimarents (sec 1,150,183). It is true that. in', 'with equivalents” (see i. 150, 183). It is true that in'], ['exchange of commoities’ (i. 142).', 'exchange of commodities” (i. 142).'],
        ['Volkswirtschaft, Tubingen, 1887', 'Volkswirtschaft, Tübingen, 1887'],
        // Chapter II: the figures of the text; Marx's two tables of the five capitals (iii. 132, 135) are printed with their
        // headings set sideways, which neither OCR reads, and the rows of the second table are read only in part: they are left
        // out, and a note in brackets (the shelf's, as Gutenberg's "[Illustration]") says so where each stands
        [/\n\nEE\n\nCapitals\. Fo ea[^]*?(?=\n\nWe see that this table)/, '\n\n[Table not reproduced: Marx’s table of the five capitals I.–V. (iii. 132); its column headings are printed sideways, and neither scan’s OCR reads them.]'],
        [/\n\n; 4 Ze\n\nA ONL[^]*?\| \+17(?=\n\n“Taken together)/, '\n\n[Table not reproduced: Marx’s second table of the five capitals I.–V. (iii. 135), with the cost price of each; its column headings are printed sideways, and neither scan’s OCR reads them or all its rows.]'],
        ['produced = 1103 and', 'produced = 110; and'], ['produced=610.', 'produced = 610.'], ['of which J. to V. form', 'of which I. to V. form'], ['the cardingroom,', 'the carding-room,'],
        ['would be 500=390 C+ 110 V, or 78% C+ 22% V.', 'would be 500 = 390 C + 110 V, or 78% C + 22% V.'], ['as being + of the aggregate', 'as being ⅕ of the aggregate'],
        ['equal to V+ used-up C.', 'equal to V + used-up C.'], ['is= 500;', 'is = 500;'], ['and 8418 under', 'and 8 + 18 under'], ['2+7+17=26 over', '2 + 7 + 17 = 26 over'],
        ['(iii. 1§1, 152)', '(iii. 151, 152)'], ['time—z.e., an', 'time—i.e., an'], [/(?<=[ ,])7\.e\.,/, 'i.e.,', 3],
        // Chapter III
        ['‘Tt is, however,', '“It is, however,'], ['1 |b. of gold', '1 lb. of gold'], ['of iron saken together', 'of iron taken together'],
        ['price—4o,o01 |bs.—corresponds', 'price—40,001 lbs.—corresponds'], ['(iii. 136; 1515) Teg,eage, 176).', '(iii. 136, 151, 159, 175, 176).'],
        ['but Aistorically prior', 'but historically prior'], ['contrary to all Pee tacten ol experience. It is true-that. as', 'contrary to all the facts of experience. It is true that as'],
        [' JII. 175 seq.', ' III. 175 seq.'], [' TII. 169. See also above.', ' III. 169. See also above.'], ['Ido not think', 'I do not think'], ['145, 184, 191= Jeg, “197! seq. meas and often', '145, 184, 191 seq., 197 seq., and often'],
        ['production was ro shillings', 'production was 10 shillings'],
        ['particular pricedeterminant—which', 'particular price-determinant—which'],
        // the two tables of A, B and C, as both scans read them (the OCR's 8 for the s of shillings put right), their
        // headings of two lines each in one
        ['illustrates this assumption: —-', 'illustrates this assumption:—'],
        [/:    Expended\.    Capital \|Average pro-\| Production[^]*?Total— 30 1508\. 1,500s\. 150s, 30038\./,
          'Commodity.    Expended Time.    Wages.    Capital Employed.    Average profit accruing.    Production price.\nA             10                50s.      500s.                50s.                        100s.\nB             6                 30s.      700s.                70s.                        100s.\nC             14                70s.      300s.                30s.                        100s.\nTotal—        30                150s.     1,500s.              150s.                       300s.'],
        [/Expended\.    Capital Average pro-\} Production[^]*?Total— 30 180s\. 1,500s\. 120s\. 300s\./,
          'Commodity.    Expended Time.    Wages.    Capital employed.    Average profit accruing.    Production price.\nA             10                60s.      500s.                40s.                        100s.\nB             6                 36s.      700s.                56s.                        92s.\nC             14                84s.      300s.                24s.                        108s.\nTotal—        30                180s.     1,500s.              120s.                       300s.'], ['in the Tubinger Zeitschrift', 'in the Tübinger Zeitschrift'],
        // Chapter IV
        ['in self-contra-diction', 'in self-contradiction'], ['let it be-noticed', 'let it be noticed'], ['(See Das Ge/d, Berlin', '(See Das Geld, Berlin'],
        ['Kritik, Tiibingen, 1887', 'Kritik, Tübingen, 1887'], ['just as well:-have chosen?.an example', 'just as well have chosen an example'],
        ['be disregarded”»—these', 'be disregarded”—these'], ['position of “competttion i in the system', 'position of “competition” in the system'],
        ['given by tra- _ dition.”', 'given by tradition.”'], ['these pro- _ portions', 'these proportions'],
        ['(iii. 155 in connection with il.) 17 5 Séq.):', '(iii. 155 in connection with iii. 175 seq.).'],
        // Chapter V
        ['refuge left—+the thought', 'refuge left—the thought'], ['For example, i.25; Equivalent', 'For example, i. 25; Equivalent'], ['equivalent for ro lbs.', 'equivalent for 10 lbs.'],
        ['Pid.. Po S756 aT 52.', 'Ibid., p. 575.\n\n [*] I. 52.'], ['comes down over one’s head.” 2. Even', 'comes down over one’s head.”[*] Even'],
        ['Zur Kritik der chkonomischen System von Karl Marx, P- 574-', 'Zur Kritik der ökonomischen System von Karl Marx, p. 574.'],
        ['without any arritre pensée', 'without any arrière pensée'], ['of old oaktrees', 'of old oak-trees'], [' PR 7O%\n', ' P. 576.\n'],
        ['Ibid., pp. §74, 582.', 'Ibid., pp. 574, 582.'], ['part 4, PP: §71 seq.', 'part 4, pp. 571 seq.'], ['Ibid., pp. $91 seq.', 'Ibid., pp. 591 seq.'],
        ['Lbid., BD. 550:', 'Ibid., p. 556.'], ['standpoint of hisown method', 'standpoint of his own method'], ['complementary?”!)', 'complementary?”)'],
        ['[bid., Pp. 593-', 'Ibid., p. 593.'], ['[bid., pp. 443 seq.', 'Ibid., pp. 443 seq.'], ['given (Jéid., p. 564)', 'given (Ibid., p. 564)'],
        ['Of all sorts of scienee EOS d tific systems', 'Of all sorts of scientific systems'], ['“drop of social oil”? with', '“drop of social oil” with'],
        ['ideas will result. from this', 'ideas will result from this'],
        ['according to differences Error in the Marxian System My erg of quality', 'according to differences of quality'],
        // the margin's specks read as strokes ("how- | ever", "as_ his"), and other letters the OCR misread throughout
        ['withdraws itself, how- | ever,', 'withdraws itself, however,'], ['solely dy | the actual', 'solely by the actual'], [/ \| /, ' ', 6],
        ['sufficiency as_ his wages', 'sufficiency as his wages'], ['which yields a_ higher profit', 'which yields a higher profit'], ['from the _production', 'from the production'],
        ['supply? _ Or that', 'supply? Or that'], ['and pre-_ cisely then', 'and precisely then'], ['rather indefinite - statements', 'rather indefinite statements'],
        ['(iii. 175—-6)', '(iii. 175–6)'], [/i\.¢\.,/, 'i.e.,', 2], ['appears as an © immense', 'appears as an “immense'], ['there is no » “unskilled', 'there is no “unskilled'],
        ['value. « That I have toiled', 'value. “That I have toiled'], ['to the /oéa/ capital', 'to the total capital'], ['of {£50 is added', 'of £50 is added'],
        ['proportions of g to 1,', 'proportions of 9 to 1,'], ['The /aw of value', 'The law of value'], ['could not be /adour.', 'could not be labour.'],
        ['economic expression ” (p. 577)', 'economic expression” (p. 577)'], ['1 quarter wheat = I cwt. iron', '1 quarter wheat = 1 cwt. iron'],
        // Knies's equations, their unknowns in italic (a, c), which the OCR read as signs ("@", "¢")
        ['the equation, I quarter wheat=a cwts. wild grown wood = 4 acres of virgin soil = ¢ acres', 'the equation, 1 quarter wheat = a cwts. wild grown wood = 4 acres of virgin soil = c acres'],
        ['the equation, I quarter wheat = @ cwts. of forest-grown', 'the equation, 1 quarter wheat = a cwts. of forest-grown'], ['determined @ priori by', 'determined a priori by'],
        ['“* Let us examine now', '“Let us examine now'], ['labour “* counts', 'labour “counts'], ['capitals of /ower composition', 'capitals of lower composition'],
        ['sequence, the /Jaw of value', 'sequence, the law of value'], ['labour (sic /), and', 'labour (sic!), and'], ['« What then, we ask', '“What then, we ask'],
        ['“« The salient point', '“The salient point'], [':t «The cost price', '“The cost price'], ['“<The state of the case', '“The state of the case'],
        ['internal connection —<is not apposite', 'internal connection—is not apposite'], ['(iii. 1$5, 156)', '(iii. 155, 156)'], ['“© What would Marx', '“What would Marx'],
        ['the opinion, which |I have', 'the opinion, which I have'], [/B[bdéo]hm Bawerk/, 'Böhm Bawerk', 5],
        // words both scans misread alike, or the scan alone where the witness's reading is the edition's (each read again
        // in both): a word run into the next ("asa", "atime"), a broken word's hyphen kept, the italic "this" and "value"
        // with a stroke for a letter, "one" read "ove", the references' volumes and stops, the umlauts of German titles
        ['Engl Transl. 01893, pp.- 60 seq:)', 'Engl. Transl. 1893, pp. 60 seq.)'], ['the co-opera-tive', 'the co-operative', 2],
        ['of new systems.- General', 'of new systems. General'], [/(?<= )asa(?= )/, 'as a', 4], ['It isa kind', 'It is a kind'],
        ['price of production”? (ii. 136)', 'price of production” (iii. 136)'], ['are his- ‘torically the earlier', 'are historically the earlier'],
        ['vice versd.', 'vice versâ.'], ['to an ageregate which', 'to an aggregate which'], ['a triple homceopathic dilution', 'a triple homœopathic dilution'],
        ['Zur Kritik des ok. Systems', 'Zur Kritik des ök. Systems'], ['Zur Kritik des Okonomischen Systems', 'Zur Kritik des Ökonomischen Systems'],
        ['Zur Kritik des chonomischen Systems', 'Zur Kritik des ökonomischen Systems'], ['in proper proportions” (ie 2)):', 'in proper proportions” (i. 12).'],
        ['For any ove combination', 'For any one combination'], ['proportion”?; we therefore', 'proportion”; we therefore'], ["of his funda-' mental principle", 'of his fundamental principle'],
        ['viz., unskilled - labour.', 'viz., unskilled labour.'], ['its va/ue makes', 'its value makes'], ['For atime he', 'For a time he'],
        ['In order to “get “on the track aren value', 'In order to “get on the track” of value'], ['claims for /shis idea', 'claims for this idea'],
        ['ennuyeux.’ 1 allow', 'ennuyeux.” I allow'], ['the last resort” (iu. 188)', 'the last resort” (iii. 188)'],
        ['collection of commodities’?? And', 'collection of commodities”? And'],
        // the closing double mark after Marx's inner quotation, which the witness reads (“… time and place.’” Exchange value)
        ['time and place.’ Exchange value', 'time and place.’” Exchange value'], ['the “General Sections’” of', 'the “General Sections” of'],
        // The quotation marks: the edition sets a quotation in double marks (275 pairs as the OCR reads them), a quotation
        // inside one in single (11); where the OCR read an opening double mark as a single (‘…”) or a closing one as a single
        // (“…’), with no other mark between them, the pair is double.
        [/‘(?=[^“”‘’\n]{1,200}”)/, '“', 35], [/(?<=“[^“”‘’\n]{1,200})’(?![\p{L}])/u, '”', 29],
      ],
      // the half-title before Chapter I, and the running heads, their page numbers misread as often as not ("The Question
      // of the Contradiction a7", "Error in the Marxian System rz")
      furniture: [/^KARL MARX$/, /^(?:\S{1,4} )?(?:Preface|Prejace|Introduction|Karl\]? Marx|Kar! Marx)(?: \S{1,4})?$/,
        /^[_|]?\s*(?:\S{1,4} )?(?:Theory of Value|Average Rate of Prof\w*|The Question of the Contradiction|Error in the Marxian System|Werner Sombart.?s A ?pology)(?: \S{1,4})?$/],
      licence: 'Internet Archive scan karlmarxcloseofh0000euge, a copy of the London edition (T. Fisher Unwin, 1898), '
        + 'its OCR checked word by word against the OCR of a second copy (archive.org/details/karlmarxandclos00macdgoog, the University '
        + 'of Michigan’s, scanned by Google, which the Internet Archive’s record marks as not in copyright). No transcription is used. '
        + 'Chapter II’s two tables of Marx’s five capitals (iii. 132, 135) are not reproduced: their column headings are printed '
        + 'sideways, which neither scan’s OCR reads, and a note in the text marks where each stands. The words are the edition’s; '
        + 'the edition is in the public domain in the United States and is treated as free in Ireland (rights below).',
    },
    rights: {
      us: 'pd', uk: 'pd',
      // A person whose death date was not found after a reasonable search: who, what was searched and when, and whose
      // decision it is that the edition is treated as free on that basis (checkRights).
      unknown: [{
        name: 'Alice M. Macdonald',
        searched: 'the book itself (Bonar’s preface: “Mrs. Murray Macdonald desires to express her obligations …”); the Library of Congress '
          + 'name authorities; Wikidata; the Internet Archive’s records and the Online Books Page; HathiTrust record 001309786; the History '
          + 'of Parliament and Debrett’s House of Commons (1922), on J. A. Murray Macdonald, MP, who married Alice Mary Noel in 1885; '
          + 'web searches for her obituary and family. Not reached: the Online Library of Liberty and the National Library of Ireland '
          + 'catalogue (HTTP 403); the UK probate calendar and FreeBMD (search forms needing a year of death, not submitted)',
        checked: '2026-11-07',
        decision: 'the decision of Vitruvian Manager’s editor of 7 November 2026 (“accept upon reasonable search”)',
      }],
      basis: 'Eugen von Böhm-Bawerk died on 27 August 1914 and James Bonar, who wrote the preface, on 18 January 1941, so their terms in '
        + 'Ireland and the UK (life plus 70 years: Copyright and Related Rights Act 2000, s.24; CDPA s.12) ended on 31 December 1984 and '
        + '31 December 2011. The translator’s death date was not found after a reasonable search on 7 November 2026: Alice M. Macdonald, '
        + 'who signs as Mrs. Murray Macdonald (probably Alice Mary Macdonald, née Noel, who married J. A. Murray Macdonald in 1885), was '
        + 'looked for in the book itself, the Library of Congress name authorities, Wikidata, the Internet Archive’s records, the Online '
        + 'Books Page, HathiTrust, the History of Parliament and Debrett’s, and the newspaper and genealogy sources reachable on the web; '
        + 'the Online Library of Liberty, the National Library of Ireland catalogue and the probate indexes could not be reached. On that '
        + 'basis, by the decision of Vitruvian Manager’s editor of 7 November 2026, the translation is treated as free of copyright in '
        + 'Ireland; this is a judgement of risk, not a rule of law. The title page names Alice M. Macdonald alone as translator; Bonar’s '
        + 'preface thanks the author and Professor Wieser for revising her work in proof and Miss Louise Markup “for help in '
        + 'translation”, help acknowledged, not credited, so she is not treated as an author of the translation. Her death date was not '
        + 'found either (Wikidata and a web search for her name, 12 November 2026, found nothing); Friedrich von Wieser died in 1926. '
        + 'The translation was published in London by T. Fisher Unwin in 1898, '
        + 'and every work published before 1931 is in the public domain in the United States (HathiTrust classes the edition, record '
        + '001309786, as public domain). The text is from the Internet Archive’s scan of a copy of the London edition '
        + '(archive.org/details/karlmarxcloseofh0000euge), whose record gives no copyright status, read against a second copy '
        + '(archive.org/details/karlmarxandclos00macdgoog), the University of Michigan’s, scanned by Google, which the Internet Archive’s '
        + 'record marks as not in copyright. No transcription is used.',
      checked: '2026-11-07',
    },
    // Bonar's preface and the author's introduction share chapter 0, each under its title; five chapters numbered once
    // through, Chapter IV in three sections whose headings ("SECTION I", "SECTION 2", "SECTION 3", as both scans read
    // them) stand in it as printed. The title page, the contents and the printer's imprint go (`pages`). Chapter III's
    // two tables of the commodities A, B and C are set as tables; Chapter II's two tables of Marx's five capitals (from
    // iii. 132 and 135) are not here: their column headings are printed sideways, which neither OCR reads, and the
    // second's rows are read only in part (the text around them gives their sense and their totals); a note in brackets
    // stands in the place of each, and the edition's licence line says so.
    layout: {
      front: {
        title: 'Preface and introduction',
        pieces: [{ heading: /^PREFACE$/, title: 'Preface' }, { heading: /^INTRODUCTION$/, title: 'Introduction' }],
      },
      chapter: { heading: /^CHAPTER ([IVX]+)$/, title: 'block', count: 5 },
      notes: 'bracket', verse: false, tables: 'rows',
    },
    // Tagging decisions (see the Prince's for the form).
    decisions: {
      ...untag(...LATER_STATES),
      // Bonar writes the author's name unhyphenated, "Professor Böhm Bawerk"
      'Böhm-Bawerk': 'Q311535', 'Böhm Bawerk': 'Q311535', Marx: 'Q9061', Engels: 'Q34787', Smith: 'Q9381', Ricardo: 'Q160270', Hegel: 'Q9235',
    },
  },
  /* Wieser's Der natürliche Werth (Vienna, 1889) in Christian A. Malloch's translation, edited by William Smart: Natural
     Value (London and New York: Macmillan, 1893). Its transcriptions (Econlib's, the Online Library of Liberty's) carry
     their sites' own terms, so the text is the scan's own OCR (scan-text.mjs, `scan` with no `econlib`): the Internet
     Archive's scan of the University of California's copy, read against a second scan (Google's of a University of
     California copy, naturalvalue00smargoog), which puts the scan's misreadings right and is used for nothing else. The 1956 New York reprint is not used. Smart's
     "Analytical Table of Contents", the contents in detail, is a contents list and goes, as his "Analysis" of Capital and
     Interest does. The translator's death date was not found (rights below). */
  {
    slug: 'natural-value',
    title: 'Natural Value',
    author: { name: 'Friedrich von Wieser', qid: 'Q84482', born: 1851, died: 1926 },
    // "Mrs. Malloch", one of Smart's former students (his preface); no death date was found (rights.unknown).
    translator: { name: 'Christian A. Malloch', died: null },
    editors: [{ name: 'William Smart', died: 1915, role: 'editor; Editor’s preface, and the translation of the Author’s preface' }],
    // The work: Der natürliche Werth (Vienna, 1889). Its era runs from Menger's Grundsätze (1871), where the theory of
    // value it builds on begins, to the book.
    work: { qid: null, written: 1889, published: 1889 },
    era: [1871, 1889],
    published: 1893,
    edition: 'Christian A. Malloch’s translation, edited by William Smart (London and New York: Macmillan, 1893)',
    scan: {
      // the prefaces (10–41) and the text (52–294); not the title page, Smart's analytical table of contents (42–51) or
      // the printer's imprint
      // The witness is Google's scan of a University of California copy (naturalvalue00smargoog), whose OCR reads far
      // better than that of the University of Toronto's copy (naturalvalue00wiesuoft), which has whole pages torn into
      // letters; both are marked not in copyright.
      id: 'naturalvalue00wiesiala', pages: '10-41,52-294', witness: 'naturalvalue00smargoog',
      witnessDrop: [/^CHAP[.,]? \S+ .*\s\S{1,4}$/, /^\S{1,4} [A-Z][A-Z' ,.-]+ (?:book|BOOK|bouk) [ivxlhnIVX]+\.?$/, /^[xvil]+ (?:EDITOR|AUTHOR).?S PREFACE$/,
        /^(?:EDITOR|AUTHOR).?S PREFACE [xvil]+$/, /^\d{1,3}$/],
      // the running heads of the scan that stand below their place ("ORIGIN OF VALUE BOOK i", "132 THE IMPUTATION … BK. iii",
      // "CHAP. v AS COMPARED WITH ORDINARY VALUATION 241"), and a reader's pencilled scribbles in the margins (scribbles)
      furniture: [/^EDITOR.?S PREFACE$/, /^(?:\S{1,4} )?[A-Z][A-Z0-9' ,.:]+ (?:BOOK|BK\.|UK\.)[:.]? ?[ivxlhnIVXL1 ]{0,7}$/, /^CHAP[.,] \S{1,5}\b.*$/],
      scribbles: true,
      // words the scan lost inside a paragraph, under a scribble or a flaw, which the witness reads, go in (scan-text.mjs)
      fill: true,
      // the witness's OCR misreads more often than the scan's: a word the scan reads as a word stands, however low the
      // OCR's confidence in it ("far", "I", "resist", which the witness reads "fat", "T", "resists")
      trustScan: true,
      // a chapter's number and its title stand two lines and more apart: one heading
      headGap: 2.5,
      // the pages where the OCR lost a note's mark, ran it into a figure ("50 x 5 1.1" for "50 x 51.¹") or read it as a
      // letter ("goods l"); "h:l", the mark on a heading (Book V, Chapter XIII)
      marks: { 85: ['1.1'], 98: ['l', 'demand.2'], 111: ['l'], 150: ['8.1'], 192: [':'], 261: ['h:l'] },
      // The OCR's slips that the witness did not put right, each read again in both scans (the comments in the list say which)
      fix: [
        // The headings: the OCR reads this printing's capital R as E or K ("CHAPTEE", "KETUEN", "KICARDO'S"), a closing
        // bracket as a brace, and it lost four headings over pencilled pages or a flaw (the Author's Preface, Book I
        // Chapter IV, Book III Chapter XIX, Book V's title page; each as both the witness and the running heads give it), and
        // three chapters' numbers (Book III Chapter VI, Book V Chapter XIII, Book VI Chapter V). A title of two lines set
        // apart, and a chapter's first words run into its title, are put back where they stand.
        [/CHAP ?TE[EK](?= [IVXL]+\n)/, 'CHAPTER', 42], ['EDITOB\'S PKEFACE', 'EDITOR\'S PREFACE'],
        ['GLASGOW, 1893.\n\nIT has been said', 'GLASGOW, 1893.\n\nAUTHOR\'S PREFACE\n\nIt has been said'],
        ['F. WIESEE.', 'F. WIESER.'], ['THE ELEMENTARY THEOEY OF VALUE', 'THE ELEMENTARY THEORY OF VALUE'], ['THE OEIGIN OF VALUE', 'THE ORIGIN OF VALUE'],
        ['from hunger to love. IF we were to follow', 'from hunger to love.\n\nCHAPTER IV\nTHE SCALES OF SATIATION\n\nIf we were to follow'],
        ['THE VALUATION OF GOODS IN STOCKS. THE LAW OF MAEGINAL\n\nUTILITY THE GENERAL LAW OF VALUE', 'THE VALUATION OF GOODS IN STOCKS. THE LAW OF MARGINAL\nUTILITY THE GENERAL LAW OF VALUE'],
        [/(?<=CHAPTER [IVXL]+)\n\n(?=THE VALUATION OF GOODS IN STOCKS)/, '\n'],
        ['EXCHANGE VALUE AND NATUEAL VALUE', 'EXCHANGE VALUE AND NATURAL VALUE'],
        ['BOOK III\n\nTHE NATUEAL IMPUTATION OF THE KETUEN\n\nFEOM PEODUCTION\n\nPART I\nTHE GENEEAL PRINCIPLES OF IMPUTATION\n\nCHAPTER I\nEETUEN VALUE\n\nPkoduction goods',
          'BOOK III\nTHE NATURAL IMPUTATION OF THE RETURN FROM PRODUCTION\n\nCHAPTER I\nRETURN VALUE\n\nPART I. THE GENERAL PRINCIPLES OF IMPUTATION\n\nProduction goods'],
        ['CHAPTER III\n\nTHE SOCIALIST READING OF THE PROBLEM. THE CLAIM OF THE\n\nLABOURER TO THE ENTIRE RETURN', 'CHAPTER III\nTHE SOCIALIST READING OF THE PROBLEM. THE CLAIM OF THE\nLABOURER TO THE ENTIRE RETURN'],
        ['PEEVIOUS ATTEMPTS AT SOLUTION', 'PREVIOUS ATTEMPTS AT SOLUTION'],
        ['CHAPTER V\n\nTHE PRINCIPLE OF SOLUTION. THE PRODUCTIVE CONTRIBUTION SUPPOSE that a hunter', 'CHAPTER V\nTHE PRINCIPLE OF SOLUTION. THE PRODUCTIVE CONTRIBUTION\n\nSuppose that a hunter'],
        ['\n\nTHE PRINCIPLE OF SOLUTION (CONTINUED}. CONTRIBUTION\nAND CO-OPERATION', '\n\nCHAPTER VI\nTHE PRINCIPLE OF SOLUTION (CONTINUED). CONTRIBUTION\nAND CO-OPERATION'],
        ['THE INDIVIDUAL FACTOES OF IMPUTATION', 'THE INDIVIDUAL FACTORS OF IMPUTATION'], ['THE INDIVIDUAL FACTOKS OF IMPUTATION', 'THE INDIVIDUAL FACTORS OF IMPUTATION', 2],
        ['IMPUTATION (CONTINUED).\n\nIV. THE IMPUTATION TO COST GOODS AND TO MONOPOLY GOODS WHAT has been said', 'IMPUTATION (CONTINUED).\nIV. THE IMPUTATION TO COST GOODS AND TO MONOPOLY GOODS\n\nWhat has been said'],
        ['CHAPTER XIII\n\nTHE INDIVIDUAL FACTORS OF IMPUTATION (continued}. V.— THE IMPUTATION TO PRODUCTIVE FACTORS OF PREFERABLE\n\nQUALITY\n\nOF two production',
          'CHAPTER XIII\nTHE INDIVIDUAL FACTORS OF IMPUTATION (CONTINUED). V.—THE IMPUTATION TO PRODUCTIVE FACTORS OF PREFERABLE QUALITY\n\nOf two production'],
        ['PART II\nNATURAL LAND KENT\n\nCHAPTER XIV\nKICARDO\'S DIFFERENTIAL RENT: THE FIRST PART\n\nKicardo, in his famous', 'CHAPTER XIV\nRICARDO\'S DIFFERENTIAL RENT: THE FIRST PART\n\nPART II. NATURAL LAND RENT\n\nRicardo, in his famous'],
        ['CRITICISM OF RICAEDO\'S THEORY', 'CRITICISM OF RICARDO\'S THEORY'],
        ['PART III\nTHE NATURAL RETURN TO CAPITAL\n\nCHAPTER XVII\nTHE PRODUCTIVITY OF CAPITAL\n\n', 'CHAPTER XVII\nTHE PRODUCTIVITY OF CAPITAL\n\nPART III. THE NATURAL RETURN TO CAPITAL\n\n'],
        ['CHAPTER XVIII\n\nTHE CALCULATION OF RETURN TO CAPITAL IN PRIMITIVE AND\n\nIN DEVELOPED ECONOMIES', 'CHAPTER XVIII\nTHE CALCULATION OF RETURN TO CAPITAL IN PRIMITIVE AND\nIN DEVELOPED ECONOMIES'],
        ['developed modern capital?\n\nWE have said that capital', 'developed modern capital?\n\nCHAPTER XIX\nTHE IMPUTATION OF GROSS RETURN AND OF NET RETURN\n\nWe have said that capital'],
        ['BOOK IV\n\nTHE NATURAL VALUE OF LAND, CAPITAL,\n\nAND LABOUR', 'BOOK IV\nTHE NATURAL VALUE OF LAND, CAPITAL,\nAND LABOUR'],
        ['CAPITAL\n(CONTINUED}. II. — THE RATE OF INTEREST', 'CAPITAL\n(CONTINUED). II.—THE RATE OF INTEREST'],
        ['CHAPTER IV\n\nTHE VALUE OF CAPITAL AND THE INTEREST ON CAPITAL (continued).      III. THE LAW OF THE UNIFORM CALCULATION\n\nOF THE INTEREST RATE',
          'CHAPTER IV\nTHE VALUE OF CAPITAL AND THE INTEREST ON CAPITAL (CONTINUED). III.—THE LAW OF THE UNIFORM CALCULATION OF THE INTEREST RATE'],
        ['CHAPTER V\n\nTHE VALUE OF CAPITAL AND THE INTEREST ON CAPITAL (con-\n\nTINUED).      IV. CHANGE IN THE RATE OF INTEREST',
          'CHAPTER V\nTHE VALUE OF CAPITAL AND THE INTEREST ON CAPITAL (CONTINUED). IV.—CHANGE IN THE RATE OF INTEREST'],
        ['(CONTINUED). V. — THE VALUATION OR FIXED CAPITAL', '(CONTINUED). V.—THE VALUATION OF FIXED CAPITAL'], ['(CONTINUED). VI. — CAPITALISATION', '(CONTINUED). VI.—CAPITALISATION'],
        ['INTEREST ON THE CONSUMPTION LOAN. HOUSE EEXT', 'INTEREST ON THE CONSUMPTION LOAN. HOUSE RENT'],
        ['\n\nCHAPTER I\nTHE LAW OF COSTS\n\n', '\n\nBOOK V\nTHE NATURAL COST VALUE OF PRODUCTS\n\nCHAPTER I\nTHE LAW OF COSTS\n\n'],
        ['THE LAW OF COSTS AND THE GENEKAL LAW OF VALUE', 'THE LAW OF COSTS AND THE GENERAL LAW OF VALUE'], ['Whatevek economic', 'Whatever economic'],
        [/\(CONTINUED\}/, '(CONTINUED)', 5],
        ['THE SEKVICE OF INDIVIDUAL ECONOMIC VALUE IN\nNATIONAL ECONOMY L', 'THE SERVICE OF INDIVIDUAL ECONOMIC VALUE IN\nNATIONAL ECONOMY'],
        ['VALUE IN THE NATUKAL ECONOMY OF THE STATE', 'VALUE IN THE NATURAL ECONOMY OF THE STATE'],
        ['\n\nPRINTED BY R. & R. CLARK, EDINBURGH.\n', '\n'],
        // a book's or a chapter's title set apart from its number, and a title's second line from its first
        [/(?<=^(?:BOOK|CHAPTER) [IVXL]+)\n\n(?=[A-Z][^a-z\n]*$)/m, '\n', 5],
        [/(?<=^(?:BOOK|CHAPTER) [IVXL]+\n[A-Z][^a-z\n]*(?: THE| AND| OF| IN|,))\n\n(?=[A-Z][^a-z\n]*$)/m, '\n', 1],
        // The capital R read as E, K, B or P in the text too ("Eicardo", "Eobinson"), "w" read as "Av", and the shelf's
        // spelling of the Austrians' names, which this OCR reads without the umlaut or with another letter for it
        [/(?<![\p{L}])[EKBP](?=icardo)/u, 'R', 27], [/Pdcardo|Pueardo/, 'Ricardo', 2],
        ['Eegeln', 'Regeln'], [/(?<![\p{L}])Eent(?![\p{L}])/u, 'Rent', 2], ['Eobinson', 'Robinson', 3], ['Eodbertus', 'Rodbertus', 2], ['Natural Ptights', 'Natural Rights'],
        [/(?<![\p{L}])Av(?=ho|ill|ith|orn)(?=\p{Ll}+(?![\p{L}]))/u, 'w', 6],
        [/Bb'hm-Bawerk/, 'Böhm-Bawerk', 2], [/(?<![\p{L}])B[bo]hm(?![\p{L}])/u, 'Böhm', 29], ['Böhm - Bawerk', 'Böhm-Bawerk', 4],
        [/(?<![\p{L}])(?:Monger|Meuger)(?=[’',.]|\s)/u, 'Menger', 3],
        [/Thtinen|Thiinen/, 'Thünen', 8], ['Isolirtcr', 'Isolirter'], [/Urspntng|Urspruny/, 'Ursprung', 2], [/Werthcs/, 'Werthes', 3],
        ['Gnindsdtze', 'Grundsätze'], ['Grundsdtze der Volkswirthschaftslehre', 'Grundsätze der Volkswirthschaftslehre'],
        ['oiir', 'our'], ['iised.', 'used.'], ['witli', 'with'], ['eacli', 'each'], [/(?<![\p{L}])rny(?![\p{L}])/u, 'my'], [/(?<![\p{L}])rne(?![\p{L}])/u, 'me', 1],
        ['the whole worjd according', 'the whole world according'], ['oll\'enee', 'offence'], ['measured fret1 trade', 'measured free trade'],
        ['costs of tinfactory\'s products', 'costs of the factory\'s products'], ['decide for them!I In the end', 'decide for them! In the end'],
        ['no part of free goods receives value;J neither', 'no part of free goods receives value; neither'],
        // the Author's Preface and its notes: two notes the OCR ran together, the mark of the second lost; the titles' letters
        ['and Leon Walras Gossen\'s statement', 'and Leon Walras.[*] Gossen\'s statement'], ['Vienna, 1871. 5 fiUments d\'economie politique pure ou Theorie de', 'Vienna, 1871.\n\n [*] Éléments d\'économie politique pure ou Théorie de'],
        ['Lausanne, 1874-77. — Thtorie mathtmatique de', 'Lausanne, 1874–77.—Théorie mathématique de'], ['Lausanne, 1883. — Thtorie de la Monnaie', 'Lausanne, 1883.—Théorie de la Monnaie'],
        ['his “concrete Gcbrauchswerth”', 'his “concrete Gebrauchswerth”'], ['emolumentum qfferre suinmae bonorum', 'emolumentum afferre summae bonorum'],
        ['des menschlichen Verlxhrs und dsr daraus fliessenden Regelnfur das', 'des menschlichen Verkehrs und der daraus fliessenden Regeln für das'],
        ['Leerboek der staathuishaiuikunde', 'Leerboek der staathuishoudkunde'], ['Principes d\'iconomie politique', 'Principes d\'économie politique'],
        ['Mathematische Begriindung dcr Volkswirthschaftslehrc', 'Mathematische Begründung der Volkswirthschaftslehre'], ['Grundziige der Theorie des wirthschaftlichen Giiterwerths. Conrad\'s Jahrbiicher', 'Grundzüge der Theorie des wirthschaftlichen Güterwerths. Conrad\'s Jahrbücher'],
        ['His Untwicldung der Gesetze des menscklicken Verkehrs und der darausfiiessenden Regeln fur', 'His Entwicklung der Gesetze des menschlichen Verkehrs und der daraus fliessenden Regeln für'],
        ['a Copernicau fame Any one', 'a Copernican fame. Any one'], ['Journal des Ewrwmutes', 'Journal des Economistes'],
        ['de la Richesse et de I\'Origine de la Valeur', 'de la Richesse et de l\'Origine de la Valeur'], ['Dupuit\'s De I\'influence des Peages', 'Dupuit\'s De l\'influence des Péages'],
        // Book I. Chapter III, pp. 8–9 of the edition: the scan's copy has a long pencilled note over these lines, which the
        // OCR broke into pieces and in part lost; they are as the witness reads them, its slips put right
        ['merit of having independently of each other', 'merit of having, independently of each other'],
        ['was published in Brunswick in 854, but it almost entirely disappeared from sight in Germany although', 'was published in Brunswick in 1854, but it almost entirely disappeared from sight in Germany, although'],
        ['as of its faults — both of which are great.', 'as of its faults, — both of which are great.'],
        [/Jevons, in the introduction to the I edition[^]*?\n\nwants, which recur periodically, as, for instance, the /,
          'Jevons, in the introduction to the second edition of his Theory of Political Economy, and also Walras, in an essay which appeared in the Journal des Economistes in 1885, have given somewhat detailed accounts of both book and author. Economics owes a great debt to Gossen, and it is with this feeling that I call the law of the satiation of want Gossen\'s Law, although my statement of it is not entirely in accordance with his.\n\nIt scarcely requires illustration. Gossen himself added to its clearness by the following addition. Alongside of the weakening effect which continued satisfaction has upon desire, we find also, in certain circumstances, the opposite tendency; that the desire grows by repetition and exercise, inasmuch as it is thus developed, gets to know itself, its own end and its own means, becomes purified and elevated. Thus, during the period of development, the law of diminishing desire meets with an opposite tendency, and the law applies unlimitedly only to wants which are entirely developed. Granting this, however, it applies to every want without exception.\n\nThere can be no doubt that it applies to those coarser material wants, which recur periodically, as, for instance, the '],
        // Book III, Chapter IV: its third note run into the second, its mark read as a figure
        ['return of 10. - The other attempts at solution', 'return of 10.\n\n [*] The other attempts at solution'], ['secured by its possession.2\n', 'secured by its possession.[*]\n'],
        // Book III, Chapter XII: a short note set centred, which the OCR took for a heading
        ['calculations of cost.1 They', 'calculations of cost.[*] They'], ['\n\n, * SEE BELOW, BOOK V.\n\n', '\n\n [*] See below, Book V.\n\n'],
        // specks, stray signs and broken letters of the scan, each read again in the witness
        ['spoken of as “want }>: the want as', 'spoken of as “want”: the want as'], ['because its ^usefulness is', 'because its usefulness is'],
        ['the community has had, \\we may assume,', 'the community has had, we may assume,'],
        ['\n\n,•*\n\n', '\n\n'], ['accurately describes ^^o\\ne trade', 'accurately describes one trade'], ['according to Menger*s definition', 'according to Menger\'s definition'],
        [/(?<=the wounds of poverty\.\[\d+\]) «\./, ''], ['\n\n• No productive', '\n\nNo productive'], ['if lie did not know. Happily', 'if he did not know. Happily'],
        ['calculating the contributions. «', 'calculating the contributions.'],
        ['greater “rentability “• —to use', 'greater “rentability”—to use'], ['\n\n*/ t/\n\n', '\n\n'], ['to touch at* least upon', 'to touch at least upon'],
        ['the interest is -£$g of the capital value', 'the interest is 1/20 of the capital value'], ['must first be made from* the gross', 'must first be made from the gross'],
        ['The conflict which \\we may observe', 'The conflict which we may observe'], ['paves the way for\\ \\ politics', 'paves the way for politics'],
        ['exemption from the * physical', 'exemption from the physical'],
        ['Whence do things get their value-?', 'Whence do things get their value?'],
        // figures the OCR read with spaces between their digits, and an x read as "a?"
        ['the successful result at 1 0 0; all', 'the successful result at 100; all'], ['lies in the equation a?+y = 100.', 'lies in the equation x + y = 100.'],
        ['residual value of 1 0 0 transformed', 'residual value of 100 transformed'], ['If a return of 1 0 5 can be', 'If a return of 105 can be'],
        ['THE INTEREST ON CAPITAL\n\n(CONTINUED). V.—THE VALUATION OF FIXED CAPITAL', 'THE INTEREST ON CAPITAL\n(CONTINUED). V.—THE VALUATION OF FIXED CAPITAL'],
        ['to indi- A\'idual factors', 'to individual factors'], ['originating;\n\nf JL \' O O from value', 'originating from value'], ['Die Positive TJicorie des', 'Die Positive Theorie des'],
        ['according to tlu> measure', 'according to the measure'], ['Böhm-Bawerk\'s Wcrth, p. 510', 'Böhm-Bawerk\'s Werth, p. 510'], ['too\'great as regards', 'too great as regards'],
        // Book I
        ['viz. sixteen (S x 2 and 4 x 4)', 'viz. sixteen (8 x 2 and 4 x 4)'], ['“Werth des Ictztcn Atoms”', '“Werth des letzten Atoms”'], ['“<Final degree of utility,”', '“Final degree of utility,”'],
        ['dernier bcsoin satis/ait (rarett)”', 'dernier besoin satisfait (rareté)”'], ['plays the r6le so readily', 'plays the rôle so readily'], ['own raison d\'etre', 'own raison d\'être'],
        ['“value in use” (Gebrauchswcrth)', '“value in use” (Gebrauchswerth)'], ['Werththeorien und Jferthgesclz, in Conrad\'s Jahrbucfier', 'Werththeorien und Werthgesetz, in Conrad\'s Jahrbücher'],
        ['common Productionsvei^wandt, which', 'common Productionsverwandt, which'], ['is paid 1 5s. a week', 'is paid 15s. a week'],
        // Book I, Chapter X: the tables of a stock of eleven goods, as both scans read their figures (3 x 8, which both read
        // "8x8", as the product 24 under it has it); the third table's label, set beside a brace, neither scan reads, and its
        // two rows of figures stand without it
        ['When he has 123456789 10 11\n\nthe value is 1x10 2x9 8x8 4x7 5x6 6x5 7x4 8x3 9x2 10x1 11x0 units of value.\n\n= 10 18 24 28 30 30 28 24 18 10 0',
          'When he has    1    2    3    4    5    6    7    8    9    10    11    goods,\nthe value is    1 x 10    2 x 9    3 x 8    4 x 7    5 x 6    6 x 5    7 x 4    8 x 3    9 x 2    10 x 1    11 x 0    units of value.\n    =    10    18    24    28    30    30    28    24    18    10    0'],
        ['With 123456789 10 11 goods, there will be 10 9876543210 units of value.', 'With    1    2    3    4    5    6    7    8    9    10    11    goods,\nthere will be    10    9    8    7    6    5    4    3    2    1    0    units of value.'],
        [/With 12 34 5 67 89 10 11 goods, \* hne>talho 19 27 34 40 45 49 52 54 55 55 f ™j\* mentis \( \(10\+9\)\(19\+8\)\(27\+'7\)\(34\+6\)<40\+5\)\(45\+4\)\(49\+3\)\(52\+2\)\(54\+1\)\(55\+0\)1 vaiue /,
          'With    1    2    3    4    5    6    7    8    9    10    11    goods,\n    10    19    27    34    40    45    49    52    54    55    55\n    (10 + 9)    (19 + 8)    (27 + 7)    (34 + 6)    (40 + 5)    (45 + 4)    (49 + 3)    (52 + 2)    (54 + 1)    (55 + 0)\n\n'],
        ['With a stock of 1 23456789 10 H goods, the minus is 0 1 3 6 10 15 21 28 36 45 55 units of value.', 'With a stock of    1    2    3    4    5    6    7    8    9    10    11    goods,\nthe minus is    0    1    3    6    10    15    21    28    36    45    55    units of value.'],
        ['123456789 10 11 GOODS.\n\nPositive ( +) 10 19 27 34 40 45 49 52 54 55 55 units of value. Negative (-) 0 1 3 6 10 15 21 28 36 45 55\n\nResidual ( +) 10 18 24 28 30 30 28 24 18 10 0',
          '    1    2    3    4    5    6    7    8    9    10    11    goods.\nPositive (+)    10    19    27    34    40    45    49    52    54    55    55    units of value.\nNegative (−)    0    1    3    6    10    15    21    28    36    45    55\nResidual (+)    10    18    24    28    30    30    28    24    18    10    0'],
        // Book III, Chapter V: the equations, which the OCR set in capitals as a heading; Chapters XIV and XV, Ricardo's
        // returns, set in capitals the same way, the ditto marks as the witness reads them and the sign "∴" as the scan does
        ['equation x + y = 100, the following:—\n\nX + Y = 100.\n2Z + 3Z = 290.\n4Y + 5Z = 590.', 'equation x + y = 100, the following:—\n\nx + y = 100.\n2x + 3z = 290.\n4y + 5z = 590.'],
        ['equalition: — x + y=IQQ.', 'equalition: — x + y = 100.'],
        // the low-confidence words where the witness's reading is the edition's ("for", "class", "account", "gives",
        // "land", "off"), and the readings both scans have wrong ("Ursprung and", "Ib." for lb., "into Banks")
        ['Wieser\'s Ursprung and Hauptgesetze', 'Wieser\'s Ursprung und Hauptgesetze'], ['the things far which they exchange', 'the things for which they exchange'],
        ['Ib. of coal', 'lb. of coal', 2], ['confined to the c/a*.s of which', 'confined to the class of which'], ['as well on count of the peculiarities', 'as well on account of the peculiarities'],
        ['into Ranks, and value', 'into ranks, and value'], ['he divides oft\' all those', 'he divides off all those'], ['and wives him at the same time', 'and gives him at the same time'],
        ['The more fertile laud, the land', 'The more fertile land, the land'], ['in Book I. chapter XL\n', 'in Book I. chapter xi\n'],
        ['OF THE 1ST QUALITY PRODUCE A RETURN OF 120 QRS. WITH A VALUE OF £240,\nOF THE 2ND „ „ „ 100 „ “ “200,\nOF THE 3RD „ „ “80 „ „ “160,',
          'of the 1st quality produce a return of 120 qrs. with a value of £240,\nof the 2nd    „    „    „    100    „    „    „    200,\nof the 3rd    „    „    „    80    „    „    „    160,'],
        ['TO A FIRST £200 OF EXPENSES THE RETURN IS 120 QRS., AND THE VALUE £240.\n\nto a second £200 “ “100 “    „    200.\n\n~7\\ TO £400 ~ ~ 220 “ ~ 440L\nTO A THIRD £200 „ 80 “ „ 160.\n. \'. TO £600 ~ ~ 300 “ ~ 600T',
          'to a first £200 of expenses the return is 120 qrs., and the value £240.\nto a second £200    „    „    100    „    „    200.\n∴ to £400    „    „    220    „    „    440.\nto a third £200    „    „    80    „    „    160.\n∴ to £600    „    „    300    „    „    600.'],
        ['combination 10a-|- 1 Ob + lOc possesses', 'combination 10a + 10b + 10c possesses'],
        // the per cent sign, which the OCR reads "°/Q" or "°/o"; stops the OCR read in specks before a word or between two;
        // compounds whose hyphen it set apart, and a dash it read as a hyphen; "chap." read "chap,"; and other letters
        // both scans or the scan alone misread ("u-nits", "hy", "riot", "versd" for the italic â of "vice versâ")
        [/°\/[Qo]/, '%', 12], ['the sensation .of. want', 'the sensation of want'], [/(?<= )\.(?=\p{Ll})/u, '', 6], [/(?<=\p{Ll}) \.(?= \p{Ll})/u, '', 2],
        ['high - water', 'high-water'], ['would - be buyers', 'would-be buyers'], ['newly - acquired', 'newly-acquired'], ['over - congested', 'over-congested'],
        ['re - employed', 're-employed'], ['far - reaching', 'far-reaching'], ['employing it productively - cannot', 'employing it productively — cannot'],
        ['non- satisfaction', 'non-satisfaction'], ['inter- competition', 'inter-competition'], ['consumption- wealth', 'consumption-wealth'],
        ['income- winning', 'income-winning'], ['high- water', 'high-water'], ['once- established', 'once established'], ['exceptional circumstances- that', 'exceptional circumstances that'],
        ['10 u-nits', '10 units'], ['choice of obje\'cts', 'choice of objects'], ['their own\'utility', 'their own utility'], ['lOa+lOb+lOc', '10a + 10b + 10c', 2],
        ['overwhelmingly large,- — as a rule, and in the] long run', 'overwhelmingly large, — as a rule, and in the long run'], ['possible return of £200.- From', 'possible return of £200. From'],
        ['or hy calculating', 'or by calculating'], ['riot having', 'not having'], ['so longas', 'so long as'], ['its rdle', 'its rôle'],
        ['vice, versd', 'vice versâ'], ['vice versd', 'vice versâ', 4], [/(?<=Book [IV]+\. )chap, (?=[xvil]+\b)/, 'chap. ', 10],
        ['Principles of Economics, “2nd edit.', 'Principles of Economics, 2nd edit.'], ['Isolirter Stoat', 'Isolirter Staat'],
        // Book IV, Chapter II's title of two lines, its item "I. DISCOUNTING" on the second: one title with its stop, as
        // Book III, Chapter IX's "THE INDIVIDUAL FACTORS OF IMPUTATION. I. SUPPLY" is printed
        ['THE INTEREST ON CAPITAL\nI. DISCOUNTING\n', 'THE INTEREST ON CAPITAL. I. DISCOUNTING\n'],
        // Book II, Chapter II: a speck both scans read as "1" in the broken word, and the first note's mark, read "l",
        // left against its word; a dash read as a hyphen, a compound broken at a line's end and set apart, and a
        // pencilled stroke read as letters ("ol w"), each read again in the witness
        ['possessions other- 1 wise', 'possessions otherwise'], ['other goods l[', 'other goods['], ['up grade,”- and', 'up grade,” — and'],
        ['Böhm- Bawerk', 'Böhm-Bawerk', 2], ['influences ol w national', 'influences of national'],
      ],
      licence: 'Internet Archive scan naturalvalue00wiesiala, the University of California’s copy of the London edition (Macmillan, 1893), '
        + 'its OCR checked word by word against the OCR of a second scan (archive.org/details/naturalvalue00smargoog, a University of '
        + 'California copy scanned by Google); the Internet Archive’s records mark both as not in copyright. No transcription is used. The words are the edition’s; '
        + 'the edition is in the public domain in the United States and is treated as free in Ireland (rights below).',
    },
    rights: {
      us: 'pd', uk: 'pd',
      unknown: [{
        name: 'Christian A. Malloch',
        searched: 'the book itself (Smart’s preface: the translation was put “into the hands of one of my former students”, and “the translation '
          + 'is Mrs. Malloch’s”); the Library of Congress name authorities (nr94005253, “Malloch, Christian”, no dates; its sources Lyrics from '
          + 'the French, 1919, and the British Library catalogue); the University of Pennsylvania’s catalogue; Wikidata; the Online Books Page; '
          + 'HathiTrust records 006593883, 103385327 and 009077899; web searches for her with Glasgow, Queen Margaret College and Smart. Not '
          + 'reached: the Archives Hub description of Smart’s papers (did not load); the UK probate calendar (a search form needing a year of '
          + 'death, not submitted)',
        checked: '2026-11-07',
        decision: 'the decision of Vitruvian Manager’s editor of 7 November 2026 (“accept upon reasonable search”)',
      }],
      basis: 'Friedrich von Wieser died on 22 July 1926 and William Smart, who edited the translation, wrote its preface and translated the '
        + 'author’s, on 19 March 1915, so their terms in Ireland and the UK (life plus 70 years: Copyright and Related Rights Act 2000, s.24; '
        + 'CDPA s.12) ended on 31 December 1996 and 31 December 1985. The translator’s death date was not found after a reasonable search on '
        + '7 November 2026: Christian A. Malloch (Mrs. Malloch, a former student of Smart’s, perhaps the Christian Malloch of Lyrics from the '
        + 'French, 1919) was looked for in the book itself, the Library of Congress name authorities, the University of Pennsylvania’s '
        + 'catalogue, Wikidata, the Online Books Page, HathiTrust, and the sources reachable on the web; the Archives Hub description of '
        + 'Smart’s papers did not load and the probate indexes could not be searched. On that basis, by the decision of Vitruvian Manager’s '
        + 'editor of 7 November 2026, the translation is treated as free of copyright in Ireland; this is a judgement of risk, not a rule of '
        + 'law. The translation was published in London and New York by Macmillan in 1893, and every work published before 1931 is in the '
        + 'public domain in the United States (HathiTrust classes the edition, records 006593883 and 103385327, as public domain). The text '
        + 'is from the Internet Archive’s scan of the University of California’s copy (archive.org/details/naturalvalue00wiesiala), read '
        + 'against a second scan (archive.org/details/naturalvalue00smargoog), a University of California copy scanned by Google; the '
        + 'Internet Archive’s records mark both as not in copyright. No transcription is used.',
      checked: '2026-11-07',
    },
    // Smart's preface (0, Glasgow, 1893) and the author's (1, translated by Smart); six books of chapters numbered within
    // each (n = book × 100 + chapter), Book III's nineteen in three parts, each part's heading ("PART II", and its title)
    // opening its first chapter, as printed.
    layout: {
      end: /^THE END$/,
      sections: [
        { heading: /^EDITOR.S PREFACE$/, n: 0, title: 'Editor’s preface' },
        { heading: /^AUTHOR.S PREFACE$/, n: 1, title: 'Author’s preface' },
      ],
      part: { heading: /^BOOK ([IVX]+)$/, label: 'Book', title: 'block', count: 6 },
      chapter: { heading: /^CHAPTER ([IVXL]+)$/, title: 'block', within: true, count: 66 },
      // (the name keeps its capital in Book III, Chapter XVI's title, "CRITICISM OF RICARDO'S THEORY", though the text
      // writes it with its curled apostrophe only: titleCase looks a word up with either form)
      notes: 'bracket', verse: false, tables: 'rows',
    },
    // Tagging decisions (see the Prince's for the form).
    decisions: {
      ...untag(...LATER_STATES),
      'Böhm-Bawerk': 'Q311535', Menger: 'Q84177', Smith: 'Q9381', Ricardo: 'Q160270', Marx: 'Q9061', Malthus: 'Q13526',
      // Jevons's "paper before the British Association" is no material; Walras's Éléments are not Euclid's
      ...untag('paper', 'Éléments', 'Elements'),
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
    reasons the book is clear; throws otherwise.
    A person whose death date could not be found (`died: null`) passes only with a record of the search in
    `rights.unknown` ({ name, searched, checked, decision }: what was searched, the day, and whose decision it is that the
    edition is treated as free on that basis) and a basis that says in words that the date was "not found after a
    reasonable search"; the edition must also be one the US test clears by its date. This is the editor's decision of
    7 November 2026 for two translators of the 1890s (Alice M. Macdonald, Christian A. Malloch): a judgement of risk, not
    a rule of law, and the record says so. */
export function checkRights(entry, year = new Date().getUTCFullYear()) {
  const r = entry.rights || {};
  if (r.us !== 'pd' || r.uk !== 'pd') throw new Error(`${entry.slug}: rights are ${r.us || '?'} (US) / ${r.uk || '?'} (UK), not pd/pd; the book is not written`);
  if (!r.basis || !r.checked) throw new Error(`${entry.slug}: the rights finding needs a basis in words and the date it was checked`);
  const reasons = [];
  // A year BC is negative (Thucydides died in 395 BC: -395); the rule is the same, and says so in the right era.
  const y = n => (n < 0 ? `${-n} BC` : String(n));
  for (const who of [entry.author, entry.translator, ...(entry.editors || [])].filter(Boolean)) {
    const unknown = who.died === null && (r.unknown || []).find(u => u.name === who.name);
    if (unknown) {
      if (!unknown.searched || !/^\d{4}-\d{2}-\d{2}$/.test(unknown.checked || '') || !unknown.decision) throw new Error(`${entry.slug}: the search for ${who.name}'s death date needs what was searched, the day and the decision`);
      if (!r.basis.includes(who.name) || !/not found after a reasonable search/.test(r.basis)) throw new Error(`${entry.slug}: the basis must say that ${who.name}'s death date was not found after a reasonable search`);
      reasons.push(`${who.name}: death date not found after a reasonable search (${unknown.checked}); treated as free by ${unknown.decision}`);
      continue;
    }
    if (!Number.isFinite(who.died)) throw new Error(`${entry.slug}: ${who.name} has no death year, so the UK term cannot be checked`);
    if (who.died + 70 >= year) throw new Error(`${entry.slug}: ${who.name} died in ${who.died}, so the UK term runs to 31 December ${who.died + 70}; the finding "uk: pd" is wrong`);
    reasons.push(`${who.name} died ${y(who.died)}: UK term ended 31 December ${y(who.died + 70)}`);
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
    terms }, plus the era, the translator and the paragraph count, which a shelf card can show, and for one volume of a
    work in several its `set` ({ slug, title, volume, volumes }: the six rows of The Decline and Fall share one). */
export function indexEntry(book) {
  const paragraphs = book.chapters.flatMap(c => c.paragraphs);
  return {
    // a co-author (an editor whose part is "co-author …": Engels, of the Manifesto) is named with the author
    slug: book.slug, title: book.title,
    author: [book.author.name, ...(book.editors || []).filter(e => /^co-author/.test(e.role || '')).map(e => e.name)].join(' and '),
    translator: book.translator?.name || null,
    year: book.work.published, era: book.era,
    words: paragraphs.reduce((n, p) => n + wordCount(p.text), 0),
    chapters: book.chapters.length, paragraphs: paragraphs.length,
    terms: paragraphs.reduce((n, p) => n + p.terms.length, 0),
    generated: book.generated,
    ...(book.set ? { set: { ...book.set } } : {}),
  };
}

export function writeIndex() {
  const books = SHELF.filter(b => existsSync(bookPath(b.slug))).map(b => indexEntry(readBook(b.slug)));
  mkdirSync(DATA, { recursive: true });
  writeFileSync(INDEX, JSON.stringify({ generated: new Date().toISOString(), books }, null, 1) + '\n');
  return books;
}
