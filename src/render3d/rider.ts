import * as THREE from 'three';
import { clamp } from '../util';

const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
function placeLimb(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  _d.subVectors(b, a); const len = _d.length();
  m.position.addVectors(a, b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(_up, _d.normalize()); m.scale.set(1, len, 1);
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// Einfacher Velofahrer aus Grundkörpern; pose(a) stellt Kurbel und Beine für den Kurbelwinkel a
export function createRider() {
  const g = new THREE.Group();
  const M = (c: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.05, ...o });
  const frameMat = M(0x1e2a36, { metalness: 0.35, roughness: 0.4 }), tireMat = M(0x15181b, { roughness: 0.95 }), rimMat = M(0xb7c1cb, { metalness: 0.6, roughness: 0.35 });
  const jersey = M(0xf5b700), shorts = M(0x1b1f25), skin = M(0xd9a988), helmet = M(0xf3f5f7, { roughness: 0.4 }), shoe = M(0x2b3139);
  const cyl = (r: number, mat: THREE.Material, seg = 8) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, seg), mat); g.add(m); return m; };
  const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) => { const m = cyl(r, mat); placeLimb(m, a, b); return m; };

  const wheels: THREE.Group[] = [];
  for (const wz of [-0.5, 0.52]) {
    const w = new THREE.Group(); w.position.set(0, 0.34, wz);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.022, 6, 30), tireMat); tire.rotation.y = Math.PI / 2; w.add(tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.014, 4, 30), rimMat); rim.rotation.y = Math.PI / 2; w.add(rim);
    for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.6, 0.014), rimMat); sp.rotation.x = k * Math.PI / 3; w.add(sp); }
    g.add(w); wheels.push(w);
  }
  const BB = V(0, 0.31, 0), seatTop = V(0, 0.86, -0.15), headTop = V(0, 0.85, 0.42), headBot = V(0, 0.68, 0.47), rearAx = V(0, 0.34, -0.5), frontAx = V(0, 0.34, 0.52);
  tube(BB, seatTop, 0.02, frameMat); tube(seatTop, headTop, 0.019, frameMat); tube(BB, headBot, 0.024, frameMat); tube(headBot, headTop, 0.022, frameMat);
  tube(BB, rearAx, 0.012, frameMat); tube(V(0, 0.8, -0.15), rearAx, 0.011, frameMat); tube(headBot, frontAx, 0.014, frameMat);
  tube(headTop, V(0, 0.94, 0.47), 0.014, frameMat);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.03), frameMat); bar.position.set(0, 0.94, 0.48); g.add(bar);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.26), shorts); saddle.position.set(0, 0.91, -0.17); g.add(saddle);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 4, 20), rimMat); ring.rotation.y = Math.PI / 2; ring.position.copy(BB); ring.position.x = 0.05; g.add(ring);

  const crank = new THREE.Group(); crank.position.copy(BB); g.add(crank);
  const armGeo = new THREE.BoxGeometry(0.02, 0.17, 0.03); armGeo.translate(0, 0.085, 0);
  const arm1 = new THREE.Mesh(armGeo, rimMat); arm1.position.x = 0.07; crank.add(arm1);
  const arm2 = new THREE.Mesh(armGeo, rimMat); arm2.position.x = -0.07; arm2.rotation.x = Math.PI; crank.add(arm2);

  // Oberkörper
  const hipC = V(0, 1.0, -0.13), shC = V(0, 1.37, 0.25);
  const torso = tube(hipC, shC, 0.14, jersey); torso.scale.x = 1.2;
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), shorts); hips.position.copy(hipC); hips.scale.set(1.25, 0.8, 1); g.add(hips);
  tube(V(0, 1.37, 0.25), V(0, 1.45, 0.33), 0.05, skin);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), skin); head.position.set(0, 1.49, 0.38); g.add(head);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), helmet); helm.position.set(0, 1.51, 0.36); helm.scale.set(1, 0.95, 1.3); g.add(helm);
  for (const sx of [1, -1]) {
    const sh = V(0.17 * sx, 1.35, 0.24), el = V(0.2 * sx, 1.16, 0.37), ha = V(0.2 * sx, 0.97, 0.47);
    tube(sh, el, 0.045, jersey); tube(el, ha, 0.038, skin);
  }
  // Beine (animiert)
  const legs = [];
  for (const sx of [1, -1]) {
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), skin); g.add(knee);
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.24), shoe); g.add(sh);
    legs.push({ sx, thigh: cyl(0.065, shorts), shin: cyl(0.048, skin), knee, shoe: sh });
  }
  const L1 = 0.46, L2 = 0.47, hip = new THREE.Vector3(), foot = new THREE.Vector3(), knee = new THREE.Vector3();
  function pose(a: number) {
    crank.rotation.x = a - Math.PI / 2;
    legs.forEach((lg, side) => {
      const ang = a + side * Math.PI;
      foot.set(0.1 * lg.sx, 0.31 + Math.sin(ang) * 0.17, -Math.cos(ang) * 0.17);
      hip.set(0.09 * lg.sx, 0.98, -0.15);
      const dz = foot.z - hip.z, dy = foot.y - hip.y;
      const d = clamp(Math.hypot(dz, dy), Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.004);
      const base = Math.atan2(dy, dz), phi = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      const a1 = base + phi, a2 = base - phi;
      const z1 = hip.z + L1 * Math.cos(a1), z2 = hip.z + L1 * Math.cos(a2);
      const ka = z1 > z2 ? a1 : a2;
      knee.set(hip.x, hip.y + L1 * Math.sin(ka), hip.z + L1 * Math.cos(ka));
      placeLimb(lg.thigh, hip, knee); placeLimb(lg.shin, knee, foot);
      lg.knee.position.copy(knee);
      lg.shoe.position.set(foot.x, foot.y - 0.02, foot.z + 0.03);
    });
  }
  pose(0);
  return { group: g, wheels, pose };
}
