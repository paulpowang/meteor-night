/* 介面：設定面板、閒置淡出、設定存 localStorage（壞資料直接丟棄，用預設值）。 */
import { PRESETS, PRESET_ORDER, type PresetKey } from './presets';

export const RATES = [
  { key: 'real', name: '真實', perHour: 90, desc: '約每分鐘 1 顆，要有耐心' },
  { key: 'demo', name: '示範', perHour: 1500, desc: '約每分鐘 25 顆' },
  { key: 'storm', name: '流星暴', perHour: 6000, desc: '像 1966 年獅子座流星暴' },
  // 夢幻：數量由滑桿決定（settings.dreamCount，每分鐘顆數），perHour 不使用
  { key: 'dreamy', name: '夢幻', perHour: 0, desc: '一直有很多彩色流星，可以調數量' },
] as const;
export type RateKey = (typeof RATES)[number]['key'];

/** 夢幻模式的每分鐘流星數範圍 */
export const DREAM_MIN = 10, DREAM_MAX = 600;

/** 實際每小時流星數（夢幻模式看滑桿） */
export function ratePerHour(s: Settings) {
  return s.rate === 'dreamy' ? s.dreamCount * 60 : RATES.find((r) => r.key === s.rate)!.perHour;
}

export const SPEEDS = [
  { key: 0, name: '時間靜止' },
  { key: 1, name: '真實速度' },
  { key: 240, name: '縮時 ×240' },
] as const;

export const CONSTELLATION_MODES = [
  { key: 'off', name: '不顯示' },
  { key: 'lines', name: '連線' },
  { key: 'names', name: '連線＋名稱' },
] as const;
export type ConstellationMode = (typeof CONSTELLATION_MODES)[number]['key'];

export interface Settings {
  preset: PresetKey;
  rate: RateKey;
  hour: number;
  speed: number;
  wind: number;
  constellations: ConstellationMode;
  /** 夢幻模式：每分鐘流星數 */
  dreamCount: number;
}

const STORE_KEY = 'starshowing_settings_v1';

export function loadSettings(): Settings {
  const def: Settings = { preset: 'milkyway', rate: 'demo', hour: PRESETS.milkyway.hour, speed: 0, wind: 0.2, constellations: 'off', dreamCount: 120 };
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return def;
    const s = { ...def };
    if (PRESET_ORDER.includes(raw.preset)) s.preset = raw.preset;
    if (RATES.some((r) => r.key === raw.rate)) s.rate = raw.rate;
    if (Number.isFinite(raw.hour) && raw.hour >= 21 && raw.hour <= 29.5) s.hour = raw.hour;
    if (SPEEDS.some((r) => r.key === raw.speed)) s.speed = raw.speed;
    if (Number.isFinite(raw.wind) && raw.wind >= 0 && raw.wind <= 1) s.wind = raw.wind;
    if (CONSTELLATION_MODES.some((m) => m.key === raw.constellations)) s.constellations = raw.constellations;
    if (Number.isFinite(raw.dreamCount) && raw.dreamCount >= DREAM_MIN && raw.dreamCount <= DREAM_MAX) s.dreamCount = raw.dreamCount;
    return s;
  } catch {
    return def;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* 無痕模式等情況存不了，沒關係 */
  }
}

export function formatHour(h: number): string {
  const t = ((h % 24) + 24) % 24;
  const hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
  const day = h >= 24 ? 13 : 12;
  return `8 月 ${day} 日 ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export interface UiHandlers {
  onPreset(k: PresetKey): void;
  onChange(): void;
  onFireball(): void;
  onLongMeteor(): void;
  onLookRadiant(): void;
}

export function createUi(settings: Settings, h: UiHandlers) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const panel = $('panel'), toggle = $<HTMLButtonElement>('toggle');
  const time = $<HTMLInputElement>('time'), wind = $<HTMLInputElement>('wind');
  const dream = $<HTMLInputElement>('dream'), dreamRow = $('dream-row');
  dream.min = String(DREAM_MIN);
  dream.max = String(DREAM_MAX);

  const chips = <K extends string | number>(
    host: HTMLElement, items: readonly { key: K; name: string; desc?: string }[], get: () => K, set: (k: K) => void,
  ) => {
    host.innerHTML = '';
    const btns = items.map((it) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = it.name;
      if (it.desc) b.title = it.desc;
      b.addEventListener('click', () => { set(it.key); refresh(); });
      host.appendChild(b);
      return { b, key: it.key };
    });
    return () => btns.forEach(({ b, key }) => b.setAttribute('aria-pressed', String(key === get())));
  };

  const refreshers = [
    chips($('presets'), PRESET_ORDER.map((k) => ({ key: k, name: PRESETS[k].name, desc: PRESETS[k].desc })),
      () => settings.preset, (k) => { settings.preset = k; h.onPreset(k); }),
    chips($('rates'), RATES, () => settings.rate, (k) => { settings.rate = k; h.onChange(); }),
    chips($('constellations'), CONSTELLATION_MODES, () => settings.constellations, (k) => { settings.constellations = k; h.onChange(); }),
    chips($('speeds'), SPEEDS, () => settings.speed as 0 | 1 | 240, (k) => { settings.speed = k; h.onChange(); }),
  ];

  time.addEventListener('input', () => { settings.hour = +time.value; h.onChange(); refresh(); });
  wind.addEventListener('input', () => { settings.wind = +wind.value; h.onChange(); refresh(); });
  dream.addEventListener('input', () => { settings.dreamCount = +dream.value; h.onChange(); refresh(); });
  $('fireball').addEventListener('click', h.onFireball);
  $('long-meteor').addEventListener('click', h.onLongMeteor);
  $('look-radiant').addEventListener('click', h.onLookRadiant);

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    activity();
  });

  function refresh() {
    refreshers.forEach((r) => r());
    $('preset-desc').textContent = PRESETS[settings.preset].desc;
    time.value = String(settings.hour);
    $('time-val').textContent = formatHour(settings.hour).slice(-5);
    wind.value = String(settings.wind);
    dreamRow.hidden = settings.rate !== 'dreamy';
    dream.value = String(settings.dreamCount);
    $('dream-val').textContent = `每分鐘 ${settings.dreamCount} 顆`;
    $('wind-val').textContent = settings.wind < 0.08 ? '無風如鏡' : settings.wind < 0.5 ? '微風' : '有風';
    saveSettings(settings);
  }

  // 閒置 3 秒自動隱藏介面（面板開著時不隱藏）
  let idleTimer = 0;
  const activity = () => {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (panel.hidden) document.body.classList.add('idle');
    }, 3000);
  };
  ['pointermove', 'pointerdown', 'keydown', 'wheel'].forEach((e) => window.addEventListener(e, activity, { passive: true }));
  activity();

  refresh();
  return {
    refresh,
    activity,
    setClock(text: string) { $('clock').textContent = text; },
    setCount(n: number) { $('count').textContent = String(n); },
    loaded() { $('loading').classList.add('done'); },
  };
}
