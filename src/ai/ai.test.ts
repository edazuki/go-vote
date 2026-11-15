import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { PASS } from '../core/types';
import { FastBoard } from './fastboard';
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
  }, 60000);
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
      // hard は試行の得点が勝ち負けだけなので、負けの勝率はほぼ 0 になり、ほぼ必ずパスする（100 回中 97 回）。
      // まれに試行のぶれで「勝負がついた」の線（0.1）をまたぐので、種を変えて 9 割以上がパスすることを見る
      let passes = 0;
      for (let s = 1; s <= 10; s++) {
        if (searchMove(requestFor(g, stars, level), { timeMs: 3000, maxPlayouts: 2000 }, seeded(s)) === PASS) passes++;
      }
      expect(passes).toBeGreaterThanOrEqual(9);
    });
  }

  describe('hard：負けが決まった側', () => {
    // 上の青番の局面から、青が自分の陣地の (4,4)、赤が青の陣地の (4,0) に打った局面（青番）。
    // 赤 (4,0) はアタリで取れるが、星は3つとも赤なので、取っても青は 0 対 3 で負け（赤の陣地は狭く、打ち込んでも取られるだけ）
    const lost = [...filled, at(4, 4), at(4, 0)];
    const think = (g: Game, s: number) => searchMove(requestFor(g, stars, 'hard'), { timeMs: 3000, maxPlayouts: 2000 }, seeded(s));

    it('相手がまだパスしていなければ、パスせずに足掻く', () => {
      const g = Game.fromMoves(N, N, lost);
      for (let s = 1; s <= 3; s++) expect(think(g, s)).not.toBe(PASS);
    });

    it('相手がパスした直後は、パスして負けを受け入れる', () => {
      const g = Game.fromMoves(N, N, [...lost, at(4, 2), PASS]);   // 青 (4,2) に赤はパス → 青番
      for (let s = 1; s <= 3; s++) expect(think(g, s)).toBe(PASS);
    });
  });
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

describe('シチョウ', () => {
  /** w×h の盤に黒 X・白 O を置き、手番を決める */
  function board(w: number, h: number, black: [number, number][], white: [number, number][], toMove: 1 | 2): FastBoard {
    const b = new FastBoard(w, h);
    for (const [x, y] of black) b.cells[y * w + x] = 1;
    for (const [x, y] of white) b.cells[y * w + x] = 2;
    b.toMove = toMove;
    return b;
  }
  // ★50（11×9）。白 (2,2) を黒 (2,1)(1,2)(1,3)(3,2) が囲みアタリ。逃げると右下へ階段に追われる
  const B0: [number, number][] = [[2, 1], [1, 2], [1, 3], [3, 2]];
  const W0: [number, number][] = [[2, 2], [9, 1], [9, 3], [1, 7]];
  const p = (x: number, y: number) => y * 11 + x;

  it('あたりがなければ取られ、逃げ道の先に白があれば逃げ切れる', () => {
    expect(board(11, 9, B0, W0, 2).ladderCaptured(p(2, 2))).toBe(true);
    expect(board(11, 9, B0, [...W0, [7, 6]], 2).ladderCaptured(p(2, 2))).toBe(false);
  });

  it('取られるシチョウを逃げる手か', () => {
    expect(board(11, 9, B0, W0, 2).ladderEscapeFails(p(2, 3), 2)).toBe(true);
    expect(board(11, 9, B0, [...W0, [7, 6]], 2).ladderEscapeFails(p(2, 3), 2)).toBe(false);
    // アタリでない点・アタリでない連の隣は逃げる手ではない
    expect(board(11, 9, B0, W0, 2).ladderEscapeFails(p(5, 5), 2)).toBe(false);
    expect(board(11, 9, B0, W0, 2).ladderEscapeFails(p(9, 2), 2)).toBe(false);
  });

  it('囲んでいるアタリの石を取って逃げられる', () => {
    // 7×7。白 (3,3) は (3,4) が最後の呼吸点。伸びると自分からアタリだが、黒 (4,3) もアタリで (4,4) で取れる
    const black: [number, number][] = [[2, 3], [3, 2], [4, 3], [2, 4], [3, 5]];
    expect(board(7, 7, black, [[3, 3], [5, 3], [4, 2]], 2).ladderCaptured(3 * 7 + 3)).toBe(false);
    expect(board(7, 7, black, [[3, 3]], 2).ladderCaptured(3 * 7 + 3)).toBe(true);
  });

  it('呼吸点が2つ以上ある連は取られない', () => {
    expect(board(7, 7, [[2, 3]], [[3, 3]], 2).ladderCaptured(3 * 7 + 3)).toBe(false);
  });

  it('HARD は、4子まで追われた取られるシチョウを逃げない', () => {
    const W = 11, H = 9, stars = Array.from({ length: W * H }, (_, i) => (i % W + ((i / W) | 0)) % 2 === 0);
    // 上の形を手順で作り、3段追う：白 (2,2)(2,3)(3,3)(3,4) の最後の呼吸点は (4,4)。
    // ランダムな試行はシチョウをたどらないので、シチョウ読みなしでは (4,4) に逃げ続ける
    const start = [p(2, 1), p(2, 2), p(1, 2), p(9, 1), p(1, 3), p(9, 3), PASS, p(1, 7), p(3, 2)];
    const steps = [p(2, 3), p(2, 4), p(3, 3), p(4, 3), p(3, 4), p(3, 5)];
    const g = Game.fromMoves(W, H, [...start, ...steps]);
    for (let s = 1; s <= 3; s++) expect(searchMove(requestFor(g, stars, 'hard'), { timeMs: 10000, maxPlayouts: 2000 }, seeded(s))).not.toBe(p(4, 4));
  }, 60000);
});
