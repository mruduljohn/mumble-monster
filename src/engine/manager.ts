import type { MicInput } from '../audio/mic';
import { isMobileDevice } from '../device';
import type { Settings } from '../game/settings';
import type { EngineKind, SpeechEngine, SpeechHandlers } from './types';
import { VolumeOnlyEngine } from './volumeOnly';
import { WebSpeechEngine, webSpeechSupported } from './webSpeech';
import { loadVoskModel, VoskEngine } from './vosk';

export interface EngineStatus {
  kind: EngineKind;
  loading: boolean;
  note: string; // human-readable reason when degraded, empty otherwise
}

export interface WaveTranscript {
  /** null when no recognizer produced text (volume-only mode): the game falls back to volume scoring. */
  text: string | null;
  engine: EngineKind;
}

/**
 * Picks and runs the speech engine with automatic fallback:
 * Web Speech -> Vosk (offline) -> volume-only. Once an engine fails it stays downgraded
 * for the rest of the session (until the admin changes the engine setting).
 */
export class SpeechManager {
  private current: SpeechEngine = new VolumeOnlyEngine();
  private downgradedTo: EngineKind | null = null;
  private status: EngineStatus = { kind: 'volume', loading: false, note: '' };
  private note = '';
  private listeners = new Set<() => void>();
  private handlers: SpeechHandlers | null = null;
  private waveActive = false;
  private lastSettings: Settings | null = null;

  constructor(private mic: MicInput) {}

  getStatus(): EngineStatus {
    return this.status;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Forget any automatic downgrade (called when the admin changes engine/language). */
  resetDowngrade(): void {
    this.downgradedTo = null;
  }

  /** Decide the engine for the coming game; loads the offline model first if that is the choice. */
  async prepare(settings: Settings): Promise<void> {
    this.lastSettings = settings;
    let kind = this.downgradedTo ?? this.initialKind(settings);
    if (!this.downgradedTo) this.note = '';
    if (kind === 'vosk') {
      this.setStatus(kind, true);
      try {
        this.current = new VoskEngine(await loadVoskModel(), this.mic);
        this.setStatus(kind, false);
        return;
      } catch {
        kind = 'volume';
        this.downgradedTo = 'volume';
        this.note = 'Offline model unavailable: volume-only mode';
      }
    }
    this.current = kind === 'web' ? new WebSpeechEngine(settings.lang) : new VolumeOnlyEngine();
    this.setStatus(kind, false);
  }

  /** Mobile opt-in: fetch the offline model now (user pressed the download button). */
  async downloadOfflinePack(): Promise<void> {
    await loadVoskModel();
  }

  beginWave(handlers: SpeechHandlers): void {
    this.waveActive = true;
    this.handlers = {
      onText: handlers.onText,
      onFatal: (reason) => {
        void this.degrade(reason);
      },
    };
    this.current.start(this.handlers);
  }

  clearTranscript(): void {
    this.current.clear();
  }

  async endWave(): Promise<WaveTranscript> {
    this.waveActive = false;
    const engine = this.current;
    const text = await engine.stop();
    return { text: engine.kind === 'volume' ? null : text, engine: engine.kind };
  }

  private initialKind(s: Settings): EngineKind {
    switch (s.engine) {
      case 'volume':
        return 'volume';
      case 'vosk':
        return 'vosk';
      case 'web':
        return webSpeechSupported() ? 'web' : 'volume';
      default:
        if (webSpeechSupported() && navigator.onLine) return 'web';
        // Phones never auto-download the 40MB model (cellular data): volume-only unless the player opted in.
        return isMobileDevice() && !s.voskOptIn ? 'volume' : 'vosk';
    }
  }

  /** The current engine failed: move down the chain, and join the running wave if there is one. */
  private async degrade(reason: string): Promise<void> {
    const failed = this.current.kind;
    const forced = this.lastSettings?.engine !== 'auto';
    const skipVosk = isMobileDevice() && !this.lastSettings?.voskOptIn;
    const next: EngineKind = failed === 'web' && !forced && !skipVosk ? 'vosk' : 'volume';
    this.downgradedTo = next;
    this.current.stop().catch(() => undefined);
    const handlers = this.handlers;

    if (next === 'vosk') {
      this.note = `Web Speech failed (${reason}): using offline recognition`;
      this.setStatus('vosk', true);
      try {
        const engine = new VoskEngine(await loadVoskModel(), this.mic);
        this.current = engine;
        this.setStatus('vosk', false);
        if (this.waveActive && handlers) engine.start(handlers);
        return;
      } catch {
        this.downgradedTo = 'volume';
      }
    }
    this.current = new VolumeOnlyEngine();
    this.note = `${failed} speech failed (${reason}): volume-only mode`;
    this.setStatus('volume', false);
  }

  private setStatus(kind: EngineKind, loading: boolean): void {
    this.status = { kind, loading, note: this.note };
    this.listeners.forEach((l) => l());
  }
}
