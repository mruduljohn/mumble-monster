// Pure scoring logic: text matching, loudness, outcome classification, damage, score, titles.

export type Outcome = 'crit' | 'hit' | 'garbled' | 'mumble';

export const MONSTER_MAX_HP = 200;
export const WORD_MATCH_MIN = 0.7; // per-word similarity needed to count as "heard"
export const MUMBLE_MAX_LOUDNESS = 25; // below this the line is a mumble
export const HIT_MIN_LOUDNESS = 40; // loudness needed for a clean hit
export const CRIT_MIN_LOUDNESS = 75;
export const HIT_MIN_CLARITY = 0.6;
export const CRIT_MIN_CLARITY = 0.9;
export const GARBLED_MIN_LOUDNESS = 50; // loud but unclear -> "shouting isn't clarity"
export const HEAL_AMOUNT = 8;
export const FINALE_DAMAGE_MULTIPLIER = 1.5;

/** Lowercase, drop punctuation, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(' ') : [];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 = identical, 0 = nothing in common. */
export function wordSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
}

/**
 * Clarity 0..1: how much of the target line was heard, in order, tolerating small
 * per-word typos. Extra heard words dilute the score a little.
 */
export function clarityScore(target: string, heard: string): number {
  const t = tokenize(target);
  const h = tokenize(heard);
  if (!t.length || !h.length) return 0;

  // Order-aware weighted alignment (like LCS, but with fuzzy word credit).
  const dp: number[][] = Array.from({ length: t.length + 1 }, () => new Array(h.length + 1).fill(0));
  for (let i = 1; i <= t.length; i++) {
    for (let j = 1; j <= h.length; j++) {
      const sim = wordSimilarity(t[i - 1], h[j - 1]);
      const credit = sim >= WORD_MATCH_MIN ? sim : 0;
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1] + credit);
    }
  }
  const wordBased = dp[t.length][h.length] / Math.max(t.length, h.length);

  // Speech engines often split/merge words ("wi fi" vs "wifi"), so also compare the joined text.
  const joinedT = t.join('');
  const joinedH = h.join('');
  const sim = wordSimilarity(joinedT, joinedH);
  const joinedBased = sim >= 0.8 ? sim : 0;

  return Math.min(1, Math.max(wordBased, joinedBased));
}

/** Percentile of a numeric list (p in 0..1). */
function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * Loudness 0..100 for one wave from raw level samples (each 0..100).
 * Blends a robust peak (95th percentile, ignoring single-frame spikes) with the average
 * of the voiced samples.
 */
export function loudnessScore(samples: number[]): number {
  if (!samples.length) return 0;
  const voiced = samples.filter((s) => s > 12);
  if (!voiced.length) return 0;
  const avgVoiced = voiced.reduce((a, b) => a + b, 0) / voiced.length;
  return Math.round(Math.min(100, 0.6 * percentile(samples, 0.95) + 0.4 * avgVoiced));
}

// A noisy calibration (expo hall) must not make the game unwinnable, nor a silent one too twitchy.
export const MIN_FLOOR_RMS = 0.002;
export const MAX_FLOOR_RMS = 0.012;

export function clampFloor(floorRms: number): number {
  return Math.min(MAX_FLOOR_RMS, Math.max(MIN_FLOOR_RMS, floorRms));
}

/**
 * Map a raw RMS (0..1) to a 0..100 level relative to the (clamped) noise floor.
 * 25 dB above the floor = 100. At sensitivity 1: mumble < 6.25 dB, hit >= 10 dB (level 40),
 * crit >= 18.75 dB (level 75) above the floor.
 */
export function levelFromRms(rms: number, floorRms: number, sensitivity: number): number {
  const db = 20 * Math.log10(Math.max(rms, 1e-5));
  const floorDb = 20 * Math.log10(clampFloor(floorRms));
  const span = 25 / Math.max(sensitivity, 0.1); // dB between the floor and "max"
  return Math.max(0, Math.min(100, ((db - floorDb) / span) * 100));
}

/**
 * Volume-only fallback: guess clarity from how much and how steadily the player spoke.
 * Sustained, steady speech scores high; short bursts or silence score low.
 */
export function clarityFromVolume(samples: number[]): number {
  if (!samples.length) return 0;
  const voiced = samples.filter((s) => s > 20);
  const coverage = Math.min(1, voiced.length / samples.length / 0.55);
  if (!voiced.length) return 0;
  const mean = voiced.reduce((a, b) => a + b, 0) / voiced.length;
  const sd = Math.sqrt(voiced.reduce((a, b) => a + (b - mean) ** 2, 0) / voiced.length);
  // Natural speech varies a lot in level, so the steadiness penalty is gentle.
  const steadiness = 1 - Math.min(1, sd / 70);
  return Math.min(1, coverage * (0.8 + 0.2 * steadiness));
}

export function classifyOutcome(clarity: number, loudness: number): Outcome {
  if (loudness < MUMBLE_MAX_LOUDNESS) return 'mumble';
  if (clarity >= HIT_MIN_CLARITY) {
    if (loudness < HIT_MIN_LOUDNESS) return 'mumble';
    return clarity >= CRIT_MIN_CLARITY && loudness >= CRIT_MIN_LOUDNESS ? 'crit' : 'hit';
  }
  return loudness >= GARBLED_MIN_LOUDNESS ? 'garbled' : 'mumble';
}

export function comboMultiplier(streak: number): number {
  return Math.min(2, 1 + 0.25 * Math.max(0, streak - 1));
}

export interface LineResult {
  outcome: Outcome;
  clarity: number;
  loudness: number;
  damage: number; // positive = damage dealt to monster
  heal: number; // positive = monster healed
  points: number;
  streak: number;
}

/** Score one wave. `streak` is the number of consecutive good lines BEFORE this one. */
export function resolveLine(opts: {
  clarity: number;
  loudness: number;
  streak: number;
  finale: boolean;
}): LineResult {
  const { clarity, loudness, finale } = opts;
  const outcome = classifyOutcome(clarity, loudness);
  const good = outcome === 'crit' || outcome === 'hit';
  const streak = good ? opts.streak + 1 : 0;
  const finaleMult = finale ? FINALE_DAMAGE_MULTIPLIER : 1;
  const base = 18 + clarity * 10 + (outcome === 'crit' ? 4 : 0);

  let damage = 0;
  let heal = 0;
  let points = 0;
  if (good) {
    damage = Math.round(base * comboMultiplier(streak) * finaleMult);
    points = Math.round((clarity * 500 + loudness * 3) * comboMultiplier(streak) * finaleMult);
  } else if (outcome === 'garbled') {
    damage = Math.round((base / 2) * finaleMult);
    points = Math.round(clarity * 150);
  } else {
    heal = HEAL_AMOUNT;
  }
  return { outcome, clarity, loudness, damage, heal, points, streak };
}

export const VICTORY_BONUS = 500;

export function pickTitle(opts: { won: boolean; avgClarity: number; peakLoudness: number; avgLoudness: number }): string {
  const { won, avgClarity, peakLoudness, avgLoudness } = opts;
  if (won && avgClarity >= 0.8 && peakLoudness >= 85) return 'Certified Loud Legend';
  if (avgClarity >= 0.85) return 'Clarity Commander';
  if (peakLoudness >= 90) return 'Volume Volcano';
  if (avgLoudness < 35) return 'Whisper Wizard';
  if (won) return 'Mumble Slayer';
  return 'Brave Beginner';
}
