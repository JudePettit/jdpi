/* VM access rule: free sources lead. Jude's rule of 6 November 2026 for every section that gathers the day's biggest
   stories from many outlets: a story's lead link is a free source whenever a free source carries the story, and a story
   that only sign-up, metered or paid sources carry never takes the top place of a section or list (it keeps its usual
   place lower down). Links to sources that are not free carry a small label ("Paywall", "Sign-up"), with a link to a
   free source for the same story beside it where VM's data already groups the story across sources (never a guess).

   Which sources are free is design/prp-access.json: one entry a source, with its class, the evidence and the day it was
   checked. Plain script, no build step, no dependencies, like design/prp-period.js: a page loads it with
   <script src="../design/prp-access.js"></script> (or imports it, from a module, for its side effect) and reads
   globalThis.PRPAccess; Node builders and tests import it the same way and build the table from the JSON on disk.

   const T = await PRPAccess.load('../design/prp-access.json')  the table (an empty one when the file cannot be read:
                                                                 every source then counts as free, so nothing is hidden)
   const T = PRPAccess.table(json)                               the same, from the parsed file (Node, tests)
   T.classify({ briefing, id, host, name, url, mark })           'free' | 'signup' | 'metered' | 'paid' | 'unknown'
   T.free(ref)                                                   whether that is free to read (free or unknown)
       briefing + id   a briefing's feed id ('political' + 'nyt', 'science' + 'nature', 'econ' + …, 'digital' + …)
       host            the outlet's home hostname (the Global Headline Tracker's outlet_domain, GDELT's domain)
       name            the outlet's name, the last resort (only where one class has it)
       url             the article's address: a part of a site told apart by its address (match) has its own class
       mark            the publisher's own mark on this article ('free' or 'paid': isAccessibleForFree, an open licence in
                       its feed, LWN's "[$]"), which overrides the source's class
   PRPAccess.isFree(cls)              free or unknown (a source that could not be checked counts as free)
   PRPAccess.leadFree(list, free)     the list with its first free entry moved to the top (the rest in their order)
   PRPAccess.leadFreeGroups(groups, free)  groups (arrays) each led by its first free entry, the first group with one
                                      moved to the top
   PRPAccess.firstFree(copies, free)  the first free copy of a story, or null
   PRPAccess.feedMark(xmlBlock)       a feed item's own access mark, or null
   PRPAccess.label(cls)               the label's HTML ('' for a free source), to put inside the link, at its end
   PRPAccess.altLink({ url, outlet, title })  the "Free at …" link's HTML
   PRPAccess.addCopy(lead, copy, cls) keeps a merged copy's link on the item that stands for the story (lead.alt)
   PRPAccess.promote(item, free)      an item whose own link is not free but which holds a free copy, swapped so the
                                      free copy is the item's link (the builders' merges keep the rule so)
   PRPAccess.restamp(item, classify)  an item and its copies classed again, then promoted (the builders and pages)
   PRPAccess.carryMarks(items)        a publisher's mark on one copy of an article held for every copy at its address
   The look is the "Access labels" section of design/prp.css. */
(() => {
  const root = globalThis;
  const CLASSES = ['free', 'signup', 'metered', 'paid', 'unknown'];
  const LABEL = { signup: 'Sign-up', metered: 'Paywall', paid: 'Paywall' };
  const TITLE = {
    signup: 'Sign-up: the publisher asks for a free account to read this',
    metered: 'Paywall: the publisher allows a few free articles, then asks for payment',
    paid: 'Paywall: the publisher asks for payment to read this',
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fold = s => String(s ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/^the /, '');
  const hostOf = u => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
  const known = c => (CLASSES.includes(c) ? c : null);
  const isFree = c => !c || c === 'free' || c === 'unknown';
  // Hosts that only pass links on (Google News's article links for outlets without a feed of their own): never a source.
  const RELAY = new Set(['news.google.com', 'google.com', 'feedproxy.google.com', 'feeds.feedburner.com']);

  function table(doc) {
    const byKey = new Map(), byHost = new Map(), byName = new Map(), MIXED = { mixed: true };
    // A host or a name that sources of different classes share (nature.com: Nature and Scientific Reports) decides nothing.
    const put = (m, k, e) => { if (!k) return; const x = m.get(k); m.set(k, !x || x === e ? e : x === MIXED || x.class !== e.class ? MIXED : x); };
    const sources = Array.isArray(doc?.sources) ? doc.sources : [];
    for (const s of sources) {
      if (!s || !known(s.class)) continue;
      const e = { ...s, rules: (s.match || []).filter(r => r && known(r.class)).map(r => ({ re: new RegExp(r.url, 'i'), class: r.class })) };
      for (const k of s.keys || []) byKey.set(String(k), e);
      for (const h of s.hosts || []) put(byHost, String(h).toLowerCase().replace(/^www\./, ''), e);
      put(byName, fold(s.name), e);
    }
    const hit = (m, k) => { const e = m.get(k); return e && e !== MIXED ? e : null; };
    function find({ briefing, id, host, name, url } = {}) {
      if (briefing && id != null) { const e = byKey.get(`${briefing}:${id}`); if (e) return e; }
      for (const h0 of [host, hostOf(url)]) {
        let h = String(h0 || '').toLowerCase().replace(/^www\./, '');
        if (!h || RELAY.has(h)) continue;
        // The host, then the domains above it (edition.cnn.com → cnn.com), never a bare suffix.
        for (; h.split('.').length >= 2; h = h.slice(h.indexOf('.') + 1)) { const e = hit(byHost, h); if (e) return e; }
      }
      return name ? hit(byName, fold(name)) : null;
    }
    function classify(ref = {}) {
      const mark = known(ref.mark);
      if (mark) return mark;
      const e = find(ref);
      if (!e) return 'unknown';
      const u = String(ref.url || '');
      for (const r of e.rules) if (r.re.test(u)) return r.class;
      return e.class;
    }
    return { size: sources.length, checked: doc?.checked || null, failed: !!doc?.failed, find, classify, free: ref => isFree(classify(ref)) };
  }

  const cache = new Map();
  /** The table from a URL (fetched once a page); an empty table when it cannot be read, so every source counts as free. */
  function load(url) {
    const key = String(url);
    if (!cache.has(key)) {
      cache.set(key, fetch(url).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(table, () => table({ sources: [], failed: true })));
    }
    return cache.get(key);
  }

  const freeOf = x => isFree(typeof x === 'string' ? x : x?.access);
  /** The rule's one move: the first free entry takes the top place; every other entry keeps its order. */
  function leadFree(list, free = freeOf) {
    const a = Array.from(list || []);
    const k = a.findIndex(x => free(x));
    return k > 0 ? [a[k], ...a.slice(0, k), ...a.slice(k + 1)] : a;
  }
  const firstFree = (copies, free = freeOf) => Array.from(copies || []).find(x => free(x)) || null;
  /** A list shown as groups (the Global Headline Tracker's outlets, each with its stories): each group led by its first
   *  free entry, and the first group that has one moved to the top; everything else keeps its order. */
  const leadFreeGroups = (groups, free = freeOf) => leadFree(Array.from(groups || []).map(g => leadFree(g, free)), g => g.length > 0 && free(g[0]));

  /** A feed item's own access mark: LWN's "[$]" before a subscriber-only title, isAccessibleForFree, or an open
   *  (Creative Commons) licence in its rights or licence element. null when the item says nothing. */
  function feedMark(block) {
    const b = String(block || '');
    if (/<title\b[^>]*>\s*(?:<!\[CDATA\[)?\s*\[\$\]/i.test(b)) return 'paid';
    const m = /isAccessibleForFree\W{0,6}(true|false)\b/i.exec(b);
    if (m) return m[1].toLowerCase() === 'true' ? 'free' : 'paid';
    if (/<(dc:rights|dcterms:license|dcterms:rights|license|cc:license)\b[^>]*>\s*(?:<!\[CDATA\[)?\s*(?:https?:)?\/\/creativecommons\.org\/licenses\//i.test(b)
      || /<(?:cc:license|dcterms:license|license)\b[^>]*\b(?:rdf:resource|href)=["'](?:https?:)?\/\/creativecommons\.org\/licenses\//i.test(b)) return 'free';
    return null;
  }

  /** The label for a link to a source that is not free ('' for a free one). It goes inside the link, at its end, so a
   *  screen reader reads it as part of the link's name ("Headline, Paywall") wherever the link is reached from. */
  // (The comma is unseen text, so the name reads "Headline, Paywall"; inside the label, a browser would read a space
  // before it, as it does around any box laid out on its own.)
  const label = cls => (isFree(cls) ? '' : `<span class="prp-vh">, </span><span class="prp-access" data-access="${cls}" title="${esc(TITLE[cls])}">${LABEL[cls]}</span>`);
  /** A link to the same story at a free source, beside a labelled link. */
  const altLink = ({ url, outlet, title = '' }) => (/^https?:\/\//i.test(String(url || ''))
    ? `<a class="prp-access-alt" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(`The same story, free to read${title ? `: ${title}` : ''}`)}">Free at ${esc(outlet || hostOf(url))}</a>` : '');

  const urlKey = u => String(u || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  /**
   * A builder's merge: keep the link of a copy merged into the item that stands for the story. `lead.alt` lists the
   * other copies, { source, url, title, access } (access only where it is not free), one an address, never the item's
   * own; the copy's own alt comes along. Returns lead.
   */
  function addCopy(lead, copy, cls) {
    const have = new Set([urlKey(lead.url), ...(lead.alt || []).map(a => urlKey(a.url))]);
    const add = a => {
      const k = urlKey(a.url);
      if (!a.url || have.has(k)) return;
      have.add(k);
      const x = { source: a.source, url: a.url };
      if (a.title) x.title = a.title;
      if (!isFree(a.access)) x.access = a.access;
      if (known(a.accessMark)) x.accessMark = a.accessMark;
      (lead.alt || (lead.alt = [])).push(x);
    };
    add({ source: copy.source, url: copy.url, title: copy.title, access: cls ?? copy.access, accessMark: copy.accessMark });
    for (const a of copy.alt || []) add(a);
    return lead;
  }
  /** An item whose own link is not free but which holds a free copy (alt): that copy becomes its link, its own goes
   *  into alt. `free(copy)` says whether a copy is free (it may know a source the builder left out: then it is not). */
  function promote(item, free = a => isFree(a.access)) {
    if (isFree(item.access) || !Array.isArray(item.alt)) return item;
    const k = item.alt.findIndex(free);
    if (k < 0) return item;
    const a = item.alt[k], out = { ...item, source: a.source, url: a.url, title: a.title || item.title };
    delete out.access; delete out.accessMark;
    if (known(a.accessMark)) out.accessMark = a.accessMark;
    out.alt = item.alt.filter((_, n) => n !== k);
    const own = { source: item.source, url: item.url, title: item.title };
    if (!isFree(item.access)) own.access = item.access;
    if (known(item.accessMark)) own.accessMark = item.accessMark;
    out.alt.unshift(own);
    if (Array.isArray(item.also) || a.source !== item.source) {
      const also = [...new Set([...(item.also || []), item.source])].filter(s => s && s !== a.source);
      if (also.length) out.also = also; else delete out.also;
    }
    return out;
  }

  /** A copy of a stored item (or alt copy) with its class written as the builders store it: `access` only where the
   *  source is not free to read. */
  const stamp = (x, cls) => { const o = { ...x }; if (isFree(cls)) delete o.access; else o.access = cls; return o; };

  /** The builders' step before they merge their store: an item and its alt copies classed again (`classify(copy)`:
   *  from its feed, address and own mark), copies from feeds that left the catalogue (`inCatalogue(feedId)`) dropped,
   *  and an item whose link is not free but which holds a free copy turned round (promote). */
  function restamp(item, classify, inCatalogue = () => true) {
    let i = stamp(item, classify(item));
    if (Array.isArray(i.alt)) {
      const alt = i.alt.filter(a => a && a.url && inCatalogue(a.source)).map(a => stamp(a, classify(a)));
      if (alt.length) i.alt = alt; else delete i.alt;
    }
    return promote(i);
  }

  /** The builders' first step: a publisher's mark seen on one copy of an article (this run's, or a stored one's) holds
   *  for every copy at the same address, the newest copy's mark (the later in the list) winning. A store keeps the copy
   *  it first saw, so without this a mark that only this run's feed carries (LWN's "[$]") would be lost. */
  function carryMarks(items) {
    const m = new Map();
    for (const i of items) if (i && known(i.accessMark)) m.set(urlKey(i.url), i.accessMark);
    return m.size ? items.map(i => { const k = i && m.get(urlKey(i.url)); return k && i.accessMark !== k ? { ...i, accessMark: k } : i; }) : items;
  }

  root.PRPAccess = { CLASSES, LABEL, TITLE, table, load, isFree, leadFree, leadFreeGroups, firstFree, feedMark, label, altLink, addCopy, promote, stamp, restamp, carryMarks, urlKey };
})();
