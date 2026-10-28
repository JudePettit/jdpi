// SIGINT Dashboard: Leaflet maps with the PRP basemap (Esri Canvas light or dark, swapped on 'prp:themechange').
// Leaflet loads on first use, from unpkg with the same pinned version and SRI hashes as the other PRP maps.
import { esc } from './util.js';

const LEAFLET = {
  js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', jsSri: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
  css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', cssSri: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=',
};
let loading = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET.css}"]`)) {
      const l = document.createElement('link');
      Object.assign(l, { rel: 'stylesheet', href: LEAFLET.css, integrity: LEAFLET.cssSri, crossOrigin: '' });
      document.head.prepend(l);
    }
    const s = document.createElement('script');
    Object.assign(s, { src: LEAFLET.js, integrity: LEAFLET.jsSri, crossOrigin: '', async: true });
    s.onload = () => resolve(window.L);
    s.onerror = () => { loading = null; reject(new Error('The map library could not be loaded.')); };
    document.head.appendChild(s);
  });
  return loading;
}
export const theme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const tileUrl = () => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${theme() === 'dark' ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base'}/MapServer/tile/{z}/{y}/{x}`;
const tok = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** A map centred on the user's location with range rings. Returns helpers; call destroy() if the view is torn down. */
export async function makeMap(host, { lat, lon, zoom = 8, radiusKm = 0, label = 'Map' } = {}) {
  const L = await loadLeaflet();
  const map = L.map(host, { zoomControl: true, scrollWheelZoom: false, worldCopyJump: true, attributionControl: true, keyboard: true });
  // Set the final view before any tiles load, so none are requested and then thrown away.
  if (radiusKm > 0) map.fitBounds(L.latLng(lat, lon).toBounds(radiusKm * 2000), { animate: false }); else map.setView([lat, lon], zoom);
  host.setAttribute('aria-label', label);
  const tiles = L.tileLayer(tileUrl(), { attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors', maxZoom: 16 }).addTo(map);
  map.on('focus', () => map.scrollWheelZoom.enable());
  map.on('blur', () => map.scrollWheelZoom.disable());
  const home = L.marker([lat, lon], { icon: L.divIcon({ className: 'sg-home', html: '<span aria-hidden="true"></span>', iconSize: [16, 16], iconAnchor: [8, 8] }), keyboard: false, interactive: true, title: 'Your location', zIndexOffset: 1000 }).addTo(map);
  home.bindTooltip('Your location', { direction: 'top', offset: [0, -8] });
  const rings = L.layerGroup().addTo(map);
  let ringSpec = null;
  const drawRings = () => {
    rings.clearLayers();
    if (!ringSpec) return;
    const { lat: a, lon: b, radiiKm, unit } = ringSpec;
    for (const r of radiiKm) {
      L.circle([a, b], { radius: r * 1000, color: tok('--prp-line-strong'), weight: 1, fill: false, interactive: false, dashArray: null }).addTo(rings);
      const top = L.latLng(a + (r / 111.2), b);
      L.marker(top, { icon: L.divIcon({ className: 'sg-ring-label', html: `<span>${esc(unit(r))}</span>`, iconSize: [60, 16], iconAnchor: [30, 8] }), interactive: false, keyboard: false }).addTo(rings);
    }
  };
  const onTheme = () => { tiles.setUrl(tileUrl()); drawRings(); };
  window.addEventListener('prp:themechange', onTheme);
  const ro = new ResizeObserver(() => map.invalidateSize());
  ro.observe(host);
  return {
    L, map, layer: () => L.layerGroup().addTo(map),
    setHome(a, b) { home.setLatLng([a, b]); },
    setRings(a, b, radiiKm, unit = r => `${r} km`) { ringSpec = { lat: a, lon: b, radiiKm, unit }; drawRings(); },
    fitRadius(a, b, km) { map.fitBounds(L.latLng(a, b).toBounds(km * 2000), { animate: false }); },
    destroy() { window.removeEventListener('prp:themechange', onTheme); ro.disconnect(); map.remove(); },
  };
}
