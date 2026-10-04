import { reg, SKILLS } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import { cycle, hpPct, last, opener, pick } from '../../engine/ai';
import type { DmgType, EnemyUnit, MoveDef } from '../../engine/types';
import { countDef, mv, others, release } from '../moves';
import {
  absorbBlobs,
  hid,
  isAsleep,
  isIllusion,
  realAlive,
  shuffleGroup,
  spawnIllusion,
  stealInsight,
  stealLight,
  swapRows,
  vanish,
  wake,
} from './dream';

/** 토성의 고양이: 목숨을 버릴 때마다 약점이 바뀐다 */
const SATURN_WEAK: DmgType[][] = [
  ['blunt', 'void'],
  ['fire', 'pierce'],
  ['slash', 'arcane'],
];

// ───────────── 특성 ─────────────

reg.traits([
  {
    id: 'a3-nine-lives',
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
        if (e.st['a3-lives']) c.apply(e, 'a3-lives', -1);
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
    id: 'a3-lamp-eater',
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
    id: 'a3-sleeper',
    name: '잠든 자',
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
    id: 'a3-pilgrim',
    name: '순례자',
    desc: '행동할 때마다 꿈의 문에 한 걸음 다가간다. 다 걸으면 사라지고(보상 없음) 남은 동료를 축복한다',
    hooks: {},
  },
  {
    id: 'a3-illusionist',
    name: '환영술',
    desc: '환영을 만든다. 환영은 공격받으면 흩어지고, 실제 피해 대신 정신을 흔들며, 처치 보상이 없다. 통찰 4 이상이면 환영을 꿰뚫어 본다',
    hooks: {},
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
          c.spawn('shoggoth-blob', 0);
          c.spawn('shoggoth-blob', 0);
        }
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
    id: 'a3-dream-glutton',
    name: '꿈의 포식자',
    desc: '잠든 자를 삼켜 회복하고 강해진다. 체력이 절반 아래로 떨어지면 깨어난 악몽이 되어 매 턴 힘이 오른다',
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
    id: 'a3-burrower',
    name: '땅굴 벌레',
    desc: '땅속으로 파고들면 회피 2를 얻고, 땅속에서의 움직임은 읽을 수 없다',
    hooks: {},
  },
  {
    id: 'a3-liminal',
    name: '문턱',
    desc: '자기 턴이 끝날 때마다 현실과 꿈 사이를 오간다. 현실에선 화염·비전·공허 피해를, 꿈에선 참격·관통·타격 피해를 60% 덜 받는다',
    hooks: {
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead) return;
        if (e.st['a3-phase-dream']) {
          c.clear(e, 'a3-phase-dream');
          c.apply(e, 'a3-phase-real', 1, e);
          c.emit({ t: 'text', uid: e.uid, text: '현실로 넘어왔다', tone: 'info' });
        } else {
          c.clear(e, 'a3-phase-real');
          c.apply(e, 'a3-phase-dream', 1, e);
          c.emit({ t: 'text', uid: e.uid, text: '꿈속으로 가라앉았다', tone: 'eldritch' });
        }
      },
    },
  },
]);

// ───────────── 행동 헬퍼 ─────────────

/** 장막 직조자가 베낄 수 있는 존재 */
const COPYABLE = ['nightgaunt', 'tindalos', 'gug', 'moonbeast', 'migo', 'sleepwalker', 'veil-weaver'];

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
  c.spawn('sleepwalker', 0);
  c.apply(e, 'str', 2, e);
}

function feedOnDreams(c: Combat, e: EnemyUnit) {
  const n = c.horror(e, 10);
  if (!e.dead && n > 0 && !c.over) c.heal(e, n * 2);
}

function devour(c: Combat, e: EnemyUnit) {
  const s = c.alive.find((x) => x !== e && isAsleep(x) && !isIllusion(x));
  if (!s) return feedOnDreams(c, e);
  vanish(c, s, '꿈째로 삼켜졌다');
  c.heal(e, 25);
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
  if (e.st['a3-pilgrimage']) c.apply(e, 'a3-pilgrimage', -1);
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
    c.loseHp(slave, 4);
    if (!slave.dead) c.apply(slave, 'str', 3, e);
  } else c.apply(e, 'str', 2, e);
}

const corrode = (c: Combat, e: EnemyUnit, cap = 3) => {
  if ((c.p.st.corrode ?? 0) < cap) c.apply(c.p, 'corrode', 1, e);
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
    tags: ['dream', 'gaunt'],
    traits: ['a3-faceless'],
    desc: '얼굴이 없는 검은 날개. 소리 없이 내려와 간지럼을 태우고, 낚아채 어둠 속으로 날아간다.',
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
    tags: ['dream', 'yuggoth'],
    traits: ['a3-brain-thief'],
    desc: '갑각과 균사로 된 날개 달린 것. 윙윙거리는 목소리로 말하며, 뇌를 원통에 담아 별 너머로 가져간다.',
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
    tags: ['dream', 'angle'],
    traits: ['a3-angles'],
    desc: '굽은 시간 속에 사는 굶주린 것. 120도보다 날카로운 모서리라면 어디서든 튀어나온다.',
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
    tags: ['dream', 'shoggoth'],
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
        desc: '원형질 조각을 삼켜 조각마다 체력 10 회복, 힘 +1',
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
    tags: ['dream', 'shoggoth'],
    moves: {
      slap: mv.attack('철썩', 5),
      cling: mv.attack('들러붙기', 3, { then: (c, e) => void c.apply(c.p, 'frail', 1, e), desc: '허약 1' }),
    },
    ai: (_c, e) => cycle(e, ['slap', 'cling']),
    visual: { tint: 0x1a3022, glow: 0x60ff90, scale: 0.6, fx: ['drip'] },
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
    tags: ['dream', 'leng'],
    desc: '렝 고원의 보랏빛 거미. 꿈과 꿈 사이에 실을 걸고, 걸린 것을 천천히 녹여 먹는다.',
    moves: {
      spit: mv.attack('독액 뱉기', 6, { melee: false, type: 'pierce', then: (c, e) => void c.apply(c.p, 'poison', 3, e), desc: '독 3' }),
      web: mv.debuff(
        '꿈실 거미줄',
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
    tags: ['dream', 'leng'],
    moves: { nip: mv.attack('물기', 3, { type: 'pierce', then: (c, e) => void c.apply(c.p, 'poison', 1, e), desc: '독 1' }) },
    ai: () => 'nip',
    visual: { tint: 0x3a2048, glow: 0xb060f0, scale: 0.5 },
  },
  {
    id: 'ash-pilgrim',
    name: '잿빛 순례자',
    icon: 'gi:cowled',
    act: 3,
    tier: 'normal',
    hp: [44, 50],
    poise: 4,
    weak: ['pierce', 'void'],
    resist: { fire: 0.5 },
    row: 1,
    dread: 3,
    eldritch: true,
    tags: ['dream', 'pilgrim'],
    traits: ['a3-pilgrim'],
    desc: '꿈의 문을 향해 걷는 자들. 걸음마다 몸이 재로 부서지지만, 멈추는 법이 없다.',
    onSpawn: (c, e) => {
      if (c.s.vars.a3Illu) return;
      e.mem.steps = 5;
      e.st['a3-pilgrimage'] = 5;
    },
    moves: {
      chant: walk(mv.horror('잿빛 찬송', 8)),
      bless: walk(
        mv.buff(
          '재의 축복',
          (c, e) => {
            for (const a of c.alive) if (!isIllusion(a)) c.apply(a, 'barrier', 5, e);
          },
          { desc: '모든 아군 보호막 5' },
        ),
      ),
      penance: walk(
        mv.buff(
          '고행',
          (c, e) => {
            c.loseHp(e, 5);
            if (e.dead) return;
            for (const a of others(c, e)) c.apply(a, 'str', 1, e);
          },
          { desc: '체력 5를 바쳐 다른 아군 힘 +1' },
        ),
      ),
      ember: walk(mv.attack('잿불 던지기', 7, { melee: false, type: 'fire' })),
      depart: {
        name: '꿈의 문으로',
        intent: 'flee',
        desc: '꿈의 문 너머로 사라진다 (보상 없음). 남은 아군 힘 +2, 체력 10 회복',
        run(c, e) {
          for (const a of others(c, e)) {
            if (isIllusion(a)) continue;
            c.apply(a, 'str', 2, e);
            c.heal(a, 10);
          }
          vanish(c, e, '꿈의 문 너머로 걸어 들어갔다');
        },
      },
    },
    ai: (c, e) => {
      if (!isIllusion(e) && (e.mem.steps ?? 5) <= 0) return 'depart';
      const allies = others(c, e).length;
      return pick(c, e, { chant: 2, bless: allies ? 2 : 1, penance: allies && e.hp > 12 ? 1 : 0, ember: 2 });
    },
    visual: { tint: 0x6a6660, glow: 0xffa060, fx: ['flicker'] },
  },
  {
    id: 'moonbeast',
    name: '달짐승',
    icon: 'gi:toad-teeth',
    act: 3,
    tier: 'normal',
    hp: [58, 64],
    poise: 5,
    weak: ['slash', 'arcane'],
    resist: { blunt: 0.75 },
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['dream', 'moon'],
    desc: '눈 없는 두꺼비 같은 회백색 몸뚱이, 주둥이 끝에서 분홍빛 촉수가 꿈틀댄다. 노예를 부리고 고문을 즐긴다.',
    moves: {
      snout: mv.attack('촉수 주둥이', 4, { hits: 3 }),
      hook: mv.attack('고문 갈고리', 8, { type: 'pierce', then: (c, e) => void c.apply(c.p, 'bleed', 3, e), desc: '출혈 3' }),
      whip: mv.buff('채찍질', whip, { desc: '렝의 노예에게 피해 4를 주고 노예 힘 +3 (노예가 없으면 자신 힘 +2)' }),
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
    id: 'leng-slave',
    name: '렝의 노예',
    icon: 'gi:prisoner',
    act: 3,
    tier: 'minion',
    hp: [18, 22],
    poise: 0,
    weak: ['slash', 'pierce', 'fire'],
    row: 0,
    tags: ['dream', 'leng'],
    moves: {
      spear: mv.attack('녹슨 창', 6, { type: 'pierce' }),
      horn: mv.attack('뿔 들이받기', 8),
    },
    ai: (c, e) => pick(c, e, { spear: 2, horn: 1 }),
    visual: { tint: 0x5a4a3a, glow: 0xd0a060, scale: 0.8 },
  },
  {
    id: 'zoog',
    name: '주그',
    icon: 'gi:flying-fox',
    act: 3,
    tier: 'normal',
    hp: [32, 36],
    poise: 4,
    weak: ['fire', 'blunt', 'slash'],
    row: 0,
    dread: 2,
    eldritch: true,
    tags: ['dream', 'zoog'],
    traits: ['a3-lamp-eater'],
    desc: '마법의 숲에 사는 작고 갈색 털 난 것들. 파닥이는 소리로 속삭이며, 호기심이 많고 무엇이든 갉아먹는다.',
    moves: {
      nibble: mv.attack('등불 갉아먹기', 3, { hits: 2, type: 'slash', then: (c, e) => stealLight(c, e, 5), desc: '등불 5를 갉아먹는다' }),
      chitter: mv.horror('파닥이는 속삭임', 5, { then: (c, e) => void c.apply(e, 'evasive', 1, e), desc: '정신 피해, 자신에게 회피 1' }),
      swarm: mv.attack('떼 지어 물기', 2, { hits: (c) => 1 + countDef(c, 'zoog'), type: 'slash', desc: '주그 수만큼 더 문다' }),
    },
    ai: (c, e) => pick(c, e, { nibble: c.run.light > 0 ? 3 : 0, chitter: 2, swarm: countDef(c, 'zoog') > 1 ? 2 : 1 }),
    visual: { tint: 0x5a4630, glow: 0xffe070, scale: 0.7 },
  },
  {
    id: 'gug',
    name: '구그',
    icon: 'gi:troll',
    act: 3,
    tier: 'normal',
    hp: [68, 74],
    poise: 6,
    weak: ['pierce', 'fire'],
    resist: { slash: 0.75 },
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['dream', 'giant'],
    desc: '저주받아 지하로 쫓겨난 거인. 팔목마다 두 개씩 갈라진 앞발, 머리를 세로로 가르는 아가리.',
    moves: {
      paws: mv.attack('네 개의 앞발', 4, { hits: 3 }),
      stomp: mv.attack('짓밟기', 11, { then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '약화 1' }),
      gape: mv.charge('세로 아가리를 벌린다', 26),
      maw: release(mv.attack('세로 아가리', 26)),
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
    act: 3,
    tier: 'normal',
    hp: [48, 54],
    poise: 4,
    weak: ['slash', 'void'],
    row: 0,
    dread: 2,
    tags: ['dream', 'sleeper'],
    traits: ['a3-sleeper'],
    desc: '꿈의 경계를 헤매다 돌아가는 길을 잃은 사람들. 깨우지 않는 편이 낫다.',
    onSpawn: (c, e) => {
      if (c.s.vars.a3Illu) return;
      e.mem.asleep = 3;
      e.st['a3-asleep'] = 3;
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
          } else if (e.st['a3-asleep']) c.apply(e, 'a3-asleep', -1);
        },
      },
      flail: mv.attack('허우적거림', 4, { hits: 3 }),
      claw: mv.attack('잠결의 손톱', 10, { type: 'slash' }),
      scream: mv.horror('악몽의 비명', 8, { then: (c, e) => void c.apply(c.p, 'dread', 2, e), desc: '정신 피해, 공포 2' }),
    },
    ai: (c, e) => (isAsleep(e) ? 'doze' : pick(c, e, { flail: 2, claw: 3, scream: 2 })),
    visual: { tint: 0x8a8aa0, glow: 0xc0d0ff },
  },
  {
    id: 'veil-weaver',
    name: '장막 직조자',
    icon: 'gi:duality-mask',
    act: 3,
    tier: 'normal',
    hp: [44, 50],
    poise: 4,
    weak: ['pierce', 'void'],
    row: 1,
    dread: 4,
    eldritch: true,
    tags: ['dream', 'illusion'],
    traits: ['a3-illusionist'],
    desc: '가면 뒤에 얼굴이 몇 개인지 아무도 모른다. 꿈의 실로 동료의 그림자를 짜낸다.',
    moves: {
      weave: mv.summon('환영 짜기', weaveIllusion, '아군 하나의 환영을 만든다'),
      needle: mv.attack('꿈바늘', 8, { melee: false, type: 'pierce' }),
      lull: mv.horror('자장가', 8, { then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '정신 피해, 약화 1' }),
    },
    ai: (c, e) => {
      if (e.mem.illu) return pick(c, e, { needle: 2, lull: 1 });
      const illus = c.alive.filter(isIllusion).length;
      return opener(c, e, ['weave']) ?? pick(c, e, { weave: illus < 2 && last(e) !== 'weave' ? 2 : 0, needle: 3, lull: 2 });
    },
    visual: { tint: 0x3a3050, glow: 0xe0b0ff, fx: ['flicker', 'float'] },
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
    tags: ['dream', 'leng'],
    desc: '렝의 골짜기를 메운 거미들의 어미. 꿈꾸는 자를 고치로 감아 영영 깨지 못하게 한다.',
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
      crouch: mv.charge('도약 준비', 32),
      leap: release(mv.attack('짓누르는 도약', 32)),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'leap';
      const m = cycle(e, ['spray', 'fangs', 'cocoon', 'fangs', 'brood', 'crouch']);
      if (m === 'brood' && (countDef(c, 'leng-spiderling') >= 3 || (e.mem.brood ?? 0) >= 6)) return 'fangs';
      return m;
    },
    visual: { tint: 0x40204a, glow: 0xd060ff, scale: 1.35 },
  },
  {
    id: 'saturn-cat',
    name: '토성의 고양이',
    icon: 'gi:hollow-cat',
    act: 3,
    tier: 'elite',
    hp: [128, 134],
    poise: 7,
    weak: [...SATURN_WEAK[0]],
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['dream', 'saturn'],
    traits: ['a3-nine-lives'],
    desc: '달의 뒷면에서 달짐승과 손잡은, 토성에서 온 기묘한 고양이. 지구의 고양이들과는 오랜 원수이며 좀처럼 죽지 않는다.',
    onSpawn: (c, e) => {
      if (c.s.vars.a3Illu) return;
      e.mem.lives = 2;
      e.st['a3-lives'] = 2;
    },
    moves: {
      rake: mv.attack('고리 발톱', 6, { hits: 2, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 2, e), desc: '출혈 2' }),
      grin: mv.horror('토성의 미소', 10, { then: (c, e) => void c.apply(c.p, 'dread', 2, e), desc: '정신 피해, 공포 2' }),
      pounce: mv.attack('뒤틀린 도약', 13, { melee: false }),
      coil: mv.block('고리 속으로 몸을 말다', 12, { then: (c, e) => void c.apply(e, 'evasive', 1, e), desc: '방어도 12, 회피 1' }),
      stalk: mv.charge('사냥 자세', 30),
      leap: release(mv.attack('목덜미 물기', 30)),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'leap';
      return cycle(e, ['rake', 'grin', 'pounce', 'coil', 'rake', 'stalk']);
    },
    visual: { tint: 0x2a2440, glow: 0xffd040, scale: 1.2, fx: ['flicker'] },
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
    tags: ['dream', 'flyer'],
    desc: '말처럼 생긴 머리에 비늘 덮인 날개. 미지의 카다스로 가는 길을 지키며, 밤의 마귀를 몹시 두려워한다.',
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
      dive: release(mv.attack('급강하', 34, { melee: false })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'dive';
      return cycle(e, ['peck', 'buffet', 'snatch', 'screech', 'soar']);
    },
    visual: { tint: 0x3a4038, glow: 0x90ffb0, scale: 1.35, fx: ['float'] },
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
    tags: ['dream', 'shoggoth'],
    traits: ['a3-protoplasm', 'a3-regrow'],
    desc: '옛것들이 부리던 원형질의 노예. 주인들의 피리 소리를 흉내 내며, 무엇이든 될 수 있고 무엇이든 삼킨다.',
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
        desc: '원형질 조각을 모두 삼켜 조각마다 체력 12 회복, 힘 +1',
        run: (c, e) => absorbBlobs(c, e, 12, 6),
      },
      surge: mv.charge('원형질이 부풀어 오른다', 36),
      tide: release(mv.attack('원형질 해일', 36)),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'tide';
      const blobs = countDef(c, 'shoggoth-blob');
      if (blobs >= 2 && last(e) !== 'absorb') return 'absorb';
      return cycle(e, ['pseudopods', 'eyes', 'crush', 'mimic', 'surge']);
    },
    visual: { tint: 0x10261a, glow: 0x50ff90, scale: 1.55, fx: ['drip'] },
  },
  {
    id: 'dream-gatekeeper',
    name: '꿈의 문지기',
    icon: 'gi:door-watcher',
    act: 3,
    tier: 'boss',
    hp: [340, 340],
    poise: 12,
    weak: ['void', 'pierce'],
    row: 0,
    dread: 6,
    eldritch: true,
    tags: ['dream', 'gate'],
    traits: ['a3-illusionist'],
    desc: '얕은 잠의 일흔 계단 끝, 깊은 잠의 문을 지키는 자. 문 앞에서는 무엇이 진짜인지 그가 정한다.',
    moves: {
      staff: mv.attack('문지기의 지팡이', 15, { melee: false, type: 'arcane' }),
      mirror: mv.summon('거울의 문', mirrorSelf, '자신의 환영 2개를 만들고 자리를 뒤섞는다'),
      riddle: hid(mv.horror('문의 수수께끼', 10, { then: (c, e) => void c.apply(c.p, 'dread', 2, e), desc: '정신 피해, 공포 2' })),
      steps: mv.debuff(
        '얕은 잠의 일흔 계단',
        (c, e) => {
          c.apply(c.p, 'weak', 1, e);
          c.apply(c.p, 'frail', 2, e);
        },
        { desc: '약화 1, 허약 2' },
      ),
      seal: mv.charge('문의 봉인', 34),
      judgment: release(mv.attack('문지기의 심판', 34, { melee: false, type: 'void' })),
      open: mv.summon('깊은 잠의 문', openGate, '잠든 몽유병자 둘을 불러들이고 힘 +2'),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'judgment';
      if (e.mem.illu) return pick(c, e, { staff: 3, riddle: 2, steps: 1 });
      if (hpPct(e) <= 0.5 && !e.mem.opened) return 'open';
      const first = opener(c, e, ['steps']);
      if (first) return first;
      if (c.alive.filter(isIllusion).length === 0 && !e.hist.includes('mirror')) return 'mirror';
      return cycle(e, ['staff', 'riddle', 'staff', 'steps', 'seal']);
    },
    visual: { tint: 0x4a4060, glow: 0xffe0a0, scale: 1.45, fx: ['float'] },
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
    tags: ['dream', 'angle'],
    traits: ['a3-angles'],
    desc: '모든 각도의 주인. 시간이 굽어지기 전부터 굶주려 왔고, 모서리마다 새끼를 풀어 둔다.',
    moves: {
      fang: mv.attack('시간의 송곳니', 16, { type: 'slash', then: (c, e) => corrode(c, e, 2), desc: '부식 1 (최대 2)' }),
      whelp: mv.summon(
        '모서리의 새끼들',
        (c, e) => {
          e.mem.whelps = (e.mem.whelps ?? 0) + 2;
          c.spawn('angle-whelp', 0);
          c.spawn('angle-whelp', 0);
        },
        '모서리의 새끼 2마리 소환',
      ),
      twist: {
        name: '각도 비틀기',
        intent: 'special',
        desc: '적의 전열과 후열을 뒤바꾼다. 방어도 12, 상대에게 약화 1',
        run(c, e) {
          swapRows(c);
          c.gainBlock(e, 12);
          c.apply(c.p, 'weak', 1, e);
        },
      },
      gnaw: mv.attack('시간 갉아먹기', 8, { melee: false, type: 'void', then: (c, e) => void c.apply(c.p, 'a3-timeworn', 1, e), desc: '다음 턴 행동력 -1' }),
      howl: mv.horror('시간 너머의 울부짖음', 11),
      corners: mv.charge('무한한 모서리', 12, { hits: 3 }),
      rend: release(mv.attack('모든 각도에서', 12, { hits: 3, melee: false, type: 'slash' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'rend';
      const canWhelp = countDef(c, 'angle-whelp') === 0 && (e.mem.whelps ?? 0) < 4 && last(e) !== 'whelp';
      const recentRend = e.hist.slice(-3).includes('rend');
      if (e.row === 1) return pick(c, e, { gnaw: 3, howl: 2, whelp: canWhelp ? 3 : 0, twist: 2, corners: recentRend ? 0 : 1 });
      return (
        opener(c, e, ['howl']) ??
        pick(c, e, { fang: 3, gnaw: last(e) === 'gnaw' ? 0 : 2, twist: c.row(1).length ? 2 : 0, whelp: canWhelp ? 2 : 0, corners: recentRend ? 0 : 1 })
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
    tags: ['dream', 'angle'],
    moves: {
      snap: mv.attack('물어뜯기', 5, { type: 'slash' }),
      lunge: mv.attack('모서리에서 튀어나오기', 3, { hits: 2, melee: false, type: 'slash' }),
    },
    ai: (_c, e) => (e.row === 0 ? 'snap' : 'lunge'),
    visual: { tint: 0x223048, glow: 0x50a0ff, scale: 0.65, fx: ['flicker'] },
  },

  // ───────────── 계층군주 / 추적자 / 균열 수호자 ─────────────
  {
    id: 'dream-eater',
    name: '꿈을 먹는 자',
    icon: 'gi:evil-moon',
    act: 3,
    tier: 'boss',
    hp: [440, 440],
    poise: 13,
    weak: ['fire', 'slash'],
    resist: { void: 0.5 },
    row: 0,
    dread: 8,
    eldritch: true,
    tags: ['dream', 'lord'],
    traits: ['a3-dream-glutton'],
    desc: '꿈의 경계에서 잠든 자들의 꿈을 갉아먹고 자라는 것. 이 층에서 잠드는 자는 모두 그것의 식탁에 오른다.',
    moves: {
      maw: mv.attack('꿈의 아가리', 18),
      ravage: hid(mv.attack('악몽의 난도질', 6, { hits: 3, type: 'slash' })),
      devour: {
        name: '꿈 삼키기',
        intent: 'heal',
        desc: '잠든 자를 통째로 삼켜 체력 25 회복, 힘 +1 (잠든 자가 없으면 꿈 갉아먹기)',
        run: devour,
      },
      dreamfeed: {
        name: '꿈 갉아먹기',
        intent: 'horror',
        sanity: 10,
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
      conceive: mv.charge('악몽 잉태', 40),
      nightfall: release(mv.attack('악몽 강림', 40, { melee: false, type: 'void' })),
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
    tags: ['dream', 'worm'],
    traits: ['a3-burrower'],
    desc: '프나스 골짜기의 뼈 무덤 속을 미끄러지는 거대한 벌레. 아무도 그 전체 모습을 본 적이 없다.',
    moves: {
      slime: mv.attack('점액 분사', 9, { melee: false, then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '약화 1' }),
      engulf: mv.attack('통째로 삼키기', 15, { then: (c, e) => void c.heal(e, 10), desc: '체력 10 회복' }),
      grind: mv.horror('뼈 무덤의 울림', 9),
      burrow: {
        name: '땅속으로',
        intent: 'block',
        desc: '회피 2, 방어도 10. 땅속에서 움직인다',
        run(c, e) {
          e.mem.under = 1;
          c.apply(e, 'evasive', 2, e);
          c.gainBlock(e, 10);
        },
      },
      tremor: hid(mv.attack('땅울림', 5, { hits: 2, melee: false, then: (c, e) => void c.apply(c.p, 'frail', 1, e), desc: '허약 1' })),
      rise: mv.charge('땅이 부풀어 오른다', 34),
      erupt: release(
        mv.attack('분출', 34, {
          melee: false,
          then: (_c, e) => {
            e.mem.under = 0;
          },
        }),
      ),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'erupt';
      if (e.mem.under) return last(e) === 'tremor' ? 'rise' : 'tremor';
      return cycle(e, ['slime', 'engulf', 'grind', 'burrow']);
    },
    visual: { tint: 0x5a5040, glow: 0xa0ff60, scale: 1.4, fx: ['drip'] },
  },
  {
    id: 'liminal',
    name: '문턱의 존재',
    icon: 'gi:magic-portal',
    act: 3,
    tier: 'elite',
    hp: [228, 236],
    poise: 9,
    weak: ['arcane', 'blunt'],
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['dream', 'rift'],
    traits: ['a3-liminal'],
    desc: '꿈과 현실 사이의 틈에 끼어 사는 것. 한쪽 세계의 무기로는 결코 끝까지 베어 낼 수 없다.',
    onSpawn: (_c, e) => {
      e.st['a3-phase-real'] = 1;
    },
    moves: {
      grasp: mv.attack('현실의 손아귀', 14),
      rake: mv.attack('양쪽에서 할퀴기', 6, { hits: 2, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 2, e), desc: '출혈 2' }),
      whisper: mv.horror('문턱 너머의 속삭임', 10, { then: (c, e) => void c.apply(c.p, 'dread', 2, e), desc: '정신 피해, 공포 2' }),
      dreamclaw: mv.attack('꿈의 발톱', 11, { melee: false, type: 'void', then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '약화 1' }),
      gather: mv.charge('두 세계를 끌어모은다', 34),
      sunder: release(mv.attack('경계 붕괴', 34, { melee: false, type: 'void' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'sunder';
      if (cycle(e, ['a', 'a', 'a', 'a', 'gather']) === 'gather') return 'gather';
      return e.st['a3-phase-dream'] ? pick(c, e, { whisper: 2, dreamclaw: 3 }) : pick(c, e, { grasp: 3, rake: 2 });
    },
    visual: { tint: 0x404050, glow: 0xf0f0ff, scale: 1.3, fx: ['flicker', 'float'] },
  },
]);
