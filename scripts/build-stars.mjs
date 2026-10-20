// 把 data-src/ 的 d3-celestial 星表轉成網頁用的精簡格式 public/data/stars.json
// 執行：npm run data
import { readFileSync, writeFileSync } from 'node:fs';

const src = (f) => JSON.parse(readFileSync(new URL(`../data-src/${f}`, import.meta.url), 'utf8'));
const stars = src('stars.6.json').features;
const names = src('starnames.json');

// 扁平陣列 [hip, 赤經°(0–360), 赤緯°, 星等, B-V] × N，依星等由亮到暗排序
const rows = stars
  .map((f) => {
    const [ra, dec] = f.geometry.coordinates;
    const bv = parseFloat(f.properties.bv);
    return [f.id, +((ra + 360) % 360).toFixed(4), +dec.toFixed(4), f.properties.mag, Number.isFinite(bv) ? bv : 0.6];
  })
  .sort((a, b) => a[3] - b[3]);

// 第二版認星用：只保留有專名或拜耳名的星
const named = {};
for (const [hip] of rows) {
  const n = names[hip];
  if (n && (n.name || n.bayer)) named[hip] = { n: n.name, zh: n.zh || '', b: n.bayer, c: n.c };
}

const out = { source: 'd3-celestial (BSD-3, Olaf Frohn), 原始資料 HYG Database', cols: ['hip', 'ra', 'dec', 'mag', 'bv'], stars: rows.flat(), names: named };
writeFileSync(new URL('../public/data/stars.json', import.meta.url), JSON.stringify(out));
console.log(`stars: ${rows.length}, named: ${Object.keys(named).length}`);
