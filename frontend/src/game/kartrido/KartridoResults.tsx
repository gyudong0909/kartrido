import { useEffect, useState } from 'react';
import { socket } from '../../socket';
import type { KartridoResults as Results } from '@wheel-race/shared';

const TEAM_LABEL: Record<string, string> = {
  red: '빨강팀', blue: '파랑팀', green: '초록팀',
};
const TEAM_COLOR: Record<string, string> = {
  red: '#e94560', blue: '#4ea8de', green: '#06d6a0',
};
const MEDALS = ['🥇', '🥈', '🥉'];

// 게임판 위쪽 영역에 배치되는 컴팩트 결과 띠
export default function KartridoResults() {
  const [results, setResults] = useState<Results | null>(null);
  useEffect(() => {
    const onResults = (r: Results) => setResults(r);
    socket.on('kartrido:results', onResults);
    return () => { socket.off('kartrido:results', onResults); };
  }, []);

  if (!results) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 24, padding: '10px 20px',
      background: 'linear-gradient(90deg, #2a1a4a 0%, #3a1a2a 100%)',
      borderBottom: '3px solid #ffd700',
    }}>
      <div style={{ color: '#ffd700', fontSize: 32, fontWeight: 'bold' }}>
        🏁 게임 종료!
      </div>
      {results.ranking.map((team, i) => (
        <div key={team} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 14px', borderRadius: 8,
          background: TEAM_COLOR[team], color: '#fff', fontWeight: 'bold',
          border: i === 0 ? '3px solid #ffd700' : '2px solid #222',
        }}>
          <span style={{ fontSize: 28 }}>{MEDALS[i]}</span>
          <span style={{ fontSize: 18 }}>{i + 1}위</span>
          <span style={{ fontSize: 22 }}>{TEAM_LABEL[team]}</span>
        </div>
      ))}
    </div>
  );
}
