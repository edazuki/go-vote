import { neighbours } from '../core/board';
import { BLACK, EMPTY, PASS, WHITE, opponent, type Color, type Move } from '../core/types';

/** プレイアウトの1手で、取れる手・星の点を探して拾う点の数 */
const PROBES = 8;

/** シチョウ読みの上限：追う手順の深さ（逃げる側の手の数）と、読む局面の数。超えたら「読み切れない」 */
const LADDER_DEPTH = 40, LADDER_NODES = 400;
/** シチョウ読みの結果 */
const CAPTURED = 1, ESCAPES = 0, UNKNOWN = -1;

/** シチョウ読みの作業盤（盤の大きさごと。深さごとに2枚） */
const ladderPools = new Map<string, FastBoard[]>();
/** いまのシチョウ読みで読んだ局面の数 */
let ladderNodes = 0;

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
    if (m === PASS) { this.passes++; this.ko = -1; return; }
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
  }

  /** p を含む連の呼吸点が1つだけなら、その点（それ以外は -1） */
  private atariAt(p: number): number {
    if (this.libs(p, 2, -1) !== 1) return -1;
    const s = this.stamp;
    for (let q = 0; q < this.cells.length; q++) if (this.cells[q] === EMPTY && this.libMark[q] === s) return q;
    return -1;
  }

  /**
   * プレイアウトの1手：ランダムに候補手を選ぶ。何点か拾って、取れる手があればそれ、なければ重い（星の）点を優先する。
   * 自分からアタリになる手は後回し（ほかに手がなければ打つ。打たずにパスすると、取られるはずの石が盤上に残ってしまう）
   */
  randomMove(rand: () => number, weights?: ArrayLike<number>): Move {
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

  /** シチョウ読みの作業盤 i 枚目（この盤の写し） */
  private work(i: number): FastBoard {
    const key = `${this.w}x${this.h}`;
    let pool = ladderPools.get(key);
    if (!pool) ladderPools.set(key, pool = []);
    const t = pool[i] ??= new FastBoard(this.w, this.h);
    t.copyFrom(this);
    return t;
  }

  /** p を含む連の呼吸点を out に入れて、その数を返す（limit で打ち切り） */
  private libsInto(p: number, limit: number, out: number[]): number {
    const n = this.libs(p, limit, -1), s = this.stamp;
    out.length = 0;
    for (let q = 0; q < this.cells.length && out.length < n; q++) if (this.cells[q] === EMPTY && this.libMark[q] === s) out.push(q);
    return n;
  }

  /**
   * シチョウ読み：p の連（呼吸点1つ）の色が逃げる番として、逃げてもシチョウで取られるか。
   * 逃げる側は最後の呼吸点に伸びる手と、まわりのアタリの相手を取る手だけ、追う側は呼吸点2つのどちらかでアタリにする手だけを読む。
   * 伸びて呼吸点3つ以上なら逃げ切り。深さ・局面の数の上限を超えたら UNKNOWN
   */
  private ladderRead(p: number, depth: number): number {
    if (depth > LADDER_DEPTH || ++ladderNodes > LADDER_NODES) return UNKNOWN;
    const d = this.cells[p] as Color, e = opponent(d), lib = this.atariAt(p);
    if (lib < 0) return ESCAPES;
    // 逃げる手：伸びる、まわりのアタリの相手を取る（連の石は atariAt の libs で mark に印が付いている）
    const s = this.stamp, tries = [lib];
    for (let q = 0; q < this.cells.length; q++) {
      if (this.cells[q] !== d || this.mark[q] !== s) continue;
      for (let k = 0; k < 4; k++) {
        const r = this.nbr[q * 4 + k];
        if (r >= 0 && this.cells[r] === e) { const l = this.atariAt(r); if (l >= 0 && !tries.includes(l)) tries.push(l); }
      }
    }
    let unknown = false;
    const libs: number[] = [];
    for (const m of tries) {
      if (!this.isLegalFor(m, d)) continue;
      const c1 = this.work(depth * 2);
      c1.toMove = d;
      c1.play(m);
      const n = c1.libsInto(p, 3, libs);
      if (n >= 3) return ESCAPES;
      if (n <= 1) continue;
      // 呼吸点2つ：追う側がどちらかでアタリにして、逃げられなければ取られる
      let caught = false;
      for (const a of libs) {
        if (!c1.isLegalFor(a, e)) continue;
        const c2 = c1.work(depth * 2 + 1);
        c2.toMove = e;
        c2.play(a);
        if (c2.groupLibs(p, 2) !== 1) continue;
        const r = c2.ladderRead(p, depth + 1);
        if (r === CAPTURED) { caught = true; break; }
        if (r === UNKNOWN) unknown = true;
      }
      if (!caught) return unknown ? UNKNOWN : ESCAPES;
    }
    return CAPTURED;
  }

  /** c が手番のときと同じ合法判定を、手番によらず c について行う */
  private isLegalFor(p: number, c: Color): boolean {
    const t = this.toMove;
    this.toMove = c;
    const ok = this.isLegal(p, c);
    this.toMove = t;
    return ok;
  }

  /** p の連（呼吸点1つ）が、逃げてもシチョウで取られるか（読み切れないときは取られないとみなす） */
  ladderCaptured(p: number): boolean {
    ladderNodes = 0;
    return this.ladderRead(p, 0) === CAPTURED;
  }

  /**
   * c が p に打つのが、取られるシチョウを逃げる手か：p がアタリの自分の連の最後の呼吸点で、
   * 相手の石を取らず、そのどの連も逃げてもシチョウで取られる
   */
  ladderEscapeFails(p: number, c: Color): boolean {
    if (this.capturesAt(p, c)) return false;
    let inAtari = false;
    for (let d = 0; d < 4; d++) {
      const q = this.nbr[p * 4 + d];
      if (q < 0 || this.cells[q] !== c || this.atariAt(q) !== p) continue;
      inAtari = true;
      if (!this.ladderCaptured(q)) return false;
    }
    return inAtari;
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
