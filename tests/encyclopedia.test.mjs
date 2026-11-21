// Master Index: the entity layer it reads (the committed lake/data, which lake-refresh tests before committing), then
// the Boolean tag Explorer, entity pages with links into modules, and the cross-suite linker (pages, against JDPI_URL,
// default live; PRP_PAGES=0 leaves them out).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';
import { THINKERS } from '../lake/scripts/thinkers.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

test('data: the entity layer is complete, consistent, and every entity is in its shard', () => {
  const m = read('lake/data/manifest.json'), index = read('lake/data/index.json'), keys = read('lake/data/keys.json');
  // Floors against a collapse (the build compares with the last build itself): about 12,000 entities and 16,800
  // mentions in October 2026, of which the Retrospective alone gives 7,900, and every module some.
  assert.ok(m.entities >= 10000 && m.mentions >= 12000, `${m.entities} entities, ${m.mentions} mentions`);
  for (const [module, n] of Object.entries(m.modules)) assert.ok(n > 0, `no mentions from ${module}`);
  assert.equal(index.rows.length, m.entities, 'index rows');
  assert.equal(Object.values(m.types).reduce((a, b) => a + b, 0), m.entities, 'types');
  const entities = new Map();
  for (let i = 0; i < m.shards.entities; i++) for (const [q, r] of Object.entries(read(`lake/data/e/${i}.json`))) {
    assert.equal(+q.slice(1) % m.shards.entities, i, `${q} is in shard ${i}`);
    entities.set(q, r);
  }
  assert.equal(entities.size, m.entities, 'entities in the shards');
  for (const r of index.rows) assert.ok(entities.has(r[0]), `index row ${r[0]}`);
  for (let i = 0; i < m.shards.titles; i++) for (const [t, q] of Object.entries(read(`lake/data/t/${i}.json`))) assert.ok(entities.has(q), `${t} → ${q}`);
  for (const [k, q] of Object.entries(keys)) assert.ok(entities.has(q), `${k} → ${q}`);
  // Investor Impersonator's members of Congress have entries (129 now): they need the Bioguide IDs in traders/data.
  assert.ok(Object.keys(keys).filter(k => k.startsWith('congress:')).length >= 50, 'members of Congress');
  // 98% of the entities with an article have its summary; a failed fetch is tried again by the next build.
  const withArticle = [...entities.values()].filter(r => r.wiki);
  assert.ok(withArticle.filter(r => r.summary).length >= withArticle.length * 0.9, 'summaries');
});

// The hand-made labels (the canon review's table D3 and Jude's choices of 18 November 2026, ledger MI-12): a school is
// "School", an ideology "Ideology", a field "Field", and the line from left to right "Political position", with the
// Political Briefing's five positions only, each VM's own placement until a source is found, and saying so.
const lakeAll = () => { const m = read('lake/data/manifest.json'), all = []; for (let i = 0; i < m.shards.entities; i++) all.push(...Object.values(read(`lake/data/e/${i}.json`))); return all; };
const position = r => (r.tags || []).filter(t => t.startsWith('Political position:')).map(t => t.slice(19));
const FIVE = ['Far left', 'Left', 'Centre', 'Right', 'Far right'];

test('data: no tag is in "School or tag" or "Political spectrum", none says "Sui generis", and every position is one of the five, with its note', () => {
  const all = lakeAll(), index = read('lake/data/index.json');
  const old = t => /^(School or tag|Political spectrum):/.test(t) || /sui generis/i.test(t);
  assert.deepEqual(index.tags.filter(old), [], 'the index');
  assert.deepEqual(all.flatMap(r => (r.tags || []).filter(old).map(t => `${r.label}: ${t}`)), [], 'the records');
  assert.deepEqual(all.flatMap(r => position(r).filter(p => !FIVE.includes(p)).map(p => `${r.label}: ${p}`)), [], 'every position is one of the five');
  assert.deepEqual(index.tags.filter(t => /:Centre right$/i.test(t)), [], '"Centre right" is the value of no group');
  // Every position is VM's own placement today, and the record and the index say so (lake/scripts/thinkers.mjs POSITION_NOTE).
  const placed = all.filter(r => position(r).length);
  assert.ok(placed.length >= 50, `${placed.length} placed`);
  for (const r of placed) for (const p of position(r)) assert.match(r.tn?.[`Political position:${p}`] || '', /^VM’s own placement, by the unit of the Politics course that teaches it/, `${r.label}: ${p} carries its note`);
  const tagId = new Map(index.tags.map((t, i) => [t, i]));
  for (const r of placed) for (const p of position(r)) assert.equal(index.notes.texts[index.notes.at[r.q]?.[tagId.get(`Political position:${p}`)]], r.tn[`Political position:${p}`], `${r.label}: the index carries the note`);
  for (const [q, tags] of Object.entries(index.notes.at)) for (const id of Object.keys(tags)) assert.ok(all.find(r => r.q === q)?.tags.includes(index.tags[id]), `${q}: a note on a tag it carries`);
});

test('data: the Realists carry their school and its branch and no position; three unsourced Wikidata statements are not shown', () => {
  const all = lakeAll(), byQ = new Map(all.map(r => [r.q, r])), byLabel = new Map(all.map(r => [r.label, r]));
  const realists = all.filter(r => r.tags.includes('School:Realism'));
  assert.ok(realists.length >= 10, `${realists.length} realists`);
  for (const r of realists) assert.deepEqual(position(r), [], `${r.label}: ${position(r)}`);
  for (const name of ['John Mearsheimer', 'Kenneth Waltz', 'Hans Morgenthau', 'Thucydides', 'Henry Kissinger', 'E. H. Carr', 'Niccolò Machiavelli']) assert.ok(realists.some(r => r.label === name), `${name} carries School: Realism`);
  const m = byQ.get('Q461830');
  assert.equal(m.label, 'John Mearsheimer');
  for (const t of ['School:Realism', 'School:Offensive realism', 'School:Neorealism (structural realism)', 'Field:International relations']) assert.ok(m.tags.includes(t), t);
  assert.deepEqual(position(m), []);
  // build.mjs HIDDEN_STATEMENTS, read on Wikidata on 18 November 2026: Mearsheimer's "democratic socialism" rests on a
  // video id, Putin's "Machiavellianism" on The Prince and a student-essay page, Rousseau's "Baroque music" on nothing.
  assert.ok(!m.tags.includes('Ideology:Democratic socialism') && !(m.rel.Ideology || []).some(([q]) => q === 'Q189280'), 'Mearsheimer: no democratic socialism');
  const putin = byQ.get('Q7747'), rousseau = byQ.get('Q6527');
  assert.ok(putin && !putin.tags.includes('Ideology:Machiavellianism') && !(putin.rel.Ideology || []).some(([q]) => q === 'Q472246'), 'Putin: no Machiavellianism');
  assert.ok(rousseau && !rousseau.tags.includes('Movement:Baroque music') && !(rousseau.rel.Movement || []).some(([q]) => q === 'Q8361'), 'Rousseau: no Baroque music');
  // The realist schools themselves, and their critics' schools.
  assert.ok(byQ.get('Q471183').tags.includes('School:Realism') && !position(byQ.get('Q471183')).length, 'Realism (Q471183)');
  assert.ok(byQ.get('Q3054672').tags.includes('School:Realism') && !position(byQ.get('Q3054672')).length, 'offensive realism (Q3054672)');
  for (const [name, school] of [['Robert Keohane', 'Liberal institutionalism'], ['Joseph Nye', 'Liberal institutionalism'], ['Alexander Wendt', 'Constructivism']]) assert.ok(byLabel.get(name).tags.includes(`School:${school}`), name);
});

// The fixer's pass (18 November 2026). A hand-made value is shown once: the entry card shows no group names, so the same
// word in two groups reads as one chip twice (Mearsheimer had "Offensive realism" as a School and as Wikidata's Field).
// And each school's entry carries its own School value, so a filter on a school finds the school with its thinkers.
test('data: no hand-made value is shown twice on an entry, and each school\'s entry carries its own School', () => {
  const all = lakeAll(), byQ = new Map(all.map(r => [r.q, r]));
  const word = v => v.toLowerCase().replace(/[\s\-–]+/g, ' ').trim(), HAND = ['School', 'Ideology', 'Field', 'Theory'];
  const byWiki = new Map(all.filter(r => r.wiki).map(r => [r.wiki, r]));
  const twice = [];
  for (const [title, , tags] of THINKERS) {
    const r = byWiki.get(title);
    if (!r) continue;
    // Each hand-made value of the row, and the groups the entry shows its word in (two Wikidata groups repeating each
    // other are Wikidata's and not tested here). A party of the same name is another thing: De Gasperi's party, Christian
    // Democracy, beside his ideology, Christian democracy.
    for (const h of tags.filter(t => HAND.includes(t.slice(0, t.indexOf(':'))))) {
      const v = word(h.slice(h.indexOf(':') + 1));
      const gs = r.tags.filter(t => /^(School|Ideology|Field|Theory|Movement):/.test(t) && word(t.slice(t.indexOf(':') + 1)) === v);
      if (gs.length > 1) twice.push(`${r.label}: ${gs.join(' and ')}`);
    }
  }
  assert.deepEqual(twice, []);
  const m = byQ.get('Q461830');
  assert.ok(m.tags.includes('School:Offensive realism') && !m.tags.includes('Field:Offensive realism'), 'Mearsheimer: Offensive realism once, as a School');
  for (const [q, school] of [['Q83937', 'Keynesian economics'], ['Q3054672', 'Offensive realism'], ['Q471183', 'Realism']]) assert.ok(byQ.get(q)?.tags.includes(`School:${school}`), `${q} carries School:${school}`);
  for (const [name, school] of [['Austrian school', 'Austrian school'], ['Chicago school of economics', 'Chicago school of economics'], ['monetarism', 'Monetarism']]) {
    const r = all.find(x => x.label === name);
    assert.ok(r?.tags.includes(`School:${school}`), `${name} carries School:${school}`);
  }
});

// Wikidata relabelled political economist (Q1227195) "Master’s Degree in Economics" on 13 November 2026, after its English
// label was removed on the 10th; build.mjs LABEL_OVERRIDES keeps the name its statements meant.
test('data: the economists\' occupation reads "Political economist", not a degree', () => {
  const all = lakeAll(), byQ = new Map(all.map(r => [r.q, r]));
  assert.deepEqual(all.filter(r => r.tags.some(t => /^Occupation:Master.s Degree in Economics$/.test(t))).map(r => r.label), []);
  const ricardo = byQ.get('Q160270');
  assert.ok(ricardo.tags.includes('Occupation:Political economist'), 'Ricardo');
  assert.ok((ricardo.rel.Occupation || []).some(([q, l]) => q === 'Q1227195' && l === 'political economist'), 'Ricardo: the related occupation by its name');
});

// Review D1 (21 November 2026): two English labels on Wikidata that their own items contradict, read that day. Q3366745,
// the PSOE's federation in the Community of Madrid, is labelled "Vox" in English (its Spanish label and English
// description still say PSOE), which tagged Pedro Sánchez "Member of:Vox"; Lázaro Cárdenas (Q296718) is labelled
// "Lázaro Cárdenas segundo" in English, though his Spanish and multilingual labels are "Lázaro Cárdenas". LABEL_OVERRIDES
// in build.mjs keeps the names the items mean, for an entry's own label as for a related one's.
test('data: the PSOE’s Madrid federation is not "Vox", and Lázaro Cárdenas is not "segundo"', () => {
  const all = lakeAll(), byQ = new Map(all.map(r => [r.q, r]));
  const sanchez = byQ.get('Q6070218');
  assert.ok(sanchez, 'Pedro Sánchez is in the lake');
  assert.ok(!sanchez.tags.includes('Member of:Vox'), 'Pedro Sánchez is no member of Vox');
  for (const [, l] of Object.values(sanchez.rel || {}).flat().filter(([q]) => q === 'Q3366745')) assert.equal(l, 'Spanish Socialist Workers\' Party of the Community of Madrid');
  const cardenas = byQ.get('Q296718');
  assert.ok(cardenas, 'Lázaro Cárdenas is in the lake');
  assert.equal(cardenas.label, 'Lázaro Cárdenas');
  assert.deepEqual(all.filter(r => /Cárdenas segundo/.test(r.label + JSON.stringify(r.rel || {}) + r.tags.join('|'))).map(r => r.q), []);
});

test('data: the mainstream right is on the line; its thinkers and schools carry "Right", and no realist or other position does', () => {
  const all = lakeAll(), byLabel = new Map(all.map(r => [r.label, r]));
  for (const name of ['Edmund Burke', 'Michael Oakeshott', 'Friedrich Hayek', 'Milton Friedman', 'Robert Nozick', 'Russell Kirk', 'William F. Buckley Jr.',
    'Roger Scruton', 'Benjamin Disraeli', 'Margaret Thatcher', 'Ronald Reagan', 'conservatism', 'classical liberalism', 'one-nation conservatism']) {
    const r = byLabel.get(name);
    assert.ok(r, `${name} is in the lake`);
    assert.deepEqual(position(r), ['Right'], `${name}: ${position(r)}`);
    assert.ok(r.tags.includes('Appears in:Learning · Politics'), name);
  }
  for (const name of ['Edmund Burke', 'Michael Oakeshott', 'Roger Scruton', 'Margaret Thatcher', 'Ronald Reagan']) assert.ok(byLabel.get(name).tags.includes('Ideology:Conservatism'), `${name}: Conservatism`);
  for (const name of ['Friedrich Hayek', 'Milton Friedman']) assert.ok(byLabel.get(name).tags.includes('Ideology:Classical liberalism'), `${name}: Classical liberalism`);
  for (const r of all.filter(r => position(r).includes('Right'))) assert.ok(!r.tags.includes('School:Realism'), `${r.label} is no realist`);
  for (const name of ['John Rawls', 'Clement Attlee', 'Tony Blair', 'Christian democracy', 'neoliberalism']) assert.ok(!position(byLabel.get(name)).includes('Right'), name);
  // A thinker with a place on the line keeps that place only (Marx is named in the left's and the centre's lessons).
  assert.deepEqual(position(byLabel.get('Karl Marx')), ['Far left']);
  assert.deepEqual(position(byLabel.get('Nazism')), ['Far right']);
});

test('data: no scholar or critic of a movement carries its position; the members keep their places; the former labels are in their new groups', () => {
  const all = lakeAll(), byLabel = new Map(all.map(r => [r.label, r]));
  for (const name of ['Cas Mudde', 'Robert Paxton', 'Roger Griffin']) {
    const r = byLabel.get(name);
    assert.ok(r && r.tags.includes('Appears in:Learning · Politics'), `${name} is in the lake, taught in Politics`);
    assert.deepEqual(position(r), [], `${name}: ${position(r)}`);
  }
  // Beveridge is the left's (the centre names his report only in a quiz), Mill the centre's, Deng the far left's, and
  // the Christian democrats the centre's, where the course teaches them, so "Centre right" has gone.
  for (const [name, p] of [['William Beveridge', 'Left'], ['John Stuart Mill', 'Centre'], ['Deng Xiaoping', 'Far left'], ['Konrad Adenauer', 'Centre'],
    ['Ludwig Erhard', 'Centre'], ['Christian democracy', 'Centre'], ['Benito Mussolini', 'Far right'], ['Jean-Marie Le Pen', 'Far right'], ['fascism', 'Far right']]) assert.deepEqual(position(byLabel.get(name)), [p], name);
  // Former values, as table D3 maps them.
  for (const [name, tags] of [
    ['Robert Paxton', ['Field:Fascism studies']], ['Roger Griffin', ['Field:Fascism studies', 'Field:Political science']], ['Cas Mudde', ['Field:Far-right politics', 'Field:Political science']],
    ['John Maynard Keynes', ['School:Keynesian economics']], ['Milton Friedman', ['School:Chicago school of economics', 'School:Monetarism']], ['Ludwig von Mises', ['School:Austrian school']],
    ['Robert Lucas', ['School:New classical macroeconomics']], ['Eugene Fama', ['Theory:Efficient-market hypothesis']], ['Ronald Coase', ['Field:Law and economics']],
    ['Karl Marx', ['Ideology:Marxism', 'Ideology:Communism', 'Ideology:Socialism', 'Occupation:Economist']], ['Adolf Hitler', ['Ideology:Nazism', 'Ideology:Fascism']],
    ['Kenneth Waltz', ['School:Neorealism (structural realism)', 'School:Defensive realism']], ['Hans Morgenthau', ['School:Classical realism', 'Field:Political science']],
  ]) for (const t of tags) assert.ok(byLabel.get(name)?.tags.includes(t), `${name}: ${t}`);
  // An occupation or office the entry already carries, under Occupation or Role, is not given again under the other.
  for (const r of all.filter(r => r.tags.includes('Appears in:Learning · Politics') || r.tags.includes('Appears in:Learning · Finance & Economics'))) {
    for (const v of ['Head of state', 'Head of government', 'Economist', 'Philosopher', 'Historian', 'Diplomat', 'Journalist', 'Sociologist'])
      if (r.tags.includes(`Occupation:${v}`) && r.tags.includes(`Role:${v}`)) assert.ok(r.mentions.some(m => m.m === 'retrospective') && /^(Head of state|Head of government)$/.test(v), `${r.label}: ${v} twice`);
  }
  assert.ok(byLabel.get('Franklin Delano Roosevelt').tags.includes('Role:Head of state'), 'Roosevelt: head of state, which the Retrospective does not give him');
});

test('page: the facets name the groups in the discipline\'s words, and the search box\'s example is one', () => {
  const src = readFileSync(new URL('../encyclopedia/index.html', import.meta.url), 'utf8');
  const order = JSON.parse(src.match(/const FACET_ORDER = (\[[^\]]+\]);/)[1].replace(/'/g, '"'));
  for (const g of ['School', 'Political position', 'Ideology', 'Theory', 'Field']) assert.ok(order.includes(g), g);
  for (const g of ['School or tag', 'Political spectrum']) assert.ok(!order.includes(g), g);
  assert.ok(order.indexOf('School') < order.indexOf('Political position') && order.indexOf('Political position') < order.indexOf('Occupation'), 'the hand-made groups come first');
  assert.match(src, /const openFacets = new Set\(\['Type', 'Nationality', 'Role', 'School'\]\);/);
  const example = src.match(/id="query" placeholder='([^']+)'/)[1];
  assert.equal(example, 'Realism + "Offensive realism" + American');
  // Each of its terms is a tag the data holds.
  const values = new Set(read('lake/data/index.json').tags.map(t => t.slice(t.indexOf(':') + 1).toLowerCase()));
  for (const term of ['Realism', 'Offensive realism', 'American']) assert.ok(values.has(term.toLowerCase()), term);
});

// The four types of 21 November 2026 (choice 6 of the job): a reader sees them as "Polity", "Period", "Site" and
// "Series", and where the page explains its types each has one plain sentence saying what it holds.
const TYPE_SENTENCES = { Polity: 'A state that no longer exists.', Period: 'A named span of history.', Site: 'An archaeological site, a monument or a building of historical note.',
  Series: 'A grouping of other entries, such as a series of wars or the events of one year.' };
test('page: the four new types each have one plain sentence, in the method and as the entry\'s note; no other type is renamed', async () => {
  const src = readFileSync(new URL('../encyclopedia/index.html', import.meta.url), 'utf8');
  const notes = JSON.parse(src.match(/const TYPE_NOTE = (\{[^}]+\});/)[1].replace(/'/g, '"').replace(/(\w+):/g, '"$1":'));
  assert.deepEqual(notes, TYPE_SENTENCES);
  const method = src.match(/<p><b>Method\.<\/b>[\s\S]*?<\/p>/)[0];
  assert.match(method, /a polity is a state that no longer exists; a period, a named span of history; a site, an archaeological site, a monument or a building of historical note; a series, a grouping of other entries/);
  const { TYPE_NAMES } = await import('../lake/scripts/types.mjs');
  assert.deepEqual(['polity', 'period', 'site', 'series'].map(t => TYPE_NAMES[t]), Object.keys(TYPE_SENTENCES), 'the names the page explains are the tags\' names');
});

test('a polity\'s entry says what a polity is, and the Type filter lists only the types the data holds, each new one explained', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/encyclopedia/index.html#Q12560`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#entity .ehead h2', { timeout: 30000 });
    assert.equal(await page.textContent('#entity .ehead .prp-label'), 'Polity');
    assert.equal(await page.textContent('#entity .ehead .tdef'), TYPE_SENTENCES.Polity);
    await page.goto(`${BASE}/encyclopedia/index.html#explore`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#facets .facet button[data-toggle="Type"]', { timeout: 30000 });
    const facet = page.locator('.facet', { has: page.locator('button[data-toggle="Type"]') });
    const shown = await facet.locator('.opt span').allInnerTexts();
    const counts = read('lake/data/manifest.json').types;
    const { TYPE_NAMES } = await import('../lake/scripts/types.mjs');
    assert.deepEqual([...shown].sort(), Object.entries(counts).filter(([, n]) => n > 0).map(([t]) => TYPE_NAMES[t]).sort(), 'every type with entries, and no empty one');
    const note = await facet.locator('.fnote').innerText();
    for (const [name, sentence] of Object.entries(TYPE_SENTENCES)) if (shown.includes(name)) assert.ok(note.includes(`${name}: ${sentence.replace(/^./, c => c.toLowerCase())}`), `${name} is explained: ${note}`);
    assert.equal(await facet.locator('.opt span', { hasText: /^Polity$/ }).getAttribute('title'), TYPE_SENTENCES.Polity);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a position shows that it is VM\'s own placement, on the entry and in the filter\'s heading', pageTest, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/encyclopedia/index.html#explore?q=${encodeURIComponent('"Political position:Right"')}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#rows .name a', { timeout: 30000 });
    const heading = await page.locator('.facet', { has: page.locator('button[data-toggle="Political position"]') }).innerText();
    const row = await page.locator('#rows tr', { hasText: 'Friedrich Hayek' }).innerText();
    await page.goto(`${BASE}/encyclopedia/index.html#Q1325`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#entity .tags .chip', { timeout: 15000 });
    const tags = await page.locator('#entity .tags').innerText();
    assert.match(heading, /VM’s own placement, by the unit of the Politics course that teaches it; no source is cited for it yet/);
    assert.match(row, /Right[\s\S]*VM’s own placement/);
    assert.match(tags, /Right\s*VM’s own placement, by the unit of the Politics course that teaches it; no source is cited for it yet/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('a Boolean tag query finds John Mearsheimer, and his page links to where he appears', pageTest, async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/encyclopedia/index.html#explore`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#rows tr td', { timeout: 30000 });
  const total = await page.locator('#count').innerText();
  await page.fill('#query', 'Realism + "Neorealism (structural realism)" + American + "Political science"');
  await page.waitForTimeout(600);
  const names = await page.locator('#rows .name a').allInnerTexts();
  const err = await page.locator('#qerr').isVisible();
  // NOT and OR
  await page.fill('#query', 'Realism - "Offensive realism"');
  await page.waitForTimeout(600);
  const withoutOffensive = await page.locator('#rows .name a').allInnerTexts();
  await page.fill('#query', '"Austrian school" | "Chicago school of economics"');
  await page.waitForTimeout(600);
  const either = await page.locator('#rows .name a').allInnerTexts();
  // Facet filter (Excel-style)
  await page.fill('#query', '');
  await page.locator('.facet button[data-toggle="Type"]').count();
  await page.goto(`${BASE}/encyclopedia/index.html#explore?q=${encodeURIComponent('Realism + "Neorealism (structural realism)" + American + "Political science"')}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#rows .name a');
  await page.locator('#rows .name a', { hasText: 'Mearsheimer' }).click();
  await page.waitForSelector('.ment a', { timeout: 15000 });
  const entity = await page.locator('#entity').innerText();
  const links = await page.locator('.ment a').evaluateAll(as => as.map(a => a.getAttribute('href')));
  await browser.close();
  assert.match(total, /\d/);
  assert.ok(names.some(n => /Mearsheimer/.test(n)), `results: ${names.join(', ')}`);
  assert.ok(names.some(n => /Waltz|Walt/.test(n)), 'other structural realists also match');
  assert.equal(err, false);
  assert.ok(!withoutOffensive.some(n => /Mearsheimer/.test(n)) && withoutOffensive.some(n => /Morgenthau/.test(n)), 'NOT excludes offensive realists');
  assert.ok(either.some(n => /Hayek|Mises/.test(n)) && either.some(n => /Friedman/.test(n)), 'OR combines schools');
  assert.match(entity, /appears in vitruvian manager/i);
  assert.ok(links.some(h => /learning\.html\?course=politics/.test(decodeURIComponent(h))), 'links to the Politics lesson');
  assert.deepEqual(errors, []);
});

test('other modules link names into the Master Index', pageTest, async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  await page.goto(`${BASE}/q/calendar?period=2020s&month=2022-02`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.eventrow', { timeout: 20000 });
  // Badges arrive shard by shard as the linker resolves titles; wait for several rather than the first.
  await page.waitForFunction(() => document.querySelectorAll('a.jdpi-ency').length >= 3, null, { timeout: 15000 }).catch(() => {});
  const n = await page.locator('a.jdpi-ency').count();
  const href = await page.locator('a.jdpi-ency').first().getAttribute('href');
  await browser.close();
  assert.ok(n >= 3, `badges: ${n}`);
  assert.match(href, /encyclopedia\/index\.html#Q\d+/);
});
