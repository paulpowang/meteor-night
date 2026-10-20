/* 地形網格：以觀測者為圓心的極座標網格。
 * 半徑方向近處密、Rainier 所在的 2.5–16 km 等距（山面的垂直解析度），遠處再放疏。 */
import * as THREE from 'three';
import { fbm2, heightAt } from './heightfield';
import { NOISE_GLSL } from '../sky/noise.glsl';

export type Quality = 'high' | 'low';

function radii(q: Quality): number[] {
  const out: number[] = [];
  const nearSteps = q === 'high' ? 110 : 70;
  for (let i = 0; i <= nearSteps; i++) out.push(2 * Math.pow(2500 / 2, i / nearSteps));
  const step = q === 'high' ? 55 : 110;
  for (let r = 2500 + step; r < 16000; r += step) out.push(r);
  for (let i = 0; i <= 30; i++) out.push(16000 * Math.pow(34000 / 16000, i / 30));
  return out;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function createTerrain(q: Quality) {
  const R = radii(q);
  const segs = q === 'high' ? 1024 : 512;
  const nr = R.length, na = segs + 1;
  const pos = new Float32Array(nr * na * 3);
  for (let i = 0; i < nr; i++) {
    for (let j = 0; j < na; j++) {
      const a = (j / segs) * Math.PI * 2;
      const x = Math.sin(a) * R[i], z = -Math.cos(a) * R[i];
      const k = (i * na + j) * 3;
      pos[k] = x;
      pos[k + 1] = heightAt(x, z);
      pos[k + 2] = z;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < nr - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * na + j, b = a + 1, c = a + na, d = c + 1;
      // 角度往東（從上方看是順時針），所以 a→b→c 才是逆時針、法線朝上
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // 依高度與坡度上色：森林 → 草地／岩石 → 雪與冰河（陡坡露岩）
  const nrm = geo.getAttribute('normal');
  const col = new Float32Array(nr * na * 3);
  const forest = [0.011, 0.017, 0.012], meadow = [0.034, 0.032, 0.026], rock = [0.05, 0.047, 0.045], snow = [0.8, 0.83, 0.9];
  for (let v = 0; v < nr * na; v++) {
    const x = pos[v * 3], h = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const ny = nrm.getY(v);
    const treeline = 520 + 140 * fbm2(x / 1300, z / 1300, 3);
    const snowline = 980 + 260 * fbm2(x / 1600 + 9, z / 1600, 4);
    const fForest = (1 - smooth(treeline - 60, treeline + 60, h)) * smooth(0.55, 0.7, ny);
    const fSnow = smooth(snowline - 90, snowline + 140, h) * smooth(0.42, 0.62, ny + 0.06 * fbm2(x / 200, z / 200, 2));
    const fRock = smooth(0.6, 0.4, ny);
    const c = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      let base = meadow[k] + (rock[k] - meadow[k]) * fRock;
      base = base + (forest[k] - base) * fForest;
      c[k] = base + (snow[k] - base) * fSnow;
    }
    col.set(c, v * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  // 像素級細節：頂點間距 55 m，雪面會太光滑。用世界座標雜訊做出沿坡向下的冰河紋理與露岩
  material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
varying vec3 vWNrm;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
varying vec3 vWNrm;
${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  float snowAmt = smoothstep(0.25, 0.6, diffuseColor.r);
  // 沿坡向下拉長的雜訊：水平方向頻率高、垂直方向低，像冰河的流紋與冰隙
  vec3 p = vec3(vWPos.x / 45.0, vWPos.y / 420.0, vWPos.z / 45.0);
  float n1 = fbm(p);
  float n2 = fbm(vWPos / 18.0);
  float steep = 1.0 - smoothstep(0.55, 0.85, vWNrm.y);
  float rockOut = smoothstep(0.66, 0.8, n1 + steep * 0.3) * snowAmt;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.043, 0.042), rockOut);
  diffuseColor.rgb *= 0.9 + 0.16 * n2;
}`);
  };
  const mesh = new THREE.Mesh(geo, material);
  return mesh;
}
