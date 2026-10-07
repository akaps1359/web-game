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

플레이어 기준치 (층 시작 시, 봇 시뮬 평균 — 2026-10): 1층 Lv1 HP 76 AP3 스킬 4 / 2층 Lv4 HP 105, 정수 2~3 / 3층 Lv6~7 HP 145, 정수 5, 힘 3~4 / 4층 Lv9 HP 190, 정수 6~7, 힘 6 / 5층 Lv11 HP 230, 정수 7~8, 힘 9~10 (정수 자리 = 4 + 쓰러뜨린 층 수호자 수). 정예전 한 턴 피해 출력 대략 1층 20~33 → 2층 35~55 → 3층 80~110 → 4층 160~180 → 5층 230~280.

**구조 원칙 (2026-10 개편 — `docs/GDD.md` 4.4·6장)**
- 적 체력은 플레이어의 기대 딜을, 적 공격은 기대 최대 체력을 따라가게 한다. 일반전은 2~3턴에 끝나도 된다 — 긴장은 정예·수호자에 몰아준다.
- 정예·수호자 전투의 적 공격에는 `ELITE_DMG_MULT`(3/4/5층 ×1.25/1.35/1.35)·`BOSS_DMG_MULT`(2~5층 ×1.15/1.3/1.35/1.2)가 더 곱해진다. 정예·수호자의 피해 숫자를 정할 때 이 배율을 감안한다. 3층부터 정예가 같은 층 일반 무리보다 약하게 때리는 일이 없게 (예전엔 정예 한 턴 7~11 vs 일반 무리 8~15).
- 층 수호자 앞에서는 숨을 고르고 풀피로 싸운다. 수호자는 "온전한 몸으로 치르는 시험": 봇 기준 수호자전 체력 손실 35~45%, 3~5층 정예 10~15%.
- 정수는 쌓는 것이 아니라 고르는 것 (정수 자리제). 새 정수의 패시브는 자리 하나를 차지할 값이 있어야 한다 — 다른 정수를 깨뜨리고라도 들일 만한 것으로.
- 고정 가산('공격 피해 +N')은 스킬 한 번에 대상마다 첫 타격에만 붙는다. 다단 히트 스킬의 타격당 피해는 힘을 곱해 주지 않는다는 전제로 정한다. '타격마다'가 정체성인 효과만 `d.addEach`에 더한다 (예: 시궁쥐 떼 정수 「무리 근성」).

| 층 | 일반 적 HP (한 전투 총합) | 일반 적 1턴 피해 합 | 정예 HP | 수호자 HP | 버팀 (일반/정예/보스) | 정신 공격 |
|---|---|---|---|---|---|---|
| 1 | 12~36 (40~65) | 6~12 | 60~78 | 130~160 | 2~4 / 5~7 / 8~10 | 3~6 |
| 2 | 30~55 (70~110) | 10~16 | 120~150 | 240~280 | 3~5 / 6~8 / 10~12 | 5~9 |
| 3 | 45~75 (110~160) | 14~22 | 170~210 | 320~380 | 4~6 / 7~9 / 11~13 | 7~12 |
| 4 | 60~95 (150~210) | 18~28 | 220~270 | 420~480 | 5~7 / 8~10 / 12~15 | 9~15 |
| 5 | 80~200 (250~500) | 20~32 | 250~445 | 최종 3단계 340/300/440 | 4~7 / 8~12 / 15·10·12 | 9~20 |

- 큰 공격(1층 18+, 2층 25+, 3층 32+, 4층 40+)은 반드시 `mv.charge` 로 1턴 예고 → `release(...)` 후속타. 붕괴시키면 취소된다(엔진이 `e.mem.charge` 삭제).
- 약점은 적마다 2~3개(보스 2개). 6속성 고르게 분포. 일부 적은 `resist`(0.5 등).
- 정수 등급: 2층 일반 8~7/정예 6/수호자 4 · 3층 6~5/4/3 · 4층 4~3/2/2 · 5층 3/2/1(최종 수호자) · 계층정수 1~3.
- 정수 스탯 합(일반 정수 기준): 2층 maxHp 5~8 + 보조 1~2, 3층 8~12, 4층 10~15. 패시브는 그 몬스터다운 효과. 수호자 정수는 스탯 1.5배·본질 체력 1.5배·패시브 2배(`s.n = 2`)에 기술 하나인데 자리는 똑같이 하나만 차지하므로, 수호자 정수의 패시브는 더 신중히.
- 정수 액티브 2색(2개)씩. 수호자는 2~3색 가능(`colors` 길이 = `actives` 길이). 액티브는 그 몬스터의 행동을 플레이어용으로 약하게 옮긴 것.
- 이계 존재(`eldritch: true`, 3~4층 대부분)는 정수에도 `eldritch: true`.
- **계열을 잇는 설계 (상처의 문법)**: 새 계열 스킬은 `makes`/`reads`(만드는·읽는 키워드)를 달고, 계열 스킬의 약 1/3은 남의 키워드를 읽는다. 키워드 표(1차·2차 생산 계열, 읽는 계열)는 `src/content/keywords.ts`.
  - 표는 안쪽 설계용이다. 플레이어에게는 새 용어 없이 "대상이 출혈 중이면 피해 2배" 같은 조건 한 줄로만 보인다.
  - 이런 스킬의 설명은 조건 하나, 효과 하나. 여러 키워드를 한꺼번에 요구하거나 단계가 많은 효과는 피한다.
  - 읽을 게 없어도 쓸 만한 기본 효과를 둔다. 남의 키워드는 읽기만 하고 없애지 않는다 — 1차 키워드를 크게 터뜨리는 깊이 보상(혈류 폭발·촉매·인장 폭발 등)은 1차 계열에 남긴다. 조준·탄약처럼 나눠 쓰는 자원도 읽기만 한다. 행동력·재사용 대기를 돌려주지 않는다.
  - `tests/keywords.test.ts`가 표와 스킬 태그가 맞는지, 계열마다 글루가 충분한지 본다. 새 글루 스킬은 `src/content/skills/bridge.ts`.
  - 예전 합기 15종은 조건 없이 각자 계열 풀로 내려갔다 (`skills/duo.ts`). 두 계열 짝 `duo`는 계열 판정용으로 남았다.
- **창세 등급**(`rarity: 'genesis'`, `src/content/genesis.ts`): 장비 칸·계열마다 하나뿐. 판당 하나, 계층군주 처치 보상(셋 중 하나)과 5층 정예·수호자 5%에서만. 상점·보통 보상에 넣지 말 것.

## 4. 층 테마와 고유 메커니즘

- **2층 잿빛 수도원**: 교단(사제·성가대·순교자·밀랍 수사), 구울, 재·밀랍·뼈의 것들(`tags: ['ash']`), 빙의된 수도사. 법칙 = 종소리(12시간마다 교단 적 힘 +1, `tags: ['cult']` 사용), 잿더미(`setup`에서 일부 방 `room.flooded = true` — 엔진의 '이동 2시간' 깃발을 재사용, 그 방 전투에 `a2-ashen`: 화염 +30%, `ash` 적 공격 +15%). 메커니즘: 의식(턴이 지날수록 강해짐), 소환, 자기희생(동료 사망 시 강화), 재생, 정신 공격 비중 증가. 계층군주: 종지기.
- **3층 얼어붙은 고대 도시** (`docs/FLOORS.md`): 고대인(`tags: ['elder']`)과 쇼고스(`'shoggoth'`), 얼음 위의 것들(`'ice'`: 눈먼 펭귄·그노프케·서리 망령·동사한 탐사대원), 탐사대(`'expedition'`), 미고·각도의 사냥개·렝의 거미·밤의 마귀. 법칙(`act3/floor.ts`) = 혹한(`setup`에서 `f.vars.coldLight = 50` → `onMove`가 등불을 50% 더 깎고 이동 확인 화면이 그 값을 읽어 보여 줌, 등불 25 미만 전투는 동상 3), 눈보라(10시간마다 들르지 않은 방의 `scouted` 해제), 얼음 속의 것들(`room.frozen = 녹는 시각` — `roomAnomaly`가 녹기 전 `a3-frozen-room`(첫 차례 행동 불가), 녹은 뒤 `a3-thawed-room`(공격 피해 +25%)). 공용 상태·헬퍼는 `act3/common.ts`: 동상 `a3-frostbite`(`frost`/`melt`, 5가 되면 플레이어 행동력 -1·적 기절), 얼음 속에 갇힘 `a3-encased`, 표본 채집 `seizeSkill`/`returnSkill`(기술 빼앗기), 방어도가 먼저 막는 정신 공격 `veiledHorror`. 계층군주 깨어난 원로(`lord-a3`, 쇼고스 노예가 주인 체력 절반 이하에서 반란), 균열 수호자 시간에 얼어붙은 탐사대장(`rift-a3`, 한 턴 피해 상한), 추적자 프나스의 돌. 옛 '꿈의 경계' 콘텐츠는 5층으로 옮겨 갔다.
- **4층 별들의 궁정**: 별의 자손, 무형의 피리꾼, 검은 새끼, 시간의 파수꾼 등 외신의 하수인. 법칙 = 별의 정렬(`setup`에서 `f.vars.tideMul = 2` → 조수 2배), 유성 낙하(`setup`에서 몇몇 방에 `room.meteor = 시각`, `onMove`에서 그 시각에 그 방에 있으면 큰 피해 — `hurtRun` 사용, 로그 남기기). 메커니즘: 파멸(카운트다운), 큰 정신 피해, 전열/후열 뒤집기, 강력한 차지. 계층군주: 검은 별.
- **5층 꿈꾸는 우주** (2026-10 개편: 정식 탐험 층 — `docs/FLOORS.md`): `src/content/act5/`. 성운·별빛과 떠도는 꿈의 땅 조각들. 3층에서 옮겨 온 꿈의 땅 콘텐츠는 id 접두사를 `a5-`로 바꿨다 (꿈 헬퍼·상태 `act5/dream.ts`: 환영 `a5-illusion`, 잠듦 `a5-asleep`, 순례 `a5-pilgrimage` …). 적: 꿈의 땅 존재(주그·구그·달짐승·몽유병자·장막 직조자) + 우주의 존재(별빛 순례자 `star-pilgrim`, 성운 해파리 `nebula-jelly` — 3턴마다 갓 태어난 별 `newborn-star`을 낳는다, 별을 삼킨 것 `star-swallower` — 방어도를 빨아들이고 붕괴하면 동료를 태운다). 정예: 토성의 고양이·꿈의 문지기(정예)·요람의 수문장 `cradle-warden`·꿈의 대사제. 법칙(`act5/floor.ts`) = 떠도는 섬(8시간마다 `shiftCorridors`), 뒤집힌 꿈(`room.inverted` 2~4곳 → 엔진의 `rule-inverted`), 자장가(이동마다 정신력 -2, 붕괴시키면 +2). 계층군주 꿈을 먹는 자(`lord-a5`, 이 층에서 잠들기·회복 반전 구역 승리·정신력 절반 이하로 조수), 추적자 꿈 사냥꾼(`stalker-a5`), 균열 수호자 문턱의 존재(`rift-a5`). 최종 수호자 **별의 태아**(`act5/fetus.ts`, 조우 `a5-boss-fetus`): 3단계는 같은 적의 `e.form` 전환(`a5-unborn`), 1~2단계의 꿈은 `c.s.anomaly`를 꿈 anomaly(`a5-dream-*`)로 바꿔 구현 — 전투 화면 위쪽 칩에 이름이 뜬다. 승리 문장은 `reg.floors`의 `victory`. 5층 기본 수치는 4층보다 높다(일반 80~200, 정예 250~445 — 5층 배율 `ACT_HP_MULT[5]` 2.0이 4층 2.2보다 낮기 때문). 5층에서는 바다·물 표현을 쓰지 않는다.
- **없는 것은 꺼진다**: 층에 추적자(`stalker-aN`)·균열 수호자(`rift-aN`)·계층군주(`lord`)가 없으면 엔진이 그 시스템을 조용히 끈다 (추적자 안 나옴, 균열 안 열림, 군주 진척 없음). 군주 조우 id는 반드시 `lord`로 시작해야 한다 (아니면 군주를 잡는 순간 층 수호자를 잡은 것으로 처리된다 — 테스트가 검사). 조우 id는 게임 전체에서 겹치면 안 된다 (테스트가 검사).

## 5. 계층군주 (LordDef)

`progress(run, f, signal)`가 진척도를 반환. signal: `{t:'move'} | {t:'combat', enc, kind} | {t:'tide', tide} | {t:'event', id}`. `warnings`는 단계별 로그 (마지막이 등장 메시지). 숨겨진 조건은 그 층 테마와 연결 (예: 2층 — 종이 3번 울린 뒤 교단 조우 2회 승리).

## 5-1. 연출과 속임수 (정예·수호자 패턴)

화면 연출은 규칙과 무관하다 (봇·시뮬레이션에선 아무 일도 없다). 그리는 쪽은 `src/ui/cinema.ts`.

- `cine(c, name, { uid?, text?, n? })` (`src/content/lib.ts`) — 이름은 `CineName` (`src/engine/types.ts`): `crack`(유리 금) `shatter`(전장이 산산조각) `glitch` `whisper`(화면 너머의 플레이어에게 말 걸기) `sysmsg`(가짜 시스템 창) `fakeover`(가짜 게임 오버 — 최종 보스 전용) `eye` `ink` `scrawl`(붉은 손글씨) `handprints` `flip` `timestop` `blackhole` `corners` `water` `bell` `beam` `swarm` `impact`.
  `text`에는 `{time}` `{hour}` `{deaths}` `{runs}` `{wins}` `{best}` `{origin}`을 쓸 수 있다 (진짜 시각·기록으로 바뀜). 줄바꿈은 `\n`.
- `setUi(c, 'ui:…', n)` — 전투 내내 남는 화면 상태: `ui:water`(0~3) `ui:cracks`(0~3) `ui:tilt`(°) `ui:dark`(0~100) `ui:scramble` `ui:eye` `ui:swap`. 화면에만 영향, 규칙은 훅으로 따로.
- `MoveDef.ultimate: true` — 필살기 컷인. `MoveDef.cine` — 그 행동과 함께 트는 연출 (`'crack'` 또는 `{ name, n, text }`).
- `MoveDef.disguise: { kind, label, dmg?, hits?, reveal?, desc? }` — 거짓 의도. 통찰이 `reveal`(기본 `DISGUISE_REVEAL` = 3) 미만이면 이 모습으로 보인다 (봇도 속는다). 숨겨진 의도(`hidden`)는 `HIDDEN_REVEAL`(3)부터 보인다. 통찰은 귀하다(보통 판 2~4) — 더 높은 문턱은 수호자급 속임수에만 (4: 4층 어둠·5층 환영, 5: 파라오의 자비·꿈의 문지기의 문). 특성 설명 등으로 속임수가 있다는 걸 알려 줄 것.
- 제4의 벽 연출(whisper·sysmsg·scrawl 등)은 수호자당 2~4번. 매 턴 쓰지 말 것. 모든 위협은 의도 문구·설명으로 미리 알리고 대응법이 있어야 한다.
- 수호자 체력은 `BOSS_HP_MULT`(`src/engine/combat.ts`, 기본 1.1)가 더 곱해진다.
- **퍼즐형 위협**: `setObjective(c, { text, hit/break/block/types/quiet/kill, fail })` — 화면 위 호박색 띠에 막는 법을, 누르면 `fail`(못 막으면 일어나는 일)을 보여 준다. 봇도 이 목표를 보고 움직인다. 풀리는 순간 `setObjective(c, null)`로 지우고 대가를 취소한다.
- **즉사기**: `execute(c, e, '기술 이름')` — 사경 없이 패배 (결계가 하나 막는다). 목표에 `lethal: true`를 붙이면 붉은 해골 띠가 된다. 실행 전에 플레이어 턴이 최소 한 번 온전히 있어야 한다. 의도 종류는 `'death'`.
  - **남발 금지**: 즉사기는 엘리트 1~2종과 수호자 1종에만 (지금: 2층 성가대장, 3층 고대인 해부학자, 4층 검은 파라오). 최종 보스엔 넣지 않는다. 나머지 퍼즐형 패턴은 못 막으면 큰 대가(방어도 무시 최대 체력 25~35% 정도, 사경 직행·체력 1 금지).
- **전투 중 선택지**: `c.offerChoice({ id, title, text?, options: [{ id, label, desc, icon?, bot? }] })` — 시스템 창처럼 뜨고, 고르기 전엔 기술·턴 종료가 막힌다. 고르면 모든 훅의 `onChoice(c, s, id, option)`. `title`·`text`에 `{time}` 같은 실제 세계 토큰을 쓸 수 있다. 봇은 `bot`이 큰 것을 고른다 (예: 별의 태아 「탄생의 선택」).
- **직업 간 공정성** (군인=원거리 관통·탄약, 사냥꾼=근접 참격+플라스크, 비술사=원거리 비전):
  - 깨야 풀리는 기믹 물건은 `reachable: true` (후열이어도 근접이 닿는다). 퍼즐 목표의 대상은 자동으로 닿는다. 상황에 따라서만 닿게 하려면 `e.mem.reachable = 1` (예: 별의 심판을 짊어진 동안 — `act4/common.ts`의 `castDoom`).
  - 특정 속성을 요구하면 그 플레이어가 지금 낼 수 있는 속성 중에서만. 붕괴만이 해법이면 안 된다 (약점 속성이 없는 출신이 있다).
  - 피해 요구량은 지속 피해도 세고, 시작 덱 무기 기본 공격 × 행동력으로 2턴 안에 가능한 정도. 방어도 요구량은 방어구 기본기만으로도 가능한 정도.
  - 즉사기·큰 기믹마다 세 출신 시작 덱으로 봇이 푸는지 테스트할 것.

## 6. 이벤트

`stages.start(run, ev) => { text, choices }`. 선택지 `go(run, ev)`에서 `finish(ev, '결과 문장', { fight?, loot? })` 또는 `ev.stage = '다음'`. 헬퍼: `healRun, hurtRun, gainSanityRun, loseSanityRun(→ 붕괴 처리), learnSkill, rollRelic, rollEquip, rollRune, rollConsumable, rollForbidden, upgradeSkill, rng(run,'event')`. 1층 `events.ts`의 `sanity()`, `relicLoot()` 패턴 참고. 선택에는 대가와 이득이 함께 있어야 한다.

- **통찰은 귀하다** (`src/content/eventkit.ts`): 통찰을 주는 선택지는 층마다(공용 이벤트 포함) 많아야 1~2개, 언제나 +1, 그리고 영구 대가 — `INSIGHT_PRICE`(최대 정신력 -8 또는 최대 체력 -10) 또는 광기 하나(`canTakeMadness`/`takeMadness`). hint와 결과 문장에 그대로 적는다 (`tests/insight.test.ts`가 모든 선택지를 골라 보며 검사).
- '들여다보는' 선택지의 보상은 통찰 대신 앎: `learnWeak(run, floorFoes(run))`(이 층 적들의 약점 — 이번 판 전투에 바로 보이고 도감에도 남는다), `floorGuardian(run)`, 지도, 의지 등. 새로 안 것이 없으면 대가도 받지 않는다 (`weakNote`).

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
