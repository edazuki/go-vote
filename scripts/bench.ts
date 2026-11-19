/*
 * CPU（hard = MCTS）の強さと、釣り合いのコミを調べる。打ち方は worker.ts と同じ（相手のパスにパスで勝てるなら読まずにパス。plain のときは素の MCTS だけ）。
 * 方法は 世紀末囲碁 の docs/research/mcts-search-depth.md にならう。回数を決めた結果は src/ai/protocol.ts の playoutsFor に
 *
 *   npx tsx scripts/bench.ts rate                                       盤ごとのプレイアウト速度
 *   npx tsx scripts/bench.ts same   <board> <komi> <局数> <N>             同じ回数どうし：先手の勝率
 *   npx tsx scripts/bench.ts vs     <board> <komi> <局数> <先手> <後手>       先手・後手を別々に（数 = 回数、t2500 = 回数の上限なしで 2.5 秒、easy / normal）
 *   npx tsx scripts/bench.ts ladder <board> <komi> <各手番の局数> <R> <N>   N 回 対 基準 R 回（先後入れ替え）。R は easy / normal も可
 *
 * コミは後手に足す票（先手の票 − 後手の票 − コミ > 0 で先手の勝ち）。結果は1行の JSON で出す
 * vs / same / ladder の棋譜は、打ち手と一緒に records/ に残す（scripts/record.ts。途中の局面は scripts/replay.ts で見直せる）
 */
import { BOARDS, isBoardId, starsOf, type BoardId } from '../src/core/flag';
import { Game } from '../src/core/game';
import { BLACK, PASS, WHITE, type Color } from '../src/core/types';
import { searchMove } from '../src/ai/mcts';
import { chooseEasyMove, chooseNormalMove } from '../src/ai/policy';
import { requestFor, winsByPassing } from '../src/ai/protocol';
import { moveSeed, newSeed, openRecord, REPO, seeded, type CpuSpec } from './record';

interface Result { winner: Color | 0; margin: number; moves: number; ms: number }

/** 引数の最後に plain：終局まわりの手当てを使わない素の MCTS で打つ */
const plain = process.argv.at(-1) === 'plain';

/** 打ち手：数 = その回数の MCTS（hard）、{ms} = 回数の上限なしでその時間だけ読む MCTS、easy / normal = その強さの CPU */
type Player = number | { ms: number } | 'easy' | 'normal';
const player = (s: string): Player => (s === 'easy' || s === 'normal' ? s : s.startsWith('t') ? { ms: Number(s.slice(1)) } : Number(s));

/** 打ち手の引数（3000・t2500・easy など）を、記録に残す CPU の形に */
const cpuOf = (s: string): CpuSpec => {
  const p = player(s);
  return {
    dir: REPO, level: typeof p === 'string' ? p : 'hard',
    ...(typeof p === 'number' ? { playouts: p } : typeof p === 'object' ? { timeMs: p.ms } : {}),
    ...(plain ? { plain: true } : {}),
  };
};

/** 棋譜を残す先（vs / same / ladder のとき） */
let record: ReturnType<typeof openRecord> | null = null;

/** 先手 = p1、後手 = p2 で1局打つ。margin は先手の票 − 後手の票（コミ前）。names は記録に書く打ち手の名前 */
function play(board: BoardId, komi: number, p1: Player, p2: Player, names: [string, string]): Result {
  const spec = BOARDS[board], stars = starsOf(spec), g = new Game(spec.w, spec.h), t0 = performance.now();
  const seeds = { black: newSeed(), white: newSeed() }, rates: (number | null)[] = [];
  while (!g.isOver && g.moves.length < spec.w * spec.h * 3) {
    const p = g.toMove === BLACK ? p1 : p2, req = { ...requestFor(g, stars, 'hard'), komi };
    const rand = seeded(moveSeed(g.toMove === BLACK ? seeds.black : seeds.white, g.moves.length));
    let rate: number | null = null;
    const report = (r: { rate: number }) => { rate = Math.round(r.rate * 1000) / 1000; };
    g.play(!plain && winsByPassing(req) ? PASS : p === 'easy' ? chooseEasyMove(req, rand) : p === 'normal' ? chooseNormalMove(req, rand)
      : typeof p === 'object' ? searchMove(req, { timeMs: p.ms, plain, report }, rand)
      : searchMove(req, { timeMs: 1e9, maxPlayouts: p, plain, report }, rand));
    rates.push(rate);
  }
  let b = 0, w = 0;
  stars.forEach((s, p) => { if (s) { const c = g.board.get(p); if (c === BLACK) b++; else if (c === WHITE) w++; } });
  const margin = b - w, d = margin - komi, winner = d > 0 ? BLACK : d < 0 ? WHITE : 0;
  record?.game({
    board, w: spec.w, h: spec.h, komi, black: names[0], white: names[1], seeds, moves: [...g.moves], rates,
    votes: `${b}-${w}`, winner: winner === BLACK ? 'black' : 'white',
  });
  return { winner, margin, moves: g.moves.length, ms: performance.now() - t0 };
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
  record = openRecord(`vs-${board}-${p1}-${p2}`, { [p1]: cpuOf(p1), [p2]: cpuOf(p2) }, { mode, board, komi: Number(komi) });
  for (let i = 0; i < Number(games); i++) out({ mode, board, komi: Number(komi), p1, p2, ...play(board, Number(komi), player(p1), player(p2), [p1, p2]) });
} else if (mode === 'same' || mode === 'ladder') {
  const board = args[0];
  if (!isBoardId(board)) throw new Error(`board: ${board}`);
  const komi = Number(args[1]), games = Number(args[2]);
  if (mode === 'same') {
    const N = Number(args[3]);
    record = openRecord(`same-${board}-${N}`, { [N]: cpuOf(String(N)) }, { mode, board, komi });
    for (let i = 0; i < games; i++) out({ mode, board, komi, N, plain, ...play(board, komi, N, N, [String(N), String(N)]) });
  } else {
    const R = player(args[3]) as number | 'easy' | 'normal', N = Number(args[4]), names = [`基準 ${args[3]}`, `試す ${N}`];
    record = openRecord(`ladder-${board}-${args[3]}-${N}`, { [names[0]]: cpuOf(args[3]), [names[1]]: cpuOf(String(N)) }, { mode, board, komi });
    // N が先手の局と後手の局を同じ数ずつ。testFirst = N が先手か
    for (let i = 0; i < games; i++) {
      for (const testFirst of [true, false]) {
        const r = play(board, komi, testFirst ? N : R, testFirst ? R : N, testFirst ? [names[1], names[0]] : [names[0], names[1]]);
        const testWon = r.winner === 0 ? 0.5 : (r.winner === BLACK) === testFirst ? 1 : 0;
        out({ mode, board, komi, R, N, testFirst, testWon, ...r });
      }
    }
  }
} else {
  throw new Error('mode: rate | same | ladder');
}
