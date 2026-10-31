/* Fahrt-Aufzeichnung: ein Messpunkt pro Sekunde Fahrzeit (nur während die Fahrt läuft). */
import { state, ride } from './state';
import { toLatLon } from './route';
import { encodeActivity, type RecordSample } from '../fit/writer';

export const rec = { start: null as Date | null, samples: [] as RecordSample[], nextT: 0 };

export function resetRecording() { rec.start = null; rec.samples = []; rec.nextT = 0; }

export function recordTick() {
  if (!state.running) return;
  if (!rec.start) rec.start = new Date();
  if (state.elapsed < rec.nextT) return;
  rec.nextT = Math.floor(state.elapsed) + 1;
  const r = ride.route, c = ride.cur;
  const s: RecordSample = {
    t: state.elapsed, power: Math.round(state.power), cadence: Math.round(state.cadence || 0), hr: state.hr || 0,
    speed: state.v, dist: state.s, alt: c.e
  };
  if (r && r.geo) { const [lat, lon] = toLatLon(r.geo, c.x, c.z); s.lat = lat; s.lon = lon; }
  rec.samples.push(s);
}

export const hasRecording = () => rec.samples.length >= 10;

export function recordingFit() {
  return encodeActivity({ start: rec.start || new Date(), samples: rec.samples, ascent: state.climb, energyJ: state.energy });
}

export function recordingFileName() {
  const d = rec.start || new Date(), p = (n: number) => String(n).padStart(2, '0');
  const name = (ride.route ? ride.route.name : 'Fahrt').replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '_');
  return `Velo-Sim_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}_${name}.fit`;
}
