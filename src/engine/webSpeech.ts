import type { SpeechEngine, SpeechHandlers } from './types';

// The Web Speech API is vendor-prefixed and missing from lib.dom.d.ts, so declare the bits we use.
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
}
interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function webSpeechSupported(): boolean {
  return !!getCtor();
}

/** Errors that mean "this engine will not work", as opposed to harmless silence/abort. */
const FATAL_ERRORS = new Set(['network', 'service-not-allowed', 'not-allowed', 'language-not-supported', 'audio-capture']);
const MAX_QUICK_RESTARTS = 8;

export class WebSpeechEngine implements SpeechEngine {
  readonly kind = 'web' as const;
  private rec: Recognition | null = null;
  private handlers: SpeechHandlers | null = null;
  private active = false;
  private base = ''; // text from earlier recognition sessions (Chrome ends sessions on its own)
  private session = ''; // text from the current session
  private offset = 0; // results to ignore (heard before clear())
  private seen = 0;
  private quickRestarts = 0;
  private lastStart = 0;

  constructor(private lang: string) {}

  start(handlers: SpeechHandlers): void {
    this.handlers = handlers;
    this.active = true;
    this.base = '';
    this.session = '';
    this.offset = 0;
    this.seen = 0;
    this.quickRestarts = 0;
    this.spawn();
  }

  clear(): void {
    this.base = '';
    this.session = '';
    this.offset = this.seen;
    this.handlers?.onText('');
  }

  stop(): Promise<string> {
    this.active = false;
    const rec = this.rec;
    // Give the recognizer a moment to deliver its last final result before we read the text.
    return new Promise((resolve) => {
      if (!rec) return resolve(this.text());
      rec.onresult = (e) => this.readResults(e);
      rec.onend = () => undefined;
      rec.onerror = null;
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      setTimeout(() => {
        try {
          rec.abort();
        } catch {
          /* already stopped */
        }
        this.rec = null;
        resolve(this.text());
      }, 450);
    });
  }

  private text(): string {
    return `${this.base} ${this.session}`.trim();
  }

  private readResults(e: RecognitionEvent): void {
    this.seen = e.results.length;
    let out = '';
    for (let i = this.offset; i < e.results.length; i++) out += `${e.results[i][0].transcript} `;
    this.session = out.trim();
    this.handlers?.onText(this.text());
  }

  private spawn(): void {
    const Ctor = getCtor();
    if (!Ctor) {
      this.handlers?.onFatal('unsupported');
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = this.lang;
    rec.onresult = (e) => this.readResults(e);
    rec.onerror = (e) => {
      if (FATAL_ERRORS.has(e.error)) {
        this.active = false;
        this.handlers?.onFatal(e.error);
      }
    };
    rec.onend = () => {
      if (!this.active) return;
      // Chrome ends continuous sessions after silence or a while; keep the text and restart.
      this.base = this.text();
      this.session = '';
      this.offset = 0;
      this.seen = 0;
      this.quickRestarts = Date.now() - this.lastStart < 1500 ? this.quickRestarts + 1 : 0;
      if (this.quickRestarts > MAX_QUICK_RESTARTS) {
        this.active = false;
        this.handlers?.onFatal('restart-loop');
        return;
      }
      setTimeout(() => this.active && this.spawn(), 120);
    };
    this.rec = rec;
    this.lastStart = Date.now();
    try {
      rec.start();
    } catch {
      this.active = false;
      this.handlers?.onFatal('start-failed');
    }
  }
}
