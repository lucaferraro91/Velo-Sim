/* Dauerhafter Speicher in IndexedDB (Datenbank "velosim", Tabelle "kv").
   Beim Start wird alles in einen Zwischenspeicher geladen; Lesen ist danach synchron,
   Schreiben läuft im Hintergrund. Alte Daten aus dem Prototyp (localStorage) werden
   einmalig übernommen. Ohne IndexedDB (privates Fenster, gesperrte Website-Daten)
   läuft die App mit dem Zwischenspeicher weiter, speichert aber nichts dauerhaft. */

const DB_NAME = 'velosim', STORE = 'kv';
const cache = new Map<string, any>();
let db: IDBDatabase | null = null;
export let persistent = false;

// Schlüssel aus dem Prototyp (localStorage) → Schlüssel hier
const LEGACY: Record<string, string> = { 'velosim-settings': 'settings', 'velosim-workouts': 'workouts' };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function initStore() {
  try {
    db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(STORE, 'readonly'), os = tx.objectStore(STORE);
      const keysReq = os.getAllKeys(), valsReq = os.getAll();
      tx.oncomplete = () => { (keysReq.result as string[]).forEach((k, i) => cache.set(k, valsReq.result[i])); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
    persistent = true;
  } catch (e) {
    console.warn('IndexedDB nicht verfügbar, Daten werden nicht dauerhaft gespeichert', e);
  }
  migrateLegacy();
}

function migrateLegacy() {
  try {
    if (typeof localStorage === 'undefined') return;
    for (const [old, key] of Object.entries(LEGACY)) {
      const raw = localStorage.getItem(old);
      if (raw == null || cache.has(key)) continue;
      try { setItem(key, JSON.parse(raw)); } catch (e) { /* unlesbar, überspringen */ }
    }
  } catch (e) { /* localStorage gesperrt */ }
}

export const getItem = <T = any>(key: string, fallback: T = null): T => cache.has(key) ? cache.get(key) : fallback;

export function setItem(key: string, value: any) {
  cache.set(key, value);
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.onerror = () => console.warn('Speichern fehlgeschlagen', tx.error);
  } catch (e) { console.warn('Speichern fehlgeschlagen', e); }
}

// Sicherung: alle Daten als JSON-Objekt
export function exportBackup() {
  const data: Record<string, any> = {};
  for (const [k, v] of cache) data[k] = v;
  return { app: 'velo-sim', version: 1, created: new Date().toISOString(), data };
}

export function importBackup(obj: any) {
  if (!obj || obj.app !== 'velo-sim' || typeof obj.data !== 'object') throw new Error('Die Datei ist keine Velo-Sim-Sicherung.');
  for (const [k, v] of Object.entries(obj.data)) setItem(k, v);
}
