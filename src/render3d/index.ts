/* Three.js-Darstellung. Liest nur die Strecke (beim Laden) und pro Bild das Telemetrie-Objekt –
   ein anderer Renderer (z.B. Unreal Engine) kann dieselbe Fahrt aus denselben Daten zeigen. */
import * as THREE from 'three';
import { clamp } from '../util';
import { sampleAt, type Route, type Sample } from '../core/route';
import type { Telemetry } from '../core/telemetry';
import { createRider } from './rider';
import { World } from './world';

export const CAM_MODES = [
  { back: 5.5, up: 2.0, look: 6, lookUp: 1.0, name: 'Verfolger' },
  { back: 16, up: 9, look: 10, lookUp: 0, name: 'Vogelperspektive' },
  { side: true, name: 'Seitlich' }
] as { back?: number; up?: number; look?: number; lookUp?: number; side?: boolean; name: string }[];

// Seit Three.js r155 sind Lichter physikalisch skaliert; ×π entspricht der früheren Helligkeit
const LIGHT = Math.PI;

export class Renderer3D {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, 1, 0.1, 2200);
  private sky: THREE.Mesh; private mountains: THREE.Mesh;
  private rider = createRider();
  private shadow: THREE.Mesh;
  private world: World | null = null;
  private route: Route | null = null;
  private cur: Sample = { x: 0, z: 0, e: 0, g: 0 }; private ahead: Sample = { x: 0, z: 0, e: 0, g: 0 };
  private camDir = new THREE.Vector3(0, 0, 1);
  private camPos = new THREE.Vector3(); private camTarget = new THREE.Vector3(); private tmpDir = new THREE.Vector3();
  private crank = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const HORIZON = new THREE.Color(0xd3e3ec), ZENITH = new THREE.Color(0x4a8cc8);
    this.scene.background = HORIZON.clone();
    this.scene.fog = new THREE.Fog(HORIZON.getHex(), 120, 400);
    this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x56743f, 0.78 * LIGHT));
    const sun = new THREE.DirectionalLight(0xfff0d8, 0.82 * LIGHT); sun.position.set(-0.55, 1, 0.35); this.scene.add(sun);

    // Himmelskuppel
    {
      const geo = new THREE.SphereGeometry(1600, 32, 16), pos = geo.attributes.position, cols = [];
      for (let i = 0; i < pos.count; i++) { const t = clamp(pos.getY(i) / 1600 * 2.4, 0, 1); const c = HORIZON.clone().lerp(ZENITH, Math.pow(t, 0.65)); cols.push(c.r, c.g, c.b); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      this.sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
      this.sky.renderOrder = -3; this.scene.add(this.sky);
    }
    // Bergkulisse am Horizont
    {
      const N = 260, R = 1300, pos = [], col = [], idx = [];
      const rock = new THREE.Color(0x8fa3b4), snow = new THREE.Color(0xf1f5f8);
      for (let i = 0; i <= N; i++) {
        const a = i / N * Math.PI * 2;
        const h = 80 + 70 * Math.sin(a * 3 + 0.5) * Math.sin(a * 7 + 1.1) + 60 * Math.pow(Math.abs(Math.sin(a * 5 + 0.3)), 3) + 22 * Math.sin(a * 23) + 10 * Math.sin(a * 51);
        const x = Math.cos(a) * R, z = Math.sin(a) * R;
        pos.push(x, -90, z, x, h, z);
        col.push(HORIZON.r, HORIZON.g, HORIZON.b);
        const top = h > 150 ? rock.clone().lerp(snow, clamp((h - 150) / 50, 0, 0.85)) : rock.clone().lerp(HORIZON, 0.25);
        col.push(top.r, top.g, top.b);
      }
      for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      this.mountains = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthWrite: false }));
      this.mountains.renderOrder = -2; this.scene.add(this.mountains);
    }
    this.scene.add(this.rider.group);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.scale.set(0.35, 1.0, 1); this.shadow.renderOrder = 1; this.scene.add(this.shadow);
  }

  setRoute(route: Route) {
    if (this.world) this.world.dispose(this.scene);
    this.route = route;
    this.world = new World(route, this.scene);
    sampleAt(route, 0, this.cur); this.world.update(this.cur.x, this.cur.z, Infinity);
    sampleAt(route, 8, this.ahead); this.camDir.set(this.ahead.x - this.cur.x, 0, this.ahead.z - this.cur.z).normalize();
  }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
  }

  private updateRider(t: Telemetry, dt: number) {
    const r = this.route, cur = this.cur, ahead = this.ahead;
    sampleAt(r, t.s, cur);
    const sa = t.s + 2.5 <= r.total ? t.s + 2.5 : t.s - 2.5; sampleAt(r, sa, ahead);
    const g = this.rider.group;
    g.position.set(cur.x, cur.e + 0.03, cur.z);
    if (sa > t.s) g.lookAt(ahead.x, ahead.e + 0.03, ahead.z);
    else g.lookAt(2 * cur.x - ahead.x, 2 * cur.e - ahead.e + 0.03, 2 * cur.z - ahead.z);
    if (t.running) {
      for (const w of this.rider.wheels) w.rotation.x += t.speed * dt / 0.335;
      this.crank += (t.cadence || 0) / 60 * Math.PI * 2 * dt;
      this.rider.pose(this.crank);
    }
    this.shadow.position.set(cur.x, cur.e + 0.05, cur.z); this.shadow.rotation.z = -Math.atan2(this.camDir.x, this.camDir.z);
  }

  private updateCamera(t: Telemetry, dt: number, camMode: number, snap: boolean) {
    const r = this.route, cur = this.cur, ahead = this.ahead, camDir = this.camDir;
    sampleAt(r, t.s, cur);
    const sa = t.s + 4 <= r.total ? t.s + 4 : t.s - 4; sampleAt(r, sa, ahead);
    this.tmpDir.set(ahead.x - cur.x, 0, ahead.z - cur.z); if (sa < t.s) this.tmpDir.negate();
    if (this.tmpDir.lengthSq() < 1e-6) this.tmpDir.copy(camDir); this.tmpDir.normalize();
    camDir.lerp(this.tmpDir, snap ? 1 : 1 - Math.exp(-dt * 2.2)).normalize();
    const m = CAM_MODES[camMode], ry = cur.e;
    if (m.side) {
      this.camPos.set(cur.x - camDir.z * 6 - camDir.x * 1.5, ry + 1.6, cur.z + camDir.x * 6 - camDir.z * 1.5);
      this.camTarget.set(cur.x + camDir.x * 1.5, ry + 0.9, cur.z + camDir.z * 1.5);
    } else {
      this.camPos.set(cur.x - camDir.x * m.back, ry + m.up, cur.z - camDir.z * m.back);
      this.camTarget.set(cur.x + camDir.x * m.look, ry + m.lookUp, cur.z + camDir.z * m.look);
    }
    if (snap) this.camera.position.copy(this.camPos); else this.camera.position.lerp(this.camPos, 1 - Math.exp(-dt * 6));
    this.camera.position.y = Math.max(this.camera.position.y, ry + 1.2);
    this.camera.lookAt(this.camTarget);
  }

  private chunkAt = 0;
  // Ein Bild zeichnen. snap = Kamera sofort an die Zielposition setzen (nach dem Laden)
  frame(t: Telemetry, dt: number, camMode: number, now: number, snap = false) {
    if (this.route) {
      this.updateRider(t, dt);
      this.updateCamera(t, dt, camMode, snap);
      if (now - this.chunkAt > 120) { this.world.update(this.cur.x, this.cur.z, 2); this.chunkAt = now; }
    }
    this.sky.position.copy(this.camera.position);
    this.mountains.position.set(this.camera.position.x, this.camera.position.y - 25, this.camera.position.z);
    this.renderer.render(this.scene, this.camera);
  }
}
