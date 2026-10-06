import { ENEMIES, reg } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import { cycle, hpPct, last, opener, pick } from '../../engine/ai';
import type { DmgType, EnemyUnit, MoveDef } from '../../engine/types';
import { countDef, mv, others, release } from '../moves';
import { cine, setUi } from '../lib';
import {
  ABSOLVE_SAN,
  CONFESSION,
  HANGED,
  PENANCE,
  PENANCE_HP,
  RESONANCE,
  RING_MULT,
  SACRILEGE_BLOCK,
  SACRILEGE_SAN,
  SILENT_MULT,
  TANGLED,
  VOW,
  VOW_STR,
  VOW_WORDS,
  once,
  setIntent,
  setSt,
} from './patterns';

/** 재에 묻힌 것: 재 속에서 맞을 때마다 반격이 세진다 */
export const LASH_BASE = 8;
export const LASH_STEP = 3;
export const LASH_MAX = 5;
/** 재 폭풍이 화면을 덮는 정도 (%) */
export const ASH_DARK = 60;
/** 촛불을 든 것이 한 번에 빼앗는 등불 */
export const SNATCH = 20;
/** 대사제가 제물을 태워 다시 일어설 때의 체력 비율 */
export const RISE_PCT = 0.25;

// ───────────── 공용 헬퍼 ─────────────

/** 적 정의의 분류 태그 확인 ('cult', 'ash', 'undead' …) */
export function hasTag(e: EnemyUnit, tag: string): boolean {
  return ENEMIES.get(e.def)?.tags?.includes(tag) ?? false;
}

/** 아직 먹히지 않은 시체 수 (도망친 적 제외) */
export function corpses(c: Combat): number {
  return c.s.enemies.filter((x) => x.dead && !x.fled).length - (c.s.vars.a2eaten ?? 0);
}

/** 시체 하나를 먹는다. 먹을 것이 없으면 false */
export function eatCorpse(c: Combat): boolean {
  if (corpses(c) <= 0) return false;
  c.s.vars.a2eaten = (c.s.vars.a2eaten ?? 0) + 1;
  return true;
}

/**
 * 적이 제 편을 해치운다 (제물 봉헌, 새끼 삼키기). c.kill은 플레이어가 처치한 것으로 쳐서
 * '적을 처치하면' 유물·정수·경험치가 붙으므로, 보상 없이 치운다 (시체도 남지 않는다).
 */
function consume(c: Combat, x: EnemyUnit) {
  if (x.dead) return;
  x.hp = 0;
  x.dead = true;
  x.fled = true;
  x.block = 0;
  c.emit({ t: 'death', uid: x.uid });
}

/** 체력 비율이 가장 낮은 아군 */
function mostHurt(c: Combat): EnemyUnit | null {
  let best: EnemyUnit | null = null;
  for (const a of c.alive) if (!best || hpPct(a) < hpPct(best)) best = a;
  return best;
}

const CHOIR = ['chorister', 'choirmaster'];
/** 자신을 뺀 성가대 수 */
function choirOthers(c: Combat, e: EnemyUnit): number {
  return c.alive.filter((x) => x !== e && CHOIR.includes(x.def)).length;
}

const DMG_KO: Record<DmgType, string> = { slash: '참격', pierce: '관통', blunt: '타격', fire: '화염', arcane: '비전', void: '공허' };

/** 성가대원의 찬송: 계획 시점의 성가대 수에 맞춘 정신 피해를 보여주고, 실행 시 다시 센다 */
function hymn(n: number): MoveDef {
  return {
    ...mv.horror('재 섞인 찬송', 5 + n, { desc: '다른 성가대원 1명당 정신 피해 +1 (최대 +3)' }),
    run(c, e) {
      c.horror(e, 5 + Math.min(3, choirOthers(c, e)));
    },
  };
}

/** 성가대장의 지휘 (크레셴도 단계별로 이름이 달라 의도에 진행도가 보인다) */
function conduct(step: number): MoveDef {
  return mv.buff(
    `지휘 (${step}/3)`,
    (c, e) => {
      e.mem.cres = (e.mem.cres ?? 0) + 1;
      for (const a of c.alive) c.gainBlock(a, 4);
      c.emit({ t: 'text', uid: e.uid, text: `크레셴도 ${e.mem.cres}`, tone: 'eldritch' });
    },
    { extra: ['block'], desc: '크레셴도 +1 (3이 되면 대합창을 준비한다), 모든 아군 방어도 4' },
  );
}

/** 방금 울린 대종이 공명한다 — 다음 당신 턴이 끝날 때까지 (종의 다음 차례가 시작되면 잠잠해진다) */
function resonate(c: Combat) {
  const bell = c.alive.find((x) => x.def === 'great-bell');
  if (!bell) return;
  bell.mem.resT = c.s.turn + 1;
  setSt(c, bell, RESONANCE, 1);
  c.emit({ t: 'text', uid: bell.uid, text: '종이 떨고 있다 — 지금이다', tone: 'good' });
}

/** 종지기의 타종 */
function toll(step: number): MoveDef {
  return {
    ...mv.horror(`타종 (${step}/3)`, 6, {
      desc: `종지기 힘 +1. 울린 대종은 다음 턴 동안 공명한다 (받는 피해 +${Math.round((RING_MULT - 1) * 100)}%). 세 번 울리면 마지막 종을 준비한다`,
    }),
    run(c, e) {
      if (countDef(c, 'great-bell') === 0) {
        c.emit({ t: 'text', uid: e.uid, text: '깨진 종은 울리지 않는다', tone: 'good' });
        return;
      }
      cine(c, 'bell', { uid: e.uid });
      if (once(c, 'a2-toll')) cine(c, 'sysmsg', { uid: e.uid, text: '음량: 최대. 이 소리는 끌 수 없습니다.' });
      c.horror(e, 6);
      if (c.over) return;
      e.mem.tolls = (e.mem.tolls ?? 0) + 1;
      c.apply(e, 'str', 1, e);
      c.emit({ t: 'text', uid: e.uid, text: `종이 ${e.mem.tolls}번 울렸다`, tone: 'eldritch' });
      resonate(c);
    },
  };
}

/** 등불이 어두울수록 화면도 어둡다 (촛불을 든 것 — 화면에만) */
function lureDark(c: Combat) {
  setUi(c, 'ui:dark', Math.max(0, Math.min(54, Math.round((60 - c.run.light) * 0.9))));
}

// ───────────── 특성 ─────────────

reg.traits([
  {
    id: 'a2-chorus',
    name: '합창',
    desc: '함께 노래하는 성가대원 1명당 찬송의 정신 피해 +1 (최대 +3)',
    hooks: {},
  },
  {
    id: 'a2-martyrdom',
    name: '순교',
    desc: '쓰러지면 남은 동료 모두 힘 +2, 방어도 8',
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || !e.dead) return;
        const rest = c.alive;
        if (!rest.length) return;
        c.emit({ t: 'text', uid: e.uid, text: '순교의 피가 동료들에게 스민다', tone: 'eldritch' });
        for (const a of rest) {
          c.apply(a, 'str', 2, e);
          c.gainBlock(a, 8);
        }
      },
    },
  },
  {
    id: 'a2-corpse-eater',
    name: '시체 포식',
    desc: '쓰러진 자의 시체를 먹고 회복하며 강해진다. 시체는 한 번만 먹을 수 있다',
    hooks: {},
  },
  {
    id: 'a2-wax-seal',
    name: '밀랍 봉합',
    desc: '자기 턴이 끝날 때 녹은 밀랍이 상처를 메워 체력 3 회복',
    hooks: {
      onUnitTurnEnd(c, s) {
        c.heal(s.unit, 3);
      },
    },
  },
  {
    id: 'a2-possessed',
    name: '빙의',
    desc: '체력이 절반 이하가 되면 몸속의 악령이 빠져나온다 (수도사는 힘 -2, 당신은 정신력 -3)',
    hooks: {
      onDamageTaken(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.exorcised || e.hp <= 0 || hpPct(e) > 0.5) return;
        e.mem.exorcised = 1;
        c.emit({ t: 'text', uid: e.uid, text: '입에서 검은 것이 기어 나온다', tone: 'eldritch' });
        c.apply(e, 'str', -2, e);
        c.spawn('loose-spirit', 1);
        c.loseSanity(3, true);
      },
    },
  },
  {
    id: 'a2-carapace',
    name: '뼈 껍데기',
    desc: '마디마다 덧댄 뼈 때문에 근접 공격으로 받는 피해 25% 감소',
    hooks: {
      modDamageIn(_c, _s, d) {
        if (d.melee && d.attack) d.mult *= 0.75;
      },
    },
  },
  {
    id: 'a2-crescendo',
    name: '크레셴도',
    desc: '지휘하거나 뒤엉킨 성가를 부를 때마다 크레셴도가 쌓이고, 3이 되면 대합창을 준비한다. 준비 중에 붕괴시키면 처음부터 다시 쌓아야 한다',
    hooks: {},
  },
  {
    id: 'a2-mortify',
    name: '고행',
    desc: '체력이 처음 절반 이하가 되면 힘 +2',
    hooks: {
      onDamageTaken(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.mortified || e.hp <= 0 || hpPct(e) > 0.5) return;
        e.mem.mortified = 1;
        c.apply(e, 'str', 2, e);
        c.emit({ t: 'text', uid: e.uid, text: '고통이 곧 기도다', tone: 'eldritch' });
      },
    },
  },
  {
    id: 'a2-adaptive',
    name: '성유물의 가호',
    desc: '마지막으로 받은 공격의 속성에 대해 피해 50% 저항 (속성을 바꿔 가며 공격할 것). 자기 턴이 시작되면 적응이 풀린다',
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || !d.attack || d.type === 'true' || e.hp <= 0) return;
        if (e.resist[d.type] === 0.5 && Object.keys(e.resist).length === 1) return;
        e.resist = { [d.type]: 0.5 };
        c.emit({ t: 'text', uid: e.uid, text: `${DMG_KO[d.type]}에 적응했다`, tone: 'info' });
      },
      onUnitTurnStart(_c, s) {
        if (isEnemy(s.unit)) s.unit.resist = {};
      },
    },
  },
  {
    id: 'a2-offering-rite',
    name: '제물 의식',
    desc:
      `결박된 제물을 바쳐 회복하고 강해진다. 제물이 하나라도 살아 있으면, 쓰러지는 순간 제물 하나를 태워 체력 ${Math.round(RISE_PCT * 100)}%로 다시 일어선다 ` +
      '(한 번, 제물의 비명에 정신력 -4). 살아 있는 제물을 먼저 모두 거두면 막을 수 있다. 대사제가 끝내 쓰러지면 남은 제물들은 풀려나 달아난다',
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || !e.dead) return;
        // 향로의 불처럼 꺼지지 않는 목숨: 남은 제물을 태워 다시 일어선다 (한 번)
        const o = c.alive.find((x) => x.def === 'offering');
        if (o && !e.mem.risen) {
          e.mem.risen = 1;
          c.emit({ t: 'text', uid: o.uid, text: '제물의 비명', tone: 'eldritch' });
          consume(c, o);
          e.dead = false;
          e.hp = Math.ceil(e.maxHp * RISE_PCT);
          e.block = 0;
          e.broken = 0;
          e.poise = e.maxPoise;
          delete e.mem.charge;
          for (const id of ['weak', 'vuln', 'frail', 'bleed', 'poison', 'burn', 'mark', 'corrode', 'doom']) c.clear(e, id);
          c.emit({ t: 'spawn', uid: e.uid });
          cine(c, 'shatter', { uid: e.uid });
          c.emit({ t: 'text', uid: e.uid, text: '향로의 불은 꺼지지 않는다', tone: 'eldritch' });
          c.loseSanity(4, true);
          if (c.s.phase === 'player') c.planIntent(e);
          return;
        }
        for (const o of c.alive.filter((x) => x.def === 'offering')) {
          c.emit({ t: 'text', uid: o.uid, text: '사슬을 끊고 달아난다', tone: 'good' });
          c.flee(o);
        }
      },
    },
  },
  {
    id: 'a2-innocent',
    name: '무고한 자',
    desc: '직접 죽이면 정신력 -2',
    hooks: {
      onDeath(c, _s, d) {
        if (d && d.src === c.p) {
          c.emit({ t: 'text', uid: 'p', text: '무고한 피가 손에 묻었다', tone: 'bad' });
          c.loseSanity(2);
        }
      },
    },
  },
  {
    id: 'a2-pack-lord',
    name: '무리의 왕',
    desc: '구울 왕이 쓰러지면 새끼들은 흩어져 달아난다',
    hooks: {
      onDeath(c, s) {
        if (!isEnemy(s.unit) || !s.unit.dead) return;
        for (const pup of c.alive.filter((x) => x.def === 'ghoul-pup')) c.flee(pup);
      },
    },
  },
  {
    id: 'a2-buried',
    name: '재 속의 몸',
    desc:
      '후열(재 속)에 파묻혀 있는 동안 받는 피해 30% 감소, 자기 턴이 끝날 때 체력 6 회복. 재에 가려 의도가 보이지 않는다 (통찰 5 이상이면 보인다). ' +
      `재 속에서 공격받으면 의도가 '재 속의 반격'으로 바뀌고, 맞을 때마다 반격 피해 +${LASH_STEP} (최대 +${LASH_STEP * LASH_MAX}). ` +
      '재를 덮어 주던 잿빛 유충이 모두 쓰러지면 재 밖으로 드러나 취약해진다',
    hooks: {
      modDamageIn(_c, s, d) {
        if (isEnemy(s.unit) && s.unit.row === 1) d.mult *= 0.7;
      },
      onUnitTurnEnd(c, s) {
        if (!isEnemy(s.unit)) return;
        s.unit.mem.prov = 0;
        if (s.unit.row === 1) c.heal(s.unit, 6);
      },
      // 반응형 의도: 재 속에서 맞으면 재를 뚫고 반격한다 (맞을수록 세진다)
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.hp <= 0 || e.row !== 1 || !e.mem.sub || e.mem.stranded) return;
        if (!d.attack || d.src !== c.p || c.s.phase !== 'player' || e.broken === 2) return;
        e.mem.prov = Math.min(LASH_MAX, (e.mem.prov ?? 0) + 1);
        setIntent(c, e, 'lash');
        c.emit({ t: 'text', uid: e.uid, text: e.mem.prov === 1 ? '재 속의 것이 당신을 느꼈다' : `재가 들끓는다 (반격 +${LASH_STEP * e.mem.prov})`, tone: 'eldritch' });
      },
      onAnyDeath(c, s, victim) {
        const e = s.unit;
        if (!isEnemy(e) || !isEnemy(victim) || victim.def !== 'ash-larva') return;
        if (!e.mem.sub || e.row !== 1 || countDef(c, 'ash-larva') > 0) return;
        if (!c.moveRow(e, 0)) return;
        e.mem.sub = 0;
        e.mem.prov = 0;
        e.mem.stranded = 1;
        setUi(c, 'ui:dark', 0);
        cine(c, 'shatter', { uid: e.uid });
        c.emit({ t: 'text', uid: e.uid, text: '재 밖으로 드러났다!', tone: 'good' });
        c.apply(e, 'vuln', 2, c.p);
        if (e.broken !== 2 && c.s.phase === 'player') c.planIntent(e);
      },
      onDeath(c) {
        setUi(c, 'ui:dark', 0);
      },
    },
  },
  {
    id: 'a2-great-bell',
    name: '대종',
    desc:
      `잠잠한 종은 받는 피해 ${Math.round((1 - SILENT_MULT) * 100)}% 감소. 종지기가 타종한 직후엔 공명해, 다음 당신 턴 동안 받는 피해 +${Math.round((RING_MULT - 1) * 100)}% — 종소리에 맞춰 쳐야 깨진다. ` +
      '종지기는 이 종이 있어야 타종할 수 있다. 종이 깨지면 종지기가 비틀거리다(기절 1) 격노한다(힘 +3)',
    hooks: {
      modDamageIn(_c, s, d) {
        d.mult *= (s.unit.st[RESONANCE] ?? 0) > 0 ? RING_MULT : SILENT_MULT;
      },
      onUnitTurnStart(c, s) {
        const b = s.unit;
        if (!isEnemy(b) || !b.mem.resT || c.s.turn < b.mem.resT) return;
        delete b.mem.resT;
        setSt(c, b, RESONANCE, 0);
      },
      onDeath(c, s) {
        const bk = c.alive.find((x) => x.def === 'bellkeeper');
        if (!bk) return;
        cine(c, 'shatter', { uid: s.unit.uid });
        c.emit({ t: 'text', uid: bk.uid, text: '대종이 깨졌다 — 종지기가 비틀거린다', tone: 'good' });
        c.apply(bk, 'stun', 1, s.unit);
        c.apply(bk, 'str', 3, s.unit);
      },
    },
  },
  {
    id: 'a2-bell-bound',
    name: '종에 묶인 자',
    desc: '대종을 울릴 때마다 강해진다. 종이 세 번 울리면 마지막 종을 친다 — 대종을 깨뜨리면 막을 수 있다. 종을 잃으면 제 심장을 종처럼 울린다',
    hooks: {
      onDeath(c, s) {
        if (!isEnemy(s.unit) || !s.unit.dead) return;
        for (const b of c.alive.filter((x) => x.def === 'great-bell')) {
          c.emit({ t: 'text', uid: b.uid, text: '종이 마지막으로 울리고 떨어진다', tone: 'eldritch' });
          c.kill(b, false);
        }
      },
    },
  },
  {
    id: 'a2-lure',
    name: '어둠의 사냥꾼',
    desc: '등불이 25 미만이면 공격 피해 +25%. 손짓하는 촛불로 등불을 흐리고, 등불을 강탈해 제 촛불에 옮긴다 — 강탈당한 등불은 쓰러뜨리면 되찾는다. 향 연기 속에 숨어 얻은 회피는 자기 턴이 오면 사라진다',
    hooks: {
      modDamageOut(c, _s, d) {
        if (d.attack && c.run.light < 25) d.mult *= 1.25;
      },
      onCombatStart(c) {
        lureDark(c);
      },
      onUnitTurnStart(c, s) {
        c.clear(s.unit, 'evasive');
        // 등유 등으로 등불이 바뀌었으면 화면 어둠도 따라간다
        lureDark(c);
      },
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || !e.dead) return;
        const n = e.mem.stolen ?? 0;
        e.mem.stolen = 0;
        if (n > 0) {
          c.run.light = Math.min(100, c.run.light + n);
          c.emit({ t: 'text', uid: 'p', text: `빼앗긴 불빛을 되찾았다 (등불 +${n})`, tone: 'good' });
        }
        setUi(c, 'ui:dark', 0);
      },
    },
  },
  {
    id: 'a2-miracle',
    name: '거꾸로 된 기적',
    desc: '기적을 준비하는 동안 붕괴시키지 못하면 크게 회복하고 해로운 효과를 털어낸다',
    hooks: {
      // 거꾸로 매달림이 이번 적 차례로 끝나면 화면도 바로 선다 (연출)
      onUnitTurnEnd(c) {
        if ((c.p.st[HANGED] ?? 0) <= 1) setUi(c, 'ui:swap', 0);
      },
      onDeath(c) {
        setUi(c, 'ui:swap', 0);
      },
    },
  },
  {
    id: 'a2-silence',
    name: '침묵의 서약',
    desc:
      `당신에게 침묵의 서약을 지운다: 기술(기본기 포함)을 쓸 때마다 남은 말이 줄고, ${VOW_WORDS}번째 말에서 서약이 새로 시작된다. ` +
      `그 순간 행동력이 남아 있으면 말을 끊긴다 — 남은 행동력을 잃고 이번 턴 기술을 쓸 수 없으며, 대사제 힘 +${VOW_STR}. 행동력을 다 쓰는 말로 끝맺으면 무사하다. 대사제가 쓰러지면 서약도 풀린다`,
    hooks: {
      onDeath(c, s) {
        if (!isEnemy(s.unit) || !s.unit.dead) return;
        setSt(c, c.p, VOW, 0);
      },
    },
  },
  {
    id: 'a2-false-feast',
    name: '거짓 만찬',
    desc: '먹을 시체가 없는데 차리는 만찬은 거짓이다 — 당신에게 달려들어 입힌 피해만큼 회복한다 (속임수: 통찰 5 이상이면 진짜 의도가 보인다). 다만 체력이 절반 아래면 제 새끼를 삼키는 진짜 만찬일 수 있다. 불에 타 죽은 새끼는 먹지 못한다',
    hooks: {},
  },
  {
    id: 'a2-king-prey',
    name: '왕의 먹이',
    desc: '구울 왕의 먹잇감. 불에 타 죽으면(화염·화상) 재만 남아 왕이 먹지 못한다',
    hooks: {
      onDeath(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || !e.dead || e.fled || !d) return;
        if (d.type !== 'fire' && !d.tags.includes('burn')) return;
        // 시체 수에서 빼 둔다 (먹힌 시체와 같은 셈)
        c.s.vars.a2eaten = (c.s.vars.a2eaten ?? 0) + 1;
        c.emit({ t: 'text', uid: e.uid, text: '재가 되어 흩어졌다 — 먹을 것이 남지 않았다', tone: 'good' });
      },
    },
  },
]);

// ───────────── 일반 적 ─────────────

reg.enemies([
  {
    id: 'chorister',
    name: '재를 토하는 성가대원',
    icon: 'gi:sing',
    act: 2,
    tier: 'normal',
    hp: [32, 36],
    poise: 3,
    weak: ['blunt', 'void'],
    row: 1,
    dread: 2,
    tags: ['cult', 'undead'],
    traits: ['a2-chorus'],
    desc: '재가 쌓인 성가대석에서 아직도 저녁 기도를 부르는 아이들. 입을 벌릴 때마다 잿가루가 쏟아진다.',
    moves: {
      hymn0: hymn(0),
      hymn1: hymn(1),
      hymn2: hymn(2),
      hymn3: hymn(3),
      discord: mv.attack('불협화음', 4, { hits: 2, melee: false, type: 'arcane' }),
      harmony: mv.block('화음', 0, {
        then(c) {
          for (const a of c.alive) c.gainBlock(a, 5);
        },
        desc: '모든 아군 방어도 5',
      }),
    },
    ai: (c, e) => {
      const h = `hymn${Math.min(3, choirOthers(c, e))}`;
      return pick(c, e, { [h]: 2, discord: 2, harmony: others(c, e).length ? 1 : 0 });
    },
    visual: { tint: 0x5a5650, glow: 0xffd890, scale: 0.85, fx: ['float'] },
  },
  {
    id: 'censer-priest',
    name: '향로 사제',
    icon: 'gi:incense',
    act: 2,
    tier: 'normal',
    hp: [38, 42],
    poise: 4,
    weak: ['pierce', 'void'],
    row: 1,
    tags: ['cult'],
    desc: '꺼지지 않는 향로를 흔들며 회랑을 도는 사제. 연기가 짙어질수록 그가 외는 기도는 사람의 말이 아니게 된다.',
    moves: {
      rite: mv.buff(
        '의식 집전',
        (c, e) => {
          e.mem.rite = 1;
          c.apply(e, 'ritual', 1, e);
        },
        { desc: '의식 1 — 매 턴 힘 +1' },
      ),
      communion: mv.buff(
        '검은 성찬',
        (c, e) => {
          for (const a of c.alive) {
            c.apply(a, 'str', 1, e);
            c.heal(a, 4);
          }
        },
        { extra: ['heal'], desc: '모든 아군 힘 +1, 체력 4 회복' },
      ),
      curse: mv.horror('저주의 설교', 6, { then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '정신 피해, 약화 1' }),
      smite: mv.attack('재의 인장', 7, { melee: false, type: 'arcane' }),
    },
    ai: (c, e) => (e.mem.rite ? pick(c, e, { smite: 3, curse: 2, communion: others(c, e).length ? 2 : 1 }) : 'rite'),
    visual: { tint: 0x46404a, glow: 0xff9a40, fx: ['flicker'] },
  },
  {
    id: 'martyr',
    name: '순교자',
    icon: 'gi:crown-of-thorns',
    act: 2,
    tier: 'normal',
    hp: [40, 46],
    poise: 3,
    weak: ['pierce', 'arcane'],
    row: 0,
    tags: ['cult'],
    traits: ['a2-martyrdom'],
    desc: '가시관을 쓰고 스스로를 채찍질하는 광신도. 죽음조차 동료에게 바치는 공물이다.',
    moves: {
      scourge: mv.buff(
        '자기 채찍질',
        (c, e) => {
          e.mem.sc = (e.mem.sc ?? 0) + 1;
          c.loseHp(e, 5);
          if (!e.dead) c.apply(e, 'str', 2, e);
        },
        { desc: '체력 5를 잃고 힘 +2' },
      ),
      chain: mv.attack('가시 사슬', 9, { type: 'slash' }),
      embrace: mv.attack('피의 포옹', 5, { then: (c, e) => void c.apply(c.p, 'bleed', 2, e), desc: '출혈 2' }),
    },
    ai: (c, e) => pick(c, e, { chain: 3, embrace: 2, scourge: e.hp > 15 && (e.mem.sc ?? 0) < 2 ? 2 : 0 }),
    visual: { tint: 0x7a4a48, glow: 0xff5040 },
  },
  {
    id: 'crypt-ghoul',
    name: '납골당 구울',
    icon: 'gi:bone-gnawer',
    act: 2,
    tier: 'normal',
    hp: [44, 50],
    poise: 4,
    weak: ['fire', 'pierce'],
    row: 0,
    tags: ['undead', 'ghoul'],
    traits: ['a2-corpse-eater'],
    desc: '개를 닮은 얼굴로 납골당의 뼈를 갉는 것. 갓 쓰러진 것을 가장 좋아한다.',
    moves: {
      claw: mv.attack('할퀴기', 7, { type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 1, e), desc: '출혈 1' }),
      gnaw: mv.attack('뼈 갉기', 3, { hits: 3, type: 'slash' }),
      feast: {
        name: '시체 포식',
        intent: 'heal',
        extra: ['buff'],
        desc: '쓰러진 자의 시체를 먹어 체력 14 회복, 힘 +2',
        run(c, e) {
          if (!eatCorpse(c)) {
            c.emit({ t: 'text', uid: e.uid, text: '먹을 것이 없다', tone: 'info' });
            return;
          }
          c.emit({ t: 'text', uid: e.uid, text: '시체를 뜯어먹는다', tone: 'bad' });
          c.heal(e, 14);
          c.apply(e, 'str', 2, e);
        },
      },
    },
    ai: (c, e) => {
      if (corpses(c) > 0 && last(e) !== 'feast') return pick(c, e, { feast: hpPct(e) < 0.9 ? 5 : 2, claw: 2, gnaw: 1 });
      return pick(c, e, { claw: 3, gnaw: 2 });
    },
    visual: { tint: 0x6a6a58, glow: 0xc0ff60 },
  },
  {
    id: 'wax-friar',
    name: '밀랍 수사',
    icon: 'gi:candle-skull',
    act: 2,
    tier: 'normal',
    hp: [48, 54],
    poise: 4,
    weak: ['blunt', 'arcane'],
    row: 0,
    tags: ['ash', 'cult'],
    traits: ['a2-wax-seal'],
    desc: '녹은 촛농을 제 몸에 부어 상처를 봉한 수사. 굳은 밀랍이 얼굴의 반을 덮었지만 아침 기도는 거르지 않는다.',
    moves: {
      spike: mv.attack('쇠 촛대 찌르기', 9, { type: 'pierce' }),
      grip: mv.attack('밀랍 손아귀', 6, { then: (c, e) => void c.apply(c.p, 'frail', 2, e), desc: '허약 2' }),
      harden: mv.block('밀랍 굳히기', 10, { desc: '방어도 10' }),
    },
    ai: (c, e) => opener(c, e, ['spike']) ?? pick(c, e, { spike: 3, grip: 2, harden: hpPct(e) < 0.6 ? 2 : 1 }),
    visual: { tint: 0x8a7a5a, glow: 0xffd070, fx: ['flicker'] },
  },
  {
    id: 'possessed-monk',
    name: '빙의된 수도사',
    icon: 'gi:monk-face',
    act: 2,
    tier: 'normal',
    hp: [46, 52],
    poise: 4,
    weak: ['arcane', 'blunt'],
    row: 0,
    dread: 2,
    tags: ['cult'],
    traits: ['a2-possessed'],
    desc: '두 개의 목소리로 동시에 기도한다. 하나는 살려 달라고, 하나는 들어오라고.',
    moves: {
      spasm: mv.attack('발작', 4, { hits: 2 }),
      voice: mv.horror('낯선 목소리', 6),
      fist: mv.attack('뒤틀린 주먹', 9),
      pray: mv.block('흐느끼는 기도', 8, { desc: '방어도 8' }),
    },
    ai: (c, e) =>
      e.mem.exorcised ? pick(c, e, { fist: 2, pray: 2, spasm: 1 }) : pick(c, e, { spasm: 2, voice: 2, fist: 2 }),
    visual: { tint: 0x5a5048, glow: 0xff3060, fx: ['flicker'] },
  },
  {
    id: 'loose-spirit',
    name: '빠져나온 악령',
    icon: 'gi:ghost',
    act: 2,
    tier: 'minion',
    hp: [14, 16],
    poise: 0,
    weak: ['arcane', 'fire'],
    row: 1,
    eldritch: true,
    traits: ['incorporeal'],
    moves: {
      whisper: mv.horror('귓속말', 4),
      chill: mv.attack('냉기', 5, { melee: false, type: 'void' }),
      fade: {
        name: '흩어짐',
        intent: 'flee',
        desc: '깃들 몸이 없는 악령은 오래 버티지 못한다',
        run(c, e) {
          c.emit({ t: 'text', uid: e.uid, text: '악령이 연기처럼 흩어진다', tone: 'info' });
          c.flee(e);
        },
      },
    },
    // 세 번 행동하면 흩어진다
    ai: (_c, e) => {
      e.mem.acts = (e.mem.acts ?? 0) + 1;
      return e.mem.acts > 3 ? 'fade' : cycle(e, ['whisper', 'chill']);
    },
    visual: { tint: 0x2a2630, glow: 0xff3060, scale: 0.6, fx: ['float', 'flicker'] },
  },
  {
    id: 'walled-nun',
    name: '벽에 갇힌 수녀',
    icon: 'gi:nun-face',
    act: 2,
    tier: 'normal',
    hp: [36, 40],
    poise: 3,
    weak: ['fire', 'slash'],
    row: 1,
    tags: ['undead'],
    desc: '수도원이 바쳐지던 밤, 그들은 스스로를 벽 속에 쌓아 넣었다. 회벽 너머의 기도는 아직 끝나지 않았다.',
    moves: {
      lament: mv.horror('벽 속의 기도', 6, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '정신 피해, 공포 1' }),
      brick: mv.buff(
        '벽돌 쌓기',
        (c, e) => {
          const t = mostHurt(c) ?? e;
          c.apply(t, 'barrier', 8, e);
        },
        { desc: '가장 다친 아군에게 보호막 8' },
      ),
      touch: mv.attack('벽 틈의 손길', 6, { melee: false, type: 'void', then: (c, e) => void c.apply(c.p, 'frail', 1, e), desc: '허약 1' }),
    },
    ai: (c, e) => pick(c, e, { touch: 3, lament: 2, brick: c.alive.some((a) => hpPct(a) < 0.8) ? 2 : 0 }),
    visual: { tint: 0x6a6460, glow: 0xe8dcc0, fx: ['flicker'] },
  },
  {
    id: 'bell-acolyte',
    name: '타종 수련사',
    icon: 'gi:hooded-figure',
    act: 2,
    tier: 'normal',
    hp: [32, 36],
    poise: 3,
    weak: ['slash', 'void'],
    row: 1,
    tags: ['cult'],
    desc: '종탑의 밧줄을 당기는 견습들. 고막은 오래전에 터졌지만 종소리는 여전히 들린다고 한다.',
    moves: {
      clang: mv.attack('공명', 6, { melee: false, type: 'arcane' }),
      toll: mv.horror('작은 종', 4, {
        desc: '다른 교단 아군 모두 힘 +1',
        then(c, e) {
          for (const a of c.alive) if (a !== e && hasTag(a, 'cult')) c.apply(a, 'str', 1, e);
        },
      }),
    },
    ai: (_c, e) => cycle(e, ['clang', 'toll', 'clang']),
    visual: { tint: 0x5a4a3a, glow: 0xffc060 },
  },
  {
    id: 'bone-centipede',
    name: '뼈지네',
    icon: 'gi:centipede',
    act: 2,
    tier: 'normal',
    hp: [30, 34],
    poise: 2,
    weak: ['slash', 'fire'],
    row: 0,
    tags: ['ash', 'beast'],
    traits: ['a2-carapace'],
    desc: '납골당의 뼈를 껍데기 삼아 재 속을 기는 지네. 무엇에든 들러붙어 피를 빤다. 수도사들은 이것을 "회개하지 않는 혀"라 불렀다.',
    moves: {
      latch: {
        name: '턱 박기',
        intent: 'attack',
        extra: ['heal'],
        dmg: 5,
        melee: true,
        desc: '출혈 2. 입힌 피해만큼 회복',
        run(c, e) {
          const ds = c.enemyAttack(e, { type: 'pierce' });
          if (c.over || e.dead) return;
          c.apply(c.p, 'bleed', 2, e);
          const n = ds.reduce((s, d) => s + d.hpLoss, 0);
          if (n > 0) c.heal(e, n);
        },
      },
      thrash: mv.attack('몸부림', 3, { hits: 2 }),
    },
    ai: (c, e) => pick(c, e, { latch: 3, thrash: 2 }),
    visual: { tint: 0xb0a890, glow: 0xff6050, scale: 0.8 },
  },
  {
    id: 'corpse-moth',
    name: '시체 나방',
    icon: 'gi:butterfly',
    act: 2,
    tier: 'normal',
    hp: [30, 34],
    poise: 3,
    weak: ['pierce', 'blunt'],
    row: 1,
    tags: ['ash', 'beast'],
    desc: '향로 연기를 따라 모여드는 창백한 나방. 시체에 알을 슬고, 그 날갯가루를 들이마신 자는 생각이 굳는다.',
    moves: {
      dust: mv.attack('날갯가루', 5, { melee: false, type: 'arcane' }),
      rub: mv.charge('날개를 비빈다', 9),
      burst: release(
        mv.attack('마비의 가루', 9, {
          melee: false,
          type: 'arcane',
          desc: '침묵 1 — 다음 턴엔 기본기만 쓸 수 있다',
          then: (c, e) => void c.apply(c.p, 'silence', 1, e),
        }),
      ),
    },
    ai: (_c, e) => (e.mem.charge ? 'burst' : cycle(e, ['dust', 'rub', 'dust'])),
    visual: { tint: 0xd0c8b8, glow: 0xffe0a0, scale: 0.9, fx: ['float'] },
  },
  {
    id: 'confessor',
    name: '고해 신부',
    icon: 'gi:cowled',
    act: 2,
    tier: 'normal',
    hp: [40, 44],
    poise: 4,
    weak: ['void', 'slash'],
    row: 0,
    tags: ['cult'],
    desc: '모든 죄를 들어주고, 모든 죄를 기록한다. 그 장부는 아래의 목소리에게 바쳐진다.',
    moves: {
      penance: mv.attack('참회의 매', 8, { then: (c, e) => void c.apply(c.p, 'vuln', 1, e), desc: '취약 1' }),
      confess: {
        ...mv.horror('고해 강요', 4, { desc: '이번 턴 당신이 쓴 스킬 1개당 정신 피해 +1 (최대 +5)' }),
        run(c, e) {
          c.horror(e, 4 + Math.min(5, c.s.used));
        },
      },
      absolve: {
        name: '사면',
        intent: 'heal',
        desc: '가장 다친 아군 체력 10 회복',
        run(c, e) {
          c.heal(mostHurt(c) ?? e, 10);
        },
      },
    },
    ai: (c, e) => pick(c, e, { penance: 3, confess: 2, absolve: c.alive.some((a) => hpPct(a) < 0.7) ? 2 : 0 }),
    visual: { tint: 0x2e2a30, glow: 0xd0b070 },
  },
  {
    id: 'font-hands',
    name: '성수반의 손',
    icon: 'gi:evil-hand',
    act: 2,
    tier: 'normal',
    hp: [34, 38],
    poise: 3,
    weak: ['fire', 'arcane'],
    row: 1,
    dread: 3,
    eldritch: true,
    tags: ['ash'],
    desc: '세례반에는 재와 피를 갠 검은 것이 고여 있다. 그 속에서 손들이 뻗어 나와 세례받을 자를 더듬는다.',
    moves: {
      reach: mv.attack('뻗어 오는 손', 7, { melee: false, type: 'void' }),
      baptize: mv.horror('검은 세례', 4, {
        desc: '부식 1 — 받는 피해 +1 (전투 동안)',
        then: (c, e) => void c.apply(c.p, 'corrode', 1, e),
      }),
      clutch: mv.attack('움켜쥐기', 3, { hits: 2, melee: false, then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '약화 1' }),
    },
    ai: (_c, e) => cycle(e, ['reach', 'baptize', 'clutch', 'reach']),
    visual: { tint: 0x2a1a1a, glow: 0xff5a40, fx: ['float'] },
  },

  // ───────────── 정예 ─────────────
  {
    id: 'flagellant',
    name: '대고행자',
    icon: 'gi:whip',
    act: 2,
    tier: 'elite',
    hp: [140, 148],
    poise: 7,
    weak: ['fire', 'void', 'pierce'],
    row: 0,
    dread: 3,
    tags: ['cult'],
    traits: ['a2-mortify'],
    desc: '백 년 동안 하루도 빠짐없이 자신을 채찍질했다. 이제 그의 피는 가시처럼 단단하다.',
    moves: {
      scourge: mv.buff(
        '피의 고행',
        (c, e) => {
          c.loseHp(e, 8);
          if (e.dead) return;
          c.apply(e, 'str', 2, e);
          c.apply(e, 'thorns', 2, e);
        },
        { desc: '체력 8을 잃고 힘 +2, 가시 2 (근접 공격하면 반사 피해)' },
      ),
      lash: mv.attack('가시 채찍', 3, { hits: 3, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 1, e), desc: '출혈 1' }),
      sermon: mv.horror('참회하라', 7, { then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '정신 피해, 약화 1' }),
      // 고행을 강요한다: 채찍질을 막으려 기술을 쏟아부을수록 피를 흘린다
      penance: mv.debuff(
        '강요된 고행',
        (c, e) => {
          if (c.apply(c.p, PENANCE, 2, e) > 0) c.emit({ t: 'text', uid: 'p', text: '속죄하라 — 손을 쓸 때마다 피가 흐른다', tone: 'bad' });
        },
        { desc: `속죄 2 — 2턴 동안 기술(기본기 포함)을 쓸 때마다 체력 ${PENANCE_HP}를 잃는다 (방어 무시)` },
      ),
      windup: mv.charge('백 번의 채찍질', 5, { hits: 4 }),
      rain: release(mv.attack('백 번의 채찍질', 5, { hits: 4, type: 'slash', ultimate: true, cine: 'impact' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'rain';
      const m = opener(c, e, ['scourge']) ?? cycle(e, ['penance', 'windup', 'lash', 'scourge', 'sermon']);
      return m === 'scourge' && e.hp <= 16 ? 'lash' : m;
    },
    visual: { tint: 0x6a3a3a, glow: 0xff3a30, scale: 1.2 },
  },
  {
    id: 'choirmaster',
    name: '성가대장',
    icon: 'gi:music-spell',
    act: 2,
    tier: 'elite',
    hp: [124, 130],
    poise: 6,
    weak: ['blunt', 'pierce'],
    row: 1,
    dread: 3,
    tags: ['cult', 'undead'],
    traits: ['a2-chorus', 'a2-crescendo'],
    desc: '재를 토하는 아이들을 지휘하는 자. 그가 지휘봉을 들면 재에 묻힌 모든 입이 동시에 열린다.',
    moves: {
      conduct1: conduct(1),
      conduct2: conduct(2),
      conduct3: conduct(3),
      solo: mv.horror('독창', 6),
      // 귀를 파고드는 엇박의 성가 — 기술 이름이 뒤섞여 보이고, 같은 기술을 거듭 쓸 수 없다. 이것도 지휘의 한 마디다
      tangle: {
        ...mv.horror('뒤엉킨 성가', 5, {
          desc: '정신 피해, 크레셴도 +1. 뒤엉킨 기억 1 — 다음 턴 기술 이름과 설명이 뒤섞여 보이고, 쓴 기술은 그 턴에 다시 쓸 수 없다',
        }),
        extra: ['debuff', 'buff'],
        run(c, e) {
          cine(c, 'glitch', { uid: e.uid, n: 1 });
          c.horror(e, 5);
          if (c.over || e.dead) return;
          e.mem.cres = (e.mem.cres ?? 0) + 1;
          c.emit({ t: 'text', uid: e.uid, text: `크레셴도 ${e.mem.cres}`, tone: 'eldritch' });
          if (c.apply(c.p, TANGLED, 1, e) > 0) setUi(c, 'ui:scramble', 1);
        },
      },
      baton: mv.attack('지휘봉', 8, { melee: false, type: 'arcane', then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '약화 1' }),
      gather: mv.summon(
        '성가대 소집',
        (c, e) => {
          e.mem.gathers = (e.mem.gathers ?? 0) + 1;
          c.spawn('chorister', 0);
        },
        '재를 토하는 성가대원 소환',
      ),
      prelude: {
        ...mv.charge('대합창 준비', 5),
        hits: (c) => 1 + countDef(c, 'chorister'),
        desc: '다음 턴 대합창 — 살아 있는 성가대원 1명당 1회 추가 타격 (붕괴시키면 취소)',
      },
      grand: release({
        ...mv.horror('대합창', 6, { dmg: 5, desc: '성가대원 1명당 정신 피해 +2' }),
        ultimate: true,
        cine: 'shatter',
        hits: (c) => 1 + countDef(c, 'chorister'),
        run(c, e) {
          e.mem.cres = 0;
          const choir = countDef(c, 'chorister');
          c.enemyAttack(e, { type: 'arcane', hits: 1 + choir });
          if (!c.over) c.horror(e, 6 + 2 * choir);
        },
      }),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'grand';
      // 준비하던 대합창이 붕괴로 끊겼다
      if (last(e) === 'prelude') e.mem.cres = 0;
      const cres = e.mem.cres ?? 0;
      if (cres >= 3) return 'prelude';
      if (countDef(c, 'chorister') < 2 && (e.mem.gathers ?? 0) < 1 && last(e) !== 'gather' && c.alive.length < 6) return 'gather';
      const m = cycle(e, ['conduct', 'tangle', 'conduct', 'baton', 'solo']);
      return m === 'conduct' ? `conduct${Math.min(3, cres + 1)}` : m;
    },
    visual: { tint: 0x3a3634, glow: 0xffd890, scale: 1.2, fx: ['float'] },
  },
  {
    id: 'reliquary',
    name: '살아있는 성유물함',
    icon: 'gi:mimic-chest',
    act: 2,
    tier: 'elite',
    hp: [140, 150],
    poise: 7,
    weak: ['blunt', 'void'],
    row: 0,
    dread: 4,
    eldritch: true,
    traits: ['a2-adaptive'],
    desc: '성인의 유골을 모신 함. 수백 년의 기도를 받아먹고 눈을 떴다.',
    moves: {
      lid: mv.attack('뚜껑 물기', 11, { then: (c, e) => void c.apply(c.p, 'vuln', 1, e), desc: '취약 1' }),
      shards: mv.attack('뼛조각 분출', 4, { hits: 3, melee: false, type: 'pierce' }),
      gaze: mv.horror('성인의 눈', 8, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '정신 피해, 공포 1' }),
      bless: mv.buff(
        '성유물의 축복',
        (c, e) => {
          c.heal(e, 12);
          c.gainBlock(e, 12);
        },
        { extra: ['heal', 'block'], desc: '체력 12 회복, 방어도 12' },
      ),
      // 고해의 딜레마: 봉인이 열리는 턴에 고해를 청한다 — 손을 대 분노를 끊을 것인가(신성모독), 손을 거두고 고해할 것인가
      confess: {
        ...mv.charge('고해성사', 26),
        desc:
          `봉인이 열린다 — 다음 턴 성인의 분노 (붕괴시키면 취소). 그리고 고해를 청한다: 다음 턴 공격하지 않으면 죄를 사하고 (정신력 +${ABSOLVE_SAN}, 해로운 효과 모두 제거), ` +
          `공격하는 순간 신성모독 (성유물함 방어도 ${SACRILEGE_BLOCK}, 정신력 -${SACRILEGE_SAN})`,
        run(c, e) {
          e.mem.charge = 1;
          c.emit({ t: 'text', uid: e.uid, text: '봉인이 열린다…', tone: 'bad' });
          setSt(c, c.p, CONFESSION, 1);
          setUi(c, 'ui:eye', 1);
          c.emit({ t: 'text', uid: e.uid, text: '뚜껑 틈에서 눈이 당신의 고백을 기다린다', tone: 'eldritch' });
        },
      },
      wrath: release({ ...mv.horror('성인의 분노', 8, { dmg: 26 }), ultimate: true, cine: 'beam' }),
    },
    ai: (_c, e) => (e.mem.charge ? 'wrath' : cycle(e, ['lid', 'shards', 'confess', 'gaze', 'bless', 'shards'])),
    visual: { tint: 0x7a6040, glow: 0xffe0a0, scale: 1.25, fx: ['flicker'] },
  },

  // ───────────── 층 수호자 ─────────────
  {
    id: 'high-priest',
    name: '대사제',
    icon: 'gi:pope-crown',
    act: 2,
    tier: 'boss',
    hp: [260, 260],
    poise: 11,
    weak: ['slash', 'void'],
    row: 0,
    dread: 5,
    tags: ['cult'],
    traits: ['a2-offering-rite', 'a2-silence'],
    desc: '잿빛 수도원의 마지막 대사제. 수도원을 아래의 목소리에 바친 대가로, 그의 목숨은 향로의 불처럼 꺼지지 않게 되었다.',
    moves: {
      // 시그니처: 말(기술)의 수를 세는 서약 — 말을 아끼거나, 행동력을 다 쓰는 말로 끝맺어야 한다
      vow: {
        name: '침묵의 서약',
        intent: 'debuff',
        desc: `침묵의 서약 — 남은 말 ${VOW_WORDS}. 기술(기본기 포함)을 쓸 때마다 1씩 준다. 0이 되는 순간 행동력이 남아 있으면 말을 끊긴다 (남은 행동력을 잃고 이번 턴 기술 봉인, 대사제 힘 +${VOW_STR})`,
        run(c, e) {
          e.mem.vowed = 1;
          setSt(c, c.p, VOW, VOW_WORDS);
          cine(c, 'scrawl', { uid: e.uid, text: '침묵하라' });
          c.emit({ t: 'text', uid: 'p', text: `침묵의 서약 — 남은 말 ${VOW_WORDS}`, tone: 'eldritch' });
        },
      },
      blade: mv.attack('제례검', 11, { type: 'slash' }),
      sermon: mv.horror('심연의 설교', 7, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '정신 피해, 공포 1' }),
      offer: mv.buff(
        '봉헌',
        (c, e) => {
          const o = c.alive.find((x) => x.def === 'offering');
          if (!o) {
            c.emit({ t: 'text', uid: e.uid, text: '바칠 제물이 없다', tone: 'good' });
            return;
          }
          c.emit({ t: 'text', uid: o.uid, text: '제물의 비명', tone: 'eldritch' });
          consume(c, o);
          c.apply(e, 'str', 2, e);
          c.heal(e, 18);
          c.loseSanity(5, true);
        },
        { extra: ['heal', 'horror'], desc: '제물 하나를 죽여 힘 +2, 체력 18 회복. 정신력 -5' },
      ),
      bind: mv.summon(
        '제물 결박',
        (c, e) => {
          e.mem.binds = (e.mem.binds ?? 0) + 1;
          c.spawn('offering', 1);
          c.spawn('offering', 1);
        },
        '결박된 제물 2명',
      ),
      call: mv.summon(
        '신도 소집',
        (c, e) => {
          c.spawn('censer-priest', 1);
          if (once(c, 'a2-priest-call')) cine(c, 'whisper', { uid: e.uid, text: '{time}. 이 시각에 깨어 있는 자의 기도는 아래까지 잘 들린다.' });
        },
        '향로 사제 소환',
      ),
      prepare: mv.charge('심연 강림', 28),
      descend: release(mv.attack('심연 강림', 28, { melee: false, type: 'void', ultimate: true, cine: 'blackhole' })),
    },
    onSpawn: (c) => {
      c.spawn('offering', 1);
      c.spawn('offering', 1);
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'descend';
      if (!e.mem.vowed) return 'vow';
      if (hpPct(e) <= 0.5 && !e.mem.p2) {
        e.mem.p2 = 1;
        return 'call';
      }
      const offerings = countDef(c, 'offering');
      const noOffer = (e.mem.binds ?? 0) < 1 && c.row(1).length <= 1 ? 'bind' : 'blade';
      if (e.mem.p2) {
        const m = cycle(e, ['blade', 'offer', 'prepare', 'sermon'], 'c2');
        return m === 'offer' && !offerings ? noOffer : m;
      }
      const m = cycle(e, ['sermon', 'blade', 'offer', 'blade']);
      return m === 'offer' && !offerings ? noOffer : m;
    },
    visual: { tint: 0x40305a, glow: 0xc080ff, scale: 1.4, fx: ['flicker'] },
  },
  {
    id: 'offering',
    name: '결박된 제물',
    icon: 'gi:manacles',
    act: 2,
    tier: 'minion',
    hp: [16, 18],
    poise: 0,
    weak: ['slash', 'pierce', 'blunt'],
    row: 1,
    traits: ['a2-innocent'],
    moves: {
      plead: {
        name: '애원',
        intent: 'special',
        desc: '아무것도 하지 못한다',
        run(c, e) {
          c.emit({ t: 'text', uid: e.uid, text: '살려 주세요…', tone: 'info' });
        },
      },
    },
    ai: () => 'plead',
    visual: { tint: 0x8a7a6a, glow: 0xe0d0b0, scale: 0.7 },
  },
  {
    id: 'ghoul-king',
    name: '구울 왕',
    icon: 'gi:throne-king',
    act: 2,
    tier: 'boss',
    hp: [275, 275],
    poise: 11,
    weak: ['fire', 'pierce'],
    row: 0,
    dread: 5,
    tags: ['undead', 'ghoul'],
    traits: ['a2-corpse-eater', 'a2-pack-lord', 'a2-false-feast'],
    desc: '납골당 깊은 곳, 뼈로 쌓은 왕좌에 앉은 것. 수도원의 모든 죽음은 결국 그의 식탁에 오른다.',
    moves: {
      rend: mv.attack('왕의 손톱', 6, { hits: 2, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 1, e), desc: '출혈 1' }),
      howl: mv.horror('굶주린 포효', 7, {
        desc: '새끼들 힘 +2',
        then(c, e) {
          for (const pup of c.alive.filter((x) => x.def === 'ghoul-pup')) c.apply(pup, 'str', 2, e);
        },
      }),
      feast: {
        name: '왕의 만찬',
        intent: 'heal',
        extra: ['buff'],
        desc: '시체를 먹어 체력 16 회복, 힘 +1. 시체가 없으면 제 새끼를 산 채로 삼킨다 (체력 24 회복, 힘 +1, 당신은 정신력 -4)',
        run(c, e) {
          e.mem.feasts = (e.mem.feasts ?? 0) + 1;
          if (eatCorpse(c)) {
            c.emit({ t: 'text', uid: e.uid, text: '시체를 통째로 삼킨다', tone: 'bad' });
            c.heal(e, 16);
            c.apply(e, 'str', 1, e);
            return;
          }
          const pup = c.alive.find((x) => x.def === 'ghoul-pup');
          if (!pup) {
            c.emit({ t: 'text', uid: e.uid, text: '먹을 것이 없다', tone: 'good' });
            return;
          }
          c.emit({ t: 'text', uid: e.uid, text: '제 새끼를 산 채로 삼킨다', tone: 'eldritch' });
          if (once(c, 'a2-swallow')) {
            cine(c, 'ink', { uid: e.uid });
            cine(c, 'sysmsg', { uid: e.uid, text: '일부 장면이 가려졌습니다.' });
          }
          consume(c, pup);
          c.heal(e, 24);
          c.apply(e, 'str', 1, e);
          c.loseSanity(4, true);
        },
      },
      // 거짓 만찬: 식탁이 비면 '만찬'을 차리는 척하며 당신에게 달려든다 (통찰 5 이상이면 보인다)
      lunge: {
        name: '굶주린 도약',
        intent: 'attack',
        extra: ['heal'],
        dmg: 13,
        melee: true,
        cine: 'corners',
        disguise: { kind: 'heal', label: '왕의 만찬' },
        desc: '먹을 시체가 없다 — 당신에게 달려들어 입힌 피해만큼 회복한다 (만찬으로 위장한다)',
        run(c, e) {
          e.mem.lunges = (e.mem.lunges ?? 0) + 1;
          if (once(c, 'a2-lunge')) cine(c, 'whisper', { uid: e.uid, text: '{time}. 식탁이 비었다. 그러니 너다.' });
          const ds = c.enemyAttack(e, { type: 'slash' });
          if (c.over || e.dead) return;
          const n = ds.reduce((s, d) => s + d.hpLoss, 0);
          if (n > 0) c.heal(e, n);
        },
      },
      call: mv.summon(
        '무리 부르기',
        (c, e) => {
          e.mem.calls = (e.mem.calls ?? 0) + 1;
          c.spawn('ghoul-pup', 0);
          c.spawn('ghoul-pup', 0);
        },
        '구울 새끼 2마리 소환',
      ),
      prep: mv.charge('뼈 왕좌의 일격', 26),
      crush: release(mv.attack('뼈 왕좌의 일격', 26, { ultimate: true, cine: 'crack' })),
    },
    onSpawn: (c) => {
      c.spawn('ghoul-pup', 0);
      c.spawn('ghoul-pup', 0);
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'crush';
      const pups = countDef(c, 'ghoul-pup');
      const food = corpses(c) > 0 || (pups > 0 && hpPct(e) < 0.5);
      const hungry = hpPct(e) < 0.85 && last(e) !== 'feast' && last(e) !== 'lunge';
      if (hungry && food && (e.mem.feasts ?? 0) < 6) return 'feast';
      // 먹을 시체가 없다 — 만찬인 척 당신에게 달려든다 (사이에 두 번은 다른 행동)
      if (hungry && !food && (e.mem.lunges ?? 0) < 3 && !e.hist.slice(-2).includes('lunge')) return 'lunge';
      if (pups === 0 && (e.mem.calls ?? 0) < 2) return 'call';
      return cycle(e, ['rend', 'howl', 'rend', 'prep']);
    },
    visual: { tint: 0x8a8070, glow: 0xff4030, scale: 1.45 },
  },
  {
    id: 'ghoul-pup',
    name: '구울 새끼',
    icon: 'gi:hyena-head',
    act: 2,
    tier: 'minion',
    hp: [16, 18],
    poise: 0,
    weak: ['fire', 'slash'],
    row: 0,
    tags: ['undead', 'ghoul'],
    traits: ['a2-king-prey'],
    moves: {
      bite: mv.attack('물기', 4, { type: 'slash' }),
      scratch: mv.attack('할퀴기', 3, { hits: 2, type: 'slash' }),
    },
    ai: (c, e) => pick(c, e, { bite: 3, scratch: 2 }),
    visual: { tint: 0x6a6450, glow: 0xc0ff60, scale: 0.65 },
  },
  {
    id: 'ash-buried',
    name: '재에 묻힌 것',
    icon: 'gi:half-body-crawling',
    act: 2,
    tier: 'boss',
    hp: [270, 270],
    poise: 12,
    weak: ['arcane', 'blunt'],
    row: 0,
    dread: 6,
    eldritch: true,
    tags: ['ash'],
    traits: ['a2-buried'],
    desc: '수백 년 동안 향로에서 떨어진 재가 납골당 바닥에 쌓였다. 그 재 아래에서 무언가가 자랐다. 교단은 그것을 파내지 않고 매일 새 재를 덮어 주었다.',
    moves: {
      rib: mv.attack('갈비뼈 찌르기', 10, { type: 'pierce' }),
      sweep: mv.attack('재 휩쓸기', 5, { hits: 2, then: (c, e) => void c.apply(c.p, 'frail', 1, e), desc: '허약 1' }),
      prep: mv.charge('잿더미를 끌어올린다', 27),
      collapse: release(mv.attack('무너지는 잿더미', 27, { melee: false, ultimate: true, cine: 'impact' })),
      burrow: {
        name: '파묻히기',
        intent: 'retreat',
        extra: ['summon'],
        cine: 'ink',
        desc: '잿빛 유충 2마리를 부르고 재 속(후열)으로 파고든다. 잿바람이 시야를 덮어 재 속의 의도는 보이지 않는다',
        run(c, e) {
          e.mem.dives = (e.mem.dives ?? 0) + 1;
          e.mem.upT = 0;
          e.mem.subT = 0;
          e.mem.prov = 0;
          c.spawn('ash-larva', 0);
          c.spawn('ash-larva', 0);
          if (c.moveRow(e, 1)) {
            e.mem.sub = 1;
            setUi(c, 'ui:dark', ASH_DARK);
            c.emit({ t: 'text', uid: e.uid, text: '잿더미 속으로 파고든다', tone: 'eldritch' });
            if (once(c, 'a2-bury')) cine(c, 'whisper', { uid: e.uid, text: '재 밑에 묻힌 네 시체: {deaths}구. 곧 하나 더.' });
          }
        },
      },
      // 재 속의 행동은 재에 가려 보이지 않는다 (통찰 5 이상이면 보인다)
      spew: { ...mv.attack('잿가루 분출', 8, { melee: false }), hidden: true },
      song: { ...mv.horror('재 밑의 노래', 6, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '정신 피해, 공포 1' }), hidden: true },
      // 반응형 의도: 재 속에서 공격받으면 이것으로 바뀐다 (특성 a2-buried)
      lash: {
        name: '재 속의 반격',
        intent: 'attack',
        melee: false,
        dmg: (_c, e) => LASH_BASE + LASH_STEP * Math.min(LASH_MAX, e.mem.prov ?? 0),
        desc: `재 속에서 공격받을 때마다 피해 +${LASH_STEP} (최대 +${LASH_STEP * LASH_MAX})`,
        run(c, e) {
          c.enemyAttack(e, { type: 'pierce' });
          e.mem.prov = 0;
        },
      },
      rise: {
        name: '솟아오름',
        intent: 'advance',
        desc: '재를 헤치고 솟아오른다',
        run(c, e) {
          c.moveRow(e, 0);
          e.mem.sub = 0;
          e.mem.upT = 0;
          e.mem.prov = 0;
          setUi(c, 'ui:dark', 0);
          if (once(c, 'a2-rise')) cine(c, 'scrawl', { uid: e.uid, text: '보고 있었다' });
        },
      },
      gasp: {
        name: '헐떡임',
        intent: 'special',
        desc: '재 밖으로 끌려 나와 숨을 고른다 (행동 없음)',
        run(c, e) {
          delete e.mem.stranded;
          e.mem.upT = 0;
          c.emit({ t: 'text', uid: e.uid, text: '드러난 살이 공기에 닿아 오그라든다', tone: 'good' });
        },
      },
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'collapse';
      if (e.mem.stranded) return 'gasp';
      if (e.mem.sub) {
        if (e.row === 0) {
          e.mem.sub = 0;
          e.mem.prov = 0;
          e.mem.stranded = 1;
          setUi(c, 'ui:dark', 0);
          return 'gasp';
        }
        e.mem.subT = (e.mem.subT ?? 0) + 1;
        if (e.mem.subT >= 4 && c.row(0).length < 3) return 'rise';
        return cycle(e, ['spew', 'song'], 'cs');
      }
      e.mem.upT = (e.mem.upT ?? 0) + 1;
      if (e.mem.upT >= 4 && (e.mem.dives ?? 0) < 3 && c.row(1).length < 3) return 'burrow';
      return cycle(e, ['rib', 'sweep', 'prep', 'rib'], 'cu');
    },
    visual: { tint: 0x4a4640, glow: 0xff7a30, scale: 1.5, fx: ['flicker'] },
  },
  {
    id: 'ash-larva',
    name: '잿빛 유충',
    icon: 'gi:maggot',
    act: 2,
    tier: 'minion',
    hp: [20, 22],
    poise: 0,
    weak: ['fire', 'slash'],
    row: 0,
    tags: ['ash'],
    desc: '재에 묻힌 것의 몸에서 떨어져 나온 유충. 쉬지 않고 재를 날라 어미를 덮는다.',
    moves: {
      gnaw: mv.attack('갉아먹기', 5, { type: 'slash' }),
      curl: mv.block('재 속에 웅크림', 6, { desc: '방어도 6' }),
    },
    ai: (c, e) => pick(c, e, { gnaw: 3, curl: 1 }),
    visual: { tint: 0x8a8478, glow: 0xffb060, scale: 0.7 },
  },

  // ───────────── 계층군주 ─────────────
  {
    id: 'bellkeeper',
    name: '종지기',
    icon: 'gi:ringing-bell',
    act: 2,
    tier: 'boss',
    hp: [330, 330],
    poise: 12,
    weak: ['fire', 'void'],
    row: 0,
    dread: 7,
    eldritch: true,
    tags: ['undead'],
    traits: ['a2-bell-bound'],
    desc: '수도원이 재에 묻힌 뒤에도 종을 멈추지 않은 자. 그의 등은 종의 모양으로 굽었고, 심장은 종추처럼 뛴다.',
    moves: {
      hammer: mv.attack('종추 내려치기', 13),
      toll1: toll(1),
      toll2: toll(2),
      toll3: toll(3),
      summon: mv.summon(
        '수련사 소집',
        (c, e) => {
          e.mem.calls = (e.mem.calls ?? 0) + 1;
          c.spawn('bell-acolyte', 1);
        },
        '타종 수련사 소환',
      ),
      prepare: mv.charge('마지막 종을 당긴다', 30, {
        then(c, e) {
          if (once(c, 'a2-lastbell')) cine(c, 'whisper', { uid: e.uid, text: '{time}. 이 종은 당신 쪽에서도 울린다.' });
        },
      }),
      doom: release({
        ...mv.horror('종말의 종', 8, { dmg: 30, type: 'arcane' }),
        ultimate: true,
        cine: 'crack',
        run(c, e) {
          e.mem.tolls = 0;
          cine(c, 'impact', { uid: e.uid });
          // 마지막 종이 울릴 때마다 화면 유리에 금이 남는다
          setUi(c, 'ui:cracks', Math.min(3, (c.s.vars['ui:cracks'] ?? 0) + 1));
          c.enemyAttack(e, { type: 'arcane' });
          if (!c.over) c.horror(e, 8);
        },
      }),
      flurry: mv.attack('광란의 종추', 5, { hits: 3 }),
      dirge: mv.horror('깨진 종의 장송곡', 8, { then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '정신 피해, 약화 1' }),
      // 종을 잃은 종지기는 종추처럼 뛰는 제 심장을 울린다
      heart: {
        ...mv.horror('심장의 종', 7, { desc: '깨진 종 대신 제 심장을 울린다 — 정신 피해, 종지기 힘 +1' }),
        extra: ['buff'],
        run(c, e) {
          cine(c, 'bell', { uid: e.uid });
          c.horror(e, 7);
          if (c.over || e.dead) return;
          c.apply(e, 'str', 1, e);
        },
      },
    },
    onSpawn: (c) => void c.spawn('great-bell', 1),
    ai: (c, e) => {
      const bell = countDef(c, 'great-bell') > 0;
      if (e.mem.charge) {
        if (bell) return 'doom';
        delete e.mem.charge;
      }
      if (!bell) return cycle(e, ['flurry', 'heart', 'hammer', 'dirge'], 'c2');
      const tolls = e.mem.tolls ?? 0;
      if (tolls >= 3) return 'prepare';
      let m = cycle(e, ['toll', 'hammer', 'toll', 'summon', 'hammer']);
      if (m === 'summon' && ((e.mem.calls ?? 0) >= 2 || countDef(c, 'bell-acolyte') >= 2 || c.row(1).length >= 3)) m = 'toll';
      return m === 'toll' ? `toll${Math.min(3, tolls + 1)}` : m;
    },
    visual: { tint: 0x4a3a2a, glow: 0xffb040, scale: 1.55, fx: ['flicker'] },
  },
  {
    id: 'great-bell',
    name: '대종',
    icon: 'gi:bell-shield',
    act: 2,
    tier: 'minion',
    hp: [80, 80],
    poise: 0,
    weak: ['blunt', 'arcane'],
    resist: { slash: 0.5 },
    row: 1,
    traits: ['a2-great-bell'],
    moves: {
      hum: mv.horror('잔향', 3),
      still: {
        name: '흔들림',
        intent: 'special',
        desc: '종이 천천히 흔들린다',
        run() {},
      },
    },
    ai: (_c, e) => cycle(e, ['hum', 'still']),
    visual: { tint: 0x7a6230, glow: 0xffd070, scale: 1.05 },
  },

  // ───────────── 추적자 / 균열 수호자 ─────────────
  {
    id: 'candle-lure',
    name: '촛불을 든 것',
    icon: 'gi:candlebright',
    act: 2,
    tier: 'elite',
    hp: [150, 150],
    poise: 7,
    weak: ['fire', 'pierce'],
    row: 0,
    dread: 4,
    tags: ['ash', 'beast'],
    traits: ['a2-lure'],
    desc: '향 연기가 자욱한 회랑 저편에서 작은 촛불이 흔들린다. 길 잃은 수도사인 줄 알고 다가간 자들은 돌아오지 않았다.',
    moves: {
      lure: mv.horror('손짓하는 촛불', 5, {
        desc: '등불 -10, 약화 1',
        then(c, e) {
          c.run.light = Math.max(0, c.run.light - 10);
          c.emit({ t: 'text', uid: 'p', text: '등불이 흐려진다', tone: 'bad' });
          lureDark(c);
          c.apply(c.p, 'weak', 1, e);
        },
      }),
      // 할퀴며 등불을 통째로 낚아채 제 촛불에 옮긴다 — 쓰러뜨리면 되찾는다 (특성 a2-lure)
      snatch: {
        name: '등불 강탈',
        intent: 'attack',
        extra: ['debuff'],
        dmg: 11,
        melee: true,
        desc: `할퀴고 등불 ${SNATCH}을 빼앗아 제 촛불에 옮긴다 — 쓰러뜨리면 되찾는다 (등불이 25 미만이면 이것의 공격 피해 +25%)`,
        run(c, e) {
          c.enemyAttack(e, { type: 'slash' });
          if (c.over || e.dead) return;
          const n = Math.min(SNATCH, c.run.light);
          if (n <= 0) {
            c.emit({ t: 'text', uid: e.uid, text: '빼앗을 불빛이 남아 있지 않다', tone: 'info' });
            return;
          }
          cine(c, 'handprints', { uid: e.uid, n: 3 });
          c.run.light -= n;
          e.mem.stolen = (e.mem.stolen ?? 0) + n;
          c.emit({ t: 'text', uid: 'p', text: `등불을 빼앗겼다 (-${n})`, tone: 'bad' });
          lureDark(c);
        },
      },
      bite: mv.attack('아가리', 13, { type: 'pierce' }),
      thrash: mv.attack('휘감기', 5, { hits: 3 }),
      smoke: mv.block('연기 속으로', 10, { then: (c, e) => void c.apply(e, 'evasive', 1, e), desc: '방어도 10, 회피 1' }),
      open: mv.charge('아가리가 열린다', 30),
      swallow: release(mv.attack('삼키기', 30, { type: 'pierce', ultimate: true, cine: 'corners' })),
    },
    ai: (_c, e) => (e.mem.charge ? 'swallow' : cycle(e, ['lure', 'snatch', 'open', 'smoke', 'bite', 'thrash'])),
    visual: { tint: 0x2a2624, glow: 0xffe080, scale: 1.35, fx: ['float', 'flicker'] },
  },
  {
    id: 'inverted-saint',
    name: '거꾸로 매달린 성인',
    icon: 'gi:tarot-12-the-hanged-man',
    act: 2,
    tier: 'elite',
    hp: [170, 170],
    poise: 8,
    weak: ['slash', 'fire'],
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['undead'],
    traits: ['a2-miracle'],
    desc: '균열 너머의 수도원에선 모든 것이 뒤집혀 있다. 그곳의 성인은 거꾸로 매달린 채 거꾸로 된 기적을 행한다.',
    moves: {
      hymn: mv.horror('거꾸로 된 찬송', 8, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '정신 피해, 공포 1' }),
      nails: mv.attack('성흔의 못', 4, { hits: 3, melee: false, type: 'pierce', then: (c, e) => void c.apply(c.p, 'bleed', 2, e), desc: '출혈 2' }),
      // 당신을 거꾸로 매단다 — 몸과 마음이 뒤바뀐 채 못이 박힌다
      hang: {
        name: '거꾸로 매달기',
        intent: 'attack',
        extra: ['debuff'],
        dmg: 4,
        hits: 2,
        melee: false,
        cine: 'flip',
        desc: '먼저 거꾸로 매단 뒤 못을 박는다. 거꾸로 매달림 2 — 2턴 동안 체력 피해는 정신력을, 정신력 손실은 체력을 깎는다',
        run(c, e) {
          if (c.apply(c.p, HANGED, 2, e) > 0) {
            setUi(c, 'ui:swap', 1);
            c.emit({ t: 'text', uid: 'p', text: '세상이 뒤집혔다 — 피가 머리로 쏠린다', tone: 'eldritch' });
          }
          c.enemyAttack(e, { type: 'pierce' });
        },
      },
      invert: {
        name: '뒤집힌 축복',
        intent: 'debuff',
        extra: ['block'],
        desc: '당신의 방어도를 모두 빼앗아 제 것으로 삼는다',
        run(c, e) {
          const b = c.p.block;
          if (b <= 0) {
            c.emit({ t: 'text', uid: e.uid, text: '빼앗을 것이 없다', tone: 'info' });
            return;
          }
          c.p.block = 0;
          c.emit({ t: 'text', uid: 'p', text: `방어도 -${b}`, tone: 'bad' });
          c.gainBlock(e, b);
        },
      },
      prepare: {
        name: '기적 준비',
        intent: 'charge',
        charging: true,
        desc: '다음 턴 체력 40을 회복하고 해로운 효과를 털어낸다 (붕괴시키면 취소)',
        run(c, e) {
          e.mem.charge = 1;
          c.emit({ t: 'text', uid: e.uid, text: '거꾸로 된 기적이 일어나려 한다…', tone: 'eldritch' });
        },
      },
      miracle: release({
        name: '거꾸로 된 기적',
        intent: 'heal',
        ultimate: true,
        cine: 'timestop',
        desc: '체력 40 회복, 해로운 효과 제거. 당신은 정신력 -4',
        run(c, e) {
          for (const id of ['weak', 'vuln', 'frail', 'bleed', 'poison', 'burn', 'mark', 'madden', 'corrode', 'doom']) c.clear(e, id);
          c.heal(e, 40);
          c.loseSanity(4, true);
        },
      }),
    },
    ai: (_c, e) => (e.mem.charge ? 'miracle' : cycle(e, ['nails', 'hang', 'nails', 'prepare', 'hymn', 'invert'])),
    visual: { tint: 0x5a4a60, glow: 0xffe0f0, scale: 1.35, fx: ['float', 'flicker'] },
  },
]);
