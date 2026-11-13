import { describe, expect, it } from 'vitest';
import { votes, winner } from '../core/flag';
import { WHITE } from '../core/types';
import { Game } from '../core/game';
import { TUTORIAL_FOR_TEST } from './tutorial';

describe('遊び方', () => {
  const { W, H, STARS, STEPS } = TUTORIAL_FOR_TEST;
  for (const s of STEPS) {
    it(`「${s.title}」の手順がすべて打てて、途中で終局しない`, () => {
      const g = Game.fromMoves(W, H, [...s.setup, ...s.demo]);
      expect(g.isOver).toBe(false);
    });
  }

  const final = (title: string) => {
    const s = STEPS.find(x => x.title === title)!;
    return votes(Game.fromMoves(W, H, [...s.setup, ...s.demo]).board, STARS);
  };

  it('大きく囲む盤：赤が内側の空き点を埋めると、最後の1手で 14 個まとめて取られる', () => {
    const s = STEPS.find(x => x.title === 'SURROUND THEM ALL')!, g = Game.fromMoves(W, H, [...s.setup, ...s.demo.slice(0, -1)]);
    const r = g.play(s.demo[s.demo.length - 1]);
    expect(r.ok && r.captured.length).toBe(14);
  });

  it('開票の盤は赤 10 − 8 青', () => {
    const v = final('COUNT THE VOTES');
    expect([v.black.length, v.white.length]).toEqual([10, 8]);
  });

  it('KOMI の盤は 9 − 9 の同数で、後手（青）の勝ち', () => {
    const v = final('KOMI');
    expect([v.black.length, v.white.length]).toEqual([9, 9]);
    expect(v.free).toHaveLength(0);
    expect(winner(v)).toBe(WHITE);
  });
});
