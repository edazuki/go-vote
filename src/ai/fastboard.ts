import { neighbours } from '../core/board';
import { BLACK, EMPTY, PASS, WHITE, opponent, type Color, type Move } from '../core/types';

/** プレイアウトの1手で、取れる手・星の点を探して拾う点の数 */
const PROBES = 8;

/**
 * 探索用の書き換え可能な盤面（純碁用）。Game と同じ着手規則（自殺手禁止・即時取り返しのコウ禁止）を、
 * 作業領域を使い回してメモリ確保なしで処理する。繰り返しの判定はしない（ルート側で Game が済ませる）
 */
export class FastBoard {
  readonly w: number;
  readonly h: number;
  readonly cells: Uint8Array;
  readonly nbr: Int16Array;
  toMove: Color = BLACK;
  /** 手番側が打てないコウの点（なければ -1） */
  ko = -1;
  passes = 0;
  /** 直前の着手点（パス・なしは -1） */
  last = -1;
  private readonly mark: Uint32Array;
  private readonly libMark: Uint32Array;
  private readonly stack: Int16Array;
  private stamp = 0;

  constructor(w: number, h: number) {
    const n = w * h;
    this.w = w;
    this.h = h;
    this.cells = new Uint8Array(n);
    this.nbr = neighbours(w, h);
    this.mark = new Uint32Array(n);
    this.libMark = new Uint32Array(n);
    this.stack = new Int16Array(n);
  }

  copyFrom(o: FastBoard): void {
    this.cells.set(o.cells);
    this.toMove = o.toMove;
    this.ko = o.ko;
    this.passes = o.passes;
    this.last = o.last;
  }

  /** p を含む連の呼吸点を limit 個まで数える（skip の点は呼吸点に数えない） */
  private libs(p: number, limit: number, skip: number): number {
    const { cells, nbr, mark, libMark, stack } = this, c = cells[p], s = ++this.stamp;
    let top = 0, libs = 0;
    stack[top++] = p;
    mark[p] = s;
    while (top) {
      const q = stack[--top];
      for (let d = 0; d < 4; d++) {
        const r = nbr[q * 4 + d];
        if (r < 0) continue;
        const v = cells[r];
        if (v === EMPTY) {
          if (r !== skip && libMark[r] !== s) { libMark[r] = s; if (++libs >= limit) return libs; }
        } else if (v === c && mark[r] !== s) { mark[r] = s; stack[top++] = r; }
      }
    }
    return libs;
  }

  /** p を含む連の呼吸点の数（limit で打ち切り） */
  groupLibs(p: number, limit: number): number {
    return this.libs(p, limit, -1);
  }

  private remove(p: number): number {
    const { cells, nbr, stack } = this, c = cells[p];
    let top = 0, k = 0;
    stack[top++] = p;
    cells[p] = EMPTY;
    while (top) {
      const q = stack[--top];
      k++;
      for (let d = 0; d < 4; d++) {
        const r = nbr[q * 4 + d];
        if (r >= 0 && cells[r] === c) { cells[r] = EMPTY; stack[top++] = r; }
      }
    }
    return k;
  }

  /** c が p に打てるか（コウは c が手番のときだけ効く） */
  isLegal(p: number, c: Color): boolean {
    if (this.cells[p] !== EMPTY || (c === this.toMove && p === this.ko)) return false;
    for (let d = 0; d < 4; d++) {
      const q = this.nbr[p * 4 + d];
      if (q < 0) continue;
      const v = this.cells[q];
      if (v === EMPTY) return true;
      // 味方の連に p 以外の呼吸点がある／相手の連の最後の呼吸点が p（取れる）なら打てる
      if (v === c ? this.libs(q, 1, p) > 0 : this.libs(q, 1, p) === 0) return true;
    }
    return false;
  }

  /** c が p に打つと相手の石が取れるか */
  capturesAt(p: number, c: Color): boolean {
    const e = opponent(c);
    for (let d = 0; d < 4; d++) {
      const q = this.nbr[p * 4 + d];
      if (q >= 0 && this.cells[q] === e && this.libs(q, 1, p) === 0) return true;
    }
    return false;
  }

  /** c が p に打つと、取りなしで自分の連の呼吸点が1つになるか（取れる手は capturesAt で先に見ること） */
  isSelfAtari(p: number, c: Color): boolean {
    this.cells[p] = c;
    const libs = this.libs(p, 2, -1);
    this.cells[p] = EMPTY;
    return libs < 2;
  }

  /** c が p に打つと、アタリの自分の連が呼吸点2つ以上になって逃げられるか */
  savesAtari(p: number, c: Color): boolean {
    let inAtari = false;
    for (let d = 0; d < 4; d++) {
      const q = this.nbr[p * 4 + d];
      if (q >= 0 && this.cells[q] === c && this.libs(q, 2, -1) === 1) { inAtari = true; break; }
    }
    return inAtari && !this.isSelfAtari(p, c);
  }

  /**
   * p が c の眼（上下左右がすべて c の石の空点）か。斜めに相手の石が多い欠け目（隅・辺は1つ、中は2つ以上）は眼としない。
   * 純碁では盤上の石だけを数えるので、眼以外の空点はすべて埋めたほうが得になる
   */
  isEye(p: number, c: Color): boolean {
    const { cells, nbr, w, h } = this;
    if (cells[p] !== EMPTY) return false;
    for (let d = 0; d < 4; d++) {
      const q = nbr[p * 4 + d];
      if (q >= 0 && cells[q] !== c) return false;
    }
    const x = p % w, y = (p / w) | 0, e = opponent(c);
    let bad = 0, edge = false;
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) { edge = true; continue; }
      if (cells[yy * w + xx] === e) bad++;
    }
    return bad < (edge ? 1 : 2);
  }

  /** p を含む空点のかたまりが c の石だけに囲まれていれば、その点の数（相手の石に触れていれば 0） */
  ownRegion(p: number, c: Color): number {
    const { cells, nbr, mark, stack } = this, s = ++this.stamp;
    let top = 0, k = 0, pure = true;
    stack[top++] = p;
    mark[p] = s;
    while (top) {
      const q = stack[--top];
      k++;
      for (let d = 0; d < 4; d++) {
        const r = nbr[q * 4 + d];
        if (r < 0) continue;
        if (cells[r] === EMPTY) { if (mark[r] !== s) { mark[r] = s; stack[top++] = r; } }
        else if (cells[r] !== c) pure = false;
      }
    }
    return pure ? k : 0;
  }

  /**
   * p を含む空点のかたまりが、どちらか一方の色の石だけに囲まれた陣地なら、その色（なければ 0）。
   * かたまりが maxSize より広いもの（序盤の広い空き）は、まだ陣地とみなさない
   */
  territoryOf(p: number, maxSize: number): number {
    const { cells, nbr, mark, stack } = this, s = ++this.stamp;
    let top = 0, k = 0, seen = 0;
    stack[top++] = p;
    mark[p] = s;
    while (top) {
      const q = stack[--top];
      if (++k > maxSize) return 0;
      for (let d = 0; d < 4; d++) {
        const r = nbr[q * 4 + d];
        if (r < 0) continue;
        const v = cells[r];
        if (v === EMPTY) { if (mark[r] !== s) { mark[r] = s; stack[top++] = r; } }
        else seen |= v;
      }
    }
    return seen === BLACK || seen === WHITE ? seen : 0;
  }

  /**
   * c が自分の眼 p を埋めても、つながった連に眼が2つ以上残るか。
   * 純碁では眼の交点は得票にならないので、生きるのに要らない眼（3つ目以降）は埋めたほうが得
   */
  canFillEye(p: number, c: Color): boolean {
    const { cells, libMark } = this;
    cells[p] = c;
    this.libs(p, cells.length, -1);
    const s = this.stamp;
    let eyes = 0;
    for (let q = 0; q < cells.length && eyes < 2; q++) if (cells[q] === EMPTY && libMark[q] === s && this.isEye(q, c)) eyes++;
    cells[p] = EMPTY;
    return eyes >= 2;
  }

  /** 探索で試す価値のある手か：打てて、自分の眼を埋めない（眼が2つ以上残るなら埋めてよい） */
  isCandidate(p: number): boolean {
    const c = this.toMove;
    return this.isLegal(p, c) && (!this.isEye(p, c) || this.canFillEye(p, c));
  }

  /** 着手（合法手であることは呼び出し側が保証する） */
  play(m: Move): void {
    const c = this.toMove, e = opponent(c);
    this.toMove = e;
    if (m === PASS) { this.passes++; this.ko = -1; this.last = -1; return; }
    const { cells, nbr } = this;
    cells[m] = c;
    let captured = 0, at = -1, single = true;
    for (let d = 0; d < 4; d++) {
      const q = nbr[m * 4 + d];
      if (q < 0) continue;
      if (cells[q] === c) single = false;
      else if (cells[q] === e && this.libs(q, 1, -1) === 0) { captured += this.remove(q); at = q; }
    }
    // Game.play と同じ：1子を取り、打った石が1子のまま呼吸点1つならコウ
    this.ko = captured === 1 && single && this.libs(m, 2, -1) === 1 ? at : -1;
    this.passes = 0;
    this.last = m;
  }

  /** p を含む連の呼吸点が1つだけなら、その点（それ以外は -1） */
  private atariAt(p: number): number {
    if (this.libs(p, 2, -1) !== 1) return -1;
    const s = this.stamp;
    for (let q = 0; q < this.cells.length; q++) if (this.cells[q] === EMPTY && this.libMark[q] === s) return q;
    return -1;
  }

  /** 直前の手のまわりで、アタリの相手を取る／アタリの自分を逃がす手（なければ -1） */
  private urgentMove(): number {
    const m = this.last;
    if (m < 0) return -1;
    const c = this.toMove;
    // 直前に打たれた石がアタリなら取る
    let lib = this.atariAt(m);
    if (lib >= 0 && this.isLegal(lib, c)) return lib;
    for (let d = 0; d < 4; d++) {
      const q = this.nbr[m * 4 + d];
      if (q < 0 || this.cells[q] !== c) continue;
      lib = this.atariAt(q);
      if (lib < 0 || !this.isLegal(lib, c)) continue;
      // 逃げた先で呼吸点が2つ以上になりそうなら逃げる（空点の隣が2つ以上か、取れる）
      let empties = 0;
      for (let k = 0; k < 4; k++) { const r = this.nbr[lib * 4 + k]; if (r >= 0 && this.cells[r] === EMPTY) empties++; }
      if (empties >= 2 || this.capturesAt(lib, c)) return lib;
    }
    return -1;
  }

  /**
   * プレイアウトの1手：急ぎの手があればそれ、なければランダムに候補手を選ぶ。
   * 何点か拾って、取れる手があればそれ、なければ重い（星の）点を優先する。
   * 自分からアタリになる手は後回し（ほかに手がなければ打つ。打たずにパスすると、取られるはずの石が盤上に残ってしまう）
   */
  randomMove(rand: () => number, weights?: ArrayLike<number>): Move {
    const u = this.urgentMove();
    if (u >= 0 && this.isCandidate(u)) return u;
    const n = this.cells.length, c = this.toMove;
    let best = -1, bestW = 0;
    for (let i = 0; i < PROBES; i++) {
      const p = (rand() * n) | 0;
      if (this.cells[p] !== EMPTY || !this.isCandidate(p)) continue;
      if (this.capturesAt(p, c)) return p;
      const w = weights ? weights[p] : 1;
      if (w <= bestW || this.isSelfAtari(p, c)) continue;
      best = p; bestW = w;
    }
    if (best >= 0) return best;
    const start = (rand() * n) | 0;
    let fallback: Move = PASS;
    for (let i = 0; i < n; i++) {
      const p = (start + i) % n;
      if (this.cells[p] !== EMPTY || !this.isCandidate(p)) continue;
      if (!this.capturesAt(p, c) && this.isSelfAtari(p, c)) { if (fallback === PASS) fallback = p; continue; }
      return p;
    }
    return fallback;
  }

  /** 黒から見た差：盤上の石の重みの合計（黒 − 白）。純碁の数え方に、交点ごとの重みを掛けたもの */
  margin(weights: ArrayLike<number>): number {
    let m = 0;
    for (let p = 0; p < this.cells.length; p++) {
      const v = this.cells[p];
      if (v === BLACK) m += weights[p];
      else if (v !== EMPTY) m -= weights[p];
    }
    return m;
  }
}
