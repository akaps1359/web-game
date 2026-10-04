import { reg } from '../../engine/registry';
import { isEnemy } from '../../engine/combat';
import { cycle, opener, pick, hpPct } from '../../engine/ai';
import { countDef, mv, others, release } from '../moves';

// ───────────── 특성 ─────────────

reg.traits([
  {
    id: 'swarm',
    name: '무리',
    desc: '한 번에 받는 피해가 최대 7',
    hooks: {
      modDamageIn(_c, _s, d) {
        d.cap = 7;
      },
    },
  },
  {
    id: 'thief',
    name: '소매치기',
    desc: '훔친 골드는 처치하면 돌려받는다',
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (isEnemy(e) && e.mem.stolen) {
          c.p.gold += e.mem.stolen;
          c.emit({ t: 'text', uid: e.uid, text: `골드 +${e.mem.stolen}`, tone: 'good' });
          e.mem.stolen = 0;
        }
      },
    },
  },
  {
    id: 'risen',
    name: '되살아남',
    desc: '처음 쓰러지면 체력 30%로 다시 일어선다',
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.revived) return;
        e.mem.revived = 1;
        e.dead = false;
        e.hp = Math.ceil(e.maxHp * 0.3);
        c.emit({ t: 'spawn', uid: e.uid });
        c.emit({ t: 'text', uid: e.uid, text: '다시 일어선다', tone: 'eldritch' });
      },
    },
  },
  {
    id: 'flying',
    name: '비행',
    desc: '근접 공격 피해 50% 감소',
    hooks: {
      modDamageIn(_c, _s, d) {
        if (d.melee) d.mult *= 0.5;
      },
    },
  },
  {
    id: 'zealot',
    name: '광신',
    desc: '동료가 쓰러지면 힘 +2',
    hooks: {
      onAnyDeath(c, s, victim) {
        if (isEnemy(victim) && victim !== s.unit) c.apply(s.unit, 'str', 2, s.unit);
      },
    },
  },
  {
    id: 'veiled',
    name: '안개 장막',
    desc: '자기 턴이 끝날 때 회피 1',
    hooks: {
      onUnitTurnEnd(c, s) {
        if (!(s.unit.st.evasive > 0)) c.apply(s.unit, 'evasive', 1, s.unit);
      },
    },
  },
  {
    id: 'incorporeal',
    name: '실체 없음',
    desc: '참격·관통·타격 피해 30% 감소',
    hooks: {
      modDamageIn(_c, _s, d) {
        if (d.type === 'slash' || d.type === 'pierce' || d.type === 'blunt') d.mult *= 0.7;
      },
    },
  },
  {
    id: 'deep-blood',
    name: '심해의 피',
    desc: '체력이 절반 이하가 되면 본모습을 드러낸다',
    hooks: {
      onDamageTaken(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.transformed || e.hp <= 0 || hpPct(e) > 0.5) return;
        e.mem.transformed = 1;
        e.form = 1;
        e.name = '심해의 혼혈';
        e.weak = ['fire', 'arcane'];
        e.known = e.known.filter((w) => e.weak.includes(w));
        if (c.p.insight >= 2) e.known = [...e.weak];
        e.maxPoise = 10;
        e.poise = e.broken ? 0 : 10;
        c.emit({ t: 'fx', name: 'transform', tgt: e.uid });
        c.emit({ t: 'text', uid: e.uid, text: '껍데기가 찢어지고 비늘이 드러난다', tone: 'eldritch' });
        c.heal(e, 30);
        c.loseSanity(8, true);
        if (e.broken !== 2) c.planIntent(e);
      },
    },
  },
  {
    id: 'lamp-bound',
    name: '등명기',
    desc: '등명기가 켜져 있는 동안 등대지기는 매 턴 방어도를 얻는다',
    hooks: {},
  },
]);

// ───────────── 일반 적 ─────────────

reg.enemies([
  {
    id: 'thug',
    name: '부두 깡패',
    icon: 'gi:bandit',
    act: 1,
    tier: 'normal',
    hp: [36, 40],
    poise: 3,
    weak: ['pierce', 'arcane'],
    row: 0,
    moves: {
      punch: mv.attack('주먹질', 7),
      pipe: mv.attack('쇠파이프', 12),
      jeer: mv.buff(
        '비웃음',
        (c, e) => {
          c.apply(e, 'str', 2, e);
          e.mem.jeered = 1;
        },
        { desc: '힘 +2' },
      ),
    },
    ai: (c, e) => opener(c, e, ['punch']) ?? pick(c, e, { punch: 3, pipe: 2, jeer: e.mem.jeered ? 0 : 1 }),
    visual: { tint: 0x8a7f72, glow: 0xb08050 },
  },
  {
    id: 'smuggler',
    name: '밀수꾼',
    icon: 'gi:hooded-assassin',
    act: 1,
    tier: 'normal',
    hp: [27, 31],
    poise: 2,
    weak: ['slash', 'fire'],
    row: 1,
    traits: ['thief'],
    moves: {
      shot: mv.attack('권총 사격', 7, { melee: false, type: 'pierce' }),
      smoke: mv.debuff(
        '연막',
        (c, e) => {
          c.gainBlock(e, 6);
          c.apply(c.p, 'weak', 1, e);
        },
        { extra: ['block'], desc: '방어도 6, 약화 1' },
      ),
      pickpocket: mv.attack('소매치기', 4, {
        then(c, e) {
          const n = Math.min(10, c.p.gold);
          if (n > 0) {
            c.p.gold -= n;
            e.mem.stolen = (e.mem.stolen ?? 0) + n;
            c.emit({ t: 'text', uid: 'p', text: `골드 -${n}`, tone: 'bad' });
          }
        },
      }),
    },
    ai: (c, e) => (e.row === 0 ? pick(c, e, { pickpocket: 3, shot: 2, smoke: 1 }) : pick(c, e, { shot: 3, smoke: 2 })),
    visual: { tint: 0x5d6b78, glow: 0x9ab0c0 },
  },
  {
    id: 'dog',
    name: '굶주린 들개',
    icon: 'gi:direwolf',
    act: 1,
    tier: 'normal',
    hp: [17, 20],
    poise: 2,
    weak: ['slash', 'blunt'],
    row: 0,
    moves: {
      bite: mv.attack('물어뜯기', 6, { then: (c, e) => void c.apply(c.p, 'bleed', 1, e) }),
      pack: mv.attack('포위 공격', 4, { hits: 2 }),
    },
    ai: (c, e) => pick(c, e, { bite: 2, pack: countDef(c, 'dog') > 1 ? 2 : 0 }),
    visual: { tint: 0x6e5b4a, glow: 0xd04030, scale: 0.85 },
  },
  {
    id: 'rats',
    name: '시궁쥐 떼',
    icon: 'gi:rat',
    act: 1,
    tier: 'normal',
    hp: [25, 29],
    poise: 4,
    weak: ['fire', 'blunt'],
    row: 0,
    traits: ['swarm'],
    moves: {
      gnaw: mv.attack('갉아먹기', 3, { hits: 3, type: 'slash' }),
      breed: mv.summon('번식', (c) => void c.spawn('rat', 0), '쥐 1마리 소환'),
    },
    ai: (c, e) => opener(c, e, ['gnaw']) ?? pick(c, e, { gnaw: 3, breed: c.alive.length < 4 ? 2 : 0 }),
    visual: { tint: 0x5a4f45, glow: 0xc02020, scale: 0.9 },
  },
  {
    id: 'rat',
    name: '쥐',
    icon: 'gi:rat',
    act: 1,
    tier: 'minion',
    hp: [7, 8],
    poise: 0,
    weak: ['slash', 'pierce', 'blunt', 'fire'],
    row: 0,
    moves: { bite: mv.attack('물기', 3) },
    ai: () => 'bite',
    visual: { tint: 0x4a413a, glow: 0xa02020, scale: 0.55 },
  },
  {
    id: 'sailor',
    name: '술 취한 선원',
    icon: 'gi:pirate-captain',
    act: 1,
    tier: 'normal',
    hp: [40, 44],
    poise: 3,
    weak: ['pierce', 'void'],
    row: 0,
    moves: {
      bottle: mv.attack('병 휘두르기', 11),
      stagger: mv.block('비틀거림', 5),
      roar: mv.buff(
        '고함',
        (c, e) => {
          c.apply(e, 'str', 1, e);
          c.apply(c.p, 'weak', 1, e);
        },
        { extra: ['debuff'], desc: '힘 +1, 약화 1' },
      ),
    },
    ai: (c, e) => pick(c, e, { bottle: 3, stagger: 2, roar: 1 }, 1),
    visual: { tint: 0x7a6650, glow: 0xc09060 },
  },
  {
    id: 'initiate',
    name: '교단 입문자',
    icon: 'gi:cultist',
    act: 1,
    tier: 'normal',
    hp: [29, 33],
    poise: 3,
    weak: ['slash', 'fire'],
    row: 1,
    moves: {
      pray: mv.buff('기도', (c, e) => {
        for (const a of c.alive) c.apply(a, 'str', 1, e);
      }, { desc: '모든 아군 힘 +1' }),
      whisper: mv.horror('속삭임', 4),
      stab: mv.attack('단검 찌르기', 8, { type: 'pierce' }),
    },
    ai: (c, e) => (e.row === 0 ? pick(c, e, { stab: 3, whisper: 1 }) : pick(c, e, { pray: 2, whisper: 2 })),
    visual: { tint: 0x4d3a52, glow: 0x9a50c0 },
  },
  {
    id: 'drowned',
    name: '익사체',
    icon: 'gi:shambling-zombie',
    act: 1,
    tier: 'normal',
    hp: [35, 39],
    poise: 3,
    weak: ['fire', 'blunt'],
    resist: { pierce: 0.5 },
    row: 0,
    dread: 2,
    traits: ['risen'],
    moves: {
      grasp: mv.attack('움켜쥐기', 8, { then: (c, e) => void c.apply(c.p, 'frail', 1, e) }),
      vomit: mv.debuff(
        '검은 물 토하기',
        (c, e) => {
          c.enemyAttack(e, { dmg: 3, melee: false, type: 'void' });
          c.apply(c.p, 'weak', 1, e);
        },
        { extra: ['attack'], dmg: 3, desc: '3 피해, 약화 1' },
      ),
    },
    ai: (c, e) => pick(c, e, { grasp: 3, vomit: 2 }),
    visual: { tint: 0x3f5a55, glow: 0x60c0a0, fx: ['drip'] },
  },
  {
    id: 'gulls',
    name: '썩은 갈매기 떼',
    icon: 'gi:seagull',
    act: 1,
    tier: 'normal',
    hp: [19, 22],
    poise: 2,
    weak: ['pierce', 'fire'],
    row: 1,
    traits: ['flying'],
    moves: {
      peck: mv.attack('쪼아대기', 3, { hits: 2, melee: false, type: 'pierce' }),
      dive: mv.attack('급강하', 8, { melee: false, type: 'pierce' }),
    },
    ai: (c, e) => cycle(e, ['peck', 'peck', 'dive']),
    visual: { tint: 0x8c8c86, glow: 0xe0e0c0, scale: 0.85, fx: ['float'] },
  },
  {
    id: 'hookman',
    name: '갈고리꾼',
    icon: 'gi:pirate-hook',
    act: 1,
    tier: 'normal',
    hp: [42, 46],
    poise: 4,
    weak: ['slash', 'arcane'],
    row: 0,
    moves: {
      hook: mv.attack('갈고리 걸기', 9, { type: 'pierce', then: (c, e) => void c.apply(c.p, 'vuln', 1, e) }),
      windup: mv.charge('내려찍기 준비', 22),
      slam: release(mv.attack('내려찍기', 22)),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'slam';
      return opener(c, e, ['hook']) ?? pick(c, e, { hook: 2, windup: e.hist.slice(-2).includes('slam') ? 0 : 1 });
    },
    visual: { tint: 0x6f6458, glow: 0xc0a080 },
  },
  {
    id: 'lurker',
    name: '어둠 속의 눈',
    icon: 'gi:evil-eyes',
    act: 1,
    tier: 'normal',
    hp: [23, 27],
    poise: 2,
    weak: ['fire', 'arcane'],
    row: 1,
    dread: 3,
    eldritch: true,
    moves: {
      gaze: mv.horror('응시', 6),
      claw: mv.attack('그림자 손톱', 7, { melee: false, type: 'void' }),
    },
    ai: (c, e) => cycle(e, ['gaze', 'claw', 'claw']),
    visual: { tint: 0x1e1a24, glow: 0xe0d050, fx: ['flicker', 'float'] },
  },

  // ───────────── 정예 ─────────────
  {
    id: 'butcher',
    name: '어시장 도살자',
    icon: 'gi:meat-cleaver',
    act: 1,
    tier: 'elite',
    hp: [86, 92],
    poise: 6,
    weak: ['pierce', 'fire'],
    row: 0,
    moves: {
      hack: mv.attack('난도질', 4, { hits: 3, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 2, e) }),
      prep: mv.charge('도축 준비', 24),
      chop: release(mv.attack('토막내기', 24, { type: 'slash' })),
      scent: mv.buff('피 냄새', (c, e) => void c.apply(e, 'str', (c.p.st.bleed ?? 0) > 0 ? 3 : 2, e), {
        desc: '힘 +2 (출혈 중인 상대면 +3)',
      }),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'chop';
      return opener(c, e, ['hack']) ?? pick(c, e, { hack: 2, prep: e.hist.includes('chop') && e.hist[e.hist.length - 1] === 'chop' ? 0 : 1, scent: 1 }, 1);
    },
    visual: { tint: 0x7a5048, glow: 0xd03020, scale: 1.2 },
  },
  {
    id: 'enforcer',
    name: '교단 집행자',
    icon: 'gi:executioner-hood',
    act: 1,
    tier: 'elite',
    hp: [70, 76],
    poise: 5,
    weak: ['blunt', 'void'],
    row: 0,
    traits: ['zealot'],
    moves: {
      protect: mv.block('신앙의 방벽', 0, {
        then(c, e) {
          for (const a of c.alive) c.gainBlock(a, 8);
          void e;
        },
        desc: '모든 아군 방어도 8',
      }),
      execute: mv.attack('처형', 13),
      zeal: mv.horror('광신의 설교', 6, { dmg: 5, melee: false }),
    },
    ai: (c, e) => pick(c, e, { execute: 3, protect: others(c, e).length ? 2 : 0, zeal: 1 }),
    visual: { tint: 0x3a2a40, glow: 0xc040a0, scale: 1.15 },
  },
  {
    id: 'crab',
    name: '거대 게',
    icon: 'gi:crab',
    act: 1,
    tier: 'elite',
    hp: [74, 80],
    poise: 7,
    weak: ['blunt', 'arcane'],
    resist: { slash: 0.5 },
    row: 0,
    moves: {
      claw: mv.attack('집게', 13),
      shell: mv.block('껍질 닫기', 15),
      bubble: mv.debuff(
        '거품',
        (c, e) => {
          c.apply(c.p, 'weak', 2, e);
          c.apply(c.p, 'frail', 2, e);
        },
        { desc: '약화 2, 허약 2' },
      ),
    },
    ai: (c, e) => cycle(e, ['claw', 'shell', 'claw', 'bubble']),
    visual: { tint: 0x8a3f30, glow: 0xff8050, scale: 1.25 },
  },

  // ───────────── 층 수호자 ─────────────
  {
    id: 'lightkeeper',
    name: '등대지기',
    icon: 'gi:lighthouse',
    act: 1,
    tier: 'boss',
    hp: [175, 175],
    poise: 10,
    weak: ['pierce', 'void'],
    row: 0,
    dread: 4,
    moves: {
      swing: mv.attack('랜턴 휘두르기', 14),
      beam: mv.horror('눈먼 광선', 8, { dmg: 8, type: 'fire' }),
      relight: mv.summon('불 밝히기', (c) => void c.spawn('lamp', 1), '등명기 소환'),
      madness: mv.buff(
        '빛에 미친 자',
        (c, e) => {
          c.apply(e, 'str', 3, e);
          c.emit({ t: 'text', uid: e.uid, text: '빛이… 모든 것을 태운다…', tone: 'eldritch' });
        },
        { desc: '힘 +3' },
      ),
      shards: mv.attack('렌즈 파편', 5, { hits: 3, melee: false, type: 'pierce' }),
    },
    onSpawn: (c) => void c.spawn('lamp', 1),
    ai: (c, e) => {
      if (hpPct(e) <= 0.5 && !e.mem.p2) {
        e.mem.p2 = 1;
        return 'madness';
      }
      if (countDef(c, 'lamp') === 0 && (e.mem.relit ?? 0) < 2 && pick(c, e, { a: 1, b: 1 }) === 'a') {
        e.mem.relit = (e.mem.relit ?? 0) + 1;
        return 'relight';
      }
      return e.mem.p2 ? cycle(e, ['shards', 'beam', 'swing'], 'c2') : cycle(e, ['swing', 'beam', 'swing']);
    },
    visual: { tint: 0x504a40, glow: 0xffe080, scale: 1.4, fx: ['beam'] },
  },
  {
    id: 'lamp',
    name: '등명기',
    icon: 'gi:lantern-flame',
    act: 1,
    tier: 'minion',
    hp: [22, 22],
    poise: 0,
    weak: ['blunt', 'pierce'],
    row: 1,
    moves: {
      shine: mv.buff('비추기', (c) => {
        const lk = c.alive.find((x) => x.def === 'lightkeeper');
        if (lk) c.gainBlock(lk, 10);
        c.loseSanity(2, true);
      }, { desc: '등대지기 방어도 10, 정신력 -2' }),
    },
    ai: () => 'shine',
    visual: { tint: 0x8a7a40, glow: 0xffd060, scale: 0.75, fx: ['flicker'] },
  },
  {
    id: 'queen',
    name: '밀수조직 두목',
    icon: 'gi:queen-crown',
    act: 1,
    tier: 'boss',
    hp: [145, 145],
    poise: 9,
    weak: ['slash', 'arcane'],
    row: 0,
    moves: {
      command: mv.summon('집결 명령', (c) => void c.spawn('crew', 1), '조직원 소환'),
      bounty: mv.debuff('현상금', (c, e) => void c.apply(c.p, 'vuln', 2, e), { desc: '취약 2' }),
      volley: mv.attack('일제 사격', 3, { melee: false, type: 'pierce', hits: (c) => 1 + countDef(c, 'crew') }),
      cutlass: mv.attack('커틀러스', 14, { type: 'slash' }),
    },
    onSpawn: (c) => {
      c.spawn('crew', 1);
      c.spawn('crew', 1);
    },
    ai: (c, e) => opener(c, e, ['bounty']) ?? pick(c, e, { volley: 3, cutlass: 2, command: countDef(c, 'crew') < 2 && !e.hist.slice(-2).includes('command') ? 3 : 0 }),
    visual: { tint: 0x6a4a5a, glow: 0xe0b060, scale: 1.3 },
  },
  {
    id: 'fisherman',
    name: '늙은 어부',
    icon: 'gi:lucky-fisherman',
    act: 1,
    tier: 'boss',
    hp: [150, 150],
    poise: 8,
    weak: ['fire', 'slash'],
    row: 0,
    traits: ['deep-blood'],
    moves: {
      net: mv.debuff(
        '그물 던지기',
        (c, e) => {
          c.apply(c.p, 'frail', 2, e);
          c.apply(c.p, 'weak', 1, e);
        },
        { desc: '허약 2, 약화 1' },
      ),
      gaff: mv.attack('갈고리 장대', 9, { type: 'pierce' }),
      mutter: mv.horror('중얼거림', 3, { desc: '알아들을 수 없는 기도' }),
      maw: mv.attack('심해의 아가리', 16, { then: (c, e) => void c.heal(e, 6) }),
      tide: mv.attack('조수', 7, { hits: 2 }),
      song: mv.horror('심연의 노래', 8, { then: (c, e) => void c.apply(c.p, 'dread', 2, e) }),
    },
    ai: (c, e) => (e.form ? cycle(e, ['maw', 'tide', 'song'], 'c2') : cycle(e, ['gaff', 'net', 'gaff', 'mutter'])),
    visual: { tint: 0x5a5a50, glow: 0x80c0b0, scale: 1.3 },
    forms: [{ name: '심해의 혼혈', icon: 'gi:fish-monster', visual: { tint: 0x2f5550, glow: 0x50ffd0, scale: 1.5, fx: ['drip'] } }],
  },

  // ───────────── 계층군주 / 추적자 / 균열 수호자 ─────────────
  {
    id: 'captain',
    name: '익사한 선장',
    icon: 'gi:pirate-skull',
    act: 1,
    tier: 'boss',
    hp: [190, 190],
    poise: 12,
    weak: ['fire', 'void'],
    row: 0,
    dread: 6,
    eldritch: true,
    moves: {
      sword: mv.attack('녹슨 커틀러스', 8, { hits: 2, type: 'slash' }),
      muster: mv.summon('선원 소집', (c) => void c.spawn('drowned', 0), '익사체 소환'),
      ready: mv.charge('닻을 들어올린다', 26),
      anchor: release(mv.attack('닻 내려치기', 26)),
      shanty: mv.horror('익사자의 뱃노래', 10, { then: (c, e) => void c.apply(c.p, 'dread', 2, e) }),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'anchor';
      const m = cycle(e, ['sword', 'muster', 'ready', 'shanty', 'sword', 'ready']);
      if (m === 'muster' && c.alive.length >= 4) return 'sword';
      return m;
    },
    visual: { tint: 0x2a3c3c, glow: 0x40ffc0, scale: 1.5, fx: ['drip', 'float'] },
  },
  {
    id: 'fogstalker',
    name: '안개 속 사냥꾼',
    icon: 'gi:spectre',
    act: 1,
    tier: 'elite',
    hp: [70, 70],
    poise: 6,
    weak: ['fire', 'arcane'],
    row: 0,
    dread: 3,
    traits: ['veiled'],
    moves: {
      strike: mv.attack('그림자 일격', 13, { type: 'slash' }),
      rend: mv.attack('찢기', 5, { hits: 3, type: 'slash' }),
      vanish: mv.block('안개 속으로', 10),
    },
    ai: (c, e) => cycle(e, ['strike', 'rend', 'vanish']),
    visual: { tint: 0x8a9aa0, glow: 0xd0f0ff, scale: 1.2, fx: ['flicker', 'float'] },
  },
  {
    id: 'wraith',
    name: '바다 무덤의 망령',
    icon: 'gi:floating-ghost',
    act: 1,
    tier: 'elite',
    hp: [95, 95],
    poise: 8,
    weak: ['arcane', 'fire'],
    row: 0,
    dread: 4,
    eldritch: true,
    traits: ['incorporeal'],
    moves: {
      chill: mv.attack('냉기의 손길', 10, { type: 'void', then: (c, e) => void c.apply(c.p, 'weak', 1, e) }),
      wail: mv.horror('울부짖음', 7, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      drain: mv.attack('생명 흡수', 8, { type: 'void', then: (c, e) => void c.heal(e, 8) }),
      curse: mv.debuff(
        '망자의 저주',
        (c, e) => {
          c.apply(c.p, 'frail', 2, e);
          c.apply(c.p, 'vuln', 1, e);
        },
        { desc: '허약 2, 취약 1' },
      ),
    },
    ai: (c, e) => cycle(e, ['chill', 'wail', 'drain', 'curse']),
    visual: { tint: 0x405a70, glow: 0x80e0ff, scale: 1.3, fx: ['float', 'flicker'] },
  },
]);

// 두목의 졸개 (하수인)
reg.enemies([
  {
    id: 'crew',
    name: '밀수 조직원',
    icon: 'gi:hooded-assassin',
    act: 1,
    tier: 'minion',
    hp: [14, 16],
    poise: 1,
    weak: ['slash', 'fire'],
    row: 1,
    moves: {
      shot: mv.attack('엄호 사격', 4, { melee: false, type: 'pierce' }),
      cover: mv.block('엄폐', 5),
    },
    ai: (c, e) => pick(c, e, { shot: 2, cover: 1 }),
    visual: { tint: 0x4d5a66, glow: 0x8aa0b0, scale: 0.8 },
  },
]);
