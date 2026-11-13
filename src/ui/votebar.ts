/**
 * 得票バー：両端の名前と大きな%、伸びるバー、先手・手番・考え中・パス・勝ちの印、中央の勝敗の札。
 * 赤は左・青は右（手番によらず党で固定）。バーの伸び縮みは、票の粒が着く・飛び立つ時刻に合わせる
 */
import { PARTIES, type Party } from '../core/flag';
import { playBarTicks } from './audio';
import type { Flight, Pt } from './particles';

const $ = (id: string) => document.getElementById(id)!;
const voteBar = $('vote-bar'), vbStatus = $('vb-status');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

/** 得票バーの片側 */
function vbSide(party: Party) {
  const k = party === 'red' ? 'r' : 'b';
  return {
    el: $(`vb-${k}`), pct: $(`pct-${k}`), name: $(`vb-name-${k}`), badge: $(`vb-badge-${k}`), first: $(`vb-first-${k}`),
    fill: $(`fill-${k}`), shown: 0, cur: 0, raf: 0,
  };
}
type VbSide = ReturnType<typeof vbSide>;
const sides: Record<Party, VbSide> = { red: vbSide('red'), blue: vbSide('blue') };

/** 得票バーの増減の速さ（ms）。票の粒がないとき（新しい対局・読み込み）に使う */
const BAR_MS = 1400;
/** 次の描き直しで、その党のバーをいつ・どれだけかけて動かすか（票の粒に合わせる） */
const barTiming: Partial<Record<Party, { delay: number; dur: number }>> = {};

/** 粒が着き始めてから着き終わるまでで、バーを伸ばす */
export function timeArrival(p: Party, f: Flight): void {
  barTiming[p] = { delay: f.arriveFirst, dur: Math.max(1300, f.arriveLast - f.arriveFirst) };
}
/** 粒が飛び立ち始めてから少しのあいだで、バーを縮める（複数の星が取られたら、まとめて一つの動きに） */
export function timeDeparture(p: Party, f: Flight): void {
  const prev = barTiming[p], start = Math.min(prev?.delay ?? Infinity, f.departFirst);
  const end = Math.max(prev ? prev.delay + prev.dur : 0, f.departLast + 1000);
  barTiming[p] = { delay: start, dur: end - start };
}

/** 大きな%（0.1 刻み）を、delay ms 後から dur ms かけて新しい値まで数える（下がるときは数え下げ）。動き出しで一瞬ふくらませる */
function countTo(s: VbSide, to: number, delay: number, dur: number): void {
  if (s.shown === to) return;
  cancelAnimationFrame(s.raf);
  // 前の動きの途中で次が来たら、いま見えている値から続ける（動きが長いので重なりやすい）
  const from = s.cur, t0 = performance.now() + delay;
  s.shown = to;
  window.setTimeout(() => {
    s.pct.classList.add('bump');
    window.setTimeout(() => s.pct.classList.remove('bump'), 180);
  }, delay);
  const step = (now: number) => {
    const k = dur ? Math.max(0, Math.min(1, (now - t0) / dur)) : now >= t0 ? 1 : 0, e = 1 - (1 - k) ** 3;
    s.cur = from + (to - from) * e;
    s.pct.textContent = `${s.cur.toFixed(1)}%`;
    if (k < 1) s.raf = requestAnimationFrame(step);
  };
  s.raf = requestAnimationFrame(step);
}

/** 得票バーの、その党の伸びている先（赤は右端、青は左端）の画面座標 */
export function barTip(p: Party): Pt {
  const r = sides[p].fill.getBoundingClientRect();
  return { x: p === 'red' ? r.right : r.left, y: r.top + r.height / 2 };
}

/** 中央の札の真ん中の画面座標（勝ったときの演出がここからはじける） */
export function statusCenter(): Pt {
  const r = vbStatus.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** 勝ったときの光（新しい対局で消す） */
export const setBarCelebrate = (on: boolean) => voteBar.classList.toggle('celebrate', on);

/** 幅を盤にそろえる */
export const setBarWidth = (w: string) => { voteBar.style.maxWidth = w; };

export interface BarState {
  /** 画面に出す得票率（%、0.1 刻み） */
  pct: Record<Party, number>;
  names: Record<Party, string>;
  /** 先手の党 */
  first: Party;
  /** 手番の党（終局後は null） */
  turn: Party | null;
  /** 手番の党が CPU で考え中 */
  thinking: boolean;
  /** 直前にパスした党 */
  passer: Party | null;
  over: boolean;
  /** 勝った党（終局後だけ） */
  winner: Party | null;
  /** 中央の札（RED WIN など。対局中は空） */
  status: string;
  /** 読み上げ名 */
  aria: string;
}

export function renderBar(s: BarState): void {
  for (const p of PARTIES) {
    const sd = sides[p], n = s.pct[p];
    sd.first.hidden = s.first !== p;
    sd.name.textContent = s.names[p];
    // 票の粒があればその着く（飛び立つ）時刻に合わせ、なければ BAR_MS かけてゆっくり動かす
    // 振り返りで手を動かしたときは、すぐ追いつく
    const byGrains = barTiming[p], tm = reducedMotion.matches ? { delay: 0, dur: 0 } : byGrains ?? { delay: 0, dur: s.over ? 250 : BAR_MS };
    delete barTiming[p];
    if (sd.fill.style.width !== `${n}%`) {
      // 票の粒で動くときは、動いているあいだチリチリ鳴らす（新しい対局などで戻るときは鳴らさない）
      if (byGrains) playBarTicks(tm.delay, tm.dur, n > sd.shown);
      sd.fill.style.transition = `width ${tm.dur}ms cubic-bezier(.3, .7, .3, 1) ${tm.delay}ms, filter .3s`;
      sd.fill.style.width = `${n}%`;
    }
    countTo(sd, n, tm.delay, tm.dur);
    sd.el.classList.toggle('turn', s.turn === p);
    sd.el.classList.toggle('won', s.over && s.winner === p);
    sd.fill.classList.toggle('lost', s.over && s.winner !== null && s.winner !== p);
    sd.fill.classList.toggle('win', s.over && s.winner === p);
    // 勝ちは中央の札と数値の光で出すので、名前の横には印を付けない
    const tag = s.thinking && s.turn === p ? 'think' : s.passer === p ? 'pass' : '';
    sd.badge.className = `badge ${tag}`;
    sd.badge.textContent = { think: 'THINKING', pass: 'PASS', '': '' }[tag];
  }
  voteBar.classList.toggle('over', s.over);
  voteBar.setAttribute('aria-label', s.aria);
  vbStatus.textContent = s.status;
}
