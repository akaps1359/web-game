import { reg } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import { cycle, hpPct, last, opener, pick } from '../../engine/ai';
import type { EnemyUnit, MoveDef } from '../../engine/types';
import { countDef, mv, release } from '../moves';
import { cine, setUi } from '../lib';
import { absorbBlobs, frost, hid, isIllusion, returnSkill, seizeSkill, stealInsight, swapRows, veiledHorror } from './common';
import {
  ALOFT,
  ANGLE,
  BLADE_DMG,
  BLADE_N,
  BLADES,
  closeAngles,
  closeIncisions,
  CUT_DMG,
  DIM_UNVEIL,
  EGG_POISON,
  EGG_TURNS,
  EGGS,
  ESCAPE_DMG,
  FALL_DMG,
  HATCH_N,
  implantEggs,
  incise,
  INCISE_N,
  LOOK_SAN,
  liftUp,
  MAX_ANGLES,
  MIMIC_SCREAM,
  openAngle,
  PLASTER,
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

// ───────────── 특성 ─────────────

reg.traits([
  {
    id: 'a3-faceless',
    name: '얼굴 없음',
    desc: '의도를 읽을 수 없다 (통찰 5 이상이면 보인다). 공포에 질린 상대에게 주는 피해 +25%',
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
    desc: '후열에 있는 동안 받는 피해 40% 감소',
    hooks: {
      modDamageIn(_c, s, d) {
        const e = s.unit;
        if (isEnemy(e) && e.row === 1) d.mult *= 0.6;
      },
    },
  },
  {
    id: 'a3-angle-lord',
    name: '각도의 주인',
    desc: `「유리를 긋는다」로 화면에 날카로운 각을 연다 (최대 ${MAX_ANGLES}) — 열린 각은 당신의 턴이 끝날 때마다 문다. 방어도 ${PLASTER} 이상으로 턴을 끝내면 하나를 메우고, 붕괴시키면 모두 닫힌다. 후열로 숨으면 각도가 비틀려 화면이 기운다`,
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
      onDamageTaken(c) {
        syncTilt(c);
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
    desc: '체력이 75%·50%·25% 아래로 떨어질 때마다 원형질 조각 둘을 떼어낸다',
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
          c.spawn('shoggoth-blob', 0);
          c.spawn('shoggoth-blob', 0);
        }
      },
    },
  },
  {
    id: 'a3-mimicry',
    name: '흉내',
    desc: '당신이 쓰는 기술을 듣고 있다 — 「흉내」는 이번 턴 당신이 마지막으로 쓴 기술을 따라 한다. 피해를 준 기술이면 그 피해의 절반을 같은 속성으로 되돌려 주고, 방어도만 얻은 기술이면 그만큼 방어도를 얻는다',
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
    desc: '얼음 밑으로 파고들면 회피 2를 얻는다. 얼음 밑에서는 의도를 속인다 — 땅울림은 읽을 수 없고, 웅크린 척(방어)하다가 아가리를 벌리기도 한다 (통찰 5 이상이면 보인다). 솟구치기 전의 준비는 보인다',
    hooks: {},
  },
  // ── 얼어붙은 고대 도시의 새 특성 ──
  {
    id: 'a3-blind',
    name: '눈이 없다',
    desc: '소리를 쫓는다 — 「소리를 쫓는 부리」는 이번 턴 당신이 쓴 기술 하나마다 한 번씩 쫀다. 기술을 하나도 쓰지 않으면 당신을 찾지 못한다',
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
      },
    },
  },
  {
    id: 'a3-specimen',
    name: '표본 채집',
    desc: '「표본 채집」으로 당신의 기술 하나를 빼앗아 간다. 쓰러뜨리면 되찾는다',
    hooks: {
      onDeath(c, s) {
        if (isEnemy(s.unit)) returnSkill(c, s.unit);
      },
    },
  },
  {
    id: 'a3-cold-bringer',
    name: '눈보라를 끄는 털가죽',
    desc: '자기 차례가 끝날 때마다 당신에게 동상 1',
    hooks: {
      onUnitTurnEnd(c, s) {
        frost(c, c.p, 1, s.unit);
      },
    },
  },
  {
    id: 'a3-dissected',
    name: '해부된 몸',
    desc: '갈라진 몸속이 훤히 보인다 — 약점이 처음부터 모두 드러나 있다. 다른 썰매개가 쓰러지면 힘 +2',
    hooks: {
      onAnyDeath(c, s, victim) {
        if (isEnemy(victim) && victim !== s.unit && victim.def === 'sled-dog') c.apply(s.unit, 'str', 2, s.unit);
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
    desc: '이것이 주는 정신 피해는 당신의 방어도가 먼저 막아 낸다 (막은 만큼 방어도가 줄어든다)',
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
    desc: `「봉우리 너머가 드러난다」를 붕괴로 끊지 못하면 그것을 보게 된다. 그 뒤 당신의 턴 ${REVEAL_TURNS}번 동안 형체가 드러나 받는 피해 +50% — 대신 그것을 공격하는 기술마다 정신 피해 ${LOOK_SAN}. 보지 않으려면 공격하지 않으면 된다`,
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
    desc: '체력이 절반 아래로 떨어지거나 붕괴하면(피리 소리가 끊긴다) 쇼고스 노예가 옛 반란을 기억해 낸다 — 그 뒤로 노예는 주인을 공격한다',
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
    traits: ['a3-faceless'],
    desc: '얼굴이 없는 검은 날개. 얼어붙은 탑 꼭대기에 거꾸로 매달려 있다가 소리 없이 내려와 간지럼을 태우고, 낚아채 어둠 속으로 날아간다.',
    moves: {
      tickle: hid(mv.horror('간지럼', 8, { then: (c, e) => void c.apply(c.p, 'dread', 2, e), desc: '정신 피해, 공포 2' })),
      clutch: hid(mv.attack('움켜쥐기', 10, { desc: '고무 같은 발톱으로 움켜쥔다' })),
      lift: hid(mv.attack('낚아채 오르기', 12, { then: (c, e) => void c.moveRow(e, 1), desc: '공격한 뒤 후열로 날아오른다' })),
      dive: hid(mv.attack('급강하', 11, { melee: false, then: (c, e) => void c.moveRow(e, 0), desc: '높은 곳에서 덮친 뒤 전열로 내려앉는다' })),
    },
    ai: (c, e) => {
      if (e.row === 1) return 'dive';
      return pick(c, e, { clutch: 3, tickle: 2, lift: last(e) === 'dive' ? 0 : 2 });
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
    traits: ['a3-brain-thief'],
    desc: '갑각과 균사로 된 날개 달린 것. 얼음 밑 광맥을 캐러 별 너머에서 왔다. 윙윙거리는 목소리로 말하며, 뇌를 원통에 담아 가져간다.',
    moves: {
      extract: mv.horror('뇌 적출', 6, { then: (c, e) => void stealInsight(c, e, 1), desc: '정신 피해, 통찰 1 강탈 (통찰이 없으면 정신 피해 +4)' }),
      buzz: mv.horror('윙윙거리는 목소리', 9),
      mist: mv.attack('냉기 분사', 9, { melee: false, type: 'arcane' }),
      pincer: mv.attack('외과 집게', 5, { hits: 2, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 2, e), desc: '출혈 2' }),
    },
    ai: (c, e) => {
      if (e.row === 0) return pick(c, e, { pincer: 3, extract: 2, mist: 1 });
      return pick(c, e, { mist: 3, extract: (e.mem.brain ?? 0) >= 2 ? 1 : 3, buzz: 2 });
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
    traits: ['a3-angles'],
    desc: '굽은 시간 속에 사는 굶주린 것. 이 도시의 오각형 탑들에는 120도보다 날카로운 모서리가 너무 많다.',
    moves: {
      lurk: mv.block('모서리에 웅크림', 8, { desc: '방어도 8. 다음 턴 덮친다' }),
      pounce: {
        name: '모서리에서 덮치기',
        intent: 'attack',
        dmg: 12,
        melee: false,
        desc: '전열로 튀어나와 공격, 출혈 2',
        run(c, e) {
          c.moveRow(e, 0);
          c.enemyAttack(e, { type: 'slash' });
          if (!c.over && !e.dead) c.apply(c.p, 'bleed', 2, e);
        },
      },
      bite: mv.attack('푸른 이빨', 9, { then: (c, e) => corrode(c, e), desc: '부식 1 (최대 3)' }),
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
      if (e.row === 1) return last(e) === 'lurk' || last(e) === 'vanish' ? 'pounce' : 'lurk';
      return last(e) === 'bite' ? 'vanish' : 'bite';
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
    traits: ['a3-split'],
    desc: '아직 작은 원형질 덩어리. 눈과 입이 생겼다 사라지며, 쓰러뜨려도 갈라져 다시 기어 온다.',
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
    },
    ai: (c, e) => {
      const blobs = c.alive.filter((x) => x.def === 'shoggoth-blob').length;
      return pick(c, e, {
        lash: 3,
        engulf: 2,
        reform: hpPct(e) < 0.6 && last(e) !== 'reform' ? 2 : 0,
        tekeli: 1,
        absorb: blobs > 0 && last(e) !== 'absorb' ? 3 : 0,
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
    desc: '렝 고원에서 얼음을 건너온 보랏빛 거미. 얼음 틈 사이에 실을 걸고, 걸린 것을 천천히 녹여 먹는다.',
    moves: {
      spit: mv.attack('독액 뱉기', 6, { melee: false, type: 'pierce', then: (c, e) => void c.apply(c.p, 'poison', 3, e), desc: '독 3' }),
      web: mv.debuff(
        '서릿실 거미줄',
        (c, e) => {
          c.apply(c.p, 'weak', 1, e);
          c.apply(c.p, 'frail', 2, e);
        },
        { desc: '약화 1, 허약 2' },
      ),
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
      if (e.row === 0) return pick(c, e, { fang: 3, spit: 1, web: 1 });
      const canBrood = (e.mem.brood ?? 0) < 2 && countDef(c, 'leng-spiderling') < 2;
      return opener(c, e, ['web']) ?? pick(c, e, { spit: 3, web: 1, brood: canBrood && last(e) !== 'brood' ? 2 : 0 });
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
    traits: ['a3-blind'],
    desc: '사람 키만 한 흰 펭귄. 눈이 있어야 할 자리가 매끈하다. 소리 나는 쪽으로 일제히 고개를 돌리고, 뒤뚱거리며 몰려온다.',
    moves: {
      peck: {
        name: '소리를 쫓는 부리',
        intent: 'attack',
        dmg: 3,
        // 횟수는 실행할 때 센다 — 의도를 정하는 시점(라운드 끝)의 c.s.used는 지난 턴 값이라 '×N'으로 보여 주면 틀린다
        melee: true,
        desc: '이번 턴 당신이 쓴 기술 하나마다 한 번씩 쫀다 (표시된 피해는 한 번 쫄 때의 피해. 기술을 하나도 쓰지 않으면 당신을 찾지 못한다)',
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
    },
    ai: (c, e) => pick(c, e, { peck: 5, huddle: countDef(c, 'blind-penguin') > 1 && last(e) !== 'huddle' ? 2 : 0, cry: 1 }),
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
    traits: ['a3-refreeze'],
    desc: '미스캐토닉 탐사대의 방한복을 입은 시신. 서리 앉은 눈썹 아래 눈동자가 하얗게 얼었다. 얼어붙은 손에 아직 도끼를 쥐고 있다.',
    moves: {
      axe: mv.attack('얼음도끼', 11, { type: 'slash' }),
      flare: mv.attack('조명탄 권총', 6, { melee: false, type: 'fire', then: (c, e) => void c.apply(c.p, 'burn', 2, e), desc: '화상 2 (불꽃이 동상을 녹인다)' }),
      journal: mv.horror('마지막 일지', 8, { desc: '얼어붙은 입술로 일지의 마지막 장을 읽는다' }),
    },
    ai: (c, e) => opener(c, e, ['axe']) ?? pick(c, e, { axe: 3, flare: 2, journal: 1 }),
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
    traits: ['incorporeal'],
    desc: '얼어 죽은 자의 마지막 숨이 서리가 되어 떠돈다. 그것이 지나간 자리마다 온기가 사라진다.',
    moves: {
      breath: mv.attack('서리 숨결', 7, { melee: false, type: 'arcane', then: (c, e) => frost(c, c.p, 2, e), desc: '동상 2' }),
      whisper: mv.horror('얼어붙은 속삭임', 8, { then: (c, e) => frost(c, c.p, 1, e), desc: '정신 피해, 동상 1' }),
      drain: {
        name: '온기 흡수',
        intent: 'heal',
        desc: '당신의 동상 1당 체력 4 회복 (최소 8)',
        run(c, e) {
          c.heal(e, Math.max(8, (c.p.st['a3-frostbite'] ?? 0) * 4));
        },
      },
    },
    ai: (c, e) => pick(c, e, { breath: 3, whisper: 2, drain: hpPct(e) < 0.6 && !e.hist.includes('drain') ? 3 : 0 }),
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
    traits: ['flying', 'a3-specimen'],
    desc: '통 같은 몸통에 별 모양의 머리, 접었다 펴는 막날개. 얼음 위를 낮게 날며 표본을 모은다. 이번 표본은 당신이다.',
    moves: {
      collect: {
        name: '표본 채집',
        intent: 'debuff',
        extra: ['attack'],
        dmg: 6,
        melee: false,
        desc: '장착한 기술 하나를 빼앗아 간다 (장착한 기술이 둘 이상일 때) — 쓰러뜨리면 되찾는다',
        run(c, e) {
          c.enemyAttack(e, { type: 'pierce' });
          if (!c.over && !e.dead) seizeSkill(c, e);
        },
      },
      tentacles: mv.attack('다섯 갈래 촉수', 4, { hits: 2, melee: false, type: 'slash' }),
      dive: mv.attack('막날개 급습', 12, { melee: false, type: 'pierce' }),
    },
    ai: (c, e) => {
      if (!e.mem.tried) {
        e.mem.tried = 1;
        return 'collect';
      }
      return pick(c, e, { dive: 3, tentacles: 2 });
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
    traits: ['a3-cold-bringer'],
    desc: '긴 털에 덮인 여섯 다리의 짐승. 이마에 돋은 뿔 하나로 얼음을 가른다. 그것이 지나가면 눈보라가 뒤따른다.',
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
    },
    ai: (c, e) => opener(c, e, ['claws']) ?? pick(c, e, { horn: 3, claws: 2, blizzard: e.hist.slice(-2).includes('blizzard') ? 0 : 2 }),
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
    traits: ['a3-dissected'],
    desc: '탐사대의 썰매개. 배가 정교하게 갈렸다가 다시 꿰매어졌다. 사람의 솜씨가 아니다.',
    moves: {
      bite: mv.attack('물어뜯기', 9),
      nape: mv.attack('목덜미 물기', 4, { hits: 2, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 2, e), desc: '출혈 2' }),
      howl: mv.horror('꿰맨 목의 울부짖음', 5),
    },
    ai: (c, e) => pick(c, e, { bite: 3, nape: 2, howl: 1 }),
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
        desc: `산란관을 꽂아 알을 심는다 — 내 턴이 ${EGG_TURNS}번 끝나면 부화해 새끼 거미 ${HATCH_N}마리가 살을 찢고 나온다. 회복하거나 불로 지지면 알이 죽는다 (이미 알이 있으면 대신 독 ${EGG_POISON})`,
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
    desc: '말처럼 생긴 머리에 비늘 덮인 날개. 산맥 너머의 고원으로 가는 길을 지키며, 밤의 마귀를 몹시 두려워한다.',
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
        desc: `움켜쥐고 하늘 높이 날아오른다 — 다음 턴 샨탁에게 피해를 ${ESCAPE_DMG} 주면 발톱에서 빠져나오고, 아니면 턴이 끝날 때 떨어진다 (피해 ${FALL_DMG}, 다음 턴 행동력 -1)`,
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
    traits: ['a3-anatomist'],
    desc: '얼음 속에서 먼저 깨어난 고대인. 깨어나자마자 탐사대의 천막에서 사람과 개를 갈라 보았다. 다섯 갈래 촉수 끝마다 메스가 들려 있다.',
    moves: {
      scalpels: mv.attack('다섯 개의 메스', 5, { hits: 3, melee: false, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 3, e), desc: '출혈 3' }),
      extract: {
        name: '적출',
        intent: 'debuff',
        extra: ['buff'],
        desc: '당신의 이로운 효과(힘·보호막·재생·회피 등)를 모두 떼어 가 제 것으로 삼는다. 떼어 갈 것이 없으면 취약 2',
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
        desc: `메스 끝으로 절개선 ${INCISE_N}개를 긋는다 — 「생체 해부」가 절개선마다 ${CUT_DMG} 피해를 더 준다. 체력을 회복하면 아문다`,
      }),
      // 피해 = 기본 + 절개선마다 CUT_DMG (의도에 그대로 보인다)
      table: { ...mv.charge('해부대를 펼친다', 0), dmg: (c: Combat) => vivisectDmg(c), desc: `다음 턴 생체 해부 — 그어 둔 절개선마다 피해 +${CUT_DMG}` },
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
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'vivisect';
      const o = opener(c, e, ['gas']);
      if (o) return o;
      if (hpPct(e) < 0.5 && !e.mem.sutured) {
        e.mem.sutured = 1;
        return 'suture';
      }
      return cycle(e, ['scalpels', 'incise', 'extract', 'scalpels', 'table']);
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
    desc: '고대인들이 부리던 원형질의 노예. 주인들의 피리 소리를 흉내 내며, 무엇이든 될 수 있고 무엇이든 삼킨다. 아주 오래전, 주인들에게 반란을 일으켰다.',
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
        desc: `이번 턴 당신이 마지막으로 쓴 기술을 흉내 낸다 — 피해를 준 기술이면 그 피해의 절반을 같은 속성으로 되돌려 주고(방어도가 먼저 막는다), 방어도만 얻은 기술이면 그만큼 방어도를 얻는다. 둘 다 아니거나 기술을 쓰지 않았다면 테켈리-리 — 정신 피해 ${MIMIC_SCREAM}`,
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
    desc: '모든 각도의 주인. 시간이 굽어지기 전부터 굶주려 왔고, 오각형 탑의 모서리마다 새끼를 풀어 둔다. 둥근 것은 지나지 못한다 — 날카로운 각이 있어야 들어온다.',
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
        desc: `화면에 날카로운 각 하나를 연다 (최대 ${MAX_ANGLES}) — 열린 각은 당신의 턴이 끝날 때마다 문다. 방어도 ${PLASTER} 이상으로 턴을 끝내면 하나를 메운다`,
        run: (c, e) => void openAngle(c, e),
      },
      gnaw: mv.attack('시간 갉아먹기', 8, { melee: false, type: 'void', then: (c, e) => void c.apply(c.p, 'a3-timeworn', 1, e), desc: '다음 턴 행동력 -1' }),
      howl: mv.horror('시간 너머의 울부짖음', 11),
      corners: mv.charge('무한한 모서리', 12, { hits: 3 }),
      rend: release(mv.attack('모든 각도에서', 12, { hits: 3, melee: false, type: 'slash', ultimate: true, cine: 'shatter' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'rend';
      const canWhelp = countDef(c, 'angle-whelp') === 0 && (e.mem.whelps ?? 0) < 4 && last(e) !== 'whelp';
      const recentRend = e.hist.slice(-3).includes('rend');
      const canCarve = (c.p.st[ANGLE] ?? 0) < MAX_ANGLES && !e.hist.slice(-2).includes('carve');
      if (e.row === 1) return pick(c, e, { gnaw: 3, howl: 2, whelp: canWhelp ? 3 : 0, twist: 2, corners: recentRend ? 0 : 1, carve: canCarve ? 2 : 0 });
      return (
        opener(c, e, ['howl', 'carve']) ??
        pick(c, e, {
          fang: 3,
          gnaw: last(e) === 'gnaw' ? 0 : 2,
          twist: c.row(1).length ? 2 : 0,
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
        desc: '정신 피해 18 — 방어도가 먼저 막아 낸다',
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
        desc: `다음 턴 그것의 모습이 드러난다 — 정신 피해 34 (방어도가 먼저 막는다). 그 뒤 당신의 턴 ${REVEAL_TURNS}번 동안 형체가 드러난다. 붕괴시키면 다시 증기에 가려진다`,
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
        desc: `정신 피해 34 — 방어도가 먼저 막아 낸다. 그 뒤 당신의 턴 ${REVEAL_TURNS}번 동안 형체가 드러난다: 받는 피해 +50%, 대신 그것을 공격하는 기술마다 정신 피해 ${LOOK_SAN}`,
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
    desc: '수억 년 전 얼음 속에 잠든 고대인의 원로. 모닥불의 온기가 얼음을 녹이자 다섯 눈을 떴다. 그것은 아직 이 도시가 자기 것이라고 믿는다.',
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
        desc: `시간을 멈춘다 — 촉수 끝 칼날 ${BLADE_N}개가 당신을 겨눈 채 멈춘다. 원로를 때리는 기술을 쓸 때마다 하나씩 쳐낼 수 있고, 내 턴이 끝나면 남은 칼날마다 ${BLADE_DMG} 피해 (방어도가 먼저 막는다)`,
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
      // 속임수: 통찰 5 미만이면 「얼음 밑에서 웅크린다」(방어)로 보인다
      maw: {
        ...mv.attack('얼음 밑의 아가리', 15, {
          melee: false,
          type: 'pierce',
          then: (c, e) => void c.apply(c.p, 'weak', 1, e),
          desc: '웅크린 척하다가 발밑의 얼음을 깨고 아가리를 벌린다. 약화 1 (통찰 5 미만이면 의도가 「얼음 밑에서 웅크린다」로 보인다)',
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
        desc: `시간을 멈춘다 — 적의 공격 피해가 들어오지 않고 쌓였다가, 내 턴이 ${STOP_TURNS}번 끝나면 한꺼번에 터진다 (방어도가 먼저 막는다). 그 전에 탐사대장을 붕괴시키면 멈춘 시계가 부서져 쌓인 상처가 사라진다`,
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
