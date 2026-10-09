import { reg, STATUSES } from '../../engine/registry';
import { isEnemy, MAX_ROW, scaledPoise, type Combat } from '../../engine/combat';
import type { DamageCtx, EnemyUnit, Intent, Unit } from '../../engine/types';
import { cine, setObjective, setUi } from '../lib';

/**
 * 2층 정예·수호자 패턴 (2026-10 확장) — 플레이어에게 거는 2층 전용 상태와 공용 도구.
 * - 침묵의 서약 (대사제): 말(기술)을 셀 때마다 줄고, 0이 되는 순간 행동력이 남아 있으면 말을 끊긴다 (Time Eater식 행동 수 규칙)
 * - 속죄 (대고행자): 기술을 쓸 때마다 체력을 잃는다
 * - 뒤엉킨 기억 (성가대장): 기술 이름이 뒤섞여 보이고, 쓴 기술은 그 턴에 다시 쓸 수 없다
 * - 고해 (살아있는 성유물함): 공격하지 않으면 죄를 사하고, 공격하면 신성모독
 * - 거꾸로 매달림 (거꾸로 매달린 성인): 체력 피해와 정신력 손실이 뒤바뀐다
 * - 공명 (종지기의 대종): 방금 울린 종은 깨지기 쉽다
 * - 침묵령 (종지기): 다음 내 턴, 두 번째 기술부터 쓸 때마다 정신력을 잃는다 (갈수록 비싸다)
 * - 떨어지는 종 (종지기 2막 「종탑의 광란」): 방어도로 막는 퍼즐 — 숨으면 종이 종지기를 덮친다
 * 화면 연출(cine·setUi)은 규칙과 따로 — 규칙은 모두 여기 훅과 적 행동에 있다.
 */

export const VOW = 'a2-vow';
/** 침묵의 서약: 이 수만큼 말하면 서약이 새로 시작된다 */
export const VOW_WORDS = 8;
/** 말을 끊길 때 대사제가 얻는 힘 (최대 VOW_STR_TIMES번) */
export const VOW_STR = 2;
export const VOW_STR_TIMES = 3;

export const PENANCE = 'a2-penance';
export const PENANCE_HP = 3;

export const TANGLED = 'a2-tangled';

export const CONFESSION = 'a2-confession';
export const ABSOLVE_SAN = 10;
export const SACRILEGE_SAN = 6;
export const SACRILEGE_BLOCK = 15;

export const HANGED = 'a2-hanged';

export const RESONANCE = 'a2-resonance';
/** 공명하는 대종이 받는 피해 배율 / 잠잠한 대종이 받는 피해 배율 */
export const RING_MULT = 1.5;
export const SILENT_MULT = 0.5;

/**
 * 마지막 종 (종지기의 위협 퍼즐 — 즉사는 아니다, 못 막으면 정신이 무너진다). 플레이어에게 남은 턴을 보여 주는 상태 + 퍼즐 목표.
 * 단계: keeper.mem.knell 1 = 세 번째 타종 직후 (2턴 남음) → 2 = 종을 당겼다 (1턴 남음, 이제 귀를 막아도 된다)
 * → 3 = 귀를 막았다 (먹먹한 종소리만). 대종이 깨지거나 종지기가 붕괴하면 끊긴다.
 */
export const KNELL = 'a2-knell';
/** 귀를 막아도 뼈를 타고 울리는 종소리 (정신 피해). 2026-10 계층군주 강화: 12 → 14 */
export const MUFFLE_SAN = 14;
/** 못 막고 들었다: 정신 피해 · 공포 · 방어도를 무시하는 피해(최대 체력 비율). 2026-10 계층군주 강화로 약 20% 올렸다 (35 → 42, 10% → 12%) */
export const KNELL_SAN = 42;
export const KNELL_DREAD = 2;
export const KNELL_HP_PCT = 0.12;
export const KNELL_FAIL = `종소리에 정신이 무너진다: 정신 피해 ${KNELL_SAN}, 공포 ${KNELL_DREAD}, 최대 체력의 ${Math.round(KNELL_HP_PCT * 100)}% 피해 (방어도 무시)`;
export const KNELL_TEXT_1 = '대종을 깨뜨리거나 종지기를 붕괴시켜라 · 2턴 남음';
export const KNELL_TEXT_2 = '대종을 깨뜨려라. 아니면 기술을 쓰지 말고 귀를 막아라 · 1턴 남음';

// ───────────── 종지기 (2층 계층군주) — 2026-10 "패턴을 더 넣고 훨씬 어렵게" ─────────────
// 수호자와 같은 세기였던 군주를 숨은 보스답게: 체력·피해를 올리고 침묵령, 2막 「종탑의 광란」과 떨어지는 종을 더했다.
// 숫자는 모두 여기서 고친다 (설명 문구도 이 상수를 읽는다)

/** 종지기 체력·버팀 (EnemyDef 단위 — 층·수호자 배율이 더 곱해진다). 330 → 450 */
export const KEEPER_HP = 640;
export const KEEPER_POISE = 12;
/** 종추 내려치기 (13 → 16) */
export const KEEPER_HAMMER = 19;
/** 타종의 정신 피해 */
export const TOLL_SAN = 6;
/** 대종이 깨지면 종지기가 얻는 힘 (기절 1과 함께) */
export const BELL_RAGE_STR = 3;
/** 1막 행동 순서 — 'toll'은 몇 번째 타종인지에 따라 toll1~3, 'summon'은 부를 수 없으면 타종 */
export const KEEPER_CYCLE = ['toll', 'hammer', 'toll', 'silence', 'summon', 'hammer'];

/**
 * 침묵령 (종지기 「침묵을 명한다」): 다음 내 턴 하나 동안 첫 기술은 괜찮지만, 그 뒤로 기술을 쓸 때마다 정신력을 잃는다 —
 * 두 번째 SILENCE_SAN, 세 번째 2배, 네 번째 3배 … 기술을 막지는 않는다 (값만 치른다 — 행동은 언제나 할 수 있다).
 * 기본기도 센다. 행동력 0인 기술은 세지 않는다 (탄약을 채우는 출신만 손해 보지 않게 — 대사제의 침묵의 서약과 같은 규칙).
 * 상태 칸에는 숨기고(수치는 '다음이 몇 번째 기술인가'라 뜻이 없다) 다음 기술의 값을 칩(turnNote)으로 보인다
 */
export const HUSH = 'a2-hush';
export const SILENCE_SAN = 3;
/** 「침묵을 명한다」가 함께 내려치는 피해 (의도에 보인다) */
export const SILENCE_DMG = 8;
/** 침묵령 아래에서 이번 턴 k번째(1부터) 기술의 정신력 대가 */
export const hushCost = (k: number) => Math.max(0, k - 1) * SILENCE_SAN;
export const HUSH_RULE =
  `첫 기술은 무사. 두 번째 기술부터 쓸 때마다 정신력을 잃는다 (두 번째 ${hushCost(2)}, 세 번째 ${hushCost(3)}, 네 번째 ${hushCost(4)} …). ` +
  '기본기도 센다. 행동력 0인 기술은 세지 않는다. 기술을 막지는 않는다';

/** 종탑의 광란 (2막): 종지기 체력이 이 비율 이하가 되거나 대종이 깨지면 (먼저 오는 쪽, 한 번뿐) */
export const BELFRY_PCT = 0.5;
export const BELFRY_NAME = '종탑의 망령';
/** 변할 때의 정신 피해 */
export const BELFRY_SAN = 8;
/** 2막의 새 버팀 (EnemyDef 단위 — scaledPoise로 층 배율을 곱해 가득 채운다. 두 번째 버팀) */
export const BELFRY_POISE = 14;
/** 광란: 2막에서 종지기가 행동할 때마다 얻는 힘 (기절·붕괴로 쉬는 차례엔 없다) — 오래 끌수록 거세진다 */
export const BELFRY_FRENZY = 1;
/** 광란 동안 기울어 보이는 화면 (°, 화면에만 — 몇 턴이고 이어지니 다른 기울기 연출보다 얕게) */
export const BELFRY_TILT = -3;
/** 2막 행동 순서 — 'cut'(종을 끊는다) 다음 차례엔 순서 밖에서 종이 떨어진다. 'call'은 부를 수 없으면 장송곡 */
export const BELFRY_CYCLE = ['cut', 'combo', 'call', 'silence', 'flurry', 'heart'];
/** 종추 연타와 장송곡 (한 행동에 공격과 정신 공격): 피해 × 횟수 + 정신 피해 */
export const COMBO_DMG = 9;
export const COMBO_HITS = 2;
export const COMBO_SAN = 6;
/** 광란의 종추 (5×3 → 6×3) */
export const FLURRY_DMG = 7;
export const FLURRY_HITS = 3;
/** 심장의 종 (정신 피해, 종지기 힘 +1) · 종탑의 장송곡 (정신 피해, 약화 1) */
export const HEART_SAN = 7;
export const DIRGE_SAN = 8;
/** 종탑의 수련사들: 한 번에 부르는 수 · 함께 있을 수 있는 수 (1막은 한 명씩 두 번까지) */
export const BELFRY_CALL = 2;
export const BELFRY_ACOLYTES = 3;

/**
 * 떨어지는 종 (2막의 방어 퍼즐 — 피해로 푸는 퍼즐과 다른 갈래): 「종을 끊는다」 다음 종지기 차례에 종이 떨어진다.
 * 그 사이 내 턴을 방어도 FALL_BLOCK 이상으로 마치면 종 그늘 아래 숨는다 — 종은 종지기를 덮친다 (피해 FALL_SELF, 버팀 -FALL_POISE).
 * 못 숨으면 최대 체력의 FALL_PCT 피해(방어도 무시)와 다음 턴 행동력 -FALL_AP. 종지기를 붕괴시키면 끊긴다 (의도 말풍선의 약속대로).
 * FALL_BLOCK은 방어구 기본기만 세 번 써도 닿는 값 (학자 로브 4×3 = 12 — 출신 공정성, docs/CONTENT_GUIDE.md 5-1)
 */
export const FALL = 'a2-fall';
export const PINNED = 'a2-pinned';
export const FALL_BLOCK = 12;
export const FALL_PCT = 0.3;
export const FALL_AP = 1;
export const FALL_SELF = 20;
export const FALL_POISE = 3;
export const FALL_TEXT = `종 아래로 숨어라: 방어도 ${FALL_BLOCK} 이상으로 턴을 마쳐라 · 1턴 남음`;
export const FALL_FAIL = `종에 깔린다: 최대 체력의 ${Math.round(FALL_PCT * 100)}% 피해 (방어도 무시), 다음 턴 행동력 -${FALL_AP}`;
export const FALL_RULE =
  `방어도 ${FALL_BLOCK} 이상으로 내 턴을 마치면 종 그늘 아래 숨어 종이 종지기를 덮친다 (피해 ${FALL_SELF}, 버팀 -${FALL_POISE}). ` +
  `못 숨으면 방어도를 무시하고 최대 체력의 ${Math.round(FALL_PCT * 100)}% 피해, 다음 턴 행동력 -${FALL_AP}`;

/**
 * 레퀴엠 (성가대장의 즉사 퍼즐). 크레셴도가 끝까지 차면 (첫 번째·세 번째 — 사이엔 대합창) 2턴짜리 카운트다운.
 * 단계: cm.mem.req 1 = 2턴 남음 → 2 = 1턴 남음 → 끝까지 들으면 즉사 (결계가 한 번 막는다).
 * 해법: 성가대원 하나를 쓰러뜨린다 / 성가대장에게 피해 REQUIEM_HIT (후열이어도 목표라 근접이 닿는다, 지속 피해도 센다) / 성가대장 붕괴.
 */
export const REQUIEM = 'a2-requiem';
/** 성가대장에게 이만큼 피해를 주면 지휘가 흐트러진다 — 어느 출신이든 무기 기본 공격 × 행동력으로 2턴이면 닿는 값 */
export const REQUIEM_HIT = 20;
/** 전투당 레퀴엠은 이 횟수까지 */
export const REQUIEM_MAX = 2;
export const REQUIEM_FAIL = '레퀴엠을 끝까지 들은 자는 사경 없이 죽는다';
const reqText = (need: number, turns: number) => `성가대원 하나를 쓰러뜨리거나 성가대장에게 피해 ${need} · ${turns}턴 남음`;

/** 상태를 정확히 n으로 맞춘다 (결계에 막히지 않는 규칙 표시 — 별의 심판과 같은 방식) */
export function setSt(c: Combat, u: Unit, id: string, n: number) {
  const before = u.st[id] ?? 0;
  if (n > 0) u.st[id] = n;
  else delete u.st[id];
  if (n !== before) c.emit({ t: 'status', uid: u.uid, id, n: n - before });
}

/** 의도를 이 행동으로 바꿔 보여 준다 (planIntent와 같은 계산 — AI를 거치지 않아 행동 순서가 흐트러지지 않는다) */
export function setIntent(c: Combat, e: EnemyUnit, id: string) {
  const m = c.moveDef(e, id);
  e.intent = {
    move: id,
    kind: m.intent,
    extra: m.extra,
    dmg: typeof m.dmg === 'function' ? m.dmg(c, e) : m.dmg,
    hits: typeof m.hits === 'function' ? m.hits(c, e) : m.hits,
    sanity: m.sanity,
    label: m.name,
    hidden: m.hidden,
    charging: m.charging,
    disguise: m.disguise,
  };
}

/** 이 전투에서 처음일 때만 true (제4의 벽 연출을 한 번씩만) */
export function once(c: Combat, key: string): boolean {
  if (c.s.vars[key]) return false;
  c.s.vars[key] = 1;
  return true;
}

// ───────────── 반응하는 의도 (2026-10 일반 적 패턴) ─────────────
// 적의 특성 훅은 내 기술을 직접 보지 못한다. 대신 맞을 때·누가 쓰러질 때 의도를 바꿔 그 자리에서 보여 준다
// (바뀐 의도는 내 턴 안에 보이므로 남은 행동력으로 대응할 수 있다). 3층 act3/common.ts의 react와 같은 규칙

/** 이 행동을 지금 의도로 정할 때의 모습 (planIntent와 같은 계산: 근접 행동인데 후열이면 전진·관망) */
export function intentNow(c: Combat, e: EnemyUnit, id: string): Intent {
  let move = id;
  let m = c.moveDef(e, id);
  if (m.melee && e.row !== 0) {
    move = c.row(0).length < MAX_ROW ? '_advance' : '_wait';
    m = c.moveDef(e, move);
  }
  return {
    move,
    kind: m.intent,
    extra: m.extra,
    dmg: typeof m.dmg === 'function' ? m.dmg(c, e) : m.dmg,
    hits: typeof m.hits === 'function' ? m.hits(c, e) : m.hits,
    sanity: m.sanity,
    label: m.name,
    hidden: m.hidden,
    charging: m.charging,
    disguise: m.disguise,
  };
}

/** 내 턴에 내 손으로 준 피해 (지속 피해·적끼리 준 피해·적의 차례에 되돌려 준 피해는 빼고) */
export function myHit(c: Combat, d: DamageCtx): boolean {
  return d.src === c.p && c.s.phase === 'player';
}

/** 반응: 내 턴 도중 의도를 이 행동으로 바꿔 보인다 (key마다 한 턴에 한 번). 붕괴·기절 중이거나 모아 둔 힘을 쏟아낼 차례면 바꾸지 않는다 */
export function react(c: Combat, e: EnemyUnit, id: string, text?: string, tone: 'good' | 'bad' | 'eldritch' = 'eldritch', key = 'rx'): boolean {
  if (e.dead || e.hp <= 0 || c.over || c.s.phase !== 'player' || e.broken === 2 || e.mem.charge || (e.st.stun ?? 0) > 0) return false;
  if (e.mem[key] === c.s.turn) return false;
  e.mem[key] = c.s.turn;
  e.intent = intentNow(c, e, id);
  if (text) c.emit({ t: 'text', uid: e.uid, text, tone });
  return true;
}

/** 지금 의도의 피해·횟수를 다시 센다 (의도를 정한 뒤 손·죄처럼 수치가 바뀌었을 때) */
export function refreshIntent(c: Combat, e: EnemyUnit) {
  const it = e.intent;
  if (!it || e.dead || it.move.startsWith('_')) return;
  const m = c.moveDef(e, it.move);
  e.intent = { ...it, dmg: typeof m.dmg === 'function' ? m.dmg(c, e) : m.dmg, hits: typeof m.hits === 'function' ? m.hits(c, e) : m.hits };
}

// ───────────── 침묵의 서약 ─────────────

/** 말을 끊는다: 남은 행동력을 잃고 이번 턴엔 기술을 쓸 수 없다, 대사제 힘 +2 (전투당 최대 3번 — 긴 싸움에서 끝없이 불어나지 않게) */
function excommunicate(c: Combat, priest: EnemyUnit) {
  const lost = c.s.ap;
  c.s.ap = 0;
  // 이미 침묵 중이면 더 걸지 않는다 (침묵이 다음 턴까지 늘어나지 않게)
  if (!((c.p.st.silence ?? 0) > 0)) c.apply(c.p, 'silence', 1, priest);
  if ((priest.mem.cuts ?? 0) < VOW_STR_TIMES) {
    priest.mem.cuts = (priest.mem.cuts ?? 0) + 1;
    c.apply(priest, 'str', VOW_STR, priest);
  }
  c.emit({ t: 'fx', name: 'horror', src: priest.uid, tgt: 'p' });
  c.emit({ t: 'text', uid: 'p', text: `파문: 말을 끊겼다 (행동력 -${lost})`, tone: 'bad' });
  if (once(c, 'a2-cut')) cine(c, 'sysmsg', { uid: priest.uid, text: '입력이 거부되었습니다. 침묵하십시오.' });
}

// ───────────── 고해 ─────────────

function sacrilege(c: Combat) {
  setSt(c, c.p, CONFESSION, 0);
  setUi(c, 'ui:eye', 0);
  const r = c.alive.find((x) => x.def === 'reliquary');
  c.emit({ t: 'text', uid: 'p', text: '신성모독', tone: 'bad' });
  cine(c, 'eye', { uid: r?.uid });
  if (r) c.gainBlock(r, SACRILEGE_BLOCK);
  c.loseSanity(SACRILEGE_SAN, true);
}

function absolve(c: Combat) {
  setSt(c, c.p, CONFESSION, 0);
  setUi(c, 'ui:eye', 0);
  c.emit({ t: 'text', uid: 'p', text: '죄를 사함받았다', tone: 'good' });
  c.gainSanity(ABSOLVE_SAN);
  for (const id of Object.keys(c.p.st)) {
    if (id === 'dying' || id === CONFESSION) continue;
    if (STATUSES.get(id)?.kind === 'debuff') c.clear(c.p, id);
  }
}

// ───────────── 마지막 종 (위협 퍼즐) ─────────────

const bellOf = (c: Combat) => c.alive.find((x) => x.def === 'great-bell') ?? null;

/** 마지막 종이 끝났다 (울렸거나, 결계에 막혔거나, 끊겼다) — 목표·표시를 지우고 타종은 처음부터 */
export function endKnell(c: Combat, keeper: EnemyUnit) {
  keeper.mem.knell = 0;
  keeper.mem.tolls = 0;
  if (c.s.obj) setObjective(c, null);
  setSt(c, c.p, KNELL, 0);
}

/** 세 번째 타종 직후: 마지막 종의 카운트다운 (2턴) — 해골 의도와 목표 띠가 바로 보인다 */
export function startKnell(c: Combat, keeper: EnemyUnit) {
  const bell = bellOf(c);
  // 마지막 종은 1막의 퍼즐 — 종탑의 광란(2막)에는 떨어지는 종이 대신한다 (목표 띠는 하나뿐)
  if (!bell || keeper.mem.knell || keeper.form) return;
  keeper.mem.knell = 1;
  setSt(c, c.p, KNELL, 2);
  setObjective(c, { text: KNELL_TEXT_1, hit: { uid: bell.uid, need: bell.hp }, break: keeper.uid, fail: KNELL_FAIL });
  c.emit({ t: 'text', uid: keeper.uid, text: '종이 세 번 울렸다. 네 번째 종소리를 듣는 자는 무너진다', tone: 'eldritch' });
  if (once(c, 'a2-knell')) cine(c, 'whisper', { uid: keeper.uid, text: '{time}. 세 번 울렸다. 네 번째를 들으면 너는 무너진다.' });
}

/** 마지막 종을 당긴다: 1턴 남음 — 이제는 귀를 막아도 산다 */
export function tightenKnell(c: Combat, keeper: EnemyUnit): boolean {
  const bell = bellOf(c);
  if (!bell || keeper.mem.knell !== 1) return false;
  keeper.mem.knell = 2;
  setSt(c, c.p, KNELL, 1);
  setObjective(c, { text: KNELL_TEXT_2, hit: { uid: bell.uid, need: bell.hp }, break: keeper.uid, quiet: true, fail: KNELL_FAIL });
  return true;
}

/** 대종이 깨지거나 종지기가 붕괴했다 — 마지막 종이 끊긴다 (그 자리에서 목표를 지우고 의도도 다시) */
export function cutKnell(c: Combat, keeper: EnemyUnit, text: string) {
  const k = keeper.mem.knell ?? 0;
  if (k !== 1 && k !== 2) return;
  endKnell(c, keeper);
  c.emit({ t: 'text', uid: keeper.uid, text, tone: 'good' });
  if (c.s.phase === 'player' && !keeper.dead && keeper.broken !== 2) c.planIntent(keeper);
}

/** 대종이 맞을 때마다 '남은 피해'를 줄인다 */
export function knellNeed(c: Combat, bell: EnemyUnit) {
  const o = c.s.obj;
  if (!o?.hit || o.hit.uid !== bell.uid || bell.dead || bell.hp <= 0 || o.hit.need === bell.hp) return;
  setObjective(c, { ...o, hit: { uid: bell.uid, need: bell.hp } });
}

// ───────────── 레퀴엠 (즉사 퍼즐) ─────────────

function requiemObjective(c: Combat, cm: EnemyUnit, turns: number, need: number) {
  const choir = c.alive.filter((x) => x.def === 'chorister').map((x) => x.uid);
  setObjective(c, {
    text: reqText(need, turns),
    kill: choir.length ? choir : undefined,
    hit: { uid: cm.uid, need },
    break: cm.uid,
    lethal: true,
    fail: REQUIEM_FAIL,
  });
}

/** 이번 크레셴도로 레퀴엠을 부를 차례인가 (첫 번째·세 번째, 전투당 두 번까지, 성가대원이 있어야) */
export function requiemDue(c: Combat, cm: EnemyUnit): boolean {
  const reqs = cm.mem.reqs ?? 0;
  if (cm.mem.req || reqs >= REQUIEM_MAX || reqs > (cm.mem.grands ?? 0)) return false;
  return c.alive.some((x) => x.def === 'chorister');
}

/** 크레셴도가 끝까지 찼다: 레퀴엠의 카운트다운 (2턴) — 해골 의도와 목표 띠가 바로 보인다 */
export function startRequiem(c: Combat, cm: EnemyUnit): boolean {
  if (!requiemDue(c, cm)) return false;
  cm.mem.req = 1;
  cm.mem.reqs = (cm.mem.reqs ?? 0) + 1;
  cm.mem.reqNeed = REQUIEM_HIT;
  setSt(c, c.p, REQUIEM, 2);
  requiemObjective(c, cm, 2, REQUIEM_HIT);
  c.emit({ t: 'text', uid: cm.uid, text: '성가대가 레퀴엠을 부르기 시작한다. 끝까지 들은 자는 죽는다', tone: 'eldritch' });
  if (once(c, 'a2-requiem')) cine(c, 'whisper', { uid: cm.uid, text: '레퀴엠.\n{origin}, 너를 위해 부른다.' });
  return true;
}

/** 첫 소절이 끝났다: 1턴 남음 */
export function advanceRequiem(c: Combat, cm: EnemyUnit): boolean {
  if (cm.mem.req !== 1) return false;
  cm.mem.req = 2;
  setSt(c, c.p, REQUIEM, 1);
  requiemObjective(c, cm, 1, cm.mem.reqNeed ?? REQUIEM_HIT);
  return true;
}

/** 레퀴엠이 끝났다 (끊겼거나, 결계가 막았다) — 크레셴도는 처음부터 */
export function endRequiem(c: Combat, cm: EnemyUnit) {
  cm.mem.req = 0;
  cm.mem.cres = 0;
  delete cm.mem.reqNeed;
  if (c.s.obj) setObjective(c, null);
  setSt(c, c.p, REQUIEM, 0);
}

/** 레퀴엠이 끊긴다 (성가대원이 쓰러졌다 / 피해가 찼다 / 붕괴) — 그 자리에서 목표를 지우고 의도도 다시 */
export function cutRequiem(c: Combat, cm: EnemyUnit, text: string) {
  const k = cm.mem.req ?? 0;
  if (k !== 1 && k !== 2) return;
  endRequiem(c, cm);
  c.emit({ t: 'text', uid: cm.uid, text, tone: 'good' });
  if (c.s.phase === 'player' && !cm.dead && cm.broken !== 2) c.planIntent(cm);
}

/** 성가대장이 맞을 때마다 남은 피해를 줄인다 (막힌 피해·지속 피해도 센다) */
export function requiemHit(c: Combat, cm: EnemyUnit, dealt: number) {
  const k = cm.mem.req ?? 0;
  if ((k !== 1 && k !== 2) || dealt <= 0) return;
  const need = Math.max(0, (cm.mem.reqNeed ?? REQUIEM_HIT) - dealt);
  cm.mem.reqNeed = need;
  if (need <= 0) cutRequiem(c, cm, '지휘가 흐트러져 레퀴엠이 끊겼다');
  else requiemObjective(c, cm, k === 1 ? 2 : 1, need);
}

/** 종이 울리는 턴에 기술을 하나도 쓰지 않았다 — 귀를 막아 듣지 않는다 (먹먹한 종소리만 남는다) */
function muffle(c: Combat, keeper: EnemyUnit) {
  keeper.mem.knell = 3;
  setObjective(c, null);
  setSt(c, c.p, KNELL, 0);
  c.emit({ t: 'text', uid: 'p', text: '귀를 막았다. 마지막 종소리는 듣지 않는다', tone: 'good' });
  if (keeper.broken !== 2) setIntent(c, keeper, 'muffled');
}

// ───────────── 종지기: 침묵령 ─────────────

/** 침묵을 명한다: 다음 내 턴 하나 동안 침묵령 (이미 걸려 있으면 그대로, 결계가 막는다) */
export function hush(c: Combat, e: EnemyUnit) {
  if (c.over || (c.p.st[HUSH] ?? 0) > 0) return;
  if (c.apply(c.p, HUSH, 1, e) <= 0) return;
  c.emit({ t: 'text', uid: 'p', text: '침묵령: 두 번째 기술부터 정신력을 잃는다', tone: 'bad' });
}

// ───────────── 종지기 2막: 종탑의 광란 · 떨어지는 종 ─────────────

/**
 * 종탑의 광란: 종지기가 종탑의 망령이 된다 (체력 BELFRY_PCT 이하 또는 대종이 깨졌을 때, 먼저 오는 쪽 — 한 번뿐).
 * 1막의 마지막 종은 광란에 묻히고, 새 버팀이 가득 차고, 첫 행동은 「종을 끊는다」 (기절·붕괴로 밀려도 그대로 — mem.cutDue).
 * 적의 차례 도중에 변해도(자기 차례 시작의 지속 피해 등) 의도를 다시 정해 1막의 행동을 하지 않게 한다
 */
export function belfry(c: Combat, e: EnemyUnit) {
  if (e.form || e.dead || e.hp <= 0 || c.over) return;
  e.form = 1;
  e.mem.transformed = 1;
  e.name = BELFRY_NAME;
  if (e.mem.knell) {
    const counting = e.mem.knell === 1 || e.mem.knell === 2;
    endKnell(c, e);
    if (counting) c.emit({ t: 'text', uid: e.uid, text: '광란 속에 마지막 종소리가 흩어졌다', tone: 'good' });
  }
  e.maxPoise = scaledPoise(BELFRY_POISE, 2);
  // 붕괴 중이면 그대로 — 돌아올 때 새 버팀으로 찬다
  if (e.broken === 0) e.poise = e.maxPoise;
  // 첫 행동은 종을 끊는 것 — 순서(BELFRY_CYCLE)의 'cut'을 미리 쓴 셈으로 그다음 칸부터 이어 간다
  e.mem.cutDue = 1;
  e.mem.c2 = (BELFRY_CYCLE.indexOf('cut') + 1) % BELFRY_CYCLE.length;
  c.emit({ t: 'fx', name: 'transform', tgt: e.uid });
  cine(c, 'shatter', { uid: e.uid });
  cine(c, 'bell', { uid: e.uid, n: 3 });
  // 종탑이 기운다 (종지기가 쓰러지면 바로 선다)
  setUi(c, 'ui:tilt', BELFRY_TILT);
  c.emit({ t: 'text', uid: e.uid, text: '종탑이 울부짖는다. 종지기가 종탑의 망령이 되었다', tone: 'eldritch' });
  if (once(c, 'a2-belfry')) cine(c, 'whisper', { uid: e.uid, text: '{time}. 종탑의 밧줄이 하나씩 끊어진다.\n위를 봐.' });
  c.loseSanity(BELFRY_SAN, true);
  if (c.over || e.dead) return;
  if (e.broken !== 2) c.planIntent(e);
}

/** 떨어지는 종의 목표 띠와 표시 */
function fallObjective(c: Combat) {
  setSt(c, c.p, FALL, 1);
  setObjective(c, { text: FALL_TEXT, block: FALL_BLOCK, fail: FALL_FAIL });
}

/** 종을 끊는다: 다음 종지기 차례에 종이 떨어진다 (1턴 남음 — 해법과 대가가 목표 띠에 바로 보인다) */
export function cutRope(c: Combat, e: EnemyUnit) {
  e.mem.fall = 1;
  delete e.mem.cutDue;
  delete e.mem.fallSafe;
  fallObjective(c);
  c.emit({ t: 'text', uid: e.uid, text: '종탑의 밧줄이 끊어졌다. 머리 위에서 종이 흔들린다', tone: 'eldritch' });
}

/** 떨어지는 종이 끝났다 (떨어졌거나 끊겼다) — 목표·표시를 지운다 */
export function endFall(c: Combat, e: EnemyUnit) {
  e.mem.fall = 0;
  delete e.mem.fallSafe;
  if (c.s.obj?.block !== undefined) setObjective(c, null);
  setSt(c, c.p, FALL, 0);
}

/**
 * 지금 방어도로 숨을 수 있는지를 띠와 의도에 바로 보인다: 방어도가 FALL_BLOCK에 닿는 순간 띠가 걷히고 의도가 「제 종에 깔린다」로,
 * 그 뒤 방어도를 잃으면 띠와 의도가 돌아온다. 판정은 턴이 끝날 때 (judgeFall).
 * 띠가 걷히는 순간을 보여 줘야 사람도 봇도 '끝까지 채우는 것'의 값을 안다 (봇은 띠를 걷는 행동을 크게 친다)
 */
export function shelterCheck(c: Combat) {
  const e = c.alive.find((x) => x.def === 'bellkeeper' && x.mem.fall);
  if (!e || c.s.phase !== 'player') return;
  const safe = c.p.block >= FALL_BLOCK;
  if (safe && c.s.obj?.block !== undefined) {
    setObjective(c, null);
    c.emit({ t: 'text', uid: 'p', text: '종 그늘 아래로 숨었다', tone: 'good' });
    if (e.broken !== 2) setIntent(c, e, 'recoil');
  } else if (!safe && !c.s.obj) {
    fallObjective(c);
    c.emit({ t: 'text', uid: 'p', text: '종 그늘에서 벗어났다', tone: 'bad' });
    if (e.broken !== 2) setIntent(c, e, 'fall');
  }
}

/**
 * 내 턴이 끝날 때 판정한다 (목표 띠의 말 그대로 — '방어도 N 이상으로 턴을 마쳐라').
 * 판정은 종지기 차례에 종이 떨어질 때 쓴다 (그 사이 다른 적이 방어도를 깎아도 숨은 것은 숨은 것)
 */
export function judgeFall(c: Combat) {
  const e = c.alive.find((x) => x.def === 'bellkeeper' && x.mem.fall);
  if (!e) {
    setSt(c, c.p, FALL, 0);
    return;
  }
  shelterCheck(c);
  const safe = c.p.block >= FALL_BLOCK;
  e.mem.fallSafe = safe ? 1 : 0;
  if (safe) setSt(c, c.p, FALL, 0);
}

/** 종지기가 붕괴했다 — 밧줄을 놓쳐 떨어지는 종이 끊긴다 (대가 없음) */
export function cutFall(c: Combat, e: EnemyUnit) {
  if (!e.mem.fall) return;
  endFall(c, e);
  c.emit({ t: 'text', uid: e.uid, text: '붕괴로 종지기가 밧줄을 놓쳤다. 종이 엉뚱한 데 떨어진다', tone: 'good' });
}

/** 숨었다: 떨어진 종이 종지기를 덮친다 — 피해 FALL_SELF, 버팀 -FALL_POISE (0이 되면 붕괴) */
export function crashKeeper(c: Combat, e: EnemyUnit) {
  endFall(c, e);
  c.emit({ t: 'text', uid: e.uid, text: '떨어진 종이 종지기를 덮쳤다', tone: 'good' });
  // 내 손이 아니라 종의 무게다 — 버팀에 깎이지 않는다
  c.damage({ src: null, tgt: e, base: FALL_SELF, type: 'true', ignoreBlock: true, tags: ['fall'] });
  if (e.dead || e.hp <= 0 || e.broken > 0 || e.maxPoise <= 0) return;
  e.poise = Math.max(0, e.poise - FALL_POISE);
  if (e.poise === 0) c.breakEnemy(e);
  else c.emit({ t: 'text', uid: e.uid, text: `비틀거린다 (버팀 -${FALL_POISE})`, tone: 'good' });
}

/** 못 숨었다: 종에 깔린다 — 최대 체력의 FALL_PCT 피해 (방어도 무시), 다음 내 턴 행동력 -FALL_AP */
export function crashPlayer(c: Combat, e: EnemyUnit) {
  endFall(c, e);
  c.emit({ t: 'text', uid: 'p', text: '종에 깔렸다', tone: 'bad' });
  c.damage({ src: e, tgt: c.p, base: Math.ceil(c.p.maxHp * FALL_PCT), type: 'true', ignoreBlock: true, tags: ['fall'] });
  if (!c.over) c.apply(c.p, PINNED, FALL_AP, e);
}

/** 종이 떨어진다: 내 턴 끝에 숨었으면 종지기를, 아니면 나를 덮친다 (판정이 없으면 — 상태가 지워졌으면 — 지금 방어도로) */
export function landFall(c: Combat, e: EnemyUnit) {
  const safe = e.mem.fallSafe !== undefined ? e.mem.fallSafe > 0 : c.p.block >= FALL_BLOCK;
  if (safe) crashKeeper(c, e);
  else crashPlayer(c, e);
}

// ───────────── 상태 등록 ─────────────

reg.statuses([
  {
    id: VOW,
    name: '침묵의 서약',
    icon: 'gi:lips',
    kind: 'debuff',
    desc: `남은 말 {n}. 행동력을 쓰는 기술(기본기 포함)을 쓸 때마다 1씩 줄어든다. 0이 되면 서약이 ${VOW_WORDS}로 새로 시작된다. 그 순간 행동력이 남아 있으면 대사제가 말을 끊는다. 말을 끊기면 남은 행동력을 잃고 이번 턴엔 기술을 쓸 수 없다. 대사제 힘 +${VOW_STR} (전투당 ${VOW_STR_TIMES}번까지). 행동력 0인 기술은 말로 치지 않는다`,
    hooks: {
      afterSkill(c, s, u) {
        if (u.echo || s.unit !== c.p) return;
        // 행동력 0인 기술(재장전 등)은 말로 치지 않는다 — 탄약을 채워야 하는 출신만 손해 보지 않게
        if (c.costOf({ def: u.def, owned: u.owned }) <= 0) return;
        const priest = c.alive.find((x) => x.def === 'high-priest');
        if (!priest) {
          setSt(c, c.p, VOW, 0);
          return;
        }
        const left = s.n - 1;
        if (left > 0) {
          setSt(c, c.p, VOW, left);
          return;
        }
        setSt(c, c.p, VOW, VOW_WORDS);
        if (c.s.ap > 0) excommunicate(c, priest);
        else c.emit({ t: 'text', uid: priest.uid, text: '말씀을 맺었다. 서약이 새로 시작된다', tone: 'info' });
      },
    },
  },
  {
    id: PENANCE,
    name: '속죄',
    icon: 'gi:whiplash',
    kind: 'debuff',
    decay: true,
    desc: `{n}턴 동안 기술을 쓸 때마다 체력 ${PENANCE_HP}를 잃는다 (기본기 포함, 방어도 무시)`,
    hooks: {
      afterSkill(c, s, u) {
        if (u.echo || s.unit !== c.p) return;
        c.loseHp(c.p, PENANCE_HP, 'penance');
      },
    },
  },
  {
    id: TANGLED,
    name: '뒤엉킨 기억',
    icon: 'gi:musical-notes',
    kind: 'debuff',
    decay: true,
    desc: '기술 이름과 설명이 뒤섞여 보인다. 쓴 기술은 이번 턴에 다시 쓸 수 없다 ({n}턴)',
    hooks: {
      // 재사용 대기가 없는 기술(기본기 포함)도 이번 턴엔 한 번만
      modCd(_c, _s, _def, cd) {
        return Math.max(cd, 1);
      },
      onTurnEnd(c, s) {
        if (s.n <= 1) setUi(c, 'ui:scramble', 0);
      },
    },
  },
  {
    id: CONFESSION,
    name: '고해',
    icon: 'gi:prayer',
    kind: 'debuff',
    desc: `이번 턴 공격하지 않으면 턴이 끝날 때 죄를 사함받는다 (정신력 +${ABSOLVE_SAN}, 해로운 효과 모두 제거). 공격하는 순간 신성모독: 성유물함 방어도 ${SACRILEGE_BLOCK}, 정신력 -${SACRILEGE_SAN}`,
    hooks: {
      onDamageDealt(c, s, d) {
        if (s.unit !== c.p || d.src !== c.p || !d.attack || !isEnemy(d.tgt) || c.s.phase !== 'player' || !c.p.st[CONFESSION]) return;
        sacrilege(c);
      },
      onTurnEnd(c, s) {
        if (s.unit === c.p && c.p.st[CONFESSION]) absolve(c);
      },
    },
  },
  {
    id: HANGED,
    name: '거꾸로 매달림',
    icon: 'gi:tarot-12-the-hanged-man',
    kind: 'debuff',
    decay: true,
    desc: '피가 머리로 쏠린다. {n}턴 동안 체력 피해는 정신력을, 정신력 손실은 체력을 깎는다. 사경 중엔 그대로',
    hooks: {
      onDamageTaken(c, s, d) {
        const p = c.p;
        if (s.unit !== p || d.tgt !== p || d.hpLoss <= 0 || d.tags.includes('hanged') || c.dying || c.over) return;
        const n = d.hpLoss;
        p.hp += n;
        d.hpLoss = 0;
        // 넘겨받은 정신력 손실은 다시 체력으로 돌리지 않는다
        c.s.vars['a2-hang'] = 1;
        try {
          c.loseSanity(n);
        } finally {
          delete c.s.vars['a2-hang'];
        }
      },
      modSanityLoss(c, s, amount) {
        if (!c || c.previewing || c.dying || c.over || s.unit !== c.p || c.s.vars['a2-hang']) return amount;
        const n = Math.floor(amount);
        if (n > 0) c.loseHp(c.p, n, 'hanged');
        return 0;
      },
    },
  },
  {
    id: RESONANCE,
    name: '공명',
    icon: 'gi:sound-waves',
    kind: 'debuff',
    desc: `방금 울린 종이 떨고 있다. 받는 피해 +${Math.round((RING_MULT - 1) * 100)}%. 종이 다시 잠잠해지면 사라진다`,
  },
  {
    id: KNELL,
    name: '마지막 종',
    icon: 'gi:ringing-bell',
    kind: 'debuff',
    desc:
      `종말의 종이 {n}턴 뒤 울린다. 들으면 정신이 무너진다: 정신 피해 ${KNELL_SAN}, 공포 ${KNELL_DREAD}, 최대 체력의 ${Math.round(KNELL_HP_PCT * 100)}% 피해 (방어도 무시). ` +
      '대종을 깨뜨리거나 종지기를 붕괴시키면 끊긴다. 대종은 후열에 있어도 근접으로 닿는다. ' +
      `종이 울리는 마지막 턴에 기술을 하나도 쓰지 않으면 귀를 막아 듣지 않는다. 대신 먹먹한 종소리에 정신 피해 ${MUFFLE_SAN}. 대종은 남아 다시 울린다`,
    hooks: {
      onTurnEnd(c, s) {
        if (s.unit !== c.p || s.n !== 1 || c.s.used > 0) return;
        const keeper = c.alive.find((x) => x.def === 'bellkeeper' && x.mem.knell === 2);
        if (keeper) muffle(c, keeper);
      },
    },
  },
  {
    id: REQUIEM,
    name: '레퀴엠',
    icon: 'gi:musical-score',
    kind: 'debuff',
    desc:
      '레퀴엠이 {n}턴 뒤 끝난다. 끝까지 들은 자는 사경 없이 죽는다 (결계가 한 번 막는다). ' +
      `성가대원 하나를 쓰러뜨리거나 성가대장에게 피해 ${REQUIEM_HIT}을 주거나 성가대장을 붕괴시키면 끊긴다. 성가대장은 후열에 있어도 근접으로 닿는다. 지속 피해도 센다`,
  },
  {
    // 수치(n)는 '이번 턴 다음 기술이 몇 번째인가' — 뜻이 없어 상태 칸에는 숨기고, 다음 기술의 값을 칩으로 보인다
    id: HUSH,
    name: '침묵령',
    icon: 'gi:mute',
    kind: 'debuff',
    hidden: true,
    desc: `종지기가 명한 침묵. 이번 턴 ${HUSH_RULE}. 턴이 끝나면 풀린다`,
    hooks: {
      turnNote(c, s) {
        if (s.unit !== c.p) return null;
        const next = c.previewSanityLoss(hushCost(s.n));
        return {
          icon: 'gi:mute',
          text: s.n <= 1 ? '첫 기술은 무사' : `다음 기술 정신력 -${next}`,
          title: '침묵령',
          desc: `${HUSH_RULE}. ${s.n <= 1 ? '아직 기술을 쓰지 않았다' : `이번 턴 기술 ${s.n - 1}개를 썼다. 다음 기술은 정신력 -${next}`}. 턴이 끝나면 풀린다`,
          now: true,
          bad: true,
        };
      },
      afterSkill(c, s, u) {
        if (u.echo || s.unit !== c.p) return;
        // 행동력 0인 기술(재장전 등)은 세지 않는다
        if (c.costOf({ def: u.def, owned: u.owned }) <= 0) return;
        const cost = hushCost(s.n);
        setSt(c, c.p, HUSH, s.n + 1);
        if (cost <= 0) return;
        c.emit({ t: 'text', uid: 'p', text: '침묵을 깨뜨린 대가', tone: 'bad' });
        c.loseSanity(cost, true);
      },
      onTurnEnd(c, s) {
        if (s.unit === c.p) setSt(c, c.p, HUSH, 0);
      },
    },
  },
  {
    id: FALL,
    name: '떨어지는 종',
    icon: 'gi:tower-fall',
    kind: 'debuff',
    desc: `종지기가 종탑의 밧줄을 끊었다. 종지기의 다음 차례에 종이 떨어진다. ${FALL_RULE}. 종지기를 붕괴시키면 끊긴다`,
    hooks: {
      // 방어도가 닿는 순간 띠가 걷힌다 (턴을 시작할 때 이미 지닌 방어도·기술을 쓸 때마다)
      onTurnStart(c, s) {
        if (s.unit === c.p) shelterCheck(c);
      },
      // 메아리가 더한 방어도도 바로 센다 (몇 번 불려도 같다)
      afterSkill(c, s) {
        if (s.unit === c.p) shelterCheck(c);
      },
      onTurnEnd(c, s) {
        if (s.unit === c.p) judgeFall(c);
      },
      // 어떤 수로든 종지기가 붕괴하면 밧줄을 놓친다 (피해가 아닌 붕괴까지)
      onBreak(c, s, victim) {
        if (s.unit === c.p && victim.def === 'bellkeeper') cutFall(c, victim);
      },
    },
  },
  {
    id: PINNED,
    name: '종에 짓눌림',
    icon: 'gi:weight-crush',
    kind: 'debuff',
    desc: '떨어진 종에 깔렸다. 내 턴이 시작될 때 행동력 -{n}',
    tickStart(c, u, n) {
      if (isEnemy(u)) return;
      c.s.ap = Math.max(1, c.s.ap - n);
      c.emit({ t: 'text', uid: 'p', text: `종에 짓눌린 몸이 무겁다 (행동력 -${n})`, tone: 'bad' });
      c.clear(u, PINNED);
    },
  },
]);
