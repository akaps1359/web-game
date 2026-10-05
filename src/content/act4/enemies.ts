import { reg } from '../../engine/registry';
import { isEnemy } from '../../engine/combat';
import { cycle, hpPct, last, opener, pick } from '../../engine/ai';
import { DMG_TYPES, type EnemyUnit } from '../../engine/types';
import { countDef, mv, others, release } from '../moves';
import { canDoom, castDoom, dimLight, doomDesc, doomMove, flipRows, lockSkill, mostHurt, reviveAlly, setWeak } from './common';

/** 문 너머의 존재를 이루는 구체들 */
export const GATE_ORBS = ['gate-orb-hunger', 'gate-orb-seal', 'gate-orb-gaze'];

const echoDmg = (e: EnemyUnit) => Math.max(8, Math.min(32, e.mem.echoSeen ?? 0));

// ───────────── 특성 ─────────────

reg.traits([
  {
    id: 'a4-aligned',
    name: '별의 정렬',
    desc: '전투 시작 시 심연의 조수 2단계마다 힘 +1',
    hooks: {
      onCombatStart(c, s) {
        const n = Math.floor((c.run.floor?.tide ?? 0) / 2);
        if (n > 0) c.apply(s.unit, 'str', n, s.unit);
      },
    },
  },
  {
    id: 'a4-piping',
    name: '끝없는 피리 소리',
    desc: '자기 차례가 끝날 때마다 정신력 -2',
    hooks: {
      onUnitTurnEnd(c) {
        c.loseSanity(2, true);
      },
    },
  },
  {
    id: 'a4-rooted',
    name: '검은 수액',
    desc: '자기 차례가 끝날 때 체력 5 회복. 그 사이 화염 피해(화상 포함)를 받았다면 회복하지 못한다',
    hooks: {
      onDamageTaken(_c, s, d) {
        if (!isEnemy(s.unit) || d.hpLoss <= 0) return;
        if (d.type === 'fire' || d.tags.includes('burn')) s.unit.mem.scorched = 1;
      },
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        if (e.mem.scorched) {
          delete e.mem.scorched;
          c.emit({ t: 'text', uid: e.uid, text: '수액이 그을렸다', tone: 'info' });
          return;
        }
        c.heal(e, 5);
      },
    },
  },
  {
    id: 'a4-judge',
    name: '별의 심판관',
    desc: '별의 심판(카운트다운)을 스스로 짊어진다. 심판이 떨어지기 전에 붕괴시키거나 쓰러뜨리면 풀린다',
    hooks: {},
  },
  {
    id: 'a4-scarab-curse',
    name: '왕의 저주',
    desc: '파라오의 심판은 풍뎅이 떼가 나눠 짊어진다 — 풍뎅이를 모두 쓰러뜨리면 풀린다 (풍뎅이가 없으면 파라오가 짊어진다)',
    hooks: {},
  },
  {
    id: 'a4-leech',
    name: '색채의 갈증',
    desc: '피해를 준 만큼 체력을 회복한다',
    hooks: {
      onDamageDealt(c, s, d) {
        if (d.src === s.unit && d.tgt === c.p && d.hpLoss > 0) c.heal(s.unit, d.hpLoss);
      },
    },
  },
  {
    id: 'a4-phasing',
    name: '위상 이동',
    desc: '자기 차례가 끝날 때마다 전열과 후열을 오간다',
    hooks: {
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (isEnemy(e)) c.moveRow(e, e.row === 0 ? 1 : 0);
      },
    },
  },
  {
    id: 'a4-unseen',
    name: '보이지 않는 몸',
    desc: '자기 차례가 끝날 때 회피 1 (중첩되지 않음)',
    hooks: {
      onUnitTurnEnd(c, s) {
        if (!((s.unit.st.evasive ?? 0) > 0)) c.apply(s.unit, 'evasive', 1, s.unit);
      },
    },
  },
  {
    id: 'a4-masks',
    name: '천의 가면',
    desc: '지난 턴 당신이 가한 가장 강한 일격을 기억했다가 「메아리」로 되돌려준다. 가면을 바꿔 쓰면 약점이 바뀐다',
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || d.src !== c.p || !d.attack) return;
        if (d.amount > (e.mem.echo ?? 0)) {
          e.mem.echo = d.amount;
          e.mem.echoType = d.type === 'true' ? -1 : DMG_TYPES.indexOf(d.type);
        }
      },
      onUnitTurnStart(_c, s) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        e.mem.echoSeen = e.mem.echo ?? 0;
        e.mem.echoSeenType = e.mem.echoType ?? -1;
        e.mem.echo = 0;
      },
    },
  },
  {
    id: 'a4-brood',
    name: '풍요의 어머니',
    desc: '새끼가 쓰러질 때마다 힘 +1',
    hooks: {
      onAnyDeath(c, s, victim) {
        if (isEnemy(victim) && victim.def === 'goat-spawn' && victim !== s.unit) c.apply(s.unit, 'str', 1, s.unit);
      },
    },
  },
  {
    id: 'a4-chronicle',
    name: '시간의 기록',
    desc: '지난 몸을 기억한다 — 「시간 되감기」로 두 차례 전의 체력으로 돌아간다',
    hooks: {
      onUnitTurnEnd(_c, s) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        e.mem.h2 = e.mem.h1 ?? e.hp;
        e.mem.h1 = e.hp;
      },
    },
  },
  {
    id: 'a4-orbshield',
    name: '구체의 장막',
    desc: '살아 있는 구체 하나당 받는 피해 -20%',
    hooks: {
      modDamageIn(c, _s, d) {
        const n = c.alive.filter((x) => GATE_ORBS.includes(x.def)).length;
        if (n > 0) d.mult *= Math.max(0.2, 1 - 0.2 * n);
      },
    },
  },
  {
    id: 'a4-unmasking',
    name: '황금 가면',
    desc: '체력이 절반 이하가 되면 가면이 벗겨진다 — 약점과 행동이 바뀐다',
    hooks: {
      onDamageTaken(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.transformed || e.hp <= 0 || hpPct(e) > 0.5) return;
        e.mem.transformed = 1;
        e.form = 1;
        e.name = '얼굴 없는 파라오';
        setWeak(c, e, ['void', 'arcane']);
        c.emit({ t: 'fx', name: 'transform', tgt: e.uid });
        c.emit({ t: 'text', uid: e.uid, text: '황금 가면이 떨어진다. 그 아래엔 아무것도 없다', tone: 'eldritch' });
        c.loseSanity(10, true);
        c.apply(e, 'str', 2, e);
        if (e.broken !== 2) c.planIntent(e);
      },
    },
  },
  {
    id: 'a4-event-horizon',
    name: '사건의 지평선',
    desc: '검은 별의 차례가 시작되면 당신의 방어도가 절반이 된다',
    hooks: {
      onUnitTurnStart(c) {
        if (c.p.block > 1) {
          c.p.block = Math.floor(c.p.block / 2);
          c.emit({ t: 'text', uid: 'p', text: '방어도가 검은 별로 빨려 들어간다', tone: 'bad' });
        }
      },
    },
  },
  {
    id: 'a4-relentless',
    name: '끝없는 추적',
    desc: '자기 차례가 끝날 때마다 힘 +1',
    hooks: {
      onUnitTurnEnd(c, s) {
        c.apply(s.unit, 'str', 1, s.unit);
      },
    },
  },
  {
    id: 'a4-lightshy',
    name: '빛을 꺼리는 자',
    desc: '등불이 50 이상이면 주는 공격 피해 -25%',
    hooks: {
      modDamageOut(c, s, d) {
        if (d.src === s.unit && d.attack && c.run.light >= 50) d.mult *= 0.75;
      },
    },
  },
]);

// ───────────── 일반 적 ─────────────

reg.enemies([
  {
    id: 'star-spawn',
    name: '별의 자손',
    icon: 'gi:squid',
    act: 4,
    tier: 'normal',
    hp: [84, 92],
    poise: 6,
    weak: ['fire', 'pierce'],
    resist: { blunt: 0.75 },
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['star'],
    traits: ['a4-aligned'],
    moves: {
      claw: mv.attack('별의 손아귀', 12, { type: 'slash' }),
      dream: mv.horror('꿈의 송신', 10, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      rise: mv.charge('거대한 팔을 치켜든다', 40),
      crush: release(mv.attack('짓누르기', 40)),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'crush';
      return opener(c, e, ['claw']) ?? pick(c, e, { claw: 3, dream: 2, rise: e.hist.slice(-2).includes('crush') ? 0 : 1 });
    },
    visual: { tint: 0x2c4a52, glow: 0x7fe0d0, scale: 1.25, fx: ['drip'] },
  },
  {
    id: 'formless-piper',
    name: '무형의 피리꾼',
    icon: 'gi:pan-flute',
    act: 4,
    tier: 'normal',
    hp: [60, 66],
    poise: 5,
    weak: ['arcane', 'void'],
    row: 1,
    dread: 4,
    eldritch: true,
    tags: ['outer'],
    traits: ['incorporeal', 'a4-piping'],
    moves: {
      note: mv.attack('공허의 음표', 6, { hits: 2, melee: false, type: 'void' }),
      discord: mv.horror('불협화음', 11),
      frenzy: mv.buff(
        '광란의 선율',
        (c, e) => {
          for (const a of others(c, e)) c.apply(a, 'str', 2, e);
        },
        { desc: '다른 모든 적 힘 +2' },
      ),
      veil: mv.debuff(
        '피리 소리의 장막',
        (c, e) => {
          c.apply(c.p, 'dread', 1, e);
          c.apply(c.p, 'weak', 1, e);
        },
        { desc: '공포 1, 약화 1' },
      ),
    },
    ai: (c, e) =>
      opener(c, e, ['veil']) ?? pick(c, e, { note: 3, discord: 2, frenzy: others(c, e).length && !e.hist.includes('frenzy') ? 2 : 0 }),
    visual: { tint: 0x3a2f4a, glow: 0xd080ff, fx: ['float', 'flicker'] },
  },
  {
    id: 'dark-young',
    name: '검은 새끼',
    icon: 'gi:evil-tree',
    act: 4,
    tier: 'normal',
    hp: [88, 95],
    poise: 6,
    weak: ['fire', 'slash'],
    row: 0,
    dread: 4,
    eldritch: true,
    tags: ['outer'],
    traits: ['a4-rooted'],
    moves: {
      lash: mv.attack('촉수 채찍', 4, { hits: 3 }),
      grab: mv.attack('휘감기', 9, { then: (c, e) => void c.apply(c.p, 'frail', 2, e) }),
      bleat: mv.horror('검은 숲의 울음', 9),
      rear: mv.charge('뒷발로 일어선다', 40),
      trample: release(mv.attack('짓밟기', 40)),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'trample';
      return opener(c, e, ['lash']) ?? pick(c, e, { lash: 3, grab: 2, bleat: 1, rear: e.hist.slice(-2).includes('trample') ? 0 : 1 });
    },
    visual: { tint: 0x1f2a1a, glow: 0x9fe060, scale: 1.25 },
  },
  {
    id: 'time-warden',
    name: '시간의 파수꾼',
    icon: 'gi:sands-of-time',
    act: 4,
    tier: 'normal',
    hp: [62, 70],
    poise: 5,
    weak: ['void', 'blunt'],
    row: 1,
    dread: 4,
    eldritch: true,
    tags: ['time'],
    traits: ['a4-judge'],
    moves: {
      sentence: doomMove('파멸의 선고', 3, 30, 8),
      shards: mv.attack('시간의 파편', 6, { hits: 2, melee: false, type: 'arcane' }),
      rewind: {
        name: '되감기',
        intent: 'heal',
        desc: '가장 많이 다친 적의 체력 16 회복',
        run(c, e) {
          c.heal(mostHurt(c) ?? e, 16);
        },
      },
      stop: mv.debuff(
        '멈춘 순간',
        (c, e) => {
          c.apply(c.p, 'frail', 2, e);
          c.apply(c.p, 'weak', 1, e);
        },
        { desc: '허약 2, 약화 1' },
      ),
    },
    ai: (c, e) => {
      const o = opener(c, e, ['shards']);
      if (o) return o;
      if (canDoom(c, e, 6)) return 'sentence';
      const hurt = mostHurt(c);
      return pick(c, e, { shards: 3, stop: 1, rewind: hurt && hpPct(hurt) < 0.6 && !e.hist.includes('rewind') ? 3 : 0 });
    },
    visual: { tint: 0x6a5a3a, glow: 0xffe0a0, fx: ['float'] },
  },
  {
    id: 'migo-stitcher',
    name: '미고 봉합사',
    icon: 'gi:alien-bug',
    act: 4,
    tier: 'normal',
    hp: [62, 68],
    poise: 5,
    weak: ['pierce', 'blunt'],
    resist: { arcane: 0.5 },
    row: 1,
    dread: 3,
    eldritch: true,
    tags: ['migo'],
    traits: ['flying'],
    moves: {
      scalpel: mv.attack('전기 메스', 9, { melee: false, type: 'arcane', then: (c, e) => void c.apply(c.p, 'vuln', 1, e) }),
      extract: mv.horror('뇌 적출', 11, { then: (c, e) => void c.apply(c.p, 'weak', 1, e) }),
      suture: {
        name: '봉합',
        intent: 'heal',
        extra: ['buff'],
        desc: '가장 많이 다친 적의 체력 14 회복, 보호막 6',
        run(c, e) {
          const t = mostHurt(c) ?? e;
          c.heal(t, 14);
          c.apply(t, 'barrier', 6, e);
        },
      },
      rebuild: mv.summon(
        '재조립',
        (c, e) => {
          e.mem.rebuildUsed = 1;
          reviveAlly(c, e, 0.4);
        },
        '쓰러진 동료 하나를 체력 40%로 꿰매어 되살린다 (외과의마다 한 번)',
      ),
    },
    ai: (c, e) => {
      const corpse = c.s.enemies.some((x) => x.dead && !x.fled && !x.minion && x !== e && !x.mem.rebuilt);
      if (corpse && !e.mem.rebuildUsed) return 'rebuild';
      const hurt = mostHurt(c);
      return pick(c, e, { scalpel: 3, extract: 2, suture: hurt && hpPct(hurt) < 0.6 && !e.hist.slice(-2).includes('suture') ? 3 : 0 });
    },
    visual: { tint: 0x7a5a6a, glow: 0xff9ad0, fx: ['float'] },
  },
  {
    id: 'outer-servitor',
    name: '외신의 시종',
    icon: 'gi:gooey-daemon',
    act: 4,
    tier: 'normal',
    hp: [70, 76],
    poise: 6,
    weak: ['slash', 'arcane'],
    resist: { void: 0.5 },
    row: 0,
    dread: 4,
    eldritch: true,
    tags: ['outer'],
    moves: {
      engulf: mv.attack('늘어나 삼키기', 10, { melee: false, type: 'void' }),
      acid: mv.attack('산성 체액', 6, { melee: false, type: 'void', then: (c, e) => void c.apply(c.p, 'vuln', 1, e) }),
      pipe: mv.horror('외신의 피리', 9),
      dance: {
        name: '혼돈의 춤',
        intent: 'special',
        desc: '모든 적의 전열과 후열이 뒤바뀐다',
        run(c) {
          flipRows(c);
        },
      },
    },
    ai: (c, e) => {
      const both = c.row(0).length > 0 && c.row(1).length > 0;
      return opener(c, e, ['engulf']) ?? pick(c, e, { engulf: 3, pipe: 2, acid: 1, dance: both && !e.hist.includes('dance') ? 2 : 0 });
    },
    visual: { tint: 0x3d4a2e, glow: 0xc8ff70, scale: 1.15, fx: ['drip'] },
  },
  {
    id: 'faceless-priest',
    name: '얼굴 없는 사제',
    icon: 'gi:hooded-figure',
    act: 4,
    tier: 'normal',
    hp: [60, 66],
    poise: 5,
    weak: ['pierce', 'void'],
    row: 1,
    dread: 3,
    tags: ['cult'],
    moves: {
      flame: mv.attack('검은 불꽃', 7, { melee: false, type: 'fire', then: (c, e) => void c.apply(c.p, 'burn', 2, e) }),
      unmask: mv.horror('얼굴을 보여준다', 13, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      bless: mv.block('이름 없는 축복', 0, {
        then(c) {
          for (const a of c.alive) c.gainBlock(a, 9);
        },
        desc: '모든 적 방어도 9',
      }),
      pact: mv.buff(
        '별의 언약',
        (c, e) => {
          const t = others(c, e).sort((a, b) => b.hp - a.hp)[0] ?? e;
          c.apply(t, 'ward', 1, e);
          c.apply(t, 'str', 2, e);
        },
        { desc: '가장 강한 동료에게 결계 1, 힘 +2' },
      ),
    },
    ai: (c, e) =>
      opener(c, e, ['flame']) ??
      pick(c, e, { flame: 3, unmask: 2, bless: others(c, e).length ? 2 : 0, pact: others(c, e).length && !e.hist.includes('pact') ? 1 : 0 }),
    visual: { tint: 0x2a2630, glow: 0xff7040 },
  },
  {
    id: 'star-colour',
    name: '우주에서 온 색',
    icon: 'gi:rainbow-star',
    act: 4,
    tier: 'normal',
    hp: [56, 62],
    poise: 5,
    weak: ['arcane', 'void'],
    resist: { slash: 0.5, pierce: 0.5 },
    row: 1,
    dread: 5,
    eldritch: true,
    tags: ['star'],
    traits: ['a4-leech'],
    moves: {
      drain: mv.attack('생기 흡수', 9, { melee: false, type: 'void' }),
      glare: mv.horror('형언할 수 없는 빛', 11, { then: (c, e) => void c.apply(c.p, 'weak', 1, e) }),
      taint: mv.debuff('색채 오염', (c, e) => void c.apply(c.p, 'corrode', 1, e), { desc: '부식 1 — 받는 공격 피해 +1 (전투 내내)' }),
    },
    ai: (c, e) => cycle(e, ['drain', 'glare', 'drain', 'taint']),
    visual: { tint: 0x8a6aa0, glow: 0xff80ff, fx: ['flicker', 'float'] },
  },
  {
    id: 'byakhee',
    name: '비야키',
    icon: 'gi:evil-bat',
    act: 4,
    tier: 'normal',
    hp: [58, 64],
    poise: 5,
    weak: ['pierce', 'blunt'],
    row: 1,
    dread: 3,
    eldritch: true,
    tags: ['star'],
    traits: ['flying', 'a4-aligned'],
    moves: {
      rend: mv.attack('할퀴기', 3, { hits: 3, melee: false, type: 'slash' }),
      dive: mv.attack('급강하', 12, { melee: false, type: 'pierce' }),
      soar: mv.block('성간 비행', 8, { then: (c, e) => void c.apply(e, 'evasive', 1, e), desc: '방어도 8, 회피 1' }),
    },
    ai: (c, e) => cycle(e, ['rend', 'dive', 'soar']),
    visual: { tint: 0x40382e, glow: 0xffd060, fx: ['float'] },
  },
  {
    id: 'dim-shambler',
    name: '차원 방랑자',
    icon: 'gi:teleport',
    act: 4,
    tier: 'normal',
    hp: [70, 78],
    poise: 6,
    weak: ['blunt', 'arcane'],
    row: 0,
    dread: 4,
    eldritch: true,
    tags: ['outer'],
    traits: ['a4-phasing'],
    moves: {
      claw: mv.attack('차원 할퀴기', 11, { melee: false, type: 'slash' }),
      fold: mv.debuff(
        '공간 접기',
        (c, e) => {
          c.apply(c.p, 'weak', 1, e);
          c.apply(c.p, 'vuln', 2, e);
        },
        { desc: '약화 1, 취약 2' },
      ),
      tear: mv.horror('차원의 틈', 9, { dmg: 6 }),
    },
    ai: (c, e) => opener(c, e, ['claw']) ?? pick(c, e, { claw: 3, fold: e.hist.includes('fold') ? 0 : 2, tear: 2 }),
    visual: { tint: 0x4a4048, glow: 0x80a0ff, fx: ['flicker'] },
  },
  {
    id: 'flying-polyp',
    name: '날아다니는 폴립',
    icon: 'gi:jellyfish',
    act: 4,
    tier: 'normal',
    hp: [74, 80],
    poise: 6,
    weak: ['arcane', 'slash'],
    resist: { pierce: 0.75 },
    row: 0,
    dread: 4,
    eldritch: true,
    tags: ['outer'],
    traits: ['a4-unseen'],
    moves: {
      gust: mv.attack('돌풍', 6, { hits: 2, melee: false }),
      suck: {
        name: '빨아들이는 바람',
        intent: 'attack',
        extra: ['debuff'],
        dmg: 9,
        melee: false,
        desc: '방어도를 모두 흩어 버린 뒤 9 피해',
        run(c, e) {
          if (c.p.block > 0) {
            c.p.block = 0;
            c.emit({ t: 'text', uid: 'p', text: '방어도가 흩어졌다', tone: 'bad' });
          }
          c.enemyAttack(e, { type: 'blunt' });
        },
      },
      whistle: mv.horror('공허의 휘파람', 10),
    },
    ai: (c, e) => opener(c, e, ['gust']) ?? pick(c, e, { gust: 2, suck: last(e) === 'suck' ? 0 : 2, whistle: 1 }),
    visual: { tint: 0x6a7a8a, glow: 0xd0f0ff, scale: 1.15, fx: ['float', 'flicker'] },
  },

  // ───────────── 하수인 ─────────────
  {
    id: 'star-larva',
    name: '별의 유충',
    icon: 'gi:maggot',
    act: 4,
    tier: 'minion',
    hp: [20, 24],
    poise: 0,
    weak: ['fire', 'slash', 'pierce'],
    row: 1,
    eldritch: true,
    tags: ['star'],
    moves: {
      spit: mv.attack('별빛 침', 5, { melee: false, type: 'arcane' }),
      offer: {
        name: '헌신',
        intent: 'special',
        desc: '군주에게 녹아든다 — 군주 체력 12 회복, 유충은 사라진다',
        run(c, e) {
          const lord = c.alive.find((x) => x.def === 'starspawn-lord');
          if (lord) c.heal(lord, 12);
          c.emit({ t: 'text', uid: e.uid, text: '군주의 몸속으로 녹아든다', tone: 'eldritch' });
          c.kill(e);
        },
      },
    },
    ai: (c, e) => {
      const o = opener(c, e, ['spit', 'spit']);
      if (o) return o;
      const lord = c.alive.find((x) => x.def === 'starspawn-lord');
      return lord && lord.hp < lord.maxHp ? 'offer' : 'spit';
    },
    visual: { tint: 0x3a5a5a, glow: 0x9ff0e0, scale: 0.6 },
  },
  {
    id: 'goat-spawn',
    name: '어린 새끼',
    icon: 'gi:evil-bud',
    act: 4,
    tier: 'minion',
    hp: [22, 26],
    poise: 0,
    weak: ['fire', 'slash', 'blunt'],
    row: 0,
    eldritch: true,
    tags: ['outer'],
    moves: {
      bite: mv.attack('물어뜯기', 6),
      grow: {
        name: '자라나기',
        intent: 'buff',
        desc: '자란 새끼가 된다 — 최대 체력 +14, 힘 +2',
        run(c, e) {
          e.form = 1;
          e.name = '자란 새끼';
          e.maxHp += 14;
          c.heal(e, 14);
          c.apply(e, 'str', 2, e);
          c.emit({ t: 'text', uid: e.uid, text: '껍질을 찢고 자라났다', tone: 'eldritch' });
        },
      },
      gore: mv.attack('들이받기', 9),
    },
    ai: (_c, e) => {
      e.mem.age = (e.mem.age ?? 0) + 1;
      if (!e.form && e.mem.age >= 3) return 'grow';
      return e.form ? 'gore' : 'bite';
    },
    visual: { tint: 0x26301e, glow: 0xa0e070, scale: 0.6 },
    forms: [{ name: '자란 새끼', icon: 'gi:evil-tree', visual: { tint: 0x26301e, glow: 0xc0ff80, scale: 0.85 } }],
  },
  {
    id: 'gate-orb-hunger',
    name: '탐식의 구체',
    icon: 'gi:unstable-orb',
    act: 4,
    tier: 'minion',
    hp: [24, 27],
    poise: 0,
    weak: ['slash', 'pierce', 'fire'],
    row: 0,
    eldritch: true,
    tags: ['outer'],
    moves: { devour: mv.attack('집어삼키기', 6, { melee: false, type: 'void' }) },
    ai: () => 'devour',
    visual: { tint: 0x8a3040, glow: 0xff6080, scale: 0.65, fx: ['float'] },
  },
  {
    id: 'gate-orb-seal',
    name: '봉인의 구체',
    icon: 'gi:frozen-orb',
    act: 4,
    tier: 'minion',
    hp: [24, 27],
    poise: 0,
    weak: ['blunt', 'pierce', 'fire'],
    row: 0,
    eldritch: true,
    tags: ['outer'],
    moves: {
      seal: mv.block('문을 닫는다', 0, {
        then(c, e) {
          const gate = c.alive.find((x) => x.def === 'beyond-gate');
          c.gainBlock(gate ?? e, 10);
        },
        desc: '문 너머의 존재 방어도 10',
      }),
      pulse: mv.attack('냉광', 5, { melee: false, type: 'arcane' }),
    },
    ai: (c) => (c.alive.some((x) => x.def === 'beyond-gate') ? 'seal' : 'pulse'),
    visual: { tint: 0x30508a, glow: 0x80c0ff, scale: 0.65, fx: ['float'] },
  },
  {
    id: 'gate-orb-gaze',
    name: '시선의 구체',
    icon: 'gi:extraction-orb',
    act: 4,
    tier: 'minion',
    hp: [24, 27],
    poise: 0,
    weak: ['slash', 'arcane', 'fire'],
    row: 0,
    eldritch: true,
    tags: ['outer'],
    traits: ['a4-judge'],
    moves: {
      gaze: mv.horror('응시', 5),
      key: doomMove('열쇠의 시선', 3, 26, 6),
    },
    ai: (c, e) => (canDoom(c, e, 5) ? 'key' : 'gaze'),
    visual: { tint: 0x5a6a50, glow: 0xe0ffb0, scale: 0.65, fx: ['float', 'flicker'] },
  },
  {
    id: 'pharaoh-scarab',
    name: '검은 풍뎅이 떼',
    icon: 'gi:scarab-beetle',
    act: 4,
    tier: 'minion',
    hp: [14, 16],
    poise: 0,
    weak: ['fire', 'blunt'],
    row: 0,
    traits: ['swarm'],
    tags: ['outer'],
    moves: { gnaw: mv.attack('갉아먹기', 2, { hits: 2, type: 'slash' }) },
    ai: () => 'gnaw',
    visual: { tint: 0x1a1a14, glow: 0xd0b040, scale: 0.6 },
  },
  {
    id: 'void-eye',
    name: '공허의 눈',
    icon: 'gi:eyeball',
    act: 4,
    tier: 'minion',
    hp: [20, 24],
    poise: 0,
    weak: ['fire', 'pierce', 'arcane'],
    row: 1,
    eldritch: true,
    tags: ['star'],
    moves: {
      gaze: mv.horror('공허의 응시', 5),
      feed: {
        name: '빛 흡수',
        intent: 'heal',
        desc: '검은 별 체력 8 회복',
        run(c, e) {
          c.heal(c.alive.find((x) => x.def === 'black-star') ?? e, 8);
        },
      },
    },
    ai: (_c, e) => cycle(e, ['gaze', 'feed']),
    visual: { tint: 0x14101c, glow: 0xb080ff, scale: 0.6, fx: ['float'] },
  },

  // ───────────── 정예 ─────────────
  {
    id: 'chaos-avatar',
    name: '기어오는 혼돈의 화신',
    icon: 'gi:double-face-mask',
    act: 4,
    tier: 'elite',
    hp: [240, 252],
    poise: 9,
    weak: ['slash', 'void'],
    row: 0,
    dread: 7,
    eldritch: true,
    tags: ['outer'],
    traits: ['a4-masks'],
    moves: {
      echo: {
        name: '메아리',
        intent: 'attack',
        melee: false,
        dmg: (_c, e) => echoDmg(e),
        desc: '지난 턴 당신이 가한 가장 강한 일격을 그대로 되돌려준다 (8~32)',
        run(c, e) {
          c.enemyAttack(e, { type: DMG_TYPES[e.mem.echoPlanType ?? -1] ?? 'void' });
        },
      },
      masks: {
        name: '천 개의 가면',
        intent: 'buff',
        extra: ['block'],
        desc: '가면을 바꿔 쓴다 — 약점이 바뀌고 방어도 14',
        run(c, e) {
          const pool = DMG_TYPES.filter((t) => !e.weak.includes(t));
          setWeak(c, e, c.rng.sample(pool, 2));
          e.form = ((e.form ?? 0) % 3) + 1;
          c.gainBlock(e, 14);
          c.emit({ t: 'text', uid: e.uid, text: '가면이 바뀌었다 — 약점이 달라졌다', tone: 'eldritch' });
        },
      },
      whisper: mv.horror('혼돈의 속삭임', 13, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      rise: mv.charge('기어오는 혼돈', 44),
      crawl: release(mv.attack('천 개의 팔', 44, { melee: false, type: 'void' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'crawl';
      const o = opener(c, e, ['whisper']);
      if (o) return o;
      const m = cycle(e, ['echo', 'masks', 'echo', 'rise', 'whisper']);
      if (m === 'echo') e.mem.echoPlanType = e.mem.echoSeenType ?? -1;
      return m;
    },
    visual: { tint: 0x1c1820, glow: 0xff50a0, scale: 1.35, fx: ['flicker'] },
    forms: [
      { name: '기어오는 혼돈의 화신', icon: 'gi:drama-masks', visual: { tint: 0x201c18, glow: 0xffb040, scale: 1.35, fx: ['flicker'] } },
      { name: '기어오는 혼돈의 화신', icon: 'gi:duality-mask', visual: { tint: 0x18201c, glow: 0x40ffb0, scale: 1.35, fx: ['flicker'] } },
      { name: '기어오는 혼돈의 화신', icon: 'gi:carnival-mask', visual: { tint: 0x1c1828, glow: 0x9070ff, scale: 1.35, fx: ['flicker'] } },
    ],
  },
  {
    id: 'thousand-mother',
    name: '천 마리 새끼의 어머니',
    icon: 'gi:goat',
    act: 4,
    tier: 'elite',
    hp: [204, 214],
    poise: 9,
    weak: ['fire', 'slash'],
    row: 0,
    dread: 7,
    eldritch: true,
    tags: ['outer'],
    traits: ['a4-brood'],
    moves: {
      birth: mv.summon(
        '출산',
        (c, e) => {
          const n = countDef(c, 'goat-spawn') === 0 ? 2 : 1;
          for (let i = 0; i < n; i++) if (c.spawn('goat-spawn', 0)) e.mem.births = (e.mem.births ?? 0) + 1;
        },
        '어린 새끼를 낳는다 (새끼가 없으면 둘)',
      ),
      milk: mv.buff(
        '검은 젖',
        (c, e) => {
          for (const y of c.alive.filter((x) => x.def === 'goat-spawn')) {
            c.heal(y, 10);
            c.apply(y, 'str', 2, e);
          }
        },
        { desc: '모든 새끼 체력 10 회복, 힘 +2' },
      ),
      vines: mv.attack('휘감는 덩굴', 7, { hits: 2, then: (c, e) => void c.apply(c.p, 'frail', 1, e) }),
      bleat: mv.horror('천 개의 울음', 12, { then: (c, e) => void c.apply(c.p, 'weak', 1, e) }),
      rear: mv.charge('숲이 일어선다', 42),
      trample: release(mv.attack('검은 숲의 짓밟기', 42)),
    },
    onSpawn: (c) => void c.spawn('goat-spawn', 0),
    ai: (c, e) => {
      if (e.mem.charge) return 'trample';
      const young = countDef(c, 'goat-spawn');
      const births = e.mem.births ?? 0;
      if (young === 0 && births < 5 && last(e) !== 'birth') return 'birth';
      return pick(c, e, {
        vines: 3,
        bleat: 2,
        rear: e.hist.slice(-2).includes('trample') ? 0 : 1,
        milk: young && !e.hist.includes('milk') ? 2 : 0,
        birth: young < 2 && births < 5 && last(e) !== 'birth' ? 2 : 0,
      });
    },
    visual: { tint: 0x16140f, glow: 0x9fe060, scale: 1.45, fx: ['drip'] },
  },
  {
    id: 'yith-wanderer',
    name: '이스의 방랑자',
    icon: 'gi:spiral-shell',
    act: 4,
    tier: 'elite',
    hp: [222, 236],
    poise: 9,
    weak: ['blunt', 'void'],
    row: 0,
    dread: 6,
    eldritch: true,
    tags: ['time'],
    traits: ['a4-judge', 'a4-chronicle'],
    moves: {
      sentence: doomMove('시간의 선고', 3, 34, 10),
      gun: mv.attack('번개 총', 7, { hits: 2, melee: false, type: 'arcane' }),
      swap: mv.horror('정신 교환', 11, { then: (c) => void lockSkill(c, 2), desc: '당신의 기억을 훔쳐 간다 — 무작위 스킬 하나가 다음 턴 동안 봉인된다' }),
      rewind: {
        name: '시간 되감기',
        intent: 'heal',
        desc: '두 차례 전의 체력으로 되돌아간다 (최대 45 회복)',
        run(c, e) {
          const n = Math.min(45, (e.mem.h2 ?? e.hp) - e.hp);
          if (n > 0) c.heal(e, n);
          c.emit({ t: 'text', uid: e.uid, text: '상처가 일어나기 전으로 돌아간다', tone: 'eldritch' });
        },
      },
      rise: mv.charge('시간을 접는다', 42),
      collapse: release(mv.attack('시간 붕괴', 42, { melee: false, type: 'arcane' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'collapse';
      const o = opener(c, e, ['gun']);
      if (o) return o;
      if (canDoom(c, e, 6)) return 'sentence';
      if ((e.mem.h2 ?? 0) - e.hp >= 20 && !e.hist.includes('rewind')) return 'rewind';
      return pick(c, e, { gun: 3, swap: e.hist.includes('swap') ? 0 : 2, rise: e.hist.slice(-2).includes('collapse') ? 0 : 1 });
    },
    visual: { tint: 0x5a4a3a, glow: 0x90e0ff, scale: 1.35 },
  },

  // ───────────── 층 수호자 ─────────────
  {
    id: 'beyond-gate',
    name: '문 너머의 존재',
    icon: 'gi:star-gate',
    act: 4,
    tier: 'boss',
    hp: [300, 300],
    poise: 13,
    weak: ['void', 'blunt'],
    resist: { arcane: 0.5 },
    row: 1,
    dread: 9,
    eldritch: true,
    tags: ['outer'],
    traits: ['a4-orbshield'],
    desc: '모든 시간과 공간이 맞닿는 문. 무지갯빛 구체들이 그것을 감싼다.',
    moves: {
      rays: mv.attack('구체의 빛', 6, { hits: 3, melee: false, type: 'arcane' }),
      oneness: mv.horror('모든 것이 하나', 14, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      open: mv.summon(
        '문이 열린다',
        (c, e) => {
          e.mem.reforms = (e.mem.reforms ?? 0) + 1;
          for (const id of GATE_ORBS) if (!countDef(c, id)) c.spawn(id, 0);
          c.emit({ t: 'text', uid: e.uid, text: '부서진 구체들이 다시 맺힌다', tone: 'eldritch' });
        },
        '부서진 구체들을 다시 맺는다 (두 번까지)',
      ),
      rise: mv.charge('차원이 접힌다', 42),
      crush: release(mv.attack('차원 압착', 42, { melee: false, type: 'void' })),
    },
    onSpawn: (c) => {
      for (const id of GATE_ORBS) c.spawn(id, 0);
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'crush';
      const missing = GATE_ORBS.filter((id) => !countDef(c, id)).length;
      if (missing >= 2 && (e.mem.reforms ?? 0) < 2 && last(e) !== 'open') return 'open';
      return cycle(e, ['rays', 'oneness', 'rays', 'rise']);
    },
    visual: { tint: 0x30284a, glow: 0xfff0a0, scale: 1.5, fx: ['float'] },
  },
  {
    id: 'black-pharaoh',
    name: '검은 파라오',
    icon: 'gi:egyptian-profile',
    act: 4,
    tier: 'boss',
    hp: [420, 420],
    poise: 13,
    weak: ['fire', 'pierce'],
    row: 0,
    dread: 8,
    eldritch: true,
    tags: ['outer'],
    traits: ['a4-scarab-curse', 'a4-unmasking'],
    desc: '모래 아래 피라미드에서 되살아난 왕. 그 가면 아래엔 얼굴이 없다.',
    moves: {
      curse: {
        name: '왕의 저주',
        intent: 'special',
        desc: doomDesc(3, 30, 8, '풍뎅이 떼(없으면 파라오)'),
        run(c, e) {
          castDoom(c, e, 3, 30, 8, c.alive.filter((x) => x.def === 'pharaoh-scarab'));
        },
      },
      swarm: mv.summon(
        '풍뎅이 떼를 부른다',
        (c, e) => {
          e.mem.swarms = (e.mem.swarms ?? 0) + 1;
          c.spawn('pharaoh-scarab', 0);
          c.spawn('pharaoh-scarab', 0);
        },
        '검은 풍뎅이 떼 둘을 부른다',
      ),
      wind: mv.attack('사막의 열풍', 8, { hits: 2, melee: false, type: 'fire' }),
      kneel: mv.horror('무릎 꿇어라', 13, { then: (c, e) => void c.apply(c.p, 'weak', 1, e) }),
      rise: mv.charge('피라미드의 그림자', 44),
      pyramid: release(mv.attack('어둠의 피라미드', 44, { melee: false, type: 'void' })),
      thousand: mv.attack('천 개의 형상', 5, { hits: 4, melee: false, type: 'void' }),
      laugh: mv.horror('혼돈의 웃음', 15, { then: (c, e) => void c.apply(c.p, 'dread', 2, e) }),
    },
    onSpawn: (c) => {
      c.spawn('pharaoh-scarab', 0);
      c.spawn('pharaoh-scarab', 0);
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'pyramid';
      const o = opener(c, e, ['kneel']);
      if (o) return o;
      const scarabs = countDef(c, 'pharaoh-scarab');
      if (scarabs === 0 && (e.mem.swarms ?? 0) < 3 && last(e) !== 'swarm') return 'swarm';
      if (canDoom(c, e, 7)) return 'curse';
      return e.form ? cycle(e, ['thousand', 'laugh', 'thousand', 'rise'], 'c2') : cycle(e, ['wind', 'rise', 'wind', 'kneel']);
    },
    visual: { tint: 0x1a1612, glow: 0xffc040, scale: 1.45 },
    forms: [{ name: '얼굴 없는 파라오', icon: 'gi:pschent-double-crown', visual: { tint: 0x0c0a10, glow: 0xb060ff, scale: 1.5, fx: ['flicker'] } }],
  },
  {
    id: 'starspawn-lord',
    name: '별의 자손 군주',
    icon: 'gi:giant-squid',
    act: 4,
    tier: 'boss',
    hp: [440, 440],
    poise: 14,
    weak: ['pierce', 'slash'],
    resist: { blunt: 0.75 },
    row: 0,
    dread: 9,
    eldritch: true,
    tags: ['star'],
    traits: ['a4-aligned'],
    desc: '별에서 내려온 자손들의 왕. 그 꿈은 궁정 아래, 우주 한가운데서 뒤척이는 무언가에 닿아 있다.',
    moves: {
      sweep: mv.attack('촉수 휩쓸기', 7, { hits: 3, melee: false }),
      flip: {
        name: '대지를 뒤집는다',
        intent: 'special',
        extra: ['block'],
        desc: '모든 적의 전열과 후열을 뒤바꾸고 방어도 16',
        run(c, e) {
          flipRows(c);
          c.gainBlock(e, 16);
        },
      },
      spawn: mv.summon(
        '유충 산란',
        (c, e) => {
          e.mem.broods = (e.mem.broods ?? 0) + 1;
          c.spawn('star-larva', 1);
          c.spawn('star-larva', 1);
        },
        '별의 유충 둘을 낳는다',
      ),
      transmit: mv.horror('꿈의 송신', 14, { then: (c, e) => void c.apply(c.p, 'dread', 2, e) }),
      rise: mv.charge('별의 무게를 끌어내린다', 46),
      fall: release(mv.attack('별이 떨어진다', 46, { melee: false })),
      awaken: mv.buff(
        '별빛 각성',
        (c, e) => {
          e.mem.awoken = 1;
          c.apply(e, 'str', 3, e);
          c.emit({ t: 'text', uid: e.uid, text: '별빛이 눈을 뜬다', tone: 'eldritch' });
        },
        { desc: '힘 +3' },
      ),
    },
    onSpawn: (c) => {
      c.spawn('star-larva', 1);
      c.spawn('star-larva', 1);
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'fall';
      if (hpPct(e) <= 0.5 && !e.mem.awoken) return 'awaken';
      const larvae = countDef(c, 'star-larva');
      if (larvae === 0 && (e.mem.broods ?? 0) < 3 && last(e) !== 'spawn') return 'spawn';
      const m = cycle(e, ['sweep', 'transmit', 'rise', 'sweep', 'flip']);
      if (m === 'flip' && (c.row(0).length === 0 || c.row(1).length === 0)) return 'sweep';
      return m;
    },
    visual: { tint: 0x1e3a40, glow: 0x60ffe0, scale: 1.55, fx: ['drip'] },
  },

  // ───────────── 계층군주 / 추적자 / 균열 수호자 ─────────────
  {
    id: 'black-star',
    name: '검은 별',
    icon: 'gi:dripping-star',
    act: 4,
    tier: 'boss',
    hp: [500, 500],
    poise: 14,
    weak: ['fire', 'arcane'],
    resist: { void: 0.5 },
    row: 0,
    dread: 10,
    eldritch: true,
    tags: ['star'],
    traits: ['a4-aligned', 'a4-event-horizon', 'a4-judge'],
    desc: '빛을 먹는 별. 별들이 제자리를 찾을 때 운석 구덩이 위로 내려앉는다.',
    moves: {
      beam: mv.attack('검은 광선', 6, { hits: 2, melee: false, type: 'void' }),
      devour: mv.horror('빛을 삼킨다', 15, {
        then: (c, e) => {
          c.apply(c.p, 'dread', 2, e);
          dimLight(c, 10);
        },
        desc: '정신력 -15, 공포 2, 등불 -10',
      }),
      judgment: doomMove('별의 심판', 3, 36, 10),
      eyes: mv.summon(
        '공허의 눈을 뜬다',
        (c, e) => {
          e.mem.eyes = (e.mem.eyes ?? 0) + 1;
          c.spawn('void-eye', 1);
          c.spawn('void-eye', 1);
        },
        '공허의 눈 둘을 뜬다',
      ),
      rise: mv.charge('중력이 무너진다', 48),
      collapse: release(mv.attack('중력 붕괴', 48, { melee: false, type: 'void' })),
      nova: mv.buff(
        '초신성 전조',
        (c, e) => {
          e.mem.nova = 1;
          c.apply(e, 'str', 3, e);
          c.emit({ t: 'text', uid: e.uid, text: '검은 빛이 부풀어 오른다', tone: 'eldritch' });
        },
        { desc: '힘 +3' },
      ),
    },
    onSpawn: (c, e) => {
      c.apply(e, 'ritual', 1, e);
      c.spawn('void-eye', 1);
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'collapse';
      if (hpPct(e) <= 0.5 && !e.mem.nova) return 'nova';
      const o = opener(c, e, ['devour']);
      if (o) return o;
      if (canDoom(c, e, 7)) return 'judgment';
      if (countDef(c, 'void-eye') === 0 && (e.mem.eyes ?? 0) < 2 && last(e) !== 'eyes') return 'eyes';
      return cycle(e, ['beam', 'rise', 'beam', 'devour']);
    },
    visual: { tint: 0x08060c, glow: 0x9050ff, scale: 1.55, fx: ['float', 'flicker'] },
  },
  {
    id: 'star-walker',
    name: '별 사이를 걷는 자',
    icon: 'gi:shadow-follower',
    act: 4,
    tier: 'elite',
    hp: [215, 225],
    poise: 9,
    weak: ['fire', 'blunt'],
    row: 0,
    dread: 6,
    eldritch: true,
    tags: ['star'],
    traits: ['a4-relentless'],
    moves: {
      claw: mv.attack('얼어붙은 손톱', 12, { type: 'slash', then: (c, e) => void c.apply(c.p, 'frail', 1, e) }),
      gale: mv.attack('별바람', 5, { hits: 3, melee: false }),
      howl: mv.horror('바람의 울부짖음', 12, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      rise: mv.charge('하늘로 솟구친다', 44),
      pounce: release(mv.attack('하늘에서 덮친다', 44, { melee: false, type: 'slash' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'pounce';
      return cycle(e, ['claw', 'howl', 'gale', 'rise']);
    },
    visual: { tint: 0x9ab0c8, glow: 0xe0f4ff, scale: 1.35, fx: ['float', 'flicker'] },
  },
  {
    id: 'hunting-horror',
    name: '사냥하는 공포',
    icon: 'gi:dragon-spiral',
    act: 4,
    tier: 'elite',
    hp: [250, 262],
    poise: 10,
    weak: ['fire', 'slash'],
    row: 0,
    dread: 7,
    eldritch: true,
    tags: ['outer'],
    traits: ['flying', 'a4-lightshy'],
    moves: {
      coil: mv.attack('휘감기', 10, { then: (c, e) => void c.apply(c.p, 'frail', 2, e) }),
      swoop: mv.attack('급습', 6, { hits: 3, melee: false, type: 'slash' }),
      wings: mv.debuff(
        '빛을 가리는 날개',
        (c, e) => {
          dimLight(c, 15);
          c.apply(c.p, 'weak', 1, e);
          c.gainBlock(e, 10);
        },
        { desc: '등불 -15, 약화 1, 방어도 10', extra: ['block'] },
      ),
      rise: mv.charge('아가리를 벌린다', 44),
      devour: release(mv.attack('포식', 44, { then: (c, e) => void c.heal(e, 12) })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'devour';
      return opener(c, e, ['wings']) ?? cycle(e, ['coil', 'swoop', 'rise', 'wings', 'swoop']);
    },
    visual: { tint: 0x1a1420, glow: 0xff4060, scale: 1.4, fx: ['float'] },
  },
]);
