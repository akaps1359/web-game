import { ENEMIES, STATUSES, reg } from '../../engine/registry';
import { isEnemy, MAX_ROW, unguarded, type Combat } from '../../engine/combat';
import { hpPct, last } from '../../engine/ai';
import { josa } from '../../engine/josa';
import type { DamageCtx, EnemyUnit } from '../../engine/types';
import { setSt } from './patterns';

/*
 * 4층(별들의 궁정) 일반 적 패턴 (2026-10 패턴 확장): "고층은 일반 몹조차도 다양한 패턴을".
 * 일반 적마다 상황을 읽는 AI와 반응하는 패턴 둘 이상. 모든 위협은 의도·상태 칸·특성 설명으로 미리 보이고,
 * 세 출신(군인 관통·탄약 / 사냥꾼 근접 참격·플라스크 / 학자 원거리 비전) 모두에게 대응법이 있다.
 *
 *  - 별의 자손: 내 턴에 맞지 않으면 꿈이 깊어져 「꿈의 범람」. 때리면 얕아진다. 체력 절반 아래에서 깨어나 촉수를 휘두른다
 *  - 무형의 피리꾼: 선율을 고조시켜 「광기의 절정」(고조되는 동안 근접이 닿고, 피해 문턱·붕괴로 끊긴다). 동료가 쓰러지면 그 공격을 「장송곡」으로 되풀이
 *  - 검은 새끼: 화염 공격에 겁먹어 공격을 멈춘다. 체력 절반 아래에서 뿌리를 내려 수액이 두 배, 행동이 바뀐다
 *  - 시간의 파수꾼: 크게 다친 적의 상처를 되감는다(대상 표시). 「예정된 상처」: 다음 내 턴이 끝날 때 열린다
 *  - 미고 봉합사: 붕괴한 동료를 꿰매 한 차례 일찍 일으킨다. 지속 피해가 쌓인 동료를 씻어 낸다
 *  - 외신의 시종: 내 강화 효과를 삼키고 붕괴·처치 때 토해 낸다. 피리꾼과 박자를 맞추고, 피리꾼이 쓰러지면 비틀거린다
 *  - 얼굴 없는 사제: 「얼굴 없는 낙인」으로 다른 적의 공격을 모은다(사제를 붕괴·처치하면 풀린다). 방어도를 쌓는 상대에겐 얼굴을 보여 준다
 *  - 우주에서 온 색: 빨아들인 생기가 차면 「색의 개화」. 동료를 물들여 흡혈을 나눈다
 *  - 비야키: 급강하한 뒤 전열에 내려앉는다(근접이 그대로 들어간다). 날아 있을 때 약점에 맞으면 떨어진다
 *  - 차원 방랑자: 전열·후열에서 하는 일이 다르다. 붙잡아 다음 차례에 저편으로 끌고 간다(피해 문턱·붕괴로 풀린다)
 *  - 날아다니는 폴립: 약점에 맞으면 형체가 드러나 공격을 멈추고 바람을 두른다. 바람을 모아 진공 폭풍
 *  - 새 적 시간을 갉는 것: 내 행동력을 빼앗아 삼키고, 붕괴·처치하면 토해 낸다. 남긴 행동력도 핥아먹는다
 *  - 새 적 별자리를 잇는 자: 동료를 별의 실로 잇는다. 이어진 적이 받는 피해의 절반이 실을 따라 넘어온다
 *
 * 적의 특성 훅은 플레이어의 턴·기술·붕괴를 볼 수 없어서, 그쪽에서 일어나는 일은 공용 규칙(a4-court) 하나가 받아 나눠 준다.
 * 상태는 모두 e.mem·e.st·c.s.vars·플레이어 상태에 둔다 (저장·시뮬레이션). 수치는 상수로 두고 설명 문구도 같은 상수를 쓴다.
 */

export const SPAWN = 'star-spawn';
export const PIPER = 'formless-piper';
export const YOUNG = 'dark-young';
export const WARDEN = 'time-warden';
export const MIGO = 'migo-stitcher';
export const SERVITOR = 'outer-servitor';
export const PRIEST = 'faceless-priest';
export const COLOUR = 'star-colour';
export const BYAKHEE = 'byakhee';
export const SHAMBLER = 'dim-shambler';
export const POLYP = 'flying-polyp';
export const GNAWER = 'time-gnawer';
export const WEAVER = 'star-weaver';

// ───────────── 수치 ─────────────

/** 별의 자손: 가라앉은 꿈 (n 0~DREAM_MAX) · 꿈의 범람 정신 피해 · 깨어나는 체력 비율 */
export const DREAM = 'a4-dream';
export const DREAM_MAX = 3;
export const FLOOD_SAN = 15;
export const AWAKE_AT = 0.5;

/** 무형의 피리꾼: 고조되는 선율 (n = 끊는 데 더 필요한 피해) · 광기의 절정 · 끊는 피해(최대 체력 비율) */
export const CRESCENDO = 'a4-crescendo';
export const CLIMAX_SAN = 16;
export const CRESCENDO_BREAK = 0.12;
/** 장송곡: 되풀이하는 공격의 타격당 피해·횟수 상한 / 되풀이할 공격이 없을 때 정신 피해 */
export const DIRGE_CAP = 12;
export const DIRGE_HITS = 3;
export const LAMENT_SAN = 10;

/** 검은 새끼: 뿌리내림 · 검은 수액 회복량 (평소/뿌리내림) · 뿌리 내리는 체력 비율 */
export const TAPROOT = 'a4-taproot';
export const SAP_HEAL = 5;
export const ROOT_SAP = 10;
export const ROOT_AT = 0.5;

/** 시간의 파수꾼: 되감길 상처 (n = 되돌릴 체력) · 문턱(한 턴에 잃은 체력 비율) · 상한 · 간격 */
export const REWIND_MARK = 'a4-rewind-mark';
export const REWIND_PCT = 0.25;
export const REWIND_CAP = 24;
export const REWIND_GAP = 3;
/** 예정된 상처 (n = 열릴 때의 피해 미리보기) · 기본 피해 · 간격 */
export const FUTURE = 'a4-future';
export const FUTURE_DMG = 10;
export const FUTURE_GAP = 4;

/** 미고 봉합사: 봉합 대기 표시 · 씻어 내는 지속 피해 합 · 간격 */
export const STITCH_MARK = 'a4-stitch-mark';
export const DEBRIDE_MIN = 6;
export const DEBRIDE_GAP = 3;

/** 외신의 시종: 삼킨 강화 (n = 삼킨 수치 합) · 삼키는 강화 효과 · 피리꾼을 잃었을 때 비틀거림 */
export const SWALLOWED = 'a4-swallowed';
export const SWALLOWABLE = ['barrier', 'aim', 'str', 'dex', 'ward', 'counter', 'thorns', 'ritual', 'tentacle', 'retain', 'regen'];
export const BEAT_STAGGER = 2;

/** 얼굴 없는 사제: 낙인 · 받는 공격 피해 배율 · 이 방어도 이상으로 턴을 마치면 얼굴을 보여 준다 */
export const BRAND = 'a4-brand';
export const BRAND_MULT = 1.25;
export const TURTLE_BLOCK = 15;

/** 우주에서 온 색: 포만 (n = 빨아들인 생기) · 가득 차는 양 · 물든 빛 */
export const SATIETY = 'a4-satiety';
export const SATE = 24;
export const TINT = 'a4-tint';

/** 비야키: 내려앉음 */
export const LANDED = 'a4-landed';

/** 차원 방랑자: 붙잡힘 (n = 풀려나는 데 더 필요한 피해) · 풀려나는 피해(최대 체력 비율) · 끌고 가기 정신 피해 · 간격 */
export const GRABBED = 'a4-grabbed';
export const GRAB_BREAK = 0.1;
export const DRAG_SAN = 12;
export const GRAB_GAP = 4;

/** 날아다니는 폴립: 형체가 드러나 바람 장막을 두르는 간격 */
export const WALL_GAP = 3;

/** 시간을 갉는 것: 삼킨 시간 · 빼앗긴 시간(플레이어) · 최대 · 하나당 공격 피해 · 태울 때 하나당 회복 */
export const EATEN = 'a4-eaten-time';
export const TIME_DEBT = 'a4-time-debt';
export const GNAW_MAX = 2;
export const GNAW_DMG = 3;
export const BURN_HEAL = 12;

/** 별자리를 잇는 자: 별의 실 · 한 번에 잇는 수 · 실이 끊길 때 비틀거림 */
export const THREAD = 'a4-star-thread';
export const THREAD_MAX = 2;
export const SNAP_POISE = 1;

/** c.s.vars 키 */
const V = {
  /** 내가 지난 턴을 마칠 때 두른 방어도 */
  endBlock: 'a4-endBlk',
  /** 낙인을 새긴 차례 / 새긴 사제 */
  brandT: 'a4-brandT',
  brandBy: 'a4-brandBy',
  /** 실을 따라 넘어간 글을 띄운 턴 */
  threadSaid: 'a4-thrSaid',
} as const;

// ───────────── 공용 ─────────────

const pct = (n: number) => Math.round(n * 100);

/** 내 쪽에서 온 피해 (내 공격·가시·반격·내가 건 지속 피해, 별의 실을 따라 넘어간 몫) */
export const fromPlayer = (c: Combat, d: Pick<DamageCtx, 'src' | 'tags'>): boolean =>
  d.src === c.p || (d.src === null && (d.tags.includes('dot') || d.tags.includes('a4-thread')));

/** 전투 안의 번호 (c.s.enemies는 늘기만 한다 — mem에는 숫자만 둔다) */
const idxOf = (c: Combat, e: EnemyUnit): number => c.s.enemies.indexOf(e) + 1;
const byIdx = (c: Combat, n: number | undefined): EnemyUnit | null => {
  const x = n ? c.s.enemies[n - 1] : undefined;
  return x && !x.dead ? x : null;
};

/** 내 턴에 일어난 일에 반응해 의도를 바로 바꾼다 (붕괴해 쉬는 중이면 그대로 — 쉬고 나서 다시 정한다) */
export function replan(c: Combat, e: EnemyUnit) {
  if (c.over || e.dead || e.broken === 2 || c.s.phase !== 'player') return;
  c.planIntent(e);
}

/** 내가 지난 턴을 마칠 때 두른 방어도 (방어도를 쌓는 상대를 읽는 적들) */
export const endBlock = (c: Combat): number => c.s.vars[V.endBlock] ?? 0;

/** 공격 의도인가 */
const attacking = (e: EnemyUnit): boolean => !!e.intent && (e.intent.kind === 'attack' || !!e.intent.extra?.includes('attack'));

/** 비틀거린다: 버팀 -n (0이 되면 붕괴) */
function stagger(c: Combat, e: EnemyUnit, n: number, text: string) {
  if (e.dead || e.broken !== 0 || e.maxPoise <= 0 || n <= 0) return;
  e.poise = Math.max(0, e.poise - n);
  if (e.poise === 0) c.breakEnemy(e);
  else c.emit({ t: 'text', uid: e.uid, text, tone: 'good' });
}

/** 후열에 있어도 근접이 닿게 한다 (이미 다른 까닭으로 닿는 적은 그대로 — 거둘 때 그쪽 표시를 지우지 않게) */
function reach(e: EnemyUnit, key: string) {
  if (e.mem.reachable) return;
  e.mem.reachable = 1;
  e.mem[key] = 1;
}
function unreach(e: EnemyUnit, key: string) {
  if (!e.mem[key]) return;
  delete e.mem[key];
  delete e.mem.reachable;
}

// ───────────── 별의 자손: 가라앉은 꿈 ─────────────

/** 내 쪽에서 피해를 받았다: 꿈이 얕아진다(내 턴마다 한 번). 체력이 절반 아래면 깨어난다 */
export function stirDream(c: Combat, e: EnemyUnit, d: DamageCtx) {
  if (d.tgt !== e || e.hp <= 0 || d.amount <= 0 || !fromPlayer(c, d)) return;
  e.mem.stirred = 1;
  if (e.mem.awake) return;
  if (hpPct(e) <= AWAKE_AT) {
    wake(c, e);
    return;
  }
  const n = e.st[DREAM] ?? 0;
  if (n <= 0 || e.mem.dreamT === c.s.turn) return;
  e.mem.dreamT = c.s.turn;
  setSt(c, e, DREAM, n - 1);
  c.emit({ t: 'text', uid: e.uid, text: '꿈이 얕아진다', tone: 'good' });
  if (e.intent?.move === 'flood') replan(c, e);
}

/** 상처가 별의 자손을 꿈에서 깨운다: 꿈이 흩어지고, 그 뒤로는 갈라진 촉수를 휘두른다 */
export function wake(c: Combat, e: EnemyUnit) {
  if (e.mem.awake) return;
  e.mem.awake = 1;
  setSt(c, e, DREAM, 0);
  c.emit({ t: 'text', uid: e.uid, text: '상처가 별의 자손을 꿈에서 깨운다', tone: 'eldritch' });
  if (e.intent?.move === 'flood') replan(c, e);
}

/** 자기 차례가 끝날 때: 그동안 맞지 않았으면 꿈이 깊어진다 (쉰 차례·범람한 차례는 빼고) */
export function deepenDream(c: Combat, e: EnemyUnit) {
  const stirred = !!e.mem.stirred;
  const skipped = !!e.mem.dreamSkip;
  delete e.mem.stirred;
  delete e.mem.dreamSkip;
  if (e.dead || e.mem.awake || stirred || skipped || last(e) === 'flood') return;
  const n = e.st[DREAM] ?? 0;
  if (n >= DREAM_MAX) return;
  setSt(c, e, DREAM, n + 1);
  c.emit({ t: 'text', uid: e.uid, text: n + 1 >= DREAM_MAX ? '꿈이 넘쳐흐르려 한다' : '꿈이 깊어진다', tone: 'eldritch' });
}

// ───────────── 무형의 피리꾼: 절정의 선율 · 장송곡 ─────────────

export const crescendoNeed = (e: EnemyUnit): number => Math.max(1, Math.round(e.maxHp * CRESCENDO_BREAK));

/** 선율이 고조된다: 다음 차례에 광기의 절정. 그동안 앞으로 떠올라 근접이 닿는다 */
export function startCrescendo(c: Combat, e: EnemyUnit) {
  e.mem.charge = 1;
  setSt(c, e, CRESCENDO, crescendoNeed(e));
  reach(e, 'crReach');
  c.emit({ t: 'text', uid: e.uid, text: '선율이 치솟으며 앞으로 떠오른다', tone: 'eldritch' });
}

export function endCrescendo(c: Combat, e: EnemyUnit) {
  if (!e.dead) setSt(c, e, CRESCENDO, 0);
  unreach(e, 'crReach');
}

/** 고조되는 동안 받은 피해(버팀에 깎이기 전, 지속 피해 포함)가 문턱을 넘으면 피리를 떨어뜨린다 */
export function shakeCrescendo(c: Combat, e: EnemyUnit, d: DamageCtx) {
  if (!e.mem.charge || d.tgt !== e || e.hp <= 0 || !fromPlayer(c, d)) return;
  const n = unguarded(d);
  if (n <= 0) return;
  const left = (e.st[CRESCENDO] ?? 0) - n;
  if (left > 0) {
    setSt(c, e, CRESCENDO, left);
    return;
  }
  delete e.mem.charge;
  endCrescendo(c, e);
  c.emit({ t: 'text', uid: e.uid, text: '피리를 떨어뜨렸다. 선율이 끊긴다', tone: 'good' });
  replan(c, e);
}

export function clearDirge(e: EnemyUnit) {
  delete e.mem.dirge;
  delete e.mem.dirgeDmg;
  delete e.mem.dirgeHits;
}

/** 동료가 쓰러졌다: 그 적이 하려던 공격을 장송곡으로 되풀이한다 (힘을 모은 일격은 빼고 — 그땐 정신 피해) */
function hearDeath(c: Combat, e: EnemyUnit, victim: EnemyUnit) {
  if (e.dead || e.broken === 2 || victim === e || victim.minion || victim.fled) return;
  const it = victim.intent;
  const copy = !!it && !!it.dmg && (it.kind === 'attack' || !!it.extra?.includes('attack')) && !it.charging && !victim.mem.charge && !it.disguise;
  e.mem.dirge = 1;
  e.mem.dirgeDmg = copy ? Math.min(DIRGE_CAP, it!.dmg!) : 0;
  e.mem.dirgeHits = copy ? Math.max(1, Math.min(DIRGE_HITS, it!.hits ?? 1)) : 0;
  c.emit({ t: 'text', uid: e.uid, text: '쓰러진 것을 위한 장송곡을 고른다', tone: 'eldritch' });
  replan(c, e);
}

// ───────────── 검은 새끼: 불을 두려워함 · 뿌리내림 ─────────────

/** 화염 공격에 겁을 먹는다: 하려던 공격(힘을 모은 일격 제외)을 멈추고 울부짖는다 (내 턴마다 한 번) */
export function panic(c: Combat, e: EnemyUnit, d: DamageCtx) {
  if (d.tgt !== e || d.src !== c.p || !d.attack || d.type !== 'fire' || d.amount <= 0 || e.hp <= 0) return;
  if (c.s.phase !== 'player' || e.broken === 2 || e.mem.charge || e.mem.panic || e.mem.panicT === c.s.turn || !attacking(e)) return;
  e.mem.panicT = c.s.turn;
  e.mem.panic = 1;
  c.emit({ t: 'text', uid: e.uid, text: '불길에 겁을 먹고 움츠러든다', tone: 'good' });
  replan(c, e);
}

/** 체력이 절반 아래로 떨어지면 뿌리를 내린다 (한 번) */
export function takeRoot(c: Combat, e: EnemyUnit) {
  if (e.mem.rooted || e.hp <= 0 || hpPct(e) > ROOT_AT) return;
  e.mem.rooted = 1;
  setSt(c, e, TAPROOT, 1);
  c.emit({ t: 'text', uid: e.uid, text: '검은 숲이 땅속 깊이 뿌리를 내린다', tone: 'eldritch' });
  if (e.intent?.move === 'rear') replan(c, e);
}

// ───────────── 시간의 파수꾼: 상처 되감기 · 예정된 상처 ─────────────

/** 내 턴에 한 적이 크게 다쳤다: 파수꾼이 그 상처를 되감으려 한다 (공용 규칙의 onDamageTaken) */
function noteWound(c: Combat, t: EnemyUnit, d: DamageCtx) {
  if (t.hp <= 0 || d.hpLoss <= 0 || c.s.phase !== 'player' || !fromPlayer(c, d)) return;
  const wardens = c.alive.filter((x) => x.def === WARDEN);
  if (!wardens.length) return;
  if (t.mem.woundT !== c.s.turn) {
    t.mem.woundT = c.s.turn;
    t.mem.wound = 0;
  }
  t.mem.wound = (t.mem.wound ?? 0) + d.hpLoss;
  const amount = Math.min(REWIND_CAP, t.mem.wound);
  const idx = idxOf(c, t);
  for (const w of wardens) {
    // 이미 이 적을 되감으려 하면 되돌릴 양만 늘어난다
    if (w.mem.rwIdx === idx) {
      setSt(c, t, REWIND_MARK, amount);
      continue;
    }
    if (t.mem.wound < t.maxHp * REWIND_PCT || w.mem.rwIdx || w.broken === 2) continue;
    if (c.s.turn - (w.mem.rwAt ?? -99) < REWIND_GAP) continue;
    w.mem.rwIdx = idx;
    setSt(c, t, REWIND_MARK, amount);
    c.emit({ t: 'text', uid: w.uid, text: `${t.name}의 상처를 되감으려 한다`, tone: 'eldritch' });
    replan(c, w);
  }
}

/** 되감을 적 (표시가 남아 있고 살아 있을 때) */
export function rewindTarget(c: Combat, w: EnemyUnit): EnemyUnit | null {
  const t = byIdx(c, w.mem.rwIdx);
  return t && (t.st[REWIND_MARK] ?? 0) > 0 ? t : null;
}

export function clearRewind(c: Combat, w: EnemyUnit, text?: string) {
  if (!w.mem.rwIdx) return;
  const t = byIdx(c, w.mem.rwIdx);
  delete w.mem.rwIdx;
  if (t) setSt(c, t, REWIND_MARK, 0);
  if (text && t) c.emit({ t: 'text', uid: t.uid, text, tone: 'good' });
}

/** 상처를 되감는다: 표시된 적이 그 턴에 잃은 체력을 되돌린다 */
export function rewindWound(c: Combat, w: EnemyUnit) {
  const t = rewindTarget(c, w);
  const n = t ? (t.st[REWIND_MARK] ?? 0) : 0;
  clearRewind(c, w);
  w.mem.rwAt = c.s.turn;
  if (!t || n <= 0) {
    c.emit({ t: 'text', uid: w.uid, text: '되감을 상처가 사라졌다', tone: 'info' });
    return;
  }
  c.heal(t, n);
  c.emit({ t: 'text', uid: t.uid, text: '상처가 생기기 전으로 되감긴다', tone: 'eldritch' });
}

const wardenOf = (c: Combat): EnemyUnit | undefined => c.alive.find((x) => x.def === WARDEN && x.broken !== 2);

/** 예정된 상처가 열릴 때의 피해 (살아 있는 파수꾼의 공격으로 — 힘·층·약화·취약을 따른다) */
export function futureDamage(c: Combat): number {
  const w = wardenOf(c);
  return w ? Math.max(1, c.preview(w, c.p, FUTURE_DMG, 'arcane')) : 0;
}

/** 미래에 상처를 새긴다: 다음 내 턴이 끝날 때 열린다 (결계가 막는다) */
export function carveFuture(c: Combat, w: EnemyUnit) {
  w.mem.fwAt = c.s.turn;
  if ((c.p.st[FUTURE] ?? 0) > 0 || c.over) return;
  const n = Math.max(1, c.preview(w, c.p, FUTURE_DMG, 'arcane'));
  if (c.apply(c.p, FUTURE, n, w) <= 0) return;
  c.emit({ t: 'text', uid: 'p', text: '다가올 순간에 상처가 새겨졌다', tone: 'eldritch' });
}

/** 상태 칸의 숫자를 지금 열릴 피해로 맞춘다 */
function refreshFuture(c: Combat) {
  const cur = c.p.st[FUTURE] ?? 0;
  if (cur <= 0) return;
  const n = futureDamage(c);
  if (n > 0 && n !== cur) setSt(c, c.p, FUTURE, n);
}

export function clearFuture(c: Combat, text?: string) {
  if (!((c.p.st[FUTURE] ?? 0) > 0)) return;
  setSt(c, c.p, FUTURE, 0);
  if (text) c.emit({ t: 'text', uid: 'p', text, tone: 'good' });
}

// ───────────── 미고 봉합사: 응급 봉합 · 상처 소독 ─────────────

/** 붕괴한 적을 미고 하나가 맡는다 (붕괴한 미고 자신은 맡지 못한다) */
function armStitch(c: Combat, victim: EnemyUnit) {
  if (victim.minion || victim.dead) return;
  const idx = idxOf(c, victim);
  if (c.alive.some((m) => m.def === MIGO && m.mem.stIdx === idx)) return;
  const m = c.alive.find((x) => x.def === MIGO && x !== victim && x.broken !== 2 && !x.mem.stIdx);
  if (!m) return;
  m.mem.stIdx = idx;
  setSt(c, victim, STITCH_MARK, 1);
  c.emit({ t: 'text', uid: m.uid, text: `${victim.name}${josa(victim.name, '을')} 꿰매려 한다`, tone: 'eldritch' });
  replan(c, m);
}

/**
 * 꿰맬 적: 미고의 차례에도 아직 붕괴해 쉬고 있을 적 (쉬는 차례가 둘 이상 남았거나, 미고가 먼저 움직인다).
 * 미고보다 먼저 움직여 마지막 쉬는 차례를 넘길 적은 꿰맬 까닭이 없다
 */
export function stitchTarget(c: Combat, m: EnemyUnit): EnemyUnit | null {
  const t = byIdx(c, m.mem.stIdx);
  if (!t || t.broken !== 2) return null;
  if ((t.mem.bk ?? 1) >= 2) return t;
  const order = [...c.row(0), ...c.row(1)];
  return order.indexOf(m) < order.indexOf(t) ? t : null;
}

export function clearStitch(c: Combat, m: EnemyUnit) {
  if (!m.mem.stIdx) return;
  const t = byIdx(c, m.mem.stIdx);
  delete m.mem.stIdx;
  if (t) setSt(c, t, STITCH_MARK, 0);
}

/** 응급 봉합: 붕괴해 쉬는 차례를 하나 줄인다 (마지막이었으면 회복 중으로 — 다음 차례엔 행동한다) */
export function stitchUp(c: Combat, m: EnemyUnit) {
  const t = byIdx(c, m.mem.stIdx);
  clearStitch(c, m);
  if (!t || t.broken !== 2) {
    c.emit({ t: 'text', uid: m.uid, text: '꿰맬 상처가 없다', tone: 'info' });
    return;
  }
  const left = (t.mem.bk ?? 1) - 1;
  if (left > 0) t.mem.bk = left;
  else {
    delete t.mem.bk;
    t.broken = 1;
  }
  c.emit({ t: 'text', uid: t.uid, text: '꿰매어진 채 몸을 일으킨다', tone: 'eldritch' });
}

const DOTS = ['bleed', 'poison', 'burn'];
export const dotLoad = (e: EnemyUnit): number => DOTS.reduce((s, id) => s + (e.st[id] ?? 0), 0);

/** 지속 피해가 가장 많이 쌓인 적 (min 이상) */
function mostAfflicted(c: Combat, min: number): EnemyUnit | null {
  let best: EnemyUnit | null = null;
  for (const x of c.alive) if (!x.minion && dotLoad(x) >= min && (!best || dotLoad(x) > dotLoad(best))) best = x;
  return best;
}

/** 씻어 낼 적이 있는가 (간격이 지났고 지속 피해가 DEBRIDE_MIN 이상 쌓인 동료) */
export function debrideTarget(c: Combat, m: EnemyUnit): EnemyUnit | null {
  if (c.s.turn - (m.mem.dbAt ?? -99) < DEBRIDE_GAP) return null;
  return mostAfflicted(c, DEBRIDE_MIN);
}

export function debride(c: Combat, m: EnemyUnit) {
  m.mem.dbAt = c.s.turn;
  const t = mostAfflicted(c, 1);
  if (!t) {
    c.emit({ t: 'text', uid: m.uid, text: '도려낼 상처가 없다', tone: 'info' });
    return;
  }
  for (const id of DOTS) c.clear(t, id);
  c.emit({ t: 'text', uid: t.uid, text: '상처를 도려내 씻어 냈다', tone: 'eldritch' });
}

// ───────────── 외신의 시종: 삼키기 · 피리에 맞춘 춤 ─────────────

const swallowedOf = (e: EnemyUnit): string[] => Object.keys(e.mem).filter((k) => k.startsWith('sw:'));

/** 내 강화 효과 중 가장 큰 것 하나를 삼킨다 */
export function swallow(c: Combat, e: EnemyUnit) {
  if (c.over || e.dead) return;
  let best: string | null = null;
  for (const id of SWALLOWABLE) {
    const n = c.p.st[id] ?? 0;
    if (n > 0 && (!best || n > (c.p.st[best] ?? 0))) best = id;
  }
  if (!best) return;
  const n = c.p.st[best];
  c.apply(c.p, best, -n);
  e.mem[`sw:${best}`] = (e.mem[`sw:${best}`] ?? 0) + n;
  setSt(c, e, SWALLOWED, swallowedOf(e).reduce((s, k) => s + e.mem[k], 0));
  const name = STATUSES.get(best)?.name ?? '강화';
  c.emit({ t: 'text', uid: e.uid, text: `「${name}」${josa(name, '을')} 삼켰다`, tone: 'bad' });
}

/** 삼킨 강화 효과를 토해 낸다 (붕괴·처치) */
export function regurgitate(c: Combat, e: EnemyUnit) {
  const keys = swallowedOf(e);
  if (!keys.length) return;
  for (const k of keys) {
    const n = e.mem[k];
    delete e.mem[k];
    if (!c.over && n > 0 && STATUSES.has(k.slice(3))) c.apply(c.p, k.slice(3), n, c.p);
  }
  if (!e.dead) setSt(c, e, SWALLOWED, 0);
  c.emit({ t: 'text', uid: 'p', text: '삼켰던 것을 토해 냈다', tone: 'good' });
}

/** 피리꾼이 쓰러졌다: 박자를 잃고 비틀거린다 */
function loseBeat(c: Combat, e: EnemyUnit) {
  stagger(c, e, BEAT_STAGGER, `박자를 잃고 비틀거린다 (버팀 -${BEAT_STAGGER})`);
  if (e.intent?.move === 'reel' && !c.alive.some((x) => x.def === PIPER)) replan(c, e);
}

// ───────────── 얼굴 없는 사제: 낙인 ─────────────

/** 낙인이 걸려 있는가 (다른 적들이 낙인을 노린다) */
export const branded = (c: Combat): boolean => (c.p.st[BRAND] ?? 0) > 0;
/** 낙인이 이번 적의 차례에 타오르는가 (새긴 차례에는 아직 — 그 차례의 피해는 미리 보인 그대로) */
export const brandLive = (c: Combat): boolean => branded(c) && c.s.turn > (c.s.vars[V.brandT] ?? 0);

export function applyBrand(c: Combat, e: EnemyUnit) {
  if (c.over || e.dead) return;
  if (!branded(c) && c.apply(c.p, BRAND, 1, e) <= 0) return;
  c.s.vars[V.brandT] = c.s.turn;
  c.s.vars[V.brandBy] = idxOf(c, e);
  c.emit({ t: 'text', uid: 'p', text: '얼굴 없는 낙인이 새겨졌다', tone: 'bad' });
}

/** 낙인을 새긴 사제가 무너지거나 쓰러지면 낙인이 흐려진다 */
function liftBrand(c: Combat, priest: EnemyUnit, text: string) {
  if (!branded(c) || c.s.vars[V.brandBy] !== idxOf(c, priest)) return;
  setSt(c, c.p, BRAND, 0);
  delete c.s.vars[V.brandT];
  delete c.s.vars[V.brandBy];
  c.emit({ t: 'text', uid: 'p', text, tone: 'good' });
}

// ───────────── 우주에서 온 색: 포만 · 물든 빛 ─────────────

/** 빨아들인 생기가 포만으로 쌓인다 */
export function feed(c: Combat, e: EnemyUnit, n: number) {
  if (e.dead || n <= 0) return;
  const cur = e.st[SATIETY] ?? 0;
  if (cur >= SATE) return;
  const next = Math.min(SATE, cur + n);
  setSt(c, e, SATIETY, next);
  if (next >= SATE) c.emit({ t: 'text', uid: e.uid, text: '빛이 생기로 가득 찼다', tone: 'eldritch' });
}

/** 물들일 동료: 아직 물들지 않은, 체력이 가장 많은 동료 (이 색이 물들인 동료가 살아 있으면 없음) */
export function tintTarget(c: Combat, e: EnemyUnit): EnemyUnit | null {
  const idx = idxOf(c, e);
  if (c.alive.some((x) => x.mem.tintBy === idx && (x.st[TINT] ?? 0) > 0)) return null;
  let best: EnemyUnit | null = null;
  for (const x of c.alive) {
    if (x === e || x.minion || x.def === COLOUR || (x.st[TINT] ?? 0) > 0) continue;
    if (!best || x.hp > best.hp) best = x;
  }
  return best;
}

export function tintAlly(c: Combat, e: EnemyUnit) {
  const t = tintTarget(c, e);
  if (!t) {
    c.emit({ t: 'text', uid: e.uid, text: '물들일 것이 없다', tone: 'info' });
    return;
  }
  t.mem.tintBy = idxOf(c, e);
  setSt(c, t, TINT, 1);
  c.emit({ t: 'text', uid: t.uid, text: '형언할 수 없는 색에 물들었다', tone: 'eldritch' });
}

/** 색이 무너지거나 쓰러지면 물든 빛이 바랜다 */
export function fadeTint(c: Combat, e: EnemyUnit) {
  const idx = idxOf(c, e);
  for (const t of c.s.enemies) {
    if (t.mem.tintBy !== idx) continue;
    delete t.mem.tintBy;
    if (t.dead) continue;
    setSt(c, t, TINT, 0);
    c.emit({ t: 'text', uid: t.uid, text: '물든 빛이 바랬다', tone: 'good' });
  }
}

// ───────────── 비야키: 내려앉음 ─────────────

export const landed = (e: EnemyUnit): boolean => (e.st[LANDED] ?? 0) > 0;

/** 전열에 내려앉는다 (후열에 있고 전열에 자리가 없으면 그대로 떠 있다) */
export function land(c: Combat, e: EnemyUnit, text: string): boolean {
  if (e.dead || landed(e)) return false;
  if (e.row === 1 && !c.moveRow(e, 0)) return false;
  setSt(c, e, LANDED, 1);
  c.emit({ t: 'text', uid: e.uid, text, tone: 'info' });
  return true;
}

/** 날아 있을 때 약점에 맞으면 날개가 꺾여 떨어진다 (자기 차례마다 한 번 — 내 턴에 한 번) */
export function knockDown(c: Combat, e: EnemyUnit, d: DamageCtx) {
  if (d.tgt !== e || !d.weakHit || d.src !== c.p || d.amount <= 0 || e.hp <= 0 || landed(e)) return;
  if (c.s.phase !== 'player' || e.mem.knockT === c.s.turn) return;
  e.mem.knockT = c.s.turn;
  if (!land(c, e, '날개가 꺾여 떨어졌다')) return;
  if ((e.st.evasive ?? 0) > 0) c.clear(e, 'evasive');
  replan(c, e);
}

/** 다시 날아오른다 (다른 적이 전열에 남아 있으면 후열로 — 혼자면 전열에서 그대로 날갯짓한다) */
export function takeOff(c: Combat, e: EnemyUnit) {
  if (!landed(e)) return;
  setSt(c, e, LANDED, 0);
  if (e.row === 0 && c.row(0).some((x) => x !== e) && c.row(1).length < MAX_ROW) c.moveRow(e, 1);
  c.emit({ t: 'text', uid: e.uid, text: '다시 날아오른다', tone: 'info' });
}

// ───────────── 차원 방랑자: 붙잡기 ─────────────

export const grabNeed = (e: EnemyUnit): number => Math.max(1, Math.round(e.maxHp * GRAB_BREAK));

/** 나를 붙잡는다 (결계가 막는다): 다음 차례에 저편으로 끌고 간다. 그동안 열을 옮기지 않고 근접이 닿는다 */
export function grabPlayer(c: Combat, e: EnemyUnit) {
  if (c.over || e.dead || (c.p.st[GRABBED] ?? 0) > 0) return;
  e.mem.grabAt = c.s.turn;
  if (c.apply(c.p, GRABBED, grabNeed(e), e) <= 0) return;
  e.mem.grab = 1;
  reach(e, 'grReach');
  c.emit({ t: 'text', uid: 'p', text: '차원 너머의 손에 붙잡혔다', tone: 'bad' });
}

export function releaseGrab(c: Combat, e: EnemyUnit, text?: string) {
  const held = !!e.mem.grab;
  delete e.mem.grab;
  unreach(e, 'grReach');
  if (!held) return;
  setSt(c, c.p, GRABBED, 0);
  if (text) c.emit({ t: 'text', uid: 'p', text, tone: 'good' });
}

/** 붙잡은 동안 받은 피해(버팀에 깎이기 전, 지속 피해 포함)가 문턱을 넘으면 풀려난다 */
export function shakeGrab(c: Combat, e: EnemyUnit, d: DamageCtx) {
  if (!e.mem.grab || d.tgt !== e || e.hp <= 0 || !fromPlayer(c, d)) return;
  const n = unguarded(d);
  if (n <= 0) return;
  const left = (c.p.st[GRABBED] ?? 0) - n;
  if (left > 0) {
    setSt(c, c.p, GRABBED, left);
    return;
  }
  releaseGrab(c, e, '붙잡은 손을 뿌리쳤다');
  replan(c, e);
}

// ───────────── 날아다니는 폴립: 드러난 형체 ─────────────

/** 약점에 맞아 형체가 드러나면 하려던 공격을 멈추고 바람을 두른다 (WALL_GAP턴에 한 번, 힘을 모으는 중이면 그대로) */
export function reveal(c: Combat, e: EnemyUnit, d: DamageCtx) {
  if (d.tgt !== e || !d.weakHit || d.src !== c.p || d.amount <= 0 || e.hp <= 0) return;
  if (c.s.phase !== 'player' || e.broken === 2 || e.mem.charge || e.mem.wall || !attacking(e)) return;
  if (c.s.turn - (e.mem.wallAt ?? -99) < WALL_GAP) return;
  e.mem.wallAt = c.s.turn;
  e.mem.wall = 1;
  c.emit({ t: 'text', uid: e.uid, text: '형체가 드러나자 바람 속으로 몸을 사린다', tone: 'good' });
  replan(c, e);
}

// ───────────── 시간을 갉는 것 ─────────────

/** 다음 내 턴의 행동력 1을 빼앗아 삼킨다 (결계가 막는다) */
export function gnawTime(c: Combat, e: EnemyUnit) {
  const n = e.st[EATEN] ?? 0;
  if (c.over || e.dead || n >= GNAW_MAX) return;
  if (c.apply(c.p, TIME_DEBT, 1, e) <= 0) return;
  setSt(c, e, EATEN, n + 1);
  c.emit({ t: 'text', uid: e.uid, text: '내 시간을 한 입 베어 물었다', tone: 'bad' });
}

/** 내가 행동력을 남기고 턴을 마치면 남은 시간을 핥아먹는다 (빼앗지는 않는다) */
function lickTime(c: Combat) {
  if (c.s.ap <= 0) return;
  for (const e of c.alive) {
    if (e.def !== GNAWER || e.broken === 2) continue;
    const n = e.st[EATEN] ?? 0;
    if (n >= GNAW_MAX) continue;
    setSt(c, e, EATEN, n + 1);
    c.emit({ t: 'text', uid: e.uid, text: '남겨 둔 시간을 핥아먹는다', tone: 'bad' });
  }
}

/** 삼킨 시간을 토해 낸다 (붕괴·처치): 다음 내 턴 행동력 +n */
export function spitTime(c: Combat, e: EnemyUnit) {
  const n = e.st[EATEN] ?? 0;
  if (n <= 0) return;
  if (!e.dead) setSt(c, e, EATEN, 0);
  else delete e.st[EATEN];
  if (c.over) return;
  c.apply(c.p, 'energized', n, c.p);
  c.emit({ t: 'text', uid: 'p', text: `삼킨 시간을 토해 냈다. 다음 내 턴 행동력 +${n}`, tone: 'good' });
}

/** 삼킨 시간을 태워 회복한다 (태운 시간은 돌아오지 않는다) */
export function burnTime(c: Combat, e: EnemyUnit) {
  const n = e.st[EATEN] ?? 0;
  e.mem.burned = 1;
  setSt(c, e, EATEN, 0);
  if (n <= 0) {
    c.emit({ t: 'text', uid: e.uid, text: '태울 시간이 없다', tone: 'info' });
    return;
  }
  c.heal(e, n * BURN_HEAL);
  c.emit({ t: 'text', uid: e.uid, text: '삼킨 시간을 태워 상처를 메운다', tone: 'eldritch' });
}

// ───────────── 별자리를 잇는 자: 별의 실 ─────────────

/** 이 직조자의 실에 이어진 살아 있는 적 */
export function threadsOf(c: Combat, w: EnemyUnit): EnemyUnit[] {
  const idx = idxOf(c, w);
  return c.alive.filter((x) => x !== w && x.mem.thr === idx && (x.st[THREAD] ?? 0) > 0);
}

/** 이을 수 있는 동료 (실이 없는, 하수인·직조자가 아닌 적) */
export function weaveCandidates(c: Combat, w: EnemyUnit): EnemyUnit[] {
  return c.alive.filter((x) => x !== w && !x.minion && x.def !== WEAVER && !((x.st[THREAD] ?? 0) > 0));
}

/** 가장 다친 동료(같으면 전열)를 별의 실로 잇는다 */
export function weave(c: Combat, w: EnemyUnit) {
  const pool = weaveCandidates(c, w);
  if (!pool.length || threadsOf(c, w).length >= THREAD_MAX) {
    c.emit({ t: 'text', uid: w.uid, text: '이을 별이 없다', tone: 'info' });
    return;
  }
  const t = pool.reduce((a, b) => (hpPct(b) < hpPct(a) || (hpPct(b) === hpPct(a) && b.row < a.row) ? b : a));
  t.mem.thr = idxOf(c, w);
  setSt(c, t, THREAD, 1);
  c.emit({ t: 'text', uid: t.uid, text: '별의 실이 이어졌다', tone: 'eldritch' });
}

/** 실이 끊긴다 (직조자가 무너지거나 쓰러짐): 이어진 적들이 비틀거린다 */
export function snapThreads(c: Combat, w: EnemyUnit) {
  const idx = idxOf(c, w);
  const tied = c.s.enemies.filter((t) => t.mem.thr === idx);
  for (const t of tied) {
    delete t.mem.thr;
    if (t.dead) continue;
    setSt(c, t, THREAD, 0);
  }
  const live = tied.filter((t) => !t.dead);
  if (!live.length) return;
  c.emit({ t: 'text', uid: w.uid, text: '별의 실이 끊어졌다', tone: 'good' });
  for (const t of live) stagger(c, t, SNAP_POISE, `실이 끊기며 비틀거린다 (버팀 -${SNAP_POISE})`);
}

type ThreadCtx = DamageCtx & { a4thread?: number };

// ───────────── 붕괴·처치에 반응 (공용 규칙이 나눠 준다) ─────────────

/** 이 적이 붕괴했다: 하던 일이 끊기거나 쥐고 있던 것을 내놓는다 */
function onBroken(c: Combat, e: EnemyUnit) {
  switch (e.def) {
    case SPAWN:
      if ((e.st[DREAM] ?? 0) > 0) {
        setSt(c, e, DREAM, 0);
        c.emit({ t: 'text', uid: e.uid, text: '가라앉은 꿈이 흩어졌다', tone: 'good' });
      }
      break;
    case PIPER:
      endCrescendo(c, e);
      clearDirge(e);
      break;
    case YOUNG:
      delete e.mem.panic;
      break;
    case WARDEN:
      clearRewind(c, e, '되감기가 흩어졌다');
      clearFuture(c, '예정된 상처가 흩어졌다');
      break;
    case MIGO:
      clearStitch(c, e);
      break;
    case SERVITOR:
      regurgitate(c, e);
      break;
    case PRIEST:
      liftBrand(c, e, '낙인이 흐려졌다');
      break;
    case COLOUR:
      fadeTint(c, e);
      break;
    case SHAMBLER:
      releaseGrab(c, e, '붕괴하자 붙잡은 손이 풀렸다');
      break;
    case POLYP:
      delete e.mem.wall;
      break;
    case GNAWER:
      spitTime(c, e);
      break;
    case WEAVER:
      snapThreads(c, e);
      break;
  }
  // 다른 적이 무너지면 미고 봉합사가 꿰매러 온다
  armStitch(c, e);
}

/** 이 적이 쓰러졌다: 쥐고 있던 것을 내놓고, 그 적을 노리던 의도를 거둔다 */
function onFallen(c: Combat, v: EnemyUnit) {
  const idx = idxOf(c, v);
  for (const x of c.alive) {
    if (x.def === WARDEN && x.mem.rwIdx === idx) {
      delete x.mem.rwIdx;
      replan(c, x);
    }
    if (x.def === MIGO && x.mem.stIdx === idx) {
      delete x.mem.stIdx;
      replan(c, x);
    }
    if (x.def === PIPER) hearDeath(c, x, v);
    if (x.def === SERVITOR && v.def === PIPER) loseBeat(c, x);
  }
  switch (v.def) {
    case WARDEN:
      clearRewind(c, v);
      if (!wardenOf(c)) clearFuture(c, '예정된 상처가 사라졌다');
      break;
    case MIGO:
      clearStitch(c, v);
      break;
    case SERVITOR:
      regurgitate(c, v);
      break;
    case PRIEST:
      liftBrand(c, v, '낙인이 사라졌다');
      break;
    case COLOUR:
      fadeTint(c, v);
      break;
    case SHAMBLER:
      releaseGrab(c, v, '붙잡은 손이 사라졌다');
      break;
    case GNAWER:
      spitTime(c, v);
      break;
    case WEAVER:
      snapThreads(c, v);
      break;
  }
}

const COURT = new Set([SPAWN, PIPER, YOUNG, WARDEN, MIGO, SERVITOR, PRIEST, COLOUR, BYAKHEE, SHAMBLER, POLYP, GNAWER, WEAVER]);

// ───────────── 상태 ─────────────

reg.statuses([
  {
    id: DREAM,
    name: '가라앉은 꿈',
    icon: 'gi:night-sleep',
    kind: 'buff',
    desc: `꿈이 {n}만큼 깊다. 내 턴 동안 피해를 받지 않으면 자기 차례가 끝날 때 1 깊어진다. ${DREAM_MAX}이 되면 「꿈의 범람」. 피해를 주면 1 얕아진다(내 턴마다 한 번). 붕괴하면 흩어진다`,
  },
  {
    id: CRESCENDO,
    name: '고조되는 선율',
    icon: 'gi:musical-score',
    kind: 'buff',
    desc: '다음 차례에 「광기의 절정」. 피해를 {n} 더 주거나 붕괴시키면 피리를 떨어뜨려 끊긴다. 지속 피해도 센다. 고조되는 동안 후열에 있어도 근접 공격이 닿는다',
  },
  {
    id: TAPROOT,
    name: '뿌리내림',
    icon: 'gi:plant-roots',
    kind: 'buff',
    desc: `검은 숲이 뿌리를 내렸다. 검은 수액이 두 배로 돈다(자기 차례 끝에 체력 ${ROOT_SAP} 회복). 더는 뒷발로 일어서지 않고 뿌리 가시와 포자를 뿌린다`,
  },
  {
    id: REWIND_MARK,
    name: '되감길 상처',
    icon: 'gi:backward-time',
    kind: 'buff',
    desc: '시간의 파수꾼이 이 상처를 되감으려 한다. 파수꾼의 차례에 체력 {n} 회복. 그 전에 이 적을 쓰러뜨리거나 파수꾼을 붕괴시키면 무산된다',
  },
  {
    id: FUTURE,
    name: '예정된 상처',
    icon: 'gi:time-bomb',
    kind: 'debuff',
    desc: '시간의 파수꾼이 다가올 순간에 새긴 상처. 내 턴이 끝날 때 피해 {n}. 방어도가 먼저 막는다. 파수꾼을 붕괴시키거나 쓰러뜨리면 사라진다',
    hooks: {
      onTurnEnd(c, s) {
        if (s.unit !== c.p) return;
        const w = wardenOf(c);
        setSt(c, c.p, FUTURE, 0);
        if (!w) return;
        c.emit({ t: 'text', uid: 'p', text: '새겨 둔 상처가 지금 열린다', tone: 'bad' });
        c.damage({ src: w, tgt: c.p, base: FUTURE_DMG, type: 'arcane', attack: true, tags: ['a4-future'] });
      },
      afterSkill(c, s) {
        if (s.unit === c.p) refreshFuture(c);
      },
    },
    tickStart(c, u) {
      if (isEnemy(u)) setSt(c, u, FUTURE, 0);
    },
  },
  {
    id: STITCH_MARK,
    name: '봉합 대기',
    icon: 'gi:stitched-wound',
    kind: 'buff',
    desc: '미고 봉합사가 꿰매어 한 차례 일찍 일으키려 한다. 그 전에 봉합사를 붕괴시키거나 쓰러뜨리면 무산된다',
  },
  {
    id: SWALLOWED,
    name: '삼킨 강화',
    icon: 'gi:swallower',
    kind: 'buff',
    desc: '내게서 삼킨 강화 효과 {n}. 붕괴시키거나 쓰러뜨리면 토해 내 돌려준다',
  },
  {
    id: BRAND,
    name: '얼굴 없는 낙인',
    icon: 'gi:stigmata',
    kind: 'debuff',
    desc: `다음 적의 차례에 받는 공격 피해 +${pct(BRAND_MULT - 1)}%. 다른 적들이 낙인을 노려 공격한다. 낙인을 새긴 사제를 붕괴시키거나 쓰러뜨리면 사라진다`,
    hooks: {
      modDamageIn(c, s, d) {
        if (s.unit === c.p && d.tgt === c.p && d.attack && isEnemy(d.src) && brandLive(c)) d.mult *= BRAND_MULT;
      },
    },
    // 새긴 다음 적의 차례가 지나 내 턴이 시작되면 사라진다
    tickStart(c, u) {
      if (isEnemy(u) || c.s.turn > (c.s.vars[V.brandT] ?? 0) + 1) {
        setSt(c, u, BRAND, 0);
        if (!isEnemy(u)) {
          delete c.s.vars[V.brandT];
          delete c.s.vars[V.brandBy];
        }
      }
    },
  },
  {
    id: SATIETY,
    name: '포만',
    icon: 'gi:stomach',
    kind: 'buff',
    desc: `빨아들인 생기 {n}/${SATE}. 가득 차면 빛이 부풀어 올라 「색의 개화」를 일으킨다. 방어도로 막은 피해는 빨아들이지 못한다`,
  },
  {
    id: TINT,
    name: '물든 빛',
    icon: 'gi:prism',
    kind: 'buff',
    desc: '우주에서 온 색에 물들었다. 공격으로 준 체력 피해의 절반만큼 회복한다. 색을 붕괴시키거나 쓰러뜨리면 빛이 바랜다',
    hooks: {
      onDamageDealt(c, s, d) {
        const e = s.unit;
        if (isEnemy(e) && !e.dead && d.src === e && d.tgt === c.p && d.attack && d.hpLoss > 0) c.heal(e, Math.ceil(d.hpLoss / 2));
      },
    },
  },
  {
    id: LANDED,
    name: '내려앉음',
    icon: 'gi:feathered-wing',
    kind: 'debuff',
    desc: '땅에 내려앉았다. 날개로 근접 공격을 흘리지 못한다. 곧 다시 날아오른다',
  },
  {
    id: GRABBED,
    name: '붙잡힘',
    icon: 'gi:grab',
    kind: 'debuff',
    desc: '차원 방랑자가 저편으로 끌고 가려 한다. 방랑자에게 피해를 {n} 더 주거나 붕괴시키면 풀려난다. 지속 피해도 센다. 붙잡은 동안 방랑자는 열을 옮기지 않고 근접 공격이 닿는다',
    tickStart(c, u) {
      if (isEnemy(u)) setSt(c, u, GRABBED, 0);
    },
  },
  {
    id: EATEN,
    name: '삼킨 시간',
    icon: 'gi:empty-hourglass',
    kind: 'buff',
    desc: `빼앗아 삼킨 시간 {n}. 하나마다 공격 피해 +${GNAW_DMG}. 붕괴시키거나 쓰러뜨리면 토해 낸다: 다음 내 턴 행동력 +{n}`,
  },
  {
    id: TIME_DEBT,
    name: '빼앗긴 시간',
    icon: 'gi:time-trap',
    kind: 'debuff',
    desc: '다음 내 턴 행동력 -{n} (1 아래로는 줄지 않는다)',
    tickStart(c, u, n) {
      setSt(c, u, TIME_DEBT, 0);
      if (isEnemy(u)) return;
      c.s.ap = Math.max(1, c.s.ap - n);
      c.emit({ t: 'text', uid: 'p', text: `빼앗긴 시간 (행동력 -${n})`, tone: 'bad' });
    },
  },
  {
    id: THREAD,
    name: '별의 실',
    icon: 'gi:sewing-string',
    kind: 'buff',
    desc: `별자리를 잇는 자와 이어졌다. 내 쪽에서 받는 피해의 절반이 실을 따라 그것에게 넘어간다. 그것을 붕괴시키거나 쓰러뜨리면 실이 끊기며 비틀거린다(버팀 -${SNAP_POISE})`,
    hooks: {
      // 미리보기에서도 같은 숫자를 보인다 — 상태는 바꾸지 않고 넘길 몫만 피해 계산에 적어 둔다
      modDamageFinal(c, s, d) {
        const t = s.unit;
        if (!isEnemy(t) || d.tgt !== t || d.amount <= 0 || !fromPlayer(c, d)) return;
        const w = byIdx(c, t.mem.thr);
        if (!w || w === t || w.broken === 2) return;
        const give = Math.floor(d.amount / 2);
        if (give <= 0) return;
        d.amount -= give;
        (d as ThreadCtx).a4thread = give;
      },
      onDamageTaken(c, s, d) {
        const give = (d as ThreadCtx).a4thread ?? 0;
        const t = s.unit;
        if (give <= 0 || !isEnemy(t) || d.tgt !== t) return;
        const w = byIdx(c, t.mem.thr);
        if (!w) return;
        if (c.s.vars[V.threadSaid] !== c.s.turn) {
          c.s.vars[V.threadSaid] = c.s.turn;
          c.emit({ t: 'text', uid: w.uid, text: '상처가 별의 실을 따라 넘어온다', tone: 'eldritch' });
        }
        // 넘어간 몫은 버팀에 다시 깎이지 않는다 (같은 피해를 두 번 깎지 않게). 쓰러뜨리면 내 처치다
        c.damage({ src: null, tgt: w, base: give, type: 'true', tags: ['a4-thread'] });
      },
    },
  },
]);

// ───────────── 공용 규칙: 플레이어 쪽에서 일어나는 일을 4층 일반 적에게 나눠 준다 ─────────────

reg.rules([
  {
    id: 'a4-court',
    hooks: {
      onTurnStart(c, s) {
        if (s.unit === c.p) refreshFuture(c);
      },
      onTurnEnd(c, s) {
        if (s.unit !== c.p || !c.alive.some((x) => COURT.has(x.def))) return;
        c.s.vars[V.endBlock] = c.p.block;
        lickTime(c);
      },
      onDamageTaken(c, s, d) {
        if (isEnemy(s.unit) && d.tgt === s.unit) noteWound(c, s.unit, d);
      },
      onBreak(c, _s, victim) {
        if (ENEMIES.has(victim.def)) onBroken(c, victim);
      },
      onAnyDeath(c, _s, victim) {
        if (isEnemy(victim)) onFallen(c, victim);
      },
    },
  },
]);
