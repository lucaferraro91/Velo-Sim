# Telemetrie-Schnittstelle

Velo-Sim kann den Fahrzustand ca. 10× pro Sekunde als JSON über WebSocket senden. Damit kann ein
anderes Programm, z.B. eine Spielwelt in Unreal Engine, dieselbe Fahrt darstellen. Velo-Sim kümmert
sich weiter um Bluetooth (Trainer, Click, Puls), Fahrphysik, Gänge und Workouts.

## Einschalten

1. Relais starten: `npm run relay` (lauscht auf `ws://localhost:8787`).
   Browser können keinen WebSocket-Server öffnen. Velo-Sim und der Renderer verbinden sich darum
   beide als Client mit dem Relais. Alternativ kann der Renderer selbst einen Server anbieten.
2. In Velo-Sim: Einstellungen → «Telemetrie senden» ankreuzen, Adresse prüfen, speichern.
3. Der Renderer verbindet sich mit derselben Adresse und erhält jede Nachricht.

Den Verbindungsstatus zeigt die Trainer-Diagnose (Taste <kbd>D</kbd>, Zeile «Telemetrie»).

## Nachrichten

Es gibt zwei Arten: die **Strecke** (einmalig) und den **Zustand** (laufend).

### Strecke: `{"type":"route"}`

Wird gesendet, sobald die Verbindung steht, bei jedem Streckenwechsel und auf Anfrage.
Ein Renderer braucht damit keine GPX-Datei: Er baut die Strasse direkt aus diesen Punkten,
die exakt dieselben sind, mit denen Velo-Sim die Physik rechnet.

```json
{
  "type": "route", "v": 1, "name": "Demo-Runde mit Anstieg",
  "step": 5, "n": 2801, "total": 14000,
  "climb": 300, "minE": 421.3, "maxE": 680.9,
  "geo": null,
  "points": [0, 0, 430.1,  1.48, 4.77, 430.2,  …]
}
```

| Feld | Bedeutung |
|---|---|
| `step`, `n`, `total` | Punktabstand (m), Anzahl Punkte, Länge (m) = (n − 1) · step |
| `points` | flach: `[x0, z0, e0, x1, z1, e1, …]` in Metern (cm-genau); Punkt `i` liegt bei Distanz `i · step` |
| `geo` | bei GPX `{ lat0, lon0, kx, kz }`: Breite = lat0 − z / kz, Länge = lon0 + x / kx; sonst `null` |

Kommt ein Renderer später dazu, schickt ihm das Relais die zuletzt gesendete Strecke automatisch.
Alternativ kann er `{"type":"request-route"}` senden; Velo-Sim antwortet mit der Strecke.

### Zustand: `{"type":"state"}`

```json
{
  "type": "state", "v": 1, "t": 1793473727409,
  "running": true, "finished": false,
  "route": { "name": "Demo-Runde mit Anstieg", "total": 14005, "hasGeo": false },
  "s": 1234.5, "x": 512.3, "z": -987.1, "e": 448.2, "grade": 0.025,
  "lat": null, "lon": null,
  "speed": 5.17, "power": 180, "cadence": 86, "hr": 0,
  "elapsed": 240.3, "climb": 18.4,
  "mode": "sim", "ergTarget": 200,
  "gear": { "ring": 50, "cog": 19, "ratio": 2.632 },
  "workout": null
}
```

| Feld | Einheit | Bedeutung |
|---|---|---|
| `t` | ms (Unix) | Sendezeitpunkt |
| `running`, `finished` | – | Fahrt läuft / Ziel erreicht |
| `route` | – | Streckenname, Länge in m, ob echte Koordinaten vorhanden sind |
| `s` | m | Position entlang der Strecke (ab Start) – **die wichtigste Grösse** |
| `x`, `z` | m | Lokale Koordinaten (x = Osten, z = Süden, Ursprung = erster GPX-Punkt) |
| `e` | m | Höhe über Meer |
| `grade` | Anteil | Steigung (0,05 = 5 %) |
| `lat`, `lon` | Grad | Nur bei GPX-Strecken, sonst `null` |
| `speed` | m/s | Tempo |
| `power`, `cadence`, `hr` | W, rpm, bpm | Leistung, Kadenz, Puls (0 = unbekannt) |
| `elapsed`, `climb` | s, m | Fahrzeit ohne Pausen, gefahrene Höhenmeter |
| `mode`, `ergTarget` | – / W | `sim` (Steigung mit Gängen) oder `erg` |
| `gear` | Zähne | Virtueller Gang: Kettenblatt, Ritzel, Übersetzung |
| `workout` | – | `null` oder `{ name, index, count, label, remaining (s), target (W oder null) }` |

## Hinweise für einen Renderer

- Beide Seiten laden dieselbe GPX-Datei. Am einfachsten setzt der Renderer den Fahrer anhand von `s`
  auf die Strecke (z.B. Distanz entlang eines Splines). `x`/`z`/`e` sind dieselbe Position in Metern.
- Velo-Sim glättet die Strecke: Punkte im Abstand von 5 m; Lage als gleitender Mittelwert über ±2 Punkte
  (2 Durchgänge), Höhe über ±6 Punkte (3 Durchgänge), siehe `buildRoute` in `src/core/route.ts`.
  Für eine exakt deckungsgleiche Strasse dieselbe Glättung verwenden.
- Zwischen zwei Nachrichten (100 ms) die Position mit `speed` weiterschieben, damit die Bewegung flüssig bleibt.
- Die Steuerung des Trainers bleibt in Velo-Sim; der Renderer muss nichts zurücksenden.
