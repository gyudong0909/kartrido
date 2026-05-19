// 협동 쿼리도 — 4팀, 표준 9×9, 협동 변형 페널티
import { QUORIDOR, QuoridorSide, QuoridorRole } from '@wheel-race/shared';

const SIZE = QUORIDOR.BOARD_SIZE; // 9

export interface QuoridorPawnSim {
  side: QuoridorSide;
  x: number; // 0~8
  y: number;
  walls: number; // 잔여 안 쓴 벽
  finished: boolean;
}

export interface QuoridorWallSim {
  x: number; // 좌상단 칸
  y: number;
  orientation: 'h' | 'v';
  ownerSide: QuoridorSide;
}

export interface TeamMember {
  side: QuoridorSide;
  role: QuoridorRole; // 'wall' or 'move'
  slotToken: string;
}

export interface QuoridorGame {
  pawns: QuoridorPawnSim[];
  walls: QuoridorWallSim[];
  members: TeamMember[]; // 8명
  turn: number;
  currentSide: QuoridorSide;
  finished: boolean;
  finishOrder: QuoridorSide[];
}

const SIDES: QuoridorSide[] = ['top', 'right', 'bottom', 'left'];

export function createQuoridor(members: TeamMember[]): QuoridorGame {
  const pawns: QuoridorPawnSim[] = SIDES.map((s) => {
    const center = Math.floor(SIZE / 2);
    let pos = { x: 0, y: 0 };
    if (s === 'top') pos = { x: center, y: 0 };
    if (s === 'bottom') pos = { x: center, y: SIZE - 1 };
    if (s === 'left') pos = { x: 0, y: center };
    if (s === 'right') pos = { x: SIZE - 1, y: center };
    return {
      side: s,
      x: pos.x,
      y: pos.y,
      walls: QUORIDOR.WALLS_PER_TEAM,
      finished: false,
    };
  });

  return {
    pawns,
    walls: [],
    members,
    turn: 0,
    currentSide: 'top',
    finished: false,
    finishOrder: [],
  };
}

// 도달 가능 BFS — 모든 말이 자기 목표 변에 도달 가능한지
function isReachable(pawn: QuoridorPawnSim, walls: QuoridorWallSim[]): boolean {
  const seen = new Set<string>();
  const queue: [number, number][] = [[pawn.x, pawn.y]];
  const goal = goalRow(pawn.side);
  while (queue.length) {
    const [x, y] = queue.shift()!;
    if (reachedGoal({ x, y }, pawn.side)) return true;
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const [nx, ny] of neighbors(x, y, walls)) {
      queue.push([nx, ny]);
    }
  }
  return false;
}

function goalRow(side: QuoridorSide): number {
  if (side === 'top') return SIZE - 1;
  if (side === 'bottom') return 0;
  return -1;
}

function reachedGoal(p: { x: number; y: number }, side: QuoridorSide): boolean {
  if (side === 'top') return p.y === SIZE - 1;
  if (side === 'bottom') return p.y === 0;
  if (side === 'left') return p.x === SIZE - 1;
  if (side === 'right') return p.x === 0;
  return false;
}

function neighbors(x: number, y: number, walls: QuoridorWallSim[]): [number, number][] {
  const out: [number, number][] = [];
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
    if (isBlocked(x, y, nx, ny, walls)) continue;
    out.push([nx, ny]);
  }
  return out;
}

function isBlocked(x1: number, y1: number, x2: number, y2: number, walls: QuoridorWallSim[]): boolean {
  // 1칸 벽: orientation 'h' → (x, y)와 (x, y+1) 사이 차단 / 'v' → (x, y)와 (x+1, y) 사이 차단
  for (const w of walls) {
    if (w.orientation === 'h') {
      if (x1 === x2 && x1 === w.x) {
        const minY = Math.min(y1, y2);
        if (minY === w.y) return true;
      }
    } else {
      if (y1 === y2 && y1 === w.y) {
        const minX = Math.min(x1, x2);
        if (minX === w.x) return true;
      }
    }
  }
  return false;
}

// 액션 적용 (유효성 체크 포함)
export type QuoridorActionResult =
  | { ok: true; game: QuoridorGame }
  | { ok: false; reason: string; game: QuoridorGame };

// 위치 이동이 valid한지 (4방향 일반 + 점프 + 사선 모두 검사)
function isValidMoveTarget(game: QuoridorGame, pawn: QuoridorPawnSim, toX: number, toY: number): boolean {
  if (toX < 0 || toX >= SIZE || toY < 0 || toY >= SIZE) return false;
  if (game.pawns.some((p) => !p.finished && p.x === toX && p.y === toY)) return false;
  const dx = toX - pawn.x;
  const dy = toY - pawn.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  // 4방향 1칸
  if (adx + ady === 1) {
    return !isBlocked(pawn.x, pawn.y, toX, toY, game.walls);
  }
  // 직선 점프 (2칸 같은 방향)
  if ((adx === 2 && ady === 0) || (adx === 0 && ady === 2)) {
    const midX = pawn.x + dx / 2;
    const midY = pawn.y + dy / 2;
    const mid = game.pawns.find((p) => !p.finished && p.x === midX && p.y === midY);
    if (!mid) return false;
    if (isBlocked(pawn.x, pawn.y, midX, midY, game.walls)) return false;
    if (isBlocked(midX, midY, toX, toY, game.walls)) return false;
    return true;
  }
  // 사선 (점프 못 할 때)
  if (adx === 1 && ady === 1) {
    // 두 후보 미드 (pawn.x + dx, pawn.y) 또는 (pawn.x, pawn.y + dy)
    const candidates = [
      { mx: pawn.x + dx, my: pawn.y },
      { mx: pawn.x, my: pawn.y + dy },
    ];
    for (const { mx, my } of candidates) {
      const mid = game.pawns.find((p) => !p.finished && p.x === mx && p.y === my);
      if (!mid) continue;
      if (isBlocked(pawn.x, pawn.y, mx, my, game.walls)) continue;
      if (isBlocked(mx, my, toX, toY, game.walls)) continue;
      // 직선 점프가 가능한 경우는 사선 불허 (직선 우선)
      const fx = pawn.x + (mx - pawn.x) * 2;
      const fy = pawn.y + (my - pawn.y) * 2;
      const straightOk = fx >= 0 && fx < SIZE && fy >= 0 && fy < SIZE
        && !isBlocked(mx, my, fx, fy, game.walls)
        && !game.pawns.some((p) => !p.finished && p.x === fx && p.y === fy);
      if (straightOk) continue; // 그쪽은 직진 점프 가능 → 사선 불가
      return true;
    }
  }
  return false;
}

export function tryMove(
  game: QuoridorGame,
  side: QuoridorSide,
  toX: number,
  toY: number
): QuoridorActionResult {
  const pawn = game.pawns.find((p) => p.side === side);
  if (!pawn) return { ok: false, reason: 'no pawn', game };
  if (!isValidMoveTarget(game, pawn, toX, toY)) {
    return { ok: false, reason: 'invalid move', game };
  }
  pawn.x = toX;
  pawn.y = toY;
  if (reachedGoal({ x: toX, y: toY }, pawn.side)) {
    pawn.finished = true;
    game.finishOrder.push(pawn.side);
    if (game.finishOrder.length >= 4) game.finished = true;
  }
  return { ok: true, game };
}

export function tryWall(
  game: QuoridorGame,
  side: QuoridorSide,
  x: number,
  y: number,
  orientation: 'h' | 'v'
): QuoridorActionResult {
  const pawn = game.pawns.find((p) => p.side === side);
  if (!pawn) return { ok: false, reason: 'no pawn', game };
  if (pawn.walls <= 0) return { ok: false, reason: 'no walls left', game };
  // 범위 — 1칸 벽: h는 y가 0~7, v는 x가 0~7
  if (orientation === 'h') {
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE - 1) {
      return { ok: false, reason: 'out of range', game };
    }
  } else {
    if (x < 0 || x >= SIZE - 1 || y < 0 || y >= SIZE) {
      return { ok: false, reason: 'out of range', game };
    }
  }
  // 겹침
  if (game.walls.some((w) => w.x === x && w.y === y && w.orientation === orientation)) {
    return { ok: false, reason: 'overlap', game };
  }
  // 모든 말이 도달 가능한지
  const candidateWalls = [...game.walls, { x, y, orientation, ownerSide: side }];
  for (const p of game.pawns) {
    if (p.finished) continue;
    if (!isReachable(p, candidateWalls)) {
      return { ok: false, reason: 'blocks path', game };
    }
  }
  game.walls.push({ x, y, orientation, ownerSide: side });
  pawn.walls--;
  return { ok: true, game };
}

// 페널티: 안 쓴 벽 1개 차감 (이미 설치된 벽은 영향 없음)
// 벽이 0이 되면 사망(finished=true) 처리
export function applyPenalty(game: QuoridorGame, side: QuoridorSide) {
  const pawn = game.pawns.find((p) => p.side === side);
  if (pawn && pawn.walls > 0) {
    pawn.walls--;
    if (pawn.walls === 0) {
      pawn.finished = true; // 사망 — 게임판에서 사라짐
      game.finishOrder.push(side);
    }
  }
}

// 벽 사용 후 잔여 0이면 사망 처리 (tryWall에서 호출)
export function checkDeath(game: QuoridorGame, side: QuoridorSide) {
  const pawn = game.pawns.find((p) => p.side === side);
  if (pawn && !pawn.finished && pawn.walls === 0) {
    pawn.finished = true;
    game.finishOrder.push(side);
  }
}

// 다음 턴 (시계방향)
export function advanceTurn(game: QuoridorGame) {
  game.turn++;
  const idx = SIDES.indexOf(game.currentSide);
  // finished 안 한 다음 팀 찾기
  for (let i = 1; i <= 4; i++) {
    const next = SIDES[(idx + i) % 4];
    const np = game.pawns.find((p) => p.side === next);
    if (np && !np.finished) {
      game.currentSide = next;
      return;
    }
  }
}
