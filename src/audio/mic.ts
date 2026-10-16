import { levelFromRms } from '../game/scoring';

export type MicErrorKind = 'denied' | 'unavailable';

export class MicError extends Error {
  constructor(public kind: MicErrorKind, message: string) {
    super(message);
  }
}

/**
 * Owns the microphone stream and a Web Audio AnalyserNode. Produces a smoothed 0..100
 * loudness level relative to the calibrated noise floor. Audio is analysed live and never stored.
 */
export class MicInput {
  ctx: AudioContext | null = null;
  source: MediaStreamAudioSourceNode | null = null;
  level = 0;
  floorRms = 0.01;
  sensitivity = 1;
  onLost: (() => void) | null = null;

  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private listeners = new Set<(level: number) => void>();
  private raf = 0;

  get active(): boolean {
    return !!this.stream && this.stream.getAudioTracks().some((t) => t.readyState === 'live');
  }

  async start(): Promise<void> {
    if (this.active) {
      await this.ctx?.resume();
      return;
    }
    this.stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MicError('unavailable', 'This browser cannot access a microphone.');
    }
    try {
      // AGC and noise suppression off so loudness is honest; echo cancellation on so the
      // game's own music/SFX are not mistaken for the player.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      const name = (e as DOMException).name;
      if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
        throw new MicError('denied', 'Microphone permission was denied.');
      }
      throw new MicError('unavailable', 'No working microphone was found.');
    }
    this.stream.getAudioTracks().forEach((t) => {
      t.onended = () => this.onLost?.();
    });
    this.ctx = new AudioContext();
    await this.ctx.resume();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.buffer = new Float32Array(this.analyser.fftSize);
    this.source.connect(this.analyser);
    this.loop();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.source?.disconnect();
    void this.ctx?.close().catch(() => undefined);
    this.stream = null;
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.level = 0;
  }

  rms(): number {
    if (!this.analyser || !this.buffer) return 0;
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) sum += this.buffer[i] * this.buffer[i];
    return Math.sqrt(sum / this.buffer.length);
  }

  subscribe(cb: (level: number) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Measure ambient noise for `ms` and return a low percentile of RMS (the noise floor),
   *  so talking during calibration does not spike it. */
  async calibrate(ms: number): Promise<number> {
    const samples: number[] = [];
    const end = performance.now() + ms;
    while (performance.now() < end) {
      samples.push(this.rms());
      await new Promise((r) => setTimeout(r, 40));
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const p20 = sorted.length ? sorted[Math.floor(0.2 * (sorted.length - 1))] : 0;
    return Math.max(0.002, p20);
  }

  private loop = (): void => {
    const raw = levelFromRms(this.rms(), this.floorRms, this.sensitivity);
    // fast attack, slower release: feels punchy on screen
    this.level += (raw - this.level) * (raw > this.level ? 0.6 : 0.15);
    this.listeners.forEach((l) => l(this.level));
    this.raf = requestAnimationFrame(this.loop);
  };
}

export const mic = new MicInput();
