/* Paradise 場景：站在 Rainier 南坡的 Paradise 高山草甸（約 46.786°N、121.735°W，海拔約 1,645 m），沒有湖。
 * 沿用 Reflection Lakes 的 Rainier 高度場，只是把觀測點平移到湖的北方約 2.0 km、西方 0.2 km：
 * 場景座標 (x, z) = 原座標 (x + OX, z + OZ)，高度扣掉觀測點的地面高度，讓觀測點地面 = 0。
 * 山頂在北偏西約 14°、7.7 km 外，仰角約 20°；前景是緩坡草甸和一叢一叢的亞高山冷杉。 */
import { fbm2, rawHeightAt, SUMMIT } from './heightfield';
import { rainierColor, type Colorize } from './terrain';
import { type TreeOptions } from './trees';

const OX = -230, OZ = -2000;
/** 觀測點在原座標的地面高度（相對 Reflection Lakes 湖面） */
const H0 = rawHeightAt(OX, OZ);

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function paradiseHeightAt(x: number, z: number): number {
  const d = Math.hypot(x, z);
  // 腳邊 40 m 內壓平（步道旁的草地），其他照原地形
  const h = rawHeightAt(x + OX, z + OZ) - H0;
  return h * smooth(10, 40, d) + fbm2(x / 25, z / 25, 2) * 0.4;
}

// 近處是草甸，不是森林：3 km 內把「森林色」換成草甸色（樹另外用冷杉模型種）
const MEADOW = [0.05, 0.055, 0.036];
export const paradiseColor: Colorize = (x, h, z, ny) => {
  const c = rainierColor(x + OX, h + H0, z + OZ, ny);
  const near = 1 - smooth(1500, 3500, Math.hypot(x, z));
  // 雪（亮）不動，只把暗的森林、草地往草甸色拉
  const dark = 1 - smooth(0.1, 0.3, c[0]);
  const k = near * dark;
  return [c[0] + (MEADOW[0] - c[0]) * k, c[1] + (MEADOW[1] - c[1]) * k, c[2] + (MEADOW[2] - c[2]) * k];
};

/** 觀測點的方位、與山頂的關係（給預設視角、文件用） */
export const PARADISE_SUMMIT = { x: SUMMIT.x - OX, z: SUMMIT.z - OZ, h: SUMMIT.h - H0 };

export const PARADISE_TREES: TreeOptions = {
  height: paradiseHeightAt,
  // 林線（原座標約 560 m）以下；觀景點附近 90 m、朝山方向 400 m 內不種
  allow: (_x, _z, h, d, az) => h + H0 <= 560 && !(d < 90 || (d < 400 && Math.abs(az + 0.25) < 0.8)),
  // Paradise 的冷杉是草甸裡的一叢一叢，整體比湖邊疏
  density: (x, z) => fbm2(x / 180 + 5, z / 180, 3) - 0.18,
  count: 3500,
  seed: 2024,
  // 林線附近的亞高山冷杉比湖邊矮
  scale: 0.55,
};
