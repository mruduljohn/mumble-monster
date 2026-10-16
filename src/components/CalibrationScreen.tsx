import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { SpeechManager } from '../engine/manager';
import { mic } from '../audio/mic';
import { getSettings, updateSettings } from '../game/settings';

interface Props {
  manager: SpeechManager;
  onDone: () => void;
}

/** Measures ambient noise (~2s) and prepares the speech engine in parallel. */
export function CalibrationScreen({ manager, onDone }: Props) {
  const [loading, setLoading] = useState(manager.getStatus().loading);
  useEffect(() => manager.subscribe(() => setLoading(manager.getStatus().loading)), [manager]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [floor] = await Promise.all([mic.calibrate(2200), manager.prepare(getSettings())]);
      if (cancelled) return;
      updateSettings({ noiseFloorRms: floor });
      mic.floorRms = floor;
      onDone();
    })();
    return () => {
      cancelled = true;
    };
  }, [manager, onDone]);

  return (
    <div className="screen" style={{ gap: '2rem' }}>
      <div style={{ position: 'relative', width: '9rem', height: '9rem' }}>
        {[0, 0.6, 1.2].map((d) => (
          <motion.div
            key={d}
            animate={{ scale: [0.6, 2.2], opacity: [0.8, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: d, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '0.3rem solid var(--pink)' }}
          />
        ))}
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '0.5rem solid var(--sky)', boxShadow: '0 0.4rem 0 var(--plum)' }}
        />
      </div>
      <h2 className="neon-title" style={{ fontSize: '2.2rem' }}>SHHH...</h2>
      <div style={{ fontSize: '2.2rem' }}>Stay quiet... measuring the crowd noise</div>
      {loading && <div style={{ fontSize: '1.4rem', color: '#c2410c' }}>Loading offline speech brain (first time takes a few seconds)...</div>}
    </div>
  );
}
