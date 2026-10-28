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
const strip = s => decode(decode(s)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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
    const title = strip(tag(b, 'title'));
    let link = strip(tag(b, 'link'));
    if (!/^https?:/i.test(link)) {
      const links = b.match(/<link\b[^>]*>/gi) || [];
      const alt = links.find(l => !/\brel=/i.test(l) || /\brel=["']alternate["']/i.test(l)) || links[0] || '';
      link = attr(alt, 'link', 'href') || strip(tag(b, 'guid'));
    }
    const date = strip(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published') || tag(b, 'updated'));
    const summary = strip(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 320);
    const url = canonicalUrl(link);
    if (!title || !url) continue;
    const t = Date.parse(date);
    items.push({ title, url, published: Number.isFinite(t) ? new Date(t).toISOString() : null, summary });
  }
  return items;
}
