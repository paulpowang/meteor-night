/* 恆星：真實星表（約 5,000 顆，星等 ≤ 6）＋ 程式補上的暗星（星等 6–8，集中在銀河面附近）。
 * 全部放在赤道座標，整組用 eqToWorld 矩陣轉到地平座標，所以拉時間時星空會繞北極星轉。 */
import * as THREE from 'three';
import { bvToRgb, EQ_TO_GAL, eqVector, makeRng } from '../astro';

export const SKY_RADIUS = 40000;

export interface StarCatalog {
  cols: string[];
  stars: number[];
  names: Record<string, { n: string; zh: string; b: string; c: string }>;
}

/** 合成暗星數量（只為了畫面質感；第二版認星只用星表的前 catalogCount 顆） */
const SYNTH_COUNT = 26000;

export function createStars(catalog: StarCatalog) {
  const stride = catalog.cols.length;
  const catalogCount = catalog.stars.length / stride;
  const total = catalogCount + SYNTH_COUNT;
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const mag = new Float32Array(total);
  const v = new THREE.Vector3();

  for (let i = 0; i < catalogCount; i++) {
    const o = i * stride;
    eqVector(catalog.stars[o + 1], catalog.stars[o + 2], v).multiplyScalar(SKY_RADIUS);
    v.toArray(pos, i * 3);
    col.set(bvToRgb(catalog.stars[o + 4]), i * 3);
    mag[i] = catalog.stars[o + 3];
  }

  // 暗星：一半均勻、一半集中在銀道面（高斯寬 ±10°），星等分布越暗越多（每暗 1 等數量 ×3）
  const rng = makeRng(20260812);
  const galToEq = EQ_TO_GAL.clone().transpose();
  for (let i = catalogCount; i < total; i++) {
    let gx: number, gy: number, gz: number;
    if (rng() < 0.5) {
      const z = rng() * 2 - 1, t = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      gx = r * Math.cos(t); gy = r * Math.sin(t); gz = z;
    } else {
      // Box–Muller 取銀緯
      const b = Math.sqrt(-2 * Math.log(rng() + 1e-9)) * Math.cos(2 * Math.PI * rng()) * 0.17;
      const l = rng() * Math.PI * 2;
      gx = Math.cos(b) * Math.cos(l); gy = Math.cos(b) * Math.sin(l); gz = Math.sin(b);
    }
    v.set(gx, gy, gz).applyMatrix3(galToEq).normalize().multiplyScalar(SKY_RADIUS);
    v.toArray(pos, i * 3);
    mag[i] = 6 + Math.log(1 + rng() * 8) / Math.log(3);
    col.set(bvToRgb(rng() * 1.4 - 0.1), i * 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SKY_RADIUS * 1.01);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLimitMag: { value: 6.5 },
      uPixelRatio: { value: 1 },
      uGain: { value: 3.2 },
      uSizeScale: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float mag;
      attribute vec3 color;
      uniform float uTime, uLimitMag, uPixelRatio, uGain, uSizeScale;
      varying vec3 vColor;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 dir = normalize((modelMatrix * vec4(position, 1.0)).xyz);
        float s = dir.y;
        if (s < -0.02) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        // 大氣質量（Kasten–Young 近似）與分色消光：越接近地平線越暗越紅
        float altDeg = degrees(asin(clamp(s, 0.0, 1.0)));
        float X = 1.0 / (max(s, 0.0) + 0.50572 * pow(altDeg + 6.07995, -1.6364));
        vec3 k = vec3(0.13, 0.21, 0.36);
        float m = mag + 0.21 * X;
        float flux = pow(10.0, -0.4 * m);
        float vis = smoothstep(uLimitMag + 0.4, uLimitMag - 0.6, m);
        // 閃爍：天頂幾乎不閃，地平線附近明顯
        float ph = hash(position) * 6.2831;
        float tw = 1.0 + clamp((X - 1.0) * 0.06, 0.0, 0.35) * sin(uTime * (7.0 + ph * 2.0) + ph * 13.0);
        vColor = color * pow(vec3(10.0), -0.4 * k * X) / pow(10.0, -0.4 * 0.21 * X)
               * uGain * pow(flux, 0.6) * vis * tw;
        float size = 2.4 + 3.4 * clamp((3.0 - mag) / 4.5, 0.0, 1.3);
        gl_PointSize = size * uPixelRatio * uSizeScale;
        gl_Position = projectionMatrix * viewMatrix * vec4(dir * ${SKY_RADIUS.toFixed(1)} * 0.995, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 4.5);
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor * a, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });

  const points = new THREE.Points(geo, material);
  points.matrixAutoUpdate = false;
  points.frustumCulled = false;
  points.renderOrder = 1;
  return { points, material, catalogCount };
}
