// Page tests (they drive a browser) and site tests (they fetch the deployed site). PRP_PAGES=0 leaves both out, so a
// data workflow can test the files it is about to commit with the unit and data tests alone: no npm install, no
// browser and no network (`PRP_PAGES=0 node --test tests/<module>.test.mjs`). Pass `pageTest` as a test's options:
//   test('page: …', pageTest, async () => { const browser = await launch(); … });
// launch() loads playwright-core only when a page test runs. PRP_BROWSER picks another Playwright channel than
// Microsoft Edge (e.g. chrome; GitHub's Ubuntu runners have both).
// Every launch adds --enable-unsafe-swiftshader (PRP-SCHOLAR-USP-DESIGN.md S1): recent Chromium no longer falls back to
// its software renderer for WebGL without it, so a map drawn with WebGL (the Omni-Map's MapLibre GL JS) would have no
// WebGL in headless Edge or on GitHub's runners, which have no GPU. tests/omni.test.mjs fails loudly if WebGL is absent.
import assert from 'node:assert/strict';

export const pageTest = process.env.PRP_PAGES === '0' ? { skip: 'page and site tests are off (PRP_PAGES=0)' } : {};

export const SWIFTSHADER = '--enable-unsafe-swiftshader';
/** The options a page test launches its browser with: the channel, the options given, and the WebGL flag beside any
    flags given (--mute-audio, say). */
export function launchOptions(options = {}) {
  const args = [...(options.args || [])];
  if (!args.includes(SWIFTSHADER)) args.push(SWIFTSHADER);
  return { channel: process.env.PRP_BROWSER || 'msedge', ...options, args };
}

export async function launch(options = {}) {
  const { chromium } = await import('playwright-core');
  return chromium.launch(launchOptions(options));
}

// A real pointer on a period slider (design/prp-period.js). Its inputs take the pointer only at their thumbs, so a press
// a few pixels off the thumb starts no drag and the moves after it change nothing. Two things arrive after a page has
// drawn and move the control down: the return bar, and on some pages a strip drawn above the track once its data has
// loaded. A test that finds the thumb before they arrive and presses after loses its drag (26 November 2026: National's
// NA-05 review and Kardashev's movement check, each on a busy runner). So a test waits for settled() before it finds
// the thumb, and presses with pressThumb(), which says at once where the press landed if it missed.

/** Waits for the known late arrivals that move a page's controls: the load event (National's #map address, say, sits
    scrolled down to <svg id="map"> until its load handler scrolls back to the top), the fonts, and the return bar.
    design/prp-bar.js adds the bar to a page opened on its own (not in the shell's frame) after the load event, 800 ms
    and an idle callback with a limit of 3 s, in the page's flow, so it moves everything below it down by its height.
    The 15 s limit covers the whole wait, the load event included as well as the bar's delay after it, on a busy runner.
    `more` (page => a promise) waits for the page's own late arrival, National's strip, say. Not waited for: the Master
    Index linker (design/jdpi-entities.js, loaded by the bar), which starts 1.2 s after load and can add a mark after a
    linked name. No slider page has such a name above its slider today; if one ever does, pressThumb() fails at once
    and names what it hit. */
export async function settled(page, more) {
  await page.waitForFunction(() => document.readyState === 'complete' && (window.self !== window.top
    || !document.querySelector('script[src*="prp-bar.js"]') || !!document.querySelector('.jdpi-returnbar')), null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  if (more) await more(page);
}

/** Waits until the page has drawn `n` frames (two by default), so whatever it does at its next rendering in answer to
    a change it was just given has run: a ResizeObserver, an IntersectionObserver's first report, the work they ask for
    with requestAnimationFrame. A click or a key can be answered by a handler, and every wait for that answer can pass
    on its first check, before the page has drawn once; on a busy machine the test's next step can then arrive first
    (27 November 2026: Neo Book's pin, which AR Mode's opening sets and the page's next rendering marks as seen, held a
    scripted scroll made before that rendering and scrolled the page back). Frame work the page asks for in the first
    frame runs in the second, in the same frame as this wait's last callback, before the test's next command; work it
    asks for later (after a fetch, a timer) is not covered, and needs a wait of its own. A page that does not draw
    fails the wait by name after 10 s. */
export const drawn = (page, n = 2) => page.evaluate(n => new Promise((resolve, reject) => {
  const give = setTimeout(() => reject(new Error(`the page did not draw ${n} frames within 10 s`)), 10000);
  let left = n;
  const f = () => { if (--left > 0) requestAnimationFrame(f); else { clearTimeout(give); resolve(); } };
  requestAnimationFrame(f);
}), n);

/** Opens `url` in a new document, every time. A goto from a page to the same page with another hash is a same-document
    navigation: the old document reads the new hash, and a page that writes its address back in its own form
    (history.replaceState: Omni writes its recipe) can rewrite it, without the parts it could not read, before a reload
    that follows, which then opens the rewritten address (27 November 2026: Omni's note on an address naming year 0
    missing, the reload having opened the address with at=0 left out). about:blank first makes the goto a new document,
    which reads the address exactly as given, as a visitor's pasted address or bookmark is read. */
export async function openFresh(page, url, options = { waitUntil: 'domcontentloaded' }) {
  await page.goto('about:blank');
  return page.goto(url, options);
}

/** Moves the pointer to (x, y), checks that it is on the thumb of the input `input` (a selector), presses, and checks
    that the input took the press. A missed press fails here, naming what was under the pointer, and not later as a
    drag that changed nothing. The caller then makes its moves and releases. */
export async function pressThumb(page, input, x, y) {
  await page.mouse.move(x, y);
  const hit = await page.evaluate(([s, px, py]) => {
    const h = document.elementFromPoint(px, py);
    return h === document.querySelector(s) ? '' : h ? `${h.tagName.toLowerCase()}${h.id ? '#' + h.id : ''}${h.className && typeof h.className === 'string' ? '.' + h.className.trim().split(/\s+/).join('.') : ''}` : 'nothing';
  }, [input, x, y]);
  assert.equal(hit, '', `the press is aimed at ${input}'s thumb, but at (${Math.round(x)}, ${Math.round(y)}) the pointer is on ${hit}`);
  await page.mouse.down();
  assert.ok(await page.evaluate(s => document.querySelector(s).matches(':active'), input), `${input} took the press at (${Math.round(x)}, ${Math.round(y)})`);
}
