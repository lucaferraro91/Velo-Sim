import { settings } from '../settings';

// 7 Leistungszonen nach Coggan, Grenzen als Anteil der FTP
export const ZONES = [
  { max: 0.55, name: 'Erholung', c: '#8c96a0' },
  { max: 0.75, name: 'Grundlage', c: '#2f7fd6' },
  { max: 0.90, name: 'Tempo', c: '#1f9e5a' },
  { max: 1.05, name: 'Schwelle', c: '#e2ad00' },
  { max: 1.20, name: 'VO2max', c: '#ec7d1c' },
  { max: 1.50, name: 'Anaerob', c: '#cf3b2c' },
  { max: Infinity, name: 'Neuromuskulär', c: '#8e44ad' }
];
export const zoneIndex = (frac: number) => ZONES.findIndex(z => frac <= z.max);
export const zoneOf = (w: number) => { const i = zoneIndex(w / settings.ftp); return { n: i + 1, ...ZONES[i] }; };
export const pctFtp = (w: number) => Math.round(w / settings.ftp * 100);
export const fmtPow = (w: number) => settings.powerUnit === 'pct' ? pctFtp(w) + ' %' : Math.round(w) + ' W';
