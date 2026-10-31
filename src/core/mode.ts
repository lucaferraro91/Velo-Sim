/* Modus (Steigung/ERG), Schalten und ERG-Ziel – alles, was Bedienung, Zwift Click und Workout auslösen. */
import { clamp, bus, notify } from '../util';
import { settings } from '../settings';
import { state, type Mode } from './state';
import { WHEEL, rings, cogs, ringT, cogT, pickGear, nextGear } from './gears';
import { fmtPow } from './zones';
import { updateControl } from '../ble/trainer';
import { wo, applyWorkout, setBias } from '../workouts/engine';

export function setMode(mode: Mode, quiet = false) {
  if (mode === state.mode) return;
  if (mode === 'erg') {
    // Zielleistung startet bei der aktuellen Leistung, damit es keinen Sprung gibt
    if (state.running && state.power > 20) state.ergTarget = clamp(Math.round(state.power / 5) * 5, 50, 1500);
  } else if (state.v > 1 && state.cadence > 30) {
    // Gang wählen, der zum aktuellen Tempo bei aktueller Kadenz passt
    pickGear(state.v / (state.cadence / 60 * WHEEL), true);
  }
  state.mode = mode;
  bus.emit('ctrl');
  updateControl(performance.now(), true);
  if (wo.w && !wo.done) { applyWorkout(); bus.emit('workout'); }
  if (!quiet) notify(mode === 'erg' ? 'ERG-Modus: Trainer hält ' + fmtPow(state.ergTarget) : 'Steigungsmodus, Gang ' + ringT() + '×' + cogT(), 1800);
}

// Modus durch Bedienung (Taste M, Knöpfe): merkt sich die Wahl auch fürs Workout
export function userSetMode(mode: Mode) {
  if (wo.w && !wo.done) wo.useErg = mode === 'erg';
  setMode(mode);
}

export function shiftGear(d: number) {
  if (state.mode === 'erg') return;
  const g = nextGear(rings(), cogs(), state.front, state.rear, d, settings.synchro);
  const frontChanged = g.front !== state.front;
  state.front = g.front; state.rear = g.rear;
  bus.emit('ctrl');
  if (frontChanged) notify('Blatt ' + ringT() + ' · Ritzel ' + cogT(), 1200);
  updateControl(performance.now(), true);
}

export function shiftFront() {
  if (state.mode === 'erg' || rings().length < 2) return;
  state.front = (state.front + 1) % rings().length;
  bus.emit('ctrl');
  updateControl(performance.now(), true);
}

export function setErg(w: number) {
  state.ergTarget = clamp(Math.round(w / 5) * 5, 50, 1500);
  bus.emit('ctrl');
  updateControl(performance.now(), true);
}

// Plus/Minus im ERG-Modus: im Workout die Intensität ±5 %, sonst die Zielleistung ±10 W
export function ergStep(d: number) {
  if (wo.w && !wo.done && state.mode === 'erg') setBias(wo.bias + 0.05 * Math.sign(d));
  else setErg(state.ergTarget + d);
}

// Zwift Click und Tasten: im ERG-Modus Leistung, sonst Gang
export function plusMinus(d: number) { if (state.mode === 'erg') ergStep(10 * d); else shiftGear(d); }
