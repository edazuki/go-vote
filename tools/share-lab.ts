import { findGame } from '../src/dev';
import { BOARDS, colorOfParty, shownPct, starCount, starsOf, votes, type BoardId, type Party } from '../src/core/flag';
import { Game } from '../src/core/game';
import { BLACK, WHITE } from '../src/core/types';
import { voteSeries } from '../src/ui/review';
import { starPath } from '../src/render/materials';
import {
  DARK_INK, WIN_BG, paintNavy, paintStars, paintStripes, renderBoard, seeded, shareImage, shareText, winnerBackdrop,
  type Backdrop, type Ink, type ShareResult,
} from '../src/ui/share';

// ---- 地のデザイン案。最初がゲームで使うもの（src/ui/share.ts の winnerBackdrop）。ほかは比べるための案 ----
const LIGHT_INK: Ink = { ink: '#0e1a3a', sub: '#6f6a5c', red: '#c41e3a', blue: '#1f4fb8', gold: '#b07a00', shadow: 'rgba(40, 30, 10, .3)' };
const GLOW: Record<'red' | 'blue', string> = { red: 'rgba(212, 42, 42, .55)', blue: 'rgba(50, 116, 230, .55)' };
const redBands = (g: CanvasRenderingContext2D, W: number, H: number, bottom = true) => {
  g.fillStyle = '#c41e3a'; g.fillRect(0, 0, W, 14);
  if (bottom) g.fillRect(0, H - 14, W, 14);
};

const STYLES: { id: string; name: string; note: string; paint: Backdrop }[] = [
  { id: 'winner', name: 'ゲームで使う：斜め縞＋星・勝ち色＋帯', note: '勝ち色を右上から左下へ紺に溶かすグラデーション。上下に勝った色の帯', paint: winnerBackdrop },
  { id: 'navy', name: '紺', note: '紺のグラデーションに、上端の赤い帯', paint: (g, W, H) => { paintNavy(g, W, H); redBands(g, W, H, false); return DARK_INK; } },
  {
    id: 'flag', name: '星条旗', note: '左を旗の星の部分のように紺、右に紅白の縞。文字は紺の板の上',
    paint: (g, W, H) => {
      const sh = H / 13;
      for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f6f3ea' : '#b31942'; g.fillRect(0, i * sh, W, sh + 1); }
      g.fillStyle = '#16235a'; g.fillRect(0, 0, 616, H);
      g.fillStyle = 'rgba(11, 20, 56, .9)';
      g.beginPath(); g.roundRect(608, 22, 580, H - 44, 18); g.fill();
      return DARK_INK;
    },
  },
  { id: 'diagonal', name: '斜めストライプ', note: '紺に、うっすら斜めの縞。上端と下端に赤い帯', paint: (g, W, H) => { paintNavy(g, W, H); paintStripes(g, W, H); redBands(g, W, H); return DARK_INK; } },
  {
    id: 'starry', name: '星空', note: '紺に、大きさと明るさの違う星を散らす',
    paint: (g, W, H) => {
      paintNavy(g, W, H);
      const rnd = seeded(7);
      g.fillStyle = '#fbfaf5';
      for (let i = 0; i < 300; i++) { g.globalAlpha = 0.08 + rnd() * 0.3; starPath(g, rnd() * W, rnd() * H, 2 + rnd() * 5); g.fill(); }
      g.globalAlpha = 1;
      return DARK_INK;
    },
  },
  {
    id: 'paper', name: 'ビンテージ', note: 'ゲームの地と同じ古紙の色に、紺の文字。上に赤と紺の細い線',
    paint: (g, W, H) => {
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#f3ebd8'); bg.addColorStop(1, '#e8dcc2');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.fillStyle = '#9e2a2b'; g.fillRect(0, 6, W, 6);
      g.fillStyle = '#2b3a55'; g.fillRect(0, 14, W, 3);
      return LIGHT_INK;
    },
  },
  { id: 'diag-stars', name: '斜め縞＋星', note: '斜めストライプに、星を散らす', paint: (g, W, H) => { paintNavy(g, W, H); paintStripes(g, W, H); paintStars(g, W, H); redBands(g, W, H); return DARK_INK; } },
  {
    id: 'diag-tint', name: '斜め縞＋星・勝ち色（弱）', note: '右上から勝った陣営の色がにじむ。帯も勝った色',
    paint: (g, W, H, winner) => {
      paintNavy(g, W, H);
      const rg = g.createRadialGradient(W, 0, 0, W, 0, W * 0.9);
      rg.addColorStop(0, GLOW[winner]); rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
      paintStripes(g, W, H); paintStars(g, W, H);
      g.fillStyle = WIN_BG[winner].band; g.fillRect(0, 0, W, 14); g.fillRect(0, H - 14, W, 14);
      return DARK_INK;
    },
  },
  {
    id: 'diag-full', name: '斜め縞＋星・勝ち色（強）', note: '地ごと勝った陣営の色。上下に白い細線。勝敗の文字は白',
    paint: (g, W, H, winner) => {
      const c = WIN_BG[winner], bg = g.createLinearGradient(W, 0, 0, H);
      bg.addColorStop(0, c.mid); bg.addColorStop(1, c.deep);
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      paintStripes(g, W, H); paintStars(g, W, H);
      g.fillStyle = 'rgba(255, 255, 255, .85)'; g.fillRect(0, 0, W, 6); g.fillRect(0, H - 6, W, 6);
      return { ...DARK_INK, red: '#ff9a9d', blue: '#a9c4ff', winWhite: true };
    },
  },
];

/** 見比べる対局：盤・先手・望む結果・名前・終わり方 */
interface Case {
  title: string;
  board: BoardId;
  firstRed: boolean;
  want: 'red' | 'blue' | 'close';
  redName: string;
  blueName: string;
  /** ギブアップで終わらせる（途中で打ち切る） */
  giveUp?: Party;
}

const CASES: Case[] = [
  { title: '★13・赤の勝ち', board: 'small5', firstRed: true, want: 'red', redName: 'YOU', blueName: 'CPU (NORMAL)' },
  { title: '★13・青の勝ち（青が先手）', board: 'small5', firstRed: false, want: 'blue', redName: 'CPU (HARD)', blueName: 'YOU' },
  { title: '★13 WIDE・接戦', board: 'small7', firstRed: true, want: 'close', redName: 'RED', blueName: 'BLUE' },
  { title: '★50・赤の勝ち', board: 'flag', firstRed: true, want: 'red', redName: 'YOU', blueName: 'CPU (HARD)' },
  { title: '★50・接戦', board: 'flag', firstRed: true, want: 'close', redName: 'CPU (HARD)', blueName: 'CPU (HARD)' },
  { title: '★50 WIDE・青の勝ち', board: 'flag-wide', firstRed: true, want: 'blue', redName: 'CPU (EASY)', blueName: 'YOU' },
  { title: '★50・途中で赤がギブアップ', board: 'flag', firstRed: true, want: 'red', redName: 'YOU', blueName: 'CPU (HARD)', giveUp: 'red' },
];

/** 望む結果の対局（ギブアップの対局は、見つけた対局の 6 割ほどで打ち切って投了させる） */
function playGame(c: Case): Game {
  const spec = BOARDS[c.board];
  const moves = findGame(c.board, 0, c.want, c.firstRed) ?? [];
  if (!c.giveUp) return Game.fromMoves(spec.w, spec.h, moves);
  const g = Game.fromMoves(spec.w, spec.h, moves.slice(0, Math.floor(moves.length * 0.6)));
  g.resign(colorOfParty(c.giveUp, c.firstRed));
  return g;
}

/** 対局ごとの盤の画像と結果（デザインを変えても打ち直さない） */
const cache = new Map<Case, { board: HTMLCanvasElement; r: ShareResult }>();

function prepare(c: Case): { board: HTMLCanvasElement; r: ShareResult } {
  const hit = cache.get(c);
  if (hit) return hit;
  const spec = BOARDS[c.board], stars = starsOf(spec), g = playGame(c);
  const v = votes(g.board, stars), s = shownPct(v, starCount(stars));
  const pct = (p: Party) => (colorOfParty(p, c.firstRed) === BLACK ? s.black : s.white);
  const firstWins = v.black.length > v.white.length;
  const winColor = g.resigned !== null ? (g.resigned === BLACK ? WHITE : BLACK) : firstWins ? BLACK : WHITE;
  const r: ShareResult = {
    board: spec.label, winner: (winColor === BLACK) === c.firstRed ? 'red' : 'blue', red: pct('red'), blue: pct('blue'),
    redName: c.redName, blueName: c.blueName, end: g.resigned !== null ? 'resign' : g.repeated ? 'repeat' : null, url: 'https://example.com/go-vote/',
    moves: g.moves.length, date: new Date(), series: voteSeries(g.w, g.h, g.moves, stars, 0, c.firstRed),
  };
  const out = { board: renderBoard({ game: g, stars, hover: null, tentative: null, firstRed: c.firstRed }), r };
  cache.set(c, out);
  return out;
}

const caseSel = document.getElementById('case') as HTMLSelectElement, styleSel = document.getElementById('style') as HTMLSelectElement;
caseSel.innerHTML = '<option value="all">全部</option>' + CASES.map((c, i) => `<option value="${i}">${c.title}</option>`).join('');
styleSel.innerHTML = '<option value="all">全部</option>' + STYLES.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
caseSel.value = '3';   // 最初は ★50 の赤の勝ちを、全部の案で
styleSel.value = 'all';

async function render(): Promise<void> {
  const grid = document.getElementById('grid')!;
  grid.innerHTML = '';
  const cases = caseSel.value === 'all' ? CASES : [CASES[Number(caseSel.value)]];
  const styles = styleSel.value === 'all' ? STYLES : STYLES.filter(s => s.id === styleSel.value);
  for (const c of cases) {
    for (const st of styles) {
      const fig = document.createElement('figure');
      fig.innerHTML = `<figcaption><b>${st.name}・${c.title}</b><span>${st.note}</span></figcaption>`;
      grid.appendChild(fig);
      // 1枚ずつ描いて画面を固めない
      await new Promise(r => setTimeout(r, 0));
      const { board, r } = prepare(c);
      const blob = await shareImage(board, r, st.paint);
      const img = document.createElement('img');
      img.src = blob ? URL.createObjectURL(blob) : '';
      img.alt = `${st.name}・${c.title}`;
      img.title = shareText(r);
      fig.appendChild(img);
    }
  }
}

caseSel.addEventListener('change', () => void render());
styleSel.addEventListener('change', () => void render());
document.getElementById('again')!.addEventListener('click', () => { cache.clear(); void render(); });
document.getElementById('small')!.addEventListener('change', e => document.body.classList.toggle('small', (e.target as HTMLInputElement).checked));
void render();
