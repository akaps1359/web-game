# 심연행 (Abyssbound) — 작업 규칙

코스믹 호러 로그라이크 턴제 RPG. 세로 화면 모바일(iPhone Safari) 우선. 설계: `docs/GDD.md`, 콘텐츠 작성 규칙: `docs/CONTENT_GUIDE.md`.

## 명령
- `npm run dev` (로컬), `npm run dev:lan` (같은 와이파이의 폰에서 접속)
- `npm test` — 엔진/콘텐츠 무결성 + 봇이 모든 조우를 이기는지
- `npm run sim` — 봇 자동 플레이 밸런스 시뮬레이션 (`SIM_RUNS=40 SIM_ORIGINS=soldier`), 결과 `sim/out/balance.txt`
- `npm run build` — 타입 검사 + 빌드 (GitHub Pages 배포용, base `/web-game/`)
- 배포: main에 push → `.github/workflows/deploy.yml`

## 구조
- `src/engine/` 순수 게임 로직 (DOM 금지, 난수는 `Rng`만 — `Math.random` 금지). 상태는 전부 JSON 직렬화 가능해야 함 (저장/시뮬레이터).
  - `combat.ts` 전투 (훅 기반: 상태이상·유물·장비·정수·광기·적 특성·층의 법칙이 `Hooks`로 개입), `run.ts` 판 진행/보상/정수, `dungeon.ts` 층 생성·탐험, `events.ts`, `shop.ts`, `places.ts`, `registry.ts` 콘텐츠 등록소
- `src/content/` 데이터 + 훅 (층별 폴더 `act1`~`act5`, 공용 `skills/`, `extra/` 등)
- `src/render/` PixiJS (배경 `backdrop.ts`, 전투 `battle.ts`, `stage.ts`)
- `src/ui/` Preact 화면, `src/state/` 스토어·저장·메타, `src/director.ts` 전투 이벤트 연출, `src/audio/` Tone.js 생성 음악/효과음
- `src/sim/` 봇 (`bot.ts` 전투, `runbot.ts` 한 판 전체)

## 규칙
- UI 텍스트는 한국어. 아이콘은 game-icons.net 이름(`'gi:이름'`)만 — 빌드 시 사용한 것만 번들됨.
- 새 콘텐츠의 `desc`에 쓴 `{키}`는 반드시 `vals`에 존재 (테스트가 검사).
- 엔진 변경 후 `npm test`와 시뮬레이션으로 회귀 확인.
- Preact는 10.x 유지 (11은 숫자 스타일 값에 px를 붙이지 않음).
