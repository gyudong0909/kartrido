import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClientToServerEvents, ServerToClientEvents,
  type PlayerSlot, type WheelInput, type SubmissionInfo,
} from '@wheel-race/shared';
import {
  createRoom, getRoom, joinSlot, summary, allRooms, type Room,
} from './rooms.js';
import {
  createKartridoGame, assignMissions, processRound,
  type Submission, type RoundAction, type KartridoGame,
  evaluateMissions, finalRanking, computeNextMatchSlots,
} from './kartrido.js';
import {
  createQuoridor, tryMove, tryWall, applyPenalty, advanceTurn,
  type QuoridorGame, type TeamMember,
} from './quoridor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*' },
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const frontendDist = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const games = new Map<string, KartridoGame>();
const submissions = new Map<string, Submission[]>();
const gameHistory = new Map<string, Array<{ game: KartridoGame; subs: Submission[] }>>();
const quoridorGames = new Map<string, QuoridorGame>();
const quoridorHistory = new Map<string, QuoridorGame[]>();
const quoridorRoles = new Map<string, Map<string, 'wall' | 'move'>>();

function snapshotQ(g: QuoridorGame): QuoridorGame {
  return JSON.parse(JSON.stringify(g));
}
const mission7Guesses = new Map<string, Map<string, { target: string; missionId: number }[]>>();
const timers = new Map<string, { round: number; deadline: number; durationSeconds: number }>();
const roundLogs = new Map<string, Array<{ round: number; timestamp: number; events: string[] }>>();

const DEFAULT_ROUND_SECONDS = 15 * 60; // 15분

function snapshot(g: KartridoGame): KartridoGame {
  return JSON.parse(JSON.stringify(g));
}

function startTimer(code: string, durationSeconds = DEFAULT_ROUND_SECONDS) {
  const game = games.get(code);
  const round = game ? game.round + 1 : 1; // 현재 입력 단계의 라운드 번호
  const t = {
    round,
    deadline: Date.now() + durationSeconds * 1000,
    durationSeconds,
  };
  timers.set(code, t);
  io.to(`room:${code}`).emit('state:timer', t);
}

function broadcastTimer(code: string) {
  const t = timers.get(code);
  if (t) io.to(`room:${code}`).emit('state:timer', t);
}

function publicSlots(room: Room): PlayerSlot[] {
  return room.slots.map((s) => ({
    slotToken: s.slotToken,
    team: s.team,
    wheel: s.wheel,
    joined: s.joined,
    name: s.name,
  }));
}

function emitRoomUpdate(code: string) {
  const room = getRoom(code);
  if (!room) return;
  io.to(`room:${code}`).emit('room:update', {
    summary: summary(room),
    slots: publicSlots(room),
  });
  // 진행자에게는 미션 포함 private slots
  io.to(`host:${code}`).emit('host:slots-private', room.slots);
}

function broadcastSubmissions(code: string) {
  const room = getRoom(code);
  if (!room) return;
  const subs = submissions.get(code) ?? [];
  const info: SubmissionInfo[] = room.slots.map((slot) => {
    const slotSubs = subs.filter((s) => s.slotToken === slot.slotToken);
    const selfSub = slotSubs.find((s) => s.action.kind !== 'predict');
    const predSub = slotSubs.find((s) => s.action.kind === 'predict');
    let selfDetail: string | undefined;
    let selfKind: 'move' | 'wall' | undefined;
    if (selfSub) {
      if (selfSub.action.kind === 'move') {
        selfKind = 'move';
        selfDetail = `각도 ${selfSub.action.angle}° / 회전 ${selfSub.action.rot}`;
      } else if (selfSub.action.kind === 'wall') {
        selfKind = 'wall';
        selfDetail = `벽 (${Math.round(selfSub.action.x)}, ${Math.round(selfSub.action.y)})`;
      }
    }
    let predDetail: string | undefined;
    if (predSub && predSub.action.kind === 'predict') {
      const p = predSub.action;
      predDetail = `대상: ${p.target.team}/${['fl','fr','bl','br'][p.target.wheelIdx]} → ${p.predicted.kind}`;
    }
    return {
      slotToken: slot.slotToken,
      team: slot.team,
      wheel: slot.wheel,
      submitted: !!selfSub,
      selfKind,
      selfDetail,
      submittedAt: selfSub?.submittedAt,
      hasPrediction: !!predSub,
      predDetail,
    };
  });
  // 호스트가 있는 room으로 broadcast (간단히 room 전체로 — 어차피 슬롯토큰 노출은 호스트에게만 의미)
  io.to(`room:${code}`).emit('submissions:update', info);
}

function broadcastState(code: string) {
  const game = games.get(code);
  if (!game) return;
  io.to(`room:${code}`).emit('state:kartrido', {
    round: game.round,
    cars: game.cars.map((c) => ({
      team: c.team,
      x: c.x, y: c.y,
      bodyAngle: c.bodyAngle,
      finished: c.finished,
      progressPct: 0,
    })),
    walls: game.walls.map((w) => ({
      x: w.x, y: w.y, orientation: w.orientation,
    })),
    wallsRemaining: game.wallsRemaining,
  });
}

function findRoomBySlotToken(slotToken: string): Room | undefined {
  for (const r of allRooms()) {
    if (r.slots.some((s) => s.slotToken === slotToken)) return r;
  }
  return undefined;
}

// WheelInput → 자기 액션 + (있으면) 예측 액션, 두 RoundAction 생성
function inputToActions(input: WheelInput, currentRound: number = 1): RoundAction[] {
  const actions: RoundAction[] = [];
  const self = input.selfAction;
  // 회전수 라운드 제한: 1라운드 → max 1, 15라운드 → max 15
  const rotMax = Math.max(1, Math.min(15, currentRound));
  if (self.kind === 'move') {
    const r = Math.max(1, Math.min(rotMax, self.rot));
    actions.push({ kind: 'move', angle: self.angle, rot: r });
  } else actions.push({ kind: 'wall', x: self.x, y: self.y, orientation: self.orientation, a: self.a, b: self.b, dir: self.dir });
  if (input.prediction) {
    const p = input.prediction;
    const wheelIdx = ['fl', 'fr', 'bl', 'br'].indexOf(p.target.wheel);
    actions.push({
      kind: 'predict',
      target: { team: p.target.team, wheelIdx },
      predicted: p.predicted as any,
      desired: p.desired.kind === 'move'
        ? { kind: 'move', angle: p.desired.angle, rot: p.desired.rot }
        : { kind: 'wall', x: p.desired.x, y: p.desired.y, orientation: p.desired.orientation, a: p.desired.a, b: p.desired.b, dir: p.desired.dir },
    });
  }
  return actions;
}

function runRound(code: string) {
  const room = getRoom(code);
  const game = games.get(code);
  let subs = submissions.get(code);
  if (!room || !game || !subs) return;

  // 스냅샷 저장 (되돌리기용) — 게임 상태 + 그 라운드 입력값 모두
  const hist = gameHistory.get(code) ?? [];
  hist.push({
    game: snapshot(game),
    subs: JSON.parse(JSON.stringify(subs)),
  });
  gameHistory.set(code, hist);

  // 미제출 슬롯에 기본값 채우기 (테스트 편의 — 정지 상태)
  const submittedTokens = new Set(subs.map((s) => s.slotToken));
  const now = Date.now();
  for (const slot of room.slots) {
    if (!submittedTokens.has(slot.slotToken)) {
      const wheelIdx = ['fl', 'fr', 'bl', 'br'].indexOf(slot.wheel);
      subs.push({
        slotToken: slot.slotToken,
        team: slot.team,
        wheelIdx,
        action: { kind: 'move', angle: 0, rot: 1 }, // 기본: 오른쪽 약하게
        submittedAt: now,
      });
    }
  }

  room.phase = 'kartrido-anim';
  io.to(`room:${code}`).emit('phase:changed', room.phase);

  // 로그 생성 (제출 시각 순으로 정렬 후 표시)
  const logEvents: string[] = [];
  const sortedSubs = [...subs].sort((a, b) => a.submittedAt - b.submittedAt);
  for (const sub of sortedSubs) {
    const slot = room.slots.find((s) => s.slotToken === sub.slotToken);
    const wheelName = ['왼앞', '오른앞', '왼뒤', '오른뒤'][sub.wheelIdx];
    const name = slot?.name ?? sub.slotToken.slice(0, 6);
    const act = sub.action;
    const t = new Date(sub.submittedAt).toLocaleTimeString('ko-KR', { hour12: false });
    const prefix = `[${t}] ${name} [${sub.team} ${wheelName}]`;
    if (act.kind === 'move') {
      logEvents.push(`${prefix} → 이동 ${act.angle}°/${act.rot}`);
    } else if (act.kind === 'wall') {
      logEvents.push(`${prefix} → 벽 (${act.a},${act.b},${act.dir})`);
    } else if (act.kind === 'predict') {
      const target = `${act.target.team}/${['fl','fr','bl','br'][act.target.wheelIdx]}`;
      const predDesc = act.predicted.kind === 'move'
        ? `이동 ${act.predicted.angle}°/${act.predicted.rot}`
        : '벽 설치';
      const desDesc = act.desired.kind === 'move'
        ? `이동 ${act.desired.angle}°/${act.desired.rot}`
        : `벽(${act.desired.a},${act.desired.b},${act.desired.dir})`;
      logEvents.push(`${prefix} → 예측 ${target} = "${predDesc}", 성공시 → "${desDesc}"`);
    }
  }

  const { game: updated } = processRound(game, subs);
  games.set(code, updated);
  submissions.set(code, []);
  broadcastSubmissions(code);

  // 처리 결과 (벽 성공/실패) 추가
  const wallResults: string[] = (updated as any).lastWallResults ?? [];
  const allEvents = [...logEvents, ...(wallResults.length ? ['--- 벽 처리 결과 ---', ...wallResults] : [])];

  const logEntry = {
    round: updated.round,
    timestamp: Date.now(),
    events: allEvents,
  };
  const logs = roundLogs.get(code) ?? [];
  logs.push(logEntry);
  roundLogs.set(code, logs);
  io.to(`host:${code}`).emit('log:append', logEntry);

  // 궤적 송신 (애니메이션용)
  const trajectory = (updated as any).lastTrajectory;
  if (trajectory) {
    io.to(`room:${code}`).emit('state:kartrido-anim', {
      teams: updated.cars.map((c) => c.team),
      steps: trajectory,
    });
  }
  broadcastState(code);

  // 한 차라도 finished거나 15라운드 완료면 자동 종료
  const anyFinished = updated.cars.some((c) => c.finished);
  const maxRoundReached = updated.round >= 15;
  if (anyFinished || maxRoundReached) {
    setTimeout(() => {
      updated.finished = true;
      room.phase = 'kartrido-end';
      io.to(`room:${code}`).emit('phase:changed', room.phase);
      broadcastKartridoResults(code);
    }, 5000); // 애니메이션 후
  } else {
    setTimeout(() => {
      room.phase = 'kartrido-input';
      io.to(`room:${code}`).emit('phase:changed', room.phase);
      startTimer(code);
    }, 5000);
  }
}

function broadcastKartridoResults(code: string) {
  const room = getRoom(code);
  const game = games.get(code);
  if (!room || !game) return;
  // 미션 7 추리 결과 (있으면 반영)
  const guesses = mission7Guesses.get(code) ?? new Map();
  // 꼴찌팀 미션7 보유자가 미션8을 정확히 맞혔는지
  let m7HitM8 = false;
  const ranking = finalRanking(game, room?.slots ?? []);
  const lastTeam = ranking[ranking.length - 1];
  for (const slot of room.slots) {
    if (game.missions[slot.slotToken] === 7 && slot.team === lastTeam) {
      const g = guesses.get(slot.slotToken) ?? [];
      for (const { target, missionId } of g) {
        const targetMission = game.missions[target];
        if (targetMission === 8 && missionId === 8) {
          // 같은 차의 다른 바퀴인지 확인
          const targetSlot = room.slots.find((s) => s.slotToken === target);
          if (targetSlot && targetSlot.team === slot.team) m7HitM8 = true;
        }
      }
    }
  }
  const next = computeNextMatchSlots(game, room.slots, m7HitM8);
  const evals = evaluateMissions(game, room.slots);
  io.to(`room:${code}`).emit('kartrido:results', {
    ranking,
    assignments: room.slots.map((s) => ({
      slotToken: s.slotToken,
      name: s.name,
      team: s.team,
      wheel: s.wheel,
      mission: game.missions[s.slotToken],
      missionSuccess: evals[s.slotToken]?.success ?? false,
      reward: evals[s.slotToken]?.reward ?? 0,
    })),
    nextMatch: {
      angel: next.angel.map((s) => s.slotToken),
      devil: next.devil.map((s) => s.slotToken),
    },
  });
}

function broadcastQuoridorState(code: string) {
  const game = quoridorGames.get(code);
  if (!game) return;
  io.to(`room:${code}`).emit('state:quoridor', {
    pawns: game.pawns.map((p) => ({
      side: p.side, x: p.x, y: p.y, walls: p.walls, finished: p.finished,
    })),
    walls: game.walls.map((w) => ({
      x: w.x, y: w.y, orientation: w.orientation, ownerSide: w.ownerSide,
    })),
    currentSide: game.currentSide,
    turn: game.turn,
  });
}

io.on('connection', (socket) => {
  socket.on('host:create-room', (cb) => {
    const room = createRoom();
    socket.join(`room:${room.code}`);
    socket.join(`host:${room.code}`);
    cb({ code: room.code, hostToken: room.hostToken, slots: publicSlots(room) });
    emitRoomUpdate(room.code);
    // 기존 로그 (방 만든 직후엔 비어있지만 안전하게)
    socket.emit('log:full', roundLogs.get(room.code) ?? []);
  });

  socket.on('player:join', ({ slotToken, name }, cb) => {
    const result = joinSlot(slotToken, name);
    if (!result) return cb({ ok: false, reason: 'invalid token' });
    const { room, slot } = result;
    socket.join(`room:${room.code}`);
    socket.join(`slot:${slot.slotToken}`);
    cb({ ok: true, slot, mission: slot.mission });
    // 현재 phase + 본인 미션 재전달 (재접속 대응)
    socket.emit('phase:changed', room.phase);
    if (slot.mission) socket.emit('player:mission-assigned', slot.mission);
    const t = timers.get(room.code);
    if (t) socket.emit('state:timer', t);
    emitRoomUpdate(room.code);
  });

  socket.on('tv:join', ({ code }) => {
    const room = getRoom(code);
    if (!room) return socket.emit('error', 'room not found');
    socket.join(`room:${code}`);
    socket.emit('room:update', { summary: summary(room), slots: publicSlots(room) });
    // 현재 phase 직접 전달 (재접속 대응)
    socket.emit('phase:changed', room.phase);
    // 카트라이도 진행 중이면 현재 상태도 전달
    const game = games.get(code);
    if (game) {
      socket.emit('state:kartrido', {
        round: game.round,
        cars: game.cars.map((c) => ({
          team: c.team, x: c.x, y: c.y, bodyAngle: c.bodyAngle,
          finished: c.finished, progressPct: 0,
        })),
        walls: game.walls.map((w) => ({ x: w.x, y: w.y, orientation: w.orientation })),
        wallsRemaining: game.wallsRemaining,
      });
    }
    // 협동 쿼리도 진행 중이면 그것도
    const qGame = quoridorGames.get(code);
    if (qGame) {
      socket.emit('state:quoridor', {
        pawns: qGame.pawns.map((p) => ({
          side: p.side, x: p.x, y: p.y, walls: p.walls, finished: p.finished,
        })),
        walls: qGame.walls.map((w) => ({
          x: w.x, y: w.y, orientation: w.orientation, ownerSide: w.ownerSide,
        })),
        currentSide: qGame.currentSide,
        turn: qGame.turn,
      });
    }
    // 카트라이도 종료 결과 화면도 복원
    if (room.phase === 'kartrido-end' && game) {
      broadcastKartridoResults(code);
    }
    // 현재 타이머 재전송
    const t = timers.get(code);
    if (t) socket.emit('state:timer', t);
  });

  socket.on('host:start-game', ({ code, hostToken }) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return;
    const missions = assignMissions(room.slots);
    for (const slot of room.slots) {
      slot.mission = missions[slot.slotToken];
      io.to(`slot:${slot.slotToken}`).emit('player:mission-assigned', slot.mission!);
    }
    const game = createKartridoGame();
    game.missions = missions;
    games.set(code, game);
    submissions.set(code, []);
    room.phase = 'kartrido-input';
    io.to(`room:${code}`).emit('phase:changed', room.phase);
    broadcastState(code);
    broadcastSubmissions(code);
    emitRoomUpdate(code);
    startTimer(code); // 라운드 1 시작 — 기본 20분
  });

  socket.on('host:reset', ({ code, hostToken }) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return;
    games.delete(code);
    submissions.delete(code);
    room.phase = 'lobby';
    for (const slot of room.slots) {
      slot.mission = undefined;
      slot.joined = false;
    }
    io.to(`room:${code}`).emit('phase:changed', room.phase);
    emitRoomUpdate(code);
  });

  // ─── 미션 7 추리 제출 ─────────────────
  socket.on('player:submit-mission7', ({ slotToken, guesses }) => {
    const room = findRoomBySlotToken(slotToken);
    if (!room) return;
    const map = mission7Guesses.get(room.code) ?? new Map();
    map.set(slotToken, guesses);
    mission7Guesses.set(room.code, map);
    broadcastKartridoResults(room.code);
  });

  // ─── 협동 쿼리도 ─────────────────────
  socket.on('host:start-quoridor', ({ code, hostToken }) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return;
    let game = games.get(code);
    // 카트라이도 game 없으면 임의 순위로 더미 생성 (협동쿼리도 단독 모드)
    if (!game) {
      game = createKartridoGame();
      games.set(code, game);
    }
    const ranking = finalRanking(game, room?.slots ?? []);
    const firstTeam = ranking[0];
    const lastTeam = ranking[ranking.length - 1];
    // 카트라이도 바퀴 위치 기준 매칭
    const firstByWheel: Record<string, string> = {};
    const lastByWheel: Record<string, string> = {};
    for (const s of room.slots) {
      if (s.team === firstTeam) firstByWheel[s.wheel] = s.slotToken;
      if (s.team === lastTeam) lastByWheel[s.wheel] = s.slotToken;
    }
    const wheels = ['fl', 'fr', 'bl', 'br'] as const;
    const sides = ['top', 'right', 'bottom', 'left'] as const;
    const members: TeamMember[] = [];
    for (let i = 0; i < 4; i++) {
      const side = sides[i];
      const wheel = wheels[i];
      // 같은 바퀴의 (꼴찌팀 엔젤 / 1등팀 데블)
      const angelToken = lastByWheel[wheel];   // 엔젤 = 꼴찌팀 (8 보유자), 단순화로 일단 그 바퀴 사람
      const devilToken = firstByWheel[wheel];
      if (angelToken) members.push({ side, role: 'wall', slotToken: angelToken }); // 임시 — 실제 role은 본인 선택
      if (devilToken) members.push({ side, role: 'move', slotToken: devilToken });
    }
    const qGame = createQuoridor(members);
    quoridorGames.set(code, qGame);
    quoridorRoles.set(code, new Map());
    room.phase = 'quoridor-play'; // setup 건너뛰고 바로 play (진행자가 직접 조작)
    io.to(`room:${code}`).emit('phase:changed', room.phase);
    broadcastQuoridorState(code);
    // 컴포넌트 mount 후 listener 등록 시점 위해 한 번 더
    setTimeout(() => broadcastQuoridorState(code), 300);
  });

  socket.on('quoridor:choose-room', ({ slotToken, role }) => {
    const room = findRoomBySlotToken(slotToken);
    if (!room) return;
    const map = quoridorRoles.get(room.code) ?? new Map();
    map.set(slotToken, role);
    quoridorRoles.set(room.code, map);
    // 모두 선택 완료 시 phase 전환
    const game = quoridorGames.get(room.code);
    if (game && map.size >= game.members.length) {
      // members의 role 갱신
      for (const m of game.members) {
        const r = map.get(m.slotToken);
        if (r) m.role = r;
      }
      const r = getRoom(room.code);
      if (r) {
        r.phase = 'quoridor-play';
        io.to(`room:${room.code}`).emit('phase:changed', r.phase);
      }
    }
  });

  socket.on('host:quoridor-act', ({ code, hostToken, side, move, wall }) => {
    const room = getRoom(code);
    const game = quoridorGames.get(code);
    if (!room || !game || room.hostToken !== hostToken) return;
    const pawn = game.pawns.find((p) => p.side === side);
    if (!pawn || pawn.finished) return;

    // 스냅샷 저장 (undo용)
    const hist = quoridorHistory.get(code) ?? [];
    hist.push(snapshotQ(game));
    quoridorHistory.set(code, hist);

    const hasMove = !!move;
    const hasWall = !!wall;

    // 룰: 둘 다 시도 또는 둘 다 안 함 → 페널티 + 그 턴 액션 없음
    if (hasMove && hasWall) {
      applyPenalty(game, side);
    } else if (!hasMove && !hasWall) {
      applyPenalty(game, side);
    } else if (hasMove) {
      const res = tryMove(game, side, move!.toX, move!.toY);
      // 이동 실패는 페널티 없음 (벽으로 막혔거나 점유)
    } else if (hasWall) {
      const res = tryWall(game, side, wall!.x, wall!.y, wall!.orientation);
      if (!res.ok) applyPenalty(game, side); // 무효 벽 → 페널티
    }
    // 항상 다음 차례 진행
    advanceTurn(game);
    broadcastQuoridorState(code);
  });

  socket.on('host:quoridor-next-turn', ({ code, hostToken }) => {
    const room = getRoom(code);
    const game = quoridorGames.get(code);
    if (!room || !game || room.hostToken !== hostToken) return;
    const hist = quoridorHistory.get(code) ?? [];
    hist.push(snapshotQ(game));
    quoridorHistory.set(code, hist);
    advanceTurn(game);
    broadcastQuoridorState(code);
  });

  socket.on('host:quoridor-set-walls', ({ code, hostToken, side, walls }) => {
    const room = getRoom(code);
    const game = quoridorGames.get(code);
    if (!room || !game || room.hostToken !== hostToken) return;
    const pawn = game.pawns.find((p) => p.side === side);
    if (!pawn) return;
    const hist = quoridorHistory.get(code) ?? [];
    hist.push(snapshotQ(game));
    quoridorHistory.set(code, hist);
    pawn.walls = Math.max(0, Math.min(99, walls));
    broadcastQuoridorState(code);
  });

  socket.on('host:quoridor-set-death', ({ code, hostToken, side, dead }) => {
    const room = getRoom(code);
    const game = quoridorGames.get(code);
    if (!room || !game || room.hostToken !== hostToken) return;
    const pawn = game.pawns.find((p) => p.side === side);
    if (!pawn) return;
    const hist = quoridorHistory.get(code) ?? [];
    hist.push(snapshotQ(game));
    quoridorHistory.set(code, hist);
    pawn.finished = dead;
    if (dead && !game.finishOrder.includes(side)) game.finishOrder.push(side);
    if (!dead) game.finishOrder = game.finishOrder.filter((s) => s !== side);
    broadcastQuoridorState(code);
  });

  socket.on('host:quoridor-set-pos', ({ code, hostToken, side, x, y }) => {
    const room = getRoom(code);
    const game = quoridorGames.get(code);
    if (!room || !game || room.hostToken !== hostToken) return;
    const pawn = game.pawns.find((p) => p.side === side);
    if (!pawn) return;
    const hist = quoridorHistory.get(code) ?? [];
    hist.push(snapshotQ(game));
    quoridorHistory.set(code, hist);
    pawn.x = Math.max(0, Math.min(8, x));
    pawn.y = Math.max(0, Math.min(8, y));
    broadcastQuoridorState(code);
  });

  socket.on('host:quoridor-undo', ({ code, hostToken }) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return;
    const hist = quoridorHistory.get(code) ?? [];
    if (hist.length === 0) return;
    const prev = hist.pop()!;
    quoridorGames.set(code, prev);
    quoridorHistory.set(code, hist);
    broadcastQuoridorState(code);
  });

  socket.on('quoridor:submit-action', ({ slotToken, action }) => {
    const room = findRoomBySlotToken(slotToken);
    const game = room ? quoridorGames.get(room.code) : null;
    if (!room || !game) return;
    const member = game.members.find((m) => m.slotToken === slotToken);
    if (!member) return;
    if (member.side !== game.currentSide) return; // 자기 차례 아님

    // role 검증 (벽 방=wall 만, 이동 방=move 만)
    if (action.kind === 'wall' && member.role !== 'wall') {
      applyPenalty(game, member.side);
      broadcastQuoridorState(room.code);
      return;
    }
    if (action.kind === 'move' && member.role !== 'move') return;

    if (action.kind === 'move') {
      const res = tryMove(game, member.side, action.toX, action.toY);
      if (res.ok) advanceTurn(game);
    } else if (action.kind === 'wall') {
      const res = tryWall(game, member.side, action.x, action.y, action.orientation);
      if (!res.ok) applyPenalty(game, member.side);
      else advanceTurn(game);
    }
    broadcastQuoridorState(room.code);

    // 게임 종료 체크
    if (game.finished) {
      const r = getRoom(room.code);
      if (r) {
        r.phase = 'finished';
        io.to(`room:${room.code}`).emit('phase:changed', r.phase);
        io.to(`room:${room.code}`).emit('quoridor:results', {
          ranking: game.finishOrder.map((side, i) => {
            const reward = i === 0 ? 400_000 : i === 1 ? 200_000 : 0;
            const slotTokens = game.members
              .filter((m) => m.side === side)
              .map((m) => m.slotToken);
            return { side, slotTokens, reward, passed: i < 2 };
          }),
        });
      }
    }
  });

  socket.on('player:submit-input', ({ slotToken, input }) => {
    const room = findRoomBySlotToken(slotToken);
    if (!room) return;
    const slot = room.slots.find((s) => s.slotToken === slotToken)!;
    const list = submissions.get(room.code) ?? [];
    const currentRound = (timers.get(room.code)?.round) ?? ((games.get(room.code)?.round ?? 0) + 1);
    const actions = inputToActions(input, currentRound);
    const wheelIdx = ['fl', 'fr', 'bl', 'br'].indexOf(slot.wheel);
    const now = Date.now();

    // 슬롯의 기존 submission 제거 후 새로 추가
    const filtered = list.filter((s) => s.slotToken !== slotToken);
    for (const action of actions) {
      filtered.push({
        slotToken, team: slot.team, wheelIdx, action, submittedAt: now,
      });
    }
    submissions.set(room.code, filtered);

    // 자동 시뮬레이션 트리거 제거 — 호스트가 'host:run-round'로 수동 진행
    broadcastSubmissions(room.code);
  });

  socket.on('host:run-round', ({ code, hostToken }) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return;
    if (room.phase !== 'kartrido-input') return;
    runRound(code);
  });

  socket.on('host:set-slot-name', ({ code, hostToken, slotToken, name }) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return;
    const slot = room.slots.find((s) => s.slotToken === slotToken);
    if (!slot) return;
    slot.name = name;
    emitRoomUpdate(code);
  });

  socket.on('host:end-kartrido', ({ code, hostToken }) => {
    const room = getRoom(code);
    const game = games.get(code);
    if (!room || !game || room.hostToken !== hostToken) return;
    // 종료 직전 스냅샷 push → undo로 input phase 복귀 가능
    const hist = gameHistory.get(code) ?? [];
    hist.push({
      game: snapshot(game),
      subs: JSON.parse(JSON.stringify(submissions.get(code) ?? [])),
    });
    gameHistory.set(code, hist);
    game.finished = true;
    room.phase = 'kartrido-end';
    io.to(`room:${code}`).emit('phase:changed', room.phase);
    broadcastKartridoResults(code);
  });

  socket.on('host:set-timer', ({ code, hostToken, remainingSeconds }) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return;
    const cur = timers.get(code);
    const round = cur?.round ?? 1;
    const t = {
      round,
      deadline: Date.now() + remainingSeconds * 1000,
      durationSeconds: cur?.durationSeconds ?? DEFAULT_ROUND_SECONDS,
    };
    timers.set(code, t);
    io.to(`room:${code}`).emit('state:timer', t);
  });

  socket.on('host:fill-random', ({ code, hostToken }) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return;
    const list = submissions.get(code) ?? [];
    const submittedTokens = new Set(list.map((s) => s.slotToken));
    const now = Date.now();
    const angles = Array.from({ length: 18 }, (_, i) => i * 20);
    const currentRound = (timers.get(code)?.round) ?? ((games.get(code)?.round ?? 0) + 1);
    const rotMax = Math.max(1, Math.min(15, currentRound));
    for (const slot of room.slots) {
      if (submittedTokens.has(slot.slotToken)) continue;
      const wheelIdx = ['fl', 'fr', 'bl', 'br'].indexOf(slot.wheel);
      const angle = angles[Math.floor(Math.random() * angles.length)];
      const rot = 1 + Math.floor(Math.random() * rotMax);
      list.push({
        slotToken: slot.slotToken, team: slot.team, wheelIdx,
        action: { kind: 'move', angle, rot },
        submittedAt: now,
      });
    }
    submissions.set(code, list);
    broadcastSubmissions(code);
  });

  socket.on('host:undo-round', ({ code, hostToken }) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return;
    const hist = gameHistory.get(code) ?? [];
    if (hist.length === 0) return;
    const prev = hist.pop()!;
    games.set(code, prev.game);
    submissions.set(code, prev.subs); // 진행 누르기 전 입력값 복원
    gameHistory.set(code, hist);
    room.phase = 'kartrido-input';
    io.to(`room:${code}`).emit('phase:changed', room.phase);
    broadcastState(code);
    broadcastSubmissions(code);
  });

  socket.on('host:override-input', ({ code, hostToken, slotToken, input }) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return;
    const slot = room.slots.find((s) => s.slotToken === slotToken);
    if (!slot) return;
    const list = submissions.get(code) ?? [];
    const currentRound = (timers.get(code)?.round) ?? ((games.get(code)?.round ?? 0) + 1);
    const actions = inputToActions(input, currentRound);
    const wheelIdx = ['fl', 'fr', 'bl', 'br'].indexOf(slot.wheel);
    const now = Date.now();
    const filtered = list.filter((s) => s.slotToken !== slotToken);
    for (const action of actions) {
      filtered.push({
        slotToken, team: slot.team, wheelIdx, action, submittedAt: now,
      });
    }
    submissions.set(code, filtered);
    broadcastSubmissions(code);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Wheel Race server listening on http://localhost:${PORT}`);
});
