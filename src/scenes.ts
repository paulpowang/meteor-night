/* 觀測場景（地點）。每個場景有自己的經緯度（星空會跟著變）、地景、預設視角與光害方向。
 * key 會存進 localStorage，發佈後不可改名。 */

export type SceneKey = 'rainier' | 'paradise' | 'joshua';

export interface SceneDef {
  key: SceneKey;
  name: string;
  /** 畫面左上角的地名 */
  place: string;
  desc: string;
  observer: { lat: number; lon: number; elevation: number };
  /** 預設視角（方位角、仰角，度） */
  view: { yaw: number; pitch: number };
  /** 光害：方位角（度）與強度倍率 */
  lightPollution: { az: number; strength: number };
  /** 有沒有湖面倒影（Reflector 每幀要多畫一次整個場景） */
  lake: boolean;
}

export const SCENES: Record<SceneKey, SceneDef> = {
  rainier: {
    key: 'rainier',
    name: 'Rainier 湖畔',
    place: 'Reflection Lakes · Mount Rainier',
    desc: '雪山、冷杉與湖面倒影。比較吃顯卡（每幀要多畫一次倒影），夢幻模式流星很多時更明顯',
    observer: { lat: 46.768, lon: -121.732, elevation: 1480 },
    view: { yaw: -4, pitch: 8 },
    lightPollution: { az: 315, strength: 1 },
    lake: true,
  },
  paradise: {
    key: 'paradise',
    name: 'Rainier 草甸',
    place: 'Paradise · Mount Rainier',
    desc: '同一座 Rainier，站在山腳的 Paradise 高山草甸看；沒有湖面倒影，比較省顯卡',
    observer: { lat: 46.786, lon: -121.735, elevation: 1645 },
    view: { yaw: -9, pitch: 17 },
    lightPollution: { az: 315, strength: 1 },
    lake: false,
  },
  joshua: {
    key: 'joshua',
    name: 'Joshua Tree 沙漠',
    place: 'Jumbo Rocks · Joshua Tree',
    desc: '約書亞樹與花崗岩巨石，地平線開闊；沒有湖面倒影，比較省顯卡',
    observer: { lat: 33.992, lon: -116.063, elevation: 1340 },
    view: { yaw: 30, pitch: 16 },
    // 西南方的 Coachella Valley（Palm Springs）與更遠的洛杉磯，是這裡最明顯的光害
    lightPollution: { az: 245, strength: 1.6 },
    lake: false,
  },
};

// 沒有湖的 Paradise 排第一、也是預設：第一次打開不會一開始就吃重顯卡
export const SCENE_ORDER: SceneKey[] = ['paradise', 'rainier', 'joshua'];
