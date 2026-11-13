/*
 * 盤と石の質感。画像ファイルは使わず、ノイズからその場で作って使い回す。
 * 盤：星条旗の左上（カントン）の紺地。旗の布らしく、細かな織り目とゆるいしわを入れる
 * 石：赤と青のつやのある石。紺地の上で青が沈まないよう、青は明るめにして白っぽい縁を付ける
 */

const TEX = 768;

/** 再現できる乱数（0..1） */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 値ノイズ（周期 64、0..1） */
function makeNoise(seed: number): (x: number, y: number) => number {
  const r = rng(seed), N = 64, grid = new Float32Array(N * N);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const x0 = ((xi % N) + N) % N, y0 = ((yi % N) + N) % N, x1 = (x0 + 1) % N, y1 = (y0 + 1) % N;
    const a = grid[y0 * N + x0], b = grid[y0 * N + x1], c = grid[y1 * N + x0], d = grid[y1 * N + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

function fbm(nz: (x: number, y: number) => number, x: number, y: number, oct = 4): number {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * nz(x * f, y * f); a *= 0.5; f *= 2; }
  return s / (1 - 0.5 ** oct);
}

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return [cv, cv.getContext('2d')!];
}

let board: HTMLCanvasElement | null = null;

/** 盤の地（紺の布）。初回だけ作る。盤の縦横比に合わせて引き伸ばして使う */
export function boardTexture(): HTMLCanvasElement {
  if (board) return board;
  const [cv, g] = canvas(TEX);
  const img = g.createImageData(TEX, TEX), d = img.data;
  const fold = makeNoise(21), fine = makeNoise(22);
  // 旗の紺に近い色を基準に、明るさだけ揺らす
  const base = [30, 44, 96];
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
    const u = x / TEX, v = y / TEX;
    // ゆるいしわ（斜めに流れる明暗）
    const f = fbm(fold, u * 2.2 + v * 0.8, v * 1.6, 3) - 0.5;
    // 織り目：縦糸と横糸の細かな市松と、糸のむら
    const weave = ((x & 2) ^ (y & 2) ? 1 : -1) * 0.025 + (fine(u * 300, v * 300) - 0.5) * 0.05;
    const k = 1 + f * 0.28 + weave;
    const i = (y * TEX + x) * 4;
    d[i] = base[0] * k;
    d[i + 1] = base[1] * k;
    d[i + 2] = base[2] * k;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // 縁へ向けてわずかに沈める
  const vg = g.createRadialGradient(TEX / 2, TEX / 2, TEX * 0.35, TEX / 2, TEX / 2, TEX * 0.78);
  vg.addColorStop(0, 'rgba(5,10,30,0)'); vg.addColorStop(1, 'rgba(5,10,30,.28)');
  g.fillStyle = vg; g.fillRect(0, 0, TEX, TEX);
  board = cv;
  return cv;
}

export const STONE_VARIANTS = 6;
/** 石の上の星の印の半径（石の半径に対する比）。最初の 0.56 より少し大きく、石の色が周りにしっかり見える大きさ */
const STAR_ON_STONE = 0.65;
const stones = new Map<string, HTMLCanvasElement>();

/** 石の色。赤 = 先手（内部では BLACK）、青 = 後手（WHITE） */
const PALETTE = {
  red: { stops: [[0, '#ff8f80'], [0.45, '#d42a2a'], [1, '#7d0f16']] as [number, string][], rim: 'rgba(255,225,220,.7)' },
  blue: { stops: [[0, '#a6caff'], [0.45, '#3274e6'], [1, '#143f94']] as [number, string][], rim: 'rgba(230,240,255,.85)' },
};

/**
 * 石を1つ描いた画像（影込み）。r は石の半径（デバイスピクセル）。
 * 画像は 2.6r 四方で、中心に石がある。star = 星の上の石（白い星の印を浮かせる。これが得票）
 */
export function stoneSprite(red: boolean, variant: number, r: number, star: boolean): HTMLCanvasElement {
  const R = Math.max(2, Math.round(r)), key = `${red ? 1 : 0}:${variant}:${R}:${star ? 1 : 0}`;
  const hit = stones.get(key);
  if (hit) return hit;
  const size = Math.ceil(R * 2.6), [cv, g] = canvas(size), cx = size / 2, cy = size / 2;
  const rr = rng(variant * 977 + (red ? 1 : 2));
  const pal = red ? PALETTE.red : PALETTE.blue;
  const circle = () => g.arc(cx, cy, R, 0, Math.PI * 2);

  // 盤に落ちる影
  const sh = g.createRadialGradient(cx + R * 0.1, cy + R * 0.16, R * 0.7, cx + R * 0.1, cy + R * 0.16, R * 1.15);
  sh.addColorStop(0, 'rgba(0,4,20,.55)'); sh.addColorStop(1, 'rgba(0,4,20,0)');
  g.fillStyle = sh; g.beginPath(); g.arc(cx + R * 0.1, cy + R * 0.16, R * 1.15, 0, Math.PI * 2); g.fill();

  // 本体。照りの位置を石ごとに少しずらして、並んだときの単調さを消す
  const jx = (rr() - 0.5) * R * 0.1, jy = (rr() - 0.5) * R * 0.1;
  const body = g.createRadialGradient(cx - R * 0.35 + jx, cy - R * 0.4 + jy, R * 0.05, cx, cy, R * 1.02);
  pal.stops.forEach(([o, col]) => body.addColorStop(o, col));
  g.fillStyle = body; g.beginPath(); circle(); g.fill();

  // 星の印（得票）：白い五芒星を浅く浮かせる
  if (star) {
    g.save();
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = R * 0.08; g.shadowOffsetY = R * 0.04;
    g.fillStyle = 'rgba(255,255,255,.95)';
    starPath(g, cx, cy + R * 0.03, R * STAR_ON_STONE);
    g.fill();
    g.restore();
  }

  // 照り
  g.save(); g.translate(cx - R * 0.34 + jx, cy - R * 0.4 + jy); g.rotate(-0.6);
  const sp = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.42);
  sp.addColorStop(0, 'rgba(255,255,255,.5)');
  sp.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sp; g.scale(1, 0.62); g.beginPath(); g.arc(0, 0, R * 0.42, 0, Math.PI * 2); g.fill();
  g.restore();

  // 縁：紺地の上で石の輪郭が溶けないよう、明るい細い縁
  g.lineWidth = Math.max(1, R / 14);
  g.strokeStyle = pal.rim;
  g.beginPath(); g.arc(cx, cy, R - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();

  stones.set(key, cv);
  return cv;
}

/** 中心 (x, y)、外接円の半径 r の五芒星（上向き）のパスを作る。ratio = 内側の頂点の半径の割合（大きいほど太い星） */
export function starPath(g: CanvasRenderingContext2D, x: number, y: number, r: number, ratio = 0.382): void {
  const inner = r * ratio;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? inner : r;
    const px = x + Math.cos(a) * k, py = y + Math.sin(a) * k;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
}
