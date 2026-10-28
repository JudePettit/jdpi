// GEOINT & IMINT Dashboard · Overview: live numbers from the keyless feeds, the workflow figure and lesson links.
import { esc, fmtNum, fmtDay, fmtUTC } from './util.js';
import { LESSONS, quakeFeedUrl, normalizeQuakes, GDACS_CURRENT, normalizeGdacs, GDACS_TYPES } from './sources.js';
import { FIGURES } from './figures.js';

export async function init(panel, ctx) {
  const $ = s => panel.querySelector(s);
  $('#ov-figure').innerHTML = `<figure class="prp-figure md-figure">${FIGURES['geoint-cycle']()}<figcaption><b>Figure 1.</b> The workflow this dashboard supports. Start from a question, collect imagery and map data, measure, and corroborate with at least three independent matches before you report; when something does not fit, go back and collect again.</figcaption></figure>`;

  const lessons = LESSONS.map(l => { const a = ctx.lessonLink(l.id); return `<li><a href="${esc(a.href)}" target="${a.target}"><span class="t">${esc(l.title)}</span><span class="u">${esc(l.unit)}</span></a></li>`; }).join('');
  const course = ctx.prpLink('osint-training/fe/learning.html?course=osint');
  $('#ov-lessons').innerHTML = lessons + `<li><a href="${esc(course.href)}" target="${course.target}"><span class="t">The whole OSINT Training course</span><span class="u">Eleven units, with exercises and quizzes</span></a></li>`;
  const rel = [
    ['sigint/sigint/index.html', 'SIGINT Dashboard', 'Aircraft, ships and satellites from public feeds; receiving weather-satellite images yourself'],
    ['osint/osint/index.html', 'OSINT Dashboard', 'Search, records, archives and a case notebook that grades every source'],
    ['battlefield/q/battlefield.html?view=live', 'Realtime Battlefield', 'Armed conflict this year from UCDP, on a map'],
  ];
  $('#ov-related').innerHTML = rel.map(([p, t, u]) => { const a = ctx.prpLink(p); return `<li><a href="${esc(a.href)}" target="${a.target}"><span class="t">${esc(t)}</span><span class="u">${esc(u)}</span></a></li>`; }).join('');

  // Four tiles, each filled as soon as its source answers (GDACS can take 20 seconds).
  let loadedAt = 0;
  const SLOTS = [
    ['img', 'Latest full day of imagery', 'NASA GIBS'],
    ['quakes', 'Earthquakes M4.5+, 7 days', 'USGS'],
    ['alerts', 'Red and orange alerts now', 'GDACS'],
    ['events', 'Events GDACS is following', 'GDACS'],
  ];
  const put = (slot, html) => { const el = $(`#ov-kpis [data-slot="${slot}"]`); if (el) el.outerHTML = html; };
  async function refresh() {
    loadedAt = Date.now();
    $('#ov-kpis').innerHTML = SLOTS.map(([slot, label, src]) =>
      `<div class="prp-kpi kpi-wait" data-slot="${slot}"><span>${esc(label)}</span><b aria-hidden="true">…</b><small>Asking ${esc(src)}…</small></div>`).join('');
    $('#ov-status').textContent = 'Checking the live sources…';
    const img = ctx.latest().then(day => put('img', kpi('img', '#tab=imagery', 'Latest full day of imagery', fmtDay(day).replace(/ \d{4}$/, ''), 'VIIRS and MODIS, NASA GIBS (UTC day)')));
    const quakes = ctx.get(quakeFeedUrl('4.5_week'), { ttl: 5 * 60e3 }).then(normalizeQuakes).then(q => {
      const big = q.reduce((m, e) => (e.mag > (m?.mag ?? -9) ? e : m), null);
      put('quakes', kpi('quakes', '#tab=hazards', 'Earthquakes M4.5+, 7 days', fmtNum(q.length), big ? `Largest M${big.mag.toFixed(1)}, ${big.place}` : 'None reported'));
    }, () => put('quakes', kpi('quakes', '#tab=hazards', 'Earthquakes M4.5+, 7 days', '–', 'USGS feed unavailable')));
    const gdacs = ctx.get(GDACS_CURRENT, { ttl: 10 * 60e3, timeout: 60000 }).then(normalizeGdacs).then(all => {
      const g = all.filter(e => e.current), hot = g.filter(e => e.level !== 'Green'), top = hot[0];
      put('alerts', kpi('alerts', '#tab=hazards', 'Red and orange alerts now', fmtNum(hot.length), top ? `${top.level}: ${top.name}${top.country ? ` (${top.country})` : ''}` : 'No red or orange alert among current events', top ? top.level.toLowerCase() : ''));
      const by = {};
      g.forEach(e => { by[e.type] = (by[e.type] || 0) + 1; });
      const PLURAL = { EQ: 'earthquakes', TC: 'tropical cyclones', FL: 'floods', VO: 'volcanoes', DR: 'droughts', WF: 'wildfires', TS: 'tsunamis' };
      const parts = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${n === 1 ? (GDACS_TYPES[t] || t).toLowerCase() : (PLURAL[t] || t)}`);
      put('events', kpi('events', '#tab=hazards', 'Events GDACS is following', fmtNum(g.length), parts.join(' · ') || '–'));
    }, () => {
      put('alerts', kpi('alerts', '#tab=hazards', 'Red and orange alerts now', '–', 'GDACS feed unavailable'));
      put('events', kpi('events', '#tab=hazards', 'Events GDACS is following', '–', 'GDACS feed unavailable'));
    });
    await Promise.allSettled([img, quakes, gdacs]);
    $('#ov-status').textContent = `Updated ${fmtUTC(Date.now()).split(', ')[1]} · USGS, GDACS, NASA GIBS`;
  }
  const kpi = (slot, href, label, value, note, level = '') =>
    `<a class="prp-kpi kpi-link" data-slot="${slot}" href="${href}" data-tab-link><span>${esc(label)}</span><b>${esc(value)}</b><small>${level ? `<i class="lvl ${level}" aria-hidden="true"></i>` : ''}${esc(note)}</small></a>`;

  return {
    show() { if (Date.now() - loadedAt > 5 * 60e3) refresh().catch(err => { $('#ov-status').textContent = `Live sources unavailable: ${err.message}`; }); },
  };
}
