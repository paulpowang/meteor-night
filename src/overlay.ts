/* 天空上的 HTML 疊層：星座名稱標籤、選取星星的小圈、認星資訊卡。
 * 用 HTML 而不是 3D 文字：字比較清楚、不需要字型貼圖，也不會出現在湖面倒影裡。 */
import * as THREE from 'three';
import { worldToHoriz } from './astro';
import { compassName, type StarInfo } from './sky/identify';
import { CONSTELLATION_ZH } from './sky/lore';
import { horizonAlt } from './world/horizon';

interface Label { el: HTMLDivElement; dir: THREE.Vector3; }

export function createOverlay(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, labelsData: { id: string; rank: number; dir: THREE.Vector3 }[]) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const host = $('sky-labels');
  const marker = $('star-marker');
  const card = $('star-card');

  const labels: Label[] = labelsData.map((c) => {
    const el = document.createElement('div');
    el.className = `con-label rank${c.rank}`;
    el.textContent = CONSTELLATION_ZH[c.id] ?? c.id;
    host.appendChild(el);
    return { el, dir: c.dir };
  });

  const m3 = new THREE.Matrix3();
  const w = new THREE.Vector3();
  const p = new THREE.Vector3();

  /** 世界方向 → 畫面座標（CSS px）；在相機後方或畫面外就回傳 null */
  const toScreen = (dir: THREE.Vector3, margin: number): [number, number] | null => {
    p.copy(dir).multiplyScalar(1000).add(camera.position).project(camera);
    if (p.z > 1 || Math.abs(p.x) > 1 + margin || Math.abs(p.y) > 1 + margin) return null;
    return [(p.x * 0.5 + 0.5) * canvas.clientWidth, (-p.y * 0.5 + 0.5) * canvas.clientHeight];
  };
  /** 0–1：接近地平線或山的剪影時淡出；被擋住回傳 0 */
  const skyFade = (dir: THREE.Vector3) => {
    const [az, alt] = worldToHoriz(dir);
    return THREE.MathUtils.clamp((alt - Math.max(0, horizonAlt(az))) / 4, 0, 1);
  };

  let showNames = false;
  let selected: StarInfo | null = null;

  function update(eqToWorld: THREE.Matrix4) {
    m3.setFromMatrix4(eqToWorld);
    if (showNames) {
      for (const l of labels) {
        w.copy(l.dir).applyMatrix3(m3);
        const s = w.y > -0.05 ? toScreen(w, 0.1) : null;
        const f = s ? skyFade(w) : 0;
        if (!s || f <= 0) { l.el.style.display = 'none'; continue; }
        l.el.style.display = '';
        l.el.style.opacity = f.toFixed(2);
        l.el.style.transform = `translate(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px) translate(-50%, -50%)`;
      }
    }
    if (selected) {
      w.copy(selected.dir).applyMatrix3(m3);
      const s = toScreen(w, 0);
      marker.hidden = !s || skyFade(w) <= 0;
      if (s) marker.style.transform = `translate(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  function setNames(on: boolean) {
    showNames = on;
    host.hidden = !on;
  }

  function select(info: StarInfo | null, eqToWorld?: THREE.Matrix4) {
    selected = info;
    card.hidden = !info;
    marker.hidden = !info;
    if (!info) return;
    $('sc-title').textContent = info.title;
    $('sc-sub').textContent = info.sub;
    $('sc-sub').hidden = !info.sub;
    $('sc-bayer').textContent = info.bayer || '—';
    $('sc-con').textContent = info.constellation || '—';
    $('sc-mag').textContent = info.mag.toFixed(2);
    if (eqToWorld) {
      const [az, alt] = worldToHoriz(w.copy(info.dir).applyMatrix3(m3.setFromMatrix4(eqToWorld)));
      $('sc-pos').textContent = `${compassName(az)}方 · 仰角 ${Math.round(alt)}°`;
    }
    $('sc-text').textContent = info.text;
    $('sc-text').hidden = !info.text;
  }

  $('sc-close').addEventListener('click', () => select(null));

  return { update, setNames, select, get selected() { return selected; } };
}
