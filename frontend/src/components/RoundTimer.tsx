import { useEffect, useState } from 'react';
import { socket } from '../socket';

export default function RoundTimer({ size = 'normal' }: { size?: 'normal' | 'big' }) {
  const [info, setInfo] = useState<{ round: number; deadline: number } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const onTimer = (t: { round: number; deadline: number; durationSeconds: number }) => setInfo(t);
    socket.on('state:timer', onTimer);
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => {
      socket.off('state:timer', onTimer);
      clearInterval(id);
    };
  }, []);

  if (!info) return null;
  const remaining = Math.max(0, Math.floor((info.deadline - now) / 1000));
  const mm = Math.floor(remaining / 60).toString().padStart(2, '0');
  const ss = (remaining % 60).toString().padStart(2, '0');
  const urgent = remaining < 60;

  const big = size === 'big';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: big ? 20 : 10,
      padding: big ? '12px 24px' : '6px 14px',
      background: urgent ? '#3a0a0a' : '#1a1a3a',
      border: `2px solid ${urgent ? '#e94560' : '#4ea8de'}`,
      borderRadius: 8,
    }}>
      <span style={{ fontSize: big ? 28 : 16, color: '#aaa' }}>
        라운드 <strong style={{ color: '#ffd700' }}>{info.round}</strong>
      </span>
      <span style={{
        fontSize: big ? 48 : 22, fontWeight: 'bold',
        color: urgent ? '#e94560' : '#ffd700',
        fontFamily: 'monospace',
      }}>
        {mm}:{ss}
      </span>
    </div>
  );
}
