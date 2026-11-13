/**
 * 開発用（npm run dev のときだけ読み込む。本番のビルドには入らない）：終局の演出をすぐ見るためのボタン。
 * いまの BOARD で NORMAL 同士の対局を裏で打ち切り、最後のパスの1手前から始めて、少し置いてパスで終局させる
 */
import { requestFor } from './ai/protocol';
import { chooseNormalMove } from './ai/policy';
import { BOARDS, starsOf, votes, type BoardId } from './core/flag';
import { Game } from './core/game';
import { PASS, type Move } from './core/types';

export type Want = 'red' | 'blue' | 'close';

/**
 * NORMAL 同士で打ち切って、望む結果になる対局の手順（最後の2手はパス）を探す。firstRed = 赤が先手か。
 * 共有画像の見比べ（tools/share-lab）でも使う
 */
export function findGame(board: BoardId, komi: number, want: Want, firstRed = true): Move[] | null {
  const spec = BOARDS[board], stars = starsOf(spec);
  for (let tries = 0; tries < 400; tries++) {
    const g = new Game(spec.w, spec.h);
    while (!g.isOver && g.moves.length < spec.w * spec.h * 3) g.play(chooseNormalMove(requestFor(g, stars, 'normal')));
    if (g.repeated || g.passes < 2) continue;
    const v = votes(g.board, stars), d = v.black.length - v.white.length - komi;   // 先手の差。0 以下は後手の勝ち
    const redWins = (d > 0) === firstRed;
    if (want === 'close' ? Math.abs(d) <= 1 : (want === 'red') === redWins) return [...g.moves];
  }
  return null;
}

export function devPanel(o: {
  board: () => BoardId;
  komi: () => number;
  /** 赤が先手・両方 PLAYER で、手順 moves の局面から始める */
  start: (board: BoardId, moves: Move[]) => void;
  play: (m: Move) => void;
}): void {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed', left: '8px', bottom: '8px', zIndex: '70', display: 'flex', gap: '4px', alignItems: 'center',
    padding: '4px 6px', borderRadius: '8px', background: 'rgba(10, 16, 40, .78)', color: '#fff', font: '11px system-ui',
  });
  el.innerHTML = '<b style="opacity:.7">DEV</b>';
  for (const [want, label] of [['red', 'RED WIN'], ['blue', 'BLUE WIN'], ['close', 'CLOSE']] as [Want, string][]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    Object.assign(b.style, { minHeight: '0', padding: '3px 8px', fontSize: '11px', borderRadius: '6px', border: 'none', background: 'rgba(255, 255, 255, .18)', color: '#fff' });
    b.addEventListener('click', () => {
      const moves = findGame(o.board(), o.komi(), want);
      if (!moves) { b.textContent = `${label}（なし）`; return; }
      o.start(o.board(), moves.slice(0, -1));
      window.setTimeout(() => o.play(PASS), 900);
    });
    el.appendChild(b);
  }
  document.body.appendChild(el);
}
