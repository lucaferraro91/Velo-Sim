/* Trainer-Diagnose (Taste D): Status und Protokoll aller Befehle und Antworten */
import { $, fmt1, bus } from '../util';
import { state } from '../core/state';
import { ringT, cogT, gearFactor } from '../core/gears';
import { trainer } from '../ble/trainer';
import { diagLines } from '../ble/diag';
import { telemetryStatus } from '../core/telemetry';

export function renderDiag() {
  if ($('#diag').hidden) return;
  const now = performance.now(), fresh = trainer.connected && now - trainer.lastPowerAt < 3000;
  const st = [
    'Gerät: ' + (trainer.device ? (trainer.device.name || 'ohne Namen') : '–') + (trainer.connected ? ' (verbunden)' : ' (getrennt)'),
    'Protokoll: ' + ({ ftms: 'FTMS', tacx: 'Tacx FE-C', cps: 'nur Leistung' }[trainer.proto] || '–') + ' · Steuerbar: ' + (trainer.controllable ? 'ja' : 'nein') + (trainer.features ? ' · ERG: ' + (trainer.features.erg ? 'ja' : 'nein') + ' · Steigung: ' + (trainer.features.sim ? 'ja' : 'nein') : ''),
    'Daten: ' + (fresh ? trainer.power + ' W, ' + (trainer.cadence != null ? Math.round(trainer.cadence) + ' rpm' : '– rpm') + (trainer.speed != null ? ', ' + fmt1(trainer.speed) + ' km/h' : '') : 'keine aktuellen Leistungsdaten'),
    'Modus: ' + (state.mode === 'erg' ? 'ERG ' + state.ergTarget + ' W' : 'Steigung, Gang ' + ringT() + '×' + cogT() + ' (Faktor ' + gearFactor().toFixed(2) + ')') + (state.running ? '' : ' · pausiert'),
    'Telemetrie: ' + telemetryStatus()
  ];
  $('#diagStatus').textContent = st.join('\n');
  $('#diagLog').textContent = diagLines.slice().reverse().join('\n') || 'Noch keine Befehle gesendet.';
}
export function toggleDiag() { const d = $('#diag'); d.hidden = !d.hidden; renderDiag(); }

bus.on('diag', renderDiag);
setInterval(renderDiag, 1000);
$('#btnDiagClose').onclick = toggleDiag;
