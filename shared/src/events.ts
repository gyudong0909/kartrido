// Socket.io 이벤트 타입 — backend ↔ frontend 공통

import type { GamePhase, PlayerSlot, RoomSummary, WheelInput, QuoridorAction } from './types.js';
import type { MissionId, TeamColor, WheelPos } from './gameConfig.js';

// ─────────────────────────────────
// Client → Server
// ─────────────────────────────────
export interface ClientToServerEvents {
  // 진행자
  'host:create-room': (cb: (res: { code: string; hostToken: string; slots: PlayerSlot[] }) => void) => void;
  'host:start-game': (data: { code: string; hostToken: string }) => void;
  'host:reset': (data: { code: string; hostToken: string }) => void;

  // 참가자
  'player:join': (
    data: { slotToken: string; name?: string },
    cb: (res: JoinResult) => void
  ) => void;
  'player:submit-input': (
    data: { slotToken: string; input: WheelInput }
  ) => void;

  // TV
  'tv:join': (data: { code: string }) => void;

  // 협동 쿼리도
  'host:start-quoridor': (data: { code: string; hostToken: string }) => void;
  'quoridor:choose-room': (data: { slotToken: string; role: 'wall' | 'move' }) => void;
  'quoridor:submit-action': (data: { slotToken: string; action: QuoridorAction }) => void;

  // 미션 7 추리
  'player:submit-mission7': (data: {
    slotToken: string;
    guesses: { target: string; missionId: number }[]; // target = slotToken
  }) => void;

  // 관리자 강제 라운드 진행 (미제출자 있어도 시뮬레이션)
  'host:run-round': (data: { code: string; hostToken: string }) => void;

  // 진행자가 슬롯 이름 설정
  'host:set-slot-name': (data: { code: string; hostToken: string; slotToken: string; name: string }) => void;

  // 진행자가 슬롯 입력 대신 제출
  'host:override-input': (data: { code: string; hostToken: string; slotToken: string; input: WheelInput }) => void;

  // 라운드 되돌리기 (마지막 라운드 결과 취소)
  'host:undo-round': (data: { code: string; hostToken: string }) => void;

  // 미제출 슬롯 랜덤으로 채우기
  'host:fill-random': (data: { code: string; hostToken: string }) => void;

  // 라운드 타이머 조정 (초 단위 남은 시간 설정)
  'host:set-timer': (data: { code: string; hostToken: string; remainingSeconds: number }) => void;

  // 카트라이도 종료 (결과 집계 화면)
  'host:end-kartrido': (data: { code: string; hostToken: string }) => void;

  // 협동쿼리도 — 진행자가 한 턴에 (벽 유/무) + (이동 유/무) 같이 입력
  'host:quoridor-act': (data: {
    code: string;
    hostToken: string;
    side: 'top' | 'bottom' | 'left' | 'right';
    move?: { toX: number; toY: number };
    wall?: { x: number; y: number; orientation: 'h' | 'v' };
  }) => void;

  // 협동쿼리도 — 다음 차례 강제 진행
  'host:quoridor-next-turn': (data: { code: string; hostToken: string }) => void;

  // 협동쿼리도 — 되돌리기
  'host:quoridor-undo': (data: { code: string; hostToken: string }) => void;

  // 협동쿼리도 — 말 위치 강제 조정
  'host:quoridor-set-pos': (data: {
    code: string;
    hostToken: string;
    side: 'top' | 'bottom' | 'left' | 'right';
    x: number;
    y: number;
  }) => void;
}

export type JoinResult =
  | { ok: true; slot: PlayerSlot; mission?: MissionId }
  | { ok: false; reason: string };

// ─────────────────────────────────
// Server → Client
// ─────────────────────────────────
export interface ServerToClientEvents {
  'room:update': (data: { summary: RoomSummary; slots: PlayerSlot[] }) => void;
  'phase:changed': (phase: GamePhase) => void;
  'state:kartrido': (state: KartridoBroadcast) => void;
  'state:kartrido-anim': (trajectory: {
    teams: TeamColor[];
    steps: Array<Array<{ x: number; y: number; bodyAngle: number }>>; // [carIdx][step]
  }) => void;
  'state:quoridor': (state: QuoridorBroadcast) => void;
  'player:mission-assigned': (mission: MissionId) => void;
  'kartrido:results': (data: KartridoResults) => void;
  'submissions:update': (data: SubmissionInfo[]) => void;
  // 진행자에게만 — 미션 포함 전체 slots
  'host:slots-private': (data: PlayerSlot[]) => void;
  'state:timer': (data: { round: number; deadline: number; durationSeconds: number }) => void;
  'log:append': (entry: RoundLogEntry) => void;
  'log:full': (entries: RoundLogEntry[]) => void;
  'quoridor:results': (data: QuoridorResults) => void;
  'error': (msg: string) => void;
}

// 카트라이도 최종 결과 (모든 클라이언트에게 공개)
export interface KartridoResults {
  ranking: TeamColor[];                                  // 순위 (1등 → 꼴등)
  assignments: Array<{                                   // 누가 어느 차/바퀴였는지
    slotToken: string;
    name?: string;
    team: TeamColor;
    wheel: WheelPos;
    mission: MissionId;
    missionSuccess: boolean;
    reward: number;
  }>;
  nextMatch: {                                          // 협동 쿼리도 진출자
    angel: string[];   // slotToken
    devil: string[];
  };
}

export interface QuoridorBroadcast {
  pawns: Array<{ side: 'top' | 'bottom' | 'left' | 'right'; x: number; y: number; walls: number; finished: boolean }>;
  walls: Array<{ x: number; y: number; orientation: 'h' | 'v'; ownerSide: string }>;
  currentSide: string;
  turn: number;
}

export interface QuoridorResults {
  ranking: Array<{ side: string; slotTokens: string[]; reward: number; passed: boolean }>;
}

// 라운드 진행 로그 (호스트용)
export interface RoundLogEntry {
  round: number;
  timestamp: number;
  events: Array<string>; // 사람-action 텍스트 로그
}

// 호스트에게 보여줄 라운드 제출 상태
export interface SubmissionInfo {
  slotToken: string;
  team: TeamColor;
  wheel: WheelPos;
  submitted: boolean;
  selfKind?: 'move' | 'wall';
  selfDetail?: string;
  submittedAt?: number;      // ms timestamp
  hasPrediction: boolean;
  predDetail?: string;
}

export interface KartridoBroadcast {
  round: number;
  cars: Array<{
    team: TeamColor;
    x: number;
    y: number;
    bodyAngle: number;
    finished: boolean;
    progressPct: number;
  }>;
  walls: Array<{ x: number; y: number; orientation: number }>;
  wallsRemaining: { red: number; blue: number; green: number };
}
