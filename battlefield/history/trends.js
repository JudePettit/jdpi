/* Retrospective Battlefield: two charts above the table (addition HD-13, 25 November 2026; rank 1 of
   VM-VISUALISATION-STUDY.md). Panel one stacks the armed conflicts of each year by UCDP's type, from 1946, out of
   data/wars.json: each conflict counted once a year under its type that year (the third element of its `years`,
   UCDP's type_of_conflict), never its last year's. 1926–1945 is an uncoded strip: UCDP's coding starts in 1946, and
   Wikidata names those wars only by their kind (a war, a civil war, a revolt), so those years are never drawn as zero. Panel two draws UCDP's battle deaths each year from 1989, the best
   estimate as a line in the band from its low to its high (the sums of the conflicts' own), out of the Omni-Map's
   conflict-territory layer (omni/data/layers/conflict-territory/conflicts.json, UCDP Battle-Related Deaths Dataset,
   conflict level), after War Focus's d3 area (battlefield/focus/app.js renderSpark). Both follow the timeline's
   period: its years are shaded, and the bars outside a period fade. Each chart takes the keyboard (← → Home End move
   through the years, Enter shows the year), and the table under them gives the same figures.
   The shaping functions are pure, so tests/addition-conflict-trend.test.mjs reads them in Node; mountTrends needs
   the page's d3 (loaded by index.html). */

// UCDP's types (wars.json `types`), stacked from the bottom: civil, internationalised civil, interstate, colonial.
export const TYPE_ORDER = ['3', '4', '2', '1'];
const TYPE_SHORT = { 3: 'civil', 4: 'internationalised civil', 2: 'interstate', 1: 'colonial' };

/** The conflicts of each year by type, firstYear to lastYear: `coded: false` and no counts before UCDP's first year
    (VM's list from Wikidata, whose wars are counted in `listed` but not typed), else a count for every type. */
export function typeCounts(data) {
  const rows = [];
  for (let y = data.firstYear; y <= data.lastYear; y++) {
    if (y < data.ucdpFrom) { rows.push({ year: y, coded: false, counts: null, total: null, listed: 0 }); continue; }
    rows.push({ year: y, coded: true, counts: Object.fromEntries(TYPE_ORDER.map(t => [t, 0])), total: 0, listed: 0 });
  }
  const at = y => rows[y - data.firstYear];
  const codeOf = name => Object.entries(data.types || {}).find(([, n]) => n === name)?.[0];
  for (const w of data.wars) {
    for (const [y, , t] of w.years) {
      const r = at(y); if (!r) continue;
      if (!r.coded) { if (w.src === 'wikidata') r.listed++; continue; }
      if (w.src !== 'ucdp') continue;
      const code = String(t ?? codeOf(w.type) ?? '');
      if (!(code in r.counts)) throw new Error(`${w.id} ${y}: no UCDP type`);
      r.counts[code]++; r.total++;
    }
  }
  return rows;
}

/** UCDP's battle deaths each year from the first year the layer gives them (1989): the sums of each conflict's best,
    low and high. A year the layer does not hold is a gap (nulls), never a zero; `without` counts a year's conflicts
    that have no figure, and `n` the conflicts summed. */
export function deathsSeries(layer) {
  const years = Object.keys(layer.years || {}).map(Number).sort((a, b) => a - b);
  const first = years.find(y => Object.values(layer.years[y].c || {}).some(v => v.length >= 4));
  if (first == null) return [];
  const out = [];
  for (let y = first; y <= layer.to; y++) {
    const c = layer.years[y]?.c;
    if (!c) { out.push({ year: y, best: null, low: null, high: null, n: 0, without: 0 }); continue; }
    let best = 0, low = 0, high = 0, n = 0, without = 0;
    for (const v of Object.values(c)) {
      if (v.length < 4) { without++; continue; }
      best += v[1]; low += v[2]; high += v[3]; n++;
    }
    out.push(n ? { year: y, best, low, high, n, without } : { year: y, best: null, low: null, high: null, n: 0, without });
  }
  return out;
}

/** The series' bounds: its years, the largest year's count, the largest high, and whether every figure has
    low ≤ best ≤ high. */
export function seriesBounds(counts, deaths) {
  const coded = counts.filter(r => r.coded), held = deaths.filter(d => d.best != null);
  return {
    typesFrom: coded[0]?.year ?? null, typesTo: coded.at(-1)?.year ?? null,
    maxTotal: Math.max(0, ...coded.map(r => r.total)),
    deathsFrom: deaths[0]?.year ?? null, deathsTo: deaths.at(-1)?.year ?? null,
    maxHigh: Math.max(0, ...held.map(d => d.high)),
    ordered: held.every(d => d.low <= d.best && d.best <= d.high),
  };
}

/** A dataset's version from the file the build read ("UcdpPrioConflict_v26_1.csv" → "26.1"). */
export const versionOf = file => (String(file || '').match(/_v(\d+)_(\d+)/) || []).slice(1).join('.') || null;

const num = n => Number(n).toLocaleString('en-GB');

/** One year in words, as the readout and the table's title give it. */
export function yearSentence(y, counts, deaths) {
  const r = counts.find(x => x.year === y), d = deaths.find(x => x.year === y);
  if (!r) return '';
  if (!r.coded) return `${y}: types not coded; ${r.listed} war${r.listed === 1 ? '' : 's'} on VM’s list from Wikidata, with no UCDP type and no battle-death figure.`;
  const parts = TYPE_ORDER.filter(t => r.counts[t]).map(t => `${r.counts[t]} ${TYPE_SHORT[t]}`);
  const what = `${y}: ${r.total} armed conflict${r.total === 1 ? '' : 's'}${parts.length ? ` (${parts.join(', ')})` : ''}`;
  const dead = d?.best != null ? `; ${num(d.best)} battle deaths, UCDP’s best estimate (low ${num(d.low)}, high ${num(d.high)})` : deaths.length && y < deaths[0].year ? `; UCDP’s battle-death series starts in ${deaths[0].year}` : '';
  return `${what}${dead}.`;
}

/** The distinct conflicts of a period's years: `ucdp`, those in UCDP/PRIO's record from its first year, and `listed`,
    the wars on VM's list from Wikidata in the years before it (as typeCounts counts them). */
export function periodConflicts(data, a, b) {
  const ucdp = new Set(), listed = new Set();
  for (const w of data.wars) for (const [y] of w.years) {
    if (y < a || y > b) continue;
    if (y >= data.ucdpFrom && w.src === 'ucdp') ucdp.add(w.id);
    else if (y < data.ucdpFrom && w.src === 'wikidata') listed.add(w.id);
  }
  return { ucdp: ucdp.size, listed: listed.size };
}

/** A period in words: its conflicts, and its battle deaths in all where UCDP's series gives them. */
export function periodSentence(data, deaths, a, b) {
  const pc = periodConflicts(data, a, b), pd = periodDeaths(deaths, a, b);
  const bits = [];
  if (a < data.ucdpFrom) bits.push(`${pc.listed} war${pc.listed === 1 ? '' : 's'} on VM’s list to ${data.ucdpFrom - 1}`);
  if (b >= data.ucdpFrom) bits.push(`${pc.ucdp} armed conflict${pc.ucdp === 1 ? '' : 's'}${a < data.ucdpFrom ? ` in UCDP’s record from ${data.ucdpFrom}` : ''}`);
  // A period wholly before the deaths series says nothing of deaths: its last year's sentence, before it, has said
  // when UCDP's series starts.
  const dead = pd ? `${num(pd.best)} battle deaths in all${pd.from > a ? ` from ${pd.from}` : ''} (low ${num(pd.low)}, high ${num(pd.high)})` : '';
  return `Shaded, ${a}–${b}: ${bits.join(' and ')}${dead ? `; ${dead}` : ''}.`;
}

/** The figures of a period's years from the first deaths year: the battle deaths in all, best, low and high. */
export function periodDeaths(deaths, a, b) {
  const ds = deaths.filter(d => d.year >= a && d.year <= b && d.best != null);
  if (!ds.length) return null;
  return { from: ds[0].year, to: ds.at(-1).year, best: ds.reduce((s, d) => s + d.best, 0), low: ds.reduce((s, d) => s + d.low, 0), high: ds.reduce((s, d) => s + d.high, 0) };
}

/* ---------------------------------------------------------------- the page */
const M = { top: 8, right: 10, bottom: 20, left: 30 };
const DM = { top: 8, right: 10, bottom: 20, left: 54 };

/** Draws the two charts and the table into the #trends section; returns { update(period), redraw() }. `pick(year)`
    shows a year on the page (a click, or Enter on a chart). */
export function mountTrends(root, { data, layer, pick }) {
  const d3 = window.d3;
  const counts = typeCounts(data), deaths = layer ? deathsSeries(layer) : [];
  const $ = s => root.querySelector(s);
  let period = { from: data.lastYear, to: data.lastYear }, cursor = null;
  // The visible readout follows the pointer and the keyboard. Screen readers hear a chart's year through its slider
  // value (aria-valuetext) as the keys move it, and the live region (#trends-live) speaks only when the period shown
  // changes, so a pointer passing over the bars reads nothing out.
  const readout = $('#trends-readout'), live = $('#trends-live');
  let spoken = null;
  const sentence = () => {
    const y = cursor ?? period.to, a = period.from, b = period.to;
    let t = yearSentence(y, counts, deaths);
    if (cursor == null && a !== b) t += ` ${periodSentence(data, deaths, a, b)}`;
    return t;
  };
  const say = () => { readout.textContent = sentence(); };
  const announce = () => {
    const key = `${period.from}-${period.to}`;
    if (live && spoken != null && key !== spoken && cursor == null) live.textContent = sentence();
    spoken = key;
  };

  // The years and versions beside the charts, from the data files themselves, so a refresh of either cannot leave
  // the words behind the pictures.
  const fill = (k, v) => { if (v) root.querySelectorAll(`[data-trend="${k}"]`).forEach(el => { el.textContent = v; }); };
  const acd = versionOf(data.files?.['ucdp-acd']?.file), brd = versionOf(layer?.files?.['ucdp-brd']?.file);
  fill('acd-v', acd && `v${acd}`); fill('acd-span', `${data.ucdpFrom}–${data.lastYear}`);
  fill('brd-v', brd && `v${brd}`);
  if (deaths.length) fill('brd-span', `${deaths[0].year}–${deaths.at(-1).year}`);

  // The text alternative: every year's figures, the same as the charts'.
  const tbody = $('#trends-rows');
  tbody.innerHTML = counts.map(r => {
    const d = deaths.find(x => x.year === r.year);
    const typed = r.coded ? TYPE_ORDER.map(t => `<td class="num" data-type="${t}">${r.counts[t]}</td>`).join('') + `<td class="num" data-k="total">${r.total}</td>`
      : `<td colspan="5" class="uncoded">Not coded (${r.listed} war${r.listed === 1 ? '' : 's'} on VM’s list from Wikidata)</td>`;
    const dead = d?.best != null ? `<td class="num" data-k="best">${num(d.best)}</td><td class="num" data-k="low">${num(d.low)}</td><td class="num" data-k="high">${num(d.high)}</td>`
      : '<td class="num none" colspan="3">–</td>';
    return `<tr data-year="${r.year}"><th scope="row">${r.year}</th>${typed}${dead}</tr>`;
  }).join('');

  function drawTypes() {
    const svg = d3.select($('#trend-types-svg')), node = svg.node(), W = Math.max(1, node.clientWidth), H = Math.max(1, node.clientHeight);
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const years = counts.map(r => r.year);
    const x = d3.scaleBand().domain(years).range([M.left, W - M.right]).paddingInner(0.12);
    const y = d3.scaleLinear().domain([0, Math.max(1, d3.max(counts, r => r.total))]).nice().range([H - M.bottom, M.top]);
    const tickYears = years.filter(v => v % (W < 480 ? 40 : 20) === 10);
    svg.select('g.x').attr('transform', `translate(0,${H - M.bottom})`).call(d3.axisBottom(x).tickValues(tickYears).tickSize(3)).call(g => g.select('.domain').remove());
    svg.select('g.y').attr('transform', `translate(${M.left},0)`).call(d3.axisLeft(y).ticks(H < 140 ? 3 : 4).tickSize(-(W - M.left - M.right))).call(g => g.select('.domain').remove());
    // 1926–1945: one hatched strip, said in words, never bars of zero.
    const unc = counts.filter(r => !r.coded);
    svg.select('g.uncoded').selectAll('rect').data(unc.length ? [unc] : []).join('rect')
      .attr('x', u => x(u[0].year)).attr('width', u => x(u.at(-1).year) + x.bandwidth() - x(u[0].year)).attr('y', M.top).attr('height', H - M.bottom - M.top);
    svg.select('g.uncoded').selectAll('text').data(unc.length ? [unc] : []).join('text')
      .attr('x', u => (x(u[0].year) + x(u.at(-1).year) + x.bandwidth()) / 2).attr('y', M.top + 14).attr('text-anchor', 'middle').text('Not coded');
    const stack = d3.stack().keys(TYPE_ORDER).value((r, k) => r.counts[k])(counts.filter(r => r.coded));
    // A 1 px line of the surface between two segments, so the types part without colour alone; a segment under 3 px
    // (one or two conflicts) keeps its whole height, since the line would leave it no colour.
    const topOf = r => TYPE_ORDER.filter(t => r.counts[t]).at(-1);
    const gap = d => { const h = y(d.p[0]) - y(d.p[1]); return d.key !== topOf(d.p.data) && h >= 3 ? 1 : 0; };
    svg.select('g.bars').selectAll('g.layer').data(stack, s => s.key).join('g').attr('class', s => `layer t${s.key}`)
      .selectAll('rect').data(s => s.map(p => ({ p, key: s.key }))).join('rect')
      .attr('x', d => x(d.p.data.year)).attr('width', x.bandwidth())
      .attr('y', d => y(d.p[1]) + gap(d)).attr('height', d => Math.max(0, y(d.p[0]) - y(d.p[1]) - gap(d)))
      .attr('data-year', d => d.p.data.year).attr('data-type', d => d.key).attr('data-n', d => d.p.data.counts[d.key]);
    // Where Figure 3 begins (its first year of battle deaths): the two charts run on time scales of their own.
    const from = deaths[0]?.year, sx = from != null && x(from) != null ? x(from) - (x.step() - x.bandwidth()) / 2 : null;
    svg.select('g.split').selectAll('line').data(sx != null ? [sx] : []).join('line')
      .attr('x1', v => v).attr('x2', v => v).attr('y1', M.top).attr('y2', H - M.bottom);
    svg.select('g.split').selectAll('text').data(sx != null ? [sx] : []).join('text')
      .attr('x', v => v - 3).attr('y', M.top + 9).attr('text-anchor', 'end').text(`${from} →`);
    return { x: v => x(v) + x.bandwidth() / 2, step: x.step(), years, H, W };
  }

  function drawDeaths() {
    const svg = d3.select($('#trend-deaths-svg')), node = svg.node(), W = Math.max(1, node.clientWidth), H = Math.max(1, node.clientHeight);
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    const years = deaths.map(d => d.year);
    const x = d3.scaleLinear().domain([years[0], years.at(-1)]).range([DM.left + 4, W - DM.right - 4]);
    const y = d3.scaleLinear().domain([0, Math.max(1, d3.max(deaths, d => d.high))]).nice().range([H - DM.bottom, DM.top]);
    svg.select('g.x').attr('transform', `translate(0,${H - DM.bottom})`).call(d3.axisBottom(x).tickValues(years.filter(v => v % (W < 480 ? 10 : 5) === 0)).tickFormat(String).tickSize(3)).call(g => g.select('.domain').remove());
    svg.select('g.y').attr('transform', `translate(${DM.left},0)`).call(d3.axisLeft(y).ticks(H < 140 ? 3 : 4).tickFormat(num).tickSize(-(W - DM.left - DM.right))).call(g => g.select('.domain').remove());
    const held = d => d.best != null;
    const band = d3.area().defined(held).x(d => x(d.year)).y0(d => y(d.low)).y1(d => y(d.high)).curve(d3.curveMonotoneX);
    const line = d3.line().defined(held).x(d => x(d.year)).y(d => y(d.best)).curve(d3.curveMonotoneX);
    svg.select('path.band').attr('d', band(deaths));
    svg.select('path.best').attr('d', line(deaths));
    svg.select('g.pts').selectAll('circle').data(deaths.filter(held)).join('circle').attr('r', 0)
      .attr('cx', d => x(d.year)).attr('cy', d => y(d.best))
      .attr('data-year', d => d.year).attr('data-best', d => d.best).attr('data-low', d => d.low).attr('data-high', d => d.high);
    return { x, y, years, H, W, step: x(years[0] + 1) - x(years[0]) };
  }

  let T, D;
  // The period's years shaded on both; a period fades the bars outside it; the cursor marks the year read out.
  function paint() {
    const a = period.from, b = period.to, many = a !== b;
    const ts = d3.select($('#trend-types-svg'));
    ts.select('rect.period').attr('x', T.x(a) - T.step / 2).attr('width', T.x(b) - T.x(a) + T.step).attr('y', M.top).attr('height', T.H - M.bottom - M.top);
    ts.selectAll('g.bars rect').classed('out', function () { const v = +this.dataset.year; return many && (v < a || v > b); });
    const c = cursor ?? b;
    ts.select('line.cursor').attr('x1', T.x(c)).attr('x2', T.x(c)).attr('y1', M.top).attr('y2', T.H - M.bottom).classed('on', cursor != null);
    if (D) {
    const ds = d3.select($('#trend-deaths-svg')), [d0, d1] = [D.years[0], D.years.at(-1)];
    const da = Math.max(a, d0), db = Math.min(b, d1), shown = db >= da;
    ds.select('rect.period').attr('display', shown ? null : 'none').attr('x', D.x(da) - D.step / 2).attr('width', shown ? D.x(db) - D.x(da) + D.step : 0).attr('y', DM.top).attr('height', D.H - DM.bottom - DM.top);
    const dc = deaths.find(d => d.year === c && d.best != null);
    ds.select('circle.cursor').attr('display', dc ? null : 'none').attr('cx', dc ? D.x(dc.year) : 0).attr('cy', dc ? D.y(dc.best) : 0);
    }
    tbody.querySelectorAll('tr').forEach(tr => { const v = +tr.dataset.year; tr.classList.toggle('in', v >= a && v <= b); tr.classList.toggle('now', v === b); });
    // Each chart is a slider over its years: its value is the year read out, in words.
    for (const [el, list] of [[$('#trend-types-svg'), T.years], [$('#trend-deaths-svg'), D?.years]]) {
      if (!list?.length) continue;
      const v = list.includes(c) ? c : c < list[0] ? list[0] : list.at(-1);
      el.setAttribute('aria-valuemin', list[0]); el.setAttribute('aria-valuemax', list.at(-1)); el.setAttribute('aria-valuenow', v);
      el.setAttribute('aria-valuetext', yearSentence(v, counts, deaths));
    }
    say();
  }
  function redraw() {
    if (!$('#trend-types-svg').clientWidth) return; // the table view is hidden: drawn when it is shown
    T = drawTypes(); D = deaths.length ? drawDeaths() : null; paint();
  }

  // Pointer and keyboard: each chart reads out the year under it; a click or Enter shows that year on the page.
  const yearAt = (svgEl, ev, kind) => {
    const r = svgEl.getBoundingClientRect(), px = ev.clientX - r.left;
    const ys = kind === 'types' ? T.years : D.years, xf = kind === 'types' ? T.x : D.x;
    return ys.reduce((p, q) => (Math.abs(xf(q) - px) < Math.abs(xf(p) - px) ? q : p), ys[0]);
  };
  // With no battle-death figures (the layer could not be read), the deaths chart is left out and a note says so, so
  // the table's "–" is not read as "none".
  if (!deaths.length) {
    $('#trend-deaths').hidden = true;
    const note = $('#trends-nodeaths'); if (note) note.hidden = false;
  }
  for (const kind of deaths.length ? ['types', 'deaths'] : ['types']) {
    const el = $(`#trend-${kind}-svg`), ys = () => (kind === 'types' ? T.years : D.years);
    el.addEventListener('pointermove', ev => { if (!T) return; cursor = yearAt(el, ev, kind); paint(); });
    el.addEventListener('pointerleave', () => { if (document.activeElement === el) return; cursor = null; paint(); });
    el.addEventListener('click', ev => { if (!T) return; const y = yearAt(el, ev, kind); cursor = null; pick(y); });
    el.addEventListener('focus', () => { if (!T) return; const list = ys(); cursor = list.includes(period.to) ? period.to : list.at(-1); paint(); });
    el.addEventListener('blur', () => { cursor = null; if (T) paint(); });
    el.addEventListener('keydown', ev => {
      if (!T) return;
      const list = ys(), i = Math.max(0, list.indexOf(cursor ?? period.to));
      const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[ev.key];
      if (step) { cursor = list[Math.min(list.length - 1, Math.max(0, i + step))]; }
      else if (ev.key === 'Home') cursor = list[0];
      else if (ev.key === 'End') cursor = list.at(-1);
      else if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); const y = cursor ?? period.to; pick(y); cursor = y; paint(); return; }
      else return;
      ev.preventDefault(); paint();
    });
  }

  // Redrawn to the width it is given: on a phone, a tablet and a desktop, and when the table view first opens.
  new ResizeObserver(() => redraw()).observe($('#trend-types-svg'));
  // On a wide screen the page is one screen; while the table view shows, it grows by the charts' height, so the table
  // keeps the room it had (trends.css).
  const screen = root.closest('.screen');
  if (screen) new ResizeObserver(() => screen.style.setProperty('--trends-room', `${Math.ceil(root.getBoundingClientRect().height) + 12}px`)).observe(root);
  return { update(p) { period = { from: p.from, to: p.to }; if (T) paint(); else redraw(); announce(); }, redraw, counts, deaths };
}
