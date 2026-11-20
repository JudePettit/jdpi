/* The Omni-Map answers prp:focus (design/prp-focus.js, stage S5c): a page or the Documentary narrator names countries
   by ISO3 (or Q-ids, points, a box), and the map fits them; { reset: true } fits the view's own box again. A country is
   fitted to its shape on Natural Earth's countries of today (omni/data/base/countries.topo.json, loaded the first time a
   focus asks for it), its main parts only; a Q-id to its border of the frame's year (VM's crosswalk of Cliopatria),
   else to its point in the lake. The page has no Documentary button of its own; it only answers.

   const f = listenFocus({ getFile, data, map: () => S.map, home: () => S.box, qid: q => <GeoJSON | [lon, lat] | null> })
   f.state()   { focused: box | null, countries, at }  for window.omniState */
export function listenFocus({ getFile, data, map, home, qid = () => null }) {
  const F = window.PRPFocus, M = window.PRPMap;
  let fc = null, focused = null, countries = [], at = null;
  if (!F) return { state: () => ({ focused: null, countries: [], at: null }) };
  const shapes = async () => {
    if (fc) return fc;
    const t = await getFile(new URL('base/countries.topo.json', data).href);
    fc = M.decode(t.json, 'countries');
    return fc;
  };
  const country = id => {
    const fs = (fc?.features || []).filter(f => f.geometry && f.properties?.iso3 === id);
    return fs.length ? { type: 'FeatureCollection', features: fs } : null;
  };
  F.listen({
    async focus(t) {
      if (t.countries.length) await shapes().catch(() => null);
      const r = F.resolve(t, { country, qid });
      if (!r.box || !map()) return;
      focused = r.box; countries = t.countries; at = new Date().toISOString();
      map().fit(r.box, { padding: r.padding });
    },
    reset() {
      focused = null; countries = []; at = new Date().toISOString();
      map()?.fit(home(), { padding: 40 });
    },
  });
  return { state: () => ({ focused, countries: [...countries], at }) };
}
