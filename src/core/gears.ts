import { clamp } from '../util';
import { settings } from '../settings';
import { state } from './state';

// Virtuelles Velo: Kettenblätter vorne und Kassette hinten, jede Kombination ist ein Gang
export const RINGS: Record<string, { name: string; t: number[] }> = {
  '50-34': { name: '50/34 Compact', t: [34, 50] },
  '52-36': { name: '52/36 Semi-Compact', t: [36, 52] },
  '53-39': { name: '53/39 Standard', t: [39, 53] },
  '48-35': { name: '48/35 (SRAM)', t: [35, 48] },
  '46-33': { name: '46/33 (SRAM)', t: [33, 46] },
  '40': { name: '1× 40', t: [40] },
  '42': { name: '1× 42', t: [42] }
};
export const CASSETTES: Record<string, { name: string; t: number[] }> = {
  '11-28/11': { name: '11–28, 11-fach', t: [11, 12, 13, 14, 15, 17, 19, 21, 23, 25, 28] },
  '11-30/11': { name: '11–30, 11-fach', t: [11, 12, 13, 14, 15, 17, 19, 21, 24, 27, 30] },
  '11-32/11': { name: '11–32, 11-fach', t: [11, 12, 13, 14, 16, 18, 20, 22, 25, 28, 32] },
  '11-34/11': { name: '11–34, 11-fach', t: [11, 13, 15, 17, 19, 21, 23, 25, 27, 30, 34] },
  '11-30/12': { name: '11–30, 12-fach (Shimano)', t: [11, 12, 13, 14, 15, 16, 17, 19, 21, 24, 27, 30] },
  '11-34/12': { name: '11–34, 12-fach (Shimano)', t: [11, 12, 13, 14, 15, 17, 19, 21, 24, 27, 30, 34] },
  '10-33/12': { name: '10–33, 12-fach (SRAM)', t: [10, 11, 12, 13, 14, 15, 17, 19, 21, 24, 28, 33] },
  '10-36/12': { name: '10–36, 12-fach (SRAM)', t: [10, 11, 12, 13, 15, 17, 19, 21, 24, 28, 32, 36] }
};
export const WHEEL = 2.105;   // Radumfang in m (700×25C)

export const rings = () => (RINGS[settings.rings] || RINGS['50-34']).t;          // klein → gross
export const cogs = () => (CASSETTES[settings.cassette] || CASSETTES['11-34/12']).t;  // klein → gross
export const ringT = () => rings()[clamp(state.front, 0, rings().length - 1)];
export const cogT = () => cogs()[clamp(state.rear, 0, cogs().length - 1)];
export const gearRatio = () => ringT() / cogT();
export const realRatio = () => settings.ring / settings.cog;
// Faktor zwischen virtuellem und echtem Gang: >1 = schwerer als der echte Gang
export const gearFactor = () => gearRatio() / realRatio();

// Gang suchen, der einer Übersetzung am nächsten kommt; mit keepFront wird das aktuelle Blatt bevorzugt
export function bestGear(rs: number[], cs: number[], ratio: number, front: number, keepFront: boolean) {
  let best = null;
  rs.forEach((r, fi) => cs.forEach((c, ri) => {
    let err = Math.abs(Math.log(r / c / ratio));
    if (keepFront && fi !== front) err += 0.08;
    if (!best || err < best.err) best = { err, front: fi, rear: ri };
  }));
  return { front: best.front, rear: best.rear };
}
export function pickGear(ratio: number, keepFront: boolean) {
  const g = bestGear(rings(), cogs(), ratio, state.front, keepFront);
  state.front = g.front; state.rear = g.rear;
}

/* Ein Gang schwerer (d>0) oder leichter (d<0). Synchro-Schaltung wie bei Shimano Di2:
   Würde die Kette kreuzen (kleines Blatt auf den 3 kleinsten Ritzeln, grosses Blatt auf
   den 2 grössten), wechselt vorne das Blatt und hinten das Ritzel, das den nächsten Gang
   in Schaltrichtung ergibt. Reine Funktion – fürs Testen ohne Zustand. */
export function nextGear(rs: number[], cs: number[], front: number, rear: number, d: number, synchro: boolean) {
  const n = cs.length, R = rs[front] / cs[rear];
  let f = front, r = clamp(rear - d, 0, n - 1);
  if (synchro && rs.length > 1) {
    if (d > 0 && front === 0 && rear - 1 < 3) {
      for (let i = n - 1; i >= 0; i--) if (rs[1] / cs[i] > R * 1.001) { f = 1; r = i; break; }
    } else if (d < 0 && front === 1 && rear + 1 > n - 3) {
      for (let i = 0; i < n; i++) if (rs[0] / cs[i] < R * 0.999) { f = 0; r = i; break; }
    }
  }
  return { front: f, rear: r };
}
