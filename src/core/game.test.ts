import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { BLACK, PASS, WHITE } from './types';

const at = (x: number, y: number, n = 5) => y * n + x;

describe('投了', () => {
  it('どちらの手番でも投了でき、終局してそれ以上は打てない', () => {
    const g = Game.fromMoves(5, 5, [0]);
    expect(g.resign(BLACK)).toBe(true);
    expect(g.isOver).toBe(true);
    expect(g.resigned).toBe(BLACK);
    expect(g.play(1).ok).toBe(false);
    expect(g.resign(WHITE)).toBe(false);
  });
});

describe('Game（純碁ベース）', () => {
  it('黒から交互に打つ', () => {
    const g = new Game(5, 5);
    expect(g.play(at(2, 2)).ok).toBe(true);
    expect(g.board.get(at(2, 2))).toBe(BLACK);
    expect(g.toMove).toBe(WHITE);
  });

  it('埋まった点・自殺手には打てない', () => {
    const g = Game.fromMoves(5, 5, [at(1, 0), PASS, at(0, 1)]);
    expect(g.play(at(1, 0))).toEqual({ ok: false, reason: 'occupied' });
    expect(g.play(at(0, 0))).toEqual({ ok: false, reason: 'suicide' });
  });

  it('囲んだ石を取る', () => {
    const g = Game.fromMoves(5, 5, [at(1, 0), at(0, 0)]);
    const r = g.play(at(0, 1));
    expect(r).toEqual({ ok: true, captured: [at(0, 0)] });
    expect(g.board.get(at(0, 0))).toBe(0);
  });

  it('コウはすぐには取り返せない', () => {
    // 黒 (1,0)(0,1)(1,2) と白 (2,0)(3,1)(2,2) の間で、白 (1,1) を黒 (2,1) が取る
    const g = Game.fromMoves(5, 5, [
      at(1, 0), at(2, 0), at(0, 1), at(3, 1), at(1, 2), at(2, 2), PASS, at(1, 1), at(2, 1),
    ]);
    // 黒 (2,1) で白 (1,1) を取った。白はすぐ (1,1) に取り返せない
    expect(g.board.get(at(1, 1))).toBe(0);
    expect(g.play(at(1, 1))).toEqual({ ok: false, reason: 'ko' });
  });

  it('パス2回で終局', () => {
    const g = Game.fromMoves(5, 5, [at(2, 2), PASS]);
    expect(g.isOver).toBe(false);
    g.play(PASS);
    expect(g.isOver).toBe(true);
    expect(g.play(at(0, 0))).toEqual({ ok: false, reason: 'over' });
  });

  it('手順から復元できる', () => {
    const a = Game.fromMoves(5, 5, [at(1, 0), at(0, 0), at(0, 1)]);
    expect(Array.from(a.board.cells)).toEqual(Array.from(Game.fromMoves(5, 5, a.moves).board.cells));
  });
});

describe('横長の盤', () => {
  it('11×9 の右下の隅で取れる', () => {
    const w = 11, h = 9, p = (x: number, y: number) => y * w + x;
    const g = Game.fromMoves(w, h, [p(9, 8), p(10, 8)]);
    expect(g.play(p(10, 7))).toEqual({ ok: true, captured: [p(10, 8)] });
  });
});
