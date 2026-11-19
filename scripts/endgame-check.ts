/*
 * CPU（hard）が、陣地が決まった終盤で無駄な手を打たないかを見る（★50）。
 * 探索（src/ai/mcts.ts）の回数・定数・最後の手選びを変えたときに回す。ランダムな探索なので必ずとは言えず、テストにはしていない
 *
 *   npx tsx scripts/endgame-check.ts [種の数（既定 8）] [プレイアウト回数（既定 5000）]
 *
 * 局面：赤が x=0..5、青が x=6..10 を埋めた ★50（赤番）。赤の陣地には、星1つと星でない点が混ざった 2〜3 目の空きが5つ
 * （青が入っても二眼を作れない）。青の陣地には星でない点の眼が2つ。今の票数は 22 対 23 で、赤は星を2つ埋めれば 24 対 23 で勝つ。
 * 青は毎回パスし、赤は worker.ts と同じく、パスして勝てるなら読まずにパスする。
 * いちばん短い手順は「星・星・パス」の3手。種ごとに赤の手を出し（* が星）、最後に最短だった数と、星でない点を打った数をまとめる。
 * 棋譜は打ち手と一緒に records/ に残す（scripts/record.ts）
 */
import { BOARDS, starsOf, votes } from '../src/core/flag';
import { Game } from '../src/core/game';
import { PASS } from '../src/core/types';
import { searchMove } from '../src/ai/mcts';
import { requestFor, winsByPassing } from '../src/ai/protocol';
import { moveSeed, openRecord, REPO, seeded } from './record';

const seeds = Number(process.argv[2] ?? 8), playouts = Number(process.argv[3] ?? 5000);
const spec = BOARDS.flag, W = spec.w, H = spec.h, stars = starsOf(spec), at = (x: number, y: number) => y * W + x;
const show = (m: number) => (m === PASS ? 'PASS' : `(${m % W},${(m / W) | 0})${stars[m] ? '*' : ''}`);

const holes = [[0, 0], [1, 0], [0, 1], [2, 2], [3, 2], [2, 3], [0, 4], [1, 4], [0, 5], [2, 6], [3, 6], [2, 7], [0, 8], [1, 8]].map(([x, y]) => at(x, y));
const blueEyes = [at(8, 1), at(9, 6)], red: number[] = [], blue: number[] = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (x <= 5 && !holes.includes(at(x, y))) red.push(at(x, y));
    if (x >= 6 && !blueEyes.includes(at(x, y))) blue.push(at(x, y));
  }
}
const setup = Array.from({ length: Math.max(red.length, blue.length) }, (_, i) => [red[i] ?? PASS, blue[i] ?? PASS]).flat();

const record = openRecord('endgame-check', { red: { dir: REPO, level: 'hard', playouts }, blue: { dir: REPO, level: 'pass' } });
let shortest = 0, plain = 0;
for (let s = 1; s <= seeds; s++) {
  const g = Game.fromMoves(W, H, setup), played: number[] = [];
  for (let i = 0; i < 40 && !g.isOver; i++) {
    if (g.toMove === 2) { g.play(PASS); continue; }
    const req = requestFor(g, stars, 'hard');
    const m = winsByPassing(req) ? PASS : searchMove(req, { timeMs: 1e9, maxPlayouts: playouts }, seeded(moveSeed(s, g.moves.length - setup.length)));
    played.push(m);
    g.play(m);
  }
  const v = votes(g.board, stars), wasted = played.filter(m => m !== PASS && !stars[m]).length;
  if (played.length === 3 && stars[played[0]] && stars[played[1]] && played[2] === PASS) shortest++;
  plain += wasted;
  console.log(`seed ${s}: ${played.map(show).join(' ')}  → ${v.black.length} 対 ${v.white.length}`);
  record.game({
    board: 'flag', w: W, h: H, komi: requestFor(g, stars, 'hard').komi ?? 0, black: 'red', white: 'blue', seeds: { black: s }, setup, moves: g.moves.slice(setup.length),
    votes: `${v.black.length}-${v.white.length}`, winner: v.black.length > v.white.length ? 'black' : 'white',
  });
}
console.log(`最短（星・星・パス）: ${shortest}/${seeds}　星でない点を打った数: ${plain}`);
