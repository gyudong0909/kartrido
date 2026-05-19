import type { QuoridorBroadcast } from '@wheel-race/shared';

const SIZE = 9;

// 두 인접 칸 사이 벽 차단 여부 (1칸 벽 기준)
export function isBlocked(state: QuoridorBroadcast, x1: number, y1: number, x2: number, y2: number): boolean {
  for (const w of state.walls) {
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

// (x, y)에 다른 살아있는 말이 있는지
function pawnAt(state: QuoridorBroadcast, x: number, y: number) {
  return state.pawns.find((p) => !p.finished && p.x === x && p.y === y);
}

function inBounds(x: number, y: number) {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
}

export interface MoveOption {
  toX: number;
  toY: number;
  label: string; // 표시 라벨 (↑ ↓ ← → ↖ ↗ ↙ ↘ ⤴ 등)
  kind: 'straight' | 'jump' | 'diagonal';
}

// 현재 말의 valid 이동 옵션들 반환 (점프, 사선 포함)
export function validMoves(state: QuoridorBroadcast, side: string): MoveOption[] {
  const me = state.pawns.find((p) => p.side === side);
  if (!me || me.finished) return [];
  const { x, y } = me;
  const options: MoveOption[] = [];
  const dirs: Array<{ dx: number; dy: number; label: string }> = [
    { dx: 0, dy: -1, label: '↑ 위' },
    { dx: 0, dy: 1, label: '↓ 아래' },
    { dx: -1, dy: 0, label: '← 왼' },
    { dx: 1, dy: 0, label: '→ 오' },
  ];
  for (const d of dirs) {
    const nx = x + d.dx, ny = y + d.dy;
    if (!inBounds(nx, ny)) continue;
    if (isBlocked(state, x, y, nx, ny)) continue;
    const occupant = pawnAt(state, nx, ny);
    if (!occupant) {
      // 일반 1칸 이동
      options.push({ toX: nx, toY: ny, label: d.label, kind: 'straight' });
    } else {
      // 점프 시도 — 같은 방향 2칸
      const fx = nx + d.dx, fy = ny + d.dy;
      if (inBounds(fx, fy) && !isBlocked(state, nx, ny, fx, fy) && !pawnAt(state, fx, fy)) {
        options.push({ toX: fx, toY: fy, label: `⤴ ${d.label} 점프`, kind: 'jump' });
      } else {
        // 직진 점프 불가 → 사선 두 방향
        const perpendiculars = (d.dx === 0)
          ? [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }]
          : [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }];
        for (const pp of perpendiculars) {
          const sx = nx + pp.dx, sy = ny + pp.dy;
          if (!inBounds(sx, sy)) continue;
          if (isBlocked(state, nx, ny, sx, sy)) continue;
          if (pawnAt(state, sx, sy)) continue;
          let label = '⤴ 사선';
          if (pp.dx === -1) label = '↖ 사선';
          if (pp.dx === 1) label = '↗ 사선';
          if (pp.dy === -1) label = '↖↗ 사선 위';
          if (pp.dy === 1) label = '↙↘ 사선 아래';
          options.push({ toX: sx, toY: sy, label, kind: 'diagonal' });
        }
      }
    }
  }
  return options;
}
