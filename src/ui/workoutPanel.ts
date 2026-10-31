/* Workout-Panel während der Fahrt: Verlauf, aktueller Abschnitt, Ziel, nächster Abschnitt */
import { $, cssVar, sizeCanvas, fmtTime, bus } from '../util';
import { settings, saveSettings } from '../settings';
import { fmtPow, pctFtp, zoneOf } from '../core/zones';
import { wo, segTarget, skipInterval, closeWorkout } from '../workouts/engine';
import { paintWorkout, type WorkoutGeom } from './charts';
import { renderCtrl, updateHud } from './hud';

const woCanvas = () => $('#woChart') as HTMLCanvasElement;
const woStatic = document.createElement('canvas');
let woGeom: WorkoutGeom | null = null;

export function drawWorkoutStatic() {
  if (!wo.w || $('#woPanel').hidden) return;
  const c = woCanvas(), dpr = sizeCanvas(c); woStatic.width = c.width; woStatic.height = c.height;
  woGeom = paintWorkout(woStatic.getContext('2d'), wo.w, c.width, c.height, dpr);
}

export function drawWorkout() {
  if (!wo.w || !woGeom || $('#woPanel').hidden) return;
  const c = woCanvas(), ctx = c.getContext('2d'), { xs, ys, dpr } = woGeom, W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H); ctx.drawImage(woStatic, 0, 0);
  const x = xs(Math.min(wo.t, wo.w.total));
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(x, 0, W - x, H);
  if (wo.trace.length > 1) {
    ctx.beginPath();
    wo.trace.forEach(([t, p], i) => { const px = xs(t), py = ys(Math.min(woGeom.maxF, p / settings.ftp)); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.strokeStyle = cssVar('--text') || '#000'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
  }
  ctx.fillStyle = cssVar('--text') || '#000'; ctx.fillRect(x - 1 * dpr, 0, 2 * dpr, H);
}

export function renderWorkoutInfo() {
  if (!wo.w) return;
  const w = wo.w;
  $('#woUnit').textContent = settings.powerUnit === 'pct' ? '% FTP' : 'Watt';
  if (wo.done) {
    $('#woSeg').textContent = 'Workout beendet'; $('#woLeft').textContent = '0:00';
    $('#woTarget').textContent = '–'; $('#woTarget').style.background = ''; $('#woNext').textContent = 'Frei fahren';
    $('#woTotal').textContent = fmtTime(w.total) + ' / ' + fmtTime(w.total);
    return;
  }
  const s = w.segs[wo.idx], tin = wo.t - s.start, tgt = segTarget(s, tin);
  $('#woSeg').textContent = s.label + (s.open ? ' (offen)' : '') + ' · ' + (wo.idx + 1) + '/' + w.segs.length;
  $('#woLeft').textContent = fmtTime(Math.max(0, s.dur - tin));
  const tEl = $('#woTarget');
  if (tgt == null) { tEl.textContent = 'frei'; tEl.style.background = '#8c96a0'; }
  else {
    // Bereich anzeigen, wenn Garmin einen Bereich vorgibt
    const watt = (v: number) => (s.unit === 'ftp' ? v * settings.ftp : v) * wo.bias;
    const num = (v: number) => settings.powerUnit === 'pct' ? pctFtp(v) : Math.round(v);
    tEl.textContent = !s.ramp && s.lo !== s.hi ? num(watt(s.lo)) + '–' + fmtPow(watt(s.hi)) : fmtPow(tgt);
    tEl.style.background = zoneOf(tgt).c;
  }
  const nx = w.segs[wo.idx + 1];
  $('#woNext').textContent = nx ? 'Danach: ' + nx.label + ' · ' + fmtTime(nx.dur) + (nx.free ? ' · frei' : ' · ' + fmtPow(segTarget(nx, 0))) : 'Danach: Ziel';
  $('#woTotal').textContent = fmtTime(wo.t) + ' / ' + fmtTime(w.total) + (wo.bias !== 1 ? ' · Intensität ' + Math.round(wo.bias * 100) + ' %' : '') + (wo.useErg ? '' : ' · ohne ERG');
}

bus.on('workout-loaded', () => {
  $('#woPanel').hidden = !wo.w;
  if (wo.w) { $('#woName').textContent = wo.w.name; drawWorkoutStatic(); renderWorkoutInfo(); drawWorkout(); }
});
bus.on('workout', () => { renderWorkoutInfo(); });

$('#woSkip').onclick = skipInterval;
$('#woClose').onclick = closeWorkout;
$('#woUnit').onclick = () => {
  settings.powerUnit = settings.powerUnit === 'pct' ? 'w' : 'pct'; saveSettings();
  renderCtrl(); renderWorkoutInfo(); updateHud();
};
