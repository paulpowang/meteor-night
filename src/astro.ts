/* 天文計算：恆星時、赤道座標 → 地平座標 → three.js 世界方向。
 * 世界座標慣例：y 朝上（天頂）、-z 朝北、+x 朝東。觀測者在原點。
 * 方位角 A 從北起算、往東為正；高度角 h 從地平線起算。 */
import * as THREE from 'three';

const D2R = Math.PI / 180;

/** 目前的觀測點（換場景時由 setObserver 改寫；各函式的預設參數每次呼叫都會重讀） */
export const OBSERVER = { lat: 46.768, lon: -121.732, elevation: 1480 };
export function setObserver(o: { lat: number; lon: number; elevation: number }) {
  Object.assign(OBSERVER, o);
}

/** 英仙座流星雨極大期的輻射點（J2000，度） */
export const PERSEID_RADIANT = { ra: 48, dec: 58 };

/** 方位角／高度角（度）→ 世界方向單位向量 */
export function horizToWorld(azDeg: number, altDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const A = azDeg * D2R, h = altDeg * D2R;
  return out.set(Math.sin(A) * Math.cos(h), Math.sin(h), -Math.cos(A) * Math.cos(h));
}

/** 世界方向 → [方位角, 高度角]（度） */
export function worldToHoriz(v: THREE.Vector3): [number, number] {
  const az = (Math.atan2(v.x, -v.z) / D2R + 360) % 360;
  return [az, Math.asin(THREE.MathUtils.clamp(v.y, -1, 1)) / D2R];
}

/** 地方恆星時（度），date 為真實時刻 */
export function localSiderealDeg(date: Date, lonDeg = OBSERVER.lon): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0);
  return (((gmst + lonDeg) % 360) + 360) % 360;
}

/** 赤經赤緯 → 地平座標（度） */
export function eqToHoriz(raDeg: number, decDeg: number, lstDeg: number, latDeg = OBSERVER.lat): [number, number] {
  const H = (lstDeg - raDeg) * D2R, d = decDeg * D2R, p = latDeg * D2R;
  const sinh = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(H);
  const az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.cos(H) * Math.sin(p));
  return [((az / D2R) + 360) % 360, Math.asin(sinh) / D2R];
}

/** 赤道直角座標（x→春分點、z→北天極）的單位向量 */
export function eqVector(raDeg: number, decDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const a = raDeg * D2R, d = decDeg * D2R;
  return out.set(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d));
}

/** 赤道直角座標 → 世界方向的線性矩陣。
 * 轉換是純旋轉，所以拿三個基底方向各跑一次 eqToHoriz 就能組出矩陣，不必手推公式。 */
export function eqToWorldMatrix(lstDeg: number, latDeg = OBSERVER.lat, out = new THREE.Matrix4()): THREE.Matrix4 {
  const cols = [
    [0, 0],
    [90, 0],
    [0, 90],
  ].map(([ra, dec]) => {
    const [az, alt] = eqToHoriz(ra, dec, lstDeg, latDeg);
    return horizToWorld(az, alt);
  });
  return out.makeBasis(cols[0], cols[1], cols[2]);
}

/** J2000 赤道 → 銀道座標的旋轉矩陣（列向量為銀道 x、y、z） */
export const EQ_TO_GAL = new THREE.Matrix3().set(
  -0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.44482963, 0.7469822445,
  -0.867666149, -0.1980763734, 0.4559837762,
);

/** B-V 色指數 → 線性 RGB（已正規化、略為去飽和，肉眼看星星的顏色比黑體淡） */
export function bvToRgb(bv: number): [number, number, number] {
  const b = THREE.MathUtils.clamp(bv, -0.4, 2.0);
  const T = 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62));
  // Tanner Helland 的黑體近似（sRGB 0–255）
  const t = T / 100;
  let r: number, g: number, bl: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    bl = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    bl = 255;
  }
  const c = new THREE.Color().setRGB(
    THREE.MathUtils.clamp(r, 0, 255) / 255,
    THREE.MathUtils.clamp(g, 0, 255) / 255,
    THREE.MathUtils.clamp(bl, 0, 255) / 255,
    THREE.SRGBColorSpace,
  );
  // 去飽和 35%，再把亮度正規化到最大分量 = 1
  const l = (c.r + c.g + c.b) / 3;
  c.r = THREE.MathUtils.lerp(c.r, l, 0.35);
  c.g = THREE.MathUtils.lerp(c.g, l, 0.35);
  c.b = THREE.MathUtils.lerp(c.b, l, 0.35);
  const m = Math.max(c.r, c.g, c.b);
  return [c.r / m, c.g / m, c.b / m];
}

/** 可重現的亂數（mulberry32），畫面每次載入都一樣 */
export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
