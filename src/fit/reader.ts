// Minimaler FIT-Leser: Definitions- und Datennachrichten, beide Byte-Reihenfolgen, komprimierte Zeitstempel
export interface FitMessage { gmn: number; f: Record<number, any>; }

export function parseFIT(buf: ArrayBuffer): FitMessage[] {
  const dv = new DataView(buf);
  if (dv.byteLength < 14) throw new Error('Die FIT-Datei ist zu kurz.');
  const hs = dv.getUint8(0), size = dv.getUint32(4, true);
  if (String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11)) !== '.FIT') throw new Error('Die Datei ist keine gültige FIT-Datei.');
  const SZ = [1, 1, 1, 2, 2, 4, 4, 1, 4, 8, 1, 2, 4, 1, 8, 8, 8];
  const val = (type: number, at: number, sz: number, le: boolean) => {
    const b = type & 0x1F;
    if (b === 7) { const bytes = new Uint8Array(buf, at, sz); let n = bytes.indexOf(0); if (n < 0) n = sz; return new TextDecoder().decode(bytes.subarray(0, n)) || null; }
    if (sz < SZ[b]) return null;
    let v: number;
    switch (b) {
      case 0: case 2: case 13: v = dv.getUint8(at); return v === 0xFF ? null : v;
      case 10: v = dv.getUint8(at); return v === 0 ? null : v;
      case 1: v = dv.getInt8(at); return v === 0x7F ? null : v;
      case 3: v = dv.getInt16(at, le); return v === 0x7FFF ? null : v;
      case 4: v = dv.getUint16(at, le); return v === 0xFFFF ? null : v;
      case 11: v = dv.getUint16(at, le); return v === 0 ? null : v;
      case 5: v = dv.getInt32(at, le); return v === 0x7FFFFFFF ? null : v;
      case 6: v = dv.getUint32(at, le); return v === 0xFFFFFFFF ? null : v;
      case 12: v = dv.getUint32(at, le); return v === 0 ? null : v;
      case 8: return dv.getFloat32(at, le);
      default: return null;
    }
  };
  const end = Math.min(dv.byteLength, hs + size), defs: Record<number, any> = {}, msgs: FitMessage[] = [];
  let o = hs;
  while (o < end) {
    const h = dv.getUint8(o++);
    if (!(h & 0x80) && (h & 0x40)) {                  // Definitionsnachricht
      const lt = h & 0x0F; o++;
      const le = dv.getUint8(o++) === 0, gmn = dv.getUint16(o, le); o += 2;
      const nf = dv.getUint8(o++), fields = [];
      for (let i = 0; i < nf; i++, o += 3) fields.push({ num: dv.getUint8(o), size: dv.getUint8(o + 1), type: dv.getUint8(o + 2) });
      let dev = 0;
      if (h & 0x20) { const nd = dv.getUint8(o++); for (let i = 0; i < nd; i++, o += 3) dev += dv.getUint8(o + 1); }
      defs[lt] = { gmn, le, fields, dev };
    } else {                                          // Datennachricht
      const d = defs[(h & 0x80) ? (h >> 5) & 3 : h & 0x0F];
      if (!d) throw new Error('Die FIT-Datei ist beschädigt.');
      const f: Record<number, any> = {};
      for (const fd of d.fields) { f[fd.num] = val(fd.type, o, fd.size, d.le); o += fd.size; }
      o += d.dev; msgs.push({ gmn: d.gmn, f });
    }
  }
  return msgs;
}
