// A place's point from Wikidata's coordinate location (P625), as the lake keeps it (build.mjs, a record's `pt` and
// `ptp`) and the Omni-Map draws it (PRP-SCHOLAR-USP-DESIGN.md 2.1 rule 5 and 5.1: "the entry's P625 coordinates,
// fetched by lake/scripts/build.mjs from S1").
//
// A Wikidata globe coordinate is { latitude, longitude, altitude, precision, globe }. The point is kept as GeoJSON
// orders it, [longitude, latitude], with the values exactly as Wikidata gives them, and its precision in degrees
// beside it (1/60 is a minute, 0.0001 about ten metres; null where Wikidata gives none), so a reader never shows it
// finer than recorded. Only points on the Earth (globe Q2) are places on VM's maps: Wikidata gives coordinates on the
// Moon and Mars too. Pure: no Node APIs, so a page may import it.

export const EARTH = 'http://www.wikidata.org/entity/Q2';

/** A P625 claim as { pt: [lon, lat], p: precision in degrees | null }, or null (no value, unknown value, another
 *  globe, or a value out of range). */
export function wikidataPoint(claim) {
  const snak = claim?.mainsnak;
  if (!snak || snak.snaktype !== 'value') return null;
  const v = snak.datavalue?.value;
  if (!v || typeof v !== 'object') return null;
  if (v.globe && v.globe !== EARTH) return null;
  const lat = v.latitude, lon = v.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { pt: [lon, lat], p: Number.isFinite(v.precision) && v.precision > 0 ? v.precision : null };
}
