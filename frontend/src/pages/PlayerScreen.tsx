import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { socket } from '../socket';
import {
  WHEEL_NAMES_KO,
  type GamePhase, type PlayerSlot,
} from '@wheel-race/shared';
import KartridoInput from '../game/kartrido/KartridoInput';
import QuoridorInput from '../game/quoridor/QuoridorInput';
import RoundTimer from '../components/RoundTimer';

export default function PlayerScreen() {
  const { slotToken } = useParams();
  const [slot, setSlot] = useState<PlayerSlot | null>(null);
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slotToken) return;
    socket.emit('player:join', { slotToken }, (res) => {
      if (res.ok) setSlot(res.slot);
      else setError(res.reason);
    });
    const onPhase = (p: GamePhase) => setPhase(p);
    socket.on('phase:changed', onPhase);
    return () => {
      socket.off('phase:changed', onPhase);
    };
  }, [slotToken]);

  if (error) return <div style={{ padding: 24, color: '#e94560' }}>오류: {error}</div>;
  if (!slot) return <div style={{ padding: 24 }}>접속 중...</div>;

  const teamColor =
    slot.team === 'red' ? '#e94560' : slot.team === 'blue' ? '#4ea8de' : '#06d6a0';

  return (
    <div style={{ padding: 16, maxWidth: 600, margin: '0 auto', minHeight: '100vh' }}>
      <div style={{ marginBottom: 12, textAlign: 'center' }}>
        <RoundTimer />
      </div>
      <div style={{
        background: '#1a1a2e', borderRadius: 12, padding: 14,
        border: `3px solid ${teamColor}`, marginBottom: 16,
      }}>
        <div style={{ color: teamColor, fontSize: 22, fontWeight: 'bold' }}>
          {slot.team.toUpperCase()} 팀 / {WHEEL_NAMES_KO[slot.wheel]} 바퀴
        </div>
      </div>

      {phase === 'lobby' && (
        <div style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>
          진행자가 게임 시작할 때까지 대기 중...
        </div>
      )}
      {phase === 'kartrido-input' && <KartridoInput slot={slot} />}
      {phase === 'kartrido-anim' && (
        <div style={{ color: '#aaa', textAlign: 'center', marginTop: 40 }}>
          시뮬레이션 진행 중. TV 화면 보세요.
        </div>
      )}
      {phase === 'kartrido-end' && (
        <div style={{ color: '#ffd700', textAlign: 'center', fontSize: 24, marginTop: 40 }}>
          🏁 게임 종료. TV 화면 결과 확인.
        </div>
      )}
      {phase === 'quoridor-setup' && <QuoridorInput slot={slot} />}
      {phase === 'quoridor-play' && <QuoridorInput slot={slot} />}
      {phase === 'finished' && (
        <div style={{ color: '#ffd700', textAlign: 'center', fontSize: 28, marginTop: 40 }}>
          🏁 게임 전체 종료. 결과는 TV 화면 확인.
        </div>
      )}
    </div>
  );
}
