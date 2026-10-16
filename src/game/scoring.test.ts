import { describe, expect, it } from 'vitest';
import {
  classifyOutcome,
  clarityFromVolume,
  clarityScore,
  comboMultiplier,
  applyWave,
  levelFromRms,
  MONSTER_MAX_HP,
  levenshtein,
  grantsFinaleRetry,
  HEAL_AMOUNT,
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
    expect(comboMultiplier(10)).toBe(1.8);
  });
  it('garbled deals reduced (but real) damage and resets streak', () => {
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

describe('game balance (full-game simulation)', () => {
  type Wave = [clarity: number, loudness: number];
  // Weakest input that still counts as each outcome.
  const HIT: Wave = [0.5, 35];
  const CRIT: Wave = [0.85, 75];
  const MUMBLE: Wave = [0.8, 10];
  const GARBLED: Wave = [0.2, 60];
  const TYPICAL: Wave = [0.8, 60];
  const SILENT: Wave = [0, 0];

  /** Mirrors BattleScreen: resolveLine + applyWave over 5 waves (last is the finale). */
  function play(waves: Wave[]): { won: boolean; hp: number } {
    let hp = MONSTER_MAX_HP;
    let streak = 0;
    for (let w = 0; w < waves.length; w++) {
      const finale = w === waves.length - 1;
      const r = resolveLine({ clarity: waves[w][0], loudness: waves[w][1], streak, finale });
      streak = r.streak;
      hp = applyWave(hp, r, finale).hp;
      if (hp <= 0) return { won: true, hp: 0 };
    }
    return { won: false, hp };
  }

  const masks = Array.from({ length: 32 }, (_, m) => Array.from({ length: 5 }, (_, i) => Boolean((m >> i) & 1)));
  const count = (m: boolean[]) => m.filter(Boolean).length;
  const seq = (m: boolean[], good: Wave, bad: Wave) => m.map((h) => (h ? good : bad));

  it('outcome fixtures classify as intended', () => {
    expect(classifyOutcome(...HIT)).toBe('hit');
    expect(classifyOutcome(...CRIT)).toBe('crit');
    expect(classifyOutcome(...MUMBLE)).toBe('mumble');
    expect(classifyOutcome(...GARBLED)).toBe('garbled');
    expect(classifyOutcome(...SILENT)).toBe('mumble');
  });

  it('3+ weakest hits (no crits, no combo needed) win in every order that lands the finale', () => {
    for (const m of masks.filter((x) => count(x) >= 3 && x[4])) {
      expect(play(seq(m, HIT, MUMBLE)).won, m.join()).toBe(true);
      expect(play(seq(m, HIT, SILENT)).won, m.join()).toBe(true);
    }
  });

  it('3 weakest hits with the finale landed also win when non-consecutive (H M H M H)', () => {
    expect(play([HIT, MUMBLE, HIT, MUMBLE, HIT]).won).toBe(true);
    expect(play([MUMBLE, MUMBLE, HIT, HIT, HIT]).won).toBe(true);
  });

  it('2 hits + 1 crit (rest mumbles) wins', () => {
    expect(play([HIT, MUMBLE, HIT, MUMBLE, CRIT]).won).toBe(true);
    expect(play([CRIT, MUMBLE, HIT, MUMBLE, HIT]).won).toBe(true);
    expect(play([MUMBLE, HIT, CRIT, MUMBLE, HIT]).won).toBe(true);
  });

  it('2 or fewer hits lose (weakest and typical strength, any placement)', () => {
    for (const m of masks.filter((x) => count(x) <= 2)) {
      expect(play(seq(m, HIT, MUMBLE)).won, m.join()).toBe(false);
      expect(play(seq(m, TYPICAL, MUMBLE)).won, m.join()).toBe(false);
    }
  });

  it('silence loses, and the monster survives until the finale', () => {
    expect(play([SILENT, SILENT, SILENT, SILENT, SILENT]).won).toBe(false);
    expect(play([CRIT, CRIT, CRIT, CRIT, MUMBLE]).won).toBe(false); // finale guarantee
  });

  it('four strong lines never kill before the finale; a normal finale hit then finishes', () => {
    let hp = MONSTER_MAX_HP;
    let streak = 0;
    for (let w = 0; w < 4; w++) {
      const r = resolveLine({ clarity: 1, loudness: 95, streak, finale: false });
      streak = r.streak;
      hp = applyWave(hp, r, false).hp;
    }
    expect(hp).toBeGreaterThan(0);
    const fin = resolveLine({ clarity: HIT[0], loudness: HIT[1], streak: 0, finale: true });
    expect(applyWave(hp, fin, true).hp).toBe(0);
  });

  it('overkill from the pre-finale clamp converts to bonus points', () => {
    const r = resolveLine({ clarity: 1, loudness: 95, streak: 5, finale: false });
    const a = applyWave(15, r, false);
    expect(a.hp).toBe(10);
    expect(a.overkill).toBeGreaterThan(0);
  });

  it('LAST CHANCE: 4 hits + mumbled finale + hit retry wins; 3 hits + mumble + mumble retry loses; <2 prior hits get no retry', () => {
    const run = (pre: Wave[], finaleAttempts: Wave[]) => {
      let hp = MONSTER_MAX_HP;
      let streak = 0;
      let priorHits = 0;
      for (const w of pre) {
        const r = resolveLine({ clarity: w[0], loudness: w[1], streak, finale: false });
        streak = r.streak;
        if (r.outcome === 'hit' || r.outcome === 'crit') priorHits++;
        hp = applyWave(hp, r, false).hp;
      }
      let retryUsed = false;
      for (const a of finaleAttempts) {
        const r0 = resolveLine({ clarity: a[0], loudness: a[1], streak, finale: true });
        const retry = grantsFinaleRetry({ finale: true, outcome: r0.outcome, priorHits, retryUsed });
        const r = retry ? { ...r0, heal: 0 } : r0;
        hp = applyWave(hp, r, true).hp;
        if (hp <= 0) return { won: true, retried: retryUsed };
        if (!retry) return { won: false, retried: retryUsed };
        retryUsed = true;
        streak = 0;
      }
      return { won: false, retried: retryUsed };
    };
    expect(run([HIT, HIT, HIT, HIT], [MUMBLE, HIT])).toEqual({ won: true, retried: true });
    expect(run([HIT, HIT, HIT, MUMBLE], [MUMBLE, MUMBLE])).toEqual({ won: false, retried: true });
    expect(run([HIT, MUMBLE, MUMBLE, MUMBLE], [MUMBLE, HIT]).retried).toBe(false);
    expect(run([HIT, MUMBLE, MUMBLE, MUMBLE], [MUMBLE, HIT]).won).toBe(false);
    expect(grantsFinaleRetry({ finale: true, outcome: 'garbled', priorHits: 4, retryUsed: false })).toBe(false);
    expect(grantsFinaleRetry({ finale: true, outcome: 'mumble', priorHits: 4, retryUsed: true })).toBe(false);
  });

  it('garbled is a real but reduced hit; mumble heal is small', () => {
    const g = resolveLine({ clarity: GARBLED[0], loudness: GARBLED[1], streak: 0, finale: false });
    const h = resolveLine({ clarity: HIT[0], loudness: HIT[1], streak: 0, finale: false });
    expect(g.damage).toBeGreaterThanOrEqual(10);
    expect(g.damage).toBeLessThan(h.damage);
    expect(HEAL_AMOUNT).toBeLessThanOrEqual(5);
  });
});
