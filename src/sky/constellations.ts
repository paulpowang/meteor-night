/* 星座連線：放在赤道座標，跟星星共用 eqToWorld 矩陣（拉時間時一起轉）。
 * 線條刻意又細又淡（1 px、低透明度），兩端各留一小段空隙不壓住星點，也不搶流星的風采。 */
import * as THREE from 'three';
import { eqVector } from '../astro';
import { SKY_RADIUS, type StarCatalog } from './stars';

/** 線段兩端各退開的角度（弧度）：約 0.45°，短線段最多退 20% */
const GAP = 0.45 * (Math.PI / 180);

export function createConstellations(catalog: StarCatalog) {
  const pos: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3();
  for (const c of catalog.constellations) {
    for (const poly of c.l) {
      for (let i = 0; i + 3 < poly.length; i += 2) {
        eqVector(poly[i], poly[i + 1], a);
        eqVector(poly[i + 2], poly[i + 3], b);
        const ang = a.angleTo(b);
        if (ang < 1e-6) continue;
        const t = Math.min(GAP, ang * 0.2) / ang;
        // 球面上的線性內插再正規化，退開的量夠小，誤差可以忽略
        p.lerpVectors(a, b, t).normalize().multiplyScalar(SKY_RADIUS * 0.97);
        q.lerpVectors(a, b, 1 - t).normalize().multiplyScalar(SKY_RADIUS * 0.97);
        pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SKY_RADIUS);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0.55, 0.7, 1.0) },
      uOpacity: { value: 0.085 },
    },
    vertexShader: /* glsl */ `
      varying float vAlt;
      void main() {
        vAlt = normalize((modelMatrix * vec4(position, 1.0)).xyz).y;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlt;
      void main() {
        // 接近地平線淡出（大氣較厚，星星本來就變暗）
        gl_FragColor = vec4(uColor * uOpacity * smoothstep(0.0, 0.12, vAlt), 1.0);
      }
    `,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });

  const lines = new THREE.LineSegments(geo, material);
  lines.matrixAutoUpdate = false;
  lines.frustumCulled = false;
  lines.renderOrder = 2;
  lines.visible = false;

  // 名稱標籤的方向（赤道座標單位向量）；巨蛇座分成蛇頭、蛇尾兩段，各有一個標籤
  const labels = catalog.constellations.map((c) => ({ id: c.id, rank: c.r, dir: eqVector(c.c[0], c.c[1]) }));
  return { lines, material, labels };
}
