import { FINALE_PHRASES, PHRASES } from '../content/phrases';

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick `count` distinct lines (last one is a tongue-twister finale), spread over categories. */
export function buildGameLines(waves: number): string[] {
  const pools = shuffle(Object.values(PHRASES)).map(shuffle);
  const lines: string[] = [];
  let i = 0;
  while (lines.length < waves - 1) {
    const pool = pools[i % pools.length];
    const next = pool.shift();
    if (next) lines.push(next);
    else if (pools.every((p) => p.length === 0)) break;
    i++;
  }
  lines.push(shuffle(FINALE_PHRASES)[0]);
  return lines;
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
