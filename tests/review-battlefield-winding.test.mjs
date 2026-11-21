// Reviewer's test (MP-11 free-data review, 20 November 2026): the Retrospective Battlefield draws Cliopatria's rows with
// d3, whose spherical paths read a ring's winding as which side is inside. A row wound the other way covers the whole
// globe less the country, and, filled, hides every row drawn under it. Seen at 1938, 1945 and 2019: most of the world
// missing, or one colour over the whole map. Every polity the page draws must cover less than half the sphere.
// Page test against JDPI_URL (npm run test:e2e -- tests/review-battlefield-winding.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTest, launch } from './tools/pages.mjs';

const BASE = (process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');

test('page: no shape on the Retrospective Battlefield map covers the whole globe (1938, 1945, 2019)', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const y of [1938, 1945, 2019]) {
      await page.goto(`${BASE}/battlefield/history/#y=${y}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForFunction(() => document.querySelectorAll('#map path').length > 20, null, { timeout: 30000 });
      const whole = await page.evaluate(() => [...document.querySelectorAll('#map path')]
        .filter(p => p.__data__?.type === 'Feature' && window.d3.geoArea(p.__data__) > 2 * Math.PI)
        .map(p => p.getAttribute('data-key') || p.__data__.properties?.row || '?'));
      assert.deepEqual(whole, [], `${y}: shapes drawn as the whole globe less themselves: ${whole.slice(0, 10).join(', ')}`);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
