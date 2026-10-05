import { reg, SKILLS } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import { cycle, hpPct, last, opener, pick } from '../../engine/ai';
import { DMG_TYPES, type DmgType, type EnemyUnit, type MoveDef } from '../../engine/types';
import { countDef, mv, others, release } from '../moves';
import { canDoom, dimLight, doomMove } from '../act4/common';
import { hid, isAsleep, isIllusion, realAlive, shuffleGroup, spawnIllusion, stealLight, vanish, wake } from './dream';

/*
 * 5층 — 꿈꾸는 우주의 적들. (최종 수호자 '별의 태아'와 혜성 탯줄은 fetus.ts)
 * 2026-10 개편: 3층 '꿈의 경계'에서 옮겨 온 꿈의 땅 존재들(주그·구그·달짐승·몽유병자·장막 직조자·토성의 고양이·꿈의 문지기·
 * 꿈을 먹는 자·문턱의 존재)과 우주의 존재들(별빛 순례자·성운 해파리·별을 삼킨 것·요람의 수문장·꿈의 대사제·꿈 사냥꾼).
 * 4층보다 강해야 해서 기본 체력·피해를 5층에 맞춰 올렸다 (5층 배율 ACT_HP_MULT 2.0 / ACT_DMG_MULT 1.4 기준).
 */

/** 토성의 고양이: 목숨을 버릴 때마다 약점이 바뀐다 */
const SATURN_WEAK: DmgType[][] = [
  ['blunt', 'void'],
  ['fire', 'pierce'],
  ['slash', 'arcane'],
];

/** 성운 해파리: 별을 낳기까지 (턴) / 낳는 횟수 */
const GESTATION = 3;
const MAX_BIRTHS = 2;
/** 별을 삼킨 것이 붕괴하며 토해 내는 별의 피해 */
const SPIT_DMG = 40;
/** 꿈 사냥꾼: 붙잡은 꿈 하나당 받는 피해 감소, 최대 개수, 풀려날 때 돌려받는 정신력 */
const DREAM_CUT = 0.15;
const MAX_DREAMS = 4;
const DREAM_SAN = 6;

// ───────────── 상태 ─────────────

reg.statuses([
  {
    id: 'a5-gestation',
    name: '잉태',
    icon: 'gi:embryo',
    kind: 'buff',
    desc: '몸속에서 별이 자란다 — {n}턴 뒤 갓 태어난 별을 낳는다',
  },
  {
    id: 'a5-dreams',
    name: '붙잡은 꿈',
    icon: 'gi:dream-catcher',
    kind: 'buff',
    desc: `붙잡은 꿈 하나마다 받는 피해 -15% ({n}개). 붕괴시키면 꿈 하나가 풀려나 정신력 +${DREAM_SAN}`,
    hooks: {
      modDamageIn(_c, s, d) {
        if (d.tgt === s.unit && d.type !== 'true') d.mult *= Math.max(0.3, 1 - DREAM_CUT * s.n);
      },
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || !d.broke || !((e.st['a5-dreams'] ?? 0) > 0)) return;
        c.apply(e, 'a5-dreams', -1);
        c.emit({ t: 'text', uid: e.uid, text: '붙잡혀 있던 꿈 하나가 풀려났다', tone: 'good' });
        c.gainSanity(DREAM_SAN);
      },
    },
  },
  {
    id: 'a5-snare',
    name: '꿈 그물',
    icon: 'gi:bug-net',
    kind: 'debuff',
    desc: '그물에 걸렸다 — 다음 턴 행동력 -{n}',
    tickStart(c, u, n) {
      if (isEnemy(u)) return;
      c.s.ap = Math.max(0, c.s.ap - n);
      delete u.st['a5-snare'];
      c.emit({ t: 'status', uid: 'p', id: 'a5-snare', n: -n });
      c.emit({ t: 'text', uid: 'p', text: `그물에 발이 묶였다 (행동력 -${n})`, tone: 'bad' });
    },
  },
]);

// ───────────── 특성 ─────────────

reg.traits([
  {
    id: 'a5-geometry',
    name: '어긋난 각도',
    desc: '직전에 받은 공격과 같은 속성으로 맞으면 피해 -30% — 속성을 바꿔 가며 공격하라',
    hooks: {
      modDamageIn(_c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || !d.attack || d.type === 'true') return;
        if (e.mem.lastHit === DMG_TYPES.indexOf(d.type) + 1) d.mult *= 0.7;
      },
      onDamageTaken(_c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || !d.attack || d.type === 'true') return;
        e.mem.lastHit = DMG_TYPES.indexOf(d.type) + 1;
      },
    },
  },
  {
    id: 'a5-litany',
    name: '끝없는 자장가',
    desc: '자기 차례가 끝날 때 모든 적의 힘 +1. 붕괴되면 노래가 끊겨 쌓인 힘이 흩어진다 (모든 적의 힘이 사라진다)',
    hooks: {
      onUnitTurnEnd(c, s) {
        for (const a of c.alive) c.apply(a, 'str', 1, s.unit);
      },
      onDamageTaken(c, _s, d) {
        if (!d.broke) return;
        let any = false;
        for (const a of c.alive) {
          if ((a.st.str ?? 0) > 0) {
            c.clear(a, 'str');
            any = true;
          }
        }
        if (any) c.emit({ t: 'text', text: '노래가 끊겼다 — 쌓인 힘이 흩어진다', tone: 'good' });
      },
    },
  },
  {
    id: 'a5-nine-lives',
    name: '아홉 목숨',
    desc: '쓰러져도 남은 목숨이 있으면 체력 40%로 되살아난다. 되살아날 때마다 힘 +2, 버팀이 회복되고 약점이 바뀐다',
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || isIllusion(e)) return;
        const lives = e.mem.lives ?? 0;
        if (lives <= 0) return;
        e.mem.lives = lives - 1;
        // 'risen'과 같은 표식 (봇·균열 규칙이 참조). 다음 목숨을 위해 자기 턴이 끝나면 지운다
        e.mem.revived = 1;
        e.dead = false;
        e.hp = Math.ceil(e.maxHp * 0.4);
        e.block = 0;
        e.broken = 0;
        e.poise = e.maxPoise;
        delete e.mem.charge;
        e.weak = [...SATURN_WEAK[(3 - lives) % SATURN_WEAK.length]];
        e.known = c.p.insight >= 2 ? [...e.weak] : [];
        c.apply(e, 'str', 2, e);
        if (e.st['a5-lives']) c.apply(e, 'a5-lives', -1);
        c.emit({ t: 'spawn', uid: e.uid });
        c.emit({ t: 'text', uid: e.uid, text: `목숨 하나를 버렸다 — 무늬가 바뀐다 (남은 목숨 ${lives - 1})`, tone: 'eldritch' });
        if (c.s.phase === 'player') c.planIntent(e);
      },
      onUnitTurnEnd(_c, s) {
        const e = s.unit;
        if (isEnemy(e) && (e.mem.lives ?? 0) > 0) delete e.mem.revived;
      },
    },
  },
  {
    id: 'a5-lamp-eater',
    name: '등불 갉아먹기',
    desc: '갉아먹은 등불은 쓰러뜨리면 되찾는다',
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || !e.mem.light) return;
        const n = e.mem.light;
        e.mem.light = 0;
        c.run.light = Math.min(100, c.run.light + n);
        c.emit({ t: 'text', uid: 'p', text: `등불 +${n} (되찾음)`, tone: 'good' });
      },
    },
  },
  {
    id: 'a5-sleeping',
    name: '깊은 잠',
    desc: '잠든 동안은 행동하지 않는다. 피해를 받으면 놀라 깨어나 힘 +3',
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.hp <= 0 || !isAsleep(e)) return;
        if (d.attack || d.hpLoss > 0) wake(c, e, true);
      },
    },
  },
  {
    id: 'a5-pilgrim',
    name: '순례자',
    desc: '행동할 때마다 우주 한가운데의 요람에 한 걸음 다가간다. 다 걸으면 별빛이 되어 사라지고(보상 없음) 남은 동료를 축복한다',
    hooks: {},
  },
  {
    id: 'a5-illusionist',
    name: '환영술',
    desc: '환영을 만든다. 환영은 공격받으면 흩어지고, 실제 피해 대신 정신을 흔들며, 처치 보상이 없다. 통찰 4 이상이면 환영을 꿰뚫어 본다',
    hooks: {},
  },
  {
    id: 'a5-dream-glutton',
    name: '꿈의 포식자',
    desc: '잠든 이를 삼켜 회복하고 강해진다. 체력이 절반 아래로 떨어지면 깨어난 악몽이 되어 매 턴 힘이 오른다',
    hooks: {
      onDamageTaken(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || e.hp <= 0 || e.mem.p2 || hpPct(e) > 0.5) return;
        e.mem.p2 = 1;
        e.form = 1;
        e.name = '깨어난 악몽';
        c.emit({ t: 'fx', name: 'transform', tgt: e.uid });
        c.emit({ t: 'text', uid: e.uid, text: '꿈이 찢어지고, 악몽이 눈을 뜬다', tone: 'eldritch' });
        c.apply(e, 'ritual', 1, e);
        c.loseSanity(6, true);
        if (e.broken !== 2) c.planIntent(e);
      },
    },
  },
  {
    id: 'a5-liminal',
    name: '문턱',
    desc: '자기 턴이 끝날 때마다 현실과 꿈 사이를 오간다. 현실에선 화염·비전·공허 피해를, 꿈에선 참격·관통·타격 피해를 60% 덜 받는다',
    hooks: {
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead) return;
        if (e.st['a5-phase-dream']) {
          c.clear(e, 'a5-phase-dream');
          c.apply(e, 'a5-phase-real', 1, e);
          c.emit({ t: 'text', uid: e.uid, text: '현실로 넘어왔다', tone: 'info' });
        } else {
          c.clear(e, 'a5-phase-real');
          c.apply(e, 'a5-phase-dream', 1, e);
          c.emit({ t: 'text', uid: e.uid, text: '꿈속으로 가라앉았다', tone: 'eldritch' });
        }
      },
    },
  },
  {
    id: 'a5-cradle',
    name: '별의 요람',
    desc: `몸속에서 별을 키운다 — ${GESTATION}턴마다 갓 태어난 별을 낳는다 (${MAX_BIRTHS}번까지)`,
    hooks: {
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || isIllusion(e) || (e.mem.births ?? 0) >= MAX_BIRTHS) return;
        if ((e.mem.gest ?? 0) <= 0) return;
        e.mem.gest -= 1;
        if (e.st['a5-gestation']) c.apply(e, 'a5-gestation', -1);
      },
    },
  },
  {
    id: 'a5-swallowed-star',
    name: '삼킨 별',
    desc: `붕괴하면 삼킨 별을 토해 낸다 — 다른 모든 적에게 화염 피해 ${SPIT_DMG} (한 번)`,
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || !d.broke || e.mem.spat || isIllusion(e)) return;
        e.mem.spat = 1;
        c.emit({ t: 'fx', name: 'transform', tgt: e.uid });
        c.emit({ t: 'text', uid: e.uid, text: '삼킨 별을 토해 냈다!', tone: 'good' });
        for (const a of c.alive) {
          if (a === e || isIllusion(a)) continue;
          c.damage({ src: null, tgt: a, base: SPIT_DMG, type: 'fire', tags: ['a5-spit'] });
        }
      },
    },
  },
  {
    id: 'a5-dream-catcher',
    name: '꿈 사냥',
    desc: '붙잡은 꿈을 갑옷처럼 두른다 (꿈 하나마다 받는 피해 -15%). 붕괴시키면 꿈 하나가 풀려난다. 사냥이 길어질수록 꿈을 더 붙잡는다',
    hooks: {},
  },
]);

// ───────────── 행동 헬퍼 ─────────────

/** 장막 직조자가 베낄 수 있는 존재 */
const COPYABLE = ['gug', 'moonbeast', 'sleepwalker', 'veil-weaver', 'star-swallower'];

function weaveIllusion(c: Combat, e: EnemyUnit) {
  if (isIllusion(e)) return;
  const cands = realAlive(c).filter((x) => x !== e && COPYABLE.includes(x.def) && !isAsleep(x));
  const src = cands.length ? c.rng.pick(cands) : e;
  const copy = spawnIllusion(c, src, 3);
  if (copy) shuffleGroup(c, [src, copy]);
}

function mirrorSelf(c: Combat, e: EnemyUnit) {
  if (isIllusion(e)) return;
  for (let i = 0; i < 2; i++) {
    if (c.alive.filter(isIllusion).length >= 2) break;
    spawnIllusion(c, e, 3);
  }
  shuffleGroup(c, c.alive.filter((x) => x === e || (isIllusion(x) && x.def === e.def)));
  c.emit({ t: 'text', uid: e.uid, text: '거울의 문이 열렸다 — 어느 쪽이 진짜인가', tone: 'eldritch' });
}

function openGate(c: Combat, e: EnemyUnit) {
  if (isIllusion(e)) return;
  e.mem.opened = 1;
  c.spawn('sleepwalker', 0);
  c.apply(e, 'str', 2, e);
}

function feedOnDreams(c: Combat, e: EnemyUnit) {
  const n = c.horror(e, 12);
  if (!e.dead && n > 0 && !c.over) c.heal(e, n * 2);
}

function devour(c: Combat, e: EnemyUnit) {
  const s = c.alive.find((x) => x !== e && isAsleep(x) && !isIllusion(x));
  if (!s) return feedOnDreams(c, e);
  vanish(c, s, '꿈째로 삼켜졌다');
  c.heal(e, 30);
  c.apply(e, 'str', 1, e);
}

/** 기억 포식: 장착 스킬 n개를 잊게 한다 (재사용 대기 2) */
function eatMemory(c: Combat, e: EnemyUnit, n: number) {
  const cands = c.run.slots.filter((x): x is string => !!x && !((c.s.cd[x] ?? 0) > 0));
  for (const uid of c.rng.sample(cands, n)) {
    c.s.cd[uid] = 2;
    const id = c.run.skills.find((s) => s.uid === uid)?.id;
    c.emit({ t: 'text', uid: 'p', text: `잊혔다: ${(id && SKILLS.get(id)?.name) || '기술'}`, tone: 'eldritch' });
  }
  c.horror(e, 5);
}

function pilgrimStep(c: Combat, e: EnemyUnit) {
  if (isIllusion(e) || e.dead) return;
  e.mem.steps = Math.max(0, (e.mem.steps ?? 5) - 1);
  if (e.st['a5-pilgrimage']) c.apply(e, 'a5-pilgrimage', -1);
}

/** 순례자의 행동: 실행할 때마다 한 걸음 */
const walk = (m: MoveDef): MoveDef => ({
  ...m,
  run(c, e) {
    m.run(c, e);
    pilgrimStep(c, e);
  },
});

function whip(c: Combat, e: EnemyUnit) {
  if (isIllusion(e)) return;
  const slave = c.alive.find((x) => x.def === 'leng-slave' && !isIllusion(x));
  if (slave) {
    c.loseHp(slave, 6);
    if (!slave.dead) c.apply(slave, 'str', 3, e);
  } else c.apply(e, 'str', 2, e);
}

/** 성운 해파리가 별을 낳는다 */
function birthStar(c: Combat, e: EnemyUnit) {
  if (isIllusion(e)) return;
  e.mem.births = (e.mem.births ?? 0) + 1;
  const star = c.spawn('newborn-star', 1);
  if (star) c.emit({ t: 'text', uid: star.uid, text: '별 하나가 태어났다', tone: 'eldritch' });
  if (e.mem.births < MAX_BIRTHS) {
    e.mem.gest = GESTATION;
    c.apply(e, 'a5-gestation', GESTATION, e);
  }
}

/** 별을 삼킨 것: 당신의 방어도를 빨아들인다 */
function pullLight(c: Combat, e: EnemyUnit) {
  if (isIllusion(e)) return;
  const n = c.p.block;
  if (n <= 0) {
    c.emit({ t: 'text', uid: e.uid, text: '빨아들일 빛이 없다', tone: 'info' });
    return;
  }
  c.p.block = 0;
  c.emit({ t: 'text', uid: 'p', text: `방어도 ${n}을(를) 빨아들였다`, tone: 'bad' });
  c.gainBlock(e, n);
}

/** 꿈 사냥꾼이 꿈 하나를 더 붙잡는다 */
function catchDream(c: Combat, e: EnemyUnit) {
  if ((e.st['a5-dreams'] ?? 0) >= MAX_DREAMS) return;
  c.apply(e, 'a5-dreams', 1, e);
  c.emit({ t: 'text', uid: e.uid, text: '당신의 꿈 한 조각을 붙잡았다', tone: 'eldritch' });
}

// ───────────── 일반 적 ─────────────

reg.enemies([
  {
    id: 'star-pilgrim',
    name: '별빛 순례자',
    icon: 'gi:cowled',
    act: 5,
    tier: 'normal',
    hp: [118, 126],
    poise: 5,
    weak: ['pierce', 'void'],
    resist: { arcane: 0.5 },
    row: 1,
    dread: 3,
    eldritch: true,
    tags: ['dream', 'pilgrim'],
    traits: ['a5-pilgrim'],
    desc: '우주 한가운데의 요람을 향해 걷는 자들. 걸음마다 몸이 별빛으로 부서져 흩어지지만, 멈추는 법이 없다.',
    onSpawn: (c, e) => {
      if (c.s.vars.a5Illu) return;
      e.mem.steps = 5;
      e.st['a5-pilgrimage'] = 5;
    },
    moves: {
      chant: walk(mv.horror('별빛 찬송', 10)),
      bless: walk(
        mv.buff(
          '별빛의 축복',
          (c, e) => {
            for (const a of c.alive) if (!isIllusion(a)) c.apply(a, 'barrier', 8, e);
          },
          { desc: '모든 아군 보호막 8' },
        ),
      ),
      penance: walk(
        mv.buff(
          '고행',
          (c, e) => {
            c.loseHp(e, 8);
            if (e.dead) return;
            for (const a of others(c, e)) c.apply(a, 'str', 1, e);
          },
          { desc: '체력 8을 바쳐 다른 아군 힘 +1' },
        ),
      ),
      shard: walk(mv.attack('별 부스러기', 13, { melee: false, type: 'arcane' })),
      depart: {
        name: '요람으로',
        intent: 'flee',
        desc: '별빛이 되어 요람으로 사라진다 (보상 없음). 남은 아군 힘 +2, 체력 20 회복',
        run(c, e) {
          for (const a of others(c, e)) {
            if (isIllusion(a)) continue;
            c.apply(a, 'str', 2, e);
            c.heal(a, 20);
          }
          vanish(c, e, '별빛이 되어 요람으로 흘러갔다');
        },
      },
    },
    ai: (c, e) => {
      if (!isIllusion(e) && (e.mem.steps ?? 5) <= 0) return 'depart';
      const allies = others(c, e).length;
      return pick(c, e, { chant: 2, bless: allies ? 2 : 1, penance: allies && e.hp > 20 ? 1 : 0, shard: 2 });
    },
    visual: { tint: 0x4a4868, glow: 0xffe6a0, fx: ['flicker'] },
  },
  {
    id: 'nebula-jelly',
    name: '성운 해파리',
    icon: 'gi:jellyfish',
    act: 5,
    tier: 'normal',
    hp: [118, 126],
    poise: 5,
    weak: ['pierce', 'void'],
    resist: { blunt: 0.5 },
    row: 1,
    dread: 4,
    eldritch: true,
    tags: ['star', 'nebula'],
    traits: ['a5-cradle'],
    desc: '갓처럼 부푼 성운이 별 사이를 떠돈다. 투명한 몸속에서 아기 별들이 깜박이고, 다 자란 별은 몸 밖으로 낳아 보낸다.',
    onSpawn: (c, e) => {
      if (c.s.vars.a5Illu) return;
      e.mem.gest = GESTATION;
      e.st['a5-gestation'] = GESTATION;
    },
    moves: {
      sting: mv.attack('빛줄기 쏘기', 8, { hits: 2, melee: false, type: 'arcane', then: (c, e) => void c.apply(c.p, 'frail', 1, e), desc: '허약 1' }),
      pulse: mv.buff(
        '성운의 맥동',
        (c, e) => {
          for (const a of c.alive) if (!isIllusion(a)) c.apply(a, 'barrier', 8, e);
        },
        { desc: '모든 적 보호막 8' },
      ),
      birth: mv.summon('별을 낳는다', birthStar, '갓 태어난 별 하나를 낳는다'),
    },
    ai: (c, e) => {
      if (!isIllusion(e) && (e.mem.gest ?? 1) <= 0 && (e.mem.births ?? 0) < MAX_BIRTHS) return 'birth';
      return pick(c, e, { sting: 3, pulse: others(c, e).length && last(e) !== 'pulse' ? 1 : 0 });
    },
    visual: { tint: 0x3a2a5a, glow: 0xff9ad8, fx: ['float', 'flicker'] },
  },
  {
    id: 'star-swallower',
    name: '별을 삼킨 것',
    icon: 'gi:black-hole-bolas',
    act: 5,
    tier: 'normal',
    hp: [180, 190],
    poise: 7,
    weak: ['blunt', 'void'],
    resist: { fire: 0.5, arcane: 0.5 },
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['star', 'void'],
    traits: ['a5-swallowed-star'],
    desc: '검은 몸속에서 삼킨 별이 아직 타고 있다. 빛을 보면 그것마저 삼키려 든다 — 등불도, 당신이 두른 방어도.',
    moves: {
      gulp: mv.attack('별빛 삼키기', 16, { then: (c) => dimLight(c, 6), desc: '등불 -6' }),
      pull: {
        name: '빛을 빨아들인다',
        intent: 'debuff',
        extra: ['block'],
        desc: '당신의 방어도를 모두 빨아들여 제 방어도로 삼는다',
        run: pullLight,
      },
      hunger: mv.horror('굶주린 공허', 11, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '정신 피해, 공포 1' }),
      gape: mv.charge('아가리를 벌린다', 40),
      swallow: release(mv.attack('통째로 삼킨다', 40, { type: 'void' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'swallow';
      return (
        opener(c, e, ['gulp']) ??
        pick(c, e, { gulp: 3, pull: e.hist.slice(-2).includes('pull') ? 0 : 2, hunger: 1, gape: e.hist.slice(-2).includes('swallow') ? 0 : 1 })
      );
    },
    visual: { tint: 0x0a0812, glow: 0xffc070, scale: 1.25, fx: ['float'] },
  },
  {
    id: 'moonbeast',
    name: '달짐승',
    icon: 'gi:toad-teeth',
    act: 5,
    tier: 'normal',
    hp: [160, 170],
    poise: 6,
    weak: ['slash', 'arcane'],
    resist: { blunt: 0.75 },
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['dream', 'moon'],
    desc: '달의 뒷면에서 온, 눈 없는 두꺼비 같은 회백색 몸뚱이. 주둥이 끝에서 분홍빛 촉수가 꿈틀댄다. 노예를 부리고 고문을 즐긴다.',
    moves: {
      snout: mv.attack('촉수 주둥이', 7, { hits: 3 }),
      hook: mv.attack('고문 갈고리', 13, { type: 'pierce', then: (c, e) => void c.apply(c.p, 'bleed', 3, e), desc: '출혈 3' }),
      whip: mv.buff('채찍질', whip, { desc: '렝의 노예에게 피해 6을 주고 노예 힘 +3 (노예가 없으면 자신 힘 +2)' }),
      call: mv.summon(
        '노예 부르기',
        (c, e) => {
          if (isIllusion(e)) return;
          e.mem.called = (e.mem.called ?? 0) + 1;
          c.spawn('leng-slave', 0);
        },
        '렝의 노예 소환',
      ),
    },
    ai: (c, e) => {
      if (e.mem.illu) return pick(c, e, { snout: 1, hook: 1 });
      const slaves = countDef(c, 'leng-slave');
      return (
        opener(c, e, ['hook']) ??
        pick(c, e, { snout: 3, hook: 2, whip: slaves ? 2 : 1, call: slaves === 0 && (e.mem.called ?? 0) < 2 && last(e) !== 'call' ? 2 : 0 })
      );
    },
    visual: { tint: 0x9a9a8a, glow: 0xff90b0, scale: 1.1, fx: ['drip'] },
  },
  {
    id: 'zoog',
    name: '주그',
    icon: 'gi:flying-fox',
    act: 5,
    tier: 'normal',
    hp: [82, 90],
    poise: 4,
    weak: ['fire', 'blunt', 'slash'],
    row: 0,
    dread: 2,
    eldritch: true,
    tags: ['dream', 'zoog'],
    traits: ['a5-lamp-eater'],
    desc: '떠도는 꿈의 숲에 사는 작고 갈색 털 난 것들. 파닥이는 소리로 속삭이며, 호기심이 많고 무엇이든 갉아먹는다 — 특히 등불을.',
    moves: {
      nibble: mv.attack('등불 갉아먹기', 5, { hits: 2, type: 'slash', then: (c, e) => stealLight(c, e, 6), desc: '등불 6을 갉아먹는다' }),
      chitter: mv.horror('파닥이는 속삭임', 6, { then: (c, e) => void c.apply(e, 'evasive', 1, e), desc: '정신 피해, 자신에게 회피 1' }),
      swarm: mv.attack('떼 지어 물기', 3, { hits: (c) => 1 + countDef(c, 'zoog'), type: 'slash', desc: '주그 수만큼 더 문다' }),
    },
    ai: (c, e) => pick(c, e, { nibble: c.run.light > 0 ? 3 : 0, chitter: 2, swarm: countDef(c, 'zoog') > 1 ? 2 : 1 }),
    visual: { tint: 0x5a4630, glow: 0xffe070, scale: 0.7 },
  },
  {
    id: 'gug',
    name: '구그',
    icon: 'gi:troll',
    act: 5,
    tier: 'normal',
    hp: [192, 202],
    poise: 6,
    weak: ['pierce', 'fire'],
    resist: { slash: 0.75 },
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['dream', 'giant'],
    desc: '저주받아 꿈의 섬 밑바닥으로 쫓겨난 거인. 팔목마다 두 개씩 갈라진 앞발, 머리를 세로로 가르는 아가리.',
    moves: {
      paws: mv.attack('네 개의 앞발', 7, { hits: 3 }),
      stomp: mv.attack('짓밟기', 19, { then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '약화 1' }),
      gape: mv.charge('세로 아가리를 벌린다', 38),
      maw: release(mv.attack('세로 아가리', 38)),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'maw';
      return opener(c, e, ['paws']) ?? pick(c, e, { paws: 2, stomp: 2, gape: e.hist.slice(-2).includes('maw') ? 0 : 1 });
    },
    visual: { tint: 0x4a3a38, glow: 0xff5040, scale: 1.3 },
  },
  {
    id: 'sleepwalker',
    name: '몽유병자',
    icon: 'gi:shambling-zombie',
    act: 5,
    tier: 'normal',
    hp: [126, 134],
    poise: 5,
    weak: ['slash', 'void'],
    row: 0,
    dread: 2,
    tags: ['dream', 'sleeping'],
    traits: ['a5-sleeping'],
    desc: '별 사이를 헤매다 돌아가는 길을 잃은 사람들. 눈을 감은 채 걷는다. 깨우지 않는 편이 낫다.',
    onSpawn: (c, e) => {
      if (c.s.vars.a5Illu) return;
      e.mem.asleep = 3;
      e.st['a5-asleep'] = 3;
    },
    moves: {
      doze: {
        name: '잠들어 있다',
        intent: 'sleep',
        desc: '아무것도 하지 않는다',
        run(c, e) {
          // 꿈을 먹는 자의 곁에서는 스스로 깨어나지 못한다
          if (c.alive.some((x) => x.def === 'dream-eater')) return;
          e.mem.asleep = (e.mem.asleep ?? 1) - 1;
          if (e.mem.asleep <= 0) {
            e.mem.asleep = 1;
            wake(c, e, false);
          } else if (e.st['a5-asleep']) c.apply(e, 'a5-asleep', -1);
        },
      },
      flail: mv.attack('허우적거림', 5, { hits: 3 }),
      claw: mv.attack('잠결의 손톱', 16, { type: 'slash' }),
      scream: mv.horror('악몽의 비명', 9, { then: (c, e) => void c.apply(c.p, 'dread', 2, e), desc: '정신 피해, 공포 2' }),
    },
    ai: (c, e) => (isAsleep(e) ? 'doze' : pick(c, e, { flail: 2, claw: 3, scream: 2 })),
    visual: { tint: 0x8a8aa0, glow: 0xc0d0ff },
  },
  {
    id: 'veil-weaver',
    name: '장막 직조자',
    icon: 'gi:duality-mask',
    act: 5,
    tier: 'normal',
    hp: [116, 124],
    poise: 5,
    weak: ['pierce', 'void'],
    row: 1,
    dread: 4,
    eldritch: true,
    tags: ['dream', 'illusion'],
    traits: ['a5-illusionist'],
    desc: '가면 뒤에 얼굴이 몇 개인지 아무도 모른다. 꿈의 실로 동료의 그림자를 짜낸다.',
    moves: {
      weave: mv.summon('환영 짜기', weaveIllusion, '아군 하나의 환영을 만든다'),
      needle: mv.attack('꿈바늘', 14, { melee: false, type: 'pierce' }),
      lull: mv.horror('자장가', 9, { then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '정신 피해, 약화 1' }),
    },
    ai: (c, e) => {
      if (e.mem.illu) return pick(c, e, { needle: 2, lull: 1 });
      const illus = c.alive.filter(isIllusion).length;
      return opener(c, e, ['weave']) ?? pick(c, e, { weave: illus < 2 && last(e) !== 'weave' ? 2 : 0, needle: 3, lull: 2 });
    },
    visual: { tint: 0x3a3050, glow: 0xe0b0ff, fx: ['flicker', 'float'] },
  },

  // ───────────── 하수인 ─────────────
  {
    id: 'leng-slave',
    name: '렝의 노예',
    icon: 'gi:prisoner',
    act: 5,
    tier: 'minion',
    hp: [36, 42],
    poise: 0,
    weak: ['slash', 'pierce', 'fire'],
    row: 0,
    tags: ['dream', 'leng'],
    moves: {
      spear: mv.attack('녹슨 창', 8, { type: 'pierce' }),
      horn: mv.attack('뿔 들이받기', 11),
    },
    ai: (c, e) => pick(c, e, { spear: 2, horn: 1 }),
    visual: { tint: 0x5a4a3a, glow: 0xd0a060, scale: 0.8 },
  },
  {
    id: 'newborn-star',
    name: '갓 태어난 별',
    icon: 'gi:star-prominences',
    act: 5,
    tier: 'minion',
    hp: [22, 26],
    poise: 0,
    weak: ['void', 'pierce', 'slash'],
    row: 1,
    eldritch: true,
    tags: ['star'],
    desc: '성운이 낳은 아기 별. 첫 빛을 터뜨리고 나면 꺼져 버린다.',
    moves: {
      swell: mv.charge('빛이 부푼다', 22),
      flare: release(
        mv.attack('터지는 첫 빛', 22, {
          melee: false,
          type: 'fire',
          then: (c, e) => vanish(c, e, '빛을 다 쏟고 꺼졌다'),
        }),
      ),
    },
    ai: (_c, e) => (e.mem.charge ? 'flare' : 'swell'),
    visual: { tint: 0x5a4020, glow: 0xffe6a0, scale: 0.55, fx: ['float', 'flicker'] },
  },

  // ───────────── 정예 ─────────────
  {
    id: 'saturn-cat',
    name: '토성의 고양이',
    icon: 'gi:hollow-cat',
    act: 5,
    tier: 'elite',
    hp: [250, 260],
    poise: 8,
    weak: [...SATURN_WEAK[0]],
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['dream', 'saturn'],
    traits: ['a5-nine-lives'],
    desc: '달의 뒷면에서 달짐승과 손잡은, 토성에서 온 기묘한 고양이. 지구의 고양이들과는 오랜 원수이며 좀처럼 죽지 않는다.',
    onSpawn: (c, e) => {
      if (c.s.vars.a5Illu) return;
      e.mem.lives = 2;
      e.st['a5-lives'] = 2;
    },
    moves: {
      rake: mv.attack('고리 발톱', 10, { hits: 2, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 2, e), desc: '출혈 2' }),
      grin: mv.horror('토성의 미소', 12, { then: (c, e) => void c.apply(c.p, 'dread', 2, e), desc: '정신 피해, 공포 2' }),
      pounce: mv.attack('뒤틀린 도약', 20, { melee: false }),
      coil: mv.block('고리 속으로 몸을 말다', 16, { then: (c, e) => void c.apply(e, 'evasive', 1, e), desc: '방어도 16, 회피 1' }),
      stalk: mv.charge('사냥 자세', 46),
      leap: release(mv.attack('목덜미 물기', 46)),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'leap';
      return cycle(e, ['rake', 'grin', 'pounce', 'coil', 'rake', 'stalk']);
    },
    visual: { tint: 0x2a2440, glow: 0xffd040, scale: 1.2, fx: ['flicker'] },
  },
  {
    id: 'dream-gatekeeper',
    name: '꿈의 문지기',
    icon: 'gi:door-watcher',
    act: 5,
    tier: 'elite',
    hp: [430, 445],
    poise: 11,
    weak: ['void', 'pierce'],
    row: 0,
    dread: 6,
    eldritch: true,
    tags: ['dream', 'gate'],
    traits: ['a5-illusionist'],
    desc: '얕은 잠의 일흔 계단 끝, 깊은 잠의 문을 지키는 자. 문 앞에서는 무엇이 진짜인지 그가 정한다.',
    moves: {
      staff: mv.attack('문지기의 지팡이', 14, { hits: 2, melee: false, type: 'arcane' }),
      mirror: mv.summon('거울의 문', mirrorSelf, '자신의 환영 2개를 만들고 자리를 뒤섞는다'),
      riddle: hid(mv.horror('문의 수수께끼', 11, { dmg: 12, then: (c, e) => void c.apply(c.p, 'dread', 2, e), desc: '피해와 정신 피해, 공포 2' })),
      steps: mv.debuff(
        '얕은 잠의 일흔 계단',
        (c, e) => {
          c.apply(c.p, 'weak', 1, e);
          c.apply(c.p, 'frail', 2, e);
        },
        { desc: '약화 1, 허약 2' },
      ),
      seal: mv.charge('문의 봉인', 50),
      judgment: release(mv.attack('문지기의 심판', 50, { melee: false, type: 'void' })),
      open: mv.summon('깊은 잠의 문', openGate, '잠든 몽유병자 하나를 불러들이고 힘 +2'),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'judgment';
      if (e.mem.illu) return pick(c, e, { staff: 3, riddle: 2, steps: 1 });
      if (hpPct(e) <= 0.5 && !e.mem.opened) return 'open';
      const first = opener(c, e, ['steps']);
      if (first) return first;
      if (c.alive.filter(isIllusion).length === 0 && !e.hist.includes('mirror')) return 'mirror';
      return cycle(e, ['staff', 'riddle', 'staff', 'seal', 'steps']);
    },
    visual: { tint: 0x4a4060, glow: 0xffe0a0, scale: 1.45, fx: ['float'] },
  },
  {
    id: 'cradle-warden',
    name: '요람의 수문장',
    icon: 'gi:rock-golem',
    act: 5,
    tier: 'elite',
    hp: [420, 435],
    poise: 12,
    weak: ['void', 'blunt'],
    row: 0,
    dread: 8,
    eldritch: true,
    tags: ['star', 'cradle'],
    traits: ['a5-geometry'],
    desc: '별이 태어나는 성운의 요람을 지키는 운석의 거상. 그 몸의 각도는 어느 것도 맞지 않는다.',
    moves: {
      fist: mv.attack('운석 주먹', 26),
      gaze: mv.debuff(
        '굳히는 응시',
        (c, e) => {
          c.apply(c.p, 'silence', 1, e);
          c.apply(c.p, 'frail', 2, e);
        },
        { desc: '침묵 1 (다음 턴 기본기만 쓸 수 있다), 허약 2' },
      ),
      hush: mv.horror('요람의 자장가', 15, { then: (c, e) => void c.apply(c.p, 'dread', 2, e), desc: '정신 피해, 공포 2' }),
      wall: mv.block('기하학의 벽', 26),
      open: mv.charge('요람의 문을 연다', 56),
      starfall: release(mv.attack('쏟아지는 별무리', 56, { melee: false, type: 'void' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'starfall';
      const o = opener(c, e, ['fist']);
      if (o) return o;
      return cycle(e, ['hush', 'fist', 'open', 'wall', 'fist', 'gaze']);
    },
    visual: { tint: 0x2c2a3c, glow: 0xc8a8ff, scale: 1.5 },
  },
  {
    id: 'dream-hierophant',
    name: '꿈의 대사제',
    icon: 'gi:warlock-hood',
    act: 5,
    tier: 'elite',
    hp: [290, 300],
    poise: 10,
    weak: ['fire', 'pierce'],
    row: 1,
    dread: 6,
    tags: ['cult', 'dream'],
    traits: ['a5-litany', 'a4-judge'],
    desc: '태아가 깨어나지 않도록 평생 자장가를 불러 온 사제. 이 꿈이 영원하기를 빈다. 그 노래가 동료들을 강하게 만든다.',
    moves: {
      sermon: mv.horror('요람의 설교', 14, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '정신 피해, 공포 1' }),
      blessing: mv.block('성운의 축복', 0, {
        then(c, e) {
          for (const a of c.alive) {
            c.gainBlock(a, 14);
            c.apply(a, 'regen', 3, e);
          }
        },
        desc: '모든 적 방어도 14, 재생 3',
      }),
      spear: mv.attack('검은 별빛의 창', 14, { hits: 2, melee: false, type: 'void' }),
      prayer: doomMove('끝나지 않는 꿈의 기도', 3, 40, 12),
    },
    ai: (c, e) => {
      const o = opener(c, e, ['sermon']);
      if (o) return o;
      if (canDoom(c, e, 6)) return 'prayer';
      return pick(c, e, { spear: 3, sermon: 2, blessing: others(c, e).length && !e.hist.slice(-2).includes('blessing') ? 2 : 0 });
    },
    visual: { tint: 0x221a40, glow: 0xa890ff, scale: 1.2, fx: ['float'] },
  },

  // ───────────── 계층군주 / 추적자 / 균열 수호자 ─────────────
  {
    id: 'dream-eater',
    name: '꿈을 먹는 자',
    icon: 'gi:evil-moon',
    act: 5,
    tier: 'boss',
    hp: [680, 680],
    poise: 14,
    weak: ['fire', 'slash'],
    resist: { void: 0.5 },
    row: 0,
    dread: 8,
    eldritch: true,
    tags: ['dream', 'lord'],
    traits: ['a5-dream-glutton'],
    desc: '태아가 꾸는 꿈의 가장자리에서, 잠든 이들의 꿈을 갉아먹고 자라는 것. 이 층에서 잠드는 자는 모두 그것의 식탁에 오른다.',
    moves: {
      maw: mv.attack('꿈의 아가리', 22),
      ravage: hid(mv.attack('악몽의 난도질', 8, { hits: 3, type: 'slash' })),
      devour: {
        name: '꿈 삼키기',
        intent: 'heal',
        desc: '잠든 이를 통째로 삼켜 체력 30 회복, 힘 +1 (잠든 이가 없으면 꿈 갉아먹기)',
        run: devour,
      },
      dreamfeed: {
        name: '꿈 갉아먹기',
        intent: 'horror',
        sanity: 12,
        desc: '빼앗은 정신력의 두 배만큼 회복한다',
        run: feedOnDreams,
      },
      lull: mv.summon(
        '깊은 자장가',
        (c, e) => {
          e.mem.lulled = (e.mem.lulled ?? 0) + 1;
          c.spawn('sleepwalker', 0);
          c.apply(c.p, 'dread', 2, e);
        },
        '몽유병자를 불러 재운다. 공포 2',
      ),
      feast: hid(mv.debuff('기억 포식', (c, e) => eatMemory(c, e, 2), { desc: '스킬 2개를 잊게 한다 (재사용 대기 2), 정신 피해 5' })),
      conceive: mv.charge('악몽 잉태', 48),
      nightfall: release(mv.attack('악몽 강림', 48, { melee: false, type: 'void' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'nightfall';
      const sleeper = c.alive.some((x) => x !== e && isAsleep(x) && !isIllusion(x));
      const canLull = countDef(c, 'sleepwalker') < 2 && (e.mem.lulled ?? 0) < 3;
      const m = e.form
        ? cycle(e, ['ravage', 'dreamfeed', 'feast', 'conceive', 'ravage', 'lull'], 'c2')
        : cycle(e, ['maw', 'dreamfeed', 'feast', 'lull', 'maw', 'conceive']);
      if (m === 'dreamfeed' && sleeper) return 'devour';
      if (m === 'lull' && !canLull) return e.form ? 'ravage' : 'maw';
      return m;
    },
    visual: { tint: 0x1a1030, glow: 0xb070ff, scale: 1.6, fx: ['float', 'flicker'] },
    forms: [{ name: '깨어난 악몽', icon: 'gi:dread-skull', visual: { tint: 0x300a20, glow: 0xff3080, scale: 1.7, fx: ['flicker'] } }],
  },
  {
    id: 'dream-hunter',
    name: '꿈 사냥꾼',
    icon: 'gi:hooded-assassin',
    act: 5,
    tier: 'elite',
    hp: [400, 415],
    poise: 10,
    weak: ['fire', 'arcane'],
    row: 0,
    dread: 7,
    eldritch: true,
    tags: ['dream', 'hunter'],
    traits: ['a5-dream-catcher'],
    desc: '깨어 있는 채로 꿈속을 걷는 자를 쫓는 사냥꾼. 붙잡은 꿈들을 등불처럼 허리에 매달고 다닌다. 그중 몇 개는 당신의 것이다.',
    onSpawn: (c, e) => {
      if (c.s.vars.a5Illu) return;
      e.st['a5-dreams'] = 2;
    },
    moves: {
      net: mv.debuff(
        '꿈 그물',
        (c, e) => {
          c.apply(c.p, 'a5-snare', 1, e);
          c.apply(c.p, 'frail', 1, e);
        },
        { desc: '그물: 다음 턴 행동력 -1, 허약 1' },
      ),
      spear: mv.attack('사냥 창', 12, { hits: 2, type: 'pierce' }),
      horn: mv.horror('사냥 나팔', 12, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '정신 피해, 공포 1' }),
      catch: mv.horror('꿈 붙잡기', 8, { then: catchDream, desc: `정신 피해, 붙잡은 꿈 +1 (최대 ${MAX_DREAMS})` }),
      aim: mv.charge('사냥감을 겨눈다', 46),
      skewer: release(mv.attack('꿈 꿰뚫기', 46, { type: 'pierce' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'skewer';
      const o = opener(c, e, ['net']);
      if (o) return o;
      return cycle(e, ['spear', 'catch', 'aim', 'horn', 'spear', 'net']);
    },
    visual: { tint: 0x1c1a2a, glow: 0x9ff0d0, scale: 1.35, fx: ['flicker'] },
  },
  {
    id: 'liminal',
    name: '문턱의 존재',
    icon: 'gi:magic-portal',
    act: 5,
    tier: 'elite',
    hp: [400, 415],
    poise: 10,
    weak: ['arcane', 'blunt'],
    row: 0,
    dread: 6,
    eldritch: true,
    tags: ['dream', 'rift'],
    traits: ['a5-liminal'],
    desc: '꿈과 현실 사이의 틈에 끼어 사는 것. 한쪽 세계의 무기로는 결코 끝까지 베어 낼 수 없다.',
    onSpawn: (_c, e) => {
      e.st['a5-phase-real'] = 1;
    },
    moves: {
      grasp: mv.attack('현실의 손아귀', 21),
      rake: mv.attack('양쪽에서 할퀴기', 8, { hits: 2, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 2, e), desc: '출혈 2' }),
      whisper: mv.horror('문턱 너머의 속삭임', 12, { then: (c, e) => void c.apply(c.p, 'dread', 2, e), desc: '정신 피해, 공포 2' }),
      dreamclaw: mv.attack('꿈의 발톱', 16, { melee: false, type: 'void', then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '약화 1' }),
      gather: mv.charge('두 세계를 끌어모은다', 44),
      sunder: release(mv.attack('경계 붕괴', 44, { melee: false, type: 'void' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'sunder';
      if (cycle(e, ['a', 'a', 'a', 'a', 'gather']) === 'gather') return 'gather';
      return e.st['a5-phase-dream'] ? pick(c, e, { whisper: 2, dreamclaw: 3 }) : pick(c, e, { grasp: 3, rake: 2 });
    },
    visual: { tint: 0x404050, glow: 0xf0f0ff, scale: 1.3, fx: ['flicker', 'float'] },
  },
]);
