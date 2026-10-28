import { createReadStream } from 'node:fs';

// Minimal RFC 4180 CSV reader: returns an array of objects keyed by the header row.
export function parseCsv(text) {
  if (!text.includes('\n')) text = text.replace(/\r/g, '\n'); // classic-Mac line endings (COW files)
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// The same, a row at a time, for files too large to read at once (UCDP GED is 270 MB): calls onRow(object) per row.
export async function eachCsvRow(path, onRow) {
  let head = null, row = [], field = '', quoted = false;
  const end = () => { row.push(field); field = ''; if (!head) head = row; else if (row.length === head.length) onRow(Object.fromEntries(head.map((h, i) => [h, row[i]]))); row = []; };
  for await (const chunk of createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 20 })) {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (quoted) {
        if (c === '"') { if (chunk[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') end();
      else if (c !== '\r') field += c;
    }
  }
  if (field || row.length) end();
}
