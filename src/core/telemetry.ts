/* Telemetrie: der Fahrzustand als einfaches Objekt. Die Three.js-Darstellung liest nur dieses
   Objekt; optional geht es zusätzlich per WebSocket an einen externen Renderer (z.B. Unreal Engine).
   Format: siehe docs/telemetrie.md */
import { state, ride } from './state';
import { toLatLon } from './route';
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

export function telemetryTick(now: number, snap: () => Telemetry) {
  if (!settings.telemetry) { if (ws) { ws.close(); ws = null; } return; }
  if (!ws || wsUrl !== settings.telemetryUrl || ws.readyState === WebSocket.CLOSED) {
    if (ws && wsUrl !== settings.telemetryUrl) { ws.close(); ws = null; }
    if (now < retryAt) return;
    retryAt = now + 3000; wsUrl = settings.telemetryUrl;
    try { ws = new WebSocket(wsUrl); } catch (e) { ws = null; return; }
  }
  if (ws.readyState !== WebSocket.OPEN || now - sentAt < 100) return;   // ca. 10× pro Sekunde
  sentAt = now;
  try { ws.send(JSON.stringify(snap())); } catch (e) { /* Verbindung bricht gerade ab */ }
}
