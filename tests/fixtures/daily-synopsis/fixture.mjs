// Daily Synopsis's test fixture: Political Briefing stores for three made-up days, from made-up outlets, about made-up
// places (Ruritania, Freedonia, Syldavia and their neighbours, from fiction), with links to example.org. Nothing here is
// news: tests/daily-synopsis.test.mjs builds days from these stores, and make-fixture.mjs builds the fixture days the
// page shows with ?data=fixture, under a notice that says they are a test fixture.
export const DAYS = ['2026-11-16', '2026-11-17', '2026-11-18'];

// Two outlets a side, far left to far right; two with the caution flag, as the Briefing marks some.
export const OUTLETS = [
  ['fx-fl1', 'Example Far Left One', 'far_left'], ['fx-fl2', 'Example Far Left Two', 'far_left'],
  ['fx-l1', 'Example Left One', 'left'], ['fx-l2', 'Example Left Two', 'left'],
  ['fx-c1', 'Example Centre One', 'centre'], ['fx-c2', 'Example Centre Two', 'centre'],
  ['fx-r1', 'Example Right One', 'right'], ['fx-r2', 'Example Right Two', 'right', true],
  ['fx-fr1', 'Example Far Right One', 'far_right', true], ['fx-fr2', 'Example Far Right Two', 'far_right'],
].map(([id, name, position, caution]) => ({ id, name, position, country: 'Intl', caution: !!caution, active: true, reserve: false, status: 'ok', count: 40 }));

// Each day's stories: [outlet, hours before the store's refresh, headline, feed summary]. One summary names a person
// (Rudolf Rassendyll, from the same novel as Ruritania) whom only that one outlet carries: the check refuses his name.
export const STORIES = {
  '2026-11-16': [
    [['fx-fl1', 3, 'Grand Fenwick election: Mountjoy coalition loses its majority', 'Turnout was 71 per cent.'],
      ['fx-l1', 4, 'Grand Fenwick election ends Mountjoy coalition majority', ''],
      ['fx-c1', 5, 'Grand Fenwick election: Mountjoy coalition short of majority after count', 'The coalition won 9 of 20 seats.'],
      ['fx-r1', 6, 'Mountjoy coalition loses Grand Fenwick election majority', ''],
      ['fx-fr1', 7, 'Grand Fenwick voters end Mountjoy coalition majority', '']],
    [['fx-l2', 8, 'Elbonia rail strike halts trains for a second day', ''],
      ['fx-c2', 9, 'Elbonia rail strike: trains halted for second day', 'Unions want a 6 per cent rise.'],
      ['fx-r2', 10, 'Second day of Elbonia rail strike halts trains', '']],
  ],
  '2026-11-17': [
    [['fx-fl1', 3, 'Ruritania budget cuts hit Strelsau hospitals as parliament votes', 'The budget passed by 212 votes to 180.'],
      ['fx-l1', 4, 'Ruritania parliament passes austerity budget, cutting Strelsau hospital spending', ''],
      ['fx-c1', 5, 'Ruritania parliament passes 2027 budget by 212 votes to 180', 'The vote followed a two-day debate in Strelsau, opened by Rudolf Rassendyll.'],
      ['fx-c2', 6, 'Ruritania parliament approves 2027 budget after Strelsau debate', ''],
      ['fx-r1', 7, 'Ruritania parliament passes budget with tax cuts for small firms', 'Small firms pay 2 per cent less tax.'],
      ['fx-fr1', 8, 'Ruritania budget passes parliament: tax cuts for small firms win', '']],
    [['fx-l2', 9, 'Freedonia floods force 3,000 from homes along the Sylvan river', ''],
      ['fx-c1', 10, 'Freedonia floods: 3,000 evacuated as Sylvan river bursts banks', ''],
      ['fx-r2', 11, 'Sylvan river floods Freedonia towns, 3,000 evacuated', '']],
    [['fx-c2', 12, 'Syldavia and Borduria leaders meet at Klow summit on border trade', ''],
      ['fx-r1', 13, 'Syldavia Borduria summit in Klow ends with border trade deal', ''],
      ['fx-fr2', 14, 'Klow summit: Syldavia and Borduria sign border trade deal', '']],
  ],
  '2026-11-18': [
    [['fx-fl2', 3, 'Genovia port reopens after Pyrus harbour repairs', ''],
      ['fx-l1', 4, 'Pyrus harbour repairs done as Genovia port reopens', ''],
      ['fx-c1', 5, 'Genovia port reopens: Pyrus harbour repairs finished', ''],
      ['fx-r1', 6, 'Genovia reopens Pyrus harbour port after repairs', '']],
    [['fx-c1', 7, 'Latveria launches Doomstadt weather satellite', ''],
      ['fx-c2', 8, 'Doomstadt weather satellite launched by Latveria', ''],
      ['fx-fr1', 9, 'Latveria weather satellite lifts off from Doomstadt', '']],
  ],
};

const H = 36e5;
const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** The Political Briefing's store as it would be at 07:00 UTC on `day`: that day's stories, and plain filler around them
 *  so that the stories' own words are as rare as in a real week. */
export function fixtureStore(day) {
  const ref = Date.parse(`${day}T07:00:00Z`);
  const at = h => new Date(ref - h * H).toISOString();
  const items = STORIES[day].flat().map(([s, h, t, d]) => ({ s, t, u: `https://example.org/${s}/${slug(t)}`, p: at(h), d }));
  for (let k = 0; k < 300; k++) items.push({ s: OUTLETS[k % OUTLETS.length].id, t: `Zeta${k} meets omega${k}`, u: `https://example.org/filler/${day}/${k}`, p: at(2 + (k % 150)), d: '' });
  items.sort((a, b) => (a.p < b.p ? 1 : -1));
  return { generated: new Date(ref).toISOString(), keepDays: 7, perPosition: 2,
    positions: [['far_left', 'Far left'], ['left', 'Left'], ['centre', 'Centre'], ['right', 'Right'], ['far_right', 'Far right']].map(([key, label]) => ({ key, label })),
    sources: OUTLETS, items };
}
