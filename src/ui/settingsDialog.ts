/* Einstellungen und Datensicherung */
import { $, clamp, downloadBlob } from '../util';
import { settings, saveSettings, loadSettings } from '../settings';
import { state } from '../core/state';
import { RINGS, CASSETTES, realRatio, pickGear } from '../core/gears';
import { ctl, sendUserConfig } from '../ble/trainer';
import { wo, applyWorkout } from '../workouts/engine';
import { exportBackup, importBackup } from '../store';
import { setRunning } from '../ride';
import { renderCtrl, toast, updateHud } from './hud';
import { drawWorkoutStatic, renderWorkoutInfo } from './workoutPanel';
import { toggleDiag } from './diag';

for (const [k, v] of Object.entries(RINGS)) $('#setRings').add(new Option(v.name, k));
for (const [k, v] of Object.entries(CASSETTES)) $('#setCassette').add(new Option(v.name, k));

$('#btnSettings').onclick = () => {
  $('#setRider').value = settings.riderKg; $('#setBike').value = settings.bikeKg; $('#setDiff').value = settings.difficulty;
  $('#setFtp').value = settings.ftp; $('#setUnit').value = settings.powerUnit;
  $('#setRing').value = settings.ring; $('#setCog').value = settings.cog;
  $('#setRings').value = settings.rings; $('#setCassette').value = settings.cassette; $('#setSynchro').value = settings.synchro ? '1' : '0';
  $('#setTele').checked = settings.telemetry; $('#setTeleUrl').value = settings.telemetryUrl;
  const sel = $('#setPos') as HTMLSelectElement;
  sel.value = [...sel.options].map(o => o.value).reduce((b, v) => Math.abs(+v - settings.cda) < Math.abs(+b - settings.cda) ? v : b, sel.options[0].value);
  if (state.running) setRunning(false);
  $('#ovSettings').hidden = false;
};
$('#btnCloseSet').onclick = () => $('#ovSettings').hidden = true;
$('#btnSaveSet').onclick = () => {
  settings.riderKg = clamp(+$('#setRider').value || 75, 30, 160);
  settings.bikeKg = clamp(+$('#setBike').value || 8.5, 4, 30);
  settings.cda = +$('#setPos').value || 0.32;
  settings.difficulty = clamp(+$('#setDiff').value, 0, 100);
  settings.ftp = clamp(Math.round(+$('#setFtp').value) || 250, 50, 600);
  settings.powerUnit = $('#setUnit').value === 'pct' ? 'pct' : 'w';
  settings.telemetry = $('#setTele').checked;
  settings.telemetryUrl = ($('#setTeleUrl').value || '').trim() || 'ws://localhost:8787';
  const before = [settings.ring, settings.cog, settings.rings, settings.cassette].join();
  settings.ring = clamp(Math.round(+$('#setRing').value) || 34, 20, 60);
  settings.cog = clamp(Math.round(+$('#setCog').value) || 17, 9, 36);
  if (RINGS[$('#setRings').value]) settings.rings = $('#setRings').value;
  if (CASSETTES[$('#setCassette').value]) settings.cassette = $('#setCassette').value;
  settings.synchro = $('#setSynchro').value === '1';
  // Nach einer Änderung im Gang starten, der dem echten Gang entspricht
  if ([settings.ring, settings.cog, settings.rings, settings.cassette].join() !== before) pickGear(realRatio(), false);
  if (wo.w) { applyWorkout(); drawWorkoutStatic(); renderWorkoutInfo(); }
  sendUserConfig();
  saveSettings(); $('#ovSettings').hidden = true; ctl.lastKey = null; renderCtrl(); updateHud();
  toast('Einstellungen gespeichert.', 1800);
};
$('#btnDiag').onclick = () => { $('#ovSettings').hidden = true; if ($('#diag').hidden) toggleDiag(); };

// Sicherung als JSON-Datei und Wiederherstellen
$('#btnBackup').onclick = () => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
  downloadBlob(JSON.stringify(exportBackup(), null, 2), `Velo-Sim_Sicherung_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`, 'application/json');
};
$('#btnRestore').onclick = () => $('#fileBackup').click();
$('#fileBackup').addEventListener('change', async (e: Event) => {
  const input = e.target as HTMLInputElement, f = input.files[0]; input.value = '';
  if (!f) return;
  try {
    importBackup(JSON.parse(await f.text()));
    loadSettings(); pickGear(realRatio(), false); renderCtrl();
    $('#ovSettings').hidden = true;
    toast('Sicherung wiederhergestellt: Einstellungen und eigene Workouts.', 3000);
  } catch (err) { toast(err.message || String(err), 6000); }
});
