/** 効果音（Web Audio でその場で合成）。iOS は最初のユーザー操作で resume しないと鳴らない */
let ctx: AudioContext | null = null;
/** 全体の音量。音はすべてここを通して出す */
let master: GainNode | null = null;
let volume = 0.8;
let noise: AudioBuffer | null = null;

export function unlockAudio(): void {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
    master = null;
  }
}

/** 音量（0..1） */
export function setVolume(v: number): void {
  volume = v;
  if (master) master.gain.value = v;
}

const ready = () => (ctx && ctx.state === 'running' ? ctx : null);

/** 鳴らせる状態なら、音の出口（音量を通る）。音の聴き比べ（tools/lab-sounds.ts）で、本番にない案の音を作るのに使う */
export const audioOut = (): { a: AudioContext; out: AudioNode } | null => { const a = ready(); return a && master ? { a, out: master } : null; };

export function noiseBuffer(a: AudioContext): AudioBuffer {
  if (noise) return noise;
  noise = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

/** 短く切ったノイズを帯域で絞って鳴らす（木を打つ「コッ」「パチ」の素） */
function knock(a: AudioContext, t: number, freq: number, q: number, len: number, gain: number): void {
  const n = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
  n.buffer = noiseBuffer(a);
  bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  n.connect(bp).connect(g).connect(master!);
  n.start(t, Math.random() * 0.4); n.stop(t + len + 0.01);
}

/** 盤の胴鳴り（低い正弦波が短く響く） */
function body(a: AudioContext, t: number, freq: number, len: number, gain: number): void {
  const o = a.createOscillator(), g = a.createGain();
  o.frequency.setValueAtTime(freq * 1.15, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.03);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(master!);
  o.start(t); o.stop(t + len + 0.02);
}

/** 石を置く音：木の盤に石が当たる「パチッ」。黒（那智黒）は少し低く、白（蛤）は少し高い */
export function playStoneSound(black: boolean): void {
  const a = ready();
  if (!a) return;
  const t = a.currentTime, j = 0.96 + Math.random() * 0.08;
  knock(a, t, (black ? 2600 : 3300) * j, 2.2, 0.035, 0.9);
  knock(a, t, 900 * j, 1.2, 0.06, 0.35);
  body(a, t, (black ? 210 : 240) * j, 0.16, 0.35);
}

/** 石を取る音：取った石を拾い上げる、軽い石同士の触れ合い（数に応じて少し増える） */
export function playCaptureSound(count: number): void {
  const a = ready();
  if (!a) return;
  const k = Math.min(5, count), t = a.currentTime + 0.05;
  for (let i = 0; i < k; i++) knock(a, t + i * 0.055 + Math.random() * 0.02, 4200 + Math.random() * 1500, 6, 0.03, 0.4);
}

/**
 * ラッパの1音：のこぎり波2本（少しずらして厚く）を、吹き始めに開くローパスに通す。
 * 吹き始めは少し低いところからしゃくり上げ、長い音にはビブラートをかける
 */
function brass(a: AudioContext, f: number, s: number, len: number, gain: number): void {
  const out = a.createGain(), lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(f * 1.2, s);
  lp.frequency.exponentialRampToValueAtTime(f * 6, s + 0.05);
  lp.frequency.exponentialRampToValueAtTime(f * 3.2, s + Math.min(0.3, len));
  out.gain.setValueAtTime(0.0001, s);
  out.gain.exponentialRampToValueAtTime(gain, s + 0.03);
  out.gain.exponentialRampToValueAtTime(gain * 0.75, s + 0.12);
  out.gain.setValueAtTime(gain * 0.75, s + len - 0.06);
  out.gain.exponentialRampToValueAtTime(0.0001, s + len + 0.08);
  lp.connect(out).connect(master!);
  // ビブラート（0.25 秒より長い音だけ、少し遅れてかける）
  let vib: GainNode | null = null;
  if (len > 0.25) {
    const lfo = a.createOscillator();
    vib = a.createGain();
    lfo.frequency.value = 5.5;
    vib.gain.setValueAtTime(0, s);
    vib.gain.linearRampToValueAtTime(f * 0.007, s + 0.35);
    lfo.connect(vib);
    lfo.start(s); lfo.stop(s + len + 0.1);
  }
  for (const cents of [-5, 6]) {
    const o = a.createOscillator();
    o.type = 'sawtooth';
    o.detune.value = cents;
    o.frequency.setValueAtTime(f * 0.93, s);
    o.frequency.exponentialRampToValueAtTime(f, s + 0.04);
    if (vib) vib.connect(o.frequency);
    o.connect(lp);
    o.start(s); o.stop(s + len + 0.1);
  }
}

/**
 * 勝ったときのファンファーレ：ラッパで ソ・ド・ミ・ソー、ミ・ソーーと吹き（ラッパで出せる自然倍音の音だけ）、
 * 3度下を重ねて2本で鳴らす。最後に高い粒をきらっと散らす
 */
export function playWinSound(): void {
  const a = ready();
  if (!a) return;
  const t = a.currentTime;
  const G4 = 392, C5 = 523.25, E5 = 659.25, G5 = 783.99;
  // [音, 下の声部, 長さ（秒）]。短い音は 0.13 秒刻み
  const call: [number, number, number][] = [[G4, 0, 0.13], [C5, 0, 0.13], [E5, C5, 0.13], [G5, E5, 0.36], [E5, C5, 0.13], [G5, E5, 1.1]];
  let s = t;
  for (const [f, low, len] of call) {
    brass(a, f, s, len * 0.92, 0.015);
    if (low) brass(a, low, s, len * 0.92, 0.0085);
    s += len;
  }
  // きらっ（最後の長い音に重ねる）
  for (let i = 0; i < 9; i++) {
    const at = s - 1.0 + i * 0.07 + Math.random() * 0.03, o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.value = 2600 + Math.random() * 2400;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.0045, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    o.connect(g).connect(master!);
    o.start(at); o.stop(at + 0.2);
  }
}

/** 「チリチリ」の作り（tools/sound-lab.html で聴き比べて決める） */
export interface TickParams {
  /** 粒の間隔（秒）の最小・最大 */
  gapMin: number;
  gapMax: number;
  /** 増えるときの音程（Hz）：鳴り始め → 鳴り終わり。減るときは逆にたどる */
  freqLow: number;
  freqHigh: number;
  /** 音程のばらつき（0.12 なら ±6%） */
  jitter: number;
  wave: OscillatorType;
  /** 音の粒の大きさ（0 で鳴らさない）と長さ（秒） */
  toneGain: number;
  toneLen: number;
  /** ノイズの粒の大きさ（0 で鳴らさない）・音程に対する帯域の倍率・鋭さ */
  noiseGain: number;
  noiseRatio: number;
  noiseQ: number;
}

/** 本番の音：「コイン」案（低めでそろった音程のチャリチャリ）を、音程 600〜1300Hz に下げたもの */
export const TICK_DEFAULT: TickParams = {
  gapMin: 0.05, gapMax: 0.07, freqLow: 600, freqHigh: 1300, jitter: 0.02, wave: 'triangle',
  toneGain: 0.05, toneLen: 0.05, noiseGain: 0.04, noiseRatio: 3, noiseQ: 12,
};

/**
 * 得票バーが動くあいだの「チリチリ」：ごく短い高い音の粒を、delay ms 後から dur ms のあいだ細かく鳴らす。
 * 増えるときは音程が少しずつ上がり、減るときは下がる。両端は小さく
 */
export function playBarTicks(delay: number, dur: number, up: boolean, p: TickParams = TICK_DEFAULT): void {
  const a = ready();
  if (!a || dur <= 0) return;
  const t0 = a.currentTime + delay / 1000, len = dur / 1000;
  for (let s = 0; s < len; s += p.gapMin + Math.random() * Math.max(0, p.gapMax - p.gapMin)) {
    const k = s / len, t = t0 + s, span = p.freqHigh - p.freqLow;
    const f = (up ? p.freqLow + span * k : p.freqHigh - span * k) * (1 - p.jitter / 2 + Math.random() * p.jitter);
    const env = Math.sin(Math.PI * Math.min(1, k * 1.15 + 0.05));   // 両端を小さく
    if (p.toneGain > 0) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = p.wave; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(p.toneGain * env + 0.0002, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + p.toneLen);
      o.connect(g).connect(master!);
      o.start(t); o.stop(t + p.toneLen + 0.01);
    }
    if (p.noiseGain > 0) knock(a, t, f * p.noiseRatio, p.noiseQ, 0.012, p.noiseGain * env + 0.0002);
  }
}

/** 短い音の粒（正弦波・三角波） */
export function blip(a: AudioContext, t: number, f: number, len: number, gain: number, wave: OscillatorType = 'sine'): void {
  const o = a.createOscillator(), g = a.createGain();
  o.type = wave; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(master!);
  o.start(t); o.stop(t + len + 0.02);
}

/**
 * 票の粒が飛び散る瞬間の「キラッ」：高い粒を 0.1 秒ほどに散らす（取られたときは低めでくすんだ音）。
 * at = いまから何 ms 後か、up = 盤からバーへ（星を取った）。pitch は高さ、gain は大きさの倍率
 */
export function playSparkle(at: number, up: boolean, pitch = 1, gain = 1): void {
  const a = ready();
  if (!a) return;
  const t = a.currentTime + at / 1000;
  for (let i = 0; i < 5; i++) {
    const fr = (up ? 4200 + Math.random() * 2800 : 1700 + Math.random() * 1200) * pitch;
    blip(a, t + i * 0.022 + Math.random() * 0.012, fr, up ? 0.14 : 0.1, 0.035 * gain);
  }
}
