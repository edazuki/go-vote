/**
 * 票の粒：星を取ったら盤から得票バーへ、取られたらバーから盤へ、光の粒を飛ばす（一瞬全方位に飛び散ってから向かう）。
 * 画面全体に重ねた透明な canvas に描く（クリックは素通し）。動きを減らす設定のときは出さない
 */

export interface Pt { x: number; y: number }
export type Tint = 'red' | 'blue';

interface Grain {
  /** 飛び散る中心 */
  origin: Pt;
  /** 飛び散る向きと距離（px） */
  spread: Pt;
  /** 行き先（毎フレーム聞き直す。バーの先は伸びながら動くので、それを追う） */
  to: () => Pt;
  /** 曲がり具合（行き先までの線に直交する向きのずれ、距離に対する割合） */
  bend: number;
  /** 飛び散り始める時刻・行き先へ飛び立つ時刻・飛ぶ長さ（ms） */
  tBurst: number;
  tDepart: number;
  dur: number;
  size: number;
  tint: Tint;
  /** 飛ぶにつれて白へ近づける（取られた票が、空いた星に戻るとき） */
  whiten: boolean;
}

/** 最初に全方位へ飛び散る長さ（ms）と距離（px） */
const BURST_MS = 260, SPREAD_MIN = 40, SPREAD_MAX = 95;

type RGB = [number, number, number];
/** 光（周り）と芯の色。白は空いた星の色 */
const COLORS: Record<Tint, { glow: RGB; core: RGB }> = {
  red: { glow: [255, 92, 78], core: [255, 236, 228] },
  blue: { glow: [96, 156, 255], core: [232, 242, 255] },
};
const WHITE: RGB = [251, 250, 245];
/** a から b へ k（0..1）だけ寄せた色を、透明度 alpha 付きで */
const mix = (a: RGB, b: RGB, k: number, alpha: number) =>
  `rgba(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(', ')}, ${alpha})`;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D;
let grains: Grain[] = [];
let raf = 0;

function ensureCanvas(): void {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '50' });
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d')!;
  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas!.width = Math.round(innerWidth * dpr);
    canvas!.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  addEventListener('resize', fit);
  fit();
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** 飛び散ったあとの位置：散り終えたら、飛び立つまでゆっくり外へ漂う */
function scattered(g: Grain, now: number): Pt {
  const e = now - g.tBurst, k = easeOut(Math.min(1, e / BURST_MS)) + 0.12 * Math.min(1, Math.max(0, e - BURST_MS) / 500);
  return { x: g.origin.x + g.spread.x * k, y: g.origin.y + g.spread.y * k };
}

/** 時刻 now の位置（飛び散る → 漂う → 行き先へ曲線で飛ぶ） */
function posAt(g: Grain, now: number): Pt {
  if (now < g.tDepart) return scattered(g, now);
  const from = scattered(g, g.tDepart), to = g.to(), t = ease(Math.min(1, (now - g.tDepart) / g.dur));
  const dx = to.x - from.x, dy = to.y - from.y;
  // 2次ベジェ。制御点は中点から、線に直交する向きへ bend だけずらす
  const cx = from.x + dx / 2 - dy * g.bend, cy = from.y + dy / 2 + dx * g.bend, u = 1 - t;
  return { x: u * u * from.x + 2 * u * t * cx + t * t * to.x, y: u * u * from.y + 2 * u * t * cy + t * t * to.y };
}

function frame(now: number): void {
  raf = 0;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.globalCompositeOperation = 'lighter';
  grains = grains.filter(g => now < g.tDepart + g.dur);
  for (const g of grains) {
    if (now < g.tBurst) continue;
    const c = COLORS[g.tint], k = Math.max(0, (now - g.tDepart) / g.dur), w = g.whiten ? Math.min(1, k * 1.1) : 0;
    // 現れるときと着く直前は薄く
    const a = Math.min(1, (now - g.tBurst) / 60, (1 - k) * 5);
    const p = posAt(g, now), tail = posAt(g, Math.max(g.tBurst, now - 45));
    // 尾
    ctx.strokeStyle = mix(c.glow, WHITE, w, 0.55 * a);
    ctx.lineWidth = g.size * 0.9;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    // 光
    const r = g.size * 2.6, grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    grad.addColorStop(0, mix(c.core, WHITE, w, a));
    grad.addColorStop(0.35, mix(c.glow, WHITE, w, 0.8 * a));
    grad.addColorStop(1, mix(c.glow, WHITE, w, 0));
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  if (grains.length) raf = requestAnimationFrame(frame);
}

/** 粒が飛び散る・飛び立つ・着く時刻（いまからの ms）。得票バーの増減や音をこれに合わせる */
export interface Flight { burst: number; departFirst: number; departLast: number; arriveFirst: number; arriveLast: number }
const NO_FLIGHT: Flight = { burst: 0, departFirst: 0, departLast: 0, arriveFirst: 0, arriveLast: 0 };

/**
 * from で一瞬全方位に飛び散ってから、to へ粒を飛ばす。delay で出だしを遅らせる。
 * 飛ぶ時刻を返す（出さないときは全部 0）
 */
export function burst(from: Pt, to: () => Pt, tint: Tint, opts: { count?: number; delay?: number; whiten?: boolean } = {}): Flight {
  if (reducedMotion.matches) return NO_FLIGHT;
  ensureCanvas();
  const now = performance.now(), n = opts.count ?? 12, b = opts.delay ?? 0;
  const f: Flight = { burst: b, departFirst: Infinity, departLast: 0, arriveFirst: Infinity, arriveLast: 0 };
  const turn = Math.random() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    // 全部いっしょに飛び散り（向きはおおむね均等に）、散り終えてから 0〜500ms ばらして、1粒 0.6〜0.85 秒で飛ぶ
    const ang = turn + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5, dist = SPREAD_MIN + Math.random() * (SPREAD_MAX - SPREAD_MIN);
    const depart = b + BURST_MS + (i / Math.max(1, n - 1)) * 500, dur = 600 + Math.random() * 250;
    grains.push({
      origin: from, spread: { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist }, to, tint,
      bend: (Math.random() - 0.5) * 0.7,
      tBurst: now + b, tDepart: now + depart, dur,
      size: 2 + Math.random() * 2,
      whiten: opts.whiten ?? false,
    });
    f.departFirst = Math.min(f.departFirst, depart); f.departLast = Math.max(f.departLast, depart);
    f.arriveFirst = Math.min(f.arriveFirst, depart + dur); f.arriveLast = Math.max(f.arriveLast, depart + dur);
  }
  if (!raf) raf = requestAnimationFrame(frame);
  return f;
}

/** 進行中の粒を消す（新しい対局など） */
export function clearParticles(): void {
  grains = [];
  if (canvas) ctx.clearRect(0, 0, innerWidth, innerHeight);
}
