import { useState, useEffect } from 'react';
import { socket } from '../../socket';
import type { PlayerSlot, QuoridorBroadcast, QuoridorAction } from '@wheel-race/shared';

export default function QuoridorInput({ slot }: { slot: PlayerSlot }) {
  const [role, setRole] = useState<'wall' | 'move' | null>(null);
  const [chose, setChose] = useState(false);
  const [state, setState] = useState<QuoridorBroadcast | null>(null);

  useEffect(() => {
    const onState = (s: QuoridorBroadcast) => setState(s);
    socket.on('state:quoridor', onState);
    return () => { socket.off('state:quoridor', onState); };
  }, []);

  function chooseRole(r: 'wall' | 'move') {
    setRole(r);
    socket.emit('quoridor:choose-room', { slotToken: slot.slotToken, role: r });
    setChose(true);
  }

  function submitAction(action: QuoridorAction) {
    socket.emit('quoridor:submit-action', { slotToken: slot.slotToken, action });
  }

  if (!chose) {
    return (
      <div>
        <h2 style={{ color: '#ffd700' }}>방 선택</h2>
        <p style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>
          같은 팀 두 명은 서로 다른 방에 들어가야 합니다. 사전 상의 후 선택.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => chooseRole('wall')} style={btn('#8B4513')}>🧱 벽 방</button>
          <button onClick={() => chooseRole('move')} style={btn('#06d6a0')}>♟️ 이동 방</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ color: '#ffd700' }}>{role === 'wall' ? '🧱 벽 방' : '♟️ 이동 방'}</h2>
      {state && <p style={{ color: '#aaa', fontSize: 14 }}>
        현재 차례: {state.currentSide} | 턴 {state.turn + 1}
      </p>}
      {role === 'move' && <MoveActions submit={submitAction} state={state} />}
      {role === 'wall' && <WallActions submit={submitAction} />}
    </div>
  );
}

function MoveActions({ submit, state }: { submit: (a: QuoridorAction) => void; state: QuoridorBroadcast | null }) {
  if (!state) return null;
  const myPawn = state.pawns[0]; // TODO: 자기 팀의 말 찾기 (slot에서 side 매핑)
  const moves: [string, number, number][] = [
    ['위', myPawn.x, myPawn.y - 1],
    ['아래', myPawn.x, myPawn.y + 1],
    ['왼', myPawn.x - 1, myPawn.y],
    ['오', myPawn.x + 1, myPawn.y],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 16 }}>
      {moves.map(([label, x, y]) => (
        <button
          key={label}
          onClick={() => submit({ kind: 'move', toX: x, toY: y })}
          style={btn('#06d6a0')}
        >
          {label} ({x},{y})
        </button>
      ))}
    </div>
  );
}

function WallActions({ submit }: { submit: (a: QuoridorAction) => void }) {
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [orientation, setOrientation] = useState<'h' | 'v'>('h');
  return (
    <div style={{ marginTop: 16, background: '#1a1a2e', padding: 14, borderRadius: 8 }}>
      <label style={{ color: '#aaa', fontSize: 13 }}>X (0~7): {x}</label>
      <input type="range" min={0} max={7} value={x} onChange={(e) => setX(+e.target.value)} style={{ width: '100%' }} />
      <label style={{ color: '#aaa', fontSize: 13 }}>Y (0~7): {y}</label>
      <input type="range" min={0} max={7} value={y} onChange={(e) => setY(+e.target.value)} style={{ width: '100%' }} />
      <div style={{ display: 'flex', gap: 6, margin: '10px 0' }}>
        <button onClick={() => setOrientation('h')} style={tab(orientation === 'h')}>가로 ↔</button>
        <button onClick={() => setOrientation('v')} style={tab(orientation === 'v')}>세로 ↕</button>
      </div>
      <button onClick={() => submit({ kind: 'wall', x, y, orientation })} style={btn('#8B4513')}>벽 설치</button>
    </div>
  );
}

const btn = (bg: string): React.CSSProperties => ({
  flex: 1, padding: 14, fontSize: 16,
  background: bg, color: '#fff', border: 'none',
  borderRadius: 8, cursor: 'pointer', fontWeight: 'bold',
});
const tab = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: 10, background: active ? '#e94560' : '#1a1a2e',
  color: '#fff', border: '1px solid #444', borderRadius: 6,
  cursor: 'pointer', fontWeight: 'bold',
});
