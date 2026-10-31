/* Workout-Dateien lesen: Zwift (.zwo), ERG/MRC (Rouvy, TrainerRoad …) und Garmin (.fit) */
import { makeWorkout, type Segment, type Workout } from './model';
import { parseFIT } from '../fit/reader';

export function parseZWO(text: string): Workout {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Die Datei ist kein gültiges Zwift-Workout.');
  const wEl = doc.getElementsByTagName('workout')[0];
  if (!wEl) throw new Error('In der Datei wurde kein <workout> gefunden.');
  const nameEl = doc.getElementsByTagName('name')[0];
  const num = (el: Element, a: string, d: number) => { const v = parseFloat(el.getAttribute(a)); return isFinite(v) ? v : d; };
  const events = (el: Element) => Array.from(el.getElementsByTagName('textevent')).map(t => ({ off: num(t, 'timeoffset', 0), text: t.getAttribute('message') || '' })).filter(e => e.text);
  const segs: Segment[] = [];
  for (const el of Array.from(wEl.children)) {
    const tag = el.tagName.toLowerCase(), dur = num(el, 'Duration', 0);
    if (tag === 'warmup' || tag === 'cooldown' || tag === 'ramp') {
      const lo = num(el, 'PowerLow', 0.5), hi = num(el, 'PowerHigh', lo);
      segs.push({ dur, lo, hi, unit: 'ftp', ramp: true, label: tag === 'warmup' ? 'Aufwärmen' : tag === 'cooldown' ? 'Ausfahren' : 'Rampe', events: events(el) });
    } else if (tag === 'steadystate' || tag === 'solidstate') {
      const p = num(el, 'Power', num(el, 'PowerLow', 0.6));
      segs.push({ dur, lo: p, hi: p, unit: 'ftp', label: 'Konstant', events: events(el) });
    } else if (tag === 'intervalst') {
      const rep = Math.max(1, Math.round(num(el, 'Repeat', 1))), on = num(el, 'OnDuration', 60), off = num(el, 'OffDuration', 60);
      const onP = num(el, 'OnPower', num(el, 'PowerOnHigh', 1)), offP = num(el, 'OffPower', num(el, 'PowerOffLow', 0.5));
      const ev = events(el);
      for (let r = 0; r < rep; r++) {
        segs.push({ dur: on, lo: onP, hi: onP, unit: 'ftp', label: 'Intervall ' + (r + 1) + '/' + rep, events: r ? [] : ev });
        segs.push({ dur: off, lo: offP, hi: offP, unit: 'ftp', label: 'Erholung ' + (r + 1) + '/' + rep });
      }
    } else if (tag === 'freeride' || tag === 'maxeffort') {
      segs.push({ dur, free: true, label: tag === 'maxeffort' ? 'Maximal' : 'Frei fahren', events: events(el) });
    }
  }
  return makeWorkout((nameEl && nameEl.textContent.trim()) || 'Zwift-Workout', segs);
}

/* ERG/MRC: Stützpunkte "Minuten <Tab> Wert". Zwischen zwei Punkten verläuft die Leistung linear;
   zwei Punkte mit gleicher Zeit sind ein Sprung. MRC: % FTP. ERG: Watt – steht im Kopf eine FTP,
   wird relativ dazu gerechnet, damit das Workout zur eigenen FTP passt. */
export function parseERG(text: string, fileName = ''): Workout {
  const head = (text.match(/\[COURSE HEADER\]([\s\S]*?)\[END COURSE HEADER\]/i) || [])[1];
  const body = (text.match(/\[COURSE DATA\]([\s\S]*?)\[END COURSE DATA\]/i) || [])[1];
  if (!head || !body) throw new Error('Die Datei ist keine gültige ERG- oder MRC-Datei.');
  const hv = (k: string) => { const m = head.match(new RegExp('^\\s*' + k + '\\s*=\\s*(.+)$', 'im')); return m ? m[1].trim() : null; };
  const pct = /MINUTES\s+PERCENT/i.test(head), fileFtp = parseFloat(hv('FTP'));
  const unit = pct || fileFtp > 0 ? 'ftp' : 'w';
  const conv = (v: number) => pct ? v / 100 : fileFtp > 0 ? v / fileFtp : v;
  const pts = body.split(/\r?\n/).map(l => l.trim().split(/\s+/).map(Number)).filter(a => a.length >= 2 && isFinite(a[0]) && isFinite(a[1]));
  if (pts.length < 2) throw new Error('In der Datei wurden keine Leistungsdaten gefunden.');
  const segs: Segment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, p0] = pts[i], [t1, p1] = pts[i + 1], dur = (t1 - t0) * 60;
    if (dur <= 0) continue;
    const lo = conv(p0), hi = conv(p1);
    segs.push({ dur, lo, hi, unit, ramp: lo !== hi, label: lo === hi ? 'Konstant' : hi > lo ? 'Rampe hoch' : 'Rampe runter' });
  }
  const txt = (text.match(/\[COURSE TEXT\]([\s\S]*?)\[END COURSE TEXT\]/i) || [])[1];
  const w = makeWorkout(hv('DESCRIPTION') || hv('FILE NAME') || fileName.replace(/\.\w+$/, '') || 'Workout', segs);
  if (txt) for (const l of txt.split(/\r?\n/)) { const p = l.split('\t'); if (p.length >= 2 && isFinite(+p[0]) && p[1].trim()) w.msgs.push({ at: +p[0], text: p[1].trim() }); }
  w.msgs.sort((a, b) => a.at - b.at);
  return w;
}

// Garmin-Workout: Nachricht 26 (workout, Feld 8 = Name) und 27 (workout_step)
export function parseGarminFIT(buf: ArrayBuffer): Workout {
  const msgs = parseFIT(buf);
  const steps = msgs.filter(m => m.gmn === 27), wk = msgs.find(m => m.gmn === 26);
  if (!steps.length) throw new Error('In der FIT-Datei ist kein Workout. Gefahrene Aktivitäten lassen sich nicht als Workout laden.');
  const ZONE_MID = [0, 0.50, 0.65, 0.83, 0.98, 1.13, 1.35, 1.60];   // Mitte der Leistungszonen 1–7
  const INTENS: Record<number, string> = { 0: 'Aktiv', 1: 'Erholung', 2: 'Aufwärmen', 3: 'Ausfahren', 4: 'Erholung', 5: 'Intervall' };
  const out: Segment[] = [], startOf: Record<number, number> = {};
  steps.forEach((s, k) => {
    const idx = s.f[254] != null ? s.f[254] : k, dType = s.f[1], dVal = s.f[2] || 0;
    startOf[idx] = out.length;
    if (dType === 6) {   // Wiederholung ab Schritt dVal, insgesamt s.f[4] Mal
      const block = out.slice(startOf[dVal] != null ? startOf[dVal] : 0);
      for (let r = 1; r < (s.f[4] || 1); r++) for (const b of block) out.push({ ...b });
      return;
    }
    const seg: Segment = { dur: 0, label: s.f[0] || INTENS[s.f[7]] || 'Abschnitt' };
    if (dType === 0) seg.dur = dVal / 1000;            // Zeit in ms
    else if (dType === 1) seg.dur = dVal / 100 / 8.33; // Distanz in cm, grob bei 30 km/h
    else { seg.dur = 600; seg.open = true; }           // offen (Runden-Taste) oder Bedingung
    const tt = s.f[3];
    if (tt === 4 || (tt >= 7 && tt <= 10)) {          // Leistungsziel
      const lo = s.f[5], hi = s.f[6], z = s.f[4];
      if (lo || hi) {
        // Werte ab 1000 sind Watt (+1000), darunter % FTP
        const conv = (v: number) => v >= 1000 ? { v: v - 1000, u: 'w' as const } : { v: v / 100, u: 'ftp' as const };
        const a = conv(lo || hi), b = conv(hi || lo);
        Object.assign(seg, { lo: a.v, hi: b.u === a.u ? b.v : a.v, unit: a.u });
      } else if (z >= 1 && z <= 7) Object.assign(seg, { lo: ZONE_MID[z], hi: ZONE_MID[z], unit: 'ftp', zone: z });
      else seg.free = true;
    } else seg.free = true;
    out.push(seg);
  });
  return makeWorkout((wk && wk.f[8]) || 'Garmin-Workout', out);
}
