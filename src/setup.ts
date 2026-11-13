import { isBoardId } from './core/flag';
import { isController, type SavedGame, type SetupChoice } from './ui/storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * 画面上部の対局設定：盤、赤・青それぞれを打つのは誰か（人 / CPU の強さ）、先手。
 * 値を変えるたびに覚えておき、「NEW GAME」で使う。CPU 対 CPU も選べる（眺めるだけ）
 */
export function setupPanel(o: {
  initial?: Partial<SetupChoice>;
  /** 選択が変わった（保存用） */
  onChange(choice: SetupChoice): void;
}): { start(): Omit<SavedGame, 'moves' | 'komi'>; choice(): SetupChoice } {
  const boardSel = $<HTMLSelectElement>('opt-board'), redSel = $<HTMLSelectElement>('opt-red');
  const blueSel = $<HTMLSelectElement>('opt-blue'), firstSel = $<HTMLSelectElement>('opt-first');

  const choice = (): SetupChoice => ({
    board: isBoardId(boardSel.value) ? boardSel.value : 'small5',
    red: isController(redSel.value) ? redSel.value : 'human',
    blue: isController(blueSel.value) ? blueSel.value : 'normal',
    first: firstSel.value as SetupChoice['first'],
  });

  for (const el of [boardSel, redSel, blueSel, firstSel]) el.addEventListener('change', () => o.onChange(choice()));

  // 初期値：前回の選択（古い形の保存は使わず、HTML の初期値のまま）
  const init = o.initial;
  if (init && isController(init.red) && isController(init.blue)) {
    if (isBoardId(init.board)) boardSel.value = init.board;
    redSel.value = init.red;
    blueSel.value = init.blue;
    if (init.first) firstSel.value = init.first;
  }
  o.onChange(choice());

  return {
    choice,
    /** いまの設定で新しい対局を作る（先手のランダムはここで決める） */
    start() {
      const c = choice();
      const firstRed = c.first === 'red' || (c.first === 'random' && Math.random() < 0.5);
      return { board: c.board, firstRed, red: c.red, blue: c.blue };
    },
  };
}
