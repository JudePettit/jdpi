// SIGINT Dashboard: satellite pass prediction (pure). The search works on any function that gives azimuth and
// elevation for a time, so it can be tested without an orbit model; makeLookAt() wires it to satellite.js (SGP4).

/**
 * Find passes above `horizon` degrees between start and start + hours.
 * lookAt(ms) → { az, el } in degrees (el NaN or null when the orbit can't be propagated).
 * Returns [{ aos, los, tca, maxEl, aosAz, losAz, tcaAz, duration (s), inProgress, truncated }], times in ms.
 */
export function findPasses(lookAt, { start = Date.now(), hours = 24, stepSec = 60, minEl = 0, horizon = 0, maxPasses = 40 } = {}) {
  const end = start + hours * 3600e3, step = stepSec * 1000;
  const el = t => { const v = lookAt(t)?.el; return Number.isFinite(v) ? v : -90; };
  const passes = [];
  let t = start, prev = el(t), aos = prev > horizon ? start : null, best = aos != null ? { t: start, el: prev } : null;
  while (t < end && passes.length < maxPasses) {
    const t2 = Math.min(end, t + step), e2 = el(t2);
    if (aos == null && e2 > horizon) {
      aos = bisect(el, t, t2, horizon, true);
      best = { t: t2, el: e2 };
    } else if (aos != null) {
      if (e2 > best.el) best = { t: t2, el: e2 };
      if (e2 <= horizon) {
        const los = bisect(el, t, t2, horizon, false);
        pushPass(passes, lookAt, el, aos, los, best, step, start, end, minEl);
        aos = null; best = null;
      }
    }
    t = t2; prev = e2;
  }
  if (aos != null && passes.length < maxPasses) pushPass(passes, lookAt, el, aos, end, best, step, start, end, minEl);
  return passes;
}
function pushPass(out, lookAt, el, aos, los, best, step, start, end, minEl) {
  const lo = Math.max(aos, best.t - step), hi = Math.min(los, best.t + step);
  const tca = goldenMax(el, lo, hi);
  const maxEl = el(tca);
  if (maxEl < minEl) return;
  const az = t => { const v = lookAt(t)?.az; return Number.isFinite(v) ? ((v % 360) + 360) % 360 : null; };
  out.push({ aos, los, tca, maxEl, aosAz: az(aos), losAz: az(los), tcaAz: az(tca), duration: (los - aos) / 1000, inProgress: aos <= start, truncated: los >= end });
}
/** Time where el crosses `level` between a and b, to about a second. */
function bisect(el, a, b, level, rising) {
  for (let i = 0; i < 24 && b - a > 500; i++) {
    const m = (a + b) / 2, above = el(m) > level;
    if (above === rising) b = m; else a = m;
  }
  return Math.round((a + b) / 2);
}
/** Golden-section search for the maximum of a unimodal function on [a, b]. */
function goldenMax(f, a, b) {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  for (let i = 0; i < 40 && b - a > 500; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return Math.round((a + b) / 2);
}
/** Points along a pass for a sky plot. */
export function passTrack(lookAt, pass, points = 48) {
  const out = [];
  for (let i = 0; i <= points; i++) {
    const t = pass.aos + (pass.los - pass.aos) * (i / points);
    const p = lookAt(t);
    if (p && Number.isFinite(p.el) && Number.isFinite(p.az)) out.push({ t, az: ((p.az % 360) + 360) % 360, el: Math.max(0, p.el) });
  }
  return out;
}
/** Sky-plot projection: azimuth/elevation to x/y in a circle of radius r centred on (cx, cy); zenith at the centre, north up. */
export function skyXY(az, el, r, cx = 0, cy = 0) {
  const rr = r * (90 - Math.max(0, Math.min(90, el))) / 90, a = az * Math.PI / 180;
  return { x: cx + rr * Math.sin(a), y: cy - rr * Math.cos(a) };
}

/* ---- satellite.js adapter ------------------------------------------------------------------------------------------ */
/** Mean motion in revolutions per day → orbit class. */
export function orbitClass(omm) {
  const mm = Number(omm?.MEAN_MOTION);
  if (!Number.isFinite(mm)) return 'unknown';
  if (mm > 0.95 && mm < 1.05 && Number(omm.ECCENTRICITY ?? 0) < 0.01) return 'geo';
  if (mm >= 11) return 'leo';
  return mm >= 1.8 ? 'meo' : 'heo';
}
/** An SGP4 satellite record from CelesTrak OMM JSON using satellite.js (json2satrec in v6+). */
export function satrecFromOmm(sat, omm) {
  if (typeof sat.json2satrec === 'function') return sat.json2satrec(omm);
  throw new Error('satellite.js without json2satrec');
}
/**
 * lookAt(ms) for one satellite and one observer ({ lat, lon } degrees, heightKm). Uses satellite.js:
 * propagate → gstime → eciToEcf → ecfToLookAngles. Caches nothing, so call it freely.
 */
export function makeLookAt(sat, satrec, observer) {
  const gd = { latitude: observer.lat * Math.PI / 180, longitude: observer.lon * Math.PI / 180, height: observer.heightKm ?? 0.05 };
  return ms => {
    const d = new Date(ms);
    const pv = sat.propagate(satrec, d);
    const pos = pv && pv.position;
    if (!pos || typeof pos !== 'object' || !Number.isFinite(pos.x)) return { az: NaN, el: NaN };
    const ecf = sat.eciToEcf(pos, sat.gstime(d));
    const la = sat.ecfToLookAngles(gd, ecf);
    return { az: la.azimuth * 180 / Math.PI, el: la.elevation * 180 / Math.PI, rangeKm: la.rangeSat };
  };
}
/** Sub-satellite point (degrees) at a time, for maps. */
export function subPoint(sat, satrec, ms) {
  const d = new Date(ms);
  const pv = sat.propagate(satrec, d);
  if (!pv?.position || !Number.isFinite(pv.position.x)) return null;
  const g = sat.eciToGeodetic(pv.position, sat.gstime(d));
  return { lat: g.latitude * 180 / Math.PI, lon: g.longitude * 180 / Math.PI, heightKm: g.height };
}
