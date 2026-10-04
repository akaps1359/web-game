import { reg } from '../../engine/registry';
import { isEnemy } from '../../engine/combat';
import { cycle, last, opener, pick } from '../../engine/ai';
import { DMG_TYPES, type DmgType } from '../../engine/types';
import { countDef, mv, others, release } from '../moves';
import { canDoom, castDoom, doomDesc, doomMove, liftDoom, setWeak } from '../act4/common';

/** 잠든 자의 세 모습. 체력 합계 1000 */
export const SLEEPER_PHASES: { name: string; hp: number; weak: DmgType[]; wake: string; sanity: number }[] = [
  { name: '잠든 자', hp: 280, weak: ['arcane', 'fire'], wake: '', sanity: 0 },
  { name: '깨어나는 자', hp: 330, weak: ['pierce', 'void'], wake: '르뤼에가 떠오른다. 잠든 자가 눈꺼풀을 들어 올린다', sanity: 10 },
  { name: '깨어난 자', hp: 390, weak: ['slash', 'blunt'], wake: '별들이 제자리를 찾았다. 그것이 일어선다', sanity: 14 },
];

// ───────────── 특성 ─────────────

reg.traits([
  {
    id: 'a5-awakening',
    name: '죽음마저 죽는 영겁',
    desc: '쓰러뜨려도 두 번 더 깨어난다. 깨어날 때마다 체력이 다시 차오르고 모습·약점·행동이 바뀐다',
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        const phase = e.mem.phase ?? 0;
        if (phase >= SLEEPER_PHASES.length - 1) return;
        const next = phase + 1;
        const P = SLEEPER_PHASES[next];
        e.mem.phase = next;
        // 봇/연출용 표식 (첫 변신 / 두 번째 부활)
        if (next === 1) e.mem.transformed = 1;
        else e.mem.revived = 1;
        liftDoom(c, e, '잠든 자가 몸을 바꾸며 심판을 거두었다');
        e.dead = false;
        e.form = next;
        e.name = P.name;
        e.maxHp = Math.max(1, Math.round((P.hp * (e.mem.hpMul ?? 100)) / 100));
        e.hp = e.maxHp;
        e.block = 0;
        e.broken = 0;
        e.maxPoise = 15;
        e.poise = 15;
        e.mem.calls = 0;
        delete e.mem.charge;
        delete e.st.doom;
        setWeak(c, e, P.weak);
        c.emit({ t: 'spawn', uid: e.uid });
        c.emit({ t: 'fx', name: 'transform', tgt: e.uid });
        c.emit({ t: 'text', uid: e.uid, text: P.wake, tone: 'eldritch' });
        c.loseSanity(P.sanity, true);
        if (c.over) return;
        for (let i = 0; i < 2; i++) if (countDef(c, 'sleeper-tentacle') < 3) c.spawn('sleeper-tentacle', 0);
        c.planIntent(e);
      },
    },
  },
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
    name: '끝없는 기도',
    desc: '자기 차례가 끝날 때 모든 적의 힘 +1. 붕괴되면 쌓인 기도가 흩어진다 (모든 적의 힘이 사라진다)',
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
        if (any) c.emit({ t: 'text', text: '기도가 끊겼다 — 쌓인 힘이 흩어진다', tone: 'good' });
      },
    },
  },
]);

// ───────────── 최종 수호자: 잠든 자 ─────────────

reg.enemies([
  {
    id: 'sleeper',
    name: '잠든 자',
    icon: 'gi:giant-squid',
    act: 5,
    tier: 'boss',
    hp: [280, 280],
    poise: 15,
    weak: ['arcane', 'fire'],
    row: 0,
    dread: 12,
    eldritch: true,
    tags: ['sleeper', 'star'],
    traits: ['a5-awakening'],
    desc: '가라앉은 도시 르뤼에에서 꿈을 꾸며 기다리는 자. 그 꿈이 이 미궁을 만들었다.',
    moves: {
      // ── 1. 잠든 자 ──
      dream: mv.horror('꿈의 파도', 10, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      stir: mv.attack('잠결의 뒤척임', 8, { hits: 2 }),
      slumber: {
        name: '깊은 잠',
        intent: 'sleep',
        extra: ['block'],
        desc: '꿈속으로 가라앉는다 — 방어도 18, 정신력 -3',
        run(c, e) {
          c.gainBlock(e, 18);
          c.loseSanity(3, true);
        },
      },
      inhale: mv.charge('심연이 숨을 들이쉰다', 42),
      exhale: release(mv.attack('심연의 숨결', 42, { melee: false, type: 'void', then: (c) => void c.loseSanity(5, true) })),
      call: mv.summon(
        '촉수를 부른다',
        (c, e) => {
          e.mem.calls = (e.mem.calls ?? 0) + 1;
          c.spawn('sleeper-tentacle', 0);
          c.spawn('sleeper-tentacle', 0);
        },
        '잠든 자의 촉수 둘을 부른다',
      ),
      // ── 2. 깨어나는 자 ──
      rise: mv.block('르뤼에의 부상', 16, {
        then: (c) => {
          if (countDef(c, 'sleeper-tentacle') < 2) c.spawn('sleeper-tentacle', 0);
        },
        desc: '방어도 16. 촉수가 둘보다 적으면 하나를 부른다',
      }),
      revelation: mv.horror('광기의 계시', 15, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      lash: mv.attack('촉수 내려치기', 11, { hits: 2 }),
      stars: {
        name: '별들이 제자리에',
        intent: 'special',
        desc: doomDesc(3, 40, 12, '촉수들(없으면 잠든 자)'),
        run(c, e) {
          castDoom(
            c,
            e,
            3,
            40,
            12,
            c.alive.filter((x) => x.def === 'sleeper-tentacle'),
          );
        },
      },
      weight: mv.charge('대양의 무게가 실린다', 48),
      crash: release(mv.attack('대양이 무너진다', 48)),
      // ── 3. 깨어난 자 ──
      roar: mv.buff(
        '깨어남의 포효',
        (c, e) => {
          e.mem.roared = 1;
          c.apply(e, 'str', 4, e);
          c.loseSanity(6, true);
        },
        { desc: '힘 +4, 정신력 -6' },
      ),
      storm: mv.attack('촉수 폭풍', 6, { hits: 4, melee: false }),
      end: mv.horror('영원한 꿈의 끝', 18, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      maw: mv.charge('세계를 삼키는 아가리', 54),
      devour: release(mv.attack('세계를 삼킨다', 54, { type: 'void' })),
    },
    onSpawn: (c, e) => {
      e.mem.hpMul = Math.round((e.maxHp / SLEEPER_PHASES[0].hp) * 100);
      c.spawn('sleeper-tentacle', 0);
      c.spawn('sleeper-tentacle', 0);
    },
    ai: (c, e) => {
      const ph = e.mem.phase ?? 0;
      const tent = countDef(c, 'sleeper-tentacle');
      const canCall = tent === 0 && (e.mem.calls ?? 0) < 2 && last(e) !== 'call';
      if (ph === 0) {
        if (e.mem.charge) return 'exhale';
        const o = opener(c, e, ['dream']);
        if (o) return o;
        if (canCall) return 'call';
        return cycle(e, ['stir', 'slumber', 'dream', 'inhale', 'stir', 'dream'], 'c1');
      }
      if (ph === 1) {
        if (e.mem.charge) return 'crash';
        if (tent > 0 && canDoom(c, e, 6)) return 'stars';
        if (canCall) return 'call';
        return cycle(e, ['lash', 'revelation', 'weight', 'rise', 'lash', 'revelation'], 'c2');
      }
      if (e.mem.charge) return 'devour';
      if (!e.mem.roared) return 'roar';
      if (canCall) return 'call';
      return cycle(e, ['storm', 'end', 'maw', 'storm', 'lash'], 'c3');
    },
    visual: { tint: 0x1c2c2c, glow: 0x50c0a0, scale: 1.6, fx: ['float'] },
    forms: [
      { name: '깨어나는 자', icon: 'gi:squid-head', visual: { tint: 0x16302e, glow: 0x40ffc0, scale: 1.7, fx: ['drip'] } },
      { name: '깨어난 자', icon: 'gi:tentacles-skull', visual: { tint: 0x081414, glow: 0x80ffe0, scale: 1.85, fx: ['drip', 'flicker'] } },
    ],
  },
  {
    id: 'sleeper-tentacle',
    name: '잠든 자의 촉수',
    icon: 'gi:kraken-tentacle',
    act: 5,
    tier: 'minion',
    hp: [24, 28],
    poise: 0,
    weak: ['slash', 'fire', 'arcane'],
    row: 0,
    eldritch: true,
    tags: ['sleeper'],
    moves: {
      wrap: mv.attack('휘감기', 6, { melee: false, then: (c, e) => void c.apply(c.p, 'weak', 1, e) }),
      squeeze: mv.attack('조이기', 3, { hits: 2, melee: false, then: (c, e) => void c.apply(c.p, 'frail', 1, e) }),
    },
    ai: (_c, e) => cycle(e, ['wrap', 'squeeze']),
    visual: { tint: 0x1c3a36, glow: 0x50ffd0, scale: 0.75, fx: ['drip'] },
  },

  // ───────────── 최종층 정예 ─────────────
  {
    id: 'rlyeh-warden',
    name: '르뤼에의 문지기',
    icon: 'gi:rock-golem',
    act: 5,
    tier: 'elite',
    hp: [300, 312],
    poise: 12,
    weak: ['void', 'blunt'],
    row: 0,
    dread: 8,
    eldritch: true,
    tags: ['star', 'sleeper'],
    traits: ['a5-geometry'],
    desc: '가라앉은 도시의 문을 지키는 거상. 그 몸의 각도는 어느 것도 맞지 않는다.',
    moves: {
      fist: mv.attack('봉인의 주먹', 16),
      gaze: mv.debuff(
        '석화의 응시',
        (c, e) => {
          c.apply(c.p, 'silence', 1, e);
          c.apply(c.p, 'frail', 2, e);
        },
        { desc: '침묵 1 (다음 턴 기본기만 쓸 수 있다), 허약 2' },
      ),
      call: mv.horror('잠든 자의 부름', 15, { then: (c, e) => void c.apply(c.p, 'dread', 2, e) }),
      wall: mv.block('기하학의 벽', 22),
      open: mv.charge('수문을 연다', 48),
      flood: release(mv.attack('해일', 48, { melee: false, type: 'void' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'flood';
      const o = opener(c, e, ['fist']);
      if (o) return o;
      return cycle(e, ['call', 'fist', 'open', 'wall', 'fist', 'gaze']);
    },
    visual: { tint: 0x2e3a36, glow: 0x70ffc8, scale: 1.5 },
  },
  {
    id: 'dream-hierophant',
    name: '꿈의 대사제',
    icon: 'gi:warlock-hood',
    act: 5,
    tier: 'elite',
    hp: [184, 192],
    poise: 10,
    weak: ['fire', 'pierce'],
    row: 1,
    dread: 6,
    tags: ['cult', 'sleeper'],
    traits: ['a5-litany', 'a4-judge'],
    desc: '잠든 자를 깨우기 위해 평생을 기도해 온 자. 그 기도가 동료들을 강하게 만든다.',
    moves: {
      sermon: mv.horror('잠든 자의 설교', 14, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      blessing: mv.block('심해의 축복', 0, {
        then(c, e) {
          for (const a of c.alive) {
            c.gainBlock(a, 12);
            c.apply(a, 'regen', 3, e);
          }
        },
        desc: '모든 적 방어도 12, 재생 3',
      }),
      spear: mv.attack('검은 물의 창', 9, { hits: 2, melee: false, type: 'void' }),
      prayer: doomMove('파멸의 기도', 3, 36, 10),
    },
    ai: (c, e) => {
      const o = opener(c, e, ['sermon']);
      if (o) return o;
      if (canDoom(c, e, 6)) return 'prayer';
      return pick(c, e, { spear: 3, sermon: 2, blessing: others(c, e).length && !e.hist.slice(-2).includes('blessing') ? 2 : 0 });
    },
    visual: { tint: 0x1e2440, glow: 0x60a0ff, scale: 1.2, fx: ['float'] },
  },
]);
