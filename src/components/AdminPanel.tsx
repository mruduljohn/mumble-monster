import { useEffect, useState } from 'react';
import { mic } from '../audio/mic';
import type { SpeechManager } from '../engine/manager';
import { resetLeaderboard } from '../game/leaderboard';
import { updateSettings, useSettings, type EngineChoice } from '../game/settings';

const LANGS = ['en-US', 'en-IN', 'en-GB', 'en-AU'];
const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', margin: '0.5rem 0' } as const;
const field = { fontSize: 'max(1rem, 16px)', minHeight: 44, padding: '0.3rem 0.5rem', background: '#fff', color: 'var(--plum)', border: '2px solid var(--plum)', borderRadius: '0.5rem', fontFamily: 'inherit' } as const;
const btn = { minHeight: 44, minWidth: 44, padding: '0.4rem 0.9rem', border: '2px solid var(--plum)', borderRadius: '0.5rem', background: 'var(--lemon)', fontSize: '1rem' } as const;

export function AdminPanel({ manager, onClose }: { manager: SpeechManager; onClose: () => void }) {
  const s = useSettings();
  const [, force] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [calibrating, setCalibrating] = useState(false);
  useEffect(() => manager.subscribe(() => force((n) => n + 1)), [manager]);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  const status = manager.getStatus();

  const recalibrate = async () => {
    if (!mic.active) return;
    setCalibrating(true);
    const floor = await mic.calibrate(2000);
    mic.floorRms = floor;
    updateSettings({ noiseFloorRms: floor });
    setCalibrating(false);
  };
  const changeEngine = (patch: { engine?: EngineChoice; lang?: string }) => {
    updateSettings(patch);
    manager.resetDowngrade(); // the new choice is applied when the next game starts
  };

  return (
    <div style={{ position: 'absolute', top: 'calc(0.5rem + var(--sat))', right: 'calc(0.5rem + var(--sar))', width: 'min(28rem, calc(100% - 1rem))', maxHeight: 'calc(100% - 1rem - var(--sat) - var(--sab))', overflowY: 'auto', zIndex: 100, fontSize: '1.05rem', borderRadius: '1rem', padding: '1rem 1.4rem', background: '#fff' }} className="panel">
      <div style={{ ...row, fontSize: '1.3rem', paddingBottom: '0.4rem', borderBottom: '1px solid rgba(43,27,63,0.2)' }}>
        <span>ADMIN (Ctrl+Shift+A, or tap top-left corner 5x)</span>
        <button style={btn} onClick={onClose}>Close</button>
      </div>
      <label style={row}>
        <span>Mic sensitivity {s.sensitivity.toFixed(2)}</span>
        <input type="range" min={0.5} max={2} step={0.05} value={s.sensitivity} onChange={(e) => { mic.sensitivity = Number(e.target.value); updateSettings({ sensitivity: Number(e.target.value) }); }} />
      </label>
      <div style={row}>
        <span>Noise floor {s.noiseFloorRms.toFixed(4)}</span>
        <button style={btn} onClick={recalibrate} disabled={calibrating}>{calibrating ? 'Quiet...' : 'Recalibrate'}</button>
      </div>
      <label style={row}>
        <span>Speech engine</span>
        <select style={field} value={s.engine} onChange={(e) => changeEngine({ engine: e.target.value as EngineChoice })}>
          <option value="auto">Auto</option>
          <option value="web">Web Speech</option>
          <option value="vosk">Vosk (offline)</option>
          <option value="volume">Volume only</option>
        </select>
      </label>
      <label style={row}>
        <span>Language</span>
        <select style={field} value={s.lang} onChange={(e) => changeEngine({ lang: e.target.value })}>
          {LANGS.map((l) => <option key={l}>{l}</option>)}
        </select>
      </label>
      <label style={row}>
        <span>Wave timer {s.waveSeconds}s</span>
        <input type="range" min={3} max={12} step={1} value={s.waveSeconds} onChange={(e) => updateSettings({ waveSeconds: Number(e.target.value) })} />
      </label>
      <label style={row}>
        <span>Mute</span>
        <input type="checkbox" checked={s.muted} onChange={(e) => updateSettings({ muted: e.target.checked })} />
      </label>
      <div style={row}>
        <span>Leaderboard</span>
        <button style={btn} onClick={() => window.confirm('Reset the leaderboard?') && resetLeaderboard()}>Reset</button>
      </div>
      <div style={{ marginTop: '0.6rem', opacity: 0.9 }}>
        Engine now: <b>{status.kind}</b>{status.loading ? ' (loading)' : ''} | {online ? 'online' : 'OFFLINE'}
        {status.note && <div style={{ color: '#c2410c' }}>{status.note}</div>}
      </div>
    </div>
  );
}
