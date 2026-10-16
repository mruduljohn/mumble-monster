import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { DEFEAT_TAUNT } from '../content/taunts';
import { FACTS } from '../content/facts';
import { pick } from '../game/deck';
import { pickTitle } from '../game/scoring';
import type { GameSummary } from '../game/types';
import { Hero } from './Hero';
import { Monster } from './Monster';

const AUTO_RETURN_SECONDS = 20;
const ORG = 'IEEE ProComm - TEMS Joint Chapter, Kerala Section';

/** Eased count from 0 to `target` over `ms`, after `delay` ms. */
function useCountUp(target: number, ms = 1400, delay = 0): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const t0 = window.setTimeout(() => {
      const tick = (now: number) => {
        start ||= now;
        const k = Math.min(1, (now - start) / ms);
        setV(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { window.clearTimeout(t0); cancelAnimationFrame(raf); };
  }, [target, ms, delay]);
  return v;
}

function Star({ on, i }: { on: boolean; i: number }) {
  return (
    <motion.svg
      viewBox="0 0 24 24" width="2.1rem"
      initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 10, delay: 1.2 + i * 0.18 }}
      style={{ filter: on ? 'drop-shadow(0 0.15rem 0 #2b1b3f)' : 'none' }}
    >
      <path d="M12 1.5l3 7 7.5.6-5.7 4.9 1.8 7.4L12 17.4 5.4 21.4l1.8-7.4L1.5 9.1 9 8.5z" fill={on ? '#ffd23f' : 'rgba(43,27,63,0.12)'} stroke={on ? '#2b1b3f' : 'rgba(43,27,63,0.4)'} strokeWidth="1.2" strokeLinejoin="round" />
    </motion.svg>
  );
}

function Stat({ label, value, text, color, pct, delay }: { label: string; value: number; text: (v: number) => string; color: string; pct: number; delay: number }) {
  const v = useCountUp(value, 1300, delay);
  return (
    <div style={{ marginBottom: '0.25rem' }}>
      <div className="stat-row">
        <span style={{ opacity: 0.9 }}>{label}</span>
        <span className="pixel" style={{ color: 'var(--plum)', fontSize: '1.3rem' }}>{text(v)}</span>
      </div>
      <div className="stat-bar">
        <div style={{ width: `${Math.min(100, (pct * v) / (value || 1))}%`, height: '100%', background: color, boxShadow: 'none' }} />
      </div>
    </div>
  );
}

export function ResultsScreen({ summary, photo, onDone }: { summary: GameSummary; photo: string | null; onDone: () => void }) {
  const [left, setLeft] = useState(AUTO_RETURN_SECONDS);
  const fact = useMemo(() => pick(FACTS), []);
  const title = pickTitle(summary);
  const stars = Math.max(1, Math.min(5, Math.round(1 + summary.avgClarity * 2 + (summary.peakLoudness / 100) * 1.2 + (summary.won ? 0.8 : 0))));
  const score = useCountUp(summary.score, 1600, 300);

  useEffect(() => {
    const id = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (left <= 0) onDone();
  }, [left, onDone]);

  return (
    <div className="screen results-screen" style={{ gap: '0.6rem' }}>
      <motion.h2
        className="neon-title" style={{ fontSize: '2rem' }}
        initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 10 }}
      >
        {summary.won ? 'YOU WIN!' : 'MONSTER WINS...'}
      </motion.h2>

      <motion.div
        className="comm-card"
        initial={{ y: 300, rotate: 8, opacity: 0 }} animate={{ y: 0, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 90, damping: 13 }}
        style={{ width: 'min(50rem, 100%)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span className="pixel" style={{ fontSize: '0.75rem', color: '#e63a86' }}>COMMUNICATOR CARD</span>
          <span className="pixel" style={{ fontSize: '0.6rem', color: '#1d86c4' }}>{summary.won ? 'MONSTER SLAYER' : 'CHALLENGER'}</span>
        </div>
        <div className="comm-body">
          <div className="comm-hero" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '1rem', background: 'radial-gradient(circle at 50% 40%, #ffe3f1, #cfeaff)', border: '0.2rem solid var(--plum)', padding: '0.6rem 0.4rem 0.8rem', gap: '0.6rem' }}>
            <Hero photo={photo} showName={false} pose={summary.won ? 'victory' : 'defeat'} size="min(9rem, 26vw)" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Monster mood={summary.won ? 'defeated' : 'laughing'} size="2.6rem" />
              <div className="pixel" style={{ fontSize: '0.5rem', color: 'var(--plum)' }}>
                {summary.won ? 'MONSTER DEFEATED' : 'MONSTER STANDING'}
              </div>
            </div>
          </div>
          <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
            <div style={{ fontSize: '1.9rem', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary.name}</div>
            <div className="pixel" style={{ color: '#7a3fd6', fontSize: '0.95rem', margin: '0.3rem 0', textShadow: '0 0.15rem 0 rgba(43,27,63,0.3)', lineHeight: 1.4 }}>{title}</div>
            <div className="pixel" style={{ fontSize: '2rem', color: '#e63a86', margin: '0.5rem 0 0.4rem', textShadow: '0 0.15rem 0 rgba(43,27,63,0.3)' }}>{Math.round(score)}</div>
            <Stat label="Clarity" value={Math.round(summary.avgClarity * 100)} text={(v) => `${Math.round(v)}%`} color="#5bc0ff" pct={Math.round(summary.avgClarity * 100)} delay={500} />
            <Stat label="Peak loudness" value={Math.round(summary.peakLoudness)} text={(v) => `${Math.round(v)}`} color="#ff5fa2" pct={Math.round(summary.peakLoudness)} delay={700} />
            <Stat label="Best combo" value={summary.bestStreak} text={(v) => `x${Math.round(v)}`} color="#ffd23f" pct={Math.min(100, summary.bestStreak * 20)} delay={900} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', margin: '0.3rem 0 0.3rem' }}>
          {[0, 1, 2, 3, 4].map((i) => <Star key={i} i={i} on={i < stars} />)}
        </div>
        <div style={{ background: '#ffffff', border: '0.15rem dashed var(--plum)', borderRadius: '0.9rem', padding: '0.5rem 1rem', fontSize: '1.05rem', lineHeight: 1.2, textAlign: 'left' }}>
          <span style={{ color: '#e63a86' }}>Did you know? </span>{fact}
        </div>
        {!summary.won && <div style={{ fontSize: '1.1rem', color: 'var(--pink)', marginTop: '0.3rem' }}>{DEFEAT_TAUNT}</div>}
        <div className="comm-org" style={{ marginTop: '0.55rem', paddingTop: '0.4rem', borderTop: '0.12rem solid rgba(43,27,63,0.35)', fontSize: '0.95rem', color: 'var(--plum)' }}>
          <span className="pixel" style={{ fontSize: '0.5rem', color: '#e63a86', marginRight: '0.6rem' }}>PRESENTED BY</span>{ORG}
        </div>
      </motion.div>

      <button className="big-btn alt" style={{ fontSize: '1.4rem', padding: '0.8rem 2rem', minHeight: 'max(3.2rem, 48px)' }} onClick={onDone}>
        PLAY AGAIN ({left})
      </button>
    </div>
  );
}
