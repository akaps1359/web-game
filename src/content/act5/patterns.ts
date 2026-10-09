import { josa } from '../../engine/josa';
import { reg, SKILLS } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import type { DmgType, EnemyUnit, Unit } from '../../engine/types';
import { cine } from '../lib';
import { chipPoise, isIllusion, setIntent, setSt, uidNum, vanish } from './dream';

/**
 * 5층(꿈꾸는 우주) 일반 적 패턴 (2026-10 확장): 깊은 층에서는 일반 적도 상황을 보고 다르게 움직인다.
 * 적의 특성 훅은 플레이어의 턴·기술을 볼 수 없어서, 플레이어 쪽에서 일어나는 규칙은 플레이어에게 거는 상태로 짰다
 * (머리 위의 발·다가오는 별빛은 보이는 상태, 꿈실·악몽 냄새는 숨은 상태). 의도는 바뀌는 즉시 보이게 고친다 (setIntent).
 *  - 주그: 하나가 신호를 보내면 나머지가 다음 차례에 일제히 덤빈다. 신호를 보낸 주그를 쓰러뜨리거나 붕괴시키면 머뭇거린다.
 *          체력이 줄면 갉아먹은 등불을 물고 달아난다 (등불도 보상도 없다).
 *  - 구그: 거대한 발을 들어 올린다 → 내리찍기. 방어도로 받아 내면 피해 절반·버팀 -3. 화염에 움찔해 얼굴을 가리고 다음 차례에 성낸다.
 *  - 몽유병자: 비전·공허 피해로는 깨지 않는다. 하품(졸음). 체력이 줄면 다시 잠들어 상처를 아물린다.
 *  - 달짐승: 「붙잡아라!」 노예가 곧바로 붙잡는다 (취약). 출혈이 깊은 상대의 상처를 비튼다.
 *  - 별을 삼킨 것: 삼킨 별이 달아오른다 (빨아들인 방어도·삼킨 아기 별로 더). 다 차면 나에게 게워 내고, 그 전에 붕괴시키면 동료들에게.
 *  - 성운 해파리: 붕괴시키면 잉태가 흩어진다. 갓 태어난 별에게 빛을 먹인다. 체력이 절반 아래면 서둘러 낳는다.
 *  - 별빛 순례자: 아무도 막지 않으면 두 걸음씩 걷는다. 앞줄에서는 길이 막혀 지팡이를 든다. 요람이 가까우면 노래가 바뀐다.
 *  - 장막 직조자: 마지막으로 쓴 두 기술의 꿈실을 엉킨다. 짠 환영을 깨뜨리면 비틀거린다. 앞줄로 끌려 나오면 제 환영 사이로 숨는다.
 *  - 새 일반 적 꺼진 별: 쏘아 보낸 빛은 내 턴이 두 번 끝날 때 닿는다. 쓰러뜨려도 멈추지 않고, 붕괴시키면 흩어지고, 다 막아 내면 흔들린다.
 *  - 새 일반 적 악몽 먹는 맥: 적들에게 걸린 해로운 상태를 먹어 치운다 (쌓이면 냄새를 맡고 공격을 멈춘다). 배가 차면 게워 낸다.
 * 깊은 층의 장치(변이·가호)와 겹치지 않게 매 턴 강해지기·가시·재생 같은 것은 쓰지 않았고, 다른 층의 기믹(흉내·기술 개수 세기·
 * 약점 가면·열 오가기)도 피했다. 수치는 상수로 두어 설명 문구도 같은 상수를 쓴다.
 */

/** 이 이상의 재사용 대기는 이미 잠긴 기술 (표본 채집·쥐기 반사·기억 포식·전투당 1회 기술) */
const LOCKED = 90;

// ───────────── 주그 ─────────────

/** 신호를 받은 주그 (다음 차례에 일제히 덤빈다) */
export const RALLIED = 'a5-rallied';
/** 신호를 보낸 우두머리 */
export const SIGNAL = 'a5-signal';
export const POUNCE_DMG = 5;
export const POUNCE_HITS = 3;
/** 체력이 이 비율 아래이고 갉아먹은 등불을 이만큼 품고 있으면 달아난다 */
export const ZOOG_FLEE_AT = 0.4;
export const ZOOG_FLEE_LIGHT = 6;

// ───────────── 구그 ─────────────

/** 들어 올린 발 (n = 받아 내는 데 필요한 방어도) */
export const UNDERFOOT = 'a5-underfoot';
export const CRUSH_DMG = 30;
export const BRACE_BLOCK = 15;
export const BRACE_POISE = 3;
export const COVER_BLOCK = 18;
export const FURY_DMG = 8;
export const FURY_HITS = 4;

// ───────────── 몽유병자 ─────────────

/** 이 속성의 피해로는 깨지 않는다 (꿈속의 일인 줄 안다) */
export const DREAMY_TYPES: DmgType[] = ['arcane', 'void'];
/** 체력이 이 비율 아래로 떨어지면 한 번 다시 잠든다 / 잠든 차례 수 / 잠든 차례마다 회복 (최대 체력 비율) */
export const RELAPSE_AT = 0.4;
export const RELAPSE_TURNS = 2;
export const RELAPSE_HEAL = 0.1;

// ───────────── 달짐승 ─────────────

export const HOLD_VULN = 1;
/** 내 출혈이 이 이상이면 상처를 비튼다 (출혈 1마다 피해 +TWIST_PER, TWIST_CAP까지) */
export const TWIST_AT = 3;
export const TWIST_BASE = 8;
export const TWIST_PER = 2;
export const TWIST_CAP = 8;

// ───────────── 별을 삼킨 것 ─────────────

export const HEAT = 'a5-star-heat';
export const HEAT_MAX = 3;
export const RETCH_DMG = 26;
export const RETCH_BURN = 3;
export const DEVOUR_HEAL = 20;
export const DEVOUR_HEAT = 2;
/** 내가 이만큼 방어도를 쌓고 턴을 마치는 걸 보면 빛을 더 자주 빨아들인다 */
export const BLOCKER_SEEN = 12;

// ───────────── 성운 해파리 ─────────────

/** 빛을 받아먹은 갓 태어난 별 (n = 더해진 피해) */
export const FED = 'a5-fed';
export const FEED_DMG = 8;
/** 갓 태어난 별이 터뜨리는 첫 빛 */
export const STAR_FLARE = 22;
/** 체력이 이 비율 아래면 서둘러 낳는다 (잉태가 차례마다 2씩 줄어든다) */
export const HURRY_AT = 0.5;

// ───────────── 별빛 순례자 ─────────────

/** 요람까지 이만큼 남으면 노래가 바뀐다 (「요람의 노래」: 다른 모든 적 보호막) */
export const NEAR_CRADLE = 2;
export const HYMN_BARRIER = 10;

// ───────────── 장막 직조자 ─────────────

/** 마지막으로 쓴 두 기술을 지켜보는 숨은 상태 (c.s.vars.a5T1 = 마지막, a5T2 = 그 앞 — 칸 번호 + 1) */
export const THREADS = 'a5-threads';

// ───────────── 꺼진 별 ─────────────

export const DEAD_STAR = 'dead-star';
/** 다음 내 턴이 끝날 때 닿는 빛 / 이번 내 턴이 끝날 때 닿는 빛 (n = 피해) */
export const LIGHT_FAR = 'a5-light-far';
export const LIGHT_NEAR = 'a5-light-near';
export const BEAM_DMG = 14;
export const LAST_BEAM_DMG = 26;
/** 닿은 빛을 방어도로 모두 막아 내면 별의 버팀이 이만큼 깎인다 */
export const LIGHT_STAGGER = 2;
/** 체력이 이 비율 아래로 떨어지면 마지막 빛을 쏘아 보낸다 (전투마다 한 번) */
export const LAST_LIGHT_AT = 0.5;

// ───────────── 악몽 먹는 맥 ─────────────

export const BAKU = 'baku';
export const GORGED = 'a5-gorged';
/** 내가 적에게 거는 해로운 상태를 지켜보는 숨은 상태 */
export const SCENT = 'a5-scent';
/** 맥이 먹는 악몽 (적에게 걸린 해로운 상태) */
export const NIGHTMARES = ['bleed', 'poison', 'burn', 'mark', 'weak', 'vuln', 'corrode', 'doom'];
const NIGHTMARE_NAMES = '출혈·독·화상·인장·약화·취약·부식·파멸';
/** 먹은 악몽 한 겹마다 회복 (최대) */
export const EAT_HEAL = 2;
export const EAT_HEAL_MAX = 20;
export const GORGE_MAX = 3;
/** 적들에게 걸린 악몽이 이만큼 쌓이면 냄새를 맡고 공격을 멈춘 채 먹으러 간다 */
export const SCENT_AT = 5;
export const BAKU_RETCH_SAN = 16;
export const BAKU_RETCH_DREAD = 2;

// ───────────── 상태 ─────────────

reg.statuses([
  {
    id: RALLIED,
    name: '덤빌 채비',
    icon: 'gi:distress-signal',
    kind: 'buff',
    desc: '우두머리 주그의 신호를 받았다. 다음 차례에 일제히 달려들어 문다. 신호를 보낸 주그를 쓰러뜨리거나 붕괴시키면 머뭇거린다',
  },
  {
    id: SIGNAL,
    name: '떼의 우두머리',
    icon: 'gi:aerial-signal',
    kind: 'buff',
    desc: '떼에게 신호를 보냈다. 이 주그를 쓰러뜨리거나 붕괴시키면 덤비려던 주그들이 머뭇거린다',
  },
  {
    id: UNDERFOOT,
    name: '머리 위의 발',
    icon: 'gi:boot-stomp',
    kind: 'debuff',
    desc: `구그가 거대한 발을 들어 올렸다. 내 턴을 방어도 {n} 이상으로 마치면 받아 낸다: 내리찍기 피해 절반, 구그 버팀 -${BRACE_POISE}`,
    hooks: {
      onTurnEnd(c, s) {
        if (s.unit === c.p) braceUnderfoot(c, s.n);
      },
    },
  },
  {
    id: HEAT,
    name: '달아오르는 별',
    icon: 'gi:sun',
    kind: 'buff',
    desc: `삼킨 별이 달아오른다 ({n}/${HEAT_MAX}). 자기 차례가 끝날 때마다 +1, 방어도를 빨아들이거나 갓 태어난 별을 삼키면 더 오른다. 다 차면 다음 차례에 삼킨 별을 나에게 게워 낸다. 그 전에 붕괴시키면 동료들에게 토해 낸다`,
  },
  {
    id: FED,
    name: '부푼 빛',
    icon: 'gi:star-swirl',
    kind: 'buff',
    desc: '성운의 빛을 받아먹었다. 터뜨릴 빛의 피해 +{n}',
  },
  {
    id: THREADS,
    name: '꿈실',
    icon: 'gi:yarn',
    kind: 'buff',
    hidden: true,
    desc: '장막 직조자가 손끝의 꿈실을 지켜본다 (마지막으로 쓴 두 기술)',
    tickStart(c, u) {
      if (isEnemy(u)) return;
      delete c.s.vars.a5T1;
      delete c.s.vars.a5T2;
    },
    hooks: {
      afterSkill(c, s, u) {
        // 기본 공격·방어는 엉키지 않는다 (메아리는 같은 기술)
        if (s.unit !== c.p || u.echo || u.basic) return;
        const i = c.run.slots.indexOf(u.owned.uid);
        if (i < 0) return;
        c.s.vars.a5T2 = c.s.vars.a5T1 ?? 0;
        c.s.vars.a5T1 = i + 1;
      },
    },
  },
  {
    id: LIGHT_FAR,
    name: '다가오는 별빛',
    icon: 'gi:comet-spark',
    kind: 'debuff',
    desc: '꺼진 별이 쏘아 보낸 빛 (피해 {n}). 다음 내 턴이 끝날 때 닿는다. 방어도가 먼저 막는다. 별을 쓰러뜨려도 이미 떠난 빛은 멈추지 않는다. 꺼진 별을 붕괴시키면 흩어진다',
    tickEnd(c, u, n) {
      if (isEnemy(u)) {
        delete u.st[LIGHT_FAR];
        return;
      }
      // 이번 턴에 닿는 빛이 있으면 그쪽이 옮겨 준다 (LIGHT_NEAR.tickEnd)
      if ((u.st[LIGHT_NEAR] ?? 0) > 0) return;
      setSt(c, u, LIGHT_NEAR, n);
      setSt(c, u, LIGHT_FAR, 0);
    },
  },
  {
    id: LIGHT_NEAR,
    name: '닿는 별빛',
    icon: 'gi:sunbeams',
    kind: 'debuff',
    desc: `이번 내 턴이 끝날 때 닿는 빛 (피해 {n}). 방어도가 먼저 막는다. 방어도로 모두 막아 내면 꺼진 별이 흔들린다 (버팀 -${LIGHT_STAGGER}). 꺼진 별을 붕괴시키면 흩어진다`,
    tickEnd(c, u, n) {
      if (isEnemy(u)) {
        delete u.st[LIGHT_NEAR];
        return;
      }
      landLight(c, n);
    },
  },
  {
    id: GORGED,
    name: '배부름',
    icon: 'gi:stomach',
    kind: 'buff',
    desc: `먹은 악몽이 배 속에 쌓였다 ({n}/${GORGE_MAX}). 다 차면 다음 차례에 나에게 게워 낸다. 붕괴시키면 흩어진다`,
  },
  {
    id: SCENT,
    name: '악몽 냄새',
    icon: 'gi:tapir',
    kind: 'buff',
    hidden: true,
    desc: '악몽 먹는 맥이 내가 거는 해로운 상태의 냄새를 맡는다',
    hooks: {
      onApplied(c, s, target, id) {
        if (s.unit === c.p) smellNightmares(c, target, id);
      },
    },
  },
]);

// ───────────── 특성 (새로 생긴 것 — 원래 있던 특성의 확장은 enemies.ts) ─────────────

reg.traits([
  {
    id: 'a5-zoog-pack',
    name: '파닥이는 떼',
    desc: `하나가 신호를 보내면 다른 주그들이 다음 차례에 일제히 덤빈다. 신호를 보낸 주그를 쓰러뜨리거나 붕괴시키면 머뭇거린다. 체력이 ${Math.round(ZOOG_FLEE_AT * 100)}% 아래로 떨어지면 갉아먹은 등불을 물고 달아난다 (달아나면 등불도 보상도 없다)`,
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        cancelRally(c, e, '우두머리가 쓰러져 떼가 머뭇거린다');
        // 덤빌 채비를 하던 주그가 쓰러졌다: 남은 채비가 없으면 우두머리 표시를 거둔다
        tidyRally(c);
      },
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || !d.broke || isIllusion(e)) return;
        if (e.mem.leader) cancelRally(c, e, '우두머리가 무너져 떼가 머뭇거린다');
        // 덤빌 채비를 하던 주그가 무너지면 채비도 끝난다
        if ((e.st[RALLIED] ?? 0) > 0) {
          setSt(c, e, RALLIED, 0);
          delete e.mem.rallyBy;
          tidyRally(c);
        }
      },
    },
  },
  {
    id: 'a5-gug-glare',
    name: '불빛을 꺼리는 거인',
    desc: `내 턴에 화염 공격을 받으면 하려던 평범한 공격을 멈추고 앞발로 얼굴을 가린다 (방어도 ${COVER_BLOCK}). 대신 다음 차례엔 성이 나 네 앞발을 모두 휘두른다. 거대한 발을 들어 올렸을 때 내 턴을 방어도 ${BRACE_BLOCK} 이상으로 마치면 받아 낸다 (내리찍기 피해 절반, 버팀 -${BRACE_POISE})`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.hp <= 0 || isIllusion(e) || d.tgt !== e || d.src !== c.p || !d.attack || d.type !== 'fire') return;
        if (c.s.phase !== 'player' || e.broken > 0 || (e.st.stun ?? 0) > 0) return;
        const m = e.intent?.move;
        if (m !== 'paws' && m !== 'stomp') return;
        setIntent(c, e, 'cover');
        c.emit({ t: 'text', uid: e.uid, text: '불빛에 움찔해 앞발로 얼굴을 가린다', tone: 'good' });
      },
    },
  },
  {
    id: 'a5-slaver',
    name: '노예 부리기',
    desc: `「붙잡아라!」를 외치면 렝의 노예가 곧바로 달려들어 나를 붙잡는다 (취약 ${HOLD_VULN}). 노예를 쓰러뜨리면 명령도 끝난다. 내 출혈이 ${TWIST_AT} 이상이면 상처를 비튼다 (출혈 1마다 피해 +${TWIST_PER})`,
    hooks: {},
  },
  {
    id: 'a5-weaver',
    name: '꿈실 직조',
    desc: '「꿈실 엉키기」는 그 턴에 내가 마지막으로 쓴 두 기술(기본 공격·방어 제외)의 재사용 대기를 둘 중 더 긴 쪽에 맞춘다. 직조자가 짠 환영을 깨뜨리면 실이 끊어져 직조자가 비틀거린다 (버팀 -1). 앞줄로 끌려 나오면 제 환영 둘을 짜 그 사이로 숨는다',
    hooks: {},
  },
  {
    id: 'a5-late-light',
    name: '늦게 닿는 빛',
    desc: `쏘아 보낸 빛은 내 턴이 두 번 끝날 때 닿는다 (방어도가 먼저 막는다). 별을 쓰러뜨려도 이미 떠난 빛은 멈추지 않는다. 붕괴시키면 오는 중인 빛이 모두 흩어진다. 닿은 빛을 방어도로 모두 막아 내면 흔들린다 (버팀 -${LIGHT_STAGGER}). 체력이 절반 아래로 떨어지면 마지막 빛을 한꺼번에 쏘아 보낸다`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || !d.broke || isIllusion(e)) return;
        scatterLight(c, '꺼진 별이 무너지자 오던 빛이 흩어졌다');
      },
    },
  },
  {
    id: 'a5-nightmare-eater',
    name: '악몽을 먹는 짐승',
    desc: `적들에게 걸린 악몽(${NIGHTMARE_NAMES})을 먹어 치우고 상처를 아물린다. 내가 건 악몽이 적들에게 ${SCENT_AT}겹 이상 쌓이면 냄새를 맡고 하려던 공격을 멈춘 채 먹으러 간다. 먹은 악몽은 배 속에 쌓여 ${GORGE_MAX}이 차면 다음 차례에 나에게 게워 낸다. 붕괴시키면 배 속의 악몽이 흩어진다`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || !d.broke || !((e.st[GORGED] ?? 0) > 0)) return;
        setSt(c, e, GORGED, 0);
        c.emit({ t: 'text', uid: e.uid, text: '무너지며 배 속의 악몽이 흩어졌다', tone: 'good' });
      },
    },
  },
]);

// ───────────── 주그 ─────────────

/** 떼에게 신호를 보낸다: 다른 주그들이 다음 차례에 일제히 덤빈다 */
export function zoogSignal(c: Combat, e: EnemyUnit) {
  if (isIllusion(e)) return;
  const kin = c.alive.filter((x) => x !== e && x.def === 'zoog' && !isIllusion(x) && x.broken !== 2);
  if (!kin.length) {
    c.emit({ t: 'text', uid: e.uid, text: '파닥여도 답하는 동료가 없다', tone: 'info' });
    return;
  }
  e.mem.leader = 1;
  setSt(c, e, SIGNAL, 1);
  for (const k of kin) {
    k.mem.rallyBy = uidNum(e);
    setSt(c, k, RALLIED, 1);
  }
  c.emit({ t: 'text', uid: e.uid, text: '파닥파닥, 떼에게 신호를 보낸다', tone: 'bad' });
}

/** 신호를 보낸 주그가 쓰러지거나 무너지거나 달아나면, 덤비려던 주그들이 머뭇거린다 (의도가 바로 바뀐다) */
export function cancelRally(c: Combat, leader: EnemyUnit, text: string) {
  if (!leader.mem.leader) return;
  leader.mem.leader = 0;
  if (!leader.dead) setSt(c, leader, SIGNAL, 0);
  let n = 0;
  for (const z of c.alive) {
    if (z === leader || !((z.st[RALLIED] ?? 0) > 0) || z.mem.rallyBy !== uidNum(leader)) continue;
    setSt(c, z, RALLIED, 0);
    delete z.mem.rallyBy;
    if (z.broken !== 2 && z.intent?.move === 'pounce') setIntent(c, z, 'scatter');
    n++;
  }
  if (n) c.emit({ t: 'text', uid: leader.uid, text, tone: 'good' });
}

/** 덤빌 채비를 한 주그가 하나도 남지 않은 우두머리는 표시를 거둔다 */
export function tidyRally(c: Combat) {
  for (const z of c.alive) {
    if (!z.mem.leader) continue;
    if (c.alive.some((x) => (x.st[RALLIED] ?? 0) > 0 && x.mem.rallyBy === uidNum(z))) continue;
    z.mem.leader = 0;
    setSt(c, z, SIGNAL, 0);
  }
}

/** 겁에 질린 도둑: 갉아먹은 등불을 물고 달아난다 (등불도 보상도 없다) */
export function zoogFlee(c: Combat, e: EnemyUnit) {
  if (isIllusion(e)) return;
  cancelRally(c, e, '우두머리가 달아나 떼가 머뭇거린다');
  const n = e.mem.light ?? 0;
  e.mem.light = 0;
  vanish(c, e, n > 0 ? `등불 ${n}${josa(n, '을')} 물고 어둠 속으로 달아났다` : '어둠 속으로 달아났다');
}

// ───────────── 구그 ─────────────

/** 내 턴이 끝날 때: 방어도가 넉넉하면 들어 올린 발을 받아 낸다 (구그 버팀 -BRACE_POISE, 내리찍기 피해 절반) */
function braceUnderfoot(c: Combat, need: number) {
  const gugs = c.alive.filter((g) => g.def === 'gug' && !isIllusion(g) && g.mem.lifted && g.mem.charge && !g.mem.braced);
  if (!gugs.length) {
    // 붕괴로 끊긴 발 (들어 올린 구그가 없다)
    setSt(c, c.p, UNDERFOOT, 0);
    return;
  }
  if (c.p.block < need) return;
  setSt(c, c.p, UNDERFOOT, 0);
  for (const g of gugs) {
    g.mem.braced = 1;
    if (chipPoise(c, g, BRACE_POISE, '받아 낼 채비에 중심이 흔들린다')) continue;
    setIntent(c, g, 'crush');
    c.emit({ t: 'text', uid: g.uid, text: '내리찍기를 받아 낼 채비가 되었다 (피해 절반)', tone: 'good' });
  }
}

// ───────────── 별을 삼킨 것 ─────────────

/** 삼킨 별이 달아오른다 (다 차면 다음 차례에 게워 낸다) */
export function addHeat(c: Combat, e: EnemyUnit, n: number) {
  if (isIllusion(e) || e.dead || e.mem.spat || n <= 0) return;
  const cur = e.st[HEAT] ?? 0;
  const next = Math.min(HEAT_MAX, cur + n);
  if (next === cur) return;
  setSt(c, e, HEAT, next);
  if (next >= HEAT_MAX) c.emit({ t: 'text', uid: e.uid, text: '삼킨 별이 하얗게 달아올랐다', tone: 'bad' });
}

/** 곁의 갓 태어난 별을 삼킨다: 별은 터지지 못하고 사라지고, 회복하고 더 달아오른다 */
export function devourStar(c: Combat, e: EnemyUnit) {
  if (isIllusion(e)) return;
  const s = c.alive.find((x) => x.def === 'newborn-star' && !isIllusion(x));
  if (!s) {
    c.emit({ t: 'text', uid: e.uid, text: '삼킬 별이 없다', tone: 'info' });
    return;
  }
  cine(c, 'blackhole', { uid: e.uid });
  vanish(c, s, '빛을 터뜨리기도 전에 삼켜졌다');
  c.heal(e, DEVOUR_HEAL);
  addHeat(c, e, DEVOUR_HEAT);
}

// ───────────── 성운 해파리 ─────────────

/** 갓 태어난 별이 터뜨릴 빛 (해파리가 빛을 먹였으면 더 크다) */
export const starDmg = (_c: Combat, e: EnemyUnit): number => STAR_FLARE + (e.st[FED] ?? 0);

/** 갓 태어난 별 하나에게 성운의 빛을 먹인다 (별마다 한 번). 이미 정한 의도의 피해도 바로 커진다 */
export function feedStar(c: Combat, e: EnemyUnit) {
  if (isIllusion(e)) return;
  const s = c.alive.find((x) => x.def === 'newborn-star' && !isIllusion(x) && !((x.st[FED] ?? 0) > 0));
  if (!s) {
    c.emit({ t: 'text', uid: e.uid, text: '빛을 먹일 별이 없다', tone: 'info' });
    return;
  }
  setSt(c, s, FED, FEED_DMG);
  if (s.intent && (s.intent.move === 'swell' || s.intent.move === 'flare')) s.intent.dmg = starDmg(c, s);
  c.emit({ t: 'text', uid: s.uid, text: '성운의 빛을 받아먹고 부풀었다', tone: 'bad' });
}

// ───────────── 장막 직조자 ─────────────

function skillName(c: Combat, uid: string): string {
  const id = c.run.skills.find((s) => s.uid === uid)?.id;
  return (id && SKILLS.get(id)?.name) || '기술';
}

/** 꿈실 엉키기: 이번 턴 마지막으로 쓴 두 기술(기본기 제외)의 재사용 대기를 더 긴 쪽에 맞춘다 */
export function tangleThreads(c: Combat, e: EnemyUnit) {
  if (isIllusion(e)) return;
  const a = c.s.vars.a5T1 ?? 0;
  const b = c.s.vars.a5T2 ?? 0;
  const ua = a > 0 ? c.run.slots[a - 1] : null;
  const ub = b > 0 ? c.run.slots[b - 1] : null;
  if (!ua || !ub || ua === ub) {
    c.emit({ t: 'text', uid: e.uid, text: '엉킬 실을 찾지 못했다', tone: 'info' });
    return;
  }
  const ca = c.s.cd[ua] ?? 0;
  const cb = c.s.cd[ub] ?? 0;
  if (ca >= LOCKED || cb >= LOCKED || ca === cb) {
    c.emit({ t: 'text', uid: e.uid, text: '실이 엉켰지만 아무 일도 없다', tone: 'info' });
    return;
  }
  const n = Math.max(ca, cb);
  c.s.cd[ua] = n;
  c.s.cd[ub] = n;
  delete c.s.vars.a5T1;
  delete c.s.vars.a5T2;
  c.emit({ t: 'text', uid: 'p', text: `꿈실이 엉켰다: 「${skillName(c, ua)}」·「${skillName(c, ub)}」의 재사용 대기가 더 긴 쪽에 맞춰졌다`, tone: 'bad' });
}

// ───────────── 꺼진 별 ─────────────

/**
 * 빛을 쏘아 보낸다: 내 턴이 두 번 끝날 때 닿는다 (LIGHT_FAR → LIGHT_NEAR → 피해).
 * 피해는 지금 계산해 둔다 (별의 힘·약화·층·조수 배율 — 내 쪽 효과는 닿는 순간 방어도만)
 */
export function sendLight(c: Combat, e: EnemyUnit, base: number) {
  if (isIllusion(e)) return;
  const n = Math.max(1, c.preview(e, null, base, 'fire'));
  // 결계가 빛 하나를 막는다 (해로운 효과 1회 무효)
  if (c.apply(c.p, LIGHT_FAR, n, e) > 0) c.emit({ t: 'text', uid: e.uid, text: '빛줄기 하나가 별 사이를 건너오기 시작했다', tone: 'eldritch' });
}

/** 오는 중인 빛이 모두 흩어진다 (꺼진 별이 무너졌다) */
export function scatterLight(c: Combat, text: string) {
  if (!((c.p.st[LIGHT_FAR] ?? 0) > 0) && !((c.p.st[LIGHT_NEAR] ?? 0) > 0)) return;
  setSt(c, c.p, LIGHT_FAR, 0);
  setSt(c, c.p, LIGHT_NEAR, 0);
  c.emit({ t: 'text', uid: 'p', text, tone: 'good' });
}

/** 내 턴이 끝날 때: 이번 턴의 빛이 닿고, 다음 턴의 빛이 다가온다. 모두 막아 내면 꺼진 별들이 흔들린다 */
function landLight(c: Combat, n: number) {
  setSt(c, c.p, LIGHT_NEAR, c.p.st[LIGHT_FAR] ?? 0);
  setSt(c, c.p, LIGHT_FAR, 0);
  if (n <= 0 || c.over) return;
  c.emit({ t: 'text', uid: 'p', text: '먼 별빛이 닿았다', tone: 'bad' });
  const d = c.damage({ src: null, tgt: c.p, base: n, type: 'true', tags: ['a5-starlight'] });
  if (c.over || d.amount <= 0 || d.blocked < d.amount) return;
  for (const star of c.alive.filter((x) => x.def === DEAD_STAR && !isIllusion(x))) {
    if (chipPoise(c, star, LIGHT_STAGGER, '닿은 빛이 모두 막혀 흔들린다')) scatterLight(c, '꺼진 별이 무너지자 오던 빛이 흩어졌다');
  }
}

// ───────────── 악몽 먹는 맥 ─────────────

/** 적들에게 걸린 악몽(해로운 상태)의 겹 수 */
export function nightmareStacks(c: Combat): number {
  let n = 0;
  for (const a of c.alive) if (!isIllusion(a)) for (const id of NIGHTMARES) n += a.st[id] ?? 0;
  return n;
}

/** 내 턴에 내가 적에게 악몽을 걸 때: 쌓인 악몽이 SCENT_AT 이상이면 맥이 공격을 멈추고 먹으러 간다 (의도가 바로 바뀐다) */
function smellNightmares(c: Combat, target: Unit, id: string) {
  if (c.s.phase !== 'player' || !isEnemy(target) || !NIGHTMARES.includes(id)) return;
  if (nightmareStacks(c) < SCENT_AT) return;
  for (const b of c.alive) {
    if (b.def !== BAKU || isIllusion(b) || b.broken === 2 || (b.st.stun ?? 0) > 0 || b.mem.scentT === c.s.turn) continue;
    const m = b.intent?.move;
    if (m !== 'trample' && m !== 'trunk') continue;
    b.mem.scentT = c.s.turn;
    setIntent(c, b, 'eat');
    c.emit({ t: 'text', uid: b.uid, text: '악몽 냄새를 맡았다. 공격을 멈추고 먹으러 간다', tone: 'info' });
  }
}

/** 배부름이 오른다 (GORGE_MAX가 차면 다음 차례에 게워 낸다) */
function gorge(c: Combat, e: EnemyUnit, n: number) {
  const cur = e.st[GORGED] ?? 0;
  const next = Math.min(GORGE_MAX, cur + n);
  if (next === cur) return;
  setSt(c, e, GORGED, next);
  if (next >= GORGE_MAX) c.emit({ t: 'text', uid: e.uid, text: '배가 터질 듯 부풀었다', tone: 'bad' });
}

/** 악몽을 먹는다: 적들에게 걸린 악몽을 모두 먹어 치우고, 한 겹마다 회복, 먹은 종류마다 배부름 +1 */
export function eatNightmares(c: Combat, e: EnemyUnit) {
  if (isIllusion(e)) return;
  let stacks = 0;
  const kinds = new Set<string>();
  for (const a of c.alive) {
    if (isIllusion(a)) continue;
    for (const id of NIGHTMARES) {
      const n = a.st[id] ?? 0;
      if (n <= 0) continue;
      stacks += n;
      kinds.add(id);
      c.clear(a, id);
    }
  }
  if (!stacks) {
    c.emit({ t: 'text', uid: e.uid, text: '먹을 악몽이 없어 입맛만 다신다', tone: 'info' });
    return;
  }
  c.emit({ t: 'text', uid: e.uid, text: `악몽 ${stacks}겹을 먹어 치웠다`, tone: 'bad' });
  c.heal(e, Math.min(EAT_HEAL_MAX, stacks * EAT_HEAL));
  gorge(c, e, kinds.size);
}

/** 배 속에 쌓인 악몽을 게워 낸다 */
export function bakuRetch(c: Combat, e: EnemyUnit) {
  setSt(c, e, GORGED, 0);
  c.horror(e, BAKU_RETCH_SAN);
  if (c.over || e.dead) return;
  c.apply(c.p, 'dread', BAKU_RETCH_DREAD, e);
  c.apply(c.p, 'weak', 1, e);
}
