# Velo-Sim

**▶ Live: [lucaferraro91.github.io/Velo-Sim](https://lucaferraro91.github.io/Velo-Sim/)** (Chrome oder Edge)

Work in progress, just for fun. Maybe it will develop to an unreal engine game who knows ^^

iPad User: try the Bluefy browser

Indoor-Velotraining im Browser: GPX-Strecken in einer beim Fahren erzeugten 3D-Welt abfahren,
Smart Trainer steuern (Steigung mit virtuellen Gängen oder ERG), Workouts laden oder selbst bauen
und Fahrten als `.fit` für Strava und Garmin Connect speichern. Installierbar als App (PWA).

## Starten

Voraussetzung: [Node.js](https://nodejs.org) (LTS).

```bash
npm install
npm run dev
```

Dann http://localhost:5173 in **Chrome oder Edge** öffnen (Web Bluetooth).

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver mit automatischem Neuladen |
| `npm test` | Automatische Tests (Vitest) |
| `npm run build` | Typprüfung und fertige App in `dist/` |
| `npm run preview` | Gebaute App lokal ansehen (inkl. Service Worker) |
| `npm run relay` | WebSocket-Relais für die Telemetrie (siehe `docs/telemetrie.md`) |
| `npm run icons` | App-Icons aus dem Motiv in `scripts/make-icons.mjs` neu erzeugen |

## Aufbau

```
src/
  main.ts              Start, Hauptschleife, Tasten, Dateien
  ride.ts              Ablauf einer Fahrt (laden, Start/Pause, Ziel, .fit speichern)
  store.ts             Speicher (IndexedDB, Übernahme der Prototyp-Daten, Sicherung)
  settings.ts          Einstellungen
  util.ts              Helfer, Ereignis-Bus
  core/                Logik ohne DOM und ohne Three.js
    route.ts           GPX lesen, Strecke aufbereiten, Demo-Runde
    physics.ts         Fahrphysik
    gears.ts           Virtuelle Kassette, Synchro-Schaltung
    mode.ts            Steigung/ERG, Schalten, ERG-Ziel
    zones.ts           FTP-Zonen
    recorder.ts        Fahrt-Aufzeichnung (1 Hz)
    telemetry.ts       Fahrzustand als Objekt + WebSocket-Ausgang
  ble/                 Bluetooth
    protocol.ts        Protokolle als reine Funktionen (FTMS, Tacx FE-C, Cycling Power, Zwift Click)
    trainer.ts         Trainer verbinden, Befehlswarteschlange, Regelung
    sensors.ts         Pulsgurt, Zwift Click
  workouts/            Workout-Modell, Dateiformate (.zwo/.erg/.mrc/.fit), Ablauf, Editor-Blöcke
  fit/                 FIT lesen und schreiben
  render3d/            Three.js-Welt, Fahrer, Kamera – liest nur Strecke + Telemetrie
  ui/                  Anzeige, Diagramme, Karte, Workout-Panel, Editor, Einstellungen, Diagnose
tests/                 Vitest
tools/relay.mjs        Telemetrie-Relais
docs/                  Telemetrie-Format, Veröffentlichen
```

Der Kern (`core/`, `ble/protocol.ts`, `workouts/`, `fit/`) hängt nicht von der Darstellung ab.
Ein anderer Renderer, z.B. Unreal Engine, kann die Fahrt über die Telemetrie zeigen,
während Velo-Sim Trainer, Physik und Workouts übernimmt (`docs/telemetrie.md`).

## Tasten

<kbd>Leertaste</kbd> Start/Pause · <kbd>M</kbd> Steigung/ERG · <kbd>←</kbd> <kbd>→</kbd> Gang ·
<kbd>F</kbd> Kettenblatt · <kbd>↑</kbd> <kbd>↓</kbd> Leistung bzw. Workout-Intensität ·
<kbd>N</kbd> nächster Workout-Abschnitt · <kbd>C</kbd> Kamera · <kbd>D</kbd> Trainer-Diagnose
