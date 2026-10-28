// A plain static server for checking pages locally, with Cloudflare Pages' clean addresses: /x.html and /x/index.html
// redirect (308) to /x and /x/, which are served from x.html and x/index.html; query strings are kept.
//   node tests/tools/serve.mjs [port=8787] [root=.]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const port = +(process.argv[2] || 8787);
const root = resolve(process.argv[3] || '.');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.endsWith('.html')) {
      const clean = url.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
      res.writeHead(308, { Location: clean + url.search, 'Cache-Control': 'no-store' }).end();
      return;
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([\\/])+/, '');
    let file = join(root, path);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    // Like Cloudflare Pages, /q/calendar is served from q/calendar.html (even when a q/calendar/ folder exists, as
    // fe/learning/ does); tests written against the live site rely on it.
    const found = await stat(file).catch(() => null);
    if (!extname(file) && !found?.isFile() && (await stat(file + '.html').catch(() => null))?.isFile()) file += '.html';
    else if (found?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }).end(body);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); }
}).listen(port, () => console.log(`Serving ${root} at http://localhost:${port}/`));
