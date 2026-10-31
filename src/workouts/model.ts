/* Ein Workout ist eine Liste von Abschnitten. lo/hi sind Anteile der FTP (unit 'ftp') oder
   Watt (unit 'w'). Rampen laufen von lo nach hi, Bereiche ohne Rampe (Garmin "200–220 W")
   zielen auf die Mitte. bi/part/rep verweisen im Editor auf den Block, aus dem der Abschnitt stammt. */
import { clamp, lerp } from '../util';

export interface Segment {
  dur: number; lo?: number; hi?: number; unit?: 'ftp' | 'w';
  ramp?: boolean; free?: boolean; open?: boolean; zone?: number; label: string;
  start?: number;
  events?: { off: number; text: string }[];
  bi?: number; part?: 'main' | 'on' | 'off'; rep?: number;
}
export interface Workout { name: string; segs: Segment[]; total: number; msgs: { at: number; text: string }[]; }

export function makeWorkout(name: string, segs: Segment[]): Workout {
  segs = segs.filter(s => s.dur > 0.5);
  if (!segs.length) throw new Error('Das Workout enthält keine fahrbaren Abschnitte.');
  let t = 0; const msgs = [];
  for (const s of segs) { s.start = t; for (const e of (s.events || [])) msgs.push({ at: t + e.off, text: e.text }); t += s.dur; }
  msgs.sort((a, b) => a.at - b.at);
  return { name, segs, total: t, msgs };
}

// Ziel als Anteil der FTP zu einem Zeitpunkt im Abschnitt (null = frei fahren)
export function segFrac(s: Segment, tin: number, ftp: number): number | null {
  if (s.free) return null;
  const f = s.ramp ? lerp(s.lo, s.hi, clamp(tin / s.dur, 0, 1)) : (s.lo + s.hi) / 2;
  return s.unit === 'ftp' ? f : f / ftp;
}
// Ziel in Watt (mit Intensitätsfaktor)
export function segWatts(s: Segment, tin: number, ftp: number, bias = 1): number | null {
  const f = segFrac(s, tin, ftp);
  return f == null ? null : f * ftp * bias;
}

// Trainingsbelastung grob geschätzt: TSS = Σ Dauer·IF² / 3600 · 100 (frei fahren als 60 % FTP)
export function workoutTSS(w: Workout, ftp: number) {
  let s = 0;
  for (const g of w.segs) { const a = g.free ? 0.6 : segFrac(g, 0, ftp), b = g.free ? 0.6 : segFrac(g, g.dur, ftp); s += g.dur * (a * a + a * b + b * b) / 3; }
  return Math.round(s / 36);
}
