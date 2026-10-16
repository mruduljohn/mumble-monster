import { describe, expect, it } from 'vitest';
import {
  classifyOutcome,
  clarityFromVolume,
  clarityScore,
  comboMultiplier,
  levelFromRms,
  levenshtein,
  loudnessScore,
  normalize,
  pickTitle,
  resolveLine,
  tokenize,
} from './scoring';

describe('normalize / tokenize', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalize("  Hello, World!!  It's ME. ")).toBe('hello world its me');
  });
  it('tokenizes empty text to nothing', () => {
    expect(tokenize('  ?! ')).toEqual([]);
  });
});

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });
});

describe('clarityScore', () => {
  const target = 'Clear words build great bridges!';
  it('is 1 for an exact match ignoring case and punctuation', () => {
    expect(clarityScore(target, 'clear words build great bridges')).toBe(1);
  });
  it('tolerates small typos per word', () => {
    expect(clarityScore(target, 'clear word build grate bridges')).toBeGreaterThan(0.85);
  });
  it('drops for missing words', () => {
    const c = clarityScore(target, 'clear words');
    expect(c).toBeGreaterThan(0.3);
    expect(c).toBeLessThan(0.5);
  });
  it('is 0 for unrelated or empty speech', () => {
    expect(clarityScore(target, 'pizza for everyone')).toBe(0);
    expect(clarityScore(target, '')).toBe(0);
  });
  it('requires word order', () => {
    expect(clarityScore('one two three', 'three two one')).toBeLessThan(0.5);
  });
  it('handles split words like wi fi', () => {
    expect(clarityScore('My Wi-Fi password', 'my wifi password')).toBeGreaterThan(0.9);
  });
});

describe('loudness', () => {
  it('is 0 for silence', () => {
    expect(loudnessScore([])).toBe(0);
    expect(loudnessScore([1, 2, 3])).toBe(0);
  });
  it('rises with louder samples', () => {
    expect(loudnessScore(new Array(50).fill(80))).toBeGreaterThan(loudnessScore(new Array(50).fill(40)));
  });
  it('maps rms relative to the noise floor', () => {
    expect(levelFromRms(0.01, 0.01, 1)).toBe(0);
    expect(levelFromRms(1, 0.01, 1)).toBe(100);
    expect(levelFromRms(0.1, 0.01, 2)).toBeGreaterThan(levelFromRms(0.1, 0.01, 1));
  });
  const outcomeFor = (rms: number, floor: number) =>
    classifyOutcome(1, levelFromRms(rms, floor, 1)); // perfect clarity isolates loudness
  it('loud kids land at least a hit even with a noisy (clamped) floor', () => {
    expect(['hit', 'crit']).toContain(outcomeFor(0.12, 0.03));
  });
  it('loud, clear speech over a quiet floor crits', () => {
    expect(outcomeFor(0.05, 0.005)).toBe('crit');
  });
  it('barely above the floor is a mumble', () => {
    expect(outcomeFor(0.008, 0.005)).toBe('mumble');
  });
  it('clamps the floor so noisy calibration cannot make the game unwinnable', () => {
    expect(levelFromRms(0.1, 0.5, 1)).toBe(levelFromRms(0.1, 0.012, 1));
    expect(levelFromRms(0.1, 0.0001, 1)).toBe(levelFromRms(0.1, 0.002, 1));
  });
});

describe('clarityFromVolume', () => {
  it('scores sustained steady speech higher than silence or bursts', () => {
    const steady = new Array(100).fill(60);
    const burst = [...new Array(10).fill(80), ...new Array(90).fill(2)];
    expect(clarityFromVolume(steady)).toBeGreaterThan(0.8);
    expect(clarityFromVolume(burst)).toBeLessThan(0.3);
    expect(clarityFromVolume(new Array(100).fill(0))).toBe(0);
  });
  it('sustained loud speech with natural level variation can reach crit clarity', () => {
    const speech = Array.from({ length: 120 }, (_, i) => (i % 2 ? 85 : 55));
    expect(clarityFromVolume(speech)).toBeGreaterThanOrEqual(0.9);
  });
});

describe('classifyOutcome thresholds', () => {
  it('crit needs high clarity and loudness', () => {
    expect(classifyOutcome(0.95, 80)).toBe('crit');
    expect(classifyOutcome(0.95, 60)).toBe('hit');
  });
  it('hit needs decent clarity and loudness', () => {
    expect(classifyOutcome(0.7, 45)).toBe('hit');
    expect(classifyOutcome(0.7, 30)).toBe('mumble');
  });
  it('loud but garbled is garbled', () => {
    expect(classifyOutcome(0.2, 80)).toBe('garbled');
  });
  it('quiet is a mumble regardless of clarity', () => {
    expect(classifyOutcome(1, 10)).toBe('mumble');
    expect(classifyOutcome(0.1, 35)).toBe('mumble');
  });
});

describe('resolveLine', () => {
  it('deals damage and extends the streak on a hit', () => {
    const r = resolveLine({ clarity: 0.9, loudness: 80, streak: 0, finale: false });
    expect(r.outcome).toBe('crit');
    expect(r.damage).toBeGreaterThan(0);
    expect(r.heal).toBe(0);
    expect(r.streak).toBe(1);
  });
  it('combo increases damage and finale boosts it', () => {
    const a = resolveLine({ clarity: 0.9, loudness: 80, streak: 0, finale: false });
    const b = resolveLine({ clarity: 0.9, loudness: 80, streak: 2, finale: false });
    const c = resolveLine({ clarity: 0.9, loudness: 80, streak: 0, finale: true });
    expect(b.damage).toBeGreaterThan(a.damage);
    expect(c.damage).toBeGreaterThan(a.damage);
    expect(comboMultiplier(10)).toBe(2);
  });
  it('garbled deals half damage and resets streak', () => {
    const hit = resolveLine({ clarity: 0.3, loudness: 90, streak: 3, finale: false });
    expect(hit.outcome).toBe('garbled');
    expect(hit.streak).toBe(0);
    const full = resolveLine({ clarity: 0.9, loudness: 90, streak: 0, finale: false });
    expect(hit.damage).toBeLessThan(full.damage);
    expect(hit.damage).toBeGreaterThan(0);
  });
  it('mumble heals the monster', () => {
    const r = resolveLine({ clarity: 0.8, loudness: 10, streak: 2, finale: false });
    expect(r.outcome).toBe('mumble');
    expect(r.heal).toBeGreaterThan(0);
    expect(r.damage).toBe(0);
    expect(r.streak).toBe(0);
  });
});

describe('pickTitle', () => {
  it('awards titles', () => {
    expect(pickTitle({ won: true, avgClarity: 0.9, peakLoudness: 95, avgLoudness: 70 })).toBe('Certified Loud Legend');
    expect(pickTitle({ won: false, avgClarity: 0.9, peakLoudness: 60, avgLoudness: 50 })).toBe('Clarity Commander');
    expect(pickTitle({ won: false, avgClarity: 0.2, peakLoudness: 20, avgLoudness: 10 })).toBe('Whisper Wizard');
  });
});
