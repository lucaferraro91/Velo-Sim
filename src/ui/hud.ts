import { $, fmt0, fmt1, fmtTime, bus } from '../util';
import { settings } from '../settings';
import { state, ride } from '../core/state';
import { rings, cogs, ringT, cogT, gearRatio } from '../core/gears';
import { zoneOf, pctFtp } from '../core/zones';
import { trainer } from '../ble/trainer';
import { hrm, clicks } from '../ble/sensors';
import { hasRecording } from '../core/recorder';

let toastTimer: any = null;
export function toast(msg: string, ms = 4200) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, ms);
}
bus.on('toast', toast);

export const gradeColor = (g: number) => g < 0.03 ? '#58a65c' : g < 0.06 ? '#e9b400' : g < 0.09 ? '#ec7d1c' : '#cf3b2c';

export function updateHud() {
  const route = ride.route, cur = ride.cur, pct = settings.powerUnit === 'pct';
  $('#vPower').textContent = pct ? pctFtp(state.power) : fmt0(state.power);
  $('#vPowerUnit').textContent = pct ? '% FTP' : 'W';
  const zEl = $('#vZone');
  if (state.powAvg > 5) { const z = zoneOf(state.powAvg); zEl.textContent = 'Z' + z.n + ' ' + z.name; zEl.style.background = z.c; }
  else { zEl.textContent = '–'; zEl.style.background = ''; }
  $('#vSpeed').textContent = fmt1(state.v * 3.6);
  $('#vGrade').textContent = fmt1(cur.g * 100);
  $('#vGrade').parentElement.style.color = cur.g >= 0.03 ? gradeColor(cur.g) : '';
  $('#vTime').textContent = fmtTime(state.elapsed);
  $('#vCad').textContent = state.cadence ? fmt0(state.cadence) : '–';
  $('#vHr').textContent = state.hr ? state.hr : '–';
  $('#vClimb').textContent = fmt0(state.climb);
  $('#vDist').textContent = fmt1(state.s / 1000); $('#vLeft').textContent = fmt1(Math.max(0, route.total - state.s) / 1000);
  $('#btnSaveRide').hidden = !hasRecording() || state.finished;
}

export function renderCtrl() {
  const erg = state.mode === 'erg';
  $('#modeSim').setAttribute('aria-pressed', String(!erg));
  $('#modeErg').setAttribute('aria-pressed', String(erg));
  $('#rowGear').hidden = erg;
  $('#rowErg').hidden = !erg;
  $('#rowSim').hidden = erg || trainer.connected;
  const n = cogs().length;
  $('#frontBtn').textContent = ringT();
  $('#frontBtn').disabled = rings().length < 2;
  $('#gearVal').innerHTML = cogT() + '<small>Z</small>';
  $('#gearRatio').textContent = 'Ritzel ' + (n - state.rear) + '/' + n + ' · Übersetzung ' + gearRatio().toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $('#ergVal').innerHTML = settings.powerUnit === 'pct' ? pctFtp(state.ergTarget) + '<small>%</small>' : state.ergTarget + '<small>W</small>';
}

export function setDots() {
  for (const id of ['#dotTrainer', '#dotTrainer2']) $(id).classList.toggle('on', trainer.connected);
  $('#dotHr').classList.toggle('on', hrm.connected);
  $('#dotClick').classList.toggle('on', clicks.some(c => c.connected));
  $('#btnTrainer').title = trainer.connected ? 'Verbunden: ' + (trainer.device.name || 'Trainer') + ' (Klick: anderen Trainer wählen)' : 'Smart Trainer über Bluetooth verbinden';
  renderCtrl();
}

export function updatePlayBtn() { $('#btnPlay').textContent = state.running ? 'Pause' : (state.s > 0 && !state.finished ? 'Weiter' : 'Start'); }

export function setSim(v: number) {
  state.simPower = Math.max(0, Math.min(600, Math.round(v / 5) * 5));
  $('#simPower').value = state.simPower; $('#simVal').textContent = state.simPower + ' W';
}

bus.on('ctrl', renderCtrl);
bus.on('devices', setDots);
