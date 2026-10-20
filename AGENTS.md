# AGENTS.md — AI 協作指引（星空觀景台 meteor-night）

> 任何 AI 接手本專案前，請先讀完本文件。
> 另請先閱讀通用知識庫：`C:\Users\wangp\OneDrive\Documents\AgentInstruction\00-START-HERE.md`。

## 一句話理解本專案

Vite + TypeScript + three.js 的寫實星空網頁：在 Mount Rainier 的 Paradise 草甸（或 Reflection Lakes 湖畔、Joshua Tree 沙漠）看英仙座流星雨，有真實星圖、銀河、湖面倒影和 4 種星空樣式；第二版加了星座連線與名稱、點星星認星。純前端，設定存在 localStorage。

## 鐵則（不可違反）

1. **寫實夜景、真實星圖**（使用者 2026-10-19 選定）。星星位置一律從星表和天文計算來，不可為了好看亂移；藝術取捨（例如湖面 Fresnel 下限、月光情境）要在註解寫明。
2. **流星雨是主打功能**，任何改動都不能讓「示範」密度在 30 秒內看不到流星。
3. **美術方向以 `docs/art-brief.md` 為準**，大方向的改動要先問使用者。
4. UI、文件、註解一律繁體中文。
5. GitHub repo 是 `paulpowang/meteor-night`（2026-10-19 從 starshowing 改名；本機資料夾仍是 `C:\dev\starshowing`）。專案放在 `C:\dev\starshowing`，**不要搬進 OneDrive**（`node_modules` 同步問題）。
6. 不加圖片素材；新增資料檔要寫明來源與授權。
7. localStorage key `starshowing_settings_v1`、樣式 key（`milkyway`、`moonlight`、`aurora`、`bluehour`）、場景 key（`paradise`、`rainier`、`joshua`）、密度 key（`real`、`demo`、`storm`、`dreamy`）、星座模式 key（`off`、`lines`、`names`）發佈後不可改名。
8. 預設場景是沒有湖的 `paradise`（使用者 2026-10-19 指定，避免一打開就吃重顯卡）；湖畔場景要保留「比較吃顯卡」的提示。
9. 星座連線預設關閉，而且要又細又淡，不能搶流星的風采。

## 架構速覽

見 `README.md` 的「專案結構」。座標慣例：y 朝上、-z 朝北、+x 朝東，觀測者在原點，眼睛高度 1.7 m，湖面 y = 0（海拔 1,480 m）。

### 核心資料結構

- `public/data/stars.json`：`stars` 是扁平陣列，每 5 個數字為 `[hip, 赤經°, 赤緯°, 星等, B-V]`，依星等由亮到暗排序；`names[hip] = {n, zh, b, c}`，`zh` 建置時已轉成繁體（對照表在 `scripts/build-stars.mjs` 的 `S2T`）；`constellations[] = {id, r, c, l}`，`l` 是折線 `[赤經°, 赤緯°, …]`，`c` 是名稱位置。
- 星表索引 `0 … catalogCount-1` 是真實星；之後的是程式產生的暗星，認星不能選到它們。
- 認星：`src/sky/identify.ts` 的 `pick()` 把點擊方向用 `eqToWorld` 的轉置轉回赤道座標，評分 = 像素距離 −（4.5 − 星等）× 4 px，比 4.5 等暗的星只在附近沒有亮星時才選。俗名與簡介在 `src/sky/lore.ts`。
- `SkyPreset`（`src/presets.ts`）：每種星空樣式的全部參數。
- `SceneDef`（`src/scenes.ts`）：場景的經緯度、預設視角、光害、有沒有湖。`main.ts` 的 `applyScene()` 會 `setObserver()`（`astro.ts` 的 `OBSERVER` 是可變物件，各函式的預設緯度、經度每次呼叫都重讀）、`setHorizonHeight()`、切換地景 Group 的 `visible`、隱藏湖面。地景 Group 建一次就快取。
- 流星：`src/sky/meteors.ts` 有固定 200 槽的物件池，每槽 2 個四邊形（本體＋餘跡）。種類 `normal`／`fireball`／`long`；生命週期 = `dur`（頭在走）＋ `fade`（頭停下、尾巴淡出）＋ `trainDur`（餘跡）。頂點屬性 `shape` = (頭部長度比例, 頭部亮度)，-1 代表餘跡。
- 夢幻模式：`settings.rate === 'dreamy'`，每分鐘顆數在 `settings.dreamCount`（10–600），`ratePerHour(settings)` 統一換算。

## 常見任務指引

| 任務 | 做法 |
|---|---|
| 新增星空樣式 | 在 `presets.ts` 加一筆並加進 `PRESET_ORDER`；需要新天空效果時，在 `skydome.ts` 加 uniform |
| 新增場景 | 在 `scenes.ts` 加一筆並加進 `SCENE_ORDER`；地景寫成一個高度函式＋上色函式（傳給 `createTerrain`）和一個回傳 Group 的建構函式，在 `main.ts` 的 `world()` 接上 |
| 調整山形 | `src/world/heightfield.ts`；改完用下方「仰角掃描」確認山頂仍是剪影最高點 |
| 更新星表 | 把新檔放進 `data-src/`，再跑 `npm run data` |
| 新增星的簡介 | 在 `src/sky/lore.ts` 的 `STAR_LORE` 加一筆（key 是 HIP 編號）；俗名和傳統星官名不同時，標題會自動寫成「俗名（星官名）」 |
| 星名出現簡體字 | 補進 `scripts/build-stars.mjs` 的 `S2T` 對照表，再跑 `npm run data` |
| 測試 | 沒有自動化測試，跑 `.claude/skills/qa-checklist/SKILL.md` |
| 執行 | `npm run dev` → http://127.0.0.1:5188 |
| 部署 | 推送到 `main`，GitHub Actions（`.github/workflows/deploy.yml`）會自動部署到 GitHub Pages；本機先跑 `npm run build` 確認會過 |

**仰角掃描**：在 dev server 的 console 執行 `await import('/src/world/heightfield.ts')`，沿方位角 -40°..30° 計算 `atan(h / d)` 的最大值。山頂（方位約 -12.5°）要是最大值，大約 18°。

## 已踩過的坑

- 地形是極座標網格：角度往東時，從上方看是順時針。三角形順序寫反，法線就會朝下，雪面全黑。
- shader 裡 `pow(x, …)` 遇到負數會變 NaN；光暈會把 NaN 擴散成整片黑畫面。內插值要先 `clamp`。
- 流星四邊形要設 `DoubleSide`，否則有一半會被背面剔除，湖面倒影裡也會左右翻轉。
- 湖岸高度必須低於眼睛高度，而且南岸要貼近腳邊（約 2.5 m），才看得到完整的山頂倒影（山頂倒影在俯角 17°）。
- Browser pane 隱藏時載入，`innerWidth` 可能是 0：畫布尺寸由 CSS 決定，用 `ResizeObserver` 更新。
- Reflector 的反射相機是第一次算圖時 `camera.clone()` 出來的，會複製當下的 layers，所以不能靠 layers 排除倒影裡的物件。星座連線改成在 `lake.onBeforeRender` 裡暫時 `visible = false`。
- HTML 疊層（星座名稱、選取圈）不受深度測試，要自己用 `src/world/horizon.ts` 的剪影仰角判斷是否被山擋住。
- 拖曳轉頭時星星會跟著手指走，所以點擊判定用放開時的位置就好；出現第二根手指，整個手勢都不算點擊。
- 流星不能在亮度還很高時直接停畫：本體結束後要有 burnout 階段把亮度收到 0，否則看起來像「被截掉」（尤其是火流星，光暈會放大這個斷點）。改流星亮度曲線後，用 console 建一個獨立的 `createMeteors()`，以固定 dt 逐幀記錄 `color` 的 alpha，確認最後幾幀是平滑降到 0。
- 長的四邊形寬度方向要在兩端各自算（切線 × 該端位置），頭部長度用像素決定，不能用固定比例，否則長流星的頭會被拉成一大坨。
- 在 console 用 `await import('/src/astro.ts')` 拿到的模組，可能跟主程式用的不是同一個實例（Vite HMR 會加時間戳記），讀到的 `OBSERVER` 會是舊值。驗算天文時，直接用 `__app.eqToWorld` 把星的方向算出來。
- Paradise 場景是把 Reflection Lakes 的高度場平移（`OX`, `OZ`）再扣掉觀測點高度 `H0`；上色、林線也要用平移回去的座標和高度，否則林線、雪線會錯位。改 Rainier 山形時兩個場景會一起變，兩邊都要截圖。
- 截圖時如果使用者也在 pane 裡拖曳，視角會跑掉：在截圖前一刻用 `__app.look.set()` 設定，不要只靠網址參數。
- 用 Python 或 shell 改檔偶爾不會觸發 Vite 的檔案監看，畫面還是舊的：`touch` 一下檔案，或用 `fetch('/src/xxx.ts')` 確認伺服器給的是新版。
- 本機另一個 session 可能佔著 5188；可以用 `npm run dev -- --port 5190` 另開一個。

## 已知問題

見 `README.md` 的「已知限制與待改進」，兩處保持同步。

## 文件同步義務

- 功能變更 → 同步更新 `README.md`。
- 學到可跨專案重用的知識 → 回饋 `AgentInstruction` 知識庫（`skills/threejs-night-sky-scene.md`）。
- 有意義的變更都要 git commit（規範見知識庫 `instructions/git-conventions.md`）。
