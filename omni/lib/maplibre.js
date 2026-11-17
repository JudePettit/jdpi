/* The Omni-Map's MapLibre GL JS adapter (PRP-SCHOLAR-USP-DESIGN.md S1): the one place the page touches the library,
   so the rest of the page (omni/app.js) and the core (design/prp-map.js) never do, and S5's one map engine can put
   another renderer behind the same few calls.

   MapLibre GL JS 5.24.0 is loaded by omni/index.html from cdn.jsdelivr.net at that exact version with its Subresource
   Integrity hash; this file never loads code. Its style is written here, inline: no tile server, no glyphs, no sprite,
   so the map reaches nothing outside VM but that one file. Its sources are VM's own GeoJSON:
     base      the plain base, Natural Earth's land (omni/data/base/ne_110m_land.geojson): land on water, no states
     borders   the frame's rows (design/prp-map.js sliceAt): POLITY rows filled, RELATION rows (unions, alliances,
               overlordships) as outlines only, as Cliopatria draws them (design 7.3), and so are composite polities,
               whose names Cliopatria writes in parentheses (an entity with its dependencies), so a core is not filled
               twice; the rows in focus stronger
     points    the places in focus VM cannot outline, at their Master Index points
     battles   the battles drawn at the frame, as points
   Labels are HTML markers (design S1: "HTML-marker labels"): the text set with textContent, dir="auto", so a name in
   any script or direction shows exactly as the source writes it, and nothing a source writes can become markup. They
   are hidden from screen readers, like the canvas: the page's lists say the same in order.

   Colours are the design system's tokens (design/prp.css: --prp-map-*, the module accent), read from the page and
   set again on a theme change (setColors).

   const map = makeMap(el, { colors, base, onReady, onMove, onError });   throws only if the library is missing
   map.setBorders(features, { focus: [ids] })   map.setBattles(features)   map.setPoints(features)   map.fit(box, { padding, animate })
   map.labels([{ id, text, at: [lon, lat] }])   map.zoomBy(±1)   map.setColors(colors)   map.bounds() → [w, s, e, n]
   webglOk() → whether this browser gives a canvas WebGL at all (checked before the library is asked). */

/** True when this browser gives a canvas a WebGL context (WebGL 2, else 1). */
export function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const EMPTY = { type: 'FeatureCollection', features: [] };

function style(colors, base) {
  return {
    version: 8,
    sources: {
      base: { type: 'geojson', data: base || EMPTY },
      borders: { type: 'geojson', data: EMPTY },
      battles: { type: 'geojson', data: EMPTY },
      points: { type: 'geojson', data: EMPTY },
    },
    layers: [
      { id: 'water', type: 'background', paint: { 'background-color': colors.water } },
      { id: 'land', type: 'fill', source: 'base', paint: { 'fill-color': colors.land, 'fill-antialias': true } },
      { id: 'borders-fill', type: 'fill', source: 'borders', filter: ['all', ['==', ['get', 'k'], 'POLITY'], ['!', ['get', 'comp']]],
        paint: { 'fill-color': colors.accent, 'fill-opacity': ['case', ['boolean', ['get', 'focus'], false], 0.34, 0.1] } },
      { id: 'borders-line', type: 'line', source: 'borders', filter: ['all', ['==', ['get', 'k'], 'POLITY'], ['!', ['get', 'comp']]],
        paint: { 'line-color': colors.border, 'line-width': ['case', ['boolean', ['get', 'focus'], false], 1.6, 0.7] } },
      { id: 'relations', type: 'line', source: 'borders', filter: ['any', ['==', ['get', 'k'], 'RELATION'], ['get', 'comp']],
        paint: { 'line-color': colors.accent, 'line-width': 1.1, 'line-dasharray': [2, 2], 'line-opacity': 0.8 } },
      { id: 'points', type: 'circle', source: 'points',
        paint: { 'circle-radius': 5, 'circle-color': colors.accent, 'circle-stroke-color': colors.halo, 'circle-stroke-width': 2 } },
      { id: 'battles', type: 'circle', source: 'battles',
        paint: { 'circle-radius': 6, 'circle-color': colors.battle, 'circle-stroke-color': colors.halo, 'circle-stroke-width': 2 } },
    ],
  };
}

/** The map in `el`. colors: { water, land, border, accent, battle, halo, label }. */
export function makeMap(el, { colors, base = null, onReady = () => {}, onMove = () => {}, onError = () => {} } = {}) {
  const ml = window.maplibregl;
  if (!ml || typeof ml.Map !== 'function') throw new Error('MapLibre GL JS is not loaded');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const map = new ml.Map({
    container: el, style: style(colors, base), center: [10, 40], zoom: 1.6, minZoom: 0.4, maxZoom: 9,
    attributionControl: false, // VM writes its own credits, in the legend and under the page
    keyboard: false,           // the page's own buttons and lists are the keyboard's way in
    dragRotate: false, pitchWithRotate: false, touchPitch: false, renderWorldCopies: true, fadeDuration: 0,
  });
  map.touchZoomRotate?.disableRotation?.();
  const canvas = map.getCanvas();
  canvas.tabIndex = -1; canvas.setAttribute('aria-hidden', 'true'); canvas.removeAttribute('aria-label');
  let ready = false, pending = [], markers = [];
  const whenReady = f => (ready ? f() : pending.push(f));
  map.on('load', () => { ready = true; for (const f of pending.splice(0)) f(); onReady(); });
  map.on('moveend', () => onMove());
  map.on('error', e => onError(e?.error || e));
  const src = id => map.getSource(id);
  const api = {
    map,
    setBorders(features, { focus = [] } = {}) {
      const on = new Set(focus);
      const data = { type: 'FeatureCollection', features: features.filter(f => f.geometry).map(f => ({ type: 'Feature', id: undefined,
        properties: { id: f.id, k: f.properties.k, focus: on.has(f.id), comp: f.properties.k === 'POLITY' && /^\(.+\)$/.test(f.properties.n || '') }, geometry: f.geometry })) };
      whenReady(() => src('borders')?.setData(data));
    },
    // The places in focus VM cannot outline, at their recorded points.
    setPoints(features) {
      const data = { type: 'FeatureCollection', features: features.map(f => ({ type: 'Feature', properties: { id: f.id }, geometry: f.geometry })) };
      whenReady(() => src('points')?.setData(data));
    },
    setBattles(features) {
      const data = { type: 'FeatureCollection', features: features.map(f => ({ type: 'Feature', properties: { id: f.id }, geometry: f.geometry })) };
      whenReady(() => src('battles')?.setData(data));
    },
    fit(box, { padding = 40, animate = true } = {}) {
      if (!box) { map.jumpTo({ center: [10, 30], zoom: 0.8 }); return; }
      let [w, s, e, n] = box;
      if (e - w >= 359) { w = -180; e = 180; }
      const pad = Math.min(padding, Math.floor(Math.min(el.clientWidth, el.clientHeight) / 4) || 0);
      map.fitBounds([[w, Math.max(-85, s)], [e, Math.min(85, n)]], { padding: pad, duration: animate && !reduced() ? 500 : 0, maxZoom: 7 });
    },
    // Labels in the order given (the strongest first); one that would overlap a label already placed is left out, so
    // names never print over each other (the lists hold every name).
    labels(items) {
      for (const m of markers) m.remove();
      const placed = [], W = el.clientWidth, H = el.clientHeight;
      // Each label's own size, measured as it will be drawn (not guessed from its letters), and a label is placed only
      // when the whole of it is inside the map, so none is cut at an edge (the lists hold every name).
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0';
      el.appendChild(probe);
      const size = (text, strong) => { probe.className = `om-label${strong ? ' strong' : ''}`; probe.textContent = text; return [probe.offsetWidth + 2, probe.offsetHeight + 2]; };
      const fits = ({ text, at, strong }) => {
        const p = map.project(at), [w, h] = size(text, strong);
        const box = [p.x - w / 2, p.y - h / 2, p.x + w / 2, p.y + h / 2];
        if (box[0] < 0 || box[2] > W || box[1] < 0 || box[3] > H) return false;
        if (placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return false;
        placed.push(box);
        return true;
      };
      const shown = items.filter(fits);
      probe.remove();
      markers = shown.map(({ text, at, strong }) => {
        const d = document.createElement('span');
        d.className = `om-label${strong ? ' strong' : ''}`;
        d.dir = 'auto';
        d.textContent = text;
        d.setAttribute('aria-hidden', 'true');
        return new ml.Marker({ element: d, anchor: 'center' }).setLngLat(at).addTo(map);
      });
    },
    zoomBy(d) { map.easeTo({ zoom: map.getZoom() + d, duration: reduced() ? 0 : 250 }); },
    bounds() { const b = map.getBounds(); return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]; },
    setColors(c) {
      whenReady(() => {
        map.setPaintProperty('water', 'background-color', c.water);
        map.setPaintProperty('land', 'fill-color', c.land);
        map.setPaintProperty('borders-fill', 'fill-color', c.accent);
        map.setPaintProperty('borders-line', 'line-color', c.border);
        map.setPaintProperty('relations', 'line-color', c.accent);
        map.setPaintProperty('points', 'circle-color', c.accent);
        map.setPaintProperty('points', 'circle-stroke-color', c.halo);
        map.setPaintProperty('battles', 'circle-color', c.battle);
        map.setPaintProperty('battles', 'circle-stroke-color', c.halo);
      });
    },
    resize() { map.resize(); },
  };
  return api;
}
