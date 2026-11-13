import type { Level } from '../ai/protocol';
import { PARTIES, isBoardId, type BoardId, type Party } from '../core/flag';
import { BLACK, WHITE, type Color, type Move } from '../core/types';

/** 赤・青それぞれを打つのは誰か：人か、CPU（強さ） */
export type Controller = 'human' | Level;
export const isController = (v: unknown): v is Controller =>
  v === 'human' || v === 'easy' || v === 'normal' || v === 'hard';

export interface SavedGame {
  board: BoardId;
  /** 先手が赤か。ルールの中では先手 = BLACK、後手 = WHITE */
  firstRed: boolean;
  red: Controller;
  blue: Controller;
  /** コミ（後手に足す票、整数）。対局を始めたときの設定の値。古い保存にはなく 0 */
  komi: number;
  moves: Move[];
  /** 投了した色（投了で終わった対局だけ） */
  resigned?: Color;
  /** 待った（UNDO）を使った党。その党が勝つと WIN? になる（不正選挙の疑惑） */
  undone?: Party[];
}

/** 設定欄で最後に選んだもの（次に開いたときの初期値） */
export interface SetupChoice {
  board: BoardId;
  red: Controller;
  blue: Controller;
  first: 'red' | 'blue' | 'random';
}

/** 古い形の保存（相手の種類 mode と CPU の手番 cpu で持っていたころ） */
interface LegacyGame {
  mode?: 'cpu' | '2p';
  level?: Level;
  cpu?: Color;
}

/** 対局をまたいで残す設定 */
import type { Lang } from './i18n';

export interface Settings {
  /** 音量 0..1 */
  volume: number;
  /** 遊び方を一度見た（最初に開いたときだけ出す） */
  tutorialSeen: boolean;
  setup?: SetupChoice;
  /** コミ（後手に足す票、整数。盤共通）。次の対局から効く */
  komi: number;
  /** 音を消している（音量はそのまま覚えておく） */
  muted?: boolean;
  /** 画面の言語。未設定ならブラウザの言語で決める */
  lang?: Lang;
}

export const DEFAULT_SETTINGS: Settings = { volume: 0.8, tutorialSeen: false, komi: 0 };

const KEY = 'seijo-go:game', SETTINGS_KEY = 'seijo-go:settings';

// スマホはタブが裏で破棄されやすいので、毎手保存して開き直しても続きから再開する。
// プライベートモード等で使えない場合は黙って諦める
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
function read<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export const saveGame = (s: SavedGame) => write(KEY, s);

export function loadGame(): SavedGame | null {
  const s = read<SavedGame & LegacyGame>(KEY);
  if (!s || !isBoardId(s.board) || !Array.isArray(s.moves)) return null;
  const firstRed = s.firstRed ?? true, komi = typeof s.komi === 'number' && s.komi >= 0 ? s.komi : 0;
  const resigned = s.resigned === BLACK || s.resigned === WHITE ? { resigned: s.resigned } : {};
  const undone = Array.isArray(s.undone) ? { undone: PARTIES.filter(p => s.undone!.includes(p)) } : {};
  if (isController(s.red) && isController(s.blue)) return { board: s.board, firstRed, red: s.red, blue: s.blue, komi, moves: s.moves, ...resigned, ...undone };
  // 古い形：CPU 戦なら CPU の手番の色を党に直す（先手 = BLACK）。2人なら両方とも人
  const cpuRed = s.mode === 'cpu' && (s.cpu === BLACK) === firstRed;
  const level = s.level ?? 'normal';
  const red: Controller = s.mode === 'cpu' && cpuRed ? level : 'human';
  const blue: Controller = s.mode === 'cpu' && !cpuRed ? level : 'human';
  return { board: s.board, firstRed, red, blue, komi, moves: s.moves };
}

export const saveSettings = (s: Settings) => write(SETTINGS_KEY, s);
export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(SETTINGS_KEY) });

/** 対局・設定をすべて消す */
export function clearSaved(): void {
  try { for (const k of [KEY, SETTINGS_KEY]) localStorage.removeItem(k); } catch { /* ignore */ }
}
