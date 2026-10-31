/* Smart Trainer: Verbindung (FTMS, Tacx FE-C über BLE, Cycling Power), Befehlswarteschlange
   und Regelung (Steigung mit virtuellem Gang oder ERG). */
import { clamp, bus, notify } from '../util';
import { settings } from '../settings';
import { state, ride } from '../core/state';
import { gearFactor } from '../core/gears';
import {
  FTMS, CPS, TACX_FEC, TACX_RX, TACX_TX, OPNAMES, RESNAMES,
  simBytes, ergBytes, describeCmd, fecUserConfig, ftmsToFec, parseFec, parseIndoorBike, parseCyclingPower,
  type BikeData, type CrankPrev
} from './protocol';
import { tlog } from './diag';

export const trainer = {
  device: null as BluetoothDevice | null,
  proto: null as 'ftms' | 'tacx' | 'cps' | null,
  connected: false, controllable: false,
  features: null as { erg: boolean; sim: boolean } | null,
  power: 0, cadence: null as number | null, speed: null as number | null, hr: 0, lastPowerAt: 0,
  cp: null as BluetoothRemoteGATTCharacteristic | null,
  prevCrank: null as CrankPrev | null,
  gen: 0
};

export function btAvailable() {
  if (!(navigator as any).bluetooth) { notify('Bluetooth ist in diesem Browser nicht verfügbar. Nutze Chrome oder Edge am Computer oder auf Android.', 6000); return false; }
  return true;
}
export function btError(e: any, step = '') {
  if (e && e.name === 'NotFoundError' && !step) return;   // Auswahl abgebrochen
  tlog('✗ ' + (step ? step + ': ' : '') + (e && e.name ? e.name + ' – ' : '') + (e && e.message ? e.message : e));
  if (e && e.name === 'SecurityError') notify('Bluetooth ist in dieser eingebetteten Ansicht gesperrt. Öffne die Seite in einem eigenen Browser-Tab.', 7000);
  else notify('Verbindung fehlgeschlagen: ' + (e && e.message ? e.message : e), 6000);
  console.warn(e);
}

function applyData(d: BikeData) {
  if (d.speed != null) trainer.speed = d.speed;
  if (d.cadence !== undefined) trainer.cadence = d.cadence;
  if (d.hr) trainer.hr = d.hr;
  if (d.power != null) { trainer.power = d.power; trainer.lastPowerAt = performance.now(); }
}

/* Befehlswarteschlange: ein Befehl nach dem anderen, mit Zeitlimit, damit ein Trainer
   ohne Antwort nicht alle weiteren Befehle blockiert. */
let cpChain: Promise<any> = Promise.resolve();
const withTimeout = (p: Promise<any>, ms: number) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('keine Antwort nach ' + ms / 1000 + ' s')), ms))]);
export function cpWrite(bytes: number[]) {
  const c = trainer.cp; if (!c) return Promise.resolve();
  const wire = trainer.proto === 'tacx' ? ftmsToFec(bytes) : bytes;
  if (!wire) return cpChain;
  const buf = new Uint8Array(wire);
  cpChain = cpChain.then(() => {
    tlog('→ ' + describeCmd(bytes));
    return withTimeout(writeChar(c, buf), 4000);
  }).catch(e => tlog('✗ Schreibfehler: ' + (e && e.message || e)));
  return cpChain;
}

/* Schreiben mit oder ohne Antwort – je nachdem, was die Charakteristik kann. Manche Browser
   (z.B. Bluefy auf dem iPad) liefern keine Angaben zu den Eigenschaften und bieten nicht alle
   Schreibarten an; dann wird die andere Art versucht und für die Verbindung gemerkt. */
let writeMode: 'resp' | 'noresp' | null = null;
async function writeChar(c: BluetoothRemoteGATTCharacteristic, buf: Uint8Array<ArrayBuffer>) {
  const props: any = c.properties || {};
  const canResp = typeof c.writeValueWithResponse === 'function', canNo = typeof c.writeValueWithoutResponse === 'function';
  if (!writeMode) writeMode = (props.write === false && props.writeWithoutResponse && canNo) || (!canResp && canNo) ? 'noresp' : 'resp';
  const doWrite = (m: 'resp' | 'noresp') => m === 'noresp' ? c.writeValueWithoutResponse(buf) : canResp ? c.writeValueWithResponse(buf) : c.writeValue(buf);
  try { await doWrite(writeMode); }
  catch (e) {
    const other = writeMode === 'resp' ? 'noresp' : 'resp';
    if (other === 'noresp' && !canNo) throw e;
    await doWrite(other);
    tlog('Schreibart gewechselt: ' + (other === 'noresp' ? 'ohne' : 'mit') + ' Antwort');
    writeMode = other;
  }
}
export const sendUserConfig = () => { if (trainer.connected && trainer.proto === 'tacx') cpWrite(fecUserConfig(settings.riderKg, settings.bikeKg)); };

function onCpResponse(dv: DataView) {
  if (dv.byteLength >= 3 && dv.getUint8(0) === 0x80) {
    const op = dv.getUint8(1), res = dv.getUint8(2);
    tlog('← ' + (OPNAMES[op] || '0x' + op.toString(16)) + ': ' + (RESNAMES[res] || 'Code ' + res));
    if (res !== 1) {
      if (op === 0x00) { trainer.controllable = false; notify('Der Trainer erlaubt keine Steuerung. Ist noch eine andere App verbunden?', 6000); }
      else if (op === 0x05) { bus.emit('erg-unsupported'); notify('Der Trainer unterstützt den ERG-Modus nicht. Zurück im Steigungsmodus.', 6000); }
      else if (op === 0x11) notify('Der Trainer hat die Steigungsvorgabe abgelehnt.', 5000);
    }
  }
}

/* all = true zeigt alle Bluetooth-Geräte (Notlösung, falls der Trainer in der normalen Suche
   fehlt – unter iOS sieht der Browser nur die Dienste, die ein Gerät aktiv ankündigt). */
export async function connectTrainer(all = false) {
  if (!btAvailable()) return;
  let step = '';   // leer = Auswahl; Abbruch der Auswahl wird nicht gemeldet
  try {
    const optionalServices = [FTMS, CPS, TACX_FEC];
    const device = await (navigator as any).bluetooth.requestDevice(all ? { acceptAllDevices: true, optionalServices } : {
      filters: [{ services: [FTMS] }, { services: [CPS] }, { services: [TACX_FEC] }, { namePrefix: 'Tacx' }, { namePrefix: 'NEO' }, { namePrefix: 'Neo' }],
      optionalServices
    });
    writeMode = null;
    // Bisherige Verbindung sauber trennen, bevor der neue Trainer übernimmt
    const gen = ++trainer.gen;
    if (trainer.device && trainer.device.gatt.connected) trainer.device.gatt.disconnect();
    Object.assign(trainer, { device, proto: null, connected: false, controllable: false, cp: null, cadence: null, speed: null, features: null, prevCrank: null, lastPowerAt: 0 });
    tlog('Verbinde mit ' + (device.name || 'Trainer'));
    ctl.lastKey = null; bus.emit('devices');
    device.addEventListener('gattserverdisconnected', () => {
      if (gen !== trainer.gen) return;   // alte Verbindung, bewusst getrennt
      tlog('Verbindung getrennt');
      trainer.connected = false; trainer.controllable = false; trainer.cp = null; bus.emit('devices');
      notify('Trainer getrennt. Du fährst jetzt mit simulierter Leistung weiter.');
    });
    notify('Verbinde mit ' + (device.name || 'Trainer') + ' …', 3000);
    step = 'Verbindung aufbauen';
    const server = await device.gatt.connect();
    tlog('Verbunden, suche Dienste');
    step = 'Dienste suchen';
    let ftms = null, tacx = null;
    try { ftms = await server.getPrimaryService(FTMS); } catch (e) { tlog('FTMS: ' + (e.name || '') + ' ' + (e.message || '')); }
    if (!ftms) try { tacx = await server.getPrimaryService(TACX_FEC); } catch (e) { tlog('Tacx FE-C: ' + (e.name || '') + ' ' + (e.message || '')); }
    if (ftms) {
      step = 'FTMS einrichten';
      trainer.proto = 'ftms'; tlog('FTMS-Dienst gefunden');
      const data = await ftms.getCharacteristic(0x2AD2);
      data.addEventListener('characteristicvaluechanged', (e: any) => applyData(parseIndoorBike(e.target.value)));
      await data.startNotifications();
      // Fähigkeiten (Fitness Machine Feature): Bit 3 = Zielleistung, Bit 13 = Simulation
      try {
        const fv = await (await ftms.getCharacteristic(0x2ACC)).readValue();
        if (fv.byteLength >= 8) { const ts = fv.getUint32(4, true); trainer.features = { erg: !!(ts & (1 << 3)), sim: !!(ts & (1 << 13)) }; }
        tlog('Fähigkeiten: ERG ' + (trainer.features?.erg ? 'ja' : 'nein') + ', Steigung ' + (trainer.features?.sim ? 'ja' : 'nein'));
      } catch (e) { tlog('Fähigkeiten nicht lesbar: ' + e.message); }
      try {
        const cp = await ftms.getCharacteristic(0x2AD9);
        cp.addEventListener('characteristicvaluechanged', (e: any) => onCpResponse(e.target.value));
        await cp.startNotifications();
        trainer.cp = cp; trainer.controllable = true;
        await cpWrite([0x00]);   // Steuerung anfordern
        await cpWrite([0x07]);   // Start/Fortsetzen
      } catch (e) { trainer.controllable = false; tlog('Keine Trainersteuerung: ' + e.message); }
      trainer.connected = true; ctl.lastKey = null;
      notify((device.name || 'Trainer') + ' verbunden' + (trainer.controllable ? ', Steigung, ERG und virtuelle Gänge aktiv.' : ', nur Leistungsdaten.'));
    } else if (tacx) {
      step = 'Tacx FE-C einrichten';
      trainer.proto = 'tacx'; tlog('Tacx FE-C-Dienst gefunden');
      const rx = await tacx.getCharacteristic(TACX_RX);
      rx.addEventListener('characteristicvaluechanged', (e: any) => { const d = parseFec(e.target.value); if (d) applyData(d); });
      await rx.startNotifications();
      trainer.cp = await tacx.getCharacteristic(TACX_TX);
      trainer.controllable = true; trainer.features = { erg: true, sim: true };
      trainer.connected = true; ctl.lastKey = null;
      sendUserConfig();
      notify((device.name || 'Tacx') + ' verbunden (Tacx-Protokoll). Steigung, ERG und virtuelle Gänge aktiv.');
    } else {
      step = 'Leistungsmesser einrichten (weder FTMS noch Tacx FE-C gefunden)';
      trainer.proto = 'cps';
      const cps = await server.getPrimaryService(CPS);
      const ch = await cps.getCharacteristic(0x2A63);
      ch.addEventListener('characteristicvaluechanged', (e: any) => {
        const r = parseCyclingPower(e.target.value, trainer.prevCrank, performance.now());
        trainer.prevCrank = r.prev; applyData(r.data);
      });
      await ch.startNotifications();
      tlog('Kein FTMS-Dienst gefunden, nur Leistungsmesser (keine Steuerung möglich)');
      trainer.connected = true; trainer.controllable = false;
      notify((device.name || 'Gerät') + ' verbunden. Es liefert nur Leistung, der Widerstand wird nicht gesteuert.', 6000);
    }
    bus.emit('devices');
  } catch (e) { btError(e, step); }
}

/* Regelung: sendet laufend Steigung (mit virtuellem Gang) oder ERG-Ziel.
   Gleiche Befehle höchstens alle 3 s, geänderte frühestens nach 250 ms. */
export const ctl = { lastKey: null as string | null, lastAt: 0, busy: false, pending: null as number[] | null };
export function controlBytes() {
  if (state.running && state.mode === 'erg') return ergBytes(state.ergTarget);
  const g = state.running ? Math.round(clamp(ride.cur.g * settings.difficulty / 100, -0.2, 0.2) * 1000) / 1000 : 0;
  return simBytes(g, gearFactor(), { riderKg: settings.riderKg, bikeKg: settings.bikeKg, crr: settings.crr, cda: settings.cda, v: state.v });
}
async function pushControl(bytes: number[]) {
  if (ctl.busy) { ctl.pending = bytes; return; }
  ctl.busy = true; ctl.lastKey = bytes.join(','); ctl.lastAt = performance.now();
  await cpWrite(bytes);
  ctl.busy = false;
  if (ctl.pending) { const b = ctl.pending; ctl.pending = null; pushControl(b); }
}
export function updateControl(now: number, force = false) {
  if (!trainer.connected || !trainer.controllable) return;
  const b = controlBytes(), key = b.join(',');
  if (!force && ((key === ctl.lastKey && now - ctl.lastAt < 3000) || now - ctl.lastAt < 250)) return;
  pushControl(b);
}
