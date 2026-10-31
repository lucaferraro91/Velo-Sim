/* Bluetooth-Protokolle als reine Funktionen (ohne Gerätezugriff) – kodieren Befehle und
   werten Nachrichten aus. Dadurch lassen sie sich ohne Trainer testen. */
import { clamp, fmt1 } from '../util';

/* Alle Kennungen als vollständige Text-UUIDs: Der Standard erlaubt auch Zahlen (0x1826) und Namen
   ('heart_rate'), aber manche Browser – z.B. Bluefy auf dem iPad – können nur die Textform übersetzen
   ("request payload could not be parsed"). */
export const uuid16 = (n: number) => '0000' + n.toString(16).padStart(4, '0') + '-0000-1000-8000-00805f9b34fb';
export const FTMS = uuid16(0x1826), CPS = uuid16(0x1818), HRS = uuid16(0x180D);
export const CH = {
  indoorBike: uuid16(0x2AD2), ftmsFeature: uuid16(0x2ACC), ftmsControl: uuid16(0x2AD9),
  cyclingPower: uuid16(0x2A63), heartRate: uuid16(0x2A37)
};
export const TACX_FEC = '6e40fec1-b5a3-f393-e0a9-e50e24dcca9e';
export const TACX_RX = '6e40fec2-b5a3-f393-e0a9-e50e24dcca9e';
export const TACX_TX = '6e40fec3-b5a3-f393-e0a9-e50e24dcca9e';
export const ZW = (n: number) => '0000000' + n + '-19ca-4651-86e5-fa29dcdd09d1';
export const RIDE_ON = [0x52, 0x69, 0x64, 0x65, 0x4F, 0x6E];

export const OPNAMES: Record<number, string> = { 0x00: 'Steuerung anfordern', 0x05: 'ERG', 0x07: 'Start', 0x11: 'Steigung' };
export const RESNAMES: Record<number, string> = { 1: 'OK', 2: 'nicht unterstützt', 3: 'ungültiger Wert', 4: 'fehlgeschlagen', 5: 'keine Berechtigung' };

/* Steigungsmodus: FTMS Opcode 0x11 (Indoor Bike Simulation) mit virtuellem Gang.
   Der echte Gang bleibt fix (z.B. kleines Blatt + Zwift Cog). Mit k = virtuelle/echte
   Übersetzung muss der Trainer bei seiner Schwungradgeschwindigkeit vt = v/k die
   k-fache Kraft des virtuellen Velos erzeugen:
     F = k·m·g·(G + Crr) + k³·Cw·vt²
   Viele Trainer ignorieren die Felder für Roll- und Luftwiderstand, darum steckt der
   ganze Gang-Effekt in der gesendeten Steigung; Crr und Cw bleiben auf Standardwerten. */
export interface SimParams { riderKg: number; bikeKg: number; crr: number; cda: number; v: number; }
export function simBytes(grade: number, k: number, p: SimParams) {
  const m = p.riderKg + p.bikeKg, cw = 0.5 * 1.2 * p.cda, vt = p.v / k;
  const g = k * (grade + p.crr) - p.crr + (k * k * k - 1) * cw * vt * vt / (m * 9.81);
  const raw = Math.round(clamp(g, -0.15, 0.25) * 1000) * 10;   // 0,01 %, auf 0,1 % gerundet
  return [0x11, 0, 0, raw & 0xff, (raw >> 8) & 0xff, Math.round(p.crr * 10000), Math.round(cw * 100)];
}
// ERG-Modus: Opcode 0x05 (Target Power), der Trainer hält die Leistung unabhängig von der Kadenz
export function ergBytes(w: number) { w = clamp(Math.round(w), 0, 2000); return [0x05, w & 0xff, (w >> 8) & 0xff]; }

export function describeCmd(b: number[]) {
  if (b[0] === 0x11) { const raw = (b[3] | (b[4] << 8)) << 16 >> 16; return 'Steigung ' + fmt1(raw / 100) + ' %'; }
  if (b[0] === 0x05) return 'ERG ' + (b[1] | (b[2] << 8)) + ' W';
  if (b[0] === 0xA4) return b[4] === 0x37 ? 'Fahrer- und Velogewicht' : 'FE-C Seite ' + b[4];
  return OPNAMES[b[0]] || ('Opcode 0x' + b[0].toString(16));
}

/* Tacx FE-C über BLE: ANT+-FE-C-Datenseiten, verpackt in ANT-Nachrichten
   [A4, Länge 9, 4E (Broadcast), Kanal 5, 8 Byte Datenseite, XOR-Prüfsumme]. */
export function fecMsg(page: number[]) { const m = [0xA4, 0x09, 0x4E, 0x05, ...page]; let cs = 0; for (const b of m) cs ^= b; m.push(cs); return m; }
// Seite 55: Fahrergewicht (0,01 kg), Velogewicht (0,05 kg, 12 Bit), Raddurchmesser (0,01 m)
export function fecUserConfig(riderKg: number, bikeKg: number) {
  const uw = Math.round(riderKg * 100), bw = Math.round(bikeKg / 0.05) & 0xFFF;
  return fecMsg([0x37, uw & 0xff, (uw >> 8) & 0xff, 0xFF, (bw & 0x0F) << 4, bw >> 4, 70, 0x00]);
}
// FTMS-Befehl in FE-C übersetzen: ERG → Seite 49, Steigung → Seite 51; null = kein Gegenstück
export function ftmsToFec(bytes: number[]): number[] | null {
  if (bytes[0] === 0xA4) return bytes;
  if (bytes[0] === 0x05) { const w = (bytes[1] | (bytes[2] << 8)) * 4; return fecMsg([0x31, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, w & 0xff, (w >> 8) & 0xff]); }
  if (bytes[0] === 0x11) {
    const raw = ((bytes[3] | (bytes[4] << 8)) << 16 >> 16) + 20000;   // 0,01 %, Offset −200 %
    return fecMsg([0x33, 0xFF, 0xFF, 0xFF, 0xFF, raw & 0xff, (raw >> 8) & 0xff, Math.min(254, bytes[5] * 2)]);   // Crr in 5·10⁻⁵
  }
  return null;
}

export interface BikeData { power?: number; cadence?: number | null; speed?: number; hr?: number; }

export function parseFec(dv: DataView): BikeData | null {
  if (dv.byteLength < 13 || dv.getUint8(0) !== 0xA4) return null;
  const page = dv.getUint8(4), out: BikeData = {};
  if (page === 0x19) {            // Seite 25: Trainerdaten
    const cad = dv.getUint8(6), pw = dv.getUint8(9) | ((dv.getUint8(10) & 0x0F) << 8);
    out.cadence = cad === 0xFF ? null : cad;
    if (pw !== 0xFFF) out.power = pw;
  } else if (page === 0x10) {     // Seite 16: allgemeine Daten
    const sp = dv.getUint16(8, true), hr = dv.getUint8(10);
    if (sp !== 0xFFFF) out.speed = sp * 0.0036;
    if (hr !== 0xFF && hr) out.hr = hr;
  }
  return out;
}

// FTMS Indoor Bike Data (0x2AD2)
export function parseIndoorBike(dv: DataView): BikeData {
  const L = dv.byteLength, out: BikeData = {}; if (L < 2) return out;
  const f = dv.getUint16(0, true); let o = 2;
  const has = (n: number) => o + n <= L;
  if (!(f & 0x0001)) { if (!has(2)) return out; out.speed = dv.getUint16(o, true) / 100; o += 2; }
  if (f & 0x0002) o += 2;
  if (f & 0x0004) { if (!has(2)) return out; out.cadence = dv.getUint16(o, true) / 2; o += 2; }
  if (f & 0x0008) o += 2;
  if (f & 0x0010) o += 3;
  if (f & 0x0020) o += 2;
  if (f & 0x0040) { if (!has(2)) return out; out.power = dv.getInt16(o, true); o += 2; }
  if (f & 0x0080) o += 2;
  if (f & 0x0100) o += 5;
  if (f & 0x0200) { if (!has(1)) return out; out.hr = dv.getUint8(o); o += 1; }
  return out;
}

// Cycling Power Measurement (0x2A63); prev merkt sich die letzte Kurbelumdrehung für die Kadenz
export interface CrankPrev { revs: number; t: number; at: number; }
export function parseCyclingPower(dv: DataView, prev: CrankPrev | null, now: number): { data: BikeData; prev: CrankPrev | null } {
  if (dv.byteLength < 4) return { data: {}, prev };
  const f = dv.getUint16(0, true), data: BikeData = { power: dv.getInt16(2, true) };
  let o = 4;
  if (f & 0x01) o += 1; if (f & 0x04) o += 2; if (f & 0x10) o += 6;
  if ((f & 0x20) && o + 4 <= dv.byteLength) {
    const revs = dv.getUint16(o, true), t = dv.getUint16(o + 2, true);
    if (prev) {
      const dr = (revs - prev.revs + 65536) % 65536, dtt = ((t - prev.t + 65536) % 65536) / 1024;
      if (dr > 0 && dtt > 0) { data.cadence = dr * 60 / dtt; prev = { revs, t, at: now }; }
      else { if (now - prev.at > 2500) data.cadence = 0; prev = { ...prev, revs, t }; }
    } else prev = { revs, t, at: now };
  }
  return { data, prev };
}

export function parseHr(dv: DataView) { const f = dv.getUint8(0); return (f & 1) ? dv.getUint16(1, true) : dv.getUint8(1); }

/* Zwift Click: v1 meldet Typ 0x37 (Protobuf Feld 1 = Plus, Feld 2 = Minus, Wert 0 = gedrückt),
   v2 Typ 0x23 (Feld 1 = Bitmaske, 0x1000 = Plus, 0x100 = Minus, Bit 0 = gedrückt). */
function readVarint(dv: DataView, o: number): [number, number] | null {
  let v = 0, s = 0, b: number;
  do { if (o >= dv.byteLength) return null; b = dv.getUint8(o++); v += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80);
  return [v, o];
}
export function parseClick(dv: DataView): { plus: boolean; minus: boolean } | null {
  if (dv.byteLength < 2) return null;
  const type = dv.getUint8(0); let o = 1;
  if (type !== 0x37 && type !== 0x23) return null;
  const st = { plus: false, minus: false };
  while (o < dv.byteLength) {
    const t = readVarint(dv, o); if (!t) break; const tag = t[0]; o = t[1];
    if ((tag & 7) !== 0) break;                    // nur Varint-Felder
    const v = readVarint(dv, o); if (!v) break; o = v[1];
    const field = Math.floor(tag / 8);
    if (type === 0x37) { if (field === 1) st.plus = v[0] === 0; else if (field === 2) st.minus = v[0] === 0; }
    else if (field === 1) { st.plus = (v[0] & 0x1000) === 0; st.minus = (v[0] & 0x100) === 0; }
  }
  return st;
}
