/* Pulsgurt und Zwift Click.
   Zwift-Dienst 00000001-19ca-…: 0002 Notify (Tasten), 0003 Write (Handshake/Keepalive), 0004 Indicate (Antwort).
   Ohne "RideOn" alle 3 s trennt sich der Click nach etwa einer Minute. */
import { bus, notify, sleep } from '../util';
import { ZW, RIDE_ON, HRS, CH, parseClick, parseHr } from './protocol';
import { btAvailable, btError } from './trainer';
import { tlog } from './diag';

export const hrm = { device: null as BluetoothDevice | null, connected: false, bpm: 0, lastAt: 0 };

export async function connectHr() {
  if (!btAvailable()) return;
  try {
    const device = await (navigator as any).bluetooth.requestDevice({ filters: [{ services: [HRS] }] });
    hrm.device = device;
    device.addEventListener('gattserverdisconnected', () => { hrm.connected = false; bus.emit('devices'); notify('Pulsgurt getrennt.'); });
    const server = await device.gatt.connect();
    const svc = await server.getPrimaryService(HRS);
    const ch = await svc.getCharacteristic(CH.heartRate);
    ch.addEventListener('characteristicvaluechanged', (e: any) => { hrm.bpm = parseHr(e.target.value); hrm.lastAt = performance.now(); });
    await ch.startNotifications();
    hrm.connected = true; bus.emit('devices'); notify((device.name || 'Pulsgurt') + ' verbunden.');
  } catch (e) { btError(e); }
}

interface ClickDev { device: BluetoothDevice; connected: boolean; prev: { plus: boolean; minus: boolean }; timer: any; }
export const clicks: ClickDev[] = [];   // ein Click v1 oder die zwei Teile eines Click v2
const lastPress = { plus: 0, minus: 0 };

function onButton(btn: 'plus' | 'minus') {
  // Ein Click v2 meldet jeden Druck an beiden Teilen – doppelte Meldungen ignorieren
  const now = performance.now(); if (now - lastPress[btn] < 150) return; lastPress[btn] = now;
  bus.emit('click', btn === 'plus' ? 1 : -1);
}

export async function connectClick() {
  if (!btAvailable()) return;
  try {
    const device = await (navigator as any).bluetooth.requestDevice({ filters: [{ namePrefix: 'Zwift Click' }, { services: [ZW(1)] }], optionalServices: [ZW(1)] });
    if (clicks.some(c => c.device === device && c.connected)) { notify((device.name || 'Click') + ' ist schon verbunden.'); return; }
    const c: ClickDev = { device, connected: false, prev: { plus: false, minus: false }, timer: null };
    clicks.push(c);
    device.addEventListener('gattserverdisconnected', () => {
      c.connected = false; clearInterval(c.timer); clicks.splice(clicks.indexOf(c), 1); bus.emit('devices');
      tlog('Zwift Click getrennt'); notify('Zwift Click getrennt.');
    });
    const server = await device.gatt.connect();
    const svc = await server.getPrimaryService(ZW(1));
    const ntf = await svc.getCharacteristic(ZW(2)), rx = await svc.getCharacteristic(ZW(3));
    ntf.addEventListener('characteristicvaluechanged', (e: any) => {
      const st = parseClick(e.target.value); if (!st) return;
      for (const b of ['plus', 'minus'] as const) if (st[b] && !c.prev[b]) onButton(b);   // nur beim Drücken
      c.prev = st;
    });
    await ntf.startNotifications();
    try {
      const tx = await svc.getCharacteristic(ZW(4));
      tx.addEventListener('characteristicvaluechanged', (e: any) => {
        const dv = e.target.value as DataView, b0 = dv.byteLength ? dv.getUint8(0) : 0;
        if (b0 === 0x52) tlog('Zwift Click antwortet: RideOn');
        else if (b0 === 0xFF) { tlog('Zwift Click ist gesperrt (verschlüsselt)'); notify('Der Click ist gesperrt. Koppel ihn einmal mit der Zwift-App, danach geht es hier.', 7000); }
      });
      await tx.startNotifications();
    } catch (e) { /* ältere Clicks ohne Antwort-Kanal */ }
    await sleep(500);   // ohne diese Pause kommen manchmal nur einzelne Tastendrücke an
    const w = (b: number[]) => rx.writeValueWithoutResponse ? rx.writeValueWithoutResponse(new Uint8Array(b)) : rx.writeValue(new Uint8Array(b));
    await w(RIDE_ON);                                          // Click v1
    await sleep(300); await w([...RIDE_ON, 0x02, 0x03]);       // Click v2
    await sleep(300); await w([0x00, 0x08, 0x00]);
    await sleep(300); await w([0x00, 0x08, 0x10]);
    c.timer = setInterval(() => { if (device.gatt.connected) w(RIDE_ON).catch(() => { /* egal */ }); }, 3000);
    c.connected = true; bus.emit('devices');
    tlog('Zwift Click verbunden: ' + (device.name || ''));
    notify((device.name || 'Zwift Click') + ' verbunden. Plus/Minus schalten die Gänge, im ERG-Modus ±10 W.');
  } catch (e) { btError(e); }
}
