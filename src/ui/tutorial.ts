import { shownPct, starCount, votes } from '../core/flag';
import { Game } from '../core/game';
import { PASS, WHITE, type Move } from '../core/types';
import { Renderer, type View } from '../render/renderer';
import { t } from './i18n';
import { playCaptureSound, playStoneSound } from './audio';

/**
 * 遊び方の説明。7×5 の小さな盤（本番と同じく x + y が偶数の交点が星）で、
 * 本番と同じ描画を使って手順を自動で打って見せる。各段の手順は、終わると少し置いて最初から繰り返す
 */

interface Step {
  title: string;
  /** 本文の鍵（i18n.ts） */
  text: 'tut.0' | 'tut.1' | 'tut.2' | 'tut.3' | 'tut.4';
  /** 最初から並べておく手順 */
  setup: Move[];
  /** 見せる手順（一手ずつ打つ） */
  demo: Move[];
}

const W = 7, H = 5;
const at = (x: number, y: number) => y * W + x;
const STARS = Array.from({ length: W * H }, (_, i) => ((i % W) + ((i / W) | 0)) % 2 === 0);
/** 赤と青が交互に打つ手順。片方の手が尽きたら、その側はパスする（もう片方が打つので、パスが2回続くことはない） */
function both(red: Move[], blue: Move[]): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < Math.max(red.length, blue.length); i++) out.push(red[i] ?? PASS, blue[i] ?? PASS);
  return out;
}

/** 赤が左（x = 2 の列）、青が右（x = 4 の列）に壁を作った形 */
const WALLS = both([0, 1, 2, 3, 4].map(y => at(2, y)), [0, 1, 2, 3, 4].map(y => at(4, y)));
/** 赤の陣地の星を埋める */
const RED_STARS = [at(0, 0), at(1, 1), at(0, 2), at(1, 3), at(0, 4)];
/** 赤の陣地の星でない点。(0,1)(0,3) は空けておく */
const RED_PLAIN = [at(1, 0), at(1, 2), at(1, 4)];
/** 赤の陣地の内側の空き点を、星 (0,2) と星でない点 (1,0) の2つにした形（大きく囲む盤・開票の盤） */
const RED_STARS_EYE = [at(0, 0), at(1, 1), at(1, 3), at(0, 4)];
const RED_PLAIN_EYE = [at(0, 1), at(0, 3), at(1, 2), at(1, 4)];
/** 青が真ん中の列（x = 3）を埋めて、赤の壁の外側をふさぐ */
const BLUE_MID = [0, 1, 2, 3, 4].map(y => at(3, y));
const BLUE_FILL = [at(6, 0), at(5, 1), at(6, 2), at(5, 3), at(6, 4), at(5, 0), at(5, 2), at(5, 4)];

const STEPS: Step[] = [
  {
    title: 'STARS ARE VOTES',
    text: 'tut.0',
    setup: [],
    // 4手目は角：端や角の交点にも置ける
    demo: [at(1, 1), at(5, 1), at(3, 2), at(6, 4)],
  },
  {
    title: 'CAPTURE',
    text: 'tut.1',
    // 真ん中：赤が上・左・右から囲んだ青。左下の隅：青が上からふさいだ赤（星の上）。
    // 赤が下をふさいで青を取り、続けて青が右をふさいで隅の赤を取る（隅は逃げ場が2つしかない）
    setup: [at(3, 0), at(3, 1), at(2, 1), at(0, 3), at(4, 1), PASS, at(0, 4), PASS],
    demo: [at(3, 2), at(1, 4)],
  },
  {
    title: 'SURROUND THEM ALL',
    text: 'tut.2',
    // 赤は内側の空き点を2つ（星 (0,2) と (1,0)）残した形。青は真ん中の列で外側をふさぐ。赤が星 (0,2) を埋め、青が (1,0) に打って取る
    setup: [...WALLS, ...both([...RED_STARS_EYE, ...RED_PLAIN_EYE], BLUE_MID)],
    demo: [at(0, 2), at(1, 0)],
  },
  {
    title: 'COUNT THE VOTES',
    text: 'tut.3',
    setup: [...WALLS, ...both([...RED_STARS_EYE, ...RED_PLAIN_EYE, at(3, 1), at(3, 3)], BLUE_FILL)],
    demo: [],
  },
  {
    title: 'KOMI',
    text: 'tut.4',
    // 開票の盤で、真ん中の星を赤と青が1つずつ分けた形（最後の2手を打って見せる）
    setup: [...WALLS, ...both([...RED_STARS, ...RED_PLAIN], BLUE_FILL)],
    demo: [at(3, 1), at(3, 3)],
  },
];

const FIRST_MS = 700, MOVE_MS = 900, REPLAY_MS = 2600;

export function setupTutorial(onClose: () => void): { open: () => void } {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dlg = $<HTMLDialogElement>('tutorial');
  const title = $('tut-title'), text = $('tut-text'), count = $('tut-count');
  const prev = $<HTMLButtonElement>('tut-prev'), next = $<HTMLButtonElement>('tut-next');
  const renderer = new Renderer($<HTMLCanvasElement>('tut-canvas'), $('tut-board'));
  let step = 0, timers: number[] = [];

  /** 盤と得票バーを描く（遊び方は赤が先手・コミ 0） */
  function draw(view: View): void {
    renderer.draw(view);
    const s = shownPct(votes(view.game.board, STARS), starCount(STARS));
    $('tut-fill-r').style.width = `${s.black}%`;
    $('tut-fill-b').style.width = `${s.white}%`;
    $('tut-pct-r').textContent = `${s.black.toFixed(1)}%`;
    $('tut-pct-b').textContent = `${s.white.toFixed(1)}%`;
  }

  const stop = () => { for (const t of timers) clearTimeout(t); timers = []; };

  function play(view: View, m: Move): void {
    const r = view.game.play(m);
    if (!r.ok || m === PASS) { draw(view); return; }
    playStoneSound(view.game.toMove === WHITE);   // 着手後の手番が青 = 赤が打った
    if (r.captured.length) {
      renderer.captured(r.captured, view.game.toMove);
      playCaptureSound(r.captured.length);
    }
    draw(view);
  }

  /** 段の手順を最初から見せる（終わったら繰り返す） */
  function run(): void {
    stop();
    const s = STEPS[step];
    const view: View = { game: Game.fromMoves(W, H, s.setup), stars: STARS, hover: null, tentative: null, hideGhost: true };
    draw(view);
    let t = FIRST_MS;
    for (const m of s.demo) {
      timers.push(window.setTimeout(() => play(view, m), t));
      if (m !== PASS) t += MOVE_MS;
    }
    if (s.demo.length) timers.push(window.setTimeout(run, t + REPLAY_MS));
  }

  function show(i: number): void {
    step = i;
    const s = STEPS[i];
    title.textContent = s.title;
    text.textContent = t(s.text);
    count.textContent = `${i + 1} / ${STEPS.length}`;
    prev.disabled = i === 0;
    next.textContent = i === STEPS.length - 1 ? 'START' : 'NEXT';
    run();
  }

  prev.addEventListener('click', () => { if (step > 0) show(step - 1); });
  next.addEventListener('click', () => { if (step < STEPS.length - 1) show(step + 1); else dlg.close(); });
  $('tut-skip').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { stop(); onClose(); });

  return {
    open() {
      dlg.showModal();
      show(0);
    },
  };
}

/** テスト用：遊び方の各段の盤が、手順どおりに打てるか確かめるための中身 */
export const TUTORIAL_FOR_TEST = { W, H, STARS, STEPS };
