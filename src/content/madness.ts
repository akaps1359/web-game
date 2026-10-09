import { reg } from '../engine/registry';
import { cycleNote } from './lib';

/** 정신력 붕괴로 얻는 광기(단점)와 각성(장점) */
reg.madness([
  {
    id: 'paranoia',
    name: '편집증',
    icon: 'gi:paranoia',
    desc: '전투 시작 시 공포 2',
    hooks: {
      onCombatStart(c) {
        c.apply(c.p, 'dread', 2);
      },
    },
  },
  {
    id: 'hemophobia',
    name: '혈액공포증',
    icon: 'gi:blood',
    desc: '출혈 상태로 턴을 시작하면 정신력 -3',
    hooks: {
      // 출혈은 턴 시작 처리(onTurnStart 이전)에 피해를 주고 1 줄어들므로, 출혈 1이면 onTurnStart에서는 이미 사라져 있다.
      // 그래서 "턴 시작 시 출혈 피해를 받았다"를 기준으로 한다.
      onDamageTaken(c, _s, d) {
        if (d.tgt === c.p && d.tags.includes('bleed') && d.tags.includes('dot')) c.loseSanity(3);
      },
    },
  },
  {
    id: 'masochism',
    name: '자기혐오',
    icon: 'gi:broken-heart',
    desc: '체력이 50% 미만이면 얻는 방어도 -40%',
    hooks: {
      modBlock(c, _s, b) {
        if (b.unit === c.p && c.p.hp < c.p.maxHp / 2) b.amount *= 0.6;
      },
    },
  },
  {
    id: 'nyctophobia',
    name: '암흑공포증',
    icon: 'gi:night-sleep',
    desc: '전투 시작 시 등불이 50 미만이면 정신력 -4',
    hooks: {
      onCombatStart(c) {
        if (c.run.light < 50) c.loseSanity(4);
      },
    },
  },
  {
    id: 'tremor',
    name: '손떨림',
    icon: 'gi:shaking-hands',
    desc: '매 턴 첫 공격 피해 -3 (여러 번 때리는 공격은 첫 타격만)',
    hooks: {
      onTurnStart(_c, s) {
        s.unit.st._tremor = 1;
      },
      modDamageOut(_c, s, d) {
        if (d.attack && s.unit.st._tremor) d.add -= 3;
      },
      onDamageDealt(_c, s, d) {
        if (d.attack) delete s.unit.st._tremor;
      },
    },
  },
  {
    id: 'hallucination',
    name: '환각',
    icon: 'gi:psychic-waves',
    desc: '전투 시작 시 무작위 장착 스킬 1개의 재사용 대기 2',
    hooks: {
      onCombatStart(c) {
        const slots = c.run.slots.filter(Boolean) as string[];
        if (slots.length) c.s.cd[c.rng.pick(slots)] = 3;
      },
    },
  },
  {
    id: 'insomnia',
    name: '불면증',
    icon: 'gi:sleepy',
    desc: '야영지 수면 회복량 절반',
  },
  {
    id: 'craving',
    name: '갈증',
    icon: 'gi:dripping-goo',
    desc: '전투가 끝날 때마다 체력 -3',
    hooks: {
      onCombatEnd(c) {
        c.p.hp = Math.max(1, c.p.hp - 3);
      },
    },
  },
  {
    id: 'voices',
    name: '환청',
    icon: 'gi:screaming',
    desc: '3의 배수 턴마다 정신력 -3',
    hooks: {
      turnNote: (c) => cycleNote(c, { n: 3, on: 0, icon: 'gi:screaming', title: '환청', what: '3의 배수 턴이 시작될 때 정신력 -3', bad: true }),
      onTurnStart(c) {
        if (c.s.turn % 3 === 0) c.loseSanity(3);
      },
    },
  },
  {
    id: 'fragile-mind',
    name: '깨진 정신',
    icon: 'gi:cracked-glass',
    desc: '받는 정신 피해 +20%',
    hooks: { modSanityLoss: (_c, _s, n) => n * 1.2 },
  },

  // ── 각성 ──
  {
    id: 'clarity',
    name: '각성: 명징',
    icon: 'gi:third-eye',
    virtue: true,
    desc: '받는 정신 피해 -25%',
    hooks: { modSanityLoss: (_c, _s, n) => n * 0.75 },
  },
  {
    id: 'fury',
    name: '각성: 분노',
    icon: 'gi:enrage',
    virtue: true,
    desc: '체력이 50% 미만이면 주는 피해 +25%',
    hooks: {
      modDamageOut(c, _s, d) {
        if (d.src === c.p && c.p.hp < c.p.maxHp / 2) d.mult *= 1.25;
      },
    },
  },
  {
    id: 'stoic',
    name: '각성: 초연',
    icon: 'gi:meditation',
    virtue: true,
    desc: '턴 시작 시 방어도 3',
    hooks: {
      onTurnStart(c) {
        c.gainBlock(c.p, 3);
      },
    },
  },
  {
    id: 'revelation',
    name: '각성: 계시',
    icon: 'gi:all-seeing-eye',
    virtue: true,
    // 2026-10 2차: +2 → +1 (붕괴가 잦아져 각성도 자주 나온다)
    desc: '통찰 +1',
    onGain(run) {
      run.player.insight += 1;
    },
  },
]);
