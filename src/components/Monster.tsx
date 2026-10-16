import { animate, motion, useMotionValue, useTransform, type MotionValue, type TargetAndTransition } from 'framer-motion';
import { useEffect, useState } from 'react';
import { mic } from '../audio/mic';

export type Mood = 'smug' | 'hurt' | 'panicking' | 'laughing' | 'defeated';

const BODY = 'M200 40 C290 40 360 110 365 200 C370 270 340 330 300 350 C270 370 130 370 100 350 C60 330 30 270 35 200 C40 110 110 40 200 40 Z';

const MOOD_ANIM: Record<Mood, TargetAndTransition> = {
  smug: { y: [0, -14, 0], rotate: [-1.5, 1.5, -1.5], scaleY: [1, 1.03, 0.98, 1], transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } },
  hurt: { x: [0, -26, 22, -16, 10, 0], rotate: [0, -10, 8, -5, 0], scaleX: [1, 0.85, 1.12, 1], scaleY: [1, 1.15, 0.9, 1], transition: { duration: 0.5, repeat: 4 } },
  panicking: { x: [-7, 7, -7], y: [0, -10, 0], transition: { duration: 0.12, repeat: Infinity } },
  laughing: { y: [0, -34, 0], scaleY: [1, 0.86, 1.06, 1], rotate: [-3, 3, -3], transition: { duration: 0.38, repeat: Infinity } },
  defeated: { rotate: 12, y: 40, scale: 0.9, opacity: 0.85, transition: { duration: 0.8 } },
};

const AURA: Record<Mood, string> = {
  smug: '#ff9fcb', hurt: '#ffd23f', panicking: '#ff4d6d', laughing: '#3ddc97', defeated: '#b9a9d6',
};

function Eye({ cx, mood, lookX, lookY, blink }: { cx: number; mood: Mood; lookX: MotionValue<number>; lookY: MotionValue<number>; blink: boolean }) {
  const px = useTransform(lookX, (v) => v * 9);
  const py = useTransform(lookY, (v) => v * 7);
  if (mood === 'defeated') {
    return (
      <g stroke="#2b1b3f" strokeWidth="9" strokeLinecap="round">
        <line x1={cx - 16} y1="150" x2={cx + 16} y2="182" />
        <line x1={cx + 16} y1="150" x2={cx - 16} y2="182" />
      </g>
    );
  }
  if (mood === 'laughing' || mood === 'hurt') {
    return <path d={`M${cx - 22} 175 Q${cx} ${mood === 'laughing' ? 145 : 195} ${cx + 22} 175`} stroke="#2b1b3f" strokeWidth="9" fill="none" strokeLinecap="round" />;
  }
  const big = mood === 'panicking';
  const ry = blink ? 3 : big ? 40 : 33;
  return (
    <g>
      <ellipse cx={cx} cy="165" rx={big ? 33 : 27} ry={ry} fill="#fff" stroke="#2b1b3f" strokeWidth="4" />
      {!blink && (
        <motion.g style={{ x: px, y: py }}>
          <circle cx={cx} cy={mood === 'smug' ? 170 : 165} r={big ? 9 : 15} fill="#2b1b3f" />
          <circle cx={cx - 5} cy={mood === 'smug' ? 164 : 159} r={big ? 3 : 5} fill="#fff" />
        </motion.g>
      )}
      {mood === 'smug' && <rect x={cx - 33} y="128" width="66" height="26" fill="#a96bff" stroke="#2b1b3f" strokeWidth="3" />}
    </g>
  );
}

function Mouth({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'laughing':
      return (
        <g>
          <path d="M130 225 Q200 330 270 225 Z" fill="#2b1b3f" stroke="#2b1b3f" strokeWidth="6" strokeLinejoin="round" />
          <path d="M165 268 Q200 310 235 268 Q200 252 165 268Z" fill="#ff5c8a" />
          <path d="M145 228 L255 228" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
        </g>
      );
    case 'hurt':
      return <ellipse cx="200" cy="260" rx="26" ry="36" fill="#2b1b3f" />;
    case 'panicking':
      return <path d="M140 270 Q160 240 180 270 Q200 240 220 270 Q240 240 260 270" stroke="#2b1b3f" strokeWidth="9" fill="none" strokeLinecap="round" />;
    case 'defeated':
      return (
        <g>
          <path d="M150 275 Q200 235 250 275" stroke="#2b1b3f" strokeWidth="9" fill="none" strokeLinecap="round" />
          <path d="M255 265 Q262 295 250 300 Q238 295 247 268" fill="#19f0ff" />
        </g>
      );
    default:
      return (
        <g>
          <path d="M140 240 Q200 300 270 225" stroke="#2b1b3f" strokeWidth="9" fill="none" strokeLinecap="round" />
          <path d="M235 250 L245 270 L255 245Z" fill="#fff" />
        </g>
      );
  }
}

const SPARKLES = [[60, 90, 0], [340, 80, 0.2], [30, 250, 0.4], [370, 260, 0.1], [200, 10, 0.3], [90, 330, 0.5], [320, 330, 0.35]];

export function Monster({ mood, size = '34rem' }: { mood: Mood; size?: string }) {
  const level = useMotionValue(0);
  useEffect(() => mic.subscribe((l) => level.set(l)), [level]);
  const scaleX = useTransform(level, [0, 100], [1, 1.14]);
  const scaleY = useTransform(level, [0, 100], [1, 0.88]);
  const auraOpacity = useTransform(level, [0, 100], [0.35, 0.95]);
  const auraScale = useTransform(level, [0, 100], [1, 1.35]);

  // Pupils follow the pointer; drift lazily until the pointer moves.
  const lookX = useMotionValue(0);
  const lookY = useMotionValue(0);
  useEffect(() => {
    let idle = animate(lookX, [-0.8, 0.8, -0.3, 0.6, -0.8], { duration: 9, repeat: Infinity, ease: 'easeInOut' });
    const onMove = (e: PointerEvent) => {
      idle.stop();
      lookX.set((e.clientX / window.innerWidth - 0.5) * 2);
      lookY.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener('pointermove', onMove);
    return () => { idle.stop(); window.removeEventListener('pointermove', onMove); };
  }, [lookX, lookY]);

  const [blink, setBlink] = useState(false);
  useEffect(() => {
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true);
        t = window.setTimeout(() => { setBlink(false); loop(); }, 130);
      }, 1800 + Math.random() * 3200);
    };
    loop();
    return () => window.clearTimeout(t);
  }, []);

  return (
    <motion.div style={{ width: size, height: size, scaleX, scaleY, originY: 1, position: 'relative' }}>
      <motion.div
        aria-hidden
        style={{
          position: 'absolute', inset: '-12%', borderRadius: '50%', opacity: auraOpacity, scale: auraScale,
          background: `radial-gradient(circle, ${AURA[mood]} 0%, transparent 65%)`, filter: 'blur(1.4rem)', transition: 'background 0.3s',
        }}
      />
      <motion.div key={mood} animate={MOOD_ANIM[mood]} style={{ width: '100%', height: '100%', position: 'relative' }}>
        <motion.svg viewBox="0 0 400 400" width="100%" height="100%" style={{ overflow: 'visible' }}>
          <defs>
            <radialGradient id="jelly" cx="40%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#ffc2e0" />
              <stop offset="50%" stopColor="#ff5fa2" />
              <stop offset="100%" stopColor="#a96bff" />
            </radialGradient>
            <filter id="neon" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="10" stdDeviation="6" floodColor="#2b1b3f" floodOpacity="0.3" />
            </filter>
          </defs>
          {/* feet */}
          <ellipse cx="140" cy="366" rx="40" ry="16" fill="#a96bff" stroke="#2b1b3f" strokeWidth="6" />
          <ellipse cx="260" cy="366" rx="40" ry="16" fill="#a96bff" stroke="#2b1b3f" strokeWidth="6" />
          {/* arms: up when gloating, flailing when scared */}
          <motion.g animate={mood === 'laughing' ? { rotate: [-18, 18, -18] } : mood === 'panicking' ? { rotate: [-25, 25, -25] } : { rotate: 0 }} transition={{ duration: 0.3, repeat: Infinity }} style={{ transformOrigin: '45px 260px' }}>
            <path d={mood === 'laughing' ? 'M45 260 Q-5 200 10 150' : 'M45 260 Q5 290 8 320'} stroke="#ff5fa2" strokeWidth="26" strokeLinecap="round" fill="none" />
          </motion.g>
          <motion.g animate={mood === 'laughing' ? { rotate: [18, -18, 18] } : mood === 'panicking' ? { rotate: [25, -25, 25] } : { rotate: 0 }} transition={{ duration: 0.3, repeat: Infinity }} style={{ transformOrigin: '355px 260px' }}>
            <path d={mood === 'laughing' ? 'M355 260 Q405 200 390 150' : 'M355 260 Q395 290 392 320'} stroke="#ff5fa2" strokeWidth="26" strokeLinecap="round" fill="none" />
          </motion.g>
          <g filter="url(#neon)">
            <path d="M130 50 Q110 10 80 20 M270 50 Q290 10 320 20" stroke="#2b1b3f" strokeWidth="9" fill="none" strokeLinecap="round" />
            <motion.circle cx="80" cy="20" r="12" fill="#ffd23f" stroke="#2b1b3f" strokeWidth="5" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1, repeat: Infinity }} />
            <motion.circle cx="320" cy="20" r="12" fill="#ffd23f" stroke="#2b1b3f" strokeWidth="5" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1, repeat: Infinity }} />
            <path d={BODY} fill="url(#jelly)" stroke="#2b1b3f" strokeWidth="9" />
          </g>
          <ellipse cx="120" cy="100" rx="45" ry="22" fill="#fff" opacity="0.35" transform="rotate(-30 120 100)" />
          <ellipse cx="200" cy="300" rx="85" ry="42" fill="#ffc6f6" opacity="0.18" />
          <circle cx="105" cy="235" r="20" fill="#ff4d6d" opacity="0.45" />
          <circle cx="295" cy="235" r="20" fill="#ff4d6d" opacity="0.45" />
          <Eye cx={140} mood={mood} lookX={lookX} lookY={lookY} blink={blink} />
          <Eye cx={260} mood={mood} lookX={lookX} lookY={lookY} blink={blink} />
          {mood === 'panicking' && <path d="M105 125 L165 145 M295 125 L235 145" stroke="#2b1b3f" strokeWidth="9" strokeLinecap="round" />}
          <Mouth mood={mood} />
          {mood === 'panicking' && (
            <g fill="#5bc0ff">
              <motion.path d="M350 120 Q362 145 350 150 Q338 145 350 120Z" animate={{ y: [0, 30], opacity: [1, 0] }} transition={{ duration: 0.6, repeat: Infinity }} />
              <motion.path d="M50 130 Q62 155 50 160 Q38 155 50 130Z" animate={{ y: [0, 30], opacity: [1, 0] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }} />
            </g>
          )}
          {mood === 'hurt' && (
            <motion.path key="flash" d={BODY} fill="#fff" initial={{ opacity: 0.95 }} animate={{ opacity: 0 }} transition={{ duration: 0.45 }} />
          )}
          {mood === 'hurt' && (
            <g stroke="#ff9a3d" strokeWidth="8" strokeLinecap="round">
              <motion.path d="M195 10 L205 -20 M120 20 L100 -5 M280 20 L300 -5" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.8 }} />
            </g>
          )}
          {mood === 'laughing' && SPARKLES.map(([x, y, d], i) => (
            <motion.path
              key={i}
              d="M0 -16 Q2 -2 16 0 Q2 2 0 16 Q-2 2 -16 0 Q-2 -2 0 -16Z"
              fill={i % 2 ? '#ffd23f' : '#5bc0ff'}
              style={{ x, y }}
              animate={{ scale: [0, 1.4, 0], rotate: [0, 90] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: d }}
            />
          ))}
        </motion.svg>
      </motion.div>
    </motion.div>
  );
}
