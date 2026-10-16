import { useEffect, useRef } from 'react';
import { mic } from '../audio/mic';
import { CRIT_MIN_LOUDNESS, HIT_MIN_LOUDNESS, MUMBLE_MAX_LOUDNESS } from '../game/scoring';

const BARS = 36;
const MARKERS = [
  { at: MUMBLE_MAX_LOUDNESS, label: 'MUMBLE', color: '#2b9bd8' },
  { at: HIT_MIN_LOUDNESS, label: 'HIT', color: '#1fae72' },
  { at: CRIT_MIN_LOUDNESS, label: 'CRIT', color: '#e63a86' },
];

function mix(a: number[], b: number[], t: number): string {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

function barColor(pct: number): string {
  // green -> yellow -> red
  const k = Math.min(1, pct / 100);
  return k < 0.5 ? mix([61, 220, 151], [255, 210, 63], k / 0.5) : mix([255, 210, 63], [255, 95, 162], (k - 0.5) / 0.5);
}

/** Giant live equalizer. Drawn on a canvas from the mic level (no React re-renders). */
export function VolumeMeter() {
  const ref = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    let level = 0;
    let shown = 0;
    const wob = Array.from({ length: BARS }, () => Math.random());
    const unsub = mic.subscribe((l) => { level = l; });
    let raf = 0;
    const draw = (t: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      shown += (level - shown) * 0.35;
      g.clearRect(0, 0, w, h);
      const gap = w * 0.006;
      const bw = (w - gap * (BARS - 1)) / BARS;
      for (let i = 0; i < BARS; i++) {
        const pct = ((i + 0.5) / BARS) * 100;
        const lit = shown >= pct - 100 / BARS / 2;
        const jig = 0.55 + 0.45 * Math.abs(Math.sin(t * 0.012 + wob[i] * 10));
        const bh = lit ? h * (0.5 + 0.5 * jig * Math.min(1, shown / 60 + 0.4)) : h * 0.14;
        const x = i * (bw + gap);
        const y = h - bh;
        g.fillStyle = lit ? barColor(pct) : 'rgba(43,27,63,0.12)';
        if (lit) { g.shadowColor = barColor(pct); g.shadowBlur = 0; } else g.shadowBlur = 0;
        g.beginPath();
        g.roundRect(x, y, bw, bh, bw / 2.4);
        g.fill();
      }
      g.shadowBlur = 0;
      if (frame.current) {
        const k = Math.min(1, shown / 100);
        frame.current.style.boxShadow = `0 0.4rem 0 var(--plum), 0 0 ${k * 3}rem rgba(255,95,162,${k})`;
        frame.current.style.transform = `scale(${1 + k * 0.05})`;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); unsub(); };
  }, []);

  return (
    <div className="vol-meter">
      <div ref={frame} style={{ borderRadius: '1.2rem', border: '0.28rem solid var(--plum)', background: '#fff', padding: '0.5rem 0.7rem', transition: 'transform 0.08s' }}>
        <canvas ref={ref} style={{ width: '100%', height: '3.8rem', display: 'block' }} />
      </div>
      <div style={{ position: 'relative', height: '1.9rem', margin: '0.2rem 0.95rem 0' }}>
        {MARKERS.map((m) => (
          <div key={m.label} style={{ position: 'absolute', left: `${m.at}%`, transform: 'translateX(-50%)', textAlign: 'center', color: m.color }}>
            <div style={{ width: '0.2rem', height: '0.5rem', background: m.color, margin: '0 auto' }} />
            <div className="pixel" style={{ fontSize: '0.6rem', whiteSpace: 'nowrap', fontWeight: 900 }}>{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
