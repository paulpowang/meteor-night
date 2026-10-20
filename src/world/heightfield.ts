/* 地形高度函式（公尺，相對於湖面 = 海拔 1,480 m）。
 * 觀測者在原點、站在 Reflection Lakes 南岸，面朝北（-z）。
 * Rainier 山頂實際在觀測點北 9.45 km、西 2.1 km，相對高度 2,912 m → 仰角約 16.7°、方位約 -12.5°。 */
import { makeRng } from '../astro';

/* === 2D simplex noise（Stefan Gustavson 版本的精簡改寫） === */
const perm = new Uint8Array(512);
{
  const rng = makeRng(4392);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;

export function snoise(x: number, y: number): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s), j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t), y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  let n = 0;
  const c = (gx: number, gy: number, g: number) => {
    let tt = 0.5 - gx * gx - gy * gy;
    if (tt < 0) return 0;
    tt *= tt;
    const gr = GRAD[g & 7];
    return tt * tt * (gr[0] * gx + gr[1] * gy);
  };
  n += c(x0, y0, perm[ii + perm[jj]]);
  n += c(x1, y1, perm[ii + i1 + perm[jj + j1]]);
  n += c(x2, y2, perm[ii + 1 + perm[jj + 1]]);
  return 70 * n; // 約 -1..1
}

export function fbm2(x: number, y: number, oct = 5): number {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * snoise(x * f, y * f);
    f *= 2.02;
    a *= 0.5;
  }
  return s;
}

/** 脊狀雜訊：0..1，峰處尖銳（用來做稜線、冰河之間的岩脊） */
export function ridged(x: number, y: number, oct = 4): number {
  let s = 0, a = 0.5, f = 1, w = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(snoise(x * f, y * f));
    n *= n * w;
    w = Math.min(1, n * 2);
    s += a * n;
    f *= 2.1;
    a *= 0.5;
  }
  return s;
}

function smoothstepJS(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/* === 地標 === */
export const SUMMIT = { x: -2100, z: -9450, h: 2912 };
// 湖的南岸離觀測者只有約 2.5 m：山頂倒影在俯角 17°，水面要延伸到腳邊才看得到完整倒影
export const LAKE = { cx: 0, cz: -150, rx: 270, rz: 147.5 };

const bump = (x: number, z: number, cx: number, cz: number, r: number, h: number, p = 2) =>
  h * Math.exp(-Math.pow(Math.hypot(x - cx, z - cz) / r, p));

/** Rainier 主體：寬圓頂 + 放射狀稜線（cleaver）與冰河溝 */
function rainier(x: number, z: number): number {
  const dx = x - SUMMIT.x, dz = z - SUMMIT.z;
  const r = Math.hypot(dx, dz);
  const th = Math.atan2(dz, dx);
  // 圓頂輪廓：頂部寬、山腰略內凹
  // 剖面依實際地形擬合：山頂 2,912 m、離山頂 3 km 約 1,700 m、5 km（Paradise）約 400 m、9.5 km（湖邊）歸 0。
  // 上半部是陡的火山錐（指數 1.8，山頂兩側坡度要大於視線仰角 16.7°，山頂才會是剪影最高點），下半部加一層寬緩的山麓；減掉 r = 10.6 km 的值讓山腳收在湖邊。
  const prof = (rr: number) => 0.84 * Math.exp(-Math.pow(rr / 3300, 1.8)) + 0.16 * Math.exp(-Math.pow(rr / 6200, 1.6));
  const p0 = prof(0), pf = prof(10600);
  const base = Math.max(0, (SUMMIT.h * (prof(r) - pf)) / (p0 - pf));
  // 放射狀稜線：角度方向的脊狀雜訊，越往山腰越明顯，山頂附近平滑
  const ridgeBand = Math.min(1, Math.max(0, (r - 900) / 1600)) * Math.exp(-Math.pow(r / 6500, 2));
  const rid = ridged(Math.cos(th) * 2.6 + r / 5200, Math.sin(th) * 2.6 + r / 7300, 4);
  const ridges = (rid - 0.45) * 560 * ridgeBand;
  // 細節：小尺度起伏
  const detail = fbm2(x / 900, z / 900, 4) * 110 * Math.min(1, r / 1500);
  const foot = Math.min(1, Math.max(0, (10600 - r) / 3200));
  let h = base + (ridges + detail) * foot;
  // 衛峰：Little Tahoma（東南東，尖）、Point Success（西南）、Liberty Cap（西北）
  h += bump(x, z, SUMMIT.x + 3250, SUMMIT.z + 950, 650, 820, 1.25);
  h += bump(x, z, SUMMIT.x - 750, SUMMIT.z + 650, 520, 120, 2);
  h += bump(x, z, SUMMIT.x - 1150, SUMMIT.z - 1150, 650, 160, 2);
  // 火山口頂：山頂中央略平
  h -= bump(x, z, SUMMIT.x, SUMMIT.z, 380, 45, 2);
  return h;
}

/** 前景丘陵、南側 Tatoosh 山脈、湖盆 */
function surroundings(x: number, z: number): number {
  const d = Math.hypot(x, z);
  // 一般起伏（森林丘陵），離湖越遠越高。
  // 正前方（方位 -50°..+35°、湖到山腳之間）壓低，實景中湖對岸是低緩的 Paradise 谷地，山從很低的仰角就露出來
  const az = Math.atan2(x, -z);
  const front = smoothstepJS(-0.95, -0.6, az) * (1 - smoothstepJS(0.45, 0.75, az)) * (1 - smoothstepJS(5000, 8000, d));
  const hills = (fbm2(x / 2200, z / 2200, 5) * 0.5 + 0.5) * 320 * Math.min(1, d / 1800)
    + Math.max(0, fbm2(x / 700 + 40, z / 700, 3)) * 60 * Math.min(1, d / 600);
  let h = hills * (1 - 0.85 * front);
  // Tatoosh 山脈：觀測點正南方 1.6–2.8 km 的鋸齒稜線
  const tz = 2100 + fbm2(x / 3000, 7, 2) * 400;
  const tat = Math.exp(-Math.pow((z - tz) / 850, 2)) * Math.exp(-Math.pow(x / 6500, 2));
  h += tat * (380 + 520 * ridged(x / 900, z / 1400 + 3, 4));
  return h;
}

/** 湖盆遮罩：湖內 < 1，湖岸 = 1；岸線加雜訊 */
export function lakeMask(x: number, z: number): number {
  const ex = (x - LAKE.cx) / LAKE.rx, ez = (z - LAKE.cz) / LAKE.rz;
  const ang = Math.atan2(ez, ex);
  const wobble = 1 + 0.12 * snoise(Math.cos(ang) * 1.7 + 11, Math.sin(ang) * 1.7) + 0.05 * snoise(ang * 4, 3);
  return Math.hypot(ex, ez) / wobble;
}

export function heightAt(x: number, z: number): number {
  let h = rainier(x, z) + surroundings(x, z);
  // 湖盆：湖內壓到水面下，湖岸往外 0–120 m 平緩過渡
  const e = lakeMask(x, z);
  const shore = Math.min(1, Math.max(0, (e - 1) / 0.9));
  const sm = shore * shore * (3 - 2 * shore);
  // 岸邊只比水面高一點點（站著的眼睛高度 1.7 m 要看得到整片湖）
  const near = 0.25 + Math.max(0, snoise(x / 40, z / 40)) * 0.35;
  // 岸線連續：e = 1 處高度剛好 0（水面），往外 3% 內升到岸邊高度，避免網格在岸線切出鋸齒
  const bank = near * Math.min(1, (e - 1) / 0.03);
  h = e < 1 ? -3.5 * Math.pow(1 - e, 0.6) : bank + (h - bank) * sm;
  return h;
}
