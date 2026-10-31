/* Zeichnungen auf Canvas: Übersichtskarte, Höhenprofil und Workout-Balken */
import { $, cssVar, sizeCanvas, fmt0 } from '../util';
import { settings } from '../settings';
import { state, ride } from '../core/state';
import { sampleAt } from '../core/route';
import { ZONES, zoneIndex } from '../core/zones';
import { segFrac, type Workout, type Segment } from '../workouts/model';
import { gradeColor } from './hud';

// --- Übersichtskarte oben rechts
const mini = () => $('#minimap') as HTMLCanvasElement;
const miniStatic = document.createElement('canvas');
let miniMap: { f: (x: number, z: number) => [number, number]; dpr: number } | null = null;

export function drawMiniStatic() {
  const route = ride.route; if (!route) return;
  const c = mini(), dpr = sizeCanvas(c); miniStatic.width = c.width; miniStatic.height = c.height;
  const ctx = miniStatic.getContext('2d'), W = c.width, H = c.height, pad = 14 * dpr;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < route.n; i++) { x0 = Math.min(x0, route.X[i]); x1 = Math.max(x1, route.X[i]); z0 = Math.min(z0, route.Z[i]); z1 = Math.max(z1, route.Z[i]); }
  const sc = Math.min((W - 2 * pad) / ((x1 - x0) || 1), (H - 2 * pad) / ((z1 - z0) || 1));
  const ox = (W - (x1 - x0) * sc) / 2, oz = (H - (z1 - z0) * sc) / 2;
  miniMap = { f: (x, z) => [ox + (x - x0) * sc, oz + (z - z0) * sc], dpr };
  ctx.clearRect(0, 0, W, H);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const path = () => { ctx.beginPath(); for (let i = 0; i < route.n; i += 2) { const [a, b] = miniMap.f(route.X[i], route.Z[i]); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); } };
  path(); ctx.strokeStyle = cssVar('--line') || 'rgba(0,0,0,.2)'; ctx.lineWidth = 6 * dpr; ctx.stroke();
  path(); ctx.strokeStyle = cssVar('--text') || '#17222c'; ctx.lineWidth = 2 * dpr; ctx.stroke();
  const [ex, ey] = miniMap.f(route.X[route.n - 1], route.Z[route.n - 1]);
  ctx.fillStyle = '#f5b700'; ctx.fillRect(ex - 4 * dpr, ey - 4 * dpr, 8 * dpr, 8 * dpr);
}
export function drawMini() {
  if (!miniMap) return;
  const c = mini(), ctx = c.getContext('2d'), dpr = miniMap.dpr;
  ctx.clearRect(0, 0, c.width, c.height); ctx.drawImage(miniStatic, 0, 0);
  const [a, b] = miniMap.f(ride.cur.x, ride.cur.z);
  ctx.beginPath(); ctx.arc(a, b, 6 * dpr, 0, Math.PI * 2); ctx.fillStyle = '#f5b700'; ctx.fill(); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = cssVar('--text') || '#000'; ctx.stroke();
}

// --- Höhenprofil unten, eingefärbt nach Steigung
const profStatic = document.createElement('canvas');
let profGeom: any = null;
export function drawProfileStatic() {
  const route = ride.route; if (!route) return;
  const prof = $('#profile') as HTMLCanvasElement;
  const dpr = sizeCanvas(prof); profStatic.width = prof.width; profStatic.height = prof.height;
  const ctx = profStatic.getContext('2d'), W = prof.width, H = prof.height;
  const padL = 42 * dpr, padR = 6 * dpr, padT = 6 * dpr, padB = 16 * dpr;
  const range = Math.max(30, route.maxE - route.minE), e0 = route.minE - range * 0.08;
  const xs = (s: number) => padL + s / route.total * (W - padL - padR), ys = (e: number) => padT + (1 - (e - e0) / (range * 1.12)) * (H - padT - padB);
  profGeom = { xs, ys, dpr, padB, H };
  ctx.clearRect(0, 0, W, H);
  const cols = Math.floor(W - padL - padR), p = { x: 0, z: 0, e: 0, g: 0 };
  for (let c = 0; c < cols; c++) {
    sampleAt(route, c / cols * route.total, p);
    ctx.fillStyle = gradeColor(p.g); ctx.globalAlpha = 0.85;
    const y = ys(p.e); ctx.fillRect(padL + c, y, 1.5, H - padB - y);
  }
  ctx.globalAlpha = 1;
  ctx.beginPath(); for (let c = 0; c <= cols; c += 2) { sampleAt(route, c / cols * route.total, p); const y = ys(p.e); c ? ctx.lineTo(padL + c, y) : ctx.moveTo(padL + c, y); }
  ctx.strokeStyle = cssVar('--text') || '#000'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
  ctx.fillStyle = cssVar('--muted') || '#666'; ctx.font = `${11 * dpr}px Barlow, system-ui, sans-serif`; ctx.textBaseline = 'middle';
  ctx.fillText(fmt0(route.maxE) + ' m', 2 * dpr, ys(route.maxE)); ctx.fillText(fmt0(route.minE) + ' m', 2 * dpr, ys(route.minE));
  ctx.textBaseline = 'alphabetic';
  const km = route.total / 1000, stepKm = km > 80 ? 20 : km > 40 ? 10 : km > 15 ? 5 : km > 6 ? 2 : 1;
  for (let k = stepKm; k < km; k += stepKm) { const x = xs(k * 1000); ctx.fillText(k + ' km', x - 10 * dpr, H - 3 * dpr); }
}
export function drawProfile() {
  if (!profGeom) return;
  const prof = $('#profile') as HTMLCanvasElement, ctx = prof.getContext('2d'), { xs, ys, dpr, H, padB } = profGeom;
  ctx.clearRect(0, 0, prof.width, prof.height); ctx.drawImage(profStatic, 0, 0);
  const x = xs(state.s), y = ys(ride.cur.e);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, 0, prof.width - x, H - padB);
  ctx.strokeStyle = cssVar('--text') || '#000'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - padB); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2); ctx.fillStyle = '#f5b700'; ctx.fill(); ctx.stroke();
}

/* Workout als Zonenbalken. opt.total/opt.maxF halten den Massstab beim Ziehen im Editor fest
   (wächst nur, schrumpft nicht), opt.hl hebt einen Abschnitt hervor. */
export interface WorkoutGeom { xs: (t: number) => number; ys: (f: number) => number; dpr: number; maxF: number; total: number; }
export function paintWorkout(ctx: CanvasRenderingContext2D, w: Workout, W: number, H: number, dpr: number, opt: { total?: number; maxF?: number; hl?: Segment } = {}): WorkoutGeom {
  const ftp = settings.ftp, sf = (s: Segment, t: number) => segFrac(s, t, ftp);
  let maxF = 1.2; for (const s of w.segs) if (!s.free) maxF = Math.max(maxF, sf(s, 0) * 1.1, sf(s, s.dur) * 1.1);
  if (opt.maxF) maxF = Math.max(maxF, opt.maxF);
  const T = opt.total ? Math.max(opt.total, w.total) : w.total;
  const xs = (t: number) => t / T * W, ys = (f: number) => H - (f / maxF) * (H - 2 * dpr);
  ctx.clearRect(0, 0, W, H);
  for (const s of w.segs) {
    const x0 = xs(s.start), x1 = Math.max(x0 + 1, xs(s.start + s.dur));
    if (s.free) { ctx.fillStyle = 'rgba(140,150,160,0.45)'; ctx.fillRect(x0, ys(0.5), x1 - x0 - 0.5 * dpr, H - ys(0.5)); continue; }
    // Rampen in Stücken zeichnen, damit die Farbe der Zone folgt
    const n = s.ramp ? Math.max(1, Math.round((x1 - x0) / (3 * dpr))) : 1;
    for (let k = 0; k < n; k++) {
      const ta = s.dur * k / n, tb = s.dur * (k + 1) / n, fa = sf(s, ta), fb = sf(s, tb);
      const xa = xs(s.start + ta), xb = xs(s.start + tb);
      ctx.fillStyle = ZONES[zoneIndex((fa + fb) / 2)].c;
      ctx.beginPath(); ctx.moveTo(xa, H); ctx.lineTo(xa, ys(fa)); ctx.lineTo(xb, ys(fb)); ctx.lineTo(xb, H); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = cssVar('--panel-solid') || '#fff'; ctx.fillRect(x1 - 0.5 * dpr, 0, 0.5 * dpr, H);   // feine Trennlinie
  }
  // FTP-Linie
  ctx.strokeStyle = cssVar('--muted') || '#888'; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.lineWidth = 1 * dpr;
  ctx.beginPath(); ctx.moveTo(0, ys(1)); ctx.lineTo(W, ys(1)); ctx.stroke(); ctx.setLineDash([]);
  if (opt.hl) {
    const s = opt.hl, x0 = xs(s.start), x1 = xs(s.start + s.dur), top = s.free ? ys(0.5) : Math.min(ys(sf(s, 0)), ys(sf(s, s.dur)));
    ctx.strokeStyle = cssVar('--text') || '#000'; ctx.lineWidth = 2 * dpr; ctx.strokeRect(x0 + dpr, top + dpr, Math.max(2 * dpr, x1 - x0 - 2 * dpr), H - top - 2 * dpr);
  }
  return { xs, ys, dpr, maxF, total: T };
}
