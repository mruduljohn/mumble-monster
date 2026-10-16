import type { SpeechEngine } from './types';

/** No recognition at all: the game scores clarity from the volume envelope instead. */
export class VolumeOnlyEngine implements SpeechEngine {
  readonly kind = 'volume' as const;
  start(): void {}
  clear(): void {}
  stop(): Promise<string> {
    return Promise.resolve('');
  }
}
