// WebSocket-Relais für die Telemetrie: leitet jede Nachricht an alle anderen verbundenen Clients weiter.
// Browser können keinen Server öffnen – Velo-Sim und ein externer Renderer (z.B. Unreal Engine)
// verbinden sich darum beide als Client mit diesem Relais.
// - Die letzte Strecken-Nachricht ({"type":"route"}) wird gemerkt und an neu verbundene Clients
//   geschickt – so bekommt ein später gestarteter Renderer die Strecke sofort.
// - Gelände-Anfragen ({"type":"terrain-request"} / {"type":"terrain-profile"}) beantwortet das Relais
//   selbst mit Höhen aus swissALTI3D (tools/terrain.mjs) – nur an den Fragenden.
//   npm run relay            (Port 8787)
//   npm run relay -- 9000    (anderer Port)
import { WebSocketServer } from 'ws';
import { SwissAlti } from './terrain.mjs';

const port = Number(process.argv[2]) || 8787;
const wss = new WebSocketServer({ port, maxPayload: 32 * 1024 * 1024 });
const terrain = new SwissAlti();
let count = 0, last = 0, lastRoute = null, terrainCount = 0;

wss.on('connection', (ws, req) => {
  console.log(`Verbunden: ${req.socket.remoteAddress} (${wss.clients.size} Clients)`);
  if (lastRoute) ws.send(lastRoute);
  // Gelände-Anfragen eines Clients nacheinander abarbeiten (Reihenfolge = Wichtigkeit)
  let queue = Promise.resolve();
  ws.on('message', (data, isBinary) => {
    count++;
    const text = isBinary ? null : String(data);
    if (text && text.startsWith('{"type":"terrain-')) {
      queue = queue.then(async () => {
        try {
          const reply = await terrain.handle(JSON.parse(text));
          if (reply && ws.readyState === 1) ws.send(JSON.stringify(reply));
          if (++terrainCount % 25 === 0) console.log(`${terrainCount} Gelände-Anfragen beantwortet`);
        } catch (e) { console.log('Gelände-Anfrage fehlgeschlagen:', e.message); }
      });
      return;
    }
    if (text && text.startsWith('{"type":"route"')) {
      lastRoute = text;
      const m = JSON.parse(text);
      console.log(`Strecke erhalten: «${m.name}», ${(m.total / 1000).toFixed(1)} km, ${m.n} Punkte`);
    }
    for (const c of wss.clients) if (c !== ws && c.readyState === 1) c.send(data, { binary: isBinary });
    const now = Date.now();
    if (now - last > 5000 && text && text.startsWith('{"type":"state"')) { last = now; console.log(`${count} Nachrichten weitergeleitet, letzte: ${text.slice(0, 120)}…`); }
  });
  ws.on('close', () => console.log(`Getrennt (${wss.clients.size} Clients)`));
});
console.log(`Telemetrie-Relais läuft auf ws://localhost:${port} (Gelände: swissALTI3D © swisstopo, Zwischenspeicher ${terrain.cacheDir})`);
