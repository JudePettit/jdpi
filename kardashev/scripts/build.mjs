// Builds kardashev/data/energy.json: each polity's estimated share of humanity's energy capture, by century.
//   node kardashev/scripts/build.mjs
// Energy (kcal/day) = population × energy capture per person. Power in watts = kcal/day × 4184 ÷ 86,400.
// Kardashev rating (Carl Sagan's interpolation): K = (log10(watts) − 6) ÷ 10. Type I ≈ 10^16 W.
import { writeFileSync, mkdirSync } from 'node:fs';
import { POLITIES, WORLD, STEPS } from './polities.mjs';

const lerp = (keys, year, col) => {
  if (year <= keys[0][0]) return keys[0][col];
  for (let i = 1; i < keys.length; i++) {
    const [y0] = keys[i - 1], [y1] = keys[i];
    if (year <= y1) return keys[i - 1][col] + (keys[i][col] - keys[i - 1][col]) * (year - y0) / (y1 - y0);
  }
  return keys.at(-1)[col];
};
const WATTS_PER_KCAL_DAY = 4184 / 86400;
const kardashev = w => (Math.log10(w) - 6) / 10;

const steps = STEPS.map(y => (y === 0 ? 1 : y)).map(year => {
  const active = POLITIES.filter(p => p.k[0][0] <= year && year <= p.k.at(-1)[0]).map(p => {
    const pop = lerp(p.k, year, 1) * 1e6, kcal = lerp(p.k, year, 2) * 1e3;
    return { id: p.id, pop, kcal, watts: pop * kcal * WATTS_PER_KCAL_DAY };
  });
  const worldPop = lerp(WORLD, year, 1) * 1e6;
  const restPop = Math.max(0, worldPop - active.reduce((s, p) => s + p.pop, 0));
  const restWatts = restPop * lerp(WORLD, year, 2) * 1e3 * WATTS_PER_KCAL_DAY;
  const worldWatts = active.reduce((s, p) => s + p.watts, 0) + restWatts;
  return {
    year, worldPop, worldWatts, K: +kardashev(worldWatts).toFixed(3),
    rest: { pop: restPop, watts: restWatts, share: restWatts / worldWatts },
    polities: active.map(p => ({ ...p, share: p.watts / worldWatts, K: +kardashev(p.watts).toFixed(3) })).sort((a, b) => b.share - a.share),
  };
});

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/energy.json', import.meta.url), JSON.stringify({
  generated: new Date().toISOString(),
  polities: POLITIES.map(({ k, ...p }) => ({ ...p, from: k[0][0], to: k.at(-1)[0] })),
  steps,
}));
for (const s of steps.filter(s => [-2000, -500, 1, 1100, 1700, 1900, 1950, 2025].includes(s.year))) {
  console.log(s.year, 'K', s.K, s.polities.slice(0, 4).map(p => `${p.id} ${(p.share * 100).toFixed(1)}%`).join(', '), `rest ${(s.rest.share * 100).toFixed(0)}%`);
}
