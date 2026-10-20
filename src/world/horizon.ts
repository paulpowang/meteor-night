/* 地景剪影的仰角表：每個方位角上，地形擋住天空的最高仰角。
 * 認星和星座名稱標籤用它判斷星星是不是躲在山後（HTML 疊層不會被深度測試遮住）。
 * 第一次用到才計算（約 6 萬次 heightAt，數十毫秒），樹木不算在內。 */
import { heightAt } from './heightfield';

type HeightFn = (x: number, z: number) => number;
let source: HeightFn = heightAt;
const cache = new Map<HeightFn, Float32Array>();

/** 換場景時改用另一個地形高度函式（各場景的表分開快取） */
export function setHorizonHeight(fn: HeightFn) {
  source = fn;
  table = cache.get(fn) ?? null;
}

const STEP = 1; // 度
let table: Float32Array | null = null;

function build() {
  const t = new Float32Array(360 / STEP);
  for (let i = 0; i < t.length; i++) {
    const A = (i * STEP * Math.PI) / 180;
    const sx = Math.sin(A), sz = -Math.cos(A);
    let best = -90;
    // 距離用等比間距：近處細、遠處粗；40 km 外的地形已經在天球外
    for (let d = 5; d < 40000; d *= 1.06) {
      const e = Math.atan2(source(sx * d, sz * d) - 1.7, d);
      if (e > best) best = e;
    }
    t[i] = (best * 180) / Math.PI;
  }
  return t;
}

/** 方位角 az（度）的地景剪影仰角（度），在相鄰兩格之間線性內插 */
export function horizonAlt(az: number): number {
  if (!table) {
    table = build();
    cache.set(source, table);
  }
  const n = table.length;
  const f = (((az % 360) + 360) % 360) / STEP;
  const i = Math.floor(f) % n;
  return table[i] + (table[(i + 1) % n] - table[i]) * (f - Math.floor(f));
}
