/**
 * SNS のカード（OGP）画像の案。ゲームの紹介用で、結果ごとには変わらない（public/og.png に1枚置く）
 */
import { BOARDS, shownPct, starCount, starsOf, votes } from '../src/core/flag';
import { Game } from '../src/core/game';
import { findGame } from '../src/dev';
import { starPath } from '../src/render/materials';
import { paintNavy, paintStripes, renderBoard, seeded } from '../src/ui/share';

const W = 1200, H = 630, WHITE = '#fbfaf5', GOLD = '#ffd34d';
const font = (px: number, weight = 800) => `${weight} ${px}px system-ui, "Hiragino Sans", "Yu Gothic UI", sans-serif`;
type Rect = [number, number, number, number];

/** 星を散らす（避ける四角形の外にだけ） */
function stars(g: CanvasRenderingContext2D, avoid: Rect[], n = 160, seed = 5): void {
  const rnd = seeded(seed);
  g.fillStyle = WHITE;
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H, a = 0.1 + rnd() * 0.25, r = 4 + rnd() * 9;
    if (avoid.some(([x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1)) continue;
    g.globalAlpha = a; starPath(g, x, y, r); g.fill();
  }
  g.globalAlpha = 1;
}

/** 紺の地に斜め縞。左上に赤、右下に青がにじみ、上に赤・下に青の帯 */
function backdrop(g: CanvasRenderingContext2D, avoid: Rect[]): void {
  paintNavy(g, W, H);
  for (const [x, y, c] of [[0, 0, 'rgba(212, 42, 42, .35)'], [W, H, 'rgba(50, 116, 230, .35)']] as [number, number, string][]) {
    const rg = g.createRadialGradient(x, y, 0, x, y, W * 0.75);
    rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
  }
  paintStripes(g, W, H);
  stars(g, avoid);
  g.fillStyle = '#e0303b'; g.fillRect(0, 0, W, 14);
  g.fillStyle = '#3274e6'; g.fillRect(0, H - 14, W, 14);
}

/** 盤を、縦横比を保って (x, y, w, h) に収めて描く */
function drawBoard(g: CanvasRenderingContext2D, board: HTMLCanvasElement, x: number, y: number, w: number, h: number): void {
  const k = Math.min(w / board.width, h / board.height), bw = board.width * k, bh = board.height * k;
  g.save();
  g.shadowColor = 'rgba(0, 0, 0, .5)'; g.shadowBlur = 34; g.shadowOffsetY = 12;
  g.drawImage(board, x + (w - bw) / 2, y + (h - bh) / 2, bw, bh);
  g.restore();
}

/** 得票バー（赤は左、青は右から。真ん中が過半数） */
function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, red: number, blue: number): void {
  g.save();
  g.beginPath(); g.roundRect(x, y, w, h, h / 4); g.clip();
  g.fillStyle = '#1e2c60'; g.fillRect(x, y, w, h);
  const rw = w * red / 100, bw = w * blue / 100;
  const rg = g.createLinearGradient(x, 0, x + rw, 0); rg.addColorStop(0, '#8e0f18'); rg.addColorStop(1, '#d42a2a');
  g.fillStyle = rg; g.fillRect(x, y, rw, h);
  const bg = g.createLinearGradient(x + w, 0, x + w - bw, 0); bg.addColorStop(0, '#10357f'); bg.addColorStop(1, '#3274e6');
  g.fillStyle = bg; g.fillRect(x + w - bw, y, bw, h);
  g.fillStyle = 'rgba(255, 255, 255, .16)'; g.fillRect(x, y + h * 0.1, w, h * 0.3);
  g.fillStyle = 'rgba(255, 255, 255, .6)'; g.fillRect(x + w / 2 - 1, y, 2, h);
  g.restore();
  g.save();
  g.shadowColor = 'rgba(0, 0, 0, .45)'; g.shadowBlur = 6; g.shadowOffsetY = 1;
  g.fillStyle = WHITE; g.font = font(h * 0.5);
  g.textAlign = 'left'; g.fillText(`${red.toFixed(1)}%`, x + 14, y + h * 0.68);
  g.textAlign = 'right'; g.fillText(`${blue.toFixed(1)}%`, x + w - 14, y + h * 0.68);
  g.restore();
}

/** 見出し「★ GO VOTE」。align = 'center' なら x を真ん中に */
function title(g: CanvasRenderingContext2D, x: number, y: number, px: number, align: 'left' | 'center' = 'left'): void {
  g.font = font(px);
  const tw = g.measureText('GO VOTE').width, sr = px * 0.42, gap = px * 0.2, total = sr * 2 + gap + tw;
  const left = align === 'center' ? x - total / 2 : x;
  g.save();
  g.fillStyle = WHITE; g.shadowColor = 'rgba(0, 0, 0, .35)'; g.shadowBlur = 20;
  starPath(g, left + sr, y - px * 0.36, sr); g.fill();
  g.textAlign = 'left'; g.fillText('GO VOTE', left + sr * 2 + gap, y);
  g.restore();
}

const TAG = 'Stars are votes.';
const SUB = ['Red vs. Blue. Surround, capture,', 'and hold the most stars to win.'];

interface Design { id: string; name: string; note: string; draw(g: CanvasRenderingContext2D, board: HTMLCanvasElement): void }

const DESIGNS: Design[] = [
  {
    id: 'side', name: 'A：盤と文字を横に', note: '左に盤、右に見出し・ひとこと・得票バー',
    draw(g, board) {
      backdrop(g, [[30, 30, 640, 600], [650, 80, 1170, 560]]);
      drawBoard(g, board, 40, 40, 580, 550);
      const x = 660;
      title(g, x, 190, 92);
      g.fillStyle = GOLD; g.font = font(40); g.fillText(TAG, x, 268);
      g.fillStyle = 'rgba(251, 250, 245, .82)'; g.font = font(26, 600);
      SUB.forEach((s, i) => g.fillText(s, x, 322 + i * 36));
      bar(g, x, 404, 500, 56, PCT.red, PCT.blue);
      g.fillStyle = 'rgba(251, 250, 245, .6)'; g.font = font(20, 600);
      g.fillText('A Go-based game · Play free in your browser', x, 512);
    },
  },
  {
    id: 'center', name: 'B：真ん中に大きく', note: '見出しと得票バーを中央に、下に盤を大きく（下は切れる）',
    draw(g, board) {
      backdrop(g, [[200, 40, 1000, 300], [180, 300, 1020, 630]]);
      title(g, W / 2, 128, 104, 'center');
      g.fillStyle = GOLD; g.font = font(38); g.textAlign = 'center'; g.fillText(TAG, W / 2, 190); g.textAlign = 'left';
      bar(g, 300, 222, 600, 52, PCT.red, PCT.blue);
      g.save();
      g.beginPath(); g.rect(0, 296, W, H - 296 - 14); g.clip();
      drawBoard(g, board, 240, 300, 720, 600);
      g.restore();
    },
  },
  {
    id: 'flag', name: 'C：旗の星の部分', note: '左上に石のない盤（旗の星の部分そのもの）、右に紅白の縞と文字',
    draw(g, board) {
      const sh = H / 13;
      for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f6f3ea' : '#b31942'; g.fillRect(0, i * sh, W, sh + 1); }
      g.fillStyle = 'rgba(11, 20, 56, .92)';
      g.beginPath(); g.roundRect(600, 120, 560, 390, 22); g.fill();
      g.fillStyle = '#16235a'; g.fillRect(0, 0, 560, sh * 7);
      drawBoard(g, board, 14, 10, 532, sh * 7 - 20);
      const x = 640;
      title(g, x, 228, 88);
      g.fillStyle = GOLD; g.font = font(38); g.fillText(TAG, x, 296);
      g.fillStyle = 'rgba(251, 250, 245, .82)'; g.font = font(22, 600);
      SUB.forEach((s, i) => g.fillText(s, x, 344 + i * 30));
      bar(g, x, 410, 480, 48, PCT.red, PCT.blue);
    },
  },
  {
    id: 'flag-zoom', name: 'D：旗を拡大・序盤', note: '旗にぐっと寄って、星の部分（盤）の右下だけが見える。石が少しだけ置かれた序盤',
    draw(g, board) {
      // 縞をさらに太く（7 本ほど見える）。星の部分は上から 5 本ぶんで、盤はその右下だけが入る大きさ
      const sh = H / 7.2, ch = sh * 5, cw = 660;
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f6f3ea' : '#b31942'; g.fillRect(0, i * sh, W, sh + 1); }
      g.save();
      g.shadowColor = 'rgba(0, 0, 0, .35)'; g.shadowBlur = 24; g.shadowOffsetX = 6;
      g.fillStyle = '#16235a'; g.fillRect(0, 0, cw, ch);
      g.restore();
      g.save();
      g.beginPath(); g.rect(0, 0, cw, ch); g.clip();
      const bw = 1180, bh = bw * board.height / board.width;
      g.drawImage(board, cw - bw - 4, ch - bh - 4, bw, bh);
      g.restore();
      // 文字は縞の上の紺の板に
      const px = cw + 34, pw = W - px - 30;
      g.fillStyle = 'rgba(11, 20, 56, .93)';
      g.beginPath(); g.roundRect(px, 96, pw, 400, 22); g.fill();
      const x = px + 32;
      title(g, x, 196, 78);
      g.fillStyle = GOLD; g.font = font(35); g.fillText(TAG, x, 262);
      g.fillStyle = 'rgba(251, 250, 245, .82)'; g.font = font(21, 600);
      SUB.forEach((s, i) => g.fillText(s, x, 308 + i * 30));
      bar(g, x, 380, pw - 64, 48, PCT.red, PCT.blue);
      g.fillStyle = 'rgba(251, 250, 245, .6)'; g.font = font(16, 600);
      g.fillText('A Go-based game · Play free in your browser', x, 466);
    },
  },
];

/** 序盤らしく、盤の右下（D で見える所）に石を数個だけ。対局の最初のほうの手から、右下にあるものを順に打つ */
function earlyRightBottom(w: number, h: number, moves: readonly number[]): Game {
  const g = new Game(w, h);
  let n = 0;
  for (const m of moves.slice(0, 40)) {
    if (m < 0 || m % w < w * 0.45 || Math.floor(m / w) < h * 0.4) continue;
    if (g.play(m).ok && ++n >= 7) break;
  }
  return g;
}

/** 接戦の対局の途中（6 割ほど）の局面、序盤（数手）の局面、石のない盤 */
/**
 * A・B の局面：tools/og-game.json（scripts/og-game.ts で打った HARD 同士の対局から選んだ1局）があれば、その終局の局面。
 * なければ NORMAL 同士の接戦の途中
 */
let fixed: number[] | null = null;
try {
  const res = await fetch('./og-game.json');
  if (res.ok) fixed = (await res.json() as { moves: number[] }).moves;
} catch { /* なし */ }

/** 得票バーの数字：選んだ対局があればその結果（赤が先手）、なければ見本 */
const PCT = (() => {
  if (!fixed) return { red: 51.2, blue: 46.4 };
  const spec = BOARDS.flag, st = starsOf(spec), g = Game.fromMoves(spec.w, spec.h, fixed), p = shownPct(votes(g.board, st), starCount(st));
  return { red: p.black, blue: p.white };
})();

function boards(): { mid: HTMLCanvasElement; early: HTMLCanvasElement; empty: HTMLCanvasElement } {
  const spec = BOARDS.flag, s = starsOf(spec), moves = findGame('flag', 0, 'close') ?? [];
  const view = (game: Game) => ({ game, stars: s, hover: null, tentative: null, firstRed: true });
  return {
    mid: renderBoard(view(Game.fromMoves(spec.w, spec.h, fixed ?? moves.slice(0, Math.floor(moves.length * 0.6))))),
    early: renderBoard(view(earlyRightBottom(spec.w, spec.h, moves))),
    empty: renderBoard(view(new Game(spec.w, spec.h))),
  };
}

const grid = document.getElementById('grid')!, msg = document.getElementById('msg')!;
function render(): void {
  grid.innerHTML = '';
  const b = boards();
  for (const d of DESIGNS) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    d.draw(g, d.id === 'flag' ? b.empty : d.id === 'flag-zoom' ? b.early : b.mid);
    const fig = document.createElement('figure');
    fig.innerHTML = `<figcaption><b>${d.name}</b><span>${d.note}</span></figcaption>`;
    // 選んだ案を public/og.png に書き出す（開発用の受け口 scripts/og-save.py が動いているときだけ）
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'public/og.png に保存';
    save.addEventListener('click', () => c.toBlob(async blob => {
      try {
        const res = await fetch('http://localhost:5199/og.png', { method: 'POST', body: blob });
        msg.textContent = res.ok ? `${d.name} を保存しました` : `保存できませんでした（${res.status}）`;
      } catch { msg.textContent = '保存の受け口（scripts/og-save.py）が動いていません'; }
    }, 'image/png'));
    fig.querySelector('figcaption')!.appendChild(save);
    const img = document.createElement('img');
    img.src = c.toDataURL('image/png');
    img.alt = d.name;
    fig.appendChild(img);
    grid.appendChild(fig);
  }
}
document.getElementById('again')!.addEventListener('click', render);
document.getElementById('small')!.addEventListener('change', e => document.body.classList.toggle('small', (e.target as HTMLInputElement).checked));
render();
