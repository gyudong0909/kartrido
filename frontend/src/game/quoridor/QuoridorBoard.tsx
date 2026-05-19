import { useEffect, useRef, useState } from 'react';
import { socket } from '../../socket';
import { QUORIDOR, type QuoridorBroadcast } from '@wheel-race/shared';

const SIZE = QUORIDOR.BOARD_SIZE;
const SIDE_COLORS: Record<string, string> = {
  top: '#e94560', bottom: '#4ea8de', left: '#06d6a0', right: '#ffd700',
};
const SIDE_LABEL: Record<string, string> = {
  top: '위(빨강)', bottom: '아래(파랑)', left: '왼쪽(초록)', right: '오른쪽(노랑)',
};
const TURN_ORDER = ['top', 'right', 'bottom', 'left'];

export default function QuoridorBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<QuoridorBroadcast | null>(null);
  const [timer, setTimer] = useState(30);

  useEffect(() => {
    const onState = (s: QuoridorBroadcast) => setState(s);
    socket.on('state:quoridor', onState);
    return () => { socket.off('state:quoridor', onState); };
  }, []);

  // 차례 바뀔 때 30초 카운트다운 자동 시작
  useEffect(() => {
    if (!state) return;
    setTimer(30);
    const id = setInterval(() => setTimer((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [state?.currentSide, state?.turn]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    draw(ctx, canvas.width, canvas.height, state, timer);
  }, [state, timer]);

  return (
    <div style={{ textAlign: 'center', width: '100%' }}>
      <canvas
        ref={canvasRef}
        width={1600}
        height={900}
        style={{ width: '100%', height: 'auto', maxWidth: '100vw', maxHeight: '85vh', borderRadius: 4 }}
      />
      {state && (
        <div style={{ color: '#ffd700', fontSize: 24, marginTop: 6 }}>
          턴 {state.turn + 1} — 현재 차례: <strong style={{ color: SIDE_COLORS[state.currentSide] }}>
            {SIDE_LABEL[state.currentSide]}
          </strong>
          <span style={{ color: '#aaa', fontSize: 16, marginLeft: 16 }}>
            순서: {TURN_ORDER.map((s, i) => {
              const p = state.pawns.find((pp) => pp.side === s);
              const isCur = s === state.currentSide;
              const dead = p?.finished;
              const sep = i < 3 ? ' → ' : ' ↺';
              return (
                <span key={s}>
                  <span style={{
                    color: isCur ? SIDE_COLORS[s] : (dead ? '#555' : '#888'),
                    textDecoration: dead ? 'line-through' : 'none',
                    fontWeight: isCur ? 'bold' : 'normal',
                  }}>
                    {SIDE_LABEL[s]}{dead && ' 💀'}
                  </span>
                  <span style={{ color: '#666' }}>{sep}</span>
                </span>
              );
            })}
          </span>
        </div>
      )}
    </div>
  );
}

function draw(ctx: CanvasRenderingContext2D, W: number, H: number, state: QuoridorBroadcast | null, timer: number = 30) {
  const boardPx = Math.min(W, H) - 240;
  const cell = boardPx / SIZE;
  const ox = (W - boardPx) / 2;
  const oy = (H - boardPx) / 2;

  ctx.fillStyle = '#0a0a18';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#2a2a4a';
  ctx.fillRect(ox, oy, boardPx, boardPx);

  ctx.strokeStyle = '#5a5a7a';
  ctx.lineWidth = 2;
  for (let i = 0; i <= SIZE; i++) {
    ctx.beginPath(); ctx.moveTo(ox + i * cell, oy); ctx.lineTo(ox + i * cell, oy + boardPx); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, oy + i * cell); ctx.lineTo(ox + boardPx, oy + i * cell); ctx.stroke();
  }

  // 목표 변 강조
  const edges: [string, [number, number, number, number]][] = [
    ['top', [ox, oy + boardPx, ox + boardPx, oy + boardPx]],
    ['bottom', [ox, oy, ox + boardPx, oy]],
    ['left', [ox + boardPx, oy, ox + boardPx, oy + boardPx]],
    ['right', [ox, oy, ox, oy + boardPx]],
  ];
  for (const [side, line] of edges) {
    ctx.strokeStyle = SIDE_COLORS[side] + 'aa';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(line[0], line[1]);
    ctx.lineTo(line[2], line[3]);
    ctx.stroke();
  }

  // 설치된 벽 (1칸 길이)
  if (state) {
    for (const w of state.walls) {
      ctx.fillStyle = '#8B4513';
      if (w.orientation === 'h') {
        // (w.x, w.y)와 (w.x, w.y+1) 사이 가로벽
        ctx.fillRect(ox + w.x * cell + 2, oy + (w.y + 1) * cell - 4, cell - 4, 8);
      } else {
        // (w.x, w.y)와 (w.x+1, w.y) 사이 세로벽
        ctx.fillRect(ox + (w.x + 1) * cell - 4, oy + w.y * cell + 2, 8, cell - 4);
      }
    }
  }

  // 말
  if (state) {
    for (const p of state.pawns) {
      if (p.finished) continue; // 사망 말은 보드에서 사라짐
      const px = ox + p.x * cell + cell / 2;
      const py = oy + p.y * cell + cell / 2;
      ctx.fillStyle = SIDE_COLORS[p.side];
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${cell * 0.3}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.side[0].toUpperCase(), px, py);
    }
  }

  // 각 변 바깥에 10개 벽 (잔량 = 목숨)
  if (state) {
    drawSideWallStock(ctx, state, ox, oy, boardPx);
  }

  // 큰 타이머 (왼쪽 상단)
  if (state) {
    const mm = String(Math.floor(timer / 60)).padStart(2, '0');
    const ss = String(timer % 60).padStart(2, '0');
    ctx.fillStyle = timer < 10 ? '#e94560' : '#ffd700';
    ctx.font = 'bold 96px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${mm}:${ss}`, 40, 40);
    ctx.fillStyle = '#aaa';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('남은 시간', 40, 20);
  }
}

function drawSideWallStock(
  ctx: CanvasRenderingContext2D,
  state: QuoridorBroadcast,
  ox: number, oy: number, boardPx: number,
) {
  const wallLen = 32;     // 변 수직 방향 길이
  const wallThick = 14;   // 두께
  const gap = 8;
  const offset = 30;      // 보드에서 떨어진 거리

  for (const p of state.pawns) {
    const color = SIDE_COLORS[p.side];
    // 각 변별로 시작점, 방향벡터 결정
    let startX = 0, startY = 0, dx = 0, dy = 0, nx = 0, ny = 0;
    if (p.side === 'top') {
      // 보드 위쪽 바깥 (보드 상단 = oy + boardPx (시작 변=아래쪽 = top 팀 목표 = boardPx))
      // top 팀 시작 위치는 보드 위쪽 (y=0). 잔량 벽은 위쪽 바깥
      const midX = ox + boardPx / 2;
      const midY = oy - offset;
      startX = midX; startY = midY;
      dx = 1; dy = 0;            // 가로로 나열
      nx = 0; ny = -1;           // 벽 방향 (수직, 위쪽 가리킴)
    } else if (p.side === 'bottom') {
      const midX = ox + boardPx / 2;
      const midY = oy + boardPx + offset;
      startX = midX; startY = midY;
      dx = 1; dy = 0;
      nx = 0; ny = 1;
    } else if (p.side === 'left') {
      const midX = ox - offset;
      const midY = oy + boardPx / 2;
      startX = midX; startY = midY;
      dx = 0; dy = 1;
      nx = -1; ny = 0;
    } else { // right
      const midX = ox + boardPx + offset;
      const midY = oy + boardPx / 2;
      startX = midX; startY = midY;
      dx = 0; dy = 1;
      nx = 1; ny = 0;
    }

    // 10개 벽 나열
    const step = wallThick + gap;
    for (let i = 0; i < 10; i++) {
      const off = (i - 4.5) * step;
      const wx = startX + dx * off;
      const wy = startY + dy * off;
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(Math.atan2(ny, nx));
      ctx.fillStyle = i < p.walls ? color : '#3a2a2a';
      ctx.fillRect(-wallLen / 2, -wallThick / 2, wallLen, wallThick);
      ctx.strokeStyle = '#5a2d0a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-wallLen / 2, -wallThick / 2, wallLen, wallThick);
      ctx.restore();
    }

    // 라벨
    const lblX = startX + nx * (wallLen / 2 + 24);
    const lblY = startY + ny * (wallLen / 2 + 24);
    ctx.fillStyle = color;
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${p.walls}/10`, lblX, lblY);
  }
}
