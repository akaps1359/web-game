import { reg } from '../../engine/registry';
import { isEnemy, unguarded } from '../../engine/combat';
import { cycle, hpPct, last, opener, pick } from '../../engine/ai';
import { DMG_TYPES, type EnemyUnit } from '../../engine/types';
import { countDef, mv, others, release } from '../moves';
import { cine, setUi } from '../lib';
import { canDoom, castDoom, dimLight, doomDesc, doomMove, flipRows, lockSkill, mostHurt, reviveAlly, setWeak } from './common';
import {
  DARK,
  DARK_MAX,
  DARK_REVEAL,
  DEFY_SAN,
  DEFY_STR,
  ECLIPSE_SAN,
  ECLIPSE_STR,
  ENTANGLE,
  FIRE_LIGHT,
  FLIP_BLOCK,
  FLIP_DMG,
  GATE_ORBS,
  HUNT_DMG,
  LIAR_REVEAL,
  QUAKE_FIRST,
  QUAKE_STEP,
  RIDE_HITS,
  ROOT_TURNS,
  STAR_DMG,
  STAR_MIN,
  STAR_PCT,
  STAR_TURNS,
  STARFALL,
  SWAP_CAP,
  SWAP_GAP,
  SWAP_MAX,
  SWAP_BREAK,
  UNISON_DMG,
  UNISON_SAN,
  COMMAND,
  GLYPH_COUNT,
  GLYPH_GAP,
  GLYPH_MAX,
  GLYPH_STAGGER,
  GLYPH_TURNS,
  JUDGMENT,
  addDark,
  armQuake,
  bodySwap,
  callStar,
  canInscribe,
  eclipse,
  entangle,
  flare,
  foldForward,
  huntHits,
  inscribe,
  issueCommand,
  judge,
  judgeCommand,
  once,
  overturn,
  recountUnison,
  rideWind,
  shakeReach,
  syncLampDark,
  unfold,
  unisonHits,
  withCine,
} from './patterns';

/** 문 너머의 존재를 이루는 구체들 */
export { GATE_ORBS };

const echoDmg = (e: EnemyUnit) => Math.max(8, Math.min(32, e.mem.echoSeen ?? 0));

/** 별의 자손 군주의 행동 순서 (흔들리는 대지에 밀려난 행동은 다음 차례로 미뤄진다) */
const LORD_CYCLE = ['sweep', 'transmit', 'starcall', 'sweep'];

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
    desc: '파라오의 심판은 풍뎅이 떼가 나눠 짊어진다. 풍뎅이를 모두 쓰러뜨리면 풀린다. 풍뎅이가 없으면 파라오가 짊어진다',
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
    desc: '지난 턴에 받은 가장 강한 일격을 기억했다가 「메아리」로 되돌려준다. 가면을 바꿔 쓰면 약점이 바뀐다. 가면 하나는 거짓말을 한다. 「천 개의 가면」을 쓰는 척하다가 덮칠 때가 있다 (통찰 3이면 보인다)',
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
    desc: '지난 몸을 기억한다. 「시간 되감기」로 두 차례 전의 체력으로 돌아간다',
    hooks: {
      onUnitTurnStart(c) {
        // 「정신 교환」으로 뒤섞였던 기억은 봉인이 풀리면 제자리를 찾는다
        setUi(c, 'ui:scramble', 0);
      },
      onUnitTurnEnd(_c, s) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        e.mem.h2 = e.mem.h1 ?? e.hp;
        e.mem.h1 = e.hp;
      },
      onDeath(c) {
        setUi(c, 'ui:scramble', 0);
      },
    },
  },
  {
    id: 'a4-bodythief',
    name: '몸 도둑',
    desc: `내 체력 비율이 방랑자보다 ${Math.round(SWAP_GAP * 100)}%p 이상 높으면 「몸 바꾸기」를 준비한다. 다음 차례에 체력 비율이 최대 ${Math.round(SWAP_CAP * 100)}%p만큼 서로 뒤바뀐다. 방어도로는 막을 수 없다. 준비하는 동안 붕괴시키거나 최대 체력의 ${Math.round(SWAP_BREAK * 100)}%만큼 피해(지속 피해 포함)를 주면 끊긴다. 전투마다 ${SWAP_MAX}번까지`,
    hooks: {
      onDamageTaken(c, s, d) {
        if (isEnemy(s.unit) && d.tgt === s.unit) shakeReach(c, s.unit, unguarded(d));
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
    id: 'a4-unison',
    name: '하나 되는 빛',
    desc: '「모든 것이 하나」의 빛은 문과 살아 있는 구체마다 한 줄기씩 모인다. 구체를 부수면 모이던 빛줄기가 바로 줄어든다',
    hooks: {
      onAnyDeath(c, _s, victim) {
        if (isEnemy(victim) && GATE_ORBS.includes(victim.def)) recountUnison(c);
      },
    },
  },
  {
    id: 'a4-folding',
    name: '접히는 차원',
    desc: '차원을 접어 힘을 모으는 동안 문이 전열로 끌려 나와 근접 공격이 닿는다. 접힌 차원이 펴지면 다시 뒤로 물러난다',
    hooks: {
      onUnitTurnEnd(c, s) {
        if (isEnemy(s.unit)) unfold(c, s.unit);
      },
      onDeath(c) {
        setUi(c, 'ui:tilt', 0);
      },
    },
  },
  {
    id: 'a4-unmasking',
    name: '황금 가면',
    desc: '체력이 절반 이하가 되면 가면이 벗겨진다. 약점과 행동이 바뀐다',
    hooks: {
      onDamageTaken(c, s) {
        const e = s.unit;
        if (!isEnemy(e) || e.mem.transformed || e.hp <= 0 || hpPct(e) > 0.5) return;
        e.mem.transformed = 1;
        e.form = 1;
        e.name = '얼굴 없는 파라오';
        setWeak(c, e, ['void', 'arcane']);
        c.emit({ t: 'fx', name: 'transform', tgt: e.uid });
        cine(c, 'shatter', { uid: e.uid });
        // 제4의 벽: 지금까지의 죽음을 세고 있었다
        cine(c, 'whisper', { uid: e.uid, text: '너는 {deaths}번 죽었다.\n이번이 몇 번째일지\n세어 볼까.' });
        c.emit({ t: 'text', uid: e.uid, text: '황금 가면이 떨어진다. 그 아래엔 아무것도 없다', tone: 'eldritch' });
        c.loseSanity(10, true);
        c.apply(e, 'str', 2, e);
        if (e.broken !== 2) c.planIntent(e);
      },
    },
  },
  {
    id: 'a4-liar',
    name: '거짓의 왕',
    desc: `가면을 쓴 동안 그가 베푸는 '자비'는 거짓 의도다. 실제로는 등을 찌른다 (통찰 ${LIAR_REVEAL}이면 진짜 의도가 보인다). 가면이 벗겨지면 「왕의 명령」으로 내 기술 하나를 지목한다. 그 턴에 그 기술을 쓰지 않으면 정신 피해 ${DEFY_SAN}, 공포 2, 파라오 힘 +${DEFY_STR}`,
    hooks: {
      onUnitTurnEnd(c, s) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        // 붕괴로 건너뛴 차례의 명령은 흩어진다 (따랐든 아니든 이번 차례로 끝)
        if ((c.p.st[COMMAND] ?? 0) > 0) c.clear(c.p, COMMAND);
        delete e.mem.obeyed;
      },
    },
  },
  {
    id: 'a4-hieroglyph',
    name: '심판의 상형문자',
    desc: `전투 셋째 턴부터 별의 심판이 걸려 있지 않으면 상형문자 ${GLYPH_COUNT}개를 새긴다. 속성은 지금 내가 낼 수 있는 것(무기 기본 공격과 장착한 공격 기술)에서만 고른다. 내 턴 ${GLYPH_TURNS}번 안에 그 속성으로 파라오를 차례대로 맞혀 모두 지우지 못하면 「${JUDGMENT}」: 사경 없이 즉사 (결계가 한 번 막는다). 틀린 속성으로 맞히면 아무 일도 없다. 파라오를 붕괴시키거나 기절시켜도 지워진다. 다 지우면 파라오가 비틀거린다 (버팀 -${GLYPH_STAGGER}). 심판이 끝나면 ${GLYPH_GAP}턴 뒤에야 다시 새긴다. 전투마다 ${GLYPH_MAX}번까지`,
    hooks: {},
  },
  {
    id: 'a4-overturn',
    name: '뒤집히는 대지',
    desc: `체력을 일정량 잃을 때마다(흔들리는 대지) 고통에 몸부림치며 다음 행동이 「대지를 뒤집는다」로 바뀐다. 덮치면서 모든 적의 열을 뒤바꾸고 방어도 ${FLIP_BLOCK}. 문턱은 최대 체력의 ${Math.round(QUAKE_FIRST * 100)}%에서 시작해 뒤집을 때마다 ${Math.round(QUAKE_STEP * 100)}%p씩 오른다. 내 턴에 무너뜨리면 하려던 행동은 다음 차례로 미뤄진다`,
    hooks: {},
  },
  {
    id: 'a4-lighteater',
    name: '빛을 먹는 별',
    desc: `「빛을 삼킨다」와 공허의 눈이 어둠을 쌓는다 (최대 ${DARK_MAX}). 어둠 2부터 적의 의도가 어둠에 묻힌다 (통찰 ${DARK_REVEAL}이면 보인다). ${DARK_MAX}이 되면 일식을 일으킨다. 어둠은 1씩 걷힌다: 검은 별을 화염이나 비전으로 공격할 때(내 턴마다 한 번), 공허의 눈을 쓰러뜨릴 때, 검은 별을 붕괴시킬 때`,
    hooks: {},
  },
  {
    id: 'a4-event-horizon',
    name: '사건의 지평선',
    desc: '검은 별의 차례가 시작되면 내 방어도가 절반이 된다',
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
    desc: `등불이 50 이상이면 주는 공격 피해 -25%. 화염 피해(화상 포함)를 받을 때마다 불꽃이 어둠을 밀어내 등불 +${FIRE_LIGHT}. 다른 공격에도 내 턴마다 한 번은 움찔해 등불 +${FIRE_LIGHT}`,
    hooks: {
      onCombatStart(c) {
        // 화면의 어둠이 지금 등불을 따라간다
        syncLampDark(c);
      },
      modDamageOut(c, s, d) {
        if (d.src === s.unit && d.attack && c.run.light >= 50) d.mult *= 0.75;
      },
      onDamageTaken(c, s, d) {
        if (!isEnemy(s.unit) || d.tgt !== s.unit || d.amount <= 0) return;
        if (d.type === 'fire' || d.tags.includes('burn')) {
          flare(c, s.unit);
          return;
        }
        // 화염이 없는 출신도 등불을 지킬 수 있게: 다른 공격은 내 턴마다 한 번
        if (d.src !== c.p || !d.attack || c.s.vars['a4-flare'] === c.s.turn) return;
        c.s.vars['a4-flare'] = c.s.turn;
        flare(c, s.unit);
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
      dream: mv.horror('꿈의 송신', 10, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '정신 피해, 공포 1' }),
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
      grab: mv.attack('휘감기', 9, { then: (c, e) => void c.apply(c.p, 'frail', 2, e), desc: '허약 2' }),
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
      scalpel: mv.attack('전기 메스', 9, { melee: false, type: 'arcane', then: (c, e) => void c.apply(c.p, 'vuln', 1, e), desc: '취약 1' }),
      extract: mv.horror('뇌 적출', 11, { then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '정신 피해, 약화 1' }),
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
        '쓰러진 동료 하나를 체력 40%로 꿰매어 되살린다 (봉합사마다 한 번)',
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
      acid: mv.attack('산성 체액', 6, { melee: false, type: 'void', then: (c, e) => void c.apply(c.p, 'vuln', 1, e), desc: '취약 1' }),
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
      flame: mv.attack('검은 불꽃', 7, { melee: false, type: 'fire', then: (c, e) => void c.apply(c.p, 'burn', 2, e), desc: '화상 2' }),
      unmask: mv.horror('얼굴을 보여준다', 13, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '정신 피해, 공포 1' }),
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
      glare: mv.horror('형언할 수 없는 빛', 11, { then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '정신 피해, 약화 1' }),
      taint: mv.debuff('색채 오염', (c, e) => void c.apply(c.p, 'corrode', 1, e), { desc: '부식 1 (받는 공격 피해 +1, 전투 내내)' }),
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
        desc: '내 방어도를 모두 흩어 버리고 공격한다',
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
        desc: '군주에게 녹아든다. 군주 체력 12 회복, 유충은 사라진다',
        run(c, e) {
          const lord = c.alive.find((x) => x.def === 'starspawn-lord');
          if (lord) c.heal(lord, 12);
          c.emit({ t: 'text', uid: e.uid, text: '군주의 몸속으로 녹아든다', tone: 'eldritch' });
          // c.kill은 플레이어가 처치한 것으로 쳐서 '적을 처치하면' 유물·경험치가 붙는다 — 설명대로 보상 없이 사라지게 한다
          e.dead = true;
          e.fled = true;
          e.block = 0;
          c.emit({ t: 'death', uid: e.uid });
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
        desc: '자란 새끼가 된다. 최대 체력 +14, 힘 +2',
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
    reachable: true,
    desc: '문 너머의 존재를 감싼 구체. 후열에 있어도 근접 공격이 닿는다.',
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
    reachable: true,
    desc: '문 너머의 존재를 감싼 구체. 후열에 있어도 근접 공격이 닿는다.',
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
    reachable: true,
    desc: '문 너머의 존재를 감싼 구체. 후열에 있어도 근접 공격이 닿는다.',
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
    reachable: true,
    desc: '검은 별에게 빛을 먹여 어둠을 쌓는 눈. 쓰러뜨리면 먹힌 빛이 돌아온다(어둠 -1). 후열에 있어도 근접 공격이 닿는다.',
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
        extra: ['debuff'],
        desc: '검은 별 체력 8 회복, 어둠 +1',
        run(c, e) {
          c.heal(c.alive.find((x) => x.def === 'black-star') ?? e, 8);
          addDark(c, e, 1);
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
        desc: '지난 턴에 받은 가장 강한 일격을 되돌려준다. 그 피해를 8~32 사이로 맞추고 이 층 적의 힘을 더한다',
        run(c, e) {
          c.enemyAttack(e, { type: DMG_TYPES[e.mem.echoPlanType ?? -1] ?? 'void' });
        },
      },
      masks: {
        name: '천 개의 가면',
        intent: 'buff',
        extra: ['block'],
        desc: '가면을 바꿔 쓴다. 약점이 바뀌고 방어도 14',
        run(c, e) {
          const pool = DMG_TYPES.filter((t) => !e.weak.includes(t));
          setWeak(c, e, c.rng.sample(pool, 2));
          e.form = ((e.form ?? 0) % 3) + 1;
          c.gainBlock(e, 14);
          c.emit({ t: 'text', uid: e.uid, text: '가면이 바뀌었다. 약점이 달라졌다', tone: 'eldritch' });
        },
      },
      whisper: mv.horror('혼돈의 속삭임', 13, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '정신 피해, 공포 1' }),
      // 거짓 의도: 「천 개의 가면」을 쓰는 척한다 (통찰 3이면 보인다)
      grin: {
        ...mv.attack('웃는 가면', 9, {
          hits: 2,
          melee: false,
          type: 'void',
          then: (c, e) => void c.apply(c.p, 'dread', 1, e),
          desc: '가면을 바꿔 쓰는 척하다가 웃으며 덮친다 (거짓 의도). 공포 1',
        }),
        disguise: { kind: 'buff', label: '천 개의 가면' },
      },
      rise: mv.charge('기어오는 혼돈', 44),
      crawl: release(withCine(mv.attack('천 개의 팔', 44, { melee: false, type: 'void', ultimate: true }), 'handprints', 8)),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'crawl';
      const o = opener(c, e, ['whisper']);
      if (o) return o;
      const m = cycle(e, ['echo', 'masks', 'grin', 'echo', 'rise', 'whisper']);
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
      vines: mv.attack('휘감는 덩굴', 7, { hits: 2, then: (c, e) => void c.apply(c.p, 'frail', 1, e), desc: '허약 1' }),
      // 땅에서 솟는 뿌리 — 다음 두 턴 행동력을 붙든다. 화염·참격 기술이 끊는다
      roots: mv.attack('얽히는 뿌리', 6, {
        melee: false,
        cine: 'ink',
        then: (c, e) => entangle(c, e),
        desc: `검은 뿌리가 솟아 발목을 휘감는다. ${ROOT_TURNS}턴 동안 내 턴이 시작될 때 행동력 -1. 화염이나 참격 기술을 쓰거나 어머니를 공격해 피해를 주면 끊어진다`,
      }),
      bleat: mv.horror('천 개의 울음', 12, { then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '정신 피해, 약화 1' }),
      rear: mv.charge('숲이 일어선다', 42),
      trample: release(mv.attack('검은 숲의 짓밟기', 42, { ultimate: true, cine: 'impact' })),
    },
    onSpawn: (c) => void c.spawn('goat-spawn', 0),
    ai: (c, e) => {
      if (e.mem.charge) return 'trample';
      const young = countDef(c, 'goat-spawn');
      const births = e.mem.births ?? 0;
      if (young === 0 && births < 5 && last(e) !== 'birth') return 'birth';
      return pick(c, e, {
        vines: 3,
        roots: (c.p.st[ENTANGLE] ?? 0) > 0 || e.hist.includes('roots') ? 0 : 2,
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
    traits: ['a4-judge', 'a4-chronicle', 'a4-bodythief'],
    moves: {
      sentence: doomMove('시간의 선고', 3, 34, 10),
      gun: mv.attack('번개 총', 7, { hits: 2, melee: false, type: 'arcane' }),
      swap: mv.horror('정신 교환', 11, {
        then: (c) => {
          // 기억을 빼앗긴 턴엔 기술의 이름과 설명이 뒤섞여 보인다 (방랑자의 다음 차례에 제자리를 찾는다)
          if (lockSkill(c, 2)) setUi(c, 'ui:scramble', 1);
        },
        desc: '기억을 훔쳐 간다. 무작위 스킬 하나가 다음 턴 동안 봉인된다',
      }),
      // 몸 바꾸기: 한 차례 예고(붕괴시키면 끊긴다) → 체력 비율이 서로 뒤바뀐다
      reach: {
        name: '몸 바꾸기 준비',
        intent: 'charge',
        charging: true,
        desc: `시간 너머에서 내 몸을 더듬는다. 다음 차례에 「몸 바꾸기」로 체력 비율이 최대 ${Math.round(SWAP_CAP * 100)}%p만큼 서로 뒤바뀐다. 방어도로는 막을 수 없다. 붕괴시키거나 최대 체력의 ${Math.round(SWAP_BREAK * 100)}%만큼 피해를 주면 끊긴다`,
        run(c, e) {
          e.mem.charge = 2;
          e.mem.reachHit = 0;
          e.mem.reaches = (e.mem.reaches ?? 0) + 1;
          c.emit({ t: 'text', uid: e.uid, text: '시간 너머에서 몸을 더듬어 온다…', tone: 'eldritch' });
        },
      },
      bodyswap: {
        name: '몸 바꾸기',
        intent: 'special',
        cine: 'timestop',
        desc: `내가 더 멀쩡하면 체력 비율이 서로 뒤바뀐다. 그 차이(최대 ${Math.round(SWAP_CAP * 100)}%p)만큼 나는 체력을 잃고 방랑자는 회복한다. 방어도로는 막을 수 없다`,
        run(c, e) {
          bodySwap(c, e);
        },
      },
      rewind: {
        name: '시간 되감기',
        intent: 'heal',
        cine: 'glitch',
        desc: '두 차례 전의 체력으로 되돌아간다 (최대 45 회복)',
        run(c, e) {
          const n = Math.min(45, (e.mem.h2 ?? e.hp) - e.hp);
          if (n > 0) c.heal(e, n);
          c.emit({ t: 'text', uid: e.uid, text: '상처가 일어나기 전으로 돌아간다', tone: 'eldritch' });
        },
      },
      rise: mv.charge('시간을 접는다', 42),
      collapse: release(mv.attack('시간 붕괴', 42, { melee: false, type: 'arcane', ultimate: true, cine: 'crack' })),
    },
    ai: (c, e) => {
      if (e.mem.charge === 2) return 'bodyswap';
      if (e.mem.charge) return 'collapse';
      const o = opener(c, e, ['gun']);
      if (o) return o;
      if (canDoom(c, e, 6)) return 'sentence';
      const gap = c.p.hp / Math.max(1, c.p.maxHp) - hpPct(e);
      if (gap >= SWAP_GAP && (e.mem.reaches ?? 0) < SWAP_MAX && !c.dying && !e.hist.includes('bodyswap') && last(e) !== 'reach') return 'reach';
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
    traits: ['a4-orbshield', 'a4-unison', 'a4-folding'],
    desc: '모든 시간과 공간이 맞닿는 문. 무지갯빛 구체들이 문을 감싸고 있다.',
    moves: {
      rays: mv.attack('구체의 빛', 6, { hits: 3, melee: false, type: 'arcane' }),
      // 문과 살아 있는 구체마다 한 줄기 — 구체가 부서지면 준비하던 의도가 바로 줄어든다 (a4-unison)
      oneness: {
        name: '모든 것이 하나',
        intent: 'horror',
        extra: ['attack'],
        sanity: UNISON_SAN,
        dmg: UNISON_DMG,
        hits: (c) => unisonHits(c),
        melee: false,
        cine: 'beam',
        desc: `구체들의 빛이 하나로 모인다. 문과 살아 있는 구체마다 한 줄기씩 비전 피해 ${UNISON_DMG}, 마지막에 정신 피해. 구체를 부수면 빛줄기가 바로 줄어든다`,
        run(c, e) {
          // 제4의 벽: 모든 시간이 하나인 문은 화면 너머의 지금도 안다
          if (once(c, 'a4-unison')) cine(c, 'whisper', { uid: e.uid, text: '모든 것이 하나다.\n{hour}의 너도,\n문 앞에 설 모든 너도.' });
          c.enemyAttack(e, { type: 'arcane' });
          if (!c.over && !e.dead) c.horror(e, UNISON_SAN);
        },
      },
      open: mv.summon(
        '문이 열린다',
        (c, e) => {
          e.mem.reforms = (e.mem.reforms ?? 0) + 1;
          for (const id of GATE_ORBS) if (!countDef(c, id)) c.spawn(id, 0);
          c.emit({ t: 'text', uid: e.uid, text: '부서진 구체들이 다시 맺힌다', tone: 'eldritch' });
          // 제4의 벽: 문 너머의 것들이 화면 안쪽에서 유리를 짚는다 (처음 한 번)
          if (once(c, 'a4-gate-open')) cine(c, 'handprints', { uid: e.uid, n: 6 });
        },
        '부서진 구체들을 다시 맺는다 (두 번까지)',
      ),
      rise: {
        ...mv.charge('차원이 접힌다', 42),
        cine: 'blackhole',
        desc: '차원을 접어 힘을 모은다. 다음 차례에 「차원 압착」. 그동안 문이 전열로 끌려 나와 근접 공격이 닿는다',
        run(c, e) {
          e.mem.charge = 1;
          c.emit({ t: 'text', uid: e.uid, text: '힘을 모은다…', tone: 'bad' });
          foldForward(c, e);
        },
      },
      crush: release(mv.attack('차원 압착', 42, { melee: false, type: 'void', ultimate: true, cine: 'shatter' })),
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
    traits: ['a4-scarab-curse', 'a4-unmasking', 'a4-liar', 'a4-hieroglyph'],
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
      swarm: {
        ...mv.summon(
          '풍뎅이 떼를 부른다',
          (c, e) => {
            e.mem.swarms = (e.mem.swarms ?? 0) + 1;
            c.spawn('pharaoh-scarab', 0);
            c.spawn('pharaoh-scarab', 0);
          },
          '검은 풍뎅이 떼 둘을 부른다',
        ),
        cine: 'swarm',
      },
      wind: mv.attack('사막의 열풍', 8, { hits: 2, melee: false, type: 'fire' }),
      kneel: mv.horror('무릎 꿇어라', 13, { then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '정신 피해, 약화 1' }),
      // 거짓 의도 (가면을 쓴 동안): 자비를 베푸는 척 등을 찌른다 — 통찰 LIAR_REVEAL이면 보인다
      mercy: {
        name: '배신의 칼날',
        intent: 'attack',
        dmg: 10,
        hits: 2,
        melee: false,
        cine: 'glitch',
        disguise: { kind: 'buff', label: '자비를 베푼다', reveal: LIAR_REVEAL },
        desc: '자비를 베푸는 척하다가 등을 찌른다 (거짓 의도)',
        run(c, e) {
          if (once(c, 'a4-lie')) cine(c, 'scrawl', { uid: e.uid, text: '믿었어?' });
          c.enemyAttack(e, { type: 'void' });
        },
      },
      rise: mv.charge('피라미드의 그림자', 44),
      pyramid: release(mv.attack('어둠의 피라미드', 44, { melee: false, type: 'void', ultimate: true, cine: 'impact' })),
      thousand: mv.attack('천 개의 형상', 5, { hits: 4, melee: false, type: 'void' }),
      // 가면이 벗겨진 뒤: 기술 하나를 지목하고, 그 턴에 쓰지 않으면 벌한다 (의도에 지목한 기술 이름이 보인다)
      command: {
        name: '왕의 명령',
        intent: 'special',
        extra: ['horror', 'buff'],
        desc: `내 기술 하나를 지목해 명령한다. 이번 턴에 그 기술을 쓰면 흡족해한다. 쓰지 않으면 정신 피해 ${DEFY_SAN}, 공포 2, 힘 +${DEFY_STR}`,
        run(c, e) {
          judgeCommand(c, e);
        },
      },
      // 즉사 퍼즐: 상형문자 셋(지금 당신이 낼 수 있는 속성)을 새기고, 두 턴 안에 차례대로 맞혀 지우지 못하면 신들의 심판
      inscribe: {
        name: '심판의 상형문자',
        intent: 'special',
        extra: ['death'],
        desc: `상형문자 ${GLYPH_COUNT}개를 새긴다. 속성은 지금 내가 낼 수 있는 것 중에서만 고른다. 내 턴 ${GLYPH_TURNS}번 안에 그 속성으로 파라오를 차례대로 맞혀 모두 지우지 못하면 「${JUDGMENT}」: 사경 없이 즉사`,
        run(c, e) {
          inscribe(c, e);
        },
      },
      judgment: {
        name: JUDGMENT,
        intent: 'death',
        desc: `상형문자를 기한 안에 모두 지우지 못하면 사경 없이 즉사 (결계가 한 번 막는다). 위 띠에 적힌 속성으로 파라오를 차례대로 맞혀 지우면 흩어진다. 파라오를 붕괴시키거나 기절시켜도 흩어진다. 기한이 남은 차례엔 모래시계만 흐른다`,
        run(c, e) {
          judge(c, e);
        },
      },
    },
    onSpawn: (c) => {
      c.spawn('pharaoh-scarab', 0);
      c.spawn('pharaoh-scarab', 0);
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'pyramid';
      // 상형문자가 새겨져 있는 동안은 심판만 바라본다
      if (e.mem.glyphs) return 'judgment';
      const o = opener(c, e, ['kneel']);
      if (o) return o;
      const scarabs = countDef(c, 'pharaoh-scarab');
      if (scarabs === 0 && (e.mem.swarms ?? 0) < 3 && last(e) !== 'swarm') return 'swarm';
      if (canInscribe(c, e)) return 'inscribe';
      if (canDoom(c, e, 7)) return 'curse';
      if (!e.form) return cycle(e, ['wind', 'mercy', 'rise', 'wind', 'kneel']);
      const m = cycle(e, ['thousand', 'command', 'thousand', 'rise'], 'c2');
      // 지목할 기술이 없거나 결계에 막히면 형상을 흩뿌린다
      return m === 'command' && !issueCommand(c, e) ? 'thousand' : m;
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
    traits: ['a4-aligned', 'a4-overturn'],
    desc: '별에서 내려온 자손들의 왕. 그 꿈은 궁정 아래, 우주 한가운데서 뒤척이는 무언가에 닿아 있다.',
    moves: {
      sweep: mv.attack('촉수 휩쓸기', 7, { hits: 3, melee: false }),
      // 흔들리는 대지가 무너졌을 때(반응), 또는 떨어지는 별을 피해 뒤로 숨을 때
      flip: {
        name: '대지를 뒤집는다',
        intent: 'special',
        extra: ['attack', 'block'],
        dmg: FLIP_DMG,
        melee: false,
        cine: 'flip',
        desc: `땅을 뒤집어 덮친다. 모든 적의 전열과 후열이 뒤바뀌고 방어도 ${FLIP_BLOCK}`,
        run(c, e) {
          overturn(c, e);
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
      transmit: mv.horror('꿈의 송신', 14, {
        then: (c, e) => {
          c.apply(c.p, 'dread', 2, e);
          // 꿈속의 거대한 눈이 화면을 덮고 당신의 손끝을 따라본다 (남발하지 않게 두 번까지)
          e.mem.dreams = (e.mem.dreams ?? 0) + 1;
          if (e.mem.dreams <= 2) cine(c, 'eye', { uid: e.uid });
        },
        desc: '정신 피해, 공포 2',
      }),
      // 별을 부른다: 내 턴이 두 번 끝나면 전열에 떨어진다 (군주는 뒤로 숨는다 — 전열을 비우면 끌려 나온다)
      starcall: {
        name: '별을 부른다',
        intent: 'special',
        ultimate: true,
        desc: `하늘의 별 하나를 끌어내린다. 내 턴이 ${STAR_TURNS}번 끝나면 별이 전열에 떨어진다. 전열의 적은 저마다 최대 체력의 ${Math.round(STAR_PCT * 100)}%(최소 ${STAR_MIN}) 피해. 나에게는 피해 ${STAR_DMG} (방어도가 먼저 막는다). 군주를 붕괴시키거나 쓰러뜨리면 별이 흩어진다`,
        run(c, e) {
          callStar(c, e);
        },
      },
      awaken: mv.buff(
        '별빛 각성',
        (c, e) => {
          e.mem.awoken = 1;
          c.apply(e, 'str', 3, e);
          c.emit({ t: 'text', uid: e.uid, text: '별빛이 눈을 뜬다', tone: 'eldritch' });
          // 제4의 벽: 꿈꾸는 것은 누구인가 (5층 별의 태아의 복선)
          cine(c, 'whisper', { uid: e.uid, text: '{time}.\n너는 아직 깨어 있다고\n믿는구나.' });
        },
        { desc: '힘 +3' },
      ),
    },
    onSpawn: (c, e) => {
      c.spawn('star-larva', 1);
      c.spawn('star-larva', 1);
      armQuake(c, e);
    },
    ai: (c, e) => {
      if (e.mem.overturn) {
        // 뒤집기에 밀려난 행동은 사라지지 않고 다음 차례로 미뤄진다
        if (e.mem.postpone && e.mem.cyc) e.mem.ci = ((e.mem.ci ?? 0) + LORD_CYCLE.length - 1) % LORD_CYCLE.length;
        delete e.mem.postpone;
        delete e.mem.cyc;
        return 'flip';
      }
      delete e.mem.cyc;
      if (hpPct(e) <= 0.5 && !e.mem.awoken) return 'awaken';
      // 떨어지는 별 아래에서 몸을 피한다 (뒤에 숨을 자리가 있을 때)
      const star = c.p.st[STARFALL] ?? 0;
      if (star > 0 && e.row === 0 && c.row(1).length > 0 && last(e) !== 'flip') return 'flip';
      const larvae = countDef(c, 'star-larva');
      if (larvae === 0 && (e.mem.broods ?? 0) < 3 && last(e) !== 'spawn') return 'spawn';
      const m = cycle(e, LORD_CYCLE);
      e.mem.cyc = 1;
      return m === 'starcall' && star > 0 ? 'sweep' : m;
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
    traits: ['a4-aligned', 'a4-event-horizon', 'a4-judge', 'a4-lighteater'],
    desc: '빛을 먹는 별. 별들이 제자리를 찾을 때 운석 구덩이 위로 내려앉는다.',
    moves: {
      beam: mv.attack('검은 광선', 6, { hits: 2, melee: false, type: 'void' }),
      devour: mv.horror('빛을 삼킨다', 15, {
        then: (c, e) => {
          c.apply(c.p, 'dread', 2, e);
          dimLight(c, 10);
          addDark(c, e, 1);
        },
        desc: '정신력 -15, 공포 2, 등불 -10, 어둠 +1',
      }),
      // 어둠이 가득 차면 (어둠 3): 화염·비전으로 어둠을 걷어 내면 흩어진다
      eclipse: {
        name: '일식',
        intent: 'horror',
        sanity: ECLIPSE_SAN,
        ultimate: true,
        cine: 'ink',
        desc: `빛이 모두 먹힌다. 정신 피해, 공포 2, 힘 +${ECLIPSE_STR}. 배를 채운 별은 어둠을 1까지 물린다. 그 전에 어둠을 걷어 내면 일식이 흩어진다`,
        run(c, e) {
          eclipse(c, e);
        },
      },
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
      collapse: release(mv.attack('중력 붕괴', 48, { melee: false, type: 'void', ultimate: true, cine: 'blackhole' })),
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
      if ((c.p.st[DARK] ?? 0) >= DARK_MAX) return 'eclipse';
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
      claw: mv.attack('얼어붙은 손톱', 12, { type: 'slash', then: (c, e) => void c.apply(c.p, 'frail', 1, e), desc: '허약 1' }),
      gale: mv.attack('별바람', 5, { hits: 3, melee: false, cine: 'beam' }),
      howl: mv.horror('바람의 울부짖음', 12, { then: (c, e) => void c.apply(c.p, 'dread', 1, e), desc: '정신 피해, 공포 1' }),
      // 바람 타기: 한 차례 동안 받는 피해 절반 — 여러 번 때려 떨어뜨리면 붕괴한다
      ride: {
        name: '바람을 탄다',
        intent: 'buff',
        extra: ['attack'],
        dmg: 5,
        hits: 2,
        melee: false,
        desc: `별바람을 타고 떠오르며 할퀸다. 바람 타기 ${RIDE_HITS}: 받는 공격 피해 -50%, 공격을 ${RIDE_HITS}번 맞으면 바람에서 떨어져 붕괴한다. 다음 차례가 오면 바람이 잦아든다`,
        run(c, e) {
          c.enemyAttack(e, { type: 'slash' });
          if (!c.over && !e.dead) rideWind(c, e);
        },
      },
      rise: mv.charge('하늘로 솟구친다', 44),
      pounce: release(mv.attack('하늘에서 덮친다', 44, { melee: false, type: 'slash', ultimate: true, cine: 'impact' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'pounce';
      return cycle(e, ['claw', 'howl', 'ride', 'gale', 'rise']);
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
      coil: mv.attack('휘감기', 10, { then: (c, e) => void c.apply(c.p, 'frail', 2, e), desc: '허약 2' }),
      swoop: mv.attack('급습', 6, { hits: 3, melee: false, type: 'slash' }),
      wings: {
        ...mv.debuff(
          '빛을 가리는 날개',
          (c, e) => {
            dimLight(c, 15);
            syncLampDark(c);
            c.apply(c.p, 'weak', 1, e);
            c.gainBlock(e, 10);
          },
          { desc: '등불 -15, 약화 1, 방어도 10', extra: ['block'] },
        ),
        cine: 'ink',
      },
      // 어둠이 짙을수록(등불이 낮을수록) 여러 번 문다 — 화염으로 등불을 밝히면 준비하던 횟수가 줄어든다
      hunt: mv.attack('어둠 속 사냥', HUNT_DMG, {
        hits: (c) => huntHits(c),
        melee: false,
        type: 'slash',
        desc: '어둠 속에서 여러 번 문다. 등불이 25 모자랄 때마다 한 번 더 문다 (등불 100이면 1번, 0이면 5번)',
      }),
      rise: mv.charge('아가리를 벌린다', 44),
      devour: release(mv.attack('포식', 44, { ultimate: true, cine: 'corners', then: (c, e) => void c.heal(e, 12), desc: '체력 12 회복' })),
    },
    ai: (c, e) => {
      if (e.mem.charge) return 'devour';
      return opener(c, e, ['wings']) ?? cycle(e, ['coil', 'swoop', 'rise', 'wings', 'hunt']);
    },
    visual: { tint: 0x1a1420, glow: 0xff4060, scale: 1.4, fx: ['float'] },
  },
]);
