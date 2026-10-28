// Data Analytics: starting points shown on the empty workbench. Each is an analysis hash; the page shows only those whose
// dataset and fields are in the catalogue, and tests/data-analytics.test.mjs runs every one against the real data.
export const EXAMPLES = [
  { d: 'political-calendar', fields: ['date', 'type'], label: 'Elections each year since 1980', note: 'Historical Calendar · line chart',
    hash: 'filter=type:eq:election&derive=year:year(date)&group=year:count&chart=line&x=year&y=count' },
  { d: 'political-calendar', fields: ['country'], label: 'Where political events happen', note: 'Historical Calendar · world map',
    hash: 'chart=map&x=country' },
  { d: 'realtime-wars', fields: ['name', 'deaths'], label: 'Deadliest wars this year', note: 'Realtime Battlefield · bar chart',
    hash: 'sort=-deaths&limit=15&chart=bar&x=name&y=deaths' },
  { d: 'science-progress-events', fields: ['year', 'disciplines'], label: 'Breakthroughs since 1500 by field', note: 'Timeline of Progress · histogram',
    hash: 'unnest=disciplines&filter=year:ge:1500&chart=hist&x=year&color=disciplines' },
  { d: 'kardashev-world', fields: ['year', 'kardashev'], label: 'Humanity on the Kardashev scale', note: 'Kardashev Tracker · line chart',
    hash: 'filter=year:ge:1800&chart=line&x=year&y=kardashev&fn=mean' },
  { d: 'national-countries', fields: ['iso3', 'income', 'pestle_overall'], label: 'PESTLE pressure by income group', note: 'National Analysis · bar chart',
    hash: 'group=income:mean~pestle_overall~pressure,count&sort=-pressure&chart=bar&x=income&y=pressure' },
];

/** The examples that this catalogue can run (dataset present; fields present when the catalogue lists them). */
export function availableExamples(catalogue) {
  const have = new Map((catalogue?.datasets || []).map(d => [d.id, d]));
  return EXAMPLES.filter(e => { const d = have.get(e.d); return d && e.fields.every(f => !d.fields?.length || d.fields.some(x => x.name === f)); });
}
