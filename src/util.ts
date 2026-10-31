// Kleine Helfer, die überall gebraucht werden (ohne DOM-Abhängigkeit ausser $ und Canvas-Helfern)

export const $ = (s: string): any => document.querySelector(s);
export const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const fmt1 = (v: number) => v.toLocaleString('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmt0 = (v: number) => Math.round(v).toLocaleString('de-CH');
export const fmtTime = (sec: number) => {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
};
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const xmlEsc = (s: string) => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
export const safeFile = (s: string) => (s || 'workout').replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '_') || 'workout';

// Dauer als m:ss; eine Zahl allein sind Minuten
export const fmtDur = (s: number) => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export function parseDur(t: string | number): number {
  t = String(t).trim().replace(',', '.');
  if (t.includes(':')) { const [m, s] = t.split(':'); return Math.round((parseFloat(m) || 0) * 60 + (parseFloat(s) || 0)); }
  return Math.round((parseFloat(t) || 0) * 60);
}

export const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export function sizeCanvas(c: HTMLCanvasElement) {
  const r = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
  return dpr;
}

export function downloadBlob(data: BlobPart, fileName: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Minimaler Ereignis-Bus, damit der Kern ohne DOM auskommt und die Oberfläche trotzdem reagiert
type Handler = (...args: any[]) => void;
const handlers = new Map<string, Set<Handler>>();
export const bus = {
  on(ev: string, fn: Handler) { if (!handlers.has(ev)) handlers.set(ev, new Set()); handlers.get(ev)!.add(fn); return () => handlers.get(ev)!.delete(fn); },
  emit(ev: string, ...args: any[]) { handlers.get(ev)?.forEach(fn => fn(...args)); }
};
// Meldung an die Oberfläche (Toast)
export const notify = (msg: string, ms = 4200) => bus.emit('toast', msg, ms);
