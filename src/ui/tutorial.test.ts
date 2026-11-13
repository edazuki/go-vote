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

  it('取る盤：赤が真ん中の青を取り、続けて青が左下の隅の赤を取る', () => {
    const s = STEPS.find(x => x.title === 'CAPTURE')!, g = Game.fromMoves(W, H, s.setup);
    const red = g.play(s.demo[0]), blue = g.play(s.demo[1]);
    expect(red.ok && red.captured).toEqual([3 + 1 * W]);
    expect(blue.ok && blue.captured).toEqual([0 + 4 * W]);
  });

  it('大きく囲む盤：赤が内側の空き点を埋めると、最後の1手で 14 個まとめて取られる', () => {
    const s = STEPS.find(x => x.title === 'SURROUND THEM ALL')!, g = Game.fromMoves(W, H, [...s.setup, ...s.demo.slice(0, -1)]);
    const r = g.play(s.demo[s.demo.length - 1]);
    expect(r.ok && r.captured.length).toBe(14);
  });

  it('開票の盤は赤 9 − 8 青で、赤の眼の星が1つ空いている', () => {
    const v = final('COUNT THE VOTES');
    expect([v.black.length, v.white.length]).toEqual([9, 8]);
    expect(v.free).toEqual([0 + 2 * W]);
  });

  it('KOMI の盤は 9 − 9 の同数で、後手（青）の勝ち', () => {
    const v = final('KOMI');
    expect([v.black.length, v.white.length]).toEqual([9, 9]);
    expect(v.free).toHaveLength(0);
    expect(winner(v)).toBe(WHITE);
  });
});
