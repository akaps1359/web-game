# 콘텐츠 작성 가이드 (심연행)

게임 설계는 `docs/GDD.md`. 이 문서는 **콘텐츠 파일을 추가하는 규칙**이다. 반드시 1층 구현(`src/content/act1/*`)을 먼저 읽고 같은 스타일로 작성한다.

## 1. 구조

- 엔진: `src/engine/*` — **수정하지 말 것** (필요한 기능이 없으면 보고만 할 것).
- 등록: `reg.xxx([...])` (`src/engine/registry.ts`). 각 폴더의 `index.ts`가 그 폴더 파일들을 import 한다.
- 헬퍼: `src/content/lib.ts`(스킬: `skill`, `hit`, `guard`, `detonate`, `needAmmo`…), `src/content/moves.ts`(적 행동: `mv.attack/block/buff/debuff/horror/summon/charge/heal`, `release`, `others`, `countDef`), `src/engine/ai.ts`(`cycle`, `pick`, `opener`, `hpPct`, `last`).
- 타입: `src/engine/types.ts` (EnemyDef, MoveDef, SkillDef, EssenceDef, TraitDef …), 레지스트리 타입: `src/engine/registry.ts` (FloorDef, LordDef, EventDef, AnomalyDef …).
- 모든 텍스트는 한국어. 이름은 짧고 분위기 있게. 설명(desc)은 수치를 `{키}`로 (스킬은 `{D:dmg}` 피해 미리보기, `{B:blk}` 방어도 미리보기).

## 2. 층별 파일 (`src/content/actN/`)

| 파일 | 내용 |
|---|---|
| `enemies.ts` | `reg.traits`, `reg.enemies` (일반 10~12종 + 하수인, 정예 3, 층 수호자 3, 계층군주 1, 추적자 1, 균열 수호자 1) |
| `essences.ts` | 하수인을 제외한 **모든 적**의 정수(`reg.essences`) + 정수 액티브 스킬(`reg.skills`, school `'essence'`, `pool: false`, id `ess-<적>-<기술>`) |
| `encounters.ts` | `reg.encounters` — 초반용(`early: true`) 5~6개, 일반 12~15개, 정예 3, 보스 3, `lord-aN`, `stalker-aN`, `rift-aN`(균열 수호자, kind `'elite'`) |
| `floor.ts` | `reg.floors([{ act, name, law, hooks?, onMove?, setup?, roomAnomaly?, lord }])` |
| `events.ts` | `reg.events` 8~10개 (`acts: [N]`, 다른 층과 공유 가능) |
| `anomalies.ts`(선택) | 이 층 전용 전장 규칙 |

id는 게임 전체에서 유일해야 한다 (적·스킬·특성·이벤트). 겹치지 않게 층 고유의 이름을 쓴다.

## 3. 밸런스 기준

플레이어 기준치 (층 시작 시 대략): 1층 Lv1 HP 75 AP3 스킬 4 / 2층 Lv5~6 HP 90 스킬 5~6, 정수 3 / 3층 Lv9 HP 105 스킬 6~7, 정수 5~6 / 4층 Lv12 HP 120 스킬 7, 정수 8. 한 턴 피해 출력 대략 1층 15~20 → 2층 25~32 → 3층 35~45 → 4층 45~60.

| 층 | 일반 적 HP (한 전투 총합) | 일반 적 1턴 피해 합 | 정예 HP | 수호자 HP | 버팀 (일반/정예/보스) | 정신 공격 |
|---|---|---|---|---|---|---|
| 1 | 12~36 (40~65) | 6~12 | 60~78 | 130~160 | 2~4 / 5~7 / 8~10 | 3~6 |
| 2 | 30~55 (70~110) | 10~16 | 120~150 | 240~280 | 3~5 / 6~8 / 10~12 | 5~9 |
| 3 | 45~75 (110~160) | 14~22 | 170~210 | 320~380 | 4~6 / 7~9 / 11~13 | 7~12 |
| 4 | 60~95 (150~210) | 18~28 | 220~270 | 420~480 | 5~7 / 8~10 / 12~15 | 9~15 |
| 최종 | — | — | — | 3페이즈 총 ~1000 | 15 | 12~20 |

- 큰 공격(1층 18+, 2층 25+, 3층 32+, 4층 40+)은 반드시 `mv.charge` 로 1턴 예고 → `release(...)` 후속타. 붕괴시키면 취소된다(엔진이 `e.mem.charge` 삭제).
- 약점은 적마다 2~3개(보스 2개). 6속성 고르게 분포. 일부 적은 `resist`(0.5 등).
- 정수 등급: 2층 일반 8~7/정예 6/수호자 4 · 3층 6~5/4/3 · 4층 4~3/2/2 · 계층정수 1~3.
- 정수 스탯 합(일반 정수 기준): 2층 maxHp 5~8 + 보조 1~2, 3층 8~12, 4층 10~15. 패시브는 그 몬스터다운 효과.
- 정수 액티브 2색(2개)씩. 수호자는 2~3색 가능(`colors` 길이 = `actives` 길이). 액티브는 그 몬스터의 행동을 플레이어용으로 약하게 옮긴 것.
- 이계 존재(`eldritch: true`, 3~4층 대부분)는 정수에도 `eldritch: true`.

## 4. 층 테마와 고유 메커니즘

- **2층 가라앉은 수도원**: 교단(사제·성가대·순교자), 구울, 심해 혼혈, 빙의된 수도사. 법칙 = 종소리(12시간마다 교단 적 힘 +1, `tags: ['cult']` 사용), 일부 방 침수(`setup`에서 `room.flooded = true`, 이동 2시간). 메커니즘: 의식(턴이 지날수록 강해짐), 소환, 자기희생(동료 사망 시 강화), 재생, 정신 공격 비중 증가. 계층군주: 종지기.
- **3층 꿈의 경계**: 밤의 마귀, 유고스 균류, 각도의 사냥개, 쇼고스 유충, 꿈 거미, 잿빛 순례자. 법칙 = 뒤틀린 회랑(`onMove`에서 일정 시간마다 `shiftCorridors(run, f, n)` — `src/engine/dungeon.ts`), 회복 반전 구역(`setup`에서 일부 `room.inverted = true` → 그 방 전투에 `rule-inverted` 자동 적용). 메커니즘: 숨겨진 의도(`hidden: true`, 통찰 5 이상만 보임), 환영(죽어도 보상 없는 가짜 적, 특성으로 구현), 통찰 강탈, 위치 바꾸기(`c.moveRow`). 계층군주: 꿈을 먹는 자.
- **4층 별들의 궁정**: 별의 자손, 무형의 피리꾼, 검은 새끼, 시간의 파수꾼 등 외신의 하수인. 법칙 = 별의 정렬(`setup`에서 `f.vars.tideMul = 2` → 조수 2배), 유성 낙하(`setup`에서 몇몇 방에 `room.meteor = 시각`, `onMove`에서 그 시각에 그 방에 있으면 큰 피해 — `hurtRun` 사용, 로그 남기기). 메커니즘: 파멸(카운트다운), 큰 정신 피해, 전열/후열 뒤집기, 강력한 차지. 계층군주: 검은 별.
- **최종층 (act 5)**: `src/content/act5/` — 잠든 자(3페이즈 보스, 같은 적이 `e.form`과 체력 재설정으로 페이즈 전환 — 1층 `fisherman`의 `deep-blood` 특성 참고), 최종층 정예 1조우, 이벤트는 이미 `sleeper-dream`이 있음. `reg.encounters`에 `act: 5, kind: 'boss'` 1개, `kind: 'elite'` 1개 이상. `reg.floors`에 act 5 (law 설명만, lord 없음).

## 5. 계층군주 (LordDef)

`progress(run, f, signal)`가 진척도를 반환. signal: `{t:'move'} | {t:'combat', enc, kind} | {t:'tide', tide} | {t:'event', id}`. `warnings`는 단계별 로그 (마지막이 등장 메시지). 숨겨진 조건은 그 층 테마와 연결 (예: 2층 — 종이 3번 울린 뒤 교단 조우 2회 승리).

## 6. 이벤트

`stages.start(run, ev) => { text, choices }`. 선택지 `go(run, ev)`에서 `finish(ev, '결과 문장', { fight?, loot? })` 또는 `ev.stage = '다음'`. 헬퍼: `healRun, hurtRun, gainSanityRun, loseSanityRun(→ 붕괴 처리), learnSkill, rollRelic, rollEquip, rollRune, rollConsumable, rollForbidden, upgradeSkill, rng(run,'event')`. 1층 `events.ts`의 `sanity()`, `relicLoot()` 패턴 참고. 선택에는 대가와 이득이 함께 있어야 한다.

## 7. 아이콘

`'gi:이름'` 형식 (game-icons.net). **존재하는 이름만** 사용. 확인:

```bash
node -e "const n=new Set(Object.keys(require('./node_modules/@iconify-json/game-icons/icons.json').icons)); for (const a of process.argv.slice(1)) console.log(a, n.has(a))" tentacle-strike some-name
```

키워드 검색: `node -e "const n=Object.keys(require('./node_modules/@iconify-json/game-icons/icons.json').icons); console.log(n.filter(x=>x.includes('eye')).join(' '))"`

## 8. 검증

- `npx tsc --noEmit -p .` — 오류 0.
- `npx vitest run` — 콘텐츠 무결성(조우의 적 존재, 정수 액티브 존재, 설명의 `{키}`가 vals에 있음) + **봇이 모든 조우를 이길 수 있는지** 확인. 실패하면 고칠 것 (무한 부활·무적 상태 등).
- 엔진 수정 금지. 다른 에이전트가 동시에 다른 폴더를 작업하므로 **자기 폴더 밖의 파일은 건드리지 말 것** (`src/content/index.ts`는 이미 각 폴더 `index.ts`를 import 한다).
