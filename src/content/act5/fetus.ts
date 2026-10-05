import { ANOMALIES, reg } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import { cycle, last, opener } from '../../engine/ai';
import type { DmgType, EnemyUnit } from '../../engine/types';
import { countDef, mv, release } from '../moves';
import { setWeak } from '../act4/common';
import { vanish } from './dream';

/**
 * 5층 최종 수호자 — 별의 태아 (2026-10, 옛 '잠든 자'를 대체한 오리지널 보스).
 * 우주 한가운데 웅크린 태아. 1층부터 들리던 '아래의 목소리'는 그것이 꾸는 꿈의 잠꼬대였다.
 * 쓰러뜨릴 때마다 모습이 바뀐다 (e.form 1·2 = forms[0]·[1], 체력·버팀·약점·행동이 바뀐다).
 *  1. 별의 태아 (잠든 태아) — 꿈을 꾼다: 내 턴이 시작될 때마다 전장의 규칙(꿈)이 바뀐다.
 *     꿈은 anomaly로 구현했다 (c.s.anomaly를 바꾸면 전투 화면 위쪽 칩에 이름이 뜨고, 누르면 설명이 나온다).
 *     자장가가 '졸음'을 쌓는다 (3이 되면 다음 턴 행동력 -2, 적을 붕괴시키면 깨어난다). 혜성 탯줄이 별빛을 먹여 태아를 키운다.
 *  2. 깨어나는 알 — 아직 꿈을 꾼다. 별자리 껍질 3겹 (겹마다 받는 피해 -20%). 붕괴할 때마다 한 겹씩 깨지고,
 *     깨진 틈만큼 '새어 나오는 빛'의 빛줄기가 늘어난다 (깨야 때릴 수 있고, 깰수록 위험해진다).
 *  3. 태어난 것 — 꿈이 끝난다. '첫 울음' 카운트다운: 내 턴이 3번 끝나면 방어도 무시 피해 (혜성 탯줄마다 커진다).
 *     태어난 것을 붕괴시키면 울음이 멎는다. 혜성 탯줄은 휘감고 불태운다.
 * 약점은 단계마다 다르다: 화염·비전 → 타격·관통 → 참격·공허 (여섯 속성을 한 번씩).
 */

export const FETUS = 'star-fetus';
export const CORD = 'comet-cord';

/** 세 모습. 체력 합계 1080 (층 배율·조수 적용 전) */
export const FETUS_PHASES: { name: string; hp: number; poise: number; weak: DmgType[]; wake: string; sanity: number }[] = [
  { name: '별의 태아', hp: 340, poise: 15, weak: ['fire', 'arcane'], wake: '', sanity: 0 },
  { name: '깨어나는 알', hp: 300, poise: 10, weak: ['blunt', 'pierce'], wake: '꿈이 끊긴 자리에서 양막이 굳는다. 별자리가 새겨진 껍질이 태아를 감싼다', sanity: 8 },
  { name: '태어난 것', hp: 440, poise: 12, weak: ['slash', 'void'], wake: '껍질이 갈라진다. 그 틈에서 빛나는 공허가 태어난다', sanity: 14 },
];

/** 태아가 꾸는 꿈 (이 순서로 돈다) */
export const DREAMS = ['a5-dream-fall', 'a5-dream-radiant', 'a5-dream-backward', 'a5-dream-chase'];
export const isDream = (id: string | null | undefined): boolean => !!id && DREAMS.includes(id);

/** 졸음이 이만큼 쌓이면 잠든다 */
export const DROWSY_MAX = 3;
/** 잠들면 다음 턴 잃는 행동력 */
export const SLUMBER_AP = 2;
/** 별자리 껍질 겹 수 / 겹마다 피해 감소 */
export const SHELL_LAYERS = 3;
export const SHELL_CUT = 0.2;
/** 첫 울음: 내 턴이 이만큼 끝나면 터진다 */
export const CRY_TURNS = 3;
export const CRY_BASE = 34;
export const CRY_PER_CORD = 17;
export const CRY_SAN = 12;
/** 첫 울음을 다시 머금기까지 (턴) */
const CRY_GAP = 4;
/** 쫓기는 꿈: 남은 행동력 1당 정신력 */
const CHASE_SAN = 4;
/** 탯줄이 먹이는 별빛 */
const FEED_HEAL = 14;

const phaseOf = (e: EnemyUnit): number => e.mem.phase ?? 0;

function fetusOf(c: Combat): EnemyUnit | undefined {
  return c.alive.find((x) => x.def === FETUS);
}

/** 플레이어 상태를 직접 바꾼다 (사경 중 체력 0이어도 카운트가 멈추지 않게) */
function setPlayerSt(c: Combat, id: string, n: number) {
  const before = c.p.st[id] ?? 0;
  if (n > 0) c.p.st[id] = n;
  else delete c.p.st[id];
  if (n !== before) c.emit({ t: 'status', uid: 'p', id, n: n - before });
}

// ───────────── 꿈 (전장 규칙) ─────────────

function dreamName(id: string): string {
  return ANOMALIES.get(id)?.name ?? '꿈';
}

/** 꿈을 끝낸다 (태어나면) */
function endDream(c: Combat) {
  if (!isDream(c.s.anomaly)) return;
  c.s.anomaly = null;
  c.emit({ t: 'text', text: '꿈이 끝났다 — 우주가 눈을 뜨려 한다', tone: 'eldritch' });
}

/** 내 턴이 시작될 때 태아가 다음 꿈을 꾼다 */
function rotateDream(c: Combat) {
  if (!isDream(c.s.anomaly)) return;
  const f = fetusOf(c);
  if (!f || phaseOf(f) >= 2) return endDream(c);
  if (c.s.turn <= (f.mem.dreamTurn ?? 0)) return;
  f.mem.dreamTurn = c.s.turn;
  f.mem.dream = ((f.mem.dream ?? 0) + 1) % DREAMS.length;
  const id = DREAMS[f.mem.dream];
  c.s.anomaly = id;
  c.emit({ t: 'text', uid: f.uid, text: `꿈이 바뀐다 — 「${dreamName(id)}」`, tone: 'eldritch' });
}

reg.anomalies([
  {
    id: 'a5-dream-fall',
    name: '떨어지는 꿈',
    icon: 'gi:falling',
    desc: '태아의 꿈 — 끝없이 떨어진다. 모든 공격 피해 +30% (적도 나도). 내 턴이 시작될 때마다 꿈이 바뀐다',
    hooks: {
      onTurnStart: rotateDream,
      modDamageOut(_c, _s, d) {
        if (d.attack) d.mult *= 1.3;
      },
    },
  },
  {
    id: 'a5-dream-radiant',
    name: '빛나는 꿈',
    icon: 'gi:sun-radiations',
    desc: '태아의 꿈 — 모든 틈이 환히 보인다. 약점을 찌른 공격 피해 +50%. 내 턴이 시작될 때마다 꿈이 바뀐다',
    hooks: {
      onTurnStart: rotateDream,
      modDamageOut(c, _s, d) {
        if (d.attack && d.src === c.p && isEnemy(d.tgt) && d.type !== 'true' && d.tgt.weak.includes(d.type)) d.mult *= 1.5;
      },
    },
  },
  {
    id: 'a5-dream-backward',
    name: '거꾸로 흐르는 꿈',
    icon: 'gi:backward-time',
    desc: '태아의 꿈 — 모든 것이 거꾸로 흐른다. 당신의 회복이 피해로 바뀌고, 탯줄이 태아에게 먹이는 별빛도 상처가 된다. 내 턴이 시작될 때마다 꿈이 바뀐다',
    hooks: {
      onTurnStart: rotateDream,
      modHeal: (_c, _s, n) => -n,
    },
  },
  {
    id: 'a5-dream-chase',
    name: '쫓기는 꿈',
    icon: 'gi:run',
    desc: `태아의 꿈 — 무언가에 쫓긴다. 턴을 마칠 때 남은 행동력 1마다 정신력 -${CHASE_SAN}. 내 턴이 시작될 때마다 꿈이 바뀐다`,
    hooks: {
      onTurnStart: rotateDream,
      onTurnEnd(c) {
        if (c.s.ap <= 0) return;
        c.emit({ t: 'text', uid: 'p', text: '멈춰 선 발밑으로 무언가가 다가온다', tone: 'bad' });
        c.loseSanity(CHASE_SAN * c.s.ap);
      },
    },
  },
]);

// ───────────── 상태 ─────────────

/** 자장가: 졸음 +1, 다 차면 잠든다 */
function lull(c: Combat, e: EnemyUnit) {
  if (c.apply(c.p, 'a5-drowsy', 1, e) <= 0) return;
  if ((c.p.st['a5-drowsy'] ?? 0) < DROWSY_MAX) return;
  setPlayerSt(c, 'a5-drowsy', 0);
  c.apply(c.p, 'a5-slumber', 1, e);
  c.emit({ t: 'text', uid: 'p', text: '자장가에 잠겨 든다…', tone: 'bad' });
}

/** 첫 울음이 터진다 */
function firstCry(c: Combat) {
  const cords = countDef(c, CORD);
  const dmg = CRY_BASE + CRY_PER_CORD * cords;
  c.emit({ t: 'fx', name: 'transform' });
  c.emit({ t: 'text', uid: 'p', text: '첫 울음 — 우주가 찢어질 듯 울린다!', tone: 'eldritch' });
  c.damage({ src: null, tgt: c.p, base: dmg, type: 'true', ignoreBlock: true, tags: ['a5-cry'] });
  if (!c.over) c.loseSanity(CRY_SAN, true);
}

reg.statuses([
  {
    id: 'a5-drowsy',
    name: '졸음',
    icon: 'gi:night-sleep',
    kind: 'debuff',
    desc: `자장가가 쌓인다 ({n}/${DROWSY_MAX}). ${DROWSY_MAX}이 되면 잠에 빠져 다음 턴 행동력 -${SLUMBER_AP}. 적을 붕괴시키면 번쩍 깨어난다`,
    hooks: {
      onBreak(c, s) {
        if (s.unit !== c.p) return;
        setPlayerSt(c, 'a5-drowsy', 0);
        c.emit({ t: 'text', uid: 'p', text: '번쩍 깨어났다 — 졸음이 걷혔다', tone: 'good' });
      },
    },
  },
  {
    id: 'a5-slumber',
    name: '꿈결의 잠',
    icon: 'gi:sleepy',
    kind: 'debuff',
    desc: `자장가에 잠겼다 — 다음 턴 행동력 -${SLUMBER_AP}`,
    tickStart(c, u) {
      if (isEnemy(u)) return;
      c.s.ap = Math.max(0, c.s.ap - SLUMBER_AP);
      setPlayerSt(c, 'a5-slumber', 0);
      c.emit({ t: 'text', uid: 'p', text: `잠에서 덜 깼다 (행동력 -${SLUMBER_AP})`, tone: 'bad' });
    },
  },
  {
    id: 'a5-shell',
    name: '별자리 껍질',
    icon: 'gi:cosmic-egg',
    kind: 'buff',
    desc: '껍질 한 겹마다 받는 피해 -20% ({n}겹). 붕괴할 때마다 한 겹씩 깨지고, 깨진 틈만큼 새어 나오는 빛이 강해진다',
    hooks: {
      modDamageIn(_c, s, d) {
        if (d.tgt === s.unit && d.type !== 'true') d.mult *= Math.max(0.2, 1 - SHELL_CUT * s.n);
      },
      onDamageTaken(c, s, d) {
        const e = s.unit;
        if (!isEnemy(e) || e.dead || !d.broke || !((e.st['a5-shell'] ?? 0) > 0)) return;
        c.apply(e, 'a5-shell', -1);
        e.mem.cracks = (e.mem.cracks ?? 0) + 1;
        c.emit({ t: 'text', uid: e.uid, text: '별자리 하나가 깨졌다 — 틈으로 빛이 샌다', tone: 'eldritch' });
      },
    },
  },
  {
    id: 'a5-cry',
    name: '첫 울음',
    icon: 'gi:screaming',
    kind: 'debuff',
    desc: `내 턴이 {n}번 더 끝나면 태어난 것이 첫 울음을 터뜨린다 — ${CRY_BASE} + 혜성 탯줄마다 ${CRY_PER_CORD} 피해(방어도 무시), 정신력 -${CRY_SAN}. 태어난 것을 붕괴시키면 울음이 멎는다`,
    tickEnd(c, u, n) {
      if (isEnemy(u)) {
        delete u.st['a5-cry'];
        return;
      }
      if (n > 1) {
        setPlayerSt(c, 'a5-cry', n - 1);
        if (n - 1 === 1) c.emit({ t: 'text', uid: 'p', text: '울음이 목까지 차올랐다', tone: 'bad' });
        return;
      }
      setPlayerSt(c, 'a5-cry', 0);
      firstCry(c);
    },
    hooks: {
      onBreak(c, s, victim) {
        if (s.unit !== c.p || victim.def !== FETUS) return;
        setPlayerSt(c, 'a5-cry', 0);
        c.emit({ t: 'text', uid: victim.uid, text: '붕괴 — 울음이 목에 걸려 멎었다', tone: 'good' });
      },
    },
  },
]);

// ───────────── 특성 ─────────────

reg.traits([
  {
    id: 'a5-unborn',
    name: '태어나지 못한 것',
    desc: '쓰러뜨려도 두 번 더 일어난다 — 별의 태아 → 깨어나는 알 → 태어난 것. 그때마다 체력이 다시 차오르고 모습·약점·행동이 바뀌며, 혜성 탯줄이 새로 뻗는다',
    hooks: {
      onDeath(c, s) {
        const e = s.unit;
        if (!isEnemy(e)) return;
        const phase = phaseOf(e);
        if (phase >= FETUS_PHASES.length - 1) {
          // 끝내 태어나지 못했다: 탯줄이 힘을 잃고 흩어진다
          setPlayerSt(c, 'a5-cry', 0);
          for (const x of c.alive) if (x.def === CORD) vanish(c, x, '탯줄이 힘을 잃고 흩어졌다');
          return;
        }
        const next = phase + 1;
        const P = FETUS_PHASES[next];
        e.mem.phase = next;
        // 봇/연출용 표식 (첫 변신 / 두 번째 부활)
        if (next === 1) e.mem.transformed = 1;
        else e.mem.revived = 1;
        e.dead = false;
        e.form = next;
        e.name = P.name;
        e.maxHp = Math.max(1, Math.round((P.hp * (e.mem.hpMul ?? 100)) / 100));
        e.hp = e.maxHp;
        e.block = 0;
        e.broken = 0;
        e.maxPoise = P.poise;
        e.poise = P.poise;
        e.mem.grows = 0;
        delete e.mem.charge;
        setWeak(c, e, P.weak);
        c.emit({ t: 'spawn', uid: e.uid });
        c.emit({ t: 'fx', name: 'transform', tgt: e.uid });
        c.emit({ t: 'text', uid: e.uid, text: P.wake, tone: 'eldritch' });
        if (next === 1) {
          e.mem.cracks = 0;
          c.apply(e, 'a5-shell', SHELL_LAYERS, e);
        } else {
          if (e.st['a5-shell']) delete e.st['a5-shell'];
          endDream(c);
        }
        c.loseSanity(P.sanity, true);
        if (c.over) return;
        for (let i = 0; i < 2; i++) if (countDef(c, CORD) < 3) c.spawn(CORD, 0);
        c.planIntent(e);
      },
    },
  },
  {
    id: 'a5-dreaming',
    name: '꿈꾸는 태아',
    desc: '태어나기 전까지 꿈을 꾼다 — 내 턴이 시작될 때마다 꿈이 바뀌어 전장의 규칙이 달라진다 (떨어지는 꿈 → 빛나는 꿈 → 거꾸로 흐르는 꿈 → 쫓기는 꿈). 위쪽의 꿈 이름을 누르면 규칙이 보인다',
    hooks: {},
  },
]);

// ───────────── 행동 헬퍼 ─────────────

/** 탯줄을 뻗는다 (단계마다 한 번) */
function growCord(c: Combat, e: EnemyUnit) {
  e.mem.grows = (e.mem.grows ?? 0) + 1;
  c.spawn(CORD, 0);
}

/** 탯줄이 태아에게 별빛을 먹인다. 거꾸로 흐르는 꿈에서는 상처가 된다 */
function feed(c: Combat, cord: EnemyUnit) {
  const f = fetusOf(c);
  if (!f) return;
  if (c.s.anomaly === 'a5-dream-backward') {
    c.emit({ t: 'text', uid: f.uid, text: '별빛이 거꾸로 흐른다', tone: 'good' });
    c.loseHp(f, FEED_HEAL, 'inverted');
    return;
  }
  c.heal(f, FEED_HEAL);
  if (!f.dead) c.apply(f, 'str', 1, cord);
}

const cryDesc = `첫 울음 — 내 턴이 ${CRY_TURNS}번 끝나면 ${CRY_BASE} + 혜성 탯줄마다 ${CRY_PER_CORD} 피해(방어도 무시), 정신력 -${CRY_SAN}. 태어난 것을 붕괴시키면 멎는다`;

// ───────────── 최종 수호자: 별의 태아 + 혜성 탯줄 ─────────────

reg.enemies([
  {
    id: FETUS,
    name: FETUS_PHASES[0].name,
    icon: 'gi:fetus',
    act: 5,
    tier: 'boss',
    hp: [FETUS_PHASES[0].hp, FETUS_PHASES[0].hp],
    poise: FETUS_PHASES[0].poise,
    weak: [...FETUS_PHASES[0].weak],
    row: 0,
    dread: 14,
    eldritch: true,
    tags: ['fetus', 'star'],
    traits: ['a5-unborn', 'a5-dreaming'],
    desc: '우주 한가운데, 성운의 양막 속에 웅크린 거대한 태아. 우리 세계는 그것이 꾸는 꿈이고, 1층부터 당신을 부르던 아래의 목소리는 그 꿈의 잠꼬대였다.',
    moves: {
      // ── 1. 별의 태아 (잠든 태아) ──
      lullaby: mv.horror('자장가', 12, { then: lull, desc: `정신 피해, 졸음 +1 (${DROWSY_MAX}이 되면 잠에 빠진다)` }),
      kick: mv.attack('태동', 28, { melee: false }),
      pulse: mv.attack('양막의 파동', 8, { hits: 3, melee: false, type: 'arcane' }),
      curl: mv.charge('몸을 웅크린다', 54),
      unfurl: release(mv.attack('펼쳐지는 몸', 54, { melee: false, type: 'void' })),
      grow: mv.summon('탯줄을 뻗는다', growCord, '혜성 탯줄 하나를 새로 뻗는다'),
      // ── 2. 깨어나는 알 ──
      leak: {
        name: '새어 나오는 빛',
        intent: 'attack',
        dmg: 10,
        hits: (_c, e) => 1 + (e.mem.cracks ?? 0),
        melee: false,
        desc: '깨진 껍질 틈마다 빛줄기가 하나씩 늘어난다',
        run(c, e) {
          c.enemyAttack(e, { type: 'arcane' });
        },
      },
      tremor: mv.horror('알이 떤다', 16, { then: lull, desc: '정신 피해, 졸음 +1' }),
      harden: mv.block('껍질이 굳는다', 26, { desc: '방어도 26' }),
      throb: mv.charge('알이 맥동한다', 56),
      burst: release(mv.attack('별자리가 터진다', 56, { melee: false, type: 'arcane' })),
      // ── 3. 태어난 것 ──
      cry: {
        name: '첫 울음을 머금는다',
        intent: 'special',
        desc: cryDesc,
        run(c, e) {
          e.mem.cryAt = c.s.turn;
          if (c.apply(c.p, 'a5-cry', CRY_TURNS, e) > 0) c.emit({ t: 'text', uid: e.uid, text: `첫 울음이 차오른다 — ${CRY_TURNS}턴`, tone: 'eldritch' });
        },
      },
      lash: mv.attack('혜성 채찍', 10, { hits: 3, melee: false, type: 'slash' }),
      glare: mv.horror('빛나는 공허', 20, { then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '정신 피해, 약화 1' }),
      gather: mv.charge('탄생의 빛을 모은다', 66),
      birthlight: release(mv.attack('탄생의 빛', 66, { melee: false, type: 'fire' })),
    },
    onSpawn: (c, e) => {
      e.mem.hpMul = Math.round((e.maxHp / FETUS_PHASES[0].hp) * 100);
      c.spawn(CORD, 0);
      c.spawn(CORD, 0);
      // 첫 꿈 (다른 전장 규칙이 걸린 곳이면 꿈을 꾸지 않는다)
      if (!c.s.anomaly) {
        c.s.anomaly = DREAMS[0];
        e.mem.dream = 0;
        e.mem.dreamTurn = c.s.turn + 1;
        c.emit({ t: 'text', uid: e.uid, text: `태아가 꿈을 꾼다 — 「${dreamName(DREAMS[0])}」`, tone: 'eldritch' });
      }
    },
    ai: (c, e) => {
      const ph = phaseOf(e);
      const canGrow = countDef(c, CORD) === 0 && (e.mem.grows ?? 0) < 1 && last(e) !== 'grow';
      if (ph === 0) {
        if (e.mem.charge) return 'unfurl';
        const o = opener(c, e, ['lullaby']);
        if (o) return o;
        if (canGrow) return 'grow';
        return cycle(e, ['kick', 'pulse', 'lullaby', 'curl', 'kick', 'lullaby'], 'c1');
      }
      if (ph === 1) {
        if (e.mem.charge) return 'burst';
        if (canGrow) return 'grow';
        return cycle(e, ['leak', 'tremor', 'harden', 'throb', 'leak', 'harden'], 'c2');
      }
      if (e.mem.charge) return 'birthlight';
      if (!((c.p.st['a5-cry'] ?? 0) > 0) && c.s.turn - (e.mem.cryAt ?? -99) >= CRY_GAP) return 'cry';
      if (canGrow) return 'grow';
      return cycle(e, ['lash', 'glare', 'gather', 'lash', 'glare'], 'c3');
    },
    visual: { tint: 0x2a1a44, glow: 0xffa8e0, scale: 1.6, fx: ['float'] },
    forms: [
      { name: FETUS_PHASES[1].name, icon: 'gi:cosmic-egg', visual: { tint: 0x1e1a30, glow: 0xffe08a, scale: 1.65, fx: ['float', 'flicker'] } },
      { name: FETUS_PHASES[2].name, icon: 'gi:sun-radiations', visual: { tint: 0x06060c, glow: 0xfff6dc, scale: 1.8, fx: ['flicker'] } },
    ],
  },
  {
    id: CORD,
    name: '혜성 탯줄',
    icon: 'gi:evil-comet',
    act: 5,
    tier: 'minion',
    hp: [26, 30],
    poise: 0,
    weak: ['slash', 'fire', 'arcane'],
    row: 0,
    eldritch: true,
    tags: ['fetus', 'star'],
    desc: '태아에게서 뻗어 나온 탯줄. 혜성처럼 빛의 꼬리를 끌며 별빛을 빨아 태아에게 먹인다.',
    moves: {
      feed: {
        name: '별빛을 먹인다',
        intent: 'buff',
        desc: `태아의 체력 ${FEED_HEAL} 회복, 힘 +1 (거꾸로 흐르는 꿈에서는 회복 대신 피해)`,
        run: (c, e) => feed(c, e),
      },
      lash: mv.attack('휘감기', 10, { melee: false, then: (c, e) => void c.apply(c.p, 'weak', 1, e), desc: '약화 1' }),
      tail: mv.attack('혜성 꼬리', 6, { hits: 2, melee: false, type: 'fire', then: (c, e) => void c.apply(c.p, 'burn', 3, e), desc: '화상 3' }),
    },
    ai: (c, e) => {
      const f = fetusOf(c);
      if (f && phaseOf(f) < 2) return cycle(e, ['lash', 'feed']);
      return cycle(e, ['lash', 'tail'], 'c2');
    },
    visual: { tint: 0x2a2048, glow: 0xa8e8ff, scale: 0.75, fx: ['float'] },
  },
]);

/** 테스트용: 전투에서 지금 꾸고 있는 꿈 */
export function currentDream(c: Combat): string | null {
  return isDream(c.s.anomaly) ? c.s.anomaly : null;
}
