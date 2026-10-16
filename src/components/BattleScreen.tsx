import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { duckMusic, sfx } from '../audio/sfx';
import { mic } from '../audio/mic';
import { ENTRANCE_TAUNTS, GARBLED_TAUNTS, HEAL_TAUNTS, HIT_CALLOUTS } from '../content/taunts';
import { buildGameLines, pick } from '../game/deck';
import { hitBurst, victoryConfetti } from '../game/effects';
import {
  clarityFromVolume, clarityScore, loudnessScore, MONSTER_MAX_HP, resolveLine, tokenize, VICTORY_BONUS, WORD_MATCH_MIN, wordSimilarity,
  type LineResult,
} from '../game/scoring';
import { getSettings } from '../game/settings';
import type { GameSummary } from '../game/types';
import type { SpeechManager } from '../engine/manager';
import { Hero, type HeroPose } from './Hero';
import { Monster, type Mood } from './Monster';
import { VolumeMeter } from './VolumeMeter';

const WAVES = 5;
const PRE_FINALE_MIN_HP = 10; // monster cannot die before the finishing move
const OVERKILL_POINTS_PER_HP = 10; // absorbed damage becomes bonus score
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Phase = 'intro' | 'countdown' | 'speaking' | 'result' | 'end';

interface Popup { id: number; text: string; color: string }
interface Flash { id: number; color: string; strength: number }

function Flame() {
  return (
    <motion.svg viewBox="0 0 40 56" width="2.6rem" animate={{ scale: [1, 1.2, 0.95, 1.15, 1], y: [0, -3, 0] }} transition={{ duration: 0.5, repeat: Infinity }}>
      <path d="M20 2 C26 16 38 22 36 38 C34 50 26 54 20 54 C10 54 2 46 6 32 C8 26 12 24 12 16 C16 18 18 12 20 2Z" fill="#ff9a3d" />
      <path d="M20 22 C24 30 30 34 28 42 C27 48 23 50 20 50 C15 50 11 46 13 40 C15 34 19 30 20 22Z" fill="#ffd23f" />
    </motion.svg>
  );
}

export function BattleScreen({ manager, name, photo, onFinish }: { manager: SpeechManager; name: string; photo: string | null; onFinish: (s: GameSummary) => void }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [wave, setWave] = useState(0);
  const [line, setLine] = useState('');
  const [hp, setHp] = useState(MONSTER_MAX_HP);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [count, setCount] = useState<number | 'SPEAK!' | null>(null);
  const [timeLeft, setTimeLeft] = useState(1);
  const [transcript, setTranscript] = useState('');
  const [mood, setMood] = useState<Mood>('smug');
  const [callout, setCallout] = useState('');
  const [result, setResult] = useState<LineResult | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [beam, setBeam] = useState<'none' | 'hit' | 'crit' | 'bad'>('none');
  const [shakeKey, setShakeKey] = useState(0);
  const [volumeMode, setVolumeMode] = useState(false);
  const [heard, setHeard] = useState('');
  const [flash, setFlash] = useState<Flash | null>(null);
  const [shakeAmp, setShakeAmp] = useState(1);

  const linesRef = useRef<string[] | null>(null);
  if (!linesRef.current) linesRef.current = buildGameLines(WAVES);

  useEffect(() => {
    const lines = linesRef.current!;
    let cancelled = false;
    let waveOpen = false;
    let sampler: number | undefined;
    const alive = () => !cancelled;

    const run = async () => {
      let hpNow = MONSTER_MAX_HP;
      let streakNow = 0;
      let scoreNow = 0;
      let best = 0;
      const clarities: number[] = [];
      const loudnesses: number[] = [];

      for (let w = 0; w < WAVES; w++) {
        const finale = w === WAVES - 1;
        setWave(w); setLine(lines[w]); setTranscript(''); setHeard(''); setResult(null); setCallout('');
        setCount(null); setMood('smug'); setPhase('intro');
        setCallout(finale ? 'FINISHING MOVE!' : pick(ENTRANCE_TAUNTS));
        await sleep(finale ? 2200 : 1700);
        if (!alive()) return;
        setCallout('');

        // Start the recognizer early so it is warm by the time the player speaks.
        setPhase('countdown');
        waveOpen = true;
        setVolumeMode(manager.getStatus().kind === 'volume');
        manager.beginWave({ onText: (t) => alive() && setTranscript(t), onFatal: () => undefined });
        for (const n of [3, 2, 1]) {
          setCount(n); sfx.tick();
          await sleep(700);
          if (!alive()) return;
        }

        // SPEAK!
        setCount('SPEAK!'); sfx.go();
        manager.clearTranscript();
        setTranscript('');
        duckMusic(true);
        const samples: number[] = [];
        const waveMs = getSettings().waveSeconds * 1000;
        const startedAt = performance.now();
        setPhase('speaking');
        sampler = window.setInterval(() => {
          samples.push(mic.level);
          setTimeLeft(Math.max(0, 1 - (performance.now() - startedAt) / waveMs));
          setVolumeMode(manager.getStatus().kind === 'volume');
          setMood(mic.level > 55 ? 'panicking' : 'smug');
        }, 50);
        await sleep(waveMs);
        window.clearInterval(sampler);
        sampler = undefined;
        if (!alive()) return;
        setCount(null);
        const { text } = await manager.endWave();
        waveOpen = false;
        duckMusic(false);
        if (!alive()) return;

        // Score
        const clarity = text === null ? clarityFromVolume(samples) : clarityScore(lines[w], text);
        const loudness = loudnessScore(samples);
        const r = resolveLine({ clarity, loudness, streak: streakNow, finale });
        streakNow = r.streak;
        best = Math.max(best, streakNow);
        clarities.push(clarity);
        loudnesses.push(loudness);
        scoreNow += r.points;
        hpNow = Math.min(MONSTER_MAX_HP, hpNow - r.damage + r.heal);
        // Damage the pre-finale clamp absorbs is converted into bonus score instead of wasted.
        let overkill = 0;
        if (!finale && hpNow < PRE_FINALE_MIN_HP) {
          overkill = (PRE_FINALE_MIN_HP - hpNow) * OVERKILL_POINTS_PER_HP;
          hpNow = PRE_FINALE_MIN_HP;
          scoreNow += overkill;
        }
        hpNow = Math.max(0, hpNow);

        setResult(r); setHeard(text ?? ''); setHp(hpNow); setScore(scoreNow); setStreak(streakNow);
        setPhase('result');
        setShakeKey((k) => k + 1);
        setShakeAmp(r.outcome === 'crit' ? 1.8 : r.outcome === 'hit' ? 1.3 : 0.8);
        setFlash({ id: Date.now(), color: r.outcome === 'crit' ? '#ffd23f' : r.outcome === 'hit' ? '#5bc0ff' : r.outcome === 'garbled' ? '#ff9b3d' : '#ff5fa2', strength: r.outcome === 'crit' ? 0.85 : r.outcome === 'hit' ? 0.6 : 0.35 });
        const good = r.outcome === 'crit' || r.outcome === 'hit';
        if (good) {
          setMood('hurt'); setBeam(r.outcome === 'crit' ? 'crit' : 'hit');
          setCallout(overkill > 0 ? `OVERKILL! +${overkill}` : pick(HIT_CALLOUTS));
          setPopup({ id: Date.now(), text: `-${r.damage}`, color: '#ffd23f' });
          r.outcome === 'crit' ? sfx.crit() : sfx.attack();
          hitBurst(r.outcome === 'crit');
          if (streakNow >= 2) setTimeout(() => sfx.combo(streakNow), 350);
        } else if (r.outcome === 'garbled') {
          setMood('smug'); setBeam('bad');
          setCallout(pick(GARBLED_TAUNTS));
          setPopup({ id: Date.now(), text: `-${r.damage}`, color: '#ff9b3d' });
          sfx.garbled();
        } else {
          setMood('laughing');
          setCallout(pick(HEAL_TAUNTS));
          setPopup({ id: Date.now(), text: `+${r.heal} HP`, color: '#ff4d6d' });
          sfx.heal(); setTimeout(() => sfx.laugh(), 300);
        }
        await sleep(2800);
        if (!alive()) return;
        setBeam('none'); setPopup(null);
        if (hpNow <= 0) break;
      }

      const won = hpNow <= 0;
      setPhase('end');
      setCallout('');
      setMood(won ? 'defeated' : 'laughing');
      if (won) { sfx.victory(); victoryConfetti(); } else { sfx.defeat(); setTimeout(() => sfx.laugh(), 900); }
      await sleep(3200);
      if (!alive()) return;
      const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
      onFinish({
        name, won,
        score: scoreNow + (won ? VICTORY_BONUS : 0),
        avgClarity: avg(clarities),
        peakLoudness: Math.max(0, ...loudnesses),
        avgLoudness: avg(loudnesses),
        bestStreak: best,
      });
    };

    void run();
    return () => {
      cancelled = true;
      if (sampler !== undefined) window.clearInterval(sampler);
      if (waveOpen) void manager.endWave().catch(() => undefined);
      duckMusic(false);
    };
  }, [manager, name, onFinish]);

  const hpPct = (hp / MONSTER_MAX_HP) * 100;
  const showPhrase = phase !== 'end';
  const defeated = phase === 'end' && hp <= 0;

  // Display-only word highlighting: same similarity rule the scorer uses, never feeds back into scoring.
  const words = useMemo(() => line.split(/\s+/).filter(Boolean), [line]);
  const spoken = phase === 'speaking' ? transcript : phase === 'result' ? heard : '';
  const matched = useMemo(() => {
    const heardTokens = tokenize(spoken);
    return words.map((w) => {
      const t = tokenize(w).join('');
      return t !== '' && heardTokens.some((h) => wordSimilarity(t, h) >= WORD_MATCH_MIN);
    });
  }, [words, spoken]);

  const good = result !== null && (result.outcome === 'crit' || result.outcome === 'hit');
  const heroPose: HeroPose = phase === 'end' ? (hp <= 0 ? 'victory' : 'defeat')
    : phase === 'speaking' ? 'charging'
    : phase === 'result' && result ? (good ? 'attack' : 'dizzy')
    : 'idle';
  const a = shakeAmp;
  return (
    <>
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.id}
            initial={{ opacity: flash.strength }} animate={{ opacity: 0 }} transition={{ duration: 0.45 }}
            style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none', background: `radial-gradient(circle at 50% 30%, #fff 0%, ${flash.color} 50%, transparent 95%)` }}
          />
        )}
      </AnimatePresence>
      <motion.div
        key={shakeKey}
        className="screen"
        style={{ justifyContent: 'flex-start', gap: '0.2rem', paddingTop: '0.8rem', paddingBottom: '0.8rem' }}
        animate={shakeKey > 0 ? { x: [0, -36 * a, 32 * a, -24 * a, 16 * a, -8 * a, 0], y: [0, 14 * a, -16 * a, 10 * a, -6 * a, 0], rotate: [0, -1 * a, 1 * a, -0.5 * a, 0] } : undefined}
        transition={{ duration: 0.55 }}
      >
        {/* HUD: wave pips, HP bar with damage trail, score */}
        <div style={{ width: '76%', display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
            <span className="pixel" style={{ fontSize: '0.6rem', color: 'var(--plum)' }}>WAVE</span>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {Array.from({ length: WAVES }, (_, i) => (
                <motion.div
                  key={i}
                  animate={i === wave ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                  transition={{ duration: 0.9, repeat: i === wave ? Infinity : 0 }}
                  style={{
                    width: '1.2rem', height: '1.2rem', borderRadius: i === WAVES - 1 ? '0.25rem' : '50%',
                    border: '0.18rem solid var(--plum)',
                    background: i < wave ? 'var(--lime)' : i === wave ? (i === WAVES - 1 ? 'var(--pink)' : 'var(--cyan)') : '#fff',
                    boxShadow: i <= wave ? 'none' : 'none', color: i < wave ? '#3ddc97' : '#5bc0ff',
                  }}
                />
              ))}
            </div>
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <div className="pixel" style={{ fontSize: '0.6rem', color: 'var(--plum)', marginBottom: '0.2rem', textAlign: 'left' }}>THE MUMBLER</div>
            <div style={{ position: 'relative', height: '2.2rem', borderRadius: '1.1rem', border: '0.28rem solid var(--plum)', background: '#fff', overflow: 'hidden', boxShadow: '0 0.3rem 0 var(--plum)' }}>
              <motion.div animate={{ width: `${hpPct}%` }} transition={{ delay: 0.6, duration: 0.7, ease: 'easeOut' }} style={{ position: 'absolute', inset: '0 auto 0 0', background: '#ffd23f' }} />
              <motion.div animate={{ width: `${hpPct}%` }} transition={{ type: 'spring', stiffness: 160, damping: 18 }} style={{ position: 'absolute', inset: '0 auto 0 0', background: 'linear-gradient(180deg, #ffb3d6, #ff5fa2 50%, #ff9a3d)', boxShadow: 'inset 0 0.35rem 0 rgba(255,255,255,0.35)' }} />
              <div className="pixel" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: 'var(--plum)', WebkitTextStroke: '0.2rem #fff', paintOrder: 'stroke fill' }}>{hp} / {MONSTER_MAX_HP}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', minWidth: '9rem', marginRight: '6.5rem' }}>
            <div className="pixel" style={{ fontSize: '0.6rem', color: 'var(--plum)', lineHeight: 1, marginBottom: '0.45rem' }}>SCORE</div>
            <motion.div key={score} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="pixel" style={{ fontSize: '1.4rem', lineHeight: 1.1, color: 'var(--plum)', transformOrigin: 'right center' }}>{score}</motion.div>
          </div>
        </div>

        {/* arena: hero (left) vs monster (right); the beam lane sits between them, above the phrase card */}
        <div style={{ position: 'relative', height: '10.6rem', marginTop: '0.5rem', width: '88%', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', zIndex: 3 }}>
          <div style={{ width: '11rem', display: 'flex', justifyContent: 'center', zIndex: 2 }}>
            <Hero photo={photo} name={name} pose={heroPose} combo={streak >= 2 && phase !== 'end'} size="9.2rem" />
          </div>

          <div style={{ position: 'relative', flex: 1, height: '100%' }}>
            <AnimatePresence>
              {beam !== 'none' && <SoundBeam key="beam" kind={beam} />}
            </AnimatePresence>
            <AnimatePresence>
              {streak >= 2 && (
                <motion.div key="combo" initial={{ scale: 0, rotate: -15 }} animate={{ scale: 1, rotate: -4 }} exit={{ scale: 0 }} style={{ position: 'absolute', left: '50%', top: 0, translateX: '-50%', display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap', zIndex: 4 }}>
                  {Array.from({ length: Math.min(2, streak - 1) }, (_, i) => <Flame key={i} />)}
                  <motion.span
                    key={streak} initial={{ scale: 1.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }}
                    className="pixel" style={{ fontSize: `${1.1 + Math.min(streak, 6) * 0.15}rem`, color: 'var(--yellow)', WebkitTextStroke: '0.12rem #2b1b3f', paintOrder: 'stroke fill', textShadow: '0 0.15rem 0 rgba(43,27,63,0.3)' }}
                  >
                    x{streak} COMBO
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>
            {phase === 'speaking' && count === 'SPEAK!' && (
              <motion.div
                key="speak" className="logo-letter"
                initial={{ scale: 3, rotate: -8, opacity: 0 }} animate={{ scale: [3, 0.9, 1, 1, 1.3], rotate: -3, opacity: [0, 1, 1, 1, 0] }} transition={{ duration: 1.3, times: [0, 0.2, 0.3, 0.8, 1] }}
                style={{ position: 'absolute', left: 0, right: 0, bottom: '38%', textAlign: 'center', fontSize: '3rem', color: 'var(--lime)', lineHeight: 1, zIndex: 9, pointerEvents: 'none', whiteSpace: 'nowrap' }}
              >
                SPEAK!
              </motion.div>
            )}
          </div>

          <div style={{ position: 'relative', width: '11rem', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
            <motion.div
              animate={defeated
                ? { scale: [1, 1.12, 1.05, 1.35, 0], opacity: [1, 1, 1, 1, 0], x: [0, -10, 10, -14, 0], rotate: [0, -4, 4, -8, 20] }
                : { scale: 1, opacity: 1, x: 0, rotate: 0 }}
              transition={{ duration: 1.3, times: defeated ? [0, 0.25, 0.5, 0.8, 1] : undefined }}
            >
              <Monster mood={mood} size="9.6rem" />
            </motion.div>
            {defeated && <Explosion />}
            <AnimatePresence>
              {popup && (
                <motion.div
                  key={popup.id}
                  className="pixel"
                  initial={{ y: 0, opacity: 1, scale: 0.4, rotate: -10 }} animate={{ y: -90, opacity: [1, 1, 0], scale: [0.4, 1.6, 1.3], rotate: [-10, 6, -4] }}
                  transition={{ duration: 1.8 }}
                  style={{
                    position: 'absolute', top: '10%', fontSize: '2.2rem', whiteSpace: 'nowrap', color: popup.color, zIndex: 8,
                    WebkitTextStroke: '0.25rem #2b1b3f', paintOrder: 'stroke fill', textShadow: '0 0.3rem 0 #2b1b3f', pointerEvents: 'none',
                  }}
                >
                  {popup.text}
                </motion.div>
              )}
            </AnimatePresence>
            {popup && popup.text.startsWith('-') && <SparkBurst key={`s${popup.id}`} color={popup.color} />}
          </div>
        </div>

        {/* callout */}
        <div style={{ height: '2.3rem', zIndex: 7 }}>
          <AnimatePresence mode="wait">
            {callout && (
              <motion.div
                key={callout} className="pixel" initial={{ scale: 0.2, rotate: -14, opacity: 0 }} animate={{ scale: [0.2, 1.25, 1], rotate: -3, opacity: 1 }} exit={{ opacity: 0, scale: 1.3 }}
                transition={{ duration: 0.35 }}
                style={{
                  fontSize: '1.7rem', color: result && result.heal > 0 ? '#ff4d6d' : 'var(--yellow)', whiteSpace: 'nowrap',
                  WebkitTextStroke: '0.22rem #2b1b3f', paintOrder: 'stroke fill', textShadow: '0 0.25rem 0 #2b1b3f',
                }}
              >
                {callout}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* phrase card */}
        {showPhrase && (
          <motion.div key={wave} initial={{ y: 30, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} className="panel" style={{ maxWidth: '88%', padding: '0.7rem 2rem', borderColor: wave === WAVES - 1 ? 'var(--pink)' : 'var(--cyan)' }}>
            <div className="pixel" style={{ fontSize: '0.55rem', color: 'var(--plum)', marginBottom: '0.3rem' }}>
              {wave === WAVES - 1 ? 'FINISHING MOVE - READ THIS!' : 'READ THIS OUT LOUD'}
            </div>
            <div className="phrase">
              {words.map((w, i) => <span key={i}><span className={`w ${matched[i] ? 'hit' : ''}`}>{w}</span>{' '}</span>)}
            </div>
          </motion.div>
        )}

        {/* countdown / speaking / result details */}
        <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '0.4rem', minHeight: 0, paddingTop: '0.4rem' }}>
          {phase === 'countdown' && count !== null && (
            <motion.div
              key={String(count)} className="logo-letter l-a"
              initial={{ scale: 3.5, opacity: 0, rotate: -15 }} animate={{ scale: [3.5, 0.9, 1], opacity: 1, rotate: 0 }} transition={{ duration: 0.45 }}
              style={{ fontSize: '5.5rem', color: count === 1 ? 'var(--pink)' : count === 2 ? 'var(--yellow)' : 'var(--cyan)' }}
            >
              {count}
            </motion.div>
          )}
          {phase === 'speaking' && (
            <>
              <div style={{ width: '60%', height: '0.9rem', background: '#ffffff', borderRadius: '0.5rem', overflow: 'hidden', border: '0.15rem solid var(--plum)' }}>
                <div style={{ width: `${timeLeft * 100}%`, height: '100%', background: timeLeft < 0.3 ? '#ff4d6d' : 'linear-gradient(90deg, var(--cyan), var(--lime))', boxShadow: 'none' }} />
              </div>
              <VolumeMeter />
              <div className="transcript" style={{ fontSize: '1.5rem', minHeight: '2rem' }}>
                {volumeMode ? 'Volume-only mode: keep talking, loud and steady!' : transcript || '...'}
              </div>
            </>
          )}
          {phase === 'result' && result && (
            <div style={{ fontSize: '1.6rem' }}>
              {!volumeMode && <div className="transcript" style={{ fontSize: '1.7rem' }}>I heard: &quot;{heard || '...nothing'}&quot;</div>}
              <div style={{ display: 'flex', gap: '2.5rem', justifyContent: 'center', marginTop: '0.3rem', background: '#fff', border: '0.2rem solid var(--plum)', borderRadius: '1.2rem', padding: '0.2rem 1.6rem', boxShadow: '0 0.25rem 0 var(--plum)' }}>
                <span>Clarity <b style={{ color: '#1d86c4', fontSize: '2rem' }}>{Math.round(result.clarity * 100)}%</b></span>
                <span>Loudness <b style={{ color: '#e63a86', fontSize: '2rem' }}>{result.loudness}</b></span>
              </div>
            </div>
          )}
          {phase === 'end' && (
            <motion.div
              className="logo-letter" initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ delay: defeated ? 1 : 0, duration: 0.5 }}
              style={{ fontSize: '2.4rem', color: hp <= 0 ? 'var(--lime)' : 'var(--pink)' }}
            >
              {hp <= 0 ? 'MONSTER DEFEATED!' : 'MUMBLE VICTORY...'}
            </motion.div>
          )}
        </div>
      </motion.div>
    </>
  );
}

/** Sound-wave beam: concentric rings + ribbon travelling hero -> monster inside the arena lane (never over the phrase card). */
function SoundBeam({ kind }: { kind: 'hit' | 'crit' | 'bad' }) {
  const big = kind === 'crit';
  const h = big ? 9 : kind === 'hit' ? 6 : 3;
  const colors = kind === 'bad' ? ['#ff9b3d', '#ffd23f'] : ['#5bc0ff', '#ff5fa2', '#ffd23f'];
  return (
    <motion.div
      initial={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'absolute', left: '-1rem', right: 0, top: '38%', height: 0, pointerEvents: 'none', zIndex: 3 }}
    >
      <motion.div
        initial={{ scaleX: 0 }} animate={{ scaleX: kind === 'bad' ? 0.35 : 1, opacity: [0, 1, 1, 0] }} transition={{ duration: 0.8, delay: 0.25 }}
        style={{ position: 'absolute', left: 0, right: 0, top: `${-h / 4}rem`, height: `${h / 2}rem`, originX: 0, borderRadius: '2rem', background: `linear-gradient(90deg, ${colors.join(', ')})`, boxShadow: `0 0 1.2rem ${colors[0]}` }}
      />
      {Array.from({ length: kind === 'bad' ? 3 : 6 }, (_, i) => (
        <motion.div
          key={i}
          initial={{ left: '0%', opacity: 0, scale: 0.4 }} animate={{ left: kind === 'bad' ? '30%' : '92%', opacity: [0, 1, 1, 0], scale: 1 }}
          transition={{ duration: 0.7, delay: 0.25 + i * 0.07, ease: 'easeOut' }}
          style={{
            position: 'absolute', top: `${-h / 2 - 1}rem`, width: `${h / 2 + 1.2}rem`, height: `${h + 2}rem`, borderRadius: '50%',
            border: `0.35rem solid ${colors[i % colors.length]}`, borderLeftColor: 'transparent', borderBottomColor: 'transparent', borderTopColor: 'transparent',
            boxShadow: `0 0 0.8rem ${colors[i % colors.length]}`,
          }}
        />
      ))}
    </motion.div>
  );
}

const BURST_ANGLES = Array.from({ length: 14 }, (_, i) => (i / 14) * Math.PI * 2);

function SparkBurst({ color }: { color: string }) {
  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', pointerEvents: 'none', zIndex: 7 }}>
      {BURST_ANGLES.map((ang, i) => (
        <motion.div
          key={i}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: Math.cos(ang) * (110 + (i % 3) * 40), y: Math.sin(ang) * (90 + (i % 3) * 35), opacity: 0, scale: 0.2 }}
          transition={{ duration: 0.75, ease: 'easeOut' }}
          style={{ position: 'absolute', width: '1rem', height: '1rem', borderRadius: i % 2 ? '50%' : '0.2rem', background: i % 3 === 0 ? '#fff' : color, boxShadow: '0 0.1rem 0 rgba(43,27,63,0.4)' }}
        />
      ))}
    </div>
  );
}

const CHUNKS = Array.from({ length: 28 }, (_, i) => i);

/** Defeat blast: shockwave rings + flying neon goo chunks, timed to land when the monster pops. */
function Explosion() {
  return (
    <div style={{ position: 'absolute', top: '55%', left: '50%', pointerEvents: 'none', zIndex: 9 }}>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 1, 0] }} transition={{ duration: 1.3, times: [0, 0.6, 0.65, 1] }}
        style={{ position: 'fixed', inset: 0, background: '#fff', }}
      />
      {[0, 0.15, 0.3].map((d, i) => (
        <motion.div
          key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 14 + i * 4], opacity: [0.9, 0] }} transition={{ delay: 0.8 + d, duration: 0.9, ease: 'easeOut' }}
          style={{ position: 'absolute', width: '6rem', height: '6rem', left: '-3rem', top: '-3rem', borderRadius: '50%', border: `0.5rem solid ${['#2b1b3f', '#ff5fa2', '#5bc0ff'][i]}`, boxShadow: `0 0 2rem ${['#2b1b3f', '#ff5fa2', '#5bc0ff'][i]}` }}
        />
      ))}
      {CHUNKS.map((i) => {
        const ang = (i / CHUNKS.length) * Math.PI * 2 + (i % 2) * 0.2;
        const dist = 160 + (i % 5) * 70;
        return (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
            animate={{ x: Math.cos(ang) * dist * 1.5, y: Math.sin(ang) * dist + 120, scale: [0, 1.6, 0.4], opacity: [1, 1, 0], rotate: i * 70 }}
            transition={{ delay: 0.85, duration: 1.4, ease: 'easeOut' }}
            style={{ position: 'absolute', width: `${1 + (i % 3) * 0.5}rem`, height: `${1 + (i % 3) * 0.5}rem`, borderRadius: i % 2 ? '50%' : '0.25rem', background: ['#ffc2e0', '#a96bff', '#5bc0ff', '#ffd23f'][i % 4], boxShadow: 'none' }}
          />
        );
      })}
    </div>
  );
}
