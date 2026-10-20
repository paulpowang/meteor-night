// 把 data-src/ 的 d3-celestial 星表、星名、星座連線轉成網頁用的精簡格式 public/data/stars.json
// 執行：npm run data
import { readFileSync, writeFileSync } from 'node:fs';

const src = (f) => JSON.parse(readFileSync(new URL(`../data-src/${f}`, import.meta.url), 'utf8'));
const stars = src('stars.6.json').features;
const names = src('starnames.json');
const lines = src('constellations.lines.json').features;

// starnames.json 的 zh 是簡體。只有約 450 個名字、用到不到 300 個字，
// 所以直接列出其中「簡繁不同」的字，不引入轉換套件。新增星名資料後若有漏網的簡體字，補在這裡。
const S2T = Object.fromEntries(
  ('仓倉 鸟鳥 阁閣 将將 军軍 娄婁 刍芻 陈陳 园園 积積 阴陰 砺礪 毕畢 参參 车車 厕廁 红紅 宝寶 猎獵 户戶 边邊 贝貝 ' +
    '关關 孙孫 钺鉞 内內 阶階 轩軒 辕轅 纪紀 张張 势勢 枢樞 诸諸 辅輔 阳陽 执執 玑璣 纳納 乌烏 辖轄 轸軫 权權 ' +
    '库庫 楼樓 东東 厨廚 开開 摇搖 摄攝 鹤鶴 马馬 枪槍 变變 门門 极極 贯貫 钩鉤 钤鈐 晋晉 闭閉 韩韓 赵趙 书書 ' +
    '万萬 说說 织織 渐漸 吴吳 鳖鱉 辇輦 渊淵 齐齊 国國 败敗 构構 虚虛 卫衛 垒壘 阵陣 盖蓋 坟墳 电電 离離 宫宮 ' +
    '师師 雳靂')
    .split(' ')
    .map((p) => [...p]),
);
const toTrad = (s) => [...s].map((ch) => S2T[ch] ?? ch).join('');

// 扁平陣列 [hip, 赤經°(0–360), 赤緯°, 星等, B-V] × N，依星等由亮到暗排序
const rows = stars
  .map((f) => {
    const [ra, dec] = f.geometry.coordinates;
    const bv = parseFloat(f.properties.bv);
    return [f.id, +((ra + 360) % 360).toFixed(4), +dec.toFixed(4), f.properties.mag, Number.isFinite(bv) ? bv : 0.6];
  })
  .sort((a, b) => a[3] - b[3]);

// 認星用：只保留有專名或拜耳名的星；zh 已轉成繁體
const named = {};
for (const [hip] of rows) {
  const n = names[hip];
  if (n && (n.name || n.bayer)) named[hip] = { n: n.name, zh: toTrad(n.zh || ''), b: n.bayer, c: n.c };
}

// 星座連線：每條折線攤平成 [赤經°, 赤緯°, …]；c 是名稱標籤位置（所有頂點方向的平均，再正規化）
const D2R = Math.PI / 180;
const constellations = lines.map((f) => {
  let x = 0, y = 0, z = 0;
  const l = f.geometry.coordinates.map((poly) =>
    poly.flatMap(([ra, dec]) => {
      x += Math.cos(dec * D2R) * Math.cos(ra * D2R);
      y += Math.cos(dec * D2R) * Math.sin(ra * D2R);
      z += Math.sin(dec * D2R);
      return [+((ra + 360) % 360).toFixed(3), +dec.toFixed(3)];
    }),
  );
  const c = [+((Math.atan2(y, x) / D2R + 360) % 360).toFixed(2), +(Math.atan2(z, Math.hypot(x, y)) / D2R).toFixed(2)];
  return { id: f.id, r: +f.properties.rank, c, l };
});

const out = {
  source: 'd3-celestial (BSD-3, Olaf Frohn), 原始資料 HYG Database',
  cols: ['hip', 'ra', 'dec', 'mag', 'bv'],
  stars: rows.flat(),
  names: named,
  constellations,
};
writeFileSync(new URL('../public/data/stars.json', import.meta.url), JSON.stringify(out));
const segs = constellations.reduce((s, c) => s + c.l.reduce((t, p) => t + p.length / 2 - 1, 0), 0);
console.log(`stars: ${rows.length}, named: ${Object.keys(named).length}, constellations: ${constellations.length}, segments: ${segs}`);
