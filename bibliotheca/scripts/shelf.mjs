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
    // ends in 476), so the bare word is left untagged; the Roman Empire under its own name is still a term.
    decisions: { Rome: null, Germany: null, Socrates: null, ...untag('Severus', 'Cyrus', 'David', 'Moses') },
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
  // A year BC is negative (Thucydides died in 395 BC: -395); the rule is the same, and says so in the right era.
  const y = n => (n < 0 ? `${-n} BC` : String(n));
  for (const who of [entry.author, entry.translator, ...(entry.editors || [])].filter(Boolean)) {
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
    slug: book.slug, title: book.title, author: book.author.name, translator: book.translator?.name || null,
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
