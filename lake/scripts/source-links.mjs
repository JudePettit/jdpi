// Primary and secondary sources on the Master Index (ledger MI-14, choices 7 and 8): the lake's build reads
// bibliotheca/data/source-links.json, the one file the judgements live in, and puts on each entry what the pages and the
// MCP server show. Nothing is typed twice: the words come from bibliotheca/lib/sources.js, the judgements from the file.
//   src      on a subject's entry: one item per shown link on it (a book's main text, or a part by another hand)
//   srcFrom  on a work's own entry, where the Master Index holds the work: one item per shown link from it
//   tags     on a work's own entry: "Primary source on:<subject>" and "Secondary source on:<subject>", from the main
//            text's tagged links only (a part by another hand is not the work). No tag goes on a subject's entry, and
//            none on an author's: an author is a subject of his book, never its work. Each such tag carries a note
//            (tn) saying who made the judgement, which the Explorer shows beside it.
// Only shown links are carried (high or medium confidence, with a tag or a flag); a low one stays in the file. No entry
// is made: a subject with no entry has its link on the book side only (Neo Book), and gains it here the day the lake
// holds it, with no change to the file. Every run takes away what the last file gave before giving what this one does,
// so a full build and an --only build give the same records.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LINKS_PATH, WORDING, isShown, plain, cite, nameMap, workTitle, workVolumes, readOn } from '../../bibliotheca/lib/sources.js';

export const SOURCE_GROUPS = [WORDING.group.primary, WORDING.group.secondary];
const GROUP_PREFIXES = SOURCE_GROUPS.map(g => g + ':');
const isGroupTag = t => GROUP_PREFIXES.some(p => t.startsWith(p));
const capital = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

// The file, the shelf, and the chapter headings (read from a book's file the first time a link cites it).
export function readSourceLinks(jdpiDir) {
  const read = p => JSON.parse(readFileSync(join(jdpiDir, p), 'utf8'));
  const file = existsSync(join(jdpiDir, LINKS_PATH)) ? read(LINKS_PATH) : { links: [] };
  const shelf = read('bibliotheca/data/index.json');
  const headings = new Map();
  const chapter = (book, ch) => {
    if (!headings.has(book)) {
      const p = `bibliotheca/data/books/${book}.json`;
      headings.set(book, existsSync(join(jdpiDir, p)) ? new Map((read(p).chapters || []).map(c => [c.n, c.heading || c.title || null])) : new Map());
    }
    return headings.get(book).get(ch) ?? null;
  };
  return { file, shelf, chapter };
}

// Puts the shown links on the records (a Map of qid → lake record), in place. Returns the counts: links on subjects'
// entries, links on works' entries, and shown links whose subject has no entry.
export function applySourceLinks(records, { file, shelf, chapter = () => null }) {
  for (const r of records.values()) {
    delete r.src; delete r.srcFrom;
    if (r.tags?.some(isGroupTag)) r.tags = r.tags.filter(t => !isGroupTag(t));
    if (r.tn) { for (const t of Object.keys(r.tn)) if (isGroupTag(t)) delete r.tn[t]; if (!Object.keys(r.tn).length) delete r.tn; }
  }
  const names = nameMap(file, shelf);
  const shownName = q => { const r = records.get(q); return r ? (r.name || r.label) : null; };
  const ctx = { name: q => shownName(q) || names.get(q) || null, title: slug => (shelf?.books || []).find(b => b.slug === slug)?.title || null, chapter };
  const n = { on: 0, from: 0, waiting: 0 };
  for (const l of (file?.links || []).filter(isShown)) {
    // A part by another hand that one volume of a set holds is marked on that volume's line only (review P3).
    const p = plain(l), vols = l.part?.book ? [l.part.book] : workVolumes(shelf, l.work);
    const part = l.part ? { ch: l.part.ch, heading: l.part.heading, by: l.part.by, ...(l.part.book ? { book: l.part.book } : {}) } : null;
    const say = { tag: p.tag, basis: p.basis, flags: p.flags, part: p.part, confidence: p.confidence };
    const cites = l.source.map(s => cite(s, ctx));
    const read = readOn(l);
    const common = { part, tag: l.tag, basis: l.basis, kind: l.subject.kind, flags: l.flags || [], evidence: l.evidence, cites, ...(read ? { read } : {}), confidence: l.confidence, judged: l.judged, say };
    const subject = records.get(l.subject.q);
    if (subject) {
      (subject.src ||= []).push({ work: l.work, wq: l.wq || null, title: workTitle(shelf, l.work) || l.work, book: part?.book || vols[0], vols, ...common });
      n.on++;
    } else n.waiting++;
    const work = l.wq ? records.get(l.wq) : null;
    if (work) {
      (work.srcFrom ||= []).push({ q: l.subject.q, label: l.subject.label, ...common });
      n.from++;
      if (l.tag && !l.part) {
        const t = `${WORDING.group[l.tag]}:${capital(shownName(l.subject.q) || l.subject.label)}`;
        if (!work.tags.includes(t)) work.tags.push(t);
        // The tag's note (build.mjs gathers `tn` into index.json's notes): the Explorer says beside the tag and in the
        // filter's heading who made the judgement (review X6).
        (work.tn ||= {})[t] = WORDING.tagNote;
      }
    }
  }
  return n;
}
