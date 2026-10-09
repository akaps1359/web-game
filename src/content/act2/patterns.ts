import { reg, STATUSES } from '../../engine/registry';
import { isEnemy, MAX_ROW, type Combat } from '../../engine/combat';
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
/** 귀를 막아도 뼈를 타고 울리는 종소리 (정신 피해) */
export const MUFFLE_SAN = 12;
/** 못 막고 들었다: 정신 피해 · 공포 · 방어도를 무시하는 피해(최대 체력 비율) */
export const KNELL_SAN = 35;
export const KNELL_DREAD = 2;
export const KNELL_HP_PCT = 0.1;
export const KNELL_FAIL = `종소리에 정신이 무너진다: 정신 피해 ${KNELL_SAN}, 공포 ${KNELL_DREAD}, 최대 체력의 ${Math.round(KNELL_HP_PCT * 100)}% 피해 (방어도 무시)`;
export const KNELL_TEXT_1 = '대종을 깨뜨리거나 종지기를 붕괴시켜라 · 2턴 남음';
export const KNELL_TEXT_2 = '대종을 깨뜨려라. 아니면 기술을 쓰지 말고 귀를 막아라 · 1턴 남음';

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
  if (!bell || keeper.mem.knell) return;
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
]);
