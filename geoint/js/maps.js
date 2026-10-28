// GEOINT & IMINT Dashboard: Leaflet helpers shared by the map tabs (global L from the pinned Leaflet 1.9.4 script).
// Base maps follow the PRP theme (Esri Canvas light/dark, swapped on 'prp:themechange'); vector marks get CSS classes
// written against the PRP tokens, so they change with the theme without redrawing.
import { BASEMAPS, CANVAS_CREDIT, ESRI_IMAGERY, ESRI_IMAGERY_CREDIT, ESRI_LABELS, EOX_S2, EOX_S2_CREDIT } from './sources.js';
import { clamp } from './util.js';

export const tok = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const theme = () => document.documentElement.dataset.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/** A Leaflet map in `el` that starts at, and reports back to, the shared view while its tab is active. */
export function createMap(el, ctx, tab, { minZoom = 2, maxZoom = 19 } = {}) {
  const map = L.map(el, { minZoom, maxZoom, worldCopyJump: true, zoomControl: true, attributionControl: true, fadeAnimation: !ctx.reduceMotion(), zoomAnimation: !ctx.reduceMotion() });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  L.control.scale({ position: 'bottomleft', maxWidth: 130 }).addTo(map);
  map.createPane('imagery').style.zIndex = 250;
  const lp = map.createPane('labels'); lp.style.zIndex = 390; lp.style.pointerEvents = 'none';
  const v = ctx.view;
  map.setView([v.lat, v.lon], clamp(Math.round(v.z), minZoom, maxZoom), { animate: false });
  map.on('moveend', () => { if (ctx.tab === tab) { const c = map.getCenter(); ctx.setView(c.lat, c.lng, map.getZoom()); } });
  return map;
}

/** Move a map to the shared view when its tab is shown again (and fix its size after being hidden). */
export function syncToView(map, ctx) {
  map.invalidateSize(false);
  const v = ctx.view, c = map.getCenter(), z = clamp(Math.round(v.z), map.getMinZoom(), map.getMaxZoom());
  if (Math.abs(c.lat - v.lat) > 1e-4 || Math.abs(c.lng - v.lon) > 1e-4 || map.getZoom() !== z) map.setView([v.lat, v.lon], z, { animate: false });
}

/** Base layer switcher: 'map' (Esri Canvas, follows the theme), 'imagery' (Esri World Imagery), 's2' (EOxCloudless Sentinel-2), 'none'. */
export function baseLayers(map, { kind = 'map', labels = true } = {}) {
  let current = null, layers = [], built = null;
  const opts = (extra) => ({ maxZoom: map.getMaxZoom(), ...extra });
  function build() {
    layers.forEach(l => map.removeLayer(l));
    layers = [];
    const t = theme();
    built = t;
    if (current === 'map') {
      layers.push(L.tileLayer(BASEMAPS[t][0], opts({ attribution: CANVAS_CREDIT, maxNativeZoom: 16 })));
      if (labels) layers.push(L.tileLayer(BASEMAPS[t][1], opts({ pane: 'labels', maxNativeZoom: 16 })));
    } else if (current === 'imagery') {
      layers.push(L.tileLayer(ESRI_IMAGERY, opts({ attribution: ESRI_IMAGERY_CREDIT, maxNativeZoom: 18 })));
      if (labels) layers.push(L.tileLayer(ESRI_LABELS, opts({ pane: 'labels', maxNativeZoom: 18 })));
    } else if (current === 's2') {
      layers.push(L.tileLayer(EOX_S2, opts({ attribution: EOX_S2_CREDIT, maxNativeZoom: 15 })));
      if (labels) layers.push(L.tileLayer(ESRI_LABELS, opts({ pane: 'labels', maxNativeZoom: 18 })));
    }
    layers.forEach(l => l.addTo(map));
  }
  window.addEventListener('prp:themechange', () => {
    if (current !== 'map' || theme() === built) return;
    built = theme();
    BASEMAPS[built].forEach((url, i) => layers[i]?.setUrl(url));
  });
  const api = {
    set(k) { if (k !== current) { current = k; build(); } },
    get kind() { return current; },
    labels(on) { if (on !== labels) { labels = on; build(); } },
  };
  api.set(kind);
  return api;
}

/** A line (or a polygon's outline) with a halo underneath, for marks drawn over imagery. Returns one layer group. */
export function cased(latlngs, className, { polygon = false, interactive = false } = {}) {
  const ring = polygon && latlngs.length ? [...latlngs, latlngs[0]] : latlngs;
  const top = polygon ? L.polygon(latlngs, { className, interactive }) : L.polyline(latlngs, { className, interactive });
  return L.layerGroup([L.polyline(ring, { className: 'mk-casing', interactive: false }), top]);
}

/** Small HTML-safe popup/tooltip helpers. */
export const popupOpts = { maxWidth: 320, autoPanPadding: [24, 24], className: 'gi-popup' };
export function fitTo(map, latlngs, ctx, maxZoom = 12) {
  if (!latlngs.length) return;
  const b = L.latLngBounds(latlngs);
  map.fitBounds(b.pad(0.15), { maxZoom, animate: !ctx.reduceMotion() });
}
export function flyTo(map, lat, lon, z, ctx) {
  if (ctx.reduceMotion()) map.setView([lat, lon], z, { animate: false });
  else map.flyTo([lat, lon], z, { duration: 0.8 });
}
