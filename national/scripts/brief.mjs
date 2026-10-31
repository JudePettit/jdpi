// National Analysis's brief: the few fields Geopolitical Volatility shows for each country, so its page reads a small
// file instead of the whole index (0.77 MB). Written by build.mjs after index.json; run on its own to rebuild it from
// the committed index:  node national/scripts/brief.mjs
// Per country: iso3, the UN number (the world map's id), region, Wikidata item, government, political stability (World
// Bank WGI, −2.5 to 2.5) and the wars it is fighting this year (Realtime Battlefield: name, battle deaths, id).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function brief(index) {
  return {
    generated: index.generated, about: 'National Analysis fields used by Geopolitical Volatility (q/volatility.html); made from index.json.',
    countries: index.countries.map(c => ({
      iso3: c.iso3, num: c.num, region: c.region || null, qid: c.qid || null, government: c.government || null,
      pv: c.latest?.['GOV_WGI_PV.EST']?.[1] ?? null,
      wars: (c.conflict?.active2026 || []).map(({ name, deaths, id }) => ({ name, deaths: deaths || 0, id })),
    })),
  };
}

const DATA = new URL('../data/', import.meta.url);
export const writeBrief = index => writeFileSync(new URL('brief.json', DATA), JSON.stringify(brief(index)));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = JSON.parse(readFileSync(new URL('index.json', DATA), 'utf8'));
  writeBrief(index);
  console.log(`wrote national/data/brief.json for ${index.countries.length} countries`);
}
