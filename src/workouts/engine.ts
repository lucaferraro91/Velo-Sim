/* Workout-Ablauf: bestimmt den aktuellen Abschnitt, schaltet ERG/Gänge und setzt das ERG-Ziel. */
import { clamp, fmtTime, bus, notify } from '../util';
import { settings } from '../settings';
import { state } from '../core/state';
import { fmtPow } from '../core/zones';
import { setMode } from '../core/mode';
import { segWatts, type Workout, type Segment } from './model';

export const wo = {
  w: null as Workout | null,
  t: 0, idx: 0, bias: 1,       // Workout-Zeit (s), Abschnitt, Intensität
  useErg: true, done: false,
  msgAt: 0, trace: [] as [number, number][], traceAt: 0
};

export const segTarget = (s: Segment, tin: number) => s ? segWatts(s, tin, settings.ftp, wo.bias) : null;

export function currentSegment() {
  if (!wo.w || wo.done) return null;
  const s = wo.w.segs[wo.idx], tin = wo.t - s.start;
  return { s, tin, target: segTarget(s, tin) };
}

export function loadWorkout(w: Workout) {
  Object.assign(wo, { w, t: 0, idx: 0, bias: 1, useErg: true, done: false, msgAt: 0, trace: [], traceAt: 0 });
  applyWorkout();
  bus.emit('workout-loaded');
  notify('Workout geladen: ' + w.name + ' (' + fmtTime(w.total) + '). Der Trainer folgt im ERG-Modus.', 4500);
}
export function closeWorkout() {
  wo.w = null; bus.emit('workout-loaded');
  notify('Workout beendet. Du fährst frei weiter.', 2500);
}
export function skipInterval() {
  if (!wo.w || wo.done) return;
  const s = wo.w.segs[wo.idx]; wo.t = s.start + s.dur + 0.01;
  applyWorkout(); bus.emit('workout');
}
export function setBias(b: number) {
  wo.bias = clamp(Math.round(b * 100) / 100, 0.5, 1.5);
  notify('Workout-Intensität ' + Math.round(wo.bias * 100) + ' %', 1200);
  applyWorkout(); bus.emit('workout');
}

// Abschnitt bestimmen, Modus und ERG-Ziel setzen
export function applyWorkout() {
  const w = wo.w; if (!w || wo.done) return;
  while (wo.idx < w.segs.length - 1 && wo.t >= w.segs[wo.idx].start + w.segs[wo.idx].dur) wo.idx++;
  if (wo.t >= w.total) {
    wo.done = true; setMode('sim', true);
    notify('Workout geschafft! Du fährst jetzt frei weiter.', 5000);
    bus.emit('workout'); return;
  }
  const s = w.segs[wo.idx], tgt = segTarget(s, wo.t - s.start);
  const want = tgt != null && wo.useErg ? 'erg' : 'sim';
  if (state.mode !== want) setMode(want, true);
  if (want === 'erg') { const r = clamp(Math.round(tgt), 30, 1500); if (r !== state.ergTarget) { state.ergTarget = r; bus.emit('ctrl'); } }
}

export function tickWorkout(dt: number) {
  if (!wo.w || wo.done || !state.running) return;
  const prevIdx = wo.idx;
  wo.t += dt;
  applyWorkout();
  if (!wo.done && wo.idx !== prevIdx) {
    const s = wo.w.segs[wo.idx], tgt = segTarget(s, 0);
    notify(s.label + ': ' + fmtTime(s.dur) + (tgt != null ? ' · ' + fmtPow(tgt) : ' · frei fahren') + (s.open ? ' (offen, mit N weiter)' : ''), 2500);
  }
  while (wo.msgAt < wo.w.msgs.length && wo.w.msgs[wo.msgAt].at <= wo.t) { notify(wo.w.msgs[wo.msgAt].text, 5000); wo.msgAt++; }
  if (wo.t - wo.traceAt >= 1) { wo.trace.push([wo.t, state.power]); wo.traceAt = wo.t; }
}
