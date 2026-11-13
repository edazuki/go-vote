/**
 * 画面の言葉（日本語・英語）。HTML の決まった文言は data-i18n（文字）・data-i18n-html（タグ入り）・
 * data-i18n-aria（読み上げ名）で鍵を指し、applyI18n で入れ替える。JS で作る文言は t(鍵) で引く。
 * 初めて開いたときはブラウザの言語で決め（日本語以外は英語）、設定で変えたら覚えておく
 */
export type Lang = 'ja' | 'en';
export const LANGS: Lang[] = ['ja', 'en'];
export const isLang = (v: unknown): v is Lang => v === 'ja' || v === 'en';

const ja = {
  'settings': '設定',
  'setup': '対局設定',
  'setup.toggle': '設定',
  'board': '碁盤',
  'votebar': '得票率',
  'votebar.aria': '得票率 赤 {r}% 青 {b}%',
  'review': '振り返り',
  'review.chart': '得票率と形勢の推移（押した手に戻る）',
  'review.first': '最初へ',
  'review.prev': '1手戻る',
  'review.next': '1手進む',
  'review.last': '最後へ',
  'volume': '音量',
  'komi': 'KOMI（後手に足す票。次の対局から）',
  'lang': 'LANGUAGE / 言語',
  'rules': 'ルール',
  'rules.list':
    '<li>囲碁（純碁）をもとにしたゲームです。ここに書いていない細かいところは、囲碁（純碁）のルールを調べてみてください</li>' +
    '<li>赤と青で交互に打ちます。赤・青それぞれを人か CPU が打ち、先手は色と別に決めます（CPU 同士を眺めることもできます）</li>' +
    '<li>星の交点に置いた石が、その色の票になります</li>' +
    '<li>相手の石を囲むと取れます。取られた石の星は空きに戻ります</li>' +
    '<li>自分から取られる形（自殺手）には打てません。石を1個取られた直後に、すぐ1個取り返して元の形に戻すことはできません。一度ほかに打てば取り返せます</li>' +
    '<li>二人続けてパスで終局。<b>そのとき盤に残っている星の上の石</b>が得票です</li>' +
    '<li>得票が多いほうの勝ち。後手の票には設定の KOMI（コミ。初期値 0）を足し、それでも同数なら後手の勝ちです（得票率でも、同数なら後手が 0.1% 上に表示されます）</li>',
  'tutorial': '遊び方',
  'tutorial.open': '遊び方を見る',
  'close': '閉じる',
  'reset': '保存データを消す',
  'reset.confirm': '対局・設定を消す？',
  'new.confirm': 'いまの対局をやめて始める？',
  'about': 'Go Vote v{version} BETA・データはこの端末のブラウザ内にだけ保存されます。架空の選挙をモチーフにした遊びで、実在の政党・候補者とは関係ありません',
  'cpu': 'CPU（{level}）',
  'repeat': '（同形3回）',
  'sep': '・',
  'sound.on': '音を消す',
  'sound.off': '音を出す',
  'share.copied': 'コピーしました',
  'share.title': 'Go Vote の結果',
  'resign.confirm': 'GIVE UP?',
  'resign.tag': '（GIVE UP）',
  'undo.text': 'UNDO を使うと、勝っても「WIN?」になります。ちょっぴり疑惑の当選です。',
  'tut.0': '赤と青の対戦です。盤の線の交点に、交互に石を置きます。白い星のある交点に置くと、その星が置いた色の票になります。星のない交点に置いても票にはなりません。',
  'tut.1': '相手の石を逃げ場なく囲むと取れます。取られた石の星は空きに戻り、票がなくなります。',
  'tut.2': 'つながった石は、いくつあっても、すき間なく囲めばまとめて取れます。内側の空き点もすき間に数えます。ここでは青が最後のすき間に打って、赤の石14個をまとめて取りました。',
  'tut.3': '二人続けてパスすると終局です。票が多い方の勝ちです。終局時に星が残っていることもあります。',
  'tut.4': '先手が有利なので、後手の票には 0.1% の KOMI が足されます。同数なら後手の勝ちです。KOMI の量は設定で増やすことができます。',
};
type Key = keyof typeof ja;

const en: Record<Key, string> = {
  'settings': 'Settings',
  'setup': 'Game setup',
  'setup.toggle': 'SETUP',
  'board': 'Board',
  'votebar': 'Vote share',
  'votebar.aria': 'Vote share: Red {r}%, Blue {b}%',
  'review': 'Review',
  'review.chart': 'Vote share and outlook over the game (tap to jump to a move)',
  'review.first': 'First move',
  'review.prev': 'Back one move',
  'review.next': 'Forward one move',
  'review.last': 'Last move',
  'volume': 'VOLUME',
  'komi': 'KOMI (votes added to the second player; from the next game)',
  'lang': 'LANGUAGE / 言語',
  'rules': 'Rules',
  'rules.list':
    '<li>This game is based on Go. For details not covered here, look up the rules of Go</li>' +
    '<li>Red and Blue take turns. Each color can be a player or the CPU, and who goes first is chosen separately from color (you can also watch CPU vs CPU)</li>' +
    '<li>A stone on a star point is a vote for its color</li>' +
    '<li>Surround your opponent’s stones to capture them. A captured star becomes empty again</li>' +
    '<li>You can’t play where your own stones would be captured. Right after one of your stones is captured, you can’t take one back immediately to restore the previous position; play elsewhere first</li>' +
    '<li>The game ends when both players pass in a row. <b>The stones left on star points at that moment</b> are the votes</li>' +
    '<li>Most votes wins. KOMI from Settings (default 0) is added to the second player’s votes, and a tie still goes to the second player (on a tie, the vote share also shows the second player 0.1% ahead)</li>',
  'tutorial': 'How to play',
  'tutorial.open': 'How to play',
  'close': 'CLOSE',
  'reset': 'Delete saved data',
  'reset.confirm': 'Delete game and settings?',
  'new.confirm': 'Quit this game and start?',
  'about': 'Go Vote v{version} BETA · Data is saved only in this browser on this device. A game themed on a fictional election; not affiliated with any real party or candidate',
  'cpu': 'CPU ({level})',
  'repeat': ' (REPEAT ×3)',
  'sep': ' · ',
  'sound.on': 'Mute',
  'sound.off': 'Unmute',
  'share.copied': 'COPIED',
  'share.title': 'Go Vote result',
  'resign.confirm': 'GIVE UP?',
  'resign.tag': ' (GAVE UP)',
  'undo.text': 'Use UNDO and your win will show as "WIN?" — a slightly questionable victory.',
  'tut.0': 'Red vs. Blue. Take turns placing stones on the intersections of the lines. A stone on an intersection with a white star makes that star a vote for its color. Stones on other intersections are not votes.',
  'tut.1': 'Surround an opponent’s stone so it has no way out to capture it. The star under a captured stone becomes empty, and the vote is lost.',
  'tut.2': 'Connected stones, however many, are captured together once they are surrounded with no gaps. Empty points inside count as gaps too. Here Blue fills the last gap and captures 14 Red stones at once.',
  'tut.3': 'The game ends when both players pass in a row. Most votes wins. Some stars may be left empty at the end.',
  'tut.4': 'Going first is an advantage, so 0.1% KOMI is added to the second player’s votes. A tie goes to the second player. You can increase KOMI in Settings.',
};

const DICT: Record<Lang, Record<Key, string>> = { ja, en };

/** ブラウザの言語から（日本語以外は英語） */
export const detectLang = (): Lang => ((navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase().startsWith('ja') ? 'ja' : 'en');

let lang: Lang = 'ja';
export const getLang = () => lang;

/** 鍵 key の文言。{name} を vars で埋める */
export function t(key: Key, vars: Record<string, string | number> = {}): string {
  return DICT[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

/** 言語を変え、HTML の決まった文言を入れ替える */
export function setLang(l: Lang, vars: Record<string, string | number> = {}): void {
  lang = l;
  document.documentElement.lang = l;
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n as Key, vars);
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml as Key, vars);
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria as Key, vars));
}
