import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { getLeaderboard, subscribeLeaderboard, todaysTop } from '../game/leaderboard';
import { isMobileDevice } from '../device';
import type { SpeechManager } from '../engine/manager';
import { updateSettings, useSettings } from '../game/settings';
import { Hero } from './Hero';
import { Monster } from './Monster';

const MEDALS = ['🥇', '🥈', '🥉'];
const ORG = 'IEEE ProComm - TEMS Joint Chapter, Kerala Section';

function LogoRow({ text, size, delay, cls }: { text: string; size: string; delay: number; cls: string }) {
  return (
    <div className="logo-row" aria-label={text}>
      {text.split('').map((ch, i) => (
        <motion.span
          key={i}
          className={`logo-letter ${i % 2 ? 'l-b' : 'l-a'} ${cls}`}
          style={{ fontSize: size }}
          initial={{ y: '-18rem', opacity: 0, scale: 0.4, rotate: -30 + i * 10 }}
          animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 11, delay: delay + i * 0.09 }}
        >
          <span className="logo-float" style={{ animationDelay: `${1.5 + i * 0.12}s` }}>{ch}</span>
        </motion.span>
      ))}
    </div>
  );
}

function OfflinePackButton({ manager }: { manager: SpeechManager }) {
  const settings = useSettings();
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  if (!isMobileDevice()) return null;
  if (settings.voskOptIn && state !== 'loading') return <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Offline voice pack ready</div>;
  return (
    <button
      className="pack-btn"
      disabled={state === 'loading'}
      onClick={() => {
        setState('loading');
        manager.downloadOfflinePack().then(() => { updateSettings({ voskOptIn: true }); setState('idle'); }).catch(() => setState('error'));
      }}
    >
      {state === 'loading' ? 'Downloading voice pack...' : state === 'error' ? 'Download failed - tap to retry' : 'Download offline voice pack (40MB)'}
    </button>
  );
}

export function TitleScreen({ onStart, manager }: { onStart: () => void; manager: SpeechManager }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  const [entries, setEntries] = useState(getLeaderboard);
  useEffect(() => subscribeLeaderboard(() => setEntries(getLeaderboard())), []);
  const top = todaysTop(entries);

  return (
    <div className="screen title-screen" style={{ justifyContent: 'space-between' }}>
      <div className="logo logo-glitch" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <LogoRow text="MUMBLE" size="min(3.1rem, 11vw)" delay={0.1} cls="" />
        <LogoRow text="MONSTER" size="min(3.5rem, 12.5vw)" delay={0.7} cls="" />
      </div>

      <div className="title-mid">
        <motion.div initial={{ x: '-10rem', opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 90, damping: 11, delay: 1.1 }}>
          <Hero photo={null} showName={false} size="min(9rem, 24vw)" />
        </motion.div>
        <div className="pixel" aria-hidden="true" style={{ fontSize: '1.6rem', color: 'var(--pink)', WebkitTextStroke: '0.12rem var(--plum)', paintOrder: 'stroke fill' }}>VS</div>
        <motion.div initial={{ y: '14rem', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 90, damping: 11, delay: 1.3 }}>
          <Monster mood="smug" size="min(12rem, 32vw)" />
        </motion.div>
        <motion.div
          className="panel title-board"
          initial={{ x: 120, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 100, damping: 14, delay: 1.5 }}
          style={{ textAlign: 'left', borderColor: 'var(--pink)', padding: '0.7rem 1.4rem' }}
        >
          <div className="pixel" style={{ color: '#e63a86', fontSize: '1rem', marginBottom: '0.7rem' }}>
            TODAY&apos;S TOP 5
          </div>
          {top.length === 0 && <div style={{ fontSize: '1.6rem' }}>Be the first to beat me!</div>}
          {top.map((e, i) => (
            <div key={e.date} className={`lb-row ${i < 3 ? 'top' : ''}`}>
              <span className="lb-rank" style={{ fontSize: i < 3 ? '1.8rem' : '1.4rem', color: 'var(--plum)' }}>{i < 3 ? MEDALS[i] : `${i + 1}.`}</span>
              <span className="lb-name">{e.name}</span>
              <span className="pixel" style={{ color: '#e63a86', fontSize: '1.2rem' }}>{e.score}</span>
            </div>
          ))}
        </motion.div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.7rem' }}>
        <motion.button style={{ marginBottom: '0.3rem', fontSize: '1.9rem', padding: '0.9rem 2.4rem', minHeight: '3.6rem' }} className="big-btn" onClick={onStart} animate={{ scale: [1, 1.07, 1] }} transition={{ duration: 1, repeat: Infinity }}>
          START
        </motion.button>
        <div className="pixel press-start" style={{ fontSize: '0.75rem', color: 'var(--plum)', textAlign: 'center', padding: '0 0.5rem' }}>{isMobileDevice() ? 'TAP START - READ THE LINES LOUD!' : 'PRESS SPACE / TAP TO PLAY - READ THE LINES LOUD!'}</div>
        <OfflinePackButton manager={manager} />
        <div className="credit-badge">
          <span className="by">PRESENTED BY</span>
          <span className="org">{ORG}</span>
        </div>
      </div>
    </div>
  );
}
