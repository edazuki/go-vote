/// <reference lib="webworker" />
import { PASS } from '../core/types';
import { searchMove } from './mcts';
import { chooseEasyMove, chooseNormalMove } from './policy';
import { winsByPassing, type AiRequest, type AiResponse } from './protocol';

self.onmessage = (ev: MessageEvent<AiRequest>) => {
  const req = ev.data;
  const move = winsByPassing(req) ? PASS
    : req.level === 'easy' ? chooseEasyMove(req)
    : req.level === 'normal' ? chooseNormalMove(req)
    : searchMove(req, { timeMs: req.thinkMs, maxPlayouts: req.maxPlayouts });
  const res: AiResponse = { id: req.id, move };
  self.postMessage(res);
};
