// A small renderer for the OSINT Dashboard's guides (content/*.md): a markdown-like text format with headings, lists,
// tables, callouts, code, links, fact sheets, per-operating-system install steps and figures drawn as inline SVG.
// Pure (no DOM): it returns HTML strings, so tests/osint.test.mjs runs it in Node. Everything is escaped; links are
// limited to http(s), mailto, in-page (#…) and the page's own schemes (course:, prp:), resolved by the caller.
//
// Syntax, beyond ordinary paragraphs:
//   title: / intro: / updated:    front matter at the top (until the first blank line)
//   ## Section   ### Tool   #### Sub-heading          (## and ### go into the table of contents; {#id} sets the anchor)
//   - item / * item / 1. item (indent two spaces to nest)    | a | b | tables    > quote    --- rule    ```code```
//   ! Label: text                                     a one-line callout (as in the OSINT Training course)
//   ::: note|tip|warn|bad|legal Title … :::            a callout block
//   ::: facts … :::                                   "Key: value" lines, shown as a fact sheet
//   ::: os windows|macos|linux … :::                  install steps; consecutive blocks become one tabbed group
//   ::: figure flow|stack|lanes [screens] [arrows] …  a figure: "caption:" and "label:" lines, "- [accent|dashed] Title | detail"
//                                                     steps, and for lanes "## Lane | detail" headers. Numbered automatically.
//   inline: **bold**, _italic_, `code`, [[Ctrl+C]] keys, [text](url)

import { esc } from './lib.js';

export const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Split "key: value" front matter (known keys only, at the top, until the first blank line) from the body. */
export function parseFrontMatter(src) {
  const lines = String(src ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const meta = {};
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^(title|intro|updated|summary):\s*(.*)$/);
    if (!m) break;
    meta[m[1]] = m[2].trim();
    i++;
  }
  return { meta, body: lines.slice(i).join('\n') };
}

/** Default link policy: external links open in a new tab; unknown schemes become plain text. */
export function defaultLink(href) {
  const h = String(href || '').trim();
  if (/^https?:\/\//i.test(h)) return { href: h, target: '_blank', rel: 'noopener noreferrer', cls: 'ext' };
  if (/^(#|mailto:)/i.test(h)) return { href: h };
  return null;
}

/** Inline formatting with every character escaped first. */
export function inline(text, link = defaultLink) {
  const tokens = [];
  const stash = html => `\u0000${tokens.push(html) - 1}\u0000`;
  let s = String(text ?? '');
  s = s.replace(/`([^`]+)`/g, (m, c) => stash(`<code>${esc(c)}</code>`));
  s = s.replace(/\[\[([^\]]+)\]\]/g, (m, k) => stash(k.split('+').map(x => `<kbd>${esc(x.trim())}</kbd>`).join('+')));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, href) => {
    const r = link(href);
    if (!r) return stash(emph(esc(t)));
    const ext = r.target === '_blank' ? '<span class="sr-only"> (opens in a new tab)</span>' : '';
    return stash(`<a href="${esc(r.href)}"${r.target ? ` target="${esc(r.target)}"` : ''}${r.rel ? ` rel="${esc(r.rel)}"` : ''}${r.cls ? ` class="${esc(r.cls)}"` : ''}>${emph(esc(t))}${ext}</a>`);
  });
  s = emph(esc(s));
  for (let k = 0; k < 4 && s.includes('\u0000'); k++) s = s.replace(/\u0000(\d+)\u0000/g, (m, n) => tokens[+n]); // link text may hold code
  return s;
}
const emph = s => s.replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(“"'—–-])_([^_\s][^_]*?)_(?=[\s).,;:!?”"'—–-]|$)/g, '$1<i>$2</i>');

/* ---------------------------------------------------------------------------------------------------------------
   Figures (inline SVG). Each figure is drawn twice, wide and narrow; CSS shows the one that fits the screen.
   Colours come from CSS classes written against the PRP tokens, so light and dark need no redraw.
   --------------------------------------------------------------------------------------------------------------- */
/** Greedy word wrap to at most `max` characters a line (long words are split). */
export function wrapText(text, max) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean), lines = [];
  let line = '';
  for (let w of words) {
    while (w.length > max) { if (line) { lines.push(line); line = ''; } lines.push(w.slice(0, max - 1) + '-'); w = w.slice(max - 1); }
    if (!line) line = w; else if ((line + ' ' + w).length <= max) line += ' ' + w; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}
const TITLE_PX = 7.7, SUB_PX = 6.5, TITLE_LH = 18, SUB_LH = 15;

/** Parse a figure block's lines: { caption, label, steps: [{ title, sub, flag }], lanes: [{ title, sub, items }] }. */
export function parseFigure(lines) {
  const fig = { caption: '', label: '', steps: [], lanes: [] };
  let lane = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^caption:\s*(.*)$/i))) { fig.caption = m[1]; continue; }
    if ((m = line.match(/^label:\s*(.*)$/i))) { fig.label = m[1]; continue; }
    if ((m = line.match(/^##\s+(.*)$/))) { const [title, sub = ''] = m[1].split('|').map(x => x.trim()); lane = { title, sub, items: [] }; fig.lanes.push(lane); continue; }
    if ((m = line.match(/^[-*]\s+(?:\[(accent|dashed|muted)\]\s*)?(.*)$/))) {
      const [title, sub = ''] = m[2].split('|').map(x => x.trim());
      const step = { title, sub, flag: m[1] || '' };
      (lane ? lane.items : fig.steps).push(step);
    }
  }
  return fig;
}

function textLines(x, y, lines, cls, lh, anchor = 'start') {
  return lines.map((l, i) => `<text class="${cls}" x="${x}" y="${y + i * lh}" text-anchor="${anchor}">${esc(l)}</text>`).join('');
}
const marker = id => `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="fg-head" d="M0 0L10 5L0 10z"/></marker></defs>`;
const svgOpen = (w, h, id, label, desc, extra = '') => `<svg class="fg${extra}" viewBox="0 0 ${w} ${Math.ceil(h)}" width="${w}" height="${Math.ceil(h)}" role="img" aria-labelledby="${id}-t ${id}-d" preserveAspectRatio="xMidYMin meet"><title id="${id}-t">${esc(label)}</title><desc id="${id}-d">${esc(desc)}</desc>${marker(id + '-m')}`;
const boxCls = flag => 'fg-box' + (flag ? ' fg-' + flag : '');

function flowLayout(steps, { width, cols, gap, pad = 12, numbered = true }) {
  const boxW = (width - (cols - 1) * gap) / cols;
  const tMax = Math.max(8, Math.floor((boxW - 2 * pad - (numbered ? 22 : 0)) / TITLE_PX)), sMax = Math.max(8, Math.floor((boxW - 2 * pad) / SUB_PX));
  return steps.map(s => {
    const t = wrapText(s.title, tMax), d = wrapText(s.sub, sMax);
    return { ...s, t, d, h: pad * 2 + t.length * TITLE_LH + (d.length ? 6 + d.length * SUB_LH : 0), w: boxW };
  });
}
/** A left-to-right chain of steps (wrapping onto a second row when long), or a top-to-bottom one when narrow. */
export function flowSvg(fig, { id = 'fg', narrow = false, width = 960 } = {}) {
  const steps = fig.steps, n = steps.length;
  if (!n) return '';
  const desc = steps.map((s, i) => `${i + 1}. ${s.title}${s.sub ? ': ' + s.sub : ''}`).join(' ');
  const label = fig.label || steps.map(s => s.title).join(' → ');
  let body = '', W, H;
  if (narrow) {
    W = 340; const gap = 28, x = 10, w = 320;
    const L = flowLayout(steps, { width: w, cols: 1, gap: 0 });
    let y = 6;
    L.forEach((s, i) => {
      body += `<rect class="${boxCls(s.flag)}" x="${x}" y="${y}" width="${w}" height="${s.h}" rx="6"/>`;
      body += `<circle class="fg-num-bg" cx="${x + 22}" cy="${y + 12 + 9}" r="10"/><text class="fg-num" x="${x + 22}" y="${y + 12 + 13}" text-anchor="middle">${i + 1}</text>`;
      body += textLines(x + 40, y + 12 + 13, s.t, 'fg-title', TITLE_LH) + textLines(x + 12, y + 12 + s.t.length * TITLE_LH + 6 + 11, s.d, 'fg-sub', SUB_LH);
      y += s.h;
      if (i < n - 1) { body += `<line class="fg-arrow" x1="${x + w / 2}" y1="${y + 2}" x2="${x + w / 2}" y2="${y + gap - 3}" marker-end="url(#${id}-m)"/>`; y += gap; }
    });
    H = y + 6;
  } else {
    W = width; const gap = 34, cols = n <= 6 ? n : Math.ceil(n / 2), rowGap = 46;
    const L = flowLayout(steps, { width: W - 4, cols, gap });
    const rows = [];
    for (let i = 0; i < n; i += cols) rows.push(L.slice(i, i + cols));
    let y = 4;
    rows.forEach((row, r) => { row.forEach((s, c) => { s.x = 2 + c * (s.w + gap); }); }); // every box's x, before any connector needs it
    rows.forEach((row, r) => {
      const h = Math.max(...row.map(s => s.h));
      row.forEach((s, c) => {
        const i = r * cols + c, x = s.x;
        s.y = y; s.hh = h;
        body += `<rect class="${boxCls(s.flag)}" x="${x}" y="${y}" width="${s.w}" height="${h}" rx="6"/>`;
        body += `<circle class="fg-num-bg" cx="${x + 22}" cy="${y + 12 + 9}" r="10"/><text class="fg-num" x="${x + 22}" y="${y + 12 + 13}" text-anchor="middle">${i + 1}</text>`;
        body += textLines(x + 40, y + 12 + 13, s.t, 'fg-title', TITLE_LH) + textLines(x + 12, y + 12 + s.t.length * TITLE_LH + 6 + 11, s.d, 'fg-sub', SUB_LH);
        if (c < row.length - 1) body += `<line class="fg-arrow" x1="${x + s.w + 3}" y1="${y + h / 2}" x2="${x + s.w + gap - 3}" y2="${y + h / 2}" marker-end="url(#${id}-m)"/>`;
      });
      if (r < rows.length - 1) {
        const a = row.at(-1), b = rows[r + 1][0], mid = y + h + rowGap / 2;
        body += `<path class="fg-arrow" d="M${a.x + a.w / 2} ${y + h + 3} V${mid} H${b.x + b.w / 2} V${y + h + rowGap - 3}" fill="none" marker-end="url(#${id}-m)"/>`;
      }
      y += h + (r < rows.length - 1 ? rowGap : 0);
    });
    H = y + 4;
  }
  return svgOpen(W, H, id, label, desc, narrow ? ' fg-narrow' : ' fg-wide') + body + '</svg>';
}

/** Layers from top to bottom (for example the investigator's workstation, from the web down to the hardware). */
export function stackSvg(fig, { id = 'fg', narrow = false } = {}) {
  const steps = fig.steps, n = steps.length;
  if (!n) return '';
  const desc = steps.map(s => `${s.title}${s.sub ? ': ' + s.sub : ''}`).join('; ');
  const label = fig.label || 'Layers: ' + steps.map(s => s.title).join(', ');
  const W = narrow ? 340 : 960, pad = 12, gap = 8;
  let y = 4, body = '';
  steps.forEach((s, i) => {
    let h;
    if (narrow) {
      const t = wrapText(s.title, Math.floor((W - 2 * pad - 8) / TITLE_PX)), d = wrapText(s.sub, Math.floor((W - 2 * pad - 8) / SUB_PX));
      h = pad * 2 + t.length * TITLE_LH + (d.length ? 4 + d.length * SUB_LH : 0);
      body += `<rect class="${boxCls(s.flag)}" x="4" y="${y}" width="${W - 8}" height="${h}" rx="6"/>` + textLines(4 + pad, y + pad + 13, t, 'fg-title', TITLE_LH) + textLines(4 + pad, y + pad + t.length * TITLE_LH + 4 + 11, d, 'fg-sub', SUB_LH);
    } else {
      const labelW = 250, t = wrapText(s.title, Math.floor((labelW - pad) / TITLE_PX)), d = wrapText(s.sub, Math.floor((W - labelW - 3 * pad - 8) / SUB_PX));
      h = Math.max(t.length * TITLE_LH, d.length * SUB_LH) + pad * 2;
      body += `<rect class="${boxCls(s.flag)}" x="4" y="${y}" width="${W - 8}" height="${h}" rx="6"/>` + textLines(4 + pad, y + pad + 13, t, 'fg-title', TITLE_LH)
        + `<line class="fg-rule" x1="${4 + labelW}" y1="${y + 8}" x2="${4 + labelW}" y2="${y + h - 8}"/>` + textLines(4 + labelW + pad, y + pad + 12, d, 'fg-sub', SUB_LH);
    }
    y += h + (i < n - 1 ? gap : 0);
  });
  return svgOpen(W, y + 4, id, label, desc, narrow ? ' fg-narrow' : ' fg-wide') + body + '</svg>';
}

/** Side-by-side columns ("lanes") of items, drawn as screens with `screens`, joined by arrows with `arrows`. */
export function lanesSvg(fig, { id = 'fg', narrow = false, screens = false, arrows = false } = {}) {
  const lanes = fig.lanes, k = lanes.length;
  if (!k) return '';
  const desc = lanes.map(l => `${l.title}${l.sub ? ' (' + l.sub + ')' : ''}: ${l.items.map(i => i.title + (i.sub ? ' – ' + i.sub : '')).join('; ')}`).join('. ');
  const label = fig.label || lanes.map(l => l.title).join(' · ');
  const pad = 12, gap = narrow ? 30 : arrows ? 40 : 18, W = narrow ? 340 : 960;
  const laneW = narrow ? W - 8 : (W - 8 - (k - 1) * gap) / k;
  const inner = laneW - 2 * pad;
  const layout = lanes.map(l => {
    const t = wrapText(l.title, Math.floor((inner - 4) / TITLE_PX)), s = wrapText(l.sub, Math.floor(inner / SUB_PX));
    const items = l.items.map(it => { const a = wrapText(it.title, Math.floor((inner - 20) / (TITLE_PX * 0.9))), b = wrapText(it.sub, Math.floor((inner - 20) / SUB_PX)); return { ...it, a, b, h: 16 + a.length * 16 + (b.length ? 2 + b.length * SUB_LH : 0) }; });
    const head = pad + t.length * TITLE_LH + (s.length ? 2 + s.length * SUB_LH : 0) + 8;
    return { ...l, t, s, items, head, h: head + items.reduce((a, it) => a + it.h + 8, 0) + pad - 8 + (screens ? 6 : 0) };
  });
  const maxH = Math.max(...layout.map(l => l.h));
  let body = '', x = 4, y = 4;
  layout.forEach((l, i) => {
    const h = narrow ? l.h : maxH;
    const frame = screens ? 'fg-screen' : 'fg-lane';
    body += `<rect class="${frame}" x="${x}" y="${y}" width="${laneW}" height="${h}" rx="${screens ? 8 : 6}"/>`;
    if (screens) body += `<path class="fg-stand" d="M${x + laneW / 2 - 26} ${y + h + 16} H${x + laneW / 2 + 26} M${x + laneW / 2} ${y + h} V${y + h + 16}"/>`;
    body += textLines(x + pad, y + pad + 13, l.t, 'fg-title', TITLE_LH) + textLines(x + pad, y + pad + l.t.length * TITLE_LH + 2 + 11, l.s, 'fg-sub', SUB_LH);
    let iy = y + l.head;
    for (const it of l.items) {
      body += `<rect class="${boxCls(it.flag)} fg-item" x="${x + pad}" y="${iy}" width="${inner}" height="${it.h}" rx="4"/>`;
      body += textLines(x + pad + 10, iy + 8 + 12, it.a, 'fg-item-title', 16) + textLines(x + pad + 10, iy + 8 + it.a.length * 16 + 2 + 10, it.b, 'fg-sub', SUB_LH);
      iy += it.h + 8;
    }
    const after = screens ? 22 : 0;
    if (arrows && i < k - 1) {
      body += narrow ? `<line class="fg-arrow" x1="${W / 2}" y1="${y + h + after + 3}" x2="${W / 2}" y2="${y + h + after + gap - 3}" marker-end="url(#${id}-m)"/>`
        : `<line class="fg-arrow" x1="${x + laneW + 3}" y1="${y + h / 2}" x2="${x + laneW + gap - 3}" y2="${y + h / 2}" marker-end="url(#${id}-m)"/>`;
    }
    if (narrow) y += h + after + gap; else x += laneW + gap;
  });
  const H = narrow ? y - gap + 4 : maxH + 8 + (screens ? 22 : 0);
  return svgOpen(W, H, id, label, desc, narrow ? ' fg-narrow' : ' fg-wide') + body + '</svg>';
}

const FIGURES = { flow: flowSvg, stack: stackSvg, lanes: lanesSvg };
/** A <figure> with both layouts and a numbered caption. */
export function figureHtml(type, lines, { n = 1, id = 'fig', link = defaultLink, opts = [], width = 960 } = {}) {
  const fig = parseFigure(lines);
  const draw = FIGURES[type];
  if (!draw) return '';
  const o = { screens: opts.includes('screens'), arrows: opts.includes('arrows'), width };
  const wide = draw(fig, { id: id + '-w', narrow: false, ...o }), narrow = draw(fig, { id: id + '-n', narrow: true, ...o });
  return `<figure class="prp-figure md-figure" id="${esc(id)}"><div class="fg-wrap">${wide}${narrow}</div><figcaption><b>Figure ${n}.</b> ${inline(fig.caption, link)}</figcaption></figure>`;
}

/* ---------------------------------------------------------------------------------------------------------------
   Blocks
   --------------------------------------------------------------------------------------------------------------- */
const OS_NAMES = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android', ios: 'iOS', any: 'Any system' };
const CALLOUTS = { note: '', tip: 'tip', warn: 'warn', bad: 'bad', legal: 'legal' };

/**
 * Render a guide: { html, toc: [{ id, text, level }], meta, figures }.
 * opts.link(href) resolves links; opts.idPrefix prefixes heading ids; opts.figurePrefix names figure ids.
 */
export function renderMarkdown(src, opts = {}) {
  const link = opts.link || defaultLink, prefix = opts.idPrefix || '', figPrefix = opts.figurePrefix || 'fig';
  const { meta, body } = parseFrontMatter(src);
  const toc = [], used = new Set();
  let figN = 0, osGroup = 0;
  const uniqueId = base => { let id = prefix + (base || 'section'), k = 2; while (used.has(id)) id = `${prefix}${base}-${k++}`; used.add(id); return id; };

  function blocks(lines, nested = false) {
    const out = [];
    let i = 0;
    const isBlank = l => !l.trim();
    const startsBlock = l => /^(#{2,4}\s|```|:::|!\s|>\s?|\|)/.test(l) || /^\s*([-*]|\d+\.)\s+/.test(l) || /^-{3,}\s*$/.test(l);
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) { i++; continue; }
      // Fenced code
      if (/^```/.test(line)) {
        const lang = line.slice(3).trim(), buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<div class="code-wrap"><pre class="code"${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(buf.join('\n'))}</code></pre><button type="button" class="copy-code prp-btn sm ghost" aria-label="Copy this code">Copy</button></div>`);
        continue;
      }
      // ::: blocks
      const fence = line.match(/^:::\s*([a-z]+)\s*(.*)$/i);
      if (fence) {
        const readBlock = start => { const buf = []; let j = start + 1; while (j < lines.length && !/^:::\s*$/.test(lines[j])) buf.push(lines[j++]); return { buf, next: j + 1 }; };
        const type = fence[1].toLowerCase(), arg = fence[2].trim();
        if (type === 'os') {
          const panes = [];
          let j = i;
          while (j < lines.length) {
            const m = lines[j].match(/^:::\s*os\s+([a-z]+)\s*(.*)$/i);
            if (!m) break;
            const { buf, next } = readBlock(j);
            panes.push({ os: m[1].toLowerCase(), label: m[2].trim() || OS_NAMES[m[1].toLowerCase()] || m[1], html: blocks(buf, true) });
            j = next;
            while (j < lines.length && isBlank(lines[j])) j++;
          }
          i = j;
          const g = `${prefix}os-${++osGroup}`;
          out.push(`<div class="os-group" data-os-group="${g}"><div class="os-tabs" role="tablist" aria-label="Steps for your system or browser">${panes.map((p, k) => `<button type="button" role="tab" id="${g}-${k}" aria-controls="${g}-${k}-p" data-os="${esc(p.os)}" aria-selected="${k === 0}" tabindex="${k === 0 ? 0 : -1}">${esc(p.label)}</button>`).join('')}</div>${panes.map((p, k) => `<div class="os-pane" role="tabpanel" id="${g}-${k}-p" aria-labelledby="${g}-${k}" data-os="${esc(p.os)}"${k === 0 ? '' : ' hidden'}>${p.html}</div>`).join('')}</div>`);
          continue;
        }
        const { buf, next } = readBlock(i);
        i = next;
        if (type === 'facts') {
          const rows = buf.map(l => l.match(/^\s*([^:]{1,40}):\s*(.*)$/)).filter(Boolean);
          out.push(`<dl class="facts">${rows.map(m => `<div><dt>${esc(m[1].trim())}</dt><dd>${inline(m[2], link)}</dd></div>`).join('')}</dl>`);
        } else if (type === 'figure') {
          const [kind, ...rest] = arg.split(/\s+/);
          out.push(figureHtml(kind, buf, { n: ++figN, id: `${figPrefix}-${figN}`, link, opts: rest }));
        } else if (type in CALLOUTS) {
          out.push(`<div class="callout ${CALLOUTS[type]}">${arg ? `<b class="k">${inline(arg, link)}</b>` : ''}${blocks(buf, true)}</div>`);
        } else out.push(blocks(buf, true));
        continue;
      }
      // Headings
      const h = line.match(/^(#{2,4})\s+(.*?)(?:\s*\{#([a-z0-9-]+)\})?\s*$/);
      if (h) {
        const level = h[1].length, text = h[2];
        const id = uniqueId(h[3] || slugify(text.replace(/[*_`]/g, '')));
        if (level <= 3 && !nested) toc.push({ id, text: text.replace(/\*\*|`|_/g, ''), level });
        const tag = 'h' + (level + 1);
        out.push(`<${tag} id="${esc(id)}" class="md-h${level}">${inline(text, link)}</${tag}>`);
        i++;
        continue;
      }
      // One-line callout
      const call = line.match(/^!\s+([^:]{1,40}):\s*(.*)$/);
      if (call) { out.push(`<div class="callout"><b class="k">${esc(call[1])}</b><p>${inline(call[2], link)}</p></div>`); i++; continue; }
      if (/^-{3,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      // Quote
      if (/^>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
        out.push(`<blockquote class="quote">${blocks(buf, true)}</blockquote>`);
        continue;
      }
      // Table
      if (/^\|/.test(line)) {
        const rows = [];
        while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
        const split = r => r.replace(/^\||\|\s*$/g, '').split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, '|').trim());
        const head = split(rows[0]), sep = rows[1] && /^\|?\s*:?-{2,}/.test(rows[1].replace(/^\|/, '').trim()) ? 1 : 0;
        const bodyRows = rows.slice(sep ? 2 : 1).map(split);
        // Three or more columns: each cell carries its column name, so phones can show every row as a small card.
        const stack = head.length >= 3, plain = s => String(s).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim();
        out.push(`<div class="tablewrap${stack ? ' stackable' : ''}"><table class="prp-table md-table"><thead><tr>${head.map(c => `<th scope="col">${inline(c, link)}</th>`).join('')}</tr></thead><tbody>${bodyRows.map(r => `<tr>${head.map((x, k) => `<td${stack && k ? ` data-label="${esc(plain(x))}"` : ''}>${inline(r[k] ?? '', link)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      // Lists (one level of nesting by indentation)
      const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
      if (li) {
        const ordered = /\d/.test(li[2]);
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
          if (m && m[1].length < 2) { items.push({ text: m[3], sub: [] }); i++; continue; }
          if (m && m[1].length >= 2 && items.length) { items.at(-1).sub.push(lines[i].replace(/^\s{2,4}/, '')); i++; continue; }
          if (!isBlank(lines[i]) && /^\s{2,}\S/.test(lines[i]) && items.length) { items.at(-1).text += ' ' + lines[i].trim(); i++; continue; }
          break;
        }
        const tag = ordered ? 'ol' : 'ul', start = ordered ? parseInt(li[2], 10) : 1;
        const task = items.every(it => /^\[[ xX]\]\s/.test(it.text));
        const itemHtml = it => {
          if (!task) return `<li>${inline(it.text, link)}${it.sub.length ? blocks(it.sub, true) : ''}</li>`;
          return `<li><label><input type="checkbox"${/^\[[xX]\]/.test(it.text) ? ' checked' : ''}> <span>${inline(it.text.replace(/^\[[ xX]\]\s+/, ''), link)}</span></label></li>`;
        };
        out.push(`<${tag}${task ? ' class="tasks"' : ''}${start > 1 ? ` start="${start}"` : ''}>${items.map(itemHtml).join('')}</${tag}>`);
        continue;
      }
      // Paragraph
      const buf = [line.trim()];
      i++;
      while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i])) buf.push(lines[i++].trim());
      out.push(`<p>${inline(buf.join(' '), link)}</p>`);
    }
    return out.join('\n');
  }

  const html = blocks(body.split('\n'));
  return { html, toc, meta, figures: figN };
}
