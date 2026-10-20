/* 湖面：Reflector 反射整個場景（含星星與流星），再用程式產生的微波扭曲倒影、加上 Fresnel。 */
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { LAKE } from './heightfield';

const LakeShader = {
  name: 'LakeShader',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
    uWind: { value: 0.25 },
    uWater: { value: new THREE.Color(0.002, 0.003, 0.004) },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uWind;
    uniform vec3 uWater;
    varying vec4 vUv;
    varying vec3 vWorld;

    // 幾組不同方向、波長的正弦波，取斜率當法線擾動
    vec2 ripple(vec2 p, float t) {
      vec2 g = vec2(0.0);
      const int N = 6;
      for (int i = 0; i < N; i++) {
        float fi = float(i);
        float ang = fi * 2.399 + 0.6;
        vec2 d = vec2(cos(ang), sin(ang));
        float k = 0.9 * pow(1.55, fi);
        float w = sqrt(9.8 * k);
        float a = 1.0 / pow(1.6, fi);
        g += d * a * cos(dot(d, p) * k - w * t * 0.35);
      }
      return g;
    }

    void main() {
      vec3 V = normalize(cameraPosition - vWorld);
      float cosT = clamp(V.y, 0.0, 1.0);
      // 波紋強度隨距離衰減（遠處的細波看不到，只剩平滑倒影）
      float dist = length(vWorld.xz - cameraPosition.xz);
      vec2 g = ripple(vWorld.xz, uTime) * uWind * 0.012 * (1.0 / (1.0 + dist * 0.004));
      vec4 uv = vUv;
      uv.x += g.x * uv.w;
      uv.y += g.y * uv.w * 2.0;
      // 輕微模糊：四點取樣
      float b = (0.0012 + uWind * 0.002) * uv.w;
      vec3 refl = (texture2DProj(tDiffuse, uv + vec4(b, 0, 0, 0)).rgb
                 + texture2DProj(tDiffuse, uv - vec4(b, 0, 0, 0)).rgb
                 + texture2DProj(tDiffuse, uv + vec4(0, b, 0, 0)).rgb
                 + texture2DProj(tDiffuse, uv - vec4(0, b, 0, 0)).rgb) * 0.25;
      // Fresnel：近處看得到水體、遠處（掠射角）幾乎全反射；整體略暗於天空
      // 平靜高山湖在夜景照片裡幾乎是鏡子，所以 Fresnel 下限給高一點（藝術上的取捨）
      float F = 0.62 + 0.38 * pow(1.0 - cosT, 5.0);
      vec3 col = mix(uWater, refl * 0.9, F);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createLake(pixelRatio: number) {
  const w = Math.min(2048, Math.max(768, Math.floor(window.innerWidth * pixelRatio * 0.6)));
  const h = Math.min(2048, Math.max(432, Math.floor(window.innerHeight * pixelRatio * 0.6)));
  const geo = new THREE.CircleGeometry(1, 96);
  const lake = new Reflector(geo, {
    shader: LakeShader,
    textureWidth: w,
    textureHeight: h,
    clipBias: 0.002,
    multisample: 4,
  });
  lake.rotation.x = -Math.PI / 2;
  // 圓形放大成橢圓，比湖盆大一圈，讓地形自然切出岸線
  lake.scale.set(LAKE.rx * 1.25, LAKE.rz * 1.25, 1);
  lake.position.set(LAKE.cx, 0, LAKE.cz);
  const material = lake.material as THREE.ShaderMaterial;
  return { lake, material };
}
