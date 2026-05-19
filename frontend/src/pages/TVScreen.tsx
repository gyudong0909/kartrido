import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { socket } from '../socket';
import type { GamePhase, RoomSummary } from '@wheel-race/shared';
import KartridoBoard from '../game/kartrido/KartridoBoard';
import KartridoResults from '../game/kartrido/KartridoResults';
import QuoridorBoard from '../game/quoridor/QuoridorBoard';
import RoundTimer from '../components/RoundTimer';

export default function TVScreen() {
  const { code } = useParams();
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [summary, setSummary] = useState<RoomSummary | null>(null);

  useEffect(() => {
    if (!code) return;
    const onPhase = (p: GamePhase) => setPhase(p);
    const onUpdate = (d: { summary: RoomSummary }) => setSummary(d.summary);
    socket.on('phase:changed', onPhase);
    socket.on('room:update', onUpdate);
    // 연결 시점에 따라 즉시 또는 connect 후 join
    const doJoin = () => socket.emit('tv:join', { code });
    if (socket.connected) doJoin();
    socket.on('connect', doJoin);
    return () => {
      socket.off('phase:changed', onPhase);
      socket.off('room:update', onUpdate);
      socket.off('connect', doJoin);
    };
  }, [code]);

  return (
    <div style={{ width: '100vw', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 30, padding: '4px 12px', borderBottom: '2px solid #2a2a4a', flexWrap: 'wrap',
      }}>
        <h1 style={{ color: '#e94560', fontSize: 32 }}>
          {phase.startsWith('quoridor') ? '협동 쿼리도' : '카트라이도'}
        </h1>
        <RoundTimer size="big" />
        {summary && <span style={{ color: '#aaa', fontSize: 16 }}>
          참가 {summary.joinedCount}/12
        </span>}
      </header>

      {/* 게임 종료 시 결과 띠 — 게임판 위에 안 가리게 */}
      {phase === 'kartrido-end' && <KartridoResults />}

      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {phase === 'lobby' && (
          <div style={{ textAlign: 'center', color: '#aaa', fontSize: 32 }}>
            <p>참가자 입장 대기 중...</p>
            <p style={{ fontSize: 20, marginTop: 20 }}>방 코드: {code}</p>
          </div>
        )}
        {/* 카트라이도: 입력·시뮬·종료 모두 게임판 그대로 표시 */}
        {(phase === 'kartrido-input' || phase === 'kartrido-anim' || phase === 'kartrido-end') && <KartridoBoard />}
        {(phase === 'quoridor-setup' || phase === 'quoridor-play') && <QuoridorBoard />}
        {phase === 'finished' && (
          <div style={{ textAlign: 'center', color: '#ffd700', fontSize: 48 }}>
            🏁 전체 종료
          </div>
        )}
      </main>
    </div>
  );
}
