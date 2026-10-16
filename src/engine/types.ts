export type EngineKind = 'web' | 'vosk' | 'volume';

export interface SpeechHandlers {
  /** Called with the full transcript of the current wave (finals + interim) whenever it changes. */
  onText(text: string): void;
  /** The engine cannot continue (network down, service blocked, model failed...). */
  onFatal(reason: string): void;
}

/** One recognizer. Lifecycle per wave: start -> clear (at GO) -> stop (returns final transcript). */
export interface SpeechEngine {
  readonly kind: EngineKind;
  start(handlers: SpeechHandlers): void;
  /** Forget everything heard so far (used when the "SPEAK!" cue fires). */
  clear(): void;
  stop(): Promise<string>;
}
