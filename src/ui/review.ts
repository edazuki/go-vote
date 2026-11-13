/**
 * 終局後の振り返り：手ごとの得票率と形勢の推移（チャート）。
 * 形勢 = 未開票の星（石が乗っていない星）を両党に半々に分けたときの得票率。チャートは得票バーを縦に時間で並べた形で、
 * 赤は下から・青は上から伸びる得票の間のグレーが未開票、白い線が形勢
 */
import { komiTotal, shownPct, starCount, votes } from '../core/flag';
import { Game } from '../core/game';
import type { Move } from '../core/types';

export interface SeriesPoint {
  /** 画面と同じ得票率（%、0.1 刻み） */
  red: number;
  blue: number;
  /** 形勢：未開票を半々に分けたときの赤の得票率（%、丸めない）。青は 100 − これ */
  lean: number;
}

/** 0 手目（打つ前）から最後の手までの、各手を打った後の得票率と形勢 */
export function voteSeries(w: number, h: number, moves: readonly Move[], stars: readonly boolean[], komi: number, firstRed: boolean): SeriesPoint[] {
  const g = new Game(w, h), total = starCount(stars), d = total + komiTotal(total, komi), out: SeriesPoint[] = [];
  const push = () => {
    const v = votes(g.board, stars), s = shownPct(v, total, komi);
    // 先手の票 + 未開票の半分。後手は（票 + コミ + 半目 + 未開票の半分）なので、合わせてちょうど分母 d
    const firstLean = (v.black.length + v.free.length / 2) / d * 100;
    out.push(firstRed ? { red: s.black, blue: s.white, lean: firstLean } : { red: s.white, blue: s.black, lean: 100 - firstLean });
  };
  push();
  for (const m of moves) { g.play(m); push(); }
  return out;
}

/** 未開票の地（テーマによらず同じ） */
const UNDECIDED = '#5f6470';

/** チャートを描く。at = いま盤に出している手数（縦の線） */
export function drawChart(canvas: HTMLCanvasElement, series: readonly SeriesPoint[], at: number): void {
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  paintChart(ctx, W, H, series, at);
}

/** チャートの中身を ctx の (0, 0)〜(W, H) に描く。at = 縦の線を引く手数（null なら引かない）。共有の画像でも使う */
export function paintChart(ctx: CanvasRenderingContext2D, W: number, H: number, series: readonly SeriesPoint[], at: number | null): void {
  // 1点だけ（0手で終わった対局）なら、横いっぱいに伸ばして描く
  if (series.length === 1) series = [series[0], series[0]];
  ctx.fillStyle = UNDECIDED;
  ctx.fillRect(0, 0, W, H);
  const n = Math.max(1, series.length - 1), x = (i: number) => (i / n) * W;
  /** 下（赤）または上（青）から、値 f(i) % の高さまでを塗る */
  const area = (fromTop: boolean, f: (p: SeriesPoint) => number, fill: string | CanvasGradient) => {
    const y = (p: SeriesPoint) => (fromTop ? f(p) / 100 * H : H - f(p) / 100 * H);
    ctx.beginPath();
    ctx.moveTo(0, fromTop ? 0 : H);
    series.forEach((p, i) => ctx.lineTo(x(i), y(p)));
    ctx.lineTo(x(series.length - 1), fromTop ? 0 : H);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  // 得票
  const red = ctx.createLinearGradient(0, H, 0, 0);
  red.addColorStop(0, '#8e0f18'); red.addColorStop(1, '#d42a2a');
  const blue = ctx.createLinearGradient(0, 0, 0, H);
  blue.addColorStop(0, '#10357f'); blue.addColorStop(1, '#3274e6');
  area(false, p => p.red, red);
  area(true, p => p.blue, blue);
  // 過半数（50%）の線
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(255, 255, 255, .45)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
  ctx.setLineDash([]);
  // 形勢の線
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  series.forEach((p, i) => (i ? ctx.lineTo(x(i), H - p.lean / 100 * H) : ctx.moveTo(0, H - p.lean / 100 * H)));
  ctx.stroke();
  // いまの手
  if (at === null) return;
  const cx = Math.min(W - 1, Math.max(1, x(at))), p = series[Math.min(at, series.length - 1)];
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
  if (p) {
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath(); ctx.arc(cx, H - p.lean / 100 * H, 3.5, 0, Math.PI * 2); ctx.fill();
  }
}

/** チャートの横位置（clientX）から手数 */
export function moveAtX(canvas: HTMLCanvasElement, clientX: number, last: number): number {
  const r = canvas.getBoundingClientRect();
  return Math.max(0, Math.min(last, Math.round((clientX - r.left) / Math.max(1, r.width) * last)));
}
