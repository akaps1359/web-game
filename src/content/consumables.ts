import { reg } from '../engine/registry';
import { gainSanityRun, healRun } from '../engine/run';
import { isEnemy } from '../engine/combat';

reg.consumables([
  {
    id: 'bandage',
    name: '구급 붕대',
    icon: 'gi:bandage-roll',
    rarity: 'common',
    desc: '체력 20 회복',
    combat: false,
    target: 'self',
    use(run, c) {
      if (c) c.heal(c.p, 20);
      else healRun(run, 20);
    },
  },
  {
    id: 'laudanum',
    name: '아편 팅크',
    icon: 'gi:medicine-pills',
    rarity: 'common',
    desc: '정신력 20 회복',
    combat: false,
    target: 'self',
    use(run, c) {
      if (c) c.gainSanity(20);
      else gainSanityRun(run, 20);
    },
  },
  {
    id: 'oil-can',
    name: '등유 깡통',
    icon: 'gi:oil-drum',
    rarity: 'common',
    desc: '등불 +35 (던전에서)',
    combat: false,
    target: 'self',
    use(run) {
      run.light = Math.min(100, run.light + 35);
    },
  },
  {
    id: 'molotov',
    name: '화염병',
    icon: 'gi:molotov',
    rarity: 'common',
    desc: '적 전체에 8 화염 피해, 화상 3',
    combat: true,
    target: 'all',
    use(_run, c) {
      if (!c) return;
      for (const e of [...c.alive]) {
        c.damage({ src: c.p, tgt: e, base: 8, type: 'fire', attack: true });
        if (!e.dead) c.apply(e, 'burn', 3, c.p);
      }
    },
  },
  {
    id: 'smelling-salts',
    name: '각성제',
    icon: 'gi:round-bottom-flask',
    rarity: 'uncommon',
    desc: '이번 턴 행동력 +2',
    combat: true,
    target: 'self',
    use(_run, c) {
      if (c) c.s.ap += 2;
    },
  },
  {
    id: 'holy-water',
    name: '성수',
    icon: 'gi:holy-water',
    rarity: 'common',
    desc: '결계 2, 정신력 5 회복',
    combat: true,
    target: 'self',
    use(_run, c) {
      if (!c) return;
      c.apply(c.p, 'ward', 2, c.p);
      c.gainSanity(5);
    },
  },
  {
    id: 'throwing-knives',
    name: '투척용 칼',
    icon: 'gi:thrown-daggers',
    rarity: 'common',
    desc: '무작위 적에게 4 참격 피해 4회',
    combat: true,
    target: 'all',
    use(_run, c) {
      if (!c) return;
      for (let i = 0; i < 4; i++) {
        if (!c.alive.length) break;
        c.damage({ src: c.p, tgt: c.rng.pick(c.alive), base: 4, type: 'slash', attack: true });
      }
    },
  },
  {
    id: 'flash-powder',
    name: '섬광 가루',
    icon: 'gi:sparkles',
    rarity: 'common',
    desc: '적 전체 약화 2',
    combat: true,
    target: 'all',
    use(_run, c) {
      if (c) for (const e of c.alive) c.apply(e, 'weak', 2, c.p);
    },
  },
  {
    id: 'acid-flask',
    name: '산성 플라스크',
    icon: 'gi:acid',
    rarity: 'uncommon',
    desc: '대상에게 부식 3, 독 6',
    combat: true,
    target: 'single',
    use(_run, c, t) {
      if (!c || !isEnemy(t)) return;
      c.apply(t, 'corrode', 3, c.p);
      c.apply(t, 'poison', 6, c.p);
    },
  },
  {
    id: 'elixir',
    name: '붉은 영약',
    icon: 'gi:heart-bottle',
    rarity: 'rare',
    desc: '체력 40% 회복, 해로운 효과 제거',
    combat: false,
    target: 'self',
    use(run, c) {
      const n = Math.floor(run.player.maxHp * 0.4);
      if (c) {
        c.heal(c.p, n);
        for (const id of ['weak', 'vuln', 'frail', 'bleed', 'poison', 'burn', 'dread', 'silence']) c.clear(c.p, id);
      } else healRun(run, n);
    },
  },
  {
    id: 'smoke-bomb',
    name: '연막탄',
    icon: 'gi:smoke-bomb',
    rarity: 'common',
    desc: '방어도 15',
    combat: true,
    target: 'self',
    use(_run, c) {
      if (c) c.gainBlock(c.p, 15);
    },
  },
  {
    id: 'strange-idol',
    name: '기묘한 우상',
    icon: 'gi:totem-head',
    rarity: 'uncommon',
    desc: '통찰 +1, 적 전체 광란 2. 정신력 -6',
    combat: true,
    target: 'all',
    use(_run, c) {
      if (!c) return;
      c.loseSanity(6);
      c.gainInsight(1);
      for (const e of c.alive) c.apply(e, 'madden', 2, c.p);
    },
  },
  {
    id: 'dynamite',
    name: '다이너마이트',
    icon: 'gi:dynamite',
    rarity: 'uncommon',
    desc: '전열에 18 타격 피해 (버팀 -2)',
    combat: true,
    target: 'all',
    use(_run, c) {
      if (!c) return;
      const front = c.row(0).length ? c.row(0) : c.row(1);
      for (const e of [...front]) c.damage({ src: c.p, tgt: e, base: 18, type: 'blunt', attack: true, poise: 2 });
    },
  },
]);
