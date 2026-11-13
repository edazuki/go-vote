import './style.css';
import { AiClient } from './ai/client';
import { PRETEND_MS, type Level } from './ai/protocol';
import { BOARDS, KOMI_CHOICES, PARTIES, colorOfParty, partyOf, shownPct, starCount, starsOf, votes, winner, type Party } from './core/flag';
import { Game } from './core/game';
import { BLACK, PASS, opponent, type Color, type Move } from './core/types';
import { Renderer, type View } from './render/renderer';
import { setupPanel } from './setup';
import { playCaptureSound, playSparkle, playStoneSound, playWinSound, setVolume, unlockAudio } from './ui/audio';
import { celebrate, clearCelebration } from './ui/celebrate';
import { bindBoardInput } from './ui/input';
import { clearSaved, loadGame, loadSettings, saveGame, saveSettings, type Controller, type SavedGame } from './ui/storage';
import { setupTutorial } from './ui/tutorial';
import { burst, clearParticles } from './ui/particles';
import { drawChart, moveAtX, voteSeries, type SeriesPoint } from './ui/review';
import { detectLang, isLang, setLang, t, type Lang } from './ui/i18n';
import type { ShareResult } from './ui/share';
import { bindShareButtons } from './ui/share-buttons';
import { barTip, renderBar, setBarCelebrate, setBarWidth, statusCenter, timeArrival, timeDeparture } from './ui/votebar';
import { confirmButton } from './ui/confirm';

/** 画面に出す言葉のうち、日本人にも通じる短い英語は英語にしている（強さ・YOU・PASS・WIN など） */
const LEVEL_NAME: Record<Level, string> = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('board');
const passBtn = $<HTMLButtonElement>('btn-pass'), newBtn = $<HTMLButtonElement>('btn-new');
const undoBtn = $<HTMLButtonElement>('btn-undo'), resignBtnEl = $<HTMLButtonElement>('btn-resign');
const settingsDlg = $<HTMLDialogElement>('settings'), volumeIn = $<HTMLInputElement>('opt-volume');
const setupEl = $('setup'), setupToggle = $('setup-toggle');
// バーと振り返りの幅は盤（canvas）の幅にそろえる
const reviewEl = $('review'), chart = $<HTMLCanvasElement>('review-chart');
new ResizeObserver(() => {
  setBarWidth(canvas.style.width);
  reviewEl.style.maxWidth = canvas.style.width;
  if (!reviewEl.hidden) updateReview();
}).observe(canvas);

/** 対局設定をたたむ・開く（たたんだ見た目はスマホの CSS だけが使う。PC では常に開いている） */
function setSetupOpen(open: boolean): void {
  setupEl.classList.toggle('collapsed', !open);
  setupToggle.setAttribute('aria-expanded', String(open));
}
setupToggle.addEventListener('click', () => setSetupOpen(setupEl.classList.contains('collapsed')));

const settings = loadSettings();
// 音：見出しと遊び方のボタンで消す・戻す（音量は設定で）
const soundBtns = [$<HTMLButtonElement>('btn-sound'), $<HTMLButtonElement>('tut-sound')];
const SPEAKER = '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>';
function applySound(): void {
  const muted = settings.muted ?? false;
  setVolume(muted ? 0 : settings.volume);
  for (const b of soundBtns) {
    b.setAttribute('aria-pressed', String(muted));
    b.setAttribute('aria-label', t(muted ? 'sound.off' : 'sound.on'));
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${SPEAKER}${muted
    ? '<path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    : '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'}</svg>`;
  }
}
for (const b of soundBtns) b.addEventListener('click', () => {
  settings.muted = !settings.muted;
  saveSettings(settings);
  unlockAudio();
  applySound();
  if (!settings.muted) playStoneSound(false);
});

const renderer = new Renderer(canvas, $('board-wrap'));
const ai = new AiClient();

/** 進行中の対局（保存する中身 + 盤） */
let match: Omit<SavedGame, 'moves'>;
let stars: boolean[];
let view: View;
let thinking = false;
/** 終局後の振り返り：盤に出している手数の局面（最後の局面なら null）と、手ごとの得票率・形勢（終局して初めて作る） */
let reviewGame: Game | null = null;
let series: SeriesPoint[] | null = null;
/** 盤に出している局面（振り返り中はその手数の局面） */
const shownGame = () => reviewGame ?? view.game;

/** 先手が赤か */
const firstRed = () => match.firstRed;
const party = (c: Color) => partyOf(c, firstRed());
/** 手番の色 c を打つのは誰か */
const controller = (c: Color): Controller => match[party(c)];

/** 党の呼び名：CPU は強さ付き、人が1人なら YOU、2人なら RED / BLUE。english なら言語によらず英語の書き方（共有の画像と文） */
function partyName(p: Party, english = false): string {
  const ctl = match[p];
  if (ctl !== 'human') return english ? `CPU (${LEVEL_NAME[ctl]})` : t('cpu', { level: LEVEL_NAME[ctl] });
  return match.red === 'human' && match.blue === 'human' ? p.toUpperCase() : 'YOU';
}

function start(d: Omit<SavedGame, 'moves'>, moves: Move[] = []): void {
  ai.cancel();
  clearParticles();
  clearCelebration();
  setBarCelebrate(false);
  resignBtn.disarm();
  thinking = false;
  reviewGame = null;
  series = null;
  match = d;
  const spec = BOARDS[d.board];
  stars = starsOf(spec);
  let game: Game;
  try { game = Game.fromMoves(spec.w, spec.h, moves); } catch { game = new Game(spec.w, spec.h); }
  if (d.resigned !== undefined) game.resign(d.resigned);
  view = { game, stars, hover: null, tentative: null, firstRed: firstRed() };
  // 盤の線：消えた状態（旗の星の部分）から、ゆっくり浮かんで盤になる
  const lines = renderer.lines;
  lines.dataset.mode = 'intro';
  void lines.offsetWidth;
  lines.style.transition = 'opacity 1.6s ease .5s';
  window.setTimeout(() => { lines.style.transition = ''; }, 2200);
  update();
  maybeCpu();
}

const isCpuTurn = () => controller(view.game.toMove) !== 'human' && !view.game.isOver;
/** 盤から打てない */
const locked = () => view.game.isOver || isCpuTurn();

/**
 * 1手を盤に反映する（音・終局）。盤の上に一瞬出す知らせは使わない。
 * 打てない点は盤の × で分かり、パスや終局のわけは盤の下の行に出す
 */
function play(m: Move): void {
  const r = view.game.play(m);
  if (!r.ok) return;
  const mover = opponent(view.game.toMove);
  if (m !== PASS) playStoneSound(mover === BLACK);
  // 票の粒：星に打ったら盤からバーへ。取られた星は、取られた側のバーから盤へ戻る
  if (m !== PASS && stars[m]) {
    const f = burst(renderer.clientPoint(m), () => barTip(party(mover)), party(mover));
    timeArrival(party(mover), f);
    if (f.arriveLast) playSparkle(f.burst, true);   // 粒が飛び散る瞬間の「キラッ」（粒を出さない設定では鳴らさない）
  }
  if (r.captured.length) {
    renderer.captured(r.captured, view.game.toMove);
    playCaptureSound(r.captured.length);
    // 取られた星が戻るときは「キラッ」を鳴らさない（獲得のときだけ）
    const lost = party(view.game.toMove), tip = barTip(lost);
    for (const p of r.captured.filter(p => stars[p])) {
      const to = renderer.clientPoint(p);
      // 取られた票は、飛ぶにつれて党の色から空いた星の白へ
      timeDeparture(lost, burst(tip, () => to, lost, { count: 8, delay: 120, whiten: true }));
    }
  }
  view.tentative = null;
  save();
  update();
  if (view.game.isOver) win();
  maybeCpu();
}

const save = () => saveGame({ ...match, moves: view.game.moves });

/** 勝った色：投了ならその相手、そうでなければ得票（コミ込み、同数は後手） */
/** 待った（UNDO）を使った党が勝つと、不正選挙の疑惑つきの WIN? になる */
const doubted = (p: Party) => match.undone?.includes(p) ?? false;

const resultWinner = (): Color => {
  const g = view.game;
  return g.resigned !== null ? opponent(g.resigned) : winner(votes(g.board, stars), match.komi);
};

/** 終局したとき（対局の中で終わったときだけ。保存した対局を開いたときは出さない）：ファンファーレと紙吹雪、得票バーの光 */
function win(): void {
  playWinSound();
  setBarCelebrate(true);
  celebrate(party(resultWinner()), statusCenter());
}

async function maybeCpu(): Promise<void> {
  if (!isCpuTurn() || thinking) return;
  thinking = true;
  update();
  // CPU 同士でも、考えるふりの間があるので眺められる速さで進む
  const game = view.game, level = controller(game.toMove) as Level, [lo, hi] = PRETEND_MS[level];
  const pretend = new Promise(r => setTimeout(r, lo + Math.random() * (hi - lo)));
  // 後手の HARD は盤ごとの回数の上限をなくし、時間の上限まで読む（先手の有利を読みの深さで埋める。scripts/bench.ts vs で、
  // HARD 同士の先手の勝率が 5×5 で約 9 割 → 57%、7×7 で 8〜9 割 → 33%）。先手の HARD は上限のまま
  const noCap = game.toMove !== BLACK;
  const [m] = await Promise.all([ai.think(game, stars, level, match.komi, noCap), pretend]);
  if (game !== view.game) return;      // 新しい対局・待ったなどで捨てられた（考え中の印はそちらで消している）
  thinking = false;
  if (m === null || game.isOver) return;
  play(m);
}

function update(): void {
  const g = shownGame(), v = votes(g.board, stars), over = view.game.isOver;

  // 得票バー。中央の札は終局後だけ勝敗を出す（未開票の割合は、バーの伸びていない部分で分かる）。半目があるので引き分けはない
  const w = over ? party(resultWinner()) : null;
  const shown = shownPct(v, starCount(stars), match.komi);
  const pct = { red: colorOfParty('red', firstRed()) === BLACK ? shown.black : shown.white, blue: 0 };
  pct.blue = colorOfParty('blue', firstRed()) === BLACK ? shown.black : shown.white;
  renderBar({
    pct, names: { red: partyName('red'), blue: partyName('blue') }, first: party(BLACK),
    turn: over ? null : party(g.toMove), thinking, passer: !over && g.lastMove === PASS ? party(opponent(g.toMove)) : null,
    over, winner: w,
    status: w ? `${w.toUpperCase()} WIN${doubted(w) ? '?' : ''}${view.game.resigned !== null ? t('resign.tag') : view.game.repeated ? t('repeat') : ''}` : '',
    aria: t('votebar.aria', { r: pct.red.toFixed(1), b: pct.blue.toFixed(1) }),
  });

  const spec = BOARDS[match.board];
  $('setup-summary').textContent = `${spec.label}${t('sep')}${partyName('red')} vs ${partyName('blue')}${match.komi ? `${t('sep')}KOMI ${match.komi}` : ''}`;
  passBtn.disabled = locked();
  undoBtn.disabled = over || undoTarget() === null;
  resignBtnEl.disabled = over || resigner() === null;
  $('actions').hidden = over;
  reviewEl.hidden = !over;
  view.hideGhost = isCpuTurn();
  // 盤の線の濃さ：ふだんは少し薄め（CSS）。終局で消え、振り返り中も消したまま
  const linesMode = over ? 'over' : 'play';
  if (renderer.lines.dataset.mode !== linesMode) renderer.lines.dataset.mode = linesMode;
  renderer.draw(reviewGame ? { ...view, game: reviewGame, hideGhost: true } : view);
  if (over) { updateReview(); requestAnimationFrame(share.prepare); }
}

// ---- 終局後の振り返り ----
/** 盤に出している手数 */
const reviewAt = () => shownGame().moves.length;

function updateReview(): void {
  const g = view.game, last = g.moves.length;
  series ??= voteSeries(g.w, g.h, g.moves, stars, match.komi, firstRed());
  const at = reviewAt(), p = series[at];
  drawChart(chart, series, at);
  $('rv-move').textContent = `${at} / ${last}`;
  // 形勢：未開票を半々に分けたときの得票率
  const lr = Math.round(p.lean * 10) / 10;
  $('rv-lean').innerHTML = `<span class="lean-r">RED ${lr.toFixed(1)}</span> : <span class="lean-b">${(100 - lr).toFixed(1)} BLUE</span>`;
  $<HTMLButtonElement>('rv-first').disabled = $<HTMLButtonElement>('rv-prev').disabled = at === 0;
  $<HTMLButtonElement>('rv-next').disabled = $<HTMLButtonElement>('rv-last').disabled = at === last;
}

/** 振り返りで k 手目の局面を出す（盤と得票バーも合わせる） */
function seek(k: number): void {
  const g = view.game;
  if (!g.isOver) return;
  k = Math.max(0, Math.min(g.moves.length, k));
  if (k === reviewAt()) return;
  reviewGame = k === g.moves.length ? null : Game.fromMoves(g.w, g.h, g.moves.slice(0, k));
  update();
}
$('rv-first').addEventListener('click', () => seek(0));

// ---- 結果の共有 ----
/** 終局した対局の結果（共有の文と画像の中身） */
function shareResult(): ShareResult {
  const g = view.game, s = shownPct(votes(g.board, stars), starCount(stars), match.komi);
  const pct = (p: Party) => (colorOfParty(p, firstRed()) === BLACK ? s.black : s.white);
  return {
    board: BOARDS[match.board].label, winner: party(resultWinner()), red: pct('red'), blue: pct('blue'),
    redName: partyName('red', true), blueName: partyName('blue', true),
    end: g.resigned !== null ? 'resign' : g.repeated ? 'repeat' : null,
    doubt: doubted(party(resultWinner())),
    url: location.origin + location.pathname,
    moves: g.moves.length,
    date: new Date(),
    series: (series ??= voteSeries(g.w, g.h, g.moves, stars, match.komi, firstRed())),
  };
}
// 盤は振り返り中でも最後の局面（view）で描く
const share = bindShareButtons({ view: () => view, result: shareResult });
$('rv-prev').addEventListener('click', () => seek(reviewAt() - 1));
$('rv-next').addEventListener('click', () => seek(reviewAt() + 1));
$('rv-last').addEventListener('click', () => seek(Infinity));
// チャートを押す・なぞると、その手へ
chart.addEventListener('pointerdown', e => {
  chart.setPointerCapture(e.pointerId);
  seek(moveAtX(chart, e.clientX, view.game.moves.length));
});
chart.addEventListener('pointermove', e => {
  if (chart.hasPointerCapture(e.pointerId)) seek(moveAtX(chart, e.clientX, view.game.moves.length));
});
// キーボード：← → で1手、Home / End で最初・最後
window.addEventListener('keydown', e => {
  if (!view.game.isOver || document.querySelector('dialog[open]') || (e.target as HTMLElement).closest?.('select, input, textarea')) return;
  const to = ({ ArrowLeft: reviewAt() - 1, ArrowRight: reviewAt() + 1, Home: 0, End: Infinity } as Record<string, number>)[e.key];
  if (to === undefined) return;
  e.preventDefault();
  seek(to);
});

// ---- 盤の操作 ----
const input = bindBoardInput(canvas, renderer, {
  commit(p) {
    if (!locked()) play(p);
  },
  preview(hover, tentative) {
    view.hover = hover;
    view.tentative = locked() ? null : tentative;
    update();
  },
});

passBtn.addEventListener('click', () => { if (!locked()) play(PASS); });

// ---- 待った・投了 ----
/** 手順の n 手目を打つ色（先手 = BLACK） */
const colorAt = (n: number): Color => (n % 2 === 0 ? BLACK : opponent(BLACK));

/**
 * 待ったで戻す先の手数：1手以上戻し、人の手番になるまで戻す（CPU の手もまとめて戻す）。
 * 戻す手に人の手がなければ（人がいない・まだ打っていない）null
 */
function undoTarget(): number | null {
  const moves = view.game.moves;
  if (view.game.isOver || !moves.length) return null;
  let n = moves.length - 1;
  while (n > 0 && controller(colorAt(n)) !== 'human') n--;
  for (let i = n; i < moves.length; i++) if (controller(colorAt(i)) === 'human') return n;
  return null;
}

function undo(): void {
  const n = undoTarget();
  if (n === null) return;
  // 戻した先で手番になる党（人）が待ったを使った
  const p = party(colorAt(n));
  if (!doubted(p)) match.undone = [...(match.undone ?? []), p];
  ai.cancel();
  thinking = false;
  clearParticles();
  resignBtn.disarm();
  const g = view.game;
  view.game = Game.fromMoves(g.w, g.h, g.moves.slice(0, n));
  view.tentative = null;
  save();
  update();
  maybeCpu();
}
// 待った：その党が初めて使うときだけ、勝っても WIN?（疑惑の当選）になるとダイアログで知らせ、UNDO を選んだら戻す
const undoDlg = $<HTMLDialogElement>('undo-dlg');
undoBtn.addEventListener('click', () => {
  const n = undoTarget();
  if (n === null) return;
  if (doubted(party(colorAt(n)))) undo();
  else { undoDlg.returnValue = ''; undoDlg.showModal(); }
});
undoDlg.addEventListener('close', () => { if (undoDlg.returnValue === 'undo') undo(); });
undoDlg.addEventListener('click', e => { if (e.target === undoDlg) undoDlg.close(); });

/** 投了する党：人が1人ならその人、2人なら手番の側。人がいなければ null */
function resigner(): Party | null {
  const humans = PARTIES.filter(p => match[p] === 'human');
  if (!humans.length) return null;
  return humans.length === 1 ? humans[0] : party(view.game.toMove);
}

// 投了：2回押しで確定。盤の手は増えない
const resignBtn = confirmButton(resignBtnEl, {
  label: () => 'GIVE UP',
  confirmLabel: () => t('resign.confirm'),
  enabled: () => resigner() !== null && !view.game.isOver,
  onConfirm() {
    const p = resigner();
    if (p === null) return;
    ai.cancel();
    thinking = false;
    const c = colorOfParty(p, firstRed());
    view.game.resign(c);
    match.resigned = c;
    view.tentative = null;
    save();
    update();
    win();
  },
});

// ---- 上部の対局設定。変えた値は覚えておき、「NEW GAME」で使う ----
const setup = setupPanel({
  initial: settings.setup,
  onChange(choice) { settings.setup = choice; saveSettings(settings); },
});

function newMatch(): void {
  start({ ...setup.start(), komi: settings.komi });
  input.clear();   // 盤（view）ができてから。先に呼ぶと初回起動で view が未定義のまま触ってしまう
  save();
  setSetupOpen(false);
}

// NEW GAME：対局の途中なら2回押しで確定
const NEW_LABEL = newBtn.textContent!;
const newConfirm = confirmButton(newBtn, {
  label: () => NEW_LABEL,
  confirmLabel: () => t('new.confirm'),
  needConfirm: () => !view.game.isOver && view.game.moves.length > 0,
  onConfirm: newMatch,
});

// ---- 設定：音量・ルール・遊び方・保存データ ----
// 言語：初めて開いたときはブラウザの言語。変えたら覚えて、画面の文言を入れ替える
const langSel = $<HTMLSelectElement>('opt-lang');
/** 言語を変えたら、確認待ちのボタンは元の文言に戻す（あとで resetConfirm も入る） */
const confirms = [newConfirm, resignBtn];
function applyLang(l: Lang): void {
  setLang(l, { version: __APP_VERSION__ });
  langSel.value = l;
  for (const b of confirms) b.disarm();
  applySound();
  if (view) update();
}
applyLang(isLang(settings.lang) ? settings.lang : detectLang());
langSel.addEventListener('change', () => {
  if (!isLang(langSel.value)) return;
  settings.lang = langSel.value;
  saveSettings(settings);
  applyLang(langSel.value);
});
volumeIn.value = String(Math.round(settings.volume * 100));
// コミ：盤共通。いまの対局はそのままで、次の対局から効く
const komiSel = $<HTMLSelectElement>('opt-komi');
komiSel.innerHTML = KOMI_CHOICES.map(k => `<option value="${k}">${k}</option>`).join('');
komiSel.value = String(settings.komi);
komiSel.addEventListener('change', () => { settings.komi = Number(komiSel.value); saveSettings(settings); });
$('btn-settings').addEventListener('click', () => settingsDlg.showModal());
settingsDlg.addEventListener('click', e => { if (e.target === settingsDlg) settingsDlg.close(); });
// 音量を動かしたら、消していた音も戻す
volumeIn.addEventListener('input', () => { settings.volume = Number(volumeIn.value) / 100; settings.muted = false; saveSettings(settings); applySound(); });
volumeIn.addEventListener('change', () => playStoneSound(false));   // 離したときに試し鳴らし

const tutorial = setupTutorial(() => {
  if (settings.tutorialSeen) return;
  settings.tutorialSeen = true;
  saveSettings(settings);
});
$('btn-tutorial').addEventListener('click', () => { settingsDlg.close(); tutorial.open(); });

// 保存データを消す：2回押しで確定し、消したら初めて開いたときの状態で読み直す
confirms.push(confirmButton($<HTMLButtonElement>('btn-reset'), {
  label: () => t('reset'),
  confirmLabel: () => t('reset.confirm'),
  onConfirm() { clearSaved(); location.reload(); },
}));

// 開発用：終局の演出をすぐ見るボタン（npm run dev のときだけ。本番のビルドには入らない）
if (import.meta.env.DEV) {
  void import('./dev').then(m => m.devPanel({
    board: () => setup.choice().board,
    komi: () => settings.komi,
    start: (board, moves) => start({ board, firstRed: true, red: 'human', blue: 'human', komi: settings.komi }, moves),
    play,
  }));
}

// 最初の操作で音を有効化（iOS 対策）
window.addEventListener('pointerdown', unlockAudio, { once: true });

// 保存した対局があれば続きから。なければ上部の設定（初回は CPU 戦）で始める
const saved = loadGame();
if (saved) {
  const { moves, ...d } = saved;
  start(d, moves);
  // 打ちかけの対局があれば、設定はたたんで盤から見せる
  setSetupOpen(moves.length === 0);
} else {
  newMatch();
  setSetupOpen(true);   // 初めて開いたときは設定を見せる
}
if (!settings.tutorialSeen) tutorial.open();
