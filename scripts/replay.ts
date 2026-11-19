/*
 * records/ に残した棋譜の途中の局面から、いまの作業ツリーの CPU に何度か考えさせ、どの手を選ぶかを数える（記録の残し方は scripts/record.ts）
 *
 *   npx tsx scripts/replay.ts <棋譜（records/….jsonl）> <局（1 から）> <手数> [試す回数（既定 20）] [プレイアウト回数（既定は記録の打ち手の値）]
 *
 * 手数 = 局面までに打った手の数（途中から始めた局の始めの手順 setup は数えない）。0 なら始めの局面。
 * まず記録の種で1回考えさせ（コードと回数が記録と同じなら、記録と同じ手になる）、続けて種を 1 から順に変えて数える。
 * その局面の手番の打ち手の強さで考えさせる。記録の打ち手とコードが違うときはそう出す
 */
import { BOARDS, isBoardId, starsOf, votes } from '../src/core/flag';
import { Game } from '../src/core/game';
import { BLACK, PASS, WHITE } from '../src/core/types';
import { searchMove } from '../src/ai/mcts';
import { chooseEasyMove, chooseNormalMove } from '../src/ai/policy';
import { requestFor, winsByPassing } from '../src/ai/protocol';
import { moveSeed, readRecord, REPO, seeded, snapshot } from './record';

const [file, nth, upto, triesArg, playoutsArg] = process.argv.slice(2);
if (!file || !nth || upto === undefined) throw new Error('npx tsx scripts/replay.ts <棋譜> <局（1 から）> <手数> [試す回数] [プレイアウト回数]');
const { info, games } = readRecord(file), rec = games[Number(nth) - 1];
if (!rec) throw new Error(`局 ${nth} がない（${games.length} 局）`);
if (!isBoardId(rec.board)) throw new Error(`board: ${rec.board}`);
const k = Number(upto), stars = starsOf(BOARDS[rec.board]), W = rec.w;
const g = Game.fromMoves(rec.w, rec.h, [...(rec.setup ?? []), ...rec.moves.slice(0, k)]);
const who = g.toMove === BLACK ? rec.black : rec.white, cpu = info.cpus[who];
const show = (m: number) => (m === PASS ? 'PASS' : `(${m % W},${(m / W) | 0})${stars[m] ? '*' : ''}`);

const now = snapshot(REPO);

console.log(`${file} の ${nth} 局目、${k} 手目まで（全 ${rec.moves.length} 手、${rec.votes}、${rec.winner === 'black' ? '先手' : '後手'}の勝ち）`);
for (let y = 0; y < rec.h; y++) {
  let row = '';
  for (let x = 0; x < W; x++) {
    const p = y * W + x, c = g.board.get(p);
    row += (c === BLACK ? 'X' : c === WHITE ? 'O' : stars[p] ? '*' : '.') + ' ';
  }
  console.log(row);
}
const v = votes(g.board, stars);
console.log(`票 ${v.black.length} 対 ${v.white.length}（空き星 ${v.free.length}）、手番 ${g.toMove === BLACK ? '先手 X' : '後手 O'} = ${who}`);
console.log(`記録の打ち手：${JSON.stringify(cpu)}`);
console.log(cpu.code === now.code ? 'いまのコードは記録の打ち手と同じ' : `いまのコード（${now.code}）は記録の打ち手（${cpu.code}）と違う`);
console.log(`記録で打った手：${k < rec.moves.length ? show(rec.moves[k]) : '（終局）'}${rec.rates?.[k] != null ? `（見込みの勝率 ${rec.rates[k]}）` : ''}`);

const tries = Number(triesArg ?? 20), playouts = Number(playoutsArg ?? cpu.playouts ?? 3000), count = new Map<number, number>(), rates = new Map<number, number[]>();
let rate: number | null = null;
const think = (rand: () => number) => {
  rate = null;
  const req = { ...requestFor(g, stars, cpu.level === 'pass' ? 'hard' : cpu.level), komi: rec.komi };
  return cpu.level === 'pass' || (!cpu.plain && winsByPassing(req)) ? PASS
    : cpu.level === 'easy' ? chooseEasyMove(req, rand)
    : cpu.level === 'normal' ? chooseNormalMove(req, rand)
    : searchMove(req, { timeMs: 1e9, maxPlayouts: playouts, plain: cpu.plain, report: r => { rate = r.rate; } }, rand);
};
const seed = g.toMove === BLACK ? rec.seeds?.black : rec.seeds?.white;
if (seed !== undefined && k < rec.moves.length) {
  const m = think(seeded(moveSeed(seed, k)));
  console.log(`記録の種で：${show(m)}${m === rec.moves[k] ? '（記録と同じ）' : '（記録と違う）'}`);
}
for (let s = 1; s <= tries; s++) {
  const m = think(seeded(s));
  count.set(m, (count.get(m) ?? 0) + 1);
  if (rate !== null) rates.set(m, [...(rates.get(m) ?? []), rate]);
}
console.log(`いまの CPU（${cpu.level}、${playouts} 回）を ${tries} 回：`);
for (const [m, n] of [...count].sort((a, b) => b[1] - a[1])) {
  const r = rates.get(m), avg = r ? (r.reduce((a, b) => a + b, 0) / r.length).toFixed(3) : '';
  console.log(`  ${show(m).padEnd(10)} ${n}${avg ? `　見込みの勝率 ${avg}` : ''}`);
}
