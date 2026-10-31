import type { Route, Sample } from './route';

export type Mode = 'sim' | 'erg';

// Zustand der Fahrt – wird vom Kern verändert und von Darstellung/Oberfläche gelesen
export const state = {
  running: false, finished: false,
  s: 0,            // Position auf der Route (m)
  v: 0,            // Tempo (m/s)
  power: 0, cadence: 0, hr: 0,
  elapsed: 0,      // Fahrzeit ohne Pausen (s)
  climb: 0, energy: 0,
  simPower: 180,   // Regler ohne Trainer
  mode: 'sim' as Mode, ergTarget: 200,
  front: 0, rear: 0,   // virtueller Gang (Index Kettenblatt/Ritzel)
  camMode: 0,
  powAvg: 0            // geglättete Leistung (ca. 3 s) für die Zonenanzeige
};

export const ride = {
  route: null as Route | null,
  cur: { x: 0, z: 0, e: 0, g: 0 } as Sample   // Punkt auf der Route an Position s
};
