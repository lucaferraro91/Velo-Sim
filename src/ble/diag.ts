import { bus } from '../util';

// Protokoll der Trainer-Kommunikation für die Diagnose (Taste D)
export const diagLines: string[] = [];
export function tlog(msg: string) {
  const t = new Date().toLocaleTimeString('de-CH');
  diagLines.push(t + '  ' + msg); if (diagLines.length > 60) diagLines.shift();
  console.log('[Trainer]', msg);
  bus.emit('diag');
}
