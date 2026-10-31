import { sampleAt } from './route';
import { state, ride } from './state';
import { settings } from '../settings';

const tmp = { x: 0, z: 0, e: 0, g: 0 };

/* Ein Zeitschritt der Fahrphysik: Antrieb aus der Leistung gegen Hangabtrieb,
   Rollwiderstand und Luftwiderstand. Gibt true zurück, wenn das Ziel erreicht ist. */
export function stepPhysics(dt: number): boolean {
  const route = ride.route, cur = ride.cur;
  const m = settings.riderKg + settings.bikeKg, g = 9.81, rho = 1.2;
  sampleAt(route, state.s, cur);
  const th = Math.atan(cur.g), v = state.v;
  const Fg = m * g * Math.sin(th), Fr = v > 0.05 ? settings.crr * m * g * Math.cos(th) : 0, Fa = 0.5 * rho * settings.cda * v * v;
  const Fp = state.power / Math.max(v, 1.5);
  const a = (Fp - Fg - Fr - Fa) / (m + 1.5);
  state.v = Math.max(0, v + a * dt);
  const prevE = cur.e;
  state.s += state.v * dt;
  state.elapsed += dt; state.energy += state.power * dt;
  let done = false;
  if (state.s >= route.total) { state.s = route.total; done = true; }
  const e2 = sampleAt(route, state.s, tmp).e; if (e2 > prevE) state.climb += e2 - prevE;
  return done;
}
