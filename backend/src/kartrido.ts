// 카트라이도 게임 상태 매니저 — 한 방 단위
import {
  KARTRIDO, REWARD, TEAM_COLORS, WHEEL_POS,
  type MissionId, type PlayerSlot, type TeamColor,
} from '@wheel-race/shared';
import {
  CarSim, WallSim, makeInitialCars, simulateRound,
  isValidWall, wallsOverlap, startPosition, targetEdge,
  gridEdgeToWall, CENTROID,
} from './kartridoSim.js';

// 라운드 입력 — 한 슬롯이 제출한 행동
export type SimpleAction =
  | { kind: 'move'; angle: number; rot: number }
  | { kind: 'wall'; x: number; y: number; orientation: number; a: number; b: number; dir: 'AB'|'AC'|'BC' };

export type RoundAction =
  | SimpleAction
  | {
      kind: 'predict';
      target: { team: TeamColor; wheelIdx: number };
      predicted:
        | { kind: 'move'; angle: number; rot: number }
        | { kind: 'wall' };
      desired: SimpleAction;
    };

export interface Submission {
  slotToken: string;
  team: TeamColor;
  wheelIdx: number;
  action: RoundAction;
  submittedAt: number;
}

export interface KartridoGame {
  round: number;
  cars: CarSim[];
  walls: WallSim[];
  wallsRemaining: Record<TeamColor, number>;
  submissions: Submission[];
  missions: Record<string, MissionId>;        // slotToken → mission
  finished: boolean;
  finishOrder: TeamColor[];                   // 도착 순
  lastRoundSubmitTimes: Record<string, number>; // 마지막 라운드 제출 시각 (slotToken)
}

export function createKartridoGame(): KartridoGame {
  return {
    round: 0,
    cars: makeInitialCars(),
    walls: [],
    wallsRemaining: {
      red: KARTRIDO.WALLS_PER_CAR,
      blue: KARTRIDO.WALLS_PER_CAR,
      green: KARTRIDO.WALLS_PER_CAR,
    },
    submissions: [],
    missions: {},
    finished: false,
    finishOrder: [],
    lastRoundSubmitTimes: {},
  };
}

// ─── 미션 배정 (랜덤) ─────────────────────
// 차당: 1명=미션7, 1명=미션8, 1명=1or2, 1명=3or4
export function assignMissions(slots: PlayerSlot[]): Record<string, MissionId> {
  const out: Record<string, MissionId> = {};
  for (const team of TEAM_COLORS) {
    const teamSlots = slots.filter((s) => s.team === team);
    // 셔플
    const shuffled = [...teamSlots].sort(() => Math.random() - 0.5);
    out[shuffled[0].slotToken] = 7;
    out[shuffled[1].slotToken] = 8;
    out[shuffled[2].slotToken] = (Math.random() < 0.5 ? 1 : 2) as MissionId;
    out[shuffled[3].slotToken] = (Math.random() < 0.5 ? 3 : 4) as MissionId;
  }
  return out;
}

// ─── 라운드 처리: 예측 → 벽 → 이동 순서 ─────────
export function processRound(
  game: KartridoGame,
  submissions: Submission[]
): { game: KartridoGame; finishedAny: boolean } {
  game.round++;
  game.submissions = submissions;

  // 0) 예측 처리 — 제출 시각 순, 성공 시 대상 바퀴 액션 덮어쓰기
  //    이미 한 번 변경된 바퀴는 다른 예측이 덮어쓸 수 없음 (먼저 시도한 쪽 우선)
  const overridden = new Set<string>(); // `${team}-${wheelIdx}`
  const predictSubs = submissions
    .filter((s) => s.action.kind === 'predict')
    .sort((a, b) => a.submittedAt - b.submittedAt);

  for (const ps of predictSubs) {
    const act = ps.action as Extract<RoundAction, { kind: 'predict' }>;
    const key = `${act.target.team}-${act.target.wheelIdx}`;
    if (overridden.has(key)) continue;
    // 대상 슬롯의 실제 제출 찾기
    const targetSub = submissions.find(
      (s) => s.team === act.target.team && s.wheelIdx === act.target.wheelIdx
    );
    if (!targetSub) continue;
    const actual = targetSub.action;
    // 예측 비교
    let match = false;
    if (act.predicted.kind === 'move' && actual.kind === 'move') {
      match =
        act.predicted.angle === actual.angle &&
        act.predicted.rot === actual.rot;
    } else if (act.predicted.kind === 'wall' && actual.kind === 'wall') {
      match = true;
    }
    if (!match) continue;
    // 성공 → 대상 슬롯의 액션을 desired로 덮어쓰기
    // 예측한 사람의 시각이 더 빠르므로 submittedAt도 예측 시각으로 갱신
    // (벽 처리 시 우선순위가 예측한 사람 의도대로)
    targetSub.action = act.desired;
    targetSub.submittedAt = ps.submittedAt;
    overridden.add(key);
  }

  // 1) 벽 설치 액션 정렬 (제출 시각 순)
  const wallSubs = submissions
    .filter((s) => s.action.kind === 'wall')
    .sort((a, b) => a.submittedAt - b.submittedAt);

  // 처리 결과 로그 (반환됨)
  (game as any).lastWallResults = [] as string[];
  const wallResults: string[] = (game as any).lastWallResults;

  for (const sub of wallSubs) {
    const act = sub.action as Extract<RoundAction, { kind: 'wall' }>;
    const team = sub.team;
    const desc = `${team} 벽(${act.a},${act.b},${act.dir})`;
    if (game.wallsRemaining[team] <= 0) {
      wallResults.push(`❌ ${desc}: 보유 0 (무시)`);
      continue;
    }
    const edgePx = gridEdgeToWall(act.a, act.b, act.dir);
    const newWall: WallSim = edgePx
      ? { ...edgePx, ownerTeam: team, a: act.a, b: act.b, dir: act.dir }
      : { x: act.x, y: act.y, orientation: act.orientation, ownerTeam: team, a: act.a, b: act.b, dir: act.dir };

    const overlap = game.walls.some((w) => wallsOverlap(w, newWall));
    if (overlap) {
      game.wallsRemaining[team]--;
      wallResults.push(`⚠ ${desc}: 위치 겹침 (페널티)`);
      continue;
    }
    if (!isValidWall(newWall, game.walls, game.cars)) {
      game.wallsRemaining[team]--;
      wallResults.push(`⚠ ${desc}: 무효 벽 (BFS 차단/모서리/차박스 통과 - 페널티)`);
      continue;
    }
    game.walls.push(newWall);
    game.wallsRemaining[team]--;
    wallResults.push(`✓ ${desc}: 성공`);
  }

  // 2) 각 바퀴 입력 반영
  //    - (A) move → 그 바퀴 angle/rot 갱신
  //    - (B) wall → 벽 설치 성공/실패 무관, 그 바퀴는 작동 안 함 (rot=0)
  for (const car of game.cars) {
    if (car.finished) continue;
    const teamSubs = submissions.filter((s) => s.team === car.team);
    for (const sub of teamSubs) {
      if (sub.action.kind === 'move') {
        car.wheels[sub.wheelIdx] = {
          angle: sub.action.angle,
          rot: sub.action.rot,
        };
      } else if (sub.action.kind === 'wall') {
        car.wheels[sub.wheelIdx] = {
          angle: car.wheels[sub.wheelIdx].angle,
          rot: 0, // 이 라운드 작동 안 함
        };
      }
    }
  }

  // 3) 시뮬레이션 (벽 충돌 포함)
  const before = game.cars.map((c) => c.finished);
  const result = simulateRound(game.cars, game.walls);
  game.cars = result.cars;
  (game as any).lastTrajectory = result.trajectory;

  // 도착 순서 기록 + finishRound 설정
  for (let i = 0; i < game.cars.length; i++) {
    if (!before[i] && game.cars[i].finished) {
      game.cars[i].finishRound = game.round;
      game.finishOrder.push(game.cars[i].team);
    }
  }

  // 게임 종료 체크: 어느 차든 finish 했거나 10라운드 완료
  // 자동 종료 비활성 — 호스트가 명시적으로 종료
  // (참고: result.finishedAny와 game.round >= TOTAL_ROUNDS 정보만 유지)

  // 매 라운드 슬롯별 제출 시각 기록 (tie-break용 — 항상 갱신)
  for (const sub of submissions) {
    game.lastRoundSubmitTimes[sub.slotToken] = sub.submittedAt;
  }

  return { game, finishedAny: result.finishedAny };
}

// ─── 최종 순위 산출 ────────────────────────
// 슬롯 인자 받아 평균 제출시각 tie-break 가능
export function finalRanking(game: KartridoGame, slots?: PlayerSlot[]): TeamColor[] {
  function avgTime(team: TeamColor): number {
    if (!slots) return 0;
    const teamSlots = slots.filter((s) => s.team === team);
    let sum = 0, cnt = 0;
    for (const s of teamSlots) {
      const t = game.lastRoundSubmitTimes[s.slotToken];
      if (t !== undefined) { sum += t; cnt++; }
    }
    return cnt > 0 ? sum / cnt : Infinity;
  }
  function dist(c: typeof game.cars[number]): number {
    const [e1, e2] = targetEdge(c.team);
    return pointToSegDist(c.x, c.y, e1, e2);
  }

  const score = game.cars.map((c) => ({
    team: c.team,
    finishRound: c.finishRound ?? Infinity,
    finishStep: c.finishStep ?? Infinity,
    distToGoal: dist(c),
    avg: avgTime(c.team),
  }));

  score.sort((a, b) => {
    // 1. 도착한 차 우선 (finishRound 작은 게 위)
    if (a.finishRound !== b.finishRound) return a.finishRound - b.finishRound;
    // 2. 같은 라운드 도착 → step 작은 (먼저 닿은) 게 위
    if (a.finishStep !== b.finishStep) return a.finishStep - b.finishStep;
    // 3. 둘 다 미도착 → 거리 짧은 게 위
    if (a.distToGoal !== b.distToGoal) return a.distToGoal - b.distToGoal;
    // 4. 거리도 같음 → 평균 제출 시각 빠른 게 위
    return a.avg - b.avg;
  });
  return score.map((s) => s.team);
}

function pointToSegDist(px: number, py: number, a: any, b: any) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - a.x, py - a.y);
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

// ─── 미션 평가 ─────────────────────────────
export function evaluateMissions(
  game: KartridoGame,
  slots: PlayerSlot[]
): Record<string, { success: boolean; reward: number }> {
  const ranking = finalRanking(game);
  const lastTeam = ranking[ranking.length - 1];
  const firstTeam = ranking[0];
  const out: Record<string, { success: boolean; reward: number }> = {};

  // 미션 7번 추리 결과는 별도 처리 (게임 종료 후 진행 단계)
  for (const slot of slots) {
    const mission = game.missions[slot.slotToken];
    if (!mission) continue;
    let success = false;
    let reward = 0;
    if (mission === 1 || mission === 2) {
      success = evalLeftRight(game, slot, mission);
    } else if (mission === 3 || mission === 4) {
      success = evalFrontBack(game, slot, mission);
    } else if (mission === 8) {
      success = slot.team === lastTeam;
    } else if (mission === 7) {
      // 7번은 추리 단계에서 별도 정산. 일단 0
      success = false;
      reward = REWARD.MISSION_7_INITIAL;
    }
    if (mission !== 7 && success) reward = REWARD.PERSONAL_SUCCESS;

    // 팀 미션 완전 성공 보너스
    if (slot.team === firstTeam) reward += REWARD.TEAM_FULL_SUCCESS_BONUS;

    out[slot.slotToken] = { success, reward };
  }
  return out;
}

function evalLeftRight(game: KartridoGame, slot: PlayerSlot, m: 1 | 2): boolean {
  const car = game.cars.find((c) => c.team === slot.team)!;
  const sp = startPosition(slot.team);
  // 차의 초기 진행 방향 = 시작 → 무게중심
  const fwdX = CENTROID.x - sp.x;
  const fwdY = CENTROID.y - sp.y;
  const fwdLen = Math.hypot(fwdX, fwdY);
  const fdx = fwdX / fwdLen;
  const fdy = fwdY / fwdLen;
  // 화면 좌표(y 아래로 증가)에서 진행 방향 기준 왼손 방향 = (fy, -fx)
  const leftX = fdy;
  const leftY = -fdx;
  const rx = car.x - sp.x;
  const ry = car.y - sp.y;
  const leftCoord = rx * leftX + ry * leftY; // 양수면 운전자 기준 왼쪽
  return m === 1 ? leftCoord > 0 : leftCoord < 0;
}

// ─── 진출자 산출 (꼴찌팀 미션7→8 추리 결과 반영 가능) ───
export function computeNextMatchSlots(
  game: KartridoGame,
  slots: PlayerSlot[],
  // 꼴찌팀 미션7 보유자의 미션8 추리 성공 여부
  mission7HitMission8: boolean = false
): { angel: PlayerSlot[]; devil: PlayerSlot[] } {
  const ranking = finalRanking(game);
  const firstTeam = ranking[0];
  const lastTeam = ranking[ranking.length - 1];
  const angel: PlayerSlot[] = [];
  const devil: PlayerSlot[] = [];

  for (const slot of slots) {
    const mission = game.missions[slot.slotToken];
    if (slot.team === firstTeam) {
      // 1등팀: 미션8 → 데블, 나머지 3명 → 엔젤
      if (mission === 8) devil.push(slot);
      else angel.push(slot);
    } else if (slot.team === lastTeam) {
      if (mission7HitMission8) {
        // 꼴등팀: 미션7 → 엔젤 (자리 교환), 나머지 → 데블
        if (mission === 7) angel.push(slot);
        else devil.push(slot);
      } else {
        // 꼴등팀 기본: 미션8 → 엔젤, 나머지 → 데블
        if (mission === 8) angel.push(slot);
        else devil.push(slot);
      }
    }
    // 중간팀은 진출 없음
  }
  return { angel, devil };
}

function evalFrontBack(game: KartridoGame, slot: PlayerSlot, m: 3 | 4): boolean {
  const car = game.cars.find((c) => c.team === slot.team)!;
  // 자기 목표 변 — 4바퀴 각각이 이 변까지 떨어진 거리로 앞/뒤 판정
  const [e1, e2] = targetEdge(slot.team);

  // 4바퀴 각각의 절대 위치 (차 중심 + 차체 회전 적용)
  const ba = (car.bodyAngle * Math.PI) / 180;
  const cb = Math.cos(ba), sb_ = Math.sin(ba);
  const wOffsets = [
    { x: 22, y: -14 }, { x: 22, y: 14 },
    { x: -22, y: -14 }, { x: -22, y: 14 },
  ];
  const wheelDists = wOffsets.map((off) => {
    const wx = car.x + (off.x * cb - off.y * sb_);
    const wy = car.y + (off.x * sb_ + off.y * cb);
    return pointToSegDist(wx, wy, e1, e2);
  });

  const wheelIdx = WHEEL_POS.indexOf(slot.wheel);
  const myDist = wheelDists[wheelIdx];
  // 오름차순 정렬: [0]=목표에 가장 가까움 = 맨앞, [3]=가장 멈 = 맨뒤
  const sorted = [...wheelDists].sort((a, b) => a - b);
  if (m === 3) {
    // 앞쪽 2개 (목표까지 거리 가장 가까운 2개)
    return myDist <= sorted[1] + 0.01;
  } else {
    // 뒤쪽 2개 (목표까지 거리 가장 먼 2개)
    return myDist >= sorted[2] - 0.01;
  }
}
