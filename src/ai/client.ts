// `&inline` で Worker のコードもビルド結果の HTML に埋め込まれる（Blob URL で起動）
import AiWorker from './worker?worker&inline';
import type { Game } from '../core/game';
import type { Move } from '../core/types';
import { requestFor, type AiResponse, type Level } from './protocol';

export class AiClient {
  private worker = new AiWorker();
  private seq = 0;
  private pending = new Map<number, (m: Move | null) => void>();

  constructor() {
    this.worker.onmessage = (ev: MessageEvent<AiResponse>) => {
      this.pending.get(ev.data.id)?.(ev.data.move);
      this.pending.delete(ev.data.id);
    };
  }

  /** 思考を依頼する。cancel() されたら null で解決する。noCap = 回数の上限なしで、時間（THINK_MS）いっぱい読む */
  think(game: Game, stars: readonly boolean[], level: Level, komi = 0, noCap = false): Promise<Move | null> {
    const id = ++this.seq, req = requestFor(game, stars, level, id, komi);
    if (noCap && level === 'hard') req.maxPlayouts = Infinity;
    return new Promise(resolve => {
      this.pending.set(id, resolve);
      this.worker.postMessage(req);
    });
  }

  /** 新規対局などで、進行中の思考結果を捨てる */
  cancel(): void {
    for (const resolve of this.pending.values()) resolve(null);
    this.pending.clear();
  }
}
