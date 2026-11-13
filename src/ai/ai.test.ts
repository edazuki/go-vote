import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { PASS } from '../core/types';
import { boardFrom, searchMove } from './mcts';
import { chooseEasyMove, chooseNormalMove } from './policy';
import { requestFor, winsByPassing, type Level } from './protocol';

const N = 5;
const at = (x: number, y: number) => y * N + x;
const blank = (): boolean[] => Array(N * N).fill(false);
const named = (): boolean[] => Array(N * N).fill(true);

/** 再現できる乱数（mulberry32） */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('FastBoard', () => {
  it('自分の石だけに囲まれた1点は眼、斜めに相手が多いと欠け目', () => {
    // 黒 (1,0)(0,1)(2,1)(1,2) で (1,1) は黒の眼
    const g = Game.fromMoves(N, N, [at(1, 0), PASS, at(0, 1), PASS, at(2, 1), PASS, at(1, 2), PASS]);
    expect(boardFrom(requestFor(g, blank(), 'easy')).isEye(at(1, 1), 1)).toBe(true);
    // 斜め (2,0)(0,2) に白を置くと欠け目（盤の端に接しない点なので、斜めの相手2つで欠け目）
    const h = Game.fromMoves(N, N, [at(1, 0), at(2, 0), at(0, 1), at(0, 2), at(2, 1), PASS, at(1, 2)]);
    expect(boardFrom(requestFor(h, blank(), 'easy')).isEye(at(1, 1), 1)).toBe(false);
  });
});

describe('CPU', () => {
  it('相手がパスし続けると、眼を2つだけ残して盤を埋める', () => {
    const g = new Game(N, N), rand = seeded(5), layout = named();
    for (let i = 0; i < 300 && !g.isOver; i++) {
      const m = g.toMove === 1 ? chooseNormalMove(requestFor(g, layout, 'normal'), rand) : PASS;
      expect(g.play(m).ok).toBe(true);
    }
    expect(g.isOver).toBe(true);
    expect(Array.from(g.board.cells).filter(v => v === 1).length).toBe(N * N - 2);
  });

  it('ふつうは取れる石を取る', () => {
    // 白 (1,0) が (0,0)(2,0) の黒に挟まれてアタリ。黒番で (1,1) が取り
    const g = Game.fromMoves(N, N, [at(0, 0), at(1, 0), at(2, 0), at(4, 4)]);
    expect(chooseNormalMove(requestFor(g, blank(), 'normal'), seeded(1))).toBe(at(1, 1));
  });

  for (const level of ['easy', 'normal'] as Level[]) {
    it(`${level} 同士の対局が終局まで進み、終局時に眼以外の空点を残さない`, () => {
      const g = new Game(N, N), rand = seeded(3), layout = named();
      const choose = level === 'easy' ? chooseEasyMove : chooseNormalMove;
      for (let i = 0; i < 500 && !g.isOver; i++) expect(g.play(choose(requestFor(g, layout, level), rand)).ok).toBe(true);
      expect(g.isOver).toBe(true);
      const b = boardFrom(requestFor(g, layout, level));
      for (let p = 0; p < N * N; p++) {
        if (g.board.get(p) !== 0) continue;
        // 残った空点は、どちらかにとって打てない点か眼
        expect(!b.isLegal(p, 1) || !b.isLegal(p, 2) || b.isEye(p, 1) || b.isEye(p, 2)).toBe(true);
      }
    });
  }

  it('つよい（MCTS）同士の対局が終局まで進む', () => {
    const g = new Game(N, N), rand = seeded(4), layout = named();
    for (let i = 0; i < 200 && !g.isOver; i++) {
      const m = searchMove(requestFor(g, layout, 'hard'), { timeMs: 2000, maxPlayouts: 1000 }, rand);
      expect(g.play(m).ok).toBe(true);
    }
    expect(g.isOver).toBe(true);
    const stones = Array.from(g.board.cells).filter(v => v !== 0).length;
    // 純碁なので、終局時には盤の大半が石で埋まっている
    expect(stones).toBeGreaterThan(N * N * 0.6);
  });
});

describe('星条旗の盤（11×9）', () => {
  it('ふつう同士で終局まで進み、星の多くが石で埋まる', async () => {
    const { BOARDS, starsOf, votes } = await import('../core/flag');
    const spec = BOARDS.flag, stars = starsOf(spec), g = new Game(spec.w, spec.h), rand = seeded(7);
    for (let i = 0; i < 1000 && !g.isOver; i++) expect(g.play(chooseNormalMove(requestFor(g, stars, 'normal'), rand)).ok).toBe(true);
    expect(g.isOver).toBe(true);
    const v = votes(g.board, stars);
    expect(v.black.length + v.white.length).toBeGreaterThan(35);
  });

  for (const hardColor of [1, 2] as const) {
    it(`つよい（${hardColor === 1 ? '赤' : '青'}）はかんたんに得票で勝つ`, async () => {
      const { BOARDS, starsOf, votes, winner } = await import('../core/flag');
      const spec = BOARDS.flag, stars = starsOf(spec), g = new Game(spec.w, spec.h), rand = seeded(9 + hardColor);
      for (let i = 0; i < 400 && !g.isOver; i++) {
        const m = g.toMove === hardColor
          ? searchMove(requestFor(g, stars, 'hard'), { timeMs: 5000, maxPlayouts: 600 }, rand)
          : chooseEasyMove(requestFor(g, stars, 'easy'), rand);
        expect(g.play(m).ok).toBe(true);
      }
      expect(g.isOver).toBe(true);
      expect(winner(votes(g.board, stars))).toBe(hardColor);
    }, 120000);
  }
});

describe('勝負がついた終盤', () => {
  // 5×5。赤が x=2、青が x=3 に壁。星は (0,0)(0,2)(0,4) の3つだけで、どれも赤が埋めた。
  // 赤の陣地に残る空点は星でない点（2つの3目の空き）、青の陣地（x=4）も星なし
  const stars = Array.from({ length: N * N }, (_, i) => [at(0, 0), at(0, 2), at(0, 4)].includes(i));
  const walls = [0, 1, 2, 3, 4].flatMap(y => [at(2, y), at(3, y)]);
  const filled = [...walls, at(0, 0), PASS, at(0, 2), PASS, at(0, 4), PASS, at(1, 2)];

  it('陣地の判定：赤の空き・青の空き・広すぎる空き', () => {
    const b = boardFrom(requestFor(Game.fromMoves(N, N, filled), stars, 'easy'));
    expect(b.territoryOf(at(1, 0), 6)).toBe(1);
    expect(b.territoryOf(at(4, 2), 6)).toBe(2);
    expect(boardFrom(requestFor(Game.fromMoves(N, N, [at(2, 2)]), stars, 'easy')).territoryOf(at(0, 0), 6)).toBe(0);
  });

  it('相手がパスし、自分もパスすれば勝てるときだけ、読まずにパスする（投了を受け入れる）', () => {
    const ok = (moves: number[]) => winsByPassing(requestFor(Game.fromMoves(N, N, moves), stars, 'hard'));
    expect(ok([...filled, PASS])).toBe(true);              // 青がパス、赤は 3 対 0 で勝っている
    expect(ok(filled)).toBe(false);                        // 赤はパスしていない
    expect(ok([...filled, at(4, 0), PASS])).toBe(false);   // 赤がパスしたが、青は負けている
    expect(ok([PASS])).toBe(true);                         // 0 対 0 の同数は後手（半目）の勝ち
  });

  for (const level of ['normal', 'hard'] as Level[]) {
    const think = (g: Game) => level === 'normal'
      ? chooseNormalMove(requestFor(g, stars, level), seeded(1))
      : searchMove(requestFor(g, stars, level), { timeMs: 3000, maxPlayouts: 2000 }, seeded(1));

    it(`${level}：勝っている側は、票にならない点を埋めずにパスする`, () => {
      const g = Game.fromMoves(N, N, [...filled, PASS]);   // 赤番
      expect(think(g)).toBe(PASS);
    });

    it(`${level}：負けている側は、相手の陣地に放り込まずにパスする`, () => {
      const g = Game.fromMoves(N, N, filled);   // 青番
      if (level === 'normal') { expect(think(g)).toBe(PASS); return; }
      // hard はプレイアウトのぶれで、負けの勝率が「勝負がついた」の線（0.1）をまたぐことがあり、
      // パスするのは 7 割ほど（コミ 0 でも半目でも同じ）。種を変えて多数がパスすることを見る
      let passes = 0;
      for (let s = 1; s <= 10; s++) {
        if (searchMove(requestFor(g, stars, level), { timeMs: 3000, maxPlayouts: 2000 }, seeded(s)) === PASS) passes++;
      }
      expect(passes).toBeGreaterThanOrEqual(6);
    });
  }
});

describe('打ち込み', () => {
  it('ふつうは、広い相手の陣地への打ち込みを候補から外さない', () => {
    // 7×7。青が x=2 に壁を作り、x=3..6 の 28 目は青の陣地（広いので打ち込みの余地がある）。赤は x=0 に壁
    const M = 7, p = (x: number, y: number) => y * M + x;
    const moves = [0, 1, 2, 3, 4, 5, 6].flatMap(y => [p(0, y), p(2, y)]);
    // 星は青の陣地の中だけ
    const stars = Array.from({ length: M * M }, (_, i) => i % M >= 3 && ((i % M) + ((i / M) | 0)) % 2 === 0);
    const g = Game.fromMoves(M, M, moves);
    const m = chooseNormalMove(requestFor(g, stars, 'normal'), seeded(2));
    expect(m).not.toBe(PASS);
    expect(m % M).toBeGreaterThanOrEqual(3);
  });
});
