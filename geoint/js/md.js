// GEOINT & IMINT Dashboard: a small renderer for the guide files in geoint/content/*.md. Pure (string in, HTML out).
// Supported:
//   front matter between --- lines (key: value) · # ## ### #### headings (the page title is the tab, so # renders as h2)
//   paragraphs with **bold**, *italic* or _italic_, `code`, [links](https://…) and <https://…>
//   - / * / 1. lists, nested by indentation · | pipe | tables | · ```lang fenced code (with a Copy button) · --- rules
//   > quotes and callouts: > [!NOTE] / [!TIP] / [!WARNING] / [!CAUTION] / [!LEGAL] / [!SAFETY] / [!PRIVACY] Optional title
//   ::: figure <id>  caption  :::      inline SVG figure from opts.figures[id](), numbered automatically
//   ::: os  @windows … @macos … @linux … @any …  :::    install steps per operating system
//   ::: facts  Key: value lines  :::  a short fact sheet (official source, platforms, licence, cost)
// Links: http(s) and mailto open in a new tab; #tab=… switches tabs on this page; prp://<submodule>/<path> becomes a PRP
// link through opts.prpLink(); relative paths stay. Anything else (javascript:, data:) is rendered as plain text. No raw HTML.

import { esc, slug } from './util.js';

const CALLOUTS = {
  NOTE: { cls: '', label: 'Note' }, TIP: { cls: 'tip', label: 'Tip' }, IMPORTANT: { cls: '', label: 'Important' },
  WARNING: { cls: 'warn', label: 'Warning' }, CAUTION: { cls: 'bad', label: 'Caution' }, LEGAL: { cls: 'warn', label: 'Legal' },
  SAFETY: { cls: 'bad', label: 'Safety' }, PRIVACY: { cls: 'warn', label: 'Privacy' },
};
export const OS_NAMES = { windows: 'Windows', macos: 'macOS', linux: 'Linux', any: 'Any system' };
const LANG_NAMES = { sh: 'Shell', bash: 'Shell', powershell: 'PowerShell', ps: 'PowerShell', cmd: 'Command Prompt', python: 'Python', js: 'JavaScript', text: 'Text', ql: 'Overpass QL' };
const ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const BLOCK_START = /^(#{1,4}\s|```|:::|\||>)/;

export function renderMarkdown(src, opts = {}) {
  const ctx = { ids: new Set(), toc: [], figures: 0, opts, prefix: opts.idPrefix ? opts.idPrefix + '-' : '' };
  const { meta, body } = frontMatter(String(src ?? ''));
  return { html: blocks(body.split(/\r?\n/), ctx), toc: ctx.toc, meta };
}

function frontMatter(src) {
  const meta = {};
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta, body: src };
  for (const line of m[1].split(/\r?\n/)) { const i = line.indexOf(':'); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return { meta, body: src.slice(m[0].length) };
}

function blocks(lines, ctx) {
  const out = [];
  let para = [], i = 0, m;
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(' '), ctx)}</p>`); para = []; } };
  while (i < lines.length) {
    const line = lines[i], t = line.trim();
    if (!t) { flush(); i++; continue; }
    if ((m = t.match(/^```\s*([\w+-]*)\s*(.*)$/))) {
      flush();
      const buf = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) buf.push(lines[i]);
      i++;
      out.push(codeBlock(dedent(buf).join('\n'), m[1], m[2]));
      continue;
    }
    if ((m = t.match(/^:::\s*([a-z-]+)\s*(.*)$/))) {
      flush();
      const buf = [];
      let depth = 0;
      for (i++; i < lines.length; i++) {
        const tt = lines[i].trim();
        if (/^:::\s*[a-z-]+/.test(tt)) depth++;
        else if (tt === ':::') { if (!depth) break; depth--; }
        buf.push(lines[i]);
      }
      i++;
      out.push(directive(m[1], m[2].trim(), buf, ctx));
      continue;
    }
    if ((m = t.match(/^(#{1,4})\s+(.+?)\s*#*$/))) { flush(); out.push(heading(m[1].length, m[2], ctx)); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); out.push('<hr>'); i++; continue; }
    if (t.startsWith('>')) {
      flush();
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) buf.push(lines[i++].trim().replace(/^>\s?/, ''));
      out.push(quote(buf, ctx));
      continue;
    }
    if (t.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1].trim())) {
      flush();
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) buf.push(lines[i++].trim());
      out.push(table(buf, ctx));
      continue;
    }
    if (ITEM.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j++;
          if (j < lines.length && (ITEM.test(lines[j]) || /^\s{2,}\S/.test(lines[j]))) { buf.push(''); i++; continue; }
          break;
        }
        if (ITEM.test(l) || /^\s{2,}\S/.test(l)) { buf.push(l); i++; continue; }
        if (BLOCK_START.test(l.trim())) break;
        buf.push('  ' + l.trim()); i++; // lazy continuation of the previous item
      }
      out.push(list(buf, ctx));
      continue;
    }
    para.push(t); i++;
  }
  flush();
  return out.join('\n');
}

function dedent(lines) {
  const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length));
  return Number.isFinite(ind) && ind > 0 ? lines.map(l => l.slice(ind)) : lines;
}

function uniqueId(text, ctx) {
  let id = ctx.prefix + (slug(text) || 'section'), k = 2;
  while (ctx.ids.has(id)) id = `${ctx.prefix}${slug(text) || 'section'}-${k++}`;
  ctx.ids.add(id);
  return id;
}

function heading(level, text, ctx) {
  const id = uniqueId(text.replace(/[`*_]/g, ''), ctx);
  const tag = `h${Math.min(6, level + 1)}`;
  if (level <= 2) ctx.toc.push({ level, id, text: text.replace(/[`*_]/g, '') });
  return `<${tag} id="${id}" class="md-h${level}">${inline(text, ctx)}<a class="anchor" href="#${id}" data-section="${id}" aria-label="Link to this section">#</a></${tag}>`;
}

function codeBlock(code, lang, title) {
  const label = title || LANG_NAMES[lang] || (lang ? lang : 'Code');
  return `<div class="code"><div class="code-head"><span>${esc(label)}</span><button type="button" class="copy" data-copy>Copy</button></div>` +
    `<pre tabindex="0"><code${lang ? ` class="lang-${esc(lang)}"` : ''}>${esc(code)}</code></pre></div>`;
}

function quote(lines, ctx) {
  const m = lines[0]?.match(/^\[!(\w+)\]\s*(.*)$/);
  const c = m && CALLOUTS[m[1].toUpperCase()];
  if (c) {
    return `<div class="prp-note callout ${c.cls}" role="note"><p class="callout-title"><b>${inline(m[2] || c.label, ctx)}</b></p>${blocks(lines.slice(1), ctx)}</div>`;
  }
  return `<blockquote>${blocks(lines, ctx)}</blockquote>`;
}

function table(rows, ctx) {
  const cells = r => r.replace(/^\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
  const head = cells(rows[0]);
  const align = cells(rows[1]).map(c => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
  const td = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ''}${tag === 'th' ? ' scope="col"' : ''}>${inline(c, ctx)}</${tag}>`;
  return `<div class="table-wrap" tabindex="0"><table class="prp-table"><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead>` +
    `<tbody>${rows.slice(2).map(r => `<tr>${cells(r).map((c, k) => td('td', c, k)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function list(lines, ctx) {
  const root = { indent: -1, children: [] }, stack = [root];
  let last = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const m = raw.match(ITEM);
    if (m) {
      const indent = m[1].replace(/\t/g, '    ').length;
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
      const item = { indent, ordered: /\d/.test(m[2]), num: parseInt(m[2], 10), text: [m[3]], children: [] };
      stack[stack.length - 1].children.push(item);
      stack.push(item);
      last = item;
    } else if (last) last.text.push(raw.trim());
  }
  return items(root.children, ctx);
}
function items(list, ctx) {
  let html = '', i = 0;
  while (i < list.length) {
    const ordered = list[i].ordered, group = [];
    while (i < list.length && list[i].ordered === ordered) group.push(list[i++]);
    const tag = ordered ? 'ol' : 'ul', start = ordered && group[0].num !== 1 ? ` start="${group[0].num}"` : '';
    html += `<${tag}${start}>${group.map(it => `<li>${inline(it.text.join(' '), ctx)}${it.children.length ? items(it.children, ctx) : ''}</li>`).join('')}</${tag}>`;
  }
  return html;
}

function directive(name, arg, lines, ctx) {
  if (name === 'figure') {
    const make = ctx.opts.figures?.[arg];
    const n = ++ctx.figures, id = `${ctx.prefix}fig-${slug(arg)}`;
    const caption = inline(lines.map(l => l.trim()).filter(Boolean).join(' '), ctx);
    const art = make ? make() : '';
    return `<figure class="prp-figure md-figure${art.includes('gf-wide') ? ' breakout' : ''}" id="${id}">${art}<figcaption><b>Figure ${n}.</b> ${caption}</figcaption></figure>`;
  }
  if (name === 'os') {
    const secs = [];
    let cur = null;
    for (const l of lines) {
      const m = l.trim().match(/^@(windows|macos|linux|any)\b\s*(.*)$/i);
      if (m) { cur = { os: m[1].toLowerCase(), title: m[2], lines: [] }; secs.push(cur); }
      else if (cur) cur.lines.push(l);
    }
    return `<div class="os-block" role="group" aria-label="Steps by operating system">${secs.map(s =>
      `<section class="os-sec" data-os="${s.os}"><p class="os-label"><span>${OS_NAMES[s.os]}</span>${s.title ? ` ${inline(s.title, ctx)}` : ''}</p>${blocks(s.lines, ctx)}</section>`).join('')}</div>`;
  }
  if (name === 'facts') {
    const rows = lines.map(l => l.trim()).filter(Boolean).map(l => { const k = l.indexOf(':'); return k > 0 ? [l.slice(0, k).trim(), l.slice(k + 1).trim()] : null; }).filter(Boolean);
    return `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${inline(v, ctx)}</dd></div>`).join('')}</dl>`;
  }
  return blocks(lines, ctx);
}

/* ---------- inline ---------- */
export function inline(text, ctx = { opts: {} }) {
  const store = [];
  const keep = html => `\u0000${store.push(html) - 1}\u0000`;
  let s = String(text ?? '');
  s = s.replace(/`([^`]+)`/g, (m, c) => keep(`<code>${esc(c)}</code>`));
  s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"([^"]*)")?\)/g, (m, label, url, title) => {
    const a = linkAttrs(url, title, ctx);
    return a ? keep(`<a ${a}>`) + label + keep('</a>') : label;
  });
  s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (m, url) => keep(`<a ${linkAttrs(url, null, ctx)}>`) + url.replace(/^https?:\/\//, '') + keep('</a>'));
  s = esc(s);
  s = s.replace(/\*\*(?!\s)(.+?)(?<!\s)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|[^\w*])\*(?![\s*])(.+?)(?<![\s*])\*(?!\w)/g, '$1<i>$2</i>');
  s = s.replace(/(^|[^\w])_(?![\s_])(.+?)(?<![\s_])_(?!\w)/g, '$1<i>$2</i>');
  s = s.replace(/\u0000(\d+)\u0000/g, (m, n) => store[+n]);
  return s;
}

export function linkAttrs(url, title, ctx = { opts: {} }) {
  const u = String(url ?? '').trim(), t = title ? ` title="${esc(title)}"` : '';
  if (/^https?:\/\/[^\s]+$/i.test(u) || /^mailto:[^\s]+$/i.test(u)) return `href="${esc(u)}" target="_blank" rel="noopener noreferrer"${t}`;
  if (/^#tab=[\w&=.,%-]*$/.test(u)) return `href="${esc(u)}" data-tab-link${t}`;
  if (/^#[\w-]+$/.test(u)) return `href="${esc(u)}" data-section="${esc(u.slice(1))}"${t}`;
  if (/^prp:\/\/[\w-]+(\/[^\s]*)?$/.test(u)) {
    const r = ctx.opts?.prpLink?.(u.slice(6));
    return r ? `href="${esc(r.href)}" target="${esc(r.target)}"${t}` : null;
  }
  if (!/^[a-z][\w+.-]*:/i.test(u) && !u.startsWith('//') && /^[\w./?=&%#-]+$/.test(u)) return `href="${esc(u)}"${t}`;
  return null;
}
