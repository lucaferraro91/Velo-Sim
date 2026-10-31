import { clamp, lerp, smoothstep } from '../util';

export const STEP = 5;   // Abstand der Routenpunkte in m
export const SEG = 2;    // Segmentlänge für die Geländeabfrage (SEG·STEP m)

export interface Geo { lat0: number; lon0: number; kx: number; kz: number; }
export interface Route {
  name: string; n: number;
  X: Float32Array; Z: Float32Array; E: Float32Array; G: Float32Array;   // Position (m), Höhe (m), Steigung (Anteil)
  total: number; climb: number; minE: number; maxE: number; maxG: number;
  geo?: Geo;   // nur bei GPX-Strecken: Rückrechnung auf Koordinaten
}
export interface Sample { x: number; z: number; e: number; g: number; }

function smoothArr(arr: Float32Array<ArrayBuffer>, rad: number, passes: number): Float32Array<ArrayBuffer> {
  let a = arr; const n = a.length;
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - rad), hi = Math.min(n - 1, i + rad); let s = 0;
      for (let k = lo; k <= hi; k++) s += a[k];
      out[i] = s / (hi - lo + 1);
    }
    a = out;
  }
  return a;
}

// raw: [{x,z,e}] in Metern → gleichmässig alle STEP m abgetastete, geglättete Route
export function buildRoute(raw: { x: number; z: number; e: number }[], name: string): Route {
  if (!raw.some(p => isFinite(p.e))) raw.forEach(p => p.e = 0);
  else {
    let last = null; for (const p of raw) { if (isFinite(p.e)) last = p.e; else if (last !== null) p.e = last; }
    const first = raw.find(p => isFinite(p.e)).e; for (const p of raw) { if (isFinite(p.e)) break; p.e = first; }
  }
  const pts = [raw[0]];
  for (let i = 1; i < raw.length; i++) { const q = pts[pts.length - 1]; if (Math.hypot(raw[i].x - q.x, raw[i].z - q.z) >= 0.5) pts.push(raw[i]); }
  if (pts.length < 2) throw new Error('Die Route enthält zu wenige unterschiedliche Punkte.');
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const len = cum[cum.length - 1];
  if (len < 300) throw new Error('Die Route ist kürzer als 300 m.');
  const n = Math.floor(len / STEP) + 1;
  let X = new Float32Array(n), Z = new Float32Array(n), E = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * STEP; while (j < pts.length - 2 && cum[j + 1] < s) j++;
    const t = clamp((s - cum[j]) / ((cum[j + 1] - cum[j]) || 1), 0, 1);
    X[i] = lerp(pts[j].x, pts[j + 1].x, t); Z[i] = lerp(pts[j].z, pts[j + 1].z, t); E[i] = lerp(pts[j].e, pts[j + 1].e, t);
  }
  X = smoothArr(X, 2, 2); Z = smoothArr(Z, 2, 2); E = smoothArr(E, 6, 3);
  const G = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2); G[i] = clamp((E[b] - E[a]) / (((b - a) || 1) * STEP), -0.25, 0.25); }
  let climb = 0, minE = Infinity, maxE = -Infinity, maxG = 0;
  for (let i = 0; i < n; i++) { if (i) climb += Math.max(0, E[i] - E[i - 1]); minE = Math.min(minE, E[i]); maxE = Math.max(maxE, E[i]); maxG = Math.max(maxG, G[i]); }
  return { name, n, X, Z, E, G, total: (n - 1) * STEP, climb, minE, maxE, maxG };
}

export function parseGPX(text: string): Route {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Die Datei ist kein gültiges GPX.');
  let nodes = Array.from(doc.getElementsByTagName('trkpt'));
  if (nodes.length < 2) nodes = Array.from(doc.getElementsByTagName('rtept'));
  if (nodes.length < 2) throw new Error('In der GPX-Datei wurden keine Track- oder Routenpunkte gefunden.');
  const ll = nodes.map(nd => { const el = nd.getElementsByTagName('ele')[0]; return { lat: parseFloat(nd.getAttribute('lat')), lon: parseFloat(nd.getAttribute('lon')), ele: el ? parseFloat(el.textContent) : NaN }; })
    .filter(p => isFinite(p.lat) && isFinite(p.lon));
  if (ll.length < 2) throw new Error('Die Koordinaten in der GPX-Datei sind ungültig.');
  const R = 6371000, lat0 = ll[0].lat, lon0 = ll[0].lon;
  const kx = Math.cos(lat0 * Math.PI / 180) * R * Math.PI / 180, kz = R * Math.PI / 180;
  const raw = ll.map(p => ({ x: (p.lon - lon0) * kx, z: -(p.lat - lat0) * kz, e: p.ele }));
  const nameEl = doc.getElementsByTagName('name')[0];
  const r = buildRoute(raw, (nameEl && nameEl.textContent.trim()) || 'GPX-Strecke');
  r.geo = { lat0, lon0, kx, kz };
  return r;
}

// Rückrechnung lokaler Meter auf Koordinaten (nur GPX-Strecken)
export const toLatLon = (geo: Geo, x: number, z: number): [number, number] => [geo.lat0 - z / geo.kz, geo.lon0 + x / geo.kx];

export function demoRoute(): Route {
  const raw = []; let h = 0.3, x = 0, z = 0;
  const L = 14000;
  for (let t = 0; t <= L; t += 10) {
    let k = 0.0035 * Math.sin(t / 700) + 0.005 * Math.sin(t / 310 + 1);
    if (t > 6000 && t < 8600) k += 0.014 * Math.sin((t - 6000) / 170);
    h += k * 10; x += Math.sin(h) * 10; z += Math.cos(h) * 10;
    const e = 430 + 240 * smoothstep(4500, 9200, t) - 170 * smoothstep(10400, 13600, t) + 10 * Math.sin(t / 420) + 16 * Math.sin(t / 1500);
    raw.push({ x, z, e });
  }
  return buildRoute(raw, 'Demo-Runde mit Anstieg');
}

export function sampleAt(route: Route, s: number, out: Partial<Sample> = {}): Sample {
  const f = clamp(s / STEP, 0, route.n - 1.0001), i = Math.floor(f), t = f - i;
  out.x = lerp(route.X[i], route.X[i + 1], t); out.z = lerp(route.Z[i], route.Z[i + 1], t);
  out.e = lerp(route.E[i], route.E[i + 1], t); out.g = lerp(route.G[i], route.G[i + 1], t);
  return out as Sample;
}
