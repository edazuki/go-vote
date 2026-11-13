/*
 * OGP 画像（tools/og-lab）に使う局面を探す：★50 で HARD 同士をゲームと同じ条件で打ち、1局ごとに手順を1行の JSON で出す。
 * 先手は回数の上限あり、後手は上限なしで 2.5 秒読む。相手のパスを受ければ勝てるときはパスで受ける（worker.ts と同じ）
 *
 *   npx tsx scripts/og-game.ts <局数> >> tools/og-games.jsonl
 *
 * margin = 先手の票 − 後手の票、empty = 石の乗っていない星の数
 */
import { BOARDS, starsOf } from '../src/core/flag';
import { Game } from '../src/core/game';
import { BLACK, PASS, WHITE } from '../src/core/types';
import { searchMove } from '../src/ai/mcts';
import { requestFor, winsByPassing } from '../src/ai/protocol';

const spec = BOARDS.flag, stars = starsOf(spec), games = Number(process.argv[2] ?? 1);
for (let i = 0; i < games; i++) {
  const g = new Game(spec.w, spec.h), t0 = performance.now();
  while (!g.isOver && g.moves.length < spec.w * spec.h * 3) {
    const req = requestFor(g, stars, 'hard');
    const noCap = g.toMove !== BLACK;
    g.play(winsByPassing(req) ? PASS : searchMove(req, { timeMs: req.thinkMs, maxPlayouts: noCap ? undefined : req.maxPlayouts }));
  }
  let margin = 0, empty = 0;
  stars.forEach((s, p) => {
    if (!s) return;
    const c = g.board.get(p);
    if (c === BLACK) margin++; else if (c === WHITE) margin--; else empty++;
  });
  console.log(JSON.stringify({ margin, empty, passes: g.passes, repeated: g.repeated, n: g.moves.length, sec: Math.round((performance.now() - t0) / 1000), moves: g.moves }));
}
