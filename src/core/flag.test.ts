import { describe, expect, it } from 'vitest';
import { BOARDS, KOMI_CHOICES, majorityOf, shownPct, starCount, starsOf, votes, winner } from './flag';
import { Game } from './game';
import { BLACK, WHITE } from './types';

describe('星の配置', () => {
  const rowsOf = (id: keyof typeof BOARDS) => {
    const spec = BOARDS[id], s = starsOf(spec);
    expect(s.length).toBe(spec.w * spec.h);
    return Array.from({ length: spec.h }, (_, y) => s.slice(y * spec.w, (y + 1) * spec.w).filter(Boolean).length).filter(n => n > 0);
  };

  it('星条旗の盤は星50個で、6個と5個の段が交互に9段', () => {
    for (const id of ['flag', 'flag-wide'] as const) {
      expect(rowsOf(id)).toEqual([6, 5, 6, 5, 6, 5, 6, 5, 6]);
      expect(starCount(starsOf(BOARDS[id]))).toBe(50);
    }
    expect(majorityOf(50)).toBe(26);
  });

  it('星13の盤は、3個と2個の段が交互に5段', () => {
    for (const id of ['small5', 'small7'] as const) {
      expect(rowsOf(id)).toEqual([3, 2, 3, 2, 3]);
      expect(starCount(starsOf(BOARDS[id]))).toBe(13);
    }
    expect(majorityOf(13)).toBe(7);
  });

  it('余白ありの盤は外周に星がない', () => {
    for (const id of ['small7', 'flag-wide'] as const) {
      const spec = BOARDS[id], s = starsOf(spec);
      for (let x = 0; x < spec.w; x++) expect(s[x] || s[(spec.h - 1) * spec.w + x]).toBe(false);
      for (let y = 0; y < spec.h; y++) expect(s[y * spec.w] || s[y * spec.w + spec.w - 1]).toBe(false);
    }
  });

  it('星の上の石だけが得票になる', () => {
    const spec = BOARDS.flag, s = starsOf(spec);
    // (0,0) は星、(1,0) は星でない、(2,0) は星
    const g = Game.fromMoves(spec.w, spec.h, [0, 1, 2]);
    const v = votes(g.board, s);
    expect(v.black).toEqual([0, 2]);
    expect(v.white).toEqual([]);
    expect(v.free.length).toBe(50 - 2);
    expect(winner(v)).toBe(BLACK);
    expect(winner(votes(Game.fromMoves(spec.w, spec.h, [1, 0]).board, s))).toBe(WHITE);
    expect(winner(votes(Game.fromMoves(spec.w, spec.h, []).board, s))).toBe(WHITE);   // 同数は半目で後手
  });

  it('得票率は 0.1% 刻みで、後手に半目を足す。同数でも後手が上に見え、全部埋まれば合計 100.0%', () => {
    const v = (b: number, w: number) => ({ black: Array(b).fill(0), white: Array(w).fill(0), free: [] });
    expect(shownPct(v(25, 25), 50)).toEqual({ black: 49.9, white: 50.1 });
    expect(shownPct(v(0, 0), 50)).toEqual({ black: 0, white: 0.1 });
    expect(shownPct(v(0, 0), 13)).toEqual({ black: 0, white: 0.1 });
    for (const total of [13, 50]) {
      for (let n = 0; n <= total / 2; n++) {
        const s = shownPct(v(n, n), total);
        expect(s.white).toBeGreaterThan(s.black);
      }
      for (let b = 0; b <= total; b++) {
        const s = shownPct(v(b, total - b), total);
        expect(Math.round((s.black + s.white) * 10)).toBe(1000);
      }
    }
    // 自分の得票率は相手の票で変わらない
    expect(shownPct(v(6, 5), 13).black).toBe(shownPct(v(6, 6), 13).black);
  });

  it('コミ：後手の票に足して勝ち負けを決め（同数なら後手）、得票率の分母にも入れる', () => {
    const v = (b: number, w: number) => ({ black: Array(b).fill(0), white: Array(w).fill(0), free: [] });
    expect(winner(v(28, 22), 3)).toBe(BLACK);
    expect(winner(v(26, 24), 3)).toBe(WHITE);
    expect(winner(v(27, 24), 3)).toBe(WHITE);   // 27 対 24 + 3 の同数は後手
    for (const total of [13, 50]) {
      for (const komi of KOMI_CHOICES) {
        for (let w = 0; w + komi + w <= total; w++) {
          const s = shownPct(v(w + komi, w), total, komi);
          expect(s.white).toBeGreaterThan(s.black);
        }
        for (let b = 0; b <= total; b++) {
          const s = shownPct(v(b, total - b), total, komi);
          expect(s.black + s.white).toBeLessThanOrEqual(100.0001);
        }
      }
    }
    expect(shownPct(v(26, 24), 50, 3)).toEqual({ black: 49, white: 51 });
  });
});

describe('党と手番', () => {
  it('先手が赤なら 先手 = 赤・後手 = 青、先手が青なら逆', async () => {
    const { partyOf, colorOfParty } = await import('./flag');
    expect([partyOf(BLACK, true), partyOf(WHITE, true)]).toEqual(['red', 'blue']);
    expect([partyOf(BLACK, false), partyOf(WHITE, false)]).toEqual(['blue', 'red']);
    for (const firstRed of [true, false]) {
      for (const c of [BLACK, WHITE] as const) expect(colorOfParty(partyOf(c, firstRed), firstRed)).toBe(c);
    }
  });
});
