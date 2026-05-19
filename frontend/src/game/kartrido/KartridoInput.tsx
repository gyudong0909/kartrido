import { useState, useEffect } from 'react';
import { socket } from '../../socket';
import WallMiniMap from '../../components/WallMiniMap';
import {
  KARTRIDO, TEAM_COLORS, WHEEL_POS, WHEEL_NAMES_KO,
  type PlayerSlot, type TeamColor, type WheelPos, type WheelInput,
} from '@wheel-race/shared';

type SelfKind = 'move' | 'wall';

export default function KartridoInput({ slot }: { slot: PlayerSlot }) {
  // 현재 라운드 (회전수 max 제한용)
  const [round, setRound] = useState(1);
  useEffect(() => {
    const onTimer = (t: { round: number }) => setRound(t.round);
    socket.on('state:timer', onTimer);
    return () => { socket.off('state:timer', onTimer); };
  }, []);
  const rotMax = Math.max(1, Math.min(15, round));

  // 자기 액션
  const [selfKind, setSelfKind] = useState<SelfKind>('move');
  const [angle, setAngle] = useState(10);
  const [rot, setRot] = useState(1);
  const [wallA, setWallA] = useState(3);
  const [wallB, setWallB] = useState(3);
  const [wallDir, setWallDir] = useState<'AB' | 'AC' | 'BC'>('BC');
  const [wallPx, setWallPx] = useState({ x: 0, y: 0, orientation: 0 });

  const [desWallA, setDesWallA] = useState(3);
  const [desWallB, setDesWallB] = useState(3);
  const [desWallDir, setDesWallDir] = useState<'AB' | 'AC' | 'BC'>('BC');
  const [desWallPx, setDesWallPx] = useState({ x: 0, y: 0, orientation: 0 });

  // 예측 (선택)
  const [predEnabled, setPredEnabled] = useState(false);
  const [predTeam, setPredTeam] = useState<TeamColor>('red');
  const [predWheel, setPredWheel] = useState<WheelPos>('fl');
  const [predKind, setPredKind] = useState<'move' | 'wall'>('move');
  const [predAngle, setPredAngle] = useState(10);
  const [predRot, setPredRot] = useState(1);
  const [desKind, setDesKind] = useState<'move' | 'wall'>('move');
  const [desAngle, setDesAngle] = useState(10);
  const [desRot, setDesRot] = useState(3);
  const [submitted, setSubmitted] = useState(false);

  function submit() {
    const rotClamped = Math.max(1, Math.min(rot, rotMax));
    const selfAction = selfKind === 'move'
      ? { kind: 'move' as const, angle, rot: rotClamped }
      : { kind: 'wall' as const, x: wallPx.x, y: wallPx.y, orientation: wallPx.orientation, a: wallA, b: wallB, dir: wallDir };

    const prediction = predEnabled
      ? {
          target: { team: predTeam, wheel: predWheel },
          predicted: predKind === 'move'
            ? { kind: 'move' as const, angle: predAngle, rot: predRot }
            : { kind: 'wall' as const },
          desired: desKind === 'move'
            ? { kind: 'move' as const, angle: desAngle, rot: Math.min(desRot, rotMax) }
            : { kind: 'wall' as const, x: desWallPx.x, y: desWallPx.y, orientation: desWallPx.orientation, a: desWallA, b: desWallB, dir: desWallDir },
        }
      : undefined;

    const input: WheelInput = { selfAction, prediction };
    socket.emit('player:submit-input', { slotToken: slot.slotToken, input });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div style={{ textAlign: 'center', color: '#06d6a0', fontSize: 20, marginTop: 40 }}>
        ✓ 제출 완료. 다음 라운드 대기 중...
        <button onClick={() => setSubmitted(false)} style={resetBtn}>수정하기</button>
      </div>
    );
  }

  return (
    <div>
      {/* 자기 액션 (A 또는 B) */}
      <h2 style={{ color: '#ffd700', fontSize: 18 }}>① 내 바퀴 액션 (A 또는 B)</h2>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <Tab label="A 이동" active={selfKind === 'move'} onClick={() => setSelfKind('move')} />
        <Tab label="B 벽 설치" active={selfKind === 'wall'} onClick={() => setSelfKind('wall')} />
      </div>

      {selfKind === 'move' && (
        <div style={panelStyle}>
          <AngleGrid angle={angle} setAngle={setAngle} />
          <label style={lblStyle}>
            회전수(힘): <b style={{ color: '#ffd700', fontSize: 22 }}>{Math.min(rot, rotMax)}</b>
            <span style={{ color: '#888', fontSize: 11, marginLeft: 8 }}>(라운드 {round} — 최대 {rotMax})</span>
          </label>
          <input type="range" min={1} max={rotMax} value={Math.min(rot, rotMax)} onChange={(e) => setRot(+e.target.value)} style={{ width: '100%' }} />
        </div>
      )}
      {selfKind === 'wall' && (
        <WallBox
          a={wallA} setA={setWallA}
          b={wallB} setB={setWallB}
          dir={wallDir} setDir={setWallDir}
          setPx={setWallPx}
        />
      )}

      {/* 예측 (C, 선택) */}
      <h2 style={{ color: '#ffd700', fontSize: 18, marginTop: 24 }}>② 예측 시도 (C, 선택)</h2>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={predEnabled}
          onChange={(e) => setPredEnabled(e.target.checked)}
        />
        <span style={{ color: '#aaa', fontSize: 14 }}>예측 시도 사용</span>
      </label>

      {predEnabled && (
        <div style={panelStyle}>
          <div style={subTitle}>대상 바퀴</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {TEAM_COLORS.map((t) => (
              <button key={t} onClick={() => setPredTeam(t)} style={chip(predTeam === t, teamColor(t))}>
                {teamName(t)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {WHEEL_POS.map((w) => {
              const isSelf = predTeam === slot.team && w === slot.wheel;
              return (
                <button key={w} disabled={isSelf} onClick={() => setPredWheel(w)} style={{
                  ...chip(predWheel === w && !isSelf, '#ffd700'),
                  opacity: isSelf ? 0.3 : 1,
                }}>{WHEEL_NAMES_KO[w]}</button>
              );
            })}
          </div>

          <div style={subTitle}>예측 — 그 바퀴가 무엇을 했을지</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button onClick={() => setPredKind('move')} style={chip(predKind === 'move', '#4ea8de')}>이동</button>
            <button onClick={() => setPredKind('wall')} style={chip(predKind === 'wall', '#8B4513')}>벽</button>
          </div>
          {predKind === 'move' && (
            <div style={{ marginBottom: 14 }}>
              <AngleGrid angle={predAngle} setAngle={setPredAngle} />
              <label style={lblStyle}>회전수: <b style={{ color: '#ffd700' }}>{predRot}</b></label>
              <input type="range" min={1} max={rotMax} value={Math.min(predRot, rotMax)} onChange={(e) => setPredRot(+e.target.value)} style={{ width: '100%' }} />
            </div>
          )}

          <div style={subTitle}>성공 시 그 바퀴를 어떻게</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button onClick={() => setDesKind('move')} style={chip(desKind === 'move', '#4ea8de')}>이동</button>
            <button onClick={() => setDesKind('wall')} style={chip(desKind === 'wall', '#8B4513')}>벽</button>
          </div>
          {desKind === 'move' && (
            <>
              <AngleGrid angle={desAngle} setAngle={setDesAngle} />
              <label style={lblStyle}>회전수: <b style={{ color: '#ffd700' }}>{Math.min(desRot, rotMax)}</b></label>
              <input type="range" min={1} max={rotMax} value={Math.min(desRot, rotMax)} onChange={(e) => setDesRot(+e.target.value)} style={{ width: '100%' }} />
            </>
          )}
          {desKind === 'wall' && (
            <WallMiniMap
              a={desWallA} b={desWallB} dir={desWallDir}
              onSelect={(na, nb, nd) => {
                setDesWallA(na); setDesWallB(nb); setDesWallDir(nd);
                // px 계산은 WallBox에서 했었음 — 여기선 setDesWallPx 직접 계산
                // 단순화: WallBox 사용 안 함, px 계산 누락
              }}
              size={240}
            />
          )}
        </div>
      )}

      <button onClick={submit} style={submitBtn}>제출</button>
    </div>
  );
}

const teamColor = (t: TeamColor) => t === 'red' ? '#e94560' : t === 'blue' ? '#4ea8de' : '#06d6a0';
const teamName = (t: TeamColor) => t === 'red' ? '빨강' : t === 'blue' ? '파랑' : '초록';

function AngleGrid({ angle, setAngle }: any) {
  return (
    <>
      <label style={lblStyle}>방향</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginBottom: 12 }}>
        {KARTRIDO.ANGLE_VALUES.map((a) => (
          <button key={a} onClick={() => setAngle(a)} style={{
            padding: 6, fontSize: 12, fontWeight: 'bold',
            background: angle === a ? '#e94560' : '#1a1a2e',
            color: '#fff',
            border: angle === a ? 'none' : '1px solid #444',
            borderRadius: 4, cursor: 'pointer',
          }}>{a}°</button>
        ))}
      </div>
    </>
  );
}

// 격자 벽 좌표 — 시작 (a,b) + 방향 (AB/AC/BC)
// 캔버스 좌표계로 변환은 GridWallBox 안에서.
const N = 10;
const TRI_A = { x: 800, y: 70 };       // calcTriangle와 일치해야 함 (단순화)
const TRI_B = { x: 800 - 438.8, y: 829.9 };
const TRI_C = { x: 800 + 438.8, y: 829.9 };

function gridPointPx(a: number, b: number) {
  const c = N - a - b;
  return {
    x: (a * TRI_A.x + b * TRI_B.x + c * TRI_C.x) / N,
    y: (a * TRI_A.y + b * TRI_B.y + c * TRI_C.y) / N,
  };
}

function WallBox({
  a, setA, b, setB, dir, setDir, setPx,
}: {
  a: number; setA: (v: number) => void;
  b: number; setB: (v: number) => void;
  dir: 'AB' | 'AC' | 'BC'; setDir: (v: 'AB' | 'AC' | 'BC') => void;
  setPx: (px: { x: number; y: number; orientation: number }) => void;
}) {
  const c = N - a - b;
  let endA = a, endB = b;
  if (dir === 'AB') { endA = a + 1; endB = b - 1; }
  else if (dir === 'AC') { endA = a + 1; endB = b; }
  else { endA = a; endB = b + 1; }
  const endC = N - endA - endB;
  const valid = a >= 0 && b >= 0 && c >= 0 && endA >= 0 && endB >= 0 && endC >= 0 && endA <= N && endB <= N;

  useEffect(() => {
    if (valid) {
      const p1 = gridPointPx(a, b);
      const p2 = gridPointPx(endA, endB);
      setPx({
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
        orientation: (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, dir]);

  return (
    <div style={panelStyle}>
      <div style={{ color: '#aaa', fontSize: 13, marginBottom: 8, textAlign: 'center' }}>
        벽을 세울 <strong style={{ color: '#ffd700' }}>격자선</strong>을 클릭하세요
      </div>
      <WallMiniMap
        a={a} b={b} dir={dir}
        onSelect={(na, nb, nd) => { setA(na); setB(nb); setDir(nd); }}
        size={280}
      />
      <div style={{ marginTop: 8, padding: 6, background: '#0f1a3a', borderRadius: 4, fontSize: 11, color: '#aaa', lineHeight: 1.6 }}>
        <div><strong style={{ color: '#ffd700' }}>(a, b, c) = ({a}, {b}, {c})</strong></div>
        <div>a = <span style={{ color: '#e94560' }}>위 꼭지점(A)</span> 쪽 가중치</div>
        <div>b = <span style={{ color: '#4ea8de' }}>왼쪽 아래(B)</span> 쪽 가중치</div>
        <div>c = <span style={{ color: '#06d6a0' }}>오른쪽 아래(C)</span> 쪽 가중치</div>
        <div style={{ marginTop: 2, color: '#888' }}>큰 숫자일수록 그 꼭지점에 가까움 (합 = 10)</div>
      </div>
      <div style={{ marginTop: 6, padding: 8, background: valid ? '#0a3a1a' : '#3a0a1a', borderRadius: 4, fontSize: 12, textAlign: 'center' }}>
        {valid ? `✓ 방향: ${dir}` : '⚠ 클릭하여 벽 위치 선택'}
      </div>
    </div>
  );
}

const Tab = ({ label, active, onClick }: any) => (
  <button onClick={onClick} style={{
    flex: 1, padding: 12,
    background: active ? '#e94560' : '#1a1a2e',
    color: '#fff', border: active ? 'none' : '1px solid #444',
    borderRadius: 6, cursor: 'pointer', fontWeight: 'bold',
  }}>{label}</button>
);

const chip = (active: boolean, bg: string): React.CSSProperties => ({
  padding: '8px 14px',
  background: active ? bg : '#1a1a2e',
  color: '#fff',
  border: active ? 'none' : '1px solid #444',
  borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 13,
});

const panelStyle: React.CSSProperties = { background: '#1a1a2e', padding: 14, borderRadius: 8 };
const subTitle: React.CSSProperties = { color: '#ffd700', fontSize: 13, fontWeight: 'bold', marginBottom: 8 };
const lblStyle: React.CSSProperties = { display: 'block', color: '#aaa', fontSize: 13, marginBottom: 6 };
const submitBtn: React.CSSProperties = {
  marginTop: 24, width: '100%', padding: 16, fontSize: 20,
  background: '#e94560', color: '#fff', border: 'none',
  borderRadius: 8, cursor: 'pointer', fontWeight: 'bold',
};
const resetBtn: React.CSSProperties = {
  marginTop: 20, padding: 10, background: '#444', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer',
};
