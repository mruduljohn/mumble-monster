// Local leaderboard: nickname, score, date only. Top 10 kept.

export interface LeaderboardEntry {
  name: string;
  score: number;
  date: string; // ISO timestamp
}

const KEY = 'mumble-monster:leaderboard';
const MAX_ENTRIES = 10;

export function getLeaderboard(): LeaderboardEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is LeaderboardEntry =>
        typeof e?.name === 'string' && typeof e?.score === 'number' && typeof e?.date === 'string',
    );
  } catch {
    return [];
  }
}

export function addScore(name: string, score: number): LeaderboardEntry[] {
  const next = [...getLeaderboard(), { name, score, date: new Date().toISOString() }]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: leaderboard just won't persist */
  }
  return next;
}

const listeners = new Set<() => void>();

/** Called whenever the leaderboard is reset, so open screens can refresh. */
export function subscribeLeaderboard(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function resetLeaderboard(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to reset */
  }
  listeners.forEach((l) => l());
}

export function todaysTop(entries: LeaderboardEntry[], count = 5): LeaderboardEntry[] {
  const today = new Date().toDateString();
  return entries.filter((e) => new Date(e.date).toDateString() === today).slice(0, count);
}

const PLAYER_KEY = 'mumble-monster:player-counter';

/** "Player N" default nickname; N increments every game. */
export function nextDefaultName(): string {
  let n = 1;
  try {
    n = Number(localStorage.getItem(PLAYER_KEY) ?? '0') + 1;
    localStorage.setItem(PLAYER_KEY, String(n));
  } catch {
    /* use 1 */
  }
  return `Player ${n}`;
}
