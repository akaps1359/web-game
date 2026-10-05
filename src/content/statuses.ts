import { reg } from '../engine/registry';
import { isEnemy } from '../engine/combat';

/**
 * 공통 상태이상. 수치(n)의 의미는 desc에 {n}으로 표시.
 * decay: 소유자 턴 종료 시 1 감소.
 */
reg.statuses([
  // ── 강화 ──
  {
    id: 'str',
    name: '힘',
    icon: 'gi:biceps',
    kind: 'buff',
    signed: true,
    desc: '공격 피해 +{n}',
    hooks: {
      modDamageOut(_c, s, d) {
        if (d.attack) d.add += s.n;
      },
    },
  },
  {
    id: 'dex',
    name: '민첩',
    icon: 'gi:feathered-wing',
    kind: 'buff',
    signed: true,
    desc: '스킬로 얻는 방어도 +{n}',
    hooks: {
      modBlock(_c, s, b) {
        if (b.fromSkill) b.amount += s.n;
      },
    },
  },
  {
    id: 'thorns',
    name: '가시',
    icon: 'gi:thorny-vine',
    kind: 'buff',
    desc: '근접 공격을 받으면 공격자에게 {n} 피해',
    hooks: {
      onDamageTaken(c, s, d) {
        if (d.melee && d.attack && d.src && d.src !== s.unit) {
          c.damage({ src: s.unit, tgt: d.src, base: s.n, type: 'true', tags: ['thorns'] });
        }
      },
    },
  },
  {
    id: 'counter',
    name: '반격',
    icon: 'gi:sword-clash',
    kind: 'buff',
    desc: '공격을 받을 때마다 공격자에게 {n} 타격 피해 (다음 내 턴이 시작되면 사라짐)',
    hooks: {
      onDamageTaken(c, s, d) {
        if (d.attack && d.src && d.src !== s.unit && d.src.hp > 0) {
          c.damage({ src: s.unit, tgt: d.src, base: s.n, type: 'blunt', attack: true, melee: true, tags: ['counter'] });
        }
      },
    },
    tickStart(c, u) {
      // 플레이어 반격은 다음 내 턴 시작 시 사라진다
      if (!isEnemy(u)) c.clear(u, 'counter');
    },
  },
  {
    id: 'regen',
    name: '재생',
    icon: 'gi:heart-plus',
    kind: 'buff',
    desc: '턴 종료 시 체력 {n} 회복, 이후 1 감소',
    tickEnd(c, u, n) {
      c.heal(u, n);
      c.apply(u, 'regen', -1);
    },
  },
  {
    id: 'barrier',
    name: '보호막',
    icon: 'gi:bubble-field',
    kind: 'buff',
    desc: '피해를 {n}만큼 흡수. 턴이 지나도 유지',
  },
  {
    id: 'ward',
    name: '결계',
    icon: 'gi:magic-shield',
    kind: 'buff',
    desc: '해로운 효과를 {n}회 무효화',
  },
  {
    id: 'retain',
    name: '굳건함',
    icon: 'gi:stone-wall',
    kind: 'buff',
    desc: '턴이 시작될 때 방어도가 사라지지 않는다 ({n}회)',
  },
  {
    id: 'energized',
    name: '활력',
    icon: 'gi:lightning-frequency',
    kind: 'buff',
    desc: '다음 턴 행동력 +{n}',
  },
  {
    id: 'aim',
    name: '조준',
    icon: 'gi:crosshair',
    kind: 'buff',
    desc: '다음 관통 공격이 치명타(피해 2배). {n}회',
    hooks: {
      modDamageOut(_c, _s, d) {
        if (d.attack && d.type === 'pierce' && !d.tags.includes('noaim')) {
          d.mult *= 2;
          d.crit = true;
        }
      },
      onDamageDealt(c, s, d) {
        if (d.crit && d.type === 'pierce' && d.attack) c.apply(s.unit, 'aim', -1);
      },
    },
  },
  {
    id: 'frenzy',
    name: '격앙',
    icon: 'gi:enrage',
    kind: 'buff',
    desc: '이번 턴 공격 피해 +{n}%',
    hooks: {
      modDamageOut(_c, s, d) {
        if (d.attack) d.mult *= 1 + s.n / 100;
      },
    },
    tickEnd(c, u) {
      c.clear(u, 'frenzy');
    },
  },
  {
    id: 'tentacle',
    name: '촉수',
    icon: 'gi:tentacle-strike',
    kind: 'buff',
    desc: '내 턴 종료 시 촉수 {n}개가 무작위 적을 공격 (공허 3 + 통찰)',
    tickEnd(c, u, n) {
      for (let i = 0; i < n; i++) {
        const pool = c.alive;
        if (!pool.length || c.over) return;
        const t = c.rng.pick(pool);
        c.emit({ t: 'fx', name: 'tentacle', src: u.uid, tgt: t.uid });
        c.damage({ src: u, tgt: t, base: 3 + c.p.insight, type: 'void', attack: true, tags: ['tentacle'] });
      }
    },
  },
  {
    id: 'taunt',
    name: '도발',
    icon: 'gi:shouting',
    kind: 'buff',
    decay: true,
    desc: '단일 대상 공격은 이 대상만 노릴 수 있음 ({n}턴)',
  },
  {
    id: 'ritual',
    name: '의식',
    icon: 'gi:pentacle',
    kind: 'buff',
    desc: '턴 종료 시 힘 +{n}',
    tickEnd(c, u, n) {
      c.apply(u, 'str', n, u);
    },
  },
  {
    id: 'harden',
    name: '경화',
    icon: 'gi:crab-claw',
    kind: 'buff',
    desc: '턴 종료 시 방어도 {n}',
    tickEnd(c, u, n) {
      c.gainBlock(u, n);
    },
  },
  {
    id: 'spikes',
    name: '가시 껍질',
    icon: 'gi:spiked-shell',
    kind: 'buff',
    desc: '공격을 받을 때마다 공격자에게 {n} 피해',
    hooks: {
      onDamageTaken(c, s, d) {
        if (d.attack && d.src && d.src !== s.unit) c.damage({ src: s.unit, tgt: d.src, base: s.n, type: 'true', tags: ['thorns'] });
      },
    },
  },

  {
    id: 'evasive',
    name: '회피',
    icon: 'gi:dodging',
    kind: 'buff',
    desc: '다음 공격 피해를 무효화 ({n}회)',
    hooks: {
      modDamageIn(_c, _s, d) {
        if (d.attack) d.mult = 0;
      },
      onDamageTaken(c, s, d) {
        if (d.attack) {
          c.apply(s.unit, 'evasive', -1);
          c.emit({ t: 'text', uid: s.unit.uid, text: '회피!', tone: 'info' });
        }
      },
    },
  },

  // ── 약화 ──
  {
    id: 'dying',
    name: '사경',
    icon: 'gi:heart-beats',
    kind: 'debuff',
    desc: '체력 0. 받는 피해의 절반만큼, 그리고 매 턴 정신력이 깎인다. 정신력 0이면 사망. 회복하면 벗어난다.',
  },
  {
    id: 'weak',
    name: '약화',
    icon: 'gi:broken-bone',
    kind: 'debuff',
    decay: true,
    desc: '주는 공격 피해 25% 감소 ({n}턴)',
    hooks: {
      modDamageOut(_c, _s, d) {
        if (d.attack) d.mult *= 0.75;
      },
    },
  },
  {
    id: 'vuln',
    name: '취약',
    icon: 'gi:cracked-shield',
    kind: 'debuff',
    decay: true,
    desc: '받는 공격 피해 50% 증가 ({n}턴)',
    hooks: {
      modDamageIn(_c, _s, d) {
        if (d.attack) d.mult *= 1.5;
      },
    },
  },
  {
    id: 'frail',
    name: '허약',
    icon: 'gi:shattered-glass',
    kind: 'debuff',
    decay: true,
    desc: '얻는 방어도 25% 감소 ({n}턴)',
    hooks: {
      modBlock(_c, _s, b) {
        b.amount *= 0.75;
      },
    },
  },
  {
    id: 'bleed',
    name: '출혈',
    icon: 'gi:bleeding-wound',
    kind: 'debuff',
    desc: '턴 시작 시 {n} 피해, 이후 1 감소',
    tickStart(c, u, n) {
      c.damage({ src: null, tgt: u, base: n, type: 'true', tags: ['dot', 'bleed'] });
      c.apply(u, 'bleed', -1);
    },
  },
  {
    id: 'poison',
    name: '독',
    icon: 'gi:poison-bottle',
    kind: 'debuff',
    desc: '턴 시작 시 방어도를 무시하고 {n} 피해, 이후 1 감소',
    tickStart(c, u, n) {
      c.damage({ src: null, tgt: u, base: n, type: 'true', ignoreBlock: true, tags: ['dot', 'poison'] });
      c.apply(u, 'poison', -1);
    },
  },
  {
    id: 'burn',
    name: '화상',
    icon: 'gi:flame',
    kind: 'debuff',
    // 다른 지속 피해(출혈·독)처럼 자기 차례가 시작될 때, 행동하기 전에 먼저 정산한다
    desc: '턴 시작 시 {n} 피해 (줄어들지 않음). 화염 공격을 받으면 +2',
    tickStart(c, u, n) {
      c.damage({ src: null, tgt: u, base: n, type: 'true', tags: ['dot', 'burn'] });
    },
    hooks: {
      onDamageTaken(c, s, d) {
        if (d.type === 'fire' && d.attack && d.hpLoss + d.blocked > 0) c.apply(s.unit, 'burn', 2);
      },
    },
  },
  {
    id: 'mark',
    name: '인장',
    icon: 'gi:pentagram-rose',
    kind: 'debuff',
    desc: '비전 피해를 받을 때마다 +{n}. 폭발 스킬이 소모',
    hooks: {
      modDamageIn(_c, s, d) {
        if (d.type === 'arcane' && d.attack) d.add += s.n;
      },
    },
  },
  {
    id: 'stun',
    name: '기절',
    icon: 'gi:knocked-out-stars',
    kind: 'debuff',
    desc: '다음 행동 {n}회 불가',
  },
  {
    id: 'dread',
    name: '공포',
    icon: 'gi:screaming',
    kind: 'debuff',
    decay: true,
    desc: '적에게 받는 정신 피해 50% 증가 ({n}턴)',
  },
  {
    id: 'silence',
    name: '침묵',
    icon: 'gi:silenced',
    kind: 'debuff',
    decay: true,
    desc: '기본기 외 스킬 사용 불가 ({n}턴)',
  },
  {
    id: 'madden',
    name: '광란',
    icon: 'gi:brain-freeze',
    kind: 'debuff',
    decay: true,
    desc: '행동 시 아군을 공격할 수 있음 ({n}턴)',
  },
  {
    id: 'corrode',
    name: '부식',
    icon: 'gi:acid-blob',
    kind: 'debuff',
    desc: '받는 공격 피해가 타격마다 +{n} (방어도 흡수 전)',
    hooks: {
      modDamageIn(_c, s, d) {
        if (d.attack) d.add += s.n;
      },
    },
  },
  {
    id: 'doom',
    name: '파멸',
    icon: 'gi:death-zone',
    kind: 'debuff',
    desc: '자기 턴이 끝날 때 파멸 수치가 체력 이상이면 즉사',
    tickEnd(c, u, n) {
      if (n >= u.hp && isEnemy(u)) {
        c.emit({ t: 'text', uid: u.uid, text: '파멸', tone: 'eldritch' });
        c.kill(u);
      }
    },
  },
]);
