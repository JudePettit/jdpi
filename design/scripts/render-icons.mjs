// Vitruvian Manager's mark, favicon, loading figure and app icons, from the pictures of Vitruvius, VM's mascot, in
// design/vitruvius/ (made by design/scripts/vitruvius-art.mjs; index.json lists them). Run it again whenever those
// pictures change:
//   node design/scripts/render-icons.mjs
// 1. design/brand-vm.svg (256 × 256, the sidebar's mark, shown at 40 px): the mark, Vitruvius in his hard hat in his
//    circle, on the dark rounded tile. The picture is embedded (an SVG drawn as an image may not fetch another file) at
//    256 px, enough for the 40 px mark on a sharp screen: the 512 px one made every shell page load 39 KB more (the
//    review of 25 November 2026). The app icons are drawn from the same tile with the 512 px picture in it
//    (brandSvg(512)), which is not written to a file.
// 2. design/brand-vm-icon.svg (32 × 32, the favicon of every page): his head in the hard hat on the dark tile. The whole
//    figure is a blur at 16 and 32 px, his head and hat are not. Embedded as a 64 px PNG (twice 32 px).
// 3. design/vm-loading.svg (200 × 200, the figure the shell plays while a page loads): Vitruvius running on the spot in
//    his circle, eight frames a loop (the running strip, embedded), over a road in the four colours of the VM tile that
//    slides back under his feet. With reduced motion nothing moves: he stands in his first stride.
// 4. The installable app's icons, drawn from the mark's tile with the 512 px picture (brandSvg(512)) by Microsoft Edge (tests/tools/pages.mjs launch()):
//    design/icons/vm-192.png and vm-512.png (the mark on its own rounded tile, the corners clear),
//    design/icons/vm-maskable-512.png (the tile's colour to every edge, so a phone may cut any shape, and the mark drawn
//    at 80%, so that his circle stays inside the central circle every mask keeps) and apple-touch-icon.png, 180 px, at
//    the site's root (iOS rounds its own corners and shows clear ones as black, so it is full-bleed too).
// Nothing is fetched from the network: every picture is read from disk and drawn from a data: address.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { launch } from '../../tests/tools/pages.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT));
const index = JSON.parse(read('design/vitruvius/index.json'));
const pic = id => index.pictures.find(p => p.id === id) || (() => { throw new Error(`design/vitruvius/index.json has no ${id}`); })();
const data = (file, type) => `data:${type};base64,${read(file).toString('base64')}`;
const TILE = '#14181f';     // the dark tile (design/prp.css's ink), as the mark has always had
const PAPER = '#faf7f0';    // the pictures' own off-white, inside his circle
// The colours of the VM tile's four bars: blue, amber, green and violet (design/prp.css).
const BARS = ['#6da7ec', '#d9a35c', '#4fbf85', '#a193f0'];
export const CREDIT = index.about;

export function brandSvg(size = 256) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-labelledby="vm-title vm-desc">
  <title id="vm-title">Vitruvian Manager</title>
  <desc id="vm-desc">Vitruvian Manager's mark (VM is made by JDP-Iq): Vitruvius, VM's mascot, in an amber hard hat, his four arms and four legs spread inside a circle. ${CREDIT}</desc>
  <!-- Made by design/scripts/render-icons.mjs from design/vitruvius/mark-${size}.webp; edit the script, not this file. -->
  <rect width="256" height="256" rx="48" fill="${TILE}"/>
  <image x="5" y="5" width="246" height="246" href="${data(pic('mark').files[size], 'image/webp')}"/>
</svg>
`;
}

export function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-labelledby="vmi-title vmi-desc">
  <title id="vmi-title">Vitruvian Manager</title>
  <desc id="vmi-desc">Vitruvian Manager's icon (VM is made by JDP-Iq): the head of Vitruvius, VM's mascot, in his amber hard hat. ${CREDIT}</desc>
  <!-- Made by design/scripts/render-icons.mjs from design/vitruvius/mark-head-64.png; edit the script, not this file.
       The favicon shows his head and hard hat only: the whole figure in his circle does not read at 16 or 32 px. -->
  <rect width="32" height="32" rx="6" fill="${TILE}"/>
  <image x="1.5" y="1.5" width="29" height="29" href="${data(pic('mark-head').files['64png'], 'image/png')}"/>
</svg>
`;
}

export function loadingSvg() {
  const run = pic('runner-frames'), n = run.frames, fw = run.frameWidth, fh = run.height;
  // He stands 124 units tall, centred, his feet on the road at y 156.
  const h = 124, w = +(fw * h / fh).toFixed(2), x = +(100 - w / 2).toFixed(2), y = 156 - h;
  // The road: a dash of each colour every 48 units, two lengths of it, sliding back one length (48 × 4 = 192) a loop.
  const dashes = [0, 1].flatMap(k => BARS.map((c, i) => `<rect class="vml-r" x="${k * 192 + i * 48}" y="157" width="30" height="5" rx="2.5" fill="${c}"/>`)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-labelledby="vml-title vml-desc">
  <title id="vml-title">Loading</title>
  <desc id="vml-desc">Vitruvius, VM's mascot, runs on the spot inside his circle while the page loads. ${CREDIT}</desc>
  <!-- Made by design/scripts/render-icons.mjs from design/vitruvius/${run.files.strip.split('/').pop()} (${n} frames of
       ${fw} × ${fh}); edit the script, not this file. CSS only, so it plays inlined (as the shell shows it) and as an
       image: the strip steps one frame at a time behind a window one frame wide (${n} frames in 0.8 s), and the road
       slides back under his feet at the same pace. Reduced motion: nothing moves, and he stands in his first stride.
       Class, keyframe and clip names carry a vml- prefix, as an inlined copy's style is global to the page. -->
  <style>
    .vml-run{animation:vml-run .8s steps(${n}) infinite}
    .vml-r{animation:vml-road .8s linear infinite}
    @keyframes vml-run{to{transform:translateX(-${fw * n}px)}}
    @keyframes vml-road{to{transform:translateX(-192px)}}
    @media (prefers-reduced-motion:reduce){.vml-run,.vml-r{animation:none}}
  </style>
  <defs><clipPath id="vml-disc"><circle cx="100" cy="100" r="85"/></clipPath></defs>
  <circle cx="100" cy="100" r="88" fill="${PAPER}" stroke="${TILE}" stroke-width="5"/>
  <g clip-path="url(#vml-disc)">
    <g>${dashes}</g>
    <svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${fw} ${fh}" overflow="hidden"><image class="vml-run" width="${fw * n}" height="${fh}" href="${data(run.files.strip, 'image/webp')}"/></svg>
  </g>
</svg>
`;
}

export const ICONS = [
  { file: 'design/icons/vm-192.png', size: 192, bleed: false, scale: 1 },
  { file: 'design/icons/vm-512.png', size: 512, bleed: false, scale: 1 },
  { file: 'design/icons/vm-maskable-512.png', size: 512, bleed: true, scale: 0.8 },
  { file: 'apple-touch-icon.png', size: 180, bleed: true, scale: 1 },
];

async function main() {
  const svgs = { 'design/brand-vm.svg': brandSvg(), 'design/brand-vm-icon.svg': iconSvg(), 'design/vm-loading.svg': loadingSvg() };
  for (const [file, svg] of Object.entries(svgs)) { writeFileSync(new URL(file, ROOT), svg); console.log(`${file}: ${Buffer.byteLength(svg)} bytes`); }
  const src = `data:image/svg+xml;base64,${Buffer.from(brandSvg(512)).toString('base64')}`;
  const browser = await launch({ args: ['--mute-audio'] });
  try {
    mkdirSync(new URL('design/icons/', ROOT), { recursive: true });
    for (const { file, size, bleed, scale } of ICONS) {
      const s = Math.round(size * scale), at = Math.round((size - s) / 2);
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><html><body style="margin:0;background:${bleed ? TILE : 'transparent'}"><img src="${src}" width="${s}" height="${s}" style="display:block;margin:${at}px 0 0 ${at}px"></body></html>`);
      await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
      await page.waitForTimeout(150); // the embedded picture decodes after the SVG itself
      const png = await page.screenshot({ omitBackground: !bleed, clip: { x: 0, y: 0, width: size, height: size } });
      writeFileSync(new URL(file, ROOT), png);
      console.log(`${file}: ${size} × ${size}, ${png.length} bytes`);
      await page.close();
    }
  } finally {
    // Edge once hung on close here (25 November 2026) with every icon written: give it five seconds, then go.
    await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { await main(); process.exit(0); }
