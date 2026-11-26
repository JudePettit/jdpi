// Follow-on corrections to build 12 (26 November 2026): the OSINT Domains tab's wording on RDAP, and SIGINT leaving
// CelesTrak alone for 15 minutes after a failed answer.
//   PRP_PAGES=0 node --test tests/follow-intelligence.test.mjs
// The page test runs against a server: JDPI_URL=http://localhost:9312 node --test tests/follow-intelligence.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/* ---- OSINT Domains tab ------------------------------------------------------------------------------------------------
   IANA's RDAP bootstrap file (https://data.iana.org/rdap/dns.json, publication 2026-11-20T23:00:03Z, read 26 Nov 2026)
   has no entry for de, ie, be, it or ch, while uk, fr and com are there. DENIC runs an RDAP server (rdap.denic.de) that
   the file does not list, so "does not publish it" / "publishes no RDAP service" was wrong: the page can only say that
   the TLD has no RDAP server in IANA's bootstrap file, as the Overview tab now says. */
test('domains: a TLD missing from IANA’s bootstrap file is said to be missing from it, not to publish no RDAP', () => {
  const src = read('osint/tab-domains.js');
  assert.ok(!/publishes no RDAP service/.test(src), 'not "publishes no RDAP service"');
  assert.ok(!/does not publish it\$\{/.test(src), 'not ".de does not publish it"');
  assert.ok(!/Registries with no RDAP service/.test(src), 'the comment does not say the registries have no RDAP');
  assert.match(src, /has no RDAP server in IANA’s bootstrap file/);
  assert.match(src, /is not in IANA’s RDAP bootstrap file/);
  assert.match(src, /'No RDAP listed'/);
  // The overview's row says the same.
  assert.match(read('osint/tab-overview.js'), /have no RDAP server in IANA’s bootstrap file/);
});

/* After the second readers: IANA's file of 2026-11-20T23:00:03Z lists only a plain-HTTP address for kg
   (http://rdap.cctld.kg/) and mg (http://rdap.nic.mg/); all the page knows is that, so it says that, not that the
   registry "does not publish it securely". And when IANA's file could not be read, the answer is rdap.org's. */
test('domains: a plain-HTTP address in IANA’s file is said to be that, and rdap.org’s answer is said to be rdap.org’s', () => {
  const src = read('osint/tab-domains.js');
  assert.ok(!/does not publish it securely/.test(src), 'not "does not publish it securely"');
  assert.ok(!/publishes RDAP only over/.test(src), 'not "publishes RDAP only over an unencrypted connection"');
  assert.match(src, /'No HTTPS RDAP listed'/);
  assert.match(src, /has only a plain-HTTP RDAP address in IANA’s bootstrap file/);
  assert.match(src, /unsupported: true, via: 'rdap\.org'/);
  assert.match(src, /rdap\.org knows no RDAP server for/);
  assert.match(src, /IANA’s bootstrap file could not be read/);
});

/* ---- SIGINT: CelesTrak's GP data ----------------------------------------------------------------------------------------
   CelesTrak's usage policy (https://celestrak.org/usage-policy.php, 15 May 2026, updated 16 Nov 2026, read 26 Nov 2026):
   software should stop querying when it receives any answer other than HTTP 200, and after a 500 or 503 all requests
   should stop for at least 15 minutes. The page now leaves CelesTrak alone for 15 minutes after any failed download,
   kept in this browser's storage so that a reload or the Check button does not ask again. */
function fakeStorage({ blocked = false } = {}) {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { if (blocked) throw new Error('SecurityError: storage is blocked'); m.set(k, String(v)); }, removeItem: k => m.delete(k), clear: () => m.clear(), _m: m };
}
// The module keeps the pause in memory as well, and is imported once for the whole file, so each world starts a day
// after the last: a pause left by an earlier test has ended by then.
let epoch = Date.UTC(2026, 10, 26, 14, 2, 0);
async function withWorld(fn, { blocked = false } = {}) {
  const saved = { fetch: globalThis.fetch, ls: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), now: Date.now };
  const ls = fakeStorage({ blocked });
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
  epoch += 864e5;
  let now = epoch;
  Date.now = () => now;
  const calls = [];
  let reply = () => new Response('[]', { status: 200 });
  globalThis.fetch = async (url, opts) => { calls.push(String(url)); return reply(url, opts); };
  try {
    await fn({ ls, calls, setReply: f => { reply = f; }, advance: ms => { now += ms; }, now: () => now });
  } finally {
    globalThis.fetch = saved.fetch; Date.now = saved.now;
    if (saved.ls) Object.defineProperty(globalThis, 'localStorage', saved.ls); else delete globalThis.localStorage;
  }
}
const OMM = [{ OBJECT_NAME: 'METEOR-M2 3', NORAD_CAT_ID: 57166 }];
const ok = () => new Response(JSON.stringify(OMM), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('celestrak: after a 503 the page does not ask again for 15 minutes, even when forced (refresh)', async () => {
  const S = await import('../sigint/lib/sources.js');
  await withWorld(async w => {
    w.setReply(() => new Response('busy', { status: 503 }));
    await assert.rejects(S.loadGp('weather'), e => {
      assert.match(e.message, /HTTP 503/);
      assert.match(e.message, /will not ask CelesTrak again before \d\d:\d\d/);
      assert.equal(e.status, undefined, 'no status, so explainError shows the whole sentence');
      return true;
    });
    assert.equal(w.calls.length, 1);
    await assert.rejects(S.loadGp('stations'), /will not ask CelesTrak again/);
    await assert.rejects(S.loadGp('weather', { force: true }), /will not ask CelesTrak again/);
    assert.equal(w.calls.length, 1, 'no second request within 15 minutes, for any group, forced or not');
    const p = S.gpPause();
    assert.equal(p.until - p.at, 15 * 60e3);
    w.advance(14 * 60e3 + 59e3);
    await assert.rejects(S.loadGp('weather', { force: true }));
    assert.equal(w.calls.length, 1, 'still quiet at 14 min 59 s');
    w.advance(1e3);
    w.setReply(ok);
    const r = await S.loadGp('weather');
    assert.equal(w.calls.length, 2, 'asks again once the 15 minutes are over');
    assert.deepEqual(r.data, OMM);
    assert.equal(S.gpPause(), null, 'a good answer ends the pause');
  });
});

test('celestrak: a network failure or any answer other than 200 starts the pause; the pause outlives a reload', async () => {
  const S = await import('../sigint/lib/sources.js');
  for (const fail of [() => { throw new TypeError('Failed to fetch'); }, () => new Response('', { status: 403 }), () => new Response('', { status: 404 }), () => new Response('', { status: 500 })]) {
    await withWorld(async w => {
      w.setReply(fail);
      await assert.rejects(S.loadGp('amateur'));
      assert.ok(S.gpPause(), 'paused');
      // A reload starts the module afresh, but the pause is kept in this browser's storage.
      assert.ok([...w.ls._m.keys()].includes('prp.sigint.gpPausedUntil'));
      await assert.rejects(S.loadGp('amateur', { force: true }));
      assert.equal(w.calls.length, 1);
    });
  }
});

test('celestrak: during the pause the copy kept in this browser is shown, with its age and when CelesTrak will be asked again', async () => {
  const S = await import('../sigint/lib/sources.js');
  await withWorld(async w => {
    const t = w.now() - 7 * 3600e3;
    w.ls.setItem('prp.sigint.gp.weather', JSON.stringify({ t, data: OMM }));
    w.setReply(() => new Response('', { status: 500 }));
    const r1 = await S.loadGp('weather');
    assert.equal(w.calls.length, 1, 'the 7-hour-old copy is out of date, so CelesTrak is asked once');
    assert.deepEqual(r1.data, OMM);
    assert.equal(r1.at, t, 'the copy keeps its own time, so the page shows its true age');
    assert.equal(r1.stale, true);
    assert.equal(r1.retryAt, w.now() + 15 * 60e3);
    const r2 = await S.loadGp('weather', { force: true });
    assert.equal(w.calls.length, 1, 'refresh within the pause does not ask CelesTrak');
    assert.equal(r2.at, t);
    assert.equal(r2.paused, true);
    assert.match(r2.note, /will not ask CelesTrak again before \d\d:\d\d/);
  });
});

test('celestrak: a good answer is cached for six hours and starts no pause', async () => {
  const S = await import('../sigint/lib/sources.js');
  await withWorld(async w => {
    w.setReply(ok);
    await S.loadGp('weather');
    const r = await S.loadGp('weather');
    assert.equal(w.calls.length, 1);
    assert.equal(r.cached, true);
    assert.equal(S.gpPause(), null);
  });
});

/* ---- After the second readers -------------------------------------------------------------------------------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('celestrak: groups asked for together go one at a time, and a failure stops the rest (no duplicate request)', async () => {
  const S = await import('../sigint/lib/sources.js');
  await withWorld(async w => {
    w.setReply(() => new Response('busy', { status: 503 }));
    // The Satellites tab asks for three groups at once while the Overview check asks for 'weather'.
    const all = await Promise.allSettled([S.loadGp('weather'), S.loadGp('stations'), S.loadGp('amateur'), S.loadGp('weather')]);
    assert.deepEqual(all.map(r => r.status), ['rejected', 'rejected', 'rejected', 'rejected']);
    assert.equal(w.calls.length, 1, 'one request in all');
    for (const r of all) assert.match(r.reason.message, /will not ask CelesTrak again before/);
  });
});

test('celestrak: a good answer that comes back after a failure does not end the pause the failure started', async () => {
  const S = await import('../sigint/lib/sources.js');
  await withWorld(async w => {
    // weather answers 503 slowly; stations and amateur would answer 200 sooner.
    w.setReply(async url => /GROUP=weather/.test(url) ? (await sleep(50), new Response('busy', { status: 503 })) : ok());
    const all = await Promise.allSettled([S.loadGp('weather'), S.loadGp('stations'), S.loadGp('amateur')]);
    assert.equal(all[0].status, 'rejected');
    assert.ok(S.gpPause(), 'still paused after the batch');
    const n = w.calls.length;
    await assert.rejects(S.loadGp('weather', { force: true }));
    assert.equal(w.calls.length, n, 'the next request waits for the pause');
  });
  await withWorld(async w => {
    // Another tab starts a pause while this tab's request is out; this tab's good answer leaves it in place.
    w.setReply(() => { w.ls.setItem('prp.sigint.gpPausedUntil', JSON.stringify({ at: w.now(), until: w.now() + 15 * 60e3, why: 'Server answered HTTP 503', status: 503 })); return ok(); });
    await S.loadGp('weather');
    assert.ok(S.gpPause(), 'the other tab’s pause is kept');
    await assert.rejects(S.loadGp('stations'));
    assert.equal(w.calls.length, 1);
  });
});

test('celestrak: the pause holds within the page when this browser blocks storage', async () => {
  const S = await import('../sigint/lib/sources.js');
  await withWorld(async w => {
    w.setReply(() => new Response('busy', { status: 503 }));
    await assert.rejects(S.loadGp('weather'), /will not ask CelesTrak again/);
    assert.ok(S.gpPause(), 'paused although nothing could be stored');
    await assert.rejects(S.loadGp('weather', { force: true }), /will not ask CelesTrak again/);
    await assert.rejects(S.loadGp('amateur'));
    assert.equal(w.calls.length, 1, 'no second request after the 503');
    w.advance(15 * 60e3);
    w.setReply(ok);
    await S.loadGp('weather');
    assert.equal(w.calls.length, 2);
    assert.equal(S.gpPause(), null);
  }, { blocked: true });
});

test('celestrak: a stored pause ending more than 15 minutes ahead (the clock was ahead) is not trusted', async () => {
  const S = await import('../sigint/lib/sources.js');
  await withWorld(async w => {
    w.ls.setItem('prp.sigint.gpPausedUntil', JSON.stringify({ at: w.now() + 2 * 3600e3, until: w.now() + 2 * 3600e3 + 15 * 60e3, why: 'Server answered HTTP 503', status: 503 }));
    assert.equal(S.gpPause(), null);
    w.setReply(ok);
    await S.loadGp('weather');
    assert.equal(w.calls.length, 1);
  });
});

test('celestrak: a reply that is not JSON is called an unexpected reply, not a parser message', async () => {
  const S = await import('../sigint/lib/sources.js');
  await withWorld(async w => {
    w.setReply(() => new Response('No GP data found', { status: 200, headers: { 'Content-Type': 'text/plain' } }));
    await assert.rejects(S.loadGp('weather'), e => {
      assert.match(e.message, /^Unexpected reply from CelesTrak at \d\d:\d\d, so this page will not ask CelesTrak again before \d\d:\d\d$/);
      assert.ok(!/JSON/.test(e.message));
      return true;
    });
    assert.ok(S.gpPause());
  });
});

test('sigint page: the Refresh note says CelesTrak is left alone for 15 minutes after a failed download', () => {
  const html = read('sigint/index.html');
  const refresh = html.match(/<p><b>Refresh\.<\/b>[^\n]*<\/p>/)?.[0] || '';
  assert.match(refresh, /orbital elements at most every 6 hours/);
  assert.match(refresh, /15 minutes/);
  assert.match(refresh, /even if you reload the page or press Check/);
  assert.match(refresh, /href="https:\/\/celestrak\.org\/usage-policy\.php"/);
  // The policy asks for the 15 minutes after a server error (500 or 503); for other answers it asks software to stop
  // and report to a person, so the note does not credit every 15-minute pause to it.
  assert.match(refresh, /CelesTrak’s usage policy<\/a> asks for at least that after a server error\)/);
  assert.ok(!/usage policy<\/a> asks;/.test(refresh));
});

const PAGE = process.env.JDPI_URL;

/* ---- SIGINT in Edge: CelesTrak answers 503; neither Check nor a reload asks it again ---- */
test('page: SIGINT asks CelesTrak once after a 503, says when it will ask again, and a reload or Check does not ask', { skip: !PAGE && 'set JDPI_URL to run the page test' }, async () => {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'msedge', args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const base = new URL(PAGE).origin;
    let asked = 0;
    await page.route(u => new URL(u).origin !== base, r => {
      if (/celestrak\.org/.test(r.request().url())) { asked++; return r.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'busy' }); }
      return /cdn\.jsdelivr\.net|unpkg\.com|cdnjs/.test(r.request().url()) ? r.continue() : r.abort();
    });
    const checked = () => page.waitForFunction(() => /^Checked/.test(document.querySelector('#feeds-checked')?.textContent || ''), null, { timeout: 60000 });
    const detail = () => page.evaluate(() => window.prpSigint.status.get('celestrak')?.detail || '');
    await page.goto(`${base}/sigint/index.html#tab=overview`, { waitUntil: 'domcontentloaded' });
    await checked();
    assert.equal(asked, 1);
    assert.match(await detail(), /^Server answered HTTP 503 at \d\d:\d\d, so this page will not ask CelesTrak again before \d\d:\d\d\.$/);
    await page.evaluate(() => { document.querySelector('#feeds-checked').textContent = ''; });
    await page.click('#check-all');
    await checked();
    assert.equal(asked, 1, 'pressing Check does not ask CelesTrak within the 15 minutes');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await checked();
    assert.equal(asked, 1, 'a reload does not ask CelesTrak within the 15 minutes');
    assert.match(await detail(), /will not ask CelesTrak again before/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

/* ---- The Domains tab in Edge, with IANA's file and the registries answered locally ---- */
test('page: the Domains tab says a TLD missing from IANA’s bootstrap file is missing from it', { skip: !PAGE && 'set JDPI_URL to run the page test' }, async () => {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'msedge', args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const base = new URL(PAGE).origin;
    // A bootstrap file in IANA's shape: com is listed, test only at a plain-HTTP address, de not at all.
    const boot = { version: '1.0', publication: '2026-11-20T23:00:03Z', services: [[['com'], ['https://rdap.verisign.com/com/v1/']], [['test'], ['http://rdap.example.test/']]] };
    await page.route(u => new URL(u).origin !== base, r => (/data\.iana\.org\/rdap\/dns\.json/.test(r.request().url())
      ? r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify(boot) })
      : r.abort()));
    await page.goto(base + '/osint/index.html#tab=domains&q=denic.de', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /registration details can/.test(document.querySelector('#dom-rdap .body')?.textContent || ''));
    const body = await page.textContent('#dom-rdap .body'), kpis = await page.textContent('#dom-kpis');
    assert.match(body, /The registry for \.de has no RDAP server in IANA’s bootstrap file/);
    assert.ok(!/publishes no RDAP/.test(body));
    assert.match(kpis, /No RDAP listed/);
    assert.match(kpis, /\.de is not in IANA’s RDAP bootstrap file/);
    assert.ok(!/does not publish it/.test(kpis));
    await page.fill('#dom-form [name=domain]', 'example.test');
    await page.click('#dom-form [type=submit]');
    await page.waitForFunction(() => /plain-HTTP RDAP address/.test(document.querySelector('#dom-rdap .body')?.textContent || ''));
    const body2 = await page.textContent('#dom-rdap .body'), kpis2 = await page.textContent('#dom-kpis');
    assert.match(body2, /The registry for \.test has only a plain-HTTP RDAP address in IANA’s bootstrap file, which browsers block on this page/);
    assert.ok(!/publishes RDAP only over/.test(body2));
    assert.match(kpis2, /No HTTPS RDAP listed/);
    assert.match(kpis2, /\.test has only a plain-HTTP RDAP address in IANA’s bootstrap file/);
    assert.ok(!/does not publish it securely/.test(kpis2));
    await page.close();

    // IANA's file cannot be read, so the lookup asks rdap.org, which knows no RDAP server for .de.
    const p2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    p2.on('pageerror', e => errors.push(e.message));
    await p2.route(u => new URL(u).origin !== base, r => (/^https:\/\/rdap\.org\/domain\//.test(r.request().url())
      ? r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }, body: 'No RDAP service found for this domain' })
      : r.abort()));
    await p2.goto(base + '/osint/index.html#tab=domains&q=denic.de', { waitUntil: 'domcontentloaded' });
    await p2.waitForFunction(() => /registration details can/.test(document.querySelector('#dom-rdap .body')?.textContent || ''));
    const body3 = await p2.textContent('#dom-rdap .body'), kpis3 = await p2.textContent('#dom-kpis');
    assert.match(body3, /rdap\.org knows no RDAP server for \.de \(IANA’s bootstrap file could not be read\)/);
    assert.ok(!/in IANA’s bootstrap file,/.test(body3), 'does not say what IANA’s file holds when it was not read');
    assert.match(kpis3, /rdap\.org knows no RDAP server for \.de/);
    assert.ok(!/is not in IANA’s RDAP bootstrap file/.test(kpis3));
    await p2.close();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
