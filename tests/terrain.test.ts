import { describe, it, expect } from 'vitest';
// @ts-ignore – Node-Werkzeug als .mjs
import { wgsToLv95, lv95ToWgs, localToLonLat } from '../tools/terrain.mjs';

describe('Gelände-Dienst: Koordinaten', () => {
  it('rechnet WGS84 → LV95 (Referenzpunkt von swisstopo, ca. 1 m genau)', () => {
    // swisstopo-Beispiel: 46°02'38.87" N, 8°43'49.79" E → E 2 699 999.76, N 1 099 999.97
    const [E, N] = wgsToLv95(8 + 43 / 60 + 49.79 / 3600, 46 + 2 / 60 + 38.87 / 3600);
    expect(E).toBeCloseTo(2699999.76, 0);
    expect(N).toBeCloseTo(1099999.97, 0);
  });
  it('rechnet LV95 → WGS84 und zurück (unter 1 m)', () => {
    for (const [E, N] of [[2600000, 1200000], [2680000, 1245000], [2750000, 1150000]]) {
      const [lon, lat] = lv95ToWgs(E, N);
      const [E2, N2] = wgsToLv95(lon, lat);
      expect(Math.abs(E2 - E)).toBeLessThan(1);
      expect(Math.abs(N2 - N)).toBeLessThan(1);
    }
  });
  it('rechnet lokale Meter der Web-App wie toLatLon in route.ts zurück', () => {
    const g = { lat0: 47, lon0: 8, kx: 75000, kz: 111000 };
    expect(localToLonLat(g, 750, -1110)).toEqual([8.01, 47.01]);
  });
});
