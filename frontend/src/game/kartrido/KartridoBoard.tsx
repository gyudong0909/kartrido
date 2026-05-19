import { useEffect, useRef, useState } from 'react';
import { socket } from '../../socket';
import type { KartridoBroadcast, TeamColor } from '@wheel-race/shared';

interface Trajectory {
  teams: TeamColor[];
  steps: Array<Array<{ x: number; y: number; bodyAngle: number }>>;
}

const W = 1600;
const H = 900;
const TOP_MARGIN = 40;
const SIDE_MARGIN = 110;
const BOTTOM_MARGIN = 140;
const CAR_W = 40;
const CAR_H = 24;
const WALL_LEN = (Math.min(W - 2 * SIDE_MARGIN, (H - TOP_MARGIN - BOTTOM_MARGIN) * 2 / Math.sqrt(3))) / 10;

const TEAM_COLOR: Record<TeamColor, string> = {
  red: '#e94560',
  blue: '#4ea8de',
  green: '#06d6a0',
};

function calcTriangle() {
  const maxBase = W - SIDE_MARGIN * 2;
  const maxHeight = H - TOP_MARGIN - BOTTOM_MARGIN;
  const base = Math.min(maxBase, (maxHeight * 2) / Math.sqrt(3));
  const height = (base * Math.sqrt(3)) / 2;
  const cx = W / 2;
  return {
    A: { x: cx, y: TOP_MARGIN },
    B: { x: cx - base / 2, y: TOP_MARGIN + height },
    C: { x: cx + base / 2, y: TOP_MARGIN + height },
  };
}

const TRI = calcTriangle();

function targetEdge(team: TeamColor): [{ x: number; y: number }, { x: number; y: number }] {
  if (team === 'red') return [TRI.B, TRI.C];
  if (team === 'blue') return [TRI.A, TRI.C];
  return [TRI.A, TRI.B];
}

export default function KartridoBoard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<KartridoBroadcast | null>(null);
  const trajRef = useRef<{ traj: Trajectory; startTime: number } | null>(null);
  const stateRef = useRef<KartridoBroadcast | null>(null);

  useEffect(() => {
    const onState = (s: KartridoBroadcast) => { setState(s); stateRef.current = s; };
    const onAnim = (t: Trajectory) => {
      trajRef.current = { traj: t, startTime: performance.now() };
    };
    socket.on('state:kartrido', onState);
    socket.on('state:kartrido-anim', onAnim);
    return () => {
      socket.off('state:kartrido', onState);
      socket.off('state:kartrido-anim', onAnim);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const render = () => {
      ctx.fillStyle = '#0a0a18';
      ctx.fillRect(0, 0, W, H);
      drawArena(ctx);

      const cur = stateRef.current;
      if (cur) for (const w of cur.walls) drawWall(ctx, w);

      // 나침반 (우측 공간)
      drawCompass(ctx);

      // 진영별 잔여 벽 (꼭지점 옆 10개 아이콘)
      if (cur) drawWallStock(ctx, cur.wallsRemaining);

      const playback = trajRef.current;
      if (playback) {
        const elapsed = performance.now() - playback.startTime;
        const DURATION = 5000; // 5초 애니메이션
        const steps = playback.traj.steps;
        const N = steps[0]?.length ?? 1;
        const tNorm = Math.min(elapsed / DURATION, 1);
        const stepIdx = tNorm * (N - 1);
        const i0 = Math.floor(stepIdx);
        const i1 = Math.min(i0 + 1, N - 1);
        const frac = stepIdx - i0;
        for (let ci = 0; ci < playback.traj.teams.length; ci++) {
          const team = playback.traj.teams[ci];
          const s0 = steps[ci][i0];
          const s1 = steps[ci][i1];
          drawCar(ctx, {
            team,
            x: s0.x + (s1.x - s0.x) * frac,
            y: s0.y + (s1.y - s0.y) * frac,
            bodyAngle: s0.bodyAngle + (s1.bodyAngle - s0.bodyAngle) * frac,
            finished: cur?.cars[ci]?.finished ?? false,
          });
        }
        if (tNorm >= 1) trajRef.current = null;
      } else if (cur) {
        for (const c of cur.cars) drawCar(ctx, c);
      } else {
        drawInitialCars(ctx);
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{
        width: '100%', height: 'auto',
        maxWidth: '100vw', maxHeight: '95vh',
        objectFit: 'contain',
        borderRadius: 4,
      }}
    />
  );
}

function drawArena(ctx: CanvasRenderingContext2D) {
  const { A, B, C } = TRI;
  // 잔디
  ctx.fillStyle = '#2a4a1e';
  ctx.beginPath();
  ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y);
  ctx.closePath(); ctx.fill();

  // 정삼각형 격자 — BC/AB/AC 세 방향 평행선
  const N = 10;
  const lerp = (P: { x: number; y: number }, Q: { x: number; y: number }, t: number) =>
    ({ x: P.x + (Q.x - P.x) * t, y: P.y + (Q.y - P.y) * t });

  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 1.2;

  for (let i = 1; i < N; i++) {
    const t = i / N;
    // BC와 평행: AB의 t ↔ AC의 t
    {
      const p1 = lerp(A, B, t);
      const p2 = lerp(A, C, t);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    // AB와 평행: AC의 t ↔ BC의 t
    {
      const p1 = lerp(A, C, t);
      const p2 = lerp(B, C, t);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    // AC와 평행: AB의 t ↔ CB의 t (= BC의 1-t)
    {
      const p1 = lerp(A, B, t);
      const p2 = lerp(C, B, t);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
  }

  // 격자점 (벽 설치 후보 위치) — 작은 점
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let a = 0; a <= N; a++) {
    for (let b = 0; b <= N - a; b++) {
      const c = N - a - b;
      // 무게중심 좌표 (a/N, b/N, c/N) → P = a*A + b*B + c*C
      const px = (a * A.x + b * B.x + c * C.x) / N;
      const py = (a * A.y + b * B.y + c * C.y) / N;
      // 꼭지점은 너무 크면 안 되니까 내부만 표시 (a,b,c 모두 양수)
      if (a === 0 || b === 0 || c === 0) continue;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 목표 변 — 라벨은 변 안쪽(무게중심 방향)에 배치 → 잘림 방지
  const centroid = {
    x: (TRI.A.x + TRI.B.x + TRI.C.x) / 3,
    y: (TRI.A.y + TRI.B.y + TRI.C.y) / 3,
  };
  for (const team of ['red', 'blue', 'green'] as TeamColor[]) {
    const [p1, p2] = targetEdge(team);
    ctx.strokeStyle = TEAM_COLOR[team] + '66';
    ctx.lineWidth = 16;
    ctx.setLineDash([22, 12]);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    ctx.setLineDash([]);
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    // 변 안쪽 방향 (무게중심 방향) 단위벡터 × 50
    const idx = centroid.x - mx, idy = centroid.y - my;
    const ilen = Math.hypot(idx, idy);
    const inset = 50;
    const lx = mx + (idx / ilen) * inset;
    const ly = my + (idy / ilen) * inset;
    ctx.fillStyle = TEAM_COLOR[team];
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 4;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lbl = `${teamNameKo(team)} 목표`;
    ctx.strokeText(lbl, lx, ly);
    ctx.fillText(lbl, lx, ly);
  }
  ctx.textBaseline = 'alphabetic';

  // 테두리
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y);
  ctx.closePath(); ctx.stroke();

  // 꼭짓점 라벨
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 4;
  for (const [lb, p, dx, dy] of [['A', A, 0, -18], ['B', B, -22, 28], ['C', C, 22, 28]] as const) {
    ctx.strokeText(lb, p.x + dx, p.y + dy);
    ctx.fillText(lb, p.x + dx, p.y + dy);
  }
}

function teamNameKo(t: TeamColor) {
  return t === 'red' ? '빨강팀' : t === 'blue' ? '파랑팀' : '초록팀';
}

function drawCar(ctx: CanvasRenderingContext2D, c: { team: TeamColor; x: number; y: number; bodyAngle: number; finished: boolean }) {
  const color = TEAM_COLOR[c.team];
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate((c.bodyAngle * Math.PI) / 180);

  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, -CAR_W / 2 + 3, -CAR_H / 2 + 4, CAR_W, CAR_H, 8);
  ctx.fill();

  // 차체
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  roundRect(ctx, -CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H, 8);
  ctx.fill(); ctx.stroke();

  // 헤드라이트
  ctx.fillStyle = '#ffe066';
  ctx.fillRect(CAR_W / 2 - 3, -CAR_H / 2 + 2, 4, 5);
  ctx.fillRect(CAR_W / 2 - 3, CAR_H / 2 - 7, 4, 5);

  // 앞유리
  ctx.fillStyle = 'rgba(120,180,255,0.55)';
  roundRect(ctx, CAR_W / 2 - 14, -CAR_H / 2 + 3, 10, CAR_H - 6, 2);
  ctx.fill();

  // 후미등
  ctx.fillStyle = '#ff3333';
  ctx.fillRect(-CAR_W / 2 - 1, -CAR_H / 2 + 3, 3, 4);
  ctx.fillRect(-CAR_W / 2 - 1, CAR_H / 2 - 7, 3, 4);

  // 전진 화살표
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(CAR_W / 2 + 8, 0);
  ctx.lineTo(CAR_W / 2 + 2, -5);
  ctx.lineTo(CAR_W / 2 + 2, 5);
  ctx.closePath(); ctx.fill();

  ctx.restore();

  // 팀 이름
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 4;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  const txt = `${teamNameKo(c.team)}${c.finished ? ' ✓' : ''}`;
  ctx.strokeText(txt, c.x, c.y - 42);
  ctx.fillText(txt, c.x, c.y - 42);
}

function drawWall(ctx: CanvasRenderingContext2D, w: { x: number; y: number; orientation: number }) {
  const rad = (w.orientation * Math.PI) / 180;
  const dx = Math.cos(rad) * (WALL_LEN / 2);
  const dy = Math.sin(rad) * (WALL_LEN / 2);
  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w.x - dx, w.y - dy);
  ctx.lineTo(w.x + dx, w.y + dy);
  ctx.stroke();
  ctx.strokeStyle = '#5a2d0a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w.x - dx, w.y - dy);
  ctx.lineTo(w.x + dx, w.y + dy);
  ctx.stroke();
}

function gridPointPx(a: number, b: number) {
  const N = 10;
  const c = N - a - b;
  return {
    x: (a * TRI.A.x + b * TRI.B.x + c * TRI.C.x) / N,
    y: (a * TRI.A.y + b * TRI.B.y + c * TRI.C.y) / N,
  };
}

function drawInitialCars(ctx: CanvasRenderingContext2D) {
  const centroid = {
    x: (TRI.A.x + TRI.B.x + TRI.C.x) / 3,
    y: (TRI.A.y + TRI.B.y + TRI.C.y) / 3,
  };
  const T = 26 / 3, S = 2 / 3;
  const positions: Record<TeamColor, { x: number; y: number }> = {
    red: gridPointPx(T, S),
    blue: gridPointPx(S, T),
    green: gridPointPx(S, S),
  };
  for (const team of ['red', 'blue', 'green'] as TeamColor[]) {
    const sp = positions[team];
    const bodyAngle = (Math.atan2(centroid.y - sp.y, centroid.x - sp.x) * 180) / Math.PI;
    drawCar(ctx, { team, x: sp.x, y: sp.y, bodyAngle, finished: false });
  }
}

function drawWallStock(
  ctx: CanvasRenderingContext2D,
  remaining: { red: number; blue: number; green: number },
) {
  // 각 팀 자기 목표 변 바깥쪽에 10개 벽 (변과 평행 나열, 각 벽은 변과 수직)
  // 빨강 → BC, 파랑 → AC, 초록 → AB
  const edges: Array<{ team: 'red' | 'blue' | 'green'; a: {x:number;y:number}; b: {x:number;y:number}; color: string }> = [
    { team: 'red',   a: TRI.B, b: TRI.C, color: '#e94560' },
    { team: 'blue',  a: TRI.A, b: TRI.C, color: '#4ea8de' },
    { team: 'green', a: TRI.A, b: TRI.B, color: '#06d6a0' },
  ];
  const wallLen = WALL_LEN;
  const wallThick = 28;      // 15개 들어가도록 약간 줄임
  const gap = 14;
  const OFFSET = wallLen / 2 + 18;

  for (const e of edges) {
    const rem = remaining[e.team];
    // 변 방향 t (a→b)
    const dx = e.b.x - e.a.x;
    const dy = e.b.y - e.a.y;
    const len = Math.hypot(dx, dy);
    const tx = dx / len, ty = dy / len;
    // 외향 법선 n (삼각형 밖 방향) — 무게중심 반대편
    let nx = -ty, ny = tx;
    // centroid 기준으로 외향 확인
    const midX = (e.a.x + e.b.x) / 2;
    const midY = (e.a.y + e.b.y) / 2;
    const cx = (TRI.A.x + TRI.B.x + TRI.C.x) / 3;
    const cy = (TRI.A.y + TRI.B.y + TRI.C.y) / 3;
    if ((midX + nx - cx) ** 2 + (midY + ny - cy) ** 2 <
        (midX - cx) ** 2 + (midY - cy) ** 2) {
      nx = -nx; ny = -ny;
    }
    // 15개 나열: 중심 기준 ±(i - 7) * step
    const step = wallThick + gap;
    const stockMid = { x: midX + nx * OFFSET, y: midY + ny * OFFSET };
    const wallRotRad = Math.atan2(ny, nx);
    for (let i = 0; i < 15; i++) {
      const off = (i - 7) * step;
      const wx = stockMid.x + tx * off;
      const wy = stockMid.y + ty * off;
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(wallRotRad);
      // 사각형 (가로=wallLen, 세로=wallThick), 회전된 좌표계에서
      ctx.fillStyle = i < rem ? e.color : '#3a2a2a';
      ctx.fillRect(-wallLen / 2, -wallThick / 2, wallLen, wallThick);
      // 얇은 갈색 테두리
      ctx.strokeStyle = '#5a2d0a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-wallLen / 2, -wallThick / 2, wallLen, wallThick);
      ctx.restore();
    }
    // 라벨 (벽 너머 더 멀리)
    const lblX = midX + nx * (OFFSET + wallLen / 2 + 32);
    const lblY = midY + ny * (OFFSET + wallLen / 2 + 32);
    ctx.fillStyle = e.color;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${rem}/15`, lblX, lblY);
  }
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number, toX: number, toY: number,
  color: string, headSize: number, lineWidth: number,
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  // 본체 선
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX - Math.cos(angle) * headSize * 0.7, toY - Math.sin(angle) * headSize * 0.7);
  ctx.stroke();
  // 머리 삼각형
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - Math.cos(angle - Math.PI / 6) * headSize,
    toY - Math.sin(angle - Math.PI / 6) * headSize,
  );
  ctx.lineTo(
    toX - Math.cos(angle + Math.PI / 6) * headSize,
    toY - Math.sin(angle + Math.PI / 6) * headSize,
  );
  ctx.closePath();
  ctx.fill();
}

function drawCompass(ctx: CanvasRenderingContext2D) {
  const cx = 1370;
  const cy = 230; // 더 위로
  const R = 160;

  // 배경
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.arc(cx, cy, R + 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 내부 원
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();

  // 18방향 숫자 표시 (0, 20, 40, ..., 340)
  for (let a = 0; a < 360; a += 20) {
    const rad = (a * Math.PI) / 180;
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * (R - 30), cy + Math.sin(rad) * (R - 30));
    ctx.lineTo(cx + Math.cos(rad) * R, cy + Math.sin(rad) * R);
    ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${a}°`, cx + Math.cos(rad) * (R + 22), cy + Math.sin(rad) * (R + 22));
  }

  // 6방향 큰 화살표 (30, 90, 150, 210, 270, 330) — Canvas로 정확한 각도 그리기
  const cardinals = [30, 90, 150, 210, 270, 330];
  for (const a of cardinals) {
    const rad = (a * Math.PI) / 180;
    // 중심에서 외곽으로 화살표
    const inner = 30;
    const outer = R - 50;
    const fromX = cx + Math.cos(rad) * inner;
    const fromY = cy + Math.sin(rad) * inner;
    const toX = cx + Math.cos(rad) * outer;
    const toY = cy + Math.sin(rad) * outer;
    drawArrow(ctx, fromX, fromY, toX, toY, '#fff', 22, 6);
  }

  // 중심 점
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();

  // 라벨
  ctx.fillStyle = '#aaa';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('방향 각도 (20° 단위)', cx, cy - R - 50);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
