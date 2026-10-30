/* The reader's text: a paragraph of a book file as HTML with its Encyclopaedia terms as links, and the distinct terms
   in a set of paragraphs (the popout bar). Pure (no DOM): the page renders with it and the tests call it in Node.
   The book data contract (bibliotheca/scripts/build-book.mjs) gives each paragraph
     { id, kind: 'para' | 'note' | 'verse', note?, text, terms: [{ s, e, qid, label }] }
   with s/e JavaScript string offsets into text, sorted and non-overlapping; a 'note' is one of the translator's
   footnotes (its text starts with its marker, "[1] …", and it sits under the paragraph that cites it), a 'verse' keeps
   its lines separated by "\n". A term that breaks the offset rule is skipped here rather than corrupting the text,
   since the data test (tests/bibliotheca-data.test.mjs) is where it is reported. */

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const QID = /^Q[1-9]\d*$/;

// Plain text between terms: escaped, a footnote marker "[3]" set small (a term never contains one, so a marker is
// never split by a link), and a verse's line breaks kept.
const plain = s => esc(s).replace(/\[(\d{1,3})\]/g, '<sup class="fn">[$1]</sup>').replace(/\n/g, '<br>');

/** The terms of a paragraph that are well formed: whole offsets in order inside the text, a Wikidata ID, a label. */
export function validTerms(p) {
  const out = [];
  let at = 0;
  for (const t of p?.terms || []) {
    if (!t || !Number.isInteger(t.s) || !Number.isInteger(t.e) || t.s < at || t.e <= t.s || t.e > p.text.length || !QID.test(t.qid || '')) continue;
    out.push({ s: t.s, e: t.e, qid: t.qid, label: t.label || p.text.slice(t.s, t.e) });
    at = t.e;
  }
  return out;
}

/** One paragraph as HTML: <p class="para [note|verse]" id data-p> with each term an <a class="term" data-qid href>.
    `href(qid)` gives the link's address (the Encyclopaedia entry, through the shell when the page is embedded), so a
    term still opens its entry in a new tab with Ctrl or the middle button; a plain click is the page's to handle.
    data-jdpi-ency on the link tells the entity linker (design/jdpi-entities.js) the term is linked already, so it adds
    no second ◈ link after it; data-qid stays for the Documentary narrator's map focus (design/jdpi-narrator.js). */
export function paragraphHtml(p, { href = q => `#${q}` } = {}) {
  let html = '', at = 0;
  for (const t of validTerms(p)) {
    html += plain(p.text.slice(at, t.s))
      + `<a class="term" data-qid="${t.qid}" data-jdpi-ency="${t.qid}" href="${esc(href(t.qid))}" title="${esc(t.label)} · Encyclopaedia">${esc(p.text.slice(t.s, t.e))}</a>`;
    at = t.e;
  }
  html += plain(p.text.slice(at));
  const kind = p.kind === 'note' || p.kind === 'verse' ? p.kind : 'para';
  return `<p class="para${kind === 'para' ? '' : ' ' + kind}" id="${esc(p.id)}" data-p="${esc(p.id)}">${html}</p>`;
}

/** Occurrences ([{ qid, label, form }], in reading order) folded into distinct terms, in order of first appearance,
    each with how many times it occurs and the words the text uses for it: [{ qid, label, n, forms: ['France', 'French'] }].
    The page folds the occurrences actually in view (the links inside the paragraphs on screen); termsOnScreen below
    folds whole paragraphs. */
export function distinctTerms(occurrences) {
  const seen = new Map();
  for (const { qid, label, form } of occurrences) {
    const row = seen.get(qid);
    if (!row) seen.set(qid, { qid, label: label || form, n: 1, forms: [form] });
    else { row.n++; if (!row.forms.includes(form)) row.forms.push(form); }
  }
  return [...seen.values()];
}

/** The distinct terms in some paragraphs, as distinctTerms gives them. */
export function termsOnScreen(paragraphs) {
  return distinctTerms(paragraphs.flatMap(p => validTerms(p).map(t => ({ qid: t.qid, label: t.label, form: p.text.slice(t.s, t.e) }))));
}

/** How many term occurrences and distinct entries a chapter (or any list of paragraphs) has. */
export function termCount(paragraphs) {
  const qids = new Set();
  let n = 0;
  for (const p of paragraphs) for (const t of validTerms(p)) { n++; qids.add(t.qid); }
  return { n, distinct: qids.size };
}

/** The chapter heading line: "Chapter XII" and the title when the book gives both, or the title alone when the heading
    is the title (the Dedication). */
export function chapterLabel(c) {
  const heading = (c.heading || '').trim(), title = (c.title || '').trim();
  if (!heading || heading === title) return { no: '', title: title || heading || `Chapter ${c.n}` };
  return { no: heading, title: title || heading };
}
