import { getItem, setItem } from './store';

export interface Settings {
  riderKg: number; bikeKg: number; cda: number; crr: number; difficulty: number;
  ring: number; cog: number;            // echter Gang am Trainer
  rings: string; cassette: string;      // virtuelles Velo
  synchro: boolean;
  ftp: number; powerUnit: 'w' | 'pct';
  telemetry: boolean; telemetryUrl: string;
}

export const DEFAULTS: Settings = {
  riderKg: 75, bikeKg: 8.5, cda: 0.32, crr: 0.004, difficulty: 100,
  ring: 34, cog: 17, rings: '50-34', cassette: '11-34/12', synchro: true,
  ftp: 250, powerUnit: 'w',
  telemetry: false, telemetryUrl: 'ws://localhost:8787'
};

export const settings: Settings = { ...DEFAULTS };

export function loadSettings() {
  const s = getItem('settings');
  if (s && typeof s === 'object') Object.assign(settings, s);
}
export function saveSettings() { setItem('settings', { ...settings }); }
