// VM's crosswalk from a country's name, as VM's calendars spell it (calendar/scripts/countries.mjs), to its ISO 3166-1
// alpha-3 code (stage S5c). Names are matched to Natural Earth's names of today's countries (public domain; its countries
// and small states in omni/data/base), which carry the ISO3 Natural Earth gives them; the names below are those VM's
// calendars spell otherwise. A name of two states ("Soviet Union / Russia", the Retrospective's way of naming a state by
// its old and its present name) has no ISO3: which of the two an event belongs to is not recorded. A state that is not
// one of today's (the Soviet Union, Yugoslavia), a body that is no state (the European Union, the United Nations) and
// "International" have no ISO3 either.
// VM's own work: chosen by hand, each code checked against Natural Earth's own (tests/omni-now.test.mjs).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALIASES = {
  'United States': 'USA', 'Bosnia and Herzegovina': 'BIH', 'Dominican Republic': 'DOM', 'Saint Kitts and Nevis': 'KNA', 'Antigua and Barbuda': 'ATG',
  'DR Congo': 'COD', Congo: 'COG', 'Saint Vincent and the Grenadines': 'VCT', 'Central African Republic': 'CAF', 'The Gambia': 'GMB', 'Ivory Coast': 'CIV',
  'South Sudan': 'SSD', 'Vatican City': 'VAT', 'Equatorial Guinea': 'GNQ', 'São Tomé and Príncipe': 'STP', 'Marshall Islands': 'MHL', 'Solomon Islands': 'SLB',
  'Cape Verde': 'CPV', Eswatini: 'SWZ', 'Western Sahara': 'ESH', 'Czechia': 'CZE', 'Timor-Leste': 'TLS', Palestine: 'PSE', Micronesia: 'FSM', 'North Macedonia': 'MKD',
  'Greenland (Denmark)': 'GRL', 'Cayman Islands': 'CYM',
};

/** The resolver: name → ISO3 or null, from Natural Earth's countries and small states (features' n and iso3). */
export function isoResolver(neCountries) {
  const codes = new Set(neCountries.map(c => c.iso3).filter(Boolean));
  const byName = new Map(neCountries.filter(c => c.iso3).map(c => [c.n, c.iso3]));
  const one = n => (ALIASES[n] && codes.has(ALIASES[n]) ? ALIASES[n] : byName.get(n) || null);
  return name => {
    const n = String(name || '').trim();
    if (!n) return null;
    return /\s\/\s/.test(n) ? null : one(n);
  };
}

/** Natural Earth's countries and small states as omni/data/base holds them. */
export function neCountries(root = resolve(fileURLToPath(new URL('../..', import.meta.url)))) {
  const topo = JSON.parse(readFileSync(join(root, 'omni/data/base/countries.topo.json'), 'utf8'));
  const small = JSON.parse(readFileSync(join(root, 'omni/data/base/small-states.json'), 'utf8')).points;
  return [...topo.objects.countries.geometries.map(g => g.properties), ...small];
}
