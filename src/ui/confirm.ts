/**
 * 2回押しで確定するボタン（NEW GAME・GIVE UP・保存データを消す）。
 * 1回目は確認の文言に変えて ms のあいだ待ち、そのあいだにもう一度押すと onConfirm。時間が過ぎたら元に戻る
 */
export interface ConfirmButton {
  /** 確認待ちをやめて元の文言に戻す */
  disarm(): void;
}

export function confirmButton(btn: HTMLButtonElement, o: {
  /** ふだんの文言と、確認待ちの文言（言語で変わるので関数） */
  label: () => string;
  confirmLabel: () => string;
  /** 押しても何もしないとき（false を返す） */
  enabled?: () => boolean;
  /** 確認なしで1回で確定してよいとき（false を返す）。省略すると毎回確認する */
  needConfirm?: () => boolean;
  onConfirm: () => void;
  ms?: number;
}): ConfirmButton {
  let timer = 0;
  const disarm = () => {
    clearTimeout(timer);
    btn.classList.remove('confirm');
    btn.textContent = o.label();
  };
  btn.addEventListener('click', () => {
    if (o.enabled && !o.enabled()) return;
    if ((o.needConfirm?.() ?? true) && !btn.classList.contains('confirm')) {
      btn.classList.add('confirm');
      btn.textContent = o.confirmLabel();
      timer = window.setTimeout(disarm, o.ms ?? 3000);
      return;
    }
    disarm();
    o.onConfirm();
  });
  return { disarm };
}
