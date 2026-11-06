// The shared piece that puts a page of Vitruvian Manager in a pane beside a page's main content (design/prp-split.js):
// the rules that run without a page. Kino's page tests (tests/kino.test.mjs) drive it in the browser, and Bibliotheca's
// pane is built on it too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frameMove, samePage, stripPage, clampShare, canFrame, findModule, SHELL_ROUTE } from '../design/prp-split.js';
import * as oldFrame from '../bibliotheca/neo/lib/frame.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const registry = JSON.parse(readFileSync(join(ROOT, 'registry.json'), 'utf8'));
const BASE = 'http://localhost:8787/';
const place = (module, page) => ({ module, page: new URL(page, BASE).href });

test('frameMove: moved from Bibliotheca unchanged, and the old path exports the same functions', () => {
  assert.equal(oldFrame.frameMove, frameMove);
  assert.equal(oldFrame.samePage, samePage);
  assert.equal(oldFrame.stripPage, stripPage);
  // Bibliotheca's cases, from their new home.
  assert.deepEqual(frameMove('http://x/encyclopedia/#Q1', 'http://x/encyclopedia/index.html#Q2'), { how: 'hash', url: 'http://x/encyclopedia/#Q2' }, 'the page\'s clean address is kept');
  assert.deepEqual(frameMove('http://x/encyclopedia/#Q1', 'http://x/encyclopedia/index.html#Q1'), { how: 'none' });
  assert.deepEqual(frameMove('about:blank', 'http://x/encyclopedia/index.html#Q1'), { how: 'load', url: 'http://x/encyclopedia/index.html#Q1' });
  assert.equal(frameMove(null, 'http://x/a.html').how, 'load');
  assert.equal(frameMove('http://x/q/calendar?period=history&month=1990-01', 'http://x/q/calendar.html?period=history&month=1991-01').how, 'load', 'a query reloads');
  assert.equal(frameMove('http://x/science/progress/#y=1527&f=1494', 'http://x/kardashev/index.html#y=1500').how, 'load');
  assert.equal(frameMove('https://hp-retrospective.pages.dev/#y=1946', 'https://hp-retrospective.pages.dev/#y=1950').how, 'hash');
  assert.equal(frameMove('http://x/encyclopedia/#Q1', 'http://x/encyclopedia/').how, 'load', 'dropping the hash is a navigation');
  // Kino's: War Focus from one month to the next moves by hash on the page's clean address.
  assert.deepEqual(frameMove('http://x/battlefield/focus/#war=ww2&m=1939-09', 'http://x/battlefield/focus/index.html#war=ww2&m=1940-05'), { how: 'hash', url: 'http://x/battlefield/focus/#war=ww2&m=1940-05' });
});

test('canFrame: the shell\'s own rule decides what a pane may frame', () => {
  // Pages on this site, and the two on other sites that are their submodule's own page, are framed.
  assert.deepEqual(canFrame(place('war-focus', 'battlefield/focus/index.html#war=ww2&m=1939-09'), registry, BASE), { ok: true });
  assert.deepEqual(canFrame(place('encyclopedia', 'encyclopedia/index.html#Q362'), registry, BASE), { ok: true });
  assert.deepEqual(canFrame(place('encyclopedia', 'encyclopedia/#Q362'), registry, BASE), { ok: true }, 'the clean address is the same page');
  assert.deepEqual(canFrame(place('atlas', 'https://political-atlas.pages.dev/#GBR'), registry, BASE), { ok: true });
  assert.deepEqual(canFrame(place('retrospective', 'https://hp-retrospective.pages.dev/#y=1946&c=200'), registry, BASE), { ok: true });
  assert.deepEqual(canFrame(place('pestle', 'q/national.html#country=GBR'), registry, BASE), { ok: true });
  assert.deepEqual(canFrame(place('historical-calendar', 'q/calendar.html?period=history&month=1989-11'), registry, BASE), { ok: true }, 'a query on the page is still the page');
  // A private page asks to sign in, which browsers do not allow inside another page.
  assert.ok(findModule(registry, 'tally-stick').module.opensInNewTab);
  assert.deepEqual(canFrame(place('tally-stick', 'https://trade-desk.judep92.workers.dev/tally/'), registry, BASE), { ok: false, why: 'private' });
  assert.deepEqual(canFrame(place('algo-trader', 'https://trade-desk.judep92.workers.dev/tally/algo/'), registry, BASE), { ok: false, why: 'private' });
  // An address off the submodule's own page, and a submodule the registry does not list.
  assert.deepEqual(canFrame(place('war-focus', 'q/national.html#country=GBR'), registry, BASE), { ok: false, why: 'elsewhere' });
  assert.deepEqual(canFrame(place('atlas', 'https://example.org/#GBR'), registry, BASE), { ok: false, why: 'elsewhere' });
  assert.deepEqual(canFrame(place('no-such-module', 'encyclopedia/index.html#Q1'), registry, BASE), { ok: false, why: 'unlisted' });
  assert.deepEqual(canFrame(null, registry, BASE), { ok: false, why: 'unlisted' });
  assert.deepEqual(canFrame(place('war-focus', 'battlefield/focus/index.html'), null, BASE), { ok: false, why: 'unlisted' }, 'no registry, nothing framed');
  // Aliases find their submodule, as the shell's do.
  const aliased = registry.suites.flatMap(s => s.modules).find(m => m.aliases?.length && m.url && !m.opensInNewTab);
  if (aliased) assert.deepEqual(canFrame(place(aliased.aliases[0], aliased.url), registry, BASE), { ok: true });
});

test('clampShare: the pane keeps its share inside its limits and both sides keep their least widths', () => {
  const kino = { min: 25, max: 60, minMain: 480, minSide: 328 };
  assert.equal(clampShare(40, 1300, kino), 40);
  assert.equal(clampShare(10, 1300, kino), 25.2, 'never under the pane\'s least width (328 of 1300 px)');
  assert.equal(clampShare(25, 2000, kino), 25);
  assert.equal(clampShare(90, 2000, kino), 60, 'never over the most');
  assert.equal(clampShare(60, 950, kino), 49.5, 'the film keeps 480 px');
  assert.equal(clampShare(40, 700, kino), 40.6, 'too narrow for both: they share it in proportion');
  assert.equal(clampShare(null, 1300, kino), 25.2, 'nothing saved: the least');
  assert.equal(clampShare('x', 0, kino), 25);
  const book = { min: 30, max: 60, minMain: 420, minSide: 380 };
  assert.equal(clampShare(44, 1340, book), 44);
  assert.equal(clampShare(70, 1340, book), 60);
});

test('the shell routes a pane passes on are the ones the shell accepts', () => {
  const shell = readFileSync(join(ROOT, 'shell.js'), 'utf8');
  assert.ok(shell.includes(`const SHELL_ROUTE = ${SHELL_ROUTE.toString()};`), 'the same pattern as shell.js');
  assert.match('#/rs/war-focus?at=http%3A%2F%2Flocalhost%2Fbattlefield%2Ffocus%2F%23war%3Dww2', SHELL_ROUTE);
  assert.doesNotMatch('#/rs/war-focus?at=x#y', SHELL_ROUTE);
});

test('the shell leaves full screen when it changes the frame in view, and lets its frames go full screen', () => {
  const shell = readFileSync(join(ROOT, 'shell.js'), 'utf8');
  assert.match(shell, /frame\.allow = 'clipboard-write; fullscreen'/);
  const route = shell.slice(shell.indexOf('function route()'), shell.indexOf('/* --- Search'));
  assert.match(route, /if \(document\.fullscreenElement && document\.fullscreenElement !== frame\) document\.exitFullscreen\(\)/);
});

test('prp-split.css is written against the design tokens only, and loading the module does nothing to a page', async () => {
  const css = readFileSync(join(ROOT, 'design/prp-split.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'no hex colours');
  assert.doesNotMatch(css, /\b(rgb|rgba|hsl|hsla)\(/i, 'no raw colours');
  for (const c of ['.prp-split', '.prp-split-bar', '.prp-side', '.prp-side-head', '.prp-side-frame', '.prp-side-card']) assert.ok(css.includes(c), c);
  assert.match(css, /\.prp-split-bar\s*\{[^}]*touch-action:\s*none/, 'a finger can drag the divider');
  assert.match(css, /\.prp-split\.dragging iframe\s*\{\s*pointer-events:\s*none/, 'the frames ignore the pointer while it is held');
  // Imported in Node, with no document: its pure parts work and nothing ran.
  const m = await import('../design/prp-split.js');
  assert.equal(typeof m.sidePane, 'function');
  assert.equal(typeof globalThis.document, 'undefined');
});
