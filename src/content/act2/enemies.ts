import { ENEMIES, reg } from '../../engine/registry';
import { josa } from '../../engine/josa';
import { isEnemy, MAX_ROW, unguarded, type Combat } from '../../engine/combat';
import { cycle, hpPct, last, opener, pick } from '../../engine/ai';
import type { DamageCtx, DmgType, EnemyUnit, MoveDef } from '../../engine/types';
import { countDef, mv, others, release } from '../moves';
import { cine, execute, setUi } from '../lib';
import {
  ABSOLVE_SAN,
  BELFRY_ACOLYTES,
  BELFRY_CALL,
  BELFRY_CYCLE,
  BELFRY_FRENZY,
  BELFRY_NAME,
  BELFRY_PCT,
  BELL_RAGE_STR,
  COMBO_DMG,
  COMBO_HITS,
  COMBO_SAN,
  CONFESSION,
  DIRGE_SAN,
  FALL_AP,
  FALL_BLOCK,
  FALL_PCT,
  FALL_POISE,
  FALL_RULE,
  FALL_SELF,
  FLURRY_DMG,
  FLURRY_HITS,
  HANGED,
  HEART_SAN,
  HUSH,
  HUSH_RULE,
  KEEPER_CYCLE,
  KEEPER_HAMMER,
  KEEPER_HP,
  KEEPER_POISE,
  KNELL_DREAD,
  KNELL_HP_PCT,
  KNELL_SAN,
  MUFFLE_SAN,
  PENANCE,
  PENANCE_HP,
  RESONANCE,
  RING_MULT,
  SACRILEGE_BLOCK,
  SACRILEGE_SAN,
  SILENCE_DMG,
  SILENT_MULT,
  TANGLED,
  TOLL_SAN,
  VOW,
  VOW_STR,
  VOW_STR_TIMES,
  VOW_WORDS,
  REQUIEM_HIT,
  advanceRequiem,
  belfry,
  crashKeeper,
  cutFall,
  cutKnell,
  cutRequiem,
  cutRope,
  endFall,
  endKnell,
  endRequiem,
  hush,
  hushCost,
  intentNow,
  knellNeed,
  landFall,
  myHit,
  once,
  react,
  refreshIntent,
  requiemHit,
  setIntent,
  setSt,
  startKnell,
  startRequiem,
  tightenKnell,
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

// ───────────── 일반 적 패턴 수치 (2026-10: 낮은 층은 위협을 늘리지 않고 갈래만 늘린다) ─────────────

/** 성가대원: 「마지막 소절」 정신 피해 */
export const VERSE_SAN = 8;
/** 향로 사제: 흔들린 향로로 의식이 끊기는 횟수 (전투당) */
export const LAPSE_MAX = 2;
/** 순교자: 「앞을 막아선다」 방어도 */
export const STAND_BLOCK = 8;
/** 납골당 구울: 「시체 포식」 회복량 */
export const FEAST_HEAL = 12;
/** 밀랍 수사: 「밀랍 봉인」 회복량·방어도 */
export const SEAL_HEAL = 14;
export const SEAL_BLOCK = 8;
/** 빙의된 수도사: 악령이 다시 깃들 때 회복량 */
export const REPOSSESS_HEAL = 12;
/** 벽에 갇힌 수녀: 「벽돌 쌓기」 보호막 */
export const BRICK_BARRIER = 8;
/** 타종 수련사: 「조종」 정신 피해 */
export const KNELL_TOLL_SAN = 4;
/** 뼈지네: 파고든 턱이 내 턴마다 빨아 가는 체력 */
export const LATCH_DRAIN = 2;
/** 고해 신부: 「판결」 기본 피해, 장부의 죄 하나마다 더하는 피해 */
export const VERDICT_DMG = 6;
export const SIN_DMG = 3;
/** 고해 신부: 「고해를 듣는다」 다음 내 턴에 기술 하나마다 적는 죄의 상한, 고해를 다그치는 정신 피해 */
export const HEAR_MAX = 3;
export const LISTEN_SAN = 4;
/** 성수반의 손: 더 뻗어 나오는 손 상한 */
export const HANDS_MAX = 2;

/** 숨은 상태: 내 손이 누구를 치고 누구를 무너뜨리는지 수도원의 것들이 지켜본다 (순교자·벽에 갇힌 수녀) */
export const WATCH2 = 'a2-watch';
/** 뼈지네의 파고든 턱 (나에게) */
export const LATCHED = 'a2-latched';
/** 고해 신부의 장부에 적힌 죄 */
export const SINS = 'a2-sins';
/** 성수반에서 더 뻗어 나온 손 */
export const HANDS = 'a2-hands';

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
      if (e.mem.cres >= 3) startRequiem(c, e);
    },
    { extra: ['block'], desc: '크레셴도 +1 (3이 되면 레퀴엠이나 대합창을 준비한다), 모든 아군 방어도 4' },
  );
}

/** 방금 울린 대종이 공명한다 — 다음 당신 턴이 끝날 때까지 (종의 다음 차례가 시작되면 잠잠해진다) */
function resonate(c: Combat) {
  const bell = c.alive.find((x) => x.def === 'great-bell');
  if (!bell) return;
  bell.mem.resT = c.s.turn + 1;
  setSt(c, bell, RESONANCE, 1);
  c.emit({ t: 'text', uid: bell.uid, text: '종이 떨고 있다. 지금이다', tone: 'good' });
}

/** 종지기의 타종 */
function toll(step: number): MoveDef {
  return {
    ...mv.horror(`타종 (${step}/3)`, TOLL_SAN, {
      desc:
        `종지기 힘 +1. 울린 대종은 다음 턴 동안 공명한다 (받는 피해 +${Math.round((RING_MULT - 1) * 100)}%). ` +
        '세 번 울리면 마지막 종의 카운트다운이 시작된다. 2턴 뒤 네 번째 종소리를 들으면 정신이 무너진다',
    }),
    run(c, e) {
      if (countDef(c, 'great-bell') === 0) {
        c.emit({ t: 'text', uid: e.uid, text: '깨진 종은 울리지 않는다', tone: 'good' });
        return;
      }
      cine(c, 'bell', { uid: e.uid });
      if (once(c, 'a2-toll')) cine(c, 'sysmsg', { uid: e.uid, text: '음량: 최대. 이 소리는 끌 수 없습니다.' });
      c.horror(e, TOLL_SAN);
      if (c.over) return;
      e.mem.tolls = (e.mem.tolls ?? 0) + 1;
      c.apply(e, 'str', 1, e);
      c.emit({ t: 'text', uid: e.uid, text: `종이 ${e.mem.tolls}번 울렸다`, tone: 'eldritch' });
      if (e.mem.tolls >= 3) startKnell(c, e);
      resonate(c);
    },
  };
}

/** 종탑의 수련사들: 지금 부를 수 있는 수 (한 번에 BELFRY_CALL, 함께 BELFRY_ACOLYTES까지, 후열 자리만 — 전열로 밀려 나와 종지기보다 먼저 움직이지 않게) */
function callable(c: Combat): number {
  return Math.max(0, Math.min(BELFRY_CALL, BELFRY_ACOLYTES - countDef(c, 'bell-acolyte'), MAX_ROW - c.row(1).length));
}

/**
 * 종탑의 광란 (2막)의 행동: 끊어 둔 종은 다음 차례에 떨어진다. 끊으려던 밧줄은 기절로 밀려도 다음 차례에 끊는다
 * (붕괴로 끊기면 mem.cutDue를 지워 순서대로 넘어간다). 나머지는 BELFRY_CYCLE 순서
 */
function belfryMove(c: Combat, e: EnemyUnit): string {
  if (e.mem.fall) return 'fall';
  if (e.mem.cutDue) return 'cut';
  const m = cycle(e, BELFRY_CYCLE, 'c2');
  if (m === 'cut') e.mem.cutDue = 1;
  if (m === 'call' && callable(c) <= 0) return 'dirge';
  return m;
}

/** 등불이 어두울수록 화면도 어둡다 (촛불을 든 것 — 화면에만) */
function lureDark(c: Combat) {
  setUi(c, 'ui:dark', Math.max(0, Math.min(54, Math.round((60 - c.run.light) * 0.9))));
}

// ───────────── 일반 적의 반응 (2026-10 패턴) ─────────────

/** 내 손을 지켜보기 시작한다 (전투 시작 시 — 숨은 상태 WATCH2) */
function watch2(c: Combat) {
  c.p.st[WATCH2] = 1;
}

/** 후열의 교단 동료가 내 턴에 맞았다: 순교자가 앞을 막아선다 */
function intercede(c: Combat, d: DamageCtx) {
  const t = d.tgt;
  if (!myHit(c, d) || !isEnemy(t) || t.row !== 1 || d.amount <= 0 || !hasTag(t, 'cult')) return;
  for (const m of c.alive) if (m.def === 'martyr' && m !== t && m.row === 0) react(c, m, 'stand', '순교자가 앞을 막아선다', 'bad');
}

/**
 * 동료가 내 턴에 무너졌다(붕괴): 벽에 갇힌 수녀가 다음 차례에 하던 행동과 함께 그 동료를 회벽으로 감싼다 (수녀마다 전투당 한 번).
 * 의도는 그대로 두고 강화 표시만 더한다 (회벽은 특성 a2-plaster가 수녀의 차례 시작에 바른다)
 */
function plaster(c: Combat, victim: EnemyUnit) {
  if (c.s.phase !== 'player') return;
  for (const n of c.alive) {
    if (n.def !== 'walled-nun' || n === victim || n.mem.plastered || !n.intent) continue;
    if (n.broken === 2 || (n.st.stun ?? 0) > 0) continue;
    n.mem.plastered = 1;
    n.mem.brickT = Number(victim.uid.slice(1));
    if (n.intent.move !== 'brick' && !n.intent.extra?.includes('buff')) n.intent = { ...n.intent, extra: [...(n.intent.extra ?? []), 'buff'] };
    c.emit({ t: 'text', uid: n.uid, text: '무너진 자를 회벽으로 감싸려 한다', tone: 'bad' });
  }
}

/** 고해를 듣는 고해 신부가 방금 내가 쓴 기술을 장부에 적는다 (고해 신부마다 HEAR_MAX까지) */
function hear(c: Combat) {
  for (const e of c.alive) {
    if (e.def !== 'confessor' || e.mem.hear !== c.s.turn || e.broken === 2 || (e.mem.heard ?? 0) >= HEAR_MAX) continue;
    e.mem.heard = (e.mem.heard ?? 0) + 1;
    c.apply(e, SINS, 1, e);
    c.emit({ t: 'text', uid: e.uid, text: '장부에 죄를 적는다', tone: 'eldritch' });
    if (e.intent?.move === 'verdict') refreshIntent(c, e);
  }
}

/** 뼈지네의 턱이 빠진다 */
function unlatch(c: Combat, e: EnemyUnit) {
  e.mem.latched = 0;
  setSt(c, c.p, LATCHED, Math.max(0, (c.p.st[LATCHED] ?? 0) - 1));
  c.emit({ t: 'text', uid: e.uid, text: '턱이 빠졌다', tone: 'good' });
}

reg.statuses([
  {
    id: WATCH2,
    name: '지켜보는 수도원',
    icon: 'gi:eye-target',
    kind: 'buff',
    hidden: true,
    desc: '수도원의 것들이 내 손이 누구를 치는지, 무엇을 말하는지 지켜본다',
    hooks: {
      onDamageDealt(c, s, d) {
        if (s.unit === c.p) intercede(c, d);
      },
      afterSkill(c, s, u) {
        if (s.unit === c.p && !u.echo) hear(c);
      },
      onBreak(c, s, victim) {
        if (s.unit === c.p) plaster(c, victim);
      },
    },
  },
  {
    id: LATCHED,
    name: '파고든 턱',
    icon: 'gi:insect-jaws',
    kind: 'debuff',
    desc: `뼈지네 {n}마리가 살을 파고들었다. 내 턴이 시작될 때마다 한 마리당 체력 ${LATCH_DRAIN}${josa(LATCH_DRAIN, '을')} 빨린다 (뼈지네가 회복). 그 뼈지네를 공격하면 떨어진다`,
    tickStart(c, u) {
      if (isEnemy(u)) return;
      const bugs = c.alive.filter((x) => x.def === 'bone-centipede' && x.mem.latched);
      setSt(c, u, LATCHED, bugs.length);
      for (const b of bugs) {
        if (c.over) return;
        c.loseHp(u, LATCH_DRAIN, 'latch');
        c.heal(b, LATCH_DRAIN);
      }
    },
  },
  {
    id: SINS,
    name: '기록된 죄',
    icon: 'gi:quill-ink',
    kind: 'buff',
    desc: `고해 신부가 장부에 적은 죄 {n}. 「판결」 피해가 죄 하나마다 +${SIN_DMG}. 판결을 내리면 장부를 비운다`,
  },
  {
    id: HANDS,
    name: '뻗은 손',
    icon: 'gi:grab',
    kind: 'buff',
    desc: '세례반에서 더 뻗어 나온 손 {n}. 「움켜쥐기」가 손 하나마다 한 번 더 움켜쥔다. 내 공격에 맞으면 손 하나가 움츠러든다',
  },
]);

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
    desc:
      '체력이 절반 이하가 되면 몸속의 악령이 빠져나온다. 수도사 힘 -2, 내 정신력 -3. ' +
      `두 번째 목소리가 그 악령을 부른다: 빠져나온 악령은 한 번 움직인 뒤 몸으로 돌아가려 하고 (「다시 깃든다」, 한 차례 앞서 보인다), 깃들면 수도사 체력 ${REPOSSESS_HEAL} 회복, 힘 +2. ` +
      '그 전에 악령을 쓰러뜨리면 막는다. 돌아가려는 악령은 후열에 있어도 근접으로 닿는다',
    hooks: {
      onDamageTaken(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.exorcised || e.hp <= 0 || hpPct(e) > 0.5) return;
        e.mem.exorcised = 1;
        c.emit({ t: 'text', uid: e.uid, text: '입에서 검은 것이 기어 나온다', tone: 'eldritch' });
        c.apply(e, 'str', -2, e);
        c.spawn('loose-spirit', 1);
        c.loseSanity(3, true);
        c.emit({ t: 'text', uid: e.uid, text: '들어오라. 두 번째 목소리가 부른다', tone: 'eldritch' });
      },
      onDeath(c, s) {
        if (!isEnemy(s.unit)) return;
        // 깃들 몸이 사라졌다: 돌아가려던 악령은 다시 떠돈다 (내 턴이면 그 자리에서 의도가 바뀐다. 움직인 횟수는 그대로)
        for (const sp of c.alive) {
          if (sp.def !== 'loose-spirit' || !sp.mem.called) continue;
          sp.mem.called = 0;
          sp.mem.reachable = 0;
          sp.mem.acts = Math.max(0, (sp.mem.acts ?? 0) - 1);
          c.emit({ t: 'text', uid: sp.uid, text: '깃들 몸이 사라졌다', tone: 'info' });
          if (c.s.phase === 'player') c.planIntent(sp);
        }
      },
    },
  },
  {
    id: 'a2-carapace',
    name: '뼈 껍데기',
    desc: '마디마다 뼈를 덧댔다. 근접 공격으로 받는 피해 25% 감소',
    hooks: {
      modDamageIn(_c, _s, d) {
        if (d.melee && d.attack) d.mult *= 0.75;
      },
    },
  },
  {
    id: 'a2-crescendo',
    name: '크레셴도',
    desc:
      '지휘하거나 뒤엉킨 성가를 부를 때마다 크레셴도가 쌓인다. 3이 되면 노래를 준비한다: 첫 번째와 세 번째는 레퀴엠, 그 사이엔 대합창. ' +
      `레퀴엠은 2턴 뒤 끝난다. 끝까지 들은 자는 사경 없이 죽는다 (결계가 한 번 막는다). 성가대원 하나를 쓰러뜨리거나 성가대장에게 피해 ${REQUIEM_HIT}을 주거나 ` +
      '성가대장을 붕괴시키면 끊긴다. 성가대장은 후열에 있어도 근접으로 닿는다. 대합창을 준비할 때 붕괴시키면 크레셴도가 처음으로 돌아간다',
    hooks: {
      // 레퀴엠이 끊기는 길: 성가대장 붕괴 / 성가대장에게 피해 (막힌 피해·지속 피해도 센다) / 성가대원 하나가 쓰러짐
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || !e.mem.req) return;
        if (d.broke) cutRequiem(c, e, '붕괴로 지휘가 끊겼다');
        else requiemHit(c, e, unguarded(d));
      },
      onAnyDeath(c, s, victim) {
        const e = s.unit;
        if (!isEnemy(e) || !e.mem.req || !isEnemy(victim) || victim.def !== 'chorister') return;
        cutRequiem(c, e, '성가대원이 쓰러져 레퀴엠이 끊겼다');
      },
      onDeath(c, s) {
        if (isEnemy(s.unit) && s.unit.mem.req) endRequiem(c, s.unit);
      },
    },
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
    desc: '마지막으로 받은 공격 속성의 피해 50% 저항 (속성을 바꿔 가며 공격할 것). 자기 턴이 시작되면 적응이 풀린다',
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
      `결박된 제물을 바쳐 회복하고 강해진다. 제물이 하나라도 살아 있으면 쓰러지는 순간 제물 하나를 태워 체력 ${Math.round(RISE_PCT * 100)}%로 다시 일어선다 ` +
      '(한 번, 제물의 비명에 정신력 -4). 살아 있는 제물을 먼저 모두 거두면 막을 수 있다. 제물은 후열에 있어도 근접으로 닿는다. 대사제가 끝내 쓰러지면 남은 제물들은 풀려나 달아난다',
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
          c.restorePoise(e, false);
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
      '후열의 재 속에 파묻혀 있는 동안 받는 피해 30% 감소, 자기 턴이 끝날 때 체력 6 회복. 재에 가려 의도가 보이지 않는다 (통찰 3 이상이면 보인다). ' +
      `재 속에서 공격받으면 의도가 '재 속의 반격'으로 바뀐다. 맞을 때마다 반격 피해 +${LASH_STEP} (최대 +${LASH_STEP * LASH_MAX}). ` +
      '재를 덮어 주던 잿빛 유충이 모두 쓰러지면 재 밖으로 드러나 취약해진다. 유충은 근접으로도 닿는다',
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
        c.emit({ t: 'text', uid: e.uid, text: e.mem.prov === 1 ? '재 속의 것이 이쪽을 알아챘다' : `재가 들끓는다 (반격 +${LASH_STEP * e.mem.prov})`, tone: 'eldritch' });
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
      `잠잠한 종은 받는 피해 ${Math.round((1 - SILENT_MULT) * 100)}% 감소. 종지기가 타종한 직후엔 공명해서 다음 내 턴 동안 받는 피해 +${Math.round((RING_MULT - 1) * 100)}%. 종소리에 맞춰 쳐야 깨진다. ` +
      `후열에 있어도 근접으로 닿는다. 종지기는 이 종이 있어야 타종할 수 있다. 종이 깨지면 종지기가 비틀거리다 격노한다: 기절 1, 힘 +${BELL_RAGE_STR}. 종탑의 광란이 시작된다`,
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
      // 마지막 종 퍼즐: 대종에 남은 피해를 목표 띠에 그때그때 보여 준다
      onDamageTaken(c, s) {
        if (isEnemy(s.unit)) knellNeed(c, s.unit);
      },
      onDeath(c, s) {
        const bk = c.alive.find((x) => x.def === 'bellkeeper');
        if (!bk) return;
        cine(c, 'shatter', { uid: s.unit.uid });
        c.emit({ t: 'text', uid: bk.uid, text: '대종이 깨지자 종지기가 비틀거린다', tone: 'good' });
        c.apply(bk, 'stun', 1, s.unit);
        c.apply(bk, 'str', BELL_RAGE_STR, s.unit);
        if (bk.mem.knell === 1 || bk.mem.knell === 2) {
          endKnell(c, bk);
          c.emit({ t: 'text', uid: bk.uid, text: '깨진 종은 마지막 종을 울리지 못한다', tone: 'good' });
        }
        // 대종이 깨지면 종탑의 광란 (체력으로 이미 시작됐으면 그대로)
        belfry(c, bk);
      },
    },
  },
  {
    id: 'a2-bell-bound',
    name: '종에 묶인 자',
    desc:
      '대종을 울릴 때마다 강해진다. 세 번 울리면 마지막 종의 카운트다운이 시작된다. 2턴 뒤 네 번째 종소리를 들으면 정신이 무너진다 ' +
      `(정신 피해 ${KNELL_SAN}, 공포 ${KNELL_DREAD}, 최대 체력의 ${Math.round(KNELL_HP_PCT * 100)}% 피해, 방어도 무시). ` +
      '그 전에 대종을 깨뜨리거나 종지기를 붕괴시키면 끊긴다. 대종은 근접으로도 닿는다. 종이 울리는 턴에 기술을 하나도 쓰지 않으면 귀를 막아 듣지 않는다 ' +
      `(대신 먹먹한 종소리에 정신 피해 ${MUFFLE_SAN}, 대종은 남아 다시 울린다). ` +
      `때때로 침묵을 명한다. 그다음 내 턴엔 두 번째 기술부터 쓸 때마다 정신력을 잃는다 (${hushCost(2)}, ${hushCost(3)}, ${hushCost(4)} …). ` +
      `체력이 ${Math.round(BELFRY_PCT * 100)}% 이하가 되거나 대종이 깨지면 종탑의 광란: ${BELFRY_NAME}${josa(BELFRY_NAME, '이')} 되어 새 버팀을 두르고 행동할 때마다 힘 +${BELFRY_FRENZY}. ` +
      `종탑의 밧줄을 끊어 종을 떨어뜨린다. 방어도 ${FALL_BLOCK} 이상으로 턴을 마치면 종이 종지기를 덮친다. ` +
      `못 숨으면 방어도를 무시하고 최대 체력의 ${Math.round(FALL_PCT * 100)}% 피해, 다음 턴 행동력 -${FALL_AP}. ` +
      '수련사를 한 번에 여럿 부르고 제 심장을 종처럼 울린다',
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        // 붕괴하면 줄을 놓친다: 마지막 종의 카운트다운도, 떨어지는 종도, 끊으려던 밧줄도
        if (d.broke) {
          cutKnell(c, e, '붕괴로 종지기가 밧줄을 놓쳤다');
          cutFall(c, e);
          delete e.mem.cutDue;
        }
        // 체력으로 맞는 문턱은 잃은 체력 그대로 (버팀 배율과 상관없이)
        if (!e.form && !e.dead && e.hp > 0 && e.hp <= e.maxHp * BELFRY_PCT) belfry(c, e);
      },
      onUnitTurnStart(c, s) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        const rests = e.broken === 2 || (e.st.stun ?? 0) > 0;
        e.mem.acts = rests ? 0 : 1;
        // 끊어 둔 종은 종지기가 기절해 있어도 떨어진다 (붕괴하면 그 전에 끊긴다)
        if (e.mem.fall && rests && e.broken !== 2) landFall(c, e);
      },
      // 광란: 2막에서 행동한 차례가 끝날 때마다 힘이 붙는다 (다음 의도의 숫자에 바로 보인다)
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || !e.form || !e.mem.acts || BELFRY_FRENZY <= 0) return;
        e.mem.acts = 0;
        c.apply(e, 'str', BELFRY_FRENZY, e);
      },
      onDeath(c, s) {
        if (!isEnemy(s.unit) || !s.unit.dead) return;
        if (s.unit.mem.knell) endKnell(c, s.unit);
        if (s.unit.mem.fall) endFall(c, s.unit);
        // 명한 자가 쓰러지면 침묵령도 풀리고, 기울었던 종탑도 바로 선다
        setSt(c, c.p, HUSH, 0);
        setUi(c, 'ui:tilt', 0);
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
    desc: '등불이 25 미만이면 공격 피해 +25%. 손짓하는 촛불로 등불을 흐리고 등불을 강탈해 제 촛불에 옮긴다. 강탈당한 등불은 쓰러뜨리면 되찾는다. 향 연기 속에 숨어 얻은 회피는 자기 턴이 오면 사라진다',
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
    desc: '기적을 준비하는 동안 붕괴시키지 못하면 체력 40을 회복하고 해로운 효과를 털어낸다',
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
      `침묵의 서약을 지운다. 행동력을 쓰는 기술(기본기 포함)을 쓸 때마다 남은 말이 줄고 ${VOW_WORDS}번째 말에서 서약이 새로 시작된다. ` +
      `그 순간 행동력이 남아 있으면 말을 끊긴다: 남은 행동력을 잃고 이번 턴 기술을 쓸 수 없으며 대사제 힘 +${VOW_STR} (전투당 ${VOW_STR_TIMES}번까지). 행동력을 다 쓰는 말로 끝맺으면 무사하다. 행동력 0인 기술은 말로 치지 않는다. 대사제가 쓰러지면 서약도 풀린다`,
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
    desc: '먹을 것(시체·새끼)이 하나도 없는 식탁에 차리는 만찬은 거짓이다. 달려들어 입힌 피해만큼 회복한다 (전투당 두 번까지). 통찰 3 이상이면 진짜 의도가 보인다. 불에 타 죽은 새끼는 먹지 못한다',
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
        c.emit({ t: 'text', uid: e.uid, text: '재가 되어 흩어졌다. 먹을 것이 남지 않았다', tone: 'good' });
      },
    },
  },
  // ── 일반 적의 반응 (2026-10 패턴: 내 손에 맞거나 누가 쓰러지면 그 자리에서 의도를 바꿔 보인다) ──
  {
    id: 'a2-last-verse',
    name: '마지막 소절',
    desc: `체력이 처음으로 절반 이하가 되면 그 차례에 「마지막 소절」(정신 피해 ${VERSE_SAN}, 공포 1)을 부른다 (그때 붕괴해 있었으면 일어나서). 부르기 전에 쓰러뜨리면 듣지 않는다`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.verse || e.hp <= 0 || hpPct(e) > 0.5 || !myHit(c, d)) return;
        if (react(c, e, 'verse', '마지막 소절을 들이마신다')) e.mem.verse = 1;
      },
    },
  },
  {
    id: 'a2-rite-lapse',
    name: '흔들리는 향로',
    desc: `의식을 집전하는 동안 약점(관통·공허)에 맞거나 붕괴하면 향로가 흔들려 의식이 끊긴다: 의식이 사라지고 다시 집전해야 한다 (전투당 ${LAPSE_MAX}번까지)`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.hp <= 0 || !(d.weakHit || d.broke) || !myHit(c, d)) return;
        if (!((e.st.ritual ?? 0) > 0) || (e.mem.lapses ?? 0) >= LAPSE_MAX) return;
        e.mem.lapses = (e.mem.lapses ?? 0) + 1;
        e.mem.rite = 0;
        c.clear(e, 'ritual');
        c.emit({ t: 'text', uid: e.uid, text: '향로가 흔들려 의식이 끊겼다', tone: 'good' });
        // 붕괴했으면 일어난 뒤에 다시 집전한다 (AI가 고른다)
        react(c, e, 'rite');
      },
    },
  },
  {
    id: 'a2-intercede',
    name: '대신 맞는 자',
    desc: `내 턴에 후열의 교단 동료가 공격받으면 그 차례에 앞을 막아선다: 방어도 ${STAND_BLOCK}, 도발 1 (다음 내 턴에 단일 대상 공격은 순교자만 노릴 수 있다)`,
    hooks: {
      onCombatStart(c) {
        watch2(c);
      },
    },
  },
  {
    id: 'a2-scavenger',
    name: '썩은 내를 맡는 자',
    desc: '내 턴에 누가 쓰러지면 갓 쓰러진 냄새를 맡고 그 차례에 「시체 포식」을 한다. 피를 흘리는 상대에게는 덤벼든다',
    hooks: {
      onAnyDeath(c, s, victim) {
        const e = s.unit;
        if (!isEnemy(e) || !isEnemy(victim) || victim === e || corpses(c) <= 0 || e.intent?.move === 'feast') return;
        react(c, e, 'feast', '갓 쓰러진 냄새를 맡았다', 'bad');
      },
    },
  },
  {
    id: 'a2-molten',
    name: '녹는 밀랍',
    desc: `체력이 처음 4분의 3 아래로 떨어지면 촛농을 부어 상처를 봉하려 한다 (다음 차례에 체력 ${SEAL_HEAL} 회복, 방어도 ${SEAL_BLOCK}). 그 사이 붕괴시키거나 화염으로 치면 밀랍이 흘러내려 끊긴다`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.hp <= 0 || !e.mem.charge || d.type !== 'fire' || !myHit(c, d)) return;
        delete e.mem.charge;
        e.intent = intentNow(c, e, 'drip');
        c.emit({ t: 'text', uid: e.uid, text: '밀랍이 흘러내린다', tone: 'good' });
      },
    },
  },
  {
    id: 'a2-plaster',
    name: '회벽',
    desc: `동료가 처음 내 손에 무너지면(붕괴) 다음 차례에 하던 행동과 함께 그 동료를 회벽으로 감싼다 (보호막 ${BRICK_BARRIER}). 그 사이 수녀를 붕괴시키면 감싸지 못한다`,
    hooks: {
      onCombatStart(c) {
        watch2(c);
      },
      onUnitTurnStart(c, s) {
        const e = s.unit;
        // 「벽돌 쌓기」를 하려던 참이면 그 행동이 무너진 동료를 감싼다
        if (!isEnemy(e) || !e.mem.brickT || e.intent?.move === 'brick') return;
        const t = c.alive.find((x) => x.uid === `e${e.mem.brickT}`);
        delete e.mem.brickT;
        if (!t || e.broken === 2 || (e.st.stun ?? 0) > 0) return;
        c.apply(t, 'barrier', BRICK_BARRIER, e);
        c.emit({ t: 'text', uid: t.uid, text: '회벽이 몸을 감싼다', tone: 'info' });
      },
    },
  },
  {
    id: 'a2-knell',
    name: '조종',
    desc: `내 턴에 교단 동료가 쓰러지면 그 차례에 「조종」을 울린다 (정신 피해 ${KNELL_TOLL_SAN}). 함께할 교단 동료가 없으면 작은 종을 울리지 않는다`,
    hooks: {
      onAnyDeath(c, s, victim) {
        const e = s.unit;
        if (!isEnemy(e) || !isEnemy(victim) || victim === e || !hasTag(victim, 'cult')) return;
        react(c, e, 'knell', '조종이 울린다');
      },
    },
  },
  {
    id: 'a2-latch',
    name: '파고드는 턱',
    desc: `「턱 박기」로 체력 피해를 주면 살을 파고든다: 내 턴이 시작될 때마다 체력 ${LATCH_DRAIN}${josa(LATCH_DRAIN, '을')} 빨아 간다. 이 뼈지네를 공격하면 떨어진다`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (isEnemy(e) && e.mem.latched && d.src === c.p && d.attack) unlatch(c, e);
      },
      onDeath(c, s) {
        if (isEnemy(s.unit) && s.unit.mem.latched) unlatch(c, s.unit);
      },
    },
  },
  {
    id: 'a2-dust',
    name: '날갯가루',
    desc: '생각이 많은 상대(지난 내 턴에 기술 3개 이상)일수록 날개를 비빈다. 날개를 비빈 뒤 내 공격에 맞으면 마비의 가루가 흩날려 침묵을 걸지 못한다 (약화 1에 그친다)',
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.hp <= 0 || !e.mem.charge || !myHit(c, d) || d.amount <= 0) return;
        delete e.mem.charge;
        e.intent = intentNow(c, e, 'scatter');
        c.emit({ t: 'text', uid: e.uid, text: '마비의 가루가 흩날린다', tone: 'good' });
      },
    },
  },
  {
    id: 'a2-ledger',
    name: '죄의 장부',
    desc:
      `누가 쓰러질 때마다 장부에 죄를 적는다. 내 턴에 적으면 그 차례에 「판결」을 내린다 (죄 하나마다 피해 +${SIN_DMG}). ` +
      `「고해를 듣는다」 다음 내 턴에는 내가 쓰는 기술 하나마다 죄를 적고 (최대 ${HEAR_MAX}) 그 차례에 판결을 내린다`,
    hooks: {
      onCombatStart(c) {
        watch2(c);
      },
      onAnyDeath(c, s, victim) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || !isEnemy(victim) || victim === e) return;
        c.apply(e, SINS, 1, e);
        c.emit({ t: 'text', uid: e.uid, text: '장부에 죄를 적는다', tone: 'eldritch' });
        if (!react(c, e, 'verdict', undefined, 'bad', 'rxl') && e.intent?.move === 'verdict') refreshIntent(c, e);
      },
    },
  },
  {
    id: 'a2-reaching',
    name: '뻗어 오는 손',
    desc: `내 턴에 공격받지 않으면 자기 차례가 끝날 때 손이 하나 더 뻗어 나온다 (최대 ${HANDS_MAX}). 손 하나마다 「움켜쥐기」가 한 번 더. 내 공격에 맞으면 손 하나가 움츠러든다`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.hp <= 0 || d.src !== c.p || !d.attack) return;
        e.mem.hitT = c.s.turn;
        if (!((e.st[HANDS] ?? 0) > 0)) return;
        c.apply(e, HANDS, -1);
        c.emit({ t: 'text', uid: e.uid, text: '손 하나가 움츠러든다', tone: 'good' });
        refreshIntent(c, e);
      },
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.mem.hitT === c.s.turn || (e.st[HANDS] ?? 0) >= HANDS_MAX) return;
        c.apply(e, HANDS, 1, e);
        c.emit({ t: 'text', uid: e.uid, text: '손이 하나 더 뻗어 나온다', tone: 'bad' });
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
    traits: ['a2-chorus', 'a2-last-verse'],
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
      // 죽어 가는 아이의 노래 (특성 a2-last-verse — 스스로 고르지 않고, 크게 다친 차례에만)
      verse: mv.horror('마지막 소절', VERSE_SAN, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '죽어 가는 아이가 마지막 소절을 토한다. 정신 피해, 공포 1' }),
    },
    ai: (c, e) => {
      // 절반 이하로 다쳤는데 아직 부르지 못했으면 (붕괴해 있었거나 지속 피해로 다쳤다) 이번에 부른다
      if (!e.mem.verse && hpPct(e) <= 0.5) {
        e.mem.verse = 1;
        return 'verse';
      }
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
    traits: ['a2-rite-lapse'],
    desc: '꺼지지 않는 향로를 흔들며 회랑을 도는 사제. 연기가 짙어질수록 그가 외는 기도는 사람의 말이 아니게 된다.',
    moves: {
      rite: mv.buff(
        '의식 집전',
        (c, e) => {
          e.mem.rite = 1;
          if (!((e.st.ritual ?? 0) > 0)) c.apply(e, 'ritual', 1, e);
        },
        { desc: '의식 1 (매 턴 힘 +1). 약점에 맞거나 붕괴하면 끊긴다' },
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
    traits: ['a2-martyrdom', 'a2-intercede'],
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
      // 후열의 동료를 감싼다 (특성 a2-intercede — 스스로 고르지 않고, 동료가 맞은 차례에만)
      stand: mv.block('앞을 막아선다', STAND_BLOCK, {
        then: (c, e) => void c.apply(e, 'taunt', 1, e),
        desc: `방어도 ${STAND_BLOCK}, 도발 1 (다음 내 턴에 단일 대상 공격은 순교자만 노릴 수 있다)`,
      }),
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
    traits: ['a2-corpse-eater', 'a2-scavenger'],
    desc: '개를 닮은 얼굴로 납골당의 뼈를 갉는 것. 갓 쓰러진 것을 가장 좋아한다.',
    moves: {
      claw: mv.attack('할퀴기', 7, { type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 1, e), desc: '출혈 1' }),
      gnaw: mv.attack('뼈 갉기', 3, { hits: 3, type: 'slash' }),
      feast: {
        name: '시체 포식',
        intent: 'heal',
        extra: ['buff'],
        desc: `쓰러진 자의 시체를 먹어 체력 ${FEAST_HEAL} 회복, 힘 +2`,
        run(c, e) {
          if (!eatCorpse(c)) {
            c.emit({ t: 'text', uid: e.uid, text: '먹을 것이 없다', tone: 'info' });
            return;
          }
          c.emit({ t: 'text', uid: e.uid, text: '시체를 뜯어먹는다', tone: 'bad' });
          c.heal(e, FEAST_HEAL);
          c.apply(e, 'str', 2, e);
        },
      },
      // 피 냄새 (특성 a2-scavenger)
      lunge: mv.attack('피 냄새를 쫓아 덤빈다', 4, { hits: 2, type: 'slash', desc: '피를 흘리는 상대에게 두 번 덤벼든다' }),
    },
    ai: (c, e) => {
      if (corpses(c) > 0 && last(e) !== 'feast') return pick(c, e, { feast: hpPct(e) < 0.9 ? 5 : 2, claw: 2, gnaw: 1 });
      // 피를 흘리는 상대(출혈)에게는 냄새를 쫓아 덤벼든다 (할퀸 다음 차례에 자주 보인다)
      const bleeding = (c.p.st.bleed ?? 0) > 0;
      return pick(c, e, { claw: bleeding ? 2 : 3, gnaw: 2, lunge: bleeding ? 3 : 0 });
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
    traits: ['a2-wax-seal', 'a2-molten'],
    desc: '녹은 촛농을 제 몸에 부어 상처를 봉한 수사. 굳은 밀랍이 얼굴의 반을 덮었지만 아침 기도는 거르지 않는다.',
    moves: {
      spike: mv.attack('쇠 촛대 찌르기', 9, { type: 'pierce' }),
      grip: mv.attack('밀랍 손아귀', 6, { then: (c, e) => void c.apply(c.p, 'frail', 2, e), desc: '허약 2' }),
      harden: mv.block('밀랍 굳히기', 10, { desc: '방어도 10' }),
      // 상처를 밀랍으로 봉한다 (특성 a2-molten): 붕괴시키거나 화염으로 치면 끊긴다
      pour: {
        name: '촛농을 붓는다',
        intent: 'charge',
        charging: true,
        desc: `다음 차례에 녹인 촛농으로 상처를 봉한다 (체력 ${SEAL_HEAL} 회복, 방어도 ${SEAL_BLOCK}). 그 사이 붕괴시키거나 화염으로 치면 끊긴다`,
        run(c, e) {
          e.mem.charge = 1;
          c.emit({ t: 'text', uid: e.uid, text: '촛농을 녹인다…', tone: 'bad' });
        },
      },
      seal: release({
        name: '밀랍 봉인',
        intent: 'heal',
        extra: ['block'],
        desc: `녹인 촛농으로 상처를 봉한다. 체력 ${SEAL_HEAL} 회복, 방어도 ${SEAL_BLOCK}`,
        run(c, e) {
          c.heal(e, SEAL_HEAL);
          c.gainBlock(e, SEAL_BLOCK);
        },
      }),
      drip: {
        name: '흘러내린 밀랍',
        intent: 'unknown',
        desc: '녹아 흘러내린 밀랍을 긁어모은다. 이번 차례에는 아무것도 하지 못한다',
        run(c, e) {
          c.emit({ t: 'text', uid: e.uid, text: '흘러내린 밀랍을 긁어모은다', tone: 'info' });
        },
      },
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'seal';
      // 체력이 4분의 3 아래로 떨어지면 한 번, 촛농을 부어 상처를 봉하려 한다
      if (hpPct(e) < 0.75 && !e.mem.poured) {
        e.mem.poured = 1;
        return 'pour';
      }
      return opener(c, e, ['spike']) ?? pick(c, e, { spike: 3, grip: 2, harden: 1 });
    },
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
    // 악령이 빠져나간 동안에는 흐느끼며 기도하고, 다시 깃들면 원래대로 돌아간다
    ai: (c, e) =>
      e.mem.exorcised && !e.mem.repossessed ? pick(c, e, { fist: 2, pray: 2, spasm: 1 }) : pick(c, e, { spasm: 2, voice: 2, fist: 2 }),
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
      // 수도사의 두 번째 목소리에 불려 돌아간다 (특성 a2-possessed)
      enter: {
        name: '다시 깃든다',
        intent: 'special',
        desc: `빠져나왔던 수도사의 몸으로 돌아간다. 수도사 체력 ${REPOSSESS_HEAL} 회복, 힘 +2. 그 전에 쓰러뜨리면 막는다`,
        run(c, e) {
          const monk = c.alive.find((x) => x.def === 'possessed-monk');
          e.mem.called = 0;
          e.mem.reachable = 0;
          if (!monk) {
            // 깃들 몸이 없으면 다시 떠돈다 (세 번 움직이면 흩어진다)
            c.emit({ t: 'text', uid: e.uid, text: '깃들 몸이 없다', tone: 'info' });
            return;
          }
          monk.mem.repossessed = 1;
          c.emit({ t: 'text', uid: monk.uid, text: '악령이 다시 깃들었다', tone: 'eldritch' });
          c.heal(monk, REPOSSESS_HEAL);
          c.apply(monk, 'str', 2, e);
          c.flee(e);
        },
      },
    },
    // 세 번 행동하면 흩어진다. 수도사가 살아 있으면 한 번 움직인 뒤 두 번째 목소리를 따라 몸으로 돌아가려 한다 (한 차례 앞서 보인다)
    ai: (c, e) => {
      if (e.mem.called) return 'enter';
      e.mem.acts = (e.mem.acts ?? 0) + 1;
      if (e.mem.acts === 2 && c.alive.some((x) => x.def === 'possessed-monk' && x.mem.exorcised && !x.mem.repossessed)) {
        // 돌아가려는 동안에는 몸 곁을 맴돌아 근접으로도 닿는다
        e.mem.called = 1;
        e.mem.reachable = 1;
        return 'enter';
      }
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
    traits: ['a2-plaster'],
    desc: '수도원이 바쳐지던 밤, 그들은 스스로를 벽 속에 쌓아 넣었다. 회벽 너머의 기도는 아직 끝나지 않았다.',
    moves: {
      lament: mv.horror('벽 속의 기도', 6, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '정신 피해, 공포 1' }),
      brick: mv.buff(
        '벽돌 쌓기',
        (c, e) => {
          // 무너진 동료를 감싸려던 참이면 그 동료에게 (특성 a2-plaster)
          const want = e.mem.brickT ? c.alive.find((x) => x.uid === `e${e.mem.brickT}`) : undefined;
          delete e.mem.brickT;
          c.apply(want ?? mostHurt(c) ?? e, 'barrier', BRICK_BARRIER, e);
        },
        { desc: `가장 다친 아군에게 보호막 ${BRICK_BARRIER} (무너진 동료를 감싸려던 참이면 그 동료에게)` },
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
    traits: ['a2-knell'],
    desc: '종탑의 밧줄을 당기는 견습들. 고막은 오래전에 터졌지만 종소리는 여전히 들린다고 한다.',
    moves: {
      clang: mv.attack('공명', 6, { melee: false, type: 'arcane' }),
      toll: mv.horror('작은 종', 4, {
        desc: '다른 교단 아군 모두 힘 +1',
        then(c, e) {
          for (const a of c.alive) if (a !== e && hasTag(a, 'cult')) c.apply(a, 'str', 1, e);
        },
      }),
      // 쓰러진 신도를 위해 울리는 종 (특성 a2-knell — 스스로 고르지 않고, 신도가 쓰러진 차례에만)
      knell: mv.horror('조종', KNELL_TOLL_SAN, { desc: '쓰러진 신도를 위해 울리는 종. 귓속에서 오래 울린다' }),
    },
    ai: (c, e) => {
      // 함께할 신도가 있으면 작은 종과 공명을 번갈아 울린다. 홀로 남으면 공명만
      const flock = c.alive.some((x) => x !== e && hasTag(x, 'cult'));
      return pick(c, e, { clang: 2, toll: flock && last(e) !== 'toll' ? 1 : 0 });
    },
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
    traits: ['a2-carapace', 'a2-latch'],
    desc: '납골당의 뼈를 껍데기 삼아 재 속을 기는 지네. 무엇에든 들러붙어 피를 빤다. 수도사들은 이것을 "회개하지 않는 혀"라 불렀다.',
    moves: {
      latch: {
        name: '턱 박기',
        intent: 'attack',
        extra: ['heal'],
        dmg: 5,
        melee: true,
        desc: `입힌 피해만큼 회복. 체력 피해를 주면 살을 파고든다 (내 턴이 시작될 때마다 체력 ${LATCH_DRAIN}${josa(LATCH_DRAIN, '을')} 빨린다. 이 뼈지네를 공격하면 떨어진다). 파고들지 못하면 출혈 2`,
        run(c, e) {
          const ds = c.enemyAttack(e, { type: 'pierce' });
          if (c.over || e.dead) return;
          const n = ds.reduce((s, d) => s + d.hpLoss, 0);
          if (n > 0) c.heal(e, n);
          // 방어도에 막히지 않고 살에 닿았으면 파고들어 직접 빤다 (특성 a2-latch). 못 파고들면 피를 흘리게 한다
          if (n > 0 && !e.mem.latched && c.apply(c.p, LATCHED, 1, e) > 0) {
            e.mem.latched = 1;
            c.emit({ t: 'text', uid: e.uid, text: '턱이 살을 파고든다', tone: 'bad' });
            return;
          }
          c.apply(c.p, 'bleed', 2, e);
        },
      },
      thrash: mv.attack('몸부림', 3, { hits: 2 }),
    },
    // 이미 파고들었으면 놓치지 않으려 몸부림친다
    ai: (c, e) => pick(c, e, { latch: e.mem.latched ? 1 : 3, thrash: e.mem.latched ? 3 : 2 }),
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
    traits: ['a2-dust'],
    desc: '향로 연기를 따라 모여드는 창백한 나방. 시체에 알을 슨다. 그 날갯가루를 들이마신 자는 생각이 굳는다.',
    moves: {
      dust: mv.attack('날갯가루', 6, { melee: false, type: 'arcane' }),
      rub: { ...mv.charge('날개를 비빈다', 9), desc: '다음 차례에 「마비의 가루」(침묵 1). 그 사이 붕괴시키거나 공격으로 맞히면 가루가 흩날려 침묵을 걸지 못한다' },
      burst: release(
        mv.attack('마비의 가루', 9, {
          melee: false,
          type: 'arcane',
          desc: '침묵 1 (다음 턴엔 기본기만 쓸 수 있다)',
          then: (c, e) => void c.apply(c.p, 'silence', 1, e),
        }),
      ),
      // 비빈 날개를 맞혀 가루를 흩었다 (특성 a2-dust)
      scatter: mv.attack('흩날린 가루', 9, { melee: false, type: 'arcane', then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '마비의 가루가 흩어졌다. 침묵 대신 약화 1' }),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'burst';
      // 이미 침묵한 상대에게는 날개를 비비지 않는다. 생각이 많은 상대(지난 내 턴에 기술 3개 이상)일수록 자주 비빈다
      if ((c.p.st.silence ?? 0) > 0) return 'dust';
      const recent = e.hist.slice(-2).some((h) => h === 'rub' || h === 'burst' || h === 'scatter');
      return pick(c, e, { dust: 3, rub: recent ? 0 : c.s.used >= 3 ? 4 : 1 });
    },
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
    traits: ['a2-ledger'],
    desc: '모든 죄를 들어주고 모든 죄를 기록한다. 그 장부는 아래의 목소리에게 바쳐진다.',
    moves: {
      penance: mv.attack('참회의 매', 8, { then: (c, e) => void c.apply(c.p, 'vuln', 1, e), desc: '취약 1' }),
      confess: {
        ...mv.horror('고해 강요', 4, { desc: '이번 턴 내가 쓴 스킬 1개당 정신 피해 +1 (최대 +5)' }),
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
      // 고해를 듣는다 (특성 a2-ledger): 다음 내 턴에 쓰는 기술 하나마다 죄를 적고, 그 차례에 판결을 내린다
      listen: {
        ...mv.horror('고해를 듣는다', LISTEN_SAN, {
          desc: `고해를 다그친다 (정신 피해). 다음 내 턴에 내가 쓰는 기술 하나마다 장부에 죄를 적고 (최대 ${HEAR_MAX}, 죄 하나마다 「판결」 피해 +${SIN_DMG}) 그 차례에 판결을 내린다. 그 사이 붕괴시키면 더 적지 못한다`,
          then(c, e) {
            e.mem.hear = c.s.turn + 1;
            e.mem.heard = 0;
            c.emit({ t: 'text', uid: e.uid, text: '말하라. 하나도 빠짐없이 적겠다', tone: 'eldritch' });
          },
        }),
        extra: ['special'],
      },
      // 장부에 적은 죄를 묻는다 (특성 a2-ledger): 피해는 의도에 그대로 보인다
      verdict: {
        name: '판결',
        intent: 'attack',
        dmg: (_c, e) => VERDICT_DMG + SIN_DMG * (e.st[SINS] ?? 0),
        melee: true,
        desc: `장부에 적은 죄 하나마다 피해 +${SIN_DMG} (고해를 듣는 동안에는 내가 쓰는 기술 하나마다 죄가 하나 는다). 판결을 내리면 장부를 비운다`,
        run(c, e) {
          delete e.mem.hear;
          c.enemyAttack(e, { type: 'blunt' });
          if (!c.over && !e.dead) c.clear(e, SINS);
        },
      },
    },
    ai: (c, e) => {
      // 고해를 들었으면 다음 차례에 판결을 내린다 (그 사이 내가 쓰는 기술이 장부에 적힌다)
      if (e.mem.hear === c.s.turn + 1) return 'verdict';
      // 장부에 죄가 쌓였으면 판결을 내리고, 장부가 비었으면 이따금 고해를 듣는다 (세 차례 안에 다시 듣지 않는다)
      const sins = e.st[SINS] ?? 0;
      const heard = e.hist.slice(-3).includes('listen');
      return pick(c, e, {
        penance: 3,
        confess: 2,
        absolve: c.alive.some((a) => hpPct(a) < 0.7) ? 2 : 0,
        verdict: sins > 0 ? 2 + sins : 0,
        listen: sins > 0 || heard ? 0 : 2,
      });
    },
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
    traits: ['a2-reaching'],
    desc: '세례반에는 재와 피를 갠 검은 것이 고여 있다. 그 속에서 손들이 뻗어 나와 세례받을 자를 더듬는다.',
    moves: {
      reach: mv.attack('뻗어 오는 손', 5, { melee: false, type: 'void' }),
      baptize: mv.horror('검은 세례', 4, {
        desc: '부식 1 (받는 피해 +1, 전투 동안)',
        then: (c, e) => void c.apply(c.p, 'corrode', 1, e),
      }),
      // 뻗어 나온 손 하나마다 한 번 더 움켜쥔다 (특성 a2-reaching — 의도에 그대로 보인다)
      clutch: {
        ...mv.attack('움켜쥐기', 3, { hits: 2, melee: false, then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '약화 1. 뻗어 나온 손 하나마다 한 번 더 움켜쥔다' }),
        hits: (_c: Combat, e: EnemyUnit) => 2 + (e.st[HANDS] ?? 0),
      },
    },
    ai: (c, e) => {
      // 손이 많이 뻗어 나왔으면 움켜쥐고, 부식이 덜 쌓인 상대에게는 검은 세례를 붓는다
      const hands = e.st[HANDS] ?? 0;
      return pick(c, e, { reach: 3, baptize: (c.p.st.corrode ?? 0) < 3 ? 2 : 0, clutch: 1 + hands });
    },
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
          if (c.apply(c.p, PENANCE, 2, e) > 0) c.emit({ t: 'text', uid: 'p', text: '속죄하라. 손을 쓸 때마다 피가 흐른다', tone: 'bad' });
        },
        { desc: `속죄 2: 2턴 동안 기술을 쓸 때마다 체력 ${PENANCE_HP}를 잃는다 (기본기 포함, 방어도 무시)` },
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
          desc: '정신 피해, 크레셴도 +1. 뒤엉킨 기억 1: 다음 턴 기술 이름과 설명이 뒤섞여 보이고 쓴 기술은 그 턴에 다시 쓸 수 없다',
        }),
        extra: ['debuff', 'buff'],
        run(c, e) {
          cine(c, 'glitch', { uid: e.uid, n: 1 });
          c.horror(e, 5);
          if (c.over || e.dead) return;
          e.mem.cres = (e.mem.cres ?? 0) + 1;
          c.emit({ t: 'text', uid: e.uid, text: `크레셴도 ${e.mem.cres}`, tone: 'eldritch' });
          if (c.apply(c.p, TANGLED, 1, e) > 0) setUi(c, 'ui:scramble', 1);
          if (e.mem.cres >= 3) startRequiem(c, e);
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
        desc: '다음 턴 대합창. 살아 있는 성가대원 1명당 1회 추가 타격 (붕괴시키면 취소)',
        run(c, e) {
          e.mem.charge = 1;
          // 레퀴엠과 번갈아 온다 (첫 번째·세 번째 크레셴도가 레퀴엠)
          e.mem.grands = (e.mem.grands ?? 0) + 1;
          c.emit({ t: 'text', uid: e.uid, text: '힘을 모은다…', tone: 'bad' });
        },
      },
      // 즉사 퍼즐 「레퀴엠」: 크레셴도가 차면 2턴 — 성가대원 하나를 쓰러뜨리거나, 성가대장에게 피해, 또는 붕괴
      requiem1: {
        name: '레퀴엠 (첫 소절)',
        intent: 'death',
        cine: { name: 'glitch', n: 2 },
        desc:
          '레퀴엠이 이어진다. 다음 차례에 노래가 끝나면 끝까지 들은 자는 죽는다 (즉사, 결계가 한 번 막는다). ' +
          `성가대원 하나를 쓰러뜨리거나 성가대장에게 피해 ${REQUIEM_HIT}을 주거나 성가대장을 붕괴시키면 끊긴다. 성가대장은 후열에 있어도 근접으로 닿는다. 지속 피해도 센다`,
        run(c, e) {
          if (!advanceRequiem(c, e)) {
            endRequiem(c, e);
            return;
          }
          c.emit({ t: 'text', uid: e.uid, text: '재를 토하는 입들이 한 음으로 모인다', tone: 'eldritch' });
        },
      },
      requiem: {
        name: '레퀴엠',
        intent: 'death',
        ultimate: true,
        desc:
          '끝까지 들은 자는 죽는다 (즉사: 사경 없이 패배, 결계가 한 번 막는다). ' +
          `성가대원 하나를 쓰러뜨리거나 성가대장에게 피해 ${REQUIEM_HIT}을 주거나 성가대장을 붕괴시키면 끊긴다`,
        run(c, e) {
          if (e.mem.req !== 2) {
            endRequiem(c, e);
            return;
          }
          if (execute(c, e, '레퀴엠') || c.over) return;
          // 결계가 막았다 — 노래는 흩어지고 크레셴도는 처음부터
          endRequiem(c, e);
        },
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
      // 레퀴엠의 카운트다운 (기절로 밀리면 그대로 다시)
      if (e.mem.req === 1) return 'requiem1';
      if (e.mem.req === 2) return 'requiem';
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
          `봉인이 열린다. 다음 턴 성인의 분노 (붕괴시키면 취소). 고해도 청한다. 다음 턴 공격하지 않으면 죄를 사한다: 정신력 +${ABSOLVE_SAN}, 해로운 효과 모두 제거. ` +
          `공격하는 순간 신성모독: 성유물함 방어도 ${SACRILEGE_BLOCK}, 정신력 -${SACRILEGE_SAN}`,
        run(c, e) {
          e.mem.charge = 1;
          c.emit({ t: 'text', uid: e.uid, text: '봉인이 열린다…', tone: 'bad' });
          setSt(c, c.p, CONFESSION, 1);
          setUi(c, 'ui:eye', 1);
          c.emit({ t: 'text', uid: e.uid, text: '뚜껑 틈에서 눈 하나가 고백을 기다린다', tone: 'eldritch' });
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
        desc: `침묵의 서약: 남은 말 ${VOW_WORDS}. 행동력을 쓰는 기술(기본기 포함)을 쓸 때마다 1씩 줄어든다. 0이 되는 순간 행동력이 남아 있으면 말을 끊긴다 (남은 행동력을 잃고 이번 턴 기술 봉인, 대사제 힘 +${VOW_STR}, ${VOW_STR_TIMES}번까지)`,
        run(c, e) {
          e.mem.vowed = 1;
          setSt(c, c.p, VOW, VOW_WORDS);
          cine(c, 'scrawl', { uid: e.uid, text: '침묵하라' });
          c.emit({ t: 'text', uid: 'p', text: `침묵의 서약: 남은 말 ${VOW_WORDS}`, tone: 'eldritch' });
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
    // 대사제의 부활을 막으려면 거둬야 하는 기믹 — 후열에 있어도 근접으로 닿는다
    reachable: true,
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
        desc: '시체를 먹어 체력 16 회복, 힘 +1. 시체가 없으면 제 새끼를 산 채로 삼킨다 (체력 24 회복, 힘 +1, 내 정신력 -4)',
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
      // 거짓 만찬: 식탁이 비면 '만찬'을 차리는 척하며 당신에게 달려든다 (통찰 3 이상이면 보인다)
      lunge: {
        name: '굶주린 도약',
        intent: 'attack',
        extra: ['heal'],
        dmg: 13,
        melee: true,
        cine: 'corners',
        disguise: { kind: 'heal', label: '왕의 만찬' },
        desc: '식탁이 비었다. 달려들어 입힌 피해만큼 회복한다 (만찬으로 위장한다)',
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
      // 식탁이 비었다 (시체도 새끼도 없다) — 만찬인 척 당신에게 달려든다 (전투당 두 번, 사이에 두 번은 다른 행동).
      // 새끼가 살아 있는 동안엔 달려들지 않는다 — 불로 시체를 태우는 출신만 더 자주 노려지지 않게
      if (hungry && corpses(c) <= 0 && pups === 0 && (e.mem.lunges ?? 0) < 2 && !e.hist.slice(-2).includes('lunge')) return 'lunge';
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
      // 재 속의 행동은 재에 가려 보이지 않는다 (통찰 3 이상이면 보인다)
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
    // 재에 묻힌 것을 끌어내려면 모두 쓰러뜨려야 한다 — 자리가 없어 후열로 밀려도 근접으로 닿는다
    reachable: true,
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
  // 종지기 (2026-10 강화 — 수치는 patterns.ts): 1막은 타종과 마지막 종(대종 퍼즐)·침묵령,
  // 2막 「종탑의 광란」(체력 절반 또는 대종이 깨지면)은 종을 끊어 떨어뜨리는 방어 퍼즐·공격과 정신 공격을 한 번에·수련사 여럿
  {
    id: 'bellkeeper',
    name: '종지기',
    icon: 'gi:ringing-bell',
    act: 2,
    tier: 'boss',
    hp: [KEEPER_HP, KEEPER_HP],
    poise: KEEPER_POISE,
    weak: ['fire', 'void'],
    row: 0,
    dread: 7,
    eldritch: true,
    tags: ['undead'],
    traits: ['a2-bell-bound'],
    desc: '수도원이 재에 묻힌 뒤에도 종을 멈추지 않은 자. 그의 등은 종 모양으로 굽었고 심장은 종추처럼 뛴다.',
    moves: {
      hammer: mv.attack('종추 내려치기', KEEPER_HAMMER),
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
      // 침묵령: 다음 내 턴, 두 번째 기술부터 정신력을 잃는다 (기술을 막지는 않는다 — 값만 치른다).
      // 내려치며 거는 행동이라 공격 의도에 약화 표시를 더한다 (등불 강탈·거꾸로 매달기처럼 — 봇도 막을 피해로 센다)
      silence: {
        name: '침묵을 명한다',
        intent: 'attack',
        extra: ['debuff'],
        dmg: SILENCE_DMG,
        melee: true,
        desc: `종추로 입을 짓누르고 침묵을 명한다. 다음 내 턴 동안 침묵령. ${HUSH_RULE}`,
        run(c, e) {
          c.enemyAttack(e, { type: 'blunt' });
          if (!c.over && !e.dead) hush(c, e);
        },
      },
      // 위협 퍼즐 「마지막 종」: 세 번째 타종 → 종을 당긴다 (2턴 남음) → 종말의 종 (1턴 남음, 들으면 정신이 무너진다)
      prepare: {
        name: '마지막 종을 당긴다',
        intent: 'charge',
        desc:
          `다음 차례에 종말의 종이 울린다. 들으면 정신이 무너진다 (정신 피해 ${KNELL_SAN}, 공포 ${KNELL_DREAD}, 최대 체력의 ${Math.round(KNELL_HP_PCT * 100)}% 피해, 방어도 무시). ` +
          '대종을 깨뜨리거나 종지기를 붕괴시키면 끊긴다. 대종은 다시 공명한다 (받는 피해 +50%)',
        run(c, e) {
          if (!tightenKnell(c, e)) {
            c.emit({ t: 'text', uid: e.uid, text: '당길 종이 없다', tone: 'info' });
            return;
          }
          cine(c, 'bell', { uid: e.uid });
          if (once(c, 'a2-earplug')) cine(c, 'scrawl', { uid: e.uid, text: '귀를 막아라' });
          c.emit({ t: 'text', uid: e.uid, text: '마지막 종이 기울어진다', tone: 'eldritch' });
          resonate(c);
        },
      },
      doom: {
        name: '종말의 종',
        intent: 'horror',
        sanity: KNELL_SAN,
        ultimate: true,
        cine: 'crack',
        desc:
          `들으면 정신이 무너진다: 정신 피해 ${KNELL_SAN}, 공포 ${KNELL_DREAD}, 최대 체력의 ${Math.round(KNELL_HP_PCT * 100)}% 피해 (방어도 무시). ` +
          `대종을 깨뜨리거나 종지기를 붕괴시키면 막는다. 이번 턴 기술을 하나도 쓰지 않으면 귀를 막아 듣지 않는다 (대신 정신 피해 ${MUFFLE_SAN})`,
        run(c, e) {
          cine(c, 'impact', { uid: e.uid });
          // 마지막 종이 울릴 때마다 화면 유리에 금이 남는다
          setUi(c, 'ui:cracks', Math.min(3, (c.s.vars['ui:cracks'] ?? 0) + 1));
          endKnell(c, e);
          c.horror(e, KNELL_SAN);
          if (c.over || e.dead) return;
          c.apply(c.p, 'dread', KNELL_DREAD, e);
          c.damage({ src: e, tgt: c.p, base: Math.ceil(c.p.maxHp * KNELL_HP_PCT), type: 'true', ignoreBlock: true, tags: ['knell'] });
        },
      },
      // 귀를 막아 마지막 종소리를 듣지 않았다 (KNELL 상태가 턴 끝에 이 의도로 바꾼다)
      muffled: {
        ...mv.horror('먹먹한 종소리', MUFFLE_SAN, { desc: '귀를 막아 마지막 종소리를 듣지 않았다. 그래도 소리가 뼈를 타고 울린다 (정신 피해). 대종은 남아 다시 울린다' }),
        run(c, e) {
          cine(c, 'bell', { uid: e.uid });
          endKnell(c, e);
          c.horror(e, MUFFLE_SAN);
        },
      },
      // ── 2막: 종탑의 광란 ──
      // 방어 퍼즐 「떨어지는 종」: 종을 끊는다 (목표 띠, 1턴 남음) → 떨어지는 종 (숨었으면 종지기를, 아니면 나를 덮친다)
      cut: {
        name: '종을 끊는다',
        intent: 'charge',
        charging: true,
        desc: `종탑의 밧줄을 끊는다. 다음 차례에 종이 떨어진다. ${FALL_RULE}. 끊기 전에 종지기를 붕괴시키면 밧줄을 놓친다`,
        run(c, e) {
          cine(c, 'bell', { uid: e.uid });
          cutRope(c, e);
        },
      },
      fall: {
        name: '떨어지는 종',
        intent: 'charge',
        ultimate: true,
        cine: 'impact',
        desc: `끊어 둔 종이 떨어진다. ${FALL_RULE}. 그 전에 종지기를 붕괴시키면 끊긴다`,
        run(c, e) {
          landFall(c, e);
        },
      },
      // 내 턴 끝에 종 그늘 아래 숨었다 (떨어지는 종 상태가 턴 끝에 이 의도로 바꾼다)
      recoil: {
        name: '제 종에 깔린다',
        intent: 'special',
        cine: 'impact',
        desc: `종 그늘 아래 숨었다. 떨어진 종이 종지기를 덮친다. 피해 ${FALL_SELF}, 버팀 -${FALL_POISE}`,
        run(c, e) {
          crashKeeper(c, e);
        },
      },
      // 한 행동에 공격과 정신 공격을 함께
      combo: mv.horror('종추 연타와 장송곡', COMBO_SAN, {
        dmg: COMBO_DMG,
        hits: COMBO_HITS,
        melee: true,
        type: 'blunt',
        desc: `종추로 ${COMBO_HITS}번 내려치며 장송곡을 부른다. 정신 피해`,
      }),
      call: mv.summon(
        '종탑의 수련사들',
        (c) => {
          const n = callable(c);
          for (let i = 0; i < n; i++) c.spawn('bell-acolyte', 1);
        },
        `타종 수련사를 한 번에 ${BELFRY_CALL}명까지 부른다 (함께 ${BELFRY_ACOLYTES}명까지)`,
      ),
      flurry: mv.attack('광란의 종추', FLURRY_DMG, { hits: FLURRY_HITS }),
      dirge: mv.horror('종탑의 장송곡', DIRGE_SAN, { then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '정신 피해, 약화 1' }),
      // 광란에 빠진 종지기는 종추처럼 뛰는 제 심장을 울린다
      heart: {
        ...mv.horror('심장의 종', HEART_SAN, { desc: '종 대신 제 심장을 울린다. 정신 피해, 종지기 힘 +1' }),
        extra: ['buff'],
        run(c, e) {
          cine(c, 'bell', { uid: e.uid });
          c.horror(e, HEART_SAN);
          if (c.over || e.dead) return;
          c.apply(e, 'str', 1, e);
        },
      },
    },
    onSpawn: (c) => void c.spawn('great-bell', 1),
    ai: (c, e) => {
      // 대종 없는 1막은 없다 (대종이 깨지면 대종의 특성이 광란을 부른다 — 이것은 안전망)
      if (!e.form && countDef(c, 'great-bell') === 0) belfry(c, e);
      if (e.form) return belfryMove(c, e);
      // 마지막 종의 카운트다운 (기절로 밀리면 그대로 다시)
      if (e.mem.knell === 1) return 'prepare';
      if (e.mem.knell === 2) return 'doom';
      // 귀를 막아 끝났는데 먹먹한 종소리가 밀렸다 (기절 등)
      if (e.mem.knell === 3) endKnell(c, e);
      const tolls = e.mem.tolls ?? 0;
      let m = cycle(e, KEEPER_CYCLE);
      if (m === 'summon' && ((e.mem.calls ?? 0) >= 2 || countDef(c, 'bell-acolyte') >= 2 || c.row(1).length >= 3)) m = 'toll';
      return m === 'toll' ? `toll${Math.min(3, tolls + 1)}` : m;
    },
    visual: { tint: 0x4a3a2a, glow: 0xffb040, scale: 1.55, fx: ['flicker'] },
    forms: [{ name: BELFRY_NAME, icon: 'gi:evil-tower', visual: { tint: 0x2a1612, glow: 0xff4a2a, scale: 1.7, fx: ['flicker', 'float'] } }],
  },
  {
    id: 'great-bell',
    name: '대종',
    icon: 'gi:bell-shield',
    act: 2,
    tier: 'minion',
    hp: [60, 60],
    poise: 0,
    weak: ['blunt', 'arcane'],
    row: 1,
    // 깨야 하는 기믹 (마지막 종) — 후열에 있어도 근접으로 닿는다. 특정 속성에 강하지 않다 (어느 출신이든 공명에 맞춰 치면 깨진다)
    reachable: true,
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
        desc: `할퀴고 등불 ${SNATCH}을 빼앗아 제 촛불에 옮긴다. 쓰러뜨리면 되찾는다. 등불이 25 미만이면 이것의 공격 피해 +25%`,
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
        desc: '먼저 거꾸로 매단 뒤 못을 박는다. 거꾸로 매달림 2: 2턴 동안 체력 피해는 정신력을, 정신력 손실은 체력을 깎는다',
        run(c, e) {
          if (c.apply(c.p, HANGED, 2, e) > 0) {
            setUi(c, 'ui:swap', 1);
            c.emit({ t: 'text', uid: 'p', text: '세상이 뒤집혔다. 피가 머리로 쏠린다', tone: 'eldritch' });
          }
          c.enemyAttack(e, { type: 'pierce' });
        },
      },
      invert: {
        name: '뒤집힌 축복',
        intent: 'debuff',
        extra: ['block'],
        desc: '내 방어도를 모두 빼앗아 제 것으로 삼는다',
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
        desc: '체력 40 회복, 해로운 효과 제거. 내 정신력 -4',
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
