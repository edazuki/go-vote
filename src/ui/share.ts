/**
 * 結果の共有：終局の結果の文と、結果の画像（1200×630。SNS のカードの大きさ）。
 * 画像は盤の canvas（終局した局面。線は消えていて旗の星の部分に見える）と、得票バー・勝敗・対局者を並べて描く
 */
import type { Party } from '../core/flag';
import { paintChart, type SeriesPoint } from './review';
import { starPath } from '../render/materials';
import { Renderer, type View } from '../render/renderer';

export interface ShareResult {
  /** 盤の名前（★13 など） */
  board: string;
  winner: Party;
  /** 得票率（%、画面と同じ 0.1 刻み） */
  red: number;
  blue: number;
  /** 対局者の呼び名（YOU・CPU（HARD）など） */
  redName: string;
  blueName: string;
  /** 終わり方（ギブアップ・同形3回。普通の終局なら null）。画像も文も英語で添える */
  end: 'resign' | 'repeat' | null;
  /** 勝った党が待った（UNDO）を使った：WIN? と書く */
  doubt?: boolean;
  /** 遊ぶページの URL */
  url: string;
  /** 手数と、手ごとの得票率・形勢（チャート） */
  moves: number;
  /** 対局した日（画像の右下に出す） */
  date: Date;
  series: readonly SeriesPoint[];
}

const RED = '#d42a2a', BLUE = '#3274e6', NAVY = '#0b1438', WHITE = '#fbfaf5', GOLD = '#ffd34d';

/** 共有する文（1行目に結果、2行目に対局者、最後に URL） */
export function shareText(r: ShareResult): string {
  return `Go Vote ${r.board} | RED ${r.red.toFixed(1)}% – ${r.blue.toFixed(1)}% BLUE | ${r.winner.toUpperCase()} WIN${r.doubt ? '?' : ''}${r.end ? ` (${endTag(r.end)})` : ''}\n` +
    `RED: ${r.redName} / BLUE: ${r.blueName}\n#GoVote ${r.url}`;
}

/**
 * 盤を、画面の大きさによらず高い解像度（一辺 px ピクセルの枠に収まる大きさ）で描き直す。
 * 画面の外に置いた入れ物で、本番と同じ描画を使う（線の層は写さないので、線のない旗の星の部分になる）
 */
export function renderBoard(view: View, px = 1080): HTMLCanvasElement {
  const dpr = window.devicePixelRatio || 1, box = document.createElement('div'), canvas = document.createElement('canvas');
  Object.assign(box.style, { position: 'fixed', left: '-10000px', top: '0', width: `${px / dpr}px`, height: `${px / dpr}px`, pointerEvents: 'none' });
  box.appendChild(canvas);
  document.body.appendChild(box);
  new Renderer(canvas, box).draw({ ...view, hover: null, tentative: null, hideGhost: true });
  box.remove();
  return canvas;
}

/** 終わり方の添え書き（英語） */
const endTag = (e: 'resign' | 'repeat') => (e === 'resign' ? 'GAVE UP' : 'REPEAT ×3');

/** 文字の色。win を白にすると、勝敗の文字を党の色でなく白（影付き）で出す */
export interface Ink { ink: string; sub: string; red: string; blue: string; gold: string; shadow: string; winWhite?: boolean }
export const DARK_INK: Ink = { ink: WHITE, sub: 'rgba(251, 250, 245, .7)', red: '#ff5a5f', blue: '#6f9dff', gold: GOLD, shadow: 'rgba(0, 0, 0, .5)' };

/** 地を描いて、その上の文字の色を返す（デザイン案は tools/share-lab.ts で差し替えて見比べる） */
export type Backdrop = (g: CanvasRenderingContext2D, W: number, H: number, winner: Party) => Ink;

/** 勝った陣営の地の色（濃い・明るい・帯） */
export const WIN_BG: Record<Party, { deep: string; mid: string; band: string }> = {
  red: { deep: '#3a0712', mid: '#7a1424', band: '#e0303b' },
  blue: { deep: '#071338', mid: '#123a8c', band: '#3274e6' },
};

/** 再現できる乱数（地の星の位置を毎回同じにする） */
export function seeded(seed: number): () => number {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
}

/** 紺のグラデーション */
export function paintNavy(g: CanvasRenderingContext2D, W: number, H: number): void {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#16235a'); bg.addColorStop(1, NAVY);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
}

/** うっすら斜めの縞 */
export function paintStripes(g: CanvasRenderingContext2D, W: number, H: number): void {
  g.save();
  g.strokeStyle = 'rgba(255, 255, 255, .035)'; g.lineWidth = 26;
  for (let d = -H; d < W + H; d += 64) { g.beginPath(); g.moveTo(d, H); g.lineTo(d + H, 0); g.stroke(); }
  g.restore();
}

/** 大きめの星をまばらに。盤と文字の上には置かない（盤の下は隠れ、文字の上だとゴミに見える）。そのぶん周りに多めに */
export function paintStars(g: CanvasRenderingContext2D, W: number, H: number): void {
  const rnd = seeded(11);
  g.fillStyle = WHITE;
  for (let i = 0; i < 220; i++) {
    const sx = rnd() * W, sy = rnd() * H;
    const onBoard = sx > 30 && sx < 610 && sy > 34 && sy < 610, onText = sx > 620 && sx < 1170 && sy > 40 && sy < 590;
    if (onBoard || onText) continue;
    g.globalAlpha = 0.1 + rnd() * 0.25;
    starPath(g, sx, sy, 5 + rnd() * 9); g.fill();
  }
  g.globalAlpha = 1;
}

/**
 * ゲームで使う地：紺の上に、右上は勝った陣営の色がしっかり、左下ほど紺が透けるグラデーション。
 * 斜めの縞と星を重ね、上下に勝った色の帯
 */
export const winnerBackdrop: Backdrop = (g, W, H, winner) => {
  const c = WIN_BG[winner];
  paintNavy(g, W, H);
  const bg = g.createLinearGradient(W, 0, 0, H);
  bg.addColorStop(0, c.mid); bg.addColorStop(0.5, c.deep + 'e0'); bg.addColorStop(1, c.deep + '55');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  paintStripes(g, W, H);
  paintStars(g, W, H);
  g.fillStyle = c.band; g.fillRect(0, 0, W, 14); g.fillRect(0, H - 14, W, 14);
  return { ...DARK_INK, red: '#ff9a9d', blue: '#a9c4ff', winWhite: true };
};

/** 結果の画像（PNG）。board = 終局した局面を描いた盤の canvas（renderBoard で大きく描いたもの）、backdrop = 地 */
export function shareImage(board: HTMLCanvasElement, r: ShareResult, backdrop: Backdrop = winnerBackdrop): Promise<Blob | null> {
  const W = 1200, H = 630, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const font = (px: number, weight = 800) => `${weight} ${px}px system-ui, "Hiragino Sans", "Yu Gothic UI", sans-serif`;
  const ink = backdrop(g, W, H, r.winner);
  // 配置：左に盤、右に上から盤の名前と日付・勝敗・得票バー・チャート・対局者・注意書きと GO VOTE
  const L = { box: 574, boxX: 28, boxY: 28, x: 632, w: 540, head: 64, win: 148, winPx: 88, bar: 168, bh: 60, chart: 244, ch: 250, names: 538, foot: 596 };

  // 左：盤（縦横比を保って枠に収める）
  const box = L.box, k = Math.min(box / board.width, box / board.height), bw = board.width * k, bh = board.height * k;
  const bx = L.boxX + (box - bw) / 2, by = L.boxY + (box - bh) / 2;
  g.save();
  g.shadowColor = ink.shadow; g.shadowBlur = 30; g.shadowOffsetY = 10;
  g.drawImage(board, bx, by, bw, bh);
  g.restore();

  const dateText = r.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  // 右上：盤の名前と手数、日付
  const x = L.x, w = L.w;
  g.textBaseline = 'alphabetic';
  g.fillStyle = ink.sub; g.font = font(24, 600);
  g.fillText(`${r.board}  ·  ${r.moves} MOVE${r.moves === 1 ? '' : 'S'}`, x, L.head);
  g.textAlign = 'right'; g.fillText(dateText, x + w, L.head); g.textAlign = 'left';

  g.save();
  if (ink.winWhite) { g.fillStyle = WHITE; g.shadowColor = 'rgba(0, 0, 0, .35)'; g.shadowBlur = 18; }
  else g.fillStyle = r.winner === 'red' ? ink.red : ink.blue;
  // 添え書きがあれば右に置き、重なるなら勝敗の文字を小さくする
  const winText = `${r.winner.toUpperCase()} WIN${r.doubt ? '?' : ''}`, note = r.end ? `(${endTag(r.end)})` : '';
  g.font = font(22, 700);
  const noteW = note ? g.measureText(note).width + 18 : 0;
  let winPx = L.winPx;
  g.font = font(winPx);
  while (winPx > 48 && g.measureText(winText).width + noteW > w + 4) { winPx -= 2; g.font = font(winPx); }
  g.fillText(winText, x - 4, L.win);
  g.restore();
  if (note) { g.fillStyle = ink.gold; g.font = font(22, 700); g.textAlign = 'right'; g.fillText(note, x + w, L.win); g.textAlign = 'left'; }

  // 得票バー（赤は左・青は右から、真ん中が過半数）
  const y = L.bar, bh2 = L.bh;
  g.save();
  g.beginPath(); g.roundRect(x, y, w, bh2, 14); g.clip();
  g.fillStyle = '#1e2c60'; g.fillRect(x, y, w, bh2);
  // 画面のバーと同じ色の流れ（外側が濃く、伸びた先が明るい）と、上のつや
  const rw = w * r.red / 100, bw2 = w * r.blue / 100;
  const rg = g.createLinearGradient(x, 0, x + rw, 0);
  rg.addColorStop(0, '#8e0f18'); rg.addColorStop(1, RED);
  g.fillStyle = rg; g.fillRect(x, y, rw, bh2);
  const bg2 = g.createLinearGradient(x + w, 0, x + w - bw2, 0);
  bg2.addColorStop(0, '#10357f'); bg2.addColorStop(1, BLUE);
  g.fillStyle = bg2; g.fillRect(x + w - bw2, y, bw2, bh2);
  g.fillStyle = 'rgba(255, 255, 255, .16)';
  g.fillRect(x, y + 5, rw, bh2 * 0.3);
  g.fillRect(x + w - bw2, y + 5, bw2, bh2 * 0.3);
  g.fillStyle = 'rgba(255, 255, 255, .6)'; g.fillRect(x + w / 2 - 1, y, 2, bh2);
  g.restore();
  // バーの内側の影（画面と同じく、少しくぼんで見せる）
  g.save();
  g.beginPath(); g.roundRect(x, y, w, bh2, 14); g.clip();
  g.shadowColor = 'rgba(0, 0, 0, .45)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
  g.strokeStyle = 'rgba(0, 0, 0, .5)'; g.lineWidth = 4;
  g.beginPath(); g.roundRect(x - 2, y - 2, w + 4, bh2 + 4, 16); g.stroke();
  g.restore();
  g.textBaseline = 'alphabetic';
  g.save(); g.shadowColor = 'rgba(0, 0, 0, .45)'; g.shadowBlur = 6; g.shadowOffsetY = 1;
  g.fillStyle = WHITE; g.font = font(32);
  g.textAlign = 'left'; g.fillText(`${r.red.toFixed(1)}%`, x + 16, y + bh2 / 2 + 11);
  g.textAlign = 'right'; g.fillText(`${r.blue.toFixed(1)}%`, x + w - 16, y + bh2 / 2 + 11);
  g.textAlign = 'left';
  g.restore();

  // 推移のチャート（得票：赤は下・青は上から。グレーが未開票、白い線が形勢）
  const cy = L.chart, ch = L.ch;
  g.save();
  g.beginPath(); g.roundRect(x, cy, w, ch, 12); g.clip();
  g.translate(x, cy);
  paintChart(g, w, ch, r.series, null);
  g.restore();
  g.fillStyle = 'rgba(251, 250, 245, .6)'; g.font = font(17, 600);
  g.fillText('VOTES & OUTLOOK', x + 10, cy + ch - 10);

  // 対局者
  g.font = font(24, 600);
  const ny = L.names;
  g.fillStyle = ink.red; g.fillText('RED', x, ny);
  g.fillStyle = ink.ink; g.fillText(r.redName, x + 70, ny);
  const bx2 = x + w / 2 + 10;
  g.fillStyle = ink.blue; g.fillText('BLUE', bx2, ny);
  g.fillStyle = ink.ink; g.fillText(r.blueName, bx2 + 80, ny);

  // 左下に注意書き（架空の選挙で、実在の政党・候補者とは関係ない）、右下に GO VOTE
  g.fillStyle = ink.sub; g.font = font(15, 500);
  g.fillText('A game on a fictional election.', x, L.foot - 20);
  g.fillText('Not affiliated with any real party or candidate.', x, L.foot);
  g.fillStyle = ink.ink; g.font = font(28);
  // 注意書きの2行の真ん中あたりにそろえて、少し上に
  const gy = L.foot - 5;
  g.textAlign = 'right'; g.fillText('GO VOTE', x + w, gy); g.textAlign = 'left';
  starPath(g, x + w - g.measureText('GO VOTE').width - 18, gy - 10, 13); g.fill();
  return new Promise(res => c.toBlob(res, 'image/png'));
}
