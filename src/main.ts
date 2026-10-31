import './styles.css';
import { $, clamp, bus } from './util';
import { initStore } from './store';
import { loadSettings } from './settings';
import { state, ride } from './core/state';
import { demoRoute, parseGPX, sampleAt } from './core/route';
import { stepPhysics } from './core/physics';
import { gearRatio, WHEEL, pickGear, realRatio } from './core/gears';
import { userSetMode, shiftGear, shiftFront, ergStep, plusMinus, setMode } from './core/mode';
import { recordTick } from './core/recorder';
import { snapshot, telemetryTick } from './core/telemetry';
import { trainer, connectTrainer, updateControl } from './ble/trainer';
import { hrm, connectHr, connectClick } from './ble/sensors';
import { parseZWO, parseERG, parseGarminFIT } from './workouts/formats';
import { wo, tickWorkout, loadWorkout, skipInterval } from './workouts/engine';
import { view, loadRoute, setRunning, finish, restart, saveRideFit } from './ride';
import { CAM_MODES } from './render3d';
import { updateHud, renderCtrl, setDots, setSim, toast } from './ui/hud';
import { drawMini, drawProfile, drawMiniStatic, drawProfileStatic } from './ui/charts';
import { updateMap, mapResize } from './ui/map';
import { drawWorkout, drawWorkoutStatic, renderWorkoutInfo } from './ui/workoutPanel';
import { toggleDiag } from './ui/diag';
import { workoutsOpen, closeWorkouts } from './ui/editor';
import './ui/settingsDialog';

/* ---------------- Hauptschleife ---------------- */
let last = performance.now(), hudAt = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const route = ride.route;
  if (route) {
    // Leistung und Kadenz: vom Trainer, sonst simuliert
    const fresh = trainer.connected && now - trainer.lastPowerAt < 3000;
    if (fresh) { state.power = Math.max(0, trainer.power); state.cadence = trainer.cadence != null ? trainer.cadence : (state.power > 0 ? 85 : 0); }
    else if (trainer.connected) { state.power = 0; state.cadence = 0; }
    else if (state.mode === 'erg') { state.power = state.ergTarget; state.cadence = clamp(76 + state.power / 22, 0, 108); }
    else {
      // Ohne Trainer: Kadenz ergibt sich aus Tempo und virtuellem Gang
      state.power = state.simPower;
      state.cadence = state.simPower > 0 ? clamp(state.v / (gearRatio() * WHEEL) * 60, 0, 150) : 0;
    }
    state.hr = hrm.connected && now - hrm.lastAt < 5000 ? hrm.bpm : (trainer.connected && trainer.hr ? trainer.hr : 0);
    state.powAvg += (state.power - state.powAvg) * (1 - Math.exp(-dt / 3));
    tickWorkout(dt);
    if (state.running) {
      const done = stepPhysics(dt);
      recordTick();
      if (done) finish();
    } else sampleAt(route, state.s, ride.cur);
    updateControl(now);
    const snap = snapshot();
    view.frame(snap, dt, state.camMode, now);
    telemetryTick(now, () => snap);
    if (now - hudAt > 200) { updateHud(); drawMini(); drawProfile(); updateMap(now); if (wo.w) { renderWorkoutInfo(); drawWorkout(); } hudAt = now; }
  }
  requestAnimationFrame(frame);
}

function resize() {
  view.resize(); mapResize();
  drawMiniStatic(); drawProfileStatic(); drawWorkoutStatic();
}
window.addEventListener('resize', resize);

/* ---------------- Dateien: GPX-Strecken und Workouts ---------------- */
async function handleFile(file: File) {
  if (!file) return;
  try {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'fit') { loadWorkout(parseGarminFIT(await file.arrayBuffer())); return; }
    const text = await file.text();
    if (ext === 'zwo' || /<workout_file/i.test(text)) { loadWorkout(parseZWO(text)); return; }
    if (ext === 'erg' || ext === 'mrc' || /\[COURSE HEADER\]/i.test(text)) { loadWorkout(parseERG(text, file.name)); return; }
    const r = parseGPX(text);
    loadRoute(r);
    toast('Strecke geladen: ' + r.name);
  } catch (e) { toast(e.message || String(e), 6000); console.warn(e); }
}
for (const id of ['#fileGpx', '#fileWo']) $(id).addEventListener('change', (e: Event) => { const i = e.target as HTMLInputElement; handleFile(i.files[0]); i.value = ''; });
const openGpx = () => $('#fileGpx').click();
$('#btnGpx').onclick = openGpx; $('#btnGpx2').onclick = openGpx; $('#btnGpx3').onclick = openGpx;

let dragDepth = 0;
window.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; $('#drop').hidden = false; });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop').hidden = true; });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('#drop').hidden = true; const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handleFile(f); });

/* ---------------- Bedienung ---------------- */
$('#btnTrainer').onclick = connectTrainer; $('#btnTrainer2').onclick = connectTrainer;
$('#btnHr').onclick = connectHr; $('#btnClick').onclick = connectClick;
$('#btnPlay').onclick = () => { if (state.finished) return restart(); setRunning(!state.running); };
$('#btnGo').onclick = () => setRunning(true);
$('#btnAgain').onclick = restart;
$('#btnSaveRide').onclick = saveRideFit;
$('#btnFinishFit').onclick = saveRideFit;
const cycleCam = () => { state.camMode = (state.camMode + 1) % CAM_MODES.length; toast('Kamera: ' + CAM_MODES[state.camMode].name, 1500); };
$('#btnCam').onclick = cycleCam;
$('#modeSim').onclick = () => userSetMode('sim');
$('#modeErg').onclick = () => userSetMode('erg');
$('#frontBtn').onclick = shiftFront;
$('#gearUp').onclick = () => shiftGear(1);
$('#gearDown').onclick = () => shiftGear(-1);
$('#ergUp').onclick = () => ergStep(10);
$('#ergDown').onclick = () => ergStep(-10);
$('#simPower').addEventListener('input', () => setSim(+$('#simPower').value));
bus.on('click', (d: number) => plusMinus(d));
bus.on('erg-unsupported', () => setMode('sim', true));

window.addEventListener('keydown', e => {
  const tgt = e.target as HTMLElement;
  if (tgt && /input|select|textarea/i.test(tgt.tagName)) return;
  if (workoutsOpen()) { if (e.key === 'Escape') closeWorkouts(); return; }   // Menü offen: keine Fahrtasten
  if (e.code === 'Space') { e.preventDefault(); if (!$('#ovSettings').hidden || state.finished) return; setRunning(!state.running); }
  else if (e.key === 'c' || e.key === 'C') cycleCam();
  else if (e.key === 'm' || e.key === 'M') userSetMode(state.mode === 'erg' ? 'sim' : 'erg');
  else if (e.key === 'n' || e.key === 'N') skipInterval();
  else if (e.key === 'd' || e.key === 'D') toggleDiag();
  else if (e.key === 'f' || e.key === 'F') shiftFront();
  else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault(); const d = e.key === 'ArrowUp' ? 10 : -10;
    if (state.mode === 'erg') ergStep(d); else setSim(state.simPower + d);
  }
  else if (e.key === 'ArrowRight' || e.key === '+') { e.preventDefault(); shiftGear(1); }
  else if (e.key === 'ArrowLeft' || e.key === '-') { e.preventDefault(); shiftGear(-1); }
});

/* ---------------- Start ---------------- */
async function start() {
  await initStore();
  loadSettings();
  pickGear(realRatio(), false);
  setSim(state.simPower); setDots(); renderCtrl();
  view.resize();
  loadRoute(demoRoute());
  resize();
  requestAnimationFrame(frame);
}
start();
