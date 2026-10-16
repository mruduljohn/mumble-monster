import { useSyncExternalStore } from 'react';

export type EngineChoice = 'auto' | 'web' | 'vosk' | 'volume';

export interface Settings {
  sensitivity: number; // 0.5 .. 2
  noiseFloorRms: number; // calibrated ambient RMS (0..1)
  engine: EngineChoice;
  lang: string;
  waveSeconds: number;
  muted: boolean;
  /** Mobile only: the player chose to download the 40MB offline voice pack. */
  voskOptIn: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  noiseFloorRms: 0.01,
  engine: 'auto',
  lang: 'en-US',
  waveSeconds: 6,
  muted: false,
  voskOptIn: false,
};

const KEY = 'mumble-monster:settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* corrupted or unavailable storage: fall back to defaults */
  }
  return DEFAULT_SETTINGS;
}

let current = load();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage full or blocked: keep in-memory settings */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSettings,
  );
}
