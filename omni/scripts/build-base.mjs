// Copies the Omni-Map's plain base, Natural Earth's land at 1:110 million, into omni/data/base (PRP-SCHOLAR-USP-DESIGN.md
// S1 and 4.2: "base plain from Natural Earth GeoJSON in omni/data/"; before 1886 the base is never today's political map,
// so it holds land only, no country borders).
//   node omni/scripts/build-base.mjs [--file <a copy already downloaded from SOURCE.url>]
// The order of steps:
// 1. Fetches SOURCE.url once (User-Agent "VM build check (https://jdpi.pages.dev)"), or reads --file.
// 2. Checks the bytes against the sha256 recorded below for tag v5.1.1 and stops if they differ (a new release is a
//    change to make by hand: read its terms again, record its hash here and in the README).
// 3. Writes them unchanged to omni/data/base/ne_110m_land.geojson and its README.md (version, address, date read,
//    sha256, the terms and the credit). Nothing else is written.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = join(ROOT, 'omni/data/base');
export const SOURCE = {
  version: 'v5.1.1',
  tagDate: '2022-05-13',
  url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.1/geojson/ne_110m_land.geojson',
  sha256: '9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9',
  terms: 'https://www.naturalearthdata.com/about/terms-of-use/',
  licenceFile: 'https://github.com/nvkelso/natural-earth-vector/blob/v5.1.1/LICENSE.md',
  // The sentence that allows hosting it, from the terms page and the LICENSE.md at the tag, read 17 November 2026.
  quote: 'All versions of Natural Earth raster + vector map data found on this website are in the public domain. You may use the maps in any manner, including modifying the content and design, electronic dissemination, and offset printing.',
  read: '2026-11-17',
  credit: 'Made with Natural Earth.',
};
const UA = { 'User-Agent': 'VM build check (https://jdpi.pages.dev)' };
const sha256 = b => createHash('sha256').update(b).digest('hex');

export function readme(bytes) {
  return `# The Omni-Map's base: Natural Earth land

\`ne_110m_land.geojson\` is Natural Earth's land polygons at 1:110 million, copied unchanged from release ${SOURCE.version}
(GitHub tag of nvkelso/natural-earth-vector, ${SOURCE.tagDate}) by \`omni/scripts/build-base.mjs\`.

- Address: ${SOURCE.url}
- Read: ${SOURCE.read}
- sha256: ${sha256(bytes)}
- Size: ${bytes.length} bytes (${gzipSync(bytes, { level: 9 }).length} gzipped)

It holds land only, with no country borders: the Omni-Map's \`plain\` base, which before 1886 must never be today's
political map (PRP-SCHOLAR-USP-DESIGN.md 4.2).

## Terms

Natural Earth is in the public domain. Its terms of use (${SOURCE.terms}) and the LICENSE.md at the tag
(${SOURCE.licenceFile}) say: "${SOURCE.quote}"

No credit is required; the credit Natural Earth offers, which VM gives in the Omni-Map's legend: "${SOURCE.credit}"
`;
}

async function main() {
  const i = process.argv.indexOf('--file');
  let bytes;
  if (i > 0) bytes = readFileSync(process.argv[i + 1]);
  else {
    const res = await fetch(SOURCE.url, { headers: UA });
    if (!res.ok) { console.error(`${SOURCE.url} answered ${res.status}: stopping`); process.exit(1); }
    bytes = Buffer.from(await res.arrayBuffer());
  }
  if (sha256(bytes) !== SOURCE.sha256) { console.error(`The file is not Natural Earth ${SOURCE.version}'s ne_110m_land.geojson (sha256 ${sha256(bytes)}): stopping`); process.exit(1); }
  const g = JSON.parse(bytes.toString('utf8'));
  if (g.type !== 'FeatureCollection' || !g.features.every(f => /Polygon$/.test(f.geometry?.type))) { console.error('Not a FeatureCollection of land polygons: stopping'); process.exit(1); }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'ne_110m_land.geojson'), bytes);
  writeFileSync(join(OUT, 'README.md'), readme(bytes));
  console.log(`ne_110m_land.geojson: ${g.features.length} polygons, ${bytes.length} bytes, ${gzipSync(bytes, { level: 9 }).length} gzipped`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
