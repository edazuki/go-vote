/*
 * CPU（hard = MCTS）の強さと、釣り合いのコミを調べる。打ち方は worker.ts と同じ（searchMove の中でパスも決める）。
 * 方法は 世紀末囲碁 の docs/research/mcts-search-depth.md にならう。回数を決めた結果は src/ai/protocol.ts の playoutsFor に
 *
 *   npx tsx scripts/bench.ts rate                                       盤ごとのプレイアウト速度
 *   npx tsx scripts/bench.ts same   <board> <komi> <局数> <N>             同じ回数どうし：先手の勝率
 *   npx tsx scripts/bench.ts vs     <board> <komi> <局数> <先手> <後手>       先手・後手を別々に（数 = 回数、t2500 = 回数の上限なしで 2.5 秒、easy / normal）
 *   npx tsx scripts/bench.ts ladder <board> <komi> <各手番の局数> <R> <N>   N 回 対 基準 R 回（先後入れ替え）。R は easy / normal も可
 *
 * コミは後手に足す票（先手の票 − 後手の票 − コミ > 0 で先手の勝ち）。結果は1行の JSON で出す
 */
import { BOARDS, isBoardId, starsOf, type BoardId } from '../src/core/flag';
import { Game } from '../src/core/game';
import { BLACK, WHITE, type Color } from '../src/core/types';
import { searchMove } from '../src/ai/mcts';
import { chooseEasyMove, chooseNormalMove } from '../src/ai/policy';
import { requestFor } from '../src/ai/protocol';

interface Result { winner: Color | 0; margin: number; moves: number; ms: number }

/** 引数の最後に plain：終局まわりの手当てを使わない素の MCTS で打つ */
const plain = process.argv.at(-1) === 'plain';

/** 打ち手：数 = その回数の MCTS（hard）、{ms} = 回数の上限なしでその時間だけ読む MCTS、easy / normal = その強さの CPU */
type Player = number | { ms: number } | 'easy' | 'normal';
const player = (s: string): Player => (s === 'easy' || s === 'normal' ? s : s.startsWith('t') ? { ms: Number(s.slice(1)) } : Number(s));

/** 先手 = p1、後手 = p2 で1局打つ。margin は先手の票 − 後手の票（コミ前） */
function play(board: BoardId, komi: number, p1: Player, p2: Player): Result {
  const spec = BOARDS[board], stars = starsOf(spec), g = new Game(spec.w, spec.h), t0 = performance.now();
  while (!g.isOver && g.moves.length < spec.w * spec.h * 3) {
    const p = g.toMove === BLACK ? p1 : p2, req = { ...requestFor(g, stars, 'hard'), komi };
    g.play(p === 'easy' ? chooseEasyMove(req) : p === 'normal' ? chooseNormalMove(req)
      : typeof p === 'object' ? searchMove(req, { timeMs: p.ms, plain })
      : searchMove(req, { timeMs: 1e9, maxPlayouts: p, plain }));
  }
  let margin = 0;
  stars.forEach((s, p) => { if (s) margin += g.board.get(p) === BLACK ? 1 : g.board.get(p) === WHITE ? -1 : 0; });
  const d = margin - komi;
  return { winner: d > 0 ? BLACK : d < 0 ? WHITE : 0, margin, moves: g.moves.length, ms: performance.now() - t0 };
}

const [mode, ...args] = process.argv.slice(2);
const out = (o: object) => console.log(JSON.stringify(o));

if (mode === 'rate') {
  for (const id of Object.keys(BOARDS) as BoardId[]) {
    const spec = BOARDS[id], stars = starsOf(spec), g = new Game(spec.w, spec.h), res: number[] = [];
    for (const at of [0, Math.floor(spec.w * spec.h * 0.3)]) {
      while (g.moves.length < at && !g.isOver) g.play(chooseEasyMove(requestFor(g, stars, 'easy')));
      const req = requestFor(g, stars, 'hard'), N = 3000, t0 = performance.now();
      searchMove(req, { timeMs: 1e9, maxPlayouts: N });
      res.push(Math.round(N / ((performance.now() - t0) / 1000)));
    }
    out({ mode, board: id, opening: res[0], middle: res[1] });
  }
} else if (mode === 'vs') {
  const [board, komi, games, p1, p2] = args;
  if (!isBoardId(board)) throw new Error(`board: ${board}`);
  for (let i = 0; i < Number(games); i++) out({ mode, board, komi: Number(komi), p1, p2, ...play(board, Number(komi), player(p1), player(p2)) });
} else if (mode === 'same' || mode === 'ladder') {
  const board = args[0];
  if (!isBoardId(board)) throw new Error(`board: ${board}`);
  const komi = Number(args[1]), games = Number(args[2]);
  if (mode === 'same') {
    const N = Number(args[3]);
    for (let i = 0; i < games; i++) out({ mode, board, komi, N, plain, ...play(board, komi, N, N) });
  } else {
    const R = player(args[3]) as number | 'easy' | 'normal', N = Number(args[4]);
    // N が先手の局と後手の局を同じ数ずつ。testFirst = N が先手か
    for (let i = 0; i < games; i++) {
      for (const testFirst of [true, false]) {
        const r = play(board, komi, testFirst ? N : R, testFirst ? R : N);
        const testWon = r.winner === 0 ? 0.5 : (r.winner === BLACK) === testFirst ? 1 : 0;
        out({ mode, board, komi, R, N, testFirst, testWon, ...r });
      }
    }
  }
} else {
  throw new Error('mode: rate | same | ladder');
}
