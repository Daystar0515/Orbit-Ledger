// 通用的半版視窗：從底部滑出，背後有半透明遮罩。
// 一次只會開一個；點遮罩、按 Esc、或在頂部往下滑都可以關閉。

import { attachGestures } from './gestures.js';

const scrim = document.getElementById('scrim');
let current = null;

export const anySheetOpen = () => current !== null;

export function makeSheet(el, { onOpen, onClose } = {}) {
  el.inert = true;
  el.setAttribute('aria-hidden', 'true');

  const api = {
    isOpen: () => current === api,
    open() {
      if (current === api) return;
      if (current) current.close();
      current = api;
      el.inert = false;
      el.setAttribute('aria-hidden', 'false');
      el.classList.add('open');
      scrim.classList.add('open');
      onOpen?.();
      el.focus({ preventScroll: true });
    },
    close() {
      if (current !== api) return;
      current = null;
      if (el.contains(document.activeElement)) document.activeElement.blur();
      el.classList.remove('open');
      scrim.classList.remove('open');
      el.inert = true;
      el.setAttribute('aria-hidden', 'true');
      onClose?.();
    },
  };

  scrim.addEventListener('click', () => api.close());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current === api) api.close();
  });
  const top = el.querySelector('.sheet-top');
  if (top) {
    attachGestures(top, {
      onSwipe(dir) { if (dir === 'down') api.close(); },
    });
  }
  el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => api.close()));
  return api;
}
