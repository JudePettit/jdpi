/* Kino stage: draws each scene's visual in a 16:9 frame, as light SVG and CSS loops ("like GIFs").
   - map: world-atlas@2 countries (present-day borders) with d3; highlighted countries fade in by tone, arrows draw
     in, fronts march, points pulse, and the view glides to the scene's focus: its bbox, or, when it has none, the
     smallest frame that borders every highlighted country and point.
   - timeline: a sweep along an axis that lights labelled events as it passes.
   - portrait: a Commons image (Wikidata P18 or a named file) with a slow Ken Burns drift, credited with its licence.
   - quote: large serif text with its attribution.   - chart: bars or ranges, or a line, drawn in.
   - module: a card that opens the linked PRP submodule.   - title: the documentary's title card.
   Colours are PRP tokens set in kino.css, so light and dark need no redraw. Text sizes follow the frame's width with
   legible minimums (u = viewBox units per screen pixel). */
import { flatScenes, shortCite } from './format.js';

export const W = 1600, H = 900;
const CDN = {
  d3: 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js',
  topojson: 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js',
  atlas: 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json',
};
const NS = 'http://www.w3.org/2000/svg';
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------- geography (loaded once, only when a map is needed) ---------- */
function loadScript(src, global) {
  if (window[global]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => resolve(); s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}
let geo = null;
export function loadGeo(base = 'data/') {
  return geo ||= (async () => {
    await loadScript(CDN.d3, 'd3');
    await loadScript(CDN.topojson, 'topojson');
    const [topo, iso] = await Promise.all([fetch(CDN.atlas).then(r => r.json()), fetch(base + 'iso.json').then(r => r.json())]);
    const features = window.topojson.feature(topo, topo.objects.countries).features;
    const isoOfNum = new Map(Object.entries(iso.codes).map(([k, v]) => [+v, k]));
    const nameIso = new Map(Object.entries(iso.byName || {}).map(([k, v]) => [v, k]));
    for (const f of features) f.iso = f.id != null ? isoOfNum.get(+f.id) || null : nameIso.get(f.properties.name) || null;
    const byIso = new Map(features.filter(f => f.iso).map(f => [f.iso, f]));
    const expand = code => (iso.historical[code] ? iso.historical[code] : [code]);
    const projection = window.d3.geoNaturalEarth1().fitExtent([[10, 10], [W - 10, H - 10]], { type: 'Sphere' });
    return { d3: window.d3, features, byIso, expand, projection, path: window.d3.geoPath(projection), graticule: window.d3.geoGraticule10() };
  })().catch(e => { geo = null; throw e; });
}

/** Tone for each ISO3 code in a scene: its group's tone, or "f" (focus) for focus countries outside every group. */
export function tonesOf(scene, g) {
  const tones = new Map();
  for (const c of scene.focus?.countries || []) for (const k of g.expand(c)) tones.set(k, 'f');
  for (const grp of scene.visual?.groups || []) for (const c of grp.countries) for (const k of g.expand(c)) tones.set(k, String(grp.tone));
  return tones;
}

/* A view is [cx, cy, w]: the centre and visible width in base projected units (d3.interpolateZoom's form). */
const toTransform = ([cx, cy, w]) => { const k = W / w; return { k, x: W / 2 - k * cx, y: H / 2 - k * cy }; };
function viewOfBox(x0, y0, x1, y1, pad = 1.1) {
  const w = Math.max(x1 - x0, ((y1 - y0) * W) / H) * pad;
  return [(x0 + x1) / 2, (y0 + y1) / 2, Math.min(W, Math.max(W / 16, w))];
}
/** The view for a scene: its bbox, or the frame that borders every highlighted country and point. */
export function viewFor(scene, g) {
  const f = scene.focus || {}, P = g.projection;
  if (f.bbox) {
    let [w, s, e, n] = f.bbox; if (e < w) e += 360;
    const pts = [];
    for (let i = 0; i <= 24; i++) { const lon = w + ((e - w) * i) / 24; pts.push([lon, s], [lon, n]); }
    for (let i = 0; i <= 12; i++) { const lat = s + ((n - s) * i) / 12; pts.push([w, lat], [e, lat]); }
    const xy = pts.map(p => P([((p[0] + 540) % 360) - 180, p[1]])).filter(Boolean);
    return viewOfBox(Math.min(...xy.map(p => p[0])), Math.min(...xy.map(p => p[1])), Math.max(...xy.map(p => p[0])), Math.max(...xy.map(p => p[1])), 1.1);
  }
  const boxes = [];
  for (const [iso] of tonesOf(scene, g)) { const ft = g.byIso.get(iso); if (ft) boxes.push(g.path.bounds(ft)); }
  // Very wide countries (Russia, Canada) would pull the frame out to the whole map; frame them only if alone.
  const narrow = boxes.filter(b => b[1][0] - b[0][0] < W * 0.45);
  const use = narrow.length ? narrow : boxes;
  for (const p of f.points || []) { const xy = P(p); if (xy) use.push([xy, xy]); }
  if (!use.length) return [W / 2, H / 2, W];
  return viewOfBox(Math.min(...use.map(b => b[0][0])), Math.min(...use.map(b => b[0][1])), Math.max(...use.map(b => b[1][0])), Math.max(...use.map(b => b[1][1])), 1.25);
}

const el = (name, attrs = {}, parent) => { const n = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v); parent?.appendChild(n); return n; };

/* ---------- the map ---------- */
class MapView {
  constructor(svg, g) {
    this.svg = svg; this.g = g; this.view = [W / 2, H / 2, W]; this.scene = null;
    svg.innerHTML = '';
    el('rect', { class: 'water', width: W, height: H }, svg);
    this.world = el('g', { class: 'world' }, svg);
    el('path', { class: 'grat', d: g.path(g.graticule) }, this.world);
    this.paths = new Map();
    for (const f of g.features) { const p = el('path', { class: 'c', d: g.path(f) }, this.world); if (f.iso) { p.dataset.iso = f.iso; this.paths.set(f.iso, p); } }
    el('path', { class: 'sphere', d: g.path({ type: 'Sphere' }) }, this.world);
    this.overlay = el('g', { class: 'overlay' }, svg);
    this.apply(this.view);
  }
  apply(view) {
    this.view = view;
    const t = toTransform(view);
    this.world.setAttribute('transform', `translate(${t.x.toFixed(2)},${t.y.toFixed(2)}) scale(${t.k.toFixed(4)})`);
  }
  project(lonlat) { const p = this.g.projection(lonlat); if (!p) return null; const t = toTransform(this.view); return [t.x + t.k * p[0], t.y + t.k * p[1]]; }
  unit() { return W / Math.max(200, this.svg.getBoundingClientRect().width || 800); }

  async show(scene, { animate = true } = {}) {
    this.scene = scene;
    const tones = tonesOf(scene, this.g);
    for (const [iso, p] of this.paths) { p.classList.remove('t1', 't2', 't3', 'tf'); const t = tones.get(iso); if (t) p.classList.add('t' + t); }
    this.svg.classList.toggle('still', !!scene.visual?.still);
    this.overlay.innerHTML = '';
    const target = viewFor(scene, this.g), token = (this.token = (this.token || 0) + 1);
    if (!animate || reduced()) { this.apply(target); this.drawOverlay(); return; }
    const interp = this.g.d3.interpolateZoom(this.view, target);
    const ms = Math.max(900, Math.min(2600, interp.duration * 0.9));
    const t0 = performance.now(), ease = this.g.d3.easeCubicInOut;
    await new Promise(resolve => {
      const frame = now => {
        if (token !== this.token) return resolve();
        const k = Math.min(1, (now - t0) / ms);
        this.apply(interp(ease(k)));
        if (k < 1) requestAnimationFrame(frame); else resolve();
      };
      requestAnimationFrame(frame);
    });
    if (token === this.token) this.drawOverlay();
  }

  /** Arrows, fronts, points and labels, in screen-sized units at the current view. */
  drawOverlay() {
    const s = this.scene; if (!s) return;
    const u = this.unit(), fs = Math.max(11, Math.min(14.5, (W / u) / 75)) * u, ov = this.overlay;
    ov.innerHTML = '';
    const v = s.visual || {}, d3 = this.g.d3, placed = [];
    const box = (x, y, w, h) => ({ x, y, w, h });
    const hits = b => placed.some(p => b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y);
    const label = (text, x, y, cls, tries) => {
      const w = text.length * fs * 0.56, h = fs * 1.25;
      for (const [dx, dy, anchor] of tries) {
        const bx = anchor === 'end' ? x + dx - w : anchor === 'middle' ? x + dx - w / 2 : x + dx;
        const b = box(bx, y + dy - h * 0.8, w, h);
        if (b.x < 4 * u || b.x + b.w > W - 4 * u || b.y < 4 * u || b.y + b.h > H - 4 * u || hits(b)) continue;
        placed.push(b);
        const t = el('text', { class: `lbl ${cls}`, x: x + dx, y: y + dy, 'text-anchor': anchor, 'font-size': fs.toFixed(1) }, ov);
        t.textContent = text; return t;
      }
      return null;
    };
    // Dots take their room first, so no label covers a place.
    const pts = (s.focus?.points || []).map(p => ({ p, xy: this.project(p) })).filter(x => x.xy);
    for (const { xy } of pts) placed.push(box(xy[0] - 7 * u, xy[1] - 7 * u, 14 * u, 14 * u));
    // Fronts: a dashed line with a halo, marching.
    for (const fr of v.fronts || []) {
      const line = fr.line.map(p => this.project(p)).filter(Boolean);
      const d = d3.line().curve(d3.curveCatmullRom.alpha(0.5))(line);
      el('path', { class: 'front-halo', d, 'stroke-width': (6 * u).toFixed(1) }, ov);
      el('path', { class: 'front', d, 'stroke-width': (2.4 * u).toFixed(1), style: `stroke-dasharray:${(10 * u).toFixed(1)} ${(7 * u).toFixed(1)}` }, ov);
    }
    // Arrows: a curve that draws in, then its head.
    const heads = [], arrowLabels = [];
    for (const a of v.arrows || []) {
      const from = this.project(a.from), to = this.project(a.to), via = a.via ? this.project(a.via) : null;
      if (!from || !to) continue;
      const tone = a.tone || 1, head = 15 * u;
      let d, dir;
      if (via) {
        dir = [to[0] - via[0], to[1] - via[1]];
        const len = Math.hypot(...dir) || 1, end = [to[0] - (dir[0] / len) * head * 0.7, to[1] - (dir[1] / len) * head * 0.7];
        d = d3.line().curve(d3.curveCatmullRom.alpha(0.5))([from, via, end]);
      } else {
        const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2, len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
        const c = [mx - ((to[1] - from[1]) / len) * len * 0.16, my + ((to[0] - from[0]) / len) * len * 0.16];
        dir = [to[0] - c[0], to[1] - c[1]];
        const l2 = Math.hypot(...dir) || 1, end = [to[0] - (dir[0] / l2) * head * 0.7, to[1] - (dir[1] / l2) * head * 0.7];
        d = `M${from[0]},${from[1]} Q${c[0]},${c[1]} ${end[0]},${end[1]}`;
      }
      el('path', { class: `arrow t${tone}`, d, pathLength: 1, 'stroke-width': (3.6 * u).toFixed(1) }, ov);
      const ang = Math.atan2(dir[1], dir[0]), cs = Math.cos(ang), sn = Math.sin(ang), back = [to[0] - cs * head, to[1] - sn * head];
      heads.push(el('path', { class: `head t${tone}`, d: `M${to[0]},${to[1]} L${back[0] - sn * head * 0.55},${back[1] + cs * head * 0.55} L${back[0] + sn * head * 0.55},${back[1] - cs * head * 0.55} Z` }, ov));
      if (a.label) arrowLabels.push([a.label, from]);
    }
    // Dots with a pulsing ring.
    for (const { xy } of pts) {
      el('circle', { class: 'ring', cx: xy[0], cy: xy[1], r: (9 * u).toFixed(1) }, ov);
      el('circle', { class: 'pt', cx: xy[0], cy: xy[1], r: (4.6 * u).toFixed(1), 'stroke-width': (2 * u).toFixed(1) }, ov);
    }
    // Labels where there is room: places first, then movements (at the arrow's start), then fronts.
    for (const { p, xy } of pts) if (p[2]) label(p[2], xy[0], xy[1], 'pt-lbl', [[11 * u, fs * 0.35, 'start'], [-11 * u, fs * 0.35, 'end'], [0, -12 * u, 'middle'], [0, fs + 10 * u, 'middle'], [11 * u, -10 * u, 'start'], [-11 * u, -10 * u, 'end'], [11 * u, fs + 6 * u, 'start'], [-11 * u, fs + 6 * u, 'end']]);
    // A phone-sized stage keeps only the places; the key and the narration name the movements and fronts.
    const roomy = W / u >= 560;
    if (roomy) for (const [text, at] of arrowLabels) label(text, at[0], at[1], 'arrow-lbl', [[0, -14 * u, 'middle'], [0, fs + 12 * u, 'middle'], [-12 * u, fs * 0.35, 'end'], [12 * u, fs * 0.35, 'start'], [0, -14 * u - fs * 1.3, 'middle']]);
    for (const fr of v.fronts || []) {
      if (!fr.label || !roomy) continue;
      const line = fr.line.map(p => this.project(p)).filter(Boolean), m = line[Math.floor(line.length / 2)];
      if (m) label(fr.label, m[0], m[1], 'front-lbl', [[12 * u, 0, 'start'], [-12 * u, 0, 'end'], [0, -14 * u, 'middle'], [0, fs + 12 * u, 'middle']]);
    }
    for (const h of heads) ov.appendChild(h); // heads above labels' halos
  }
}

/* ---------- the stage ---------- */
export class Stage {
  /** root: the .kn-stage element; opts: { media, registry, onLink(link), base } */
  constructor(root, opts) {
    this.root = root; this.opts = opts; this.map = null; this.loops = []; this.scene = null;
    root.querySelector('svg.kn-map')?.remove();
    this.mapSvg = el('svg', { class: 'kn-map off', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
    root.prepend(this.mapSvg);
    this.layer = root.querySelector('.kn-layer'); this.legend = root.querySelector('.kn-legend'); this.credit = root.querySelector('.kn-credit');
    this.ro = new ResizeObserver(() => { clearTimeout(this.rt); this.rt = setTimeout(() => this.resize(), 120); });
    this.ro.observe(root);
  }
  resize() {
    if (this.map && !this.mapSvg.classList.contains('off')) this.map.drawOverlay();
    if (this.scene && this.redraw) this.redraw();
  }
  stopLoops() { for (const s of this.loops) s(); this.loops = []; }
  loop(fn) { let raf, t0 = performance.now(), on = true; const f = now => { if (!on) return; fn(now - t0); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); this.loops.push(() => { on = false; cancelAnimationFrame(raf); }); }
  unit() { return W / Math.max(200, this.root.getBoundingClientRect().width || 800); }

  async show(scene, doc) {
    this.scene = scene; this.redraw = null; this.stopLoops();
    const v = scene.visual || { kind: 'title' };
    const usesMap = v.kind === 'map' || (v.kind === 'title' && scene.focus);
    this.legend.innerHTML = ''; this.credit.innerHTML = ''; this.opts.onLegend?.('');
    this.layer.classList.add('fade');
    const swap = new Promise(r => setTimeout(r, reduced() ? 0 : 260));
    if (usesMap) {
      try {
        const g = await loadGeo(this.opts.base);
        if (this.scene !== scene) return;
        if (!this.map) this.map = new MapView(this.mapSvg, g);
        this.mapSvg.classList.remove('off');
        this.renderLegend(scene);
        await swap; if (this.scene !== scene) return;
        this.layer.innerHTML = v.kind === 'title' ? this.titleHtml(v, doc) : '';
        this.layer.className = 'kn-layer fade' + (v.kind === 'title' ? ' kn-v-title' : '');
        requestAnimationFrame(() => requestAnimationFrame(() => this.layer.classList.remove('fade')));
        await this.map.show(scene, { animate: true });
        return;
      } catch (e) {
        console.warn('Kino: the map could not load', e);
        this.layer.innerHTML = `<div class="kn-v-title"><p class="sub">The map could not load (${esc(e.message)}). The narration continues.</p></div>`;
        this.layer.className = 'kn-layer'; return;
      }
    }
    this.mapSvg.classList.add('off');
    await swap; if (this.scene !== scene) return;
    this.layer.className = 'kn-layer fade';
    const draw ={ title: () => this.titleHtml(v, doc), portrait: () => this.portraitHtml(v), quote: () => this.quoteHtml(v), module: () => this.moduleHtml(scene), timeline: null, chart: null }[v.kind];
    if (draw) {
      this.layer.innerHTML = draw();
      this.layer.classList.add({ title: 'kn-v-title', portrait: 'kn-v-portrait', quote: 'kn-v-quote', module: 'kn-v-module' }[v.kind]);
      if (v.kind === 'module') this.layer.querySelector('.go')?.addEventListener('click', () => this.opts.onLink?.(scene.link));
    } else if (v.kind === 'timeline') { this.layer.classList.add('kn-v-svg'); this.redraw = () => { this.stopLoops(); this.timeline(v); }; this.redraw(); }
    else if (v.kind === 'chart') { this.layer.classList.add('kn-v-svg'); this.redraw = () => { this.stopLoops(); this.chart(v, doc); }; this.redraw(); }
    requestAnimationFrame(() => requestAnimationFrame(() => this.layer.classList.remove('fade')));
  }

  end(doc, next) {
    this.scene = null; this.redraw = null; this.stopLoops(); this.mapSvg.classList.add('off');
    this.legend.innerHTML = ''; this.credit.innerHTML = '';
    this.layer.className = 'kn-layer kn-v-end';
    this.layer.innerHTML = `<h3>The end</h3><p>${esc(doc.title)}. ${doc.sources.length} sources are listed under the player; every scene's link opens its place in PRP.</p>
      <div class="row"><button type="button" class="prp-btn primary" data-act="again">Watch again</button>${next ? `<a class="prp-btn" href="#doc=${esc(next.id)}">Next: ${esc(next.title)}</a>` : ''}<button type="button" class="prp-btn" data-act="sources">Sources</button></div>`;
    return this.layer;
  }

  renderLegend(scene) {
    const v = scene.visual || {}, rows = [];
    for (const g of v.groups || []) rows.push(`<span><i class="t${g.tone}"></i>${esc(g.label)}</span>`);
    if (scene.focus?.countries?.some(c => !(v.groups || []).some(g => g.countries.includes(c))) && !(v.groups || []).length) rows.push('<span><i class="tf"></i>In focus</span>');
    for (const f of v.fronts || []) if (f.label) rows.push(`<span><i class="line"></i>${esc(f.label)}</span>`);
    if (v.kind === 'map') rows.push('<span class="note">Present-day borders, for orientation</span>');
    this.legend.innerHTML = rows.join('');
    this.opts.onLegend?.(rows.join('')); // on phones the key sits under the stage instead
  }

  titleHtml(v, doc) {
    return `<div class="kicker">${esc(v.kicker || 'Kino')}</div><h3>${esc(v.heading || doc.title)}</h3><div class="rule"></div>${v.sub ? `<div class="sub">${esc(v.sub)}</div>` : ''}`;
  }
  image(v) { const m = this.opts.media || {}; const file = v.file || m.qids?.[v.qid]; return file ? { file, ...(m.files?.[file] || {}) } : null; }
  portraitHtml(v) {
    const img = this.image(v), pos = esc(v.position || '50% 25%');
    if (img?.src) {
      const who = img.artist || img.credit || 'Unknown author';
      this.credit.innerHTML = `Image: ${esc(who.length > 70 ? who.slice(0, 68) + '…' : who)}${img.date ? `, ${esc(img.date)}` : ''} · ${esc(img.licence || 'see licence')} · <a href="${esc(img.page)}" target="_blank" rel="noopener">Wikimedia Commons</a>`;
    }
    return `${img?.src ? `<img class="bg" src="${esc(img.src)}" alt="" aria-hidden="true">` : ''}
      <div class="text"><div class="rule"></div><h3>${esc(v.heading || this.scene.title)}</h3>${v.sub ? `<div class="sub">${esc(v.sub)}</div>` : ''}</div>
      <div class="frame">${img?.src ? `<img src="${esc(img.src)}" alt="${esc(img.title || v.heading || '')}" style="object-position:${pos}">` : ''}</div>`;
  }
  quoteHtml(v) { return `<blockquote>${esc(v.text)}</blockquote><div class="who">${esc(v.who)}, ${esc(v.when)}</div>`; }
  moduleHtml(scene) {
    const l = scene.link, info = this.opts.moduleInfo?.(l) || {}, [name, place] = l.label.split(' · ');
    const inShell = this.opts.embedded;
    return `<div class="card"><div class="icon" aria-hidden="true">${esc(info.icon || '↗')}</div>
      <div><div class="where"><span class="prp-code" data-suite="${esc(info.suite || l.suite)}">${esc(info.code || l.suite.toUpperCase())}</span>${esc(info.suiteName || '')}</div>
      <h3>${esc(info.name || name)}</h3>${place ? `<p class="at">${esc(place)}</p>` : ''}</div>
      ${scene.visual.blurb ? `<p class="blurb">${esc(scene.visual.blurb)}</p>` : ''}
      <button type="button" class="prp-btn primary go">${inShell ? 'Show in PRP' : 'Open in PRP'} ↗</button></div>`;
  }

  /* Timeline (drawn in screen pixels): an axis with year ticks and a sweep that lights each event as it passes.
     Wide frames label every event in rows that do not collide; narrow ones (phones) name the event just reached. */
  timeline(v) {
    const all = v.events.map(e => `${e.label} (${e.at})`).join('; ');
    this.layer.innerHTML = `<svg class="kn-svg" role="img" aria-label="${esc(`Timeline, ${v.from} to ${v.to}: ${all}`)}"></svg>`;
    const svg = this.layer.querySelector('svg'), w = svg.clientWidth || 800, h = svg.clientHeight || 450;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const fy = d => { const [y, m = 1, dd = 1] = String(d).split('-').map(Number); return y + (m - 1) / 12 + (dd - 1) / 365; };
    const date = s => { const [y, m, d] = String(s).split('-'); return [d && +d, m && MONTHS[+m - 1], y].filter(Boolean).join(' '); };
    const compact = w < 640, fs = compact ? 12 : Math.max(13, Math.min(18, w / 68));
    const pad = Math.max(26, w * 0.06), x0 = pad, x1 = w - pad, axisY = Math.round(compact ? h * 0.66 : h * 0.5);
    const a = fy(v.from), b = Math.max(fy(v.to), a + 0.1), X = t => x0 + ((t - a) / (b - a)) * (x1 - x0);
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find(s => (b - a) / s <= (compact ? 5 : 9)) || 1000;
    const ticks = []; for (let y = Math.ceil(a / step) * step; y <= b + 1e-9; y += step) ticks.push(y);
    const evs = v.events.map(e => ({ ...e, t: fy(e.at) })).sort((p, q) => p.t - q.t).map(e => ({ ...e, x: X(e.t) }));
    const tickY = axisY + 12 + fs * 0.8;
    let marks;
    if (!compact) {
      const gap = fs * 2.7, aboveTop = axisY - 24 - fs * 1.15, belowTop = tickY + 20 + fs;
      const rowsAbove = Math.max(1, Math.floor((aboveTop - fs * 1.2) / gap) + 1), rowsBelow = Math.max(1, Math.floor((h - belowTop - fs * 1.5) / gap) + 1);
      const order = []; for (let k = 1; k <= Math.max(rowsAbove, rowsBelow); k++) { if (k <= rowsAbove) order.push(-k); if (k <= rowsBelow) order.push(k); }
      const ends = {};
      evs.forEach((e, i) => {
        const tw = Math.max(e.label.length * fs * 0.56, date(e.at).length * fs * 0.48);
        e.anchor = e.x - tw / 2 < 6 ? 'start' : e.x + tw / 2 > w - 6 ? 'end' : 'middle';
        const left = e.anchor === 'start' ? e.x : e.anchor === 'end' ? e.x - tw : e.x - tw / 2;
        e.row = order.find(r => (ends[r] ?? -1e9) < left - 14) ?? order[i % order.length];
        ends[e.row] = left + tw;
        e.y = e.row < 0 ? aboveTop - (-e.row - 1) * gap : belowTop + (e.row - 1) * gap;
      });
      marks = evs.map((e, i) => `<g class="ev" data-i="${i}"><line class="stem" x1="${e.x}" x2="${e.x}" y1="${axisY}" y2="${e.row < 0 ? e.y + fs * 1.35 : e.y - fs * 1.05}"/>
        <circle class="dot" cx="${e.x}" cy="${axisY}" r="6.5"/>
        <text class="ui ink halo" x="${e.x}" y="${e.y}" text-anchor="${e.anchor}" font-size="${fs.toFixed(1)}" font-weight="600">${esc(e.label)}</text>
        <text class="mono muted halo" x="${e.x}" y="${(e.y + fs * 1.12).toFixed(1)}" text-anchor="${e.anchor}" font-size="${(fs * 0.78).toFixed(1)}">${esc(date(e.at))}</text></g>`).join('');
    } else {
      marks = evs.map((e, i) => `<g class="ev" data-i="${i}"><circle class="dot" cx="${e.x}" cy="${axisY}" r="5.5"/></g>`).join('')
        + `<text class="serif ink now-t" x="${w / 2}" y="${axisY - 48}" text-anchor="middle" font-size="${(fs * 1.55).toFixed(1)}" font-weight="600"></text>
           <text class="mono muted now-d" x="${w / 2}" y="${axisY - 24}" text-anchor="middle" font-size="${(fs * 0.92).toFixed(1)}"></text>`;
    }
    svg.innerHTML = `<line class="axis" x1="${x0}" x2="${x1}" y1="${axisY}" y2="${axisY}"/>
      ${ticks.map(t => `<line class="grid" x1="${X(t)}" x2="${X(t)}" y1="${axisY - 7}" y2="${axisY + 7}"/><text class="mono muted" x="${X(t)}" y="${tickY.toFixed(1)}" text-anchor="middle" font-size="${(fs * 0.8).toFixed(1)}">${t < 0 ? `${-t} BC` : t}</text>`).join('')}
      <rect class="sweep" x="${x0}" y="${axisY - 3}" height="6" width="0" rx="3"/>${marks}<circle class="sweep" cx="${x0}" cy="${axisY}" r="5"/>`;
    const bar = svg.querySelector('rect.sweep'), head = svg.querySelector('circle.sweep'), groups = [...svg.querySelectorAll('.ev')];
    const nowT = svg.querySelector('.now-t'), nowD = svg.querySelector('.now-d');
    let shown = -2;
    const set = p => {
      const x = x0 + p * (x1 - x0);
      bar.setAttribute('width', Math.max(0, x - x0).toFixed(1)); head.setAttribute('cx', x.toFixed(1));
      let last = -1; groups.forEach((g, i) => { const on = evs[i].x <= x + 0.5; g.classList.toggle('on', on); if (on) last = i; });
      if (nowT && last !== shown) { shown = last; nowT.textContent = last >= 0 ? evs[last].label : ''; nowD.textContent = last >= 0 ? date(evs[last].at) : ''; }
    };
    if (reduced()) { set(1); return; }
    const SWEEP = compact ? 9000 : 7000, HOLD = 4200, CYCLE = SWEEP + HOLD;
    this.loop(t => { const c = t % CYCLE; set(c < SWEEP ? c / SWEEP : 1); svg.style.opacity = c > CYCLE - 500 ? ((CYCLE - c) / 500).toFixed(2) : '1'; });
  }

  /* Chart (drawn in screen pixels): bars, or ranges from the lowest to the highest estimate, drawn in; or a line.
     The title, unit, note and sources are HTML above and below, so they wrap on narrow screens. */
  chart(v, doc) {
    const cites = [].concat(v.cite || []).map(id => shortCite(doc.sources.find(s => s.id === id))).filter(Boolean).join('; ');
    const ranged = v.data.some(r => r.low != null);
    this.layer.innerHTML = `<div class="kn-chart"><div class="hd"><h4>${esc(v.title)}</h4><div class="unit">${esc(v.unit)}${ranged ? ' · each bar runs from the lowest to the highest estimate' : ''}</div></div>
      <svg class="kn-svg" role="img" aria-label="${esc(`${v.title} (${v.unit}): ${v.data.map(r => `${r.label} ${r.low != null ? `${r.low} to ${r.high}` : r.value}`).join('; ')}`)}"></svg>
      <div class="ft">${v.note ? `<p>${esc(v.note)}</p>` : ''}${cites ? `<p class="src">Sources: ${esc(cites)}</p>` : ''}</div></div>`;
    const svg = this.layer.querySelector('svg'), w = svg.clientWidth || 800, h = svg.clientHeight || 300;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const rows = v.data, n = rows.length, fs = Math.max(12, Math.min(18, w / 58));
    const fmt = x => (Math.round(x * 10) / 10).toLocaleString('en-GB'), valText = r => (r.low != null ? `${fmt(r.low)}–${fmt(r.high)}` : fmt(r.value));
    const top = Math.max(...rows.map(r => r.high ?? r.value)), step = [1, 2, 2.5, 5, 10].map(m => m * 10 ** Math.floor(Math.log10(top || 1))).find(s => top / s <= 6) || top / 4;
    const max = Math.ceil((top * 1.02) / step) * step, ticks = []; for (let t = 0; t <= max + 1e-9; t += step) ticks.push(t);
    const axisH = fs * 1.7;
    let body;
    if (v.type === 'line') {
      const px0 = 8 + fs * 2.2, px1 = w - fs, py0 = h - axisH - fs * 1.4, py1 = fs * 1.6, PX = i => px0 + (i / Math.max(1, n - 1)) * (px1 - px0), PY = val => py0 - (val / max) * (py0 - py1);
      const d = rows.map((r, i) => `${i ? 'L' : 'M'}${PX(i).toFixed(1)},${PY(r.value ?? r.high).toFixed(1)}`).join(' ');
      body = ticks.map(t => `<line class="grid" x1="${px0}" x2="${px1}" y1="${PY(t)}" y2="${PY(t)}"/><text class="mono muted" x="${px0 - 6}" y="${PY(t) + fs * 0.3}" text-anchor="end" font-size="${(fs * 0.75).toFixed(1)}">${fmt(t)}</text>`).join('')
        + `<path class="line-path" d="${d}" pathLength="1"/>`
        + rows.map((r, i) => `<circle class="dot-v" cx="${PX(i)}" cy="${PY(r.value ?? r.high)}" r="4.5"/><text class="ui ink2" x="${PX(i)}" y="${h - fs * 0.4}" text-anchor="middle" font-size="${(fs * 0.78).toFixed(1)}">${esc(r.label)}</text><text class="mono ink val" x="${PX(i)}" y="${PY(r.value ?? r.high) - 10}" text-anchor="middle" font-size="${(fs * 0.8).toFixed(1)}">${valText(r)}</text>`).join('');
    } else {
      const valW = Math.max(...rows.map(r => valText(r).length)) * fs * 0.62 + 12, labW = Math.max(...rows.map(r => r.label.length)) * fs * 0.54;
      const stacked = labW > w * 0.36, bx0 = stacked ? 2 : labW + 14, bx1 = w - valW, X = val => bx0 + (val / max) * (bx1 - bx0);
      const rowH = (h - axisH) / n, bh = Math.max(10, Math.min(stacked ? rowH * 0.36 : rowH * 0.5, 44));
      body = ticks.map(t => `<line class="grid" x1="${X(t)}" x2="${X(t)}" y1="0" y2="${h - axisH}"/><text class="mono muted" x="${X(t)}" y="${h - axisH + fs * 1.15}" text-anchor="middle" font-size="${(fs * 0.75).toFixed(1)}">${fmt(t)}</text>`).join('')
        + rows.map((r, i) => {
          const y0 = i * rowH, yb = stacked ? y0 + fs * 1.45 : y0 + (rowH - bh) / 2, lo = r.low ?? r.value, hi = r.high ?? r.value;
          const lab = stacked ? `<text class="ui ink" x="${bx0}" y="${y0 + fs * 1.05}" font-size="${fs.toFixed(1)}" font-weight="500">${esc(r.label)}</text>`
            : `<text class="ui ink" x="${labW + 4}" y="${yb + bh / 2 + fs * 0.35}" text-anchor="end" font-size="${fs.toFixed(1)}" font-weight="500">${esc(r.label)}</text>`;
          return `<g class="row">${lab}<rect class="bar" x="${bx0}" y="${yb}" height="${bh}" width="0" rx="2" data-w="${(X(lo) - bx0).toFixed(1)}"/>
            ${hi > lo ? `<rect class="range" x="${X(lo)}" y="${yb}" height="${bh}" width="0" rx="2" data-w="${(X(hi) - X(lo)).toFixed(1)}" data-after="1"/>` : ''}
            <text class="mono ink val" x="${X(hi) + 8}" y="${yb + bh / 2 + fs * 0.35}" font-size="${(fs * 0.95).toFixed(1)}" font-weight="500">${valText(r)}</text></g>`;
        }).join('');
    }
    // On a phone-sized stage the unit line above is hidden (kino.css), so the axis carries the unit.
    if (v.type !== 'line' && this.root.getBoundingClientRect().width <= 560) body += `<text class="mono muted" x="${w}" y="${h - 2}" text-anchor="end" font-size="${(fs * 0.75).toFixed(1)}">${esc(v.unit)}</text>`;
    svg.innerHTML = body;
    const rects = [...svg.querySelectorAll('rect[data-w]')], vals = [...svg.querySelectorAll('.val')], line = svg.querySelector('.line-path');
    const set = p => {
      rects.forEach((r, i) => { const k = Math.max(0, Math.min(1, p * 1.5 - (r.dataset.after ? 0.45 : 0) - i * 0.06)); r.setAttribute('width', (+r.dataset.w * (1 - (1 - k) ** 3)).toFixed(1)); });
      if (line) line.style.strokeDashoffset = String(1 - Math.min(1, p * 1.2));
      vals.forEach(t => { t.style.opacity = p > 0.7 ? '1' : '0'; });
    };
    if (reduced()) { set(1); return; }
    const DRAW = 2000, CYCLE = 15000;
    this.loop(t => set(Math.min(1, (t % CYCLE) / DRAW)));
  }
}

/* ---------- catalogue previews ---------- */
/** A small looping preview for a catalogue card: a zoomed map with arrows, or the portrait drifting slowly. */
export async function preview(thumb, p, media, base) {
  if (p?.kind === 'portrait') {
    const f = media?.files?.[p.file];
    if (f?.src) { thumb.insertAdjacentHTML('afterbegin', `<img src="${esc(f.src)}" alt="" loading="lazy" style="object-position:${esc(p.position || '50% 25%')}">`); return; }
  }
  if (p?.kind !== 'map') return;
  const g = await loadGeo(base);
  const svg = el('svg', { class: 'kn-map', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' });
  const scene = { focus: { countries: p.countries, bbox: p.bbox }, visual: { kind: 'map', groups: [], arrows: p.arrows } };
  const tones = new Map(); for (const c of p.countries) for (const k of g.expand(c)) tones.set(k, String(p.tones?.[c] || 'f'));
  const view = viewFor(scene, g), t = toTransform(view);
  el('rect', { class: 'water', width: W, height: H }, svg);
  const world = el('g', { transform: `translate(${t.x},${t.y}) scale(${t.k})` }, svg);
  for (const f of g.features) { const tone = f.iso && tones.get(f.iso); el('path', { class: `c${tone ? ' t' + tone : ''}`, d: g.path(f) }, world); }
  const P = ll => { const q = g.projection(ll); return [t.x + t.k * q[0], t.y + t.k * q[1]]; };
  for (const a of p.arrows || []) {
    const pts = [a.from, a.via, a.to].filter(Boolean).map(P);
    el('path', { class: `arrow t${a.tone || 1}`, d: g.d3.line().curve(g.d3.curveCatmullRom.alpha(0.5))(pts), pathLength: 1, 'stroke-width': 9 }, svg);
  }
  thumb.prepend(svg);
}

export { flatScenes };
