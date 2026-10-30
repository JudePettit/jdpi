// Builds one book of the Bibliotheca shelf (shelf.mjs) from its Project Gutenberg plain-text file:
//   1. checks the rights finding (both US and UK must be "pd", and the dates must bear it out), else stops;
//   2. downloads the UTF-8 text (kept in scripts/cache/, which is not committed) unless --source gives a local file;
//   3. cuts the Gutenberg header, footer and licence, splits chapters and paragraphs, sets the typography (text.mjs);
//   4. tags every paragraph with the Encyclopaedia's terms (tag-terms.mjs) and prints the tagging report;
//   5. writes bibliotheca/data/books/<slug>.json and the shelf index bibliotheca/data/index.json.
//   node bibliotheca/scripts/build-book.mjs <slug> [--refresh] [--source <file>] [--no-tag]
//     --refresh   download the text again even though the cache has it
//     --source    read the Gutenberg file from this path instead of downloading
//     --no-tag    write the book with no terms (the tagger runs later: tag-terms.mjs <slug>)
//
// The data contract, shared by every Bibliotheca script and page:
//   bibliotheca/data/books/<slug>.json = {
//     slug, title,
//     author: { name, qid, born, died },
//     translator: { name, died } | null,
//     work: { qid, written, published },      the work itself (published is the year the era rule uses)
//     era: [from, to],                          the years the book is about, for the screens that take a period
//     edition: { source, id, url, published, licence },
//     rights: { us, uk, basis, checked },
//     generated,
//     chapters: [ { n, heading, title, words, paragraphs: [ { id, kind, note?, text, terms: [ { s, e, qid, label } ] } ] } ]
//   }
//   where n is the chapter's number in the book (0 for a dedication or preface kept as a chapter), kind is 'para',
//   'note' (a translator's footnote, numbered by `note`) or 'verse' (lines kept, separated by "\n"), and s/e are
//   JavaScript string offsets into text (text.slice(s, e) is the matched term; label is the entity's name).
//   bibliotheca/data/index.json = { generated, books: [ { slug, title, author, translator, year, era, words, chapters,
//   paragraphs, terms, generated } ] } (author and translator are names; year is the work's).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE, shelfEntry, checkRights, writeBook, writeIndex, bookPath, ROOT } from './shelf.mjs';
import { stripBoilerplate, splitChapters } from './text.mjs';
import { loadLake, buildAliasIndex, tagBook, report } from './tag-terms.mjs';

const UA = { 'User-Agent': 'PRP-Bibliotheca/1.0 (https://jdpi.pages.dev; bibliotheca/scripts/build-book.mjs)', Accept: 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The Gutenberg plain-text file (UTF-8) for a shelf entry, from the cache, a local file or gutenberg.org. The file
    is checked for its START marker before it is cached, so a maintenance page or an error body is never kept. */
export async function sourceText(entry, { refresh = false, source = null } = {}) {
  if (source) return readFileSync(resolve(source), 'utf8');
  mkdirSync(CACHE, { recursive: true });
  const cached = join(CACHE, `pg${entry.gutenberg}.txt`);
  if (!refresh && existsSync(cached)) return readFileSync(cached, 'utf8');
  const url = `https://www.gutenberg.org/cache/epub/${entry.gutenberg}/pg${entry.gutenberg}.txt`;
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      if (!/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK/.test(text)) throw new Error('the response is not a Gutenberg plain-text file');
      writeFileSync(cached, text);
      console.log(`downloaded ${url} (${text.length.toLocaleString('en-GB')} characters) to ${cached}`);
      return text;
    } catch (e) {
      if (attempt >= 4) throw new Error(`could not fetch ${url}: ${e.message}`);
      await sleep(2000 * attempt);
    }
  }
}

/** The book record for a shelf entry and its chapters (no terms yet). */
export function bookRecord(entry, chapters) {
  const id = `pg${entry.gutenberg}`;
  return {
    slug: entry.slug, title: entry.title,
    author: { ...entry.author },
    translator: entry.translator ? { ...entry.translator } : null,
    work: { ...entry.work },
    era: [...entry.era],
    edition: {
      source: 'Project Gutenberg', id, url: `https://www.gutenberg.org/ebooks/${entry.gutenberg}`, published: entry.published,
      licence: `Project Gutenberg eBook #${entry.gutenberg} (${entry.translator ? `${entry.translator.name}'s translation, ` : ''}${entry.published}). `
        + 'The Project Gutenberg header, footer and licence have been removed, so this text is redistributed as public-domain text '
        + 'without the Project Gutenberg trademark, as its licence provides (gutenberg.org/policy/license.html).',
    },
    rights: { ...entry.rights },
    generated: new Date().toISOString(),
    chapters,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const slug = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--source');
  if (!slug) { console.error('usage: node bibliotheca/scripts/build-book.mjs <slug> [--refresh] [--source <file>] [--no-tag]'); process.exit(2); }
  const entry = shelfEntry(slug);
  const reasons = checkRights(entry);
  console.log(`${entry.title}: rights pd/pd (${reasons.join('; ')})`);
  const raw = await sourceText(entry, { refresh: args.includes('--refresh'), source: args.includes('--source') ? args[args.indexOf('--source') + 1] : null });
  const chapters = splitChapters(stripBoilerplate(raw), entry.layout);
  const book = bookRecord(entry, chapters);
  const words = chapters.reduce((n, c) => n + c.words, 0), paragraphs = chapters.reduce((n, c) => n + c.paragraphs.length, 0);
  console.log(`${chapters.length} chapters, ${paragraphs.toLocaleString('en-GB')} paragraphs, ${words.toLocaleString('en-GB')} words`);
  if (!args.includes('--no-tag')) {
    const index = buildAliasIndex(loadLake(), { decisions: entry.decisions });
    const stats = tagBook(book, index, { year: entry.work.published });
    console.log(report(book, stats, index, { year: entry.work.published }));
  }
  writeBook(book);
  const shelf = writeIndex();
  const size = readFileSync(bookPath(slug)).length;
  console.log(`\nwrote ${bookPath(slug).slice(ROOT.length).replace(/\\/g, '/')} (${(size / 1024).toFixed(0)} KB) and bibliotheca/data/index.json (${shelf.length} book${shelf.length === 1 ? '' : 's'})`);
  if (size > 1024 * 1024) { console.error(`✗ the book file is over 1 MB`); process.exit(1); }
}
