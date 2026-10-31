import { describe, it, expect } from 'vitest';
import { nextGear, bestGear, RINGS, CASSETTES } from '../src/core/gears';

const rs = RINGS['50-34'].t, cs = CASSETTES['11-34/12'].t;
const name = (g: { front: number; rear: number }) => rs[g.front] + 'x' + cs[g.rear];

function run(start: { front: number; rear: number }, d: number, n: number, synchro = true) {
  const out = [name(start)]; let g = start;
  for (let i = 0; i < n; i++) { g = nextGear(rs, cs, g.front, g.rear, d, synchro); out.push(name(g)); }
  return out;
}

describe('virtuelle Gänge', () => {
  it('findet den echten Gang 34×17 in der Kassette', () => {
    expect(name(bestGear(rs, cs, 34 / 17, 0, false))).toBe('34x17');
  });
  it('schaltet mit Synchro hoch wie Di2 (Blattwechsel vor dem Kreuzen)', () => {
    expect(run(bestGear(rs, cs, 2, 0, false), 1, 10)).toEqual(
      ['34x17', '34x15', '34x14', '50x19', '50x17', '50x15', '50x14', '50x13', '50x12', '50x11', '50x11']);
  });
  it('schaltet mit Synchro runter und wechselt aufs kleine Blatt', () => {
    expect(run({ front: 1, rear: 0 }, -1, 15)).toEqual(
      ['50x11', '50x12', '50x13', '50x14', '50x15', '50x17', '50x19', '50x21', '50x24', '50x27', '34x19', '34x21', '34x24', '34x27', '34x30', '34x34']);
  });
  it('Übersetzungen steigen beim Hochschalten streng an', () => {
    let g = { front: 0, rear: cs.length - 1 }, prev = 0;
    for (let i = 0; i < 20; i++) {
      const r = rs[g.front] / cs[g.rear]; expect(r).toBeGreaterThanOrEqual(prev); prev = r;
      g = nextGear(rs, cs, g.front, g.rear, 1, true);
    }
  });
  it('bleibt ohne Synchro auf dem Blatt', () => {
    expect(run({ front: 0, rear: 3 }, 1, 4, false)).toEqual(['34x14', '34x13', '34x12', '34x11', '34x11']);
  });
});
