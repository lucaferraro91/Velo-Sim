import { describe, it, expect } from 'vitest';
import { demoRoute, STEP } from '../src/core/route';
import { routeMessage } from '../src/core/telemetry';

describe('Strecken-Nachricht für externe Renderer', () => {
  const r = demoRoute(), m = routeMessage(r);

  it('enthält alle Punkte als [x, z, e] in Metern', () => {
    expect(m.type).toBe('route');
    expect(m.step).toBe(STEP);
    expect(m.n).toBe(r.n);
    expect(m.points.length).toBe(r.n * 3);
    expect(m.total).toBe((r.n - 1) * STEP);
    for (const i of [0, 100, r.n - 1]) {
      expect(m.points[i * 3]).toBeCloseTo(r.X[i], 2);
      expect(m.points[i * 3 + 1]).toBeCloseTo(r.Z[i], 2);
      expect(m.points[i * 3 + 2]).toBeCloseTo(r.E[i], 2);
    }
  });

  it('beginnt mit "type":"route" (das Relais erkennt die Nachricht daran) und bleibt kompakt', () => {
    const json = JSON.stringify(m);
    expect(json.startsWith('{"type":"route"')).toBe(true);
    expect(json.length).toBeLessThan(120 * 1024);   // 14-km-Demo-Runde
    expect(m.geo).toBeNull();
  });
});
