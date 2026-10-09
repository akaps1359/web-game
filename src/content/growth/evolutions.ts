import { isEnemy } from '../../engine/combat';
import { reg } from '../../engine/registry';

/*
 * 유물 진화 (2026-10 성장 개편, engine/growth.ts — 뱀파이어 서바이버즈의 무기 진화 참고):
 * 짝이 되는 두 유물(RelicDef.evolve)을 함께 지니고 층 수호자를 쓰러뜨리면, 수호자 보상에 진화가 함께 나온다 — 두 유물을 내주고 이것을 얻는다.
 * 흔한 유물 둘이 판의 끝 무렵에 하나의 핵심이 된다 (작은 것을 모아 두는 이유). 보통 보상·상점에는 나오지 않는다 (rollRelic이 뺀다).
 * 진화한 유물은 두 재료의 효과를 이어받고 더 세다 — 재료의 훅을 그대로 옮겨 적는다 (재료는 사라진다). 번호는 두 재료의 번호를 잇는다
 */
reg.relics([
  {
    id: 'evo-anatomy',
    name: 'No.52·43 해부 도해',
    icon: 'gi:bleeding-wound',
    rarity: 'rare',
    evolve: ['anatomy-notes', 'x-bloody-bandage'],
    desc: '출혈을 부여할 때 +2. 출혈 중인 적을 쓰러뜨리면 체력 5 회복, 그 출혈이 무작위 다른 적에게 옮겨붙는다',
    hooks: {
      modApply: (_c, _s, _t, id, n) => (id === 'bleed' ? n + 2 : n),
      onKill(c, _s, victim) {
        const b = victim.st.bleed ?? 0;
        if (b <= 0) return;
        c.heal(c.p, 5);
        const others = c.alive.filter((e) => e !== victim);
        if (others.length) c.apply(c.rng.pick(others), 'bleed', b, c.p);
      },
    },
  },
  {
    id: 'evo-elixir',
    name: 'No.44·40 연금술사의 비약',
    icon: 'gi:fire-bottle',
    rarity: 'rare',
    evolve: ['witch-salve', 'green-fire'],
    desc: '독과 화상을 부여할 때 +2. 독과 화상에 모두 걸린 적에게 주는 공격 피해 +25%',
    hooks: {
      modApply: (_c, _s, _t, id, n) => (id === 'poison' || id === 'burn' ? n + 2 : n),
      modDamageOut(c, _s, d) {
        if (d.src === c.p && d.attack && isEnemy(d.tgt) && (d.tgt.st.poison ?? 0) > 0 && (d.tgt.st.burn ?? 0) > 0) d.mult *= 1.25;
      },
    },
  },
  {
    id: 'evo-litany',
    name: 'No.42·45 종탑의 경전',
    icon: 'gi:book-cover',
    rarity: 'rare',
    evolve: ['old-bible', 'drowned-bell'],
    desc: '전투 시작 시 결계 2, 모든 적에게 약화 2',
    hooks: {
      onCombatStart(c) {
        c.apply(c.p, 'ward', 2, c.p);
        for (const e of c.alive) c.apply(e, 'weak', 2, c.p);
      },
    },
  },
  {
    id: 'evo-saltgrave',
    name: 'No.69·56 소금 무덤',
    icon: 'gi:grave-flowers',
    rarity: 'rare',
    evolve: ['salt-pouch', 'grave-dirt'],
    desc: '전투 첫 턴 방어도 14. 적이 쓰러질 때마다 방어도 5',
    hooks: {
      onTurnStart(c) {
        if (c.s.turn === 1) c.gainBlock(c.p, 14);
      },
      onAnyDeath(c, _s, victim) {
        if (isEnemy(victim)) c.gainBlock(c.p, 5);
      },
    },
  },
  {
    id: 'evo-general',
    name: 'No.70·55 장군의 단안경',
    icon: 'gi:chess-king',
    rarity: 'rare',
    evolve: ['tin-soldier', 'x-lorgnette'],
    desc: '매 턴 첫 공격 피해 +6 (여러 번 때리는 공격은 첫 타격만). 약점을 찌르는 공격 피해 +4',
    hooks: {
      onTurnStart(_c, s) {
        if (s.ref) s.ref.n = 1;
      },
      modDamageOut(_c, s, d) {
        if (!d.attack) return;
        if (s.ref?.n) d.add += 6;
        if (d.type !== 'true' && isEnemy(d.tgt) && d.tgt.weak.includes(d.type)) d.add += 4;
      },
      onDamageDealt(_c, s, d) {
        if (d.attack && s.ref) s.ref.n = 0;
      },
    },
  },
  {
    id: 'evo-pearlshot',
    name: 'No.60·49 붕괴의 진주탄',
    icon: 'gi:pearl-necklace',
    rarity: 'rare',
    evolve: ['black-pearl', 'silver-bullets'],
    desc: '적을 붕괴시키면 행동력 +1, 방어도 6. 붕괴된 적에게 주는 피해 +35% (속성 무관)',
    hooks: {
      onBreak(c) {
        c.s.ap += 1;
        c.gainBlock(c.p, 6);
        c.emit({ t: 'text', uid: 'p', text: '행동력 +1', tone: 'good' });
      },
      modDamageOut(c, _s, d) {
        if (d.src === c.p && isEnemy(d.tgt) && d.tgt.broken > 0) d.mult *= 1.35;
      },
    },
  },
  {
    id: 'evo-raven',
    name: 'No.73·48 까마귀 왕의 눈',
    icon: 'gi:raven',
    rarity: 'rare',
    evolve: ['cracked-glasses', 'x-raven-feather'],
    desc: '전투 시작 시 모든 적에게 취약 2, 적마다 약점 하나가 드러난다 (약점을 다 알면 급소가)',
    hooks: {
      onCombatStart(c) {
        for (const e of c.alive) {
          c.apply(e, 'vuln', 2, c.p);
          const hidden = e.weak.filter((w) => !e.known.includes(w));
          if (!hidden.length) {
            c.revealPoint(e);
            continue;
          }
          const w = c.rng.pick(hidden);
          e.known.push(w);
          c.emit({ t: 'reveal', uid: e.uid, dtype: w });
        }
      },
    },
  },
  {
    id: 'evo-feather',
    name: 'No.67·50 행운의 깃털',
    icon: 'gi:feather',
    rarity: 'rare',
    evolve: ['rabbit-foot', 'x-feather-charm'],
    desc: '전투 시작 시 회피 1, 보호막 8. 보호막을 얻을 때 +3',
    hooks: {
      onCombatStart(c) {
        c.apply(c.p, 'evasive', 1, c.p);
        c.apply(c.p, 'barrier', 8, c.p);
      },
      modApply: (c, _s, target, id, n) => (id === 'barrier' && target === c.p ? n + 3 : n),
    },
  },
]);
