# 심연행 (Abyssbound)

안개 낀 항구 마을 아래로 뻗은 미궁을 내려가는 **코스믹 호러 로그라이크 턴제 RPG**.
아이폰 Safari 세로 화면에서 플레이하도록 만들었습니다.

- 어둠 속 방을 탐험하며 등불과 시간을 관리 (다키스트 던전 · 던전 앤 스톤 참고)
- 스킬 슬롯 턴제 전투 — 적 의도 공개, 전열/후열, 약점 붕괴
- 쓰러뜨린 존재의 **정수**를 흡수해 능력을 얻는다 (흡수 한도 = 레벨)
- 정신력과 통찰: 금기의 힘은 정신을 갉아먹는다
- 균열, 계층군주, 층마다 다른 법칙
- 코드로 생성되는 음악과 효과음 (Tone.js), PixiJS 연출

## 실행

```bash
npm install
npm run dev
```

폰에서 테스트: `npm run dev:lan` 후 같은 와이파이에서 표시되는 주소로 접속.

## 크레딧
- 아이콘: [game-icons.net](https://game-icons.net) — Lorc, Delapouite 외 기여자 (CC BY 3.0)
- 『게임 속 바바리안으로 살아남기』의 「던전 앤 스톤」에서 탐험/정수 개념을 참고했습니다.
- 음악 (OpenGameArt, CC0): 「Haunting piano」 Emma_MA · 「Dramatic Boss Encounter」, 「Epic Endgame Cinematic」 cynicmusic · 「The Beach Where Dreams Die」 Chloe Wolfe. 나머지 음악과 효과음은 Tone.js로 실시간 생성.
