// Page tests (they drive a browser) and site tests (they fetch the deployed site). PRP_PAGES=0 leaves both out, so a
// data workflow can test the files it is about to commit with the unit and data tests alone: no npm install, no
// browser and no network (`PRP_PAGES=0 node --test tests/<module>.test.mjs`). Pass `pageTest` as a test's options:
//   test('page: …', pageTest, async () => { const browser = await launch(); … });
// launch() loads playwright-core only when a page test runs. PRP_BROWSER picks another Playwright channel than
// Microsoft Edge (e.g. chrome; GitHub's Ubuntu runners have both).
// Every launch adds --enable-unsafe-swiftshader (PRP-SCHOLAR-USP-DESIGN.md S1): recent Chromium no longer falls back to
// its software renderer for WebGL without it, so a map drawn with WebGL (the Omni-Map's MapLibre GL JS) would have no
// WebGL in headless Edge or on GitHub's runners, which have no GPU. tests/omni.test.mjs fails loudly if WebGL is absent.
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
