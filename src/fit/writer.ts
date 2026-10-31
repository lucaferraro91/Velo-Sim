/* FIT-Aktivität schreiben (für Strava und Garmin Connect).
   Aufbau: file_id, event (Start), record je Sekunde, event (Stopp), lap, session, activity.
   Sportart Velo mit Untertyp "virtual_activity" (58), damit Strava die Fahrt als virtuelle Fahrt erkennt. */

export interface RecordSample {
  t: number;              // Sekunden seit Start (Fahrzeit)
  power: number; cadence: number; hr: number;
  speed: number;          // m/s
  dist: number;           // m
  alt: number;            // m
  lat?: number; lon?: number;
}
export interface Activity { start: Date; samples: RecordSample[]; ascent: number; energyJ: number; }

const FIT_EPOCH = 631065600;   // 1989-12-31T00:00:00Z in Unix-Sekunden
export const fitTime = (d: Date) => Math.round(d.getTime() / 1000) - FIT_EPOCH;

// CRC-16 nach FIT-Spezifikation
const CRC_TABLE = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];
export function fitCrc(bytes: Uint8Array, from = 0, to = bytes.length) {
  let crc = 0;
  for (let i = from; i < to; i++) {
    const b = bytes[i];
    let tmp = CRC_TABLE[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc = crc ^ tmp ^ CRC_TABLE[b & 0xF];
    tmp = CRC_TABLE[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xF];
  }
  return crc;
}

// Basistypen: [Code, Grösse, ungültiger Wert]
const T = {
  enum: [0x00, 1, 0xFF], u8: [0x02, 1, 0xFF], u16: [0x84, 2, 0xFFFF], s32: [0x85, 4, 0x7FFFFFFF],
  u32: [0x86, 4, 0xFFFFFFFF], u32z: [0x8C, 4, 0]
} as const;
type FieldDef = [num: number, type: readonly [number, number, number]];

class FitWriter {
  private out: number[] = [];
  private defs: Record<number, FieldDef[]> = {};
  define(local: number, gmn: number, fields: FieldDef[]) {
    this.defs[local] = fields;
    this.out.push(0x40 | local, 0, 0, gmn & 0xFF, gmn >> 8, fields.length);
    for (const [num, t] of fields) this.out.push(num, t[1], t[0]);
  }
  data(local: number, values: (number | null | undefined)[]) {
    this.out.push(local);
    this.defs[local].forEach(([, t], i) => {
      let v = values[i];
      if (v == null || !isFinite(v)) v = t[2];
      v = Math.round(v);
      for (let k = 0; k < t[1]; k++) this.out.push((v >>> (8 * k)) & 0xFF);   // little-endian
    });
  }
  bytes(): Uint8Array<ArrayBuffer> {
    const data = Uint8Array.from(this.out), file = new Uint8Array(14 + data.length + 2);
    const dv = new DataView(file.buffer);
    file[0] = 14; file[1] = 0x20; dv.setUint16(2, 2132, true); dv.setUint32(4, data.length, true);
    file.set([0x2E, 0x46, 0x49, 0x54], 8);           // ".FIT"
    dv.setUint16(12, fitCrc(file, 0, 12), true);
    file.set(data, 14);
    dv.setUint16(14 + data.length, fitCrc(file, 0, 14 + data.length), true);
    return file;
  }
}

const SEMI = 2 ** 31 / 180;   // Grad → Semikreise

export function encodeActivity(a: Activity): Uint8Array<ArrayBuffer> {
  const s = a.samples, w = new FitWriter();
  const t0 = fitTime(a.start), last = s.length ? s[s.length - 1] : null;
  const tEnd = t0 + (last ? Math.round(last.t) : 0);
  const timer = last ? last.t : 0, dist = last ? last.dist : 0;
  const avg = (k: keyof RecordSample) => s.length ? s.reduce((q, r) => q + (r[k] as number || 0), 0) / s.length : null;
  const max = (k: keyof RecordSample) => s.length ? Math.max(...s.map(r => r[k] as number || 0)) : null;
  const avgHr = s.some(r => r.hr) ? s.filter(r => r.hr).reduce((q, r) => q + r.hr, 0) / s.filter(r => r.hr).length : null;

  w.define(0, 0, [[0, T.enum], [1, T.u16], [2, T.u16], [3, T.u32z], [4, T.u32]]);              // file_id
  w.data(0, [4, 255, 1, 20261031, t0]);                                                     // Aktivität, Hersteller "development"
  w.define(1, 21, [[253, T.u32], [0, T.enum], [1, T.enum]]);                                // event
  w.data(1, [t0, 0, 0]);                                                                    // Timer Start
  w.define(2, 20, [[253, T.u32], [0, T.s32], [1, T.s32], [2, T.u16], [3, T.u8], [4, T.u8], [5, T.u32], [6, T.u16], [7, T.u16]]);   // record
  for (const r of s) {
    const hasPos = r.lat != null && r.lon != null;
    w.data(2, [t0 + Math.round(r.t), hasPos ? r.lat * SEMI : null, hasPos ? r.lon * SEMI : null,
      (r.alt + 500) * 5, r.hr || null, r.cadence, r.dist * 100, r.speed * 1000, r.power]);
  }
  w.data(1, [tEnd, 0, 4]);                                                                  // Timer Stopp (alle)
  const totals = [timer * 1000, timer * 1000, dist * 100];
  w.define(3, 19, [[253, T.u32], [254, T.u16], [0, T.enum], [1, T.enum], [2, T.u32], [7, T.u32], [8, T.u32], [9, T.u32],
    [13, T.u16], [14, T.u16], [15, T.u8], [16, T.u8], [17, T.u8], [18, T.u8], [19, T.u16], [20, T.u16], [21, T.u16]]);   // lap
  const stats = [avg('speed') * 1000, max('speed') * 1000, avgHr, max('hr') || null, avg('cadence'), max('cadence'), avg('power'), max('power'), a.ascent];
  w.data(3, [tEnd, 0, 9, 1, t0, ...totals, ...stats]);
  w.define(4, 18, [[253, T.u32], [254, T.u16], [0, T.enum], [1, T.enum], [2, T.u32], [5, T.enum], [6, T.enum], [7, T.u32], [8, T.u32], [9, T.u32],
    [11, T.u16], [14, T.u16], [15, T.u16], [16, T.u8], [17, T.u8], [18, T.u8], [19, T.u8], [20, T.u16], [21, T.u16], [22, T.u16], [25, T.u16], [26, T.u16]]);   // session
  w.data(4, [tEnd, 0, 8, 1, t0, 2, 58, ...totals, a.energyJ / 1000, ...stats, 0, 1]);    // Velo, virtuelle Aktivität; kcal ≈ kJ
  w.define(5, 34, [[253, T.u32], [0, T.u32], [1, T.u16], [2, T.enum], [3, T.enum], [4, T.enum], [5, T.u32]]);   // activity
  w.data(5, [tEnd, timer * 1000, 1, 0, 26, 1, tEnd - new Date().getTimezoneOffset() * 60]);
  return w.bytes();
}
