import { motion, useMotionValue, useTransform, type TargetAndTransition } from 'framer-motion';
import { useEffect, useId } from 'react';
import { mic } from '../audio/mic';

export type HeroPose = 'idle' | 'charging' | 'attack' | 'dizzy' | 'victory' | 'defeat';

// PRIVACY: `photo` is an in-memory data URL passed down from App state. Never persist it.
interface HeroProps {
  photo: string | null;
  name?: string;
  pose?: HeroPose;
  combo?: boolean;
  /** Rendered height of the figure (CSS length). */
  size?: string;
  showName?: boolean;
}

const BODY_ANIM: Record<HeroPose, TargetAndTransition> = {
  idle: { y: [0, -8, 0], x: 0, rotate: 0, scaleY: [1, 1.02, 0.99, 1], transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } },
  charging: { y: [0, -3, 0], x: 0, rotate: [-1, 1, -1], transition: { duration: 0.25, repeat: Infinity } },
  attack: { x: [0, 70, 70, 0], y: [0, -6, 0, 0], rotate: [0, 6, 6, 0], transition: { duration: 0.9, times: [0, 0.2, 0.6, 1] } },
  dizzy: { x: 0, y: 0, rotate: [-7, 7, -7], transition: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } },
  victory: { x: 0, y: [0, -50, 0, -50, 0], rotate: 0, transition: { duration: 1.4, repeat: Infinity, ease: 'easeOut' } },
  defeat: { x: 0, y: 14, rotate: -9, scaleY: 0.93, transition: { duration: 0.8 } },
};

function DefaultFace({ pose }: { pose: HeroPose }) {
  const sad = pose === 'defeat';
  const happy = pose === 'victory' || pose === 'attack';
  const dizzy = pose === 'dizzy';
  return (
    <g>
      <rect x="40" y="30" width="120" height="120" fill="#ffe0c2" />
      <circle cx="68" cy="100" r="8" fill="#ff9fcb" opacity="0.7" />
      <circle cx="132" cy="100" r="8" fill="#ff9fcb" opacity="0.7" />
      {dizzy ? (
        [78, 122].map((cx) => <path key={cx} d={`M${cx - 9} 82 a9 9 0 1 1 9 9 a4 4 0 1 1 -4 -4`} fill="none" stroke="#2b1b3f" strokeWidth="3.5" strokeLinecap="round" />)
      ) : happy ? (
        [78, 122].map((cx) => <path key={cx} d={`M${cx - 10} 86 Q${cx} 72 ${cx + 10} 86`} fill="none" stroke="#2b1b3f" strokeWidth="5" strokeLinecap="round" />)
      ) : (
        [78, 122].map((cx) => (
          <g key={cx}>
            <ellipse cx={cx} cy="82" rx="10" ry={sad ? 8 : 12} fill="#fff" stroke="#2b1b3f" strokeWidth="3" />
            <circle cx={cx + 2} cy={sad ? 85 : 84} r="6" fill="#2b1b3f" />
            <circle cx={cx} cy="80" r="2.2" fill="#fff" />
          </g>
        ))
      )}
      {sad || dizzy ? (
        <path d="M84 118 Q100 106 116 118" fill="none" stroke="#2b1b3f" strokeWidth="5" strokeLinecap="round" />
      ) : (
        <path d="M82 108 Q100 128 118 108 Z" fill="#fff" stroke="#2b1b3f" strokeWidth="4" strokeLinejoin="round" />
      )}
    </g>
  );
}

function Sparkle({ x, y, d }: { x: number; y: number; d: number }) {
  return (
    <motion.path
      d={`M${x} ${y - 9} L${x + 3} ${y - 3} L${x + 9} ${y} L${x + 3} ${y + 3} L${x} ${y + 9} L${x - 3} ${y + 3} L${x - 9} ${y} L${x - 3} ${y - 3}Z`}
      fill="#ffd23f" stroke="#2b1b3f" strokeWidth="1.5"
      animate={{ scale: [0, 1.2, 0], rotate: [0, 90, 180] }} transition={{ duration: 1.1, repeat: Infinity, delay: d }}
      style={{ originX: 0.5, originY: 0.5 }}
    />
  );
}

export function Hero({ photo, name, pose = 'idle', combo = false, size = '10.5rem', showName = true }: HeroProps) {
  const uid = useId().replace(/:/g, '');
  const clipId = `hero-face-${uid}`;
  const level = useMotionValue(0);
  useEffect(() => (pose === 'charging' ? mic.subscribe((l) => level.set(l)) : () => level.set(0)), [pose, level]);
  const micScale = useTransform(level, [0, 100], [1, 1.35]);
  const micShake = useTransform(level, [0, 100], [0, 5]);
  const glow = useTransform(level, [0, 100], [0.35, 1]);

  const dizzy = pose === 'dizzy';
  const capeAnim: TargetAndTransition = combo
    ? { rotate: [-14, 10, -14], skewY: [-6, 6, -6], transition: { duration: 0.28, repeat: Infinity } }
    : pose === 'victory' ? { rotate: [-6, 6, -6], transition: { duration: 0.5, repeat: Infinity } }
    : pose === 'defeat' ? { rotate: 8, transition: { duration: 0.6 } }
    : { rotate: [-3, 3, -3], transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' } };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }} data-testid="hero" data-pose={pose}>
      <motion.div animate={BODY_ANIM[pose]} key={pose} style={{ position: 'relative', height: size, aspectRatio: '200 / 250' }}>
        {(pose === 'charging' || combo) && (
          <motion.div
            style={{
              position: 'absolute', inset: '8% -10% 0', borderRadius: '50%', zIndex: 0, filter: 'blur(0.6rem)', opacity: pose === 'charging' ? glow : 0.9,
              background: combo ? 'radial-gradient(circle, #ffd23f 0%, #ff9a3d 45%, transparent 72%)' : 'radial-gradient(circle, #5bc0ff 0%, #ff5fa2 50%, transparent 72%)',
            }}
            animate={combo ? { scale: [1, 1.12, 0.95, 1.1, 1] } : undefined} transition={{ duration: 0.45, repeat: Infinity }}
          />
        )}
        <svg viewBox="0 0 200 250" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'visible', zIndex: 1 }} aria-hidden="true">
          <defs>
            <clipPath id={clipId}><circle cx="100" cy="82" r="48" /></clipPath>
          </defs>
          {/* cape (behind) */}
          <motion.path
            d="M82 118 C60 140 40 190 32 226 C60 214 78 224 100 214 L116 128 Z"
            fill="#ff5fa2" stroke="#2b1b3f" strokeWidth="4" strokeLinejoin="round" animate={capeAnim} style={{ originX: 0.95, originY: 0.05 }}
          />
          {combo && [0, 1, 2].map((i) => (
            <motion.path key={i} d={`M${60 - i * 10} ${200 - i * 18} q-10 -18 0 -34 q4 14 12 16 q-2 10 -12 18z`} fill={i % 2 ? '#ffd23f' : '#ff9a3d'}
              animate={{ y: [0, -14, 0], opacity: [1, 0.4, 1] }} transition={{ duration: 0.4, repeat: Infinity, delay: i * 0.1 }} />
          ))}
          {/* legs + boots */}
          <rect x="82" y="188" width="14" height="38" rx="6" fill="#a96bff" stroke="#2b1b3f" strokeWidth="4" />
          <rect x="106" y="188" width="14" height="38" rx="6" fill="#a96bff" stroke="#2b1b3f" strokeWidth="4" />
          <path d="M76 226 h24 v10 a6 6 0 0 1 -6 6 h-12 a6 6 0 0 1 -6 -6z M104 226 h26 v10 a6 6 0 0 1 -6 6 h-14 a6 6 0 0 1 -6 -6z" fill="#ffd23f" stroke="#2b1b3f" strokeWidth="4" strokeLinejoin="round" />
          {/* torso */}
          <path d="M78 132 Q100 122 124 132 L128 196 Q101 208 76 196Z" fill="#5bc0ff" stroke="#2b1b3f" strokeWidth="4" strokeLinejoin="round" />
          <path d="M76 184 Q101 196 128 184 L128 196 Q101 208 76 196Z" fill="#ffd23f" stroke="#2b1b3f" strokeWidth="3" />
          <path d="M102 146 l5 10 11 1 -8 7 3 11 -11 -6 -11 6 3 -11 -8 -7 11 -1z" fill="#ffd23f" stroke="#2b1b3f" strokeWidth="2.5" strokeLinejoin="round" />
          {/* back arm */}
          <path d="M80 140 Q64 156 70 176" fill="none" stroke="#2b1b3f" strokeWidth="13" strokeLinecap="round" />
          <path d="M80 140 Q64 156 70 176" fill="none" stroke="#5bc0ff" strokeWidth="7" strokeLinecap="round" />
          {/* megaphone blaster + front arm */}
          <motion.g style={{ scale: micScale, x: micShake, originX: 0.2, originY: 0.5 }}>
            <path d="M122 142 Q140 150 142 166" fill="none" stroke="#2b1b3f" strokeWidth="13" strokeLinecap="round" />
            <path d="M122 142 Q140 150 142 166" fill="none" stroke="#5bc0ff" strokeWidth="7" strokeLinecap="round" />
            <path d="M136 156 L150 154 L186 134 Q194 156 186 178 L150 166 L136 168Z" fill="#ffd23f" stroke="#2b1b3f" strokeWidth="4" strokeLinejoin="round" />
            <ellipse cx="188" cy="156" rx="6" ry="22" fill="#ff5fa2" stroke="#2b1b3f" strokeWidth="4" />
            <circle cx="142" cy="162" r="8" fill="#ffe0c2" stroke="#2b1b3f" strokeWidth="3" />
          </motion.g>
          {/* head */}
          <circle cx="100" cy="82" r="52" fill="#fff" stroke="#2b1b3f" strokeWidth="5" />
          <g clipPath={`url(#${clipId})`}>
            <rect x="48" y="30" width="104" height="104" fill="#ffe0c2" />
            {photo ? <image href={photo} x="52" y="34" width="96" height="96" preserveAspectRatio="xMidYMid slice" /> : <DefaultFace pose={pose} />}
            {/* helmet dome + visor band */}
            <rect x="48" y="30" width="104" height="22" fill="#ff5fa2" />
            <rect x="48" y="52" width="104" height="8" fill="#ffd23f" />
            <rect x="48" y="50" width="104" height="2.5" fill="#2b1b3f" />
            <rect x="48" y="60" width="104" height="2.5" fill="#2b1b3f" />
          </g>
          <circle cx="100" cy="82" r="48" fill="none" stroke="#2b1b3f" strokeWidth="3" />
          <circle cx="50" cy="84" r="9" fill="#5bc0ff" stroke="#2b1b3f" strokeWidth="4" />
          <circle cx="150" cy="84" r="9" fill="#5bc0ff" stroke="#2b1b3f" strokeWidth="4" />
          <path d="M100 18 l5 10 11 1 -8 7 3 11 -11 -6 -11 6 3 -11 -8 -7 11 -1z" fill="#ffd23f" stroke="#2b1b3f" strokeWidth="2.5" strokeLinejoin="round" transform="translate(0 -4)" />
          {/* state overlays */}
          {dizzy && (
            <g>
              {[70, 100, 130].map((x, i) => (
                <motion.text key={x} x={x} y="26" fontSize="18" textAnchor="middle" animate={{ y: [26, 20, 26], rotate: [0, 40, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}>
                  {i === 1 ? '★' : '✶'}
                </motion.text>
              ))}
              <motion.path d="M146 62 q-8 14 0 18 q8 -4 0 -18z" fill="#5bc0ff" stroke="#2b1b3f" strokeWidth="2" animate={{ y: [0, 22], opacity: [1, 0] }} transition={{ duration: 0.9, repeat: Infinity }} />
              <motion.path d="M54 70 q-8 14 0 18 q8 -4 0 -18z" fill="#5bc0ff" stroke="#2b1b3f" strokeWidth="2" animate={{ y: [0, 22], opacity: [1, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: 0.4 }} />
            </g>
          )}
          {pose === 'victory' && (
            <g>
              <Sparkle x={34} y={40} d={0} /><Sparkle x={168} y={34} d={0.3} /><Sparkle x={24} y={140} d={0.6} /><Sparkle x={178} y={120} d={0.15} /><Sparkle x={100} y={4} d={0.45} />
              {/* flexing arm */}
              <path d="M80 140 Q58 128 62 106" fill="none" stroke="#2b1b3f" strokeWidth="13" strokeLinecap="round" />
              <path d="M80 140 Q58 128 62 106" fill="none" stroke="#5bc0ff" strokeWidth="7" strokeLinecap="round" />
              <circle cx="62" cy="104" r="9" fill="#ffe0c2" stroke="#2b1b3f" strokeWidth="3" />
            </g>
          )}
        </svg>
      </motion.div>
      {showName && name && (
        <div className="pixel" style={{ marginTop: '0.3rem', padding: '0.15rem 0.7rem', fontSize: '0.6rem', background: '#fff', border: '0.15rem solid var(--plum)', borderRadius: '0.7rem', boxShadow: '0 0.15rem 0 var(--plum)', maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
      )}
    </div>
  );
}
