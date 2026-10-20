/* 英仙座流星雨。
 * - 每顆流星在天球上沿「離開輻射點」的大圓移動；離輻射點越近，看起來越短（透視縮短）。
 * - 亮度依族群指數 r ≈ 2.2：亮 1 等的流星少 2.2 倍，大部分很暗，偶爾出現火流星。
 * - 英仙座流星很快（約 59 km/s），一般 0.2–0.8 秒；火流星較久，帶顏色與短暫餘跡。
 * - 全部畫成朝向觀測者的細長四邊形，放在天球半徑附近，所以湖面也會倒映。 */
import * as THREE from 'three';
import { eqVector, makeRng } from '../astro';
import { SKY_RADIUS } from './stars';

const MAX = 48;
const R = SKY_RADIUS * 0.98;
const POP_INDEX = 2.2;

interface Meteor {
  alive: boolean;
  t: number;          // 已經過時間（秒）
  dur: number;        // 發光時間
  trainDur: number;   // 餘跡時間（0 = 沒有）
  start: THREE.Vector3; // 世界方向：起點
  axis: THREE.Vector3;  // 旋轉軸（大圓法向）
  arc: number;        // 總弧長（弧度）
  tail: number;       // 尾巴長度佔弧長比例
  mag: number;
  color: THREE.Color;
}

export interface MeteorOptions {
  /** 每小時流星數（天頂時數 ZHR 概念，未含高度修正） */
  ratePerHour: number;
}

export function createMeteors() {
  const rng = makeRng(813);
  const meteors: Meteor[] = Array.from({ length: MAX }, () => ({
    alive: false, t: 0, dur: 0, trainDur: 0, start: new THREE.Vector3(), axis: new THREE.Vector3(),
    arc: 0, tail: 0, mag: 0, color: new THREE.Color(),
  }));

  // 每顆流星 = 8 個頂點（流星本體 4 個 + 餘跡 4 個），兩組四邊形
  const pos = new Float32Array(MAX * 8 * 3);
  const uv = new Float32Array(MAX * 8 * 2);
  const col = new Float32Array(MAX * 8 * 4);
  const idx: number[] = [];
  for (let i = 0; i < MAX * 2; i++) {
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SKY_RADIUS * 1.01);

  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute vec4 color;
      varying vec2 vUv;
      varying vec4 vColor;
      void main() {
        vUv = uv;
        vColor = color;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec4 vColor;
      void main() {
        // vUv.x：0 = 尾端、1 = 頭；vUv.y：-1..1 橫向
        float across = exp(-vUv.y * vUv.y * 5.0);
        float core = exp(-vUv.y * vUv.y * 40.0);
        // 內插後的 vUv.x 可能是 -1e-7，pow(負數) 會產生 NaN，再被光暈擴散成整片黑畫面
        float u = clamp(vUv.x, 0.0, 1.0);
        float along = pow(u, 2.2);
        float head = smoothstep(0.86, 1.0, u);
        float i = along * (across * 0.55 + core) + head * core * 2.5;
        gl_FragColor = vec4(vColor.rgb * i * vColor.a, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    // 四邊形方向隨流星而變，湖面倒影裡又會左右翻轉，所以兩面都畫
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;

  let radiantWorld = new THREE.Vector3(0, 1, 0);
  const radiantEq = eqVector(48, 58);
  let spawnAcc = 0;
  let spawned = 0;
  let pixelAngle = 0.001; // 1 px 對應的弧度，用來決定流星寬度

  const tmp = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), w = new THREE.Vector3();

  function spawn(forceBright = false) {
    const m = meteors.find((x) => !x.alive);
    if (!m) return;
    // 在輻射點周圍 8°–95° 取起點（面積加權），沿遠離輻射點的方向走
    for (let attempt = 0; attempt < 12; attempt++) {
      const dist = Math.acos(1 - rng() * (1 - Math.cos(THREE.MathUtils.degToRad(95))));
      if (dist < THREE.MathUtils.degToRad(8)) continue;
      // 在輻射點的切平面上隨機方向
      const perp = tmp.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(radiantWorld).normalize();
      const axis = new THREE.Vector3().crossVectors(radiantWorld, perp).normalize();
      const start = radiantWorld.clone().applyAxisAngle(axis, dist);
      if (start.y < Math.sin(THREE.MathUtils.degToRad(8))) continue;
      m.start.copy(start);
      m.axis.copy(axis);
      // 長度：大約 4°–28°，乘上 sin(距離) 模擬透視縮短
      m.arc = THREE.MathUtils.degToRad(4 + rng() * 24) * (0.35 + 0.65 * Math.sin(dist));
      // 亮度：m = 4.5 + ln(u)/ln(r)，u 越小越亮
      m.mag = forceBright ? -3 - rng() * 2 : Math.max(-6, 4.5 + Math.log(rng() + 1e-6) / Math.log(POP_INDEX));
      const fireball = m.mag < -2;
      m.dur = (0.25 + rng() * 0.55) * (fireball ? 1.8 : 1);
      m.trainDur = fireball ? 1.5 + rng() * 2.5 : m.mag < 0 ? 0.6 : 0;
      m.tail = 0.35 + rng() * 0.35;
      // 顏色：一般偏白黃，火流星帶綠（鎂、鎳）或橘
      if (fireball) m.color.setRGB(...((rng() < 0.6 ? [0.55, 1.0, 0.7] : [1.0, 0.75, 0.45]) as [number, number, number]));
      else m.color.setRGB(1.0, 0.95 + rng() * 0.05, 0.85 + rng() * 0.15);
      m.t = 0;
      m.alive = true;
      spawned++;
      return;
    }
  }

  function update(dt: number, opts: MeteorOptions, eqToWorld: THREE.Matrix4, camera: THREE.PerspectiveCamera, viewportHeight: number) {
    radiantWorld = radiantEq.clone().transformDirection(eqToWorld);
    pixelAngle = THREE.MathUtils.degToRad(camera.fov) / viewportHeight;
    // 輻射點在地平線下就幾乎沒有流星（實際上流星率 ∝ sin(輻射點高度)）
    const radAlt = Math.max(0, radiantWorld.y);
    spawnAcc += dt * (opts.ratePerHour / 3600) * Math.max(0.15, radAlt);
    while (spawnAcc >= 1) {
      spawnAcc -= 1;
      spawn();
    }
    if (rng() < dt * (opts.ratePerHour / 3600) * 0.015) spawn(true);

    let v = 0;
    for (let i = 0; i < MAX; i++) {
      const m = meteors[i];
      writeQuad(i * 2, null);
      writeQuad(i * 2 + 1, null);
      if (!m.alive) continue;
      m.t += dt;
      const life = m.t / m.dur;
      if (life > 1 + m.trainDur / m.dur) {
        m.alive = false;
        continue;
      }
      // 亮度包絡：快速亮起、中後段最亮（進入大氣越深越亮）、末端熄滅
      const flux = Math.pow(10, -0.4 * m.mag);
      const gain = 1.6 * Math.pow(flux, 0.55);
      const px = Math.max(1.4, Math.min(6, 1.6 + Math.max(0, 2 - m.mag) * 0.7));
      if (life <= 1 && m.arc * life > 1e-4) {
        const env = Math.sin(Math.min(1, life) * Math.PI * 0.92 + 0.12) * Math.min(1, life * 6);
        const headAng = m.arc * life;
        const tailAng = Math.max(0, headAng - m.arc * m.tail);
        a.copy(m.start).applyAxisAngle(m.axis, tailAng);
        b.copy(m.start).applyAxisAngle(m.axis, headAng);
        writeQuad(i * 2, { from: a, to: b, width: px * pixelAngle, color: m.color, alpha: gain * env });
      }
      // 餘跡：在流星走過的路徑上留下一道慢慢變淡、微微擴散的煙痕
      if (m.trainDur > 0 && life > 0.35) {
        const tt = Math.max(0, (m.t - m.dur * 0.3) / (m.trainDur + m.dur * 0.7));
        const fade = Math.pow(1 - Math.min(1, tt), 2) * 0.08 * gain;
        a.copy(m.start).applyAxisAngle(m.axis, m.arc * 0.15);
        b.copy(m.start).applyAxisAngle(m.axis, m.arc * Math.min(1, life) * 0.95);
        writeQuad(i * 2 + 1, { from: a, to: b, width: (px * 1.8 + tt * 6) * pixelAngle, color: TRAIN, alpha: fade, flat: true });
      }
      v++;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.uv.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    return v;
  }

  const TRAIN = new THREE.Color(0.6, 0.75, 0.8);

  function writeQuad(q: number, s: { from: THREE.Vector3; to: THREE.Vector3; width: number; color: THREE.Color; alpha: number; flat?: boolean } | null) {
    const o = q * 4;
    if (!s) {
      for (let k = 0; k < 4; k++) col[(o + k) * 4 + 3] = 0;
      for (let k = 0; k < 12; k++) pos[o * 3 + k] = 0;
      return;
    }
    // 寬度方向 = 切線 × 視線（觀測者在原點，所以視線就是位置方向）
    w.subVectors(s.to, s.from).cross(s.to).normalize().multiplyScalar(s.width * R);
    const P = [
      tmp.copy(s.from).multiplyScalar(R).sub(w).toArray(),
      tmp.copy(s.from).multiplyScalar(R).add(w).toArray(),
      tmp.copy(s.to).multiplyScalar(R).sub(w).toArray(),
      tmp.copy(s.to).multiplyScalar(R).add(w).toArray(),
    ];
    const U = s.flat ? [[0.7, -1], [0.7, 1], [0.7, -1], [0.7, 1]] : [[0, -1], [0, 1], [1, -1], [1, 1]];
    for (let k = 0; k < 4; k++) {
      pos.set(P[k], (o + k) * 3);
      uv.set(U[k], (o + k) * 2);
      col.set([s.color.r, s.color.g, s.color.b, s.alpha], (o + k) * 4);
    }
  }

  return { mesh, update, spawn, get spawned() { return spawned; } };
}
