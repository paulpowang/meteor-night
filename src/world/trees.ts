/* 亞高山冷杉剪影：尖塔形、分層枝葉，用 InstancedMesh 一次畫完。 */
import * as THREE from 'three';
import { makeRng } from '../astro';
import { fbm2, heightAt, lakeMask } from './heightfield';
import type { Quality } from './terrain';

function firGeometry(): THREE.BufferGeometry {
  // 高度正規化為 1，半徑相對高度；sin 起伏做出一層一層的枝葉
  const pts: THREE.Vector2[] = [];
  const N = 14;
  pts.push(new THREE.Vector2(0.025, 0));
  for (let i = 0; i <= N; i++) {
    const y = 0.06 + (i / N) * 0.94;
    const taper = Math.pow(1 - (y - 0.06) / 0.94, 1.15);
    const tier = 1 + 0.18 * Math.max(0, Math.sin(i * 2.1));
    pts.push(new THREE.Vector2(Math.max(0.004, 0.16 * taper * tier), y));
  }
  pts.push(new THREE.Vector2(0, 1));
  return new THREE.LatheGeometry(pts, 7);
}

export function createTrees(q: Quality) {
  const rng = makeRng(1899);
  const target = q === 'high' ? 6000 : 2500;
  const geo = firGeometry();
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.012, 0.018, 0.013), roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, target);
  const m = new THREE.Matrix4(), qn = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const tint = new THREE.Color();
  let n = 0;
  for (let tries = 0; tries < target * 30 && n < target; tries++) {
    const d = 12 + 2400 * Math.pow(rng(), 1.7);
    const a = rng() * Math.PI * 2;
    const x = Math.sin(a) * d, z = -Math.cos(a) * d;
    if (lakeMask(x, z) < 1.12) continue;
    const h = heightAt(x, z);
    if (h > 560) continue;
    // 觀景點周圍 30 m 內、前方 120 m 內不種，免得擋住山
    const az = Math.atan2(x, -z);
    if (d < 30 || (d < 120 && Math.abs(az) < 1.1)) continue;
    // 樹叢感：用雜訊決定疏密，近岸稍密
    const clump = fbm2(x / 260, z / 260, 3) + (lakeMask(x, z) < 2.2 ? 0.25 : 0);
    if (rng() > THREE.MathUtils.smoothstep(clump, -0.25, 0.35)) continue;
    const height = 11 + rng() * 22 * (0.6 + 0.4 * rng());
    const width = height * (0.8 + rng() * 0.45);
    p.set(x, h - 0.5, z);
    qn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    s.set(width, height, width);
    mesh.setMatrixAt(n, m.compose(p, qn, s));
    tint.setRGB(0.85 + rng() * 0.3, 0.85 + rng() * 0.3, 0.85 + rng() * 0.3);
    mesh.setColorAt(n, tint);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}
