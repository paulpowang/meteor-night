/* 星空觀景台：主程式。建場景 → 每幀更新天球方向、星座、流星、湖面 → 後製輸出。 */
import * as THREE from 'three';
import { EQ_TO_GAL, eqToHoriz, eqToWorldMatrix, horizToWorld, localSiderealDeg, PERSEID_RADIANT, setObserver } from './astro';
import { createLookControls } from './controls';
import { createOverlay } from './overlay';
import { createPost } from './post';
import { localHourToDate, PRESETS, type SkyPreset } from './presets';
import { SCENES, type SceneKey } from './scenes';
import { createConstellations } from './sky/constellations';
import { createStarPicker } from './sky/identify';
import { createMeteors } from './sky/meteors';
import { createSkyDome } from './sky/skydome';
import { createStars, type StarCatalog } from './sky/stars';
import { createUi, DREAM_MAX, DREAM_MIN, formatHour, loadSettings, ratePerHour } from './ui';
import { heightAt } from './world/heightfield';
import { horizonAlt, setHorizonHeight } from './world/horizon';
import { createJoshuaWorld, joshuaColor, joshuaHeightAt } from './world/joshua';
import { createLake } from './world/lake';
import { createTerrain, type Quality } from './world/terrain';
import { createTrees } from './world/trees';

/* === 品質：手機或小螢幕用低品質 === */
const params = new URLSearchParams(location.search);
const isMobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const quality: Quality = (params.get('q') as Quality) || (isMobile ? 'low' : 'high');
const pixelRatio = Math.min(devicePixelRatio, quality === 'high' ? 2 : 1.5);

/* === 渲染器、相機 === */
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(pixelRatio);
// 畫布 CSS 尺寸交給 style.css（滿版），這裡只設繪圖解析度；隱藏分頁載入時 innerWidth 可能是 0，先給保底值
const viewSize = () => [canvas.clientWidth || innerWidth || 1280, canvas.clientHeight || innerHeight || 720] as const;
renderer.setSize(...viewSize(), false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, viewSize()[0] / viewSize()[1], 0.5, 60000);
camera.position.set(0, 1.7, 0);

/* === 燈光：天光（半球光）、月光、晨光 === */
const hemi = new THREE.HemisphereLight(0x8fa6d8, 0x0a0c10, 0.05);
const moonLight = new THREE.DirectionalLight(0xc8d4ff, 0);
const dawnLight = new THREE.DirectionalLight(0xff9a80, 0);
scene.add(hemi, moonLight, dawnLight, moonLight.target, dawnLight.target);
scene.fog = new THREE.FogExp2(0x000000, 0.000045);

/* === 世界 === */
const tm = (label: string, t0: number) => params.has('debug') && console.info(`[載入] ${label} ${Math.round(performance.now() - t0)} ms`);
let t0 = performance.now();
const sky = createSkyDome();
scene.add(sky.mesh);
const lake = createLake(pixelRatio);
scene.add(lake.lake);

// 地景依場景建立，建好的留著，切回來不用重建
const worlds = new Map<SceneKey, THREE.Group>();
function world(k: SceneKey) {
  let g = worlds.get(k);
  if (g) return g;
  const t0 = performance.now();
  g = new THREE.Group();
  if (k === 'rainier') g.add(createTerrain(quality), createTrees(quality));
  else g.add(createTerrain(quality, joshuaHeightAt, joshuaColor), createJoshuaWorld(quality));
  tm(`地景 ${k}`, t0);
  worlds.set(k, g);
  scene.add(g);
  return g;
}
const meteors = createMeteors();
scene.add(meteors.mesh);

const post = createPost(renderer, scene, camera);
post.setSize(...viewSize());

/* === 設定與介面 === */
const settings = loadSettings();
let preset: SkyPreset = PRESETS[settings.preset];

const sq0 = params.get('scene');
if (sq0 === 'rainier' || sq0 === 'joshua') settings.scene = sq0;
const look = createLookControls(camera, canvas, { ...SCENES[settings.scene].view, fov: isMobile ? 80 : 68 }, () => ui.activity(), onTap);

const ui = createUi(settings, {
  onPreset(k) {
    preset = PRESETS[k];
    settings.hour = preset.hour;
    applyPreset();
  },
  onChange() { applyConstellations(); },
  onScene(k) {
    // 先讓「載入中」畫出來，再建地景（第一次約 0.5–1 秒）
    ui.busy(`正在前往 ${SCENES[k].name}…`);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      applyScene();
      look.set(SCENES[k].view);
      ui.loaded();
    }));
  },
  onFireball() { meteors.spawn('fireball'); },
  onLongMeteor() { meteors.spawn('long'); },
  onLookRadiant() {
    const [az, alt] = eqToHoriz(PERSEID_RADIANT.ra, PERSEID_RADIANT.dec, localSiderealDeg(localHourToDate(settings.hour)));
    look.set({ yaw: az > 180 ? az - 360 : az, pitch: Math.min(80, alt) });
  },
});

function applyPreset() {
  const u = sky.material.uniforms;
  u.uZenith.value.setRGB(...preset.zenith);
  u.uHorizon.value.setRGB(...preset.horizon);
  u.uMilkyWay.value = preset.milkyWay;
  u.uMoon.value = preset.moon.intensity;
  horizToWorld(preset.moon.az, preset.moon.alt, u.uMoonDir.value);
  u.uAurora.value = preset.aurora;
  u.uDawn.value = preset.dawn.intensity;
  horizToWorld(preset.dawn.az, 2, u.uDawnDir.value);
  stars.material.uniforms.uLimitMag.value = preset.limitingMag;

  hemi.intensity = preset.skyLight;
  // 天光顏色：從天頂色推出來，但壓低飽和度（雪在夜裡是灰藍，不是寶藍）
  hemi.color.setRGB(preset.zenith[0] * 20 + 0.45, preset.zenith[1] * 20 + 0.5, preset.zenith[2] * 20 + 0.62);
  moonLight.intensity = preset.moon.intensity * 1.6;
  moonLight.position.copy(horizToWorld(preset.moon.az, preset.moon.alt)).multiplyScalar(10000);
  dawnLight.intensity = preset.dawn.intensity * 1.2;
  dawnLight.position.copy(horizToWorld(preset.dawn.az, 3)).multiplyScalar(10000);
  (scene.fog as THREE.FogExp2).color.setRGB(...preset.horizon);
  renderer.toneMappingExposure = preset.exposure;
  ui.refresh();
}

function applyScene() {
  const def = SCENES[settings.scene];
  setObserver(def.observer);
  setHorizonHeight(def.key === 'joshua' ? joshuaHeightAt : heightAt);
  world(def.key);
  worlds.forEach((g, k) => (g.visible = k === def.key));
  // 湖面隱藏時 Reflector 不會被畫，也就不會多畫一次反射貼圖
  lake.lake.visible = def.lake;
  horizToWorld(def.lightPollution.az, 0, sky.material.uniforms.uLpDir.value);
  sky.material.uniforms.uLp.value = def.lightPollution.strength;
  ui.refresh();
  setTimeout(() => horizonAlt(0), 1500);
}
applyScene();

/* === 星表載入後才建星星、星座 === */
let stars: ReturnType<typeof createStars>;
const catalog: StarCatalog = await fetch(`${import.meta.env.BASE_URL}data/stars.json`).then((r) => r.json());
stars = createStars(catalog);
stars.material.uniforms.uPixelRatio.value = pixelRatio;
scene.add(stars.points);
const constellations = createConstellations(catalog);
scene.add(constellations.lines);
const overlay = createOverlay(camera, canvas, constellations.labels);
const picker = createStarPicker(catalog, stars.catalogCount);
applyPreset();

// 星座連線不進湖面倒影：Reflector 繪製反射貼圖前先藏起來，畫完再恢復
{
  const reflect = lake.lake.onBeforeRender;
  lake.lake.onBeforeRender = function (...args) {
    const was = constellations.lines.visible;
    constellations.lines.visible = false;
    reflect.apply(this, args);
    constellations.lines.visible = was;
  };
}

function applyConstellations() {
  constellations.lines.visible = settings.constellations !== 'off';
  overlay.setNames(settings.constellations === 'names');
}
applyConstellations();

/* === 點星星認星 === */
const eqToWorld = new THREE.Matrix4();
const tapDir = new THREE.Vector3();
function onTap(x: number, y: number, pointerType: string) {
  tapDir.set((x / canvas.clientWidth) * 2 - 1, -(y / canvas.clientHeight) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
  const radPerPx = THREE.MathUtils.degToRad(camera.fov) / canvas.clientHeight;
  // 手指比滑鼠粗，觸控的搜尋半徑放大
  const i = picker.pick(tapDir, eqToWorld, radPerPx, pointerType === 'mouse' ? 26 : 40, preset.limitingMag);
  overlay.select(i < 0 ? null : picker.describe(i), eqToWorld);
}

/* === 主迴圈 === */
const worldToGal = new THREE.Matrix3();
const timer = new THREE.Timer();
let t = 0;

function frame() {
  timer.update();
  const dt = Math.min(0.1, timer.getDelta());
  t += dt;

  if (settings.speed > 0) {
    settings.hour += (dt * settings.speed) / 3600;
    if (settings.hour > 29.5) settings.hour = 21;
  }
  const lst = localSiderealDeg(localHourToDate(settings.hour));
  eqToWorldMatrix(lst, undefined, eqToWorld);

  stars.points.matrix.copy(eqToWorld);
  stars.points.matrixWorldNeedsUpdate = true;
  constellations.lines.matrix.copy(eqToWorld);
  constellations.lines.matrixWorldNeedsUpdate = true;
  stars.material.uniforms.uTime.value = t;
  // 世界 → 銀道 = 赤道→銀道 × (赤道→世界)ᵀ（純旋轉，轉置即反矩陣）
  worldToGal.setFromMatrix4(eqToWorld).transpose().premultiply(EQ_TO_GAL);
  sky.material.uniforms.uWorldToGal.value.copy(worldToGal);
  sky.material.uniforms.uTime.value = t;

  meteors.update(dt, { ratePerHour: ratePerHour(settings), dreamy: settings.rate === 'dreamy' }, eqToWorld, camera, viewSize()[1]);

  lake.material.uniforms.uTime.value = t;
  lake.material.uniforms.uWind.value = settings.wind;
  post.grade.uniforms.uTime.value = t;

  ui.setClock(formatHour(settings.hour));
  ui.setCount(meteors.spawned);
  post.composer.render(dt);
  // 疊層要用這一幀算圖用的相機（composer.render 內已更新 matrixWorld）
  overlay.update(eqToWorld);
  requestAnimationFrame(frame);
}

new ResizeObserver(() => {
  const [w, h] = viewSize();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  post.setSize(w, h);
}).observe(canvas);

// 截圖驗證用：?shot&yaw=..&pitch=..&fov=..&preset=..
if (params.has('yaw') || params.has('pitch') || params.has('fov')) {
  look.set({
    yaw: +(params.get('yaw') ?? look.state.yaw),
    pitch: +(params.get('pitch') ?? look.state.pitch),
    fov: +(params.get('fov') ?? look.state.fov),
  });
}
const pq = params.get('preset');
if (pq && pq in PRESETS) {
  preset = PRESETS[pq as keyof typeof PRESETS];
  settings.preset = preset.key;
  settings.hour = preset.hour;
  applyPreset();
}

// 截圖驗證用：?con=lines|names 開星座，?star=<HIP 編號> 直接選一顆星（例如織女星 91262）
const cq = params.get('con');
if (cq === 'off' || cq === 'lines' || cq === 'names') {
  settings.constellations = cq;
  applyConstellations();
  ui.refresh();
}
// 截圖驗證用：?rate=real|demo|storm|dreamy，?dream=<每分鐘顆數>
const rq = params.get('rate');
if (rq === 'real' || rq === 'demo' || rq === 'storm' || rq === 'dreamy') settings.rate = rq;
const dq = +(params.get('dream') ?? NaN);
if (Number.isFinite(dq) && dq >= DREAM_MIN && dq <= DREAM_MAX) settings.dreamCount = dq;
if (rq || params.has('dream')) ui.refresh();

const sq = picker.indexOfHip(+(params.get('star') ?? NaN));
if (sq >= 0) {
  eqToWorldMatrix(localSiderealDeg(localHourToDate(settings.hour)), undefined, eqToWorld);
  overlay.select(picker.describe(sq), eqToWorld);
}

t0 = performance.now();
renderer.compile(scene, camera);
tm('shader 編譯', t0);
ui.loaded();
requestAnimationFrame(frame);
// 開發模式下方便在 console 除錯
if (import.meta.env.DEV) Object.assign(window, { __app: { scene, camera, renderer, meteors, settings, picker, overlay, eqToWorld, look, onTap, worlds } });
