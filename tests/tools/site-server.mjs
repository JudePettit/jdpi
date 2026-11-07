// A local copy of the site served as Cloudflare Pages serves it, headers included: clean addresses (/x/index.html and
// /x.html redirect to /x/ and /x), and every matching block of the repository's _headers file applied to the answer,
// so a page test runs under the site's real Content-Security-Policy. It listens on 127.0.0.1 only, on a port the
// system picks. `rewrite(name, value, path)` may change a header for the test (IoT Connect's tests point the policy's
// bridge port at their fake bridge).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json' };

/** The _headers file as [{ pattern: RegExp, path, headers: [[name, value]] }], in file order. */
export function parseHeaders(text) {
  const rules = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      const path = raw.trim();
      cur = { path, pattern: new RegExp('^' + path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), headers: [] };
      rules.push(cur);
    } else if (cur) {
      const at = raw.indexOf(':');
      if (at > 0) cur.headers.push([raw.slice(0, at).trim(), raw.slice(at + 1).trim()]);
    }
  }
  return rules;
}
export const headerRules = () => parseHeaders(readFileSync(join(ROOT, '_headers'), 'utf8'));
/** Every header _headers gives a path, later blocks adding to (not replacing) earlier ones' different names. */
export function headersFor(path, rules = headerRules()) {
  const out = {};
  for (const r of rules) if (r.pattern.test(path)) for (const [k, v] of r.headers) out[k] = out[k] ? `${out[k]}, ${v}` : v;
  return out;
}

export async function siteServer({ rewrite = (name, value) => value } = {}) {
  const rules = headerRules();
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname.endsWith('.html')) {
        res.writeHead(308, { Location: url.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '') + url.search, 'Cache-Control': 'no-store' }).end();
        return;
      }
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([\\/])+/, '');
      let file = join(ROOT, rel);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const found = await stat(file).catch(() => null);
      if (!extname(file) && !found?.isFile() && (await stat(file + '.html').catch(() => null))?.isFile()) file += '.html';
      else if (found?.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      const extra = {};
      for (const [k, v] of Object.entries(headersFor(url.pathname, rules))) extra[k] = rewrite(k, v, url.pathname);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', ...extra }).end(body);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, close: () => new Promise(r => { server.close(() => r()); server.closeAllConnections?.(); }) };
}
