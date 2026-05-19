// 게임 룰 상수 (룰 의미상의 값, 뷰어 픽셀과 분리)

export const KARTRIDO = {
  TEAMS: 3,
  WHEELS_PER_CAR: 4,
  PLAYERS_PER_TEAM: 4,
  TOTAL_PLAYERS: 12,
  TOTAL_ROUNDS: 15,

  // 각도: 20° 단위 (0, 20, 40, ..., 340) — 18방향, 짝수 10의 배수
  ANGLE_STEP: 20,
  ANGLE_MIN: 0,
  ANGLE_MAX: 340,
  ANGLE_VALUES: Array.from({ length: 18 }, (_, i) => i * 20),

  // 회전수: 1~15 (0 선택 불가, 멈추려면 벽 설치)
  ROT_MIN: 1,
  ROT_MAX: 15,

  // 시뮬레이션
  ANIM_FRAMES: 90,

  // 라운드 시간
  ROUND_INPUT_SECONDS: 15 * 60, // 15분 입력 제한

  // 벽 (자동차당 보유)
  WALLS_PER_CAR: 15,
} as const;

export const QUORIDOR = {
  BOARD_SIZE: 9,
  TOTAL_TEAMS: 4,
  WALLS_PER_TEAM: 10,
  TURN_SECONDS: 30,
} as const;

// 미션 종류
export type MissionId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const MISSION_LABELS: Record<MissionId, string> = {
  1: '차량 중심 최종 위치가 시작점보다 왼쪽',
  2: '차량 중심 최종 위치가 시작점보다 오른쪽',
  3: '자기 바퀴가 자기 차의 앞쪽 (맨앞 또는 2번째 앞)',
  4: '자기 바퀴가 자기 차의 뒤쪽 (맨뒤 또는 2번째 뒤)',
  5: 'X팀이 Y팀보다 높은 순위 (사용 안 함)',
  6: 'Y팀이 X팀보다 높은 순위 (사용 안 함)',
  7: '같은 차 다른 바퀴 주인 3명의 미션 알아맞히기',
  8: '자기 차가 꼴등 (히든)',
};

// 차당 미션 분포 (운영 비밀)
//   1명 = 미션 7, 1명 = 미션 8, 1명 = 1 or 2, 1명 = 3 or 4
//   미션 5, 6은 절대 배정되지 않음 (위장)
export const MISSIONS_USED: MissionId[] = [1, 2, 3, 4, 7, 8];

// 루블 보상
export const REWARD = {
  PERSONAL_SUCCESS: 100_000,
  MISSION_7_INITIAL: -100_000,
  MISSION_7_HIT_BONUS: 100_000,
  MISSION_7_HIT_PENALTY: -100_000,
  TEAM_FULL_SUCCESS_BONUS: 200_000,

  QUORIDOR_1ST: 400_000,
  QUORIDOR_2ND: 200_000,
} as const;

// 차/바퀴 식별자
export type TeamColor = 'red' | 'blue' | 'green';
export const TEAM_COLORS: TeamColor[] = ['red', 'blue', 'green'];

export type WheelPos = 'fl' | 'fr' | 'bl' | 'br';
export const WHEEL_POS: WheelPos[] = ['fl', 'fr', 'bl', 'br'];
export const WHEEL_NAMES_KO: Record<WheelPos, string> = {
  fl: '왼앞',
  fr: '오른앞',
  bl: '왼뒤',
  br: '오른뒤',
};
