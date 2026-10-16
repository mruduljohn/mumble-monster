import type { MicErrorKind } from '../audio/mic';

export function MicDeniedScreen({ kind, onRetry }: { kind: MicErrorKind; onRetry: () => void }) {
  return (
    <div className="screen" style={{ gap: '1.6rem', zIndex: 80, background: 'rgba(255,244,251,0.97)' }}>
      <h2 className="neon-title" style={{ fontSize: '2.4rem' }}>I CAN&apos;T HEAR YOU!</h2>
      <div style={{ fontSize: '2rem', maxWidth: '75%' }}>
        {kind === 'denied'
          ? 'Microphone access is blocked. Click the lock/mic icon in the address bar, choose Allow, then try again.'
          : 'No working microphone was found. Plug one in (or check your input device), then try again.'}
      </div>
      <button className="big-btn" onClick={onRetry}>TRY AGAIN</button>
    </div>
  );
}
