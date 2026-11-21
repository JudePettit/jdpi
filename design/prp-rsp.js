/* VM's second reliability flag: English Wikipedia's list of perennial sources, beside the Media Bias/Fact Check flag (⚠),
   which stays (Jude, 20 November 2026). The flag carries the list's own status words ("Generally reliable", "No
   consensus", "Generally unreliable", "Deprecated", and "Blacklisted" where the list says so), the day VM read the list
   and a link to the outlet's row, and none of the list's summaries. It is the standing consensus of Wikipedia's editors
   on using that outlet as a source in Wikipedia: not VM's judgement, not Media Bias/Fact Check's, and not a rating of any
   single article, and every flag says so in its title.

   Its data is briefing/data/rsp.json (written by briefing/scripts/build-rsp.mjs; CC BY-SA 4.0, "Wikipedia contributors"):
   each row's name and status, and the table joining each Political Briefing publisher to its row or rows.
     listed     one row, or rows with one status: the status words
     split      rows with different statuses, by subject or by period: "varies by subject: see the list" (or "by period"),
                and in full, each row's name with its words
     none       "Not on Wikipedia's list" (never a blank that reads as good)
     uncertain  no flag at all: VM cannot be sure which row is the outlet's
   Plain script, no build step, no dependencies, like design/prp-access.js: a page loads it with
   <script src="../design/prp-rsp.js"></script> (or imports it, from a module, for its side effect) and reads
   globalThis.PRPRsp; Node tests import it the same way.

   const T = PRPRsp.table(json)     the table (an empty one, with no flags, when the file could not be read)
   T.flag(publisherId)              null (no flag), or { kind, by, words, rows: [{ name, words, href }], href, read }
   PRPRsp.html(flag, { full })      the flag's HTML: the short form beside ⚠, or (full) each row by its name, for the publishers table
   PRPRsp.title(T)                  what the flag is, in one plain paragraph, with the day the list was read
   PRPRsp.credit(T)                 the credit and licence line, with the page's address and the revision read
   PRPRsp.slot(id), PRPRsp.fill(T)  a placeholder written while the list loads, and the flags put into those placeholders */
(() => {
  const root = globalThis;
  const LIST_URL = 'https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources/Perennial_sources';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = iso => { const d = new Date(iso); return Number.isFinite(+d) ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : ''; };
  // MediaWiki writes a row's anchor with underscores for spaces; the overflow page's rows are on that page, not the list's.
  const rowHref = (row, overflow) => `${LIST_URL}${overflow.has(row.page) ? '/' + encodeURIComponent(row.page) : ''}#${encodeURIComponent(String(row.id).replace(/ /g, '_'))}`;
  const WHAT = 'the standing consensus of Wikipedia’s editors on using this outlet as a source in Wikipedia. It is not Vitruvian Manager’s judgement, not Media Bias/Fact Check’s, and not a rating of any single article.';

  function table(doc) {
    const ok = !!(doc && Array.isArray(doc.rows) && doc.outlets && doc.words);
    const rows = new Map(ok ? doc.rows.map(r => [r.k, r]) : []);
    const overflow = new Set(ok ? (doc.pages || []).filter(p => p.overflow).map(p => p.page) : []);
    const wordsOf = r => [doc.words[r.st] || doc.words.d, r.b ? doc.words.b : ''].filter(Boolean).join(' · ');
    const read = ok ? doc.read : null;
    return {
      ok, read, doc: ok ? doc : null,
      flag(id) {
        if (!ok) return null;
        const j = doc.outlets[id];
        if (!j || j.match === 'uncertain') return null;
        if (j.match === 'none') return { kind: 'none', rows: [], href: LIST_URL, read };
        const list = (j.rows || []).map(k => rows.get(k)).filter(Boolean);
        if (!list.length) return null;
        const out = list.map(r => ({ name: r.name, words: wordsOf(r), href: rowHref(r, overflow) }));
        if (j.match === 'split') return { kind: 'split', by: j.by === 'period' ? 'period' : 'subject', rows: out, href: out[0].href, read };
        return { kind: 'listed', words: out[0].words, rows: out, href: out[0].href, read };
      },
      why(id) { return ok && doc.outlets[id]?.match === 'uncertain' ? doc.outlets[id].why || '' : null; },
    };
  }
  const title = T => `Wikipedia’s list of perennial sources${T?.read ? `, read by Vitruvian Manager on ${day(T.read)}` : ''}: ${WHAT}`;
  // Each flag's accessible name (and its title) starts with the words it shows, so a speech user can say what they see
  // (WCAG 2.5.3), then says what the flag is, the day VM read the list, and that the link opens in a new tab.
  const NEW_TAB = ' (opens in a new tab)';
  function html(f, { full = false } = {}) {
    if (!f) return '';
    const read = f.read ? `, read by Vitruvian Manager on ${day(f.read)}` : '';
    const what = `Wikipedia’s list of perennial sources${read}: ${WHAT}`;
    const a = (href, text, label, cls = 'rsp', about = what) => { const l = esc(`${label} ${about}${NEW_TAB}`); return `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener" title="${l}" aria-label="${l}">${text}</a>`; };
    if (f.kind === 'none') return a(f.href, 'Not on Wikipedia’s list', 'Not on Wikipedia’s list.', 'rsp none',
      `Wikipedia’s list of perennial sources${read} has no row for this outlet. That is not a rating, good or bad, and not Vitruvian Manager’s judgement.`);
    const k = '<span class="rsp-k">Wikipedia</span> ';
    if (f.kind === 'listed' && !full) return a(f.href, k + esc(f.words), `Wikipedia ${f.words}.`);
    const each = f.rows.map(r => `${r.name}: ${r.words}`).join('; ');
    if (!full) return a(f.href, `${k}varies by ${f.by}: see the list`, `Wikipedia varies by ${f.by}: see the list. ${each}.`, 'rsp split');
    // In full (the publishers table), each row by its own name, so the reader sees which row VM took to be the outlet's.
    const cls = f.kind === 'split' ? 'rsp split' : 'rsp';
    return `<span class="rsp-rows">${f.rows.map(r => a(r.href, `${esc(r.name)}: ${esc(r.words)}`, `${r.name}: ${r.words}.`, cls)).join('')}</span>`;
  }
  // While the list is still loading, a page writes a slot where each flag will go and draws its stories at once; when
  // the list has loaded (or failed), fill() puts each flag in its slot (or removes the slot, when there is no flag), so
  // the stories never wait on the list.
  const slot = id => `<span class="rsp-slot" data-rsp="${esc(id)}" hidden></span>`;
  function fill(T, root = globalThis.document) {
    if (!root?.querySelectorAll) return 0;
    const slots = [...root.querySelectorAll('.rsp-slot[data-rsp]')];
    for (const s of slots) s.outerHTML = html(T?.flag(s.dataset.rsp));
    return slots.length;
  }
  function credit(T) {
    const d = T?.doc;
    if (!d) return 'Wikipedia’s list of perennial sources could not be read just now, so no publisher shows its flag.';
    const main = (d.revisions || [])[0];
    return `Statuses and row names from “<a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">${esc(d.source)}</a>” by ${esc(d.credit)}`
      + (main ? ` (revision <a href="${esc(main.url)}" target="_blank" rel="noopener">${esc(main.revid)}</a> and the sub-pages read with it)` : '')
      + `, read on ${esc(day(d.read))}, under <a href="${esc(d.licenceUrl)}" target="_blank" rel="noopener">${esc(d.licence)}</a>. ${esc(d.changes)} The table is <code>briefing/data/rsp.json</code>, under the same licence.`;
  }
  root.PRPRsp = { table, html, title, credit, day, slot, fill, LIST_URL, WHAT };
})();
