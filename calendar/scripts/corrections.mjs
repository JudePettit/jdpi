// Corrections to the calendar's news events (Wikipedia's "Portal:Current events", current-events.mjs), applied after
// eventsFromItems. Each is keyed by the portal's day and the event's source article, so it reaches only the item it was
// written for, and names the sources that it follows. A correction that no longer finds its item (the portal line was
// rewritten or removed) changes nothing and is reported by the build.
//   - set: the fields to replace on that event (country, title, summary, type …); the rest stays as the portal gave it.
//   - add: an item the portal lists that the classifier does not take; `text` is a pattern that the item's words must
//     match, and the event keeps the item's own words as its summary and the report it cites, as any news event does.
//     It is not added when an event from that item is already there (the classifier took it after all).
// (ChatGPT's page reviews, 25 November 2026: front-pages-13, front-pages-14 and front-pages-17, and the second readers.)
const wiki = t => `https://en.wikipedia.org/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;

export const CORRECTIONS = [
  {
    // The board accepted the resignation on 11 November, effective at once; Nvidia announced it on 12 November, the day
    // the portal lists it (the calendar dates the news by its day). The country is Nvidia's own: the story's only
    // country word is "Chinese", in the suspected agent's description, which filed it under China. His reinstatement on
    // 23 November closes the summary: the calendar has no type for a company's reinstating its chief executive, and it
    // is neither an inauguration nor a swearing-in, so it is not an event of its own.
    date: '2026-11-12', source: wiki('Jensen Huang'),
    set: {
      country: 'United States',
      title: 'Nvidia announces the resignation of Jensen Huang as president and chief executive, effective 11 November',
      summary: 'Nvidia announces that its board accepted the resignation of Jensen Huang as president, chief executive and a director on 11 November, effective immediately, following reports of two extramarital affairs, one of them with a woman initially suspected of being a Chinese intelligence agent. Chief financial officer Colette Kress becomes interim chief executive. On 23 November Nvidia announced that its board had reinstated him as president, chief executive and a director.',
    },
    sources: ['Wikipedia, "Jensen Huang" (read 25 and 26 November 2026)', 'Wikipedia, "Portal:Current events/2026 November 12"'],
  },
  {
    // The portal's heading is the story's ("Protests against Donald Trump"); the item is about arrests at protests in
    // the Philippines against a Pax Silica deal with the United States, so the title is the item's own words.
    date: '2026-11-15', source: wiki('Protests against Donald Trump'),
    set: {
      title: 'Philippine police arrest at least 287 people during nationwide protests against the potential signing of a Pax Silica deal with the United States',
    },
    sources: ['Wikipedia, "Portal:Current events/2026 November 15" (read 26 November 2026)'],
  },
  {
    // The portal's line says "interim president"; he is president (Wikipedia, "Pedro Alliana"). That the term he
    // completes ends in August 2028 is the Political Atlas's, which the summary names.
    date: '2026-11-06', source: wiki('Pedro Alliana'),
    set: {
      title: 'Vice-President Pedro Alliana is sworn in as president of Paraguay, to complete the term to 2028',
      summary: 'Vice-President Pedro Alliana is sworn in as president of Paraguay after Congress removes Santiago Peña from office, to complete the term, which ends in August 2028. Political Atlas, checked 25 November 2026.',
    },
    sources: ['Wikipedia, "Pedro Alliana" (read 25 and 26 November 2026)', 'Political Atlas, Paraguay (data/countries/south-america.json, checked 25 November 2026)'],
  },
];

const wikiOf = t => (t ? wiki(t) : null);

/**
 * The events with the corrections applied: { events, unused }. `items` are the parsed portal items (parseDay), from
 * which an added event takes its words and its report; `unused` lists the corrections that found nothing.
 */
export function applyCorrections(events, items = [], corrections = CORRECTIONS) {
  const out = events.map(e => ({ ...e }));
  const unused = [];
  for (const c of corrections) {
    if (c.set) {
      const hits = out.filter(e => e.date === c.date && e.source === c.source);
      if (!hits.length) { unused.push(c); continue; }
      for (const e of hits) Object.assign(e, c.set);
    } else if (c.add) {
      const item = items.find(i => i.date === c.date && c.add.text.test(i.text));
      if (!item) { unused.push(c); continue; }
      // Already there: added before, or taken from the same portal item by the classifier (its summary is the item's).
      if (out.some(e => e.date === c.date && (e.title === c.add.title || e.summary === item.text))) continue;
      const ref = (item.refs || []).find(r => !/wikipedia\.org/.test(r.url));
      out.push(Object.fromEntries(Object.entries({
        date: c.date, country: c.add.country, title: c.add.title, type: c.add.type, status: 'declared',
        source: c.source || wikiOf(item.links?.[0]?.target), summary: item.text, ref: ref?.url, refName: ref?.outlet || undefined,
      }).filter(([, v]) => v != null && v !== '')));
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return { events: out, unused };
}
