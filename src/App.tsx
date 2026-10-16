import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fullscreenSupported } from './device';
import { MicError, mic, type MicErrorKind } from './audio/mic';
import { setMuted, sfx, soundUnlocked, startMusic, unlockAudio } from './audio/sfx';
import { AdminPanel } from './components/AdminPanel';
import { Background } from './components/Background';
import { BattleScreen } from './components/BattleScreen';
import { CalibrationScreen } from './components/CalibrationScreen';
import { MicDeniedScreen } from './components/MicDeniedScreen';
import { NameScreen } from './components/NameScreen';
import { PhotoScreen } from './components/PhotoScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { TitleScreen } from './components/TitleScreen';
import { SpeechManager } from './engine/manager';
import { addScore, nextDefaultName } from './game/leaderboard';
import { updateSettings, useSettings } from './game/settings';
import type { GameSummary } from './game/types';

type Screen = 'title' | 'name' | 'photo' | 'calibrate' | 'battle' | 'results';

export function App() {
  const settings = useSettings();
  const manager = useMemo(() => new SpeechManager(mic), []);
  const [screen, setScreen] = useState<Screen>('title');
  const [name, setName] = useState('');
  const [defaultName, setDefaultName] = useState('Player 1');
  // PRIVACY: in-memory only (never persisted/sent); discarded whenever we are back on the title screen.
  const [photo, setPhoto] = useState<string | null>(null);
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [micError, setMicError] = useState<MicErrorKind | null>(null);
  const [admin, setAdmin] = useState(false);
  const [engineLabel, setEngineLabel] = useState(manager.getStatus().kind);

  // Keep audio + mic in sync with persisted settings.
  useEffect(() => {
    mic.sensitivity = settings.sensitivity;
    mic.floorRms = settings.noiseFloorRms;
    setMuted(settings.muted);
  }, [settings]);

  useEffect(() => {
    if (screen === 'title') setPhoto(null);
  }, [screen]);

  useEffect(() => manager.subscribe(() => setEngineLabel(manager.getStatus().kind)), [manager]);

  const canFullscreen = useMemo(() => fullscreenSupported(), []);
  const tapsRef = useRef<number[]>([]);
  // Touch devices have no Ctrl+Shift+A: five quick taps on the top-left hotspot open the admin panel.
  const onAdminTap = useCallback(() => {
    const now = Date.now();
    tapsRef.current = [...tapsRef.current.filter((t) => now - t < 3000), now];
    if (tapsRef.current.length >= 5) {
      tapsRef.current = [];
      setAdmin((a) => !a);
    }
  }, []);

  // iOS/Android keep AudioContexts suspended until a user gesture (and after backgrounding): resume on any touch.
  useEffect(() => {
    const resume = () => {
      void mic.ctx?.resume().catch(() => undefined);
      if (soundUnlocked()) unlockAudio();
    };
    window.addEventListener('pointerdown', resume, { passive: true });
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.removeEventListener('pointerdown', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyA') {
        e.preventDefault();
        setAdmin((a) => !a);
        return;
      }
      const typing = (e.target as HTMLElement | null)?.tagName === 'INPUT';
      if (!typing && !e.ctrlKey && !e.metaKey && e.code === 'KeyF') toggleFullscreen();
    };
    const noMenu = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', onKey);
    window.addEventListener('contextmenu', noMenu);
    window.addEventListener('selectstart', noMenu);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('contextmenu', noMenu);
      window.removeEventListener('selectstart', noMenu);
    };
  }, [toggleFullscreen]);

  const startMic = useCallback(async (): Promise<boolean> => {
    try {
      await mic.start();
      mic.onLost = () => {
        setMicError('unavailable');
        setScreen('title');
      };
      setMicError(null);
      return true;
    } catch (e) {
      setMicError(e instanceof MicError ? e.kind : 'unavailable');
      return false;
    }
  }, []);

  const onStart = useCallback(async () => {
    unlockAudio();
    startMusic();
    sfx.click();
    if (await startMic()) {
      setDefaultName(nextDefaultName());
      setScreen('name');
    }
  }, [startMic]);

  const onName = useCallback((n: string) => {
    setName(n);
    setScreen('photo');
  }, []);
  const onPhoto = useCallback((p: string | null) => {
    setPhoto(p);
    setScreen('calibrate');
  }, []);
  const onCalibrated = useCallback(() => setScreen('battle'), []);
  const onFinish = useCallback((s: GameSummary) => {
    addScore(s.name, s.score);
    setSummary(s);
    setScreen('results');
  }, []);
  const onResultsDone = useCallback(() => setScreen('title'), []);

  return (
    <div className="stage">
      <Background />
      {screen === 'title' && <TitleScreen onStart={() => void onStart()} manager={manager} />}
      {screen === 'name' && <NameScreen defaultName={defaultName} onDone={onName} />}
      {screen === 'photo' && <PhotoScreen nickname={name} onDone={onPhoto} />}
      {screen === 'calibrate' && <CalibrationScreen manager={manager} onDone={onCalibrated} />}
      {screen === 'battle' && <BattleScreen manager={manager} name={name} photo={photo} onFinish={onFinish} />}
      {screen === 'results' && summary && <ResultsScreen summary={summary} photo={photo} onDone={onResultsDone} />}
      {micError && <MicDeniedScreen kind={micError} onRetry={() => void onStart()} />}
      {admin && <AdminPanel manager={manager} onClose={() => setAdmin(false)} />}

      <div onClick={onAdminTap} aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: 48, height: 48, zIndex: 60 }} />
      {canFullscreen && <button className="hud-btn" style={{ right: 'calc(0.8rem + var(--sar))' }} onClick={toggleFullscreen} aria-label="Toggle fullscreen" title="Fullscreen (F)">
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="#2b1b3f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
      </button>}
      <button className="hud-btn" style={{ right: canFullscreen ? 'calc(4.4rem + var(--sar))' : 'calc(0.8rem + var(--sar))' }} onClick={() => updateSettings({ muted: !settings.muted })} aria-label={settings.muted ? 'Unmute sound' : 'Mute sound'} title={settings.muted ? 'Unmute sound' : 'Mute sound'}>
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="#2b1b3f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9z" fill="#ffd23f" />
          {settings.muted ? <path d="M16 9l5 6M21 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
        </svg>
      </button>
      {screen !== 'title' && <div className="corner-badge">MIC: {engineLabel.toUpperCase()}</div>}
    </div>
  );
}
