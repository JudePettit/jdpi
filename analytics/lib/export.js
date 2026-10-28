// Data Analytics: a chart as a standalone SVG or PNG, with its title, legend, caption and source drawn in, in the
// colours of the theme it was drawn in.
import { rampSVG } from './render.js';

const xml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
// Word-wrap by an estimate of character width (the file cannot measure text before it is opened).
export function wrap(text, maxWidth, px) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean), lines = [];
  let line = '';
  const fits = s => s.length * px <= maxWidth;
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (fits(next) || !line) line = next; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * @param o { svg: the Plot SVG element, legend: [{ name, colour }], ramp, title, caption ("Figure 1. …"), lead ("Figure 1."), T: tokens }
 * @returns { text, width, height }
 */
export function composeSVG(o) {
  const { T } = o;
  const PAD = 20;
  const cw = Math.ceil(+o.svg.getAttribute('width') || o.svg.getBoundingClientRect().width || 640);
  const ch = Math.ceil(+o.svg.getAttribute('height') || o.svg.getBoundingClientRect().height || 400);
  const W = cw + PAD * 2, inner = W - PAD * 2;
  const ui = xml(T.fontUi || 'sans-serif'), serif = xml(T.fontSerif || 'serif');
  const parts = [];
  let y = PAD;
  for (const line of wrap(o.title, inner, 8.4)) { parts.push(`<text x="${PAD}" y="${y + 15}" font-family="${serif}" font-size="17" font-weight="600" fill="${T.text}">${xml(line)}</text>`); y += 22; }
  if (o.legend?.length) {
    y += 4;
    let x = PAD;
    for (const { name, colour } of o.legend) {
      const w = 18 + String(name).length * 6.6 + 14;
      if (x > PAD && x + w > PAD + inner) { x = PAD; y += 18; }
      parts.push(`<rect x="${x}" y="${y + 1}" width="10" height="10" rx="2" fill="${colour}"/><text x="${x + 15}" y="${y + 10}" font-family="${ui}" font-size="12" fill="${T.text2}">${xml(name)}</text>`);
      x += w;
    }
    y += 22;
  }
  if (o.ramp?.thresholds?.length) { parts.push(`<g transform="translate(${PAD} ${y})">${rampSVG(o.ramp, T, Math.min(360, inner))}</g>`); y += 52; }
  // The chart itself, with currentColor fixed to the theme's text colour and the pointer's tooltip left out.
  const clone = o.svg.cloneNode(true);
  clone.querySelectorAll('[aria-label="tip"]').forEach(n => n.remove());
  clone.setAttribute('x', PAD); clone.setAttribute('y', y);
  clone.setAttribute('width', cw); clone.setAttribute('height', ch);
  clone.style.color = T.text2;
  clone.style.background = 'transparent';
  parts.push(new XMLSerializer().serializeToString(clone));
  y += ch + 12;
  const lead = o.lead || '';
  const body = String(o.caption || '').startsWith(lead) ? String(o.caption).slice(lead.length).trim() : String(o.caption || '');
  const lines = wrap((lead ? lead + ' ' : '') + body, inner, 6.2);
  lines.forEach((line, i) => {
    const content = i === 0 && lead && line.startsWith(lead) ? `<tspan font-weight="600" font-style="normal" fill="${T.text}">${xml(lead)}</tspan>${xml(line.slice(lead.length))}` : xml(line);
    parts.push(`<text x="${PAD}" y="${y + 12}" font-family="${serif}" font-size="12.5" font-style="italic" fill="${T.text2}">${content}</text>`);
    y += 17;
  });
  const H = Math.ceil(y + PAD - 4);
  const text = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<title>${xml(o.title)}</title><desc>${xml(o.caption)}</desc><rect width="100%" height="100%" fill="${T.surface}"/>${parts.join('')}</svg>`;
  return { text, width: W, height: H };
}

/** Render an SVG text to a PNG blob at `scale` times its size. */
export function svgToPng({ text, width, height }, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(width * scale); c.height = Math.round(height * scale);
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('The browser could not make a PNG'))), 'image/png');
    };
    img.onerror = () => reject(new Error('The browser could not draw the chart as an image'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
  });
}

export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export const slug = s => String(s || 'analysis').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'analysis';
