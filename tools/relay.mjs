// WebSocket-Relais für die Telemetrie: leitet jede Nachricht an alle anderen verbundenen Clients weiter.
// Browser können keinen Server öffnen – Velo-Sim und ein externer Renderer (z.B. Unreal Engine)
// verbinden sich darum beide als Client mit diesem Relais.
//   npm run relay            (Port 8787)
//   npm run relay -- 9000    (anderer Port)
import { WebSocketServer } from 'ws';

const port = Number(process.argv[2]) || 8787;
const wss = new WebSocketServer({ port });
let count = 0, last = 0;

wss.on('connection', (ws, req) => {
  console.log(`Verbunden: ${req.socket.remoteAddress} (${wss.clients.size} Clients)`);
  ws.on('message', (data, isBinary) => {
    count++;
    for (const c of wss.clients) if (c !== ws && c.readyState === 1) c.send(data, { binary: isBinary });
    const now = Date.now();
    if (now - last > 5000) { last = now; console.log(`${count} Nachrichten weitergeleitet, letzte: ${String(data).slice(0, 120)}…`); }
  });
  ws.on('close', () => console.log(`Getrennt (${wss.clients.size} Clients)`));
});
console.log(`Telemetrie-Relais läuft auf ws://localhost:${port}`);
