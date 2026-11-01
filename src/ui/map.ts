/* Karte unten rechts (Leaflet). OpenStreetMap sperrt Kacheln ohne Referer, CARTO verlangt einen
   API-Schlüssel – die topografische Karte von Esri läuft ohne beides. */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { $, bus } from '../util';
import { state, ride } from '../core/state';
import { STEP, toLatLon } from '../core/route';

const osm = { map: null as L.Map | null, all: null as L.Polyline | null, done: null as L.Polyline | null, dot: null as L.CircleMarker | null, pts: [] as [number, number][], follow: true, doneAt: 0 };

export function setupMapRoute() {
  const route = ride.route, panel = $('#mapPanel');
  if (!route.geo) { panel.hidden = true; return; }   // Demo-Strecke hat keine echten Koordinaten
  panel.hidden = false;
  if (!osm.map) {
    osm.map = L.map('map', { zoomControl: false, attributionControl: true });
    osm.map.attributionControl.setPrefix(false);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Karte © <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a>, OpenStreetMap u.a.' }).addTo(osm.map);
    osm.map.on('dragstart', () => setMapFollow(false));
    // Klick auf die Karte: zur nächstgelegenen Stelle der Strecke springen (höchstens 300 m daneben)
    osm.map.on('click', (e: L.LeafletMouseEvent) => {
      if (!osm.pts.length) return;
      let best = 0, bestD = Infinity;
      osm.pts.forEach((p, i) => { const d = osm.map.distance(e.latlng, p); if (d < bestD) { bestD = d; best = i; } });
      if (bestD <= 300) bus.emit('seek', best * 2 * STEP);
    });
  }
  osm.map.invalidateSize();
  for (const k of ['all', 'done', 'dot'] as const) if (osm[k]) osm[k].remove();
  osm.pts = []; for (let i = 0; i < route.n; i += 2) osm.pts.push(toLatLon(route.geo, route.X[i], route.Z[i]));
  osm.all = L.polyline(osm.pts, { color: '#17222c', weight: 5, opacity: 0.55 }).addTo(osm.map);
  osm.done = L.polyline([], { color: '#f5b700', weight: 5, opacity: 1 }).addTo(osm.map);
  osm.dot = L.circleMarker(osm.pts[0], { radius: 7, color: '#17222c', weight: 2, fillColor: '#f5b700', fillOpacity: 1 }).addTo(osm.map);
  setMapFollow(true);
}

function setMapFollow(on: boolean) {
  osm.follow = on;
  $('#btnMapMode').textContent = on ? 'Ganze Strecke' : 'Mitfahren';
  if (!osm.map || !osm.all) return;
  if (on) osm.map.setView(osm.dot.getLatLng(), 15, { animate: false });
  else osm.map.fitBounds(osm.all.getBounds(), { padding: [16, 16] });
}

export function updateMap(now: number) {
  const route = ride.route;
  if (!osm.map || !route || !route.geo || $('#mapPanel').hidden) return;
  const pos = toLatLon(route.geo, ride.cur.x, ride.cur.z);
  osm.dot.setLatLng(pos);
  if (osm.follow) osm.map.panTo(pos, { animate: true, duration: 0.2, noMoveStart: true });
  if (now - osm.doneAt > 1000) {   // gefahrener Teil, einmal pro Sekunde
    const k = Math.min(osm.pts.length, Math.floor(state.s / STEP / 2) + 1);
    osm.done.setLatLngs(osm.pts.slice(0, k).concat([pos]));
    osm.doneAt = now;
  }
}

export const mapResize = () => { if (osm.map) osm.map.invalidateSize(); };
$('#btnMapMode').onclick = () => setMapFollow(!osm.follow);
