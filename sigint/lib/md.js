// SIGINT Dashboard: a small Markdown renderer for the page's own content files (cookbook, hardware guide, law).
// Supports headings with {#id .class} attributes, paragraphs, emphasis, code, links, lists (two levels, task boxes),
// fenced code, pipe tables, notes (> [!warn] …) and raw HTML blocks (figures with inline SVG). The content is ours,
// so raw HTML blocks pass through; everything else is escaped.
import { esc } from './util.js';

export const slug = s => String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'section';

/** Inline markup: `code`, **bold**, *italic*, [text](url), <https://autolink>, and <kbd>. */
export function inline(src, { linkAttrs = defaultLinkAttrs } = {}) {
  const codes = [];
  let s = String(src).replace(/`([^`]+)`/g, (_, c) => { codes.push(`<code>${esc(c)}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  const links = [];
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, t, href, title) => {
    links.push({ t, href, title }); return `\u0001${links.length - 1}\u0001`;
  });
  s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (_, href) => { links.push({ t: href, href, raw: true }); return `\u0001${links.length - 1}\u0001`; });
  s = esc(s)
    .replace(/&lt;kbd&gt;(.+?)&lt;\/kbd&gt;/g, '<kbd>$1</kbd>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_(?!\s)(.+?)(?<!\s)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => {
    const l = links[+i];
    const label = l.raw ? esc(l.t) : inline(l.t, { linkAttrs });
    return `<a href="${esc(l.href)}"${l.title ? ` title="${esc(l.title)}"` : ''}${linkAttrs(l.href)}>${label}</a>`;
  });
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
}
const defaultLinkAttrs = href => (/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : '');

function parseAttrs(text) {
  const m = /\s*\{([^}]*)\}\s*$/.exec(text);
  if (!m) return { text, id: null, classes: [] };
  const attrs = m[1].trim().split(/\s+/);
  return { text: text.slice(0, m.index), id: (attrs.find(a => a.startsWith('#')) || '').slice(1) || null, classes: attrs.filter(a => a.startsWith('.')).map(a => a.slice(1)) };
}
const NOTE = { note: '', warn: ' warn', bad: ' bad', legal: ' warn' };

/**
 * Render Markdown to HTML. Options: sectionLevel (wrap each heading of that level and its content in a <section>),
 * linkAttrs(href) for extra link attributes, idPrefix for heading ids.
 * Returns { html, toc: [{ level, id, text, classes }] }.
 */
export function renderMarkdown(src, { sectionLevel = 0, linkAttrs = defaultLinkAttrs, idPrefix = '' } = {}) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [], toc = [], used = new Set();
  let i = 0, open = false;
  const il = t => inline(t, { linkAttrs });
  const uniq = id => { let k = id, n = 2; while (used.has(k)) k = `${id}-${n++}`; used.add(k); return k; };
  const isBlockStart = l => /^(#{1,6})\s|^```|^\s*([-*+]|\d+[.)])\s|^>|^\|.*\|\s*$|^<[a-zA-Z!]|^(-{3,}|\*{3,})\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    let m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      const level = m[1].length, a = parseAttrs(m[2].trim());
      const id = uniq(idPrefix + (a.id || slug(a.text)));
      if (sectionLevel && level <= sectionLevel && open) { out.push('</section>'); open = false; }
      if (sectionLevel && level === sectionLevel) { out.push(`<section class="md-sec${a.classes.map(c => ' ' + c).join('')}" id="${esc(id)}" data-cats="${esc(a.classes.join(' '))}">`); open = true; }
      out.push(`<h${level}${sectionLevel && level === sectionLevel ? '' : ` id="${esc(id)}"`}${a.classes.length && !(sectionLevel && level === sectionLevel) ? ` class="${esc(a.classes.join(' '))}"` : ''}>${il(a.text)}</h${level}>`);
      toc.push({ level, id, text: a.text.replace(/[*`_]/g, ''), classes: a.classes });
      i++; continue;
    }
    m = /^```\s*([\w+-]*)\s*$/.exec(line);
    if (m) {
      const lang = m[1], buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre class="md-code"${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^<[a-zA-Z!]/.test(line)) {
      const buf = [];
      while (i < lines.length && lines[i].trim()) buf.push(lines[i++]);
      out.push(buf.join('\n'));
      continue;
    }
    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      let kind = 'note';
      const k = /^\[!(\w+)\]\s*/.exec(buf[0] || '');
      if (k) { kind = k[1].toLowerCase(); buf[0] = buf[0].slice(k[0].length); }
      const inner = renderMarkdown(buf.join('\n'), { linkAttrs }).html;
      out.push(`<div class="prp-note md-note${NOTE[kind] ?? ''}" data-kind="${esc(kind)}">${inner}</div>`);
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const cells = l => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
      const head = cells(line), aligns = cells(lines[i + 1]).map(c => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      const al = j => (aligns[j] === 'right' ? ' class="num"' : aligns[j] === 'center' ? ' style="text-align:center"' : '');
      out.push(`<div class="md-table"><table class="prp-table"><thead><tr>${head.map((h, j) => `<th scope="col"${al(j)}>${il(h)}</th>`).join('')}</tr></thead><tbody>` +
        rows.map(r => `<tr>${head.map((_, j) => `<td${al(j)}>${il(r[j] ?? '')}</td>`).join('')}</tr>`).join('') + '</tbody></table></div>');
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s/.test(line)) {
      const { html, next } = parseList(lines, i, linkAttrs);
      out.push(html); i = next; continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !(buf.length && isBlockStart(lines[i]))) buf.push(lines[i++].trim());
    out.push(`<p>${il(buf.join(' ')).replace(/ {2,}$/gm, '<br>')}</p>`);
  }
  if (open) out.push('</section>');
  return { html: out.join('\n'), toc };
}

function parseList(lines, start, linkAttrs) {
  const il = t => inline(t, { linkAttrs });
  const indentOf = l => l.match(/^\s*/)[0].replace(/\t/g, '    ').length;
  const isItem = l => /^\s*([-*+]|\d+[.)])\s/.test(l);
  const isOrdered = l => /^\s*\d+[.)]\s/.test(l);
  const base = indentOf(lines[start]);
  const ordered = isOrdered(lines[start]);
  const items = [];
  let i = start, fence = false;
  while (i < lines.length) {
    const l = lines[i], cur = items[items.length - 1];
    if (fence) { cur.sub.push(l); if (/^\s*```\s*$/.test(l)) fence = false; i++; continue; }
    if (!l.trim()) {
      // A blank line ends the list unless what follows is a deeper continuation or a sibling item of the same kind.
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && cur && indentOf(lines[j]) > base) { cur.sub.push(''); i = j; continue; }
      if (j < lines.length && indentOf(lines[j]) === base && isItem(lines[j]) && isOrdered(lines[j]) === ordered) { i = j; continue; }
      break;
    }
    const ind = indentOf(l);
    if (ind === base && isItem(l)) { items.push({ text: [/^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(l)[2]], sub: [] }); i++; continue; }
    if (ind > base && cur) {
      if (/^\s*```/.test(l)) { fence = true; cur.sub.push(l); i++; continue; }
      if (isItem(l) || cur.sub.length) cur.sub.push(l); else cur.text.push(l.trim());
      i++; continue;
    }
    break;
  }
  const tag = ordered ? 'ol' : 'ul';
  const task = items.some(it => /^\[[ xX]\]\s/.test(it.text[0]));
  const html = `<${tag}${task ? ' class="md-tasks"' : ''}>` + items.map((it, k) => {
    let t = it.text.join(' ');
    let box = '';
    const tm = /^\[([ xX])\]\s+(.*)$/.exec(t);
    if (tm) { box = `<input type="checkbox" data-task="${k}"${tm[1] !== ' ' ? ' checked' : ''}> `; t = tm[2]; }
    const sub = it.sub.some(s => s.trim()) ? renderMarkdown(dedent(it.sub).join('\n'), { linkAttrs }).html : '';
    return `<li>${box ? `<label>${box}<span>${il(t)}</span></label>` : il(t)}${sub}</li>`;
  }).join('') + `</${tag}>`;
  return { html, next: i };
}
function dedent(ls) {
  const min = Math.min(...ls.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length));
  return ls.map(l => l.slice(min));
}
