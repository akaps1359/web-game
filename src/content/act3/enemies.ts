import { reg } from '../../engine/registry';
import { isEnemy, unguarded, type Combat } from '../../engine/combat';
import { cycle, hpPct, last, opener, pick } from '../../engine/ai';
import type { EnemyUnit, MoveDef } from '../../engine/types';
import { countDef, mv, release } from '../moves';
import { cine, setUi } from '../lib';
import {
  absorbBlobs,
  CALLED,
  canReact,
  covered,
  END_BLOCK,
  frost,
  FROST,
  HEIGHT,
  hid,
  intentFor,
  isIllusion,
  myHit,
  react,
  refreshIntent,
  returnSkill,
  seizeSkill,
  stealInsight,
  swapRows,
  TORN,
  TORN_LOSS,
  veiledHorror,
  watchBlock,
} from './common';
import {
  ALOFT,
  ANGLE,
  BLADE_DMG,
  BLADE_N,
  BLADES,
  callHunt,
  cancelFull,
  closeAngles,
  closeIncisions,
  CUT_DMG,
  DIM_UNVEIL,
  broodHurt,
  EGG_LINK_DMG,
  EGG_POISON,
  EGG_TURNS,
  EGGS,
  ESCAPE_HITS,
  FALL_DMG,
  FULL,
  FULL_BLOCK,
  FULL_DMG,
  FULL_MAX,
  fullHit,
  fullReady,
  declareFull,
  layOnTable,
  resolveFull,
  HATCH_N,
  HUNT,
  HUNT_DMG,
  HUNT_FAIL,
  HUNT_GAP,
  huntHit,
  huntReady,
  implantEggs,
  incise,
  INCISE_N,
  LOOK_SAN,
  liftUp,
  MAX_ANGLES,
  MAX_INCISION,
  MIMIC_SCREAM,
  openAllAngles,
  openAngle,
  PLASTER,
  resolveHunt,
  reveal,
  REVEAL_TURNS,
  REVEALED,
  startListening,
  STOP_TURNS,
  stopTime,
  syncTilt,
  throwBack,
  veilAgain,
  vivisectDmg,
} from './patterns';

/*
 * 3층 적 — 얼어붙은 고대 도시.
 * 고대인(Elder Things)의 도시가 검은 얼음 속에 묻혀 있다: 고대인과 그들이 부리던 쇼고스, 얼음 위의 짐승들,
 * 얼어 죽은 탐사대, 별 너머에서 온 미고, 각도 속의 사냥개, 얼음을 건너온 렝의 거미.
 * (꿈의 땅 적들은 2026-10 개편 때 5층 act5/enemies.ts로 옮겨 갔다.)
 */

/** 깨어난 원로를 따르는 (아직 반란하지 않은) 쇼고스 노예 */
function loyalThrall(c: Combat): EnemyUnit | undefined {
  return c.alive.find((x) => x.def === 'shoggoth-thrall' && !x.mem.rebel);
}

/** 반란을 일으킨 쇼고스 노예 */
function rebelThrall(c: Combat): EnemyUnit | undefined {
  return c.alive.find((x) => x.def === 'shoggoth-thrall' && x.mem.rebel);
}

/** 피리 소리가 끊겼다: 노예가 옛 반란을 기억해 낸다 (전투마다 한 번) */
function incite(c: Combat, master: EnemyUnit) {
  if (master.mem.revolt) return;
  const t = loyalThrall(c);
  if (!t) return;
  master.mem.revolt = 1;
  t.mem.rebel = 1;
  cine(c, 'scrawl', { text: '테켈리-리!' });
  c.emit({ t: 'text', uid: t.uid, text: '테켈리-리! 노예가 주인에게 등을 돌렸다', tone: 'eldritch' });
  if (t.broken !== 2 && c.s.phase === 'player') c.planIntent(t);
}

/** 해부학자가 떼어 갈 수 있는 이로운 효과 */
const STEALABLE = ['str', 'barrier', 'regen', 'evasive', 'ward', 'ritual', 'harden', 'thorns', 'spikes'];

/** 플레이어의 이로운 효과를 떼어 제 것으로 삼는다. 떼어 낸 것이 있으면 true */
function stealBuffs(c: Combat, e: EnemyUnit): boolean {
  let took = false;
  for (const id of STEALABLE) {
    const v = c.p.st[id] ?? 0;
    if (v <= 0) continue;
    c.apply(c.p, id, -v);
    c.apply(e, id, v, e);
    took = true;
  }
  if (took) c.emit({ t: 'text', uid: e.uid, text: '떼어 낸 것을 제 몸에 꿰맨다', tone: 'eldritch' });
  return took;
}

/** 멈춘 시간: 한 턴에 받는 피해 상한 */
export const CLOCK_CAP = 75;

// ───────────── 일반 적 패턴 수치 (2026-10: 낮은 층은 위협을 늘리지 않고 갈래만 늘린다) ─────────────

/** 밤의 마귀: 「급강하」 기본 피해, 탑 끝에 매달릴 때마다 쌓는 높이, 높이 상한 */
export const DIVE_DMG = 11;
export const PERCH_STEP = 4;
export const PERCH_MAX = 8;
/** 유고스의 균류: 「광맥 발파」 피해, 「외과 봉합」 회복량 */
export const BLAST_DMG = 16;
export const SUTURE_HEAL = 12;
/** 쇼고스 유충: 지난 내 턴을 이 방어도 이상으로 마치면 「녹여 삼키기」를 노린다 */
export const DISSOLVE_AT = 10;
/** 렝의 거미: 「분노한 독액」의 독 */
export const VENOM_POISON = 4;
/** 눈먼 펭귄: 「얼음판 발 구르기」 동상 상한 */
export const STOMP_MAX = 3;
/** 눈먼 펭귄 무리가 이미 놀랐다 (전투 변수: 무리에서 하나만, 처음 한 번만 놀란다) */
const FLOCK_PANIC = 'a3-flockPanic';
/** 탐사대원의 휘파람: 썰매개 공격 피해 + */
export const CALL_DMG = 4;
/** 서리 망령: 상대의 동상이 이만큼이면 숨을 들이쉰다 / 「얼려 버리는 숨」의 동상 / 「얼음 껍질」 방어도 */
export const INHALE_AT = 3;
export const FREEZE_DMG = 10;
export const FREEZE_FROST = 3;
export const RIME_BLOCK = 10;
/** 그노프케: 「얼음을 가르는 돌진」 피해 */
export const GORE_DMG = 24;
/** 해부된 썰매개: 터진 실밥 (공격 피해 + / 자기 차례마다 잃는 체력) */
export const TORN_N = 3;

/** 렝의 거미가 아직 알주머니를 찢을 수 있는가 (거미마다 둘, 새끼는 한 번에 둘까지) */
const canBrood = (c: Combat, e: EnemyUnit) => (e.mem.brood ?? 0) < 2 && countDef(c, 'leng-spiderling') < 2;

/** 썰매개가 무리 지어 무는 횟수: 다른 썰매개 하나마다 한 번 더 (최대 3번) */
const packHits = (c: Combat, e: EnemyUnit) => 1 + Math.min(2, c.alive.filter((x) => x !== e && x.def === 'sled-dog').length);

/** 앞에 선 동료 중 가장 다친 것 */
const frontAlly = (c: Combat, e: EnemyUnit): EnemyUnit | undefined =>
  c.row(0)
    .filter((x) => x !== e)
    .sort((a, b) => hpPct(a) - hpPct(b))[0];

// ───────────── 특성 ─────────────

reg.traits([
  {
    id: 'a3-faceless',
    name: '얼굴 없음',
    desc: '의도를 읽을 수 없다 (통찰 3 이상이면 보인다). 공포에 질린 상대에게 주는 피해 +25%',
    hooks: {
      modDamageOut(c, s, d) {
        if (d.src === s.unit && d.attack && d.tgt === c.p && (c.p.st.dread ?? 0) > 0) d.mult *= 1.25;
      },
    },
  },
  {
    id: 'a3-brain-thief',
    name: '뇌 수집',
    desc: '빼앗은 통찰을 품고 있다. 쓰러뜨리면 되찾는다',
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || !e.mem.brain) return;
        const n = e.mem.brain;
        e.mem.brain = 0;
        c.gainInsight(n);
        c.emit({ t: 'text', uid: e.uid, text: `통찰 +${n} (되찾음)`, tone: 'good' });
      },
    },
  },
  {
    id: 'a3-angles',
    name: '각도 속에 숨음',
    desc: '후열에 있는 동안 받는 피해 40% 감소 (틴달로스의 사냥 중에는 숨지 못한다)',
    hooks: {
      modDamageIn(_c, s, d) {
        const e = s.unit;
        if (isEnemy(e) && e.row === 1 && !e.mem.hunt) d.mult *= 0.6;
      },
    },
  },
  {
    id: 'a3-angle-lord',
    name: '각도의 주인',
    desc: `「유리를 긋는다」로 화면에 날카로운 각을 연다 (최대 ${MAX_ANGLES}). 열린 각은 내 턴이 끝날 때마다 문다. 방어도 ${PLASTER} 이상으로 턴을 끝내면 하나가 메워진다. 붕괴시키면 모두 닫힌다. 세 각이 모두 열리면 다음 차례에 「${HUNT}」이 온다. 그때까지 사냥을 끊지 못하면 ${HUNT_FAIL}. 끊는 법: 왕에게 피해 ${HUNT_DMG}, 방어도 ${PLASTER} 이상으로 턴을 마쳐 각 하나를 메우기, 왕을 붕괴. 한 번 끝난 사냥은 ${HUNT_GAP}턴 뒤에야 다시 온다. 체력이 절반 아래로 떨어지면 남은 모서리를 한꺼번에 연다. 후열로 숨으면 각도가 비틀려 화면이 기운다`,
    hooks: {
      onCombatStart(c) {
        cine(c, 'whisper', { text: '당신의 화면은 모서리가 둥글다.\n그래서 아직 들어오지 못했다.' });
      },
      onUnitTurnStart(c) {
        syncTilt(c);
      },
      onUnitTurnEnd(c) {
        syncTilt(c);
      },
      onDamageTaken(c, s, d) {
        syncTilt(c);
        // 사냥을 부른 뒤 왕이 받은 피해를 센다 (적끼리 준 피해는 빼고)
        if (isEnemy(s.unit) && !isEnemy(d.src)) huntHit(c, s.unit, unguarded(d));
      },
      onDeath(c) {
        closeAngles(c, '열린 각이 모두 닫혔다');
        setUi(c, 'ui:tilt', 0);
      },
    },
  },
  {
    id: 'a3-split',
    name: '분열',
    desc: '처음 쓰러지면 원형질 조각 둘로 갈라진다',
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.split || isIllusion(e)) return;
        e.mem.split = 1;
        c.emit({ t: 'text', uid: e.uid, text: '테켈리-리! 몸이 갈라진다', tone: 'eldritch' });
        c.spawn('shoggoth-blob', e.row);
        c.spawn('shoggoth-blob', e.row);
      },
    },
  },
  {
    id: 'a3-protoplasm',
    name: '원형질 분리',
    desc: '체력이 75%·50%·25% 아래로 떨어질 때마다 원형질 조각 둘을 떼어 낸다. 떼어 낸 조각은 후열에 있어도 근접 공격이 닿는다',
    hooks: {
      onDamageTaken(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.hp <= 0 || isIllusion(e)) return;
        const pct = hpPct(e);
        const lvl = pct <= 0.25 ? 3 : pct <= 0.5 ? 2 : pct <= 0.75 ? 1 : 0;
        while ((e.mem.shed ?? 0) < lvl) {
          e.mem.shed = (e.mem.shed ?? 0) + 1;
          c.emit({ t: 'text', uid: e.uid, text: '원형질이 떨어져 나와 꿈틀거린다', tone: 'eldritch' });
          // 절반이 무너지면 화면 안쪽에서 원형질이 유리를 짚고, 마지막엔 유리에 그 울음을 적는다
          if (e.mem.shed === 2) cine(c, 'handprints', { n: 4 });
          if (e.mem.shed === 3) cine(c, 'scrawl', { text: '테켈리-리' });
          // 쇼고스가 다시 삼킬 조각 — 전열이 차서 후열로 밀려나도 근접 출신이 끊어 낼 수 있다
          for (let i = 0; i < 2; i++) {
            const b = c.spawn('shoggoth-blob', 0);
            if (b) b.mem.reachable = 1;
          }
        }
      },
    },
  },
  {
    id: 'a3-full-dissection',
    name: '완전 해부',
    desc: `절개선 ${MAX_INCISION}개가 다 그어진 채로 해부대를 펼치면 「${FULL}」를 건다: 다음 다음 차례에 즉사 (사경 없음, 결계가 한 번 막는다). 내 턴 2번 안에 이것에게 피해 ${FULL_DMG}, 방어도 ${FULL_BLOCK} 이상으로 턴 종료, 체력 회복, 붕괴 중 하나면 막는다. 출혈·독·화상 피해도 센다. 전투마다 ${FULL_MAX}번까지`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || !e.mem.full) return;
        if (d.broke) cancelFull(c, '해부학자가 무너져 완전 해부가 멈췄다');
        else if (!isEnemy(d.src)) fullHit(c, e, unguarded(d));
      },
      onUnitTurnStart(c, s) {
        // 피해 없이 무너졌을 때도 (버팀 깎기)
        const e = s.unit;
        if (isEnemy(e) && e.mem.full && e.broken === 2) cancelFull(c, '해부학자가 무너져 완전 해부가 멈췄다');
      },
      onDeath(c) {
        cancelFull(c, '해부학자가 쓰러졌다');
      },
    },
  },
  {
    id: 'a3-egg-link',
    name: '이어진 알',
    desc: `몸속에 심은 알은 어미와 이어져 있다. 알이 있는 동안 이것에게 피해 ${EGG_LINK_DMG}을 주면 알이 함께 죽는다 (출혈·독·화상 포함)`,
    hooks: {
      onDamageTaken(c, _s, d) {
        if (!isEnemy(d.src)) broodHurt(c, unguarded(d));
      },
    },
  },
  {
    id: 'a3-mimicry',
    name: '흉내',
    desc: '내 기술을 엿듣고 있다. 「흉내」는 이번 턴 내가 마지막으로 쓴 기술을 따라 한다. 피해를 준 기술이면 그 피해의 절반을 같은 속성으로 되돌려 준다. 방어도만 얻은 기술이면 그만큼 방어도를 얻는다',
    hooks: {
      onCombatStart(c) {
        startListening(c);
      },
    },
  },
  {
    id: 'a3-regrow',
    name: '끝없는 재생',
    desc: '자기 턴이 끝날 때 체력 5 회복. 그 턴에 화염 피해를 받았다면 재생하지 못한다',
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (isEnemy(e) && (d.type === 'fire' || d.tags.includes('burn')) && d.hpLoss + d.blocked > 0) e.mem.seared = c.s.turn;
      },
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead) return;
        if (e.mem.seared === c.s.turn) {
          c.emit({ t: 'text', uid: e.uid, text: '그을린 원형질이 재생하지 못한다', tone: 'info' });
          return;
        }
        c.heal(e, 5);
      },
    },
  },
  {
    id: 'a3-burrower',
    name: '땅굴 벌레',
    desc: '얼음 밑으로 파고들면 회피 2를 얻는다. 얼음 밑에서는 의도를 속인다. 땅울림은 읽을 수 없고 웅크린 척하다가 아가리를 벌리기도 한다 (통찰 3 이상이면 보인다). 솟구치기 전의 준비는 보인다',
    hooks: {},
  },
  // ── 얼어붙은 고대 도시의 새 특성 ──
  {
    id: 'a3-blind',
    name: '눈이 없다',
    desc: '소리를 쫓는다. 「소리를 쫓는 부리」는 이번 턴 내가 쓴 기술 하나마다 한 번씩 쫀다. 기술을 하나도 쓰지 않으면 찾지 못한다',
    hooks: {},
  },
  {
    id: 'a3-refreeze',
    name: '다시 어는 시신',
    desc: '처음 쓰러지면 얼어붙은 채 다시 일어선다 (체력 40%). 타격이나 화염(화상 포함)으로 쓰러뜨리면 산산조각 나 다시 일어서지 못한다',
    hooks: {
      onDeath(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.revived) return;
        // 화상(burn 태그가 붙은 고정 피해)도 화염으로 친다 — '끝없는 재생'·'검은 수액'도 그렇게 센다
        if (d && (d.type === 'blunt' || d.type === 'fire' || d.tags.includes('burn'))) {
          e.mem.revived = 1;
          c.emit({ t: 'text', uid: e.uid, text: '산산조각 났다', tone: 'good' });
          return;
        }
        e.mem.revived = 1;
        e.dead = false;
        e.hp = Math.ceil(e.maxHp * 0.4);
        c.emit({ t: 'spawn', uid: e.uid });
        c.emit({ t: 'text', uid: e.uid, text: '얼어붙은 채 다시 일어선다', tone: 'eldritch' });
        // 다시 일어선 몸은 조명탄 권총을 쏘지 못한다: 얼어붙은 몸으로 다음 행동을 다시 정한다
        if (c.s.phase === 'player' && e.broken !== 2) c.planIntent(e);
      },
    },
  },
  {
    id: 'a3-specimen',
    name: '표본 채집',
    desc: '「표본 채집」으로 내 기술 하나를 빼앗아 간다. 쓰러뜨리면 되찾는다',
    hooks: {
      onDeath(c, s) {
        if (isEnemy(s.unit)) returnSkill(c, s.unit);
      },
    },
  },
  {
    id: 'a3-cold-bringer',
    name: '눈보라를 끄는 털가죽',
    desc: '자기 차례가 끝날 때마다 동상 1을 건다',
    hooks: {
      onUnitTurnEnd(c, s) {
        frost(c, c.p, 1, s.unit);
      },
    },
  },
  {
    id: 'a3-dissected',
    name: '해부된 몸',
    desc: '갈라진 몸속이 훤히 보여 약점이 처음부터 모두 드러나 있다. 다른 썰매개가 쓰러지면 힘 +2',
    hooks: {
      onAnyDeath(c, s, victim) {
        if (!isEnemy(victim) || victim === s.unit || victim.def !== 'sled-dog' || !isEnemy(s.unit)) return;
        c.apply(s.unit, 'str', 2, s.unit);
        // 무리가 줄었다: 「무리 지어 몰아붙이기」의 횟수도 다시 센다
        refreshIntent(c, s.unit);
      },
    },
  },
  {
    id: 'a3-anatomist',
    name: '해부학자',
    desc: '출혈이 있는 상대에게 주는 공격 피해 +25%',
    hooks: {
      modDamageOut(c, s, d) {
        if (d.src === s.unit && d.attack && d.tgt === c.p && (c.p.st.bleed ?? 0) > 0) d.mult *= 1.25;
      },
    },
  },
  {
    id: 'a3-veil',
    name: '눈을 감아라',
    desc: '이것이 주는 정신 피해는 내 방어도가 먼저 막는다 (막은 만큼 방어도가 줄어든다)',
    hooks: {},
  },
  {
    id: 'a3-fear-eater',
    name: '공포를 먹는 것',
    desc: '이것의 정신 공격으로 잃은 정신력만큼 체력을 회복한다',
    hooks: {},
  },
  {
    id: 'a3-sight',
    name: '보는 것과 보지 않는 것',
    desc: `「봉우리 너머가 드러난다」를 붕괴로 끊지 못하면 그것을 보게 된다. 그 뒤 내 턴 ${REVEAL_TURNS}번 동안 형체가 드러나 받는 피해 +50%. 대신 그것을 공격하는 기술마다 정신 피해 ${LOOK_SAN}. 보지 않으려면 공격하지 않으면 된다`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        // 증기가 걷히던 중에 붕괴하면 다시 가려진다 (어두워진 화면도 돌아온다)
        if (isEnemy(e) && d.broke && !((e.st[REVEALED] ?? 0) > 0)) {
          if (c.s.vars['ui:dark']) c.emit({ t: 'text', uid: e.uid, text: '다시 증기에 가려진다', tone: 'good' });
          veilAgain(c, e);
        }
      },
      onDeath(c) {
        setUi(c, 'ui:eye', 0);
        setUi(c, 'ui:dark', 0);
      },
    },
  },
  {
    id: 'a3-old-master',
    name: '옛 주인',
    desc: '체력이 절반 아래로 떨어지거나 붕괴해 피리 소리가 끊기면 쇼고스 노예가 옛 반란을 기억해 낸다. 그 뒤로 노예는 주인을 공격한다',
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.hp <= 0 || (hpPct(e) > 0.5 && !d.broke)) return;
        incite(c, e);
      },
      onUnitTurnStart(c, s) {
        // 피해 없이 무너졌을 때도 (버팀 깎기)
        const e = s.unit;
        if (isEnemy(e) && e.broken === 2) incite(c, e);
      },
    },
  },
  {
    id: 'a3-rebellion',
    name: '반란의 기억',
    desc: '주인의 체력이 절반 아래로 떨어지거나 주인이 붕괴하면 반란을 일으켜 주인을 공격한다. 주인이 쓰러지면 어둠 속으로 흘러가 버린다',
    hooks: {
      onAnyDeath(c, s, victim) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || !isEnemy(victim) || victim.def !== 'awakened-elder') return;
        c.emit({ t: 'text', uid: e.uid, text: '주인을 잃은 원형질이 어둠 속으로 흘러간다', tone: 'eldritch' });
        c.flee(e);
      },
    },
  },
  {
    id: 'a3-stopped-clock',
    name: '멈춘 시간',
    desc: `한 턴에 받는 피해가 최대 ${CLOCK_CAP} (지속 피해 제외). 붕괴해 있는 동안에는 시간이 깨져 상한이 없다`,
    hooks: {
      modDamageIn(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.broken > 0) return;
        const taken = e.mem.clockTurn === c.s.turn ? (e.mem.clockTaken ?? 0) : 0;
        const left = Math.max(0, CLOCK_CAP - taken);
        d.cap = d.cap === undefined ? left : Math.min(d.cap, left);
      },
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || d.type === 'true') return;
        if (e.mem.clockTurn !== c.s.turn) {
          e.mem.clockTurn = c.s.turn;
          e.mem.clockTaken = 0;
        }
        e.mem.clockTaken = (e.mem.clockTaken ?? 0) + d.amount;
        if (e.broken === 0 && e.mem.clockTaken >= CLOCK_CAP && e.mem.clockSaid !== c.s.turn) {
          e.mem.clockSaid = c.s.turn;
          c.emit({ t: 'text', uid: e.uid, text: '멈춘 시간 속에서는 상처가 더 새겨지지 않는다', tone: 'info' });
        }
      },
    },
  },
  // ── 일반 적의 반응 (2026-10 패턴: 내 손에 맞거나 누가 쓰러지면 그 자리에서 의도를 바꿔 보인다) ──
  {
    id: 'a3-tower',
    name: '탑 위의 그림자',
    desc: `앞에 동료가 버티는 동안 후열에서 탑 끝에 매달려 높이를 쌓는다 (「급강하」 피해 +${PERCH_STEP}, 최대 +${PERCH_MAX}). 내 공격에 맞으면 높이를 잃는다. 약점(화염·관통)에 맞으면 움찔해 그 차례의 의도가 드러나고, 찢긴 날개로는 낚아채 오르지 못한다`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.hp <= 0 || !myHit(c, d)) return;
        // 맞으면 탑 끝에서 미끄러진다 (회피로 흘린 공격은 빼고)
        if ((e.st[HEIGHT] ?? 0) > 0 && d.amount > 0) {
          c.clear(e, HEIGHT);
          c.emit({ t: 'text', uid: e.uid, text: '탑 끝에서 미끄러졌다', tone: 'good' });
          refreshIntent(c, e);
        }
        if (!d.weakHit || !canReact(c, e) || e.mem.flinch === c.s.turn) return;
        e.mem.flinch = c.s.turn;
        if (e.intent?.move === 'lift') e.intent = intentFor(c, e, 'clutch');
        if (e.intent) e.intent = { ...e.intent, hidden: false };
        c.emit({ t: 'text', uid: e.uid, text: '얼굴 없는 몸이 움찔한다', tone: 'good' });
      },
    },
  },
  {
    id: 'a3-yuggoth-tools',
    name: '유고스의 연장',
    desc: `앞에 동료가 버티는 동안 얼음 밑 광맥에 발파 장치를 박는다 (다음 차례에 「광맥 발파」). 그 사이 붕괴시키거나 약점(타격·비전)으로 치면 장치가 꺼진다. 쓰러질 듯한 동료를 한 번 꿰매 체력 ${SUTURE_HEAL}을 되살린다`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.hp <= 0 || !e.mem.charge || !d.weakHit || !myHit(c, d)) return;
        delete e.mem.charge;
        e.intent = intentFor(c, e, 'fizzle');
        c.emit({ t: 'text', uid: e.uid, text: '발파 장치가 꺼졌다', tone: 'good' });
      },
    },
  },
  {
    id: 'a3-scent',
    name: '푸른 냄새',
    desc: '후열(각도 속)에서 내 공격에 맞으면 냄새를 쫓아 그 차례에 「모서리에서 덮치기」로 튀어나온다. 각도 속에서 붕괴하면 각도 밖(전열)으로 굴러떨어진다. 피를 흘리는 상대는 「물고 늘어지기」로 노린다',
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.hp <= 0 || e.row !== 1) return;
        if (d.broke) {
          if (c.moveRow(e, 0)) c.emit({ t: 'text', uid: e.uid, text: '각도 밖으로 굴러떨어졌다', tone: 'good' });
          return;
        }
        if (myHit(c, d) && d.amount > 0 && e.intent?.move !== 'pounce') react(c, e, 'pounce', '냄새를 맡았다', 'bad');
      },
    },
  },
  {
    id: 'a3-learner',
    name: '배우는 원형질',
    desc: `내가 지난 턴을 방어도 ${DISSOLVE_AT} 이상으로 마쳤으면 「녹여 삼키기」(방어도를 절반 녹이고 덮친다)를 노린다. 약점(화염·비전)에 맞은 턴에는 몸을 다시 빚지 못한다: 「재형성」·「흡수」가 비명으로 바뀐다`,
    hooks: {
      onCombatStart(c) {
        watchBlock(c);
      },
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || !d.weakHit || !myHit(c, d)) return;
        const m = e.intent?.move;
        if (m === 'reform' || m === 'absorb') react(c, e, 'tekeli', '그을린 원형질이 굳는다', 'good');
      },
    },
  },
  {
    id: 'a3-web-sense',
    name: '거미줄 진동',
    desc: `새끼 거미가 내 손에 쓰러지면 거미줄이 떨려 그 차례에 「분노한 독액」(독 ${VENOM_POISON})을 뱉는다. 처음으로 체력이 절반 아래로 떨어졌을 때 곁에 새끼가 없으면 알주머니를 찢는다 (새끼 거미 1마리). 독이 깊이 오른 상대(독 6 이상)에게는 독 대신 거미줄을 감는다`,
    hooks: {
      onAnyDeath(c, s, victim) {
        const e = s.unit;
        if (!isEnemy(e) || !isEnemy(victim) || victim.def !== 'leng-spiderling') return;
        react(c, e, 'venom', '거미줄이 떨린다', 'bad', 'rxv');
      },
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.sac || e.hp <= 0 || hpPct(e) > 0.5 || !myHit(c, d)) return;
        e.mem.sac = 1;
        if (canBrood(c, e) && countDef(c, 'leng-spiderling') === 0) react(c, e, 'brood', '알주머니를 찢는다', 'bad', 'rxb');
      },
    },
  },
  {
    id: 'a3-flock',
    name: '무리',
    desc: `둘 이상이면 얼음판에서 함께 발을 굴러 동상을 건다 (살아 있는 눈먼 펭귄 수만큼, 최대 ${STOMP_MAX}). 펭귄 하나가 처음 내 손에 쓰러지면 남은 펭귄 하나가 놀라 그 차례에는 쪼지 않고 울부짖는다 (「떼 울음」). 지난 내 턴에 기술을 4개 이상 썼으면 소리를 쫓아 더 자주 쫀다`,
    hooks: {
      onAnyDeath(c, s, victim) {
        const e = s.unit;
        if (!isEnemy(e) || !isEnemy(victim) || victim === e || victim.def !== 'blind-penguin') return;
        // 무리에서 하나만, 처음 한 번만 놀란다 (그 뒤로는 소리를 쫓아 다시 몰려온다)
        if (c.s.vars[FLOCK_PANIC]) return;
        if (react(c, e, 'cry', '놀라 울부짖는다', 'eldritch')) c.s.vars[FLOCK_PANIC] = 1;
      },
    },
  },
  {
    id: 'a3-whistle',
    name: '탐사대의 휘파람',
    desc: `썰매개가 곁에 있으면 휘파람으로 부른다: 썰매개 모두 다음 공격 피해 +${CALL_DMG}. 다시 일어선 몸은 조명탄을 쏘지 못하고 얼어붙은 손으로 붙잡는다 (동상)`,
    hooks: {},
  },
  {
    id: 'a3-rime',
    name: '서리 숨',
    desc: `상대의 동상이 ${INHALE_AT} 이상이면 숨을 크게 들이쉰다: 다음 차례에 「얼려 버리는 숨」(동상 ${FREEZE_FROST}). 숨을 들이쉬는 동안 붕괴시키면 끊긴다. 앞에 선 동료에게 얼음 껍질(방어도 ${RIME_BLOCK})을 입힌다`,
    hooks: {},
  },
  {
    id: 'a3-collector',
    name: '표본 운반',
    desc: '붕괴하면 쥐고 있던 표본을 떨어뜨린다 (빼앗긴 기술을 되찾는다). 표본을 쥔 채 체력이 3분의 1 아래로 떨어지면 다음 차례에 날아가 버린다. 그 기술은 전투가 끝나야 돌아온다. 표본을 잃으면 한 번 더 노린다',
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.hp <= 0 || !d.broke || !e.mem.specimen) return;
        c.emit({ t: 'text', uid: e.uid, text: '표본을 떨어뜨렸다', tone: 'good' });
        returnSkill(c, e);
      },
    },
  },
  {
    id: 'a3-snow-horn',
    name: '눈보라의 뿔',
    desc: '화염에 맞으면 불길을 덮으려 그 차례에 「눈보라 부르기」를 한다. 체력이 절반 아래로 떨어지거나 상대의 동상이 3 이상이면 뿔을 낮추고 돌진한다 (뿔을 낮춘 동안 붕괴시키면 끊긴다)',
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || d.type !== 'fire' || d.amount <= 0 || !myHit(c, d)) return;
        const m = e.intent?.move;
        if (m === 'blizzard' || m === 'lower') return;
        react(c, e, 'blizzard', '눈보라가 불길을 덮는다');
      },
    },
  },
  {
    id: 'a3-stitches',
    name: '터지는 실밥',
    desc: `체력이 처음 절반 아래로 떨어지면 꿰맨 배가 터져 미쳐 날뛴다: 공격 피해 +${TORN_N}, 대신 자기 차례가 끝날 때마다 체력 ${TORN_LOSS}를 잃는다. 다른 썰매개가 곁에 있으면 함께 몰아붙인다`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.hp <= 0 || e.mem.torn || hpPct(e) > 0.5 || d.tags.includes('torn')) return;
        e.mem.torn = 1;
        c.apply(e, TORN, TORN_N, e);
        c.emit({ t: 'text', uid: e.uid, text: '꿰맨 배가 터졌다', tone: 'bad' });
      },
    },
  },
]);

// ───────────── 행동 헬퍼 ─────────────

const corrode = (c: Combat, e: EnemyUnit, cap = 3) => {
  if ((c.p.st.corrode ?? 0) < cap) c.apply(c.p, 'corrode', 1, e);
};

/** 프나스의 돌의 분출: 얼음이 깨지듯 화면 유리에 금이 간다 */
const eruptHit = mv.attack('분출', 34, {
  melee: false,
  then: (_c, e) => {
    e.mem.under = 0;
  },
});
const eruption: MoveDef = {
  ...eruptHit,
  ultimate: true,
  run(c, e) {
    cine(c, 'crack', { n: 3, uid: e.uid });
    eruptHit.run(c, e);
  },
};

// ───────────── 일반 적 ─────────────

reg.enemies([
  {
    id: 'nightgaunt',
    name: '밤의 마귀',
    icon: 'gi:evil-bat',
    act: 3,
    tier: 'normal',
    hp: [46, 52],
    poise: 4,
    weak: ['fire', 'pierce'],
    resist: { blunt: 0.7 },
    row: 0,
    dread: 4,
    eldritch: true,
    tags: ['gaunt'],
    traits: ['a3-faceless', 'a3-tower'],
    desc: '얼굴이 없는 검은 날개. 얼어붙은 탑 꼭대기에 거꾸로 매달려 있다가 소리 없이 내려와 간지럼을 태우고 낚아채 어둠 속으로 날아간다.',
    moves: {
      tickle: hid(mv.horror('간지럼', 8, { then: (c, e) => void c.apply(c.p, 'dread', 2, e), desc: '정신 피해, 공포 2' })),
      clutch: hid(mv.attack('움켜쥐기', 10, { desc: '고무 같은 발톱으로 움켜쥔다' })),
      lift: hid(mv.attack('낚아채 오르기', 12, { then: (c, e) => void c.moveRow(e, 1), desc: '공격한 뒤 후열로 날아오른다' })),
      // 쌓은 높이만큼 세진다 (의도의 숫자에도 보인다)
      dive: hid({
        ...mv.attack('급강하', DIVE_DMG, {
          melee: false,
          then: (c, e) => {
            c.clear(e, HEIGHT);
            c.moveRow(e, 0);
          },
          desc: '높은 곳에서 덮친 뒤 전열로 내려앉는다. 쌓은 높이만큼 피해가 늘고, 높이는 사라진다',
        }),
        dmg: (_c: Combat, e: EnemyUnit) => DIVE_DMG + (e.st[HEIGHT] ?? 0),
      }),
      perch: hid(
        mv.buff(
          '탑 끝에 매달린다',
          (c, e) => {
            c.apply(e, 'evasive', 1, e);
            if (e.row === 1) c.apply(e, HEIGHT, Math.min(PERCH_STEP, PERCH_MAX - (e.st[HEIGHT] ?? 0)), e);
          },
          { desc: `회피 1, 높이 +${PERCH_STEP} (최대 ${PERCH_MAX}). 다음 「급강하」 피해가 그만큼 는다. 내 공격에 맞으면 높이를 잃는다` },
        ),
      ),
    },
    ai: (c, e) => {
      const h = e.st[HEIGHT] ?? 0;
      if (e.row === 1) {
        // 앞에 동료가 버티는 동안에는 탑 끝에 매달려 높이를 쌓는다 (높을수록 곧 덮친다)
        if (!covered(c, e) || h >= PERCH_MAX) return 'dive';
        return pick(c, e, { perch: h > 0 ? 1 : 2, dive: 3 });
      }
      // 공포에 질린 먹이는 움켜쥐고(피해 +25%), 다치면 날아올라 몸을 숨긴다
      const dread = (c.p.st.dread ?? 0) > 0;
      return pick(c, e, {
        clutch: dread ? 4 : 3,
        tickle: dread ? 1 : 2,
        lift: last(e) === 'dive' ? 0 : hpPct(e) < 0.5 ? 3 : 2,
      });
    },
    visual: { tint: 0x1b1b24, glow: 0x7a6cff, fx: ['float'] },
  },
  {
    id: 'migo',
    name: '유고스의 균류',
    icon: 'gi:mushroom-gills',
    act: 3,
    tier: 'normal',
    hp: [44, 50],
    poise: 4,
    weak: ['blunt', 'arcane'],
    row: 1,
    dread: 4,
    eldritch: true,
    tags: ['yuggoth'],
    traits: ['a3-brain-thief', 'a3-yuggoth-tools'],
    desc: '갑각과 균사로 된 날개 달린 것. 얼음 밑 광맥을 캐러 별 너머에서 왔다. 윙윙거리는 목소리로 말하고 뇌를 원통에 담아 가져간다.',
    moves: {
      extract: mv.horror('뇌 적출', 6, { then: (c, e) => void stealInsight(c, e, 1), desc: '정신 피해, 통찰 1 강탈 (통찰이 없으면 정신 피해 +4)' }),
      buzz: mv.horror('윙윙거리는 목소리', 9),
      mist: mv.attack('냉기 분사', 8, { melee: false, type: 'arcane', then: (c, e) => frost(c, c.p, 1, e), desc: '동상 1' }),
      pincer: mv.attack('외과 집게', 5, { hits: 2, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 2, e), desc: '출혈 2' }),
      // 광맥 발파: 박아 둔 장치는 붕괴시키거나 약점으로 쳐서 끈다 (특성 a3-yuggoth-tools)
      rig: {
        ...mv.charge('발파 장치를 박는다', BLAST_DMG),
        follow: '광맥 발파',
        desc: `얼음 밑 광맥에 발파 장치를 박는다. 다음 차례에 「광맥 발파」(피해 ${BLAST_DMG}, 동상 2). 그 사이 붕괴시키거나 약점(타격·비전)으로 치면 장치가 꺼진다`,
      },
      blast: release(mv.attack('광맥 발파', BLAST_DMG, { melee: false, type: 'blunt', then: (c, e) => frost(c, c.p, 2, e), desc: '발밑의 얼음이 터져 나간다. 동상 2' })),
      fizzle: mv.block('꺼진 장치를 다시 맞춘다', 6, { desc: '발파 장치가 꺼졌다. 방어도 6' }),
      suture: {
        name: '외과 봉합',
        intent: 'heal',
        desc: `쓰러질 듯한 동료 하나를 꿰매 체력 ${SUTURE_HEAL} 회복, 출혈 제거 (전투당 한 번)`,
        run(c, e) {
          e.mem.sutured = 1;
          const t = c.alive.filter((x) => x !== e && !x.minion).sort((a, b) => hpPct(a) - hpPct(b))[0] ?? e;
          c.heal(t, SUTURE_HEAL);
          c.clear(t, 'bleed');
          c.emit({ t: 'text', uid: t.uid, text: '갈라진 살이 꿰매졌다', tone: 'bad' });
        },
      },
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'blast';
      const patient = !e.mem.sutured && c.alive.some((x) => x !== e && !x.minion && hpPct(x) < 0.5);
      if (e.row === 0) return pick(c, e, { pincer: 3, extract: 2, mist: 1, suture: patient ? 3 : 0 });
      // 앞에 동료가 버티는 동안 광맥에 발파 장치를 박는다 (세 차례 안에 다시 박지 않는다)
      const rigged = e.hist.slice(-3).some((h) => h === 'rig' || h === 'blast' || h === 'fizzle');
      return pick(c, e, {
        mist: 3,
        extract: (e.mem.brain ?? 0) >= 2 ? 1 : 3,
        buzz: 2,
        rig: covered(c, e) && !rigged ? 1 : 0,
        suture: patient ? 4 : 0,
      });
    },
    visual: { tint: 0x9a6070, glow: 0xff7ad0, fx: ['float'] },
  },
  {
    id: 'tindalos',
    name: '각도의 사냥개',
    icon: 'gi:hound',
    act: 3,
    tier: 'normal',
    hp: [48, 54],
    poise: 5,
    weak: ['arcane', 'blunt'],
    row: 1,
    dread: 4,
    eldritch: true,
    tags: ['angle'],
    traits: ['a3-angles', 'a3-scent'],
    desc: '굽은 시간 속에 사는 굶주린 것. 이 도시의 오각형 탑들에는 120도보다 날카로운 모서리가 너무 많다.',
    moves: {
      lurk: mv.block('모서리에 웅크림', 8, { desc: '방어도 8. 다음 차례에 덮친다' }),
      pounce: {
        name: '모서리에서 덮치기',
        intent: 'attack',
        dmg: 11,
        melee: false,
        desc: '전열로 튀어나와 공격, 출혈 2',
        run(c, e) {
          c.moveRow(e, 0);
          c.enemyAttack(e, { type: 'slash' });
          if (!c.over && !e.dead) c.apply(c.p, 'bleed', 2, e);
        },
      },
      bite: mv.attack('푸른 이빨', 9, { then: (c, e) => corrode(c, e), desc: '부식 1 (최대 3)' }),
      maul: mv.attack('물고 늘어지기', 5, { hits: 2, type: 'slash', then: (c, e) => corrode(c, e), desc: '피 냄새를 따라 두 번 문다. 부식 1 (최대 3)' }),
      vanish: {
        name: '각도 속으로',
        intent: 'retreat',
        desc: '후열로 물러나며 방어도 6',
        run(c, e) {
          c.moveRow(e, 1);
          c.gainBlock(e, 6);
        },
      },
    },
    ai: (c, e) => {
      const l = last(e);
      if (e.row === 1) return l === 'lurk' || l === 'vanish' ? 'pounce' : 'lurk';
      // 치고 빠진다: 물고 나면 대개 각도 속으로 숨고 (다쳤으면 반드시), 가끔은 한 번 더 문다. 피 냄새를 맡으면 물고 늘어진다
      const strike = (c.p.st.bleed ?? 0) > 0 ? 'maul' : 'bite';
      if (l !== 'bite' && l !== 'maul') return strike;
      return hpPct(e) < 0.5 ? 'vanish' : pick(c, e, { vanish: 4, [strike]: 1 }, 1);
    },
    visual: { tint: 0x2a3550, glow: 0x40a0ff, fx: ['flicker'] },
  },
  {
    id: 'shoggoth-spawn',
    name: '쇼고스 유충',
    icon: 'gi:transparent-slime',
    act: 3,
    tier: 'normal',
    hp: [50, 56],
    poise: 4,
    weak: ['fire', 'arcane'],
    resist: { blunt: 0.6 },
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['shoggoth'],
    traits: ['a3-split', 'a3-learner'],
    desc: '아직 작은 원형질 덩어리. 눈과 입이 생겼다 사라진다. 쓰러뜨려도 갈라져 다시 기어 온다.',
    moves: {
      lash: mv.attack('위족 채찍', 4, { hits: 3 }),
      engulf: mv.attack('집어삼키기', 10, { then: (c, e) => void c.heal(e, 5), desc: '체력 5 회복' }),
      reform: {
        name: '재형성',
        intent: 'heal',
        desc: '재생 4, 방어도 6',
        run(c, e) {
          c.apply(e, 'regen', 4, e);
          c.gainBlock(e, 6);
        },
      },
      tekeli: mv.horror('테켈리-리!', 7),
      absorb: {
        name: '흡수',
        intent: 'heal',
        desc: '원형질 조각을 최대 2개 삼켜 조각마다 체력 10 회복, 힘 +1 (조각이 없으면 방어도 8)',
        run: (c, e) => absorbBlobs(c, e, 10, 2),
      },
      // 배운 것: 두껍게 막는 상대에게는 방어도부터 녹인다 (특성 a3-learner)
      dissolve: {
        name: '녹여 삼키기',
        intent: 'attack',
        dmg: 9,
        melee: true,
        desc: '내 방어도의 절반을 녹인 뒤 덮친다',
        run(c, e) {
          const melt = Math.floor(c.p.block / 2);
          if (melt > 0) {
            c.p.block -= melt;
            c.emit({ t: 'text', uid: 'p', text: `방어도가 녹아내린다 (-${melt})`, tone: 'bad' });
          }
          c.enemyAttack(e);
        },
      },
    },
    ai: (c, e) => {
      const blobs = c.alive.filter((x) => x.def === 'shoggoth-blob').length;
      // 지난 내 턴을 두껍게 막았으면 방어도를 녹이는 법을 쓴다
      const guarded = (c.s.vars[END_BLOCK] ?? 0) >= DISSOLVE_AT;
      return pick(c, e, {
        lash: guarded ? 1 : 3,
        engulf: 2,
        reform: hpPct(e) < 0.6 && last(e) !== 'reform' ? 2 : 0,
        tekeli: 1,
        absorb: blobs > 0 && last(e) !== 'absorb' ? 3 : 0,
        dissolve: guarded ? 4 : 0,
      });
    },
    visual: { tint: 0x1d2e24, glow: 0x70ff9a, fx: ['drip'] },
  },
  {
    id: 'leng-spider',
    name: '렝의 거미',
    icon: 'gi:long-legged-spider',
    act: 3,
    tier: 'normal',
    hp: [46, 52],
    poise: 4,
    weak: ['slash', 'blunt'],
    row: 1,
    dread: 4,
    eldritch: true,
    tags: ['leng'],
    traits: ['a3-web-sense'],
    desc: '렝 고원에서 얼음을 건너온 보랏빛 거미. 얼음 틈 사이에 실을 걸어 두고 걸린 것을 천천히 녹여 먹는다.',
    moves: {
      spit: mv.attack('독액 뱉기', 6, { melee: false, type: 'pierce', then: (c, e) => void c.apply(c.p, 'poison', 3, e), desc: '독 3' }),
      web: mv.debuff(
        '서릿실 거미줄',
        (c, e) => {
          c.apply(c.p, 'weak', 1, e);
          c.apply(c.p, 'frail', 1, e);
          frost(c, c.p, 1, e);
        },
        { desc: '약화 1, 허약 1, 동상 1' },
      ),
      // 새끼를 잃은 어미 (특성 a3-web-sense)
      venom: mv.attack('분노한 독액', 4, { melee: false, type: 'pierce', then: (c, e) => void c.apply(c.p, 'poison', VENOM_POISON, e), desc: `새끼를 잃은 어미가 독을 뿜는다. 독 ${VENOM_POISON}` }),
      brood: mv.summon(
        '알주머니',
        (c, e) => {
          if (isIllusion(e)) return;
          e.mem.brood = (e.mem.brood ?? 0) + 1;
          c.spawn('leng-spiderling', 0);
        },
        '새끼 거미 1마리',
      ),
      fang: mv.attack('독니', 9, { type: 'pierce', then: (c, e) => void c.apply(c.p, 'poison', 2, e), desc: '독 2' }),
    },
    ai: (c, e) => {
      // 독이 깊이 오른 먹이에게는 독을 더하지 않고 실을 감는다
      const soaked = (c.p.st.poison ?? 0) >= 6;
      if (e.row === 0) return pick(c, e, { fang: 3, spit: soaked ? 0 : 1, web: soaked ? 2 : 1 });
      return (
        opener(c, e, ['web']) ??
        pick(c, e, { spit: soaked ? 1 : 3, web: soaked ? 3 : 1, brood: canBrood(c, e) && last(e) !== 'brood' ? 2 : 0 })
      );
    },
    visual: { tint: 0x4a2a5a, glow: 0xc070ff },
  },
  {
    id: 'blind-penguin',
    name: '눈먼 펭귄',
    icon: 'gi:penguin',
    act: 3,
    tier: 'normal',
    hp: [34, 38],
    poise: 3,
    weak: ['slash', 'fire'],
    row: 0,
    dread: 2,
    tags: ['ice', 'beast'],
    traits: ['a3-blind', 'a3-flock'],
    desc: '사람 키만 한 흰 펭귄. 눈이 있어야 할 자리가 매끈하다. 소리 나는 쪽으로 일제히 고개를 돌리고 뒤뚱거리며 몰려온다.',
    moves: {
      peck: {
        name: '소리를 쫓는 부리',
        intent: 'attack',
        dmg: 3,
        // 횟수는 실행할 때 센다 — 의도를 정하는 시점(라운드 끝)의 c.s.used는 지난 턴 값이라 '×N'으로 보여 주면 틀린다
        melee: true,
        desc: '이번 턴 내가 쓴 기술 하나마다 한 번씩 쫀다. 표시된 피해는 한 번 쫄 때의 피해. 기술을 하나도 쓰지 않으면 찾지 못한다',
        run(c, e) {
          const n = c.s.used;
          if (n <= 0) {
            c.emit({ t: 'text', uid: e.uid, text: '소리를 놓쳤다', tone: 'info' });
            return;
          }
          c.enemyAttack(e, { hits: n, type: 'pierce' });
        },
      },
      huddle: mv.block('몸을 맞댄다', 0, {
        then(c) {
          for (const x of c.alive) if (x.def === 'blind-penguin') c.gainBlock(x, 6);
        },
        desc: '모든 눈먼 펭귄 방어도 6',
      }),
      cry: mv.horror('떼 울음', 6, { desc: '사람 목소리를 닮은 울음' }),
      // 무리가 함께 얼음판을 구른다 (특성 a3-flock)
      stomp: mv.debuff('얼음판 발 구르기', (c, e) => frost(c, c.p, Math.min(STOMP_MAX, countDef(c, 'blind-penguin')), e), {
        desc: `살아 있는 눈먼 펭귄 수만큼 동상 (최대 ${STOMP_MAX})`,
      }),
    },
    ai: (c, e) => {
      const flock = countDef(c, 'blind-penguin');
      // 지난 내 턴이 시끄러웠으면(기술 4개 이상) 소리를 쫓아 더 자주 쫀다
      const loud = c.s.used >= 4;
      // 발 구르기는 무리에서 한 번에 하나만
      const stomping = c.alive.some((x) => x !== e && x.def === 'blind-penguin' && x.intent?.move === 'stomp');
      return pick(c, e, {
        peck: loud ? 8 : 6,
        huddle: flock > 1 && last(e) !== 'huddle' ? 2 : 0,
        cry: 1,
        stomp: flock > 1 && !stomping && !e.hist.slice(-2).includes('stomp') ? 1 : 0,
      });
    },
    visual: { tint: 0xd8e4ea, glow: 0x9fd8ff },
  },
  {
    id: 'frozen-explorer',
    name: '동사한 탐사대원',
    icon: 'gi:frozen-body',
    act: 3,
    tier: 'normal',
    hp: [40, 46],
    poise: 4,
    weak: ['fire', 'blunt'],
    row: 0,
    dread: 3,
    tags: ['ice', 'undead', 'expedition'],
    traits: ['a3-refreeze', 'a3-whistle'],
    desc: '미스캐토닉 탐사대의 방한복을 입은 시신. 서리 앉은 눈썹 아래 눈동자가 하얗게 얼었다. 얼어붙은 손에 아직 도끼를 쥐고 있다.',
    moves: {
      axe: mv.attack('얼음도끼', 11, { type: 'slash' }),
      flare: mv.attack('조명탄 권총', 6, { melee: false, type: 'fire', then: (c, e) => void c.apply(c.p, 'burn', 2, e), desc: '화상 2 (불꽃이 동상을 녹인다)' }),
      journal: mv.horror('마지막 일지', 8, { desc: '얼어붙은 입술로 일지의 마지막 장을 읽는다' }),
      // 탐사대의 썰매개를 부른다 (특성 a3-whistle). 휘파람은 겹치지 않는다
      whistle: mv.attack('휘파람과 도끼질', 6, {
        type: 'slash',
        extra: ['buff'],
        then: (c, e) => {
          for (const d of c.alive) {
            const add = d.def === 'sled-dog' ? CALL_DMG - (d.st[CALLED] ?? 0) : 0;
            if (add > 0) c.apply(d, CALLED, add, e);
          }
        },
        desc: `휘파람을 불며 도끼를 휘두른다. 썰매개 모두 다음 공격 피해 +${CALL_DMG}`,
      }),
      // 다시 일어선 몸 (특성 a3-refreeze)
      grip: mv.attack('얼어붙은 손아귀', 9, { then: (c, e) => frost(c, c.p, 2, e), desc: '얼어붙은 손으로 붙잡는다. 동상 2' }),
    },
    ai: (c, e) => {
      // 다시 일어선 몸: 조명탄 권총은 얼어붙었다
      if (e.mem.revived) return pick(c, e, { grip: 3, axe: 1, journal: 1 });
      const dogs = countDef(c, 'sled-dog');
      // 다른 대원이 이미 휘파람을 불려 하면 겹쳐 불지 않는다
      const calling = c.alive.some((x) => x !== e && x.intent?.move === 'whistle');
      return (
        opener(c, e, ['axe']) ??
        pick(c, e, {
          axe: 3,
          flare: (c.p.st.burn ?? 0) > 0 ? 1 : 2,
          journal: 1,
          whistle: dogs > 0 && !calling && !e.hist.slice(-2).includes('whistle') ? 2 : 0,
        })
      );
    },
    visual: { tint: 0x8aa0b0, glow: 0xd0f0ff },
  },
  {
    id: 'frost-wraith',
    name: '서리 망령',
    icon: 'gi:floating-ghost',
    act: 3,
    tier: 'normal',
    hp: [36, 40],
    poise: 4,
    weak: ['fire', 'arcane'],
    row: 1,
    dread: 4,
    eldritch: true,
    tags: ['ice', 'spirit'],
    traits: ['incorporeal', 'a3-rime'],
    desc: '얼어 죽은 자의 마지막 숨이 서리가 되어 떠돈다. 지나간 자리마다 온기가 사라진다.',
    moves: {
      breath: mv.attack('서리 숨결', 7, { melee: false, type: 'arcane', then: (c, e) => frost(c, c.p, 2, e), desc: '동상 2' }),
      whisper: mv.horror('얼어붙은 속삭임', 8, { then: (c, e) => frost(c, c.p, 1, e), desc: '정신 피해, 동상 1' }),
      drain: {
        name: '온기 흡수',
        intent: 'heal',
        desc: '내 동상 1당 체력 4 회복 (최소 8)',
        run(c, e) {
          c.heal(e, Math.max(8, (c.p.st[FROST] ?? 0) * 4));
        },
      },
      // 꽁꽁 언 상대 앞에서 숨을 들이쉰다 (특성 a3-rime)
      inhale: {
        ...mv.charge('숨을 들이쉰다', FREEZE_DMG),
        follow: '얼려 버리는 숨',
        desc: `다음 차례에 「얼려 버리는 숨」(피해 ${FREEZE_DMG}, 동상 ${FREEZE_FROST}). 그 사이 붕괴시키면 끊긴다`,
      },
      freeze: release(
        mv.attack('얼려 버리는 숨', FREEZE_DMG, { melee: false, type: 'arcane', then: (c, e) => frost(c, c.p, FREEZE_FROST, e), desc: `동상 ${FREEZE_FROST}` }),
      ),
      rime: mv.buff(
        '얼음 껍질',
        (c, e) => {
          const t = frontAlly(c, e);
          if (!t) return;
          c.gainBlock(t, RIME_BLOCK);
          c.emit({ t: 'text', uid: t.uid, text: '서리가 껍질처럼 굳는다', tone: 'info' });
        },
        { desc: `앞에 선 동료 하나에게 방어도 ${RIME_BLOCK}`, extra: ['block'] },
      ),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'freeze';
      // 꽁꽁 언 상대 앞에서는 숨을 크게 들이쉬고, 앞에 선 동료에게는 얼음 껍질을 입힌다
      const chilled = (c.p.st[FROST] ?? 0) >= INHALE_AT;
      return pick(c, e, {
        breath: chilled ? 1 : 3,
        whisper: 2,
        drain: hpPct(e) < 0.6 && !e.hist.includes('drain') ? 3 : 0,
        inhale: chilled && !e.hist.slice(-3).includes('freeze') ? 4 : 0,
        rime: covered(c, e) && !e.hist.slice(-2).includes('rime') ? 1 : 0,
      });
    },
    visual: { tint: 0xc8e0f0, glow: 0x80d0ff, fx: ['float', 'flicker'] },
  },
  {
    id: 'elder-hunter',
    name: '고대인 사냥꾼',
    icon: 'gi:eyestalk',
    act: 3,
    tier: 'normal',
    hp: [42, 48],
    poise: 5,
    weak: ['pierce', 'fire'],
    row: 1,
    dread: 5,
    eldritch: true,
    tags: ['elder'],
    traits: ['flying', 'a3-specimen', 'a3-collector'],
    desc: '통 같은 몸통에 별 모양의 머리, 접었다 펴는 막날개. 얼음 위를 낮게 날며 표본을 모은다. 이번 표본은 당신이다.',
    moves: {
      collect: {
        name: '표본 채집',
        intent: 'debuff',
        extra: ['attack'],
        dmg: 6,
        melee: false,
        desc: '장착한 기술 하나를 빼앗아 간다 (장착한 기술이 둘 이상일 때). 쓰러뜨리면 되찾는다',
        run(c, e) {
          e.mem.collects = (e.mem.collects ?? 0) + 1;
          c.enemyAttack(e, { type: 'pierce' });
          if (!c.over && !e.dead) seizeSkill(c, e);
        },
      },
      tentacles: mv.attack('다섯 갈래 촉수', 4, { hits: 2, melee: false, type: 'slash' }),
      dive: mv.attack('막날개 급습', 12, { melee: false, type: 'pierce' }),
      // 표본을 쥔 채 크게 다치면 (특성 a3-collector)
      escape: {
        name: '표본을 품고 날아오른다',
        intent: 'flee',
        desc: '빼앗은 기술을 품은 채 이번 차례에 날아가 버린다. 그 기술은 이 전투가 끝나야 돌아온다. 그 전에 쓰러뜨리거나 붕괴시키면 막는다',
        run(c, e) {
          if (!e.mem.specimen) {
            c.emit({ t: 'text', uid: e.uid, text: '품을 표본이 없다', tone: 'info' });
            return;
          }
          c.emit({ t: 'text', uid: e.uid, text: '표본을 품고 얼음 너머로 날아갔다', tone: 'bad' });
          c.flee(e);
        },
      },
    },
    ai: (c, e) => {
      if (!e.mem.tried) {
        e.mem.tried = 1;
        return 'collect';
      }
      // 표본을 쥔 채 크게 다치면 날아가 버린다 (한 차례 앞서 보인다)
      if (e.mem.specimen && hpPct(e) < 1 / 3) return 'escape';
      // 붕괴해 표본을 떨어뜨렸으면 한 번 더 노린다
      const regrab = !e.mem.specimen && (e.mem.collects ?? 1) < 2 && hpPct(e) >= 0.4 && last(e) !== 'collect';
      return pick(c, e, { dive: 3, tentacles: 2, collect: regrab ? 2 : 0 });
    },
    visual: { tint: 0x5a6a50, glow: 0xb0ffd0, fx: ['float'] },
  },
  {
    id: 'gnoph-keh',
    name: '그노프케',
    icon: 'gi:mammoth',
    act: 3,
    tier: 'normal',
    hp: [58, 64],
    poise: 5,
    weak: ['fire', 'pierce'],
    resist: { blunt: 0.75 },
    row: 0,
    dread: 4,
    eldritch: true,
    tags: ['ice', 'beast'],
    traits: ['a3-cold-bringer', 'a3-snow-horn'],
    desc: '긴 털에 덮인 여섯 다리의 짐승. 이마에 돋은 뿔 하나로 얼음을 가른다. 지나간 자리에는 눈보라가 뒤따른다.',
    moves: {
      horn: mv.attack('뿔 들이받기', 13, { type: 'pierce' }),
      claws: mv.attack('여섯 다리 할퀴기', 4, { hits: 3, type: 'slash' }),
      blizzard: mv.debuff(
        '눈보라 부르기',
        (c, e) => {
          frost(c, c.p, 2, e);
          c.apply(e, 'evasive', 1, e);
        },
        { desc: '동상 2, 자신 회피 1', extra: ['buff'] },
      ),
      // 다치거나 상대가 꽁꽁 얼어 가면 (특성 a3-snow-horn)
      lower: {
        ...mv.charge('뿔을 낮춘다', GORE_DMG),
        follow: '얼음을 가르는 돌진',
        desc: `다음 차례에 「얼음을 가르는 돌진」(피해 ${GORE_DMG}). 그 사이 붕괴시키면 끊긴다`,
      },
      gore: release(mv.attack('얼음을 가르는 돌진', GORE_DMG, { type: 'pierce', desc: '얼음을 가르며 뿔로 들이받는다' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'gore';
      // 다치거나 상대가 꽁꽁 얼어 가면 뿔을 낮추고 돌진한다 (세 차례 안에 다시 낮추지 않는다)
      const fierce = hpPct(e) < 0.5 || (c.p.st[FROST] ?? 0) >= 3;
      const recent = e.hist.slice(-3).some((h) => h === 'lower' || h === 'gore');
      return (
        opener(c, e, ['claws']) ??
        pick(c, e, {
          horn: 3,
          claws: 2,
          blizzard: e.hist.slice(-2).includes('blizzard') ? 0 : 2,
          lower: fierce && !recent ? 4 : 0,
        })
      );
    },
    visual: { tint: 0xd0d0c8, glow: 0x9ad8ff, scale: 1.2 },
  },
  {
    id: 'sled-dog',
    name: '해부된 썰매개',
    icon: 'gi:wolf-howl',
    act: 3,
    tier: 'normal',
    hp: [32, 36],
    poise: 3,
    weak: ['fire', 'slash', 'pierce'],
    row: 0,
    dread: 3,
    tags: ['beast', 'expedition'],
    traits: ['a3-dissected', 'a3-stitches'],
    desc: '탐사대의 썰매개. 배가 정교하게 갈렸다가 다시 꿰매어졌다. 사람의 솜씨가 아니다.',
    moves: {
      bite: mv.attack('물어뜯기', 9),
      nape: mv.attack('목덜미 물기', 4, { hits: 2, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 2, e), desc: '출혈 2' }),
      howl: mv.horror('꿰맨 목의 울부짖음', 5),
      // 무리 사냥 (특성 a3-stitches): 횟수는 쓰는 순간의 무리 수 — 다른 개가 쓰러지면 의도도 다시 센다
      harry: {
        name: '무리 지어 몰아붙이기',
        intent: 'attack',
        dmg: 5,
        hits: (c, e) => packHits(c, e),
        melee: true,
        desc: '다른 썰매개 하나마다 한 번 더 문다 (최대 3번)',
        run(c, e) {
          c.enemyAttack(e, { type: 'slash', hits: packHits(c, e) });
        },
      },
    },
    ai: (c, e) => {
      const pack = packHits(c, e) - 1;
      // 실밥이 터진 개는 울부짖지 않고 물어뜯는다. 무리가 있으면 함께 몰아붙인다
      return pick(c, e, { bite: 3, nape: 2, howl: e.mem.torn ? 0 : 1, harry: pack > 0 ? 2 : 0 });
    },
    onSpawn: (_c, e) => {
      e.known = [...e.weak];
    },
    visual: { tint: 0x6a5a50, glow: 0xff9080 },
  },

  // ───────────── 하수인 ─────────────
  {
    id: 'shoggoth-blob',
    name: '원형질 조각',
    icon: 'gi:acid-blob',
    act: 3,
    tier: 'minion',
    hp: [11, 13],
    poise: 0,
    weak: ['fire', 'slash', 'arcane'],
    row: 0,
    eldritch: true,
    tags: ['shoggoth'],
    moves: {
      slap: mv.attack('철썩', 5),
      cling: mv.attack('들러붙기', 3, { then: (c, e) => void c.apply(c.p, 'frail', 1, e), desc: '허약 1' }),
    },
    ai: (_c, e) => cycle(e, ['slap', 'cling']),
    visual: { tint: 0x1a3022, glow: 0x60ff90, scale: 0.6, fx: ['drip'] },
  },
  {
    id: 'leng-spiderling',
    name: '새끼 거미',
    icon: 'gi:spider-face',
    act: 3,
    tier: 'minion',
    hp: [8, 10],
    poise: 0,
    weak: ['fire', 'slash', 'blunt'],
    row: 0,
    eldritch: true,
    tags: ['leng'],
    moves: { nip: mv.attack('물기', 3, { type: 'pierce', then: (c, e) => void c.apply(c.p, 'poison', 1, e), desc: '독 1' }) },
    ai: () => 'nip',
    visual: { tint: 0x3a2048, glow: 0xb060f0, scale: 0.5 },
  },
  {
    id: 'shoggoth-thrall',
    name: '쇼고스 노예',
    icon: 'gi:goo-skull',
    act: 3,
    tier: 'minion',
    hp: [66, 70],
    poise: 0,
    weak: ['fire', 'arcane'],
    resist: { blunt: 0.6 },
    row: 0,
    eldritch: true,
    tags: ['shoggoth'],
    traits: ['a3-rebellion'],
    desc: '원로가 피리 소리로 부리는 원형질의 노예. 몸 곳곳에 열린 눈들이 주인을 지켜본다. 아주 오래전에도 그랬다.',
    moves: {
      slam: mv.attack('위족 내려치기', 11),
      engulf: mv.attack('집어삼키기', 8, { then: (c, e) => void c.heal(e, 8), desc: '체력 8 회복' }),
      mimic: mv.horror('테켈리-리', 7, { desc: '주인의 피리 소리를 흉내 낸다' }),
      revolt: {
        name: '주인을 덮친다',
        intent: 'special',
        desc: '옛 주인(깨어난 원로)에게 덤벼들어 피해를 입힌다',
        run(c, e) {
          const m = c.alive.find((x) => x.def === 'awakened-elder');
          if (!m) return;
          c.emit({ t: 'text', uid: e.uid, text: '테켈리-리! 주인을 덮친다', tone: 'eldritch' });
          c.damage({ src: e, tgt: m, base: 18, type: 'void', attack: true, melee: true, move: 'revolt' });
        },
      },
    },
    ai: (c, e) => {
      if (e.mem.rebel && c.alive.some((x) => x.def === 'awakened-elder')) return 'revolt';
      return cycle(e, ['slam', 'engulf', 'slam', 'mimic']);
    },
    visual: { tint: 0x14281c, glow: 0x60ff9a, scale: 1.1, fx: ['drip'] },
  },
  {
    id: 'frozen-crewman',
    name: '얼어붙은 대원',
    icon: 'gi:frozen-body',
    act: 3,
    tier: 'minion',
    hp: [14, 16],
    poise: 0,
    weak: ['fire', 'blunt', 'pierce'],
    row: 0,
    tags: ['ice', 'expedition'],
    moves: {
      pickaxe: mv.attack('곡괭이', 5),
      cling: mv.attack('얼어붙은 손', 3, { then: (c, e) => frost(c, c.p, 1, e), desc: '동상 1' }),
    },
    ai: (_c, e) => cycle(e, ['pickaxe', 'cling']),
    visual: { tint: 0x8aa0b0, glow: 0xd0f0ff, scale: 0.7 },
  },

  // ───────────── 정예 ─────────────
  {
    id: 'leng-broodmother',
    name: '렝의 대거미',
    icon: 'gi:hanging-spider',
    act: 3,
    tier: 'elite',
    hp: [186, 194],
    poise: 8,
    weak: ['fire', 'slash'],
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['leng'],
    traits: ['a3-egg-link'],
    desc: '렝의 골짜기를 메운 거미들의 어미. 얼어 죽은 탐사대원들을 고치로 감아 탑 안에 매달아 두었다.',
    moves: {
      fangs: mv.attack('독니', 12, { type: 'pierce', then: (c, e) => void c.apply(c.p, 'poison', 4, e), desc: '독 4' }),
      spray: mv.attack('거미줄 분사', 5, { hits: 2, melee: false, then: (c, e) => void c.apply(c.p, 'frail', 2, e), desc: '허약 2' }),
      cocoon: mv.debuff(
        '고치 감기',
        (c, e) => {
          c.apply(c.p, 'silence', 1, e);
          c.apply(c.p, 'weak', 1, e);
        },
        { desc: '침묵 1 (다음 턴 기본기만 쓸 수 있다), 약화 1' },
      ),
      brood: mv.summon(
        '알주머니 터뜨리기',
        (c, e) => {
          e.mem.brood = (e.mem.brood ?? 0) + 2;
          c.spawn('leng-spiderling', 0);
          c.spawn('leng-spiderling', 0);
        },
        '새끼 거미 2마리',
      ),
      implant: mv.attack('알 심기', 8, {
        type: 'pierce',
        extra: ['debuff'],
        then: (c, e) => implantEggs(c, e),
        desc: `산란관을 꽂아 알을 심는다. 내 턴이 ${EGG_TURNS}번 끝나면 부화해 새끼 거미 ${HATCH_N}마리가 살을 찢고 나온다. 그 사이 대거미에게 피해 ${EGG_LINK_DMG}을 주거나 회복하거나 불로 지지면 알이 죽는다. 이미 알이 있으면 대신 독 ${EGG_POISON}`,
      }),
      crouch: mv.charge('도약 준비', 32),
      leap: release(mv.attack('짓누르는 도약', 32, { ultimate: true, cine: 'impact' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'leap';
      const m = cycle(e, ['spray', 'implant', 'cocoon', 'fangs', 'brood', 'crouch']);
      if (m === 'brood' && (countDef(c, 'leng-spiderling') >= 3 || (e.mem.brood ?? 0) >= 6)) return 'fangs';
      if (m === 'implant' && (c.p.st[EGGS] ?? 0) > 0) return 'fangs';
      return m;
    },
    visual: { tint: 0x40204a, glow: 0xd060ff, scale: 1.35 },
  },
  {
    id: 'shantak',
    name: '샨탁',
    icon: 'gi:vulture',
    act: 3,
    tier: 'elite',
    hp: [188, 196],
    poise: 8,
    weak: ['pierce', 'void'],
    resist: { slash: 0.75 },
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['flyer'],
    desc: '말처럼 생긴 머리에 비늘 덮인 날개. 산맥 너머 고원으로 가는 길을 지킨다. 밤의 마귀를 몹시 두려워한다.',
    moves: {
      peck: mv.attack('말 머리 부리', 15, { type: 'pierce' }),
      buffet: mv.attack('날개 폭풍', 6, { hits: 3, melee: false, then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '약화 1' }),
      snatch: {
        name: '낚아채기',
        intent: 'attack',
        dmg: 13,
        melee: true,
        desc: '방어도를 무시한다',
        run(c, e) {
          c.damage({ src: e, tgt: c.p, base: e.intent?.dmg ?? 13, type: 'slash', attack: true, melee: true, move: 'snatch', ignoreBlock: true });
        },
      },
      screech: mv.horror('비늘 긁는 울음', 10, { then: (c, e) => void c.apply(c.p, 'dread', 2, e), desc: '정신 피해, 공포 2' }),
      soar: {
        ...mv.charge('높이 날아오른다', 34, {
          then: (c, e) => {
            c.apply(e, 'evasive', 1, e);
            c.gainBlock(e, 10);
          },
        }),
        desc: '회피 1, 방어도 10. 다음 턴 급강하',
      },
      dive: release(mv.attack('급강하', 34, { melee: false, ultimate: true, cine: 'impact' })),
      carry: mv.attack('하늘로 채어 간다', 10, {
        type: 'slash',
        extra: ['debuff'],
        cine: 'flip',
        then: (c, e) => liftUp(c, e),
        desc: `움켜쥐고 하늘 높이 날아오른다. 다음 턴 샨탁을 공격으로 ${ESCAPE_HITS}번 맞히면 빠져나온다. 빠져나오지 못하면 턴이 끝날 때 떨어진다 (피해 ${FALL_DMG}, 다음 턴 행동력 -1)`,
      }),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'dive';
      const m = cycle(e, ['peck', 'carry', 'buffet', 'screech', 'snatch', 'soar']);
      return m === 'carry' && (c.p.st[ALOFT] ?? 0) > 0 ? 'peck' : m;
    },
    visual: { tint: 0x3a4038, glow: 0x90ffb0, scale: 1.35, fx: ['float'] },
  },
  {
    id: 'elder-vivisector',
    name: '고대인 해부학자',
    icon: 'gi:scalpel',
    act: 3,
    tier: 'elite',
    hp: [186, 194],
    poise: 8,
    weak: ['pierce', 'void'],
    resist: { arcane: 0.75 },
    row: 0,
    dread: 6,
    eldritch: true,
    tags: ['elder'],
    traits: ['a3-anatomist', 'a3-full-dissection'],
    desc: '얼음 속에서 먼저 깨어난 고대인. 깨어나자마자 탐사대의 천막에서 사람과 개를 갈라 보았다. 다섯 갈래 촉수 끝마다 메스가 들려 있다.',
    moves: {
      scalpels: mv.attack('다섯 개의 메스', 5, { hits: 3, melee: false, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 3, e), desc: '출혈 3' }),
      extract: {
        name: '적출',
        intent: 'debuff',
        extra: ['buff'],
        desc: '내 이로운 효과(힘·보호막·재생·회피 등)를 모두 떼어 가 제 것으로 삼는다. 떼어 갈 것이 없으면 취약 2',
        run(c, e) {
          if (!stealBuffs(c, e)) c.apply(c.p, 'vuln', 2, e);
        },
      },
      gas: mv.debuff(
        '마취 가스',
        (c, e) => {
          c.apply(c.p, 'weak', 2, e);
          c.apply(c.p, 'frail', 2, e);
        },
        { desc: '약화 2, 허약 2' },
      ),
      suture: { ...mv.heal('스스로 꿰매기', 22), desc: '체력 22 회복' },
      incise: mv.attack('절개선 긋기', 6, {
        melee: false,
        type: 'slash',
        extra: ['debuff'],
        then: (c, e) => incise(c, e),
        desc: `절개선 ${INCISE_N}개를 긋는다. 「생체 해부」의 피해가 절개선마다 +${CUT_DMG}. ${MAX_INCISION}개가 다 그어진 채로 해부대를 펼치면 「${FULL}」가 온다. 체력을 회복하면 아문다`,
      }),
      // 피해 = 기본 + 절개선마다 CUT_DMG (의도에 그대로 보인다)
      table: { ...mv.charge('해부대를 펼친다', 0), dmg: (c: Combat) => vivisectDmg(c), desc: `다음 턴 생체 해부. 그어 둔 절개선마다 피해 +${CUT_DMG}` },
      vivisect: release({
        ...mv.attack('생체 해부', 0, {
          ultimate: true,
          cine: 'impact',
          then: (c, e) => {
            c.apply(c.p, 'bleed', 4, e);
            closeIncisions(c, '절개선이 모두 벌어졌다');
          },
          desc: `출혈 4. 절개선마다 피해 +${CUT_DMG} (그은 절개선은 모두 벌어져 사라진다)`,
        }),
        dmg: (c: Combat) => vivisectDmg(c),
      }),
      // 즉사 퍼즐 「완전 해부」: 해부대에 눕힌다(준비) → 완전 해부(실행). 걸린 순간부터 내 턴 2번
      opentable: {
        name: '해부대에 눕힌다',
        intent: 'death',
        desc: `절개선이 다 그어졌다. 다음 차례에 「${FULL}」 (즉사, 결계가 한 번 막는다). 내 턴 2번 안에 해부학자에게 피해 ${FULL_DMG}, 방어도 ${FULL_BLOCK} 이상으로 턴 종료, 체력 회복, 붕괴 중 하나면 막는다. 출혈·독·화상 피해도 센다`,
        run: (c, e) => layOnTable(c, e),
      },
      fullcut: {
        name: FULL,
        intent: 'death',
        ultimate: true,
        desc: `이 차례에 「${FULL}」. 막지 못하면 사경 없이 죽는다 (결계가 한 번 막는다). 해부학자에게 피해 ${FULL_DMG}, 방어도 ${FULL_BLOCK} 이상으로 턴 종료, 체력 회복, 붕괴 중 하나면 막는다. 출혈·독·화상 피해도 센다`,
        run: (c, e) => resolveFull(c, e),
      },
      withdraw: {
        name: '메스를 거둔다',
        intent: 'unknown',
        desc: '완전 해부가 막혀 이번 차례에는 아무것도 하지 않는다',
        run: (c, e) => void c.emit({ t: 'text', uid: e.uid, text: '메스를 거둔다', tone: 'info' }),
      },
    },
    ai: (c, e) => {
      // 완전 해부: 걸린 뒤엔 막히거나 닿을 때까지
      if (e.mem.full) return (e.mem.fullStage ?? 1) >= 2 ? 'fullcut' : 'opentable';
      if (e.mem.charge) return 'vivisect';
      const o = opener(c, e, ['gas']);
      if (o) return o;
      if (hpPct(e) < 0.5 && !e.mem.sutured) {
        e.mem.sutured = 1;
        return 'suture';
      }
      // 완전 해부가 남아 있는 동안에는 절개선을 두 번 긋는다 (다 쓰면 한 번)
      const m = cycle(e, (e.mem.fulls ?? 0) < FULL_MAX ? ['scalpels', 'incise', 'extract', 'incise', 'table'] : ['scalpels', 'incise', 'extract', 'scalpels', 'table']);
      if (m === 'table' && fullReady(c, e)) {
        declareFull(c, e);
        return 'opentable';
      }
      return m;
    },
    visual: { tint: 0x4a5a48, glow: 0xc0ffb0, scale: 1.35, fx: ['float'] },
  },

  // ───────────── 층 수호자 ─────────────
  {
    id: 'shoggoth',
    name: '쇼고스',
    icon: 'gi:gooey-eyed-sun',
    act: 3,
    tier: 'boss',
    hp: [340, 340],
    poise: 12,
    weak: ['fire', 'arcane'],
    resist: { blunt: 0.6 },
    row: 0,
    dread: 7,
    eldritch: true,
    tags: ['shoggoth'],
    traits: ['a3-protoplasm', 'a3-regrow', 'a3-mimicry'],
    desc: '고대인들이 부리던 원형질의 노예. 주인들의 피리 소리를 흉내 낸다. 무엇이든 될 수 있고 무엇이든 삼킨다. 아주 오래전, 주인들에게 반란을 일으켰다.',
    moves: {
      pseudopods: mv.attack('위족 난타', 5, { hits: 4 }),
      crush: mv.attack('짓누르기', 17, { then: (c, e) => void c.apply(c.p, 'frail', 2, e), desc: '허약 2' }),
      eyes: mv.horror('무수한 눈', 11, { desc: '몸 곳곳에서 눈이 열렸다 닫힌다' }),
      mimic: mv.horror('테켈리-리!', 7, {
        then: (c, e) => {
          c.apply(c.p, 'weak', 2, e);
          c.apply(c.p, 'dread', 2, e);
        },
        desc: '옛 주인의 피리 소리를 흉내 낸다. 약화 2, 공포 2',
      }),
      absorb: {
        name: '흡수',
        intent: 'heal',
        desc: '원형질 조각을 모두 삼켜 조각마다 체력 12 회복, 힘 +1 (조각이 없으면 방어도 8)',
        run: (c, e) => absorbBlobs(c, e, 12, 6),
      },
      copy: {
        name: '흉내',
        intent: 'special',
        desc: `이번 턴 내가 마지막으로 쓴 기술을 흉내 낸다. 피해를 준 기술이면 그 피해의 절반을 같은 속성으로 되돌려 준다 (방어도가 먼저 막는다). 방어도만 얻은 기술이면 그만큼 방어도를 얻는다. 둘 다 아니거나 기술을 쓰지 않았다면 테켈리-리: 정신 피해 ${MIMIC_SCREAM}`,
        run: (c, e) => throwBack(c, e),
      },
      surge: mv.charge('원형질이 부풀어 오른다', 36),
      tide: release(mv.attack('원형질 해일', 36, { ultimate: true, cine: 'ink' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'tide';
      const blobs = countDef(c, 'shoggoth-blob');
      if (blobs >= 2 && last(e) !== 'absorb') return 'absorb';
      return cycle(e, ['copy', 'pseudopods', 'eyes', 'crush', 'copy', 'mimic', 'surge']);
    },
    visual: { tint: 0x10261a, glow: 0x50ff90, scale: 1.55, fx: ['drip'] },
  },
  {
    id: 'angle-king',
    name: '각도의 왕',
    icon: 'gi:moebius-triangle',
    act: 3,
    tier: 'boss',
    hp: [370, 370],
    poise: 12,
    weak: ['arcane', 'blunt'],
    row: 0,
    dread: 7,
    eldritch: true,
    tags: ['angle'],
    traits: ['a3-angles', 'a3-angle-lord'],
    desc: '모든 각도의 주인. 시간이 굽어지기 전부터 굶주려 왔고 오각형 탑의 모서리마다 새끼를 풀어 둔다. 둥근 것은 지나지 못한다. 날카로운 각이 있어야 들어온다.',
    moves: {
      fang: mv.attack('시간의 송곳니', 16, { type: 'slash', then: (c, e) => corrode(c, e, 2), desc: '부식 1 (최대 2)' }),
      whelp: {
        ...mv.summon(
          '모서리의 새끼들',
          (c, e) => {
            e.mem.whelps = (e.mem.whelps ?? 0) + 2;
            c.spawn('angle-whelp', 0);
            c.spawn('angle-whelp', 0);
          },
          '모서리의 새끼 2마리 소환',
        ),
        cine: 'corners',
      },
      twist: {
        name: '각도 비틀기',
        intent: 'special',
        desc: '적의 전열과 후열을 뒤바꾼다. 방어도 12, 상대에게 약화 1',
        run(c, e) {
          swapRows(c);
          syncTilt(c);
          c.gainBlock(e, 12);
          c.apply(c.p, 'weak', 1, e);
        },
      },
      carve: {
        name: '유리를 긋는다',
        intent: 'debuff',
        desc: `화면에 날카로운 각 하나를 연다 (최대 ${MAX_ANGLES}). 열린 각은 내 턴이 끝날 때마다 문다. 방어도 ${PLASTER} 이상으로 턴을 끝내면 하나를 메운다. 세 각이 모두 열리면 「${HUNT}」이 온다`,
        run: (c, e) => void openAngle(c, e),
      },
      flood: {
        name: '모든 모서리가 열린다',
        intent: 'debuff',
        cine: { name: 'crack', n: 3 },
        desc: `남은 모서리를 한꺼번에 연다. 세 각이 모두 열리면 다음 차례에 「${HUNT}」이 온다`,
        run: (c, e) => void openAllAngles(c, e),
      },
      // 막아야 하는 큰 위협: 세 각이 모두 열린 채로 이 차례가 오면 사냥개들이 들어온다
      hunt: {
        name: HUNT,
        intent: 'charge',
        ultimate: true,
        cine: 'corners',
        desc: `모든 모서리가 열렸다. 이 차례까지 사냥을 끊지 못하면 ${HUNT_FAIL}. 그 뒤 모서리는 모두 닫힌다. 끊는 법: 각도의 왕에게 피해 ${HUNT_DMG} / 방어도 ${PLASTER} 이상으로 턴을 마쳐 각 하나를 메운다 / 왕을 붕괴시킨다`,
        run: (c, e) => resolveHunt(c, e),
      },
      lost: {
        name: '길을 잃은 사냥',
        intent: 'unknown',
        desc: '메워진 모서리 앞에서 사냥개들이 길을 잃었다. 이번 차례에는 아무것도 하지 않는다',
        run: (c, e) => void c.emit({ t: 'text', uid: e.uid, text: '사냥개들이 둥근 모서리 앞을 맴돈다', tone: 'info' }),
      },
      gnaw: mv.attack('시간 갉아먹기', 8, { melee: false, type: 'void', then: (c, e) => void c.apply(c.p, 'a3-timeworn', 1, e), desc: '다음 턴 행동력 -1' }),
      howl: mv.horror('시간 너머의 울부짖음', 11),
      corners: mv.charge('무한한 모서리', 12, { hits: 3 }),
      rend: release(mv.attack('모든 각도에서', 12, { hits: 3, melee: false, type: 'slash', ultimate: true, cine: 'shatter' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'rend';
      // 틴달로스의 사냥: 세 각이 모두 열리면 부른다 (부른 뒤엔 풀리거나 닿을 때까지 그대로)
      if (e.mem.hunt) return 'hunt';
      if (huntReady(c, e)) {
        callHunt(c, e);
        return 'hunt';
      }
      // 체력이 절반 아래로 떨어지면 한 번, 남은 모서리를 한꺼번에 연다 (초반 2턴에는 오지 않는다)
      if (!e.mem.flooded && hpPct(e) <= 0.5 && c.s.turn >= 2 && (c.p.st[ANGLE] ?? 0) < MAX_ANGLES) {
        e.mem.flooded = 1;
        return 'flood';
      }
      const angles = c.p.st[ANGLE] ?? 0;
      const canWhelp = countDef(c, 'angle-whelp') === 0 && (e.mem.whelps ?? 0) < 4 && last(e) !== 'whelp';
      const recentRend = e.hist.slice(-3).includes('rend');
      const canCarve = angles < MAX_ANGLES && !e.hist.slice(-2).includes('carve');
      // 세 각이 다 열려 사냥을 기다리는 동안에는 시간을 갉아먹거나(행동력 -1) 비틀지(약화) 않는다 — 사냥 턴에 어느 출신이든 온전히 풀 수 있게
      const calm = angles < MAX_ANGLES;
      if (e.row === 1) return pick(c, e, { gnaw: calm ? 3 : 0, howl: 2, whelp: canWhelp ? 3 : 0, twist: calm ? 2 : 0, corners: recentRend ? 0 : 1, carve: canCarve ? 2 : 0 });
      return (
        opener(c, e, ['howl', 'carve']) ??
        pick(c, e, {
          fang: 3,
          gnaw: last(e) === 'gnaw' || !calm ? 0 : 2,
          twist: c.row(1).length && calm ? 2 : 0,
          whelp: canWhelp ? 2 : 0,
          corners: recentRend ? 0 : 1,
          carve: canCarve ? 2 : 0,
        })
      );
    },
    visual: { tint: 0x182040, glow: 0x3090ff, scale: 1.45, fx: ['flicker'] },
  },
  {
    id: 'angle-whelp',
    name: '모서리의 새끼',
    icon: 'gi:hound',
    act: 3,
    tier: 'minion',
    hp: [16, 18],
    poise: 0,
    weak: ['arcane', 'blunt', 'fire'],
    row: 0,
    eldritch: true,
    tags: ['angle'],
    moves: {
      snap: mv.attack('물어뜯기', 5, { type: 'slash' }),
      lunge: mv.attack('모서리에서 튀어나오기', 3, { hits: 2, melee: false, type: 'slash' }),
    },
    ai: (_c, e) => (e.row === 0 ? 'snap' : 'lunge'),
    visual: { tint: 0x223048, glow: 0x50a0ff, scale: 0.65, fx: ['flicker'] },
  },
  {
    id: 'beyond-peaks',
    name: '산맥 너머의 것',
    icon: 'gi:peaks',
    act: 3,
    tier: 'boss',
    hp: [365, 365],
    poise: 12,
    weak: ['fire', 'void'],
    resist: { slash: 0.75, pierce: 0.75 },
    row: 0,
    dread: 9,
    eldritch: true,
    tags: ['beyond'],
    traits: ['a3-veil', 'a3-fear-eater', 'a3-sight'],
    desc: '이 도시를 굽어보는 산맥보다 더 높은 봉우리들 너머, 보랏빛 증기 속에서 모양을 바꾸는 것. 그것을 똑바로 본 탐사대원은 남은 평생 같은 말만 되뇌었다.',
    moves: {
      peaks: mv.attack('끝없는 봉우리', 7, { hits: 3, melee: false, type: 'arcane' }),
      gaze: {
        ...mv.horror('보랏빛 응시', 18),
        desc: '정신 피해 18 (방어도가 먼저 막는다)',
        run(c, e) {
          veiledHorror(c, e, 18, true);
        },
      },
      scream: {
        ...mv.horror('테켈리-리!', 10),
        desc: '정신 피해 10 (방어도가 먼저 막는다), 공포 2',
        run(c, e) {
          veiledHorror(c, e, 10, true);
          if (!c.over) c.apply(c.p, 'dread', 2, e);
        },
      },
      mist: mv.block('증기의 장막', 18, { then: (c, e) => void c.apply(e, 'evasive', 1, e), desc: '방어도 18, 회피 1' }),
      thin: mv.debuff(
        '희박한 공기',
        (c, e) => {
          c.apply(c.p, 'weak', 2, e);
          c.apply(c.p, 'frail', 2, e);
        },
        { desc: '약화 2, 허약 2' },
      ),
      unveil: {
        name: '봉우리 너머가 드러난다',
        intent: 'charge',
        charging: true,
        sanity: 34,
        desc: `다음 턴 그것의 모습이 드러난다: 정신 피해 34 (방어도가 먼저 막는다). 그 뒤 내 턴 ${REVEAL_TURNS}번 동안 형체가 드러난 채로 있다. 지금 붕괴시키면 다시 증기에 가려진다`,
        run(c, e) {
          e.mem.charge = 1;
          c.emit({ t: 'text', uid: e.uid, text: '증기가 걷히기 시작한다…', tone: 'eldritch' });
          // 처음 한 번은 화면 너머의 당신에게 경고한다
          if (!e.mem.warned) {
            e.mem.warned = 1;
            cine(c, 'sysmsg', { text: '화면 밝기를 낮추십시오.' });
          }
          setUi(c, 'ui:dark', DIM_UNVEIL);
        },
      },
      truth: release({
        ...mv.horror('그것을 보았다', 34),
        ultimate: true,
        cine: 'eye',
        desc: `정신 피해 34 (방어도가 먼저 막는다). 그 뒤 내 턴 ${REVEAL_TURNS}번 동안 형체가 드러난다: 받는 피해 +50%, 대신 그것을 공격하는 기술마다 정신 피해 ${LOOK_SAN}`,
        run(c, e) {
          veiledHorror(c, e, 34, true);
          if (!c.over && !e.dead) reveal(c, e);
        },
      }),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'truth';
      // 드러나 있는 동안에는 증기 뒤로 숨지 않는다
      if ((e.st[REVEALED] ?? 0) > 0) return pick(c, e, { peaks: 3, gaze: 2, thin: 1 });
      return opener(c, e, ['scream']) ?? cycle(e, ['peaks', 'gaze', 'mist', 'thin', 'peaks', 'unveil']);
    },
    visual: { tint: 0x3a3050, glow: 0xc090ff, scale: 1.55, fx: ['float', 'flicker'] },
  },

  // ───────────── 계층군주 ─────────────
  {
    id: 'awakened-elder',
    name: '깨어난 원로',
    icon: 'gi:sea-star',
    act: 3,
    tier: 'boss',
    hp: [400, 400],
    poise: 13,
    weak: ['fire', 'pierce'],
    resist: { arcane: 0.75 },
    row: 0,
    dread: 8,
    eldritch: true,
    tags: ['elder'],
    traits: ['a3-old-master'],
    desc: '수억 년 전 얼음 속에 잠든 고대인의 원로. 모닥불의 온기가 얼음을 녹이자 다섯 눈을 떴다. 아직도 이 도시가 제 것이라고 믿는다.',
    moves: {
      tentacles: mv.attack('다섯 갈래 촉수', 5, { hits: 3, melee: false, type: 'slash' }),
      pipe: mv.buff(
        '명령의 피리',
        (c, e) => {
          const t = loyalThrall(c);
          if (!t) return;
          c.apply(t, 'str', 2, e);
          c.gainBlock(t, 10);
        },
        { desc: '쇼고스 노예 힘 +2, 방어도 10' },
      ),
      mold: mv.summon(
        '원형질을 빚는다',
        (c, e) => {
          e.mem.molds = (e.mem.molds ?? 0) + 1;
          c.spawn('shoggoth-blob', 0);
          c.spawn('shoggoth-blob', 0);
        },
        '원형질 조각 둘을 빚어낸다',
      ),
      memory: mv.horror('수억 년의 기억', 12, {
        then: (c, e) => {
          c.apply(c.p, 'dread', 1, e);
          // 처음 기억을 쏟아낼 때 한 번, 화면 너머의 당신에게
          if (!e.mem.spoke) {
            e.mem.spoke = 1;
            cine(c, 'whisper', { text: '우리가 너희를 빚었다.\n실수로.' });
          }
        },
        desc: '정신 피해, 공포 1',
      }),
      stillness: {
        name: '멈춘 시간',
        intent: 'special',
        ultimate: true,
        cine: 'timestop',
        desc: `시간을 멈춘다. 촉수 끝의 칼날 ${BLADE_N}개가 이쪽을 겨눈 채 멈춘다. 원로를 때리는 기술을 쓸 때마다 하나씩 쳐낸다. 내 턴이 끝나면 남은 칼날마다 ${BLADE_DMG} 피해 (방어도가 먼저 막는다)`,
        run(c, e) {
          if ((c.p.st[BLADES] ?? 0) > 0) return;
          if (c.apply(c.p, BLADES, BLADE_N, e) > 0) c.emit({ t: 'text', uid: 'p', text: '칼날들이 허공에 멈췄다', tone: 'eldritch' });
        },
      },
      dissect: mv.attack('해부의 손길', 9, {
        type: 'slash',
        then: (c, e) => {
          c.apply(c.p, 'bleed', 3, e);
          c.apply(c.p, 'weak', 1, e);
        },
        desc: '출혈 3, 약화 1',
      }),
      quell: {
        name: '반란 진압',
        intent: 'special',
        desc: '반란을 일으킨 쇼고스 노예를 피리 소리로 찢는다 (노예에게 피해)',
        run(c, e) {
          const t = rebelThrall(c);
          if (!t) return;
          c.emit({ t: 'text', uid: e.uid, text: '날카로운 피리 소리가 노예를 찢는다', tone: 'eldritch' });
          c.damage({ src: e, tgt: t, base: 24, type: 'arcane', attack: true, move: 'quell' });
        },
      },
      spread: mv.charge('막날개를 펼친다', 38),
      starfall: release(mv.attack('별을 건너온 날개', 38, { melee: false, ultimate: true, cine: 'beam' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'starfall';
      const o = opener(c, e, ['memory']);
      if (o) return o;
      if (rebelThrall(c) && last(e) !== 'quell' && c.rng.chance(0.5)) return 'quell';
      let m = cycle(e, ['tentacles', 'pipe', 'stillness', 'dissect', 'spread', 'tentacles', 'memory']);
      if (m === 'pipe' && !loyalThrall(c)) m = (e.mem.molds ?? 0) < 2 && countDef(c, 'shoggoth-blob') === 0 ? 'mold' : 'dissect';
      return m;
    },
    visual: { tint: 0x3a5048, glow: 0x9fffd0, scale: 1.5, fx: ['float'] },
  },

  // ───────────── 추적자 ─────────────
  {
    id: 'dhole',
    name: '프나스의 돌',
    icon: 'gi:worm-mouth',
    act: 3,
    tier: 'elite',
    hp: [200, 210],
    poise: 8,
    weak: ['pierce', 'slash'],
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['worm'],
    traits: ['a3-burrower'],
    desc: '프나스 골짜기에서 여기까지 얼음 밑으로 굴을 뚫고 올라온 거대한 벌레. 아무도 그 전체 모습을 본 적이 없다.',
    moves: {
      slime: mv.attack('점액 분사', 9, { melee: false, then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '약화 1' }),
      engulf: mv.attack('통째로 삼키기', 15, { then: (c, e) => void c.heal(e, 10), desc: '체력 10 회복' }),
      grind: mv.horror('얼음 밑의 울림', 9),
      burrow: {
        name: '얼음 밑으로',
        intent: 'block',
        desc: '회피 2, 방어도 10. 얼음 밑에서 움직인다',
        run(c, e) {
          e.mem.under = 1;
          c.apply(e, 'evasive', 2, e);
          c.gainBlock(e, 10);
        },
      },
      tremor: hid(mv.attack('땅울림', 5, { hits: 2, melee: false, then: (c, e) => void c.apply(c.p, 'frail', 1, e), desc: '허약 1' })),
      // 속임수: 통찰 3 미만이면 「얼음 밑에서 웅크린다」(방어)로 보인다
      maw: {
        ...mv.attack('얼음 밑의 아가리', 15, {
          melee: false,
          type: 'pierce',
          then: (c, e) => void c.apply(c.p, 'weak', 1, e),
          desc: '웅크린 척하다가 발밑의 얼음을 깨고 아가리를 벌린다. 약화 1 (통찰 3 미만이면 의도가 「얼음 밑에서 웅크린다」로 보인다)',
        }),
        disguise: { kind: 'block', label: '얼음 밑에서 웅크린다' },
      },
      rise: mv.charge('얼음이 부풀어 오른다', 34),
      erupt: release(eruption),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'erupt';
      if (e.mem.under) {
        const l = last(e);
        if (l === 'tremor' || l === 'maw') return 'rise';
        // 얼음 밑에서 무엇을 할지는 보이지 않는다 — 땅울림(읽을 수 없음) 또는 웅크린 척하는 아가리
        return c.rng.chance(0.5) ? 'maw' : 'tremor';
      }
      return cycle(e, ['slime', 'engulf', 'grind', 'burrow']);
    },
    visual: { tint: 0x5a5040, glow: 0xa0ff60, scale: 1.4, fx: ['drip'] },
  },

  // ───────────── 균열 수호자 ─────────────
  {
    id: 'frozen-leader',
    name: '시간에 얼어붙은 탐사대장',
    icon: 'gi:frozen-block',
    act: 3,
    tier: 'elite',
    hp: [205, 215],
    poise: 8,
    weak: ['fire', 'blunt'],
    row: 0,
    dread: 5,
    tags: ['ice', 'expedition'],
    traits: ['a3-stopped-clock'],
    desc: '균열 너머, 시간이 멈춘 얼음 속에 탐사대장이 서 있다. 그는 그날 밤의 마지막 순간을 끝없이 되풀이한다. 손목시계의 바늘은 움직이지 않는다.',
    moves: {
      axe: mv.attack('얼음도끼', 13, { type: 'slash' }),
      flare: mv.attack('마지막 조명탄', 6, { hits: 2, melee: false, type: 'fire', then: (c, e) => void c.apply(c.p, 'burn', 2, e), desc: '화상 2' }),
      journal: mv.horror('끝나지 않는 일지', 10, { then: (c, e) => void c.apply(c.p, 'a3-timeworn', 1, e), desc: '정신 피해, 다음 턴 행동력 -1' }),
      muster: mv.summon(
        '대원 소집',
        (c, e) => {
          e.mem.musters = (e.mem.musters ?? 0) + 1;
          c.spawn('frozen-crewman', 0);
          c.spawn('frozen-crewman', 0);
        },
        '얼어붙은 대원 둘을 부른다',
      ),
      stop: {
        name: '시계를 멈춘다',
        intent: 'special',
        cine: 'timestop',
        desc: `시간을 멈춘다. 적의 공격 피해가 들어오지 않고 쌓였다가 내 턴이 ${STOP_TURNS}번 끝나면 한꺼번에 터진다 (방어도가 먼저 막는다). 그 전에 탐사대장을 붕괴시키면 멈춘 시계가 부서져 쌓인 상처가 사라진다`,
        run(c, e) {
          if (!stopTime(c, e) || e.mem.told) return;
          // 처음 멈출 때 한 번: 그의 손목시계는 화면 너머 당신의 시각에 멈춰 있다
          e.mem.told = 1;
          cine(c, 'whisper', { text: '손목시계의 바늘은\n{time}에 멈춰 있다.' });
        },
      },
      wind: mv.charge('멈춘 시계가 움직인다', 36),
      moment: release(mv.attack('되돌아온 순간', 36, { type: 'slash', ultimate: true, cine: 'impact' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'moment';
      const o = opener(c, e, ['muster']);
      if (o) return o;
      let m = cycle(e, ['axe', 'stop', 'flare', 'axe', 'journal', 'wind']);
      if (m === 'flare' && countDef(c, 'frozen-crewman') === 0 && (e.mem.musters ?? 0) < 2) m = 'muster';
      return m;
    },
    visual: { tint: 0x7a90a8, glow: 0xe0f4ff, scale: 1.3, fx: ['flicker'] },
  },
]);
