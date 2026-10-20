/* 天空穹頂：底色漸層、氣輝、光害、銀河（依真實銀道面）、月亮、極光、晨光。
 * 全部在一個 shader 裡，用世界方向計算；銀河用 worldToGal 矩陣轉到銀道座標。 */
import * as THREE from 'three';
import { NOISE_GLSL } from './noise.glsl';
import { SKY_RADIUS } from './stars';

export function createSkyDome() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uWorldToGal: { value: new THREE.Matrix3() },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uMilkyWay: { value: 1 },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uMoon: { value: 0 },
      uAurora: { value: 0 },
      uDawnDir: { value: new THREE.Vector3(1, 0, 0) },
      uDawn: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform mat3 uWorldToGal;
      uniform vec3 uZenith, uHorizon, uMoonDir, uDawnDir;
      uniform float uMilkyWay, uMoon, uAurora, uDawn, uTime;
      varying vec3 vDir;
      ${NOISE_GLSL}

      const float PI = 3.14159265;

      // 銀河：沿銀道面的亮帶 + 多層雲氣 + 暗帶（天鵝座大裂縫一路到人馬座）
      vec3 milkyWay(vec3 dir) {
        vec3 g = uWorldToGal * dir;
        float l = atan(g.y, g.x);           // 銀經，-π..π，0 = 銀河中心
        float b = asin(clamp(g.z, -1.0, 1.0));
        float bulge = exp(-l * l / (2.0 * 0.42 * 0.42));
        float cyg = exp(-pow(l - 1.33, 2.0) / (2.0 * 0.22 * 0.22));   // 天鵝座星雲（l≈76°）
        float sct = exp(-pow(l - 0.47, 2.0) / (2.0 * 0.12 * 0.12));   // 盾牌座星雲（l≈27°）
        float width = 0.11 + 0.13 * bulge + 0.03 * cyg;
        float band = exp(-b * b / (2.0 * width * width));
        float halo = exp(-b * b / (2.0 * 0.45 * 0.45)) * 0.18;
        float along = 0.32 + 0.9 * bulge + 0.45 * cyg + 0.35 * sct + 0.1 * cos(l);

        float n1 = fbm(dir * 5.0);
        float n2 = fbm(dir * 17.0 + 3.7);
        float clouds = band * smoothstep(0.25, 0.85, n1 * 0.7 + n2 * 0.5);
        float mw = along * (clouds * 1.1 + band * 0.25 + halo);

        // 暗帶：沿銀道面略微彎曲，人馬座到天鵝座（l = -20°..85°）最濃
        float rift = smoothstep(-0.45, -0.1, l) * (1.0 - smoothstep(1.35, 1.6, l));
        float laneB = b - 0.035 * sin(l * 2.6) - 0.012;
        float lane = exp(-laneB * laneB / (2.0 * 0.03 * 0.03));
        float dustN = fbm(dir * 11.0 + 9.1);
        float dust = lane * (0.35 + 0.65 * rift) * smoothstep(0.3, 0.65, dustN);
        dust += exp(-b * b / (2.0 * 0.06 * 0.06)) * smoothstep(0.55, 0.8, fbm(dir * 26.0)) * 0.5;
        mw *= 1.0 - clamp(dust, 0.0, 0.92);

        vec3 col = mix(vec3(0.72, 0.8, 1.0), vec3(1.0, 0.86, 0.66), clamp(bulge * 1.3, 0.0, 1.0));
        return col * mw;
      }

      vec3 aurora(vec3 dir, float alt) {
        // 只在北方（-z）低空：方位角 ±75°
        float az = atan(dir.x, -dir.z);
        float azMask = smoothstep(1.35, 0.7, abs(az));
        if (azMask <= 0.0 || alt < 0.0) return vec3(0.0);
        float t = uTime;
        float edge = 0.07 + 0.06 * vnoise(vec3(az * 2.2, t * 0.05, 1.0)) + 0.03 * sin(az * 5.0 + t * 0.07);
        float h = alt - edge;
        float rays = 0.45 + 0.55 * pow(vnoise(vec3(az * 38.0, t * 0.25, 5.0)), 2.0);
        rays *= 0.6 + 0.4 * vnoise(vec3(az * 9.0, t * 0.12, 7.0));
        float green = smoothstep(-0.015, 0.01, h) * exp(-max(h, 0.0) / 0.09);
        float red = smoothstep(0.03, 0.12, h) * exp(-max(h - 0.1, 0.0) / 0.16);
        vec3 c = vec3(0.12, 1.0, 0.42) * green * 1.0 + vec3(0.75, 0.12, 0.45) * red * 0.35;
        return c * rays * azMask * 0.09;
      }

      void main() {
        vec3 dir = normalize(vDir);
        float alt = dir.y;
        float a = max(alt, 0.0);

        vec3 col = mix(uHorizon, uZenith, pow(a, 0.45));
        // 氣輝：離地平線約 10° 的淡綠帶
        col += vec3(0.0026, 0.0042, 0.0022) * exp(-pow((alt - 0.16) / 0.13, 2.0)) * (1.0 - uMoon) * (1.0 - uDawn);
        // 光害：西雅圖-塔科馬在西北方（方位約 315°），被山擋住大半，只剩低空暖色
        vec3 hd = normalize(vec3(dir.x, 0.0, dir.z) + 1e-5);
        vec3 lpDir = normalize(vec3(-0.707, 0.0, -0.707));
        col += vec3(0.010, 0.0075, 0.0048) * exp(-a * 9.0) * pow(max(dot(hd, lpDir), 0.0), 3.0) * (1.0 - uDawn);
        // 銀河（低空因消光變淡）
        col += milkyWay(dir) * uMilkyWay * 0.11 * smoothstep(-0.02, 0.3, alt);

        // 晨光：日出方向低空的暖光
        if (uDawn > 0.0) {
          float dd = max(dot(hd, normalize(vec3(uDawnDir.x, 0.0, uDawnDir.z))), 0.0);
          col += vec3(0.30, 0.16, 0.09) * exp(-a * 7.0) * pow(dd, 3.0) * uDawn;
          col += vec3(0.05, 0.035, 0.05) * exp(-a * 3.0) * uDawn;
        }

        // 月亮：月面＋光暈（半月，亮面朝右下）
        if (uMoon > 0.0) {
          float c = dot(dir, uMoonDir);
          float ang = acos(clamp(c, -1.0, 1.0));
          float r = radians(0.32);
          vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
          vec3 up = cross(right, uMoonDir);
          vec2 p = vec2(dot(dir - uMoonDir, right), dot(dir - uMoonDir, up)) / r;
          float disc = smoothstep(1.0, 0.92, length(p));
          float lit = smoothstep(-0.08, 0.08, p.x * 0.85 - p.y * 0.5);
          float mare = 0.82 + 0.18 * fbm(vec3(p * 2.5, 3.0));
          col += vec3(1.0, 0.97, 0.9) * disc * (0.03 + lit * mare * 9.0) * uMoon;
          col += vec3(0.55, 0.62, 0.8) * (0.0016 / (ang * ang + 0.0016)) * 0.05 * uMoon;
          col += vec3(0.4, 0.45, 0.55) * exp(-ang * 2.2) * 0.012 * uMoon;
        }

        col += aurora(dir, alt) * uAurora;
        // 地平線以下：看不到（被地形擋住），只在湖面倒影裡可能露出，給暗色
        if (alt < 0.0) col = uHorizon * 0.6;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 64, 32), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return { mesh, material };
}
