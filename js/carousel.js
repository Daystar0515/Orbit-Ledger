// 橫向滑動選擇器：一次看到中間一張，左右滑動換下一個，滑到哪一張就選哪一張。
// 用瀏覽器原生的捲動貼齊（scroll-snap），手感和 iOS 一致。最後一張可以是「新增」。

/**
 * @param {HTMLElement} root
 * @param {{onChange:(item:object|null)=>void, onAdd?:()=>void, addLabel?:string, label?:string}} opts
 */
export function createCarousel(root, { onChange, onAdd, addLabel = '新增', label = '' }) {
  let items = [];
  let index = 0;
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

  function mark(i) {
    cards().forEach((c, k) => {
      c.classList.toggle('on', k === i);
      c.setAttribute('aria-selected', String(k === i));
    });
  }

  function settle() {
    const i = centerIndex();
    mark(i);
    if (i !== index) {
      index = i;
      onChange(items[i] || null);
    }
  }

  root.addEventListener('scroll', () => {
    cancelAnimationFrame(timer);
    timer = requestAnimationFrame(() => mark(centerIndex())); // 滑動中即時標出中間那張
    clearTimeout(root._t);
    root._t = setTimeout(settle, 90); // 停下來才算選定
  }, { passive: true });

  root.addEventListener('click', (e) => {
    const c = e.target.closest('.car-card');
    if (!c) return;
    const i = cards().indexOf(c);
    if (items[i] && items[i].add) { onAdd?.(); return; }
    scrollToIndex(i, true);
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      scrollToIndex(Math.max(0, Math.min(items.length - 1, index + (e.key === 'ArrowRight' ? 1 : -1))), true);
    }
  });

  function scrollToIndex(i, smooth) {
    const c = cards()[i];
    if (!c) return;
    root.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - root.clientWidth / 2, behavior: smooth ? 'smooth' : 'instant' });
    if (!smooth) { index = i; mark(i); }
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
      items.forEach((it) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `car-card${it.add ? ' add' : ''}`;
        b.dataset.id = it.id;
        b.setAttribute('role', 'option');
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
      requestAnimationFrame(() => scrollToIndex(at, false));
      mark(at);
    },
    value: () => (items[index] && !items[index].add ? items[index] : null),
    select(id, smooth = true) {
      const i = items.findIndex((it) => it.id === id);
      if (i >= 0) scrollToIndex(i, smooth);
    },
    count: () => items.length,
  };
}
