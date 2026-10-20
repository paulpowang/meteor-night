/* 英仙座流星雨。
 * - 每顆流星在天球上沿「離開輻射點」的大圓移動；離輻射點越近，看起來越短（透視縮短）。
 * - 亮度依族群指數 r ≈ 2.2：亮 1 等的流星少 2.2 倍，大部分很暗，偶爾出現火流星。
 * - 英仙座流星很快（約 59 km/s），一般 0.2–0.8 秒；火流星較久，帶顏色、末端爆亮與餘跡。
 * - 少數是「長流星」：起點離輻射點遠、幾乎貼著大氣層掠過（earthgrazer），慢慢劃過 50°–110° 的天空。
 * - 流星不會瞬間消失：頭走到終點後先熄頭，尾巴再在 burnout 時間內淡掉；有餘跡的再留一道慢慢散開的煙痕。
 * - 「夢幻」模式：密度由使用者決定、顏色多彩、比較慢、長流星和餘跡更多，也混入少量其他方向的流星。
 * - 全部畫成朝向觀測者的細長四邊形，放在天球半徑附近，所以湖面也會倒映。
 *   （經過觀測者的大圓投影到畫面上是直線，所以長流星用一條弦畫也是對的。） */
import * as THREE from 'three';
import { eqVector, makeRng } from '../astro';
import { SKY_RADIUS } from './stars';

/** 夢幻模式最多每分鐘幾顆，物件池依此估算（同時存活約 每秒顆數 × 平均壽命 2.5 秒） */
const MAX = 200;
const R = SKY_RADIUS * 0.98;
const POP_INDEX = 2.2;
const D = THREE.MathUtils.degToRad;

type Kind = 'normal' | 'fireball' | 'long';

interface Meteor {
  alive: boolean;
  kind: Kind;
  t: number;          // 已經過時間（秒）
  dur: number;        // 頭從起點走到終點的時間
  fade: number;       // 頭停下後，尾巴淡出的時間
  trainDur: number;   // 餘跡時間（0 = 沒有）
  start: THREE.Vector3; // 世界方向：起點
  axis: THREE.Vector3;  // 旋轉軸（大圓法向）
  arc: number;        // 頭走的總弧長（弧度）
  tailLen: number;    // 發光尾巴的弧長（弧度）
  mag: number;
  flare: boolean;     // 末端爆亮（火流星）
  color: THREE.Color;
}

export interface MeteorOptions {
  /** 每小時流星數（天頂時數 ZHR 概念，未含高度修正） */
  ratePerHour: number;
  /** 夢幻模式：不受輻射點高度影響、多彩、比較慢 */
  dreamy?: boolean;
}

// 夢幻模式的顏色：淡青、粉紅、金、淡紫、湖水綠、白
const DREAM_COLORS: [number, number, number][] = [
  [0.6, 0.9, 1.0], [1.0, 0.65, 0.85], [1.0, 0.85, 0.55], [0.8, 0.7, 1.0], [0.55, 1.0, 0.8], [1.0, 1.0, 1.0],
];

export function createMeteors() {
  const rng = makeRng(813);
  const meteors: Meteor[] = Array.from({ length: MAX }, () => ({
    alive: false, kind: 'normal' as Kind, t: 0, dur: 0, fade: 0, trainDur: 0, start: new THREE.Vector3(),
    axis: new THREE.Vector3(), arc: 0, tailLen: 0, mag: 0, flare: false, color: new THREE.Color(),
  }));

  // 每顆流星 = 8 個頂點（流星本體 4 個 + 餘跡 4 個），兩組四邊形
  const pos = new Float32Array(MAX * 8 * 3);
  const uv = new Float32Array(MAX * 8 * 2);
  const col = new Float32Array(MAX * 8 * 4);
  // shape.x：頭部佔四邊形長度的比例（-1 = 餘跡，兩端漸細）；shape.y：頭部亮度
  const shape = new Float32Array(MAX * 8 * 2);
  const idx: number[] = [];
  for (let i = 0; i < MAX * 2; i++) {
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('shape', new THREE.BufferAttribute(shape, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SKY_RADIUS * 1.01);

  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute vec4 color;
      attribute vec2 shape;
      varying vec2 vUv;
      varying vec4 vColor;
      varying vec2 vShape;
      void main() {
        vUv = uv;
        vColor = color;
        vShape = shape;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying vec4 vColor;
      varying vec2 vShape;
      void main() {
        // vUv.x：0 = 尾端、1 = 頭；vUv.y：-1..1 橫向
        float across = exp(-vUv.y * vUv.y * 5.0);
        float core = exp(-vUv.y * vUv.y * 40.0);
        // 內插後的 vUv.x 可能是 -1e-7，pow(負數) 會產生 NaN，再被光暈擴散成整片黑畫面
        float u = clamp(vUv.x, 0.0, 1.0);
        float i;
        if (vShape.x < 0.0) {
          // 餘跡：兩端漸細的柔和煙痕
          i = sqrt(max(sin(3.14159 * u), 0.0)) * (across * 0.7 + core * 0.3);
        } else {
          float along = pow(u, 2.2);
          float head = smoothstep(1.0 - vShape.x, 1.0, u);
          i = along * (across * 0.55 + core) + head * core * 2.5 * vShape.y;
        }
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
  let dreamy = false;
  let pixelAngle = 0.001; // 1 px 對應的弧度，用來決定流星寬度

  const tmp = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const w1 = new THREE.Vector3(), w2 = new THREE.Vector3(), dir = new THREE.Vector3();
  const rad = new THREE.Vector3(), axisTmp = new THREE.Vector3(), startTmp = new THREE.Vector3();
  const LOW = Math.sin(D(8));

  /** 在輻射點周圍 minDeg–maxDeg 取起點（面積加權），沿遠離輻射點的大圓走；
   * 回傳 false 代表起點在地平線附近，要重抽 */
  function pickPath(radiant: THREE.Vector3, minDeg: number, maxDeg: number, arc: number, needMid: boolean) {
    const c0 = Math.cos(D(minDeg)), c1 = Math.cos(D(maxDeg));
    const dist = Math.acos(c0 - rng() * (c0 - c1));
    // 在輻射點的切平面上隨機方向
    const perp = tmp.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(radiant).normalize();
    axisTmp.crossVectors(radiant, perp).normalize();
    startTmp.copy(radiant).applyAxisAngle(axisTmp, dist);
    if (startTmp.y < LOW) return -1;
    // 長流星要整段大部分在天上：中點與 3/4 處也要高於 8°
    if (needMid) {
      if (tmp.copy(startTmp).applyAxisAngle(axisTmp, arc * 0.5).y < LOW) return -1;
      if (tmp.copy(startTmp).applyAxisAngle(axisTmp, arc * 0.75).y < 0) return -1;
    }
    return dist;
  }

  function spawn(force?: 'fireball' | 'long') {
    const m = meteors.find((x) => !x.alive);
    if (!m) return;
    // 長流星：真實密度下約 4%；輻射點低時掠地流星比較多；夢幻模式 10%
    const longP = dreamy ? 0.1 : radiantWorld.y < Math.sin(D(25)) ? 0.08 : 0.04;
    const kindRoll: Kind = force ?? (rng() < longP ? 'long' : 'normal');
    // 夢幻模式有三成流星來自隨機方向（偶發流星），畫面四處都有
    rad.copy(radiantWorld);
    if (dreamy && rng() < 0.3) rad.set(rng() - 0.5, rng() * 0.6, rng() - 0.5).normalize();
    const slow = dreamy ? 1.8 : 1;

    for (let attempt = 0; attempt < 16; attempt++) {
      let dist: number;
      if (kindRoll === 'long') {
        // 50°–110°，起點離輻射點 20°–70°，角速度約每秒 20°–35°（掠地流星很慢）
        const arc = D(50 + rng() * 60);
        dist = pickPath(rad, 20, 70, arc, true);
        if (dist < 0) continue;
        m.arc = arc;
        m.tailLen = D(12 + rng() * 12);
        m.dur = (THREE.MathUtils.radToDeg(arc) / (20 + rng() * 15)) * slow;
        m.mag = -1 - rng() * 2.5;
        m.fade = 0.7;
        m.trainDur = 2.5 + rng() * 2;
        m.flare = false;
      } else {
        dist = pickPath(rad, 8, 95, 0, false);
        if (dist < 0) continue;
        const persp = 0.35 + 0.65 * Math.sin(dist);
        // 亮度：m = 4.5 + ln(u)/ln(r)，u 越小越亮（夢幻模式整體亮約 2 等）
        const base = dreamy ? 2.2 : 4.5;
        m.mag = kindRoll === 'fireball' ? -3 - rng() * 2 : Math.max(-6, base + Math.log(rng() + 1e-6) / Math.log(POP_INDEX));
        const fireball = m.mag < -2;
        if (fireball) {
          // 火流星：路徑長、慢，末端爆亮，長餘跡
          m.arc = D(18 + rng() * 24) * persp;
          m.tailLen = m.arc * (0.4 + rng() * 0.2);
          m.dur = (1.1 + rng() * 1.0) * slow;
          m.fade = 0.55;
          m.trainDur = 2.5 + rng() * 2.5;
          m.flare = true;
        } else {
          m.arc = D(4 + rng() * 24) * persp * (dreamy ? 1.3 : 1);
          m.tailLen = m.arc * (0.35 + rng() * 0.35);
          m.dur = (0.25 + rng() * 0.55) * slow;
          m.fade = 0.12 + rng() * 0.1;
          m.trainDur = m.mag < 0 ? 0.8 : dreamy && m.mag < 1.5 ? 0.8 + rng() * 0.8 : 0;
          m.flare = false;
        }
      }
      m.kind = m.mag < -2 && kindRoll !== 'long' ? 'fireball' : kindRoll;
      m.start.copy(startTmp);
      m.axis.copy(axisTmp);
      // 顏色：一般偏白黃；火流星帶綠（鎂、鎳）或橘；夢幻模式多彩
      if (dreamy) m.color.setRGB(...DREAM_COLORS[Math.floor(rng() * DREAM_COLORS.length)]);
      else if (m.kind === 'fireball') m.color.setRGB(...((rng() < 0.6 ? [0.55, 1.0, 0.7] : [1.0, 0.75, 0.45]) as [number, number, number]));
      else if (m.kind === 'long') m.color.setRGB(1.0, 0.9 + rng() * 0.08, 0.7 + rng() * 0.15);
      else m.color.setRGB(1.0, 0.95 + rng() * 0.05, 0.85 + rng() * 0.15);
      m.t = 0;
      m.alive = true;
      spawned++;
      return;
    }
  }

  function update(dt: number, opts: MeteorOptions, eqToWorld: THREE.Matrix4, camera: THREE.PerspectiveCamera, viewportHeight: number) {
    radiantWorld = radiantEq.clone().transformDirection(eqToWorld);
    pixelAngle = D(camera.fov) / viewportHeight;
    dreamy = !!opts.dreamy;
    // 輻射點在地平線下就幾乎沒有流星（實際上流星率 ∝ sin(輻射點高度)）；夢幻模式不受影響
    const radAlt = Math.max(0, radiantWorld.y);
    spawnAcc += dt * (opts.ratePerHour / 3600) * (dreamy ? 1 : Math.max(0.15, radAlt));
    while (spawnAcc >= 1) {
      spawnAcc -= 1;
      spawn();
    }
    if (rng() < dt * (opts.ratePerHour / 3600) * (dreamy ? 0.01 : 0.015)) spawn('fireball');

    let v = 0;
    for (let i = 0; i < MAX; i++) {
      const m = meteors[i];
      writeQuad(i * 2, null);
      writeQuad(i * 2 + 1, null);
      if (!m.alive) continue;
      m.t += dt;
      if (m.t > m.dur + m.fade + m.trainDur) {
        m.alive = false;
        continue;
      }
      const flux = Math.pow(10, -0.4 * m.mag);
      const gain = 1.6 * Math.pow(flux, 0.55);
      const px = Math.max(1.4, Math.min(6, 1.6 + Math.max(0, 2 - m.mag) * 0.7));
      // 火流星稍微減速；其他等速
      const p = Math.min(1, m.t / m.dur);
      const travel = m.kind === 'fireball' ? p * (1.2 - 0.2 * p) : p;
      const headAng = m.arc * travel;

      // === 本體 ===
      let env: number, headGain: number, tailAng: number;
      if (m.t <= m.dur) {
        // 快速亮起，中段最亮，到終點時仍有約 7 成亮度（交給 burnout 收尾，不會被「截掉」）
        env = THREE.MathUtils.smoothstep(p, 0, 0.12) * (0.5 + 0.5 * Math.sin(Math.PI * (0.15 + 0.7 * p)));
        // 火流星末端爆亮（碎裂）
        if (m.flare) env += 1.3 * Math.exp(-(((p - 0.86) / 0.06) ** 2));
        headGain = m.kind === 'normal' ? 1 : 0.7;
        tailAng = Math.max(0, headAng - m.tailLen);
      } else {
        // burnout：頭先熄，尾巴往終點收縮並淡出
        const q = Math.min(1, (m.t - m.dur) / m.fade);
        env = 0.73 * (1 - q) ** 2;
        headGain = (m.kind === 'normal' ? 1 : 0.7) * (1 - q) ** 3;
        tailAng = Math.max(0, headAng - m.tailLen * (1 - 0.6 * q));
      }
      if (env > 1e-3 && headAng - tailAng > 1e-5) {
        a.copy(m.start).applyAxisAngle(m.axis, tailAng);
        b.copy(m.start).applyAxisAngle(m.axis, headAng);
        // 頭部長度約 5 px，長流星的頭不會被拉成一大坨
        const headFrac = THREE.MathUtils.clamp((px * 5 * pixelAngle) / (headAng - tailAng), 0.03, 0.16);
        writeQuad(i * 2, { from: a, to: b, width: px * pixelAngle, color: m.color, alpha: gain * env, head: headFrac, headGain });
      }

      // === 餘跡：在流星走過的路徑上留下一道慢慢變淡、微微擴散的煙痕 ===
      if (m.trainDur > 0) {
        const tt = (m.t - m.dur * 0.25) / (m.trainDur + m.dur * 0.75 + m.fade);
        const t0 = m.arc * 0.04;
        const t1 = headAng - m.tailLen * 0.25;
        if (tt > 0 && tt < 1 && t1 > t0) {
          const fade = THREE.MathUtils.smoothstep(tt, 0, 0.12) * (1 - tt) ** 1.6 * 0.06 * Math.pow(gain, 0.75) * (dreamy ? 1.2 : 1);
          a.copy(m.start).applyAxisAngle(m.axis, t0);
          b.copy(m.start).applyAxisAngle(m.axis, t1);
          const tc = dreamy ? m.color : TRAIN;
          writeQuad(i * 2 + 1, { from: a, to: b, width: (px * 1.3 + tt * 6) * pixelAngle, color: tc, alpha: fade, head: -1, headGain: 0 });
        }
      }
      v++;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.uv.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.shape.needsUpdate = true;
    return v;
  }

  const TRAIN = new THREE.Color(0.6, 0.75, 0.8);

  function writeQuad(
    q: number,
    s: { from: THREE.Vector3; to: THREE.Vector3; width: number; color: THREE.Color; alpha: number; head: number; headGain: number } | null,
  ) {
    const o = q * 4;
    if (!s) {
      for (let k = 0; k < 4; k++) col[(o + k) * 4 + 3] = 0;
      for (let k = 0; k < 12; k++) pos[o * 3 + k] = 0;
      return;
    }
    // 寬度方向 = 切線 × 視線（觀測者在原點，所以視線就是位置方向）；長流星兩端方向不同，各算各的
    dir.subVectors(s.to, s.from);
    w1.crossVectors(dir, s.from).normalize().multiplyScalar(s.width * R);
    w2.crossVectors(dir, s.to).normalize().multiplyScalar(s.width * R);
    const P = [
      tmp.copy(s.from).multiplyScalar(R).sub(w1).toArray(),
      tmp.copy(s.from).multiplyScalar(R).add(w1).toArray(),
      tmp.copy(s.to).multiplyScalar(R).sub(w2).toArray(),
      tmp.copy(s.to).multiplyScalar(R).add(w2).toArray(),
    ];
    const U = [[0, -1], [0, 1], [1, -1], [1, 1]];
    for (let k = 0; k < 4; k++) {
      pos.set(P[k], (o + k) * 3);
      uv.set(U[k], (o + k) * 2);
      col.set([s.color.r, s.color.g, s.color.b, s.alpha], (o + k) * 4);
      shape[(o + k) * 2] = s.head;
      shape[(o + k) * 2 + 1] = s.headGain;
    }
  }

  return { mesh, update, spawn, get spawned() { return spawned; } };
}
