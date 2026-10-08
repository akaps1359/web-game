import { josa } from '../../engine/josa';
import { reg } from '../../engine/registry';
import { isEnemy, scaledPoise, unguarded, type Combat } from '../../engine/combat';
import { cycle, last, opener, pick, hpPct } from '../../engine/ai';
import type { EnemyUnit, MoveDef } from '../../engine/types';
import { countDef, mv, others, release } from '../moves';
import { cine, dealt, setUi } from '../lib';
import {
  ACQUIT_POISE,
  BAIL_DMG,
  CATCH_STR,
  CHARM_AP,
  CLAMP_TURNS,
  DISARMED,
  GUILTY_SAN,
  GUILTY_VULN,
  HANDPRINT,
  LINE,
  LINE_HP,
  TIDE_AP,
  TIDE_DMG,
  TIDE_GAP,
  TRIAL,
  VERDICT_DMG,
  WATER_MAX,
  angler,
  bailWater,
  callTide,
  canHook,
  charm,
  clampWeapon,
  cutLine,
  dazzle,
  freeWeapon,
  handprints,
  hookSkill,
  judge,
  leavePrint,
  plead,
  reelIn,
  releaseSkill,
  resolveTide,
  riseWater,
  sentence,
  setPlayerSt,
  tideObjective,
  tideReady,
} from './common';

/*
 * 2026-10 정예·수호자 패턴 확장 — 수호자마다 시그니처 메커니즘, 정예마다 새 행동 (자세한 규칙은 act1/common.ts).
 * 등대지기: 도는 등명기와 섬광(눈부심) · 빛을 모은 백열광 / 밀수조직 두목: 휴전 제안과 배신 (거짓 의도, 조직원이 속셈을 드러낸다)
 * 늙은 어부: 낚싯줄로 기술 낚기 / 익사한 선장: 차오르는 물 / 도살자: 고기 저울(처형)·상처에 소금
 * 집행자: 판결 / 거대 게: 무기 물기 / 안개 속 사냥꾼: 숨는 척 기습 / 망령: 유리의 손자국과 끌어내림
 */

// ── 수치 (설명 문구도 이 값을 쓴다) ──
/** 등명기가 비추는 방어도 / 섬광 화염 피해·정신 피해 / 등명기가 꺼졌을 때 화면 어둠(%) */
export const LAMP_BLOCK = 10;
export const FLASH_DMG = 6;
export const FLASH_SAN = 4;
const LAMP_DARK = 45;
/** 등명기의 회전 (차례마다 하나씩 — 의도를 다시 정해도 밀리지 않게 행동한 횟수로 센다) */
const LAMP_SPIN = ['turn2', 'turn1', 'flash'];
/** 등대지기 2단계: 빛을 모아 쏘는 백열광 */
export const SEAR_DMG = 26;
/** 두목: 휴전 골드 / 결렬 시 힘 / 거짓말이 들키는 통찰 / 배신 사격 한 발 / 제안 간격(턴) / 진짜 거래 최대 횟수 */
export const PARLEY_GOLD = 25;
export const PARLEY_ANGER = 2;
export const LIAR_REVEAL = 3;
export const BETRAY_DMG = 5;
const OFFER_GAP = 4;
export const MAX_DEALS = 2;
/** 두목의 커틀러스 (협상이 결렬되면 그 자리에서 되갚는다) */
export const CUTLASS_DMG = 14;
/** 도살자: 고기 저울 (체력 절반 이하인 상대에게 토막내기 피해 배율) / 상처에 소금 */
export const SCALE_MULT = 1.5;
export const SALT_BLEED = 3;
/** 집행자: 판결과 함께 내리치는 피해 / 판결 간격 (턴) */
export const VERDICT_HIT = 8;
const VERDICT_GAP = 4;
/** 안개 속 사냥꾼: 숨는 척 기습 / 안개가 짙어진 화면 어둠(%) */
export const LUNGE_DMG = 15;
const FOG_DARK = 40;
/** 망령: 끌어내림 한 손의 피해 (손은 2 + 손자국) */
export const DRAG_DMG = 5;

// ───────────── 특성 ─────────────

reg.traits([
  {
    id: 'swarm',
    name: '무리',
    desc: '한 번에 받는 피해가 최대 7 (출혈·독·화상 같은 지속 피해는 제외)',
    hooks: {
      modDamageIn(_c, _s, d) {
        d.cap = 7;
      },
    },
  },
  {
    id: 'thief',
    name: '소매치기',
    desc: '훔친 골드는 처치하면 돌려받는다',
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (isEnemy(e) && e.mem.stolen) {
          c.p.gold += e.mem.stolen;
          c.emit({ t: 'text', uid: e.uid, text: `골드 +${e.mem.stolen}`, tone: 'good' });
          e.mem.stolen = 0;
        }
      },
    },
  },
  {
    id: 'risen',
    name: '되살아남',
    desc: '처음 쓰러지면 체력 30%로 다시 일어선다',
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.revived) return;
        e.mem.revived = 1;
        e.dead = false;
        e.hp = Math.ceil(e.maxHp * 0.3);
        c.emit({ t: 'spawn', uid: e.uid });
        c.emit({ t: 'text', uid: e.uid, text: '다시 일어선다', tone: 'eldritch' });
      },
    },
  },
  {
    id: 'flying',
    name: '비행',
    desc: '근접 공격 피해 50% 감소',
    hooks: {
      modDamageIn(_c, _s, d) {
        if (d.melee) d.mult *= 0.5;
      },
    },
  },
  {
    id: 'zealot',
    name: '광신',
    desc: '동료가 쓰러지면 힘 +2',
    hooks: {
      onAnyDeath(c, s, victim) {
        if (isEnemy(victim) && victim !== s.unit) c.apply(s.unit, 'str', 2, s.unit);
      },
    },
  },
  {
    id: 'veiled',
    name: '안개 장막',
    desc: `자기 턴이 끝날 때 회피 1 (중첩되지 않음). 안개 속 움직임은 흐릿해서 '안개 속으로'가 거짓일 때가 있다. 통찰 ${LIAR_REVEAL}이면 보인다`,
    hooks: {
      onUnitTurnEnd(c, s) {
        if (!(s.unit.st.evasive > 0)) c.apply(s.unit, 'evasive', 1, s.unit);
      },
    },
  },
  {
    id: 'incorporeal',
    name: '실체 없음',
    desc: '참격·관통·타격 피해 30% 감소',
    hooks: {
      modDamageIn(_c, _s, d) {
        if (d.type === 'slash' || d.type === 'pierce' || d.type === 'blunt') d.mult *= 0.7;
      },
    },
  },
  {
    id: 'deep-blood',
    name: '심해의 피',
    desc: '체력이 절반 이하가 되면 본모습을 드러낸다. 낚싯대를 놓쳐 걸려 있던 기술을 돌려준다',
    hooks: {
      onDamageTaken(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.transformed || e.hp <= 0 || hpPct(e) > 0.5) return;
        e.mem.transformed = 1;
        e.form = 1;
        e.name = '심해의 혼혈';
        e.weak = ['fire', 'arcane'];
        e.known = e.known.filter((w) => e.weak.includes(w));
        // 바뀐 약점도 통찰로 본다 (1이면 하나, 2 이상이면 전부)
        delete e.mem.sensed;
        c.senseWeak(e);
        e.maxPoise = scaledPoise(10);
        e.poise = e.broken ? 0 : e.maxPoise;
        releaseSkill(c, e, (n) => `낚싯대가 부러졌다. 「${n}」${josa(n, '을')} 되찾았다`);
        c.emit({ t: 'fx', name: 'transform', tgt: e.uid });
        cine(c, 'shatter', { uid: e.uid });
        cine(c, 'water', { n: 3 });
        c.emit({ t: 'text', uid: e.uid, text: '껍데기가 찢어지고 비늘이 드러난다', tone: 'eldritch' });
        cine(c, 'whisper', { text: '{origin}. 너도 미끼였다. 아래의 것이 너를 기다린다.' });
        c.heal(e, 30);
        c.loseSanity(8, true);
        if (e.broken !== 2) c.planIntent(e);
      },
    },
  },
  {
    id: 'lamp-bound',
    name: '등명기',
    desc: `등명기가 돌며 등대지기에게 방어도 ${LAMP_BLOCK}을 비춘다. 세 번째 차례마다 섬광을 터뜨려 눈부심을 건다 (다음 내 턴 동안 적의 의도가 가려진다). 꺼진 등명기는 두 번까지 다시 밝힌다. 등명기는 후열에 있어도 근접으로 닿는다`,
    hooks: {
      onAnyDeath(c, s, victim) {
        if (!isEnemy(victim) || victim.def !== 'lamp' || victim === s.unit) return;
        setUi(c, 'ui:dark', LAMP_DARK);
        c.emit({ t: 'text', uid: s.unit.uid, text: '등명기가 꺼졌다. 어둠 속에서 숨소리만 들린다', tone: 'eldritch' });
      },
    },
  },
  {
    id: 'a1-liar',
    name: '거짓말쟁이',
    desc: `때때로 '휴전 제안'을 내민다. 그 턴에 두목을 공격하지 않으면 골드 ${PARLEY_GOLD}를 건네고 조직원을 하나 부른다. 공격하면 협상 결렬: 커틀러스로 되갚고 힘 +${PARLEY_ANGER}. 제안이 거짓말일 때도 있다. 조직원들이 방아쇠에 손가락을 걸면 배신의 일제 사격이 온다 (통찰 ${LIAR_REVEAL}이면 진짜 속셈이 보인다)`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        if (c.s.phase === 'player' && d.src === c.p && e.intent?.move === 'parley') e.mem.parleyHit = 1;
        if (!e.mem.taunted && e.hp > 0 && hpPct(e) <= 0.5) {
          e.mem.taunted = 1;
          cine(c, 'whisper', { text: '{origin}, 네 목에 걸린 현상금이 얼마인지 알아?' });
        }
      },
    },
  },
  {
    id: 'a1-line',
    name: '낚싯줄',
    desc: `낚싯줄로 장착한 기술 하나를 건다. 전열에 팽팽한 낚싯줄이 나타나 두 번째 차례에 기술을 낚아 간다 (어부 힘 +${CATCH_STR}). 줄을 쓰러뜨려 끊거나 어부를 붕괴시키면 되찾는다. 낚인 기술은 어부가 본모습을 드러내거나 쓰러지면 돌아온다`,
    hooks: {
      onDeath(c, s) {
        if (isEnemy(s.unit)) releaseSkill(c, s.unit, (n) => `「${n}」${josa(n, '을')} 되찾았다`);
      },
    },
  },
  {
    id: 'a1-taut',
    name: '팽팽한 줄',
    desc: '낚싯바늘에 걸린 기술이 매달려 있다. 쓰러뜨려 줄을 끊으면 기술이 돌아온다. 두 번째 차례에 낚아 간다',
    hooks: {
      onDeath(c) {
        const f = angler(c);
        if (f) cutLine(c, f, '낚싯줄이 끊어졌다');
      },
    },
  },
  {
    id: 'a1-sinking',
    name: '가라앉는 배',
    desc: `선장이 행동할 때마다 물이 1 차오른다 (최대 ${WATER_MAX}). 물이 ${WATER_MAX}이면 숨이 막혀 내 턴이 시작될 때 행동력 -1. 한 턴에 선장에게 피해 ${BAIL_DMG} 이상을 주거나 익사체를 쓰러뜨리면 물이 1 빠진다. 선장 차례에 터지는 출혈·독·화상도 센다. 선장을 붕괴시키면 모두 빠진다. 물이 끝까지 차면 「만조」를 부른다. 다음 선장 차례까지 물을 빼지 못하면 물에 잠겨 최대 체력의 ${Math.round(TIDE_DMG * 100)}% 피해 (방어도 무시), 다음 턴 행동력 -${TIDE_AP}. 만조가 몰려오는 턴엔 숨을 참아 행동력이 줄지 않는다. 막든 맞든 ${TIDE_GAP}턴 동안은 다시 부르지 않는다`,
    hooks: {
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        e.mem.bail = 0;
        e.mem.bailed = 0;
        // 붕괴·기절로 쉰 차례, 만조가 지나간 차례엔 차오르지 않는다 (수호자는 쉬면 stunGuard가 남는다)
        if (!e.mem.stunGuard && last(e) !== 'hightide') riseWater(c, e);
      },
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.bailed) return;
        // 내 턴에 준 피해, 그리고 선장 차례가 시작될 때 터지는 지속 피해(출혈·독·화상)도 센다 — 만조가 닿기 전이다
        if (!((c.s.phase === 'player' && d.src === c.p) || d.tags.includes('dot'))) return;
        e.mem.bail = (e.mem.bail ?? 0) + unguarded(d);
        if (e.mem.bail >= BAIL_DMG) {
          e.mem.bailed = 1;
          bailWater(c, e);
        } else if (e.mem.tide && !e.dead) tideObjective(c, e);
      },
    },
  },
  {
    id: 'a1-scales',
    name: '고기 저울',
    desc: `체력이 절반 이하인 상대를 보면 곧장 도축을 준비한다. 토막내기는 체력이 절반 이하인 상대에게 피해 +${Math.round((SCALE_MULT - 1) * 100)}%`,
    hooks: {
      modDamageOut(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || !d.attack || d.tgt !== c.p) return;
        const m = e.intent?.move;
        if ((m === 'prep' || m === 'chop') && c.p.hp * 2 <= c.p.maxHp) d.mult *= SCALE_MULT;
      },
    },
  },
  {
    id: 'a1-pincer',
    name: '집게',
    desc: `집게로 문 무기는 ${CLAMP_TURNS}턴 뒤에 놓는다. 붕괴시키거나 쓰러뜨리면 곧바로 놓는다`,
    hooks: {
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        // 문 그 차례는 세지 않는다 — 내 턴 CLAMP_TURNS번 동안 문다
        if (!isEnemy(e) || !e.mem.clamp || last(e) === 'clamp') return;
        e.mem.clampLeft = (e.mem.clampLeft ?? 1) - 1;
        if (e.mem.clampLeft <= 0) freeWeapon(c, '집게가 지쳐 무기를 놓았다');
      },
    },
  },
  {
    id: 'a1-judge',
    name: '재판관',
    desc: `판결을 내린다. 집행자의 다음 차례가 오기 전까지 집행자에게 피해 ${VERDICT_DMG} 이상을 주면 무죄: 집행자 버팀 -${ACQUIT_POISE}. 못 주면 유죄: 정신력 -${GUILTY_SAN}, 취약 ${GUILTY_VULN}. 방어도에 막힌 피해와 집행자 차례에 터지는 출혈·독·화상도 센다`,
    hooks: {
      onDamageTaken(c, s, d) {
        const dot = d.tags.includes('dot');
        if (isEnemy(s.unit) && (d.src === c.p || dot)) plead(c, s.unit, unguarded(d), dot);
      },
      // 지속 피해가 터진 뒤, 행동하기 전에 판결한다
      onUnitTurnStart(c) {
        judge(c);
      },
    },
  },
]);

// ───────────── 행동 도우미 ─────────────

/** 등명기의 회전: 등대지기에게 방어도, 보는 이에게 정신 피해 */
function shine(c: Combat, e: EnemyUnit) {
  e.mem.spins = (e.mem.spins ?? 0) + 1;
  const lk = c.alive.find((x) => x.def === 'lightkeeper');
  if (lk) c.gainBlock(lk, LAMP_BLOCK);
  c.loseSanity(2, true);
}

/** 망령의 손길: 막아 내지 못하면 유리에 손자국이 남는다 */
function touch(name: string, dmg: number, extra: (c: Combat, e: EnemyUnit) => void, desc: string): MoveDef {
  return {
    ...mv.attack(name, dmg, { type: 'void', desc }),
    run(c, e) {
      const ds = c.enemyAttack(e, { type: 'void' });
      if (c.over || e.dead) return;
      extra(c, e);
      if (dealt(ds) > 0) leavePrint(c, e);
    },
  };
}

/** 두목의 휴전 제안은 진짜든 거짓이든 같은 얼굴이다 (통찰이 모자라면 설명도 없이 '휴전 제안'으로만 보인다) */
const PARLEY_FACE = { kind: 'special' as const, label: '휴전 제안', reveal: LIAR_REVEAL };

// ───────────── 일반 적 ─────────────

reg.enemies([
  {
    id: 'thug',
    name: '부두 깡패',
    icon: 'gi:bandit',
    act: 1,
    tier: 'normal',
    hp: [36, 40],
    poise: 3,
    weak: ['pierce', 'arcane'],
    row: 0,
    moves: {
      punch: mv.attack('주먹질', 7),
      pipe: mv.attack('쇠파이프', 12),
      jeer: mv.buff(
        '비웃음',
        (c, e) => {
          c.apply(e, 'str', 2, e);
          e.mem.jeered = 1;
        },
        { desc: '힘 +2' },
      ),
    },
    ai: (c, e) => opener(c, e, ['punch']) ?? pick(c, e, { punch: 3, pipe: 2, jeer: e.mem.jeered ? 0 : 1 }),
    visual: { tint: 0x8a7f72, glow: 0xb08050 },
  },
  {
    id: 'smuggler',
    name: '밀수꾼',
    icon: 'gi:hooded-assassin',
    act: 1,
    tier: 'normal',
    hp: [27, 31],
    poise: 2,
    weak: ['slash', 'fire'],
    row: 1,
    traits: ['thief'],
    moves: {
      shot: mv.attack('권총 사격', 7, { melee: false, type: 'pierce' }),
      smoke: mv.debuff(
        '연막',
        (c, e) => {
          c.gainBlock(e, 6);
          c.apply(c.p, 'weak', 1, e);
        },
        { extra: ['block'], desc: '방어도 6, 약화 1' },
      ),
      pickpocket: mv.attack('소매치기', 4, {
        desc: '골드를 최대 10 훔친다 (처치하면 돌려받는다)',
        then(c, e) {
          const n = Math.min(10, c.p.gold);
          if (n > 0) {
            c.p.gold -= n;
            e.mem.stolen = (e.mem.stolen ?? 0) + n;
            c.emit({ t: 'text', uid: 'p', text: `골드 -${n}`, tone: 'bad' });
          }
        },
      }),
    },
    ai: (c, e) => (e.row === 0 ? pick(c, e, { pickpocket: 3, shot: 2, smoke: 1 }) : pick(c, e, { shot: 3, smoke: 2 })),
    visual: { tint: 0x5d6b78, glow: 0x9ab0c0 },
  },
  {
    id: 'dog',
    name: '굶주린 들개',
    icon: 'gi:direwolf',
    act: 1,
    tier: 'normal',
    hp: [17, 20],
    poise: 2,
    weak: ['slash', 'blunt'],
    row: 0,
    moves: {
      bite: mv.attack('물어뜯기', 6, { then: (c, e) => void c.apply(c.p, 'bleed', 1, e), desc: '출혈 1' }),
      pack: mv.attack('포위 공격', 4, { hits: 2 }),
    },
    ai: (c, e) => pick(c, e, { bite: 2, pack: countDef(c, 'dog') > 1 ? 2 : 0 }),
    visual: { tint: 0x6e5b4a, glow: 0xd04030, scale: 0.85 },
  },
  {
    id: 'rats',
    name: '시궁쥐 떼',
    icon: 'gi:rat',
    act: 1,
    tier: 'normal',
    hp: [25, 29],
    poise: 4,
    weak: ['fire', 'blunt'],
    row: 0,
    traits: ['swarm'],
    moves: {
      gnaw: mv.attack('갉아먹기', 3, { hits: 3, type: 'slash' }),
      breed: mv.summon('번식', (c) => void c.spawn('rat', 0), '쥐 1마리 소환'),
    },
    ai: (c, e) => opener(c, e, ['gnaw']) ?? pick(c, e, { gnaw: 3, breed: c.alive.length < 4 ? 2 : 0 }),
    visual: { tint: 0x5a4f45, glow: 0xc02020, scale: 0.9 },
  },
  {
    id: 'rat',
    name: '쥐',
    icon: 'gi:rat',
    act: 1,
    tier: 'minion',
    hp: [7, 8],
    poise: 0,
    weak: ['slash', 'pierce', 'blunt', 'fire'],
    row: 0,
    moves: { bite: mv.attack('물기', 3) },
    ai: () => 'bite',
    visual: { tint: 0x4a413a, glow: 0xa02020, scale: 0.55 },
  },
  {
    id: 'sailor',
    name: '술 취한 선원',
    icon: 'gi:pirate-captain',
    act: 1,
    tier: 'normal',
    hp: [40, 44],
    poise: 3,
    weak: ['pierce', 'void'],
    row: 0,
    moves: {
      bottle: mv.attack('병 휘두르기', 11),
      stagger: mv.block('비틀거림', 5, { desc: '방어도 5' }),
      roar: mv.buff(
        '고함',
        (c, e) => {
          c.apply(e, 'str', 1, e);
          c.apply(c.p, 'weak', 1, e);
        },
        { extra: ['debuff'], desc: '힘 +1, 약화 1' },
      ),
    },
    ai: (c, e) => pick(c, e, { bottle: 3, stagger: 2, roar: 1 }, 1),
    visual: { tint: 0x7a6650, glow: 0xc09060 },
  },
  {
    id: 'initiate',
    name: '교단 입문자',
    icon: 'gi:cultist',
    act: 1,
    tier: 'normal',
    hp: [29, 33],
    poise: 3,
    weak: ['slash', 'fire'],
    row: 1,
    moves: {
      pray: mv.buff('기도', (c, e) => {
        for (const a of c.alive) c.apply(a, 'str', 1, e);
      }, { desc: '모든 아군 힘 +1' }),
      whisper: mv.horror('속삭임', 4),
      stab: mv.attack('단검 찌르기', 8, { type: 'pierce' }),
    },
    ai: (c, e) => (e.row === 0 ? pick(c, e, { stab: 3, whisper: 1 }) : pick(c, e, { pray: 2, whisper: 2 })),
    visual: { tint: 0x4d3a52, glow: 0x9a50c0 },
  },
  {
    id: 'drowned',
    name: '익사체',
    icon: 'gi:shambling-zombie',
    act: 1,
    tier: 'normal',
    hp: [35, 39],
    poise: 3,
    weak: ['fire', 'blunt'],
    resist: { pierce: 0.5 },
    row: 0,
    dread: 2,
    traits: ['risen'],
    moves: {
      grasp: mv.attack('움켜쥐기', 8, { then: (c, e) => void c.apply(c.p, 'frail', 1, e), desc: '허약 1' }),
      vomit: mv.debuff(
        '검은 물 토하기',
        (c, e) => {
          c.enemyAttack(e, { dmg: 3, melee: false, type: 'void' });
          c.apply(c.p, 'weak', 1, e);
        },
        { extra: ['attack'], dmg: 3, desc: '피해 3, 약화 1' },
      ),
    },
    ai: (c, e) => pick(c, e, { grasp: 3, vomit: 2 }),
    visual: { tint: 0x3f5a55, glow: 0x60c0a0, fx: ['drip'] },
  },
  {
    id: 'gulls',
    name: '썩은 갈매기 떼',
    icon: 'gi:seagull',
    act: 1,
    tier: 'normal',
    hp: [19, 22],
    poise: 2,
    weak: ['pierce', 'fire'],
    row: 1,
    traits: ['flying'],
    moves: {
      peck: mv.attack('쪼아대기', 3, { hits: 2, melee: false, type: 'pierce' }),
      dive: mv.attack('급강하', 8, { melee: false, type: 'pierce' }),
    },
    ai: (c, e) => cycle(e, ['peck', 'peck', 'dive']),
    visual: { tint: 0x8c8c86, glow: 0xe0e0c0, scale: 0.85, fx: ['float'] },
  },
  {
    id: 'hookman',
    name: '갈고리꾼',
    icon: 'gi:pirate-hook',
    act: 1,
    tier: 'normal',
    hp: [42, 46],
    poise: 4,
    weak: ['slash', 'arcane'],
    row: 0,
    moves: {
      hook: mv.attack('갈고리 걸기', 9, { type: 'pierce', then: (c, e) => void c.apply(c.p, 'vuln', 1, e), desc: '취약 1' }),
      windup: mv.charge('내려찍기 준비', 22),
      slam: release(mv.attack('내려찍기', 22)),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'slam';
      return opener(c, e, ['hook']) ?? pick(c, e, { hook: 2, windup: e.hist.slice(-2).includes('slam') ? 0 : 1 });
    },
    visual: { tint: 0x6f6458, glow: 0xc0a080 },
  },
  {
    id: 'lurker',
    name: '어둠 속의 눈',
    icon: 'gi:evil-eyes',
    act: 1,
    tier: 'normal',
    hp: [23, 27],
    poise: 2,
    weak: ['fire', 'arcane'],
    row: 1,
    dread: 3,
    eldritch: true,
    moves: {
      gaze: mv.horror('응시', 6),
      claw: mv.attack('그림자 손톱', 7, { melee: false, type: 'void' }),
    },
    ai: (c, e) => cycle(e, ['gaze', 'claw', 'claw']),
    visual: { tint: 0x1e1a24, glow: 0xe0d050, fx: ['flicker', 'float'] },
  },

  // ───────────── 정예 ─────────────
  {
    id: 'butcher',
    name: '어시장 도살자',
    icon: 'gi:meat-cleaver',
    act: 1,
    tier: 'elite',
    hp: [86, 92],
    poise: 6,
    weak: ['pierce', 'fire'],
    row: 0,
    traits: ['a1-scales'],
    moves: {
      hack: mv.attack('난도질', 4, { hits: 3, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 2, e), desc: '출혈 2' }),
      prep: mv.charge('도축 준비', 24),
      chop: release(mv.attack('토막내기', 24, { type: 'slash', ultimate: true, cine: 'impact' })),
      scent: mv.buff('피 냄새', (c, e) => void c.apply(e, 'str', (c.p.st.bleed ?? 0) > 0 ? 3 : 2, e), {
        desc: '힘 +2 (출혈 중인 상대면 +3)',
      }),
      salt: mv.debuff(
        '상처에 소금',
        (c, e) => {
          const b = c.p.st.bleed ?? 0;
          c.apply(c.p, 'bleed', SALT_BLEED + Math.min(SALT_BLEED, b), e);
        },
        { desc: `출혈 ${SALT_BLEED} (이미 피를 흘리고 있으면 그만큼 더, 최대 +${SALT_BLEED})` },
      ),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'chop';
      const first = opener(c, e, ['hack']);
      if (first) return first;
      // 고기 저울: 체력이 절반 이하인 상대는 곧장 도축한다 (막 토막낸 직후엔 한 번 쉰다)
      const justChopped = last(e) === 'chop';
      if (c.p.hp * 2 <= c.p.maxHp && !justChopped) return 'prep';
      const bleeding = (c.p.st.bleed ?? 0) > 0;
      return pick(c, e, { hack: 2, prep: justChopped ? 0 : 1, scent: 1, salt: bleeding && last(e) !== 'salt' ? 2 : 0 }, 1);
    },
    visual: { tint: 0x7a5048, glow: 0xd03020, scale: 1.2 },
  },
  {
    id: 'enforcer',
    name: '교단 집행자',
    icon: 'gi:executioner-hood',
    act: 1,
    tier: 'elite',
    hp: [70, 76],
    poise: 5,
    weak: ['blunt', 'void'],
    row: 0,
    traits: ['zealot', 'a1-judge'],
    moves: {
      protect: mv.block('신앙의 방벽', 0, {
        then(c, e) {
          for (const a of c.alive) c.gainBlock(a, 8);
          void e;
        },
        desc: '모든 아군 방어도 8',
      }),
      execute: mv.attack('처형', 13),
      zeal: mv.horror('광신의 설교', 6, { dmg: 5, melee: false }),
      // 쇠사슬로 내리치며 판결을 내린다
      verdict: mv.attack('판결', VERDICT_HIT, {
        extra: ['debuff'],
        desc: `집행자의 다음 차례가 오기 전까지 집행자에게 피해 ${VERDICT_DMG} 이상을 주지 못하면 유죄 (정신력 -${GUILTY_SAN}, 취약 ${GUILTY_VULN}). 채우면 무죄 (집행자 버팀 -${ACQUIT_POISE}). 출혈·독·화상도 센다`,
        then: (c, e) => sentence(c, e),
      }),
    },
    ai: (c, e) => {
      const first = opener(c, e, ['verdict']);
      if (first) return first;
      const again = c.s.turn - (e.mem.verdictAt ?? -99) >= VERDICT_GAP && !((c.p.st[TRIAL] ?? 0) > 0) && last(e) !== 'verdict';
      return pick(c, e, { execute: 3, protect: others(c, e).length ? 2 : 0, zeal: 1, verdict: again ? 2 : 0 });
    },
    visual: { tint: 0x3a2a40, glow: 0xc040a0, scale: 1.15 },
  },
  {
    id: 'crab',
    name: '거대 게',
    icon: 'gi:crab',
    act: 1,
    tier: 'elite',
    hp: [74, 80],
    poise: 7,
    weak: ['blunt', 'arcane'],
    resist: { slash: 0.5 },
    row: 0,
    traits: ['a1-pincer'],
    moves: {
      claw: mv.attack('집게', 13),
      shell: mv.block('껍질 닫기', 15, { desc: '방어도 15' }),
      bubble: mv.debuff(
        '거품',
        (c, e) => {
          c.apply(c.p, 'weak', 2, e);
          c.apply(c.p, 'frail', 2, e);
        },
        { desc: '약화 2, 허약 2' },
      ),
      clamp: mv.attack('집게로 물기', 7, {
        extra: ['debuff'],
        desc: `무기를 문다. ${CLAMP_TURNS}턴 동안 무기 기본 공격을 쓸 수 없다 (게를 붕괴시키거나 쓰러뜨리면 곧바로 놓는다)`,
        cine: 'crack',
        then: (c, e) => void clampWeapon(c, e),
      }),
    },
    ai: (c, e) => {
      const m = cycle(e, ['claw', 'clamp', 'shell', 'claw', 'bubble']);
      return m === 'clamp' && (c.p.st[DISARMED] ?? 0) > 0 ? 'claw' : m;
    },
    visual: { tint: 0x8a3f30, glow: 0xff8050, scale: 1.25 },
  },

  // ───────────── 층 수호자 ─────────────
  {
    id: 'lightkeeper',
    name: '등대지기',
    icon: 'gi:lighthouse',
    act: 1,
    tier: 'boss',
    hp: [175, 175],
    poise: 10,
    weak: ['pierce', 'void'],
    row: 0,
    dread: 4,
    traits: ['lamp-bound'],
    moves: {
      swing: mv.attack('랜턴 휘두르기', 14),
      beam: mv.horror('눈먼 광선', 8, { dmg: 8, type: 'fire' }),
      relight: mv.summon(
        '불 밝히기',
        (c) => {
          c.spawn('lamp', 1);
          setUi(c, 'ui:dark', 0);
        },
        '등명기를 다시 밝힌다 (처음부터 돌기 시작한다)',
      ),
      madness: mv.buff(
        '빛에 미친 자',
        (c, e) => {
          c.apply(e, 'str', 3, e);
          c.emit({ t: 'text', uid: e.uid, text: '빛이… 모든 것을 태운다…', tone: 'eldritch' });
          cine(c, 'eye', { uid: e.uid });
          cine(c, 'whisper', { uid: e.uid, text: '{time}. 아직도 화면을 켜 두었구나. 그 빛을 따라 여기까지 왔지.' });
          // 꺼져 있던 등명기도 다시 타오른다 (다시 밝히는 횟수와 별개)
          if (countDef(c, 'lamp') === 0 && c.spawn('lamp', 1)) setUi(c, 'ui:dark', 0);
        },
        { desc: `힘 +3, 꺼진 등명기를 다시 밝힌다. 이제부터 빛을 모아 백열광(${SEAR_DMG})을 쏜다` },
      ),
      shards: mv.attack('렌즈 파편', 5, { hits: 3, melee: false, type: 'pierce' }),
      gather: mv.charge('빛을 모은다', SEAR_DMG),
      sear: release(mv.attack('백열광', SEAR_DMG, { melee: false, type: 'fire', ultimate: true, cine: 'impact' })),
    },
    onSpawn: (c) => void c.spawn('lamp', 1),
    ai: (c, e) => {
      if (e.mem.charge) return 'sear';
      if (hpPct(e) <= 0.5 && !e.mem.p2) {
        e.mem.p2 = 1;
        return 'madness';
      }
      if (countDef(c, 'lamp') === 0 && (e.mem.relit ?? 0) < 2 && pick(c, e, { a: 1, b: 1 }) === 'a') {
        e.mem.relit = (e.mem.relit ?? 0) + 1;
        return 'relight';
      }
      return e.mem.p2 ? cycle(e, ['gather', 'shards', 'beam', 'swing'], 'c2') : cycle(e, ['swing', 'beam', 'swing']);
    },
    visual: { tint: 0x504a40, glow: 0xffe080, scale: 1.4, fx: ['beam'] },
  },
  {
    id: 'lamp',
    name: '등명기',
    icon: 'gi:lantern-flame',
    act: 1,
    tier: 'minion',
    hp: [22, 22],
    poise: 0,
    weak: ['blunt', 'pierce'],
    row: 1,
    // 깨야 하는 기믹 물건 — 후열에 있어도 근접으로 닿는다 (근접 직업만 섬광을 못 막는 일이 없게)
    reachable: true,
    moves: {
      // 등명기는 돈다: 두 번 비추고 세 번째에 섬광 (의도 이름이 남은 차례를 알려 준다)
      turn2: mv.buff('섬광까지 2', shine, { desc: `등대지기 방어도 ${LAMP_BLOCK}, 정신력 -2. 두 턴 뒤 섬광` }),
      turn1: mv.buff('섬광까지 1', shine, { desc: `등대지기 방어도 ${LAMP_BLOCK}, 정신력 -2. 다음 턴 섬광` }),
      flash: {
        ...mv.horror('섬광', FLASH_SAN, {
          dmg: FLASH_DMG,
          type: 'fire',
          then: (c, e) => {
            e.mem.spins = 0;
            dazzle(c, e);
          },
          desc: '화염 피해, 정신 피해, 눈부심. 다음 내 턴 동안 적의 의도가 보이지 않는다 (힘을 모은 큰 공격만 보인다). 등명기를 깨면 걷힌다. 등명기는 후열에 있어도 근접으로 닿는다',
        }),
        cine: 'beam',
      },
    },
    ai: (_c, e) => LAMP_SPIN[(e.mem.spins ?? 0) % LAMP_SPIN.length],
    visual: { tint: 0x8a7a40, glow: 0xffd060, scale: 0.75, fx: ['flicker'] },
  },
  {
    id: 'queen',
    name: '밀수조직 두목',
    icon: 'gi:queen-crown',
    act: 1,
    tier: 'boss',
    hp: [145, 145],
    poise: 9,
    weak: ['slash', 'arcane'],
    row: 0,
    traits: ['a1-liar'],
    moves: {
      command: mv.summon('집결 명령', (c) => void c.spawn('crew', 1), '조직원 소환'),
      bounty: mv.debuff('현상금', (c, e) => void c.apply(c.p, 'vuln', 2, e), { desc: '취약 2' }),
      volley: mv.attack('일제 사격', 3, { melee: false, type: 'pierce', hits: (c) => 1 + countDef(c, 'crew') }),
      cutlass: mv.attack('커틀러스', CUTLASS_DMG, { type: 'slash' }),
      // 진짜 휴전 — 거짓 휴전과 같은 얼굴로 보인다 (통찰이 모자라면 설명 없이 '휴전 제안'으로만)
      parley: {
        name: '휴전 제안',
        intent: 'special',
        disguise: PARLEY_FACE,
        desc: `이번 턴 두목을 공격하지 않으면 골드 ${PARLEY_GOLD}를 건네고 조직원을 하나 부른다. 공격하면 협상 결렬: 커틀러스(${CUTLASS_DMG})로 되갚고 힘 +${PARLEY_ANGER}`,
        run(c, e) {
          if (e.mem.parleyHit) {
            c.emit({ t: 'text', uid: e.uid, text: '협상 결렬. 피는 피로 갚는다', tone: 'bad' });
            c.enemyAttack(e, { dmg: CUTLASS_DMG, hits: 1, type: 'slash', melee: true });
            if (!c.over && !e.dead) c.apply(e, 'str', PARLEY_ANGER, e);
            return;
          }
          e.mem.deals = (e.mem.deals ?? 0) + 1;
          c.p.gold += PARLEY_GOLD;
          c.emit({ t: 'text', uid: 'p', text: `골드 +${PARLEY_GOLD}`, tone: 'good' });
          c.emit({ t: 'text', uid: e.uid, text: '거래 성립이야. …오늘은.', tone: 'info' });
          c.spawn('crew', 1);
        },
      },
      // 거짓 휴전 — 조직원마다 한 발씩 더 (조직원은 거짓말을 못 해서 미리 방아쇠에 손가락을 건다)
      betray: {
        name: '배신의 일제 사격',
        intent: 'attack',
        dmg: BETRAY_DMG,
        hits: (c) => 2 + countDef(c, 'crew'),
        melee: false,
        ultimate: true,
        disguise: PARLEY_FACE,
        desc: '휴전은 거짓말이었다. 조직원마다 한 발씩 더',
        run(c, e) {
          cine(c, 'sysmsg', { uid: e.uid, text: '거래가 취소되었습니다.' });
          // 그 사이 쓰러진 조직원의 몫은 빠진다
          c.enemyAttack(e, { type: 'pierce', hits: 2 + countDef(c, 'crew') });
        },
      },
    },
    onSpawn: (c) => {
      c.spawn('crew', 1);
      c.spawn('crew', 1);
    },
    ai: (c, e) => {
      const first = opener(c, e, ['bounty']);
      if (first) return first;
      const crew = countDef(c, 'crew');
      // 휴전 제안: 조직원이 곁에 있을 때 몇 턴에 한 번. 첫 제안은 진짜, 그다음부터는 반반 (진짜 거래는 두 번까지)
      if (crew > 0 && c.s.turn - (e.mem.offerAt ?? -99) >= OFFER_GAP && last(e) !== 'command') {
        e.mem.offerAt = c.s.turn;
        const offers = e.mem.offers ?? 0;
        e.mem.offers = offers + 1;
        if ((e.mem.deals ?? 0) < MAX_DEALS && (offers === 0 || c.rng.chance(0.5))) {
          e.mem.parleyHit = 0;
          return 'parley';
        }
        return 'betray';
      }
      return pick(c, e, { volley: 3, cutlass: 2, command: crew < 2 && !e.hist.slice(-2).includes('command') ? 3 : 0 });
    },
    visual: { tint: 0x6a4a5a, glow: 0xe0b060, scale: 1.3 },
  },
  {
    id: 'fisherman',
    name: '늙은 어부',
    icon: 'gi:lucky-fisherman',
    act: 1,
    tier: 'boss',
    hp: [150, 150],
    poise: 8,
    weak: ['fire', 'slash'],
    row: 0,
    traits: ['deep-blood', 'a1-line'],
    moves: {
      net: mv.debuff(
        '그물 던지기',
        (c, e) => {
          c.apply(c.p, 'frail', 2, e);
          c.apply(c.p, 'weak', 1, e);
        },
        { desc: '허약 2, 약화 1' },
      ),
      gaff: mv.attack('갈고리 장대', 9, { type: 'pierce' }),
      mutter: mv.horror('중얼거림', 3, { desc: '알아들을 수 없는 기도' }),
      cast: {
        ...mv.attack('낚싯줄 던지기', 5, { melee: false, type: 'pierce', extra: ['debuff'] }),
        desc: '장착한 기술 하나를 낚싯바늘에 건다 (장착한 기술이 둘 이상일 때). 전열에 팽팽한 낚싯줄이 나타나 두 번째 차례에 낚아 간다. 줄을 끊거나 어부를 붕괴시키면 되찾는다',
        run(c, e) {
          c.enemyAttack(e, { type: 'pierce' });
          if (!c.over && !e.dead) hookSkill(c, e);
        },
      },
      maw: mv.attack('심해의 아가리', 16, { then: (c, e) => void c.heal(e, 6), desc: '체력 6 회복', ultimate: true, cine: 'corners' }),
      tide: mv.attack('조수', 7, { hits: 2 }),
      // 바다 밑의 노래에 홀린다 (세이렌처럼) — 다음 내 턴 행동력 -1
      song: mv.horror('심연의 노래', 8, { then: (c) => charm(c), desc: `정신 피해, 매혹 (다음 내 턴 행동력 -${CHARM_AP})` }),
    },
    ai: (c, e) => {
      if (e.form) return cycle(e, ['maw', 'tide', 'song'], 'c2');
      // 낚싯줄은 쥔 기술이 없을 때만 던진다 (못 던지면 장대로 찌른다)
      const m = cycle(e, ['cast', 'gaff', 'net', 'gaff', 'mutter']);
      return m === 'cast' && !canHook(c, e) ? 'gaff' : m;
    },
    visual: { tint: 0x5a5a50, glow: 0x80c0b0, scale: 1.3 },
    forms: [{ name: '심해의 혼혈', icon: 'gi:fish-monster', visual: { tint: 0x2f5550, glow: 0x50ffd0, scale: 1.5, fx: ['drip'] } }],
  },

  // ───────────── 계층군주 / 추적자 / 균열 수호자 ─────────────
  {
    id: 'captain',
    name: '익사한 선장',
    icon: 'gi:pirate-skull',
    act: 1,
    tier: 'boss',
    hp: [190, 190],
    poise: 12,
    weak: ['fire', 'void'],
    row: 0,
    dread: 6,
    eldritch: true,
    traits: ['a1-sinking'],
    moves: {
      sword: mv.attack('녹슨 커틀러스', 8, { hits: 2, type: 'slash' }),
      // 배의 종이 울리면 바다 밑의 선원들이 대답한다
      muster: { ...mv.summon('선원 소집', (c) => void c.spawn('drowned', 0), '익사체 소환'), cine: 'bell' },
      ready: mv.charge('닻을 들어올린다', 26),
      anchor: release(
        mv.attack('닻 내려치기', 26, {
          ultimate: true,
          cine: 'impact',
          // 화면 유리에 금이 남는다 (닻을 내려칠 때마다 깊어진다)
          then: (c) => {
            const k = Math.min(3, (c.s.vars['ui:cracks'] ?? 0) + 1);
            setUi(c, 'ui:cracks', k);
            cine(c, 'crack', { n: k });
          },
        }),
      ),
      shanty: mv.horror('익사자의 뱃노래', 10, { then: (c, e) => void c.apply(c.p, 'dread', 2, e), desc: '정신 피해, 공포 2' }),
      // 퍼즐: 물이 끝까지 찬 채로 이 차례가 오면 물에 잠긴다 (큰 피해 + 헐떡임)
      hightide: {
        name: '만조',
        intent: 'charge',
        desc: `물이 끝까지 찬 채로 이 차례가 오면 물에 잠긴다. 최대 체력의 ${Math.round(TIDE_DMG * 100)}% 피해 (방어도 무시), 다음 턴 행동력 -${TIDE_AP}. 물 빼는 법: 한 턴에 선장에게 피해 ${BAIL_DMG} (출혈·독·화상 포함), 익사체 처치, 선장 붕괴`,
        run: (c, e) => resolveTide(c, e),
      },
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'anchor';
      // 만조: 물이 끝까지 차면 다음 차례에 몰려온다 (부른 뒤엔 풀리거나 닿을 때까지 그대로 — 기절로 미뤄졌으면 목표를 새로 센다)
      if (e.mem.tide) {
        tideObjective(c, e);
        return 'hightide';
      }
      if (tideReady(c, e)) {
        callTide(c, e);
        return 'hightide';
      }
      const m = cycle(e, ['sword', 'muster', 'ready', 'shanty', 'sword', 'ready']);
      if (m === 'muster' && c.alive.length >= 4) return 'sword';
      return m;
    },
    visual: { tint: 0x2a3c3c, glow: 0x40ffc0, scale: 1.5, fx: ['drip', 'float'] },
  },
  {
    id: 'fogstalker',
    name: '안개 속 사냥꾼',
    icon: 'gi:spectre',
    act: 1,
    tier: 'elite',
    hp: [70, 70],
    poise: 6,
    weak: ['fire', 'arcane'],
    row: 0,
    dread: 3,
    traits: ['veiled'],
    moves: {
      strike: {
        ...mv.attack('그림자 일격', 13, { type: 'slash' }),
        run(c, e) {
          setUi(c, 'ui:dark', 0);
          c.enemyAttack(e, { type: 'slash' });
        },
      },
      rend: mv.attack('찢기', 5, { hits: 3, type: 'slash' }),
      // 안개가 짙어진다 (화면이 어두워진다) — 이미 안개 속에 있는 것이 또 숨을 리 없다
      vanish: mv.block('안개 속으로', 10, { desc: '방어도 10. 안개가 짙어진다', then: (c) => setUi(c, 'ui:dark', FOG_DARK) }),
      // 숨는 척 덮쳐 온다 (통찰 3이면 보인다)
      lunge: {
        ...mv.attack('안개 속 기습', LUNGE_DMG, { type: 'slash', ultimate: true, cine: 'impact' }),
        disguise: { kind: 'block', label: '안개 속으로…', reveal: LIAR_REVEAL },
        desc: '숨는 척 안개 속에서 덮쳐 온다',
        run(c, e) {
          setUi(c, 'ui:dark', 0);
          c.enemyAttack(e, { type: 'slash' });
        },
      },
    },
    ai: (_c, e) => cycle(e, ['strike', 'rend', 'vanish', 'lunge']),
    visual: { tint: 0x8a9aa0, glow: 0xd0f0ff, scale: 1.2, fx: ['flicker', 'float'] },
  },
  {
    id: 'wraith',
    name: '바다 무덤의 망령',
    icon: 'gi:floating-ghost',
    act: 1,
    tier: 'elite',
    hp: [95, 95],
    poise: 8,
    weak: ['arcane', 'fire'],
    row: 0,
    dread: 4,
    eldritch: true,
    traits: ['incorporeal'],
    moves: {
      chill: touch('냉기의 손길', 10, (c, e) => void c.apply(c.p, 'weak', 1, e), '약화 1. 막아 내지 못하면 유리에 손자국 1'),
      wail: mv.horror('울부짖음', 7, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '정신 피해, 공포 1' }),
      drain: touch('생명 흡수', 8, (c, e) => void c.heal(e, 8), '체력 8 회복. 막아 내지 못하면 유리에 손자국 1'),
      curse: mv.debuff(
        '망자의 저주',
        (c, e) => {
          c.apply(c.p, 'frail', 2, e);
          c.apply(c.p, 'vuln', 1, e);
        },
        { desc: '허약 2, 취약 1' },
      ),
      // 유리 너머에서 손바닥들이 닿는다 → 다음 턴 끌어내린다 (손은 2 + 손자국)
      reach: {
        name: '유리에 닿는 손',
        intent: 'charge',
        charging: true,
        dmg: DRAG_DMG,
        hits: (c) => 2 + handprints(c),
        melee: false,
        desc: `다음 턴 바다 무덤으로 끌어내린다: 공허 피해 ${DRAG_DMG} × (2 + 손자국). 붕괴시키면 끊긴다`,
        run(c, e) {
          e.mem.charge = 1;
          c.emit({ t: 'text', uid: e.uid, text: '손바닥들이 유리에 닿는다', tone: 'bad' });
          cine(c, 'handprints', { uid: e.uid, n: 2 + handprints(c) });
        },
      },
      drag: release({
        name: '바다 무덤으로',
        intent: 'attack',
        dmg: DRAG_DMG,
        hits: (c) => 2 + handprints(c),
        melee: false,
        ultimate: true,
        cine: 'crack',
        desc: '손자국이 모두 사라진다',
        run(c, e) {
          c.enemyAttack(e, { type: 'void' });
          setPlayerSt(c, HANDPRINT, 0);
        },
      }),
    },
    ai: (_c, e) => (e.mem.charge ? 'drag' : cycle(e, ['chill', 'wail', 'drain', 'reach', 'curse'])),
    visual: { tint: 0x405a70, glow: 0x80e0ff, scale: 1.3, fx: ['float', 'flicker'] },
  },
]);

// 두목의 졸개 (하수인)
reg.enemies([
  {
    id: 'crew',
    name: '밀수 조직원',
    icon: 'gi:hooded-assassin',
    act: 1,
    tier: 'minion',
    hp: [14, 16],
    poise: 1,
    weak: ['slash', 'fire'],
    row: 1,
    moves: {
      shot: mv.attack('엄호 사격', 4, { melee: false, type: 'pierce' }),
      cover: mv.block('엄폐', 5, { desc: '방어도 5' }),
      // 조직원은 거짓말을 못 한다: 두목의 휴전 제안이 진짜면 총구를 내리고, 거짓이면 방아쇠에 손가락을 건다
      aim: {
        name: '방아쇠에 손가락을',
        intent: 'special',
        desc: '두목의 신호를 기다린다. 배신의 일제 사격에 한 발을 보탠다',
        run() {},
      },
      lower: {
        name: '총구를 내린다',
        intent: 'special',
        desc: '두목의 협상을 지켜본다 (아무것도 하지 않는다)',
        run() {},
      },
    },
    ai: (c, e) => {
      const deal = c.alive.find((x) => x.def === 'queen')?.intent?.move;
      if (deal === 'betray') return 'aim';
      if (deal === 'parley') return 'lower';
      return pick(c, e, { shot: 2, cover: 1 });
    },
    visual: { tint: 0x4d5a66, glow: 0x8aa0b0, scale: 0.8 },
  },
  // 늙은 어부의 낚싯줄 — 걸린 기술이 매달려 있다. 끊으면(쓰러뜨리면) 돌아온다
  {
    id: LINE,
    name: '팽팽한 낚싯줄',
    icon: 'gi:fishing-lure',
    act: 1,
    tier: 'minion',
    hp: [LINE_HP, LINE_HP],
    poise: 0,
    weak: ['slash', 'fire'],
    row: 0,
    // 끊어야 하는 기믹 물건 — 전열이 차서 후열로 밀려나도 근접으로 닿는다
    reachable: true,
    traits: ['a1-taut'],
    moves: {
      reel: {
        name: '줄을 감는다',
        intent: 'special',
        desc: '다음 차례에 걸린 기술을 낚아 간다. 그 전에 쓰러뜨려 줄을 끊으면 기술이 돌아온다',
        run(c, e) {
          e.mem.spins = 1;
          c.emit({ t: 'text', uid: e.uid, text: '줄이 팽팽해진다', tone: 'bad' });
        },
      },
      snatch: {
        name: '낚아챈다',
        intent: 'special',
        desc: `걸린 기술을 낚아 간다 (어부 힘 +${CATCH_STR}). 어부가 본모습을 드러내거나 쓰러지면 되찾는다`,
        run: (c, e) => reelIn(c, e),
      },
    },
    ai: (_c, e) => (e.mem.spins ? 'snatch' : 'reel'),
    visual: { tint: 0x9aa4a8, glow: 0xd0f0ff, scale: 0.6, fx: ['flicker'] },
  },
]);
