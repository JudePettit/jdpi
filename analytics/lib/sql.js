// Data Analytics: optional SQL with DuckDB-WASM. Nothing here loads until someone runs a query: then the DuckDB module
// (pinned, from jsDelivr) starts in a worker, the loaded dataset is copied in as the table `data` through Apache Arrow
// (the build DuckDB itself imports), extension downloads are switched off, and so is access to files and the web, so a
// shared query can only read that table.
export const DUCKDB_VERSION = '1.32.0', ARROW_VERSION = '17.0.0';
const CDN = 'https://cdn.jsdelivr.net/npm/';
const DUCKDB = `${CDN}@duckdb/duckdb-wasm@${DUCKDB_VERSION}/+esm`;
const ARROW = `${CDN}apache-arrow@${ARROW_VERSION}/+esm`; // the same module address DuckDB's bundle imports, so one Arrow instance
export const MAX_SQL_ROWS = 200000;

let engine = null; // Promise<{ duckdb, arrow, db, conn, worker, key }>

async function start(onStatus) {
  onStatus('Loading DuckDB from jsDelivr (about 7 MB, once)…');
  const [duckdb, arrow] = await Promise.all([import(DUCKDB), import(ARROW)]);
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const workerUrl = URL.createObjectURL(new Blob([`importScripts(${JSON.stringify(bundle.mainWorker)});`], { type: 'text/javascript' }));
  const worker = new Worker(workerUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  onStatus('Starting DuckDB…');
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  const conn = await db.connect();
  // No extension downloads (they would come from DuckDB's own server, not jsDelivr).
  for (const s of ['SET autoinstall_known_extensions = false', 'SET autoload_known_extensions = false']) { try { await conn.query(s); } catch { /* older builds */ } }
  return { duckdb, arrow, db, conn, worker, key: null };
}
function stop() {
  const e = engine;
  engine = null;
  if (e) e.then(x => { try { x.worker.terminate(); } catch { /* ignore */ } }, () => {});
}

/* Columns for Arrow, each with a fixed type, so Arrow never guesses from mixed or empty values. */
const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/, TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const text = v => (v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));
function arrowColumn(A, rows, col) {
  const get = r => r[col.name];
  if (col.type === 'number') return A.vectorFromArray(rows.map(r => { const v = get(r); return typeof v === 'number' && Number.isFinite(v) ? v : v == null || v === '' || !Number.isFinite(+v) ? null : +v; }), new A.Float64());
  if (col.type === 'boolean') return A.vectorFromArray(rows.map(r => { const v = get(r); return v == null ? null : !!v; }), new A.Bool());
  if (col.type === 'array') {
    const lists = rows.map(r => (Array.isArray(get(r)) ? get(r) : null));
    const nums = lists.every(l => !l || l.every(x => x == null || typeof x === 'number'));
    return A.vectorFromArray(lists.map(l => (l ? l.map(x => (nums ? x ?? null : text(x))) : null)), new A.List(new A.Field('item', nums ? new A.Float64() : new A.Utf8(), true)));
  }
  return A.vectorFromArray(rows.map(r => text(get(r))), new A.Utf8());
}
const quoteId = s => `"${String(s).replace(/"/g, '""')}"`;
// A column or struct key named "__proto__" (SELECT … AS "__proto__") becomes an own property, never the object's prototype.
export const put = (o, k, v) => { if (k === '__proto__') Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true }); else o[k] = v; return o; };

/** Convert DuckDB (Arrow) values to plain JavaScript: BigInt to number, dates to ISO text, lists and structs. */
function toJS(v, type) {
  if (v == null) return null;
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : String(v);
  const id = type?.typeId;
  if (id === 8 /* Date */ && typeof v === 'number') return new Date(v).toISOString().slice(0, 10);
  if (id === 10 /* Timestamp */ && typeof v === 'number') return new Date(v).toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (typeof v.toArray === 'function' && !Array.isArray(v)) { const child = type?.children?.[0]?.type; return Array.from(v.toArray(), x => toJS(x, child)); }
    if (Array.isArray(v) || ArrayBuffer.isView(v)) return Array.from(v, x => toJS(x));
    const o = typeof v.toJSON === 'function' ? v.toJSON() : v, out = {};
    const kids = new Map((type?.children || []).map(c => [c.name, c.type]));
    for (const k of Object.keys(o)) put(out, k, toJS(o[k], kids.get(k)));
    return out;
  }
  return v;
}

/**
 * Run `sql` over `table` (copied into DuckDB as `data` once per `key`, the dataset id and load time).
 * @returns { names, rows, truncated, total }
 */
export async function runSQL(table, key, sql, onStatus = () => {}) {
  if (!String(sql || '').trim()) throw new Error('Write a query first');
  // A different dataset needs a fresh database, because file access is switched off once the data is in.
  if (engine) { const e = await engine.catch(() => null); if (!e || (e.key && e.key !== key)) stop(); }
  engine ||= start(onStatus).catch(e => { engine = null; throw e; });
  const e = await engine;
  if (e.key !== key) {
    onStatus(`Copying ${table.rows.length.toLocaleString('en-GB')} rows into DuckDB…`);
    if (!table.rows.length || !table.columns.length) throw new Error('The dataset has no rows to query');
    const A = e.arrow, vectors = {};
    for (const c of table.columns) vectors[c.name] = arrowColumn(A, table.rows, c);
    await e.conn.insertArrowTable(new A.Table(vectors), { name: 'data', create: true });
    // Dates arrive as text: columns that hold only full dates or timestamps become DATE or TIMESTAMP.
    for (const c of table.columns.filter(c => c.type === 'date')) {
      const vals = table.rows.map(r => r[c.name]).filter(v => v != null && v !== '').map(String);
      const to = vals.every(v => FULL_DATE.test(v)) ? 'DATE' : vals.every(v => TIMESTAMP.test(v)) ? 'TIMESTAMP' : null;
      if (to && vals.length) { try { await e.conn.query(`ALTER TABLE data ALTER ${quoteId(c.name)} TYPE ${to} USING TRY_CAST(${quoteId(c.name)} AS ${to})`); } catch { /* keep it as text */ } }
    }
    for (const s of ['SET enable_external_access = false', 'SET lock_configuration = true']) { try { await e.conn.query(s); } catch { /* older builds */ } }
    e.key = key;
  }
  onStatus('Running…');
  const res = await e.conn.query(sql);
  const fields = res.schema.fields;
  const n = Math.min(res.numRows, MAX_SQL_ROWS);
  const cols = fields.map(f => ({ name: f.name, vec: res.getChild(f.name), type: f.type }));
  const rows = new Array(n);
  for (let i = 0; i < n; i++) { const r = {}; for (const c of cols) put(r, c.name, toJS(c.vec?.get(i), c.type)); rows[i] = r; }
  return { names: fields.map(f => f.name), rows, truncated: res.numRows > n, total: res.numRows };
}
