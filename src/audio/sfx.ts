// Procedural chiptune music + sound effects via Web Audio. No audio assets needed.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let musicTimer: number | null = null;
let nextStepTime = 0;
let step = 0;

const MUSIC_VOLUME = 0.22;
const DUCKED_VOLUME = 0.03;

/** Must be called from a user gesture at least once (START button). */
export function unlockAudio(): void {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = MUSIC_VOLUME;
    musicGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  void ctx.resume();
}

/** True once the AudioContext has been created by a user gesture. */
export function soundUnlocked(): boolean {
  return ctx !== null;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master && ctx) master.gain.setTargetAtTime(value ? 0 : 0.8, ctx.currentTime, 0.02);
}

/** Lower the music while the player speaks so it does not leak into the mic. */
export function duckMusic(ducked: boolean): void {
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(ducked ? DUCKED_VOLUME : MUSIC_VOLUME, ctx.currentTime, 0.05);
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number, dest?: AudioNode): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest ?? master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, delay = 0, filterFreq = 3000, dest?: AudioNode): void {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(dest ?? master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  click: () => tone(660, 0.08, 'square', 0.15),
  tick: () => tone(440, 0.1, 'square', 0.2),
  shutter: () => {
    noise(0.07, 0.45, 0, 3000);
    tone(1800, 0.04, 'square', 0.2, 0.02);
    noise(0.12, 0.35, 0.09, 1500);
  },
  go: () => {
    tone(880, 0.25, 'square', 0.25);
    tone(1320, 0.3, 'square', 0.2, 0.08);
  },
  attack: () => {
    tone(1400, 0.45, 'sawtooth', 0.28, 0, 120);
    tone(700, 0.45, 'square', 0.15, 0, 60);
    noise(0.4, 0.3, 0.05, 1500);
  },
  crit: () => {
    tone(1800, 0.6, 'sawtooth', 0.3, 0, 100);
    tone(90, 0.6, 'sine', 0.5, 0.1, 40);
    noise(0.6, 0.4, 0.1, 800);
  },
  garbled: () => {
    tone(300, 0.3, 'sawtooth', 0.2, 0, 150);
    noise(0.3, 0.25, 0, 2000);
  },
  heal: () => {
    [330, 392, 494, 659].forEach((f, i) => tone(f, 0.18, 'triangle', 0.25, i * 0.09));
  },
  laugh: () => {
    // "ha ha ha" - descending wobbling blips
    for (let i = 0; i < 5; i++) tone(520 - i * 35, 0.1, 'sawtooth', 0.2, i * 0.14, 380 - i * 35);
  },
  combo: (streak: number) => {
    const base = 440 * Math.pow(1.122, Math.min(streak, 6));
    [1, 1.25, 1.5, 2].forEach((m, i) => tone(base * m, 0.12, 'square', 0.2, i * 0.06));
  },
  victory: () => {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'square', 0.25, i * 0.13));
    noise(1.2, 0.3, 0.9, 5000);
  },
  defeat: () => {
    [392, 370, 349, 294].forEach((f, i) => tone(f, 0.35, 'triangle', 0.3, i * 0.25));
  },
};

// Music: A minor progression Am - F - C - G, 16th-note steps, ~132 bpm.
const BPM = 132;
const STEP_SEC = 60 / BPM / 4;
const ROOTS = [110, 87.31, 130.81, 98];
// Index into the chord (root/third/fifth) for each 16th step of the arpeggio.
const ARP = [0, 2, 1, 2, 0, 2, 1, 2, 1, 2, 1, 2, 0, 2, 1, 2];
const CHORDS = [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];

function scheduleStep(t: number, s: number): void {
  if (!ctx || !musicGain) return;
  const bar = Math.floor(s / 16) % 4;
  const i = s % 16;
  const root = ROOTS[bar];
  const chord = CHORDS[bar];
  const startDelay = t - ctx.currentTime;

  if (i % 4 === 0) tone(60, 0.15, 'sine', 0.9, startDelay, 35, musicGain);
  if (i % 4 === 2) noise(0.04, 0.25, startDelay, 7000, musicGain);
  if (i % 2 === 0) tone(root, STEP_SEC * 1.6, 'triangle', 0.5, startDelay, undefined, musicGain);
  const arpNote = root * 2 * Math.pow(2, (chord[ARP[i]] + (i % 4 === 3 ? 12 : 0)) / 12);
  tone(arpNote, STEP_SEC * 0.9, 'square', 0.14, startDelay, undefined, musicGain);
}

export function startMusic(): void {
  if (!ctx || musicTimer !== null) return;
  nextStepTime = ctx.currentTime + 0.1;
  musicTimer = window.setInterval(() => {
    if (!ctx) return;
    while (nextStepTime < ctx.currentTime + 0.15) {
      scheduleStep(nextStepTime, step);
      nextStepTime += STEP_SEC;
      step = (step + 1) % 64;
    }
  }, 30);
}
