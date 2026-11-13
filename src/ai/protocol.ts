import { komiTotal } from '../core/flag';
import type { Game } from '../core/game';
import { BLACK, PASS, type Color, type Move } from '../core/types';

/**
 * CPU の強さ。easy = 眼を埋めない手からランダム、normal = 1手読み（取り・アタリ逃げ・星の点）、
 * hard = MCTS（星の上の石を相手より多く盤上に残すことを目指す）
 */
export type Level = 'easy' | 'normal' | 'hard';

export const LEVELS: Level[] = ['easy', 'normal', 'hard'];

export const THINK_MS: Record<Level, number> = { easy: 0, normal: 0, hard: 2500 };

/**
 * MCTS のプレイアウト回数の上限（回数で決めると端末の速さによらず強さがそろう。遅い端末や広い盤では THINK_MS が先に効く）。
 * 5×5（★13）は入門用の盤なので、わざと読みを浅くしている：同じ回数どうしで先手が勝つ割合が
 * 2,000 回以上ではほぼ 100%、500 回で 9 割、300 回で 8 割強（scripts/bench.ts same、各 30 局）。
 * 先手でもたまに崩れる 300〜500 回の範囲の上のほうを使う。
 * 7×7（★13 WIDE）は 300〜10,000 回のどれでも先手が 8〜9 割勝ち（先手の有利は回数でなく盤の形による）、
 * 3,000 回でも 10,000 回と大きく変わらないので、待ち時間の短い 3,000 回にする
 */
export function playoutsFor(level: Level, points: number): number {
  if (level !== 'hard') return 0;
  return points <= 25 ? 500 : points <= 49 ? 3000 : 20000;
}

/**
 * すぐ答えが出ても、これだけは考えるふりをする（ms の範囲 [最短, 最長]）。
 * HARD は思考時間の上限（THINK_MS）の 2.5 秒前後にそろえる（回数の上限で早く読み終えても、待ち時間は変わらない）
 */
export const PRETEND_MS: Record<Level, [number, number]> = { easy: [1000, 1800], normal: [1200, 2000], hard: [2300, 2700] };

/**
 * 交点の重み：星は 1、星でない点は 0（票にならない）。
 * 星でない点は、つなぎ・囲い・眼として勝ち負けを通してだけ意味を持つ（探索が勝率で判断する）
 */
export const STAR_WEIGHT = 1, PLAIN_WEIGHT = 0;

/**
 * 相手の陣地への打ち込みを「取られるだけ」とみなす空きの広さの上限。
 * これより広い空きには、星の点で二眼を作って生きる打ち込みがありうるので、無駄とは決めつけない
 */
export const DEAD_INVASION_SIZE = 6;
/** 自分の陣地とみなす空きの広さの上限（盤の点の数に対して。序盤の広い空きはまだ陣地ではない） */
export const ownTerritorySize = (points: number) => Math.max(4, points >> 2);
export const weightsOf = (stars: readonly boolean[]): number[] => stars.map(s => (s ? STAR_WEIGHT : PLAIN_WEIGHT));

export interface AiRequest {
  id: number;
  level: Level;
  w: number;
  h: number;
  cells: number[];
  toMove: Color;
  /** 手番側が打てないコウの点 */
  ko: number | null;
  passes: number;
  /** 交点ごとの重み */
  weights: number[];
  /** CPU が打ってよい手（合法手から、過去の局面に戻る手を除いたもの。本体側で計算して渡す） */
  legal: number[];
  lastMove: Move | null;
  /** 思考時間の上限（ms） */
  thinkMs: number;
  /** プレイアウト回数の上限 */
  maxPlayouts: number;
  /** 後手に足す票（設定のコミ + 半目。省略時 0）。scripts/bench.ts はほかの値も試す */
  komi?: number;
}

export interface AiResponse {
  id: number;
  move: Move;
}

/**
 * 相手がパスし、自分もパスすれば終局して勝てるか（コミ込みの票で、同数は後手）。
 * そのときは読まずにパスして、相手の「投了」を受け入れる（強さによらず。読みの中身には手を入れない）
 */
export function winsByPassing(req: AiRequest): boolean {
  if (req.passes < 1 || req.lastMove !== PASS) return false;
  let margin = 0;   // 先手の票 − 後手の票
  req.cells.forEach((c, p) => { if (req.weights[p] === STAR_WEIGHT && c) margin += c === BLACK ? 1 : -1; });
  const blackWins = margin > (req.komi ?? 0);
  return blackWins === (req.toMove === BLACK);
}

/** 対局の現状から思考の依頼を作る */
export function requestFor(game: Game, stars: readonly boolean[], level: Level, id = 0, komi = 0): AiRequest {
  return {
    id, level, w: game.w, h: game.h, cells: Array.from(game.board.cells), toMove: game.toMove,
    ko: game.ko, passes: game.passes, weights: weightsOf(stars),
    legal: game.cpuMoves(), lastMove: game.lastMove, thinkMs: THINK_MS[level], maxPlayouts: playoutsFor(level, game.w * game.h), komi: komiTotal(stars.filter(Boolean).length, komi),
  };
}
