import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addScore, getLeaderboard } from './leaderboard';

// PRIVACY guard: leaderboard entries are { name, score, date } only - never image data.
describe('leaderboard privacy', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
  });
  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
  });

  it('stores only name, score and date', () => {
    addScore('Ada', 120);
    const entries = getLeaderboard();
    expect(entries).toHaveLength(1);
    expect(Object.keys(entries[0]).sort()).toEqual(['date', 'name', 'score']);
  });

  it('persists no image/base64 data', () => {
    addScore('Ada', 120);
    addScore('Bo', 80);
    const raw = [...store.values()].join('');
    expect(raw).not.toMatch(/data:image|base64|blob:/i);
  });
});
