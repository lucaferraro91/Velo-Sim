/* Telemetrie: der Fahrzustand als einfaches Objekt. Die Three.js-Darstellung liest nur dieses
   Objekt; optional geht es zusätzlich per WebSocket an einen externen Renderer (z.B. Unreal Engine).
   Format: siehe docs/telemetrie.md */
import { state, ride } from './state';
import { toLatLon, STEP, type Route } from './route';
import { ringT, cogT, gearRatio } from './gears';
import { wo, currentSegment } from '../workouts/engine';
import { settings } from '../settings';

export interface Telemetry {
  type: 'state'; v: 1; t: number;
  running: boolean; finished: boolean;
  route: { name: string; total: number; hasGeo: boolean } | null;
  s: number; x: number; z: number; e: number; grade: number;
  lat: number | null; lon: number | null;
  speed: number; power: number; cadence: number; hr: number;
  elapsed: number; climb: number;
  mode: 'sim' | 'erg'; ergTarget: number;
  gear: { ring: number; cog: number; ratio: number };
  workout: { name: string; index: number; count: number; label: string; remaining: number; target: number | null } | null;
}

export function snapshot(): Telemetry {
  const r = ride.route, c = ride.cur;
  const ll = r && r.geo ? toLatLon(r.geo, c.x, c.z) : null;
  const seg = currentSegment();
  return {
    type: 'state', v: 1, t: Date.now(),
    running: state.running, finished: state.finished,
    route: r ? { name: r.name, total: r.total, hasGeo: !!r.geo } : null,
    s: state.s, x: c.x, z: c.z, e: c.e, grade: c.g,
    lat: ll ? ll[0] : null, lon: ll ? ll[1] : null,
    speed: state.v, power: Math.round(state.power), cadence: Math.round(state.cadence || 0), hr: state.hr || 0,
    elapsed: state.elapsed, climb: state.climb,
    mode: state.mode, ergTarget: state.ergTarget,
    gear: { ring: ringT(), cog: cogT(), ratio: Math.round(gearRatio() * 1000) / 1000 },
    workout: wo.w && !wo.done && seg ? {
      name: wo.w.name, index: wo.idx, count: wo.w.segs.length, label: seg.s.label,
      remaining: Math.max(0, seg.s.dur - seg.tin), target: seg.target == null ? null : Math.round(seg.target)
    } : null
  };
}

/* WebSocket-Ausgang. Browser können keinen Server öffnen; die App verbindet sich deshalb als
   Client mit der eingestellten Adresse (z.B. tools/relay.mjs oder direkt ein Server in Unreal).
   Bei Verbindungsabbruch wird alle 3 s neu versucht. */
let ws: WebSocket | null = null, wsUrl = '', retryAt = 0, sentAt = 0;
export const telemetryStatus = () => !settings.telemetry ? 'aus' : ws && ws.readyState === WebSocket.OPEN ? 'verbunden' : 'getrennt';

/* Strecken-Nachricht: die aufbereitete Strecke (alle STEP m ein Punkt), damit ein Renderer keine
   GPX-Datei lesen muss und die Strasse exakt dort liegt, wo die Physik rechnet.
   points = [x0, z0, e0, x1, z1, e1, …] in Metern, auf cm gerundet. */
export interface RouteMessage {
  type: 'route'; v: 1; name: string; step: number; n: number; total: number;
  climb: number; minE: number; maxE: number;
  geo: Route['geo'] | null; points: number[];
}
export function routeMessage(r: Route): RouteMessage {
  const points = new Array(r.n * 3), cm = (v: number) => Math.round(v * 100) / 100;
  for (let i = 0; i < r.n; i++) { points[i * 3] = cm(r.X[i]); points[i * 3 + 1] = cm(r.Z[i]); points[i * 3 + 2] = cm(r.E[i]); }
  return { type: 'route', v: 1, name: r.name, step: STEP, n: r.n, total: r.total,
    climb: Math.round(r.climb), minE: cm(r.minE), maxE: cm(r.maxE), geo: r.geo || null, points };
}

let routeSent: Route | null = null;
function sendRoute() {
  if (!ws || ws.readyState !== WebSocket.OPEN || !ride.route) return;
  try { ws.send(JSON.stringify(routeMessage(ride.route))); routeSent = ride.route; } catch (e) { /* später erneut */ }
}

export function telemetryTick(now: number, snap: () => Telemetry) {
  if (!settings.telemetry) { if (ws) { ws.close(); ws = null; } return; }
  if (!ws || wsUrl !== settings.telemetryUrl || ws.readyState === WebSocket.CLOSED) {
    if (ws && wsUrl !== settings.telemetryUrl) { ws.close(); ws = null; }
    if (now < retryAt) return;
    retryAt = now + 3000; wsUrl = settings.telemetryUrl;
    try { ws = new WebSocket(wsUrl); } catch (e) { ws = null; return; }
    routeSent = null;
    ws.onopen = sendRoute;
    // Ein Renderer, der später dazukommt, kann die Strecke anfordern: {"type":"request-route"}
    ws.onmessage = e => { try { if (JSON.parse(String(e.data)).type === 'request-route') sendRoute(); } catch (err) { /* andere Nachricht */ } };
  }
  if (ws.readyState !== WebSocket.OPEN) return;
  if (routeSent !== ride.route) sendRoute();   // neue Strecke geladen
  if (now - sentAt < 100) return;              // Zustand ca. 10× pro Sekunde
  sentAt = now;
  try { ws.send(JSON.stringify(snap())); } catch (e) { /* Verbindung bricht gerade ab */ }
}
