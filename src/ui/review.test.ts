import { describe, expect, it } from 'vitest';
import { BOARDS, starsOf } from '../core/flag';
import { PASS } from '../core/types';
import { voteSeries } from './review';

describe('振り返りの推移', () => {
  const spec = BOARDS.small5, stars = starsOf(spec);
  const starPts = stars.flatMap((s, p) => (s ? [p] : []));

  it('打つ前から最後の手まで、手数 + 1 点。打つ前の形勢は半目のぶんだけ後手寄り', () => {
    const moves = [starPts[0], starPts[1], PASS, PASS];
    const s = voteSeries(spec.w, spec.h, moves, stars, 0, true);
    expect(s).toHaveLength(moves.length + 1);
    expect(s[0].red).toBe(0);
    expect(s[0].lean).toBeLessThan(50);
    expect(s[0].lean).toBeGreaterThan(49.9);
    // 赤（先手）が星を取ると、得票と形勢が上がる
    expect(s[1].red).toBeGreaterThan(0);
    expect(s[1].lean).toBeGreaterThan(s[0].lean);
    // パスでは変わらない
    expect(s[4]).toEqual(s[2]);
  });

  it('先手が青なら、赤（後手）の側に半目とコミが入る', () => {
    const s = voteSeries(spec.w, spec.h, [], stars, 3, false);
    expect(s[0].red).toBeGreaterThan(s[0].blue);
    expect(s[0].lean).toBeGreaterThan(50);
  });
});
