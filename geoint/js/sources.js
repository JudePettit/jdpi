// GEOINT & IMINT Dashboard: data sources, presets, query builders, link-outs and feed parsers.
// Pure (no DOM, no network) so the Node tests can check them. Endpoints and layer names were checked in October 2026.

import { parseCSV, isISODate, addDays } from './util.js';

/* ---------------------------------------------------------------- NASA GIBS (keyless, CORS-enabled) */
export const GIBS_WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
export const GIBS_WMS = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi';
export const GIBS_CREDIT = 'Imagery: NASA EOSDIS GIBS / Worldview';

// Daily global imagery. tms = WMTS tile matrix set (its level is the deepest native zoom); start = first day served.
export const IMAGERY = [
  { id: 'n20', group: 'Daytime, true colour', name: 'VIIRS NOAA-20, true colour', layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', tms: 'GoogleMapsCompatible_Level9', ext: 'jpg', start: '2018-01-05', res: '375–750 m', pass: 'early afternoon, about 13:30 local time' },
  { id: 'n21', group: 'Daytime, true colour', name: 'VIIRS NOAA-21, true colour', layer: 'VIIRS_NOAA21_CorrectedReflectance_TrueColor', tms: 'GoogleMapsCompatible_Level9', ext: 'jpg', start: '2023-02-10', res: '375–750 m', pass: 'early afternoon, about 13:30 local time' },
  { id: 'snpp', group: 'Daytime, true colour', name: 'VIIRS Suomi NPP, true colour', layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', tms: 'GoogleMapsCompatible_Level9', ext: 'jpg', start: '2015-11-24', res: '375–750 m', pass: 'early afternoon, about 13:30 local time' },
  { id: 'terra', group: 'Daytime, true colour', name: 'MODIS Terra, true colour', layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', tms: 'GoogleMapsCompatible_Level9', ext: 'jpg', start: '2000-02-24', res: '250 m', pass: 'mid-morning, about 10:30 local time (Terra is drifting later as it nears retirement)' },
  { id: 'aqua', group: 'Daytime, true colour', name: 'MODIS Aqua, true colour', layer: 'MODIS_Aqua_CorrectedReflectance_TrueColor', tms: 'GoogleMapsCompatible_Level9', ext: 'jpg', start: '2002-07-03', res: '250 m', pass: 'early afternoon (Aqua is drifting later as it nears retirement)' },
  { id: 'terra721', group: 'Daytime, false colour', name: 'MODIS Terra, bands 7-2-1 (burn scars, flood water)', layer: 'MODIS_Terra_CorrectedReflectance_Bands721', tms: 'GoogleMapsCompatible_Level9', ext: 'jpg', start: '2000-02-24', res: '250–500 m', pass: 'mid-morning, about 10:30 local time' },
  { id: 'aqua721', group: 'Daytime, false colour', name: 'MODIS Aqua, bands 7-2-1 (burn scars, flood water)', layer: 'MODIS_Aqua_CorrectedReflectance_Bands721', tms: 'GoogleMapsCompatible_Level9', ext: 'jpg', start: '2002-07-03', res: '250–500 m', pass: 'early afternoon' },
  { id: 'bm', group: 'Night lights', name: 'Black Marble daily, Suomi NPP (moonlight-corrected, cloud gaps filled)', layer: 'VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance', tms: 'GoogleMapsCompatible_Level8', ext: 'png', start: '2012-01-19', res: '500 m', pass: 'about 01:30 local time', night: true },
  { id: 'bm20', group: 'Night lights', name: 'Black Marble daily, NOAA-20 (moonlight-corrected, cloud gaps filled)', layer: 'VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance', tms: 'GoogleMapsCompatible_Level8', ext: 'png', start: '2018-01-05', res: '500 m', pass: 'about 01:30 local time', night: true },
  { id: 'dnb', group: 'Night lights', name: 'Day/Night Band, NOAA-20 (as observed: moonlit cloud included)', layer: 'VIIRS_NOAA20_DayNightBand', tms: 'GoogleMapsCompatible_Level7', ext: 'png', start: '2018-01-05', res: '750 m', pass: 'about 01:30 local time', night: true },
  { id: 'bm2016', group: 'Night lights', name: 'Black Marble 2016 annual composite (reference)', layer: 'VIIRS_Black_Marble', tms: 'GoogleMapsCompatible_Level8', ext: 'png', start: '2016-01-01', fixed: '2016-01-01', res: '500 m', pass: 'composite of cloud-free nights in 2016', night: true },
];
export const imageryById = id => IMAGERY.find(l => l.id === id) || IMAGERY[0];
export const maxNativeZoom = def => +String(def.tms).match(/Level(\d+)/)[1];
export function gibsTileUrl(def, day) {
  return `${GIBS_WMTS}/${def.layer}/default/${def.fixed || day}/${def.tms}/{z}/{y}/{x}.${def.ext}`;
}

// Thermal anomalies (fires): served by GIBS as vector tiles, so we ask its WMS to draw them as transparent PNGs.
export const FIRE_LAYERS = [
  { id: 'n20', name: 'VIIRS NOAA-20 (375 m)', layer: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All', start: '2020-01-01' },
  { id: 'n21', name: 'VIIRS NOAA-21 (375 m)', layer: 'VIIRS_NOAA21_Thermal_Anomalies_375m_All', start: '2024-01-17' },
  { id: 'snpp', name: 'VIIRS Suomi NPP (375 m)', layer: 'VIIRS_SNPP_Thermal_Anomalies_375m_All', start: '2012-01-20' },
  { id: 'modis', name: 'MODIS Terra and Aqua (1 km)', layer: 'MODIS_Combined_Thermal_Anomalies_All', start: '2002-07-04' },
];
export const fireLayerNames = ids => FIRE_LAYERS.filter(f => ids.includes(f.id)).map(f => f.layer).join(',');

/** WMTS DescribeDomains: the days a layer has data between two dates (a few hundred bytes of XML). */
export function gibsDomainsUrl(def, from, to) {
  const tms = def.tms || 'GoogleMapsCompatible_Level8';
  return `${GIBS_WMTS}/wmts.cgi?SERVICE=WMTS&REQUEST=DescribeDomains&VERSION=1.0.0&LAYER=${encodeURIComponent(def.layer)}&TILEMATRIXSET=${tms}&TIME=${from}/${to}`;
}
/** "<Domain>2026-07-01/2026-07-10/P1D,2026-07-16/2026-07-31/P1D</Domain>" → [{ from, to }]. Single days "2026-07-12" too. */
export function parseGibsDomains(xml) {
  const m = String(xml ?? '').match(/<Domain>([^<]*)<\/Domain>/);
  if (!m || !m[1].trim()) return [];
  return m[1].split(',').map(s => s.trim()).filter(Boolean).map(part => {
    const [a, b] = part.split('/');
    const from = a.slice(0, 10), to = (b && /^\d{4}/.test(b) ? b : a).slice(0, 10);
    return isISODate(from) && isISODate(to) ? { from, to } : null;
  }).filter(Boolean);
}
export const domainsInclude = (ranges, day) => ranges.some(r => day >= r.from && day <= r.to);
export const latestDay = ranges => (ranges.length ? ranges.reduce((m, r) => (r.to > m ? r.to : m), ranges[0].to) : null);
/** The available day nearest to `day` (ties go to the earlier day), or null. */
export function nearestDay(ranges, day) {
  let best = null, bestGap = Infinity;
  const gap = (a, b) => Math.abs(Date.parse(a) - Date.parse(b));
  for (const r of ranges) {
    const cand = day < r.from ? r.from : day > r.to ? r.to : day;
    const g = gap(cand, day);
    if (g < bestGap || (g === bestGap && cand < best)) { best = cand; bestGap = g; }
  }
  return best;
}

/* ---------------------------------------------------------------- base maps */
export const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
export const BASEMAPS = {
  light: [`${ESRI}Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, `${ESRI}Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`],
  dark: [`${ESRI}Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, `${ESRI}Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`],
};
export const CANVAS_CREDIT = 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors';
export const ESRI_IMAGERY = `${ESRI}World_Imagery/MapServer/tile/{z}/{y}/{x}`;
export const ESRI_IMAGERY_CREDIT = 'Imagery © Esri — Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community';
export const ESRI_LABELS = `${ESRI}Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`;
export const EOX_S2 = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg';
export const EOX_S2_CREDIT = 'EOxCloudless 2025 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2025), CC BY-NC-SA 4.0';
export const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const TERRAIN_CREDIT = 'Elevation: Terrain Tiles (Mapzen/Tilezen on AWS Open Data; SRTM, GMTED, ETOPO1, 3DEP, EU-DEM and others)';
export const terrariumUrl = ({ z, x, y }) => TERRARIUM.replace('{z}', z).replace('{x}', x).replace('{y}', y);

/* ---------------------------------------------------------------- preconfigured imagery views */
export const IMAGERY_PRESETS = [
  { id: 'aral', name: 'Aral Sea, 2000 and 2025', ll: [45.2, 59.6], z: 7, layer: 'terra', before: '2000-08-26', after: '2025-08-26',
    note: 'A quarter-century of shrinkage seen at 250 m. Same season, same sensor, so colour differences are real change, not processing.' },
  { id: 'kakhovka', name: 'Kakhovka reservoir after the dam breach, June 2023', ll: [47.15, 34.1], z: 8, layer: 'terra', before: '2023-05-28', after: '2023-06-18',
    note: 'The Nova Kakhovka dam was breached on 6 June 2023. The reservoir drains within days; compare the pale exposed bed after with the water before.' },
  { id: 'houston', name: 'Houston blackout, February 2021 (night lights)', ll: [29.8, -95.4], z: 8, layer: 'bm', before: '2021-02-07', after: '2021-02-16',
    note: 'Winter Storm Uri cut power to millions in Texas. Black Marble removes moonlight and fills cloudy gaps from earlier nights, so check the raw Day/Night Band for the same night too.' },
  { id: 'la-fires', name: 'Los Angeles fires, January 2025', ll: [34.12, -118.35], z: 9, layer: 'aqua', before: '2025-01-05', after: '2025-01-08', fires: true,
    note: 'Smoke plumes from the Palisades and Eaton fires on 8 January, with VIIRS fire detections on top. Switch to bands 7-2-1 a week later to see the burn scars.' },
  { id: 'indus', name: 'Indus floods, Pakistan, summer 2022', ll: [27.0, 68.1], z: 7, layer: 'terra721', before: '2022-07-08', after: '2022-08-31',
    note: 'In 7-2-1 false colour, water is dark blue to black and vegetation green, so floodwater stands out from cloud (cyan) and bare soil (brown).' },
];

/* ---------------------------------------------------------------- link-outs (open the same place elsewhere) */
const f5 = v => Number(v).toFixed(5);
/** Copernicus Browser deep link (parameters from its deep-linking.txt). With `from`, a time range ending on `day`, newest image on top. */
export function copernicusUrl({ lat, lon, z = 12, day, from, dataset = 'S2_L2A_CDAS', layer = '1_TRUE_COLOR' }) {
  const p = [`zoom=${Math.round(Math.min(16, Math.max(5, z)))}`, `lat=${f5(lat)}`, `lng=${f5(lon)}`, 'themeId=DEFAULT-THEME', `datasetId=${dataset}`, `layerId=${layer}`];
  if (from && day && isISODate(from) && isISODate(day)) p.push('dateMode=TIME%20RANGE', `fromTime=${from}T00:00:00.000Z`, `toTime=${day}T23:59:59.999Z`, 'mosaickingOrder=mostRecent');
  else if (day && isISODate(day)) p.push(`fromTime=${day}T00:00:00.000Z`, `toTime=${day}T23:59:59.999Z`);
  else p.push('date=latest');
  return `https://browser.dataspace.copernicus.eu/?${p.join('&')}`;
}
// days = how far back the link's time window reaches (about one revisit), so there is an image to show.
export const COPERNICUS_DATASETS = [
  { id: 's2', name: 'Sentinel-2, 10 m colour', dataset: 'S2_L2A_CDAS', layer: '1_TRUE_COLOR', days: 6 },
  { id: 's2swir', name: 'Sentinel-2, short-wave infrared (fire, burn scars)', dataset: 'S2_L2A_CDAS', layer: '6-SWIR', days: 6 },
  { id: 's1', name: 'Sentinel-1 radar, 10 m (sees through cloud)', dataset: 'S1_CDAS_IW_VVVH', layer: 'ENHANCED-VISUALIZATION-ORTHORECTIFIED', days: 12 },
  { id: 'l89', name: 'Landsat 8–9, 15 m pan-sharpened', dataset: 'CDAS_L8_L9_LOTL1', layer: '2_TRUE_COLOR_PANSHARPENED', days: 16 },
];
/** NASA Worldview with the same GIBS layer and day; with day2, its own swipe comparison. bbox = [west, south, east, north]. */
export function worldviewUrl({ bbox, layer, day, day2 }) {
  const base = 'Coastlines_15m,Reference_Labels_15m';
  const p = [`v=${bbox.map(v => Number(v).toFixed(4)).join(',')}`, `l=${base},${layer}`, `t=${day}-T00:00:00Z`];
  if (day2) p.push(`l1=${base},${layer}`, `t1=${day2}-T00:00:00Z`, 'ca=true', 'cm=swipe', 'cv=50');
  return `https://worldview.earthdata.nasa.gov/?${p.join('&')}`;
}
export const waybackUrl = ({ lat, lon, z = 15 }) => `https://livingatlas.arcgis.com/wayback/#mapCenter=${f5(lon)}%2C${f5(lat)}%2C${Math.round(z)}`;
export const googleEarthUrl = ({ lat, lon, range = 3000 }) => `https://earth.google.com/web/@${f5(lat)},${f5(lon)},0a,${Math.round(range)}d,35y,0h,0t,0r`;
export const EARTHEXPLORER = 'https://earthexplorer.usgs.gov/';
export const LANDSATLOOK = 'https://landsatlook.usgs.gov/explore';
export const mapillaryUrl = ({ lat, lon, z = 17 }) => `https://www.mapillary.com/app/?lat=${f5(lat)}&lng=${f5(lon)}&z=${z}`;
export const kartaviewUrl = ({ lat, lon, z = 17 }) => `https://kartaview.org/map/@${f5(lat)},${f5(lon)},${z}z`;
export const streetViewUrl = ({ lat, lon }) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${f5(lat)},${f5(lon)}`;
/** PeakVisor 3D panorama from a point, looking along a compass bearing (yaw −180…180). */
export function peakvisorUrl({ lat, lon, bearing = 0, hfov = 60 }) {
  let yaw = ((bearing % 360) + 360) % 360; if (yaw > 180) yaw -= 360;
  return `https://peakvisor.com/embed?lat=${f5(lat)}&lng=${f5(lon)}&yaw=${yaw.toFixed(1)}&pitch=0&hfov=${hfov}`;
}
export const osmUrl = ({ lat, lon, z = 16 }) => `https://www.openstreetmap.org/#map=${Math.round(z)}/${f5(lat)}/${f5(lon)}`;
export const osmElementUrl = (type, id) => `https://www.openstreetmap.org/${type}/${id}`;
export const firmsMapUrl = ({ lat, lon, z = 8 }) => `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${Number(lon).toFixed(2)},${Number(lat).toFixed(2)},${Math.round(z)}.0z`;
/** Overpass Turbo with a query and map view; `run` starts it at once (only for queries already sized for the view). */
export const overpassTurboUrl = (query, { lat, lon, z }, { run = true } = {}) => `https://overpass-turbo.eu/?Q=${encodeURIComponent(query)}&C=${f5(lat)};${f5(lon)};${Math.round(z)}${run ? '&R' : ''}`;

/* ---------------------------------------------------------------- OpenStreetMap: Overpass presets and query builder */
// Two keyless public instances that send CORS headers, listed on the OSM wiki (checked October 2026). The main
// overpass-api.de instance asks apps hosted on fast-deployment platforms not to use it, so this page does not; Overpass
// Turbo (a person's own use) is offered as a link-out. The server's operator sees the area and features you ask for,
// so the choice is the user's, made in the Features tab; nothing switches servers silently.
export const OVERPASS_SERVERS = [
  { id: 'pc', name: 'Private.coffee', operator: 'Private.coffee, a non-profit association in Austria', url: 'https://overpass.private.coffee/api/interpreter', policy: 'no rate limit; asks to be told before large-scale use' },
  { id: 'vk', name: 'VK Maps', operator: 'VK, a company in Russia', url: 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', policy: 'no request limits stated' },
];
export const overpassServer = id => OVERPASS_SERVERS.find(s => s.id === id) || OVERPASS_SERVERS[0];
export const OVERPASS_ENDPOINT = OVERPASS_SERVERS[0].url;
export const OVERPASS_NAME = 'Overpass API at Private.coffee';
export const OVERPASS_LIMIT = 1000;
// maxKm2 keeps "current view" queries to areas the public server can answer quickly.
export const OSM_PRESETS = [
  { id: 'airfields', group: 'Transport', name: 'Airfields and airports', q: ['nwr["aeroway"="aerodrome"]'], maxKm2: 500000 },
  { id: 'helipads', group: 'Transport', name: 'Helipads', q: ['nwr["aeroway"="helipad"]'], maxKm2: 40000 },
  { id: 'ports', group: 'Transport', name: 'Ports and harbours', q: ['nwr["landuse"="port"]', 'nwr["industrial"="port"]', 'nwr["harbour"="yes"]', 'nwr["seamark:type"="harbour"]'], maxKm2: 150000 },
  { id: 'stations', group: 'Transport', name: 'Railway stations', q: ['nwr["railway"="station"]'], maxKm2: 40000 },
  { id: 'bridges', group: 'Transport', name: 'Bridges on major roads and railways', q: ['way["bridge"]["highway"~"^(motorway|trunk|primary|secondary)$"]', 'way["bridge"]["railway"="rail"]', 'nwr["man_made"="bridge"]'], maxKm2: 4000 },
  { id: 'border', group: 'Transport', name: 'Border crossings', q: ['nwr["barrier"="border_control"]'], maxKm2: 500000 },
  { id: 'power-plants', group: 'Energy and water', name: 'Power plants', q: ['nwr["power"="plant"]'], maxKm2: 300000 },
  { id: 'substations', group: 'Energy and water', name: 'Electricity substations', q: ['nwr["power"="substation"]'], maxKm2: 15000 },
  { id: 'wind', group: 'Energy and water', name: 'Wind turbines', q: ['node["power"="generator"]["generator:source"="wind"]'], maxKm2: 8000 },
  { id: 'oil', group: 'Energy and water', name: 'Refineries, oil terminals and fuel depots', q: ['nwr["industrial"~"^(refinery|oil|fuel_depot|oil_terminal)$"]', 'nwr["man_made"="storage_tank"]["content"~"^(oil|fuel|petroleum|diesel|gasoline)$"]'], maxKm2: 60000 },
  { id: 'dams', group: 'Energy and water', name: 'Dams', q: ['nwr["waterway"="dam"]'], maxKm2: 150000 },
  { id: 'hospitals', group: 'Civil', name: 'Hospitals', q: ['nwr["amenity"="hospital"]'], maxKm2: 80000 },
  { id: 'military', group: 'Civil', name: 'Military areas (as tagged in OpenStreetMap)', q: ['nwr["landuse"="military"]', 'nwr["military"]'], maxKm2: 60000 },
  { id: 'worship', group: 'Landmarks for geolocation', name: 'Places of worship', q: ['nwr["amenity"="place_of_worship"]'], maxKm2: 2500 },
  { id: 'water-towers', group: 'Landmarks for geolocation', name: 'Water towers', q: ['nwr["man_made"="water_tower"]'], maxKm2: 25000 },
  { id: 'masts', group: 'Landmarks for geolocation', name: 'Telecom masts and towers', q: ['nwr["man_made"~"^(mast|tower)$"]["tower:type"="communication"]'], maxKm2: 15000 },
  { id: 'lighthouses', group: 'Landmarks for geolocation', name: 'Lighthouses', q: ['nwr["man_made"="lighthouse"]'], maxKm2: 500000 },
];
export const presetById = id => OSM_PRESETS.find(p => p.id === id) || null;
// Example searches that open with the tab: small, well-mapped areas, chosen to show what the presets return.
export const OSM_EXAMPLES = [
  { id: 'dublin-air', name: 'Airfields around Dublin', preset: 'airfields', ll: [53.40, -6.25], z: 10 },
  { id: 'rotterdam', name: 'Port of Rotterdam', preset: 'ports', ll: [51.93, 4.15], z: 11 },
  { id: 'ruhr-power', name: 'Power plants in the Ruhr', preset: 'power-plants', ll: [51.47, 7.10], z: 10 },
];
/** Overpass QL for a preset inside a bbox [south, west, north, east] or around { lat, lon, r } (metres),
 *  optionally only where within `near.r` metres of another preset. Always with a timeout, a size cap and a result limit.
 *  { turbo: true } as the area writes Overpass Turbo's {{bbox}} placeholder (the view open in Turbo). */
export function buildOverpassQuery(preset, area, { near = null, timeout = 25, maxsize = 64 * 1024 * 1024, limit = OVERPASS_LIMIT } = {}) {
  if (!preset || !preset.q?.length) throw new Error('No preset');
  const head = [`[out:json]`, `[timeout:${timeout}]`, `[maxsize:${maxsize}]`];
  let spatial = '';
  if (area?.turbo) head.push('[bbox:{{bbox}}]');
  else if (area?.bbox) head.push(`[bbox:${area.bbox.map(v => Number(v).toFixed(5)).join(',')}]`);
  else if (area?.around) spatial = `(around:${Math.round(area.around.r)},${f5(area.around.lat)},${f5(area.around.lon)})`;
  else throw new Error('No area');
  const lines = [head.join('') + ';'];
  if (near?.preset) {
    lines.push('(', ...near.preset.q.map(s => `  ${s}${spatial};`), ')->.near;');
    lines.push('(', ...preset.q.map(s => `  ${s}(around.near:${Math.round(near.r)})${spatial};`), ');');
  } else {
    lines.push('(', ...preset.q.map(s => `  ${s}${spatial};`), ');');
  }
  lines.push(`out tags center ${limit};`);
  return lines.join('\n');
}
/** Overpass JSON → [{ type, id, lat, lon, name, kind, tags }] (ways and relations at their centre). */
export function normalizeOverpass(json) {
  const KEYS = ['aeroway', 'railway', 'power', 'man_made', 'military', 'landuse', 'amenity', 'waterway', 'harbour', 'industrial', 'barrier', 'bridge', 'highway', 'generator:source', 'religion', 'operator'];
  return (json?.elements || []).map(e => {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const t = e.tags || {};
    const kind = KEYS.filter(k => t[k] && k !== 'operator').slice(0, 2).map(k => `${k}=${t[k]}`).join(', ');
    return { type: e.type, id: e.id, lat, lon, name: t.name || t['name:en'] || t.ref || '', nameEn: t['name:en'] || '', kind, operator: t.operator || '', tags: t };
  }).filter(Boolean);
}
export function toGeoJSON(features, meta = {}) {
  return {
    type: 'FeatureCollection', ...meta,
    features: features.map(f => ({ type: 'Feature', id: `${f.type}/${f.id}`, geometry: { type: 'Point', coordinates: [f.lon, f.lat] }, properties: { osm_type: f.type, osm_id: f.id, name: f.name, ...f.tags } })),
  };
}

/* ---------------------------------------------------------------- Nominatim (OSM Foundation): 1 request per second, no autocomplete */
export const NOMINATIM = 'https://nominatim.openstreetmap.org';
export const NOMINATIM_POLICY = 'https://operations.osmfoundation.org/policies/nominatim/';
export function nominatimSearchUrl(q, { limit = 6, lang = 'en' } = {}) {
  return `${NOMINATIM}/search?format=jsonv2&limit=${limit}&accept-language=${encodeURIComponent(lang)}&q=${encodeURIComponent(String(q).trim().slice(0, 200))}`;
}
export const nominatimReverseUrl = (lat, lon, { zoom = 14, lang = 'en' } = {}) => `${NOMINATIM}/reverse?format=jsonv2&zoom=${zoom}&accept-language=${encodeURIComponent(lang)}&lat=${f5(lat)}&lon=${f5(lon)}`;

/* ---------------------------------------------------------------- NASA FIRMS (needs a free MAP_KEY) */
export const FIRMS_KEY_PAGE = 'https://firms.modaps.eosdis.nasa.gov/api/map_key/';
export const FIRMS_ORIGIN = 'https://firms.modaps.eosdis.nasa.gov';
export const isFirmsKey = k => /^[0-9a-f]{32}$/i.test(String(k ?? '').trim());
export const firmsWmsBase = key => `${FIRMS_ORIGIN}/mapserver/wms/fires/${String(key).trim()}/`;
export const FIRMS_WINDOWS = [{ id: '24', name: 'Last 24 hours' }, { id: '48', name: 'Last 48 hours' }, { id: '7', name: 'Last 7 days' }];
export const firmsWmsLayers = win => ['fires_viirs', 'fires_modis'].map(l => `${l}_${['24', '48', '7'].includes(win) ? win : '24'}`).join(',');
/** CSV of detections in a bbox [west, south, east, north] for 1–5 days (FIRMS area API). */
export function firmsAreaUrl(key, source, [w, s, e, n], days = 1, day) {
  const d = Math.min(5, Math.max(1, Math.round(days)));
  const box = [w, s, e, n].map(v => Number(v).toFixed(4)).join(',');
  return `${FIRMS_ORIGIN}/api/area/csv/${String(key).trim()}/${source}/${box}/${d}${day ? '/' + day : ''}`;
}
export function parseFirmsCsv(text) {
  return parseCSV(text).map(r => {
    const lat = +r.latitude, lon = +r.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const hhmm = String(r.acq_time ?? '').padStart(4, '0');
    const t = Date.parse(`${r.acq_date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
    const conf = r.confidence;
    return { lat, lon, time: t, satellite: r.satellite || '', instrument: r.instrument || '', frp: +r.frp, daynight: r.daynight || '',
      confidence: conf === 'h' ? 'high' : conf === 'n' ? 'nominal' : conf === 'l' ? 'low' : (Number.isFinite(+conf) && conf !== '' ? `${+conf}%` : String(conf || '')) };
  }).filter(Boolean);
}

/* ---------------------------------------------------------------- USGS earthquakes (GeoJSON feeds, keyless, CORS) */
export const QUAKE_FEEDS = [
  { id: '4.5_week', name: 'M4.5+, past 7 days' },
  { id: '2.5_day', name: 'M2.5+, past day' },
  { id: 'significant_month', name: 'Significant, past 30 days' },
  { id: '4.5_month', name: 'M4.5+, past 30 days' },
];
export const quakeFeedUrl = id => `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${QUAKE_FEEDS.some(f => f.id === id) ? id : '4.5_week'}.geojson`;
export function normalizeQuakes(geojson) {
  return (geojson?.features || []).map(f => {
    const p = f.properties || {}, c = f.geometry?.coordinates || [];
    if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
    return { id: f.id, mag: Number.isFinite(p.mag) ? p.mag : null, place: p.place || '', time: p.time, depth: c[2], lat: c[1], lon: c[0], url: p.url || '', alert: p.alert || '', tsunami: !!p.tsunami, felt: p.felt ?? null, sig: p.sig ?? null };
  }).filter(Boolean).sort((a, b) => b.time - a.time);
}

/* ---------------------------------------------------------------- GDACS alerts (keyless, CORS) */
export const GDACS_CURRENT = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP';
export const GDACS_RECENT = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;DR;WF&alertlevel=Orange;Red';
export const GDACS_TYPES = { EQ: 'Earthquake', TC: 'Tropical cyclone', FL: 'Flood', VO: 'Volcano', DR: 'Drought', WF: 'Wildfire', TS: 'Tsunami' };
export function normalizeGdacs(geojson) {
  return (geojson?.features || []).map(f => {
    const p = f.properties || {}, c = f.geometry?.type === 'Point' ? f.geometry.coordinates : (f.bbox ? [(f.bbox[0] + f.bbox[2]) / 2, (f.bbox[1] + f.bbox[3]) / 2] : null);
    if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) return null;
    const level = ['Green', 'Orange', 'Red'].includes(p.alertlevel) ? p.alertlevel : 'Green';
    return {
      id: `${p.eventtype}-${p.eventid}`, type: p.eventtype, typeName: GDACS_TYPES[p.eventtype] || p.eventtype, name: p.name || p.eventname || '',
      level, from: p.fromdate ? Date.parse(p.fromdate + 'Z') : null, to: p.todate ? Date.parse(p.todate + 'Z') : null,
      country: p.country || '', current: String(p.iscurrent) === 'true', severity: p.severitydata?.severitytext || '', url: p.url?.report || '',
      lat: c[1], lon: c[0],
    };
  }).filter(Boolean).sort((a, b) => ({ Red: 0, Orange: 1, Green: 2 }[a.level] - { Red: 0, Orange: 1, Green: 2 }[b.level]) || (b.to ?? 0) - (a.to ?? 0));
}

/* ---------------------------------------------------------------- OSINT Training lessons (link targets, not copies) */
export const LESSONS = [
  { id: 'geolocation', title: 'Geolocation', unit: 'Unit 4 · Verifying images and video' },
  { id: 'satellite-imagery-and-chronolocation', title: 'Satellite imagery and chronolocation', unit: 'Unit 4 · Verifying images and video' },
  { id: 'reverse-image-search-metadata-and-synthetic-media', title: 'Reverse image search, metadata and synthetic media', unit: 'Unit 4 · Verifying images and video' },
  { id: 'tracking-aircraft-ships-fires-and-lights', title: 'Tracking aircraft, ships, fires and lights', unit: 'Unit 6 · Movement and infrastructure' },
  { id: 'law-terms-of-service-and-data-protection', title: 'Law, terms of service and data protection', unit: 'Unit 10 · Law, ethics and safety' },
  { id: 'doing-no-harm-and-staying-safe', title: 'Doing no harm and staying safe', unit: 'Unit 10 · Law, ethics and safety' },
];
export const lessonPath = id => `fe/learning.html?course=osint&lesson=${encodeURIComponent(id)}`;
export const defaultDay = (now = Date.now()) => addDays(new Date(now).toISOString().slice(0, 10), -1);
