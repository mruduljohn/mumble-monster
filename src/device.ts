// Device capability helpers (evaluated lazily so tests/SSR without window do not break).

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600;
}

/** Small screen or few CPU cores: use lighter effects. */
export function isLowPower(): boolean {
  if (typeof window === 'undefined') return false;
  const cores = navigator.hardwareConcurrency ?? 8;
  return Math.min(window.innerWidth, window.innerHeight) < 600 || cores <= 4;
}

export function fullscreenSupported(): boolean {
  return typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false;
}
