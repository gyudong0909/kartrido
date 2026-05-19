import { useState, useEffect } from 'react';
import { socket } from '../../socket';
import {
  WHEEL_NAMES_KO, MISSION_LABELS, type KartridoResults, type PlayerSlot,
} from '@wheel-race/shared';

// 미션 7 보유자에게만 보이는 추리 UI
// 같은 차 다른 3명에 대해 각각 미션(1~8) 선택해서 제출

export default function Mission7Input({ slot, mission }: { slot: PlayerSlot; mission: number }) {
  const [results, setResults] = useState<KartridoResults | null>(null);
  const [guesses, setGuesses] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const onResults = (r: KartridoResults) => setResults(r);
    socket.on('kartrido:results', onResults);
    return () => { socket.off('kartrido:results', onResults); };
  }, []);

  if (mission !== 7) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>
        결과 화면을 TV에서 확인하세요.
      </div>
    );
  }

  if (!results) return <div style={{ color: '#aaa' }}>결과 대기 중...</div>;

  // 같은 차 다른 3명
  const teammates = results.assignments.filter(
    (a) => a.team === slot.team && a.slotToken !== slot.slotToken
  );

  function submit() {
    const arr = teammates.map((t) => ({
      target: t.slotToken,
      missionId: guesses[t.slotToken] ?? 1,
    }));
    socket.emit('player:submit-mission7', { slotToken: slot.slotToken, guesses: arr });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div style={{ textAlign: 'center', color: '#06d6a0', fontSize: 20, marginTop: 40 }}>
        ✓ 추리 제출 완료. TV 화면 보세요.
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ color: '#ffd700' }}>미션 7 — 같은 차 다른 3명의 미션 추리</h2>
      <p style={{ color: '#aaa', fontSize: 13 }}>
        선택지 1~8. 정확히 맞히면 +10만, 틀리면 잃음.
      </p>

      {teammates.map((t) => (
        <div key={t.slotToken} style={{ background: '#1a1a2e', padding: 12, marginTop: 12, borderRadius: 8 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
            {WHEEL_NAMES_KO[t.wheel]} 바퀴 — {t.name ?? '익명'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((m) => (
              <button
                key={m}
                onClick={() => setGuesses({ ...guesses, [t.slotToken]: m })}
                title={MISSION_LABELS[m as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8]}
                style={{
                  padding: 8, fontSize: 12,
                  background: guesses[t.slotToken] === m ? '#e94560' : '#0f1a3a',
                  color: '#fff', border: '1px solid #444',
                  borderRadius: 4, cursor: 'pointer',
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      ))}

      <button onClick={submit} style={{
        marginTop: 24, width: '100%', padding: 16, fontSize: 20,
        background: '#e94560', color: '#fff', border: 'none',
        borderRadius: 8, cursor: 'pointer', fontWeight: 'bold',
      }}>
        추리 제출
      </button>
    </div>
  );
}
