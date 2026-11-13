import { EMPTY, opponent, type Cell, type Color } from './types';

/** 隣接点テーブル（点ごとに右・下・左・上、盤外は -1）。盤の縦横ごとにキャッシュ。点は y * w + x */
const nbrCache = new Map<string, Int16Array>();
export function neighbours(w: number, h: number): Int16Array {
  const key = `${w}x${h}`;
  let t = nbrCache.get(key);
  if (t) return t;
  t = new Int16Array(w * h * 4).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x, o = p * 4;
      if (x + 1 < w) t[o] = p + 1;
      if (y + 1 < h) t[o + 1] = p + w;
      if (x > 0) t[o + 2] = p - 1;
      if (y > 0) t[o + 3] = p - w;
    }
  }
  nbrCache.set(key, t);
  return t;
}

export interface Group {
  stones: number[];
  libs: Set<number>;
}

export type PlaceResult =
  | { ok: true; board: Board; captured: number[] }
  | { ok: false; reason: 'occupied' | 'suicide' };

/** 盤面（横 w × 縦 h）。不変として扱う（place は新しい Board を返す） */
export class Board {
  readonly w: number;
  readonly h: number;
  readonly cells: Uint8Array;
  readonly nbr: Int16Array;

  constructor(w: number, h: number, cells?: ArrayLike<number>) {
    this.w = w;
    this.h = h;
    this.cells = cells ? Uint8Array.from(cells) : new Uint8Array(w * h);
    this.nbr = neighbours(w, h);
  }

  get(p: number): Cell {
    return this.cells[p] as Cell;
  }

  /** 超コウ判定用の盤面キー */
  key(): string {
    return this.cells.join('');
  }

  /** p を含む連とその呼吸点 */
  group(p: number): Group {
    const c = this.cells[p], stones = [p], seen = new Set([p]), libs = new Set<number>();
    for (let k = 0; k < stones.length; k++) {
      const o = stones[k] * 4;
      for (let d = 0; d < 4; d++) {
        const q = this.nbr[o + d];
        if (q < 0) continue;
        const v = this.cells[q];
        if (v === EMPTY) libs.add(q);
        else if (v === c && !seen.has(q)) { seen.add(q); stones.push(q); }
      }
    }
    return { stones, libs };
  }

  /** 着手：置く → 呼吸点のない相手の連を取る → 自殺手なら不可。コウは Game 側で判定する */
  place(p: number, c: Color): PlaceResult {
    if (this.cells[p] !== EMPTY) return { ok: false, reason: 'occupied' };
    const next = new Board(this.w, this.h, this.cells);
    next.cells[p] = c;
    const e = opponent(c), captured: number[] = [];
    for (let d = 0; d < 4; d++) {
      const q = this.nbr[p * 4 + d];
      if (q < 0 || next.cells[q] !== e) continue;
      const g = next.group(q);
      if (g.libs.size === 0) for (const s of g.stones) { next.cells[s] = EMPTY; captured.push(s); }
    }
    if (next.group(p).libs.size === 0) return { ok: false, reason: 'suicide' };
    return { ok: true, board: next, captured };
  }
}
