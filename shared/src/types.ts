import type { MissionId, TeamColor, WheelPos } from './gameConfig.js';

// 방 (게임 세션) 식별
export interface Room {
  code: string;            // 6자리 영숫자 방 코드 (예: ABC123)
  createdAt: number;
  hostToken: string;       // 진행자만 아는 토큰
  phase: GamePhase;
  slots: PlayerSlot[];     // 12개
}

export type GamePhase =
  | 'lobby'                // 참가자 입장 대기
  | 'kartrido-input'       // 카트라이도 라운드 입력 단계
  | 'kartrido-anim'        // 시뮬레이션 애니메이션
  | 'kartrido-end'         // 종료, 배정 공개·미션 7 추리
  | 'quoridor-setup'       // 협동 쿼리도 방 배정
  | 'quoridor-play'        // 협동 쿼리도 진행
  | 'finished';            // 전체 종료

// 12개 슬롯 — 각 슬롯이 한 명의 참가자 자리
export interface PlayerSlot {
  slotToken: string;       // 개인 입장 URL에 들어가는 토큰
  team: TeamColor;
  wheel: WheelPos;
  joined: boolean;
  name?: string;           // 본인이 입력한 표시 이름 (옵션)
  mission?: MissionId;     // 진행자가 배정한 미션 (게임 시작 시 본인에게만 공개)
}

// 카트라이도 — 한 차량의 상태
export interface CarState {
  team: TeamColor;
  x: number;
  y: number;
  bodyAngle: number;       // degrees
  finished: boolean;
  wheels: WheelInput[];    // 4개
}

export type GridDir = 'AB' | 'AC' | 'BC';

// 한 바퀴의 라운드 입력 — 자기 액션(A 또는 B) + 예측(C, 선택적)
export interface WheelInput {
  selfAction:
    | { kind: 'move'; angle: number; rot: number }
    | { kind: 'wall'; x: number; y: number; orientation: number; a: number; b: number; dir: GridDir };
  prediction?: {
    target: TargetWheelRef;
    predicted: PredictedAction;
    desired: DesiredAction;
  };
}

export interface TargetWheelRef {
  team: TeamColor;
  wheel: WheelPos;
}

// 예측 시도에서 "이런 입력일 것이다"
export type PredictedAction =
  | { kind: 'move'; angle: number; rot: number }
  | { kind: 'wall' };

// 예측 성공 시 자기가 그 바퀴를 이렇게 만들겠다
export type DesiredAction =
  | { kind: 'move'; angle: number; rot: number }
  | { kind: 'wall'; x: number; y: number; orientation: number; a: number; b: number; dir: GridDir };

// 벽 — 게임 내 영구 설치
export interface Wall {
  x: number;
  y: number;
  orientation: number;     // degrees
}

// 카트라이도 전체 게임 상태
export interface KartridoState {
  round: number;
  cars: CarState[];
  walls: Wall[];
  wallsRemaining: Record<TeamColor, number>; // 자동차당 잔여 벽 (공개 정보)
}

// ───────────────────────────────────────────────
// 협동 쿼리도
// ───────────────────────────────────────────────

// 4팀이 보드 사방에서 시작 — 어느 방향에서 시작하는지
export type QuoridorSide = 'top' | 'bottom' | 'left' | 'right';

export interface QuoridorPawn {
  side: QuoridorSide;     // 시작 방향 (목표는 반대편)
  x: number;              // 0~8
  y: number;              // 0~8
  walls: number;          // 잔여 안 쓴 벽 수 (시작 5)
  finished: boolean;
}

// 쿼리도 벽 (격자선에 설치)
//   orientation 'h' = 가로 벽 (행 사이), 'v' = 세로 벽 (열 사이)
//   (x, y) = 벽의 좌상단 칸 좌표
export interface QuoridorWall {
  x: number;
  y: number;
  orientation: 'h' | 'v';
  ownerSide: QuoridorSide; // 어느 팀이 설치한 벽인지
}

// 한 팀 내 사람의 역할
export type QuoridorRole = 'wall' | 'move';

// 협동 쿼리도 한 팀 (2명)
export interface QuoridorTeam {
  side: QuoridorSide;
  members: {
    role: QuoridorRole;
    slotToken: string;     // 카트라이도에서 이어진 slot
  }[];
}

// 한 턴의 한 사람 액션
export type QuoridorAction =
  | { kind: 'none' }
  | { kind: 'move'; toX: number; toY: number }
  | { kind: 'wall'; x: number; y: number; orientation: 'h' | 'v' };

export interface QuoridorState {
  turn: number;                 // 현재 턴 (시계방향)
  currentSide: QuoridorSide;    // 이번 턴의 팀
  pawns: QuoridorPawn[];        // 4개
  walls: QuoridorWall[];
  teams: QuoridorTeam[];
}

// 진행자 콘솔용 요약
export interface RoomSummary {
  code: string;
  phase: GamePhase;
  joinedCount: number;     // 12 중 입장한 사람 수
}
