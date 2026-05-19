import { useEffect, useRef } from 'react';

interface Props {
  a: number; b: number;
  dir: 'AB' | 'AC' | 'BC';
  onSelect: (a: number, b: number, dir: 'AB' | 'AC' | 'BC') => void;
  size?: number;
}

const N = 10;

export default function WallMiniMap({ a, b, dir, onSelect, size = 240 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const SZ = size;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, SZ, SZ);
    const m = SZ * 0.09;
    const W_ = SZ - 2 * m;
    const H_ = (W_ * Math.sqrt(3)) / 2;
    const A = { x: SZ / 2, y: m };
    const B = { x: SZ / 2 - W_ / 2, y: m + H_ };
    const C = { x: SZ / 2 + W_ / 2, y: m + H_ };
    const gp = (ga: number, gb: number) => {
      const gc = N - ga - gb;
      return {
        x: (ga * A.x + gb * B.x + gc * C.x) / N,
        y: (ga * A.y + gb * B.y + gc * C.y) / N,
      };
    };

    // 잔디
    ctx.fillStyle = '#2a4a1e';
    ctx.beginPath();
    ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y);
    ctx.closePath(); ctx.fill();

    // 격자선
    ctx.strokeStyle = '#557';
    ctx.lineWidth = 1;
    const lerp = (P: any, Q: any, t: number) => ({ x: P.x + (Q.x - P.x) * t, y: P.y + (Q.y - P.y) * t });
    for (let i = 1; i < N; i++) {
      const t = i / N;
      ctx.beginPath(); ctx.moveTo(lerp(A, B, t).x, lerp(A, B, t).y); ctx.lineTo(lerp(A, C, t).x, lerp(A, C, t).y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lerp(A, C, t).x, lerp(A, C, t).y); ctx.lineTo(lerp(B, C, t).x, lerp(B, C, t).y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lerp(A, B, t).x, lerp(A, B, t).y); ctx.lineTo(lerp(C, B, t).x, lerp(C, B, t).y); ctx.stroke();
    }

    // 격자점
    for (let aa = 0; aa <= N; aa++) {
      for (let bb = 0; bb <= N - aa; bb++) {
        const p = gp(aa, bb);
        ctx.fillStyle = '#aaa';
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 꼭지점 라벨 (A, B, C)
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('A', A.x, A.y - 6);
    ctx.fillText('B', B.x - 8, B.y + 14);
    ctx.fillText('C', C.x + 8, C.y + 14);

    // 선택된 벽
    const c = N - a - b;
    let endA = a, endB = b;
    if (dir === 'AB') { endA = a + 1; endB = b - 1; }
    else if (dir === 'AC') { endA = a + 1; }
    else { endB = b + 1; }
    const endC = N - endA - endB;
    const valid = a >= 0 && b >= 0 && c >= 0 && endA >= 0 && endB >= 0 && endC >= 0 && endA <= N && endB <= N;
    if (valid) {
      const p1 = gp(a, b);
      const p2 = gp(endA, endB);
      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      ctx.fillStyle = '#ffd700';
      ctx.beginPath(); ctx.arc(p1.x, p1.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e94560';
      ctx.beginPath(); ctx.arc(p2.x, p2.y, 5, 0, Math.PI * 2); ctx.fill();
    }
  }, [a, b, dir, SZ]);

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (SZ / rect.width);
    const my = (e.clientY - rect.top) * (SZ / rect.height);
    const m = SZ * 0.09;
    const W_ = SZ - 2 * m;
    const H_ = (W_ * Math.sqrt(3)) / 2;
    const A = { x: SZ / 2, y: m };
    const B = { x: SZ / 2 - W_ / 2, y: m + H_ };
    const C = { x: SZ / 2 + W_ / 2, y: m + H_ };
    const gp = (ga: number, gb: number) => {
      const gc = N - ga - gb;
      return {
        x: (ga * A.x + gb * B.x + gc * C.x) / N,
        y: (ga * A.y + gb * B.y + gc * C.y) / N,
      };
    };
    let best: { a: number; b: number; dir: 'AB' | 'AC' | 'BC' } | null = null;
    let bestD = Infinity;
    const dirs: Array<['AB' | 'AC' | 'BC', [number, number]]> = [
      ['AB', [+1, -1]], ['AC', [+1, 0]], ['BC', [0, +1]],
    ];
    for (let ga = 0; ga <= N; ga++) {
      for (let gb = 0; gb <= N - ga; gb++) {
        for (const [d, [da, db]] of dirs) {
          const ea = ga + da, eb = gb + db;
          const ec = N - ea - eb;
          if (ea < 0 || eb < 0 || ec < 0 || ea > N || eb > N) continue;
          const gc = N - ga - gb;
          // 모서리(변) 위 edge 제외 — 두 끝점 모두 같은 변 위
          if ((ga === 0 && ea === 0) || (gb === 0 && eb === 0) || (gc === 0 && ec === 0)) continue;
          const p1 = gp(ga, gb);
          const p2 = gp(ea, eb);
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          const dist = Math.hypot(mx - mid.x, my - mid.y);
          if (dist < bestD) { bestD = dist; best = { a: ga, b: gb, dir: d }; }
        }
      }
    }
    if (best) onSelect(best.a, best.b, best.dir);
  }

  return (
    <canvas
      ref={canvasRef}
      width={SZ}
      height={SZ}
      onClick={onClick}
      style={{ display: 'block', margin: '0 auto', cursor: 'pointer', borderRadius: 4 }}
    />
  );
}
