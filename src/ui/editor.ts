/* Workout-Bibliothek und Editor. Ziehen in der Vorschau: rechte Kante = Dauer,
   Fläche = Leistung (Rampen: linke Hälfte Start, rechte Hälfte Ende). */
import { $, clamp, fmtTime, fmtDur, parseDur, sizeCanvas, xmlEsc, safeFile, downloadBlob } from '../util';
import { settings } from '../settings';
import { state } from '../core/state';
import { ZONES, zoneIndex } from '../core/zones';
import { setRunning } from '../ride';
import { workoutTSS, type Workout } from '../workouts/model';
import { loadWorkout } from '../workouts/engine';
import { BLOCK_TYPES, newBlock, blocksToWorkout, blocksToZwo, libLoad, libSave, type Block, type BlockType, type LibEntry } from '../workouts/blocks';
import { persistent } from '../store';
import { paintWorkout, type WorkoutGeom } from './charts';
import { toast } from './hud';

const powIn = (f: number) => settings.powerUnit === 'pct' ? Math.round(f * 100) : Math.round(f * settings.ftp);
const powOut = (v: string | number) => settings.powerUnit === 'pct' ? (+v || 0) / 100 : (+v || 0) / settings.ftp;
const powUnit = () => settings.powerUnit === 'pct' ? '%' : 'W';
const zwoFile = (name: string, blocks: Block[]) => downloadBlob(blocksToZwo(name, blocks), safeFile(name) + '.zwo', 'application/xml');

const ed = { id: null as string | null, blocks: [] as Block[] };

export function openWorkouts() {
  if (state.running) setRunning(false);
  showLib(); $('#ovWo').hidden = false;
}
export const closeWorkouts = () => { $('#ovWo').hidden = true; };
export const workoutsOpen = () => !$('#ovWo').hidden;

function showLib() {
  $('#woEdit').hidden = true; $('#woLib').hidden = false;
  const list = libLoad().sort((a, b) => (b.updated || 0) - (a.updated || 0)), el = $('#woList');
  if (!list.length) { el.innerHTML = '<p class="empty">Noch keine eigenen Workouts. Erstelle eins mit «Neues Workout».</p>'; return; }
  el.innerHTML = list.map(x => {
    const w = blocksToWorkout(x.name, x.blocks);
    return `<div class="wo-item" data-id="${x.id}"><div class="t"><b>${xmlEsc(x.name)}</b><small>${fmtTime(w.total)} · TSS ≈ ${workoutTSS(w, settings.ftp)}</small></div>
      <button class="primary" data-act="ride">Fahren</button><button data-act="edit">Bearbeiten</button>
      <button class="ghost" data-act="zwo" title="Als .zwo-Datei herunterladen">.zwo</button><button class="ghost" data-act="del" title="Löschen" aria-label="Löschen">✕</button></div>`;
  }).join('');
}
function rideBlocks(name: string, blocks: Block[]) {
  if (!blocks.length) { toast('Das Workout ist leer.'); return; }
  closeWorkouts(); loadWorkout(blocksToWorkout(name, blocks));
}
function openEditor(entry: LibEntry | null) {
  ed.id = entry ? entry.id : null;
  ed.blocks = entry ? JSON.parse(JSON.stringify(entry.blocks)) : [newBlock('warmup'), newBlock('intervals'), newBlock('cooldown')];
  $('#woEdName').value = entry ? entry.name : '';
  $('#woEdTitle').textContent = entry ? 'Workout bearbeiten' : 'Neues Workout';
  $('#woLib').hidden = true; $('#woEdit').hidden = false;
  renderBlocks();
}
// Zonenfarbe für die Kante eines Blocks
function blockColor(b: Block) {
  if (b.type === 'free') return '#8c96a0';
  const f = b.type === 'steady' ? b.p : b.type === 'intervals' ? b.onP : Math.max(b.lo, b.hi);
  return ZONES[zoneIndex(f)].c;
}
function renderBlocks() {
  const u = powUnit(), pin = (k: string, v: number, t: string) => `<input type="number" data-k="${k}" value="${powIn(v)}" min="0" step="1" aria-label="${t}">`;
  const din = (k: string, v: number, t: string) => `<input class="dur" type="text" inputmode="decimal" data-k="${k}" value="${fmtDur(v)}" aria-label="${t}" title="Minuten:Sekunden">`;
  $('#woEdBlocks').innerHTML = ed.blocks.map((b, i) => {
    let f = '';
    if (b.type === 'intervals')
      f = `<label><input type="number" data-k="reps" value="${b.reps}" min="1" max="50" step="1" aria-label="Wiederholungen" class="reps">×</label>
         <label>Belastung ${din('onDur', b.onDur, 'Dauer Belastung')} @ ${pin('onP', b.onP, 'Leistung Belastung')} ${u}</label>
         <label>Erholung ${din('offDur', b.offDur, 'Dauer Erholung')} @ ${pin('offP', b.offP, 'Leistung Erholung')} ${u}</label>`;
    else if (b.type === 'steady') f = `<label>Dauer ${din('dur', b.dur, 'Dauer')}</label><label>@ ${pin('p', b.p, 'Leistung')} ${u}</label>`;
    else if (b.type === 'free') f = `<label>Dauer ${din('dur', b.dur, 'Dauer')}</label><span class="hint-s">Gänge statt ERG</span>`;
    else f = `<label>Dauer ${din('dur', b.dur, 'Dauer')}</label><label>von ${pin('lo', b.lo, 'Startleistung')} ${u}</label><label>bis ${pin('hi', b.hi, 'Endleistung')} ${u}</label>`;
    return `<div class="blk" data-i="${i}" style="--c:${blockColor(b)}"><span class="bt">${BLOCK_TYPES[b.type].name}</span>${f}
      <span class="tools"><button class="ghost" data-act="up" title="Nach oben" aria-label="Nach oben"${i ? '' : ' disabled'}>↑</button><button class="ghost" data-act="down" title="Nach unten" aria-label="Nach unten"${i < ed.blocks.length - 1 ? '' : ' disabled'}>↓</button><button class="ghost" data-act="dup" title="Duplizieren" aria-label="Duplizieren">⧉</button><button class="ghost" data-act="del" title="Entfernen" aria-label="Entfernen">✕</button></span></div>`;
  }).join('') || '<p class="empty">Füge unten Blöcke hinzu.</p>';
  renderEdPreview();
}

// --- Vorschau mit Ziehen
interface DragRef { bi: number; part: string; rep: number; }
let edGeom: WorkoutGeom | null = null, edW: Workout | null = null;
let edDrag: (DragRef & { mode: string; key: string; v0: number; t0: number; f0: number; total: number; maxF: number }) | null = null;
let edHover: (DragRef & { key: string }) | null = null;
const sameSeg = (r: DragRef) => (s: any) => s.bi === r.bi && s.part === r.part && s.rep === r.rep;

function renderEdPreview() {
  const c = $('#woEdChart') as HTMLCanvasElement, dpr = sizeCanvas(c), ctx = c.getContext('2d');
  edGeom = null; edW = null;
  if (!ed.blocks.length) { ctx.clearRect(0, 0, c.width, c.height); $('#woEdSum').textContent = 'Noch keine Blöcke.'; return; }
  try {
    const w = blocksToWorkout('', ed.blocks);
    // beim Ziehen bleibt der Massstab stehen, damit die Kante unter der Maus bleibt
    const ref = edDrag || edHover, hl = ref ? w.segs.find(sameSeg(ref)) : null;
    edGeom = paintWorkout(ctx, w, c.width, c.height, dpr, edDrag ? { total: edDrag.total, maxF: edDrag.maxF, hl } : { hl });
    edW = w;
    $('#woEdSum').textContent = 'Dauer ' + fmtTime(w.total) + ' · TSS ≈ ' + workoutTSS(w, settings.ftp) + ' · FTP ' + settings.ftp + ' W';
  } catch (e) { ctx.clearRect(0, 0, c.width, c.height); $('#woEdSum').textContent = 'Alle Blöcke brauchen eine Dauer.'; }
}

const DUR_KEY: Record<string, string> = { main: 'dur', on: 'onDur', off: 'offDur' }, POW_KEY: Record<string, string> = { on: 'onP', off: 'offP' };
function edHit(e: PointerEvent) {
  if (!edGeom || !edW) return null;
  const c = $('#woEdChart') as HTMLCanvasElement, r = c.getBoundingClientRect(), dpr = edGeom.dpr;
  const px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr, t = px / c.width * edGeom.total;
  for (const s of edW.segs) if (Math.abs(px - edGeom.xs(s.start + s.dur)) <= 7 * dpr) return { s, mode: 'dur', px, py, t, key: '' };
  const s = edW.segs.find(s => t >= s.start && t < s.start + s.dur);
  if (!s || s.free) return s ? { s, mode: 'none', px, py, t, key: '' } : null;
  const b = ed.blocks[s.bi];
  const key = b.type === 'steady' ? 'p' : b.type === 'intervals' ? POW_KEY[s.part] : (t - s.start < s.dur / 2 ? 'lo' : 'hi');
  return { s, mode: 'pow', key, px, py, t };
}
const fracAtY = (py: number) => (edGeom.ys(0) - py) / (edGeom.ys(0) - edGeom.ys(1));   // Pixel → Anteil FTP
const snapDur = (s: number) => s < 300 ? Math.round(s / 5) * 5 : Math.round(s / 15) * 15;   // 5 s, ab 5 min 15 s
const snapPow = (f: number) => settings.powerUnit === 'pct' ? Math.round(f * 100) / 100 : Math.round(f * settings.ftp / 5) * 5 / settings.ftp;   // 1 % bzw. 5 W
function edTip(e: PointerEvent, text: string | null) {
  const tip = $('#woEdTip'), wrap = $('#woEdChartWrap').getBoundingClientRect();
  if (!text) { tip.hidden = true; return; }
  tip.hidden = false; tip.textContent = text;
  tip.style.left = clamp(e.clientX - wrap.left, 60, wrap.width - 60) + 'px';
  tip.style.top = (e.clientY - wrap.top - 34) + 'px';
}
function edTipText(d: NonNullable<typeof edDrag>) {
  const b = ed.blocks[d.bi], name = BLOCK_TYPES[b.type].name, part = d.part === 'on' ? ' Belastung' : d.part === 'off' ? ' Erholung' : '';
  if (d.mode === 'dur') return name + part + ': ' + fmtDur(b[DUR_KEY[d.part]]);
  return name + part + (d.key === 'lo' ? ' Start' : d.key === 'hi' ? ' Ende' : '') + ': ' + powIn(b[d.key]) + ' ' + powUnit();
}

const chart = $('#woEdChart') as HTMLCanvasElement;
chart.addEventListener('pointerdown', e => {
  const h = edHit(e); if (!h || h.mode === 'none') return;
  const b = ed.blocks[h.s.bi];
  const key = h.mode === 'dur' ? DUR_KEY[h.s.part] : h.key;
  edDrag = { bi: h.s.bi, part: h.s.part, rep: h.s.rep, mode: h.mode, key, v0: b[key], t0: h.t, f0: fracAtY(h.py), total: edGeom.total, maxF: edGeom.maxF };
  chart.setPointerCapture(e.pointerId); e.preventDefault();
  edTip(e, edTipText(edDrag));
});
chart.addEventListener('pointermove', e => {
  if (!edDrag) {
    const h = edHit(e);
    chart.style.cursor = !h || h.mode === 'none' ? 'default' : h.mode === 'dur' ? 'ew-resize' : 'ns-resize';
    const key = h ? h.s.bi + '/' + h.s.part + '/' + h.s.rep : null;
    if (key !== (edHover && edHover.key)) { edHover = h ? { bi: h.s.bi, part: h.s.part, rep: h.s.rep, key } : null; renderEdPreview(); }
    return;
  }
  const r = chart.getBoundingClientRect(), dpr = edGeom.dpr, b = ed.blocks[edDrag.bi];
  if (edDrag.mode === 'dur') {
    // Bei Intervallen verschiebt sich die Kante der n-ten Wiederholung um n·Δ – darum durch (rep+1) teilen
    const t = (e.clientX - r.left) * dpr / chart.width * edDrag.total;
    b[edDrag.key] = clamp(snapDur(edDrag.v0 + (t - edDrag.t0) / (edDrag.rep + 1)), 5, 3 * 3600);
  } else {
    // relativ zur Mausbewegung, damit der Block beim Anfassen nicht springt
    b[edDrag.key] = clamp(snapPow(edDrag.v0 + fracAtY((e.clientY - r.top) * dpr) - edDrag.f0), 0, 3);
  }
  // Eingabefelder des Blocks nachführen, ohne die Liste neu aufzubauen
  const row = $('#woEdBlocks').querySelector(`.blk[data-i="${edDrag.bi}"]`);
  if (row) {
    const inp = row.querySelector(`input[data-k="${edDrag.key}"]`);
    if (inp) inp.value = edDrag.mode === 'dur' ? fmtDur(b[edDrag.key]) : powIn(b[edDrag.key]);
    row.style.setProperty('--c', blockColor(b));
  }
  renderEdPreview(); edTip(e, edTipText(edDrag));
});
const endDrag = (e: PointerEvent) => { if (!edDrag) return; edDrag = null; edTip(e, null); renderEdPreview(); };
chart.addEventListener('pointerup', endDrag);
chart.addEventListener('pointercancel', endDrag);
chart.addEventListener('pointerleave', () => { if (!edDrag && edHover) { edHover = null; renderEdPreview(); } });

function saveEditor(): LibEntry | null {
  const name = $('#woEdName').value.trim() || 'Mein Workout';
  if (!ed.blocks.length) { toast('Füge zuerst Blöcke hinzu.'); return null; }
  const list = libLoad(), entry: LibEntry = { id: ed.id || ('w' + Date.now().toString(36)), name, blocks: ed.blocks, updated: Date.now() };
  const i = list.findIndex(x => x.id === entry.id); if (i >= 0) list[i] = entry; else list.push(entry);
  libSave(list);
  ed.id = entry.id;
  toast(persistent ? 'Workout gespeichert: ' + name : 'Gespeichert, aber nur bis zum Schliessen: Dieser Browser erlaubt keinen dauerhaften Speicher. Lade es als .zwo herunter.', persistent ? 2000 : 6000);
  return entry;
}

$('#woEdBlocks').addEventListener('input', (e: Event) => {
  const inp = e.target as HTMLInputElement, row = inp.closest('.blk') as HTMLElement; if (!row || !inp.dataset.k) return;
  const b = ed.blocks[+row.dataset.i], k = inp.dataset.k;
  if (k === 'reps') b.reps = clamp(Math.round(+inp.value) || 1, 1, 50);
  else if (/dur/i.test(k)) b[k] = clamp(parseDur(inp.value), 0, 6 * 3600);
  else b[k] = clamp(powOut(inp.value), 0, 5);
  row.style.setProperty('--c', blockColor(b));
  renderEdPreview();
});
$('#woEdBlocks').addEventListener('change', (e: Event) => {   // Dauer nach der Eingabe einheitlich als m:ss zeigen
  const inp = e.target as HTMLInputElement, row = inp.closest('.blk') as HTMLElement; if (!row || !inp.classList.contains('dur')) return;
  inp.value = fmtDur(ed.blocks[+row.dataset.i][inp.dataset.k]);
});
$('#woEdBlocks').addEventListener('click', (e: Event) => {
  const btn = (e.target as HTMLElement).closest('button[data-act]') as HTMLElement; if (!btn) return;
  const i = +(btn.closest('.blk') as HTMLElement).dataset.i, a = btn.dataset.act, bl = ed.blocks;
  if (a === 'up' && i > 0) [bl[i - 1], bl[i]] = [bl[i], bl[i - 1]];
  else if (a === 'down' && i < bl.length - 1) [bl[i + 1], bl[i]] = [bl[i], bl[i + 1]];
  else if (a === 'dup') bl.splice(i + 1, 0, JSON.parse(JSON.stringify(bl[i])));
  else if (a === 'del') bl.splice(i, 1);
  renderBlocks();
});
$('#woEdAdd').addEventListener('click', (e: Event) => {
  const btn = (e.target as HTMLElement).closest('button[data-type]') as HTMLElement; if (!btn) return;
  ed.blocks.push(newBlock(btn.dataset.type as BlockType));
  renderBlocks();
  const rows = $('#woEdBlocks').children; if (rows.length) rows[rows.length - 1].scrollIntoView({ block: 'nearest' });
});
$('#woList').addEventListener('click', (e: Event) => {
  const btn = (e.target as HTMLElement).closest('button[data-act]') as HTMLElement; if (!btn) return;
  const id = (btn.closest('.wo-item') as HTMLElement).dataset.id, list = libLoad(), x = list.find(w => w.id === id); if (!x) return;
  const a = btn.dataset.act;
  if (a === 'ride') rideBlocks(x.name, x.blocks);
  else if (a === 'edit') openEditor(x);
  else if (a === 'zwo') zwoFile(x.name, x.blocks);
  else if (a === 'del' && confirm('Workout «' + x.name + '» löschen?')) { libSave(list.filter(w => w.id !== id)); showLib(); }
});
$('#btnWo').onclick = openWorkouts;
$('#woLibClose').onclick = closeWorkouts;
$('#woNew').onclick = () => openEditor(null);
$('#woFile').onclick = () => { closeWorkouts(); $('#fileWo').click(); };
$('#woEdBack').onclick = showLib;
$('#woEdSave').onclick = () => { if (saveEditor()) showLib(); };
$('#woEdRide').onclick = () => {   // auch wenn das Speichern scheitert, wird gefahren
  if (!ed.blocks.length) { toast('Füge zuerst Blöcke hinzu.'); return; }
  saveEditor(); rideBlocks($('#woEdName').value.trim() || 'Mein Workout', ed.blocks);
};
$('#woEdZwo').onclick = () => { if (ed.blocks.length) zwoFile($('#woEdName').value.trim() || 'Mein Workout', ed.blocks); };
for (const [k, v] of Object.entries(BLOCK_TYPES)) $('#woEdAdd').insertAdjacentHTML('beforeend', `<button data-type="${k}">+ ${v.name}</button>`);
