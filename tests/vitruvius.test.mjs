// Vitruvius, VM's mascot (25 November 2026, the owner's HD-11): the pictures an AI image model drew of him, made ready
// for the web by design/scripts/vitruvius-art.mjs (design/vitruvius/, listed in its index.json), the mark, favicon,
// loading figure and app icons made from them by design/scripts/render-icons.mjs, the registry's "mark" (each module)
// and "art" (each submodule, beside its glyph "icon", which stays as the fallback), and the credit that says an AI
// model drew him. The unit tests read files; the page tests (pageTest) look at the shell at JDPI_URL.
//   node --test tests/vitruvius.test.mjs                 (PRP_PAGES=0 for the file tests alone)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { pageTest, launch } from './tools/pages.mjs';
import { PICTURES, WEIGHT, CREDIT } from '../design/scripts/vitruvius-art.mjs';

const ROOT = new URL('../', import.meta.url);
const BASE = (process.env.PRP_URL || process.env.JDPI_URL || 'https://jdpi.pages.dev').replace(/\/$/, '');
const read = p => readFileSync(new URL(p, ROOT), 'utf8');
const bytes = p => readFileSync(new URL(p, ROOT));
const exists = p => existsSync(new URL(p, ROOT));
const registry = JSON.parse(read('registry.json'));
const index = JSON.parse(read('design/vitruvius/index.json'));
const subs = registry.suites.flatMap(s => s.modules);
// The submodules whose pictures were not usable (six arms; tools that read as a shield and a dagger): their glyph stays.
const GLYPH_ONLY = ['kardashev', 'historical-calendar'];
const SENTENCE = "Vitruvius, VM's mascot, was drawn by an AI image model (ChatGPT) from VM's own description; no person drew or retouched the pictures. He is a new character, not a copy of Leonardo's drawing.";

// A WebP's width and height, from its header (lossy, lossless, or extended with alpha).
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4) + buf.toString('ascii', 8, 12), 'RIFFWEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  throw new Error('not a WebP: ' + kind);
}
const pngSize = buf => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

test('pictures: every one is in index.json at both sizes, square, under its weight, with words for its alt text and the AI model named', () => {
  assert.equal(index.about, SENTENCE);
  assert.equal(CREDIT, SENTENCE);
  assert.match(index.madeBy, /AI image model \(ChatGPT\)/);
  assert.match(index.madeBy, /No person drew or retouched it/);
  assert.deepEqual(index.pictures.map(p => p.id).sort(), PICTURES.map(p => p.id).sort(), 'index.json lists what the script makes');
  for (const p of index.pictures) {
    assert.ok(p.alt && p.alt.length >= 20 && /Vitruvi/.test(p.alt), `${p.id}: says what it shows`);
    assert.equal(p.madeBy, index.madeBy, `${p.id}: says an AI model made it`);
    if (p.kind === 'strip') {
      const [w, h] = webpSize(bytes(p.files.strip));
      assert.deepEqual([w, h], [p.frameWidth * p.frames, p.height], `${p.id}: ${p.frames} frames in one row`);
      continue;
    }
    // The modules' and submodules' logos have a 128 px copy too (40 to 64 px places on sharp screens: the review of
    // 25 November 2026 found the 256 px one asked for there).
    for (const size of ['module', 'submodule'].includes(p.kind) ? [64, 128, 256] : [64, 256]) {
      const f = p.files[size];
      assert.ok(f && exists(f), `${p.id}: ${size} px file`);
      assert.match(f, new RegExp(`^design/vitruvius/(future/)?${p.id}-${size}\\.webp$`));
      const buf = bytes(f);
      assert.deepEqual(webpSize(buf), [size, size], `${f}: ${size} × ${size}`);
      assert.ok(buf.length <= WEIGHT[size], `${f}: ${buf.length} bytes, over ${WEIGHT[size]}`);
      assert.equal(p.bytes[size], buf.length, `${f}: index.json has its weight`);
    }
  }
  // The mark's 512 px copy (the app icons) and the favicon's PNG.
  const mark = index.pictures.find(p => p.id === 'mark'), head = index.pictures.find(p => p.id === 'mark-head');
  assert.deepEqual(webpSize(bytes(mark.files[512])), [512, 512]);
  assert.ok(bytes(mark.files[512]).length <= WEIGHT[512]);
  assert.deepEqual(pngSize(bytes(head.files['64png'])), [64, 64]);
  // No file in design/vitruvius that index.json does not list (and its page and the future shell's note).
  const listed = new Set(index.pictures.flatMap(p => Object.values(p.files)));
  for (const dir of ['design/vitruvius', 'design/vitruvius/future']) for (const f of readdirSync(new URL(dir + '/', ROOT))) {
    const path = `${dir}/${f}`;
    if (statSync(new URL(path, ROOT)).isDirectory() || ['index.json', 'index.html', 'README.md'].includes(f)) continue;
    assert.ok(listed.has(path), `${path} is not in index.json`);
  }
});

test('registry: every module has a mark and every submodule a picture beside its glyph, each a file listed in index.json', () => {
  const listed = new Map(index.pictures.filter(p => p.files[64]).map(p => [p.files[64], p]));
  for (const s of registry.suites) {
    assert.ok(s.mark, `${s.id}: a mark`);
    assert.ok(exists(s.mark), `${s.id}: ${s.mark} exists`);
    assert.equal(listed.get(s.mark)?.kind, 'module', `${s.id}: its mark is its module's picture in index.json`);
    assert.equal(listed.get(s.mark)?.for, s.id);
    if (s.figure) { assert.ok(exists(s.figure), `${s.id}: ${s.figure}`); assert.ok(index.pictures.some(p => p.files[256] === s.figure), `${s.id}: its figure is in index.json`); }
  }
  for (const m of subs) {
    assert.ok(typeof m.icon === 'string' && [...m.icon].length === 1, `${m.id}: keeps its one glyph, the fallback`);
    if (GLYPH_ONLY.includes(m.id)) { assert.equal(m.art, undefined, `${m.id}: no usable picture, so the glyph alone`); continue; }
    assert.ok(m.art && exists(m.art), `${m.id}: its picture ${m.art}`);
    assert.equal(listed.get(m.art)?.kind, 'submodule', `${m.id}: ${m.art} is a submodule picture in index.json`);
    assert.equal(listed.get(m.art)?.for, m.id);
    // The key order: the picture right after the glyph it stands beside.
    const keys = Object.keys(m);
    assert.equal(keys[keys.indexOf('icon') + 1], 'art', `${m.id}: "art" follows "icon"`);
  }
});

test('the future shell\'s four logos are stored, with their note, and nothing shows them yet', () => {
  const future = index.pictures.filter(p => p.kind === 'future');
  assert.deepEqual(future.map(p => p.for).sort(), ['history', 'master-index', 'military', 'politics']);
  for (const p of future) for (const size of [64, 256]) assert.match(p.files[size], /^design\/vitruvius\/future\//);
  const note = read('design/vitruvius/future/README.md');
  for (const words of ['Politics', 'History', 'Military', 'Master Index', 'not shown']) assert.ok(note.includes(words), `the note names ${words}`);
  // Nothing the site serves names them: no page, script, stylesheet, manifest or the registry (index.json, which lists
  // every picture, and the scripts and tests that make and check them are the exceptions).
  const skip = /^(node_modules|\.git|tests|design\/scripts|design\/vitruvius|lake|political-atlas)(\/|$)/;
  const found = [];
  const walk = dir => {
    for (const f of readdirSync(new URL(dir || './', ROOT))) {
      const path = dir ? `${dir}/${f}` : f;
      if (skip.test(path)) continue;
      const st = statSync(new URL(path, ROOT));
      if (st.isDirectory()) walk(path);
      else if (/\.(html|js|mjs|css|json|svg|webmanifest)$/.test(f) && st.size < 3e6 && /vitruvius\/future|future-(politics|history|military|master-index)-\d+\.webp/.test(read(path))) found.push(path);
    }
  };
  walk('');
  assert.deepEqual(found, []);
});

test('the mark, favicon and loading figure are Vitruvius, not the old stick figure; no page shows it', () => {
  for (const [file, box] of [['design/brand-vm.svg', '0 0 256 256'], ['design/brand-vm-icon.svg', '0 0 32 32']]) {
    const svg = read(file);
    assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"`), file);
    assert.match(svg, /<title id="[\w-]+">Vitruvian Manager<\/title>/, file);
    assert.match(svg, /<image [^>]*href="data:image\/(webp|png);base64,[A-Za-z0-9+/=]{1000,}"/, `${file}: the picture, embedded`);
    assert.ok(!/<path|<circle/.test(svg), `${file}: no stick figure drawn in lines`);
    assert.ok(svg.includes(SENTENCE), `${file}: the credit in its description`);
  }
  // The pages: none names the old figures (Omni News's monocled variant was one, design/brand-hb*.svg).
  const pages = [];
  const walk = dir => {
    for (const f of readdirSync(new URL(dir || './', ROOT))) {
      const path = dir ? `${dir}/${f}` : f;
      if (/^(node_modules|\.git|tests|lake|political-atlas)(\/|$)/.test(path)) continue;
      const st = statSync(new URL(path, ROOT));
      if (st.isDirectory()) walk(path); else if (/\.(html|css|js)$/.test(f) && st.size < 3e6) pages.push(path);
    }
  };
  walk('');
  const old = pages.filter(p => /brand-hb(-icon)?\.svg/.test(read(p)));
  assert.deepEqual(old, [], 'no page shows the old figure');
  assert.ok(!/brand-hb/.test(read('registry.json')), 'nor the registry');
  assert.ok(pages.length > 30);
});

test('the loading figure: Vitruvius running, from the running frames, under 60 KB, and still with reduced motion', () => {
  const svg = read('design/vm-loading.svg');
  assert.ok(Buffer.byteLength(svg) < 60 * 1024, `${Buffer.byteLength(svg)} bytes`);
  assert.match(svg, /<title id="vml-title">Loading<\/title>/);
  assert.match(svg, /<image class="vml-run" [^>]*href="data:image\/webp;base64,/, 'the running strip, embedded');
  const strip = index.pictures.find(p => p.id === 'runner-frames');
  assert.ok(svg.includes(bytes(strip.files.strip).toString('base64')), 'the strip index.json lists');
  assert.match(svg, new RegExp(`steps\\(${strip.frames}\\)`), 'one frame at a time');
  // Every class that animates is stopped by the reduced-motion rule.
  const style = svg.match(/<style>([\s\S]*?)<\/style>/)[1];
  const animated = [...style.replace(/@media[\s\S]*$/, '').matchAll(/\.([\w-]+)\{[^}]*animation:/g)].map(m => m[1]);
  assert.ok(animated.length >= 2, 'the runner and the road');
  const reduced = style.match(/@media \(prefers-reduced-motion:reduce\)\{([^{]+)\{animation:none\}\}/);
  assert.ok(reduced, 'a reduced-motion rule');
  for (const c of animated) assert.ok(reduced[1].split(',').map(s => s.trim()).includes(`.${c}`), `.${c} stops with reduced motion`);
  for (const c of svg.matchAll(/class="([\w-]+)"/g)) assert.match(c[1], /^vml-/, 'classes carry the vml- prefix (the copy is inlined)');
});

test('the credit: one plain sentence, in the README, on the shell and on the pictures\' own page', () => {
  assert.ok(read('README.md').includes(SENTENCE), 'README.md');
  assert.ok(read('shell.js').includes('design/vitruvius/index.json') || read('shell.js').includes(SENTENCE), 'the shell shows it');
  const page = read('design/vitruvius/index.html');
  assert.ok(page.includes(SENTENCE), 'design/vitruvius/index.html');
  assert.match(page, /<link rel="icon" href="\.\.\/brand-vm-icon\.svg"/);
  // The AI model's own machine-readable label (Content Credentials, C2PA) is not kept in the WebP files: the page says
  // so, and index.json is the machine-readable record instead.
  assert.match(page, /Content Credentials/);
  assert.match(page, /index\.json/);
  assert.match(index.provenance, /Content Credentials \(C2PA\)/);
  // The mark's description does not read as though JDP-Iq drew him.
  for (const file of ['design/brand-vm.svg', 'design/brand-vm-icon.svg']) assert.ok(!/, by JDP-Iq:/.test(read(file)), file);
  // Kino: the credit is in the module card itself (a short link to the pictures' page, the sentence as its title), not
  // in the floating credit box, which covered the card's text and button and sat under the Play button.
  const stage = read('kino/lib/stage.js');
  assert.ok(!/this\.credit\.innerHTML = `<span class="kn-vit">/.test(stage), 'not in the credit box');
  assert.match(stage, /class="vit"[^`]*title="\$\{esc\(VITRUVIUS_CREDIT\)\}"[^`]*>Drawn by AI</);
  assert.match(stage, /const MONTHS = \['Jan', 'Feb', 'Mar',/);
});

test('weights: the sidebar mark embeds the 256 px picture, not the 512 px one (it is shown at 40 px)', () => {
  const svg = read('design/brand-vm.svg'), mark = index.pictures.find(p => p.id === 'mark');
  assert.ok(svg.includes(bytes(mark.files[256]).toString('base64')), 'mark-256 embedded');
  assert.ok(!svg.includes(bytes(mark.files[512]).toString('base64').slice(0, 2000)), 'not mark-512');
  assert.ok(Buffer.byteLength(svg) < 26000, `${Buffer.byteLength(svg)} bytes`);
});

test('the running strip: one whole figure to a frame, nothing of a neighbour in it, all on one foot line', pageTest, async () => {
  const strip = index.pictures.find(p => p.id === 'runner-frames');
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const p = await browser.newPage();
    const r = await p.evaluate(async ([src, n, fw, h]) => {
      const im = new Image(); im.src = src; await im.decode();
      const c = document.createElement('canvas'); c.width = fw * n; c.height = h;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data, a = (cx, cy) => d[(cy * c.width + cx) * 4 + 3];
      const out = [];
      for (let f = 0; f < n; f++) {
        // The two outermost columns of each frame are clear (no limb reaches the frame's side or comes in from the next).
        let side = 0;
        for (let y = 0; y < h; y++) for (const cx of [f * fw, f * fw + 1, f * fw + fw - 2, f * fw + fw - 1]) side = Math.max(side, a(cx, y));
        // The lowest row with something solid in it: his lowest foot.
        let foot = -1;
        for (let y = h - 1; y >= 0 && foot < 0; y--) for (let cx = f * fw; cx < f * fw + fw; cx++) if (a(cx, y) > 128) { foot = y; break; }
        out.push({ side, foot });
      }
      return out;
    }, [`data:image/webp;base64,${bytes(strip.files.strip).toString('base64')}`, strip.frames, strip.frameWidth, strip.height]);
    for (const [i, f] of r.entries()) assert.ok(f.side <= 24, `frame ${i}: its sides are clear (${f.side})`);
    const feet = r.map(f => f.foot);
    assert.ok(Math.max(...feet) - Math.min(...feet) <= 2, `one foot line: ${feet}`);
  } finally { await browser.close(); }
});

test('the shell and Kino draw the picture with a fixed size and the glyph behind it', () => {
  const js = read('shell.js');
  // One helper draws every submodule's picture: width and height, lazy off screen, async decoding, empty alt (the name
  // is beside it) and the glyph, shown when there is no picture or it fails to load.
  assert.match(js, /const artIcon = /);
  assert.match(js, /width="\$\{size\}" height="\$\{size\}"/);
  assert.match(js, /decoding="async"/);
  assert.match(js, /class="glyph"/);
  assert.ok(!/\$\{esc\(m\.icon\)\}/.test(js.replace(/const artIcon[\s\S]*?\n\S/, '')), 'no glyph drawn outside the helper');
  assert.match(read('shell.css'), /\.has-art > \.glyph \{ display: none; \}/);
  assert.match(read('kino/lib/stage.js'), /info\.art/);
  assert.match(read('kino/kino.js'), /art: m\?\.art/);
});

/* ---- Pages ------------------------------------------------------------------------------------------------------- */
// The review of 25 November 2026: at 18 to 28 px every picture is the same figure in the same circle (only the tool he
// holds differs, and that is a few pixels), so a reader could not tell the items apart. Since then a picture is drawn
// only where it is 40 px or more; the sidebar, the Home boxes' rows and the Dashboard button keep the glyphs.
test('page: glyphs where the pictures would be too small to tell apart (sidebar, Home rows); the pictures at 40 px and more, and the glyph when one fails', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    // One picture is made to fail: Volatility's (at each of its sizes).
    await p.route('**/design/vitruvius/submodule-volatility-*.webp', r => r.fulfill({ status: 404, body: '' }));
    await p.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
    // The sidebar: each submodule's glyph, 18 px, and no picture; no module mark beside the codes.
    const nav = await p.$$eval('#nav a.nav-item[data-route*="/"] .icon', els => els.map(e => ({ route: e.closest('a').dataset.route, img: !!e.querySelector('img'),
      glyph: e.querySelector('.glyph')?.textContent, glyphShown: getComputedStyle(e.querySelector('.glyph')).display !== 'none', box: Math.round(e.getBoundingClientRect().width) })));
    assert.equal(nav.length, subs.length);
    for (const n of nav) {
      const m = subs.find(x => x.id === n.route.split('/')[1]);
      assert.deepEqual([n.img, n.glyph, n.glyphShown, n.box], [false, m.icon, true, 18], m.id);
    }
    assert.equal(await p.locator('#nav img').count(), 0, 'no picture in the sidebar\'s list');
    // The Home page: each module's mark in its box at 40 px, 64 px on an ordinary screen and 128 px on a sharp one
    // (never the 256 px file); the submodules in each box as glyphs; the Dashboard button its glyph.
    const marks = await p.$$eval('#view .mod img.suite-mark', imgs => imgs.map(i => [i.closest('.mod').dataset.suite, i.getAttribute('src'), i.getAttribute('width'), i.getAttribute('srcset'), i.getAttribute('sizes'), i.alt, i.complete && i.naturalWidth > 0]));
    assert.deepEqual(marks, registry.suites.filter(s => s.id !== 'home').map(s => [s.id, s.mark, '40', `${s.mark} 64w, ${s.mark.replace('-64.', '-128.')} 128w`, '40px', '', true]));
    assert.equal(await p.locator('#view .mod-subs img, #view .home-dash img').count(), 0);
    assert.equal((await p.$$eval('#view .mod-subs .glyph', g => g.map(e => e.textContent))).length, subs.filter(m => !registry.suites[0].modules.includes(m)).length);
    // The credit, on the Home page and in the sidebar's foot.
    assert.ok((await p.textContent('#view .footer')).includes(SENTENCE), 'the Home page\'s footer');
    assert.equal(await p.getAttribute('#legal a.credit', 'href'), 'design/vitruvius/index.html');
    // The Dashboard: no mark beside the headings (22 px); each tile's picture at 44 px, round; the two without a
    // picture, and the one that failed, show their glyph in the same round medallion.
    await p.goto(`${BASE}/#/home/dashboard`, { waitUntil: 'networkidle' });
    assert.equal(await p.locator('#view .group-head img').count(), 0);
    // Volatility's tile loads lazily: bring it into view and wait for its picture to fail and give way.
    await p.evaluate(() => document.querySelector('#view .tile img[src*="submodule-volatility"]')?.scrollIntoView());
    await p.waitForFunction(() => !document.querySelector('#view .tile img[src*="submodule-volatility"]'), null, { timeout: 10000 });
    const tiles = await p.$$eval('#view .tile .icon', els => els.map(e => ({ w: Math.round(e.getBoundingClientRect().width), round: getComputedStyle(e).borderRadius, img: e.querySelector('img')?.getAttribute('width') || null,
      lazy: e.querySelector('img')?.getAttribute('loading') || null, glyphShown: getComputedStyle(e.querySelector('.glyph')).display !== 'none' })));
    assert.equal(tiles.length, subs.length);
    assert.ok(tiles.every(t => t.w === 44 && t.round === '50%'), JSON.stringify(tiles.slice(0, 3)));
    assert.equal(tiles.filter(t => t.img === '44').length, subs.length - GLYPH_ONLY.length - 1 /* volatility's failed */);
    assert.equal(tiles.filter(t => t.glyphShown).length, GLYPH_ONLY.length + 1);
    assert.ok(tiles.some(t => t.lazy === 'lazy'), 'tiles further down load when they come near');
    assert.ok((await p.textContent('#view .footer')).includes(SENTENCE), 'the Dashboard\'s footer');
    // A module's overview: the module's own picture at its head, each submodule's at 44 px beside its name and words,
    // and the credit in its About panel.
    await p.goto(`${BASE}/#/rs`, { waitUntil: 'networkidle' });
    const rs = registry.suites.find(s => s.id === 'rs');
    assert.deepEqual(await p.$eval('#view .head img.suite-figure', i => [i.getAttribute('src'), i.getAttribute('width'), i.complete && i.naturalWidth > 0]), [rs.mark.replace('-64.', '-128.'), '104', true]);
    const rows = await p.$$eval('#view .list td .sub-row', rs => rs.map(r => [r.querySelector('img')?.getAttribute('src') || null, r.querySelector('img')?.getAttribute('width') || null, r.querySelector('.glyph')?.textContent, r.querySelector('a.name').textContent]));
    assert.deepEqual(rows, rs.modules.map(m => [m.art || null, m.art ? '44' : null, m.icon, m.name]));
    assert.ok((await p.textContent('#view .about')).includes(SENTENCE), 'the overview\'s About panel');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); }
});

test('page: on a sharp screen the Home page asks for no 256 px picture', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const asked = [];
    p.on('request', r => { if (/\/design\/vitruvius\//.test(r.url())) asked.push(r.url().replace(/^.*\/design\/vitruvius\//, '')); });
    await p.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
    assert.deepEqual(asked.filter(u => /-256\.webp$/.test(u)), []);
    assert.equal(asked.filter(u => /^module-.*-128\.webp$/.test(u)).length, registry.suites.length - 1, asked.join(' '));
    await ctx.close();
  } finally { await browser.close(); }
});

test('page: the pictures\' own page lists every one with its words and the credit', pageTest, async () => {
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${BASE}/design/vitruvius/index.html`, { waitUntil: 'networkidle' });
    assert.ok((await p.textContent('body')).includes(SENTENCE));
    // The pictures load lazily (45 of 53 wait below the first screen). A quick walk down the page can pass one before
    // the browser asks for it, and the deploy's run of 26 November 2026 timed out here: so ask for every one, then
    // check each drew.
    await p.waitForSelector('figure img');
    assert.ok(await p.$$eval('figure img', imgs => imgs.some(i => i.loading === 'lazy')), 'pictures below the first screen wait until they are near');
    await p.$$eval('figure img', imgs => imgs.forEach(i => { i.loading = 'eager'; }));
    await p.waitForFunction(() => [...document.querySelectorAll('figure img')].every(i => i.complete), null, { timeout: 30000 });
    const shown = await p.$$eval('figure img', imgs => imgs.map(i => [i.getAttribute('alt'), i.complete && i.naturalWidth > 0]));
    assert.equal(shown.length, index.pictures.filter(p => !['future', 'strip'].includes(p.kind)).length);
    assert.ok(shown.every(([alt, ok]) => alt.length > 10 && ok));
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll at 390 px');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
