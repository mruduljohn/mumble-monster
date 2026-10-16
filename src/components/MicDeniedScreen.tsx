import type { MicErrorKind } from '../audio/mic';

export function MicDeniedScreen({ kind, onRetry }: { kind: MicErrorKind; onRetry: () => void }) {
  return (
    <div className="screen" style={{ gap: '1.6rem', zIndex: 80, background: 'rgba(255,244,251,0.97)' }}>
      <h2 className="neon-title" style={{ fontSize: 'min(2.4rem, 8vw)' }}>I CAN&apos;T HEAR YOU!</h2>
      <div style={{ fontSize: 'min(2rem, 5.2vw)', maxWidth: '90%' }}>
        {kind === 'denied'
          ? 'Microphone access is blocked. Tap the lock/mic icon in the address bar (or the site settings), choose Allow, then try again.'
          : 'No working microphone was found. Plug one in (or check your input device), then try again.'}
      </div>
      <button className="big-btn" onClick={onRetry}>TRY AGAIN</button>
    </div>
  );
}
