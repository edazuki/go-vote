/**
 * 音の聴き比べ（tools/sound-lab.html）でだけ使う、本番にない案の音。本番の音は src/ui/audio.ts
 */
import { audioOut, blip, noiseBuffer, playSparkle, type TickParams } from '../src/ui/audio';

/** 前に使っていた「チリチリ」（三角波の高い粒にノイズを少し） */
export const TICK_OLD: TickParams = {
  gapMin: 0.03, gapMax: 0.055, freqLow: 2600, freqHigh: 4400, jitter: 0.12, wave: 'triangle',
  toneGain: 0.045, toneLen: 0.022, noiseGain: 0.05, noiseRatio: 1.6, noiseQ: 8,
};

/** 前に使っていた終局の音：やわらかい2音 */
export function playEndSound(): void {
  const o = audioOut();
  if (!o) return;
  const { a, out } = o, t = a.currentTime;
  [523.25, 783.99].forEach((f, i) => {
    const osc = a.createOscillator(), g = a.createGain(), s = t + i * 0.16;
    osc.type = 'sine'; osc.frequency.value = f;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.18, s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.9);
    osc.connect(g).connect(out);
    osc.start(s); osc.stop(s + 1);
  });
}

/** 票の粒が飛ぶ時刻（いまからの ms）。src/ui/particles.ts の Flight と同じ形 */
export interface FlightTimes { departFirst: number; departLast: number; arriveFirst: number; arriveLast: number }
/** 粒が飛ぶ音の案。本番は sparkle（playSparkle） */
export type FlightSound = 'swell' | 'whoosh' | 'sparkle' | 'pips';

/** 帯域を絞ったノイズを、高さ f0 → f1、音量の形 env（[秒, 大きさ] の列）で鳴らす */
function sweepNoise(a: AudioContext, out: AudioNode, t: number, len: number, f0: number, f1: number, q: number, env: [number, number][]): void {
  const n = a.createBufferSource(), bp = a.createBiquadFilter(), g = a.createGain();
  n.buffer = noiseBuffer(a); n.loop = true;
  bp.type = 'bandpass'; bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + len);
  g.gain.setValueAtTime(0.0001, t);
  for (const [s, v] of env) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, v), t + s);
  n.connect(bp).connect(g).connect(out);
  n.start(t); n.stop(t + len + 0.05);
}

/**
 * 票の粒が飛ぶ音。up = 盤からバーへ（星を取った）、false = バーから盤へ（取られた）。
 * pitch は音の高さの倍率（党で音色を変えるとき：赤は低め、青は高めなど）、gain は大きさの倍率
 */
export function playFlightSound(kind: FlightSound, f: FlightTimes, up: boolean, pitch = 1, gain = 1): void {
  if (kind === 'sparkle') { playSparkle(f.departFirst, up, pitch, gain); return; }
  const o = audioOut();
  if (!o) return;
  const { a, out } = o, now = a.currentTime, at = (ms: number) => now + ms / 1000;
  if (kind === 'swell') {
    // 吸い込み：up は着き始めに向けてふくらみ、着いたら引く。down は出だしが一番大きく、だんだん消える
    if (up) {
      const len = (f.arriveFirst - f.departFirst) / 1000;
      sweepNoise(a, out, at(f.departFirst), len + 0.12, 700 * pitch, 2600 * pitch, 3,
        [[len * 0.5, 0.012 * gain], [len, 0.07 * gain], [len + 0.12, 0.0001]]);
    } else {
      const len = (f.arriveLast - f.departFirst) / 1000;
      sweepNoise(a, out, at(f.departFirst), len, 2400 * pitch, 600 * pitch, 3,
        [[0.06, 0.06 * gain], [len * 0.6, 0.012 * gain], [len, 0.0001]]);
    }
  } else if (kind === 'whoosh') {
    // ヒュッ：飛び立ちの一瞬の風切り音
    const len = 0.22;
    sweepNoise(a, out, at(f.departFirst), len, (up ? 1100 : 3600) * pitch, (up ? 4200 : 900) * pitch, 2,
      [[0.03, 0.09 * gain], [len, 0.0001]]);
  } else {
    // 粒ごとの「ピッ」：飛び立つ粒の数だけ、上がって（下がって）いく小さな音
    const n = 12;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), fr = (up ? 1500 + 1100 * k : 2600 - 1100 * k) * pitch * (0.97 + Math.random() * 0.06);
      blip(a, at(f.departFirst + (f.departLast - f.departFirst) * k), fr, 0.035, 0.028 * gain, 'triangle');
    }
  }
}
