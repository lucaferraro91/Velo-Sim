import { describe, it, expect } from 'vitest';
import { FTMS, CPS, HRS, CH, simBytes, ergBytes, ftmsToFec, fecMsg, fecUserConfig, parseFec, parseIndoorBike, parseClick, parseCyclingPower, describeCmd } from '../src/ble/protocol';

const dv = (a: number[]) => new DataView(new Uint8Array(a).buffer);
const xor = (m: number[]) => m.slice(0, -1).reduce((a, b) => a ^ b, 0);
const sim = (grade: number, k: number, v = 0) => simBytes(grade, k, { riderKg: 75, bikeKg: 8.5, crr: 0.004, cda: 0.32, v });
const rawGrade = (b: number[]) => (b[3] | (b[4] << 8)) << 16 >> 16;

describe('Bluetooth-Kennungen', () => {
  it('sind vollständige Text-UUIDs (für Bluefy auf dem iPad)', () => {
    expect(FTMS).toBe('00001826-0000-1000-8000-00805f9b34fb');
    expect(CPS).toBe('00001818-0000-1000-8000-00805f9b34fb');
    expect(HRS).toBe('0000180d-0000-1000-8000-00805f9b34fb');
    expect(CH.indoorBike).toBe('00002ad2-0000-1000-8000-00805f9b34fb');
    expect(CH.heartRate).toBe('00002a37-0000-1000-8000-00805f9b34fb');
    for (const u of [FTMS, CPS, HRS, ...Object.values(CH)]) expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('FTMS', () => {
  it('kodiert die Steigung im echten Gang unverändert (0,01 %, auf 0,1 % gerundet)', () => {
    const b = sim(0.05, 1);
    expect(b[0]).toBe(0x11);
    expect(rawGrade(b)).toBe(500);
    expect(b[5]).toBe(40);   // Crr 0,004 in 0,0001
    expect(b[6]).toBe(19);   // Cw 0,192 in 0,01 kg/m
    expect(describeCmd(b)).toMatch(/^Steigung 5[.,]0 %$/);   // de-CH nutzt den Punkt als Dezimalzeichen
  });
  it('kodiert negative Steigungen im Zweierkomplement', () => {
    expect(rawGrade(sim(-0.035, 1))).toBe(-350);
  });
  it('macht schwere Gänge strenger und leichte leichter', () => {
    const v = 8.3;   // 30 km/h
    expect(rawGrade(sim(0, 2, v))).toBeGreaterThan(rawGrade(sim(0, 1, v)));
    expect(rawGrade(sim(0, 0.5, v))).toBeLessThan(rawGrade(sim(0, 1, v)));
    expect(rawGrade(sim(0.2, 3, v))).toBe(2500);   // auf +25 % begrenzt
  });
  it('kodiert ERG-Ziele in Watt', () => {
    expect(ergBytes(250)).toEqual([0x05, 250, 0]);
    expect(ergBytes(1234)).toEqual([0x05, 1234 & 0xff, 1234 >> 8]);
    expect(describeCmd(ergBytes(250))).toBe('ERG 250 W');
  });
  it('liest Indoor Bike Data (Tempo, Kadenz, Leistung)', () => {
    // Flags: Kadenz (0x04) + Leistung (0x40); Tempo ist immer dabei (Bit 0 = 0)
    const d = parseIndoorBike(dv([0x44, 0x00, 0xB8, 0x0B, 0xAA, 0x00, 0xFA, 0x00]));
    expect(d).toEqual({ speed: 30, cadence: 85, power: 250 });
  });
  it('berechnet die Kadenz aus Cycling-Power-Kurbelumdrehungen', () => {
    const first = parseCyclingPower(dv([0x20, 0, 200, 0, 10, 0, 0x00, 0x00]), null, 0);
    expect(first.data.power).toBe(200);
    const second = parseCyclingPower(dv([0x20, 0, 210, 0, 11, 0, 0x00, 0x03]), first.prev, 750);   // 1 Umdrehung in 0,75 s
    expect(second.data.cadence).toBeCloseTo(80, 5);
  });
});

describe('Tacx FE-C', () => {
  it('baut ANT-Nachrichten mit XOR-Prüfsumme', () => {
    const m = fecMsg([0x31, 1, 2, 3, 4, 5, 6, 7]);
    expect(m.slice(0, 4)).toEqual([0xA4, 0x09, 0x4E, 0x05]);
    expect(m.length).toBe(13);
    expect(m[12]).toBe(xor(m));
  });
  it('übersetzt ERG in Seite 49 (0,25 W)', () => {
    const m = ftmsToFec(ergBytes(250));
    expect(m[4]).toBe(0x31);
    expect(m[10] | (m[11] << 8)).toBe(1000);
    expect(m[12]).toBe(xor(m));
  });
  it('übersetzt die Steigung in Seite 51 (0,01 %, Offset −200 %) mit Crr', () => {
    for (const [g, raw] of [[0.05, 20500], [-0.035, 19650], [0, 20000]] as const) {
      const m = ftmsToFec(sim(g, 1));
      expect(m[4]).toBe(0x33);
      expect(m[9] | (m[10] << 8)).toBe(raw);
      expect(m[11] * 0.00005).toBeCloseTo(0.004, 6);
      expect(m[12]).toBe(xor(m));
    }
  });
  it('hat für "Steuerung anfordern" kein Gegenstück', () => {
    expect(ftmsToFec([0x00])).toBeNull();
  });
  it('kodiert Fahrer- und Velogewicht auf Seite 55', () => {
    const m = fecUserConfig(75, 8.5);
    expect(m[4]).toBe(0x37);
    expect(m[5] | (m[6] << 8)).toBe(7500);
    expect(((m[8] >> 4) | (m[9] << 4)) * 0.05).toBeCloseTo(8.5, 6);
    expect(m[12]).toBe(xor(m));
  });
  it('liest Trainerdaten von Seite 25 und Tempo/Puls von Seite 16', () => {
    // Seite 25: Kadenz 90, Leistung 0x123 = 291 W
    expect(parseFec(dv(fecMsg([0x19, 0, 90, 0, 0, 0x23, 0x01, 0])))).toEqual({ cadence: 90, power: 291 });
    // Seite 16: Tempo 8333 mm/s = 30 km/h, Puls 140
    const d = parseFec(dv(fecMsg([0x10, 25, 0, 0, 8333 & 0xff, 8333 >> 8, 140, 0])));
    expect(d.speed).toBeCloseTo(30, 1); expect(d.hr).toBe(140);
  });
});

describe('Zwift Click', () => {
  it('liest Click v1 (Typ 0x37)', () => {
    expect(parseClick(dv([0x37, 0x08, 0x00, 0x10, 0x01]))).toEqual({ plus: true, minus: false });
    expect(parseClick(dv([0x37, 0x08, 0x01, 0x10, 0x01]))).toEqual({ plus: false, minus: false });
    expect(parseClick(dv([0x37, 0x08, 0x01, 0x10, 0x00]))).toEqual({ plus: false, minus: true });
  });
  it('liest Click v2 (Typ 0x23, Bitmaske, 0 = gedrückt)', () => {
    const enc = (v: number) => { const out = []; while (v > 127) { out.push((v & 127) | 128); v = Math.floor(v / 128); } out.push(v); return out; };
    expect(parseClick(dv([0x23, 0x08, ...enc(0x1FFF & ~0x1000)]))).toEqual({ plus: true, minus: false });
    expect(parseClick(dv([0x23, 0x08, ...enc(0x1FFF & ~0x100)]))).toEqual({ plus: false, minus: true });
    expect(parseClick(dv([0x23, 0x08, ...enc(0x1FFF)]))).toEqual({ plus: false, minus: false });
  });
  it('ignoriert Statusmeldungen', () => {
    expect(parseClick(dv([0x19, 0x10, 0x5d]))).toBeNull();
  });
});
