import confetti from 'canvas-confetti';
import { isLowPower } from '../device';

const COLORS = ['#ff2fb3', '#19f0ff', '#b6ff3c', '#ffe14d', '#ffffff'];

export function hitBurst(big: boolean): void {
  confetti({ particleCount: Math.round((big ? 120 : 50) * (isLowPower() ? 0.45 : 1)), spread: big ? 100 : 70, origin: { x: 0.5, y: 0.45 }, colors: COLORS, startVelocity: 40, ticks: 90, zIndex: 4 });
}

/** Monster explosion: several waves of confetti from the middle and both sides. */
export function victoryConfetti(): void {
  hitBurst(true);
  const end = Date.now() + 2800;
  const frame = () => {
    confetti({ particleCount: isLowPower() ? 3 : 6, angle: 60, spread: 70, origin: { x: 0, y: 0.8 }, colors: COLORS, zIndex: 4 });
    confetti({ particleCount: isLowPower() ? 3 : 6, angle: 120, spread: 70, origin: { x: 1, y: 0.8 }, colors: COLORS, zIndex: 4 });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
