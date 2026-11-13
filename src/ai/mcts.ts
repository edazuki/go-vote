import { BLACK, PASS, WHITE, opponent, type Color, type Move } from '../core/types';
import { FastBoard } from './fastboard';
import { DEAD_INVASION_SIZE, ownTerritorySize, type AiRequest } from './protocol';

/** UCT の探索の強さ（大きいほど、試した回数の少ない手にも回す） */
const UCT_C = 0.3;
/** RAVE をどこまで信じるか。訪問回数がこのくらいになると、実際の勝率と半々に混ぜる */
const RAVE_K = 400;
/** 事前知識の重み：取れる手・アタリから逃げる手は最初からこの回数勝った、自分からアタリになる手は負けたことにして始める */
const PRIOR = 10;
/** 試行の得点に混ぜる、差の大きさの割合（残りは勝ち負け） */
const MARGIN_MIX = 0.35;
/** パスの代わりに打つ手として認める、パスとの勝率の差 */
const FILL_SLACK = 0.08;
/** 勝負がついたとみなす勝率（これより低い・高い）。このときは、パスと変わらない手を打たずにパスする */
const DECIDED = 0.1;
/**
 * パスと「大差ない」とみなす条件。相手がパスした直後かどうかで分ける。
 * - 相手がパスした直後：自分のパスでその場で終局するので、パスの値は試行によらず正確（その局面の票差）。回数は問わず、差は狭く
 * - そうでない：パスのあとも試行が続くのでぶれる。勝ちが決まった局面でも、パスは少し低く出る
 *   （試行の中で、空けておいた陣地に相手がでたらめに打ち込む分）ので、十分に試した上で差は広めに取る
 */
const PASS_RULE = {
  ends: { minVisits: 1, slack: 0.03 },
  open: { minVisits: 20, slack: 0.1 },
};

interface Node {
  move: Move;
  /** この手を打った側 */
  color: Color;
  parent: Node | null;
  children: Node[];
  /** まだ木に加えていない手（null = 未計算） */
  untried: Move[] | null;
  visits: number;
  wins: number;
  /** RAVE（AMAF）：この局面以降のどこかで同じ色が同じ点に打った試行の勝ち負け */
  raveVisits: number;
  raveWins: number;
}

const node = (move: Move, color: Color, parent: Node | null): Node =>
  ({ move, color, parent, children: [], untried: null, visits: 0, wins: 0, raveVisits: 0, raveWins: 0 });

function shuffle<T>(a: T[], rand: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function candidates(b: FastBoard, from: Iterable<number>, rand: () => number): Move[] {
  const out: Move[] = [PASS];
  for (const p of from) if (b.isCandidate(p)) out.push(p);
  return shuffle(out, rand);
}

function select(n: Node): Node {
  const logN = Math.log(n.visits);
  let best = n.children[0], bestV = -Infinity;
  for (const ch of n.children) {
    const q = ch.wins / ch.visits;
    const beta = Math.sqrt(RAVE_K / (3 * ch.visits + RAVE_K));
    const amaf = ch.raveVisits ? ch.raveWins / ch.raveVisits : q;
    const v = (1 - beta) * q + beta * amaf + UCT_C * Math.sqrt(logN / ch.visits);
    if (v > bestV) { bestV = v; best = ch; }
  }
  return best;
}

export interface SearchLimit {
  timeMs: number;
  /** プレイアウト回数の上限（テスト用） */
  maxPlayouts?: number;
  /** 終局まわりの手当て（勝負がついたらパス・星を埋める）を使わず、いちばん試した手をそのまま打つ（検証用） */
  plain?: boolean;
}

/** 依頼の局面を FastBoard に写す */
export function boardFrom(req: AiRequest): FastBoard {
  const b = new FastBoard(req.w, req.h);
  b.cells.set(req.cells);
  b.toMove = req.toMove;
  b.ko = req.ko ?? -1;
  b.passes = req.passes;
  b.last = req.lastMove ?? -1;
  return b;
}

/**
 * モンテカルロ木探索（UCT + RAVE）。プレイアウトは「直前の手のまわりの取り・アタリ逃げ」を優先し、
 * それ以外は星の点を優先したランダム（自分の眼は埋めない）で終局まで打ち、
 * 盤上の石の重み（星 1、それ以外は少し）の合計を比べて勝ち負けを数える（純碁の数え方。引き分けは半分の勝ち）
 */
export function searchMove(req: AiRequest, limit: SearchLimit, rand: () => number = Math.random): Move {
  const n = req.w * req.h, rootBoard = boardFrom(req), b = new FastBoard(req.w, req.h);

  const root = node(PASS, opponent(req.toMove), null);
  // ルートだけは Game が渡した手（繰り返しになる手を除いたもの）に限る
  root.untried = candidates(rootBoard, req.legal, rand);
  if (root.untried.length === 1) return PASS;

  const all = Array.from({ length: n }, (_, i) => i);
  // 差の物差し：重みの合計の 1/4 の差で、差の成分が振り切れる
  const marginScale = Math.max(1, req.weights.reduce((x, y) => x + y, 0) / 4);
  const maxSteps = n * 3, deadline = performance.now() + limit.timeMs, maxPlayouts = limit.maxPlayouts ?? Infinity;
  // 試行の中で、色ごとに各点へ最初に打った手順（RAVE 用）。-1 = 打っていない
  const firstAt = [new Int32Array(n), new Int32Array(n), new Int32Array(n)];
  const path: Node[] = [];

  for (let it = 0; it < maxPlayouts && (it === 0 || performance.now() < deadline); it++) {
    b.copyFrom(rootBoard);
    firstAt[BLACK].fill(-1);
    firstAt[WHITE].fill(-1);
    let cur = root, step = 0;
    const played = (m: Move, c: Color) => { if (m !== PASS && firstAt[c][m] < 0) firstAt[c][m] = step; step++; };
    path.length = 0;
    path.push(root);

    // 選択：全部の手を試し終えたノードは子をたどる
    while (cur.untried && cur.untried.length === 0 && cur.children.length) {
      cur = select(cur);
      played(cur.move, cur.color);
      b.play(cur.move);
      path.push(cur);
    }

    // 展開
    if (b.passes < 2) {
      cur.untried ??= candidates(b, all, rand);
      const m = cur.untried.pop();
      if (m !== undefined) {
        const ch = node(m, b.toMove, cur);
        if (m !== PASS) {
          if (b.capturesAt(m, b.toMove) || b.savesAtari(m, b.toMove)) ch.visits = ch.wins = PRIOR;
          else if (b.isSelfAtari(m, b.toMove)) ch.visits = PRIOR;
        }
        cur.children.push(ch);
        played(m, b.toMove);
        b.play(m);
        cur = ch;
        path.push(cur);
      }
    }

    // プレイアウト
    for (let s = 0; s < maxSteps && b.passes < 2; s++) {
      const c = b.toMove, m = b.randomMove(rand, req.weights);
      played(m, c);
      b.play(m);
    }
    const margin = b.margin(req.weights) - (req.komi ?? 0);
    // 黒から見た試行の得点 0..1：勝ち負け（引き分けは 0.5）に、差の大きさを少し混ぜる。
    // 勝ち負けだけだと、1〜2目の得（小さな取りなど）がプレイアウトのぶれに埋もれて見えないため
    const win = margin > 1e-9 ? 1 : margin < -1e-9 ? 0 : 0.5;
    const blackGain = (1 - MARGIN_MIX) * win + MARGIN_MIX * (0.5 + 0.5 * Math.max(-1, Math.min(1, margin / marginScale)));
    const gain = (c: Color) => (c === WHITE ? 1 - blackGain : blackGain);

    // 逆伝播。各ノードの子のうち、そのノード以降に同じ色が同じ点へ打っていたものは RAVE も更新
    for (let d = path.length - 1; d >= 0; d--) {
      const x = path[d];
      x.visits++;
      x.wins += gain(x.color);
      for (const ch of x.children) {
        if (ch.move === PASS) continue;
        const t = firstAt[ch.color][ch.move];
        if (t >= d) {
          ch.raveVisits++;
          ch.raveWins += gain(ch.color);
        }
      }
    }
  }

  let best = root.children[0];
  for (const ch of root.children) if (ch.visits > best.visits) best = ch;
  if (limit.plain) return best.move;
  const c = req.toMove, e = opponent(c), rate = (ch: Node) => ch.wins / ch.visits;
  const pass = root.children.find(ch => ch.move === PASS);
  /** 自分の陣地か */
  const mine = (p: number) => rootBoard.territoryOf(p, ownTerritorySize(n)) === c;
  /** 二眼を作れない狭さの相手の陣地か（打ち込んでも取られるだけ） */
  const deadInvasion = (p: number) => rootBoard.territoryOf(p, DEAD_INVASION_SIZE) === e;

  if (best.move !== PASS) {
    // 勝負がついた局面では、どの手も勝率がほぼ同じになり、相手の狭い陣地への放り込みや、
    // 自分の陣地の星でない点（票にならない）を埋める手が選ばれやすい。パスと大差ないなら打たない。
    // 取る手・アタリから逃げる手は除く（陣地の中の死に石を取らないと、その星を埋められない）。
    // 広い相手の陣地への打ち込みは、二眼で生きる手がありうるので除く
    const p = best.move;
    const decided = rate(best) < DECIDED || rate(best) > 1 - DECIDED;
    const idle = !rootBoard.capturesAt(p, c) && !rootBoard.savesAtari(p, c)
      && ((mine(p) && req.weights[p] === 0) || deadInvasion(p));
    // 負けが決まっていれば、パスとの比べなしでパスする（負けが決まるとパスはほとんど試されず、比べられない。打っても結果は変わらない）。
    // 勝っている側は、パスも十分に試して大差ないときだけ
    const lost = rate(best) < DECIDED, rule = req.passes > 0 ? PASS_RULE.ends : PASS_RULE.open;
    const passOk = !!pass && (lost || (pass.visits >= rule.minVisits && rate(pass) >= rate(best) - rule.slack));
    if (!(decided && idle && passOk)) return best.move;
    best = pass!;
  }
  // パスでよい局面。純碁では盤上の石だけが数えられるので、まだ票になる星が空いていれば、勝率がパスと大きく変わらない限り埋める。
  // 二眼を作れない狭い相手の陣地の星は除く（取られるだけ）。
  // 自分の眼の星を埋めると眼が足りなくなる手は勝率が下がるので選ばれない。星でない点は埋めない
  let fill: Node | null = null;
  for (const ch of root.children) {
    const p = ch.move;
    if (p === PASS || req.weights[p] === 0 || ch.visits < 3 || rate(ch) < rate(best) - FILL_SLACK) continue;
    if (deadInvasion(p) || rootBoard.isSelfAtari(p, c)) continue;
    if (!fill || ch.visits > fill.visits) fill = ch;
  }
  return fill?.move ?? PASS;
}
