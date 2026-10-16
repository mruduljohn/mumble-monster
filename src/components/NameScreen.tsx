import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

export function NameScreen({ defaultName, onDone }: { defaultName: string; onDone: (name: string) => void }) {
  const [name, setName] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const submit = () => onDone(name.trim() || defaultName);
  return (
    <div className="screen" style={{ gap: '1.8rem' }}>
      <motion.h2 className="neon-title" style={{ fontSize: '2.8rem' }} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 10 }}>
        YOUR NAME?
      </motion.h2>
      <motion.input
        ref={ref}
        className="name-input"
        value={name}
        maxLength={12}
        placeholder={defaultName}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
      />
      <div style={{ fontSize: '1.3rem', opacity: 0.8 }}>Optional - up to 12 characters</div>
      <button className="big-btn" onClick={submit}>FIGHT!</button>
    </div>
  );
}
