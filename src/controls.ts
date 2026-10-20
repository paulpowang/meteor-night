/* 觀景視角：原地轉頭（拖曳）、滾輪／雙指縮放視角寬度。不能移動位置，也不能看到地底。 */
import * as THREE from 'three';

export interface LookState {
  yaw: number;   // 方位角（度），0 = 北
  pitch: number; // 仰角（度）
  fov: number;   // 垂直視角（度）
}

export function createLookControls(camera: THREE.PerspectiveCamera, el: HTMLElement, init: LookState, onActivity: () => void) {
  const s = { ...init };
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;

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
    onActivity();
  });
  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
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
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    pinchDist = 0;
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
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
