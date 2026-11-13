import type { Board } from './board';
import { BLACK, WHITE, type Color } from './types';

/**
 * 盤の種類。星条旗の星（50個）は、6個の段と5個の段が交互に9段並ぶ。
 * 格子に置くと横11 × 縦9 の市松の半分（x + y が偶数の交点）がちょうど50個の星になる。
 * 星の並ぶ範囲（fieldW × fieldH）の中で x + y が偶数の点が星。pad は外側に足す、星のない余白の列数
 */
export interface BoardSpec {
  id: BoardId;
  label: string;
  w: number;
  h: number;
  /** 星の並ぶ範囲（横・縦の路数） */
  fieldW: number;
  fieldH: number;
  pad: number;
}

export type BoardId = 'small5' | 'small7' | 'flag' | 'flag-wide';

/** 選択肢の並び順どおり。label は画面に出す名前（WIDE = 外側に星のない余白を1列ずつ足した盤） */
export const BOARDS: Record<BoardId, BoardSpec> = {
  // 小さな盤：3個と2個の段が交互に5段（3×3 + 2×2 = 13個。独立当時の13州の星の数）
  small5: { id: 'small5', label: '★13', w: 5, h: 5, fieldW: 5, fieldH: 5, pad: 0 },
  small7: { id: 'small7', label: '★13 WIDE', w: 7, h: 7, fieldW: 5, fieldH: 5, pad: 1 },
  flag: { id: 'flag', label: '★50', w: 11, h: 9, fieldW: 11, fieldH: 9, pad: 0 },
  'flag-wide': { id: 'flag-wide', label: '★50 WIDE', w: 13, h: 11, fieldW: 11, fieldH: 9, pad: 1 },
};

export const isBoardId = (v: unknown): v is BoardId => typeof v === 'string' && v in BOARDS;

/** 星（得票になる交点）の数 */
export const starCount = (stars: readonly boolean[]): number => stars.filter(Boolean).length;

/** 過半数（星の数の半分より多い最小の数） */
export const majorityOf = (count: number): number => Math.floor(count / 2) + 1;

/** 交点ごとに星かどうか（y * w + x の順） */
export function starsOf(spec: BoardSpec): boolean[] {
  const { w, h, pad } = spec, out: boolean[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ix = x - pad, iy = y - pad;
      out.push(ix >= 0 && iy >= 0 && ix < spec.fieldW && iy < spec.fieldH && (ix + iy) % 2 === 0);
    }
  }
  return out;
}

export interface Votes {
  /** 先手（赤）・後手（青）の石が乗っている星 */
  black: number[];
  white: number[];
  /** 石が乗っていない星 */
  free: number[];
}

/** 盤上の石で、星の交点を色ごとに分ける（終局時はこれが得票、対局中は見込み） */
export function votes(board: Board, stars: readonly boolean[]): Votes {
  const v: Votes = { black: [], white: [], free: [] };
  stars.forEach((star, p) => {
    if (!star) return;
    const c = board.get(p);
    (c === BLACK ? v.black : c === WHITE ? v.white : v.free).push(p);
  });
  return v;
}

/**
 * 党（石の色）。手番とは別に決める：ルールの中では先手 = BLACK、後手 = WHITE のままで、
 * 対局ごとの firstRed（先手が赤か）で、どちらの党の石として見せるかを決める
 */
export type Party = 'red' | 'blue';
export const PARTIES: readonly Party[] = ['red', 'blue'];

/** 手番の色 → 党 */
export const partyOf = (c: Color, firstRed: boolean): Party => ((c === BLACK) === firstRed ? 'red' : 'blue');
/** 党 → 手番の色 */
export const colorOfParty = (p: Party, firstRed: boolean): Color => ((p === 'red') === firstRed ? BLACK : WHITE);

/** 設定で選べるコミ（後手に足す票、整数）。盤共通 */
export const KOMI_CHOICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** 得票率（%、0.1 刻み）：票 n を分母 d で割る */
const pctOf = (n: number, d: number) => Math.round(n / d * 1000) / 10;

/**
 * 半目：後手に足す1票未満の票。同数（コミ込み）なら後手の勝ちにし、引き分けをなくす。
 * 得票率の分母（星の数 + コミ + 半目）にも入れるので、各色の得票率は自分の票だけで決まる（相手が打っても下がらない）。
 * 大きさは（星の数 + コミ）÷ 673。分母に占める半目の割合が、盤やコミによらず 1/674（約 0.148%）になり、
 * 0.1% 刻みに丸めても、同数なら後手が必ず上に見え、星が全部埋まれば合計がちょうど 100.0% になる
 *（星 1〜200・コミ 0〜10 の全部で確かめた。13 星・コミ 0 なら約 0.019、50 星なら約 0.074）。
 * コミ 0 なら対局開始（0 対 0）の差もちょうど 0.1% に見える（コミがあると 0.2% になることがある）
 */
export const halfKomi = (stars: number, komi = 0): number => (stars + komi) / 673;

/** 後手に足す票の合計（コミ + 半目）。CPU にはこれを渡す */
export const komiTotal = (stars: number, komi = 0) => komi + halfKomi(stars, komi);

/** 勝った色。後手の票にコミを足して比べ、同数なら後手（半目） */
export function winner(v: Votes, komi = 0): Color {
  return v.black.length > v.white.length + komi ? BLACK : WHITE;
}

/**
 * 画面に出す得票率（%、0.1 刻み）。後手の票にはコミと半目を足し、分母は「星の数 + コミ + 半目」。
 * 合計は 100% を超えない。50 星・コミ 0 の 25 対 25 なら 49.9 / 50.1
 */
export function shownPct(v: Votes, total: number, komi = 0): { black: number; white: number } {
  const t = komiTotal(total, komi), d = total + t;
  return { black: pctOf(v.black.length, d), white: pctOf(v.white.length + t, d) };
}
