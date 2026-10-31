# Velo-Sim veröffentlichen (HTTPS)

Web Bluetooth und die Installation als App (PWA) brauchen HTTPS. Lokal gilt `http://localhost`
ebenfalls als sicher; für andere Geräte (z.B. ein Android-Tablet am Trainer) muss die App auf
einem HTTPS-Server liegen. Beide Wege hier sind kostenlos.

Vorher immer bauen:

```bash
npm run build
```

Das Ergebnis liegt in `dist/` und ist eine reine statische Website (HTML, JS, CSS, Service Worker).
Weil `base: './'` gesetzt ist, läuft sie auch in einem Unterordner.

## Variante A: Netlify Drop (am einfachsten)

1. https://app.netlify.com/drop öffnen und anmelden.
2. Den Ordner `dist` ins Browserfenster ziehen.
3. Netlify zeigt eine Adresse wie `https://irgendwas.netlify.app` – fertig.
4. Für ein Update: neu bauen und `dist` wieder hineinziehen (Projekt → Deploys).

## Variante B: GitHub Pages

1. Auf GitHub ein (privates oder öffentliches) Repository anlegen und dieses Projekt hochladen.
2. Der Workflow liegt schon bereit (`.github/workflows/pages.yml`): Er testet, baut und
   veröffentlicht bei jedem Push auf `main`.
3. Im Repository: Settings → Pages → Source: «GitHub Actions».
4. Die App ist danach unter `https://<benutzer>.github.io/<repository>/` erreichbar.

## Als App installieren

- **Chrome/Edge (Windows, Mac, Android):** Seite öffnen → Installieren-Symbol in der Adressleiste
  bzw. Menü → «App installieren». Danach startet Velo-Sim im eigenen Fenster und auch offline.
- **iPhone/iPad:** Installieren geht («Zum Home-Bildschirm»), aber Safari unterstützt kein
  Web Bluetooth – ohne Trainer nur mit dem Leistungsregler. Dafür wäre eine native App nötig
  (z.B. mit Capacitor).

## Updates

Der Service Worker lädt neue Versionen automatisch im Hintergrund (`registerType: 'autoUpdate'`);
beim nächsten Start ist die neue Version aktiv.

## Daten

Einstellungen und eigene Workouts liegen im Browser (IndexedDB) – pro Browser und pro Adresse.
Wechselt die Adresse (z.B. von `localhost` zu Netlify), sind sie dort zuerst leer: vorher unter
Einstellungen → «Sichern (.json)» exportieren und dort «Wiederherstellen».

## Hinweis zur Karte

Die Kartenbilder kommen von Esri (World Topo Map) und sind für private Nutzung gedacht. Für eine
öffentlich angebotene App einen Kartendienst mit eigenem Schlüssel verwenden (z.B. MapTiler)
und die Adresse in `src/ui/map.ts` anpassen.
