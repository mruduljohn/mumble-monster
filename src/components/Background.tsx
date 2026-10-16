import { useEffect, useRef } from 'react';

interface Item { x: number; y: number; s: number; vy: number; rot: number; vr: number; kind: number; color: string }
interface Ring { r: number; color: string }
const COLORS = ['#ff5fa2', '#3ddc97', '#ffd23f', '#5bc0ff', '#a96bff'];

/** Candy Pop scene: pastel blobs (CSS), dotted paper, floating confetti shapes and sound-wave rings (canvas). */
export function Background() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const resize = () => { canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; };
    resize();
    window.addEventListener('resize', resize);
    const items: Item[] = Array.from({ length: 36 }, (_, i) => ({
      x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 1.2, vy: 0.0002 + Math.random() * 0.0006,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.002, kind: i % 4, color: COLORS[i % COLORS.length],
    }));
    const rings: Ring[] = [];
    let clock = 0, raf = 0, last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(50, now - last); last = now;
      const w = canvas.width, h = canvas.height, u = h / 40;
      g.clearRect(0, 0, w, h);
      clock += dt;
      if (clock > 2200) { clock = 0; rings.push({ r: 0, color: COLORS[Math.floor(Math.random() * 4)] }); }
      for (let i = rings.length - 1; i >= 0; i--) {
        const rg = rings[i]; rg.r += dt * 0.00015;
        if (rg.r > 0.8) { rings.splice(i, 1); continue; }
        g.globalAlpha = 0.35 * (1 - rg.r / 0.8); g.strokeStyle = rg.color; g.lineWidth = u * 0.5;
        g.beginPath(); g.arc(w / 2, h * 0.5, rg.r * h, 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = 0.75; g.lineWidth = u * 0.28; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const d of items) {
        d.y -= d.vy * dt / 16; d.rot += d.vr * dt;
        if (d.y < -0.05) { d.y = 1.05; d.x = Math.random(); }
        g.save(); g.translate(d.x * w, d.y * h); g.rotate(d.rot);
        const r = u * d.s; g.fillStyle = d.color; g.strokeStyle = d.color;
        if (d.kind === 0) { g.beginPath(); g.arc(0, 0, r * 0.6, 0, Math.PI * 2); g.fill(); }
        else if (d.kind === 1) { g.fillRect(-r * 0.5, -r * 0.25, r, r * 0.5); }
        else if (d.kind === 2) { g.beginPath(); g.moveTo(-r, 0); g.quadraticCurveTo(-r / 2, -r * 0.8, 0, 0); g.quadraticCurveTo(r / 2, r * 0.8, r, 0); g.stroke(); }
        else { g.beginPath(); for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2, b = a + Math.PI / 5; g.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); g.lineTo(Math.cos(b) * r * 0.3, Math.sin(b) * r * 0.3); } g.closePath(); g.fill(); }
        g.restore();
      }
      g.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return (
    <>
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" /><div className="blob b4" />
      <div className="bg-layer dots" />
      <canvas ref={ref} className="bg-layer" style={{ width: '100%', height: '100%' }} />
      <div className="bg-layer vignette" />
    </>
  );
}
