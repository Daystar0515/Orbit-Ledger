// 圓環繪製：純 SVG。把類別金額轉成弧段與百分比。

const NS = 'http://www.w3.org/2000/svg';
const CX = 140;
const CY = 140;
const R = 92;
const SW = 24;
const C = 2 * Math.PI * R;
const GAP = 3; // 弧段之間的間隙（SVG 單位）
const MERGE_BELOW = 0.03; // 低於 3% 的類別合併成「其他」（僅顯示用）
const LABEL_MIN = 0.05; // 低於 5% 的弧段不標百分比，點擊後才看得到

export const OTHER_COLOR = '#9AA0A6';

/** 整理成圓環要畫的弧段：過濾 0、由大到小排序、合併過小的類別、算出占比。 */
export function buildSegments(items) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  if (total <= 0) return { total: 0, segments: [] };

  const sorted = items.filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount);
  const main = [];
  let otherAmount = 0;
  let otherCount = 0;
  for (const it of sorted) {
    if (it.amount / total < MERGE_BELOW && sorted.length > 1) {
      otherAmount += it.amount;
      otherCount += 1;
    } else {
      main.push(it);
    }
  }
  const segments = main.map((it) => ({ ...it, fraction: it.amount / total }));
  if (otherAmount > 0) {
    // 只有一個小類別時不需要改名，直接用它自己的資訊。
    const only = otherCount === 1 ? sorted.find((i) => i.amount / total < MERGE_BELOW) : null;
    segments.push(
      only
        ? { ...only, fraction: only.amount / total }
        : { id: 'other', name: '其他', color: OTHER_COLOR, amount: otherAmount, fraction: otherAmount / total },
    );
  }
  return { total, segments };
}

export function percentText(fraction) {
  const p = fraction * 100;
  if (p < 1) return '<1%';
  return `${Math.round(p)}%`;
}

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const SWEEP_MS = 900; // 圓環從 12 點鐘方向順時針填滿所需的時間

/**
 * 重畫圓環。
 * 弧段由大到小、從正上方（12 點鐘）開始順時針排列；animate 時，用一個遮罩
 * 從同一個起點順時針掃過一圈，所以最大的類別先出現，最小的（或「其他」）最後出現。
 * @param {SVGElement} svg
 * @param {{total:number, segments:object[]}} data buildSegments 的結果
 * @param {{selectedId:string|null, animate:boolean, formatMoney:(n:number)=>string}} opts
 */
export function renderRing(svg, data, opts) {
  const { selectedId, animate, formatMoney } = opts;
  svg.replaceChildren();

  svg.appendChild(el('circle', { class: 'track', cx: CX, cy: CY, r: R, fill: 'none', 'stroke-width': SW }));
  if (data.total <= 0) return;

  // 遮罩畫在旋轉後的座標裡：圓的路徑從 3 點鐘順時針走，旋轉 -90° 後就是從 12 點鐘開始。
  const defs = el('defs');
  const mask = el('mask', { id: 'ring-sweep', maskUnits: 'userSpaceOnUse', x: -40, y: -40, width: 360, height: 360 });
  mask.appendChild(el('circle', {
    class: `sweep${animate ? ' play' : ''}`,
    cx: CX,
    cy: CY,
    r: R,
    fill: 'none',
    stroke: '#fff',
    'stroke-width': SW + 12,
    pathLength: 100,
    'stroke-dasharray': 100,
    'stroke-dashoffset': 0,
  }));
  defs.appendChild(mask);
  svg.appendChild(defs);

  const g = el('g', { transform: `rotate(-90 ${CX} ${CY})`, mask: 'url(#ring-sweep)' });
  const labels = el('g', { class: 'labels' });
  const multiple = data.segments.length > 1;
  let acc = 0;

  data.segments.forEach((seg) => {
    const len = seg.fraction * C;
    const gap = multiple ? GAP : 0;
    const dash = Math.max(len - gap, 0.5);
    const circle = el('circle', {
      class: `seg${selectedId && selectedId !== seg.id ? ' dim' : ''}`,
      'data-id': seg.id,
      cx: CX,
      cy: CY,
      r: R,
      fill: 'none',
      stroke: seg.color,
      'stroke-width': SW,
      'stroke-dasharray': `${dash} ${C - dash}`,
      'stroke-dashoffset': -(acc + gap / 2),
      tabindex: 0,
      role: 'button',
      'aria-label': `${seg.name} ${percentText(seg.fraction)}，${formatMoney(seg.amount)}`,
    });
    g.appendChild(circle);

    if (seg.fraction >= LABEL_MIN) {
      const mid = acc + len / 2;
      const angle = (mid / C) * 2 * Math.PI - Math.PI / 2;
      const rr = R + SW / 2 + 16;
      const text = el('text', {
        class: `pct${selectedId && selectedId !== seg.id ? ' dim' : ''}${animate ? ' pct-in' : ''}`,
        x: CX + rr * Math.cos(angle),
        y: CY + rr * Math.sin(angle),
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      // 百分比等掃過自己的弧段中點才浮現（掃描是等速的，所以延遲 = 位置 × 總時間）。
      if (animate) text.style.animationDelay = `${Math.round((mid / C) * SWEEP_MS)}ms`;
      text.textContent = percentText(seg.fraction);
      labels.appendChild(text);
    }
    acc += len;
  });

  svg.appendChild(g);
  svg.appendChild(labels);
}
