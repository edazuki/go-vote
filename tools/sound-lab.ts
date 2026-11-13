import { TICK_DEFAULT, playBarTicks, playCaptureSound, playStoneSound, setVolume, unlockAudio, type TickParams } from '../src/ui/audio';
import { TICK_OLD, playEndSound, playFlightSound, type FlightSound, type FlightTimes } from './lab-sounds';

/** 聴き比べる案。最初が本番で使っている値 */
const PRESETS: { name: string; note: string; p: TickParams }[] = [
  { name: '現在（コイン低め）', note: 'コインを音程 600〜1300Hz に下げたもの。本番の音', p: TICK_DEFAULT },
  { name: '前の音', note: '三角波の高い粒にノイズを少し。0.03〜0.055秒おき', p: TICK_OLD },
  { name: 'かすか', note: '前の音を半分の大きさに', p: { ...TICK_OLD, toneGain: 0.022, noiseGain: 0.025 } },
  { name: '細かい砂', note: 'ノイズだけ。間隔を詰めてサラサラ', p: { ...TICK_OLD, gapMin: 0.014, gapMax: 0.026, freqLow: 5000, freqHigh: 7500, jitter: 0.3, toneGain: 0, noiseGain: 0.06, noiseRatio: 1, noiseQ: 3 } },
  { name: '鈴', note: 'やわらかい正弦波の粒を細かく', p: { ...TICK_OLD, gapMin: 0.022, gapMax: 0.036, freqLow: 3600, freqHigh: 5600, jitter: 0.08, wave: 'sine', toneGain: 0.035, toneLen: 0.03, noiseGain: 0.015 } },
  { name: 'カチカチ', note: '粗めの間隔で、硬い矩形波', p: { ...TICK_OLD, gapMin: 0.06, gapMax: 0.09, freqLow: 1800, freqHigh: 2600, jitter: 0.05, wave: 'square', toneGain: 0.018, toneLen: 0.014, noiseGain: 0.08, noiseRatio: 1.8, noiseQ: 6 } },
  { name: 'きらきら', note: '高さのばらつきを大きく、余韻を長め', p: { ...TICK_OLD, gapMin: 0.04, gapMax: 0.08, freqLow: 2600, freqHigh: 6500, jitter: 0.25, wave: 'sine', toneGain: 0.05, toneLen: 0.07, noiseGain: 0 } },
  { name: 'コイン', note: '低めでそろった音程。チャリチャリ', p: { ...TICK_OLD, gapMin: 0.05, gapMax: 0.07, freqLow: 1300, freqHigh: 2100, jitter: 0.02, toneGain: 0.05, toneLen: 0.05, noiseGain: 0.04, noiseRatio: 3, noiseQ: 12 } },
  { name: 'デジタル', note: '矩形波の短い粒を一定間隔で（ゲームの数え上げ風）', p: { ...TICK_OLD, gapMin: 0.045, gapMax: 0.045, freqLow: 1500, freqHigh: 3000, jitter: 0, wave: 'square', toneGain: 0.02, toneLen: 0.025, noiseGain: 0 } },
];

/** 調整できる値：名前・範囲・刻み */
const SLIDERS: [keyof TickParams, string, number, number, number][] = [
  ['gapMin', '間隔 最小（秒）', 0.005, 0.15, 0.001],
  ['gapMax', '間隔 最大（秒）', 0.005, 0.2, 0.001],
  ['freqLow', '音程 低（Hz）', 300, 9000, 50],
  ['freqHigh', '音程 高（Hz）', 300, 12000, 50],
  ['jitter', '音程のばらつき', 0, 0.6, 0.01],
  ['toneGain', '音の粒 大きさ', 0, 0.15, 0.001],
  ['toneLen', '音の粒 長さ（秒）', 0.005, 0.15, 0.001],
  ['noiseGain', 'ノイズ 大きさ', 0, 0.2, 0.001],
  ['noiseRatio', 'ノイズ 帯域（音程の何倍）', 0.3, 4, 0.05],
  ['noiseQ', 'ノイズ 鋭さ', 0.5, 20, 0.5],
];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const durIn = $<HTMLInputElement>('dur'), volIn = $<HTMLInputElement>('vol');
const dur = () => Number(durIn.value);

function syncOut(): void {
  $('dur-out').textContent = `${(dur() / 1000).toFixed(1)} 秒`;
  $('vol-out').textContent = `${volIn.value}%`;
  setVolume(Number(volIn.value) / 100);
}
durIn.addEventListener('input', syncOut);
volIn.addEventListener('input', syncOut);
syncOut();
// ブラウザは操作があるまで音を出さないので、最初の操作で起こす
addEventListener('pointerdown', unlockAudio, { capture: true });

/** バーを伸ばす（縮める）見た目を音に合わせる */
function animate(fill: HTMLElement, up: boolean): void {
  fill.style.transition = 'none';
  fill.style.width = up ? '30%' : '60%';
  void fill.offsetWidth;
  fill.style.transition = `width ${dur()}ms cubic-bezier(.3, .7, .3, 1)`;
  fill.style.width = up ? '60%' : '30%';
}

function play(p: TickParams, up: boolean, fill: HTMLElement): void {
  unlockAudio();
  // 起こした直後は少し待たないと最初の粒が落ちることがある
  setTimeout(() => { playBarTicks(0, dur(), up, p); animate(fill, up); }, 30);
}

// ---- 案の一覧 ----
let custom: TickParams = { ...TICK_DEFAULT };
const cards: HTMLElement[] = [];
PRESETS.forEach((pr, i) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<h2>${String.fromCharCode(65 + i)}. ${pr.name}</h2><p>${pr.note}</p>
    <div class="track"><i></i></div>
    <div class="btns"><button class="primary" data-up>▲ 増える</button><button class="primary" data-down>▼ 減る</button><button data-pick>調整</button></div>`;
  const fill = card.querySelector<HTMLElement>('.track i')!;
  card.querySelector('[data-up]')!.addEventListener('click', () => play(pr.p, true, fill));
  card.querySelector('[data-down]')!.addEventListener('click', () => play(pr.p, false, fill));
  card.querySelector('[data-pick]')!.addEventListener('click', () => pick(i));
  $('presets').appendChild(card);
  cards.push(card);
});

// ---- 調整 ----
const inputs = new Map<keyof TickParams, HTMLInputElement>();
for (const [key, label, min, max, step] of SLIDERS) {
  const l = document.createElement('label');
  l.innerHTML = `<span>${label}</span><output></output><input type="range" min="${min}" max="${max}" step="${step}">`;
  const input = l.querySelector('input')!, out = l.querySelector('output')!;
  input.addEventListener('input', () => { (custom[key] as number) = Number(input.value); out.textContent = input.value; showJson(); });
  inputs.set(key, input);
  $('params').appendChild(l);
}
const waveLabel = document.createElement('label');
waveLabel.innerHTML = '<span>波形</span><output></output><select><option>sine</option><option>triangle</option><option>square</option><option>sawtooth</option></select>';
const waveSel = waveLabel.querySelector('select')!;
waveSel.addEventListener('change', () => { custom.wave = waveSel.value as OscillatorType; showJson(); });
$('params').appendChild(waveLabel);

function pick(i: number): void {
  custom = { ...PRESETS[i].p };
  $('custom-name').textContent = `${String.fromCharCode(65 + i)}. ${PRESETS[i].name} を元に`;
  cards.forEach((c, j) => c.classList.toggle('picked', j === i));
  for (const [key, input] of inputs) {
    input.value = String(custom[key]);
    (input.previousElementSibling as HTMLOutputElement).textContent = input.value;
  }
  waveSel.value = custom.wave;
  showJson();
}

function showJson(): void {
  $<HTMLTextAreaElement>('json').value = JSON.stringify({ ...custom, durMs: dur() }, null, 0).replace(/,"/g, ', "');
}
durIn.addEventListener('input', showJson);

const cFill = $('c-fill');
$('c-up').addEventListener('click', () => play(custom, true, cFill));
$('c-down').addEventListener('click', () => play(custom, false, cFill));
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($<HTMLTextAreaElement>('json').value); $('copy').textContent = 'コピーしました'; }
  catch { $<HTMLTextAreaElement>('json').select(); }
  setTimeout(() => { $('copy').textContent = '値をコピー'; }, 1500);
});

// ---- 飛ぶ音 ----
const FLIGHTS: { kind: FlightSound | null; name: string; note: string }[] = [
  { kind: null, name: 'なし', note: '飛ぶ音を鳴らさない' },
  { kind: 'swell', name: '吸い込み', note: 'スゥーッとふくらみ、着いた瞬間にチリチリへ' },
  { kind: 'whoosh', name: 'ヒュッ', note: '飛び立ちの一瞬の風切り音' },
  { kind: 'sparkle', name: 'キラッ', note: '飛び立つ瞬間に、高い粒をぱらっと（いまのゲーム。ゲームでは ▲ の獲得時だけ）' },
  { kind: 'pips', name: '粒ごとのピッ', note: '飛び立つ粒の数だけ、小さな音が上がっていく' },
];
/** ゲームと同じ時刻（main.ts の barTiming と particles.ts の burst に合わせる） */
const TIMES: Record<'up' | 'down', { f: FlightTimes; delay: number; dur: number }> = {
  // 粒は 0.26 秒かけて飛び散ってから飛び立つ。音は飛び散る瞬間（departFirst に入れて渡す）から
  up: { f: { departFirst: 0, departLast: 760, arriveFirst: 860, arriveLast: 1610 }, delay: 860, dur: 1300 },
  down: { f: { departFirst: 120, departLast: 880, arriveFirst: 980, arriveLast: 1730 }, delay: 380, dur: 1500 },
};
const fGain = $<HTMLInputElement>('f-gain'), fTint = $<HTMLSelectElement>('f-tint');
const syncFGain = () => { $('f-gain-out').textContent = `${fGain.value}%`; };
fGain.addEventListener('input', syncFGain);
syncFGain();

function playFlight(kind: FlightSound | null, up: boolean, fill: HTMLElement): void {
  unlockAudio();
  setTimeout(() => {
    const tm = TIMES[up ? 'up' : 'down'], pitch = { none: 1, red: 0.85, blue: 1.18 }[fTint.value as 'none'];
    if ($<HTMLInputElement>('f-stone').checked) (up ? () => playStoneSound(true) : () => playCaptureSound(1))();
    if (kind) playFlightSound(kind, tm.f, up, pitch, Number(fGain.value) / 100);
    if ($<HTMLInputElement>('f-ticks').checked) playBarTicks(tm.delay, tm.dur, up, TICK_DEFAULT);
    // バーは粒に合わせて遅れて動く
    fill.style.transition = 'none';
    fill.style.width = up ? '30%' : '60%';
    void fill.offsetWidth;
    fill.style.transition = `width ${tm.dur}ms cubic-bezier(.3, .7, .3, 1) ${tm.delay}ms`;
    fill.style.width = up ? '60%' : '30%';
  }, 30);
}

FLIGHTS.forEach((fl, i) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<h2>${i + 1}. ${fl.name}</h2><p>${fl.note}</p>
    <div class="track"><i></i></div>
    <div class="btns"><button class="primary" data-up>▲ 星を取る</button><button class="primary" data-down>▼ 取られる</button></div>`;
  const fill = card.querySelector<HTMLElement>('.track i')!;
  card.querySelector('[data-up]')!.addEventListener('click', () => playFlight(fl.kind, true, fill));
  card.querySelector('[data-down]')!.addEventListener('click', () => playFlight(fl.kind, false, fill));
  $('flights').appendChild(card);
});

// ---- 目安の音 ----
const ref = (f: () => void) => () => { unlockAudio(); setTimeout(f, 30); };
$('r-stone').addEventListener('click', ref(() => playStoneSound(true)));
$('r-capture').addEventListener('click', ref(() => playCaptureSound(3)));
$('r-end').addEventListener('click', ref(playEndSound));

pick(0);
