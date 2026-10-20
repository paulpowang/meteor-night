/* 星空樣式。每個樣式只是一組參數，天空、星星、地形燈光、後製都從這裡讀。
 * key 會存進 localStorage，發佈後不可改名。 */

export type PresetKey = 'milkyway' | 'moonlight' | 'aurora' | 'bluehour';

export interface SkyPreset {
  key: PresetKey;
  name: string;
  desc: string;
  /** 預設時間：從 8/12 00:00（PDT）起算的小時數，見 localHourToDate */
  hour: number;
  /** 肉眼極限星等：越小代表天空越亮、看得到的星越少 */
  limitingMag: number;
  /** 銀河亮度倍率 */
  milkyWay: number;
  /** 天頂與地平線的天空底色（線性 RGB） */
  zenith: [number, number, number];
  horizon: [number, number, number];
  /** 月亮：方位角、高度角、亮度（0 = 沒有月亮） */
  moon: { az: number; alt: number; intensity: number };
  /** 極光強度（0 = 沒有） */
  aurora: number;
  /** 晨光：朝向方位角與強度（0 = 沒有） */
  dawn: { az: number; intensity: number };
  /** 地形的天光（半球光）強度 */
  skyLight: number;
  /** 曝光 */
  exposure: number;
}

export const PRESETS: Record<PresetKey, SkyPreset> = {
  milkyway: {
    key: 'milkyway',
    name: '銀河夏夜',
    desc: '無月、極暗，銀河最清楚',
    hour: 25.5,
    limitingMag: 6.6,
    milkyWay: 1,
    zenith: [0.0045, 0.0065, 0.014],
    horizon: [0.02, 0.022, 0.026],
    moon: { az: 0, alt: -30, intensity: 0 },
    aurora: 0,
    dawn: { az: 70, intensity: 0 },
    skyLight: 0.75,
    exposure: 1.7,
  },
  moonlight: {
    key: 'moonlight',
    name: '月光雪山',
    desc: '半月照亮雪山，倒影更清楚',
    hour: 23.0,
    limitingMag: 5.0,
    milkyWay: 0.25,
    zenith: [0.012, 0.022, 0.055],
    horizon: [0.035, 0.05, 0.08],
    moon: { az: 215, alt: 28, intensity: 1 },
    aurora: 0,
    dawn: { az: 70, intensity: 0 },
    skyLight: 0.8,
    exposure: 1.3,
  },
  aurora: {
    key: 'aurora',
    name: '極光之夜',
    desc: '北方低空的淡綠色極光簾',
    hour: 24.5,
    limitingMag: 6.3,
    milkyWay: 0.8,
    zenith: [0.0045, 0.0065, 0.013],
    horizon: [0.016, 0.024, 0.02],
    moon: { az: 0, alt: -30, intensity: 0 },
    aurora: 1,
    dawn: { az: 70, intensity: 0 },
    skyLight: 0.7,
    exposure: 1.6,
  },
  bluehour: {
    key: 'bluehour',
    name: '藍色時刻',
    desc: '天快亮，只剩亮星，山頂泛紅',
    hour: 29.1,
    limitingMag: 3.2,
    milkyWay: 0.05,
    zenith: [0.012, 0.028, 0.075],
    horizon: [0.06, 0.07, 0.11],
    moon: { az: 0, alt: -30, intensity: 0 },
    aurora: 0,
    dawn: { az: 68, intensity: 1 },
    skyLight: 1.5,
    exposure: 1.0,
  },
};

export const PRESET_ORDER: PresetKey[] = ['milkyway', 'moonlight', 'aurora', 'bluehour'];

/** 從 2026-08-12 00:00 當地時間（PDT = UTC−7）起算的小時數 → Date。
 * 25.5 = 8/13 凌晨 1:30，英仙座極大期。2026-08-12 剛好是新月，真實夜空沒有月亮；
 * 「月光雪山」是假設情境。 */
export function localHourToDate(hour: number): Date {
  return new Date(Date.UTC(2026, 7, 12, 0, 0, 0) + (hour + 7) * 3600_000);
}
