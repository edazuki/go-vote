/*
 * 検証で打った対局の棋譜を、どの CPU で打ったかと一緒に records/ に残す（records/ はリポジトリに入れない：.git/info/exclude）。
 * scripts/replay.ts で、残した棋譜の途中の局面から CPU に考えさせ直せる
 *
 *   records/<日時>-<名前>.jsonl   1回の実行で1ファイル。1行目が実行の情報（打ち手ごとの CPU と設定）、2行目からが1局ずつ
 *   records/code/<hash>/          打ち手の CPU のコード（src/core・src/ai のテスト以外）の写し。同じコードなら1つ
 *
 * CPU は探索のたびに渡された局面だけから読む（前の手の読みを持ち越さない）。乱数の種とプレイアウト回数が同じなら同じ手を選ぶ
 * （思考時間で止めると PC の速さで回数が変わるので、回数で止める）
 * node の組み込みしか使わないので、src の写し（scratchpad など）を使う比較用のスクリプトからも import できる
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 棋譜の置き場所。src の写しから動かすときは、環境変数 GO_VOTE_RECORDS でこのリポジトリの records/ を指す */
export const RECORDS = process.env.GO_VOTE_RECORDS ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', 'records');

/** 打ち手の CPU。dir は src/ を含むフォルダ（このリポジトリか、その写し） */
export interface CpuSpec {
  dir: string;
  /** pass = 毎回パスするだけ（検証用の相手） */
  level: 'easy' | 'normal' | 'hard' | 'pass';
  /** プレイアウト回数の上限 */
  playouts?: number;
  /** 思考時間の上限（ms）。回数で止めるときは書かない */
  timeMs?: number;
  /** 素の MCTS（終局まわりの手当て・パスで勝てるときのパスなし。scripts/bench.ts の plain） */
  plain?: boolean;
  /** どういう版か（例：「aec580d に票差の決め手を足したもの」） */
  note?: string;
}

/** 1局の記録。moves は着手の点（y * w + x、パスは -1） */
export interface GameRecord {
  board: string;
  w: number;
  h: number;
  /** CPU に渡したコミ（AiRequest.komi。半目を含む） */
  komi: number;
  /** 先手・後手の打ち手（実行の情報の cpus の名前） */
  black: string;
  white: string;
  /** 乱数の種（打ち手ごと。種を使わない打ち手は書かない）。各手は moveSeed(種, 手数) で作った乱数で考える */
  seeds?: { black?: number; white?: number };
  /** 途中の局面から始めたときの、始めの手順（moves はその続き） */
  setup?: number[];
  moves: number[];
  /** 各手を打った側の見込みの勝率（MCTS のいちばん読んだ手。読まずに打った手は null） */
  rates?: (number | null)[];
  /** 先手の票 - 後手の票 */
  votes: string;
  winner: 'black' | 'white';
  [k: string]: unknown;
}

const git = (dir: string, ...args: string[]) => {
  try { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
};

/** CPU のコードを records/code に写して、その hash と git の版（changed = src/core・src/ai に未コミットの変更がある）を返す */
export function snapshot(dir: string) {
  const files: string[] = [];
  for (const sub of ['core', 'ai']) {
    for (const f of readdirSync(join(dir, 'src', sub)).sort()) if (f.endsWith('.ts') && !f.endsWith('.test.ts')) files.push(`${sub}/${f}`);
  }
  // 写しは import に .ts を付けて node で動かすことがあるので、外した形でそろえる（同じコードなら同じ hash）
  const text = (f: string) => readFileSync(join(dir, 'src', f), 'utf8').replace(/(from '\.{1,2}\/[^']*)\.ts'/g, "$1'");
  const h = createHash('sha256');
  for (const f of files) h.update(f).update('\0').update(text(f)).update('\0');
  const hash = h.digest('hex').slice(0, 10), to = join(RECORDS, 'code', hash);
  if (!existsSync(to)) {
    for (const f of files) { mkdirSync(dirname(join(to, f)), { recursive: true }); writeFileSync(join(to, f), text(f)); }
  }
  const commit = git(dir, 'rev-parse', '--short', 'HEAD');
  const changed = commit === null ? null : git(dir, 'status', '--porcelain', '--', 'src/core', 'src/ai') !== '';
  return { code: hash, commit, changed };
}

/** 実行を1つ始める。返す game() で1局ずつ書き足す */
export function openRecord(name: string, cpus: Record<string, CpuSpec>, settings: Record<string, unknown> = {}) {
  mkdirSync(RECORDS, { recursive: true });
  const d = new Date(), pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const path = join(RECORDS, `${stamp}-${name}.jsonl`);
  const info = Object.fromEntries(Object.entries(cpus).map(([k, c]) => [k, { ...c, dir: resolve(c.dir), ...snapshot(c.dir) }]));
  writeFileSync(path, JSON.stringify({ run: name, started: d.toISOString(), argv: process.argv.slice(1), cpus: info, ...settings }) + '\n');
  return { path, game: (g: GameRecord) => appendFileSync(path, JSON.stringify(g) + '\n') };
}

/** 記録を読む */
export function readRecord(path: string): { info: { cpus: Record<string, CpuSpec & { code: string; commit: string | null; changed: boolean | null }>; [k: string]: unknown }; games: GameRecord[] } {
  const [head, ...rest] = readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  return { info: head, games: rest };
}

/** 再現できる乱数（mulberry32。src/ai/ai.test.ts と同じ） */
export function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 種を1つ作る */
export const newSeed = () => (Math.random() * 2 ** 31) | 0;

/**
 * 局の種から、k 手目（0 から。setup は数えない）を考えるときの種を作る。手ごとに乱数を作り直すので、
 * 途中の局面からでも記録と同じ手を再現できる（プレイアウト回数で止めたとき）
 */
export const moveSeed = (seed: number, k: number) => (seed ^ Math.imul(k + 1, 0x9e3779b1)) | 0;

/** このリポジトリのフォルダ */
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
