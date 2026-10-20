/* 點星星認星：把點擊方向轉回赤道座標，在星表前 catalogCount 顆裡找最可能的那顆。
 * 只找畫面上看得到的星（不暗於當下星空樣式的極限星等、沒有躲在山後），星等 ≤ 4.5 的亮星優先。 */
import * as THREE from 'three';
import { eqVector, worldToHoriz } from '../astro';
import { horizonAlt } from '../world/horizon';
import { CONSTELLATION_ZH, STAR_LORE } from './lore';
import type { StarCatalog } from './stars';

/** 亮星門檻：比這亮的星，每亮 1 等在評分上「近」4 px */
const BRIGHT_MAG = 4.5;
const BRIGHT_BONUS_PX = 4;

export interface StarInfo {
  index: number;
  hip: number;
  title: string;
  sub: string;
  bayer: string;
  constellation: string;
  mag: number;
  text: string;
  /** 赤道座標單位向量，用來每幀把選取圈放到星星上 */
  dir: THREE.Vector3;
}

const COMPASS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];
export const compassName = (az: number) => COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8];

export function createStarPicker(catalog: StarCatalog, catalogCount: number) {
  const stride = catalog.cols.length;
  const dirs = new Float32Array(catalogCount * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < catalogCount; i++) {
    eqVector(catalog.stars[i * stride + 1], catalog.stars[i * stride + 2], v).toArray(dirs, i * 3);
  }
  const mag = (i: number) => catalog.stars[i * stride + 3];

  const worldToEq = new THREE.Matrix3();
  const eqToWorld3 = new THREE.Matrix3();
  const w = new THREE.Vector3();

  /**
   * @param dirWorld 點擊方向（世界座標單位向量）
   * @param radPerPx 畫面上每個像素對應的角度（弧度）
   * @param radiusPx 搜尋半徑（像素）
   * @param limitMag 當下星空樣式的極限星等
   * @returns 星表索引，找不到回傳 -1
   */
  function pick(dirWorld: THREE.Vector3, eqToWorld: THREE.Matrix4, radPerPx: number, radiusPx: number, limitMag: number): number {
    eqToWorld3.setFromMatrix4(eqToWorld);
    worldToEq.copy(eqToWorld3).transpose(); // 純旋轉，轉置即反矩陣
    const d = v.copy(dirWorld).applyMatrix3(worldToEq);
    const cosMax = Math.cos(radiusPx * radPerPx);
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < catalogCount; i++) {
      const c = dirs[i * 3] * d.x + dirs[i * 3 + 1] * d.y + dirs[i * 3 + 2] * d.z;
      if (c < cosMax) continue;
      const m = mag(i);
      if (m > limitMag - 0.3) continue; // 太暗，當下的天空看不到
      const px = Math.acos(Math.min(1, c)) / radPerPx;
      // 亮星優先：星等 ≤ 4.5 依亮度加分；更暗的星只在附近沒有亮星時才會被選到
      const score = m <= BRIGHT_MAG ? px - (BRIGHT_MAG - m) * BRIGHT_BONUS_PX : px + radiusPx;
      if (score >= bestScore) continue;
      // 躲在山後、地平線下的星不算
      w.fromArray(dirs, i * 3).applyMatrix3(eqToWorld3);
      const [az, alt] = worldToHoriz(w);
      if (alt < Math.max(0, horizonAlt(az))) continue;
      best = i;
      bestScore = score;
    }
    return best;
  }

  function describe(i: number): StarInfo {
    const hip = catalog.stars[i * stride];
    const n = catalog.names[hip];
    const lore = STAR_LORE[hip];
    const zh = n?.zh ?? '';
    const con = n?.c ? CONSTELLATION_ZH[n.c] ?? n.c : '';
    const bayer = n?.b ? `${n.b} ${n.c}` : '';
    // 標題：俗名（傳統星官名），俗名本身就以星官名開頭時（天狼 → 天狼星）只寫俗名
    let title: string;
    if (lore) title = !zh || lore.common.startsWith(zh) ? lore.common : `${lore.common}（${zh}）`;
    else title = zh || n?.n || (n?.b && con ? `${con} ${n.b}` : `HIP ${hip}`);
    const sub = [n?.n && n.n !== title ? n.n : '', lore?.tag ?? ''].filter(Boolean).join(' · ');
    return {
      index: i, hip, title, sub, bayer, constellation: con, mag: mag(i), text: lore?.text ?? '',
      dir: new THREE.Vector3().fromArray(dirs, i * 3),
    };
  }

  /** 依星表 hip 編號找索引（測試與 console 除錯用） */
  const indexOfHip = (hip: number) => {
    for (let i = 0; i < catalogCount; i++) if (catalog.stars[i * stride] === hip) return i;
    return -1;
  };

  return { pick, describe, indexOfHip };
}
