import type { Model, KaldiRecognizer } from 'vosk-browser';
import type { MicInput } from '../audio/mic';
import type { SpeechEngine, SpeechHandlers } from './types';

export const VOSK_MODEL_URL = `${import.meta.env.BASE_URL}models/vosk-model-small-en-us-0.15.tar.gz`;
const LOAD_TIMEOUT_MS = 60_000;

let modelPromise: Promise<Model> | null = null;

/** Lazily load (once) the offline model. Rejects if the file is missing or loading hangs. */
export function loadVoskModel(): Promise<Model> {
  if (!modelPromise) {
    // Dynamic import keeps the large Vosk bundle out of the initial page load.
    const load = import('vosk-browser').then((v) => v.createModel(VOSK_MODEL_URL)).then((m) => {
      m.setLogLevel(-1); // silence Vosk's C++ console logs
      return m;
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Vosk model load timed out')), LOAD_TIMEOUT_MS),
    );
    modelPromise = Promise.race([load, timeout]).catch((e) => {
      modelPromise = null;
      throw e;
    });
  }
  return modelPromise;
}

export class VoskEngine implements SpeechEngine {
  readonly kind = 'vosk' as const;
  private recognizer: KaldiRecognizer | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private finals = '';
  private partial = '';
  private handlers: SpeechHandlers | null = null;

  constructor(private model: Model, private mic: MicInput) {}

  start(handlers: SpeechHandlers): void {
    const ctx = this.mic.ctx;
    const source = this.mic.source;
    if (!ctx || !source) {
      handlers.onFatal('no-mic');
      return;
    }
    this.handlers = handlers;
    this.finals = '';
    this.partial = '';
    const rec = new this.model.KaldiRecognizer(ctx.sampleRate);
    this.recognizer = rec;
    rec.on('result', (m) => {
      if (this.recognizer !== rec || m.event !== 'result') return;
      const text = m.result.text;
      if (text) this.finals = `${this.finals} ${text}`.trim();
      this.partial = '';
      this.emit();
    });
    rec.on('partialresult', (m) => {
      if (this.recognizer !== rec || m.event !== 'partialresult') return;
      this.partial = m.result.partial;
      this.emit();
    });
    rec.on('error', () => {
      if (this.recognizer === rec) handlers.onFatal('vosk-error');
    });

    // ScriptProcessor is deprecated but universally available in Chrome and needs no extra worker file.
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      try {
        rec.acceptWaveformFloat(new Float32Array(e.inputBuffer.getChannelData(0)), ctx.sampleRate);
      } catch {
        /* recognizer was removed between frames */
      }
    };
    const sink = ctx.createGain();
    sink.gain.value = 0; // keep the processor pulling audio without playing it back
    source.connect(processor);
    processor.connect(sink).connect(ctx.destination);
    this.processor = processor;
    this.sink = sink;
  }

  clear(): void {
    this.finals = '';
    this.partial = '';
    this.handlers?.onText('');
  }

  async stop(): Promise<string> {
    const rec = this.recognizer;
    if (this.processor) {
      this.mic.source?.disconnect(this.processor);
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
    }
    this.sink?.disconnect();
    this.processor = null;
    this.sink = null;
    if (rec) {
      // Flush the decoder so the last words become a final result.
      await new Promise<void>((resolve) => {
        const done = setTimeout(resolve, 700);
        rec.on('result', () => {
          clearTimeout(done);
          setTimeout(resolve, 20);
        });
        try {
          rec.retrieveFinalResult();
        } catch {
          clearTimeout(done);
          resolve();
        }
      });
    }
    const text = `${this.finals} ${this.partial}`.trim();
    this.recognizer = null;
    try {
      rec?.remove();
    } catch {
      /* already removed */
    }
    return text;
  }

  private emit(): void {
    this.handlers?.onText(`${this.finals} ${this.partial}`.trim());
  }
}
