import { reg } from '../../engine/registry';
import { hit, skill } from '../lib';

/** 계열 무관 생존 기술 */
reg.skills([
  skill({
    id: 'shove',
    name: '밀쳐내기',
    icon: 'gi:push',
    school: 'neutral',
    rarity: 'common',
    cost: 1,
    cd: 2,
    range: 'melee',
    target: 'single',
    type: 'blunt',
    tags: ['attack', 'push'],
    vals: { dmg: [4, 6], poise: 1 },
    desc: '{D:dmg} 타격 피해, 버팀 추가 -{poise}. 후열에 자리가 있으면 밀어낸다',
    run: (c, u, t) => {
      hit(c, u, t);
      if (t && !t.dead && t.row === 0 && c.row(0).length > 1) c.moveRow(t, 1);
    },
  }),
  skill({
    id: 'first-aid',
    name: '응급처치',
    icon: 'gi:first-aid-kit',
    school: 'neutral',
    rarity: 'uncommon',
    cost: 1,
    cd: 99,
    range: 'self',
    target: 'self',
    tags: ['heal'],
    vals: { heal: [7, 10] },
    desc: '체력 {heal} 회복. 전투당 1회',
    run: (c, u) => void c.heal(c.p, u.v('heal')),
  }),
  skill({
    id: 'focus',
    name: '집중',
    icon: 'gi:concentration-orb',
    school: 'neutral',
    rarity: 'common',
    cost: 0,
    cd: [3, 2],
    range: 'self',
    target: 'self',
    tags: ['energy'],
    vals: { ap: 1 },
    desc: '다음 턴 행동력 +{ap}',
    run: (c, u) => void c.apply(c.p, 'energized', u.v('ap'), c.p),
  }),
  skill({
    id: 'study',
    name: '관찰',
    icon: 'gi:magnifying-glass',
    school: 'neutral',
    rarity: 'common',
    cost: 0,
    cd: 2,
    range: 'ranged',
    target: 'single',
    tags: ['debuff', 'reveal'],
    vals: { vuln: [1, 2] },
    desc: '대상의 약점을 모두 밝히고 취약 {vuln}',
    run: (c, u, t) => {
      if (!t) return;
      for (const w of t.weak) if (!t.known.includes(w)) {
        t.known.push(w);
        c.emit({ t: 'reveal', uid: t.uid, dtype: w });
      }
      c.apply(t, 'vuln', u.v('vuln'), c.p);
    },
  }),
]);
