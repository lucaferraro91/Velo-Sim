// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { parseGPX } from '../src/core/route';
import { parseZWO, parseERG, parseGarminFIT } from '../src/workouts/formats';
import { segWatts } from '../src/workouts/model';
import { blocksToWorkout, blocksToZwo, newBlock } from '../src/workouts/blocks';

const FTP = 250;

describe('GPX', () => {
  it('liest Trackpunkte, Höhen und Namen', () => {
    let pts = '', lat = 47.35, lon = 8.49, e = 470;
    for (let i = 0; i < 200; i++) { lat += 0.00005; lon += 0.00005; e += 0.5; pts += `<trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"><ele>${e}</ele></trkpt>`; }
    const r = parseGPX(`<?xml version="1.0"?><gpx version="1.1"><trk><name>Testrunde</name><trkseg>${pts}</trkseg></trk></gpx>`);
    expect(r.name).toBe('Testrunde');
    expect(r.total).toBeGreaterThan(1200);
    expect(r.total).toBeLessThan(1400);
    expect(r.climb).toBeGreaterThan(80);
    expect(r.geo.lat0).toBeCloseTo(47.35005, 5);
  });
  it('meldet zu kurze Strecken', () => {
    expect(() => parseGPX('<gpx><trk><trkseg><trkpt lat="47" lon="8"/><trkpt lat="47.0001" lon="8"/></trkseg></trk></gpx>')).toThrow(/kürzer als 300 m/);
  });
});

describe('Zwift .zwo', () => {
  const zwo = `<workout_file><name>Sweet Spot</name><workout>
    <Warmup Duration="300" PowerLow="0.45" PowerHigh="0.75"><textevent timeoffset="5" message="Locker einrollen"/></Warmup>
    <SteadyState Duration="120" Power="0.65"/>
    <IntervalsT Repeat="3" OnDuration="480" OffDuration="180" OnPower="0.90" OffPower="0.55"/>
    <FreeRide Duration="120" FlatRoad="1"/>
    <Cooldown Duration="300" PowerLow="0.65" PowerHigh="0.40"/>
  </workout></workout_file>`;
  it('liest alle Blocktypen und Wiederholungen', () => {
    const w = parseZWO(zwo);
    expect(w.name).toBe('Sweet Spot');
    expect(w.segs.length).toBe(10);
    expect(w.total).toBe(300 + 120 + 3 * 660 + 120 + 300);
    expect(w.msgs).toEqual([{ at: 5, text: 'Locker einrollen' }]);
    expect(segWatts(w.segs[0], 5, FTP)).toBeCloseTo((0.45 + 0.3 * 5 / 300) * FTP, 6);   // Rampe
    expect(segWatts(w.segs[2], 0, FTP)).toBeCloseTo(225, 6);
    expect(w.segs[8].free).toBe(true);
  });
});

describe('ERG/MRC (Rouvy)', () => {
  it('liest MRC in % FTP mit Sprüngen und Texten', () => {
    const w = parseERG(`[COURSE HEADER]\nDESCRIPTION = Rouvy 4x4\nMINUTES PERCENT\n[END COURSE HEADER]\n[COURSE DATA]\n0\t50\n10\t75\n10\t115\n14\t115\n14\t55\n18\t55\n[END COURSE DATA]\n[COURSE TEXT]\n600\tJetzt gilt es!\t10\n[END COURSE TEXT]`);
    expect(w.name).toBe('Rouvy 4x4');
    expect(w.segs.length).toBe(3);
    expect(w.segs[0].ramp).toBe(true);
    expect(segWatts(w.segs[1], 0, FTP)).toBeCloseTo(287.5, 6);
    expect(w.total).toBe(18 * 60);
    expect(w.msgs[0]).toEqual({ at: 600, text: 'Jetzt gilt es!' });
  });
  it('rechnet ERG mit FTP im Kopf relativ zur eigenen FTP', () => {
    const w = parseERG(`[COURSE HEADER]\nFTP = 300\nMINUTES WATTS\n[END COURSE HEADER]\n[COURSE DATA]\n0\t150\n5\t150\n5\t270\n15\t270\n[END COURSE DATA]`, 'ss.erg');
    expect(segWatts(w.segs[1], 0, FTP)).toBeCloseTo(225, 6);
  });
  it('nimmt ERG ohne FTP als feste Watt', () => {
    const w = parseERG(`[COURSE HEADER]\nMINUTES WATTS\n[END COURSE HEADER]\n[COURSE DATA]\n0\t200\n5\t200\n[END COURSE DATA]`);
    expect(segWatts(w.segs[0], 0, FTP)).toBeCloseTo(200, 6);
  });
});

// Kleine FIT-Workout-Datei bauen: workout (26) + workout_steps (27)
function fitWorkout() {
  const bytes: number[] = [];
  const u8 = (v: number) => bytes.push(v & 255), u16 = (v: number) => { u8(v); u8(v >> 8); }, u32 = (v: number) => { u16(v & 0xffff); u16(v >>> 16); };
  const str = (s: string, n: number) => { const b = new TextEncoder().encode(s); for (let i = 0; i < n; i++) u8(i < b.length ? b[i] : 0); };
  u8(0x40); u8(0); u8(0); u16(26); u8(1); u8(8); u8(16); u8(7);
  u8(0x41); u8(0); u8(0); u16(27); u8(9);
  for (const [n, s, t] of [[254, 2, 0x84], [0, 16, 7], [1, 1, 0], [2, 4, 0x86], [3, 1, 0], [4, 4, 0x86], [5, 4, 0x86], [6, 4, 0x86], [7, 1, 0]]) { u8(n); u8(s); u8(t); }
  u8(0x00); str('Garmin Schwelle', 16);
  const step = (i: number, name: string, dt: number, dv: number, tt: number, tv: number, lo: number, hi: number, int: number) => { u8(0x01); u16(i); str(name, 16); u8(dt); u32(dv); u8(tt); u32(tv); u32(lo); u32(hi); u8(int); };
  step(0, 'Einfahren', 0, 600000, 4, 0, 50, 65, 2);     // 10 min, 50–65 % FTP
  step(1, 'Schwelle', 0, 300000, 4, 0, 1200, 1220, 5);  // 5 min, 200–220 W
  step(2, 'Pause', 0, 180000, 4, 2, 0, 0, 1);           // 3 min, Zone 2
  step(3, '', 6, 1, 0, 3, 0, 0, 0);                     // ab Schritt 1 wiederholen, 3×
  step(4, 'Ausfahren', 5, 0, 2, 0, 0, 0, 3);            // offen
  const data = new Uint8Array(bytes), file = new Uint8Array(14 + data.length + 2), hv = new DataView(file.buffer);
  file[0] = 14; file[1] = 0x20; hv.setUint16(2, 2100, true); hv.setUint32(4, data.length, true); file.set([46, 70, 73, 84], 8); file.set(data, 14);
  return file.buffer;
}

describe('Garmin .fit-Workout', () => {
  it('liest Schritte, Wattbereiche, Zonen, Wiederholungen und offene Schritte', () => {
    const w = parseGarminFIT(fitWorkout());
    expect(w.name).toBe('Garmin Schwelle');
    expect(w.segs.map(s => s.label)).toEqual(['Einfahren', 'Schwelle', 'Pause', 'Schwelle', 'Pause', 'Schwelle', 'Pause', 'Ausfahren']);
    expect(w.total).toBe(600 + 3 * (300 + 180) + 600);
    expect(segWatts(w.segs[0], 0, FTP)).toBeCloseTo(0.575 * FTP, 6);   // Mitte von 50–65 %
    expect(segWatts(w.segs[1], 0, FTP)).toBeCloseTo(210, 6);           // Mitte von 200–220 W
    expect(segWatts(w.segs[2], 0, FTP)).toBeCloseTo(0.65 * FTP, 6);    // Zone 2
    expect(w.segs[7].open).toBe(true);
  });
  it('lehnt Aktivitäten ohne Workout ab', () => {
    const buf = new Uint8Array(16); buf[0] = 14; buf.set([46, 70, 73, 84], 8);
    expect(() => parseGarminFIT(buf.buffer)).toThrow(/kein Workout/);
  });
});

describe('Workout-Editor', () => {
  it('erzeugt Intervalle N× Belastung/Erholung', () => {
    const iv = { ...newBlock('intervals'), reps: 8, onDur: 60, onP: 1.3, offDur: 90, offP: 0.55 };
    const w = blocksToWorkout('8x1', [newBlock('warmup'), iv, newBlock('steady'), newBlock('cooldown')]);
    expect(w.total).toBe(600 + 8 * 150 + 300 + 300);
    expect(w.segs.filter(s => s.part === 'on').length).toBe(8);
  });
  it('exportiert eine .zwo-Datei, die wieder gleich eingelesen wird', () => {
    const blocks = [newBlock('warmup'), { ...newBlock('intervals'), reps: 4 }, newBlock('free'), newBlock('cooldown')];
    const a = blocksToWorkout('Rundreise <&>', blocks), b = parseZWO(blocksToZwo('Rundreise <&>', blocks));
    expect(b.name).toBe('Rundreise <&>');
    expect(b.total).toBe(a.total);
    expect(b.segs.map(s => [s.dur, s.free ? null : segWatts(s, 0, FTP)])).toEqual(a.segs.map(s => [s.dur, s.free ? null : expect.closeTo(segWatts(s, 0, FTP), 6)]));
  });
});
