// RSS 2.0 / RDF / Atom parsing for Briefing, ported from the Lovable app's feeds.ts: canonical URLs (tracking
// parameters and fragments removed) and a normalised title key for de-duplication.
// Named entities: the Latin-1 letters and signs (case matters: &Eacute; is É, &eacute; is é), then common punctuation.
const LATIN1 = 'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(' ');
const ENT = { ...Object.fromEntries(LATIN1.map((n, k) => [n, String.fromCodePoint(160 + k)])),
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', euro: '€' };
export const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z][a-z0-9]{1,7});/gi, (m, n) => ENT[n] ?? ENT[n.toLowerCase()] ?? m);
const untag = s => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const strip = s => untag(decode(decode(s)));

// The Guardian puts a list of links between its standfirst and the article: to its live page ("Follow our Australia
// politics live blog for latest updates", "Business live – latest updates"), to related stories, or to a sign-up ("Get
// our daily political email, free app or daily news podcast", "Sign up for the Breaking News US email"). A list made
// only of such items goes; a list with any other item stays.
const LIST = /<ul\b[^>]*>((?:(?!<\/?ul\b)[\s\S])*)<\/ul>/gi;
const LI = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
const A = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
const bareLinks = h => /<a\b/i.test(h) && !untag(h.replace(A, ' ')).replace(/[\s,.;:–—|•·-]+/g, '');
const linksOnly = li => bareLinks(li) || (/<a\b/i.test(li) && /^(?:Get our|Sign up)\b/i.test(untag(li)));
export const dropLinkLists = html => html.replace(LIST, (m, inner) => {
  const items = [...inner.matchAll(LI)].map(x => x[1]);
  return items.length && !inner.replace(LI, '').trim() && items.every(linksOnly) ? ' ' : m;
});
// It also puts such a link in a paragraph of its own: a related story or a sign-up after a bullet ("• Don’t get This
// is India delivered to your inbox? Sign up here"), or a sign-up alone ("Sign up for Guardian Australia’s Politics,
// really newsletter here"). A paragraph made only of links goes when it opens with a bullet or a link says "Sign up";
// a bullet before words of the article's own (a warning, say) stays.
const PARA = /<p\b[^>]*>((?:(?!<\/?p\b)[\s\S])*)<\/p>/gi;
export const dropLinkParagraphs = html => html.replace(PARA, (m, inner) => (bareLinks(inner)
  && (/^•/.test(untag(inner)) || [...inner.matchAll(A)].some(x => /\bSign up\b/i.test(untag(x[1])))) ? ' ' : m));
// A paragraph that ends without a stop (the Guardian's standfirst: "… cannot secure short-term backing</p><p>Norse
// Atlantic Airways …") gets one where the next block begins, so it does not run into the article's first sentence. A
// footnote mark after the stop does not hide it, and Chinese and Japanese stops count. The stop goes in as a mark and
// becomes "." once the tags are gone, so it closes up to the last word; an empty paragraph after one without a stop is
// marked as well, and a run of marks makes one stop. Summaries only: titles must not gain a full stop. (The same rule
// as the Scientific Briefing's summarise() in science/scripts/briefing-feeds.mjs.)
const PARA_END = /<\/p>\s*(?=<(?:p|ul|ol|blockquote|h[1-6])\b)/gi;
const endsSentence = html => {
  const t = html.replace(/^[^<]*>/, '').replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '').replace(/<[^>]*>/g, '').trimEnd();
  return !t || /[.!?:;,…。！？：；，][’”"')\]」』]*$/.test(t);
};
const STOP_MARK = '\u0001';
const endParagraphs = html => html.replace(PARA_END, (m, at, all) => (endsSentence(all.slice(Math.max(0, at - 400), at)) ? m : STOP_MARK + m));
// Tags inside a line of text (a link, bold, italic) go without a space, as a browser shows them, so that "senator
// </a><strong><a>Leah Blyth</a></strong><a> to her party</a>." does not read "to her party ." Block tags, line breaks and
// footnote marks still part words.
const INLINE = /<\/?(?:a|b|strong|em|i|u|span|abbr|cite|q|small|mark)\b[^>]*>/gi;
/** A feed item's description as plain text: the Guardian's lists and paragraphs of links after the standfirst
 *  dropped, and a stop where a paragraph without one is joined to the next. */
export const describe = s => untag(endParagraphs(dropLinkParagraphs(dropLinkLists(decode(decode(s)).replaceAll(STOP_MARK, ''))))
  .replace(INLINE, '')).replace(/(?:\s*\u0001)+/g, '.');
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')); return m ? m[1] : ''; };
const attr = (block, name, a) => { const m = block.match(new RegExp(`<${name}\\b[^>]*\\b${a}=["']([^"']+)["']`, 'i')); return m ? decode(m[1]) : ''; };

export function canonicalUrl(u) {
  try {
    const x = new URL(decode(u).trim());
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|cmpid|ito|at_|smid|taid|traffic_source|rss$|cid$)/i.test(k)) x.searchParams.delete(k);
    x.hash = '';
    return x.toString();
  } catch { return ''; }
}
export const titleKey = t => t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();

export function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    // Google News items end their title with " - <publisher>" and name the publisher in <source>: drop the suffix.
    const source = strip(tag(b, 'source'));
    let title = strip(tag(b, 'title'));
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    let link = strip(tag(b, 'link'));
    if (!/^https?:/i.test(link)) {
      const links = b.match(/<link\b[^>]*>/gi) || [];
      const alt = links.find(l => !/\brel=/i.test(l) || /\brel=["']alternate["']/i.test(l)) || links[0] || '';
      link = attr(alt, 'link', 'href') || strip(tag(b, 'guid'));
    }
    const date = strip(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published') || tag(b, 'updated'));
    const summary = describe(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 320);
    const url = canonicalUrl(link);
    if (!title || !url) continue;
    const t = Date.parse(date);
    items.push({ title, url, published: Number.isFinite(t) ? new Date(t).toISOString() : null, summary });
  }
  return items;
}
