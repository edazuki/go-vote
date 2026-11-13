import { Board } from './board';
import { BLACK, PASS, opponent, type Color, type Move } from './types';

/** 同じ局面（盤面 + 手番）がこの回数現れたら終局（三コウなど。そこで打ち切り、その時点の得票で決める） */
export const REPEAT_LIMIT = 3;

export type PlayResult =
  | { ok: true; captured: number[] }
  | { ok: false; reason: 'occupied' | 'suicide' | 'ko' | 'over' };

/**
 * 対局の進行（純碁ベース）：手番・パス・コウ・繰り返し。
 * 終局時に盤に残った石のうち、星の交点にある石がその色の得票になる（集計は flag.ts の votes）。保存は手順 moves だけで足りる
 */
export class Game {
  readonly w: number;
  readonly h: number;
  board: Board;
  toMove: Color = BLACK;
  passes = 0;
  /** 手番側がこの1手番だけ打てないコウの点 */
  ko: number | null = null;
  /** 同じ局面の繰り返しで終局した */
  repeated = false;
  /** 投了した色（投了で終局した）。手順 moves には入らない */
  resigned: Color | null = null;
  readonly moves: Move[] = [];
  private readonly seen = new Map<string, number>();

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.board = new Board(w, h);
    this.record();
  }

  static fromMoves(w: number, h: number, moves: readonly Move[]): Game {
    const g = new Game(w, h);
    for (const m of moves) {
      const r = g.play(m);
      if (!r.ok) throw new Error(`invalid move ${m}: ${r.reason}`);
    }
    return g;
  }

  get isOver(): boolean {
    return this.passes >= 2 || this.repeated || this.resigned !== null;
  }

  /** 色 c が投了する（手番によらず。終局していたら何もしない） */
  resign(c: Color): boolean {
    if (this.isOver) return false;
    this.resigned = c;
    return true;
  }

  get lastMove(): Move | null {
    return this.moves.length ? this.moves[this.moves.length - 1] : null;
  }

  private positionKey(board: Board, toMove: Color): string {
    return board.key() + toMove;
  }

  private record(): void {
    const k = this.positionKey(this.board, this.toMove), n = (this.seen.get(k) ?? 0) + 1;
    this.seen.set(k, n);
    if (n >= REPEAT_LIMIT) this.repeated = true;
  }

  /** 盤面を変えずに合法性だけ調べる（コウは直後の取り返しだけを禁止） */
  check(p: number): { ok: true; board: Board; captured: number[] } | Extract<PlayResult, { ok: false }> {
    if (this.isOver) return { ok: false, reason: 'over' };
    if (p === this.ko) return { ok: false, reason: 'ko' };
    return this.board.place(p, this.toMove);
  }

  play(m: Move): PlayResult {
    if (m === PASS) return this.pass();
    const r = this.check(m);
    if (!r.ok) return r;
    // 1子を取り、打った石が1子のまま呼吸点1つ（= 取った点）なら、次の1手番はそこへの取り返しを禁止
    const g = r.board.group(m);
    this.ko = r.captured.length === 1 && g.stones.length === 1 && g.libs.size === 1 ? r.captured[0] : null;
    this.board = r.board;
    this.moves.push(m);
    this.passes = 0;
    this.toMove = opponent(this.toMove);
    this.record();
    return { ok: true, captured: r.captured };
  }

  pass(): PlayResult {
    if (this.isOver) return { ok: false, reason: 'over' };
    this.moves.push(PASS);
    this.passes++;
    this.ko = null;
    this.toMove = opponent(this.toMove);
    this.record();
    return { ok: true, captured: [] };
  }

  legalMoves(): number[] {
    const out: number[] = [];
    for (let p = 0; p < this.w * this.h; p++) if (this.check(p).ok) out.push(p);
    return out;
  }

  /** p に打つと、過去に現れた局面が再び現れるか */
  wouldRepeat(p: number): boolean {
    const r = this.check(p);
    return r.ok && this.seen.has(this.positionKey(r.board, opponent(this.toMove)));
  }

  /** CPU 用の合法手：繰り返しになる手は（ルール上は打てても）こっそり避ける */
  cpuMoves(): number[] {
    return this.legalMoves().filter(p => !this.wouldRepeat(p));
  }
}
