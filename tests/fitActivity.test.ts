import { describe, it, expect } from 'vitest';
import { encodeActivity, fitCrc, fitTime, type RecordSample } from '../src/fit/writer';
import { parseFIT } from '../src/fit/reader';

function samples(n: number, withPos: boolean): RecordSample[] {
  return Array.from({ length: n }, (_, i) => ({
    t: i, power: 200 + (i % 10), cadence: 85, hr: i ? 140 : 0, speed: 8.33, dist: i * 8.33, alt: 450 + i * 0.1,
    ...(withPos ? { lat: 47.35 + i * 0.0001, lon: 8.49 - i * 0.0001 } : {})
  }));
}

describe('FIT-Aktivität (Export für Strava/Garmin)', () => {
  const start = new Date('2026-10-31T17:00:00Z');
  const file = encodeActivity({ start, samples: samples(120, true), ascent: 12, energyJ: 120 * 205 });

  it('hat einen gültigen Kopf und gültige Prüfsummen', () => {
    expect(file[0]).toBe(14);
    expect(String.fromCharCode(...file.slice(8, 12))).toBe('.FIT');
    expect(fitCrc(file, 0, 14)).toBe(0);              // CRC über Kopf inkl. Kopf-CRC ergibt 0
    expect(fitCrc(file)).toBe(0);                     // CRC über die ganze Datei inkl. Datei-CRC ergibt 0
    expect(new DataView(file.buffer).getUint32(4, true)).toBe(file.length - 16);
  });

  it('lässt sich mit dem eigenen FIT-Leser zurücklesen', () => {
    const msgs = parseFIT(file.buffer);
    const by = (g: number) => msgs.filter(m => m.gmn === g);
    expect(by(0)[0].f[0]).toBe(4);                    // file_id: Aktivität
    const rec = by(20);
    expect(rec.length).toBe(120);
    expect(rec[0].f[253]).toBe(fitTime(start));
    expect(rec[119].f[253]).toBe(fitTime(start) + 119);
    expect(rec[10].f[7]).toBe(200);                   // Leistung
    expect(rec[10].f[4]).toBe(85);                    // Kadenz
    expect(rec[10].f[3]).toBe(140);                   // Puls
    expect(rec[10].f[6] / 1000).toBeCloseTo(8.33, 3); // Tempo
    expect(rec[10].f[5] / 100).toBeCloseTo(83.3, 1);  // Distanz
    expect(rec[10].f[2] / 5 - 500).toBeCloseTo(451, 1);   // Höhe
    expect(rec[10].f[0] * 180 / 2 ** 31).toBeCloseTo(47.351, 5);   // Breite
    expect(rec[10].f[1] * 180 / 2 ** 31).toBeCloseTo(8.489, 5);    // Länge
    expect(rec[0].f[3]).toBeNull();                   // kein Puls = ungültig
    const ses = by(18)[0];
    expect(ses.f[5]).toBe(2);                         // Velo
    expect(ses.f[6]).toBe(58);                        // virtuelle Aktivität
    expect(ses.f[8] / 1000).toBe(119);                // Fahrzeit
    expect(ses.f[20]).toBe(205);                      // Durchschnittsleistung (200…209 → 204,5)
    expect(ses.f[22]).toBe(12);                       // Höhenmeter
    expect(by(19).length).toBe(1);                    // lap
    expect(by(34)[0].f[1]).toBe(1);                   // activity: 1 Session
    expect(by(21).map(m => m.f[1])).toEqual([0, 4]);  // Timer Start und Stopp
  });

  it('wird von einem unabhängigen FIT-Parser (fit-file-parser) fehlerfrei gelesen', async () => {
    const { default: FitParser } = await import('fit-file-parser');
    const parser = new FitParser({ force: false, speedUnit: 'km/h', lengthUnit: 'km', mode: 'list' });
    const data: any = await new Promise((resolve, reject) =>
      parser.parse(Buffer.from(file), (err: any, d: any) => err ? reject(err) : resolve(d)));
    expect(data.records.length).toBe(120);
    expect(data.records[10].power).toBe(200);
    expect(data.records[10].heart_rate).toBe(140);
    expect(data.records[10].speed).toBeCloseTo(30, 0);
    expect(data.records[10].position_lat).toBeCloseTo(47.351, 4);
    expect(data.sessions[0].sport).toBe('cycling');
    expect(data.sessions[0].sub_sport).toBe('virtual_activity');
    expect(data.sessions[0].avg_power).toBe(205);
    expect(data.activity?.num_sessions ?? data.activities?.[0]?.num_sessions).toBe(1);
  });

  it('lässt die Position bei Strecken ohne Koordinaten weg', () => {
    const f = encodeActivity({ start, samples: samples(15, false), ascent: 0, energyJ: 0 });
    const rec = parseFIT(f.buffer).filter(m => m.gmn === 20);
    expect(rec[3].f[0]).toBeNull();
    expect(rec[3].f[1]).toBeNull();
    expect(fitCrc(f)).toBe(0);
  });
});
