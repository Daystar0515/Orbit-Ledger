// 手勢：用 Pointer Events 自己判斷滑動與雙指縮放，並提供鍵盤替代（方便在電腦上測試）。

const SWIPE_MIN = 40; // 至少滑動多少像素才算一次滑動
const PINCH_IN = 0.8; // 兩指距離縮到 80% 以下 → 縮小
const PINCH_OUT = 1.25; // 兩指距離放大到 125% 以上 → 放大

/**
 * @param {HTMLElement} el 要偵測手勢的區域（CSS 需設 touch-action: none）
 * @param {{onSwipe?:(dir:'left'|'right'|'up'|'down')=>void, onPinch?:(dir:'in'|'out')=>void}} handlers
 */
export function attachGestures(el, handlers) {
  const points = new Map();
  let start = null;
  let multi = false;
  let pinchStart = 0;
  let pinchDone = false;

  const distance = () => {
    const [a, b] = [...points.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  el.addEventListener('pointerdown', (e) => {
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.size === 1) {
      start = { x: e.clientX, y: e.clientY };
      multi = false;
    } else if (points.size === 2) {
      multi = true;
      pinchStart = distance();
      pinchDone = false;
    }
  });

  el.addEventListener('pointermove', (e) => {
    if (!points.has(e.pointerId)) return;
    points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (points.size === 2 && !pinchDone && pinchStart > 0) {
      const ratio = distance() / pinchStart;
      if (ratio < PINCH_IN) {
        pinchDone = true;
        handlers.onPinch?.('in');
      } else if (ratio > PINCH_OUT) {
        pinchDone = true;
        handlers.onPinch?.('out');
      }
    }
  });

  const finish = (e) => {
    if (!points.has(e.pointerId)) return;
    const wasSingle = points.size === 1;
    points.delete(e.pointerId);
    if (wasSingle && start && !multi && e.type === 'pointerup') {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      if (ax >= SWIPE_MIN && ax > ay * 1.2) handlers.onSwipe?.(dx > 0 ? 'right' : 'left');
      else if (ay >= SWIPE_MIN && ay > ax * 1.2) handlers.onSwipe?.(dy > 0 ? 'down' : 'up');
    }
    if (points.size === 0) {
      start = null;
      multi = false;
    }
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);

  // iOS Safari 的雙指縮放會觸發 gesture 事件，擋掉才不會放大整個頁面。
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) =>
    el.addEventListener(n, (e) => e.preventDefault()),
  );
}
