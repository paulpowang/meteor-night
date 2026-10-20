/* 觀景視角：原地轉頭（拖曳）、滾輪／雙指縮放視角寬度。不能移動位置，也不能看到地底。
 * 點一下（單指、總移動距離 < TAP_PX）會呼叫 onTap，用來認星；拖曳和雙指縮放都不算點擊。 */
import * as THREE from 'three';

export interface LookState {
  yaw: number;   // 方位角（度），0 = 北
  pitch: number; // 仰角（度）
  fov: number;   // 垂直視角（度）
}

/** 點擊判定：按下到放開的累計移動距離小於這個值（CSS px）才算點擊 */
const TAP_PX = 6;

export function createLookControls(
  camera: THREE.PerspectiveCamera, el: HTMLElement, init: LookState, onActivity: () => void,
  onTap?: (x: number, y: number, pointerType: string) => void,
) {
  const s = { ...init };
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  // 這次手勢的累計移動量；出現第二根手指就整個手勢都不算點擊
  let moved = 0, multi = false;

  const apply = () => {
    s.pitch = THREE.MathUtils.clamp(s.pitch, -28, 88);
    s.fov = THREE.MathUtils.clamp(s.fov, 25, 95);
    camera.fov = s.fov;
    camera.updateProjectionMatrix();
    const e = new THREE.Euler(THREE.MathUtils.degToRad(s.pitch), THREE.MathUtils.degToRad(-s.yaw), 0, 'YXZ');
    camera.quaternion.setFromEuler(e);
  };

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { moved = 0; multi = false; } else multi = true;
    onActivity();
  });
  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    moved += Math.hypot(e.clientX - p.x, e.clientY - p.y);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      p.x = e.clientX; p.y = e.clientY;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) s.fov *= pinchDist / d;
      pinchDist = d;
    } else {
      // 拖曳靈敏度跟著視角寬度走：放大時轉得比較慢
      const k = s.fov / el.clientHeight;
      s.yaw -= (e.clientX - p.x) * k;
      s.pitch += (e.clientY - p.y) * k;
      p.x = e.clientX; p.y = e.clientY;
    }
    apply();
    onActivity();
  });
  const up = (e: PointerEvent, cancel: boolean) => {
    if (!pointers.delete(e.pointerId)) return;
    pinchDist = 0;
    if (!cancel && pointers.size === 0 && !multi && moved < TAP_PX && e.button <= 0) {
      const r = el.getBoundingClientRect();
      onTap?.(e.clientX - r.left, e.clientY - r.top, e.pointerType);
    }
  };
  el.addEventListener('pointerup', (e) => up(e, false));
  el.addEventListener('pointercancel', (e) => up(e, true));
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    s.fov *= Math.exp(e.deltaY * 0.001);
    apply();
    onActivity();
  }, { passive: false });

  apply();
  return {
    state: s,
    set(v: Partial<LookState>) { Object.assign(s, v); apply(); },
  };
}
