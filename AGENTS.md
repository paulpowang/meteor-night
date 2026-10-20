# AGENTS.md — AI 協作指引（星空觀景台 starshowing）

> 任何 AI 接手本專案前，請先讀完本文件。
> 另請先閱讀通用知識庫：`C:\Users\wangp\OneDrive\Documents\AgentInstruction\00-START-HERE.md`。

## 一句話理解本專案

Vite + TypeScript + three.js 的寫實星空網頁：在 Mount Rainier 的 Reflection Lakes 看英仙座流星雨，有真實星圖、銀河、湖面倒影和 4 種星空樣式。純前端，設定存在 localStorage。

## 鐵則（不可違反）

1. **寫實夜景、真實星圖**（使用者 2026-10-19 選定）。星星位置一律從星表和天文計算來，不可為了好看亂移；藝術取捨（例如湖面 Fresnel 下限、月光情境）要在註解寫明。
2. **流星雨是主打功能**，任何改動都不能讓「示範」密度在 30 秒內看不到流星。
3. **美術方向以 `docs/art-brief.md` 為準**，大方向的改動要先問使用者。
4. UI、文件、註解一律繁體中文。
5. 專案放在 `C:\dev\starshowing`，**不要搬進 OneDrive**（`node_modules` 同步問題）。
6. 不加圖片素材；新增資料檔要寫明來源與授權。
7. localStorage key `starshowing_settings_v1`、樣式 key（`milkyway`、`moonlight`、`aurora`、`bluehour`）發佈後不可改名。

## 架構速覽

見 `README.md` 的「專案結構」。座標慣例：y 朝上、-z 朝北、+x 朝東，觀測者在原點，眼睛高度 1.7 m，湖面 y = 0（海拔 1,480 m）。

### 核心資料結構

- `public/data/stars.json`：`stars` 是扁平陣列，每 5 個數字為 `[hip, 赤經°, 赤緯°, 星等, B-V]`，依星等由亮到暗排序；`names[hip] = {n, zh, b, c}`。`zh` 是簡體，第二版要轉成繁體。
- `SkyPreset`（`src/presets.ts`）：每種星空樣式的全部參數。
- 流星：`src/sky/meteors.ts` 有固定 48 槽的物件池，每槽 2 個四邊形（本體＋餘跡）。

## 常見任務指引

| 任務 | 做法 |
|---|---|
| 新增星空樣式 | 在 `presets.ts` 加一筆並加進 `PRESET_ORDER`；需要新天空效果時，在 `skydome.ts` 加 uniform |
| 調整山形 | `src/world/heightfield.ts`；改完用下方「仰角掃描」確認山頂仍是剪影最高點 |
| 更新星表 | 把新檔放進 `data-src/`，再跑 `npm run data` |
| 測試 | 沒有自動化測試，跑 `.claude/skills/qa-checklist/SKILL.md` |
| 執行 | `npm run dev` → http://127.0.0.1:5188 |

**仰角掃描**：在 dev server 的 console 執行 `await import('/src/world/heightfield.ts')`，沿方位角 -40°..30° 計算 `atan(h / d)` 的最大值。山頂（方位約 -12.5°）要是最大值，大約 18°。

## 已踩過的坑

- 地形是極座標網格：角度往東時，從上方看是順時針。三角形順序寫反，法線就會朝下，雪面全黑。
- shader 裡 `pow(x, …)` 遇到負數會變 NaN；光暈會把 NaN 擴散成整片黑畫面。內插值要先 `clamp`。
- 流星四邊形要設 `DoubleSide`，否則有一半會被背面剔除，湖面倒影裡也會左右翻轉。
- 湖岸高度必須低於眼睛高度，而且南岸要貼近腳邊（約 2.5 m），才看得到完整的山頂倒影（山頂倒影在俯角 17°）。
- Browser pane 隱藏時載入，`innerWidth` 可能是 0：畫布尺寸由 CSS 決定，用 `ResizeObserver` 更新。

## 已知問題

見 `README.md` 的「已知限制與待改進」，兩處保持同步。

## 文件同步義務

- 功能變更 → 同步更新 `README.md`。
- 學到可跨專案重用的知識 → 回饋 `AgentInstruction` 知識庫（`skills/threejs-night-sky-scene.md`）。
- 有意義的變更都要 git commit（規範見知識庫 `instructions/git-conventions.md`）。
