import { BLACK, PASS, WHITE, opponent, type Color, type Move } from '../core/types';
import { FastBoard } from './fastboard';
import { DEAD_INVASION_SIZE, ownTerritorySize, type AiRequest } from './protocol';

/** UCT の探索の強さ（大きいほど、試した回数の少ない手にも回す） */
const UCT_C = 0.3;
/** RAVE をどこまで信じるか。訪問回数がこのくらいになると、実際の勝率と半々に混ぜる */
const RAVE_K = 400;
/** パスの代わりに打つ手として認める、パスとの勝率の差 */
const FILL_SLACK = 0.08;
/**
 * 勝負がついたとみなす勝率。これより高ければ勝ちが決まった（パスと変わらない無駄な手は打たずにパスする）、
 * 低ければ負けが決まった（相手がパスした直後ならパス、そうでなければ無駄な手を除いて足掻く）
 */
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

/** 候補手（パスを含む）。omitLadder なら、取られるシチョウを逃げる手を除く */
function candidates(b: FastBoard, from: Iterable<number>, rand: () => number, omitLadder = false): Move[] {
  const out: Move[] = [PASS];
  for (const p of from) if (b.isCandidate(p) && !(omitLadder && b.ladderEscapeFails(p, b.toMove))) out.push(p);
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
  /** シチョウ読みを使わない（検証用） */
  noLadder?: boolean;
}

/** 依頼の局面を FastBoard に写す */
export function boardFrom(req: AiRequest): FastBoard {
  const b = new FastBoard(req.w, req.h);
  b.cells.set(req.cells);
  b.toMove = req.toMove;
  b.ko = req.ko ?? -1;
  b.passes = req.passes;
  return b;
}

/**
 * モンテカルロ木探索（UCT + RAVE）。プレイアウトは取れる手・星の点を優先したランダム（自分の眼は埋めない）で終局まで打ち、
 * 盤上の石の重み（星 1、それ以外は 0）の合計を比べて勝ち負けを数える（純碁の数え方。引き分けは半分の勝ち）。
 * 試行の中の急ぎの手（直前の手のまわりの取り・アタリ逃げ）、木に加える手の事前知識（取る・逃げる手を勝ちから始める）、
 * 試行の得点に差の大きさを混ぜることは、外しても強さが変わらず（7×7・★50 で今の版と互角）、外すと速いのでやめた
 */
export function searchMove(req: AiRequest, limit: SearchLimit, rand: () => number = Math.random): Move {
  const n = req.w * req.h, rootBoard = boardFrom(req), b = new FastBoard(req.w, req.h);

  const root = node(PASS, opponent(req.toMove), null);
  // ルートだけは Game が渡した手（繰り返しになる手を除いたもの）に限る。
  // 取られるシチョウを逃げる手は、ルートの候補に入れない。ランダムな試行はシチョウの一本道をたどらないので、
  // アタリの連が大きくなるほど逃げる手が良く見え、逃げ続けてしまう（味付けを外した素の MCTS でも同じ）。
  // 事前知識で減点する方法は、回数が増えると薄まって効かなかった。木の中の局面では外さない（外しても強さ・シチョウの判断は変わらなかった）
  root.untried = candidates(rootBoard, req.legal, rand, !limit.noLadder);
  if (root.untried.length === 1) return PASS;

  const all = Array.from({ length: n }, (_, i) => i);
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
    // 黒から見た試行の得点：勝ち 1・負け 0・引き分け 0.5
    const blackGain = margin > 1e-9 ? 1 : margin < -1e-9 ? 0 : 0.5;
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
  /**
   * 打っても無駄な手：自分の陣地の星でない点（票にならない）と、相手の狭い陣地への放り込み（取られるだけ）。
   * 取る手・アタリから逃げる手は除く（陣地の中の死に石を取らないと、その星を埋められない）。
   * 広い相手の陣地への打ち込みは、二眼で生きる手がありうるので無駄とはしない
   */
  const idle = (p: number) => !rootBoard.capturesAt(p, c) && !rootBoard.savesAtari(p, c)
    && ((mine(p) && req.weights[p] === 0) || deadInvasion(p));
  const lost = rate(best) < DECIDED;

  // 負けが決まったとき（勝率 0.1 未満）。相手がパスした直後なら、負けを受け入れてパスする（そこで終局）。
  // 相手がまだパスしていなければ足掻く：無駄な手と、取れないのに自分からアタリになる手を除いて、
  // いちばん試した手を打つ（勝率の高い手ほど試されるので、相手が間違えたら逆転できる手が選ばれる）。そういう手がなければパス
  if (lost) {
    if (req.passes > 0) return PASS;
    let fight: Node | null = null;
    for (const ch of root.children) {
      const p = ch.move;
      if (p === PASS || idle(p) || (!rootBoard.capturesAt(p, c) && rootBoard.isSelfAtari(p, c))) continue;
      if (!fight || ch.visits > fight.visits) fight = ch;
    }
    return fight?.move ?? PASS;
  }

  if (best.move !== PASS) {
    // 試行の得点は勝ち負けだけなので、陣地が決まった局面では、自陣の星を埋める手も星でない点を埋める手も勝率が同じになり、
    // 無駄な手が選ばれやすい。勝ちが決まっていて、パスも十分に試してパスと大差ないなら、パスして下で星を埋める。
    // そうでなければ（相手がパスした直後で、今の票数ではまだ負けているときなど）、勝率が大きく落ちない無駄でない手に替える
    const p = best.move;
    if (!idle(p)) return best.move;
    const rule = req.passes > 0 ? PASS_RULE.ends : PASS_RULE.open;
    const passOk = !!pass && pass.visits >= rule.minVisits && rate(pass) >= rate(best) - rule.slack;
    if (!(rate(best) > 1 - DECIDED && passOk)) {
      let useful: Node | null = null;
      for (const ch of root.children) {
        const q = ch.move;
        if (q === PASS || idle(q) || ch.visits < 3 || rate(ch) < rate(best) - FILL_SLACK) continue;
        if (!rootBoard.capturesAt(q, c) && rootBoard.isSelfAtari(q, c)) continue;
        if (!useful || ch.visits > useful.visits) useful = ch;
      }
      return (useful ?? best).move;
    }
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
