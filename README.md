# Wheel Race App — 카트라이도 & 협동 쿼리도

동아리 게임 시리즈 멀티플레이어 웹 앱.

## 구조 (모노레포)

```
wheel_race_app/
├─ shared/         공통 타입 + 게임 상수 (룰 의미값)
├─ backend/        Node.js + Express + Socket.io + 시뮬레이션
└─ frontend/       React + Vite + Canvas 2D
```

## 화면 종류

- `/` — 홈
- `/host` — 진행자 콘솔 (방 생성, 12 QR 발급, 게임 시작/리셋)
- `/tv/:roomCode` — TV 공용 화면 (게임판만)
- `/play/:slotToken` — 개인 디바이스 (자기 바퀴 입력만)

## 첫 실행 (WSL Ubuntu)

```bash
# Node 18+ 확인
node --version
# 없으면: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs

cd ~/wheel_race_app

# 1. 의존성 설치 (5~10분)
npm install

# 2. shared 패키지 빌드 (타입 사용 위해)
npm --workspace shared run build

# 3. 백엔드 dev (터미널 A)
npm run dev:backend       # http://localhost:3000

# 4. 프론트엔드 dev (터미널 B)
npm run dev:frontend      # http://localhost:5173
```

## 사용 흐름

1. 브라우저에서 http://localhost:5173/host 접속
2. **방 만들기** 클릭 → 방 코드 + 12개 QR 표시
3. 진행자가 12 QR을 12명에게 분배 (인쇄/카톡/AirDrop)
4. 12명이 자기 폰으로 QR 스캔 → `/play/{slot}` 자동 접속
5. 진행자 콘솔에서 **TV 화면 열기** 클릭 → `/tv/{code}`를 큰 화면에 띄움
6. 모두 접속 확인 후 진행자가 **게임 시작** 클릭
7. 각자 폰에서 (A 이동 / B 벽 / C 예측) 입력 → 제출
8. 12명 모두 제출하면 자동 시뮬레이션 → 다음 라운드
9. 10라운드 또는 어느 차 도착 시 → 종료 화면

## 배포 (인터넷 호스팅)

Render 무료 티어 — 백엔드(Express)가 프론트 정적 파일까지 같이 서빙.

```bash
npm run build           # shared → backend → frontend 빌드
npm start               # 프로덕션 서버 (port 3000)
```

GitHub 저장소 + Render 연결 시 자동 배포.
환경변수 `PORT` (Render 자동 설정), 그 외 없음.

## 현재 구현 상태

✅ 구현 완료
- 모노레포 셋업, Socket.io 통신
- 방 생성 / 12 슬롯 / 자동 배정 / QR
- 미션 랜덤 배정 (차당 7+8+(1or2)+(3or4))
- 카트라이도 시뮬레이션 (옴니휠, 차 충돌, 벽 충돌, 도착)
- 카트라이도 시각화 (TV 화면 Canvas)
- 카트라이도 입력 (A 이동 18방향, B 벽 좌표, C 예측 폴백)
- 협동 쿼리도 보드 렌더링 (데모)
- 라운드 자동 진행 (12명 제출 시 시뮬레이션)
- 게임 종료 phase 전환

🚧 부분 구현 / 추후 개선
- C 예측 시도 UI 상세 (대상 선택, 예측값 입력)
- 협동 쿼리도 게임 로직 → 실제 게임 진행 (현재 데모 보드만)
- 게임 종료 후 미션 7 추리 화면
- 미션 결과 / 루블 정산 화면
- 협동 쿼리도 방 선택 시스템
- 미션 1~4 실 평가 시각화

## 룰 참고
- `../동아리/카트라이도_룰.md`
- `../동아리/카트라이도_히든룰.md`
- `../동아리/협동쿼리도_룰.md`
- `../동아리/카트라이도_구현노트.md`
