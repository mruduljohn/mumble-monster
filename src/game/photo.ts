// Player-photo helpers. PRIVACY: the photo is a transient in-memory data URL held only in React state.
// It must NEVER be written to localStorage / IndexedDB / disk / network, and never added to GameSummary
// or leaderboard entries. App clears it whenever the game returns to the title screen.

export const PHOTO_SIZE = 256;

export interface SquareCrop { sx: number; sy: number; size: number }

/** Center-crop rectangle (largest centered square) for a source of the given size. */
export function squareCrop(width: number, height: number): SquareCrop {
  const size = Math.max(0, Math.min(width, height));
  return { sx: Math.round((width - size) / 2), sy: Math.round((height - size) / 2), size };
}

/** Stop every track of a stream (camera light off). Safe on null. */
export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Capture the current video frame as a mirrored (matches the preview), center-cropped square data URL. */
export function capturePhoto(video: HTMLVideoElement, out = PHOTO_SIZE): string | null {
  const { videoWidth: w, videoHeight: h } = video;
  if (!w || !h) return null;
  const { sx, sy, size } = squareCrop(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.translate(out, 0);
  g.scale(-1, 1);
  g.drawImage(video, sx, sy, size, size, 0, 0, out, out);
  return canvas.toDataURL('image/jpeg', 0.85);
}
