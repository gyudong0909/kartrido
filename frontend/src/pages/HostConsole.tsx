import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { socket } from '../socket';
import RoundTimer from '../components/RoundTimer';
import WallMiniMap from '../components/WallMiniMap';
import QuoridorHostPanel from '../game/quoridor/QuoridorHostPanel';
import {
  WHEEL_NAMES_KO, MISSION_LABELS, TEAM_COLORS, WHEEL_POS,
  type PlayerSlot, type RoomSummary, type SubmissionInfo, type GamePhase, type WheelInput,
  type TeamColor, type WheelPos, type RoundLogEntry, type KartridoResults,
} from '@wheel-race/shared';

export default function HostConsole() {
  const [code, setCode] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [slots, setSlots] = useState<PlayerSlot[]>([]);
  const [summary, setSummary] = useState<RoomSummary | null>(null);
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [round, setRound] = useState(1);
  const [subs, setSubs] = useState<SubmissionInfo[]>([]);
  const [privSlots, setPrivSlots] = useState<PlayerSlot[]>([]); // 미션 포함
  const [logs, setLogs] = useState<RoundLogEntry[]>([]);
  const [results, setResults] = useState<KartridoResults | null>(null);

  useEffect(() => {
    const onUpdate = (data: { summary: RoomSummary; slots: PlayerSlot[] }) => {
      setSummary(data.summary);
      setSlots(data.slots);
      setPhase(data.summary.phase);
    };
    const onPhase = (p: GamePhase) => setPhase(p);
    const onSubs = (s: SubmissionInfo[]) => setSubs(s);
    const onPriv = (s: PlayerSlot[]) => setPrivSlots(s);
    const onTimer = (t: { round: number }) => setRound(t.round);
    const onLogAppend = (e: RoundLogEntry) => setLogs((prev) => [...prev, e]);
    const onLogFull = (entries: RoundLogEntry[]) => setLogs(entries);
    const onResults = (r: KartridoResults) => setResults(r);
    socket.on('room:update', onUpdate);
    socket.on('phase:changed', onPhase);
    socket.on('submissions:update', onSubs);
    socket.on('host:slots-private', onPriv);
    socket.on('state:timer', onTimer);
    socket.on('log:append', onLogAppend);
    socket.on('log:full', onLogFull);
    socket.on('kartrido:results', onResults);
    return () => {
      socket.off('room:update', onUpdate);
      socket.off('phase:changed', onPhase);
      socket.off('submissions:update', onSubs);
      socket.off('host:slots-private', onPriv);
      socket.off('state:timer', onTimer);
      socket.off('log:append', onLogAppend);
      socket.off('log:full', onLogFull);
      socket.off('kartrido:results', onResults);
    };
  }, []);

  function setSlotName(slotToken: string, name: string) {
    if (!code || !hostToken) return;
    socket.emit('host:set-slot-name', { code, hostToken, slotToken, name });
  }

  function overrideInput(slotToken: string, input: WheelInput) {
    if (!code || !hostToken) return;
    socket.emit('host:override-input', { code, hostToken, slotToken, input });
  }

  function createRoom() {
    socket.emit('host:create-room', (res) => {
      setCode(res.code);
      setHostToken(res.hostToken);
      setSlots(res.slots);
    });
  }

  function startGame() {
    if (!code || !hostToken) return;
    socket.emit('host:start-game', { code, hostToken });
  }

  function resetGame() {
    if (!code || !hostToken) return;
    socket.emit('host:reset', { code, hostToken });
  }

  function startQuoridor() {
    if (!code || !hostToken) return;
    socket.emit('host:start-quoridor', { code, hostToken });
  }

  function runRound() {
    if (!code || !hostToken) return;
    socket.emit('host:run-round', { code, hostToken });
  }

  function undoRound() {
    if (!code || !hostToken) return;
    if (!confirm('이전 라운드로 되돌리시겠어요? 마지막 시뮬레이션이 취소됩니다.')) return;
    socket.emit('host:undo-round', { code, hostToken });
  }

  function fillRandom() {
    if (!code || !hostToken) return;
    socket.emit('host:fill-random', { code, hostToken });
  }

  function setTimerSeconds(sec: number) {
    if (!code || !hostToken) return;
    socket.emit('host:set-timer', { code, hostToken, remainingSeconds: sec });
  }

  function endKartrido() {
    if (!code || !hostToken) return;
    if (!confirm('카트라이도를 종료하고 결과 화면으로 이동하시겠어요?')) return;
    socket.emit('host:end-kartrido', { code, hostToken });
  }

  const origin = window.location.origin;

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ color: '#e94560' }}>진행자 콘솔</h1>

      {!code ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <button
            onClick={createRoom}
            style={{
              padding: '14px 40px', fontSize: 18, background: '#e94560',
              color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            방 만들기 (카트라이도)
          </button>
          <button
            onClick={() => {
              socket.emit('host:create-room', (res) => {
                setCode(res.code);
                setHostToken(res.hostToken);
                setSlots(res.slots);
                // 방 만든 즉시 협동 쿼리도 시작
                socket.emit('host:start-quoridor', { code: res.code, hostToken: res.hostToken });
              });
            }}
            style={{
              padding: '14px 40px', fontSize: 18, background: '#ffd700',
              color: '#222', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            🧩 협동 쿼리도 바로 시작
          </button>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <strong>방 코드:</strong>{' '}
              <code style={{ fontSize: 22, color: '#ffd700' }}>{code}</code>
            </div>
            <div style={{
              padding: '6px 16px', borderRadius: 6,
              background: phaseBg(phase), color: '#fff', fontWeight: 'bold', fontSize: 16,
            }}>
              {phaseLabel(phase)}
            </div>
            <RoundTimer />
            {summary && <span style={{ color: '#aaa' }}>참가 {summary.joinedCount}/12</span>}
            <a href={`/tv/${code}`} target="_blank" style={{ color: '#4ea8de' }}>
              TV 화면 열기 →
            </a>
          </div>

          {/* 타이머 조정 */}
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: '#aaa', fontSize: 13 }}>타이머 조정:</span>
            <button onClick={() => setTimerSeconds(20 * 60)} style={btnStyle('#4ea8de')}>20분 리셋</button>
            <button onClick={() => setTimerSeconds(10 * 60)} style={btnStyle('#4ea8de')}>10분</button>
            <button onClick={() => setTimerSeconds(5 * 60)} style={btnStyle('#4ea8de')}>5분</button>
            <button onClick={() => setTimerSeconds(60)} style={btnStyle('#4ea8de')}>1분</button>
            <button onClick={() => setTimerSeconds(10)} style={btnStyle('#4ea8de')}>10초</button>
            <button onClick={() => {
              const m = prompt('남은 시간(분)?');
              if (m && !isNaN(+m)) setTimerSeconds(+m * 60);
            }} style={btnStyle('#444')}>직접 입력</button>
          </div>

          {/* 메인 액션 버튼 — phase별 강조 */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {phase === 'lobby' && (
              <button onClick={startGame} style={bigBtn('#06d6a0')}>▶ 카트라이도 시작 (미접속 OK)</button>
            )}
            {phase === 'kartrido-input' && (
              <>
                <button onClick={runRound} style={bigBtn('#e94560')}>▶ 이번 라운드 진행</button>
                <button onClick={fillRandom} style={btnStyle('#4ea8de')}>🎲 미제출자 랜덤 채우기</button>
                <button onClick={undoRound} style={btnStyle('#aa6600')}>↶ 이전 라운드로</button>
                <button onClick={endKartrido} style={btnStyle('#ffd700')}>🏁 카트라이도 종료 (결과)</button>
              </>
            )}
            {phase === 'kartrido-end' && (
              <>
                <button onClick={startQuoridor} style={bigBtn('#ffd700')}>▶ 협동 쿼리도 진행</button>
                <button onClick={undoRound} style={btnStyle('#aa6600')}>↶ 이전 라운드로 (종료 취소)</button>
              </>
            )}
            <button onClick={resetGame} style={btnStyle('#444')}>처음부터</button>
          </div>

          {/* 협동쿼리도 모드 — 다른 패널 다 숨기고 전용 UI */}
          {(phase === 'quoridor-setup' || phase === 'quoridor-play') ? (
            <QuoridorHostPanel code={code!} hostToken={hostToken!} />
          ) : (<>

          <h3 style={{ marginTop: 24 }}>참가자 슬롯 (12개) — 제출 상태 / QR / URL</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {slots.map((slot) => {
              const sub = subs.find((s) => s.slotToken === slot.slotToken);
              const priv = privSlots.find((s) => s.slotToken === slot.slotToken);
              return (
                <SlotCard
                  key={slot.slotToken}
                  slot={slot}
                  privSlot={priv}
                  origin={origin}
                  sub={sub}
                  round={round}
                  onSetName={(n) => setSlotName(slot.slotToken, n)}
                  onOverride={(i) => overrideInput(slot.slotToken, i)}
                />
              );
            })}
          </div>

          {/* 게임 종료 시 — 미션 1~4 결과 패널 */}
          {phase === 'kartrido-end' && results && (
            <>
              <h3 style={{ marginTop: 24, color: '#ffd700' }}>미션 결과 (1~4번 자동 평가)</h3>
              <div style={{ background: '#0f1a3a', borderRadius: 8, padding: 12 }}>
                <div style={{ marginBottom: 10, fontSize: 14, color: '#aaa' }}>
                  순위: {results.ranking.map((t, i) => `${i+1}위 ${t}`).join(' / ')}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #444', color: '#aaa' }}>
                      <th style={{ padding: 6, textAlign: 'left' }}>참가자</th>
                      <th style={{ padding: 6, textAlign: 'left' }}>팀/바퀴</th>
                      <th style={{ padding: 6, textAlign: 'left' }}>미션</th>
                      <th style={{ padding: 6, textAlign: 'center' }}>결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.assignments
                      .filter((a) => [1, 2, 3, 4].includes(a.mission))
                      .map((a) => {
                        const color = a.team === 'red' ? '#e94560' : a.team === 'blue' ? '#4ea8de' : '#06d6a0';
                        return (
                          <tr key={a.slotToken} style={{ borderBottom: '1px solid #2a2a4a' }}>
                            <td style={{ padding: 6 }}>{a.name ?? a.slotToken.slice(0, 6)}</td>
                            <td style={{ padding: 6, color }}>{a.team} / {WHEEL_NAMES_KO[a.wheel]}</td>
                            <td style={{ padding: 6 }}>{a.mission}. {MISSION_LABELS[a.mission]}</td>
                            <td style={{
                              padding: 6, textAlign: 'center', fontWeight: 'bold',
                              color: a.missionSuccess ? '#06d6a0' : '#e94560',
                            }}>
                              {a.missionSuccess ? '✓ 성공' : '✗ 실패'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                <div style={{ marginTop: 10, fontSize: 11, color: '#888' }}>
                  ※ 미션 5,6은 배정 안 됨 / 미션 7,8은 카톡으로 별도 정산
                </div>
              </div>
            </>
          )}

          {/* 라운드 로그 — 슬롯 아래로 이동 */}
          <h3 style={{ marginTop: 24 }}>라운드 진행 로그 ({logs.length}회)</h3>
          <div style={{
            background: '#0f1a3a', borderRadius: 8, padding: 12,
            maxHeight: 320, overflowY: 'auto', fontSize: 12, fontFamily: 'monospace',
          }}>
            {logs.length === 0 ? (
              <div style={{ color: '#666' }}>아직 진행된 라운드 없음</div>
            ) : (
              [...logs].reverse().map((entry) => (
                <div key={entry.round} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #2a2a4a' }}>
                  <div style={{ color: '#ffd700', fontWeight: 'bold', marginBottom: 4 }}>
                    라운드 {entry.round} — {new Date(entry.timestamp).toLocaleTimeString('ko-KR')}
                  </div>
                  {entry.events.map((ev, i) => (
                    <div key={i} style={{ color: '#aaa', paddingLeft: 8 }}>{ev}</div>
                  ))}
                </div>
              ))
            )}
          </div>

          </>)}
        </>
      )}
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: '10px 20px',
    fontSize: 15,
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 'bold',
  };
}

function bigBtn(bg: string): React.CSSProperties {
  return {
    padding: '16px 40px', fontSize: 22, background: bg,
    color: '#fff', border: 'none', borderRadius: 10,
    cursor: 'pointer', fontWeight: 'bold',
  };
}

function phaseLabel(p: string) {
  return {
    'lobby': '대기 중 (로비)',
    'kartrido-input': '카트라이도 - 입력 단계',
    'kartrido-anim': '카트라이도 - 시뮬레이션 진행',
    'kartrido-end': '카트라이도 - 종료, 협동 쿼리도 진출 단계',
    'quoridor-setup': '협동 쿼리도 - 방 선택',
    'quoridor-play': '협동 쿼리도 - 진행',
    'finished': '전체 종료',
  }[p] || p;
}

function miniChip(active: boolean, bg: string): React.CSSProperties {
  return {
    flex: 1, padding: 2, fontSize: 9,
    background: active ? bg : '#222', color: '#fff',
    border: 'none', borderRadius: 3, cursor: 'pointer',
  };
}

function phaseBg(p: string) {
  if (p === 'lobby') return '#666';
  if (p.startsWith('kartrido')) return '#e94560';
  if (p.startsWith('quoridor')) return '#ffd700';
  return '#06d6a0';
}

function SlotCard({ slot, privSlot, origin, sub, round, onSetName, onOverride }: {
  slot: PlayerSlot;
  privSlot?: PlayerSlot;
  origin: string;
  sub?: SubmissionInfo;
  round: number;
  onSetName: (name: string) => void;
  onOverride: (input: WheelInput) => void;
}) {
  const rotMax = Math.max(1, Math.min(15, round));
  const url = `${origin}/play/${slot.slotToken}`;
  const teamColor =
    slot.team === 'red' ? '#e94560' :
    slot.team === 'blue' ? '#4ea8de' : '#06d6a0';
  const [nameInput, setNameInput] = useState(slot.name ?? '');
  const [showOverride, setShowOverride] = useState(false);
  const [ovSelfKind, setOvSelfKind] = useState<'move' | 'wall'>('move');
  const [ovAngle, setOvAngle] = useState(0);
  const [ovRot, setOvRot] = useState(3);
  const [ovWallA, setOvWallA] = useState(3);
  const [ovWallB, setOvWallB] = useState(3);
  const [ovWallDir, setOvWallDir] = useState<'AB' | 'AC' | 'BC'>('BC');
  // 예측
  const [ovPredOn, setOvPredOn] = useState(false);
  const [ovPredTeam, setOvPredTeam] = useState<TeamColor>('red');
  const [ovPredWheel, setOvPredWheel] = useState<WheelPos>('fl');
  const [ovPredKind, setOvPredKind] = useState<'move' | 'wall'>('move');
  const [ovPredAngle, setOvPredAngle] = useState(0);
  const [ovPredRot, setOvPredRot] = useState(1);
  const [ovDesKind, setOvDesKind] = useState<'move' | 'wall'>('move');
  const [ovDesAngle, setOvDesAngle] = useState(0);
  const [ovDesRot, setOvDesRot] = useState(1);
  // 예측 desired가 wall일 때 좌표
  const [ovDesWallA, setOvDesWallA] = useState(3);
  const [ovDesWallB, setOvDesWallB] = useState(3);
  const [ovDesWallDir, setOvDesWallDir] = useState<'AB' | 'AC' | 'BC'>('BC');

  function copy() {
    navigator.clipboard.writeText(url).then(() => {});
  }

  function applyName() {
    if (nameInput.trim()) onSetName(nameInput.trim());
  }

  function applyOverride() {
    // 벽 격자 → 픽셀 좌표 변환 (frontend 단순 변환)
    const N = 10;
    // 삼각형 좌표 (KartridoBoard와 동일 계산 — 마진 변경에 동기화 필요)
    const W = 1600, H = 900;
    const TOP_M = 40, SIDE_M = 110, BOT_M = 140;
    const maxBase = W - SIDE_M * 2;
    const maxHeight = H - TOP_M - BOT_M;
    const base = Math.min(maxBase, (maxHeight * 2) / Math.sqrt(3));
    const height = (base * Math.sqrt(3)) / 2;
    const cx = W / 2;
    const A = { x: cx, y: TOP_M };
    const B = { x: cx - base / 2, y: TOP_M + height };
    const C = { x: cx + base / 2, y: TOP_M + height };
    const gp = (a: number, b: number) => {
      const c = N - a - b;
      return {
        x: (a * A.x + b * B.x + c * C.x) / N,
        y: (a * A.y + b * B.y + c * C.y) / N,
      };
    };

    let selfAction: WheelInput['selfAction'];
    if (ovSelfKind === 'move') {
      selfAction = { kind: 'move', angle: ovAngle, rot: Math.min(ovRot, rotMax) };
    } else {
      const p1 = gp(ovWallA, ovWallB);
      let endA = ovWallA, endB = ovWallB;
      if (ovWallDir === 'AB') { endA = ovWallA + 1; endB = ovWallB - 1; }
      else if (ovWallDir === 'AC') { endA = ovWallA + 1; }
      else { endB = ovWallB + 1; }
      const p2 = gp(endA, endB);
      selfAction = {
        kind: 'wall',
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
        orientation: Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI,
        a: ovWallA, b: ovWallB, dir: ovWallDir,
      };
    }
    const input: WheelInput = { selfAction };
    if (ovPredOn) {
      const desired = ovDesKind === 'move'
        ? { kind: 'move' as const, angle: ovDesAngle, rot: Math.min(ovDesRot, rotMax) }
        : (() => {
            const p1 = gp(ovDesWallA, ovDesWallB);
            let eA = ovDesWallA, eB = ovDesWallB;
            if (ovDesWallDir === 'AB') { eA++; eB--; }
            else if (ovDesWallDir === 'AC') { eA++; }
            else { eB++; }
            const p2 = gp(eA, eB);
            return {
              kind: 'wall' as const,
              x: (p1.x + p2.x) / 2,
              y: (p1.y + p2.y) / 2,
              orientation: Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI,
              a: ovDesWallA, b: ovDesWallB, dir: ovDesWallDir,
            };
          })();
      input.prediction = {
        target: { team: ovPredTeam, wheel: ovPredWheel },
        predicted: ovPredKind === 'move'
          ? { kind: 'move', angle: ovPredAngle, rot: ovPredRot }
          : { kind: 'wall' },
        desired,
      };
    }
    onOverride(input);
    setShowOverride(false);
  }

  return (
    <div style={{
      background: '#1a1a2e', border: `2px solid ${teamColor}`,
      borderRadius: 8, padding: 10, textAlign: 'center',
    }}>
      <div style={{ color: teamColor, fontWeight: 'bold', marginBottom: 6 }}>
        {slot.team.toUpperCase()} / {WHEEL_NAMES_KO[slot.wheel]}
      </div>
      <div style={{ background: '#fff', padding: 4, display: 'inline-block' }}>
        <QRCodeSVG value={url} size={110} />
      </div>

      {/* 전체 URL + 복사 버튼 */}
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          style={{
            flex: 1, fontSize: 11, padding: '4px 6px',
            background: '#0f1a3a', color: '#eee',
            border: '1px solid #333', borderRadius: 4,
            fontFamily: 'monospace',
          }}
        />
        <button
          onClick={copy}
          style={{
            padding: '4px 8px', fontSize: 11, fontWeight: 'bold',
            background: teamColor, color: '#fff', border: 'none',
            borderRadius: 4, cursor: 'pointer',
          }}
        >복사</button>
      </div>

      <div style={{
        marginTop: 4, fontSize: 12, fontWeight: 'bold',
        color: slot.joined ? '#06d6a0' : '#888',
      }}>
        {slot.joined ? '✓ 접속됨' : '⏳ 미접속'}
      </div>

      {/* 이름 입력 */}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onBlur={applyName}
          onKeyDown={(e) => e.key === 'Enter' && applyName()}
          placeholder="이름"
          style={{
            flex: 1, fontSize: 11, padding: '4px 6px',
            background: '#0f1a3a', color: '#eee',
            border: '1px solid #333', borderRadius: 4,
          }}
        />
      </div>

      {/* 미션 (진행자만 — privSlot) */}
      {privSlot?.mission && (
        <div style={{
          marginTop: 6, padding: 4, borderRadius: 4,
          background: '#3a2a0a', fontSize: 10,
        }}>
          <span style={{ color: '#ffd700', fontWeight: 'bold' }}>
            미션 {privSlot.mission}
          </span>
          <span style={{ color: '#aaa', marginLeft: 4 }}>
            {MISSION_LABELS[privSlot.mission]}
          </span>
        </div>
      )}

      {/* 라운드 제출 상태 */}
      {sub && (
        <div style={{
          marginTop: 6, padding: 6, borderRadius: 4,
          background: sub.submitted ? '#0a3a1a' : '#3a0a1a',
          fontSize: 11, textAlign: 'left',
        }}>
          {sub.submitted ? (
            <>
              <div style={{ color: '#06d6a0', fontWeight: 'bold' }}>
                ✓ 제출{sub.submittedAt && ` @ ${new Date(sub.submittedAt).toLocaleTimeString('ko-KR')}`}
              </div>
              <div>{sub.selfKind === 'move' ? '🚗' : '🧱'} {sub.selfDetail}</div>
              {sub.hasPrediction && <div style={{ color: '#ffd700' }}>+ 예측: {sub.predDetail}</div>}
            </>
          ) : (
            <div style={{ color: '#e94560' }}>미제출</div>
          )}
        </div>
      )}

      {/* 진행자 강제 제출 미니 폼 */}
      <button
        onClick={() => setShowOverride(!showOverride)}
        style={{
          width: '100%', marginTop: 6, padding: 4, fontSize: 10,
          background: '#222', color: '#aaa',
          border: '1px solid #333', borderRadius: 4, cursor: 'pointer',
        }}
      >{showOverride ? '닫기' : '대신 입력'}</button>

      {showOverride && (
        <div style={{ marginTop: 4, padding: 6, background: '#1a1a3a', borderRadius: 4 }}>
          {/* 액션 종류: 이동 / 벽 */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
            <button onClick={() => setOvSelfKind('move')} style={miniChip(ovSelfKind === 'move', '#4ea8de')}>A 이동</button>
            <button onClick={() => setOvSelfKind('wall')} style={miniChip(ovSelfKind === 'wall', '#8B4513')}>B 벽</button>
          </div>

          {ovSelfKind === 'move' && <>
            <div style={{ fontSize: 10, color: '#aaa' }}>각도 <b style={{ color: '#ffd700' }}>{ovAngle}°</b></div>
            <input type="range" min={0} max={340} step={20} value={ovAngle}
                   onChange={(e) => setOvAngle(+e.target.value)} style={{ width: '100%' }} />
            <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
              회전수 <b style={{ color: '#ffd700' }}>{Math.min(ovRot, rotMax)}</b>
              <span style={{ color: '#666', marginLeft: 4 }}>(max {rotMax})</span>
            </div>
            <input type="range" min={1} max={rotMax} value={Math.min(ovRot, rotMax)}
                   onChange={(e) => setOvRot(+e.target.value)} style={{ width: '100%' }} />
          </>}

          {ovSelfKind === 'wall' && <>
            <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4, textAlign: 'center' }}>
              격자선 클릭
            </div>
            <WallMiniMap
              a={ovWallA} b={ovWallB} dir={ovWallDir}
              onSelect={(na, nb, nd) => { setOvWallA(na); setOvWallB(nb); setOvWallDir(nd); }}
              size={180}
            />
            <div style={{ fontSize: 9, color: '#aaa', marginTop: 4, textAlign: 'center' }}>
              (a,b,c)=({ovWallA},{ovWallB},{10-ovWallA-ovWallB}) · {ovWallDir}
            </div>
          </>}

          {/* 예측 토글 */}
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6, fontSize: 10, color: '#aaa', cursor: 'pointer' }}>
            <input type="checkbox" checked={ovPredOn} onChange={(e) => setOvPredOn(e.target.checked)} />
            예측 시도 추가
          </label>
          {ovPredOn && (
            <div style={{ marginTop: 4, padding: 4, background: '#0f1a3a', borderRadius: 4 }}>
              <div style={{ fontSize: 9, color: '#aaa' }}>대상</div>
              <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
                {TEAM_COLORS.map((t) => (
                  <button key={t} onClick={() => setOvPredTeam(t)} style={{
                    flex: 1, padding: 2, fontSize: 9,
                    background: ovPredTeam === t ? '#e94560' : '#222',
                    color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
                  }}>{t[0].toUpperCase()}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
                {WHEEL_POS.map((w) => (
                  <button key={w} onClick={() => setOvPredWheel(w)} style={{
                    flex: 1, padding: 2, fontSize: 9,
                    background: ovPredWheel === w ? '#ffd700' : '#222',
                    color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer',
                  }}>{WHEEL_NAMES_KO[w]}</button>
                ))}
              </div>
              <div style={{ fontSize: 9, color: '#aaa' }}>예측 종류</div>
              <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
                <button onClick={() => setOvPredKind('move')} style={miniChip(ovPredKind === 'move', '#4ea8de')}>이동</button>
                <button onClick={() => setOvPredKind('wall')} style={miniChip(ovPredKind === 'wall', '#8B4513')}>벽</button>
              </div>
              {ovPredKind === 'move' && (
                <>
                  <div style={{ fontSize: 9, color: '#aaa' }}>예측 각도 {ovPredAngle}°</div>
                  <input type="range" min={0} max={340} step={20} value={ovPredAngle}
                         onChange={(e) => setOvPredAngle(+e.target.value)} style={{ width: '100%' }} />
                  <div style={{ fontSize: 9, color: '#aaa' }}>예측 회전 {ovPredRot}</div>
                  <input type="range" min={1} max={10} value={ovPredRot}
                         onChange={(e) => setOvPredRot(+e.target.value)} style={{ width: '100%' }} />
                </>
              )}
              <div style={{ fontSize: 9, color: '#aaa', marginTop: 6 }}>성공 시 → 그 바퀴를 어떻게</div>
              <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
                <button onClick={() => setOvDesKind('move')} style={miniChip(ovDesKind === 'move', '#4ea8de')}>이동</button>
                <button onClick={() => setOvDesKind('wall')} style={miniChip(ovDesKind === 'wall', '#8B4513')}>벽</button>
              </div>
              {ovDesKind === 'move' ? <>
                <div style={{ fontSize: 9, color: '#aaa' }}>각도 {ovDesAngle}° / 회전 {Math.min(ovDesRot, rotMax)} (max {rotMax})</div>
                <input type="range" min={0} max={340} step={20} value={ovDesAngle}
                       onChange={(e) => setOvDesAngle(+e.target.value)} style={{ width: '100%' }} />
                <input type="range" min={1} max={rotMax} value={Math.min(ovDesRot, rotMax)}
                       onChange={(e) => setOvDesRot(+e.target.value)} style={{ width: '100%' }} />
              </> : <>
                <div style={{ fontSize: 9, color: '#aaa', textAlign: 'center', marginBottom: 2 }}>벽 위치 클릭</div>
                <WallMiniMap
                  a={ovDesWallA} b={ovDesWallB} dir={ovDesWallDir}
                  onSelect={(na, nb, nd) => { setOvDesWallA(na); setOvDesWallB(nb); setOvDesWallDir(nd); }}
                  size={140}
                />
              </>}
            </div>
          )}

          <button onClick={applyOverride} style={{
            width: '100%', marginTop: 6, padding: 4, fontSize: 11,
            background: '#e94560', color: '#fff', border: 'none',
            borderRadius: 4, cursor: 'pointer', fontWeight: 'bold',
          }}>적용</button>
        </div>
      )}
    </div>
  );
}
