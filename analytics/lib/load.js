// Data Analytics: fetching a catalogue dataset (one file, or the shards listed in `urls`) with progress and a size limit,
// and finding its records inside each file.
export const WARN_BYTES = 20 * 1024 * 1024;  // ask before loading more than this
export const MAX_BYTES = 120 * 1024 * 1024;  // refuse above this: the browser holds the text, the parsed data and the table at once

export class LoadError extends Error { constructor(message, code = 'error') { super(message); this.name = 'LoadError'; this.code = code; } }

export const mb = n => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`);

/** The dataset's file paths (from the site root), in order. */
export function datasetUrls(ds) {
  const list = Array.isArray(ds?.urls) && ds.urls.length ? ds.urls : ds?.url ? [ds.url] : [];
  return list.filter(u => typeof u === 'string' && u.trim());
}
/**
 * A file path from the catalogue, resolved against the site root. Only http(s) addresses on the site itself: the
 * catalogue lists paths from the site root, so an address elsewhere ("//host/x", "https://host/x") is refused rather
 * than fetched.
 */
export function resolveUrl(path, root) {
  const u = new URL(String(path).trim().replace(/^\.?\/(?!\/)/, ''), root);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new LoadError(`Unsupported address “${path}”`);
  if (u.origin !== new URL(root).origin) throw new LoadError(`Only files on this site can be loaded, not “${path}”`);
  return u;
}
/** The size the catalogue gives, if any (the Integration Hub writes `bytes`). */
export const declaredBytes = ds => (Number.isFinite(+ds?.bytes) && +ds.bytes > 0 ? +ds.bytes : Number.isFinite(+ds?.size) && +ds.size > 0 ? +ds.size : null);

/**
 * The records inside a parsed file: `path` is "" for a file that is the array itself, or a dotted path ("events",
 * "data.items"), or a JSON pointer ("/data/items"). An object of objects (keyed by id) becomes rows with a `key` column.
 */
export function recordsAt(json, path = '') {
  let v = json;
  const segs = !path ? [] : String(path).startsWith('/') ? String(path).slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~')) : String(path).split('.');
  for (const seg of segs.filter(s => s !== '')) {
    if (v == null || typeof v !== 'object') throw new LoadError(`The file has no “${path}”`);
    v = v[seg];
  }
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v);
    if (entries.length && entries.every(([, x]) => x && typeof x === 'object' && !Array.isArray(x))) {
      const keyName = entries.some(([, x]) => 'key' in x) ? '_key' : 'key';
      return entries.map(([k, x]) => ({ [keyName]: k, ...x }));
    }
  }
  throw new LoadError(path ? `“${path}” in the file is not a list of records` : 'The file is not a list of records');
}

/** Read a response body as text, reporting bytes as they arrive, and stop past `maxBytes`. */
export async function readText(res, { onBytes = () => {}, maxBytes = MAX_BYTES, already = 0 } = {}) {
  if (!res.body?.getReader) { const t = await res.text(); onBytes(t.length); return t; }
  const reader = res.body.getReader(), dec = new TextDecoder();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.byteLength;
    if (already + got > maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } throw new LoadError(`This dataset is larger than ${mb(maxBytes)}, more than a browser tab can comfortably hold. Use the Integration Hub's API or MCP server to query it in parts.`, 'too-large'); }
    parts.push(dec.decode(value, { stream: true }));
    onBytes(got);
  }
  parts.push(dec.decode());
  return parts.join('');
}

/**
 * Load every file of a dataset and return its records.
 * @param ds       catalogue entry
 * @param opts     { root: site root URL, signal, onProgress({ bytes, total, file, files }), confirm(bytes) → Promise<boolean>, fetchFn }
 */
export async function loadDataset(ds, { root, signal, onProgress = () => {}, confirm = async () => true, fetchFn = (u, o) => fetch(u, o) } = {}) {
  const urls = datasetUrls(ds).map(u => resolveUrl(u, root));
  if (!urls.length) throw new LoadError('The catalogue gives no file for this dataset');
  const total = declaredBytes(ds);
  if (total && total > MAX_BYTES) throw new LoadError(`This dataset is ${mb(total)}, more than the ${mb(MAX_BYTES)} a browser tab can comfortably hold. Use the Integration Hub's API or MCP server to query it in parts.`, 'too-large');
  if (total && total > WARN_BYTES && !(await confirm(total))) throw new LoadError('Loading cancelled', 'cancelled');
  let records = [], bytes = 0, generated = null;
  for (let i = 0; i < urls.length; i++) {
    const res = await fetchFn(urls[i], { signal });
    if (!res.ok) throw new LoadError(`Could not load ${urls[i].pathname} (HTTP ${res.status})`, 'http');
    const len = Number(res.headers.get('content-length')) || 0;
    if (!total && len && !res.headers.get('content-encoding') && bytes + len > MAX_BYTES) throw new LoadError(`This dataset is larger than ${mb(MAX_BYTES)}. Use the Integration Hub's API or MCP server to query it in parts.`, 'too-large');
    let fileBytes = 0;
    const text = await readText(res, { already: bytes, onBytes: b => { fileBytes = b; onProgress({ bytes: bytes + b, total, file: i + 1, files: urls.length }); } });
    bytes += fileBytes || text.length;
    let json;
    try { json = JSON.parse(text); } catch { throw new LoadError(`${urls[i].pathname} is not valid JSON`, 'parse'); }
    const recs = recordsAt(json, ds.records ?? '');
    records = records.length ? records.concat(recs) : recs;
    const g = json && typeof json === 'object' && !Array.isArray(json) ? json.generated : null;
    if (typeof g === 'string' && (!generated || g > generated)) generated = g;
  }
  return { records, bytes, generated, files: urls.map(u => u.href) };
}
