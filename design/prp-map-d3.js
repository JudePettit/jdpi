/* PRP map, d3 adapter (PRP-SCHOLAR-USP-DESIGN.md 4.2, stage S5a): the dated borders drawn as SVG by d3, beside
   omni/lib/maplibre.js, from the same pure core (design/prp-map.js, which stays pure: no DOM, no library). A page that
   wants a printable, zoomless or animated map without WebGL (War Focus and the Retrospective Battlefield, when they
   move off their own drawing in MP-11) loads d3 itself, at an exact version with its Subresource Integrity hash, then
   this file; this file never loads code.

   The rows drawn are the core's: slice() is PRPMap.decode then PRPMap.sliceAt, so a year draws exactly the rows the
   Omni-Map's MapLibre page draws (tests/omni-layers-page.test.mjs checks it at 1494 and 1900).

   const fc = PRPMapD3.slice(topology, year)                      the rows drawn at the year, with their geometry
   PRPMapD3.draw(svg, fc, { d3, width, height, colors, focus })   one <path> per row, POLITY filled, RELATION and
                                                                  composite rows outlined, as the MapLibre page draws them
   PRPMapD3.ids(fc)                                               the drawn rows' ids, sorted */
(function () {
  const root = typeof window !== 'undefined' ? window : globalThis;
  const core = () => { if (!root.PRPMap) throw new Error('PRPMap is not loaded (design/prp-map.js)'); return root.PRPMap; };
  const comp = f => f.properties.k === 'POLITY' && /^\(.+\)$/.test(f.properties.n || '');

  /** The rows drawn at a year (those with a geometry), as a FeatureCollection. */
  function slice(topology, year) {
    const M = core();
    const fc = topology?.type === 'Topology' ? M.decode(topology) : topology;
    return { type: 'FeatureCollection', features: M.sliceAt(fc, year).filter(f => f.geometry) };
  }
  const ids = fc => fc.features.map(f => f.id).sort();

  /** Draws the rows into an <svg> with d3 (given, never loaded here): Natural Earth's projection fitted to the box. */
  function draw(svg, fc, { d3, width = 960, height = 500, colors = {}, focus = [], land = null } = {}) {
    if (!d3?.geoPath) throw new Error('d3 is not loaded');
    const on = new Set(focus);
    const projection = d3.geoNaturalEarth1().fitExtent([[4, 4], [width - 4, height - 4]], { type: 'Sphere' });
    const path = d3.geoPath(projection);
    const s = d3.select(svg).attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'img');
    s.selectAll('*').remove();
    s.append('path').attr('class', 'd3-sphere').attr('d', path({ type: 'Sphere' })).attr('fill', colors.water || 'none');
    if (land) s.append('path').attr('class', 'd3-land').attr('d', path(land)).attr('fill', colors.land || '#eee');
    // POLITY rows filled under the outlines; RELATION rows and composite polities as dashed outlines, as on the MapLibre page.
    const g = s.append('g').attr('class', 'd3-borders');
    g.selectAll('path').data(fc.features, f => f.id).join('path')
      .attr('data-id', f => f.id)
      .attr('d', f => path(f))
      .attr('fill', f => (f.properties.k === 'POLITY' && !comp(f) ? colors.accent || '#0e7490' : 'none'))
      .attr('fill-opacity', f => (on.has(f.id) ? 0.34 : 0.1))
      .attr('stroke', f => (f.properties.k === 'POLITY' && !comp(f) ? colors.border || '#999' : colors.accent || '#0e7490'))
      .attr('stroke-width', f => (on.has(f.id) ? 1.6 : 0.7))
      .attr('stroke-dasharray', f => (f.properties.k === 'POLITY' && !comp(f) ? null : '2 2'));
    return { drawn: fc.features.length };
  }

  root.PRPMapD3 = { slice, draw, ids, d3Version: '7.9.0' };
})();
