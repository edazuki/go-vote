import type { Renderer } from '../render/renderer';

export interface InputHandlers {
  /** 着手を確定する */
  commit(p: number): void;
  /** ホバー（マウス）や仮置き（タッチ）が変わった */
  preview(hover: number | null, tentative: number | null): void;
}

/**
 * Pointer Events でマウスとタッチをまとめて扱う。
 * - マウス：ホバーで置く位置を表示、クリックで確定
 * - タッチ / ペン：1回目のタップで仮置き、同じ点をもう一度タップで確定（指で隠れても誤爆しない）
 */
export function bindBoardInput(canvas: HTMLCanvasElement, renderer: Renderer, h: InputHandlers): { clear(): void } {
  let hover: number | null = null, tentative: number | null = null;
  const emit = () => h.preview(hover, tentative);

  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const p = renderer.pointAt(e.clientX, e.clientY);
    if (p !== hover) { hover = p; emit(); }
  });
  canvas.addEventListener('pointerleave', () => {
    if (hover !== null) { hover = null; emit(); }
  });
  canvas.addEventListener('pointerup', e => {
    const p = renderer.pointAt(e.clientX, e.clientY);
    if (e.pointerType === 'mouse') {
      if (p !== null) h.commit(p);
      return;
    }
    if (p !== null && p === tentative) { tentative = null; emit(); h.commit(p); }
    else { tentative = p; emit(); }
  });
  // 長押しメニューを出さない
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  return { clear() { hover = tentative = null; emit(); } };
}
