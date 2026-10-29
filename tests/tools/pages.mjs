// Page tests (they drive a browser) and site tests (they fetch the deployed site). PRP_PAGES=0 leaves both out, so a
// data workflow can test the files it is about to commit with the unit and data tests alone: no npm install, no
// browser and no network (`PRP_PAGES=0 node --test tests/<module>.test.mjs`). Pass `pageTest` as a test's options:
//   test('page: …', pageTest, async () => { const browser = await launch(); … });
// launch() loads playwright-core only when a page test runs. PRP_BROWSER picks another Playwright channel than
// Microsoft Edge (e.g. chrome; GitHub's Ubuntu runners have both).
export const pageTest = process.env.PRP_PAGES === '0' ? { skip: 'page and site tests are off (PRP_PAGES=0)' } : {};

export async function launch(options = {}) {
  const { chromium } = await import('playwright-core');
  return chromium.launch({ channel: process.env.PRP_BROWSER || 'msedge', ...options });
}
