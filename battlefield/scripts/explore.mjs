// One-off: list the deadliest conflicts in a UCDP candidate-events CSV, to draft the war groupings.
import { readFileSync } from 'node:fs';
import { parseCsv } from './csv.mjs';

const ev = parseCsv(readFileSync(process.argv[2], 'utf8'));
console.log('events', ev.length, 'months', [...new Set(ev.map(e => e.date_start.slice(0, 7)))].sort().join(' '));
const by = new Map();
for (const e of ev) {
  const k = e.conflict_new_id;
  const c = by.get(k) || by.set(k, { id: k, name: e.conflict_name, type: e.type_of_violence, deaths: 0, events: 0, countries: new Set() }).get(k);
  c.deaths += +e.best || 0; c.events++; c.countries.add(e.country);
}
const list = [...by.values()].sort((a, b) => b.deaths - a.deaths);
console.log('conflicts', list.length);
for (const c of list.slice(0, +process.argv[3] || 80)) console.log(c.id, c.type, c.deaths, c.events, '|', c.name, '|', [...c.countries].join('; '));
