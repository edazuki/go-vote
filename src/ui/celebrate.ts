/**
 * 勝ったときの演出：中央の札から金の星がはじけ、画面の上から星と紙吹雪が降る。
 * 色は勝った党の色を多めに、白と金を混ぜる。画面全体に重ねた透明な canvas に描く（クリックは素通し）。
 * 動きを減らす設定のときは出さない
 */
import type { Party } from '../core/flag';
import { starPath } from '../render/materials';

interface Piece {
  x: number; y: number; vx: number; vy: number;
  /** 回転（rad）と回転の速さ、ひらひら（裏返り）の位相と速さ */
  rot: number; vr: number; flip: number; vf: number;
  size: number; color: string; star: boolean;
  /** 出てくる時刻と消える時刻（ms、performance.now 基準） */
  t0: number; t1: number;
  /** 空気抵抗（大きいほどすぐ止まる）と重力 */
  drag: number; grav: number;
}

const COLORS: Record<Party, string[]> = {
  red: ['#e0303b', '#ff5a5f', '#c41e3a'],
  blue: ['#3274e6', '#6f9dff', '#1f4fb8'],
};
const WHITE = '#fbfaf5', GOLD = '#ffd34d';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D;
let pieces: Piece[] = [];
let raf = 0;

function ensureCanvas(): void {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '60' });
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

function frame(now: number): void {
  raf = 0;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  pieces = pieces.filter(p => now < p.t1 && p.y < innerHeight + 40);
  for (const p of pieces) {
    if (now < p.t0) continue;
    // 1 フレーム分（60fps 相当）に正規化して進める
    p.vx *= 1 - p.drag; p.vy = p.vy * (1 - p.drag) + p.grav;
    p.x += p.vx + Math.sin(p.flip) * 0.6; p.y += p.vy;
    p.rot += p.vr; p.flip += p.vf;
    const a = Math.min(1, (now - p.t0) / 120, (p.t1 - now) / 500);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    // 裏返り：横につぶして、ひらひらと回って見せる
    ctx.scale(1, Math.max(0.15, Math.abs(Math.cos(p.flip))));
    ctx.fillStyle = p.color;
    if (p.star) { starPath(ctx, 0, 0, p.size, 0.42); ctx.fill(); }
    else ctx.fillRect(-p.size * 0.35, -p.size, p.size * 0.7, p.size * 2);
    ctx.restore();
  }
  if (pieces.length) raf = requestAnimationFrame(frame);
  else ctx.clearRect(0, 0, innerWidth, innerHeight);
}

const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** 勝った党 winner の演出を始める。from = 金の星がはじける位置（中央の札） */
export function celebrate(winner: Party, from: { x: number; y: number }): void {
  if (reducedMotion.matches) return;
  ensureCanvas();
  const now = performance.now(), mine = COLORS[winner], W = innerWidth;
  const color = () => { const r = Math.random(); return r < 0.55 ? pick(mine) : r < 0.85 ? WHITE : GOLD; };
  // 中央の札から金と白の星がはじける
  for (let i = 0; i < 36; i++) {
    const ang = (i / 36) * Math.PI * 2 + rnd(-0.1, 0.1), sp = rnd(5, 11);
    pieces.push({
      x: from.x, y: from.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 2,
      rot: rnd(0, 6), vr: rnd(-0.2, 0.2), flip: 0, vf: 0,
      size: rnd(4, 8), color: i % 3 ? GOLD : WHITE, star: true,
      t0: now, t1: now + rnd(900, 1400), drag: 0.06, grav: 0.18,
    });
  }
  // 画面の上から、星と紙吹雪が降る（少しずつずらして出す）
  const n = Math.round(Math.min(220, Math.max(110, W / 6)));
  for (let i = 0; i < n; i++) {
    const star = Math.random() < 0.35;
    pieces.push({
      x: rnd(-20, W + 20), y: rnd(-60, -10), vx: rnd(-1.2, 1.2), vy: rnd(1.5, 3.5),
      rot: rnd(0, 6), vr: rnd(-0.12, 0.12), flip: rnd(0, 6), vf: rnd(0.08, 0.2),
      size: star ? rnd(5, 9) : rnd(4, 7), color: color(), star,
      t0: now + 250 + rnd(0, 1400), t1: now + 5200 + rnd(0, 800), drag: 0.02, grav: 0.05,
    });
  }
  if (!raf) raf = requestAnimationFrame(frame);
}

/** 演出を消す（新しい対局など） */
export function clearCelebration(): void {
  pieces = [];
  if (canvas) ctx.clearRect(0, 0, innerWidth, innerHeight);
}
