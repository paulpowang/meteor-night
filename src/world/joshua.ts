/* Joshua Tree 國家公園場景：Jumbo Rocks 附近的 Queen Valley（約 33.99°N、116.06°W，海拔約 1,340 m）。
 * 地面 = 海拔 1,340 m，觀測者在原點。
 * - 地形：平緩的沙漠谷地，散布圓頂狀的花崗岩丘；遠方一圈低矮山脈（仰角只有 1°–3°，地平線很開闊）。
 *   北：Pinto Mountains；西北：Queen Mountain；西：Ryan Mountain；西南遠方：Little San Bernardino Mountains；南：Hexie Mountains。
 * - 約書亞樹（Yucca brevifolia）：粗短樹幹往上分叉、轉折，每個枝端一團放射狀的尖葉，下方掛著枯葉裙。
 * - 花崗岩（monzogranite）巨石堆：圓滾滾、層層堆疊。
 * - 低矮灌木（石炭酸灌木等）點綴地面。 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng } from '../astro';
import { fbm2, ridged, snoise } from './heightfield';
import type { Colorize, Quality } from './terrain';

const D = THREE.MathUtils.degToRad;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* === 花崗岩丘：位置固定（可重現），高度場與巨石共用 === */
interface Dome { x: number; z: number; r: number; h: number }
export const DOMES: Dome[] = [];
{
  const rng = makeRng(2207);
  // 主角岩丘：東北偏東約 110 m，跟輻射點、銀河同一個方向入鏡
  DOMES.push({ x: Math.sin(D(62)) * 110, z: -Math.cos(D(62)) * 110, r: 34, h: 16 });
  DOMES.push({ x: Math.sin(D(-35)) * 210, z: -Math.cos(D(-35)) * 210, r: 46, h: 22 });
  for (let i = 0; i < 70; i++) {
    const d = 180 + 2600 * Math.pow(rng(), 1.3);
    const a = rng() * Math.PI * 2;
    DOMES.push({ x: Math.sin(a) * d, z: -Math.cos(a) * d, r: 25 + rng() * 70, h: 8 + rng() * 30 });
  }
}

function domeHeight(x: number, z: number): number {
  let h = 0;
  for (const o of DOMES) {
    const dx = x - o.x, dz = z - o.z;
    const q = (dx * dx + dz * dz) / (o.r * o.r);
    if (q < 4) h = Math.max(h, o.h * Math.exp(-q * q * 0.9));
  }
  return h;
}

/** 遠方山脈：方位角中心、寬度（度）、距離中心與寬度（m）、相對高度（m） */
const RANGES = [
  { az: 10, w: 55, d: 12000, dw: 3500, h: 300 },   // Pinto Mountains
  { az: -40, w: 18, d: 8500, dw: 2000, h: 380 },   // Queen Mountain
  { az: -75, w: 12, d: 9000, dw: 1600, h: 320 },   // Ryan Mountain
  { az: -125, w: 40, d: 24000, dw: 5000, h: 480 }, // Little San Bernardino Mountains
  { az: 175, w: 45, d: 8000, dw: 2500, h: 260 },   // Hexie Mountains
  { az: 95, w: 40, d: 16000, dw: 4000, h: 200 },   // 東方低山
];

export function joshuaHeightAt(x: number, z: number): number {
  const d = Math.hypot(x, z);
  const az = THREE.MathUtils.radToDeg(Math.atan2(x, -z));
  // 谷地：緩坡 + 小起伏（觀測者附近 25 m 內壓平）
  let h = fbm2(x / 900, z / 900, 4) * 7 * smooth(25, 400, d) + fbm2(x / 90, z / 90, 3) * 0.8 * smooth(5, 60, d);
  // 遠方地面整體略高：盆地邊緣往山腳抬升
  h += smooth(2500, 9000, d) * 60 * (0.6 + 0.4 * fbm2(x / 5000, z / 5000, 2));
  for (const r of RANGES) {
    let da = Math.abs(az - r.az);
    if (da > 180) da = 360 - da;
    const ang = 1 - smooth(r.w * 0.5, r.w * 0.5 + 18, da);
    if (ang <= 0) continue;
    const rad = Math.exp(-(((d - r.d) / r.dw) ** 2));
    const jag = 0.45 + 0.75 * ridged(x / 2600 + r.az, z / 2600, 4);
    h += r.h * ang * rad * jag;
  }
  h += domeHeight(x, z);
  return h;
}

// 沙漠地面：淡褐色砂礫；岩丘、陡坡是灰褐花崗岩
const SAND = [0.058, 0.05, 0.038], SAND2 = [0.044, 0.039, 0.031], GRANITE = [0.08, 0.072, 0.062], DARK = [0.035, 0.033, 0.03];
export const joshuaColor: Colorize = (x, h, z, ny) => {
  const dome = smooth(0.8, 4, domeHeight(x, z));
  const steep = smooth(0.85, 0.6, ny);
  const patch = smooth(-0.2, 0.4, fbm2(x / 70, z / 70, 3));
  const far = smooth(4000, 12000, Math.hypot(x, z));
  const c: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    let v = SAND[k] + (SAND2[k] - SAND[k]) * patch;
    v += (GRANITE[k] - v) * Math.max(dome, steep * 0.6);
    // 遠山在夜裡偏暗（植被、陰影）
    v += (DARK[k] - v) * far * 0.6;
    c[k] = v;
  }
  return c;
};

/* === 幾何小工具 === */
const UP = new THREE.Vector3(0, 1, 0);
function colored(g: THREE.BufferGeometry, c: [number, number, number]) {
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set(c, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
/** 從 a 到 b 的圓柱段 */
function segment(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, c: [number, number, number], radial = 6) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return colored(g, c);
}

/* === 約書亞樹 === */
const BARK: [number, number, number] = [0.05, 0.042, 0.034];
const DEAD: [number, number, number] = [0.06, 0.05, 0.036];
const LEAF: [number, number, number] = [0.03, 0.04, 0.024];

function joshuaTree(rng: () => number, full: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rand = (a: number, b: number) => a + rng() * (b - a);
  const tipCluster = (p: THREE.Vector3, d: THREE.Vector3) => {
    // 枯葉裙：枝端下方一段比枝條粗的毛茸茸外殼
    parts.push(segment(p.clone().addScaledVector(d, -0.35), p.clone().addScaledVector(d, 0.05), 0.13, 0.12, DEAD, full ? 6 : 4));
    if (full) {
      // 放射狀尖葉：偏向枝條方向的半球
      const n = 36;
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
        if (v.dot(d) < -0.2) v.addScaledVector(d, 1.2).normalize();
        const len = rand(0.35, 0.6);
        const g = new THREE.ConeGeometry(0.018, len, 3, 1, true);
        const q = new THREE.Quaternion().setFromUnitVectors(UP, v);
        g.applyMatrix4(new THREE.Matrix4().compose(p.clone().addScaledVector(v, len * 0.5), q, new THREE.Vector3(1, 1, 1)));
        parts.push(colored(g, LEAF));
      }
    } else {
      // 遠景：一顆有稜角的球代替葉叢
      const g = new THREE.IcosahedronGeometry(0.4, 0);
      g.translate(p.x, p.y, p.z);
      parts.push(colored(g, LEAF));
    }
  };
  const branch = (p: THREE.Vector3, d: THREE.Vector3, len: number, r: number, depth: number, maxDepth: number) => {
    // 每段分兩節，微微彎向天空（約書亞樹的枝條先往外、再往上翹）
    const mid = p.clone().addScaledVector(d, len * 0.5);
    const d2 = d.clone().lerp(UP, 0.22 + rng() * 0.2).normalize();
    const end = mid.clone().addScaledVector(d2, len * 0.5);
    parts.push(segment(p, mid, r, r * 0.92, BARK), segment(mid, end, r * 0.92, r * 0.84, BARK));
    if (depth >= maxDepth || (depth > 1 && rng() < 0.25)) {
      tipCluster(end, d2);
      return;
    }
    const n = depth === 0 ? 2 + Math.floor(rng() * 2) : rng() < 0.65 ? 2 : 1;
    const phase = rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const az = phase + (i / n) * Math.PI * 2 + rand(-0.4, 0.4);
      const tilt = D(rand(30, 80));
      const out = new THREE.Vector3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt));
      const nd = d2.clone().lerp(out, 0.8).normalize();
      branch(end, nd, len * rand(0.55, 0.8), r * 0.7, depth + 1, maxDepth);
    }
  };
  const trunkH = rand(1.6, 2.8);
  const lean = new THREE.Vector3(rand(-0.15, 0.15), 1, rand(-0.15, 0.15)).normalize();
  // 樹幹基部略粗，還掛著枯葉
  parts.push(segment(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0, 0.5, 0), 0.24, 0.19, DEAD, full ? 7 : 5));
  branch(new THREE.Vector3(0, 0, 0), lean, trunkH, 0.17, 0, 3 + Math.floor(rng() * 2));
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  return g;
}

/* === 花崗岩巨石 === */
function boulderGeometry(rng: () => number, detail: number) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position');
  const ph = [rng() * 10, rng() * 10, rng() * 10];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // 圓潤的大起伏 + 小凹凸；底部壓平一點，坐在地上
    const n = 0.16 * snoise(v.x * 1.3 + ph[0], v.y * 1.3 + v.z * 0.7 + ph[1]) + 0.05 * snoise(v.x * 4 + ph[2], v.z * 4 - v.y * 2);
    v.multiplyScalar(1 + n);
    if (v.y < -0.55) v.y = -0.55 + (v.y + 0.55) * 0.3;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function createJoshuaWorld(q: Quality) {
  const group = new THREE.Group();
  const rng = makeRng(1936);
  const hi = q === 'high';
  const m4 = new THREE.Matrix4(), qn = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const tint = new THREE.Color();

  /* --- 巨石：堆在岩丘上，另有零星散石 --- */
  const bVariants = Array.from({ length: 4 }, () => boulderGeometry(rng, hi ? 3 : 2));
  const bMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.1, 0.092, 0.08), roughness: 0.95 });
  const bPlace: { x: number; y: number; z: number; s: number; sy: number; v: number }[] = [];
  for (const o of DOMES) {
    const near = Math.hypot(o.x, o.z) < 900;
    const count = Math.floor((near ? 18 : 7) * (o.r / 50) + rng() * 5);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, rr = o.r * Math.sqrt(rng()) * 0.95;
      const x = o.x + Math.cos(a) * rr, z = o.z + Math.sin(a) * rr;
      const s = (1.5 + rng() * 5.5) * (o.h / 18);
      bPlace.push({ x, y: joshuaHeightAt(x, z) + s * 0.25, z, s, sy: 0.6 + rng() * 0.35, v: i % 4 });
    }
  }
  for (let i = 0; i < 260; i++) {
    const d = 30 + 1500 * Math.pow(rng(), 1.5), a = rng() * Math.PI * 2;
    const x = Math.sin(a) * d, z = -Math.cos(a) * d;
    const s = 0.4 + rng() * 1.8;
    bPlace.push({ x, y: joshuaHeightAt(x, z) + s * 0.2, z, s, sy: 0.55 + rng() * 0.3, v: i % 4 });
  }
  bVariants.forEach((g, vi) => {
    const list = bPlace.filter((b) => b.v === vi);
    const mesh = new THREE.InstancedMesh(g, bMat, list.length);
    list.forEach((b, i) => {
      qn.setFromEuler(new THREE.Euler(rng() * 0.3, rng() * Math.PI * 2, rng() * 0.3));
      sc.set(b.s * (0.85 + rng() * 0.3), b.s * b.sy, b.s * (0.85 + rng() * 0.3));
      mesh.setMatrixAt(i, m4.compose(ps.set(b.x, b.y, b.z), qn, sc));
      tint.setScalar(0.8 + rng() * 0.4);
      mesh.setColorAt(i, tint);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  });

  /* --- 約書亞樹：近處完整葉叢，遠處簡化 --- */
  const nVar = 6;
  const tRng = makeRng(77);
  const fullG = Array.from({ length: nVar }, (_, i) => joshuaTree(makeRng(500 + i), true));
  const farG = Array.from({ length: nVar }, (_, i) => joshuaTree(makeRng(500 + i), false));
  const tMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const nearList: { m: THREE.Matrix4; v: number }[][] = Array.from({ length: nVar }, () => []);
  const farList: { m: THREE.Matrix4; v: number }[][] = Array.from({ length: nVar }, () => []);
  // 主角樹用分枝最多（頂點最多）的那個變體，剪影才好看
  const hero = fullG.reduce((best, g, i) => (g.getAttribute('position').count > fullG[best].getAttribute('position').count ? i : best), 0);
  const addTree = (x: number, z: number, height: number, variant?: number) => {
    const v = variant ?? Math.floor(tRng() * nVar);
    const s = height / 5;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, joshuaHeightAt(x, z) - 0.1, z),
      new THREE.Quaternion().setFromAxisAngle(UP, tRng() * Math.PI * 2),
      new THREE.Vector3(s, s, s),
    );
    (Math.hypot(x, z) < 350 ? nearList : farList)[v].push({ m, v });
  };
  // 主角樹：北北東約 17 m，剪影壓在銀河與輻射點前
  addTree(Math.sin(D(14)) * 19, -Math.cos(D(14)) * 19, 7, hero);
  addTree(Math.sin(D(-28)) * 42, -Math.cos(D(-28)) * 42, 5.5);
  const target = hi ? 2000 : 800;
  for (let tries = 0, n = 0; tries < target * 20 && n < target; tries++) {
    // d = 25 + 3200·u^0.85：近處稀疏（約書亞樹林本來就很疏，間距數十公尺），遠處多到能連成地平線上的剪影
    const d = 25 + 3200 * Math.pow(tRng(), 0.85);
    const a = tRng() * Math.PI * 2;
    const x = Math.sin(a) * d, z = -Math.cos(a) * d;
    // 不長在岩丘上；用雜訊做出疏密（約書亞樹林常一叢一叢）
    if (domeHeight(x, z) > 1) continue;
    if (tRng() > smooth(-0.35, 0.3, fbm2(x / 400 + 3, z / 400, 3))) continue;
    // 正前方近處不種，免得擋住視線
    if (d < 60 && Math.abs(a) < 0.5) continue;
    addTree(x, z, 3 + tRng() * 5);
    n++;
  }
  const addInstanced = (g: THREE.BufferGeometry, list: { m: THREE.Matrix4 }[]) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(g, tMat, list.length);
    list.forEach((it, i) => mesh.setMatrixAt(i, it.m));
    mesh.computeBoundingSphere();
    group.add(mesh);
  };
  for (let v = 0; v < nVar; v++) {
    addInstanced(fullG[v], nearList[v]);
    addInstanced(farG[v], farList[v]);
  }

  /* --- 低矮灌木 --- */
  const shrubG = new THREE.IcosahedronGeometry(1, 1);
  {
    const p = shrubG.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const k = 1 + 0.25 * snoise(p.getX(i) * 3, p.getZ(i) * 3 + p.getY(i));
      p.setXYZ(i, p.getX(i) * k, Math.max(-0.2, p.getY(i)) * k, p.getZ(i) * k);
    }
    shrubG.computeVertexNormals();
  }
  const sMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.03, 0.034, 0.024), roughness: 1 });
  const sCount = hi ? 5000 : 1800;
  const shrubs = new THREE.InstancedMesh(shrubG, sMat, sCount);
  let sn = 0;
  for (let tries = 0; tries < sCount * 4 && sn < sCount; tries++) {
    const d = 8 + 700 * Math.pow(rng(), 1.5), a = rng() * Math.PI * 2;
    const x = Math.sin(a) * d, z = -Math.cos(a) * d;
    if (domeHeight(x, z) > 2) continue;
    const s = 0.18 + rng() * 0.45;
    qn.setFromAxisAngle(UP, rng() * Math.PI * 2);
    sc.set(s * (1 + rng() * 0.5), s * (0.5 + rng() * 0.3), s * (1 + rng() * 0.5));
    shrubs.setMatrixAt(sn, m4.compose(ps.set(x, joshuaHeightAt(x, z), z), qn, sc));
    tint.setRGB(0.8 + rng() * 0.5, 0.8 + rng() * 0.5, 0.8 + rng() * 0.3);
    shrubs.setColorAt(sn, tint);
    sn++;
  }
  shrubs.count = sn;
  shrubs.computeBoundingSphere();
  group.add(shrubs);
  return group;
}
