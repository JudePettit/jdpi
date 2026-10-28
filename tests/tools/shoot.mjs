// Screenshot a page in light or dark, to look at a redesign. Uses the installed Microsoft Edge through playwright-core.
//   node tests/tools/shoot.mjs <url> <out.png> [--dark] [--width 1440] [--height 900] [--full] [--wait 2500]
//        [--map https://jdpi.pages.dev/=http://localhost:8787/]   (serve live shared files from a local folder)
//        [--click "selector"]                                       (click something first, e.g. a tab)
// Prints console errors and failed requests, so broken scripts show up too.
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : (args[i + 1] ?? true); };
const [url, out] = args;
if (!url || !out) { console.error('usage: node tests/tools/shoot.mjs <url> <out.png> [--dark] [--width 1440] [--full] [--map from=to] [--click sel]'); process.exit(2); }
const dark = args.includes('--dark');
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: +flag('--width', 1440), height: +flag('--height', 900) }, colorScheme: dark ? 'dark' : 'light' });
const map = flag('--map', null);
if (map) {
  const [from, to] = map.split('=');
  // Fulfil from the mapped URL (route.continue can't switch https to http).
  await page.route(u => u.href.startsWith(from), async route => {
    const res = await fetch(to + route.request().url().slice(from.length));
    await route.fulfill({ status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'text/plain', 'access-control-allow-origin': '*' }, body: Buffer.from(await res.arrayBuffer()) });
  });
}
const problems = [];
page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('requestfailed', r => problems.push(`failed: ${r.url()} (${r.failure()?.errorText})`));
await page.goto(url, { waitUntil: 'domcontentloaded' });
if (dark) await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new CustomEvent('prp:themechange', { detail: { theme: 'dark' } })); });
await page.waitForTimeout(+flag('--wait', 2500));
const click = flag('--click', null);
if (click) { await page.click(click).catch(e => problems.push(`click: ${e.message}`)); await page.waitForTimeout(1500); }
await page.screenshot({ path: out, fullPage: args.includes('--full') });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(JSON.stringify({ out, dark, horizontalOverflowPx: overflow, problems: problems.slice(0, 20) }, null, 1));
await browser.close();
