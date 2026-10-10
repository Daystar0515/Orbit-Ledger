// 明細列表的操作：點一下編輯、向左滑露出「刪除」。
// 列表本身只允許垂直捲動（touch-action: pan-y），水平拖曳由這裡處理，所以不會干擾捲動。

const REVEAL = 84; // 露出的刪除按鈕寬度（px）
const START = 8; // 移動超過這個距離才判斷方向

/**
 * @param {HTMLElement} list
 * @param {{onTap:(id:string, row:HTMLElement)=>void, onDelete:(id:string)=>void, onDemoTap?:()=>void}} cb
 */
export function attachRowSwipe(list, { onTap, onDelete, onDemoTap }) {
  let open = null; // 目前露出刪除按鈕的那一列
  let drag = null;
  let suppressClick = false;

  const fg = (row) => row.querySelector('.row-fg');

  function setX(row, x, animate) {
    const f = fg(row);
    f.style.transition = animate ? 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
    f.style.transform = x ? `translateX(${x}px)` : '';
  }

  function closeOpen() {
    if (!open) return;
    setX(open, 0, true);
    open.classList.remove('swiped');
    open = null;
  }

  list.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('.row.swipe');
    if (!row || e.target.closest('.row-del') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (open && open !== row) closeOpen();
    drag = { row, id: e.pointerId, x0: e.clientX, y0: e.clientY, base: open === row ? -REVEAL : 0, moving: false, x: 0 };
  });

  list.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.moving) {
      if (Math.abs(dy) > START && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // 垂直捲動
      if (Math.abs(dx) < START) return;
      drag.moving = true;
      try { list.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    }
    drag.x = Math.max(-REVEAL - 24, Math.min(0, drag.base + dx));
    setX(drag.row, drag.x, false);
  });

  const finish = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!d.moving) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 60);
    const reveal = d.x < -REVEAL / 2;
    setX(d.row, reveal ? -REVEAL : 0, true);
    d.row.classList.toggle('swiped', reveal);
    open = reveal ? d.row : null;
  };
  list.addEventListener('pointerup', finish);
  list.addEventListener('pointercancel', finish);

  list.addEventListener('click', (e) => {
    if (suppressClick) return;
    const row = e.target.closest('.row');
    if (!row) return;
    if (e.target.closest('.row-del')) {
      onDelete(row.dataset.id);
      return;
    }
    if (open) { closeOpen(); return; } // 先點一下別處，就是收起按鈕
    if (row.classList.contains('swipe')) onTap(row.dataset.id, row);
    else onDemoTap?.();
  });

  list.addEventListener('keydown', (e) => {
    const row = e.target.closest?.('.row.swipe');
    if (row && e.target === row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onTap(row.dataset.id, row);
    }
  });

  list.addEventListener('scroll', closeOpen, { passive: true });
  return { closeOpen };
}
