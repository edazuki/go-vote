/**
 * 振り返りの下の SHARE（端末の共有メニュー。出せなければ文をコピー）と IMAGE（画像の保存）
 */
import type { Game } from '../core/game';
import type { View } from '../render/renderer';
import { t } from './i18n';
import { renderBoard, shareImage, shareText, type ShareResult } from './share';

export function bindShareButtons(o: {
  /** いまの盤（終局した対局） */
  view: () => View;
  /** 終局した対局の結果 */
  result: () => ShareResult;
}): { prepare(): void } {
  /** 結果の画像（終局した局面で作る。共有ボタンを押してから作ると共有シートが開けない端末があるので、先に作っておく） */
  let cached: { game: Game; lang: string; blob: Promise<Blob | null> } | null = null;
  function prepare(): void {
    const v = o.view(), lang = document.documentElement.lang;
    if (cached?.game === v.game && cached.lang === lang) return;
    cached = { game: v.game, lang, blob: shareImage(renderBoard(v), o.result()) };
  }
  const file = async () => {
    const b = await cached?.blob;
    return b ? new File([b], 'go-vote-result.png', { type: 'image/png' }) : null;
  };

  const shareBtn = document.getElementById('btn-share') as HTMLButtonElement;
  shareBtn.addEventListener('click', async () => {
    const text = shareText(o.result());
    const f = await file();
    const data: ShareData = { title: t('share.title'), text };
    if (f && navigator.canShare?.({ files: [f] })) data.files = [f];
    if (navigator.share) {
      try { await navigator.share(data); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
    }
    // 共有できない端末（PC など）：文をコピー
    try {
      await navigator.clipboard.writeText(text);
      shareBtn.textContent = t('share.copied');
      window.setTimeout(() => { shareBtn.textContent = 'SHARE'; }, 1500);
    } catch { /* コピーもできない */ }
  });

  // 画像を保存する
  document.getElementById('btn-image')!.addEventListener('click', async () => {
    const f = await file();
    if (!f) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  return { prepare };
}
