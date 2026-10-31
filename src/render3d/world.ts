/* Welt entlang der Route: Strasse, Böschung, Start-/Zielbogen und Gelände in Kacheln von
   300 × 300 m, die beim Fahren erzeugt und wieder entfernt werden (mit Wald, Feldern, Hügeln). */
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../util';
import { SEG, sampleAt, type Route } from '../core/route';

const CH = 300, CELL = 15, NV = CH / CELL + 1, RMAX = 340;
const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 5); trunkGeo.translate(0, 0.5, 0);
const coneGeo = new THREE.ConeGeometry(1, 1, 7); coneGeo.translate(0, 0.5, 0);
const blobGeo = new THREE.IcosahedronGeometry(1, 0);
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5b4331 });
const firMat = new THREE.MeshStandardMaterial({ color: 0x2f5a34, flatShading: true, roughness: 1 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x5f8f3a, flatShading: true, roughness: 1 });

// Farbwerte sind als sRGB gedacht; Three.js rechnet Vertex-Farben linear
const lin = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

const hills = (x: number, z: number) => 18 * Math.sin(x * 0.0061 + 1.7) * Math.cos(z * 0.0047 - 0.6) + 9 * Math.sin(x * 0.013 + z * 0.009) + 4 * Math.sin(z * 0.027 + 2.1) * Math.cos(x * 0.021) + 10;
const fieldAt = (x: number, z: number) => Math.sin(x * 0.011 + 1.2) * Math.sin(z * 0.0093 - 0.4);
const forestAt = (x: number, z: number) => Math.sin(x * 0.0072 - 0.8) * Math.cos(z * 0.0061 + 0.3);
const groundHeight = (x: number, z: number, d: number, e: number) => e + (d < 3.2 ? -0.5 : -0.2) + smoothstep(22, 220, d) * hills(x, z);
const ckey = (cx: number, cz: number) => cx + ',' + cz;
function mulberry32(a: number) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

interface Chunk { cx: number; cz: number; objs: THREE.Object3D[]; }

export class World {
  group = new THREE.Group();
  private chunks = new Map<string, Chunk>();
  private segHash = new Map<string, number[]>();
  private needed = new Set<string>();
  private nearD = 0; private nearE = 0;

  constructor(private route: Route, scene: THREE.Scene) {
    scene.add(this.group);
    this.buildRoad();
    this.prepareChunks();
  }

  private nearest(x: number, z: number, cand: number[]) {
    const { X, Z, E, n } = this.route; let best = 1e18, be = 0;
    for (let c = 0; c < cand.length; c++) {
      const ia = cand[c] * SEG, ib = Math.min(ia + SEG, n - 1);
      const ax = X[ia], az = Z[ia], vx = X[ib] - ax, vz = Z[ib] - az, L2 = vx * vx + vz * vz || 1e-9;
      let t = ((x - ax) * vx + (z - az) * vz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + vx * t - x, pz = az + vz * t - z, d2 = px * px + pz * pz;
      if (d2 < best) { best = d2; be = E[ia] + (E[ib] - E[ia]) * t; }
    }
    this.nearD = Math.sqrt(best); this.nearE = be;
  }

  private buildRoad() {
    const { n, X, Z, E } = this.route, hw = 2.6;
    const make = (offL: number, offR: number, dy: number, filter?: (i: number) => boolean) => {
      const pos = [], idx = [];
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        let tx = X[b] - X[a], tz = Z[b] - Z[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const nx = -tz, nz = tx;
        pos.push(X[i] + nx * offL, E[i] + dy, Z[i] + nz * offL, X[i] + nx * offR, E[i] + dy, Z[i] + nz * offR);
        if (i < n - 1 && (!filter || filter(i))) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      return geo;
    };
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x3d4247, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xeeeeea, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0x857a68, roughness: 1, side: THREE.DoubleSide });
    this.group.add(new THREE.Mesh(make(-hw, hw, 0.03), roadMat));
    this.group.add(new THREE.Mesh(make(-hw + 0.12, -hw + 0.26, 0.045), lineMat));
    this.group.add(new THREE.Mesh(make(hw - 0.26, hw - 0.12, 0.045), lineMat));
    this.group.add(new THREE.Mesh(make(-0.06, 0.06, 0.045, i => i % 3 === 0), lineMat));
    // Böschung an den Rändern
    for (const side of [-1, 1]) {
      const pos = [], idx = [];
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
        let tx = X[b] - X[a], tz = Z[b] - Z[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const nx = -tz * side, nz = tx * side;
        pos.push(X[i] + nx * hw, E[i] + 0.03, Z[i] + nz * hw, X[i] + nx * (hw + 1.2), E[i] - 0.6, Z[i] + nz * (hw + 1.2));
        if (i < n - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      this.group.add(new THREE.Mesh(geo, skirtMat));
    }
    // Start- und Zielbogen
    const r = this.route;
    for (const s of [0, r.total]) {
      const p = sampleAt(r, Math.min(Math.max(s, 1), r.total - 1)), q = sampleAt(r, s < 1 ? 6 : r.total - 6);
      const gate = new THREE.Group();
      const postMat = new THREE.MeshStandardMaterial({ color: 0x2b3742 }), banMat = new THREE.MeshStandardMaterial({ color: s ? 0xf5b700 : 0xffffff, side: THREE.DoubleSide });
      for (const sx of [-3.4, 3.4]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.4, 0.2), postMat); post.position.set(sx, 2.2, 0); gate.add(post); }
      const ban = new THREE.Mesh(new THREE.BoxGeometry(7, 0.9, 0.08), banMat); ban.position.set(0, 4.1, 0); gate.add(ban);
      gate.position.set(p.x, p.e, p.z); gate.lookAt(q.x, p.e, q.z);
      this.group.add(gate);
    }
  }

  private prepareChunks() {
    const { n, X, Z } = this.route, hash = this.segHash, nseg = Math.ceil((n - 1) / SEG);
    for (let k = 0; k < nseg; k++) {
      const ia = k * SEG, ib = Math.min(ia + SEG, n - 1);
      const k1 = ckey(Math.floor(X[ia] / CH), Math.floor(Z[ia] / CH)), k2 = ckey(Math.floor(X[ib] / CH), Math.floor(Z[ib] / CH));
      if (!hash.has(k1)) hash.set(k1, []); hash.get(k1).push(k);
      if (k2 !== k1) { if (!hash.has(k2)) hash.set(k2, []); hash.get(k2).push(k); }
    }
    for (let i = 0; i < n; i += 4) {
      const x = X[i], z = Z[i];
      for (let cx = Math.floor((x - RMAX) / CH); cx <= Math.floor((x + RMAX) / CH); cx++)
        for (let cz = Math.floor((z - RMAX) / CH); cz <= Math.floor((z + RMAX) / CH); cz++) {
          const dx = Math.max(cx * CH - x, 0, x - (cx + 1) * CH), dz = Math.max(cz * CH - z, 0, z - (cz + 1) * CH);
          if (dx * dx + dz * dz < RMAX * RMAX) this.needed.add(ckey(cx, cz));
        }
    }
  }

  private buildChunk(cx: number, cz: number) {
    const cand: number[] = [];
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { const a = this.segHash.get(ckey(cx + dx, cz + dz)); if (a) for (const k of a) cand.push(k); }
    const N = NV * NV, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), ok = new Uint8Array(N);
    for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
      const v = j * NV + i, x = cx * CH + i * CELL, z = cz * CH + j * CELL;
      this.nearest(x, z, cand);
      const d = this.nearD, y = groundHeight(x, z, d, this.nearE);
      ok[v] = d <= RMAX ? 1 : 0;
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      let r: number, g: number, b: number;
      if (d < 4.6) { r = 0.53; g = 0.49; b = 0.41; }
      else {
        const n1 = 0.5 + 0.5 * Math.sin(x * 0.05 + Math.cos(z * 0.043) * 2.0);
        r = lerp(0.30, 0.40, n1); g = lerp(0.52, 0.61, n1); b = lerp(0.22, 0.27, n1);
        if (d > 14 && fieldAt(x, z) > 0.55) { r = 0.76; g = 0.69; b = 0.37; }
        else if (forestAt(x, z) > 0.25) { r *= 0.8; g *= 0.85; b *= 0.8; }
        const hgt = smoothstep(22, 220, d) * hills(x, z), dark = 1 - 0.18 * clamp(hgt / 35, 0, 1);
        r *= dark; g *= dark; b *= dark;
      }
      col[v * 3] = lin(r); col[v * 3 + 1] = lin(g); col[v * 3 + 2] = lin(b);
    }
    const idx = [];
    for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NV - 1; i++) {
      const a = j * NV + i, b = a + 1, c = a + NV, d = c + 1;
      if (ok[a] && ok[b] && ok[c] && ok[d]) idx.push(a, c, b, b, c, d);
    }
    const chunk: Chunk = { cx, cz, objs: [] };
    if (idx.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, terrainMat); this.group.add(mesh); chunk.objs.push(mesh);
    }
    // Bäume
    const rnd = mulberry32((cx * 73856093) ^ (cz * 19349663));
    const firs = [], leafs = [];
    for (let k = 0; k < 110; k++) {
      const x = cx * CH + rnd() * CH, z = cz * CH + rnd() * CH, r1 = rnd(), r2 = rnd(), r3 = rnd();
      const forest = forestAt(x, z) > 0.25;
      if (!forest && r1 > 0.28) continue;
      if (fieldAt(x, z) > 0.5) continue;
      this.nearest(x, z, cand);
      if (this.nearD < 9 || this.nearD > RMAX - 15) continue;
      const y = groundHeight(x, z, this.nearD, this.nearE) - 0.3;
      (forest && r2 < 0.75 ? firs : leafs).push({ x, y, z, h: 6 + r3 * 9, rot: r2 * 6.28 });
    }
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), eul = new THREE.Euler();
    const total = firs.length + leafs.length;
    if (total) {
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, total);
      const fir = firs.length ? new THREE.InstancedMesh(coneGeo, firMat, firs.length) : null;
      const leaf = leafs.length ? new THREE.InstancedMesh(blobGeo, leafMat, leafs.length) : null;
      let ti = 0;
      firs.forEach((t, i) => {
        q.setFromEuler(eul.set(0, t.rot, 0));
        mtx.compose(p.set(t.x, t.y, t.z), q, s.set(1, t.h * 0.3, 1)); trunks.setMatrixAt(ti++, mtx);
        mtx.compose(p.set(t.x, t.y + t.h * 0.2, t.z), q, s.set(t.h * 0.22, t.h * 0.85, t.h * 0.22)); fir.setMatrixAt(i, mtx);
      });
      leafs.forEach((t, i) => {
        q.setFromEuler(eul.set(0, t.rot, 0)); const r = t.h * 0.32;
        mtx.compose(p.set(t.x, t.y, t.z), q, s.set(1.1, t.h * 0.5, 1.1)); trunks.setMatrixAt(ti++, mtx);
        mtx.compose(p.set(t.x, t.y + t.h * 0.5 + r * 0.5, t.z), q, s.set(r, r * 0.85, r)); leaf.setMatrixAt(i, mtx);
      });
      for (const m of [trunks, fir, leaf]) if (m) { m.instanceMatrix.needsUpdate = true; this.group.add(m); chunk.objs.push(m); }
    }
    this.chunks.set(ckey(cx, cz), chunk);
  }

  private disposeChunk(key: string) {
    const c = this.chunks.get(key); if (!c) return;
    for (const o of c.objs) { this.group.remove(o); if ((o as any).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); else (o as THREE.Mesh).geometry.dispose(); }
    this.chunks.delete(key);
  }

  // Kacheln rund um die Position erzeugen (höchstens budget pro Aufruf) und weit entfernte entfernen
  update(px: number, pz: number, budget: number) {
    const R = 480, list: [number, number, number][] = [];
    for (let cx = Math.floor((px - R) / CH); cx <= Math.floor((px + R) / CH); cx++)
      for (let cz = Math.floor((pz - R) / CH); cz <= Math.floor((pz + R) / CH); cz++) {
        const k = ckey(cx, cz); if (this.chunks.has(k) || !this.needed.has(k)) continue;
        const dx = (cx + 0.5) * CH - px, dz = (cz + 0.5) * CH - pz; list.push([dx * dx + dz * dz, cx, cz]);
      }
    list.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < list.length && i < budget; i++) this.buildChunk(list[i][1], list[i][2]);
    for (const [k, c] of this.chunks) { const dx = (c.cx + 0.5) * CH - px, dz = (c.cz + 0.5) * CH - pz; if (dx * dx + dz * dz > 900 * 900) this.disposeChunk(k); }
  }

  dispose(scene: THREE.Scene) {
    for (const k of Array.from(this.chunks.keys())) this.disposeChunk(k);
    this.group.traverse((o: any) => { if (o.isMesh && !o.isInstancedMesh && o.geometry) o.geometry.dispose(); });
    scene.remove(this.group);
  }
}
