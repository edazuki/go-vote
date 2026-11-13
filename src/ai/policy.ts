import { PASS, opponent, type Move } from '../core/types';
import { FastBoard } from './fastboard';
import { boardFrom } from './mcts';
import { DEAD_INVASION_SIZE, ownTerritorySize, type AiRequest } from './protocol';

/** 打ってよい手のうち、自分の眼を埋めない手 */
function candidates(b: FastBoard, req: AiRequest): number[] {
  return req.legal.filter(p => b.isCandidate(p));
}

const pick = (from: number[], rand: () => number): Move => (from.length ? from[(rand() * from.length) | 0] : PASS);

/** かんたん：眼を埋めない手からランダム（自分からアタリになる手はなるべく避ける）。なければパス */
export function chooseEasyMove(req: AiRequest, rand: () => number = Math.random): Move {
  const b = boardFrom(req), c = req.toMove, cand = candidates(b, req);
  const safe = cand.filter(p => b.capturesAt(p, c) || !b.isSelfAtari(p, c));
  return pick(safe.length ? safe : cand, rand);
}

/**
 * ふつう：1手読み。取れる手・アタリから逃げる手・星の点を高く、自分からアタリになる手を低く見て、いちばん高い手を選ぶ。
 * 自分の陣地の星でない点・狭い相手の陣地には打たない（打つ手がなくなればパス）。
 * DOM に依存しないので Node（テスト）からもそのまま呼べる
 */
export function chooseNormalMove(req: AiRequest, rand: () => number = Math.random): Move {
  const b = boardFrom(req), c = req.toMove, e = opponent(c), { w, h } = req, ownSize = ownTerritorySize(w * h);
  let best: Move = PASS, bestS = -Infinity;
  for (const p of candidates(b, req)) {
    const cap = b.capturesAt(p, c), save = b.savesAtari(p, c);
    // 自分の陣地の星でない点（票にならない）と、二眼を作れない狭い相手の陣地（取られるだけ）には打たない。取る・逃げる手は別。
    // 広い相手の陣地への打ち込みは、星の点で二眼を作って生きる手がありうるので残す
    const own = req.weights[p] === 0 && b.territoryOf(p, ownSize) === c;
    if (!cap && !save && (own || b.territoryOf(p, DEAD_INVASION_SIZE) === e)) continue;
    let s = rand() * 0.6 + req.weights[p] * 2;
    if (cap) s += 6;
    if (save) s += 5;
    if (!cap && b.isSelfAtari(p, c)) s -= 8;
    const x = p % w, y = (p / w) | 0, line = Math.min(x, y, w - 1 - x, h - 1 - y);
    s += [-0.8, 0.2, 0.6, 0.5, 0.3][Math.min(line, 4)];
    if (s > bestS) { bestS = s; best = p; }
  }
  return bestS < -4 ? PASS : best;
}
