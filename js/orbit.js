// 行星軌道視圖：圓環的另一種畫法（在設定裡切換）。
// 中央是太陽（中央文字顯示總額），每個類別是一顆行星：
//   - 行星大小代表金額，占比越大的越靠近太陽；
//   - 依克卜勒定律，內圈轉得快、外圈轉得慢，持續緩慢公轉；
//   - 進場時由大到小依序從太陽飛出，軌道從 12 點鐘方向順時針畫出來。
// 只在畫面看得到、沒有開著視窗時才轉動；系統開啟「減少動態效果」時完全靜止。

import { percentText } from './ring.js';

const NS = 'http://www.w3.org/2000/svg';
const CX = 140;
const CY = 140;
const R_IN = 88; // 最內圈軌道（中央要留給總額文字）
const R_OUT = 134; // 最外圈軌道
const BASE_PERIOD = 90; // 最內圈繞一圈的秒數
const GOLDEN = 137.508; // 黃金角：讓行星的起始位置錯開
const APPEAR_MS = 900;
const STAGGER_MS = 90;
const LABEL_MIN = 0.05;

let loop = null;
let current = null; // 目前畫面上的行星，給收縮動畫用
let collapse = null; // { t0, ms, dir, done }
let settleFrom = null; // 上一次收縮的方向：新畫面的太陽要從那個狀態恢復
let simT = 0; // 累計的「轉動時間」（秒）；重畫時不歸零，行星才不會跳位置

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * 換層級前的轉場：dir 'in' 讓整個星系收進太陽；'out' 讓行星向外飛散。
 * 動畫結束後 resolve，再由呼叫端畫出新資料（新的行星會從太陽或外圍飛回軌道）。
 */
export function collapseOrbit(dir = 'in', ms = 360) {
  if (!loop || !current || !current.svg.isConnected) return Promise.resolve();
  if (collapse) collapse.done();
  settleFrom = dir;
  // 切換支出／收入（'eclipse'）：行星在原地淡出，不再有月亮滑過太陽
  if (dir !== 'eclipse') current.svg.querySelector('.orbits')?.classList.add('fading');
  if (dir !== 'eclipse') current.svg.querySelector('.sun-glow')?.classList.add(dir === 'in' ? 'pulse' : 'dim');
  return new Promise((resolve) => {
    collapse = { t0: performance.now(), ms, dir, done: () => { collapse = null; resolve(); } };
  });
}

export function stopOrbit() {
  if (collapse) collapse.done();
  current = null;
  if (!loop) return;
  cancelAnimationFrame(loop.raf);
  clearTimeout(loop.timer);
  loop = null;
}

/** 每顆行星的軌道半徑、大小、起始角度與轉速（純計算，方便測試）。 */
export function layoutPlanets(segments) {
  const n = segments.length;
  return segments.map((seg, i) => {
    const r = n === 1 ? (R_IN + R_OUT) / 2 : R_IN + ((R_OUT - R_IN) * i) / (n - 1);
    const size = 4.5 + 11.5 * Math.sqrt(seg.fraction); // 面積大致和金額成正比
    const period = BASE_PERIOD * (r / R_IN) ** 1.5;
    return {
      seg,
      r,
      size,
      a0: (-90 + i * GOLDEN) * (Math.PI / 180), // 最大的從正上方出發
      omega: (2 * Math.PI) / period,
      delay: i * STAGGER_MS,
    };
  });
}

// 固定亂數，星星每次都在同樣位置
function* stars(seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 34; i += 1) yield { x: -6 + rnd() * 292, y: -6 + rnd() * 292, r: 0.5 + rnd() * 0.9, tw: rnd() < 0.3, d: rnd() * 4 };
}

/**
 * 畫行星軌道。參數與 renderRing 相同，另外：
 * @param {{tint:string, reduce:boolean, isPaused:()=>boolean}} opts
 */
export function renderOrbit(svg, data, opts) {
  const { selectedId, animate, formatMoney, tint, reduce, isPaused, from = 'in' } = opts;
  stopOrbit();
  svg.replaceChildren();

  // ---- 共用的漸層 ----
  const defs = el('defs');
  const glow = el('radialGradient', { id: 'sun-glow' });
  glow.append(
    el('stop', { offset: '0%', 'stop-color': tint, 'stop-opacity': 0.3 }),
    el('stop', { offset: '55%', 'stop-color': tint, 'stop-opacity': 0.1 }),
    el('stop', { offset: '100%', 'stop-color': tint, 'stop-opacity': 0 }),
  );
  const shade = el('radialGradient', { id: 'planet-shade', cx: '35%', cy: '30%', r: '75%' });
  shade.append(
    el('stop', { offset: '0%', 'stop-color': '#fff', 'stop-opacity': 0.55 }),
    el('stop', { offset: '45%', 'stop-color': '#fff', 'stop-opacity': 0 }),
    el('stop', { offset: '100%', 'stop-color': '#000', 'stop-opacity': 0.28 }),
  );
  defs.append(glow, shade);
  svg.appendChild(defs);

  // ---- 星空與太陽 ----
  const sky = el('g', { class: 'stars', 'aria-hidden': 'true' });
  for (const st of stars()) {
    const c = el('circle', { cx: st.x.toFixed(1), cy: st.y.toFixed(1), r: st.r.toFixed(2), class: st.tw ? 'star tw' : 'star' });
    if (st.tw) c.style.animationDelay = `${st.d.toFixed(2)}s`;
    sky.appendChild(c);
  }
  svg.appendChild(sky);
  const sun = el('circle', { class: `sun-glow${settleFrom ? ` settle-${settleFrom}` : ''}`, cx: CX, cy: CY, r: 84, fill: 'url(#sun-glow)' });
  settleFrom = null;
  svg.appendChild(sun);

  const planets = layoutPlanets(data.segments);

  // ---- 軌道線（從正上方順時針畫出） ----
  const orbits = el('g', { class: 'orbits', transform: `rotate(-90 ${CX} ${CY})` });
  const orbitRadii = planets.length ? planets.map((p) => p.r) : [R_IN, (R_IN + R_OUT) / 2, R_OUT];
  orbitRadii.forEach((r, i) => {
    const c = el('circle', { class: `orbit-line${animate ? ' draw' : ''}`, cx: CX, cy: CY, r, fill: 'none', pathLength: 100, 'stroke-dasharray': 100, 'stroke-dashoffset': 0 });
    if (animate) c.style.animationDelay = `${i * STAGGER_MS}ms`;
    orbits.appendChild(c);
  });
  svg.appendChild(orbits);
  if (data.total <= 0) return;

  // ---- 行星 ----
  const layer = el('g', { class: 'planets' });
  const nodes = planets.map((p) => {
    const { seg } = p;
    const dim = selectedId && selectedId !== seg.id;
    const g = el('g', {
      class: `seg planet${dim ? ' dim' : ''}${selectedId === seg.id ? ' sel' : ''}`,
      'data-id': seg.id,
      tabindex: 0,
      role: 'button',
      'aria-label': `${seg.name} ${percentText(seg.fraction)}，${formatMoney(seg.amount)}`,
    });
    const body = el('g', { class: 'planet-body' });
    body.append(
      el('circle', { r: Math.max(p.size + 9, 17), fill: 'transparent' }), // 放大點擊範圍
      el('circle', { r: p.size, fill: seg.color }),
      el('circle', { r: p.size, fill: 'url(#planet-shade)', 'pointer-events': 'none' }),
    );
    if (selectedId === seg.id) body.appendChild(el('circle', { class: 'halo', r: p.size + 5, fill: 'none', stroke: seg.color }));
    g.appendChild(body);
    let label = null;
    if (seg.fraction >= LABEL_MIN || selectedId === seg.id) {
      label = el('text', { class: 'pct', y: -(p.size + 9), 'text-anchor': 'middle', 'dominant-baseline': 'auto' });
      label.textContent = percentText(seg.fraction);
      g.appendChild(label);
    }
    layer.appendChild(g);
    return { p, g, body, label };
  });
  svg.appendChild(layer);

  const ease = (t) => 1 - (1 - t) ** 3;
  const start = performance.now();

  const easeIn = (t) => t * t * t;

  function place(now) {
    const since = now - start;
    let busy = false;
    // 收縮轉場進行中：c 從 0 到 1
    let c = 0;
    if (collapse) {
      c = easeIn(Math.min(1, (now - collapse.t0) / collapse.ms));
      busy = true;
    }
    const out = collapse && collapse.dir === 'out';
    const ecl = collapse && collapse.dir === 'eclipse';
    for (const { p, g, body, label } of nodes) {
      const k = animate ? ease(Math.min(1, Math.max(0, (since - p.delay) / APPEAR_MS))) : 1;
      if (k < 1) busy = true;
      // 進場：從太陽（in）或從外圍（out）回到軌道；收縮：反過來
      let rf = from === 'out' ? 2.3 - 1.3 * k : from === 'eclipse' ? 1 : k;
      let sc = from === 'eclipse' ? 0.7 + 0.3 * k : 0.2 + 0.8 * k;
      let op = from === 'out' || from === 'eclipse' ? k : 1;
      if (c > 0 && ecl) {
        sc *= 1 - 0.3 * c;
        op *= 1 - c;
      } else if (c > 0) {
        rf *= out ? 1 + 1.3 * c : 1 - c;
        sc *= out ? 1 - 0.4 * c : 1 - 0.8 * c;
        op *= out ? 1 - c : 1 - 0.6 * c;
      }
      const a = p.a0 + p.omega * simT;
      const x = CX + p.r * rf * Math.cos(a);
      const y = CY + p.r * rf * Math.sin(a);
      g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      body.setAttribute('transform', `scale(${sc.toFixed(3)})`);
      g.style.opacity = op < 1 ? op.toFixed(3) : '';
      if (label) label.style.opacity = String(c > 0 ? Math.max(0, k - 2 * c) : k);
    }
    if (collapse && c >= 1) collapse.done();
    return busy;
  }

  current = { svg, tint };
  if (reduce) { place(start + 1e6); return; }

  loop = { raf: 0, timer: 0 };
  let last = performance.now();
  const tick = (now) => {
    if (!loop || !svg.isConnected) { stopOrbit(); return; }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const paused = isPaused && isPaused();
    if (!paused) simT += dt;
    const busy = place(now);
    if (paused && !busy) {
      // 有視窗蓋著時不需要轉：改成每 0.4 秒看一次，省電
      loop.timer = setTimeout(() => { last = performance.now(); loop && (loop.raf = requestAnimationFrame(tick)); }, 400);
      return;
    }
    loop.raf = requestAnimationFrame(tick);
  };
  place(start);
  loop.raf = requestAnimationFrame(tick);
}
