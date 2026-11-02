// The test suite with its settings made here, so it runs the same on every platform: npm runs scripts in cmd.exe on
// Windows, where `PRP_PAGES=0 node --test …` does not work.
//   npm run test:unit   the fast tests (data, units, builds), with no browser and no network: PRP_PAGES=0
//   npm run test:e2e    the whole suite, pages included, against a local copy of the site served like Cloudflare Pages
//                       (tests/tools/serve.mjs, as CI does), which this starts on a free port and stops afterwards
// Both run the files that package.json's "test" script lists, or the files given after the command:
//   npm run test:e2e -- tests/kino.test.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [mode, ...picked] = process.argv.slice(2);
if (mode !== 'unit' && mode !== 'e2e') {
  console.error('Usage: node tests/tools/run.mjs unit|e2e [test files]');
  process.exit(2);
}
const listed = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).scripts.test.match(/tests\/\S+\.test\.mjs/g);
const files = picked.length ? picked : listed;

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer().once('error', reject).listen(0, () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

const env = { ...process.env };
let server = null;
const stop = () => { if (server && server.exitCode === null) server.kill(); };
if (mode === 'unit') {
  env.PRP_PAGES = '0';
  delete env.JDPI_URL; delete env.PRP_URL; // the SIGINT and OSINT page tests run whenever a site address is set
} else {
  const port = await freePort(), base = `http://localhost:${port}`;
  server = spawn(process.execPath, ['tests/tools/serve.mjs', String(port), '.'], { cwd: root, stdio: 'ignore' });
  for (let tries = 0; ; tries++) {
    try { if ((await fetch(`${base}/registry.json`)).ok) break; } catch { /* not listening yet */ }
    if (tries === 50) { stop(); console.error(`The local server did not start on port ${port}.`); process.exit(1); }
    await new Promise(r => setTimeout(r, 200));
  }
  Object.assign(env, { JDPI_URL: base, PRP_URL: base });
  console.log(`Testing against a local copy of the site at ${base}`);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop(); process.exit(130); });
const run = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: root, env, stdio: 'inherit' });
run.on('exit', code => { stop(); process.exit(code ?? 1); });
