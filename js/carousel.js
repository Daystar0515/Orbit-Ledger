// 橫向滑動選擇器：一次看到中間一張，左右滑動換下一個，滑到哪一張就選哪一張。
// 用瀏覽器原生的捲動貼齊（scroll-snap），手感和 iOS 一致。最後一張可以是「新增」。
//
// loop：無限循環。卡片會畫三份（前、中、後），停下來時如果在前或後那份，
// 就悄悄跳回中間那份的同一張，看起來就像可以一直滑下去。只有中間那份的卡片帶 data-id。

/**
 * @param {HTMLElement} root
 * @param {{onChange:(item:object|null)=>void, onAdd?:()=>void, addLabel?:string, label?:string, renderItem?:(item:object)=>Node}} opts
 *   renderItem：自訂卡片內容（例如搜尋頁的期間總額卡）
 *   loop：無限循環（預設關閉）
 */
export function createCarousel(root, { onChange, onAdd, addLabel = '新增', label = '', renderItem = null, loop = false }) {
  let items = [];
  let index = 0; // 邏輯上的第幾張（0～n-1）
  let copies = 1;
  let timer = 0;
  root.classList.add('carousel');
  root.setAttribute('role', 'listbox');
  if (label) root.setAttribute('aria-label', label);
  root.tabIndex = 0;

  const cards = () => [...root.querySelectorAll('.car-card')];

  function centerIndex() {
    const list = cards();
    if (!list.length) return 0;
    const mid = root.scrollLeft + root.clientWidth / 2;
    let best = 0;
    let bd = Infinity;
    list.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  const n = () => items.length;
  const logical = (p) => (n() ? p % n() : 0);
  const middle = (i) => (copies === 3 ? n() + i : i); // 邏輯第 i 張在中間那份的位置

  /** 標出畫面中間那張（用實際位置 p）。 */
  function mark(p) {
    cards().forEach((c, k) => {
      c.classList.toggle('on', k === p);
      c.setAttribute('aria-selected', String(k === p));
    });
  }

  function centerOn(p) {
    const c = cards()[p];
    if (!c) return;
    root.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - root.clientWidth / 2, behavior: 'instant' });
  }

  function settle() {
    let p = centerIndex();
    const i = logical(p);
    if (copies === 3 && p !== middle(i)) {
      // 滑到前或後那份：瞬間跳回中間那份的同一張（畫面看不出差別）
      p = middle(i);
      centerOn(p);
    }
    mark(p);
    if (i !== index) {
      index = i;
      onChange(items[i] || null);
    }
  }

  // 手指還在螢幕上時不要跳位置（不然 iPhone 上會抖一下），放開且捲動停下來後才算選定
  let touching = false;
  const later = () => {
    clearTimeout(root._t);
    root._t = setTimeout(() => { if (!touching) settle(); }, 110);
  };
  root.addEventListener('touchstart', () => { touching = true; }, { passive: true });
  const release = () => { touching = false; later(); };
  root.addEventListener('touchend', release, { passive: true });
  root.addEventListener('touchcancel', release, { passive: true });

  root.addEventListener('scroll', () => {
    cancelAnimationFrame(timer);
    timer = requestAnimationFrame(() => mark(centerIndex())); // 滑動中即時標出中間那張
    later();
  }, { passive: true });

  root.addEventListener('click', (e) => {
    const c = e.target.closest('.car-card');
    if (!c) return;
    const p = cards().indexOf(c);
    if (items[logical(p)] && items[logical(p)].add) { onAdd?.(); return; }
    scrollToPhysical(p, true);
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const p = middle(index) + dir;
      if (copies === 3) scrollToPhysical(p, true); // 循環：滑到隔壁那份，停下後再跳回中間
      else scrollToPhysical(Math.max(0, Math.min(n() - 1, p)), true);
    }
  });

  function scrollToPhysical(p, smooth) {
    const c = cards()[p];
    if (!c) return;
    root.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - root.clientWidth / 2, behavior: smooth ? 'smooth' : 'instant' });
    if (!smooth) { index = logical(p); mark(p); }
  }

  return {
    /**
     * @param {{id:string, name:string, color?:string, sub?:string, subTone?:string}[]} list
     * @param {string|null} selectId 要停在哪一張（找不到就停在第一張）
     */
    setItems(list, selectId) {
      items = [...list];
      if (onAdd) items.push({ id: '__add', name: `＋ ${addLabel}`, add: true });
      root.replaceChildren();
      copies = loop && items.length >= 3 ? 3 : 1;
      const all = copies === 3 ? [...items, ...items, ...items] : items;
      all.forEach((it, p) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `car-card${it.add ? ' add' : ''}`;
        if (copies === 1 || (p >= items.length && p < items.length * 2)) b.dataset.id = it.id;
        else { b.dataset.cid = it.id; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); } // 前後兩份是複本
        b.setAttribute('role', 'option');
        if (renderItem && !it.add) {
          b.appendChild(renderItem(it));
          root.appendChild(b);
          return;
        }
        if (it.color) {
          const dot = document.createElement('span');
          dot.className = 'cdot';
          dot.style.background = it.color;
          b.appendChild(dot);
        }
        const text = document.createElement('span');
        text.className = 'car-text';
        const nm = document.createElement('span');
        nm.className = 'car-name';
        nm.textContent = it.name;
        text.appendChild(nm);
        if (it.sub) {
          const sub = document.createElement('span');
          sub.className = `car-sub ${it.subTone || ''}`;
          sub.textContent = it.sub;
          text.appendChild(sub);
        }
        b.appendChild(text);
        root.appendChild(b);
      });
      const at = Math.max(0, items.findIndex((it) => it.id === selectId));
      index = at;
      // 版面算好後再定位，才量得到寬度
      requestAnimationFrame(() => scrollToPhysical(middle(at), false));
      mark(middle(at));
    },
    value: () => (items[index] && !items[index].add ? items[index] : null),
    select(id, smooth = true) {
      const i = items.findIndex((it) => it.id === id);
      if (i >= 0) scrollToPhysical(middle(i), smooth);
    },
    count: () => items.length,
    selectedId: () => (items[index] ? items[index].id : null),
  };
}
