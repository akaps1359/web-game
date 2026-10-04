import { reg, MADNESS } from '../../engine/registry';

/** extra 광기(단점) 4종과 각성(장점) 3종 */
reg.madness([
  {
    id: 'x-aphasia',
    name: '실어증',
    icon: 'gi:lips',
    desc: '전투 첫 턴에는 기본기만 쓸 수 있다',
    hooks: {
      onCombatStart(c) {
        c.apply(c.p, 'silence', 1);
      },
    },
  },
  {
    id: 'x-phantom-pain',
    name: '환상통',
    icon: 'gi:hand-bandage',
    desc: '받는 공격 피해가 타격마다 +1',
    hooks: {
      modDamageIn(c, _s, d) {
        if (d.attack && d.tgt === c.p) d.add += 1;
      },
    },
  },
  {
    id: 'x-foreboding',
    name: '불길한 예감',
    icon: 'gi:crow-dive',
    desc: '전투 시작 시 무작위 적 하나가 힘 +2',
    hooks: {
      onCombatStart(c) {
        const e = c.alive.length ? c.rng.pick(c.alive) : null;
        if (e) c.apply(e, 'str', 2, e);
      },
    },
  },
  {
    id: 'x-compulsion',
    name: '강박',
    icon: 'gi:clockwork',
    desc: '스킬을 2개 미만 쓰고 턴을 마치면 정신력 -3',
    hooks: {
      onTurnEnd(c) {
        if (c.s.used < 2) c.loseSanity(3);
      },
    },
  },

  // ── 각성 ──
  {
    id: 'x-foresight',
    name: '각성: 예지',
    icon: 'gi:sheikah-eye',
    virtue: true,
    desc: '적의 숨겨진 의도와 약점을 모두 꿰뚫어 본다',
    hooks: {
      onCombatStart(c) {
        for (const e of c.alive) e.known = [...e.weak];
      },
      onTurnStart(c) {
        let changed = false;
        for (const e of c.alive) {
          if (e.intent?.hidden) {
            e.intent.hidden = false;
            changed = true;
          }
          if (e.known.length < e.weak.length) {
            e.known = [...e.weak];
            changed = true;
          }
        }
        if (changed) c.emit({ t: 'text', uid: 'p', text: '예지', tone: 'eldritch' });
      },
    },
  },
  {
    id: 'x-ecstasy',
    name: '각성: 고통의 환희',
    icon: 'gi:burning-passion',
    virtue: true,
    desc: '체력을 잃을 때마다 정신력 +2',
    hooks: {
      onDamageTaken(c, _s, d) {
        if (d.tgt === c.p && d.hpLoss > 0) c.gainSanity(2);
      },
    },
  },
  {
    id: 'x-mad-wisdom',
    name: '각성: 광인의 지혜',
    icon: 'gi:brain',
    virtue: true,
    desc: '가진 광기 1개당 공격 피해 +2',
    hooks: {
      modDamageOut(c, _s, d) {
        if (!d.attack) return;
        const n = c.run.madness.filter((id) => !MADNESS.get(id)?.virtue).length;
        if (n > 0) d.add += 2 * n;
      },
    },
  },
]);
