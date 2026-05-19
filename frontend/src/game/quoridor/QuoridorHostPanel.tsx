import { useEffect, useRef, useState } from 'react';
import { socket } from '../../socket';
import type { QuoridorBroadcast } from '@wheel-race/shared';
import { validMoves } from './quoridorRules';

const SIDE_LABEL: Record<string, string> = {
  top: '🔴 위(빨강)', bottom: '🔵 아래(파랑)', left: '🟢 왼쪽(초록)', right: '🟡 오른쪽(노랑)',
};
const SIDE_COLOR: Record<string, string> = {
  top: '#e94560', bottom: '#4ea8de', left: '#06d6a0', right: '#ffd700',
};
const TURN_ORDER = ['top', 'right', 'bottom', 'left']; // 시계방향

interface Props {
  code: string;
  hostToken: string;
}

export default function QuoridorHostPanel({ code, hostToken }: Props) {
  const [state, setState] = useState<QuoridorBroadcast | null>(null);
  const [timerSec, setTimerSec] = useState(30);
  const [running, setRunning] = useState(false);

  // 입력 상태 — 디폴트 둘 다 체크
  const [doMove, setDoMove] = useState(true);
  const [moveTarget, setMoveTarget] = useState<{ toX: number; toY: number } | null>(null);
  const [doWall, setDoWall] = useState(true);
  const [wallX, setWallX] = useState(0);
  const [wallY, setWallY] = useState(0);
  const [wallO, setWallO] = useState<'h' | 'v'>('h');

  useEffect(() => {
    const onState = (s: QuoridorBroadcast) => setState(s);
    socket.on('state:quoridor', onState);
    return () => { socket.off('state:quoridor', onState); };
  }, []);

  useEffect(() => {
    if (!running) return;
    if (timerSec <= 0) return;
    const id = setInterval(() => setTimerSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [running, timerSec]);

  useEffect(() => {
    if (state) {
      setTimerSec(30);
      setRunning(true);
      // 차례 바뀔 때 디폴트 둘 다 체크
      setDoMove(true);
      setDoWall(true);
      setMoveTarget(null);
    }
  }, [state?.currentSide, state?.turn]);

  function submit() {
    if (!state) return;
    const side = state.currentSide;
    const move = (doMove && moveTarget) ? moveTarget : undefined;
    const wall = doWall ? { x: wallX, y: wallY, orientation: wallO } : undefined;
    socket.emit('host:quoridor-act', { code, hostToken, side: side as any, move, wall });
  }

  function nextTurn() {
    socket.emit('host:quoridor-next-turn', { code, hostToken });
  }
  function undo() {
    if (!confirm('이전 상태로 되돌리시겠습니까?')) return;
    socket.emit('host:quoridor-undo', { code, hostToken });
  }

  if (!state) return <div style={{ color: '#aaa', padding: 20 }}>협동쿼리도 상태 대기...</div>;

  const cur = state.pawns.find((p) => p.side === state.currentSide);
  const curIdx = TURN_ORDER.indexOf(state.currentSide);

  return (
    <div style={{ padding: 12 }}>
      {/* 헤더: 현재 차례 + 타이머 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20,
        padding: 14, marginBottom: 16, borderRadius: 8,
        background: '#1a1a3a', border: `3px solid ${SIDE_COLOR[state.currentSide]}`,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#aaa', fontSize: 13 }}>턴 {state.turn + 1} · 현재 차례</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: SIDE_COLOR[state.currentSide] }}>
            {SIDE_LABEL[state.currentSide]}
          </div>
        </div>
        <div style={{
          fontSize: 56, fontWeight: 'bold',
          color: timerSec < 10 ? '#e94560' : '#ffd700',
          fontFamily: 'monospace',
        }}>
          {String(Math.floor(timerSec / 60)).padStart(2, '0')}:{String(timerSec % 60).padStart(2, '0')}
        </div>
      </div>

      {/* 타이머 / 차례 컨트롤 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: '#aaa' }}>타이머:</span>
        <button onClick={() => { setTimerSec(30); setRunning(true); }} style={smallBtn('#4ea8de')}>30초 리셋</button>
        <button onClick={() => setTimerSec((s) => s + 10)} style={smallBtn('#06d6a0')}>+10초</button>
        <button onClick={() => setTimerSec((s) => Math.max(0, s - 10))} style={smallBtn('#aa4444')}>-10초</button>
        <button onClick={() => setRunning((r) => !r)} style={smallBtn('#888')}>{running ? '⏸ 일시정지' : '▶ 재개'}</button>
        <button onClick={nextTurn} style={smallBtn('#ffd700')}>⏭ 다음 차례 (스킵)</button>
        <button onClick={undo} style={smallBtn('#aa6600')}>↶ 되돌리기</button>
      </div>

      {/* 순서 시계방향 표시 */}
      <div style={{ marginBottom: 16, padding: 10, background: '#0f1a3a', borderRadius: 6 }}>
        <div style={{ color: '#aaa', fontSize: 13, marginBottom: 6 }}>순서 진행 (시계방향)</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {TURN_ORDER.map((s, i) => {
            const p = state.pawns.find((pp) => pp.side === s);
            const isCur = s === state.currentSide;
            const isDead = p?.finished;
            return (
              <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 13,
                  background: isCur ? SIDE_COLOR[s] : '#222',
                  color: isCur ? '#fff' : (isDead ? '#666' : '#aaa'),
                  textDecoration: isDead ? 'line-through' : 'none',
                  fontWeight: isCur ? 'bold' : 'normal',
                }}>{SIDE_LABEL[s]}{isDead && ' 💀'}</span>
                {i < TURN_ORDER.length - 1 && <span style={{ color: '#666' }}>→</span>}
              </span>
            );
          })}
          <span style={{ color: '#666' }}>↺</span>
        </div>
      </div>

      {/* 4팀 목숨/벽 잔량 + 위치 조정 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {state.pawns.map((p) => (
          <div key={p.side} style={{
            padding: 10, borderRadius: 6,
            background: '#1a1a3a', border: `2px solid ${SIDE_COLOR[p.side]}`,
            opacity: p.finished ? 0.4 : 1,
          }}>
            <div style={{ color: SIDE_COLOR[p.side], fontWeight: 'bold', marginBottom: 4 }}>
              {SIDE_LABEL[p.side]} {p.finished && '💀'}
            </div>
            <div style={{ fontSize: 13, color: '#fff' }}>위치 ({p.x}, {p.y})</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>목숨 <b style={{ color: '#ffd700' }}>{p.walls}/10</b></div>
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
              <button onClick={() => {
                const nx = prompt(`X (0~8)`, String(p.x));
                const ny = prompt(`Y (0~8)`, String(p.y));
                if (nx !== null && ny !== null) {
                  socket.emit('host:quoridor-set-pos', { code, hostToken, side: p.side as any, x: +nx, y: +ny });
                }
              }} style={editBtn}>📍 위치</button>
              <button onClick={() => {
                const w = prompt(`벽 잔량 (0~99)`, String(p.walls));
                if (w !== null) {
                  socket.emit('host:quoridor-set-walls', { code, hostToken, side: p.side as any, walls: +w });
                }
              }} style={editBtn}>🧱 벽</button>
              <button onClick={() => {
                socket.emit('host:quoridor-set-death', { code, hostToken, side: p.side as any, dead: !p.finished });
              }} style={{ ...editBtn, background: p.finished ? '#06d6a0' : '#aa4444' }}>
                {p.finished ? '🪄 부활' : '💀 사망'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 현재 차례 입력 */}
      {cur && !cur.finished && (
        <div style={{ padding: 16, background: '#0f1a3a', borderRadius: 8 }}>
          <h3 style={{ color: SIDE_COLOR[cur.side], marginBottom: 12 }}>
            {SIDE_LABEL[cur.side]} 입력 (벽·이동 둘 다 또는 둘 다 안 함 → 페널티)
          </h3>

          {/* 이동 — valid 방향만 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginBottom: 8 }}>
              <input type="checkbox" checked={doMove} onChange={(e) => setDoMove(e.target.checked)} />
              <strong style={{ color: '#06d6a0' }}>이동 (valid 방향만 표시)</strong>
            </label>
            {doMove && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {validMoves(state, state.currentSide).map((m) => {
                  const isSelected = moveTarget?.toX === m.toX && moveTarget?.toY === m.toY;
                  return (
                    <button key={`${m.toX},${m.toY}`} onClick={() => setMoveTarget(m)} style={dirBtn(isSelected)}>
                      {m.label}<br/><span style={{ fontSize: 10, color: '#888' }}>({m.toX},{m.toY})</span>
                    </button>
                  );
                })}
                {validMoves(state, state.currentSide).length === 0 && (
                  <div style={{ gridColumn: 'span 4', padding: 8, color: '#888', textAlign: 'center' }}>
                    이동 가능 방향 없음
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 벽 설치 — 미니맵 클릭 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginBottom: 8 }}>
              <input type="checkbox" checked={doWall} onChange={(e) => setDoWall(e.target.checked)} />
              <strong style={{ color: '#8B4513' }}>벽 설치 (보드 클릭)</strong>
            </label>
            {doWall && (
              <WallClickMap
                state={state}
                selected={{ x: wallX, y: wallY, orientation: wallO }}
                onSelect={(x, y, o) => { setWallX(x); setWallY(y); setWallO(o); }}
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setDoMove(false); setDoWall(false); }}
              style={{
                padding: 14, fontSize: 14, background: '#444', color: '#fff',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold',
              }}
            >🗑 선택 초기화</button>
            <button onClick={submit} style={{
              flex: 1, padding: 14, fontSize: 18,
              background: '#e94560', color: '#fff', border: 'none',
              borderRadius: 8, cursor: 'pointer', fontWeight: 'bold',
            }}>
              적용 + 다음 차례
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 벽 클릭 미니맵 — 가까운 unit edge 자동 선택
function WallClickMap({
  state, selected, onSelect,
}: {
  state: QuoridorBroadcast;
  selected: { x: number; y: number; orientation: 'h' | 'v' };
  onSelect: (x: number, y: number, o: 'h' | 'v') => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const SZ = 320;
  const SIZE = 9;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, SZ, SZ);
    const m = 16;
    const boardPx = SZ - 2 * m;
    const cell = boardPx / SIZE;
    const ox = m, oy = m;
    // 보드
    ctx.fillStyle = '#2a2a4a';
    ctx.fillRect(ox, oy, boardPx, boardPx);
    ctx.strokeStyle = '#557'; ctx.lineWidth = 1;
    for (let i = 0; i <= SIZE; i++) {
      ctx.beginPath(); ctx.moveTo(ox + i * cell, oy); ctx.lineTo(ox + i * cell, oy + boardPx); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy + i * cell); ctx.lineTo(ox + boardPx, oy + i * cell); ctx.stroke();
    }
    // 기존 벽 (2칸)
    for (const w of state.walls) {
      ctx.fillStyle = '#8B4513';
      if (w.orientation === 'h') {
        ctx.fillRect(ox + w.x * cell + 2, oy + (w.y + 1) * cell - 3, cell * 2 - 4, 6);
      } else {
        ctx.fillRect(ox + (w.x + 1) * cell - 3, oy + w.y * cell + 2, 6, cell * 2 - 4);
      }
    }
    // 말
    const SIDE_C: Record<string, string> = { top: '#e94560', bottom: '#4ea8de', left: '#06d6a0', right: '#ffd700' };
    for (const p of state.pawns) {
      if (p.finished) continue;
      ctx.fillStyle = SIDE_C[p.side];
      ctx.beginPath();
      ctx.arc(ox + p.x * cell + cell / 2, oy + p.y * cell + cell / 2, cell * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // 선택된 벽 미리보기 (2칸)
    ctx.fillStyle = '#e94560';
    if (selected.orientation === 'h') {
      ctx.fillRect(ox + selected.x * cell + 2, oy + (selected.y + 1) * cell - 4, cell * 2 - 4, 8);
    } else {
      ctx.fillRect(ox + (selected.x + 1) * cell - 4, oy + selected.y * cell + 2, 8, cell * 2 - 4);
    }
  }, [state, selected]);

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (SZ / rect.width);
    const my = (e.clientY - rect.top) * (SZ / rect.height);
    const m = 16;
    const boardPx = SZ - 2 * m;
    const cell = boardPx / SIZE;
    const ox = m, oy = m;
    // 가장 가까운 가로 격자선 / 세로 격자선 거리 비교 → 벽 방향 결정
    let bestHy = 0, bestHd = Infinity;
    let bestVx = 0, bestVd = Infinity;
    for (let i = 0; i < SIZE - 1; i++) {
      const dH = Math.abs(my - (oy + (i + 1) * cell));
      if (dH < bestHd) { bestHd = dH; bestHy = i; }
      const dV = Math.abs(mx - (ox + (i + 1) * cell));
      if (dV < bestVd) { bestVd = dV; bestVx = i; }
    }
    let best: { x: number; y: number; o: 'h' | 'v' };
    if (bestHd < bestVd) {
      // 가로 벽 (h) — y = bestHy, x는 클릭에 가장 가까운 칸 (0~SIZE-2)
      const xw = Math.max(0, Math.min(SIZE - 2, Math.round((mx - ox) / cell) - 1));
      best = { x: xw, y: bestHy, o: 'h' };
    } else {
      const yw = Math.max(0, Math.min(SIZE - 2, Math.round((my - oy) / cell) - 1));
      best = { x: bestVx, y: yw, o: 'v' };
    }
    onSelect(best.x, best.y, best.o);
  }

  return (
    <div style={{ background: '#0a0a1a', padding: 10, borderRadius: 6 }}>
      <div style={{ color: '#aaa', fontSize: 12, marginBottom: 6 }}>
        보드의 격자선 클릭 → 벽 선택 ({selected.x},{selected.y},{selected.orientation})
      </div>
      <canvas
        ref={canvasRef}
        width={320}
        height={320}
        onClick={onClick}
        style={{ display: 'block', cursor: 'pointer', borderRadius: 4, maxWidth: '100%' }}
      />
    </div>
  );
}

const editBtn: React.CSSProperties = {
  fontSize: 10, padding: 4, background: '#444', color: '#fff',
  border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 'bold',
};

const smallBtn = (bg: string): React.CSSProperties => ({
  padding: '6px 12px', fontSize: 13, background: bg, color: '#fff',
  border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold',
});
const dirBtn = (active: boolean): React.CSSProperties => ({
  padding: 10, fontSize: 14, fontWeight: 'bold',
  background: active ? '#06d6a0' : '#222', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer',
});
const tabBtn = (active: boolean): React.CSSProperties => ({
  flex: 1, padding: 6, background: active ? '#e94560' : '#222',
  color: '#fff', border: '1px solid #444', borderRadius: 4, cursor: 'pointer',
});
