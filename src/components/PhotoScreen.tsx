import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sfx } from '../audio/sfx';
import { capturePhoto, stopStream } from '../game/photo';
import { Hero } from './Hero';

type Step = 'starting' | 'live' | 'countdown' | 'review' | 'fallback';

/**
 * Optional hero photo. PRIVACY: photo stays in memory only (handed to App state as a data URL),
 * the camera stream is stopped as soon as the photo is taken / step skipped / screen left.
 */
export function PhotoScreen({ nickname, onDone }: { nickname: string; onDone: (photo: string | null) => void }) {
  const [step, setStep] = useState<Step>('starting');
  const [count, setCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(0);
  const [shot, setShot] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const aliveRef = useRef(true);
  const doneRef = useRef(false);

  const release = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const finish = useCallback((photo: string | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    release();
    onDone(photo);
  }, [onDone, release]);

  const startCamera = useCallback(async () => {
    setStep('starting');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (!aliveRef.current) { stopStream(stream); return; }
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) { v.srcObject = stream; await v.play().catch(() => undefined); }
      setStep('live');
    } catch {
      if (aliveRef.current) { release(); setStep('fallback'); }
    }
  }, [release]);

  useEffect(() => {
    aliveRef.current = true;
    void startCamera();
    return () => { aliveRef.current = false; stopStream(streamRef.current); streamRef.current = null; };
  }, [startCamera]);

  // Never block the game: after a friendly note, continue with the default hero face.
  useEffect(() => {
    if (step !== 'fallback') return;
    const t = window.setTimeout(() => finish(null), 3500);
    return () => window.clearTimeout(t);
  }, [step, finish]);

  const snap = useCallback(async () => {
    setStep('countdown');
    for (const n of [3, 2, 1]) {
      if (!aliveRef.current) return;
      setCount(n); sfx.tick();
      await new Promise((r) => setTimeout(r, 800));
    }
    if (!aliveRef.current) return;
    setCount(null);
    sfx.shutter();
    setFlash((f) => f + 1);
    const v = videoRef.current;
    const url = v ? capturePhoto(v) : null;
    release();
    if (url) { setShot(url); setStep('review'); } else setStep('fallback');
  }, [release]);

  const retake = () => { setShot(null); void startCamera(); };
  const showVideo = step === 'live' || step === 'countdown' || step === 'starting';

  return (
    <div className="screen" style={{ gap: '0.9rem' }}>
      <h2 className="neon-title" style={{ fontSize: '2.2rem' }}>SUIT UP, HERO!</h2>

      <div style={{ position: 'relative', width: '17rem', height: '17rem' }}>
        {/* hero helmet frame */}
        <div style={{ position: 'absolute', inset: '-0.9rem', borderRadius: '50%', border: '0.5rem solid var(--plum)', background: 'conic-gradient(var(--pink), var(--lemon), var(--sky), var(--grape), var(--pink))', zIndex: 0, boxShadow: 'var(--shadow-soft)' }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', border: '0.4rem solid var(--plum)', background: '#ffe9f5', zIndex: 1 }}>
          <video
            ref={videoRef} muted playsInline aria-label="Camera preview"
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: showVideo ? 'block' : 'none' }}
          />
          {step === 'review' && shot && <img src={shot} alt="Your hero photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          {step === 'fallback' && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '2rem' }}><Hero photo={null} showName={false} size="13rem" /></div>}
          <AnimatePresence>
            {step === 'countdown' && count !== null && (
              <motion.div key={count} className="logo-letter l-a" initial={{ scale: 2.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '6rem', zIndex: 3 }}>
                {count}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* visor shine + face guide */}
        <div style={{ position: 'absolute', inset: '0.4rem', borderRadius: '50%', border: '0.15rem dashed rgba(255,255,255,0.9)', zIndex: 2, pointerEvents: 'none' }} />
        {flash > 0 && (
          <motion.div key={flash} initial={{ opacity: 0.95 }} animate={{ opacity: 0 }} transition={{ duration: 0.5 }}
            style={{ position: 'absolute', inset: '-0.9rem', borderRadius: '50%', background: '#fff', zIndex: 4, pointerEvents: 'none' }} />
        )}
      </div>

      <div style={{ fontSize: '1.35rem', minHeight: '2.2rem' }}>
        {step === 'starting' && 'Waking up the camera...'}
        {step === 'live' && `Line up your face in the visor, ${nickname}!`}
        {step === 'countdown' && 'Hold still... smile!'}
        {step === 'review' && 'Looking heroic!'}
        {step === 'fallback' && 'No camera? No problem - your hero will wear the default face.'}
      </div>

      <div style={{ display: 'flex', gap: '1.2rem', alignItems: 'center' }}>
        {step === 'live' && <button className="big-btn" style={{ fontSize: '1.4rem', padding: '0.7rem 1.8rem', minHeight: '3.2rem' }} onClick={() => void snap()}>TAKE PHOTO</button>}
        {step === 'review' && (
          <>
            <button className="big-btn" style={{ fontSize: '1.4rem', padding: '0.7rem 1.8rem', minHeight: '3.2rem' }} onClick={() => finish(shot)}>USE IT!</button>
            <button className="big-btn alt" style={{ fontSize: '1.4rem', padding: '0.7rem 1.8rem', minHeight: '3.2rem' }} onClick={retake}>RETAKE</button>
          </>
        )}
        <button className="big-btn" style={{ fontSize: '1.1rem', padding: '0.5rem 1.4rem', minHeight: '2.6rem', background: '#fff' }} onClick={() => finish(null)}>
          {step === 'fallback' ? 'CONTINUE' : 'SKIP'}
        </button>
      </div>

      <div style={{ fontSize: '1rem', opacity: 0.8, maxWidth: '40rem' }}>
        Optional. Your photo stays on this laptop for this game only and is deleted when you finish.
      </div>
    </div>
  );
}
