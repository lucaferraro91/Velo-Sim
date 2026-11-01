// Gelände-Dienst: Höhen aus swissALTI3D (swisstopo, 2-m-Raster, Kacheln 1 × 1 km in LV95).
// Wird vom Telemetrie-Relais genutzt: Unreal fragt Raster oder Höhenprofile an, der Dienst lädt die
// nötigen Kacheln einmal herunter (Zwischenspeicher auf der Festplatte) und liefert die Höhen.
// Daten: © swisstopo, Open Government Data (https://www.swisstopo.admin.ch/de/nutzungsbedingungen-kostenlose-geodaten-und-geodienste)
// Höhen sind orthometrisch (LN02, "über Meer"); ausserhalb der Schweiz liefert der Dienst null.
import { fromArrayBuffer } from 'geotiff';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const STAC = 'https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissalti3d/items';

// WGS84 → LV95 (Näherungsformeln von swisstopo, Genauigkeit ca. 1 m)
export function wgsToLv95(lon, lat) {
  const p = (lat * 3600 - 169028.66) / 10000, l = (lon * 3600 - 26782.5) / 10000;
  const E = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l * l * l;
  const N = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p * p * p;
  return [E, N];
}

// LV95 → WGS84 (Näherung), z.B. für die Abfrage der Kachel-Liste
export function lv95ToWgs(E, N) {
  const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
  const l = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const p = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x * x * x;
  return [l * 100 / 36, p * 100 / 36];
}

// Lokale Meter der Web-App (x = Osten, z = Süden) → Länge/Breite (wie toLatLon in src/core/route.ts)
export const localToLonLat = (g, x, z) => [g.lon0 + x / g.kx, g.lat0 - z / g.kz];

const defaultCache = () => join(process.env.LOCALAPPDATA || join(homedir(), '.cache'), 'velo-sim', 'swissalti3d');

export class SwissAlti {
  constructor({ cacheDir = defaultCache(), maxTiles = 150, log = console.log } = {}) {
    this.cacheDir = cacheDir; this.maxTiles = maxTiles; this.log = log;
    this.tiles = new Map();      // "E-N" (km) → Kachel oder null (keine Daten)
    this.loading = new Map();    // laufende Downloads
  }

  // Kachel mit Ecke (E, N) in km laden: Festplatte → sonst STAC-Abfrage + Download
  async tile(ek, nk) {
    const key = ek + '-' + nk;
    if (this.tiles.has(key)) { const t = this.tiles.get(key); this.tiles.delete(key); this.tiles.set(key, t); return t; }   // zuletzt benutzt ans Ende
    if (this.loading.has(key)) return this.loading.get(key);
    const p = this.loadTile(ek, nk).then(t => {
      this.loading.delete(key); this.tiles.set(key, t);
      while (this.tiles.size > this.maxTiles) this.tiles.delete(this.tiles.keys().next().value);
      return t;
    }).catch(e => { this.loading.delete(key); this.log(`swissALTI3D ${key}: ${e.message}`); return null; });
    this.loading.set(key, p);
    return p;
  }

  async loadTile(ek, nk) {
    const file = join(this.cacheDir, `${ek}-${nk}.tif`), none = file + '.none';
    let buf = null;
    if (existsSync(none)) return null;
    if (existsSync(file)) buf = (await readFile(file)).buffer;
    else {
      // Jüngste Ausgabe der Kachel über die STAC-Schnittstelle suchen (bbox in WGS84 um die Kachelmitte)
      const [lon, lat] = lv95ToWgs(ek * 1000 + 500, nk * 1000 + 500);
      const url = `${STAC}?bbox=${lon - 0.0005},${lat - 0.0005},${lon + 0.0005},${lat + 0.0005}&limit=50`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('STAC ' + res.status);
      const items = (await res.json()).features.filter(f => f.id.endsWith(`_${ek}-${nk}`));
      items.sort((a, b) => String(b.properties.datetime).localeCompare(String(a.properties.datetime)));
      const asset = items.length && Object.values(items[0].assets).find(a => /_2_2056_5728\.tif$/.test(a.href));
      await mkdir(this.cacheDir, { recursive: true });
      if (!asset) { await writeFile(none, ''); return null; }   // ausserhalb der Schweiz
      const tif = await fetch(asset.href);
      if (!tif.ok) throw new Error('Download ' + tif.status);
      buf = await tif.arrayBuffer();
      await writeFile(file, Buffer.from(buf));
      this.log(`swissALTI3D: Kachel ${ek}-${nk} geladen (${items[0].id})`);
    }
    const image = await (await fromArrayBuffer(buf)).getImage();
    const [data] = await image.readRasters();
    const [ox, oy] = image.getOrigin(), [rx, ry] = image.getResolution();
    const nodata = image.getGDALNoData();
    return { data, w: image.getWidth(), h: image.getHeight(), ox, oy, rx, ry, nodata };
  }

  // Höhe (bilinear) an LV95-Koordinaten; null ohne Daten
  async heightLv95(E, N) {
    const t = await this.tile(Math.floor(E / 1000), Math.floor(N / 1000));
    if (!t) return null;
    const fx = (E - t.ox) / t.rx - 0.5, fy = (N - t.oy) / t.ry - 0.5;   // Pixelmitten
    const x0 = Math.max(0, Math.min(t.w - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(t.h - 2, Math.floor(fy)));
    const ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0));
    const v = (x, y) => t.data[y * t.w + x];
    const a = v(x0, y0), b = v(x0 + 1, y0), c = v(x0, y0 + 1), d = v(x0 + 1, y0 + 1);
    if ([a, b, c, d].some(h => h == null || h === t.nodata || h < -1000)) return null;
    return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
  }

  heightWgs(lon, lat) { const [E, N] = wgsToLv95(lon, lat); return this.heightLv95(E, N); }

  // Anfragen beantworten (Format: docs/telemetrie.md, Abschnitt Gelände)
  async handle(msg) {
    const round = h => h == null ? null : Math.round(h * 100) / 100;
    if (msg.type === 'terrain-request') {
      const g = msg.grid, out = new Array(g.nx * g.nz);
      for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
        const [lon, lat] = localToLonLat(g, g.x0 + i * g.step, g.z0 + j * g.step);
        out[j * g.nx + i] = round(await this.heightWgs(lon, lat));
      }
      return { type: 'terrain-chunk', id: msg.id, nx: g.nx, nz: g.nz, heights: out };
    }
    if (msg.type === 'terrain-profile') {
      const p = msg.points, out = new Array(p.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = round(await this.heightWgs(p[i * 2], p[i * 2 + 1]));
      return { type: 'terrain-profile-result', id: msg.id, heights: out };
    }
    return null;
  }
}
