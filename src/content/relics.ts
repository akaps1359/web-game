import { reg } from '../engine/registry';
import { isEnemy } from '../engine/combat';

/**
 * 넘버스 유물. 번호가 작을수록 희귀.
 * 보스 유물은 강력한 대신 단점이 있다.
 */
reg.relics([
  // ── 일반 ──
  {
    id: 'rusty-compass',
    name: 'No.91 녹슨 나침반',
    icon: 'gi:compass',
    rarity: 'common',
    desc: '층에 들어서면 포탈 비석의 위치를 안다',
  },
  {
    id: 'old-blanket',
    name: 'No.88 낡은 담요',
    icon: 'gi:blanket',
    rarity: 'common',
    desc: '야영지에서 잠들면 체력을 30% 대신 45% 회복',
  },
  {
    id: 'bloody-kerchief',
    name: 'No.77 피 묻은 손수건',
    icon: 'gi:bloody-stash',
    rarity: 'common',
    desc: '전투 시작 시 체력이 50% 이하면 힘 +2',
    hooks: {
      onCombatStart(c) {
        if (c.p.hp <= c.p.maxHp / 2) c.apply(c.p, 'str', 2, c.p);
      },
    },
  },
  {
    id: 'cracked-glasses',
    name: 'No.73 깨진 안경',
    icon: 'gi:spectacles',
    rarity: 'common',
    desc: '전투 시작 시 무작위 적 1명에게 취약 2',
    hooks: {
      onCombatStart(c) {
        const e = c.alive.length ? c.rng.pick(c.alive) : null;
        if (e) c.apply(e, 'vuln', 2, c.p);
      },
    },
  },
  {
    id: 'tin-soldier',
    name: 'No.70 양철 병정',
    icon: 'gi:chess-knight',
    rarity: 'common',
    desc: '매 턴 첫 공격 피해 +3 (여러 번 때리는 공격은 첫 타격만)',
    hooks: {
      onTurnStart(_c, s) {
        if (s.ref) s.ref.n = 1;
      },
      modDamageOut(_c, s, d) {
        if (d.attack && s.ref?.n) d.add += 3;
      },
      onDamageDealt(_c, s, d) {
        if (d.attack && s.ref) s.ref.n = 0;
      },
    },
  },
  {
    id: 'salt-pouch',
    name: 'No.69 소금 주머니',
    icon: 'gi:swap-bag',
    rarity: 'common',
    desc: '전투 첫 턴에 방어도 8',
    hooks: {
      onTurnStart(c) {
        if (c.s.turn === 1) c.gainBlock(c.p, 8);
      },
    },
  },
  {
    id: 'whale-oil',
    name: 'No.66 고래기름 등잔',
    icon: 'gi:magic-lamp',
    rarity: 'common',
    desc: '전투 승리 시 등불 +6',
    hooks: {
      onCombatEnd(c, _s, won) {
        if (won) c.run.light = Math.min(100, c.run.light + 6);
      },
    },
  },
  {
    id: 'sailor-charm',
    name: 'No.64 선원의 부적',
    icon: 'gi:anchor',
    rarity: 'common',
    desc: '전투 중 정신력이 붕괴하면 체력 15 회복',
    hooks: {
      onBreakdown(c) {
        if (c) c.heal(c.p, 15);
      },
    },
  },
  {
    id: 'iron-flask',
    name: 'No.61 철제 수통',
    icon: 'gi:water-flask',
    rarity: 'common',
    desc: '최대 체력 +8',
    onGain(run) {
      run.player.maxHp += 8;
      run.player.hp += 8;
    },
  },
  {
    id: 'membership-coin',
    name: 'No.58 상인 조합 주화',
    icon: 'gi:coins',
    rarity: 'common',
    desc: '상점 물건값 20% 할인',
  },
  {
    id: 'grave-dirt',
    name: 'No.56 무덤 흙',
    icon: 'gi:grave-flowers',
    rarity: 'uncommon',
    desc: '적이 죽을 때마다 방어도 3',
    hooks: {
      onAnyDeath(c, _s, victim) {
        if (isEnemy(victim)) c.gainBlock(c.p, 3);
      },
    },
  },
  {
    id: 'anatomy-notes',
    name: 'No.52 해부학 노트',
    icon: 'gi:notebook',
    rarity: 'common',
    desc: '출혈을 부여할 때 +1',
    hooks: { modApply: (_c, _s, _t, id, n) => (id === 'bleed' ? n + 1 : n) },
  },
  {
    id: 'ritual-candle',
    name: 'No.47 의식용 초',
    icon: 'gi:candle-light',
    rarity: 'common',
    desc: '인장을 부여할 때 +1',
    hooks: { modApply: (_c, _s, _t, id, n) => (id === 'mark' ? n + 1 : n) },
  },
  {
    id: 'drowned-bell',
    name: 'No.45 익사한 종',
    icon: 'gi:ringing-bell',
    rarity: 'uncommon',
    desc: '전투 시작 시 모든 적에게 약화 1',
    hooks: {
      onCombatStart(c) {
        for (const e of c.alive) c.apply(e, 'weak', 1, c.p);
      },
    },
  },
  {
    id: 'witch-salve',
    name: 'No.44 마녀의 연고',
    icon: 'gi:spiral-bottle',
    rarity: 'common',
    desc: '독을 부여할 때 +1',
    hooks: { modApply: (_c, _s, _t, id, n) => (id === 'poison' ? n + 1 : n) },
  },
  {
    id: 'old-bible',
    name: 'No.42 낡은 성서',
    icon: 'gi:book-cover',
    rarity: 'common',
    desc: '전투 시작 시 결계 1 (해로운 효과 1회 무효)',
    hooks: {
      onCombatStart(c) {
        c.apply(c.p, 'ward', 1, c.p);
      },
    },
  },
  {
    id: 'green-fire',
    name: 'No.40 녹색 불꽃 병',
    icon: 'gi:fire-bottle',
    rarity: 'common',
    desc: '화상을 부여할 때 +1',
    hooks: { modApply: (_c, _s, _t, id, n) => (id === 'burn' ? n + 1 : n) },
  },

  // ── 고급 ──
  {
    id: 'black-pearl',
    name: 'No.60 검은 진주',
    icon: 'gi:pearl-necklace',
    rarity: 'uncommon',
    desc: '적을 붕괴시키면 행동력 +1',
    hooks: {
      onBreak(c) {
        c.s.ap += 1;
        c.emit({ t: 'text', uid: 'p', text: '행동력 +1', tone: 'good' });
      },
    },
  },
  {
    id: 'silver-bullets',
    name: 'No.49 은도금 탄환',
    icon: 'gi:bullets',
    rarity: 'uncommon',
    desc: '붕괴된 적에게 관통 피해 +50%',
    hooks: {
      modDamageOut(_c, _s, d) {
        if (d.type === 'pierce' && isEnemy(d.tgt) && d.tgt.broken > 0) d.mult *= 1.5;
      },
    },
  },
  {
    id: 'clockwork-gear',
    name: 'No.37 시계공의 톱니',
    icon: 'gi:gears',
    rarity: 'uncommon',
    desc: '재사용 대기 3턴 이상인 스킬은 1턴 짧아진다',
    hooks: { modCd: (_c, _s, _d, cd) => (cd >= 3 && cd < 99 ? cd - 1 : cd) },
  },
  {
    id: 'deep-scale',
    name: 'No.33 심해의 비늘',
    icon: 'gi:fish-scales',
    rarity: 'uncommon',
    desc: '턴 종료 시 남은 방어도의 절반만큼 보호막',
    hooks: {
      onTurnEnd(c) {
        const n = Math.floor(c.p.block / 2);
        if (n > 0) c.apply(c.p, 'barrier', n, c.p);
      },
    },
  },
  {
    id: 'forbidden-page',
    name: 'No.25 찢긴 금서 페이지',
    icon: 'gi:scroll-unfurled',
    rarity: 'uncommon',
    // 통찰은 언제나 영구 대가를 치르고 얻는다 (2026-10 개편 — 이벤트의 통찰 +1과 같은 값)
    desc: '획득 시 통찰 +1, 최대 정신력 -8',
    onGain(run) {
      run.player.insight += 1;
      run.player.maxSanity = Math.max(10, run.player.maxSanity - 8);
      run.player.sanity = Math.min(run.player.sanity, run.player.maxSanity);
    },
  },
  {
    id: 'rabbit-foot',
    name: 'No.67 토끼발',
    icon: 'gi:rabbit-head',
    rarity: 'uncommon',
    desc: '전투 시작 시 회피 1',
    hooks: {
      onCombatStart(c) {
        c.apply(c.p, 'evasive', 1, c.p);
      },
    },
  },

  // ── 희귀 ──
  {
    id: 'blind-cane',
    name: 'No.31 맹인의 지팡이',
    icon: 'gi:walking-scout',
    rarity: 'rare',
    desc: '등불이 25 미만이면 주는 피해 +25%',
    hooks: {
      modDamageOut(c, _s, d) {
        if (c.run.light < 25) d.mult *= 1.25;
      },
    },
  },
  {
    id: 'blood-contract',
    name: 'No.28 피의 계약서',
    icon: 'gi:scroll-quill',
    rarity: 'rare',
    desc: '내 턴에 체력을 잃을 때마다 힘 +1 (전투 동안)',
    hooks: {
      onDamageTaken(c, _s, d) {
        if (d.tgt === c.p && d.hpLoss > 0 && c.s.phase === 'player') c.apply(c.p, 'str', 1, c.p);
      },
    },
  },
  {
    id: 'star-fragment',
    name: 'No.22 별의 파편',
    icon: 'gi:star-swirl',
    rarity: 'rare',
    desc: '공허 피해 +3',
    hooks: {
      modDamageOut(_c, _s, d) {
        if (d.type === 'void') d.add += 3;
      },
    },
  },
  {
    id: 'nerve-bundle',
    name: 'No.19 신경 다발',
    icon: 'gi:brain-stem',
    rarity: 'rare',
    desc: '매 턴 첫 번째 행동의 행동력 비용 -1',
    hooks: { modCost: (c, _s, _d, cost) => (c.s.used === 0 && cost > 0 ? cost - 1 : cost) },
  },
  {
    id: 'twin-serpent',
    name: 'No.17 쌍두 뱀 반지',
    icon: 'gi:snake-totem',
    rarity: 'rare',
    desc: '적에게 약화를 부여하면 취약 1도 부여',
    hooks: {
      onApplied(c, _s, target, id) {
        if (id === 'weak' && isEnemy(target)) c.apply(target, 'vuln', 1);
      },
    },
  },
  {
    id: 'hourglass',
    name: 'No.14 모래시계',
    icon: 'gi:sands-of-time',
    rarity: 'rare',
    desc: '전투 첫 턴 행동력 +2',
    hooks: {
      onTurnStart(c) {
        if (c.s.turn === 1) c.s.ap += 2;
      },
    },
  },

  // ── 보스 (강력 + 대가) ──
  {
    id: 'goat-horn',
    name: 'No.11 검은 염소의 뿔',
    icon: 'gi:goat',
    rarity: 'boss',
    desc: '행동력 +1. 매 전투 시작 시 정신력 -4',
    onGain(run) {
      run.player.maxAp += 1;
    },
    hooks: {
      onCombatStart(c) {
        c.loseSanity(4);
      },
    },
  },
  {
    id: 'lighthouse-lens',
    name: 'No.9 등대의 렌즈',
    icon: 'gi:lighthouse',
    rarity: 'boss',
    desc: '행동력 +1. 이동 시 등불 소모 2배',
    onGain(run) {
      run.player.maxAp += 1;
    },
  },
  {
    id: 'sleeper-scale',
    name: 'No.7 잠들지 않는 비늘',
    icon: 'gi:scales',
    rarity: 'boss',
    desc: '행동력 +1. 야영지에서 수면으로 체력을 회복할 수 없다',
    onGain(run) {
      run.player.maxAp += 1;
    },
  },
  {
    id: 'infinite-ring',
    name: 'No.5 무한의 고리',
    icon: 'gi:ouroboros',
    rarity: 'boss',
    desc: '스킬 슬롯 +1. 정수 흡수 한도 -1',
    onGain(run) {
      run.slots.push(null);
    },
  },
  {
    id: 'void-heart',
    name: 'No.4 공허의 심장',
    icon: 'gi:tentacle-heart',
    rarity: 'boss',
    desc: '매 턴 시작 시 무작위 적에게 3 + 통찰×4 공허 피해. 받는 정신 피해 +25%',
    hooks: {
      onTurnStart(c) {
        const e = c.alive.length ? c.rng.pick(c.alive) : null;
        if (e) {
          c.emit({ t: 'fx', name: 'tentacle', src: 'p', tgt: e.uid });
          c.damage({ src: c.p, tgt: e, base: 3 + 4 * c.p.insight, type: 'void', tags: ['relic'] });
        }
      },
      modSanityLoss: (_c, _s, n) => n * 1.25,
    },
  },
  {
    id: 'pact-seal',
    name: 'No.3 계약의 인장',
    icon: 'gi:wax-seal',
    rarity: 'boss',
    desc: '주는 피해 +20%. 최대 체력 -12',
    onGain(run) {
      run.player.maxHp = Math.max(10, run.player.maxHp - 12);
      run.player.hp = Math.min(run.player.hp, run.player.maxHp);
    },
    hooks: {
      modDamageOut(_c, _s, d) {
        if (d.type !== 'true') d.mult *= 1.2;
      },
    },
  },
  {
    id: 'hollow-crown',
    name: 'No.2 공허의 왕관',
    icon: 'gi:crowned-skull',
    rarity: 'boss',
    // 2026-10 통찰 개편: 통찰 +2 → +1. 대신 왕관이 약점을 짚어 준다
    desc: '통찰 +1. 약점을 찌르는 공격 피해 +15%. 매 전투 시작 시 공포 2',
    onGain(run) {
      run.player.insight += 1;
    },
    hooks: {
      onCombatStart(c) {
        c.apply(c.p, 'dread', 2);
      },
      modDamageOut(c, _s, d) {
        // 미리보기에는 알아낸 약점만 (엔진의 통찰 약점 보너스와 같은 규칙)
        if (d.src === c.p && d.attack && isEnemy(d.tgt) && d.type !== 'true' && d.tgt.weak.includes(d.type) && (!c.previewing || d.tgt.known.includes(d.type))) d.mult *= 1.15;
      },
    },
  },
]);
