# 星空觀景台 starshowing

站在 Mount Rainier 的 Reflection Lakes 湖畔，看英仙座流星雨劃過真實星空，湖面同時映出雪山、星星和流星。

## 快速開始

```bash
npm install
npm run dev        # http://127.0.0.1:5188
npm run build      # 輸出到 dist/，可放上任何靜態主機
```

網址參數（截圖驗證用）：`?preset=milkyway|moonlight|aurora|bluehour`、`?yaw=-4&pitch=8&fov=68`、`?q=low`（強制低品質）、`?debug`（在 console 印出載入時間）。

## 功能（v1）

- **流星雨（主打）**：從英仙座輻射點往外放射；亮度依真實族群指數分布，偶爾出現帶綠光和餘跡的火流星。密度分成「真實」（約每分鐘 1 顆）、「示範」、「流星暴」三種，也能手動「來一顆火流星」。
- **真實星空**：5,044 顆真實恆星（星等 6 以內），依 2026-08-13 凌晨的時間和觀測點位置計算；星色依 B-V 色指數，接近地平線時會變暗、變紅。另外補了 26,000 顆程式產生的暗星，讓銀河更有層次。
- **銀河**：沿真實銀道面分布，有雲氣和暗帶（天鵝座大裂縫）。
- **4 種星空樣式**：銀河夏夜、月光雪山、極光之夜、藍色時刻。
- **Rainier 與湖面倒影**：程式產生的山形（主峰、Little Tahoma、冷杉林），湖面會反射整個場景，可以調整風力，從無風如鏡到微風波紋。
- **操作**：拖曳轉頭、滾輪或雙指縮放，「看輻射點」一鍵轉向；時間可以拖動，也可以縮時播放；介面閒置 3 秒後自動淡出。
- 設定會存在 localStorage（`starshowing_settings_v1`）。

## 專案結構

```
index.html               畫面骨架與設定面板
src/main.ts              建場景、主迴圈、套用星空樣式
src/astro.ts             天文計算：恆星時、赤道→地平→世界座標、B-V→RGB、可重現亂數
src/presets.ts           4 種星空樣式的參數
src/sky/stars.ts         恆星點精靈 shader（星等、消光、閃爍）
src/sky/skydome.ts       天空穹頂：底色、氣輝、光害、銀河、月亮、極光、晨光
src/sky/meteors.ts       流星生成與繪製
src/world/heightfield.ts 地形高度函式（Rainier、丘陵、Tatoosh、湖盆）
src/world/terrain.ts     極座標地形網格、雪線上色與雪面細節 shader
src/world/trees.ts       冷杉 InstancedMesh
src/world/lake.ts        Reflector 湖面倒影、波紋
src/post.ts              光暈、ACES、暗角、顆粒
src/controls.ts          原地轉頭視角
src/ui.ts                設定面板、localStorage
scripts/build-stars.mjs  data-src/ 星表 → public/data/stars.json
docs/art-brief.md        美術方向（已核准）
```

## 技術重點

- 天球轉換用 `eqToWorldMatrix`，把 3 個基底方向各轉一次就組成矩陣，星星整組只需要套一個矩陣。
- 星星、流星都在天球半徑 40 km 附近，湖面 Reflector 會一起反射，倒影裡也看得到。
- 全部程式產生，沒有圖片素材；唯一的資料檔是星表（壓縮後約 260 KB）。
- 效能：RTX 5060 筆電約 240 fps（1248×1273）；手機自動用低品質網格。

## 資料來源與授權

- 星表：[d3-celestial](https://github.com/ofrohn/d3-celestial)（BSD-3-Clause，Olaf Frohn），原始資料來自 HYG Database。授權全文見 `data-src/LICENSE-d3-celestial.txt`。

## 已知限制與待改進（Roadmap）

- 「月光雪山」是假設情境：2026-08-12 是新月，真實的英仙座極大夜沒有月亮。月亮位置是固定的，沒有依時間計算。
- 山形是程式擬合的近似形狀，不是真實地形資料。之後可以改用 USGS 3DEP 公有領域地形資料。
- 第一次載入要在主執行緒建地形（約 0.5 秒）；手機上可能更久，之後可以移到 Web Worker。
- 湖面倒影裡的星點會比實際稍大，因為反射貼圖的解析度較低。
- **第二版**：點星星顯示名稱與介紹、星座連線與名稱（`stars.json` 已保留 1,916 顆星名，星座連線原始資料在 `data-src/`）。
