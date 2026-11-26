// Build 7 of the ChatGPT review corrections (vm-workflows/chatgpt-taskmaster/CONFIRMED.md, 25 November 2026): National
// Analysis, the parts that go with the rebuilt data (national/lib/pestle.js, national/scripts/indicators.mjs and
// national/data, rebuilt by national/scripts/build.mjs, which writes years/ through years.mjs). Each test failed before
// its correction and passes after it. The page's own corrections are in tests/corrections-7.test.mjs.
//   pestle-3  overall pressure is the mean of the unrounded dimension shares, rounded once
//   pestle-5  SI.POV.DDAY is labelled with the World Bank's own line, $3.00 a day at 2021 prices
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const text = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('pestle-3 rule: overall pressure is the mean of the unrounded dimension shares, rounded once', async () => {
  const { scorePeriod, latestPick } = await import('../national/lib/pestle.js');
  // Made up: political 0 of 1 worsening, economic 2 of 3, social 2 of 3. The shares' mean is 4/9 = 0.4444…, so 44%;
  // the mean of the rounded shares (0 + 0.667 + 0.667) / 3 is 0.4447, rounded 0.445, which read 45%.
  const ind = (code, dimension) => ({ code, dimension, core: true, better: 'up', threshold: 0 });
  const inds = [ind('p1', 'political'), ind('e1', 'economic'), ind('e2', 'economic'), ind('e3', 'economic'), ind('s1', 'social'), ind('s2', 'social'), ind('s3', 'social')];
  const up = [[2000, 1], [2001, 2]], down = [[2000, 2], [2001, 1]];
  const s = { p1: up, e1: down, e2: down, e3: up, s1: down, s2: up, s3: down };
  const x = scorePeriod(s, latestPick, inds);
  assert.deepEqual([x.pressure.political, x.pressure.economic, x.pressure.social, x.pressure.legal, x.dims], [0, 0.667, 0.667, null, 3], 'each dimension still stored in thousandths');
  assert.equal(x.overall, 0.444);
  assert.equal(Math.round(x.overall * 100), 44);
  assert.equal(x.coverage, 1);
});

test('pestle-3 data: every yearly overall score in pressure.json is its shares\' mean rounded once', async () => {
  const { DIMENSIONS } = await import('../national/lib/pestle.js');
  const { INDICATORS } = await import('../national/scripts/indicators.mjs');
  const p = read('national/data/years/pressure.json');
  // A dimension's share is k/n with n its scored indicators (four at most): recovered exactly from its
  // thousandths, the mean of the exact shares, rounded once, is the stored overall.
  const most = Math.max(...DIMENSIONS.map(d => INDICATORS.filter(i => i.core && i.dimension === d).length));
  const exact = v => { for (let n = 1; n <= most; n++) { const k = Math.round((v / 1000) * n); if (Math.round((k / n) * 1000) === v) return k / n; } return null; };
  let cells = 0;
  for (const row of p.values) for (const c of row || []) {
    if (!c || c[0] == null) continue;
    const shares = c.slice(1, 7).filter(v => v != null).map(exact);
    if (shares.includes(null)) continue;
    assert.equal(c[0], Math.round((shares.reduce((a, b) => a + b, 0) / shares.length) * 1000), JSON.stringify(c));
    cells++;
  }
  assert.ok(cells > 9000, `${cells} scores checked`);
});

test('pestle-5: the poverty series carries the World Bank\'s own line, $3.00 a day at 2021 prices, in the code and the data', async () => {
  // The World Bank's indicator API (https://api.worldbank.org/v2/indicator/SI.POV.DDAY, read 25 November 2026) names
  // it "Poverty headcount ratio at $3.00 a day (2021 PPP) (% of population)".
  const LABEL = 'Extreme poverty ($3.00/day, 2021 PPP)';
  const { INDICATORS } = await import('../national/scripts/indicators.mjs');
  assert.equal(INDICATORS.find(i => i.code === 'SI.POV.DDAY').label, LABEL);
  assert.equal(read('national/data/index.json').indicators.find(i => i.code === 'SI.POV.DDAY').label, LABEL, 'index.json (the page reads its labels there): rebuild with national/scripts/build.mjs');
  const layer = read('national/data/years/manifest.json').layers.find(l => l.id === 'wb:SI.POV.DDAY');
  assert.equal(layer.title, LABEL);
  // Only the script's whole comment lines are set aside (its note of the old label); the JSON files are each one line,
  // with "https://" in them, so they are read whole.
  for (const f of ['national/scripts/indicators.mjs', 'national/data/index.json', 'national/data/years/manifest.json']) {
    const body = f.endsWith('.mjs') ? text(f).replace(/^\s*\/\/.*$/gm, '') : text(f);
    assert.doesNotMatch(body, /\$2\.15/, f);
  }
});
