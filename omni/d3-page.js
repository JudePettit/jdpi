/* The d3 adapter's test page (omni/d3.html, stage S5a): the year in the address (#at=1494), its borders file only, the
   rows the core slices, drawn by design/prp-map-d3.js. window.omniD3State: { ready, year, features: [ids, sorted],
   paths, error? }, which tests/omni-layers-page.test.mjs compares with the MapLibre page's omniState.features. */
const M = window.PRPMap, D = window.PRPMapD3;
const DATA = new URL('data/', import.meta.url).href;
const $ = s => document.querySelector(s);
const get = async p => { const r = await fetch(new URL(p, DATA)); if (!r.ok) throw new Error(`HTTP ${r.status} for ${p}`); return r.json(); };
window.omniD3State = { ready: false };

async function main() {
  const m = /(?:^|[#&])at=(-?\d{1,5})(?:&|$)/.exec(location.hash);
  const index = await get('borders/index.json');
  const held = M.held(index);
  const year = m ? +m[1] : held.from;
  const file = M.fileFor(index, year);
  if (!file) { $('#d3-meta').textContent = M.reasonText('outside-slice', { held }); window.omniD3State = { ready: true, year, features: [], paths: 0 }; return; }
  const [topo, land] = await Promise.all([get(`borders/${file.file}`), get('base/ne_110m_land.geojson')]);
  const fc = D.slice(topo, year);
  const css = getComputedStyle(document.documentElement), tok = n => css.getPropertyValue(n).trim();
  const r = D.draw($('#d3-map'), fc, { d3: window.d3, width: 960, height: 500, land,
    colors: { water: tok('--prp-map-water'), land: tok('--prp-map-land'), border: tok('--prp-map-border'), accent: tok('--prp-ds') } });
  $('#d3-meta').textContent = `${year < 0 ? `${-year} BC` : year}: ${r.drawn} outline${r.drawn === 1 ? '' : 's'} (from ${file.file})`;
  window.omniD3State = { ready: true, year, features: D.ids(fc), paths: document.querySelectorAll('#d3-map .d3-borders path').length, d3: window.d3?.version || null };
}
main().catch(e => { $('#d3-meta').textContent = `The borders could not be drawn: ${e.message}`; window.omniD3State = { ready: true, error: e.message }; });
window.addEventListener('hashchange', () => location.reload());
