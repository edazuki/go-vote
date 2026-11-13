import type { Game } from '../core/game';
import { BLACK, EMPTY, PASS, type Color } from '../core/types';
import { boardTexture, STONE_VARIANTS, starPath, stoneSprite } from './materials';

export interface View {
  game: Game;
  /** 交点ごとに星（得票になる点）かどうか */
  stars: readonly boolean[];
  /** マウスのホバー位置（PC のみ） */
  hover: number | null;
  /** タッチの仮置き位置（スマホ：もう一度タップで確定） */
  tentative: number | null;
  /** 打つ位置の半透明（と ×）を出さない（CPU の番・遊び方の盤） */
  hideGhost?: boolean;
  /** 先手が赤か（省略時は赤）。石の色は手番ではなく党で決まる */
  firstRed?: boolean;
}

/** 取られた石が消えるまで（ms） */
const FADE_MS = 360;
/**
 * 横の目の縦の目に対する比（1:1）。
 * 試した値：米国旗の実寸（星の段の間隔 0.054、列の間隔 0.063、星の直径 0.0616）なら
 * ASPECT = 0.063 / 0.054、STAR_R = 0.0616 / 2 / 0.054（≈ 0.57）、EDGE = 1
 */
const ASPECT = 1;
/** 星の外接円の半径（目に対する比）。石（半径 0.46）の下に隠れる大きさの上限近く（影とずらし分を残す） */
const STAR_R = 0.4;
/** 盤の外側の余白（目に対する比率。片側） */
const EDGE = 0.95;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/**
 * Canvas 2D の描画。盤は横長（横 w × 縦 h）で、親要素に収まる最大の大きさにする。
 * devicePixelRatio に合わせて内部解像度を上げ、親要素のサイズ変化に追従する。
 * 取られた石が消える間だけ requestAnimationFrame で描き続ける。
 * 盤の線は、盤の上に重ねた別の canvas（lines）に、石と星の部分をくり抜いて描く。
 * 線の濃さは CSS の opacity で変える（描き直さないので軽い。線を消すと星条旗の星の部分に見える）
 */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  /** 縦の目（px）。横の目はこれの ASPECT 倍 */
  private cell = 0;
  private view: View | null = null;
  /** いまの canvas の大きさを決めた盤の縦横 */
  private dims = '';
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private raf = 0;
  /** 消えていく石 */
  private fading: { p: number; red: boolean; t0: number }[] = [];
  private legalCache: { game: Game; moves: number; p: number; ok: boolean } | null = null;
  /** 盤の線だけの層（盤の上に重ねる。クリックは素通し）。濃さは data-mode と CSS（.board-lines）で変える */
  readonly lines: HTMLCanvasElement;
  private readonly lctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly container: HTMLElement) {
    this.ctx = canvas.getContext('2d')!;
    this.lines = document.createElement('canvas');
    this.lines.className = 'board-lines';
    this.lines.setAttribute('aria-hidden', 'true');
    canvas.after(this.lines);
    this.lctx = this.lines.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(container);
  }

  private resize(): void {
    if (!this.view) return;
    const { w: W, h: H } = this.view.game;
    const el = this.container, cs = getComputedStyle(el);
    const aw = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ah = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const span = (n: number) => n - 1 + EDGE * 2;
    const cell = Math.min(aw / (span(W) * ASPECT), ah / span(H));
    if (!(cell > 0)) return;
    const dpr = window.devicePixelRatio || 1;
    this.cell = cell;
    this.cssW = Math.floor(cell * ASPECT * span(W));
    this.cssH = Math.floor(cell * span(H));
    this.dims = `${W}x${H}`;
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 線の層は盤と同じ位置・大きさに（盤の親要素が基準。親は position: relative）
    Object.assign(this.lines.style, {
      left: `${this.canvas.offsetLeft}px`, top: `${this.canvas.offsetTop}px`, width: `${this.cssW}px`, height: `${this.cssH}px`,
    });
    this.lines.width = this.canvas.width;
    this.lines.height = this.canvas.height;
    this.lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.frame(performance.now());
  }

  /** 盤の縦の目の大きさ（CSS px。石の半径はこの 0.46 倍） */
  get cellSize(): number { return this.cell; }

  /** 盤上の点 p の中心の画面座標（票の粒の出どころ・行き先） */
  clientPoint(p: number): { x: number; y: number } {
    const w = this.view?.game.w ?? 1, r = this.canvas.getBoundingClientRect(), cy = this.cell, cx = cy * ASPECT;
    return { x: r.left + cx * (EDGE + (p % w)), y: r.top + cy * (EDGE + ((p / w) | 0)) };
  }

  /** 画面座標 → 盤上の点（盤外は null） */
  pointAt(clientX: number, clientY: number): number | null {
    if (!this.view) return null;
    const { w, h } = this.view.game, r = this.canvas.getBoundingClientRect(), cy = this.cell, cx = cy * ASPECT;
    const x = Math.round((clientX - r.left - cx * EDGE) / cx);
    const y = Math.round((clientY - r.top - cy * EDGE) / cy);
    return x >= 0 && y >= 0 && x < w && y < h ? y * w + x : null;
  }

  /** 石が取られた（main から着手の直後に呼ぶ）。color は取られた石の色 */
  captured(points: number[], color: Color): void {
    if (this.reducedMotion.matches) return;
    const t0 = performance.now();
    for (const p of points) this.fading.push({ p, red: this.isRed(color), t0 });
    this.schedule();
  }

  draw(view: View): void {
    if (this.view && view.game !== this.view.game) this.fading = [];
    this.view = view;
    if (this.dims !== `${view.game.w}x${view.game.h}`) this.resize();
    else this.frame(performance.now());
  }

  private schedule(): void {
    if (!this.raf) this.raf = requestAnimationFrame(now => { this.raf = 0; if (this.view) this.frame(now); });
  }

  private frame(now: number): void {
    const view = this.view;
    if (!view || !this.cssW) return;
    const { game, stars } = view, g = this.ctx, W = game.w, H = game.h, SW = this.cssW, SH = this.cssH;
    // c = 縦の目、cx = 横の目。石は縦の目に合わせる（縦に並んだ石どうしがほぼ接する）
    const c = this.cell, cx = c * ASPECT, mx = cx * EDGE, my = c * EDGE;
    const gx = (k: number) => mx + k * cx, gy = (k: number) => my + k * c;
    const px = (i: number) => gx(i % W), py = (i: number) => gy((i / W) | 0);
    const css = getComputedStyle(this.canvas), tok = (name: string) => css.getPropertyValue(name).trim();
    const cells = game.board.cells, R = c * 0.46;

    g.clearRect(0, 0, SW, SH);
    const tex = boardTexture();
    g.drawImage(tex, 0, 0, tex.width, tex.height, 0, 0, SW, SH);

    // 線：別の層に、紺地に溶ける程度の細い白線。石と星の上はくり抜く（線は石と星の下に見える）
    const l = this.lctx;
    l.clearRect(0, 0, SW, SH);
    l.strokeStyle = 'rgba(225, 232, 255, .15)';
    l.lineWidth = Math.max(1, c / 36);
    l.beginPath();
    for (let y = 0; y < H; y++) { const a = Math.round(gy(y)) + 0.5; l.moveTo(mx, a); l.lineTo(gx(W - 1), a); }
    for (let x = 0; x < W; x++) { const a = Math.round(gx(x)) + 0.5; l.moveTo(a, my); l.lineTo(a, gy(H - 1)); }
    l.stroke();
    l.strokeStyle = 'rgba(225, 232, 255, .26)';
    l.lineWidth = Math.max(1.5, c / 22);
    l.strokeRect(mx, my, (W - 1) * cx, (H - 1) * c);
    l.globalCompositeOperation = 'destination-out';
    l.fillStyle = '#000';
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== EMPTY) { l.beginPath(); l.arc(px(i), py(i), R, 0, Math.PI * 2); l.fill(); }
      else if (stars[i]) { starPath(l, px(i), py(i) + c * 0.015, c * STAR_R); l.fill(); }
    }
    l.globalCompositeOperation = 'source-over';

    // 空いている星
    g.fillStyle = '#fbfaf5';
    g.save();
    g.shadowColor = 'rgba(0, 0, 20, .35)'; g.shadowBlur = c * 0.04; g.shadowOffsetY = c * 0.02;
    for (let i = 0; i < cells.length; i++) {
      if (stars[i] && cells[i] === EMPTY) { starPath(g, px(i), py(i) + c * 0.015, c * STAR_R); g.fill(); }
    }
    g.restore();

    // 消えていく石
    this.fading = this.fading.filter(f => now - f.t0 < FADE_MS && cells[f.p] === EMPTY);
    for (const f of this.fading) {
      const k = clamp01((now - f.t0) / FADE_MS);
      this.stone(px(f.p), py(f.p), R * (1 + 0.15 * k), f.red, f.p, stars[f.p], 1 - k);
    }

    // 石（星の上の石には星の印）
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== EMPTY) this.stone(px(i), py(i), R, this.isRed(cells[i] as Color), i, stars[i], 1);
    }

    // 最終手：石の左上に小さな金の三角
    const last = game.lastMove;
    if (last !== null && last !== PASS && cells[last] !== EMPTY) {
      g.fillStyle = tok('--last') || '#ffd34d';
      g.strokeStyle = 'rgba(40, 20, 0, .5)';
      g.lineWidth = 1;
      const s = Math.max(5, c * 0.2), x0 = px(last) - R * 0.7, y0 = py(last) - R * 0.7;
      g.beginPath();
      g.moveTo(x0, y0); g.lineTo(x0 + s, y0); g.lineTo(x0, y0 + s);
      g.closePath(); g.fill(); g.stroke();
    }

    // ホバー / 仮置き
    const ghost = view.tentative ?? view.hover;
    if (ghost !== null && cells[ghost] === EMPTY && !game.isOver && !view.hideGhost) {
      if (!this.canPlay(game, ghost)) {
        this.cross(px(ghost), py(ghost), c);
      } else {
        this.stone(px(ghost), py(ghost), R, this.isRed(game.toMove), ghost, stars[ghost], view.tentative !== null ? 0.75 : 0.5);
        if (view.tentative !== null) {
          g.strokeStyle = tok('--last') || '#ffd34d';
          g.lineWidth = Math.max(2, c / 14);
          g.beginPath(); g.arc(px(ghost), py(ghost), R + 3, 0, Math.PI * 2); g.stroke();
        }
      }
    }

    if (this.fading.length) this.schedule();
  }

  /** 手番の色 c の石を赤で描くか */
  private isRed(c: Color): boolean {
    return (c === BLACK) === (this.view?.firstRed ?? true);
  }

  private canPlay(game: Game, p: number): boolean {
    const lc = this.legalCache;
    if (lc && lc.game === game && lc.moves === game.moves.length && lc.p === p) return lc.ok;
    const ok = game.check(p).ok;
    this.legalCache = { game, moves: game.moves.length, p, ok };
    return ok;
  }

  /** 打てない点のホバーに出す × */
  private cross(x: number, y: number, c: number): void {
    const g = this.ctx, h = c * 0.2;
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255, 120, 110, .9)';
    g.lineWidth = Math.max(2, c / 14);
    g.beginPath();
    g.moveTo(x - h, y - h); g.lineTo(x + h, y + h);
    g.moveTo(x + h, y - h); g.lineTo(x - h, y + h);
    g.stroke();
    g.restore();
  }

  private stone(x: number, y: number, r: number, red: boolean, p: number, star: boolean, alpha: number): void {
    const g = this.ctx, dpr = this.canvas.width / this.cssW;
    const sp = stoneSprite(red, p % STONE_VARIANTS, r * dpr, star), s = sp.width / dpr;
    g.globalAlpha = alpha;
    g.drawImage(sp, x - s / 2, y - s / 2, s, s);
    g.globalAlpha = 1;
  }
}
