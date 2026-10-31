/* Eigene Workouts aus Blöcken (wie im Zwift-Editor). Leistungen sind Anteile der FTP, Dauern Sekunden. */
import { xmlEsc } from '../util';
import { makeWorkout, type Segment } from './model';
import { getItem, setItem } from '../store';

export type BlockType = 'warmup' | 'steady' | 'intervals' | 'ramp' | 'free' | 'cooldown';
export interface Block {
  type: BlockType;
  dur?: number; lo?: number; hi?: number; p?: number;
  reps?: number; onDur?: number; onP?: number; offDur?: number; offP?: number;
}
export interface LibEntry { id: string; name: string; blocks: Block[]; updated: number; }

export const BLOCK_TYPES: Record<BlockType, { name: string; def: Partial<Block> }> = {
  warmup: { name: 'Aufwärmen', def: { dur: 600, lo: 0.50, hi: 0.75 } },
  steady: { name: 'Konstant', def: { dur: 300, p: 0.75 } },
  intervals: { name: 'Intervalle', def: { reps: 5, onDur: 60, onP: 1.20, offDur: 60, offP: 0.55 } },
  ramp: { name: 'Rampe', def: { dur: 300, lo: 0.60, hi: 0.90 } },
  free: { name: 'Frei fahren', def: { dur: 300 } },
  cooldown: { name: 'Ausfahren', def: { dur: 300, lo: 0.65, hi: 0.45 } }
};
export const newBlock = (type: BlockType): Block => ({ type, ...BLOCK_TYPES[type].def });

// bi/part/rep merken, zu welchem Block (und Teil) ein Abschnitt gehört – fürs Ziehen im Editor
export function blocksToWorkout(name: string, blocks: Block[]) {
  const segs: Segment[] = [];
  blocks.forEach((b, bi) => {
    if (b.type === 'intervals') {
      for (let r = 0; r < b.reps; r++) {
        segs.push({ dur: b.onDur, lo: b.onP, hi: b.onP, unit: 'ftp', label: 'Intervall ' + (r + 1) + '/' + b.reps, bi, part: 'on', rep: r });
        segs.push({ dur: b.offDur, lo: b.offP, hi: b.offP, unit: 'ftp', label: 'Erholung ' + (r + 1) + '/' + b.reps, bi, part: 'off', rep: r });
      }
    } else if (b.type === 'steady') segs.push({ dur: b.dur, lo: b.p, hi: b.p, unit: 'ftp', label: 'Konstant', bi, part: 'main', rep: 0 });
    else if (b.type === 'free') segs.push({ dur: b.dur, free: true, label: 'Frei fahren', bi, part: 'main', rep: 0 });
    else segs.push({ dur: b.dur, lo: b.lo, hi: b.hi, unit: 'ftp', ramp: true, label: BLOCK_TYPES[b.type].name, bi, part: 'main', rep: 0 });
  });
  return makeWorkout(name || 'Mein Workout', segs);
}

export function blocksToZwo(name: string, blocks: Block[]) {
  const f = (v: number) => (+v).toFixed(2), lines = blocks.map(b => {
    switch (b.type) {
      case 'warmup': return `<Warmup Duration="${b.dur}" PowerLow="${f(b.lo)}" PowerHigh="${f(b.hi)}"/>`;
      case 'cooldown': return `<Cooldown Duration="${b.dur}" PowerLow="${f(b.lo)}" PowerHigh="${f(b.hi)}"/>`;
      case 'ramp': return `<Ramp Duration="${b.dur}" PowerLow="${f(b.lo)}" PowerHigh="${f(b.hi)}"/>`;
      case 'steady': return `<SteadyState Duration="${b.dur}" Power="${f(b.p)}"/>`;
      case 'free': return `<FreeRide Duration="${b.dur}" FlatRoad="1"/>`;
      case 'intervals': return `<IntervalsT Repeat="${b.reps}" OnDuration="${b.onDur}" OffDuration="${b.offDur}" OnPower="${f(b.onP)}" OffPower="${f(b.offP)}"/>`;
    }
  });
  return `<workout_file>\n  <author>Velo-Sim</author>\n  <name>${xmlEsc(name)}</name>\n  <description></description>\n  <sportType>bike</sportType>\n  <tags></tags>\n  <workout>\n    ${lines.join('\n    ')}\n  </workout>\n</workout_file>\n`;
}

// Bibliothek eigener Workouts (im Speicher unter "workouts")
export const libLoad = (): LibEntry[] => { const a = getItem('workouts', []); return Array.isArray(a) ? a : []; };
export const libSave = (list: LibEntry[]) => setItem('workouts', list);
