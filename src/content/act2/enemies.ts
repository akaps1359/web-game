import { ENEMIES, reg } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import { cycle, hpPct, last, opener, pick } from '../../engine/ai';
import type { DmgType, EnemyUnit, MoveDef } from '../../engine/types';
import { countDef, mv, others, release } from '../moves';

// ───────────── 공용 헬퍼 ─────────────

/** 적 정의의 분류 태그 확인 ('cult', 'deep', 'undead' …) */
export function hasTag(e: EnemyUnit, tag: string): boolean {
  return ENEMIES.get(e.def)?.tags?.includes(tag) ?? false;
}

/** 아직 먹히지 않은 시체 수 (도망친 적 제외) */
export function corpses(c: Combat): number {
  return c.s.enemies.filter((x) => x.dead && !x.fled).length - (c.s.vars.a2eaten ?? 0);
}

/** 시체 하나를 먹는다. 먹을 것이 없으면 false */
export function eatCorpse(c: Combat): boolean {
  if (corpses(c) <= 0) return false;
  c.s.vars.a2eaten = (c.s.vars.a2eaten ?? 0) + 1;
  return true;
}

/** 체력 비율이 가장 낮은 아군 */
function mostHurt(c: Combat): EnemyUnit | null {
  let best: EnemyUnit | null = null;
  for (const a of c.alive) if (!best || hpPct(a) < hpPct(best)) best = a;
  return best;
}

const CHOIR = ['chorister', 'choirmaster'];
/** 자신을 뺀 성가대 수 */
function choirOthers(c: Combat, e: EnemyUnit): number {
  return c.alive.filter((x) => x !== e && CHOIR.includes(x.def)).length;
}

const DMG_KO: Record<DmgType, string> = { slash: '참격', pierce: '관통', blunt: '타격', fire: '화염', arcane: '비전', void: '공허' };

/** 성가대원의 찬송: 계획 시점의 성가대 수에 맞춘 정신 피해를 보여주고, 실행 시 다시 센다 */
function hymn(n: number): MoveDef {
  return {
    ...mv.horror('물밑의 찬송', 5 + n, { desc: '다른 성가대원 1명당 정신 피해 +1 (최대 +3)' }),
    run(c, e) {
      c.horror(e, 5 + Math.min(3, choirOthers(c, e)));
    },
  };
}

/** 성가대장의 지휘 (크레셴도 단계별로 이름이 달라 의도에 진행도가 보인다) */
function conduct(step: number): MoveDef {
  return mv.buff(
    `지휘 (${step}/3)`,
    (c, e) => {
      e.mem.cres = (e.mem.cres ?? 0) + 1;
      for (const a of c.alive) c.gainBlock(a, 4);
      c.emit({ t: 'text', uid: e.uid, text: `크레셴도 ${e.mem.cres}`, tone: 'eldritch' });
    },
    { extra: ['block'], desc: '크레셴도 +1 (3이 되면 대합창을 준비한다), 모든 아군 방어도 4' },
  );
}

/** 종지기의 타종 */
function toll(step: number): MoveDef {
  return {
    ...mv.horror(`타종 (${step}/3)`, 6, { desc: '종지기 힘 +1. 세 번 울리면 마지막 종을 준비한다' }),
    run(c, e) {
      if (countDef(c, 'great-bell') === 0) {
        c.emit({ t: 'text', uid: e.uid, text: '깨진 종은 울리지 않는다', tone: 'good' });
        return;
      }
      c.horror(e, 6);
      if (c.over) return;
      e.mem.tolls = (e.mem.tolls ?? 0) + 1;
      c.apply(e, 'str', 1, e);
      c.emit({ t: 'text', uid: e.uid, text: `종이 ${e.mem.tolls}번 울렸다`, tone: 'eldritch' });
    },
  };
}

// ───────────── 특성 ─────────────

reg.traits([
  {
    id: 'a2-chorus',
    name: '합창',
    desc: '함께 노래하는 성가대원 1명당 찬송의 정신 피해 +1 (최대 +3)',
    hooks: {},
  },
  {
    id: 'a2-martyrdom',
    name: '순교',
    desc: '쓰러지면 남은 동료 모두 힘 +2, 방어도 8',
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || !e.dead) return;
        const rest = c.alive;
        if (!rest.length) return;
        c.emit({ t: 'text', uid: e.uid, text: '순교의 피가 동료들에게 스민다', tone: 'eldritch' });
        for (const a of rest) {
          c.apply(a, 'str', 2, e);
          c.gainBlock(a, 8);
        }
      },
    },
  },
  {
    id: 'a2-corpse-eater',
    name: '시체 포식',
    desc: '쓰러진 자의 시체를 먹고 회복하며 강해진다. 시체는 한 번만 먹을 수 있다',
    hooks: {},
  },
  {
    id: 'a2-gills',
    name: '아가미',
    desc: '자기 턴이 끝날 때 체력 3 회복',
    hooks: {
      onUnitTurnEnd(c, s) {
        c.heal(s.unit, 3);
      },
    },
  },
  {
    id: 'a2-possessed',
    name: '빙의',
    desc: '체력이 절반 이하가 되면 몸속의 악령이 빠져나온다 (수도사는 힘 -2)',
    hooks: {
      onDamageTaken(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.exorcised || e.hp <= 0 || hpPct(e) > 0.5) return;
        e.mem.exorcised = 1;
        c.emit({ t: 'text', uid: e.uid, text: '입에서 검은 것이 기어 나온다', tone: 'eldritch' });
        c.apply(e, 'str', -2, e);
        c.spawn('loose-spirit', 1);
        c.loseSanity(3, true);
      },
    },
  },
  {
    id: 'a2-slippery',
    name: '미끄러운 몸',
    desc: '근접 공격으로 받는 피해 25% 감소',
    hooks: {
      modDamageIn(_c, _s, d) {
        if (d.melee && d.attack) d.mult *= 0.75;
      },
    },
  },
  {
    id: 'a2-crescendo',
    name: '크레셴도',
    desc: '지휘할 때마다 크레셴도가 쌓이고, 3이 되면 대합창을 준비한다. 준비 중에 붕괴시키면 처음부터 다시 쌓아야 한다',
    hooks: {},
  },
  {
    id: 'a2-mortify',
    name: '고행',
    desc: '체력이 처음 절반 이하가 되면 힘 +2',
    hooks: {
      onDamageTaken(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.mortified || e.hp <= 0 || hpPct(e) > 0.5) return;
        e.mem.mortified = 1;
        c.apply(e, 'str', 2, e);
        c.emit({ t: 'text', uid: e.uid, text: '고통이 곧 기도다', tone: 'eldritch' });
      },
    },
  },
  {
    id: 'a2-adaptive',
    name: '성유물의 가호',
    desc: '마지막으로 받은 공격의 속성에 대해 피해 50% 저항 (속성을 바꿔 가며 공격할 것). 자기 턴이 시작되면 적응이 풀린다',
    hooks: {
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || !d.attack || d.type === 'true' || e.hp <= 0) return;
        if (e.resist[d.type] === 0.5 && Object.keys(e.resist).length === 1) return;
        e.resist = { [d.type]: 0.5 };
        c.emit({ t: 'text', uid: e.uid, text: `${DMG_KO[d.type]}에 적응했다`, tone: 'info' });
      },
      onUnitTurnStart(_c, s) {
        if (isEnemy(s.unit)) s.unit.resist = {};
      },
    },
  },
  {
    id: 'a2-offering-rite',
    name: '제물 의식',
    desc: '결박된 제물을 바쳐 회복하고 강해진다. 대사제가 쓰러지면 제물들은 풀려나 달아난다',
    hooks: {
      onDeath(c, s) {
        if (!isEnemy(s.unit) || !s.unit.dead) return;
        for (const o of c.alive.filter((x) => x.def === 'offering')) {
          c.emit({ t: 'text', uid: o.uid, text: '사슬을 끊고 달아난다', tone: 'good' });
          c.flee(o);
        }
      },
    },
  },
  {
    id: 'a2-innocent',
    name: '무고한 자',
    desc: '직접 죽이면 정신력 -2',
    hooks: {
      onDeath(c, _s, d) {
        if (d && d.src === c.p) {
          c.emit({ t: 'text', uid: 'p', text: '무고한 피가 손에 묻었다', tone: 'bad' });
          c.loseSanity(2);
        }
      },
    },
  },
  {
    id: 'a2-pack-lord',
    name: '무리의 왕',
    desc: '구울 왕이 쓰러지면 새끼들은 흩어져 달아난다',
    hooks: {
      onDeath(c, s) {
        if (!isEnemy(s.unit) || !s.unit.dead) return;
        for (const pup of c.alive.filter((x) => x.def === 'ghoul-pup')) c.flee(pup);
      },
    },
  },
  {
    id: 'a2-submerged',
    name: '심해의 몸',
    desc: '후열(물속)에 있는 동안 받는 피해 30% 감소, 자기 턴이 끝날 때 체력 6 회복. 심해의 자손이 모두 쓰러지면 물 밖으로 끌려 나와 취약해진다',
    hooks: {
      modDamageIn(_c, s, d) {
        if (isEnemy(s.unit) && s.unit.row === 1) d.mult *= 0.7;
      },
      onUnitTurnEnd(c, s) {
        if (isEnemy(s.unit) && s.unit.row === 1) c.heal(s.unit, 6);
      },
      onAnyDeath(c, s, victim) {
        const e = s.unit;
        if (!isEnemy(e) || !isEnemy(victim) || victim.def !== 'deep-spawn') return;
        if (!e.mem.sub || e.row !== 1 || countDef(c, 'deep-spawn') > 0) return;
        if (!c.moveRow(e, 0)) return;
        e.mem.sub = 0;
        e.mem.stranded = 1;
        c.emit({ t: 'text', uid: e.uid, text: '물 밖으로 끌려 나왔다!', tone: 'good' });
        c.apply(e, 'vuln', 2, c.p);
        if (e.broken !== 2 && c.s.phase === 'player') c.planIntent(e);
      },
    },
  },
  {
    id: 'a2-great-bell',
    name: '대종',
    desc: '종지기는 이 종이 있어야 타종할 수 있다. 종이 깨지면 종지기가 비틀거리다(기절 1) 격노한다(힘 +3)',
    hooks: {
      onDeath(c, s) {
        const bk = c.alive.find((x) => x.def === 'bellkeeper');
        if (!bk) return;
        c.emit({ t: 'text', uid: bk.uid, text: '대종이 깨졌다 — 종지기가 비틀거린다', tone: 'good' });
        c.apply(bk, 'stun', 1, s.unit);
        c.apply(bk, 'str', 3, s.unit);
      },
    },
  },
  {
    id: 'a2-bell-bound',
    name: '종에 묶인 자',
    desc: '대종을 울릴 때마다 강해진다. 종이 세 번 울리면 마지막 종을 친다 — 대종을 깨뜨리면 막을 수 있다',
    hooks: {
      onDeath(c, s) {
        if (!isEnemy(s.unit) || !s.unit.dead) return;
        for (const b of c.alive.filter((x) => x.def === 'great-bell')) {
          c.emit({ t: 'text', uid: b.uid, text: '종이 마지막으로 울리고 떨어진다', tone: 'eldritch' });
          c.kill(b);
        }
      },
    },
  },
  {
    id: 'a2-lure',
    name: '어둠의 사냥꾼',
    desc: '등불이 25 미만이면 공격 피해 +25%. 미끼 불빛으로 등불을 빼앗는다. 물속에 숨어 얻은 회피는 자기 턴이 오면 사라진다',
    hooks: {
      modDamageOut(c, _s, d) {
        if (d.attack && c.run.light < 25) d.mult *= 1.25;
      },
      onUnitTurnStart(c, s) {
        c.clear(s.unit, 'evasive');
      },
    },
  },
  {
    id: 'a2-miracle',
    name: '거꾸로 된 기적',
    desc: '기적을 준비하는 동안 붕괴시키지 못하면 크게 회복하고 해로운 효과를 털어낸다',
    hooks: {},
  },
]);

// ───────────── 일반 적 ─────────────

reg.enemies([
  {
    id: 'chorister',
    name: '익사한 성가대원',
    icon: 'gi:sing',
    act: 2,
    tier: 'normal',
    hp: [32, 36],
    poise: 3,
    weak: ['blunt', 'void'],
    row: 1,
    dread: 2,
    tags: ['cult', 'undead'],
    traits: ['a2-chorus'],
    desc: '물에 잠긴 성가대석에서 아직도 저녁 기도를 부르는 아이들. 입을 벌릴 때마다 검은 물이 흐른다.',
    moves: {
      hymn0: hymn(0),
      hymn1: hymn(1),
      hymn2: hymn(2),
      hymn3: hymn(3),
      discord: mv.attack('불협화음', 4, { hits: 2, melee: false, type: 'arcane' }),
      harmony: mv.block('화음', 0, {
        then(c) {
          for (const a of c.alive) c.gainBlock(a, 5);
        },
        desc: '모든 아군 방어도 5',
      }),
    },
    ai: (c, e) => {
      const h = `hymn${Math.min(3, choirOthers(c, e))}`;
      return pick(c, e, { [h]: 2, discord: 2, harmony: others(c, e).length ? 1 : 0 });
    },
    visual: { tint: 0x4a5a66, glow: 0x9fe0ff, scale: 0.85, fx: ['drip', 'float'] },
  },
  {
    id: 'abbey-priest',
    name: '심해교 사제',
    icon: 'gi:warlock-hood',
    act: 2,
    tier: 'normal',
    hp: [38, 42],
    poise: 4,
    weak: ['pierce', 'void'],
    row: 1,
    tags: ['cult'],
    desc: '수도원의 제단을 심해의 신에게 바친 자들. 의식이 길어질수록 그 목소리는 사람의 것이 아니게 된다.',
    moves: {
      rite: mv.buff(
        '의식 집전',
        (c, e) => {
          e.mem.rite = 1;
          c.apply(e, 'ritual', 1, e);
        },
        { desc: '의식 1 — 매 턴 힘 +1' },
      ),
      communion: mv.buff(
        '검은 성찬',
        (c, e) => {
          for (const a of c.alive) {
            c.apply(a, 'str', 1, e);
            c.heal(a, 4);
          }
        },
        { extra: ['heal'], desc: '모든 아군 힘 +1, 체력 4 회복' },
      ),
      curse: mv.horror('저주의 설교', 6, { then: (c, e) => void c.apply(c.p, 'weak', 1, e) }),
      smite: mv.attack('심해의 인장', 7, { melee: false, type: 'arcane' }),
    },
    ai: (c, e) => (e.mem.rite ? pick(c, e, { smite: 3, curse: 2, communion: others(c, e).length ? 2 : 1 }) : 'rite'),
    visual: { tint: 0x3a3550, glow: 0x7a60e0, fx: ['flicker'] },
  },
  {
    id: 'martyr',
    name: '순교자',
    icon: 'gi:crown-of-thorns',
    act: 2,
    tier: 'normal',
    hp: [40, 46],
    poise: 3,
    weak: ['pierce', 'arcane'],
    row: 0,
    tags: ['cult'],
    traits: ['a2-martyrdom'],
    desc: '가시관을 쓰고 스스로를 채찍질하는 광신도. 죽음조차 동료에게 바치는 공물이다.',
    moves: {
      scourge: mv.buff(
        '자기 채찍질',
        (c, e) => {
          e.mem.sc = (e.mem.sc ?? 0) + 1;
          c.loseHp(e, 5);
          if (!e.dead) c.apply(e, 'str', 2, e);
        },
        { desc: '체력 5를 잃고 힘 +2' },
      ),
      chain: mv.attack('가시 사슬', 9, { type: 'slash' }),
      embrace: mv.attack('피의 포옹', 5, { then: (c, e) => void c.apply(c.p, 'bleed', 2, e) }),
    },
    ai: (c, e) => pick(c, e, { chain: 3, embrace: 2, scourge: e.hp > 15 && (e.mem.sc ?? 0) < 2 ? 2 : 0 }),
    visual: { tint: 0x7a4a48, glow: 0xff5040 },
  },
  {
    id: 'crypt-ghoul',
    name: '납골당 구울',
    icon: 'gi:bone-gnawer',
    act: 2,
    tier: 'normal',
    hp: [44, 50],
    poise: 4,
    weak: ['fire', 'pierce'],
    row: 0,
    tags: ['undead', 'ghoul'],
    traits: ['a2-corpse-eater'],
    desc: '개를 닮은 얼굴로 납골당의 뼈를 갉는 것. 갓 쓰러진 것을 가장 좋아한다.',
    moves: {
      claw: mv.attack('할퀴기', 7, { type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 1, e) }),
      gnaw: mv.attack('뼈 갉기', 3, { hits: 3, type: 'slash' }),
      feast: {
        name: '시체 포식',
        intent: 'heal',
        extra: ['buff'],
        desc: '쓰러진 자의 시체를 먹어 체력 14 회복, 힘 +2',
        run(c, e) {
          if (!eatCorpse(c)) {
            c.emit({ t: 'text', uid: e.uid, text: '먹을 것이 없다', tone: 'info' });
            return;
          }
          c.emit({ t: 'text', uid: e.uid, text: '시체를 뜯어먹는다', tone: 'bad' });
          c.heal(e, 14);
          c.apply(e, 'str', 2, e);
        },
      },
    },
    ai: (c, e) => {
      if (corpses(c) > 0 && last(e) !== 'feast') return pick(c, e, { feast: hpPct(e) < 0.9 ? 5 : 2, claw: 2, gnaw: 1 });
      return pick(c, e, { claw: 3, gnaw: 2 });
    },
    visual: { tint: 0x6a6a58, glow: 0xc0ff60 },
  },
  {
    id: 'scaled-friar',
    name: '비늘 돋은 수사',
    icon: 'gi:frog',
    act: 2,
    tier: 'normal',
    hp: [48, 54],
    poise: 4,
    weak: ['blunt', 'arcane'],
    row: 0,
    tags: ['deep', 'cult'],
    traits: ['a2-gills'],
    desc: '수도복 아래로 비늘이 돋고 목에는 아가미가 열렸다. 그래도 매일 아침 기도를 거르지 않는다.',
    moves: {
      trident: mv.attack('삼지창 찌르기', 9, { type: 'pierce' }),
      drag: mv.attack('물밑으로 끌기', 6, { then: (c, e) => void c.apply(c.p, 'frail', 2, e) }),
      scales: mv.block('비늘 세우기', 10),
    },
    ai: (c, e) => opener(c, e, ['trident']) ?? pick(c, e, { trident: 3, drag: 2, scales: hpPct(e) < 0.6 ? 2 : 1 }),
    visual: { tint: 0x3f6a5a, glow: 0x60ffb0, fx: ['drip'] },
  },
  {
    id: 'possessed-monk',
    name: '빙의된 수도사',
    icon: 'gi:monk-face',
    act: 2,
    tier: 'normal',
    hp: [46, 52],
    poise: 4,
    weak: ['arcane', 'blunt'],
    row: 0,
    dread: 2,
    tags: ['cult'],
    traits: ['a2-possessed'],
    desc: '두 개의 목소리로 동시에 기도한다. 하나는 살려 달라고, 하나는 들어오라고.',
    moves: {
      spasm: mv.attack('발작', 4, { hits: 2 }),
      voice: mv.horror('낯선 목소리', 6),
      fist: mv.attack('뒤틀린 주먹', 9),
      pray: mv.block('흐느끼는 기도', 8),
    },
    ai: (c, e) =>
      e.mem.exorcised ? pick(c, e, { fist: 2, pray: 2, spasm: 1 }) : pick(c, e, { spasm: 2, voice: 2, fist: 2 }),
    visual: { tint: 0x5a5048, glow: 0xff3060, fx: ['flicker'] },
  },
  {
    id: 'loose-spirit',
    name: '빠져나온 악령',
    icon: 'gi:ghost',
    act: 2,
    tier: 'minion',
    hp: [14, 16],
    poise: 0,
    weak: ['arcane', 'fire'],
    row: 1,
    eldritch: true,
    traits: ['incorporeal'],
    moves: {
      whisper: mv.horror('귓속말', 4),
      chill: mv.attack('냉기', 5, { melee: false, type: 'void' }),
      fade: {
        name: '흩어짐',
        intent: 'flee',
        desc: '깃들 몸이 없는 악령은 오래 버티지 못한다',
        run(c, e) {
          c.emit({ t: 'text', uid: e.uid, text: '악령이 연기처럼 흩어진다', tone: 'info' });
          c.flee(e);
        },
      },
    },
    // 세 번 행동하면 흩어진다
    ai: (_c, e) => {
      e.mem.acts = (e.mem.acts ?? 0) + 1;
      return e.mem.acts > 3 ? 'fade' : cycle(e, ['whisper', 'chill']);
    },
    visual: { tint: 0x2a2630, glow: 0xff3060, scale: 0.6, fx: ['float', 'flicker'] },
  },
  {
    id: 'drowned-nun',
    name: '물에 잠긴 수녀',
    icon: 'gi:nun-face',
    act: 2,
    tier: 'normal',
    hp: [36, 40],
    poise: 3,
    weak: ['fire', 'slash'],
    row: 1,
    tags: ['undead'],
    desc: '수녀원이 가라앉던 밤, 그들은 문을 걸어 잠그고 끝까지 기도했다.',
    moves: {
      lament: mv.horror('익사자의 기도', 6, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      veil: mv.buff(
        '물의 장막',
        (c, e) => {
          const t = mostHurt(c) ?? e;
          c.apply(t, 'barrier', 8, e);
        },
        { desc: '가장 다친 아군에게 보호막 8' },
      ),
      touch: mv.attack('젖은 손길', 6, { melee: false, type: 'void', then: (c, e) => void c.apply(c.p, 'frail', 1, e) }),
    },
    ai: (c, e) => pick(c, e, { touch: 3, lament: 2, veil: c.alive.some((a) => hpPct(a) < 0.8) ? 2 : 0 }),
    visual: { tint: 0x40566a, glow: 0x80c0ff, fx: ['drip', 'float'] },
  },
  {
    id: 'bell-acolyte',
    name: '타종 수련사',
    icon: 'gi:hooded-figure',
    act: 2,
    tier: 'normal',
    hp: [32, 36],
    poise: 3,
    weak: ['slash', 'void'],
    row: 1,
    tags: ['cult'],
    desc: '종탑의 밧줄을 당기는 견습들. 고막은 오래전에 터졌지만 종소리는 여전히 들린다고 한다.',
    moves: {
      clang: mv.attack('공명', 6, { melee: false, type: 'arcane' }),
      toll: mv.horror('작은 종', 4, {
        desc: '다른 교단 아군 모두 힘 +1',
        then(c, e) {
          for (const a of c.alive) if (a !== e && hasTag(a, 'cult')) c.apply(a, 'str', 1, e);
        },
      }),
    },
    ai: (_c, e) => cycle(e, ['clang', 'toll', 'clang']),
    visual: { tint: 0x5a4a3a, glow: 0xffc060 },
  },
  {
    id: 'lamprey',
    name: '칠성장어',
    icon: 'gi:lamprey-mouth',
    act: 2,
    tier: 'normal',
    hp: [30, 34],
    poise: 2,
    weak: ['slash', 'fire'],
    row: 0,
    tags: ['deep', 'beast'],
    traits: ['a2-slippery'],
    desc: '침수된 회랑의 물속에서 무엇이든 들러붙어 빨아먹는다. 수도사들은 이것을 "회개하지 않는 혀"라 불렀다.',
    moves: {
      latch: {
        name: '흡착',
        intent: 'attack',
        extra: ['heal'],
        dmg: 5,
        melee: true,
        desc: '출혈 2. 입힌 피해만큼 회복',
        run(c, e) {
          const ds = c.enemyAttack(e, { type: 'pierce' });
          if (c.over || e.dead) return;
          c.apply(c.p, 'bleed', 2, e);
          const n = ds.reduce((s, d) => s + d.hpLoss, 0);
          if (n > 0) c.heal(e, n);
        },
      },
      thrash: mv.attack('몸부림', 3, { hits: 2 }),
    },
    ai: (c, e) => pick(c, e, { latch: 3, thrash: 2 }),
    visual: { tint: 0x5a4a5a, glow: 0xff7090, scale: 0.8, fx: ['drip'] },
  },
  {
    id: 'pale-eel',
    name: '창백한 뱀장어',
    icon: 'gi:eel',
    act: 2,
    tier: 'normal',
    hp: [30, 34],
    poise: 3,
    weak: ['pierce', 'blunt'],
    row: 1,
    tags: ['deep', 'beast'],
    desc: '빛을 본 적 없는 물에서 자란 뱀장어. 몸에 흐르는 전류가 생각을 마비시킨다.',
    moves: {
      shock: mv.attack('감전', 5, { melee: false, type: 'arcane' }),
      coil: mv.charge('전기를 모은다', 9),
      discharge: release(
        mv.attack('방전', 9, {
          melee: false,
          type: 'arcane',
          desc: '침묵 1 — 다음 턴엔 기본기만 쓸 수 있다',
          then: (c, e) => void c.apply(c.p, 'silence', 1, e),
        }),
      ),
    },
    ai: (_c, e) => (e.mem.charge ? 'discharge' : cycle(e, ['shock', 'coil', 'shock'])),
    visual: { tint: 0xc8d0d8, glow: 0x80f0ff, scale: 0.9, fx: ['float'] },
  },
  {
    id: 'confessor',
    name: '고해 신부',
    icon: 'gi:cowled',
    act: 2,
    tier: 'normal',
    hp: [40, 44],
    poise: 4,
    weak: ['void', 'slash'],
    row: 0,
    tags: ['cult'],
    desc: '모든 죄를 들어주고, 모든 죄를 기록한다. 그 장부는 바다 밑의 누군가에게 바쳐진다.',
    moves: {
      penance: mv.attack('참회의 매', 8, { then: (c, e) => void c.apply(c.p, 'vuln', 1, e) }),
      confess: {
        ...mv.horror('고해 강요', 4, { desc: '이번 턴 당신이 쓴 스킬 1개당 정신 피해 +1 (최대 +5)' }),
        run(c, e) {
          c.horror(e, 4 + Math.min(5, c.s.used));
        },
      },
      absolve: {
        name: '사면',
        intent: 'heal',
        desc: '가장 다친 아군 체력 10 회복',
        run(c, e) {
          c.heal(mostHurt(c) ?? e, 10);
        },
      },
    },
    ai: (c, e) => pick(c, e, { penance: 3, confess: 2, absolve: c.alive.some((a) => hpPct(a) < 0.7) ? 2 : 0 }),
    visual: { tint: 0x2e2a30, glow: 0xd0b070 },
  },
  {
    id: 'font-tentacle',
    name: '성수반의 촉수',
    icon: 'gi:spiked-tentacle',
    act: 2,
    tier: 'normal',
    hp: [34, 38],
    poise: 3,
    weak: ['fire', 'arcane'],
    row: 1,
    dread: 3,
    eldritch: true,
    tags: ['deep'],
    desc: '세례반의 바닥은 바다와 이어져 있다. 그 아래에서 무언가가 세례를 기다린다.',
    moves: {
      lash: mv.attack('촉수 채찍', 7, { melee: false, type: 'void' }),
      baptize: mv.horror('검은 세례', 4, {
        desc: '부식 1 — 받는 피해 +1 (전투 동안)',
        then: (c, e) => void c.apply(c.p, 'corrode', 1, e),
      }),
      squeeze: mv.attack('휘감아 조이기', 3, { hits: 2, melee: false, then: (c, e) => void c.apply(c.p, 'weak', 1, e) }),
    },
    ai: (_c, e) => cycle(e, ['lash', 'baptize', 'squeeze', 'lash']),
    visual: { tint: 0x1a2a30, glow: 0x40ffd0, fx: ['float'] },
  },

  // ───────────── 정예 ─────────────
  {
    id: 'flagellant',
    name: '대고행자',
    icon: 'gi:whip',
    act: 2,
    tier: 'elite',
    hp: [140, 148],
    poise: 7,
    weak: ['fire', 'void', 'pierce'],
    row: 0,
    dread: 3,
    tags: ['cult'],
    traits: ['a2-mortify'],
    desc: '백 년 동안 하루도 빠짐없이 자신을 채찍질했다. 이제 그의 피는 가시처럼 단단하다.',
    moves: {
      scourge: mv.buff(
        '피의 고행',
        (c, e) => {
          c.loseHp(e, 8);
          if (e.dead) return;
          c.apply(e, 'str', 2, e);
          c.apply(e, 'thorns', 2, e);
        },
        { desc: '체력 8을 잃고 힘 +2, 가시 2 (근접 공격하면 반사 피해)' },
      ),
      lash: mv.attack('가시 채찍', 3, { hits: 3, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 1, e) }),
      sermon: mv.horror('참회하라', 7, { then: (c, e) => void c.apply(c.p, 'weak', 1, e) }),
      windup: mv.charge('백 번의 채찍질', 5, { hits: 4 }),
      rain: release(mv.attack('백 번의 채찍질', 5, { hits: 4, type: 'slash' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'rain';
      const m = opener(c, e, ['scourge']) ?? cycle(e, ['lash', 'sermon', 'windup', 'scourge']);
      return m === 'scourge' && e.hp <= 16 ? 'lash' : m;
    },
    visual: { tint: 0x6a3a3a, glow: 0xff3a30, scale: 1.2 },
  },
  {
    id: 'choirmaster',
    name: '성가대장',
    icon: 'gi:music-spell',
    act: 2,
    tier: 'elite',
    hp: [124, 130],
    poise: 6,
    weak: ['blunt', 'pierce'],
    row: 1,
    dread: 3,
    tags: ['cult', 'undead'],
    traits: ['a2-chorus', 'a2-crescendo'],
    desc: '익사한 아이들을 지휘하는 자. 그가 지휘봉을 들면 물 밑의 모든 입이 동시에 열린다.',
    moves: {
      conduct1: conduct(1),
      conduct2: conduct(2),
      conduct3: conduct(3),
      solo: mv.horror('독창', 6),
      baton: mv.attack('지휘봉', 8, { melee: false, type: 'arcane', then: (c, e) => void c.apply(c.p, 'weak', 1, e) }),
      gather: mv.summon(
        '성가대 소집',
        (c, e) => {
          e.mem.gathers = (e.mem.gathers ?? 0) + 1;
          c.spawn('chorister', 0);
        },
        '익사한 성가대원 소환',
      ),
      prelude: {
        ...mv.charge('대합창 준비', 5),
        hits: (c) => 1 + countDef(c, 'chorister'),
        desc: '다음 턴 대합창 — 살아 있는 성가대원 1명당 1회 추가 타격 (붕괴시키면 취소)',
      },
      grand: release({
        ...mv.horror('대합창', 6, { dmg: 5, desc: '성가대원 1명당 정신 피해 +2' }),
        hits: (c) => 1 + countDef(c, 'chorister'),
        run(c, e) {
          e.mem.cres = 0;
          const choir = countDef(c, 'chorister');
          c.enemyAttack(e, { type: 'arcane', hits: 1 + choir });
          if (!c.over) c.horror(e, 6 + 2 * choir);
        },
      }),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'grand';
      // 준비하던 대합창이 붕괴로 끊겼다
      if (last(e) === 'prelude') e.mem.cres = 0;
      const cres = e.mem.cres ?? 0;
      if (cres >= 3) return 'prelude';
      if (countDef(c, 'chorister') < 2 && (e.mem.gathers ?? 0) < 1 && last(e) !== 'gather' && c.alive.length < 6) return 'gather';
      const m = cycle(e, ['conduct', 'solo', 'conduct', 'baton']);
      return m === 'conduct' ? `conduct${Math.min(3, cres + 1)}` : m;
    },
    visual: { tint: 0x30384a, glow: 0xa0c0ff, scale: 1.2, fx: ['float', 'drip'] },
  },
  {
    id: 'reliquary',
    name: '살아있는 성유물함',
    icon: 'gi:mimic-chest',
    act: 2,
    tier: 'elite',
    hp: [140, 150],
    poise: 7,
    weak: ['blunt', 'void'],
    row: 0,
    dread: 4,
    eldritch: true,
    traits: ['a2-adaptive'],
    desc: '성인의 유골을 모신 함. 수백 년의 기도를 받아먹고 눈을 떴다.',
    moves: {
      lid: mv.attack('뚜껑 물기', 11, { then: (c, e) => void c.apply(c.p, 'vuln', 1, e) }),
      shards: mv.attack('뼛조각 분출', 4, { hits: 3, melee: false, type: 'pierce' }),
      gaze: mv.horror('성인의 눈', 8, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      bless: mv.buff(
        '성유물의 축복',
        (c, e) => {
          c.heal(e, 12);
          c.gainBlock(e, 12);
        },
        { extra: ['heal', 'block'], desc: '체력 12 회복, 방어도 12' },
      ),
      open: mv.charge('봉인이 열린다', 26),
      wrath: release(mv.horror('성인의 분노', 8, { dmg: 26 })),
    },
    ai: (_c, e) => (e.mem.charge ? 'wrath' : cycle(e, ['lid', 'shards', 'gaze', 'open', 'bless', 'shards'])),
    visual: { tint: 0x7a6040, glow: 0xffe0a0, scale: 1.25, fx: ['flicker'] },
  },

  // ───────────── 층 수호자 ─────────────
  {
    id: 'high-priest',
    name: '대사제',
    icon: 'gi:pope-crown',
    act: 2,
    tier: 'boss',
    hp: [260, 260],
    poise: 11,
    weak: ['slash', 'void'],
    row: 0,
    dread: 5,
    tags: ['cult'],
    traits: ['a2-offering-rite'],
    desc: '가라앉은 수도원의 마지막 대사제. 그는 수도원을 바다에 바쳤고, 바다는 그에게 영생을 주었다.',
    moves: {
      blade: mv.attack('제례검', 11, { type: 'slash' }),
      sermon: mv.horror('심연의 설교', 7, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      offer: mv.buff(
        '봉헌',
        (c, e) => {
          const o = c.alive.find((x) => x.def === 'offering');
          if (!o) {
            c.emit({ t: 'text', uid: e.uid, text: '바칠 제물이 없다', tone: 'good' });
            return;
          }
          c.emit({ t: 'text', uid: o.uid, text: '제물의 비명', tone: 'eldritch' });
          c.kill(o);
          c.apply(e, 'str', 2, e);
          c.heal(e, 18);
          c.loseSanity(5, true);
        },
        { extra: ['heal', 'horror'], desc: '제물 하나를 죽여 힘 +2, 체력 18 회복. 정신력 -5' },
      ),
      bind: mv.summon(
        '제물 결박',
        (c, e) => {
          e.mem.binds = (e.mem.binds ?? 0) + 1;
          c.spawn('offering', 1);
          c.spawn('offering', 1);
        },
        '결박된 제물 2명',
      ),
      call: mv.summon('신도 소집', (c) => void c.spawn('abbey-priest', 1), '심해교 사제 소환'),
      prepare: mv.charge('심연 강림', 28),
      descend: release(mv.attack('심연 강림', 28, { melee: false, type: 'void' })),
    },
    onSpawn: (c) => {
      c.spawn('offering', 1);
      c.spawn('offering', 1);
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'descend';
      if (hpPct(e) <= 0.5 && !e.mem.p2) {
        e.mem.p2 = 1;
        return 'call';
      }
      const offerings = countDef(c, 'offering');
      const noOffer = (e.mem.binds ?? 0) < 1 && c.row(1).length <= 1 ? 'bind' : 'blade';
      if (e.mem.p2) {
        const m = cycle(e, ['blade', 'offer', 'prepare', 'sermon'], 'c2');
        return m === 'offer' && !offerings ? noOffer : m;
      }
      const m = cycle(e, ['sermon', 'blade', 'offer', 'blade']);
      return m === 'offer' && !offerings ? noOffer : m;
    },
    visual: { tint: 0x40305a, glow: 0xc080ff, scale: 1.4, fx: ['flicker'] },
  },
  {
    id: 'offering',
    name: '결박된 제물',
    icon: 'gi:manacles',
    act: 2,
    tier: 'minion',
    hp: [16, 18],
    poise: 0,
    weak: ['slash', 'pierce', 'blunt'],
    row: 1,
    traits: ['a2-innocent'],
    moves: {
      plead: {
        name: '애원',
        intent: 'special',
        desc: '아무것도 하지 못한다',
        run(c, e) {
          c.emit({ t: 'text', uid: e.uid, text: '살려 주세요…', tone: 'info' });
        },
      },
    },
    ai: () => 'plead',
    visual: { tint: 0x8a7a6a, glow: 0xe0d0b0, scale: 0.7 },
  },
  {
    id: 'ghoul-king',
    name: '구울 왕',
    icon: 'gi:throne-king',
    act: 2,
    tier: 'boss',
    hp: [275, 275],
    poise: 11,
    weak: ['fire', 'pierce'],
    row: 0,
    dread: 5,
    tags: ['undead', 'ghoul'],
    traits: ['a2-corpse-eater', 'a2-pack-lord'],
    desc: '납골당 깊은 곳, 뼈로 쌓은 왕좌에 앉은 것. 수도원의 모든 죽음은 결국 그의 식탁에 오른다.',
    moves: {
      rend: mv.attack('왕의 손톱', 6, { hits: 2, type: 'slash', then: (c, e) => void c.apply(c.p, 'bleed', 1, e) }),
      howl: mv.horror('굶주린 포효', 7, {
        desc: '새끼들 힘 +2',
        then(c, e) {
          for (const pup of c.alive.filter((x) => x.def === 'ghoul-pup')) c.apply(pup, 'str', 2, e);
        },
      }),
      feast: {
        name: '왕의 만찬',
        intent: 'heal',
        extra: ['buff'],
        desc: '시체를 먹어 체력 16 회복, 힘 +1. 시체가 없으면 제 새끼를 산 채로 삼킨다',
        run(c, e) {
          e.mem.feasts = (e.mem.feasts ?? 0) + 1;
          if (eatCorpse(c)) {
            c.emit({ t: 'text', uid: e.uid, text: '시체를 통째로 삼킨다', tone: 'bad' });
            c.heal(e, 16);
            c.apply(e, 'str', 1, e);
            return;
          }
          const pup = c.alive.find((x) => x.def === 'ghoul-pup');
          if (!pup) {
            c.emit({ t: 'text', uid: e.uid, text: '먹을 것이 없다', tone: 'good' });
            return;
          }
          c.emit({ t: 'text', uid: e.uid, text: '제 새끼를 산 채로 삼킨다', tone: 'eldritch' });
          c.kill(pup);
          c.s.vars.a2eaten = (c.s.vars.a2eaten ?? 0) + 1;
          c.heal(e, 24);
          c.apply(e, 'str', 1, e);
          c.loseSanity(4, true);
        },
      },
      call: mv.summon(
        '무리 부르기',
        (c, e) => {
          e.mem.calls = (e.mem.calls ?? 0) + 1;
          c.spawn('ghoul-pup', 0);
          c.spawn('ghoul-pup', 0);
        },
        '구울 새끼 2마리 소환',
      ),
      prep: mv.charge('뼈 왕좌의 일격', 26),
      crush: release(mv.attack('뼈 왕좌의 일격', 26)),
    },
    onSpawn: (c) => {
      c.spawn('ghoul-pup', 0);
      c.spawn('ghoul-pup', 0);
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'crush';
      const pups = countDef(c, 'ghoul-pup');
      const food = corpses(c) > 0 || (pups > 0 && hpPct(e) < 0.5);
      if (food && hpPct(e) < 0.85 && last(e) !== 'feast' && (e.mem.feasts ?? 0) < 6) return 'feast';
      if (pups === 0 && (e.mem.calls ?? 0) < 2) return 'call';
      return cycle(e, ['rend', 'howl', 'rend', 'prep']);
    },
    visual: { tint: 0x8a8070, glow: 0xff4030, scale: 1.45 },
  },
  {
    id: 'ghoul-pup',
    name: '구울 새끼',
    icon: 'gi:hyena-head',
    act: 2,
    tier: 'minion',
    hp: [16, 18],
    poise: 0,
    weak: ['fire', 'slash'],
    row: 0,
    tags: ['undead', 'ghoul'],
    moves: {
      bite: mv.attack('물기', 4, { type: 'slash' }),
      scratch: mv.attack('할퀴기', 3, { hits: 2, type: 'slash' }),
    },
    ai: (c, e) => pick(c, e, { bite: 3, scratch: 2 }),
    visual: { tint: 0x6a6450, glow: 0xc0ff60, scale: 0.65 },
  },
  {
    id: 'deep-lord',
    name: '심해 군주',
    icon: 'gi:octoman',
    act: 2,
    tier: 'boss',
    hp: [270, 270],
    poise: 12,
    weak: ['arcane', 'blunt'],
    row: 0,
    dread: 6,
    eldritch: true,
    tags: ['deep'],
    traits: ['a2-submerged'],
    desc: '수도원의 지하 저수조는 바다로 이어져 있었다. 교단이 부른 것은 신이 아니라 그 신의 사제였다.',
    moves: {
      trident: mv.attack('삼지창', 10, { type: 'pierce' }),
      sweep: mv.attack('꼬리 휩쓸기', 5, { hits: 2, then: (c, e) => void c.apply(c.p, 'frail', 1, e) }),
      prep: mv.charge('해일을 일으킨다', 27),
      wave: release(mv.attack('해일', 27, { melee: false })),
      dive: {
        name: '잠수',
        intent: 'retreat',
        extra: ['summon'],
        desc: '심해의 자손 2마리를 부르고 물속(후열)으로 가라앉는다',
        run(c, e) {
          e.mem.dives = (e.mem.dives ?? 0) + 1;
          e.mem.upT = 0;
          e.mem.subT = 0;
          c.spawn('deep-spawn', 0);
          c.spawn('deep-spawn', 0);
          if (c.moveRow(e, 1)) {
            e.mem.sub = 1;
            c.emit({ t: 'text', uid: e.uid, text: '검은 물속으로 가라앉는다', tone: 'eldritch' });
          }
        },
      },
      jet: mv.attack('수압 분사', 8, { melee: false }),
      song: mv.horror('심해의 노래', 6, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      surface: {
        name: '부상',
        intent: 'advance',
        desc: '물 위로 떠오른다',
        run(c, e) {
          c.moveRow(e, 0);
          e.mem.sub = 0;
          e.mem.upT = 0;
        },
      },
      gasp: {
        name: '헐떡임',
        intent: 'special',
        desc: '물 밖으로 끌려 나와 숨을 고른다 (행동 없음)',
        run(c, e) {
          delete e.mem.stranded;
          e.mem.upT = 0;
          c.emit({ t: 'text', uid: e.uid, text: '아가미가 헛되이 벌떡인다', tone: 'good' });
        },
      },
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'wave';
      if (e.mem.stranded) return 'gasp';
      if (e.mem.sub) {
        if (e.row === 0) {
          e.mem.sub = 0;
          e.mem.stranded = 1;
          return 'gasp';
        }
        e.mem.subT = (e.mem.subT ?? 0) + 1;
        if (e.mem.subT >= 4 && c.row(0).length < 3) return 'surface';
        return cycle(e, ['jet', 'song'], 'cs');
      }
      e.mem.upT = (e.mem.upT ?? 0) + 1;
      if (e.mem.upT >= 4 && (e.mem.dives ?? 0) < 3 && c.row(1).length < 3) return 'dive';
      return cycle(e, ['trident', 'sweep', 'prep', 'trident'], 'cu');
    },
    visual: { tint: 0x1f3a40, glow: 0x30ffd0, scale: 1.5, fx: ['drip', 'float'] },
  },
  {
    id: 'deep-spawn',
    name: '심해의 자손',
    icon: 'gi:sea-creature',
    act: 2,
    tier: 'minion',
    hp: [20, 22],
    poise: 0,
    weak: ['fire', 'slash'],
    row: 0,
    tags: ['deep'],
    moves: {
      claw: mv.attack('물갈퀴 할퀴기', 5, { type: 'slash' }),
      hunch: mv.block('비늘 웅크림', 6),
    },
    ai: (c, e) => pick(c, e, { claw: 3, hunch: 1 }),
    visual: { tint: 0x2a4a48, glow: 0x50ffc0, scale: 0.7, fx: ['drip'] },
  },

  // ───────────── 계층군주 ─────────────
  {
    id: 'bellkeeper',
    name: '종지기',
    icon: 'gi:ringing-bell',
    act: 2,
    tier: 'boss',
    hp: [330, 330],
    poise: 12,
    weak: ['fire', 'void'],
    row: 0,
    dread: 7,
    eldritch: true,
    tags: ['undead'],
    traits: ['a2-bell-bound'],
    desc: '수도원이 가라앉은 뒤에도 종을 멈추지 않은 자. 그의 등은 종의 모양으로 굽었고, 심장은 종추처럼 뛴다.',
    moves: {
      hammer: mv.attack('종추 내려치기', 13),
      toll1: toll(1),
      toll2: toll(2),
      toll3: toll(3),
      summon: mv.summon(
        '수련사 소집',
        (c, e) => {
          e.mem.calls = (e.mem.calls ?? 0) + 1;
          c.spawn('bell-acolyte', 1);
        },
        '타종 수련사 소환',
      ),
      prepare: mv.charge('마지막 종을 당긴다', 30),
      doom: release({
        ...mv.horror('종말의 종', 8, { dmg: 30, type: 'arcane' }),
        run(c, e) {
          e.mem.tolls = 0;
          c.enemyAttack(e, { type: 'arcane' });
          if (!c.over) c.horror(e, 8);
        },
      }),
      flurry: mv.attack('광란의 종추', 5, { hits: 3 }),
      dirge: mv.horror('깨진 종의 장송곡', 8, { then: (c, e) => void c.apply(c.p, 'weak', 1, e) }),
    },
    onSpawn: (c) => void c.spawn('great-bell', 1),
    ai: (c, e) => {
      const bell = countDef(c, 'great-bell') > 0;
      if (e.mem.charge) {
        if (bell) return 'doom';
        delete e.mem.charge;
      }
      if (!bell) return cycle(e, ['flurry', 'hammer', 'dirge'], 'c2');
      const tolls = e.mem.tolls ?? 0;
      if (tolls >= 3) return 'prepare';
      let m = cycle(e, ['toll', 'hammer', 'toll', 'summon', 'hammer']);
      if (m === 'summon' && ((e.mem.calls ?? 0) >= 2 || countDef(c, 'bell-acolyte') >= 2 || c.row(1).length >= 3)) m = 'toll';
      return m === 'toll' ? `toll${Math.min(3, tolls + 1)}` : m;
    },
    visual: { tint: 0x4a3a2a, glow: 0xffb040, scale: 1.55, fx: ['flicker'] },
  },
  {
    id: 'great-bell',
    name: '대종',
    icon: 'gi:bell-shield',
    act: 2,
    tier: 'minion',
    hp: [60, 60],
    poise: 0,
    weak: ['blunt', 'arcane'],
    resist: { slash: 0.5 },
    row: 1,
    traits: ['a2-great-bell'],
    moves: {
      hum: mv.horror('잔향', 3),
      still: {
        name: '흔들림',
        intent: 'special',
        desc: '종이 천천히 흔들린다',
        run() {},
      },
    },
    ai: (_c, e) => cycle(e, ['hum', 'still']),
    visual: { tint: 0x7a6230, glow: 0xffd070, scale: 1.05 },
  },

  // ───────────── 추적자 / 균열 수호자 ─────────────
  {
    id: 'angler',
    name: '물밑의 아귀',
    icon: 'gi:angler-fish',
    act: 2,
    tier: 'elite',
    hp: [150, 150],
    poise: 7,
    weak: ['fire', 'pierce'],
    row: 0,
    dread: 4,
    tags: ['deep', 'beast'],
    traits: ['a2-lure'],
    desc: '침수된 회랑에서 작은 불빛이 흔들린다. 등불을 든 사람인 줄 알고 다가간 자들은 돌아오지 않았다.',
    moves: {
      lure: mv.horror('미끼 불빛', 5, {
        desc: '등불 -10, 약화 1',
        then(c, e) {
          c.run.light = Math.max(0, c.run.light - 10);
          c.emit({ t: 'text', uid: 'p', text: '등불이 흐려진다', tone: 'bad' });
          c.apply(c.p, 'weak', 1, e);
        },
      }),
      bite: mv.attack('아가리', 13, { type: 'pierce' }),
      thrash: mv.attack('휘감기', 5, { hits: 3 }),
      sink: mv.block('물속으로', 10, { then: (c, e) => void c.apply(e, 'evasive', 1, e), desc: '방어도 10, 회피 1' }),
      open: mv.charge('아가리가 열린다', 30),
      swallow: release(mv.attack('삼키기', 30, { type: 'pierce' })),
    },
    ai: (_c, e) => (e.mem.charge ? 'swallow' : cycle(e, ['lure', 'bite', 'sink', 'thrash', 'open'])),
    visual: { tint: 0x1e2830, glow: 0xfff080, scale: 1.35, fx: ['float', 'drip'] },
  },
  {
    id: 'inverted-saint',
    name: '거꾸로 매달린 성인',
    icon: 'gi:tarot-12-the-hanged-man',
    act: 2,
    tier: 'elite',
    hp: [170, 170],
    poise: 8,
    weak: ['slash', 'fire'],
    row: 0,
    dread: 5,
    eldritch: true,
    tags: ['undead'],
    traits: ['a2-miracle'],
    desc: '균열 너머의 수도원에선 모든 것이 뒤집혀 있다. 그곳의 성인은 거꾸로 매달린 채 거꾸로 된 기적을 행한다.',
    moves: {
      hymn: mv.horror('거꾸로 된 찬송', 8, { then: (c, e) => void c.apply(c.p, 'dread', 1, e) }),
      nails: mv.attack('성흔의 못', 4, { hits: 3, melee: false, type: 'pierce', then: (c, e) => void c.apply(c.p, 'bleed', 2, e) }),
      invert: {
        name: '뒤집힌 축복',
        intent: 'debuff',
        extra: ['block'],
        desc: '당신의 방어도를 모두 빼앗아 제 것으로 삼는다',
        run(c, e) {
          const b = c.p.block;
          if (b <= 0) {
            c.emit({ t: 'text', uid: e.uid, text: '빼앗을 것이 없다', tone: 'info' });
            return;
          }
          c.p.block = 0;
          c.emit({ t: 'text', uid: 'p', text: `방어도 -${b}`, tone: 'bad' });
          c.gainBlock(e, b);
        },
      },
      prepare: {
        name: '기적 준비',
        intent: 'charge',
        charging: true,
        desc: '다음 턴 체력 40을 회복하고 해로운 효과를 털어낸다 (붕괴시키면 취소)',
        run(c, e) {
          e.mem.charge = 1;
          c.emit({ t: 'text', uid: e.uid, text: '거꾸로 된 기적이 일어나려 한다…', tone: 'eldritch' });
        },
      },
      miracle: release({
        name: '거꾸로 된 기적',
        intent: 'heal',
        desc: '체력 40 회복, 해로운 효과 제거',
        run(c, e) {
          for (const id of ['weak', 'vuln', 'frail', 'bleed', 'poison', 'burn', 'mark', 'madden', 'corrode', 'doom']) c.clear(e, id);
          c.heal(e, 40);
          c.loseSanity(4, true);
        },
      }),
    },
    ai: (_c, e) => (e.mem.charge ? 'miracle' : cycle(e, ['nails', 'hymn', 'invert', 'nails', 'prepare'])),
    visual: { tint: 0x5a4a60, glow: 0xffe0f0, scale: 1.35, fx: ['float', 'flicker'] },
  },
]);
