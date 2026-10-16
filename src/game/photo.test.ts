import { describe, expect, it } from 'vitest';
import { squareCrop, stopStream } from './photo';

describe('squareCrop', () => {
  it('center-crops landscape video', () => {
    expect(squareCrop(1280, 720)).toEqual({ sx: 280, sy: 0, size: 720 });
  });
  it('center-crops portrait video', () => {
    expect(squareCrop(480, 640)).toEqual({ sx: 0, sy: 80, size: 480 });
  });
  it('keeps a square as is', () => {
    expect(squareCrop(300, 300)).toEqual({ sx: 0, sy: 0, size: 300 });
  });
  it('handles empty sources', () => {
    expect(squareCrop(0, 0).size).toBe(0);
  });
});

describe('stopStream', () => {
  it('stops all tracks and tolerates null', () => {
    const stopped: number[] = [];
    const tracks = [0, 1].map((i) => ({ stop: () => stopped.push(i) }));
    stopStream({ getTracks: () => tracks } as unknown as MediaStream);
    expect(stopped).toEqual([0, 1]);
    expect(() => stopStream(null)).not.toThrow();
  });
});
