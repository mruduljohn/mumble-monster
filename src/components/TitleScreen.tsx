import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { getLeaderboard, subscribeLeaderboard, todaysTop } from '../game/leaderboard';
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

export function TitleScreen({ onStart }: { onStart: () => void }) {
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
    <div className="screen" style={{ justifyContent: 'space-between', paddingTop: '1.2rem', paddingBottom: '0.8rem' }}>
      <div className="logo logo-glitch" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <LogoRow text="MUMBLE" size="3.1rem" delay={0.1} cls="" />
        <LogoRow text="MONSTER" size="3.5rem" delay={0.7} cls="" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', width: '100%', justifyContent: 'center' }}>
        <motion.div initial={{ x: '-10rem', opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 90, damping: 11, delay: 1.1 }}>
          <Hero photo={null} showName={false} size="9rem" />
        </motion.div>
        <div className="pixel" aria-hidden="true" style={{ fontSize: '1.6rem', color: 'var(--pink)', WebkitTextStroke: '0.12rem var(--plum)', paintOrder: 'stroke fill' }}>VS</div>
        <motion.div initial={{ y: '14rem', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 90, damping: 11, delay: 1.3 }}>
          <Monster mood="smug" size="12rem" />
        </motion.div>
        <motion.div
          className="panel"
          initial={{ x: 120, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 100, damping: 14, delay: 1.5 }}
          style={{ minWidth: '25rem', textAlign: 'left', borderColor: 'var(--pink)', padding: '0.7rem 1.4rem' }}
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
        <div className="pixel press-start" style={{ fontSize: '0.75rem', color: 'var(--plum)' }}>PRESS SPACE / TAP TO PLAY - READ THE LINES LOUD!</div>
        <div className="credit-badge">
          <span className="by">PRESENTED BY</span>
          <span className="org">{ORG}</span>
        </div>
      </div>
    </div>
  );
}
