import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div style={{ maxWidth: 600, margin: '60px auto', padding: 20 }}>
      <h1 style={{ color: '#e94560', fontSize: 40 }}>카트라이도</h1>
      <p style={{ color: '#aaa' }}>동아리 게임 — 메인매치(카트라이도) + 다음 매치(협동 쿼리도)</p>
      <hr style={{ borderColor: '#333', margin: '20px 0' }} />
      <h2>진행자</h2>
      <p>
        <Link to="/host" style={{ color: '#4ea8de' }}>진행자 콘솔로 이동 →</Link>
      </p>
      <p style={{ color: '#888', fontSize: 14 }}>
        참가자는 진행자가 나눠주는 개인 URL/QR로 접속해주세요.
      </p>
    </div>
  );
}
