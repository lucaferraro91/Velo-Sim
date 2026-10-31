/* Ablauf einer Fahrt: Strecke laden, Start/Pause, Ziel, nochmals fahren */
import { $, fmt0, fmt1, fmtTime, downloadBlob } from './util';
import { state, ride } from './core/state';
import { sampleAt, type Route } from './core/route';
import { resetRecording, hasRecording, recordingFit, recordingFileName } from './core/recorder';
import { updateControl } from './ble/trainer';
import { Renderer3D } from './render3d';
import { snapshot } from './core/telemetry';
import { drawMiniStatic, drawProfileStatic } from './ui/charts';
import { setupMapRoute } from './ui/map';
import { updatePlayBtn, toast } from './ui/hud';

export const view = new Renderer3D($('#scene'));

export function loadRoute(r: Route) {
  ride.route = r;
  Object.assign(state, { running: false, finished: false, s: 0, v: 0, elapsed: 0, climb: 0, energy: 0 });
  resetRecording();
  sampleAt(r, 0, ride.cur);
  view.setRoute(r);
  view.frame(snapshot(), 0, state.camMode, performance.now(), true);
  $('#routeName').textContent = r.name; $('#sName').textContent = r.name;
  $('#sDist').textContent = fmt1(r.total / 1000); $('#sClimb').textContent = fmt0(r.climb); $('#sMax').textContent = fmt0(r.maxG * 100);
  $('#vTotal').textContent = fmt1(r.total / 1000);
  drawMiniStatic(); drawProfileStatic(); setupMapRoute();
  $('#ovFinish').hidden = true; $('#ovStart').hidden = false;
  updatePlayBtn();
}

export function setRunning(on: boolean) {
  if (!ride.route || state.finished) return;
  state.running = on;
  $('#ovStart').hidden = true;
  updateControl(performance.now(), true);
  updatePlayBtn();
}

export function finish() {
  state.running = false; state.finished = true; state.v = 0;
  updateControl(performance.now(), true);
  const route = ride.route;
  $('#fTime').textContent = fmtTime(state.elapsed); $('#fDist').textContent = fmt1(route.total / 1000); $('#fClimb').textContent = fmt0(state.climb);
  $('#fPow').textContent = fmt0(state.elapsed ? state.energy / state.elapsed : 0); $('#fSpd').textContent = fmt1(state.elapsed ? route.total / state.elapsed * 3.6 : 0);
  $('#btnFinishFit').hidden = !hasRecording();
  $('#ovFinish').hidden = false; updatePlayBtn();
}

export const restart = () => { if (ride.route) loadRoute(ride.route); };

export function saveRideFit() {
  if (!hasRecording()) { toast('Es gibt noch keine Fahrt zum Speichern (mindestens 10 Sekunden).'); return; }
  downloadBlob(recordingFit(), recordingFileName(), 'application/vnd.ant.fit');
  toast('Fahrt gespeichert. Hochladen auf Strava: Hochladen → Datei; Garmin Connect: Importieren → Daten.', 6000);
}
