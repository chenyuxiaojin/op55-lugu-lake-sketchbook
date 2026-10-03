// 泸沽湖:一根墨线就是湖岸。灯火小镇 → 墨夜 → 倒影 → 船 → 对岸 → 灯光回到字里。
// 每帧只由帧号决定:无实时计时、无 Math.random,随机性全部来自整数哈希。
export const W = 1080;
export const H = 1440;
export const FPS = 30;
const AUDIO_END = 27.5;
const TAIL = 0.7;
const SUB = 4;
const FONT = '"LXGW WenKai"';
const HOR = 860; // 湖岸线(世界坐标 y)

const C = {
  paper: '#F3ECDF',
  ink: '#232A45',
  night: '#1B2140',
  amber: '#F2A541',
  amberDeep: '#D9772B',
  cream: '#F7EEDC',
};

// ---------- 数学 ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, u) => a + (b - a) * u;
const R = (t, a, b) => clamp((t - a) / (b - a));
const eo3 = (p) => 1 - Math.pow(1 - clamp(p), 3);
const eo4 = (p) => 1 - Math.pow(1 - clamp(p), 4);
const ei3 = (p) => Math.pow(clamp(p), 3);
const eio = (p) => {
  p = clamp(p);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
};
const backOut = (p, s = 1.70158) => {
  p = clamp(p) - 1;
  return 1 + (s + 1) * p * p * p + s * p * p;
};
const springy = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.exp(-6 * p) * Math.cos(5 * p));
const TAU = Math.PI * 2;

function hash3(a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x3c6ef372, 0x165667b1) ^ Math.imul((c | 0) + 0x5bd1e995, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, s, k) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash3(i, s, k), hash3(i + 1, s, k), u);
}
const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
function rgba(hex, a) {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${clamp(a)})`;
}
function mix(a, b, u, al = 1) {
  const A = hexRgb(a), B = hexRgb(b);
  u = clamp(u);
  return `rgba(${Math.round(lerp(A[0], B[0], u))},${Math.round(lerp(A[1], B[1], u))},${Math.round(lerp(A[2], B[2], u))},${clamp(al)})`;
}

// ---------- 几何 ----------
function densify(pts, step = 6) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([lerp(ax, bx, k / n), lerp(ay, by, k / n)]);
  }
  return out;
}
function catmull(ctrl, steps = 14) {
  const n = ctrl.length;
  const get = (i) => ctrl[clamp(i, 0, n - 1)];
  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < steps; s++) {
      const u = s / steps, u2 = u * u, u3 = u2 * u;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([...ctrl[n - 1]]);
  return out;
}
function cumLen(pts) {
  const L = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) L[i] = L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}
function pointAt(pts, L, p) {
  const s = L[L.length - 1] * clamp(p);
  let lo = 1, hi = L.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (L[m] < s) lo = m + 1;
    else hi = m;
  }
  const i = lo;
  const u = (s - L[i - 1]) / (L[i] - L[i - 1] || 1);
  return [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)];
}
function arc(cx, cy, r, a0, a1, step = 5) {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / step));
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = lerp(a0, a1, k / n);
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
function quad(a, c, b, n = 40) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    out.push([(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]]);
  }
  return out;
}

// ---------- 画笔 ----------
let VIEW = { x0: -1e9, x1: 1e9 };
// 手绘线:沿弧长的低频噪声抖动,boil 每 2 帧换一次;两端收尖;可画区间 [p0, p]。
// colorAt(x,y) 可按位置换色(墨夜前沿经过时由墨色变月白)。
function line(g, pts, o) {
  const p = o.p ?? 1;
  const p0 = o.p0 ?? 0;
  if (p <= p0 || pts.length < 2) return;
  const w = o.w ?? 3, amp = o.amp ?? 1.3, seed = o.seed ?? 1, boil = o.boil ?? 0;
  const taper = o.taper ?? true;
  const L = o.L || cumLen(pts);
  const tot = L[L.length - 1];
  const end = tot * clamp(p), beg = tot * clamp(p0);
  g.save();
  g.globalAlpha *= o.alpha ?? 1;
  if (o.op) g.globalCompositeOperation = o.op;
  g.lineCap = 'round';
  if (!o.colorAt) g.strokeStyle = o.color;
  let px = 0, py = 0, ps = 0, started = false;
  for (let i = 0; i < pts.length; i++) {
    let s = L[i], x = pts[i][0], y = pts[i][1];
    if (s < beg) continue;
    if (s > end) {
      const u = (end - L[i - 1]) / (s - L[i - 1] || 1);
      x = lerp(pts[i - 1][0], x, u);
      y = lerp(pts[i - 1][1], y, u);
      s = end;
    }
    x += (vnoise(s / 55 + seed * 3.1, seed, boil) - 0.5) * 2 * amp;
    y += (vnoise(s / 55 + seed * 5.7, seed + 17, boil) - 0.5) * 2 * amp;
    if (started && !(Math.max(px, x) < VIEW.x0 || Math.min(px, x) > VIEW.x1)) {
      const sm = (ps + s) / 2;
      const tp = taper ? Math.min(1, 0.3 + Math.min(sm - beg, end - sm) / (o.taperLen ?? 22)) : 1;
      g.lineWidth = w * tp * (0.8 + 0.4 * vnoise(sm / 38, seed + 3, 0));
      if (o.colorAt) g.strokeStyle = o.colorAt(x, y);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(x, y);
      g.stroke();
    }
    px = x; py = y; ps = s; started = true;
    if (s >= end) break;
  }
  g.restore();
  if (o.ghost) line(g, pts, { ...o, L, seed: seed + 101, w: w * 0.45, alpha: (o.alpha ?? 1) * 0.35, amp: amp * 1.8, ghost: false });
}
function blobPath(g, cx, cy, r, seed, amp = 1) {
  const ph = [1, 2, 3, 4].map((k) => hash3(seed, k, 9) * TAU);
  const N = 120;
  g.beginPath();
  for (let k = 0; k <= N; k++) {
    const a = (k / N) * TAU;
    const rr = r * (1 + amp * (0.07 * Math.sin(3 * a + ph[0]) + 0.05 * Math.sin(5 * a + ph[1]) + 0.03 * Math.sin(11 * a + ph[2]) + 0.015 * Math.sin(23 * a + ph[3])));
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (k === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}
function glow(g, x, y, r, col, a) {
  if (a <= 0 || r <= 0) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, a));
  gr.addColorStop(0.35, rgba(col, a * 0.45));
  gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

// ---------- 湖岸线(全片唯一的那根线) ----------
const HOUSES = [];
const SHORE = (() => {
  const P = [[-420, HOR]];
  let x = -360, k = 0;
  while (x < 1180) {
    const w = 120 + hash3(k, 1, 1) * 110;
    const h = 110 + hash3(k, 2, 1) * 150;
    const gap = 14 + hash3(k, 3, 1) * 30;
    if (hash3(k, 4, 1) < 0.24) {
      const r = 40 + hash3(k, 5, 1) * 36;
      const lift = r * (0.9 + hash3(k, 6, 1) * 0.9);
      // 柏树:树干 + 火苗形树冠
      catmull([[x + r - 5, HOR], [x + r - 4, HOR - lift * 0.45], [x + r * 0.1, HOR - lift * 0.6], [x + r * 0.35, HOR - lift - r * 0.7], [x + r, HOR - lift - r * 1.7], [x + r * 1.65, HOR - lift - r * 0.7], [x + r * 1.9, HOR - lift * 0.6], [x + r + 4, HOR - lift * 0.45], [x + r + 5, HOR]], 8).forEach((p) => P.push(p));
      x += 2 * r + gap;
    } else {
      const wall = HOR - h * 0.56, peak = HOR - h;
      P.push([x, HOR], [x, wall], [x - 14, wall + 7], [x + w / 2, peak], [x + w + 14, wall + 7], [x + w, wall], [x + w, HOR]);
      HOUSES.push({ x, w, h, peak: [x + w / 2, peak], win: [x + w / 2, HOR - h * 0.3] });
      x += w + gap;
    }
    k++;
  }
  P.push([2440, HOR]);
  catmull([[2440, HOR], [2600, HOR - 110], [2760, HOR - 290], [2900, HOR - 400], [3030, HOR - 335], [3160, HOR - 250], [3320, HOR - 120], [3520, HOR - 40], [3760, HOR]], 18).forEach((p) => P.push(p));
  P.push([4200, HOR]);
  return densify(P, 6);
})();
const SHORE_L = cumLen(SHORE);
const SHORE_TOT = SHORE_L[SHORE_L.length - 1];
const S1600 = SHORE_L[SHORE.findIndex((p) => p[0] > 1600)];
const MOUNTAIN = SHORE.filter((p) => p[0] >= 2440 && p[0] <= 3760);
function shoreProgress(t) {
  const a = (0.2 + 0.8 * eo3(R(t, -0.25, 2.6))) * S1600;
  const b = eio(R(t, 17.25, 19.35)) * (SHORE_TOT - S1600);
  return (a + b) / SHORE_TOT;
}

// 灯:窗灯(第一句)+ 灯笼(第二句)
const LIGHTS = [];
HOUSES.forEach((h, i) => LIGHTS.push({ kind: 'win', x: h.win[0], y: h.win[1], i }));
const STRINGS = [];
for (let i = 0; i + 1 < HOUSES.length; i++) {
  const a = HOUSES[i].peak, b = HOUSES[i + 1].peak;
  if (b[0] - a[0] > 430) continue;
  const A = [a[0] + 6, a[1] + 16], B = [b[0] - 6, b[1] + 16];
  const Cc = [(A[0] + B[0]) / 2, Math.max(A[1], B[1]) + 46];
  const pts = quad(A, Cc, B, 24);
  STRINGS.push({ pts, L: cumLen(pts), k: STRINGS.length });
  [0.28, 0.52, 0.76].forEach((u) => {
    const [x, y] = pointAt(pts, cumLen(pts), u);
    LIGHTS.push({ kind: 'lantern', x, y: y + 12, hang: [x, y] });
  });
}
const WINS = LIGHTS.filter((l) => l.kind === 'win').filter((l) => l.x > -80 && l.x < 1160);
const LANTERNS = LIGHTS.filter((l) => l.kind === 'lantern').sort((a, b) => a.x - b.x);
const C1_TIMES = [2.56, 3.0, 3.7, 4.0];
WINS.sort((a, b) => a.x - b.x).forEach((l, i) => {
  const c = Math.min(3, Math.floor((i * 4) / WINS.length));
  l.tOn = C1_TIMES[c] + 0.04 + (i % 3) * 0.05;
});
LANTERNS.forEach((l, j) => (l.tOn = 6.14 + (j / Math.max(1, LANTERNS.length - 1)) * 0.78));

// 墨夜:从"黑暗"二字涌出
const FLOOD_C = [470, 560];
const floodR = (t) => (t < 7.98 ? 0 : 1350 * eo3(R(t, 7.98, 9.1)) + 2700 * R(t, 9.1, 16.5));
const darkAt = (x, y, t) => {
  const r = floodR(t);
  if (r <= 0) return 0;
  return clamp((r - Math.hypot(x - FLOOD_C[0], y - FLOOD_C[1])) / 140);
};
LIGHTS.forEach((l) => {
  const d = Math.hypot(l.x - FLOOD_C[0], l.y - FLOOD_C[1]);
  let a = 7.98, b = 17;
  for (let k = 0; k < 40; k++) {
    const m = (a + b) / 2;
    if (floodR(m) >= d) b = m;
    else a = m;
  }
  l.tOff = b;
});
const inkCol = (t) => (x, y) => mix(C.ink, C.cream, darkAt(x, y, t));

// 水波纹(次级动作)
const RIPPLES = Array.from({ length: 90 }, (_, i) => {
  const d = hash3(i, 1, 7);
  return {
    x: -300 + hash3(i, 2, 7) * 3900,
    y: HOR + 18 + Math.pow(d, 1.5) * 560,
    len: 26 + 120 * d + 30 * hash3(i, 3, 7),
    d,
    per: 2.4 + hash3(i, 4, 7) * 2.2,
    ph: hash3(i, 5, 7),
    i,
  };
});
const STARS = Array.from({ length: 64 }, (_, i) => ({
  u: -320 + hash3(i, 1, 8) * 2300,
  y: 70 + Math.pow(hash3(i, 2, 8), 1.3) * 640,
  r: 1.4 + hash3(i, 3, 8) * 2.4,
  t: 8.7 + hash3(i, 4, 8) * 2.4,
  ph: hash3(i, 5, 8) * TAU,
  i,
}));

// 船
const boatX = (t) => 380 + 175 * (t - 13) + 320 * ei3(R(t, 16.9, 18.4));
const boatY = (t) => 912 + 3 * Math.sin(2.2 * t);
const HULL = catmull([[-168, -10], [-90, -2], [0, 2], [100, -3], [176, -18], [150, 4], [60, 16], [-60, 16], [-150, 6], [-168, -10]], 8);
const FIGURE_AT = [2470, HOR];

// ---------- 文字 ----------
const RUNS = {
  c1: { cue: 0, x: 130, y: 430, parts: [{ s: '灯光', size: 190, w: 700, col: 'amberDeep' }, { s: '灿烂', size: 190, w: 700, col: 'ink' }], times: C1_TIMES },
  c2a: { cue: 1, x: 150, y: 272, parts: [{ s: '灯火', size: 120, w: 700, col: 'amberDeep' }, { s: '辉煌', size: 120, w: 400, col: 'ink' }], times: [6.14, 6.32, 6.62, 6.85] },
  c2b: { cue: 1, x: 160, y: 404, parts: [{ s: '而我想要', size: 84, w: 400, col: 'ink' }], times: [7.0, 7.12, 7.26, 7.4] },
  c2c: { cue: 1, x: 138, y: 682, parts: [{ s: '黑暗', size: 300, w: 700, col: 'ink' }], times: [7.52, 7.7] },
  c3: { cue: 2, x: 330, y: 560, parts: [{ s: '都是一样', size: 140, w: 400, col: 'cream' }], times: [11.24, 11.45, 11.68, 11.88] },
  c4a: { cue: 3, x: 360, y: 1010, parts: [{ s: '来时的时光', size: 92, w: 400, col: 'cream' }], times: [13.64, 13.95, 14.3, 14.6, 15.0] },
  c4b: { cue: 3, x: 440, y: 1122, parts: [{ s: '随意把它遗忘', size: 78, w: 400, col: 'cream' }], times: [15.4, 15.65, 15.95, 16.25, 16.5, 16.8] },
  c5: { cue: 4, x: 2120, y: 330, parts: [{ s: '站在湖水', size: 100, w: 400, col: 'cream' }], times: [19.68, 19.76, 19.86, 19.96] },
  c6: { cue: 5, x: 2110, y: 610, parts: [{ s: '对岸', size: 260, w: 700, col: 'amber' }], times: [20.72, 20.92] },
  c7: { cue: 6, x: 2285, y: 1190, parts: [{ s: '总有些过往', size: 128, w: 700, col: 'amber' }], times: [24.02, 24.3, 24.9, 25.55, 25.85] },
};
const layoutCache = new Map();
function layoutRun(g, run) {
  if (layoutCache.has(run)) return layoutCache.get(run);
  const chars = [];
  let x = run.x, k = 0;
  for (const part of run.parts) {
    g.font = `${part.w} ${part.size}px ${FONT}`;
    for (const ch of [...part.s]) {
      const adv = g.measureText(ch).width;
      chars.push({ ch, x, y: run.y, adv, part, t: run.times[k], k });
      x += adv;
      k++;
    }
  }
  layoutCache.set(run, chars);
  return chars;
}
const colOf = (name, x, y, t) => (name === 'ink' ? mix(C.ink, C.cream, darkAt(x, y, t)) : C[name]);

// 逐字写出:从左往右遮罩揭示 + 轻微落位
function drawChar(g, c, t, boil, alpha, extra = {}) {
  const p = R(t, c.t, c.t + (extra.dur ?? 0.18));
  if (p <= 0 || alpha <= 0) return;
  const sz = c.part.size;
  const jx = (hash3(c.k, boil, 41) - 0.5) * 1.4, jy = (hash3(c.k, boil, 42) - 0.5) * 1.4;
  const jr = (hash3(c.k, boil, 43) - 0.5) * 0.012;
  g.save();
  g.globalAlpha *= alpha;
  g.font = `${c.part.w} ${sz}px ${FONT}`;
  g.fillStyle = extra.color || colOf(c.part.col, c.x + c.adv / 2, c.y - sz * 0.4, t);
  g.beginPath();
  g.rect(c.x - 10, c.y - sz * 1.15, (c.adv + 20) * eo3(p), sz * 1.6);
  g.clip();
  g.translate(c.x + jx + (extra.dx || 0), c.y + jy + (1 - backOut(p, 2)) * sz * 0.08 + (extra.dy || 0));
  g.rotate(jr);
  g.fillText(c.ch, 0, 0);
  g.restore();
}
// 水面上的字:横向切成细条,每条按正弦错开 → 波纹;flip = 倒影
function drawWaterChar(g, c, t, alpha, amp, color, flip = false, reveal = 1) {
  if (alpha <= 0 || reveal <= 0) return;
  const sz = c.part.size;
  const top = flip ? 2 * HOR - c.y - sz * 0.25 : c.y - sz * 0.95;
  const hgt = sz * 1.25;
  const strip = 6;
  g.save();
  g.globalAlpha *= alpha;
  g.font = `${c.part.w} ${sz}px ${FONT}`;
  g.fillStyle = color;
  for (let y = top; y < top + hgt; y += strip) {
    const off = amp * Math.sin(y * 0.09 - t * 4.2 + c.k) + amp * 0.5 * Math.sin(y * 0.031 + t * 2.3);
    g.save();
    g.beginPath();
    g.rect(c.x - 20, y, (c.adv + 40) * reveal, strip + 0.6);
    g.clip();
    if (flip) {
      g.translate(off, 2 * HOR);
      g.scale(1, -1);
      g.fillText(c.ch, c.x, c.y);
    } else g.fillText(c.ch, c.x + off, c.y);
    g.restore();
  }
  g.restore();
}

// 字 → 光点:取字形像素
function sampleChar(c, step, keep) {
  const sz = c.part.size;
  const S = Math.ceil(sz * 1.5);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.font = `${c.part.w} ${sz}px ${FONT}`;
  g.fillStyle = '#000';
  g.fillText(c.ch, sz * 0.25, sz * 1.15);
  const d = g.getImageData(0, 0, S, S).data;
  const out = [];
  for (let y = 0; y < S; y += step) {
    for (let x = 0; x < S; x += step) {
      if (d[(y * S + x) * 4 + 3] > 140 && hash3(x, y, c.k + 900) < keep) out.push([c.x + x - sz * 0.25, c.y + y - sz * 1.15]);
    }
  }
  return out;
}
let P1 = null, P7 = null;
function buildParticles(g) {
  if (P1) return;
  P1 = [];
  layoutRun(g, RUNS.c1).forEach((c) => {
    sampleChar(c, 7, 0.55).forEach((s, n) => {
      const id = P1.length;
      const L = LANTERNS[id % LANTERNS.length];
      const dur = 0.85 + hash3(id, 1, 60) * 0.45;
      P1.push({ s, L, k: c.k, dur, t1: L.tOn + hash3(id, 2, 60) * 0.06, lift: 60 + hash3(id, 3, 60) * 170, id });
    });
  });
  P7 = [];
  layoutRun(g, RUNS.c7).forEach((c) => {
    sampleChar(c, 8, 0.6).forEach((tg) => {
      const id = P7.length;
      P7.push({
        tg, c,
        home: [2050 + hash3(id, 1, 70) * 1150, HOR + 40 + Math.pow(hash3(id, 2, 70), 0.8) * 520],
        tIn: 21.6 + hash3(id, 3, 70) * 2.0,
        t0: c.t - 0.38 + hash3(id, 4, 70) * 0.16,
        dur: 0.45 + hash3(id, 5, 70) * 0.25,
        ph: hash3(id, 6, 70) * TAU,
        id,
      });
    });
  });
  // 额外的漂浮光点:不进字,留在湖面当余光
  for (let i = 0; i < 70; i++) {
    P7.push({ tg: null, home: [2050 + hash3(i, 1, 71) * 1150, HOR + 30 + Math.pow(hash3(i, 2, 71), 0.8) * 540], tIn: 21.6 + hash3(i, 3, 71) * 2.4, ph: hash3(i, 6, 71) * TAU, id: 5000 + i });
  }
}

// ---------- 状态 ----------
let cues = [];
let totalFrames = 1;
let sub, subG, acc, accG, paperPat, grainTiles = [], grainPats = null;

export function init(parsed) {
  cues = parsed;
  for (let ci = 0; ci < cues.length; ci++) {
    const joined = Object.values(RUNS).filter((r) => r.cue === ci).map((r) => r.parts.map((p) => p.s).join('')).join('');
    if (joined !== cues[ci].text.replace(/\s+/g, '')) throw new Error(`字幕 ${ci + 1} 与排版不一致: ${joined} ≠ ${cues[ci].text}`);
  }
  const lastEnd = cues.length ? cues[cues.length - 1].endMs / 1000 : 26.18;
  totalFrames = Math.ceil((Math.max(lastEnd, AUDIO_END) + TAIL) * FPS);
  setupCanvases();
  return { totalFrames, cues: cues.length };
}
export function allText() {
  return cues.map((c) => c.text).join('');
}
function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function setupCanvases() {
  if (typeof document === 'undefined' || sub) return;
  sub = mk(W, H);
  subG = sub.getContext('2d');
  acc = mk(W, H);
  accG = acc.getContext('2d');
  paperPat = subG.createPattern(makePaper(), 'repeat');
  for (let k = 0; k < 4; k++) grainTiles.push(makeGrain(k));
}
function vn2(x, y, cell, seed, S) {
  const P = S / cell;
  const gx = x / cell, gy = y / cell;
  const ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = gx - ix, fy = gy - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash3(((a % P) + P) % P, ((b % P) + P) % P, seed);
  return lerp(lerp(h(ix, iy), h(ix + 1, iy), ux), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), ux), uy);
}
function makePaper() {
  const S = 1024;
  const c = mk(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = 0.45 * vn2(x, y, 128, 1, S) + 0.33 * vn2(x, y, 32, 2, S) + 0.22 * hash3(x, y, 3) - 0.5;
      const i = (y * S + x) * 4;
      d[i] = 243 + n * 15;
      d[i + 1] = 236 + n * 15;
      d[i + 2] = 223 + n * 17;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.lineCap = 'round';
  for (let k = 0; k < 900; k++) {
    const x = hash3(k, 1, 4) * S, y = hash3(k, 2, 4) * S;
    const a = hash3(k, 3, 4) * TAU, l = 8 + hash3(k, 4, 4) * 34;
    g.strokeStyle = hash3(k, 5, 4) < 0.55 ? 'rgba(120,96,70,0.07)' : 'rgba(255,255,255,0.18)';
    g.lineWidth = 0.6 + hash3(k, 6, 4) * 0.9;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.4) * l * 0.5, y + Math.sin(a + 0.4) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return c;
}
function makeGrain(k) {
  const S = 512;
  const c = mk(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let i = 0; i < S * S; i++) {
    const v = 226 + hash3(i, k, 100) * 29;
    d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------- 镜头 ----------
function camera(t) {
  let x = 520 + 120 * eio(R(t, 0, 13));
  x += 180 * eio(R(t, 13, 17.1));
  const pp = R(t, 17.1, 19.4);
  x += 1740 * (pp <= 0 ? 0 : pp < 0.12 ? -0.015 * Math.sin(Math.PI * (pp / 0.12)) : springy((pp - 0.12) / 0.88));
  x += 60 * eio(R(t, 19.6, 28.2));
  const d1 = t - 20.72;
  const punch = d1 > 0 ? 0.035 * backOut(R(t, 20.72, 21.1), 2) - 0.012 * eio(R(t, 21.1, 22.5)) : 0;
  const d2 = t - 7.98;
  const shake = d2 > 0 ? 4 * Math.exp(-9 * d2) * Math.sin(55 * d2) : 0;
  return {
    x: x + 5 * Math.sin(0.5 * t),
    y: 720 + 6 * Math.sin(0.43 * t + 1) + shake,
    z: 1.08 - 0.08 * eo3(R(t, -0.3, 5.5)) - 0.04 * eio(R(t, 7.6, 9.6)) + 0.04 * eio(R(t, 10, 13)) - 0.05 * Math.sin(Math.PI * R(t, 17.1, 19.8)) + punch + 0.02 * eio(R(t, 22, 28.2)),
  };
}

// ---------- 场景元素 ----------
function drawSky(g, t, cam) {
  // 黄昏暖光(灯越多越暖)
  const warm = 0.1 + 0.22 * eio(R(t, 1.5, 7.2));
  const gr = g.createLinearGradient(0, HOR - 520, 0, HOR + 240);
  gr.addColorStop(0, rgba(C.amber, 0));
  gr.addColorStop(0.72, rgba(C.amber, warm));
  gr.addColorStop(1, rgba(C.amber, 0));
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = gr;
  g.fillRect(cam.x - 1200, HOR - 520, 2400, 760);
  g.restore();
}
function drawFlood(g, t, cam) {
  const r = floodR(t);
  if (r <= 0) return;
  const [fx, fy] = FLOOD_C;
  g.save();
  g.globalCompositeOperation = 'multiply';
  // 外圈淡、内圈浓,边缘颜料淤积
  blobPath(g, fx, fy, r * 1.04, 3, 1.2);
  g.fillStyle = rgba(C.night, 0.35);
  g.fill();
  blobPath(g, fx, fy, r, 5, 1);
  g.fillStyle = rgba(C.night, 0.93);
  g.fill();
  g.lineWidth = 22;
  g.strokeStyle = rgba('#0c1022', 0.5);
  g.stroke();
  g.restore();
  // 夜空 / 湖面层次(只在墨里)
  g.save();
  blobPath(g, fx, fy, r * 0.985, 5, 1);
  g.clip();
  const sky = g.createLinearGradient(0, -100, 0, HOR);
  sky.addColorStop(0, 'rgba(6,8,22,0.55)');
  sky.addColorStop(1, 'rgba(6,8,22,0)');
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = sky;
  g.fillRect(cam.x - 1200, -200, 2400, HOR + 200);
  g.globalCompositeOperation = 'screen';
  const band = g.createLinearGradient(0, HOR - 260, 0, HOR + 420);
  band.addColorStop(0, 'rgba(46,66,118,0)');
  band.addColorStop(0.38, 'rgba(46,66,118,0.42)');
  band.addColorStop(0.52, 'rgba(36,62,96,0.3)');
  band.addColorStop(1, 'rgba(20,40,60,0.1)');
  g.fillStyle = band;
  g.fillRect(cam.x - 1200, HOR - 260, 2400, 900);
  g.restore();
}
function drawStars(g, t, cam, boil) {
  if (t < 8.6) return;
  g.save();
  STARS.forEach((s) => {
    const p = backOut(R(t, s.t, s.t + 0.4), 2.5);
    if (p <= 0) return;
    const x = s.u + cam.x * 0.5;
    const tw = 0.65 + 0.35 * Math.sin(t * 2.4 + s.ph);
    const r = s.r * p * tw;
    g.fillStyle = rgba(C.cream, 0.85 * tw);
    g.beginPath();
    g.arc(x, s.y, r, 0, TAU);
    g.fill();
    if (s.r > 3.2) {
      line(g, [[x - r * 3.5, s.y], [x + r * 3.5, s.y]], { color: C.cream, w: 1.4, amp: 0.4, seed: 1300 + s.i, boil, alpha: 0.5 * tw });
      line(g, [[x, s.y - r * 3.5], [x, s.y + r * 3.5]], { color: C.cream, w: 1.4, amp: 0.4, seed: 1350 + s.i, boil, alpha: 0.5 * tw });
    }
  });
  g.restore();
}
const moonPos = (cam) => [cam.x * 0.85 + 667, 190];
function drawMoon(g, t, cam, boil) {
  if (t < 17.6) return;
  const [mx, my] = moonPos(cam);
  const f = eo3(R(t, 18.2, 18.9));
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, mx, my, 230, '#8fa3d8', 0.22 * f);
  g.restore();
  if (f > 0) {
    g.fillStyle = rgba(C.cream, 0.92 * f);
    g.beginPath();
    g.arc(mx, my, 44, 0, TAU);
    g.fill();
  }
  line(g, arc(mx, my, 46, -1.2, TAU * 1.02 - 1.2, 5), { p: eo3(R(t, 17.8, 18.5)), color: C.cream, w: 3, seed: 1400, boil, taper: false });
  // 月影
  for (let k = 0; k < 14; k++) {
    const y = HOR + 22 + k * 34;
    const w = (60 - k * 2.6) * (0.7 + 0.3 * Math.sin(t * 3 + k * 1.7));
    const x = mx + 8 * Math.sin(t * 1.6 + k);
    line(g, [[x - w / 2, y], [x + w / 2, y]], { color: C.cream, w: 3, amp: 1.2, seed: 1410 + k, boil, alpha: 0.42 * f * (1 - k / 16) });
  }
}
// 夜里的一颗流星(安静段的次级动作)
function drawMeteor(g, t, cam, boil) {
  const p = R(t, 10.05, 10.55);
  if (p <= 0 || p >= 1) return;
  const x0 = cam.x + 380, y0 = 120;
  const e = eo3(p);
  const hx = x0 - 620 * e, hy = y0 + 260 * e;
  const tail = 0.28 * (1 - p * 0.6);
  const e2 = eo3(Math.max(0, p - tail));
  const tx = x0 - 620 * e2, ty = y0 + 260 * e2;
  line(g, [[tx, ty], [hx, hy]], { color: C.cream, w: 3, amp: 0.4, seed: 2500, boil, alpha: 0.9 * (1 - ei3(p)), taperLen: 120 });
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, hx, hy, 26, C.cream, 0.6 * (1 - p));
  g.restore();
}
function drawRipples(g, t, cam, boil) {
  g.save();
  RIPPLES.forEach((r) => {
    const par = 1 + 0.25 * r.d;
    const x = r.x - cam.x * (par - 1) + 12 * Math.sin(t * 0.4 + r.ph * TAU);
    if (x + r.len < VIEW.x0 - 50 || x > VIEW.x1 + 50) return;
    const ph = (t / r.per + r.ph) % 1;
    const pa = eo3(R(ph, 0, 0.4)), pb = eo3(R(ph, 0.6, 1));
    const pts = [[x, r.y], [x + r.len * 0.5, r.y + 1.5], [x + r.len, r.y]];
    line(g, densify(pts, 8), {
      p: pa, p0: pb, colorAt: (px, py) => mix(C.ink, C.cream, darkAt(px, py, t), 1),
      w: 1.6 + 1.6 * r.d, amp: 1, seed: 1500 + r.i, boil, alpha: 0.34,
    });
  });
  g.restore();
}
function drawMist(g, t, cam) {
  const a = R(t, 8.6, 10.5);
  if (a <= 0) return;
  g.save();
  g.globalCompositeOperation = 'screen';
  for (let k = 0; k < 4; k++) {
    const x = cam.x - 700 + k * 520 + 60 * Math.sin(t * 0.21 + k) - cam.x * 0.1;
    const y = HOR - 26 + k * 18;
    const gr = g.createRadialGradient(x, y, 0, x, y, 380);
    gr.addColorStop(0, `rgba(120,140,190,${0.12 * a})`);
    gr.addColorStop(1, 'rgba(120,140,190,0)');
    g.fillStyle = gr;
    g.save();
    g.translate(x, y);
    g.scale(1, 0.14);
    g.translate(-x, -y);
    g.fillRect(x - 380, y - 380, 760, 760);
    g.restore();
  }
  g.restore();
}
function drawShore(g, t, boil) {
  const p = shoreProgress(t);
  // 屋子:淡淡一层墨(夜里更深)
  g.save();
  g.globalCompositeOperation = 'multiply';
  HOUSES.forEach((h, i) => {
    const s = R(t, 0.8 + i * 0.12, 1.6 + i * 0.12);
    if (s <= 0) return;
    const wall = HOR - h.h * 0.56;
    g.fillStyle = rgba(C.ink, 0.1 * s);
    g.beginPath();
    g.moveTo(h.x, HOR);
    g.lineTo(h.x, wall);
    g.lineTo(h.x - 14, wall + 7);
    g.lineTo(h.peak[0], h.peak[1]);
    g.lineTo(h.x + h.w + 14, wall + 7);
    g.lineTo(h.x + h.w, wall);
    g.lineTo(h.x + h.w, HOR);
    g.closePath();
    g.fill();
  });
  g.restore();
  // 山:画完后晕开深墨
  const mf = eo3(R(t, 18.7, 19.9));
  if (mf > 0) {
    g.save();
    g.beginPath();
    g.moveTo(MOUNTAIN[0][0], HOR);
    MOUNTAIN.forEach(([x, y]) => g.lineTo(x, y));
    g.lineTo(MOUNTAIN[MOUNTAIN.length - 1][0], HOR);
    g.closePath();
    g.clip();
    blobPath(g, 2900, HOR - 380, 900 * mf, 41, 1);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = rgba('#0a0d1e', 0.62);
    g.fill();
    g.restore();
    // 倒影
    g.save();
    g.globalAlpha = 0.5 * mf;
    for (let y = HOR + 4; y < HOR + 410; y += 7) {
      const off = 5 * Math.sin(y * 0.08 - t * 3.6);
      g.save();
      g.beginPath();
      g.rect(2380, y, 1500, 7.6);
      g.clip();
      g.translate(off, 2 * HOR);
      g.scale(1, -1);
      g.beginPath();
      g.moveTo(MOUNTAIN[0][0], HOR);
      MOUNTAIN.forEach(([x, yy]) => g.lineTo(x, yy));
      g.lineTo(MOUNTAIN[MOUNTAIN.length - 1][0], HOR);
      g.closePath();
      g.fillStyle = 'rgba(8,10,26,0.55)';
      g.fill();
      g.restore();
    }
    g.restore();
  }
  line(g, SHORE, { p, L: SHORE_L, colorAt: inkCol(t), w: 4.2, amp: 1.4, seed: 1, boil, ghost: true, taperLen: 40 });
}
// 墨线画头上的一点墨珠(画笔就是墨本身)
function drawInkHead(g, t, boil) {
  const active = (t > -0.3 && t < 2.6) || (t > 17.25 && t < 19.35);
  if (!active) return;
  const [x, y] = pointAt(SHORE, SHORE_L, shoreProgress(t));
  const r = 6 + 1.5 * Math.sin(t * 20);
  g.fillStyle = mix(C.ink, C.cream, darkAt(x, y, t));
  g.beginPath();
  g.arc(x + (hash3(boil, 1, 5) - 0.5) * 1.5, y, r, 0, TAU);
  g.fill();
}
function drawStrings(g, t, boil) {
  STRINGS.forEach((s) => {
    const p = eo3(R(t, 4.95 + s.k * 0.09, 5.45 + s.k * 0.09));
    line(g, s.pts, { p, L: s.L, colorAt: inkCol(t), w: 2, amp: 1, seed: 1700 + s.k, boil, alpha: 0.8 });
  });
}
function drawLights(g, t, boil) {
  LIGHTS.forEach((l, i) => {
    if (l.tOn === undefined) return;
    const on = backOut(R(t, l.tOn, l.tOn + 0.28), 2.6);
    const lantern = l.kind === 'lantern';
    // 灯笼的轮廓(没亮也在)
    if (lantern) {
      const a = eo3(R(t, 5.3 + (l.x / 1200) * 0.5, 5.6 + (l.x / 1200) * 0.5));
      if (a > 0) line(g, arc(l.x, l.y, 9, 0, TAU * 1.03, 3), { colorAt: inkCol(t), w: 2.2, amp: 0.7, seed: 1800 + i, boil, taper: false, alpha: a * (1 - darkAt(l.x, l.y, t) * 0.7) });
    }
    if (on <= 0) return;
    const dt = t - l.tOff;
    let k = 1, flare = 0;
    if (dt > 0) {
      flare = Math.exp(-14 * dt) * clamp(dt * 40);
      k = 1 - eo3(R(dt, 0.05, 0.35));
    }
    if (k <= 0) return;
    const fl = 0.85 + 0.15 * Math.sin(t * 9 + i * 2.1);
    const r = (lantern ? 9 : 10) * on;
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = rgba(C.amber, 0.9 * k);
    g.beginPath();
    if (lantern) g.ellipse(l.x, l.y, r, r * 1.2, 0, 0, TAU);
    else g.rect(l.x - r * 0.75, l.y - r, r * 1.5, r * 2);
    g.fill();
    g.restore();
    // 光芒:蜡笔短线
    for (let q = 0; q < 6; q++) {
      const an = (q / 6) * TAU + i + t * 0.3;
      const r0 = r + 6, r1 = r + 12 + 9 * fl;
      line(g, [[l.x + Math.cos(an) * r0, l.y + Math.sin(an) * r0], [l.x + Math.cos(an) * r1, l.y + Math.sin(an) * r1]], { color: C.amberDeep, w: 2.2, amp: 0.6, seed: 1900 + i * 7 + q, boil, alpha: 0.8 * on * k });
    }
    // 倒影
    const ry = 2 * HOR - l.y;
    for (let q = 0; q < 3; q++) {
      const y = ry - 22 + q * 20;
      const w = (16 + 10 * q) * (0.7 + 0.3 * Math.sin(t * 3.3 + i + q));
      const x = l.x + 4 * Math.sin(t * 2 + q + i);
      line(g, [[x - w / 2, y], [x + w / 2, y]], { color: C.amberDeep, w: 3, amp: 0.8, seed: 1950 + i * 3 + q, boil, alpha: 0.55 * on * k });
    }
    if (flare > 0) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      glow(g, l.x, l.y, 70, C.amber, 0.7 * flare);
      g.restore();
    }
  });
}
function drawP1(g, t) {
  if (!P1 || t < 4.6 || t > 7.1) return;
  g.save();
  P1.forEach((q) => {
    const t0 = q.t1 - q.dur;
    const appear = R(t, 4.66 + q.k * 0.12, 4.86 + q.k * 0.12);
    if (appear <= 0 || t > q.t1) return;
    const pos = (tt) => {
      const u = eio(R(tt, t0, q.t1));
      const c = [lerp(q.s[0], q.L.x, 0.35), Math.min(q.s[1], q.L.y) - q.lift];
      const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, cc = u * u;
      const jit = (1 - u) * 1.6 * Math.sin(tt * 13 + q.id);
      return [a * q.s[0] + b * c[0] + cc * q.L.x + jit, a * q.s[1] + b * c[1] + cc * q.L.y];
    };
    const [x, y] = pos(t);
    const [px, py] = pos(t - 0.018);
    g.strokeStyle = rgba(C.amberDeep, 0.85 * appear);
    g.lineWidth = 2.8;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(x + 0.01, y);
    g.stroke();
  });
  g.restore();
}
function drawInkDrips(g, t, boil) {
  if (t < 7.72 || t > 8.4) return;
  const lay = layoutCache.get(RUNS.c2c);
  if (!lay) return;
  [0.3, 0.62, 1.35, 1.7].forEach((u, k) => {
    const c = lay[u < 1 ? 0 : 1];
    const x = c.x + c.adv * (u % 1);
    const y0 = c.y - 10;
    const len = 150 * ei3(R(t, 7.72 + k * 0.04, 8.0 + k * 0.03));
    line(g, [[x, y0], [x + 2, y0 + len]], { color: C.ink, w: 9, amp: 1.2, seed: 2000 + k, boil });
    g.fillStyle = C.ink;
    g.beginPath();
    g.arc(x + 2, y0 + len, 8, 0, TAU);
    g.fill();
  });
}
function drawBoat(g, t, boil) {
  if (t < 12.8 || t > 19) return;
  const bx = boatX(t), by = boatY(t);
  if (bx - 200 > VIEW.x1 + 40) return;
  const dr = eo3(R(t, 12.8, 13.5));
  // 水痕
  const wa = R(t, 13.0, 13.6) * (1 - R(t, 18.0, 18.6));
  [-1, 1].forEach((sgn, k) => {
    const pts = [];
    for (let s = 0; s <= 1.7; s += 0.08) {
      const x = boatX(t - s) - 165;
      pts.push([x, boatY(t - s) + 10 + sgn * (4 + 26 * s)]);
    }
    line(g, pts, { color: C.cream, w: 2.6, amp: 1.2, seed: 2100 + k, boil, alpha: 0.55 * wa });
  });
  g.save();
  g.translate(bx, by);
  g.rotate(0.02 * Math.sin(1.7 * t));
  // 船影
  g.save();
  g.scale(1, -0.6);
  g.translate(0, -30);
  g.globalAlpha = 0.25 * dr;
  g.fillStyle = '#05070f';
  g.beginPath();
  HULL.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.fill();
  g.restore();
  g.fillStyle = rgba('#0a0d1c', 0.9 * dr);
  g.beginPath();
  HULL.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.fill();
  line(g, HULL, { p: dr, color: C.cream, w: 3, seed: 2200, boil });
  // 划船的人
  const row = Math.sin(TAU * (t / 1.5));
  const fp = eo3(R(t, 13.1, 13.6));
  const o = { color: C.cream, w: 3.2, amp: 0.8, boil };
  line(g, [[-40, -6], [-37, -64]], { ...o, seed: 2210, p: fp });
  line(g, arc(-35, -78, 10, 0, TAU * 1.04, 3), { ...o, seed: 2211, p: fp, taper: false });
  const hand = [-30 + row * 10, -50];
  line(g, [[-37, -54], hand], { ...o, seed: 2212, p: fp });
  line(g, [[hand[0] + 12, hand[1] - 40], [hand[0] - 70 - row * 16, 22]], { ...o, w: 2.6, seed: 2213, p: fp });
  g.restore();
  // 桨入水的小涟漪
  const rp = (t / 1.5) % 1;
  if (t > 13.3) {
    const rx = bx - 100, ry = by + 20;
    line(g, arc(rx, ry, 10 + 40 * rp, Math.PI * 0.05, Math.PI * 0.95, 4).map(([x, y]) => [x, ry + (y - ry) * 0.25]), { color: C.cream, w: 2, seed: 2220, boil, alpha: 0.5 * (1 - rp) });
  }
}
function drawFigure(g, t, boil) {
  if (t < 19.2) return;
  const [fx, fy] = FIGURE_AT;
  const o = { color: C.cream, w: 3.4, amp: 0.8, boil };
  const st = (a, b) => eo3(R(t, a, b));
  const flut = Math.sin(t * 3.1);
  const parts = [
    { pts: [[-8, 0], [-3, -38]], s: st(19.35, 19.5) },
    { pts: [[8, 0], [3, -38]], s: st(19.45, 19.6) },
    { pts: [[0, -38], [0, -80]], s: st(19.55, 19.72) },
    { pts: arc(0, -93, 11, Math.PI / 2, Math.PI / 2 + TAU * 1.03, 3), s: st(19.68, 19.86), taper: false },
    { pts: [[0, -70], [-13, -46]], s: st(19.82, 19.94) },
    { pts: [[0, -70], [13, -48]], s: st(19.88, 20.0) },
    { pts: [[0, -80], [-14, -78 + flut * 3], [-30, -74 + flut * 6]], s: st(19.95, 20.15) },
  ];
  g.save();
  g.translate(fx, fy);
  parts.forEach((pp, k) => line(g, pp.pts, { ...o, p: pp.s, seed: 2300 + k, taper: pp.taper ?? true }));
  // 倒影
  g.save();
  g.scale(1, -1);
  g.globalAlpha = 0.32;
  parts.forEach((pp, k) => line(g, pp.pts.map(([x, y]) => [x + 3 * Math.sin(y * 0.2 + t * 4), y]), { ...o, p: pp.s, seed: 2350 + k }));
  g.restore();
  g.restore();
}
function drawP7(g, t, boil) {
  if (!P7 || t < 21.6) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  P7.forEach((q) => {
    const a = eo3(R(t, q.tIn, q.tIn + 0.6));
    if (a <= 0) return;
    const bob = [6 * Math.sin(t * 0.9 + q.ph), 3 * Math.sin(t * 1.3 + q.ph * 2)];
    let x = q.home[0] + bob[0], y = q.home[1] + bob[1];
    let fade = 1;
    let r = 2.2 + 1.4 * Math.sin(t * 2.2 + q.ph) ** 2;
    if (q.tg) {
      const u = R(t, q.t0, q.t0 + q.dur);
      if (u >= 1) return;
      const e = eio(u);
      const cx = lerp(x, q.tg[0], 0.5), cy = Math.min(y, q.tg[1]) - 70;
      x = (1 - e) * (1 - e) * x + 2 * (1 - e) * e * cx + e * e * q.tg[0];
      y = (1 - e) * (1 - e) * y + 2 * (1 - e) * e * cy + e * e * q.tg[1];
      fade = 1 - R(u, 0.75, 1);
      r *= 1 + 0.6 * Math.sin(Math.PI * u);
    }
    glow(g, x, y, r * 6, C.amber, 0.28 * a * fade);
    g.fillStyle = rgba('#FFE2A8', 0.9 * a * fade);
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  });
  g.restore();
}

function drawTexts(g, t, boil) {
  // 第一句:写出 → 碎成光点
  const c1 = layoutRun(g, RUNS.c1);
  c1.forEach((c) => {
    const a = 1 - R(t, 4.72 + c.k * 0.12, 4.98 + c.k * 0.12);
    drawChar(g, c, t, boil, a);
  });
  // 第二句:墨夜里反白,然后淡去
  ['c2a', 'c2b', 'c2c'].forEach((id) => {
    layoutRun(g, RUNS[id]).forEach((c) => {
      const a = 1 - eo3(R(t, 8.5 + c.k * 0.05, 9.3 + c.k * 0.05));
      drawChar(g, c, t, boil, a);
    });
  });
  // 第三句:天上一行,水里一行倒影
  layoutRun(g, RUNS.c3).forEach((c) => {
    const out = eo3(R(t, 12.35 + c.k * 0.08, 13.1 + c.k * 0.08));
    drawChar(g, c, t, boil, 1 - out, { dy: -out * 40 });
    const rv = eo3(R(t, c.t + 0.06, c.t + 0.3));
    drawWaterChar(g, c, t, 0.5 * (1 - out), 2 + out * 26, C.cream, true, rv);
  });
  // 第四句:船尾浮出,遗忘时被波纹冲散
  ['c4a', 'c4b'].forEach((id) => {
    layoutRun(g, RUNS[id]).forEach((c) => {
      const rv = eo3(R(t, c.t, c.t + 0.3));
      const out = eo3(R(t, 17.1 + c.k * 0.05, 17.9 + c.k * 0.05));
      drawWaterChar(g, c, t, (1 - out) * clamp(rv * 1.6), 1.5 + out * 34, C.cream, false, rv);
      // 字浮出时的一圈涟漪
      const rp = R(t, c.t, c.t + 0.7);
      if (rp > 0 && rp < 1) {
        const cx = c.x + c.adv / 2, cy = c.y + 8;
        line(g, arc(cx, cy, 20 + 70 * eo3(rp), 0, TAU, 6).map(([x, y]) => [x, cy + (y - cy) * 0.22]), { color: C.cream, w: 2, seed: 2400 + c.k, boil, alpha: 0.5 * (1 - rp), taper: false });
      }
    });
  });
  // 第五、六句
  ['c5', 'c6'].forEach((id) => {
    layoutRun(g, RUNS[id]).forEach((c) => {
      const out = eo3(R(t, 22.4 + c.k * 0.08, 23.3 + c.k * 0.08));
      if (id === 'c6') {
        const p = R(t, c.t, c.t + 0.26);
        if (p <= 0 || out >= 1) return;
        const s = lerp(1.35, 1, backOut(p, 2.2));
        g.save();
        g.globalAlpha = clamp(p * 5) * (1 - out);
        g.font = `${c.part.w} ${c.part.size}px ${FONT}`;
        g.fillStyle = C.amber;
        g.translate(c.x + c.adv / 2, c.y - c.part.size * 0.36 - out * 30);
        g.scale(s, s);
        g.rotate((hash3(c.k, boil, 44) - 0.5) * 0.012);
        g.fillText(c.ch, -c.adv / 2, c.part.size * 0.36);
        g.restore();
      } else drawChar(g, c, t, boil, 1 - out, { dur: 0.12, dy: -out * 30 });
    });
  });
  // 第七句:光点聚成的字
  layoutRun(g, RUNS.c7).forEach((c) => {
    const a = eo3(R(t, c.t + 0.05, c.t + 0.4));
    if (a <= 0) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.filter = 'blur(14px)';
    g.globalAlpha = 0.55 * a * (0.85 + 0.15 * Math.sin(t * 2 + c.k));
    g.font = `${c.part.w} ${c.part.size}px ${FONT}`;
    g.fillStyle = C.amber;
    g.fillText(c.ch, c.x, c.y);
    g.restore();
    drawWaterChar(g, c, t, a, 1.2, '#FFD48A', false, 1);
  });
}

function renderScene(g, t, boil) {
  const cam = camera(t);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.filter = 'none';
  g.translate(W / 2, H / 2);
  g.scale(cam.z, cam.z);
  g.translate(-cam.x, -cam.y);
  const hw = W / 2 / cam.z;
  VIEW = { x0: cam.x - hw, x1: cam.x + hw };
  g.fillStyle = paperPat;
  g.fillRect(cam.x - 900, cam.y - 1100, 1800, 2200);
  buildParticles(g);

  drawSky(g, t, cam);
  drawFlood(g, t, cam);
  drawMist(g, t, cam);
  drawStars(g, t, cam, boil);
  drawMeteor(g, t, cam, boil);
  drawMoon(g, t, cam, boil);
  drawRipples(g, t, cam, boil);
  drawShore(g, t, boil);
  drawStrings(g, t, boil);
  drawLights(g, t, boil);
  drawP1(g, t);
  drawInkDrips(g, t, boil);
  drawBoat(g, t, boil);
  drawFigure(g, t, boil);
  drawTexts(g, t, boil);
  drawP7(g, t, boil);
  drawInkHead(g, t, boil);
}

export function drawFrame(ctx, frame) {
  const boil = Math.floor(frame / 2);
  const t0 = frame / FPS;
  const fast = (t0 > 7.95 && t0 < 8.7) || (t0 > 17.05 && t0 < 19.9) || (t0 > 20.7 && t0 < 21.0);
  const n = fast ? 12 : SUB;
  for (let s = 0; s < n; s++) {
    const tt = (frame + ((s + 0.5) / n - 0.5) * 0.5) / FPS;
    renderScene(subG, tt, boil);
    accG.globalAlpha = 1 / (s + 1);
    accG.drawImage(sub, 0, 0);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(acc, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  const vg = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.32, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, 'rgba(255,255,255,0)');
  vg.addColorStop(1, 'rgba(150,130,115,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  if (!grainPats) grainPats = grainTiles.map((c) => ctx.createPattern(c, 'repeat'));
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = grainPats[frame % 4];
  ctx.translate(-((frame * 37) % 512), -((frame * 91) % 512));
  ctx.fillRect(0, 0, W + 512, H + 512);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}
