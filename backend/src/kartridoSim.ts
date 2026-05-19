// 카트라이도 시뮬레이션 — 벽 → 이동 순서로 처리
// 1600×900 캔버스 좌표계. 웹 각도 컨벤션 (0°=→, 90°=↓)

import { KARTRIDO, TEAM_COLORS, TeamColor, WHEEL_POS } from '@wheel-race/shared';

// 좌표/캔버스
const W = 1600;
const H = 900;
// 비대칭 마진 — 상단 작게(판 위로), 하단 크게(잔량 벽 공간 확보)
const TOP_MARGIN = 40;
const SIDE_MARGIN = 110;
const BOTTOM_MARGIN = 140;
const MARGIN = TOP_MARGIN; // 호환용
const CAR_R = 15;          // 차량 충돌 반경 (격자 안에 들어가는 크기)
const CAR_W = 40;          // 차량 가로 (검증용)
const CAR_H = 24;          // 차량 세로 (검증용)
const MOVE_SCALE = 88;     // 회전수 N → 5초 동안 N × 88px 이동 (= N 격자 unit)
const ANIM_STEPS = 200;    // 5초 시뮬레이션 미세 스텝
const GRID_N = 10;         // 격자 분할 수

function calcTriangle() {
  const maxBase = W - SIDE_MARGIN * 2;
  const maxHeight = H - TOP_MARGIN - BOTTOM_MARGIN;
  const base = Math.min(maxBase, (maxHeight * 2) / Math.sqrt(3));
  const height = (base * Math.sqrt(3)) / 2;
  const cx = W / 2;
  const bottomY = TOP_MARGIN + height;
  const topY = TOP_MARGIN;
  return {
    A: { x: cx, y: topY },
    B: { x: cx - base / 2, y: bottomY },
    C: { x: cx + base / 2, y: bottomY },
  };
}

export const TRI = calcTriangle();
export const CENTROID = {
  x: (TRI.A.x + TRI.B.x + TRI.C.x) / 3,
  y: (TRI.A.y + TRI.B.y + TRI.C.y) / 3,
};

// 격자 unit edge 길이 (변 길이 / N)
const SIDE_LEN = Math.hypot(TRI.B.x - TRI.C.x, TRI.B.y - TRI.C.y);
export const WALL_LEN = SIDE_LEN / GRID_N;

// 격자점 (a, b, c) → 픽셀 (a+b+c = GRID_N)
export function gridPointPx(a: number, b: number): { x: number; y: number } {
  const c = GRID_N - a - b;
  return {
    x: (a * TRI.A.x + b * TRI.B.x + c * TRI.C.x) / GRID_N,
    y: (a * TRI.A.y + b * TRI.B.y + c * TRI.C.y) / GRID_N,
  };
}

// 격자 unit edge: 시작 (a,b) + 방향 → (px 중심, 각도)
export type GridDir = 'AB' | 'AC' | 'BC';
export function gridEdgeToWall(a: number, b: number, dir: GridDir): { x: number; y: number; orientation: number } | null {
  const c = GRID_N - a - b;
  if (a < 0 || b < 0 || c < 0) return null;
  let a2 = a, b2 = b;
  if (dir === 'AB') { a2 = a + 1; b2 = b - 1; }
  else if (dir === 'AC') { a2 = a + 1; b2 = b; }
  else { a2 = a; b2 = b + 1; }
  const c2 = GRID_N - a2 - b2;
  if (a2 < 0 || b2 < 0 || c2 < 0 || a2 > GRID_N || b2 > GRID_N) return null;
  const p1 = gridPointPx(a, b);
  const p2 = gridPointPx(a2, b2);
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    orientation: (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI,
  };
}

export function startPosition(team: TeamColor) {
  // 꼭지점 다음 작은 정삼각형(↓ 셀) 중심 (이전에 규동님이 채택한 위치)
  // BFS는 pxToGridPoint가 변 위 매핑 시 내부 격자점으로 자동 조정함
  const T = 26 / 3, S = 2 / 3;
  if (team === 'red')   return gridPointPx(T, S);
  if (team === 'blue')  return gridPointPx(S, T);
  return gridPointPx(S, S);
}

export function targetEdge(team: TeamColor): [Pt, Pt] {
  if (team === 'red') return [TRI.B, TRI.C];
  if (team === 'blue') return [TRI.A, TRI.C];
  return [TRI.A, TRI.B];
}

type Pt = { x: number; y: number };

export interface WheelMove {
  angle: number;
  rot: number;
}

export interface CarSim {
  team: TeamColor;
  x: number;
  y: number;
  bodyAngle: number;
  wheels: WheelMove[]; // 4개
  finished: boolean;
  stoppedByWall: boolean;
}

export interface WallSim {
  x: number;
  y: number;
  orientation: number;
  ownerTeam: TeamColor;
  // 격자 정보 (BFS 검증용)
  a: number;
  b: number;
  dir: GridDir;
}

export function startBodyAngle(team: TeamColor): number {
  // 시작 위치에서 목표 변(= 무게중심) 방향을 바라보도록
  const sp = startPosition(team);
  const dx = CENTROID.x - sp.x;
  const dy = CENTROID.y - sp.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export function makeInitialCars(): CarSim[] {
  return TEAM_COLORS.map((team) => {
    const sp = startPosition(team);
    return {
      team,
      x: sp.x,
      y: sp.y,
      bodyAngle: startBodyAngle(team),
      wheels: WHEEL_POS.map(() => ({ angle: 10, rot: 1 })),
      finished: false,
      stoppedByWall: false,
    };
  });
}

// ─── 기하 헬퍼 ────────────────────────────
function ptSegDist(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function nearestOnSeg(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { ...a };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function sign(p: Pt, a: Pt, b: Pt) {
  return (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
}

function inTriangle(p: Pt) {
  const d1 = sign(p, TRI.A, TRI.B);
  const d2 = sign(p, TRI.B, TRI.C);
  const d3 = sign(p, TRI.C, TRI.A);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function constrainToTriangle(c: CarSim) {
  // 차량 사각형 모서리 4개 중 변 밖으로 나간 만큼 안쪽으로 밀어넣음
  const edges: [Pt, Pt][] = [
    [TRI.A, TRI.B], [TRI.B, TRI.C], [TRI.C, TRI.A],
  ];
  for (let iter = 0; iter < 3; iter++) {
    const poly = carPolygonInternal(c);
    let moved = false;
    for (const [a, b] of edges) {
      // 변의 외향 법선 (centroid 반대 방향)
      const dx = b.x - a.x, dy = b.y - a.y;
      let nx = -dy, ny = dx;
      const len = Math.hypot(nx, ny);
      nx /= len; ny /= len;
      // centroid 기준 외향 방향 결정
      const cmx = (a.x + b.x) / 2, cmy = (a.y + b.y) / 2;
      if ((cmx + nx - CENTROID.x) ** 2 + (cmy + ny - CENTROID.y) ** 2 <
          (cmx - CENTROID.x) ** 2 + (cmy - CENTROID.y) ** 2) {
        nx = -nx; ny = -ny;
      }
      // 가장 외부로 튀어나간 모서리 거리
      let maxOut = 0;
      for (const p of poly) {
        const d = (p.x - a.x) * nx + (p.y - a.y) * ny;
        if (d > maxOut) maxOut = d;
      }
      if (maxOut > 0.01) {
        c.x -= nx * maxOut;
        c.y -= ny * maxOut;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

// 내부용 (carPolygon은 export, internal은 동일 로직)
function carPolygonInternal(c: { x: number; y: number; bodyAngle: number }): Pt[] {
  const rad = (c.bodyAngle * Math.PI) / 180;
  const cs = Math.cos(rad), sn = Math.sin(rad);
  const w = CAR_W / 2, h = CAR_H / 2;
  const corners = [
    { x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h },
  ];
  return corners.map((p) => ({
    x: c.x + p.x * cs - p.y * sn,
    y: c.y + p.x * sn + p.y * cs,
  }));
}

// 벽을 선분으로 변환
function wallSegment(w: WallSim): [Pt, Pt] {
  const rad = (w.orientation * Math.PI) / 180;
  const dx = Math.cos(rad) * (WALL_LEN / 2);
  const dy = Math.sin(rad) * (WALL_LEN / 2);
  return [
    { x: w.x - dx, y: w.y - dy },
    { x: w.x + dx, y: w.y + dy },
  ];
}

// 점-벽 충돌 (선분과 원 충돌) — 가장 가까운 벽 반환
function pointHitsWall(p: Pt, walls: WallSim[]): WallSim | null {
  for (const w of walls) {
    const [a, b] = wallSegment(w);
    if (ptSegDist(p, a, b) < CAR_R) return w;
  }
  return null;
}

// ─── 차량 이동 계산 (4바퀴 평균) ───────────
export function calcMovement(car: CarSim) {
  const wp = [
    { x: 1, y: -1 }, { x: 1, y: 1 },
    { x: -1, y: -1 }, { x: -1, y: 1 },
  ];
  let sumFx = 0, sumFy = 0, sumTorque = 0;
  for (let i = 0; i < 4; i++) {
    const w = car.wheels[i];
    const rad = (w.angle * Math.PI) / 180;
    const force = w.rot * MOVE_SCALE;
    const fx = Math.cos(rad) * force;
    const fy = Math.sin(rad) * force;
    sumFx += fx; sumFy += fy;
    const ba = (car.bodyAngle * Math.PI) / 180;
    const cb = Math.cos(-ba), sb = Math.sin(-ba);
    const lfx = fx * cb - fy * sb;
    const lfy = fx * sb + fy * cb;
    sumTorque += wp[i].x * lfy - wp[i].y * lfx;
  }
  return {
    dx: sumFx / 4,
    dy: sumFy / 4,
    torque: (sumTorque / 4) * 1.2,
  };
}

export interface CarSnapshot { x: number; y: number; bodyAngle: number }
export type RoundTrajectory = CarSnapshot[][]; // [carIdx][step]

// ─── 1라운드 시뮬레이션 ────────────────────
export function simulateRound(
  cars: CarSim[],
  walls: WallSim[]
): { cars: CarSim[]; finishedAny: boolean; trajectory: RoundTrajectory } {
  // 각 차의 라운드 이동·토크 계산
  const moves = cars.map((c) =>
    c.finished || c.stoppedByWall ? { dx: 0, dy: 0, torque: 0 } : calcMovement(c)
  );

  const trajectory: RoundTrajectory = cars.map((c) => [
    { x: c.x, y: c.y, bodyAngle: c.bodyAngle },
  ]);

  for (let step = 0; step < ANIM_STEPS; step++) {
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (c.finished) continue;
      const prevX = c.x, prevY = c.y;
      const stepDx = moves[i].dx / ANIM_STEPS;
      const stepDy = moves[i].dy / ANIM_STEPS;
      c.x += stepDx;
      c.y += stepDy;
      c.bodyAngle += moves[i].torque / ANIM_STEPS;

      // 벽 충돌 — 비탄성 슬라이딩 (벽 따라 미끄러짐)
      const hitWall = pointHitsWall({ x: c.x, y: c.y }, walls);
      if (hitWall) {
        // 벽 방향 단위벡터 t
        const [wa, wb] = wallSegment(hitWall);
        const wdx = wb.x - wa.x, wdy = wb.y - wa.y;
        const wlen = Math.hypot(wdx, wdy);
        const tx = wdx / wlen, ty = wdy / wlen;
        // step 변위를 벽 방향으로 projection
        const proj = stepDx * tx + stepDy * ty;
        c.x = prevX + tx * proj;
        c.y = prevY + ty * proj;
        // 이후 변위도 벽 방향만 유지
        const totalProj = (moves[i].dx * tx + moves[i].dy * ty);
        moves[i].dx = tx * totalProj;
        moves[i].dy = ty * totalProj;
        // 한 번 더 벽 충돌이면 정지
        if (pointHitsWall({ x: c.x, y: c.y }, walls)) {
          c.x = prevX; c.y = prevY;
          moves[i] = { dx: 0, dy: 0, torque: 0 };
        }
      }
    }
    for (const c of cars) if (!c.finished) constrainToTriangle(c);
    // 차-차 충돌 — 사각형 외접원 근사 (반경 = 외접원 반경)
    const CAR_HALF_DIAG = Math.hypot(CAR_W / 2, CAR_H / 2);
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = CAR_HALF_DIAG * 2 * 0.85; // 외접원 너무 크니 약간 줄임
        if (dist >= minDist || dist < 0.01) continue;
        const nx = dx / dist, ny = dy / dist;
        const ov = minDist - dist;
        if (!a.finished) { a.x -= nx * ov * 0.5; a.y -= ny * ov * 0.5; }
        if (!b.finished) { b.x += nx * ov * 0.5; b.y += ny * ov * 0.5; }
        // 비탄성 충돌 — 속도 평균 (moves)
        if (!a.finished && !b.finished) {
          const avgDx = (moves[i].dx + moves[j].dx) / 2;
          const avgDy = (moves[i].dy + moves[j].dy) / 2;
          moves[i].dx = avgDx; moves[i].dy = avgDy;
          moves[j].dx = avgDx; moves[j].dy = avgDy;
        }
      }
    }
    // 스냅샷
    for (let i = 0; i < cars.length; i++) {
      trajectory[i].push({ x: cars[i].x, y: cars[i].y, bodyAngle: cars[i].bodyAngle });
    }
  }

  let finishedAny = false;
  for (const c of cars) {
    if (c.finished) continue;
    const [e1, e2] = targetEdge(c.team);
    if (ptSegDist({ x: c.x, y: c.y }, e1, e2) <= CAR_R) {
      c.finished = true;
      finishedAny = true;
    }
  }

  for (const c of cars) c.stoppedByWall = false;

  return { cars, finishedAny, trajectory };
}

// ─── 격자 셀 BFS 기반 벽 검증 ─────────────────────
// 셀(작은 정삼각형) 단위 BFS — 차의 현재 셀에서 목표 변에 접한 셀로 가는 경로 검증

type Cell = { type: 'up' | 'down'; a: number; b: number };
// ↑ 셀(a,b,c) where a+b+c=N-1; 격자점 (a+1,b,c),(a,b+1,c),(a,b,c+1)
// ↓ 셀(a,b,c) where a+b+c=N-2; 격자점 (a+1,b+1,c),(a+1,b,c+1),(a,b+1,c+1)

function pointKey(a: number, b: number) { return `${a},${b}`; }
function edgeKeyOf(pa1: number, pb1: number, pa2: number, pb2: number) {
  const k1 = pointKey(pa1, pb1);
  const k2 = pointKey(pa2, pb2);
  return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
}

function wallBlocksKey(w: WallSim): string {
  let a2 = w.a, b2 = w.b;
  if (w.dir === 'AB') { a2++; b2--; }
  else if (w.dir === 'AC') { a2++; }
  else { b2++; }
  return edgeKeyOf(w.a, w.b, a2, b2);
}

function cellKey(c: Cell) { return `${c.type}:${c.a},${c.b}`; }

// 셀의 3개 인접 셀 + 그 변(unit edge)의 격자점 키
function cellAdjacent(cell: Cell): Array<{ neighbor: Cell; edge: string }> {
  const out: Array<{ neighbor: Cell; edge: string }> = [];
  const { type, a, b } = cell;
  if (type === 'up') {
    const c = GRID_N - 1 - a - b;
    // V0=(a+1,b,c) V1=(a,b+1,c) V2=(a,b,c+1)
    // V0-V1 변 → ↓ (a, b, c-1)
    if (c >= 1) {
      out.push({
        neighbor: { type: 'down', a, b },
        edge: edgeKeyOf(a + 1, b, a, b + 1),
      });
    }
    // V0-V2 변 → ↓ (a, b-1, c)
    if (b >= 1) {
      out.push({
        neighbor: { type: 'down', a, b: b - 1 },
        edge: edgeKeyOf(a + 1, b, a, b),
      });
    }
    // V1-V2 변 → ↓ (a-1, b, c)
    if (a >= 1) {
      out.push({
        neighbor: { type: 'down', a: a - 1, b },
        edge: edgeKeyOf(a, b + 1, a, b),
      });
    }
  } else {
    // ↓ 셀 (a,b,c) where a+b+c=N-2
    // V0=(a+1,b+1,c) V1=(a+1,b,c+1) V2=(a,b+1,c+1)
    // V0-V1 → ↑ (a+1, b, c)
    out.push({
      neighbor: { type: 'up', a: a + 1, b },
      edge: edgeKeyOf(a + 1, b + 1, a + 1, b),
    });
    // V0-V2 → ↑ (a, b+1, c)
    out.push({
      neighbor: { type: 'up', a, b: b + 1 },
      edge: edgeKeyOf(a + 1, b + 1, a, b + 1),
    });
    // V1-V2 → ↑ (a, b, c+1)
    out.push({
      neighbor: { type: 'up', a, b },
      edge: edgeKeyOf(a + 1, b, a, b + 1),
    });
  }
  return out;
}

// 점 위치 → 들어있는 셀
function pxToCell(p: Pt): Cell {
  const denom = (TRI.B.y - TRI.C.y) * (TRI.A.x - TRI.C.x) + (TRI.C.x - TRI.B.x) * (TRI.A.y - TRI.C.y);
  const alpha = ((TRI.B.y - TRI.C.y) * (p.x - TRI.C.x) + (TRI.C.x - TRI.B.x) * (p.y - TRI.C.y)) / denom;
  const beta = ((TRI.C.y - TRI.A.y) * (p.x - TRI.C.x) + (TRI.A.x - TRI.C.x) * (p.y - TRI.C.y)) / denom;
  const aN = alpha * GRID_N;
  const bN = beta * GRID_N;
  const cN = GRID_N - aN - bN;
  let fa = Math.floor(aN), fb = Math.floor(bN), fc = Math.floor(cN);
  // 클램프
  fa = Math.max(0, Math.min(GRID_N - 1, fa));
  fb = Math.max(0, Math.min(GRID_N - 1, fb));
  fc = Math.max(0, Math.min(GRID_N - 1, fc));
  // 합 검증
  const sum = fa + fb + fc;
  if (sum === GRID_N - 1) return { type: 'up', a: fa, b: fb };
  if (sum === GRID_N - 2) return { type: 'down', a: fa, b: fb };
  // 경계 (격자점에 정확히, 또는 외부)
  // sum > N-1: 가장 큰 소수 좌표 줄이기. sum < N-2: 가장 작은 소수 좌표 늘리기.
  if (sum >= GRID_N - 1) return { type: 'up', a: fa, b: fb };
  return { type: 'down', a: fa, b: fb };
}

function isGoalCell(cell: Cell, team: TeamColor): boolean {
  if (cell.type !== 'up') return false;
  const c = GRID_N - 1 - cell.a - cell.b;
  if (team === 'red') return cell.a === 0;
  if (team === 'blue') return cell.b === 0;
  return c === 0;
}

function cellBFS(start: Cell, team: TeamColor, walls: WallSim[]): boolean {
  const blocked = new Set(walls.map(wallBlocksKey));
  const seen = new Set<string>();
  const queue: Cell[] = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    if (isGoalCell(cur, team)) return true;
    const k = cellKey(cur);
    if (seen.has(k)) continue;
    seen.add(k);
    for (const adj of cellAdjacent(cur)) {
      if (blocked.has(adj.edge)) continue;
      queue.push(adj.neighbor);
    }
  }
  return false;
}

// 팀별 목표 축
function teamGoalAxis(team: TeamColor): 'a' | 'b' | 'c' {
  if (team === 'red')  return 'a';  // a=0 변(BC)
  if (team === 'blue') return 'b';  // b=0 변(AC)
  return 'c';                       // c=0 변(AB)
}

// 픽셀 좌표 → 가장 가까운 격자점 (a, b)
function pxToGridPoint(p: Pt): { a: number; b: number } {
  // P = (a*A + b*B + c*C) / GRID_N, a+b+c=GRID_N
  // barycentric 좌표 분리
  const denom =
    (TRI.B.y - TRI.C.y) * (TRI.A.x - TRI.C.x) +
    (TRI.C.x - TRI.B.x) * (TRI.A.y - TRI.C.y);
  const alpha =
    ((TRI.B.y - TRI.C.y) * (p.x - TRI.C.x) + (TRI.C.x - TRI.B.x) * (p.y - TRI.C.y)) / denom;
  const beta =
    ((TRI.C.y - TRI.A.y) * (p.x - TRI.C.x) + (TRI.A.x - TRI.C.x) * (p.y - TRI.C.y)) / denom;
  // 격자 단위로 라운드
  let a = Math.round(alpha * GRID_N);
  let b = Math.round(beta * GRID_N);
  a = Math.max(0, Math.min(GRID_N, a));
  b = Math.max(0, Math.min(GRID_N, b));
  if (a + b > GRID_N) {
    const excess = a + b - GRID_N;
    if (a >= b) a -= excess;
    else b -= excess;
  }
  // 변 위 격자점이면 한 칸 안쪽으로 (BFS 신뢰성)
  // 0인 좌표를 1로, 가장 큰 좌표를 1 줄임
  let c = GRID_N - a - b;
  // 꼭지점 (두 좌표 0)도 처리
  while (a === 0 || b === 0 || c === 0) {
    if (c === 0) {
      c = 1;
      if (a >= b) a--; else b--;
    } else if (b === 0) {
      b = 1;
      if (a >= c) a--; else c--;
    } else { // a === 0
      a = 1;
      if (b >= c) b--; else c--;
    }
  }
  return { a, b };
}

// 모서리(변) 위에 있는 unit edge인지
export function isOnEdge(w: WallSim): boolean {
  let ea = w.a, eb = w.b;
  if (w.dir === 'AB') { ea = w.a + 1; eb = w.b - 1; }
  else if (w.dir === 'AC') { ea = w.a + 1; }
  else { eb = w.b + 1; }
  const c1 = GRID_N - w.a - w.b;
  const c2 = GRID_N - ea - eb;
  return (w.a === 0 && ea === 0) || (w.b === 0 && eb === 0) || (c1 === 0 && c2 === 0);
}

// 차량 사각형 (bodyAngle 회전 적용) 4 모서리 polygon
function carPolygon(c: CarSim): Pt[] {
  const rad = (c.bodyAngle * Math.PI) / 180;
  const cs = Math.cos(rad), sn = Math.sin(rad);
  const w = CAR_W / 2, h = CAR_H / 2;
  const corners = [
    { x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h },
  ];
  return corners.map((p) => ({
    x: c.x + p.x * cs - p.y * sn,
    y: c.y + p.x * sn + p.y * cs,
  }));
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > p.y) !== (yj > p.y)) && (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function segmentsIntersectLocal(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function lineHitsRect(la: Pt, lb: Pt, rect: Pt[]): boolean {
  if (pointInPolygon(la, rect) || pointInPolygon(lb, rect)) return true;
  for (let i = 0; i < rect.length; i++) {
    const r1 = rect[i];
    const r2 = rect[(i + 1) % rect.length];
    if (segmentsIntersectLocal(la, lb, r1, r2)) return true;
  }
  return false;
}

export function isValidWall(
  newWall: WallSim,
  existingWalls: WallSim[],
  cars: CarSim[]
): boolean {
  if (isOnEdge(newWall)) return false;

  // 차 사각형 박스 가로지르는 벽 거부
  const [wa, wb] = wallSegment(newWall);
  for (const c of cars) {
    if (c.finished) continue;
    const poly = carPolygon(c);
    if (lineHitsRect(wa, wb, poly)) return false;
  }

  // 셀 BFS 도달 가능성
  const all = [...existingWalls, newWall];
  for (const c of cars) {
    if (c.finished) continue;
    const startCell = pxToCell({ x: c.x, y: c.y });
    if (!cellBFS(startCell, c.team, all)) return false;
  }
  return true;
}

// 격자 키 일치로 겹침 판정
export function wallsOverlap(a: WallSim, b: WallSim): boolean {
  return wallBlocksKey(a) === wallBlocksKey(b);
}
