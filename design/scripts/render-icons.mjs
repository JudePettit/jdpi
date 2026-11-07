// The installable app's icons, rendered once from the Vitruvian Manager mark (design/brand-vm.svg) by Microsoft Edge
// through playwright-core (a dev dependency already), and committed: run it again only when the mark changes.
//   node design/scripts/render-icons.mjs
// Writes design/icons/vm-192.png and vm-512.png (the mark on its own rounded tile, the corners clear),
// design/icons/vm-maskable-512.png (the tile's colour to every edge, so a phone may cut any shape, and the mark drawn
// at 80%, so that its outermost tools, the gear and the book, stay inside the central circle every mask keeps)
// and apple-touch-icon.png, 180 px, at the site's root (iOS rounds its own corners and shows clear ones as black, so
// it is full-bleed too). Nothing is fetched from the network:
// the mark is read from disk and drawn from a data: address.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = new URL('../../', import.meta.url);
const svg = readFileSync(new URL('design/brand-vm.svg', ROOT), 'utf8');
const TILE = /<rect width="256" height="256" rx="48" fill="(#[0-9a-f]{6})"\/>/i.exec(svg)?.[1];
if (!TILE) throw new Error('design/brand-vm.svg no longer starts with its 256 × 256 tile: update this script.');
const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

export const ICONS = [
  { file: 'design/icons/vm-192.png', size: 192, bleed: false, scale: 1 },
  { file: 'design/icons/vm-512.png', size: 512, bleed: false, scale: 1 },
  { file: 'design/icons/vm-maskable-512.png', size: 512, bleed: true, scale: 0.8 },
  { file: 'apple-touch-icon.png', size: 180, bleed: true, scale: 1 },
];

const browser = await chromium.launch({ channel: process.env.PRP_BROWSER || 'msedge', args: ['--mute-audio'] });
try {
  mkdirSync(new URL('design/icons/', ROOT), { recursive: true });
  for (const { file, size, bleed, scale } of ICONS) {
    const s = Math.round(size * scale), at = Math.round((size - s) / 2);
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:${bleed ? TILE : 'transparent'}"><img src="${src}" width="${s}" height="${s}" style="display:block;margin:${at}px 0 0 ${at}px"></body></html>`);
    await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
    const png = await page.screenshot({ omitBackground: !bleed, clip: { x: 0, y: 0, width: size, height: size } });
    writeFileSync(new URL(file, ROOT), png);
    console.log(`${file}: ${size} × ${size}, ${png.length} bytes`);
    await page.close();
  }
} finally { await browser.close(); }
